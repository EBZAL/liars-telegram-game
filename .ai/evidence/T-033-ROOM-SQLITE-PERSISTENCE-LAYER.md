# Evidence: T-033 SQLite Durable Object Persistence Layer

## Task Metadata
- **Task ID**: `T-033-ROOM-SQLITE-PERSISTENCE-LAYER`
- **Stage**: `STAGE-05` (Telegram Integration)
- **Workflow Profile**: `STANDARD`
- **Risk Level**: `MEDIUM`
- **Task Start Commit**: `6d63f83`
- **Implementation Commit**: `dbd9d44`
- **Authoritative Implementation Commit for Verification**: `dbd9d44`

---

## 1. Architectural Intent

This module establishes the SQLite schema, serialization, deserialization, and persistence layer for `RoomAuthorityState` and `ProcessedGameplayActionRegistry` in `packages/room-runtime` (`src/sqlite-persistence.ts`), targeting Cloudflare Durable Object embedded SQLite storage (`ctx.storage.sql`).

### Architectural Rules & Invariants
- **ADR-005: SQLite Durable Object Persistence / No D1 MVP**: Pure SQLite persistence within the Room DO boundary.
- **ADR-010: Single Active Room Alarm Model**: Durable alarms (`TURN_DEADLINE`, `HOST_GRACE`, `ROOM_RETENTION`) are fully persisted with kind, dueAt, and generation.
- **ADR-014: 24h Finished-or-Abandoned Room Retention**: 24-hour inactivity retention duration (`ROOM_RETENTION_DURATION_MS = 86_400_000`) and eligibility check `isRoomEligibleForRetentionDeletion`.
- **Dedupe Registry**: Full round-trip persistence of `ProcessedGameplayActionRegistry` for idempotency protection across Durable Object eviction/wake cycles.

---

## 2. Acceptance Criteria Mapping

| ID | Criterion | Evidence / Test | Status |
|---|---|---|---|
| AC-01 | `SqlStorage` and `SqlStorageCursor` interfaces exported from room-runtime | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-02 | Pure `initRoomSqliteSchema` exported from room-runtime | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-03 | `initRoomSqliteSchema` creates `room_state` and `processed_actions` tables | `sqlite-persistence.test.ts` ("initializes schema successfully") | PASS |
| AC-04 | Pure `saveRoomStateSqlite` exported from room-runtime | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-05 | `saveRoomStateSqlite` upserts room metadata, lifecycle, revision, members, host, match snapshot, turnId, deadline, and active alarm | `sqlite-persistence.test.ts` ("round-trips a LOBBY room", "round-trips a MATCH_ACTIVE room") | PASS |
| AC-06 | Pure `loadRoomStateSqlite` exported from room-runtime | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-07 | `loadRoomStateSqlite` faithfully reconstructs `RoomAuthorityState` or returns null if not found | `sqlite-persistence.test.ts` ("returns null when loading non-existent room", "round-trips a LOBBY room") | PASS |
| AC-08 | Complete round-trip preserves LOBBY, MATCH_ACTIVE, MATCH_PAUSED_NO_LIVING_CONNECTIONS, MATCH_FINISHED, and ABANDONED states | `sqlite-persistence.test.ts` ("round-trips a LOBBY room", "round-trips a MATCH_ACTIVE room", "round-trips MATCH_PAUSED_NO_LIVING_CONNECTIONS and ABANDONED rooms") | PASS |
| AC-09 | Pure `saveProcessedActionSqlite` exported from room-runtime | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-10 | Pure `loadProcessedActionsSqlite` exported from room-runtime | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-11 | Complete round-trip preserves `ProcessedGameplayActionRegistry` with actor, actionId, and resultingRevision | `sqlite-persistence.test.ts` ("saves and loads processed action records faithfully") | PASS |
| AC-12 | Pure `checkRoomRetentionExpiration` / `isRoomEligibleForRetentionDeletion` exported implementing 24h inactivity check per ADR-014 | `sqlite-persistence.test.ts` ("identifies room eligibility for deletion after 24 hours of inactivity") | PASS |
| AC-13 | In-memory `createInMemorySqlStorage` test utility exported for unit testing | `src/sqlite-persistence.ts`, `src/index.ts` | PASS |
| AC-14 | Full test suite passes across all workspaces with zero regressions | `npm test` (637 tests / 34 test files pass) | PASS |

---

## 3. Verification Output

### Typecheck
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
Status: PASS (Code 0)

### Automated Test Suite
```
RUN  v1.6.1 D:/LiarsTelegram/packages/game-core
Test Files  16 passed (16)
     Tests  251 passed (251)

RUN  v1.6.1 D:/LiarsTelegram/packages/room-runtime
 ✓ tests/room-state.test.ts  (7 tests)
 ✓ tests/gameplay-protocol.test.ts  (16 tests)
 ✓ tests/recipient-projection.test.ts  (30 tests)
 ✓ tests/telegram-auth.test.ts  (18 tests)
 ✓ tests/presence.test.ts  (20 tests)
 ✓ tests/telegram-routing.test.ts  (16 tests)
 ✓ tests/sqlite-persistence.test.ts  (11 tests)
 ✓ tests/presence-lifecycle.test.ts  (20 tests)
 ✓ tests/lobby-lifecycle.test.ts  (25 tests)
 ✓ tests/gameplay-authorization.test.ts  (20 tests)
 ✓ tests/system-timeout-presence-lifecycle.test.ts  (10 tests)
 ✓ tests/gameplay-admission.test.ts  (37 tests)
 ✓ tests/timed-gameplay-presence-lifecycle.test.ts  (15 tests)
 ✓ tests/turn-deadline.test.ts  (22 tests)
 ✓ tests/timed-gameplay-transaction.test.ts  (17 tests)
 ✓ tests/system-timeout-transaction.test.ts  (19 tests)
 ✓ tests/gameplay-transaction.test.ts  (16 tests)
 ✓ tests/provider-alarm-sync.test.ts  (67 tests)

Test Files  18 passed (18)
     Tests  386 passed (386)
```
Total: 34 test files, 637 tests passed, 0 failures (100% pass rate).
