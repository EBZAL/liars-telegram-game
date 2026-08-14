# Evidence: T-021-TURN-DEADLINE-AUTHORITY-FOUNDATION

## Task Identity & Git Commit Chain
- **Task ID**: `T-021-TURN-DEADLINE-AUTHORITY-FOUNDATION`
- **Task-Start Commit**: `7fda6a75afcff7df21469e3d93708e1762c2f602`
- **Implementation Commit**: `f1bb532fea5283687c2472d837921484f3683a52`

---

## Technical Summary & Architecture

### 1. Provider-Independent Turn Deadline Module
`packages/room-runtime/src/turn-deadline.ts` establishes the authoritative turn-deadline timing foundation for `@liars-telegram-game/room-runtime`. It exports:
- `TURN_DURATION_MS = 30_000` (exact 30-second duration constant)
- `armActiveTurnDeadline(roomState, authoritativeNowMs)` (pure arming function)
- `evaluateTurnDeadlineDueState(roomState, authoritativeNowMs)` (pure due-state evaluation function)

### 2. Server Time Boundary & Determinism
- `authoritativeNowMs` is supplied as a server-only input.
- `Date.now()`, `Math.random()`, `crypto`, `performance.now()`, and `RandomSource` are strictly forbidden and not used.
- Validates `authoritativeNowMs` for safe non-negative integer values (`Number.isSafeInteger(authoritativeNowMs) && authoritativeNowMs >= 0`).

### 3. Turn Deadline Arming (`armActiveTurnDeadline`)
- **Preconditions**:
  1. `roomState.lifecycle === 'MATCH_ACTIVE'`
  2. `roomState.match !== null` & `roomState.match.status === 'IN_PROGRESS'` & `roomState.match.winnerId === null`
  3. `roomState.currentTurnId` is non-null, non-blank string
  4. `roomState.currentTurnDeadline === null` (cannot overwrite existing deadline)
  5. `roomState.activeAlarm === null` (enforces single active alarm model; cannot overwrite `TURN_DEADLINE`, `HOST_GRACE`, or `ROOM_RETENTION`)
  6. `roomState.revision` is a safe non-negative integer
- **Arming Result**:
  - `currentTurnDeadline = authoritativeNowMs + 30_000`
  - `activeAlarm = { kind: 'TURN_DEADLINE', dueAt: currentTurnDeadline, generation: roomState.revision }`
  - Returns fresh `RoomAuthorityState` preserving exact `roomId`, `lifecycle`, `revision`, `members`, `hostPlayerId`, `match`, `currentTurnId`.
- **Revision Invariant**: `activeAlarm.generation` equals `roomState.revision`. Arming does NOT increment Room revision (retains `revision = N + 1` from the gameplay transition).

### 4. Due State Evaluation (`evaluateTurnDeadlineDueState`)
- **Lifecycle Applicability**:
  - `LOBBY`, `MATCH_PAUSED_NO_LIVING_CONNECTIONS`, `MATCH_FINISHED`, `ABANDONED` -> `NOT_APPLICABLE`.
- **Active Coherence Validation**:
  - Any missing/inconsistent active state (`match` null/finished, `currentTurnId` null/blank, `currentTurnDeadline` null, `activeAlarm` null, `activeAlarm.kind !== 'TURN_DEADLINE'`, `activeAlarm.dueAt !== currentTurnDeadline`, `activeAlarm.generation !== roomState.revision`) -> `INVALID_STATE`.
- **Exact Due Boundary**:
  - `authoritativeNowMs < currentTurnDeadline` -> `NOT_DUE`
  - `authoritativeNowMs == currentTurnDeadline` -> `DUE`
  - `authoritativeNowMs > currentTurnDeadline` -> `DUE`

