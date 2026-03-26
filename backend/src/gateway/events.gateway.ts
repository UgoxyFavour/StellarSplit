import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { createHmac, timingSafeEqual } from "crypto";
import { Server, Socket } from "socket.io";
import { AuthorizationService } from "../auth/services/authorization.service";

export interface WsJwtPayload {
  sub?: string;
  userId?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

@Injectable()
export class WsJwtAuthService {
  constructor(private readonly configService: ConfigService) {}

  authenticateClient(client: Socket): WsJwtPayload {
    const rawToken = this.extractToken(client);
    if (!rawToken) {
      throw new UnauthorizedException("Missing JWT token");
    }

    const token = rawToken.replace(/^Bearer\s+/i, "").trim();
    return this.verifyToken(token);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === "string" && authToken.length > 0) {
      return authToken;
    }

    const headerToken = client.handshake.headers.authorization;
    if (typeof headerToken === "string" && headerToken.length > 0) {
      return headerToken;
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === "string" && queryToken.length > 0) {
      return queryToken;
    }

    return undefined;
  }

  private verifyToken(token: string): WsJwtPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new UnauthorizedException("Invalid JWT format");
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const header = this.decodeJson(encodedHeader);
    const payload = this.decodeJson(encodedPayload) as WsJwtPayload;

    if (header.alg !== "HS256") {
      throw new UnauthorizedException("Unsupported JWT algorithm");
    }

    const secret = this.configService.get<string>("JWT_SECRET");
    if (!secret) {
      throw new UnauthorizedException("JWT secret not configured");
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    const validSignature = this.isEqualSignature(signature, expectedSignature);
    if (!validSignature) {
      throw new UnauthorizedException("Invalid JWT signature");
    }

    if (
      typeof payload.exp === "number" &&
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException("JWT token expired");
    }

    return payload;
  }

  private decodeJson(value: string): Record<string, unknown> {
    try {
      const parsed = Buffer.from(value, "base64url").toString("utf8");
      return JSON.parse(parsed) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException("Invalid JWT payload");
    }
  }

  private isEqualSignature(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(
    private readonly wsJwtAuthService: WsJwtAuthService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    const payload = this.wsJwtAuthService.authenticateClient(client);
    client.data.user = payload;
    return true;
  }
}

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly wsJwtAuthService: WsJwtAuthService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  afterInit(): void {
    this.logger.log("Events gateway initialized");
  }

  handleConnection(client: Socket): void {
    try {
      const payload = this.wsJwtAuthService.authenticateClient(client);
      client.data.user = payload;
      this.logger.log(`Client connected: ${client.id}`);
    } catch (error) {
      this.logger.warn(`Unauthorized socket connection rejected: ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage("join_split")
  async handleJoinSplit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { splitId: string },
  ): Promise<{ event: string; data: { splitId: string; room: string } }> {
    if (!payload?.splitId) {
      throw new BadRequestException("splitId is required");
    }

    const userId = (client.data.user as WsJwtPayload)?.sub;
    if (!userId) {
      throw new UnauthorizedException("Authenticated user required");
    }

    const canAccess = await this.authorizationService.canAccessSplit(
      userId,
      payload.splitId,
    );

    if (!canAccess) {
      throw new UnauthorizedException("Not allowed to join this split");
    }

    const room = this.getSplitRoom(payload.splitId);
    client.join(room);
    return {
      event: "joined_split",
      data: {
        splitId: payload.splitId,
        room,
      },
    };
  }

  emitPaymentReceived(splitId: string, data: Record<string, unknown>): void {
    this.server.to(this.getSplitRoom(splitId)).emit("payment_received", data);
  }

  emitSplitUpdated(splitId: string, data: Record<string, unknown>): void {
    this.server.to(this.getSplitRoom(splitId)).emit("split_updated", data);
  }

  emitParticipantJoined(splitId: string, data: Record<string, unknown>): void {
    this.server.to(this.getSplitRoom(splitId)).emit("participant_joined", data);
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage("leave_split")
  async handleLeaveSplit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { splitId: string },
  ): Promise<{ event: string; data: { splitId: string; room: string } }> {
    if (!payload?.splitId) {
      throw new BadRequestException("splitId is required");
    }

    const room = this.getSplitRoom(payload.splitId);
    client.leave(room);

    return {
      event: "left_split",
      data: {
        splitId: payload.splitId,
        room,
      },
    };
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage("split_presence")
  async handleSplitPresence(
    @MessageBody() payload: { splitId: string },
  ): Promise<{
    event: string;
    data: { splitId: string; participants: string[] };
  }> {
    if (!payload?.splitId) {
      throw new BadRequestException("splitId is required");
    }

    const room = this.getSplitRoom(payload.splitId);
    const roomData = this.server.sockets.adapter.rooms.get(room);
    const participants = roomData ? Array.from(roomData) : [];

    return {
      event: "split_presence",
      data: {
        splitId: payload.splitId,
        participants,
      },
    };
  }

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage("split_activity")
  async handleSplitActivity(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { splitId: string; activity: Record<string, unknown> },
  ): Promise<{
    event: string;
    data: { splitId: string; activity: Record<string, unknown> };
  }> {
    if (!payload?.splitId || !payload?.activity) {
      throw new BadRequestException("splitId and activity are required");
    }

    const room = this.getSplitRoom(payload.splitId);
    this.server.to(room).emit("split_activity", {
      splitId: payload.splitId,
      activity: payload.activity,
    });

    return {
      event: "split_activity_broadcast",
      data: {
        splitId: payload.splitId,
        activity: payload.activity,
      },
    };
  }

  private getSplitRoom(splitId: string): string {
    return `split:${splitId}`;
  }
}
