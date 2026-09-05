# Task Evidence: T-034-ROOM-COORDINATOR-INTEGRATION

## Task Overview
- **Task ID**: `T-034-ROOM-COORDINATOR-INTEGRATION`
- **Component**: `packages/room-runtime`
- **Objective**: Implement `RoomCoordinator`, integrating pure deterministic state, presence registry, SQLite storage persistence, WebSocket lifecycle/projection fanout, timed client actions, and provider alarms into an authoritative room engine.

## Acceptance Criteria Verification

### AC-01: SQLite Storage Schema Initialization
- Verified: `RoomCoordinator` initializes SQLite tables `room_state` and `processed_actions` via `initRoomSqliteSchema` on construction.
- Evidence: `tests/room-coordinator.test.ts` ("initializes room in LOBBY and persists to SQLite").

### AC-02: Initial Room State & Idempotent Hydration
- Verified: Instantiating `RoomCoordinator` loads existing room state from SQLite if available; otherwise initializes a canonical `LOBBY` state and saves it.
- Evidence: `tests/room-coordinator.test.ts` ("initializes room in LOBBY and persists to SQLite").

### AC-03: Presence Lifecycle Integration (Connect & Disconnect)
- Verified: `onPlayerConnect` and `onPlayerDisconnect` register/unregister connections in `RoomPresenceRegistry`.
- Evidence: Connects in lobby trigger host presence handling; full living disconnect in `MATCH_ACTIVE` transitions to `MATCH_PAUSED_NO_LIVING_CONNECTIONS` with disarmed turn deadline; reconnection resumes to `MATCH_ACTIVE` with fresh 30s deadline.
- Evidence: `tests/room-coordinator.test.ts` ("handles full Living disconnect -> PAUSED and reconnect -> RESUMED").

### AC-04: Dynamic Hidden Information Projection Fanout
- Verified: `getConnectedMemberProjections()` derives whitelist projection DTOs for every connected member via `deriveRecipientRoomProjection`.
- Evidence: Each player's private hand is isolated; other players only see `handCount`. Alice cannot see Bob's cards.
- Evidence: `tests/room-coordinator.test.ts` ("rejects START_MATCH by non-host and starts match when host calls it").

### AC-05: Lobby Lifecycle (Join, Leave, Host Assignment, Match Start)
- Verified: Host assignment on first join, host migration on leave, host-only permission for `START_MATCH` with 2–4 players.
- Evidence: `tests/room-coordinator.test.ts` ("manages Lobby join, leave, and host assignment" and "rejects START_MATCH by non-host and starts match when host calls it").

### AC-06: Authoritative Gameplay Action Execution
- Verified: `handleClientCommand` with `GAMEPLAY_ACTION` validates actor, turnId, expectedRevision, executes timed transaction via `executeTimedClientGameplayWithPresenceLifecycle`, saves processed action to SQLite, updates revision, and outputs updated projections.
- Evidence: `tests/room-coordinator.test.ts` ("executes gameplay actions and updates projections").

### AC-07: Provider Alarm Handling (HOST_GRACE, TURN_DEADLINE, ROOM_RETENTION)
- Verified: `onAlarm` triggers `applyHostGraceTimeout` for `HOST_GRACE`, `executeSystemTimeoutWithPresenceLifecycle` for `TURN_DEADLINE` (auto-playing deterministic fallback card), and evaluates 24h retention expiration for `ROOM_RETENTION`, deleting room storage upon expiration.
- Evidence: `tests/room-coordinator.test.ts` ("executes TURN_DEADLINE alarm and auto-plays fallback card" and "handles 24-hour room retention expiration and deletion").

## Automated Test & Typecheck Evidence

### Typecheck Output
```
> typecheck
> npm run typecheck --workspace=@liars-telegram-game/game-core && npm run typecheck --workspace=@liars-telegram-game/room-runtime

> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/game-core && tsc --noEmit

> @liars-telegram-game/game-core@0.1.0 build
> tsc
```

### Vitest Test Suite Output
```
 RUN  v1.6.1 D:/LiarsTelegram/packages/game-core
 Test Files  16 passed (16)
      Tests  251 passed (251)

 RUN  v1.6.1 D:/LiarsTelegram/packages/room-runtime
 ✓ tests/gameplay-protocol.test.ts  (16 tests)
 ✓ tests/room-state.test.ts  (7 tests)
 ✓ tests/recipient-projection.test.ts  (30 tests)
 ✓ tests/telegram-auth.test.ts  (18 tests)
 ✓ tests/presence.test.ts  (20 tests)
 ✓ tests/gameplay-authorization.test.ts  (20 tests)
 ✓ tests/telegram-routing.test.ts  (16 tests)
 ✓ tests/room-coordinator.test.ts  (7 tests)
 ✓ tests/turn-deadline.test.ts  (22 tests)
 ✓ tests/presence-lifecycle.test.ts  (20 tests)
 ✓ tests/sqlite-persistence.test.ts  (11 tests)
 ✓ tests/gameplay-transaction.test.ts  (16 tests)
 ✓ tests/system-timeout-presence-lifecycle.test.ts  (10 tests)
 ✓ tests/timed-gameplay-transaction.test.ts  (17 tests)
 ✓ tests/gameplay-admission.test.ts  (37 tests)
 ✓ tests/system-timeout-transaction.test.ts  (19 tests)
 ✓ tests/lobby-lifecycle.test.ts  (25 tests)
 ✓ tests/timed-gameplay-presence-lifecycle.test.ts  (15 tests)
 ✓ tests/provider-alarm-sync.test.ts  (67 tests)

 Test Files  19 passed (19)
      Tests  393 passed (393)
```
Total: 644 passing tests across 35 test files.
