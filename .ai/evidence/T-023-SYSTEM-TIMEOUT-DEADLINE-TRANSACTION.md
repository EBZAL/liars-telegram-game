# Evidence: T-023-SYSTEM-TIMEOUT-DEADLINE-TRANSACTION

## Task Identity & Git Commit Chain
- **Task ID**: `T-023-SYSTEM-TIMEOUT-DEADLINE-TRANSACTION`
- **Task-Start Commit**: `732e24d34fc5a5af265e046b929429493c18f27e`
- **Authoritative Implementation Commit**: `7666e3074e2bf2004753358e04fcaf1bee6cf7de`

---

## Executive Summary
Task `T-023-SYSTEM-TIMEOUT-DEADLINE-TRANSACTION` establishes the provider-independent authoritative Room transaction for executing system timeouts upon due `TURN_DEADLINE` triggers.

Key properties established:
1. **Server-Only Trigger Identity**: `ServerTurnDeadlineTrigger` encapsulates `kind: 'TURN_DEADLINE'`, `dueAt: number`, `generation: number`.
2. **Stale/Retry Protection**: Trigger identity (`kind`, `dueAt`, `generation`) is evaluated against `roomState.activeAlarm` prior to deadline due evaluation. Any mismatch returns `STALE_ALARM` without Core dispatch, Room revision increment, or RandomSource consumption. Replaying an old trigger against an advanced Room state (or even after a second deadline expires) is safely rejected as `STALE_ALARM`.
3. **Exact Deadline Due Boundary**: Evaluates timing via verified `evaluateTurnDeadlineDueState`. At `now < dueAt` returns `NOT_DUE`; at `now == dueAt` or `now > dueAt` is `DUE` and eligible for execution.
4. **Pure Core Timeout Delegation**: Invokes verified `applySystemTimeout(roomState.match, random)` directly. Room runtime performs zero manual card selection, zero claim derivation, and zero bias.
5. **One-Command / One-Revision Semantics**: Increments Room revision exactly once (`revision -> revision + 1`). No client actionId or processed client action records are created (system events are guarded by alarm generation/identity).
6. **Continuing vs Finished Match Lifecycle**:
   - Continuing Match (`IN_PROGRESS`): assigns `currentTurnId = preparedNextTurn.turnId`, arms next turn deadline at `authoritativeNowMs + 30000` with `activeAlarm.generation = resultingRevision` adding 0 extra revision.
   - Finished Match (`FINISHED`): lifecycle becomes `MATCH_FINISHED`, `currentTurnId = null`, `currentTurnDeadline = null`, `activeAlarm = null` (no re-arm).
7. **Mandatory CALL-Only Defensive Guard**: In mandatory CALL states, `applySystemTimeout` rejects before RNG consumption. T-023 propagates this failure, leaving input Room state unmutated with zero auto-CALL invented.
8. **Sequential Race Precedence**: A committed timeout advances Room revision, rendering subsequent late client commands rejected as `STALE_REVISION`.

---

## Architectural & Security Boundaries
- **STALE_ALARM != timeout executed**: Stale alarms represent discarded past scheduled events and perform no state mutation.
- **DEADLINE DUE + exact current trigger = eligible for SYSTEM_TIMEOUT execution**: Authoritative execution requires exact match on both current alarm identity and server timing.
- **SYSTEM_TIMEOUT != client GameplayActionEnvelope**: System timeouts are pure server events, completely separate from client envelope and admission registries.
- **Alarm trigger identity != Cloudflare provider implementation**: No `storage.setAlarm`, `getAlarm`, `deleteAlarm`, or Durable Object alarm handler APIs are used.
- **Pure Room transition != durable atomic persistence**: Transaction produces immutable in-memory state transition; durable atomic persistence remains deferred.

---

## Acceptance Criteria Mapping (AC-01 through AC-119)