### 5. Distinction & Deferrals
- **Authoritative Alarm Metadata vs Provider Alarm Scheduling**: `activeAlarm` represents pure Room state metadata. Synchronization with Cloudflare `storage.setAlarm()`, alarm handlers, or retries is explicitly deferred.
- **Same-Revision Timing Completion vs Durable Atomic Persistence**: Arming composes timing metadata into the logical Room state at the same revision. Durable DO/SQLite persistence remains deferred.
- **Explicit Scope Deferrals**: `SYSTEM_TIMEOUT` execution, client-vs-timeout arbitration, provider alarm scheduling, Durable Objects, SQLite, WebSocket, presence, Pause/Resume, Telegram auth, and recipient projections (T27) are NOT implemented in T-021.

---

## Acceptance Criteria Verification Matrix

| AC ID | Description | Status | Evidence / Verification |
|---|---|---|---|
| AC-01 | Dedicated provider-independent turn-deadline module exists | PASS | `packages/room-runtime/src/turn-deadline.ts` created |
| AC-02 | Public timing primitives exported from room-runtime | PASS | Exported in `packages/room-runtime/src/index.ts` |
| AC-03 | TURN duration is exactly 30_000 ms | PASS | `TURN_DURATION_MS = 30_000` verified |
| AC-04 | No configurable/client turn duration exists | PASS | Duration is constant 30_000ms |
| AC-05 | No client timestamp is trusted | PASS | `authoritativeNowMs` is server-only input |
| AC-06 | No timing field added to GameplayActionEnvelope | PASS | Envelope remains actor-free and timing-free |
| AC-07 | authoritativeNowMs is server-only input | PASS | Parameterized in arming and due functions |
| AC-08 | Date.now is not used | PASS | Verified clean of `Date.now` |
| AC-09 | Math.random is not used | PASS | Verified clean of `Math.random` |
| AC-10 | crypto entropy is not used | PASS | Verified clean of crypto entropy |
| AC-11 | RandomSource is not used | PASS | Zero gameplay randomness consumed |
| AC-12 | Arming rejects non-safe/non-integer authoritativeNowMs | PASS | Tested with `NaN`, `1.5` |
| AC-13 | Arming rejects negative authoritativeNowMs | PASS | Tested with `-1` |
| AC-14 | Arming guards dueAt safe-integer overflow | PASS | Tested with `Number.MAX_SAFE_INTEGER` |
| AC-15 | Arming requires MATCH_ACTIVE | PASS | Rejects `LOBBY`, `PAUSED`, `FINISHED`, `ABANDONED` |
| AC-16 | Arming requires non-null Match | PASS | Rejects null/undefined match |
| AC-17 | Arming requires Core Match IN_PROGRESS | PASS | Rejects finished match |
| AC-18 | Arming requires winnerId null | PASS | Rejects match with winner |
| AC-19 | Arming requires non-null/non-blank currentTurnId | PASS | Rejects null or whitespace turnId |
| AC-20 | Arming requires currentTurnDeadline null | PASS | Rejects non-null deadline |
| AC-21 | Arming requires activeAlarm null | PASS | Rejects non-null activeAlarm |
| AC-22 | Existing TURN_DEADLINE cannot be silently overwritten | PASS | Rejects existing `TURN_DEADLINE` |
| AC-23 | Existing HOST_GRACE cannot be silently overwritten | PASS | Rejects existing `HOST_GRACE` |
| AC-24 | Existing ROOM_RETENTION cannot be silently overwritten | PASS | Rejects existing `ROOM_RETENTION` |
| AC-25 | Armed deadline equals authoritativeNowMs + 30_000 | PASS | `dueAt = authoritativeNowMs + 30000` |
| AC-26 | Armed activeAlarm.kind = TURN_DEADLINE | PASS | Kind is `TURN_DEADLINE` |
| AC-27 | Armed activeAlarm.dueAt equals currentTurnDeadline | PASS | `dueAt` matches deadline |
| AC-28 | Armed activeAlarm.generation equals Room revision | PASS | `generation` equals `roomState.revision` |
| AC-29 | Arming does not increment Room revision | PASS | `revision` preserved |
| AC-30 | Arming preserves roomId | PASS | `roomId` preserved |
| AC-31 | Arming preserves lifecycle MATCH_ACTIVE | PASS | `lifecycle` preserved |
| AC-32 | Arming preserves members | PASS | `members` preserved |
| AC-33 | Arming preserves hostPlayerId | PASS | `hostPlayerId` preserved |
| AC-34 | Arming preserves Match reference/content | PASS | `match` preserved |
| AC-35 | Arming preserves currentTurnId | PASS | `currentTurnId` preserved |
| AC-36 | Arming returns a fresh Room state | PASS | Fresh object returned |
| AC-37 | Input Room state not mutated | PASS | Pure function verified |
| AC-38 | Input Match not mutated | PASS | Pure function verified |
| AC-39 | Input Hands not mutated | PASS | Pure function verified |
| AC-40 | Deadline evaluator exists | PASS | `evaluateTurnDeadlineDueState` created |
| AC-41 | Evaluator validates authoritativeNowMs | PASS | Rejects invalid `authoritativeNowMs` with `INVALID_STATE` |
| AC-42 | Coherent active deadline at now < dueAt returns NOT_DUE | PASS | Evaluated at `dueAt - 1` |
| AC-43 | Coherent active deadline at now == dueAt returns DUE | PASS | Evaluated at `dueAt` |
| AC-44 | Coherent active deadline at now > dueAt returns DUE | PASS | Evaluated at `dueAt + 1` |
| AC-45 | LOBBY returns NOT_APPLICABLE | PASS | Evaluated for `LOBBY` |
| AC-46 | MATCH_PAUSED_NO_LIVING_CONNECTIONS returns NOT_APPLICABLE | PASS | Evaluated for `PAUSED` |
| AC-47 | MATCH_FINISHED returns NOT_APPLICABLE | PASS | Evaluated for `FINISHED` |
| AC-48 | ABANDONED returns NOT_APPLICABLE | PASS | Evaluated for `ABANDONED` |
| AC-49 | Active state with null deadline is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-50 | Active state with null activeAlarm is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-51 | Active state with wrong alarm kind is INVALID_STATE | PASS | Returns `INVALID_STATE` for `HOST_GRACE` |
| AC-52 | activeAlarm.dueAt mismatch is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-53 | activeAlarm.generation mismatch is INVALID_STATE | PASS | Returns `INVALID_STATE` for stale generation |
| AC-54 | Invalid revision is rejected/fails closed | PASS | Returns `INVALID_STATE` |
| AC-55 | Active state with null currentTurnId is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-56 | Active state with blank currentTurnId is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-57 | Active state with null Match is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-58 | Active state with finished Core Match is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-59 | Active state with winnerId non-null is INVALID_STATE | PASS | Returns `INVALID_STATE` |
| AC-60 | Stale alarm generation never returns DUE | PASS | Returns `INVALID_STATE` |
| AC-61 | Wrong alarm kind never returns DUE | PASS | Returns `INVALID_STATE` |
| AC-62 | Deadline/alarm mismatch never returns DUE | PASS | Returns `INVALID_STATE` |
| AC-63 | Evaluator does not mutate Room state | PASS | Pure function verified |
| AC-64 | Evaluator does not mutate Match | PASS | Pure function verified |
| AC-65 | Evaluator does not modify revision | PASS | Pure function verified |
| AC-66 | No Core transition is dispatched | PASS | Zero Core transitions |
| AC-67 | applySystemTimeout is not called | PASS | Uncalled |
| AC-68 | applyPlayCardsCommand is not called | PASS | Uncalled |
| AC-69 | applyCallLiar is not called | PASS | Uncalled |
| AC-70 | No card is selected | PASS | No card operations |
| AC-71 | No SYSTEM_TIMEOUT client action type added | PASS | Envelope unmutated |
| AC-72 | No synthetic actionId created | PASS | No synthetic action IDs |
| AC-73 | T-020 executeClientGameplayTransaction remains unchanged | PASS | File untouched |
| AC-74 | T-020 client transaction behavior remains unchanged | PASS | All T-020 tests PASS |
| AC-75 | T-020 one-command/one-revision behavior remains unchanged | PASS | Forced-CALL proofs intact |
| AC-76 | T-020 continuing commit can be armed without another revision | PASS | Integrated proof PASS |
| AC-77 | T-020 finished commit cannot be armed | PASS | Arming throws error |
| AC-78 | One active alarm state invariant explicitly tested | PASS | Rejects pre-existing alarms |
| AC-79 | Revision-as-TURN_DEADLINE-generation rule explicitly tested | PASS | Generation matches revision |
| AC-80 | Same-revision timing-completion boundary documented | PASS | Documented in evidence |
| AC-81 | Evidence explicitly says timing completion must later be composed atomically with durable persistence | PASS | Documented in evidence |
| AC-82 | No Durable Object provider API introduced | PASS | Provider-independent |
| AC-83 | No SQLite/persistence introduced | PASS | In-memory only |
| AC-84 | No WebSocket introduced | PASS | Zero networking |
| AC-85 | No provider alarm scheduling introduced | PASS | Scheduling deferred |
| AC-86 | No alarm handler introduced | PASS | Alarm handler deferred |
| AC-87 | No alarm retry implementation introduced | PASS | Alarm retry deferred |
| AC-88 | No client-vs-timeout arbitration introduced | PASS | Arbitration deferred |
| AC-89 | No SYSTEM_TIMEOUT Room orchestration introduced | PASS | Orchestration deferred |
| AC-90 | No presence accounting introduced | PASS | Presence deferred |
| AC-91 | No Pause/Resume implementation introduced | PASS | Pause/Resume deferred |
| AC-92 | No host-grace behavior introduced | PASS | Host grace deferred |
| AC-93 | No retention behavior introduced | PASS | Retention deferred |
| AC-94 | No projections/T27 implementation claimed | PASS | T27 deferred |
| AC-95 | No game-core source change | PASS | 0 changes |
| AC-96 | No game-core test change | PASS | 0 changes |
| AC-97 | No package changes | PASS | 0 changes |
| AC-98 | No package-lock changes | PASS | 0 changes |
| AC-99 | No external dependency changes | PASS | 0 changes |
| AC-100 | T-017/T-018/T-019/T-020 regression remains PASS | PASS | All 118 room-runtime tests PASS |
| AC-101 | npm ci passes | PASS | Clean install PASS |
| AC-102 | npm run typecheck passes | PASS | 0 TypeScript errors |
| AC-103 | npm test passes | PASS | 369 total tests PASS |
| AC-104 | room-runtime direct typecheck passes | PASS | Direct workspace check PASS |
| AC-105 | room-runtime direct tests pass | PASS | Direct workspace tests PASS |
| AC-106 | game-core direct typecheck/tests pass unchanged | PASS | 251 tests / 16 files PASS |
| AC-107 | Evidence maps AC-01 through AC-106 | PASS | Complete mapping |
| AC-108 | Evidence records exact due boundary | PASS | `< dueAt NOT_DUE`, `== dueAt DUE`, `> dueAt DUE` |
| AC-109 | Evidence records stale generation fail-closed proof | PASS | Returns `INVALID_STATE` |
| AC-110 | Evidence records wrong alarm-kind fail-closed proof | PASS | Returns `INVALID_STATE` |
| AC-111 | Evidence records T-020 continuing state -> timing armed with same revision | PASS | Verified in integration test |
| AC-112 | Evidence records finished T-020 state cannot be armed | PASS | Throws error on `MATCH_FINISHED` |
| AC-113 | Evidence explicitly records provider alarm execution as deferred | PASS | Provider alarm execution deferred |
| AC-114 | Evidence explicitly records client-vs-timeout arbitration as deferred | PASS | Client-vs-timeout arbitration deferred |
| AC-115 | Evidence explicitly records SYSTEM_TIMEOUT dispatch as deferred | PASS | SYSTEM_TIMEOUT dispatch deferred |
| AC-116 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Task status `IMPLEMENTED` |

---

## Verification Logs & Summary

### Full Regression Test Suite
- Total Tests: 369
- Total Test Files: 22
- `game-core`: 251 tests / 16 files (100% UNCHANGED)
- `room-runtime`: 118 tests / 6 files (22 turn-deadline tests + 16 transaction tests + 37 admission tests + 20 authorization tests + 16 protocol tests + 7 room-state tests)
