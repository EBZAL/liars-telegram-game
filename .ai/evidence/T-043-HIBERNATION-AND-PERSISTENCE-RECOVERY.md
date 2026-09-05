# Task Evidence: T-043-HIBERNATION-AND-PERSISTENCE-RECOVERY

## Task Overview
- **Task ID**: `T-043-HIBERNATION-AND-PERSISTENCE-RECOVERY`
- **Component**: `packages/room-runtime`
- **Objective**: Verify Durable Object lifecycle simulation: SQLite serialization, eviction/restart, state reload, action deduplication survival, and 24h retention cleanup.

## Acceptance Criteria Verification

### AC-01: Seamless Rehydration from SQLite
- Verified: Simulated eviction of `RoomCoordinator` instance from memory and rehydration into a new instance from SQLite. All fields (`roomId`, `lifecycle`, `revision`, `currentTurnId`, `currentTurnDeadline`, `activeAlarm`, `hostPlayerId`, `members`, and `match` snapshot) are restored identically, and reconnected clients derive valid projections.
- Evidence: `packages/room-runtime/tests/hibernation-persistence-hardening.test.ts` ("AC-01: RoomCoordinator rehydrates seamlessly from SQLite after simulated DO hibernation").

### AC-02: Action Deduplication Record Persistence Across Restarts
- Verified: Actions executed and committed before hibernation persist in the `processed_actions` SQLite table. When a new coordinator boots from storage, replaying the identical action returns `DUPLICATE` without state mutation, and submitting a conflicting payload with the same ID is rejected with `ACTION_ID_CONFLICT`.
- Evidence: `packages/room-runtime/tests/hibernation-persistence-hardening.test.ts` ("AC-02: Action dedupe records survive coordinator restarts and prevent replay attacks").

### AC-03: Active Alarms Survive Hibernation
- Verified: Active `TURN_DEADLINE` alarm armed before hibernation survives in SQLite. When the runtime timer fires and instantiates a new coordinator, the alarm executes successfully, committing the timeout auto-play, advancing the turn, and arming the next deadline.
- Evidence: `packages/room-runtime/tests/hibernation-persistence-hardening.test.ts` ("AC-03: Active alarms survive hibernation and fire accurately in rehydrated coordinator").

### AC-04: Match Completion, 24h Retention, and Eviction Cleanup
- Verified: When a match completes, `ROOM_RETENTION` alarm is armed for 24 hours. A rehydrated coordinator woken early returns `NOT_EXPIRED` (room retained in SQLite); when woken after 24 hours have elapsed, it deletes the room from SQLite (`ROOM_DELETED`), and subsequent instantiations initialize a fresh room.
- Evidence: `packages/room-runtime/tests/hibernation-persistence-hardening.test.ts` ("AC-04: Match finish, 24h retention alarm survival, and database cleanup").

### AC-05: Zero Regressions Across Full Workspace
- Verified: Full regression test suite passes cleanly across all workspaces: 251 tests in `game-core`, 410 tests in `room-runtime`, and 36 tests in `client` (697 tests total across 45 test files). Typecheck passes cleanly without error.

## Automated Test & Typecheck Evidence

### Typecheck Output
```
> typecheck
> npm run typecheck --workspace=@liars-telegram-game/game-core && npm run typecheck --workspace=@liars-telegram-game/room-runtime && npm run typecheck --workspace=@liars-telegram-game/client

> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/game-core && tsc --noEmit

> @liars-telegram-game/game-core@0.1.0 build
> tsc

> @liars-telegram-game/client@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/room-runtime && tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 build
> npm run build --workspace=@liars-telegram-game/game-core && tsc

> @liars-telegram-game/game-core@0.1.0 build
> tsc
```

### Vitest Test Suite Output
```
 RUN  v1.6.1 D:/LiarsTelegram/packages/game-core
 Test Files  16 passed (16)
      Tests  251 passed (251)

 RUN  v1.6.1 D:/LiarsTelegram/packages/room-runtime
 Test Files  23 passed (23)
      Tests  410 passed (410)

 RUN  v1.6.1 D:/LiarsTelegram/packages/client
 Test Files  6 passed (6)
      Tests  36 passed (36)
```
Total: 697 passing tests across 45 test files.
