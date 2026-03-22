import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { DisputesModule } from "./disputes.module";
import {
  Dispute,
  DisputeStatus,
  DisputeType,
} from "../entities/dispute.entity";
import { DisputeEvidence } from "../entities/dispute-evidence.entity";
import { Split } from "../entities/split.entity";
import { Participant } from "@/entities/participant.entity";
import { Item } from "@/entities/item.entity";

/**
 * Integration tests for Dispute Resolution System
 * Tests full lifecycle including database, events, and API endpoints
 *
 * NOTE: These tests require a test database to be configured.
 * For CI/CD, use a separate test database or in-memory SQLite.
 */
describe("Dispute Resolution System - Integration Tests", () => {
  let app: INestApplication;
  let module: TestingModule;
  let sharedSplitId: string;
  let sharedDisputeId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        // Use test database configuration
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          entities: [Dispute, DisputeEvidence, Split, Item, Participant],
          synchronize: true,
          logging: false,
        }),
        EventEmitterModule.forRoot(),
        DisputesModule,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  describe("Dispute Lifecycle", () => {
    it("should create a split for testing", async () => {
      // This would normally be done through a splits endpoint
      // For this test, we assume a split exists
      sharedSplitId = "test-split-" + Date.now();
    });

    it("POST /disputes - should file a dispute and freeze split", async () => {
      const response = await request(app.getHttpServer())
        .post("/disputes")
        .send({
          splitId: sharedSplitId,
          disputeType: DisputeType.INCORRECT_AMOUNT,
          description: "The amount charged does not match the itemized list",
        })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body.status).toBe(DisputeStatus.OPEN);
      expect(response.body.splitFrozen).toBe(true);

      sharedDisputeId = response.body.id;
    });

    it("GET /disputes/:disputeId - should retrieve dispute", async () => {
      const response = await request(app.getHttpServer())
        .get(`/disputes/${sharedDisputeId}`)
        .expect(200);

      expect(response.body.id).toBe(sharedDisputeId);
      expect(response.body.status).toBe(DisputeStatus.OPEN);
      expect(response.body.auditTrail).toHaveLength(1);
      expect(response.body.auditTrail[0].action).toBe("dispute_created");
    });

    it("POST /disputes/:disputeId/evidence - should add evidence", async () => {
      const response = await request(app.getHttpServer())
        .post(`/disputes/${sharedDisputeId}/evidence`)
        .send({
          fileKey: "s3://bucket/receipt-1.jpg",
          fileName: "receipt.jpg",
          mimeType: "image/jpeg",
          size: 2048,
          description: "Original receipt from payment",
        })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body.fileName).toBe("receipt.jpg");
    });

    it("GET /disputes/:disputeId/evidence - should list evidence", async () => {
      const response = await request(app.getHttpServer())
        .get(`/disputes/${sharedDisputeId}/evidence`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty("fileKey");
    });

    it("POST /disputes/:disputeId/submit-review - should submit for review", async () => {
      const response = await request(app.getHttpServer())
        .post(`/disputes/${sharedDisputeId}/submit-review`)
        .send({})
        .expect(200);

      expect(response.body.status).toBe(DisputeStatus.UNDER_REVIEW);
    });

    it("POST /disputes/:disputeId/resolve - should resolve dispute", async () => {
      const response = await request(app.getHttpServer())
        .post(`/disputes/${sharedDisputeId}/resolve`)
        .send({
          outcome: "adjust_balances",
          resolution:
            "Dispute verified. Participant will receive credit of $25.",
          details: { adjustment: 25, currency: "USD" },
        })
        .expect(200);

      expect(response.body.status).toBe(DisputeStatus.RESOLVED);
      expect(response.body.splitFrozen).toBe(false);
      expect(response.body.resolutionOutcome.outcome).toBe("adjust_balances");
    });

    it("GET /disputes/:disputeId/audit-trail - should show full audit trail", async () => {
      const response = await request(app.getHttpServer())
        .get(`/disputes/${sharedDisputeId}/audit-trail`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(3); // created, evidence_added, submitted, resolved
      expect(response.body[0].action).toBe("dispute_created");
    });
  });

  describe("Appeal Mechanism", () => {
    it("POST /disputes/:disputeId/appeal - should appeal resolved dispute", async () => {
      if (!sharedDisputeId) {
        // Skip if dispute not created
        return;
      }
      // Use sharedDisputeId from previous test lifecycle
      const response = await request(app.getHttpServer())
        .post(`/disputes/${sharedDisputeId}/appeal`)
        .send({
          appealReason:
            "The resolution was biased and did not consider all evidence",
        })
        .expect(200);

      expect(response.body.status).toBe(DisputeStatus.APPEALED);
      expect(response.body.splitFrozen).toBe(true); // Re-frozen for new review
    });
  });

  describe("State Machine Validation", () => {
    let testDisputeId: string;

    it("should reject invalid state transitions", async () => {
      // Create a dispute
      const response = await request(app.getHttpServer())
        .post("/disputes")
        .send({
          splitId: "test-split-" + Date.now(),
          disputeType: DisputeType.MISSING_PAYMENT,
          description: "Payment not received",
        })
        .expect(201);

      testDisputeId = response.body.id;

      // Try to resolve directly (should fail - OPEN -> RESOLVED is invalid)
      const resolveResponse = await request(app.getHttpServer())
        .post(`/disputes/${testDisputeId}/resolve`)
        .send({
          outcome: "no_change",
          resolution: "No action needed",
        })
        .expect(400); // Bad Request

      expect(resolveResponse.body.message).toContain(
        "Invalid dispute status transition",
      );
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for non-existent dispute", async () => {
      await request(app.getHttpServer())
        .get("/disputes/non-existent-id")
        .expect(404);
    });

    it("should return 400 for invalid dispute type", async () => {
      const response = await request(app.getHttpServer())
        .post("/disputes")
        .send({
          splitId: "test-split",
          disputeType: "invalid_type",
          description: "Test",
        })
        .expect(400);

      expect(response.body.message).toContain("validation");
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app.getHttpServer())
        .post("/disputes")
        .send({
          splitId: "test-split",
          // Missing disputeType and description
        })
        .expect(400);

      expect(response.body.message).toContain("validation");
    });
  });

  describe("Admin Operations", () => {
    let adminTestDisputeId: string;

    it("should request more evidence", async () => {
      // First create and submit a dispute
      const createResponse = await request(app.getHttpServer())
        .post("/disputes")
        .send({
          splitId: "test-split-" + Date.now(),
          disputeType: DisputeType.WRONG_ITEMS,
          description: "Wrong items received",
        })
        .expect(201);

      adminTestDisputeId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/disputes/${adminTestDisputeId}/request-evidence`)
        .send({
          evidenceRequest:
            "Please provide photos of the items received and the packing slip",
        })
        .expect(200);

      expect(response.body.id).toBe(adminTestDisputeId);
    });

    it("should reject dispute", async () => {
      // Get a dispute in UNDER_REVIEW status
      // For this test, assume we have one or create the workflow

      // Submit to review first
      const submitResponse = await request(app.getHttpServer())
        .post(`/disputes/${adminTestDisputeId}/submit-review`)
        .send({})
        .expect(200);

      // Now reject it
      const rejectResponse = await request(app.getHttpServer())
        .post(`/disputes/${adminTestDisputeId}/reject`)
        .send({
          reason: "Insufficient evidence provided. Claim dismissed.",
        })
        .expect(200);

      expect(rejectResponse.body.status).toBe(DisputeStatus.REJECTED);
      expect(rejectResponse.body.splitFrozen).toBe(false);
    });
  });

  describe("Query and Filtering", () => {
    it("GET /disputes - should list disputes for admin", async () => {
      const response = await request(app.getHttpServer())
        .get("/disputes?page=1&limit=10")
        .expect(200);

      expect(response.body).toHaveProperty("disputes");
      expect(response.body).toHaveProperty("total");
      expect(Array.isArray(response.body.disputes)).toBe(true);
    });

    it("GET /disputes?status=resolved - should filter by status", async () => {
      const response = await request(app.getHttpServer())
        .get(`/disputes?status=${DisputeStatus.RESOLVED}`)
        .expect(200);

      expect(
        response.body.disputes.every(
          (d: any) => d.status === DisputeStatus.RESOLVED,
        ),
      ).toBe(true);
    });

    it("GET /disputes/split/:splitId - should get disputes for specific split", async () => {
      const splitId = "test-split-123";
      const response = await request(app.getHttpServer())
        .get(`/disputes/split/${splitId}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("Notification Events", () => {
    it("should emit events when dispute is created", async () => {
      const eventSpy = jest.spyOn(app.get("EventEmitter2"), "emit");

      await request(app.getHttpServer())
        .post("/disputes")
        .send({
          splitId: "test-split-" + Date.now(),
          disputeType: DisputeType.INCORRECT_AMOUNT,
          description: "Amount mismatch",
        })
        .expect(201);

      // Verify events were emitted
      expect(eventSpy).toHaveBeenCalledWith(
        "dispute.created",
        expect.any(Object),
      );
      expect(eventSpy).toHaveBeenCalledWith("split.frozen", expect.any(Object));
    });
  });
});
