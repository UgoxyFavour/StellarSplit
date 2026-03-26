# WebSocket Gateway Contract

This document defines the stable websocket contract for backend/frontend collaboration.

## Authentication

- Client connects with JWT token in one of:
  - `socket.handshake.auth.token`
  - `authorization` header
  - query param `token`
- The token is validated using `WsJwtAuthService`:
  - HS256
  - configured `JWT_SECRET`
  - expiration check
- On success, `client.data.user` is set to payload with `sub` as user ID.

## Rooms

- Room id format: `split:<splitId>`

## Client events

### `join_split`

- Payload: `{ splitId: string }`
- server checks `AuthorizationService.canAccessSplit(userSub, splitId)`
- Emits response: `{ event: "joined_split", data: { splitId, room } }`

### `leave_split`

- Payload: `{ splitId: string }`
- Removes client from room
- Response: `{ event: "left_split", data: { splitId, room } }`

### `split_presence`

- Payload: `{ splitId: string }`
- Response includes socket ids currently in room:
  `{ event: "split_presence", data: { splitId, participants: string[] } }`

### `split_activity`

- Payload: `{ splitId: string, activity: object }`
- Broadcasts to room event `split_activity` and returns a broadcast ack:
  `{ event: "split_activity_broadcast", data: { splitId, activity } }`

## Server events

- `payment_received` => emitted with object: payment data
- `split_updated` => emitted with split data
- `participant_joined` => emitted with participant data
- `split_activity` => emitted with activity details

### Notes

- Frontend uses this as canonical collaboration flow, with guard-protected endpoints and room-scoped operations.