| AC | Description | Status | Verification / Proof |
|---|---|---|---|
| AC-01 | Dedicated provider-independent system-timeout Room transaction exists | PASS | Implemented in `packages/room-runtime/src/system-timeout-transaction.ts` |
| AC-02 | API exported from room-runtime | PASS | Exported in `packages/room-runtime/src/index.ts` |
| AC-03 | ServerTurnDeadlineTrigger is server-only | PASS | Defined in `system-timeout-transaction.ts`, absent from client envelopes |
| AC-04 | Trigger kind must be TURN_DEADLINE | PASS | Validated in Step 1, tested in `API Exports & Trigger Validation` |
| AC-05 | Trigger dueAt safe integer validation | PASS | Validated in Step 1, tested in `API Exports & Trigger Validation` |
| AC-06 | Trigger generation safe integer validation | PASS | Validated in Step 1, tested in `API Exports & Trigger Validation` |
| AC-07 | No client protocol change | PASS | `packages/room-runtime/src/gameplay-protocol.ts` untouched |
| AC-08 | No SYSTEM_TIMEOUT client action added | PASS | Client action types remain `PLAY_CARDS \| CALL_LIAR` only |
| AC-09 | Exact trigger identity checked before timing evaluation | PASS | Step 2 checks `activeAlarm` identity prior to `evaluateTurnDeadlineDueState` |
| AC-10 | Null current alarm → STALE_ALARM | PASS | Verified in `returns STALE_ALARM when activeAlarm is null or wrong kind` |
| AC-11 | Wrong current alarm kind → STALE_ALARM | PASS | Verified in `returns STALE_ALARM when activeAlarm is null or wrong kind` |
| AC-12 | dueAt mismatch → STALE_ALARM | PASS | Verified in `MANDATORY TEST E` |
| AC-13 | generation mismatch → STALE_ALARM | PASS | Verified in `MANDATORY TEST D` |
| AC-14 | STALE_ALARM zero Core dispatch | PASS | Verified via `ThrowingRandomSource` in Tests D, E, F, G |
| AC-15 | STALE_ALARM zero RNG | PASS | Verified via `ThrowingRandomSource` in Tests D, E, F, G |
| AC-16 | STALE_ALARM zero revision mutation | PASS | Verified in Tests D, E, F, G |
| AC-17 | STALE_ALARM does not validate preparedNextTurn | PASS | Verified in `STALE_ALARM does not validate preparedNextTurn` |
| AC-18 | Exact current alarm delegates timing to T-021 evaluator | PASS | Uses `evaluateTurnDeadlineDueState(roomState, authoritativeNowMs)` |
| AC-19 | Exact trigger before due → NOT_DUE | PASS | Verified in `MANDATORY TEST A` |
| AC-20 | Exact trigger at due → executable DUE | PASS | Verified in `MANDATORY TEST B` |
| AC-21 | Exact trigger after due → executable DUE | PASS | Verified in `MANDATORY TEST C` |
| AC-22 | NOT_DUE zero Core dispatch | PASS | Verified via `ThrowingRandomSource` in `MANDATORY TEST A` |
| AC-23 | NOT_DUE zero RNG | PASS | Verified via `ThrowingRandomSource` in `MANDATORY TEST A` |
| AC-24 | NOT_DUE preserves current alarm/deadline | PASS | Verified in `MANDATORY TEST A` |
| AC-25 | NOT_APPLICABLE produces no Core transition | PASS | Step 4 maps `NOT_APPLICABLE` directly |
| AC-26 | INVALID_STATE produces no Core transition | PASS | Step 4 maps `INVALID_STATE` directly |
| AC-27 | DUE validates preparedNextTurn before Core | PASS | Step 5 validates `preparedNextTurn` before calling `applySystemTimeout` |
| AC-28 | Invalid prepared next turn consumes zero RNG | PASS | Verified via `ThrowingRandomSource` in `validates preparedNextTurn before Core dispatch` |
| AC-29 | nextRoomRevision validated before Core RNG | PASS | Step 6 calls `nextRoomRevision` before `applySystemTimeout` |
| AC-30 | Revision overflow consumes zero RNG | PASS | Verified via `ThrowingRandomSource` in `validates nextRoomRevision before Core RNG` |
| AC-31 | DUE dispatches exactly applySystemTimeout | PASS | Verified in `MANDATORY TEST B` and `H` |
| AC-32 | No direct applyPlayCardsCommand call | PASS | `applyPlayCardsCommand` is not imported in `system-timeout-transaction.ts` |
| AC-33 | No manual timeout card selection | PASS | Card selection is entirely inside Core `applySystemTimeout` |
| AC-34 | No manual claim construction | PASS | Claim construction is entirely inside Core |
| AC-35 | Core derives timedOutPlayerId | PASS | Verified in `MANDATORY TEST H` |
| AC-36 | Core derives autoPlayedCardId | PASS | Verified in `MANDATORY TEST H` |
| AC-37 | Core RandomSource forwarded unchanged | PASS | Passed directly to `applySystemTimeout` |
| AC-38 | Successful timeout increments Room revision exactly once | PASS | Verified in `MANDATORY TEST B, I, J` |
| AC-39 | No processed client action record created | PASS | `ProcessedGameplayActionRegistry` is not mutated or used for system timeout |
| AC-40 | No synthetic actionId created | PASS | Zero synthetic actionId created |
| AC-41 | No client envelope created | PASS | Zero client envelope created |
| AC-42 | Core IN_PROGRESS/winner consistency checked | PASS | Step 8 checks `status === 'IN_PROGRESS' && winnerId !== null` |
| AC-43 | Core FINISHED/winner consistency checked | PASS | Step 8 checks `status === 'FINISHED' && winnerId === null` |
| AC-44 | Continuing Match lifecycle MATCH_ACTIVE | PASS | Verified in `MANDATORY TEST B, I` |
| AC-45 | Continuing Match uses prepared next turnId | PASS | Verified in `MANDATORY TEST B, I` |
| AC-46 | Old consumed deadline cleared before re-arm | PASS | Intermediate room sets `currentTurnDeadline = null` |
| AC-47 | Old consumed alarm cleared before re-arm | PASS | Intermediate room sets `activeAlarm = null` |
| AC-48 | Continuing next deadline = authoritativeNowMs + 30000 | PASS | Verified in `MANDATORY TEST B, C, I` |
| AC-49 | New alarm kind TURN_DEADLINE | PASS | Verified in `MANDATORY TEST B, I` |
| AC-50 | New alarm dueAt equals new deadline | PASS | Verified in `MANDATORY TEST B, I` |
| AC-51 | New alarm generation equals resultingRevision | PASS | Verified in `MANDATORY TEST B, I` |
| AC-52 | Re-arm adds zero extra revision | PASS | Resulting revision remains `old revision + 1` |
| AC-53 | One SYSTEM_TIMEOUT = one Room revision | PASS | Verified in `MANDATORY TEST B, I` |
| AC-54 | Match FINISHED maps to MATCH_FINISHED | PASS | Verified in `MANDATORY TEST J` |
| AC-55 | Finished currentTurnId null | PASS | Verified in `MANDATORY TEST J` |
| AC-56 | Finished deadline null | PASS | Verified in `MANDATORY TEST J` |
| AC-57 | Finished activeAlarm null | PASS | Verified in `MANDATORY TEST J` |
| AC-58 | Finished state not re-armed | PASS | Verified in `MANDATORY TEST J` |
| AC-59 | ROOM_RETENTION not implemented | PASS | Verified; not imported or scheduled |
| AC-60 | Old trigger replay after continuing commit → STALE_ALARM | PASS | Verified in `MANDATORY TEST F` |
| AC-61 | Old trigger replay after new turn becomes due still → STALE_ALARM | PASS | Verified in `MANDATORY TEST G` |
| AC-62 | Old trigger replay cannot timeout second turn | PASS | Verified in `MANDATORY TEST G` |
| AC-63 | Old trigger after finished Match causes zero second Core transition | PASS | Verified in `MANDATORY TEST J` |
| AC-64 | Same-generation/wrong-dueAt stale proof | PASS | Verified in `MANDATORY TEST E` |
| AC-65 | Same-dueAt/wrong-generation stale proof | PASS | Verified in `MANDATORY TEST D` |
| AC-66 | Mandatory CALL-only Core guard not bypassed | PASS | Verified in `MANDATORY TEST K` |
| AC-67 | No automatic CALL invented | PASS | Verified in `MANDATORY TEST K` |
| AC-68 | Core mandatory-CALL rejection leaves Room input unchanged | PASS | Verified in `MANDATORY TEST K` |
| AC-69 | Local selection fields absent from API | PASS | Zero local selection parameters in API |
| AC-70 | Local highlights cannot bias timeout | PASS | Timeout uses only Core random index selection |
| AC-71 | No Date.now | PASS | `Date.now` is not used in room-runtime |
| AC-72 | No performance.now | PASS | `performance.now` is not used in room-runtime |
| AC-73 | No Math.random | PASS | `Math.random` is not used in room-runtime |
| AC-74 | No crypto entropy | PASS | `crypto` entropy is not used in room-runtime |
| AC-75 | Only injected authoritativeNowMs used for timing | PASS | Injected server time parameter used throughout |
| AC-76 | Input Room immutable | PASS | Verified in `Purity & Immutability Guarantees` |
| AC-77 | Input Match immutable | PASS | Verified in `Purity & Immutability Guarantees` |
| AC-78 | Input Hands immutable | PASS | Verified in `Purity & Immutability Guarantees` |
| AC-79 | Input trigger immutable | PASS | Verified in `Purity & Immutability Guarantees` |
| AC-80 | Input preparedNextTurn immutable | PASS | Verified in `Purity & Immutability Guarantees` |
| AC-81 | No provider alarm API | PASS | No Cloudflare alarm APIs called |
| AC-82 | No Durable Object | PASS | No Durable Object classes or methods created |
| AC-83 | No SQLite | PASS | No SQLite / database code created |
| AC-84 | No persistence | PASS | No persistence / reload code created |
| AC-85 | No WebSocket | PASS | No WebSocket code created |
| AC-86 | No actual concurrency implementation | PASS | Pure provider-independent synchronous transaction |
| AC-87 | T-022 sequential timeout-wins proof | PASS | Verified in `MANDATORY TEST L` |
| AC-88 | Old unseen client command cannot override committed timeout | PASS | Verified in `MANDATORY TEST L` (rejected with `STALE_REVISION`) |
| AC-89 | Internal timeout metadata not described as public projection | PASS | Documented as internal server state |
| AC-90 | No hidden info broadcast implementation | PASS | Deferred |
| AC-91 | T27 remains deferred | PASS | Mandatory Stage-04 security requirement deferred |
| AC-92 | No game-core source changes | PASS | `packages/game-core/src` untouched |
| AC-93 | No game-core test changes | PASS | `packages/game-core/tests` untouched |
| AC-94 | No package changes | PASS | `package.json` files untouched |
| AC-95 | No package-lock changes | PASS | `package-lock.json` untouched |
| AC-96 | No external dependencies | PASS | 0 new dependencies added |
| AC-97 | T-017 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-protocol.test.ts` PASS |
| AC-98 | T-018 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-admission.test.ts` PASS |
| AC-99 | T-020 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-transaction.test.ts` PASS |
| AC-100 | T-021 regression remains PASS | PASS | `packages/room-runtime/tests/turn-deadline.test.ts` PASS |
| AC-101 | T-022 regression remains PASS | PASS | `packages/room-runtime/tests/timed-gameplay-transaction.test.ts` PASS |
| AC-102 | T-011/T-015 timeout regression remains PASS | PASS | `packages/game-core/tests/system-timeout-transition.test.ts` & `timeout-selection-boundary.test.ts` PASS |
| AC-103 | npm ci passes | PASS | Verified clean install |
| AC-104 | npm run typecheck passes | PASS | Verified clean typecheck across all workspaces |
| AC-105 | npm test passes | PASS | 405 tests passing across 24 test files |
| AC-106 | room-runtime direct typecheck passes | PASS | Verified direct workspace typecheck |
| AC-107 | room-runtime direct tests pass | PASS | 154 tests passing across 8 test files |
| AC-108 | game-core direct typecheck/tests pass unchanged | PASS | 251 tests passing across 16 test files |
| AC-109 | Evidence maps AC-01 through AC-108 | PASS | Mapped in this table |
| AC-110 | Evidence records exact stale replay protection | PASS | Documented in Executive Summary and Test F & G descriptions |
| AC-111 | Evidence records exact ==deadline execution boundary | PASS | Documented in Test B description |
| AC-112 | Evidence records one timeout/one revision | PASS | Documented in Test B, I, J descriptions |
| AC-113 | Evidence records continuing re-arm +30000 | PASS | Documented in Test B, C, I descriptions |
| AC-114 | Evidence records Match-finish no-rearm | PASS | Documented in Test J description |
| AC-115 | Evidence records mandatory-CALL guard preservation | PASS | Documented in Test K description |
| AC-116 | Evidence explicitly distinguishes pure alarm identity from provider API | PASS | Documented in Architectural Boundaries |
| AC-117 | Evidence explicitly distinguishes system timeout event from client actionId registry | PASS | Documented in Architectural Boundaries |
| AC-118 | Evidence explicitly records provider/persistence/concurrency as deferred | PASS | Documented in Deferred Scope |
| AC-119 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Status set to IMPLEMENTED awaiting Architect verification |

---

## Direct Scenario Proof Summaries

### Scenario A — Exact Alarm Before Deadline (now = deadline - 1ms)
- `revision = 8`, `dueAt = 31000`, `generation = 8`, `now = 30999`
- Result: `{ decision: 'NOT_DUE' }`
- Room state, Match, activeAlarm, and RandomSource remain 100% untouched.

### Scenario B — Exact Alarm At Deadline (now == deadline)
- `revision = 8`, `dueAt = 31000`, `generation = 8`, `now = 31000`
- Result: `{ decision: 'COMMITTED', resultingRevision: 9, ... }`
- Core `applySystemTimeout` executed exactly once; Room revision increments 8 -> 9; next turn armed at `61000` with generation `9`.

### Scenario C — Exact Alarm After Deadline (now == deadline + 1ms)
- `revision = 8`, `dueAt = 31000`, `generation = 8`, `now = 31001`
- Result: `{ decision: 'COMMITTED', resultingRevision: 9, ... }`
- Core `applySystemTimeout` executed; next turn armed at `61001` with generation `9`.

### Scenario D — Stale Generation (trigger generation != activeAlarm.generation)
- `activeAlarm.generation = 8`, `trigger.generation = 7`
- Result: `{ decision: 'STALE_ALARM' }` with zero RNG, zero revision mutation.

### Scenario E — Stale DueAt (trigger dueAt != activeAlarm.dueAt)
- `activeAlarm.dueAt = 31000`, `trigger.dueAt = 30000`
- Result: `{ decision: 'STALE_ALARM' }` with zero RNG.

### Scenario F — Replay Old Trigger After Successful Timeout
- First timeout advances Room to revision 9, activeAlarm generation 9.
- Original generation-8 trigger replayed -> `{ decision: 'STALE_ALARM' }`.

### Scenario G — Replay Old Trigger After NEW Next-Turn Deadline Has Passed
- Turn 8 timeout advances to Turn 9, due at 61000ms.
- At `now = 65000ms`, old generation-8 trigger is replayed -> `{ decision: 'STALE_ALARM' }`.
- Old trigger NEVER triggers a timeout on the second turn.

### Scenario H — Core Metadata
- `timedOutPlayerId` matches pre-timeout `currentPlayerId`.
- `autoPlayedCardId` matches a card in player's pre-timeout hand.

### Scenario I — Forced CALL / Round Reset Revision Count
- Timeout playing final card flows through forced CALL -> Challenge -> Shot -> Next Round initialization.
- Room revision increments by exactly 1 (revision 8 -> 9).

### Scenario J — Match Finish
- Winning timeout transitions Match to `FINISHED`.
- Room lifecycle becomes `MATCH_FINISHED`, `currentTurnId = null`, `currentTurnDeadline = null`, `activeAlarm = null`.

### Scenario K — Mandatory CALL-Only Defensive Fixture
- Current player in mandatory CALL state: `applySystemTimeout` rejects before RNG consumption.
- Failure propagated; Room state untouched.

### Scenario L — Sequential Timeout-Wins Race
- After timeout commits at revision 9, an unseen client action for revision 8 / turn 8 is submitted.
- Client action rejected with `STALE_REVISION`. Timeout cannot be overridden.

---

## Regression Verification
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (405 tests across 24 test files)
  - `game-core`: 251 tests across 16 test files (all passing)
  - `room-runtime`: 154 tests across 8 test files (all passing)

---

## Deferred Scope
- Cloudflare Durable Object alarm APIs (`storage.setAlarm`, `storage.getAlarm`, `storage.deleteAlarm`, `alarm()`)
- Durable SQLite persistence and transaction reload
- Actual concurrency serialization
- Presence accounting & zero-Living Pause / Living-only Resume
- WebSocket & reconnect handling
- Telegram session & authentication
- Recipient-specific projections & T27 dead-spectator hidden-Hand protection
