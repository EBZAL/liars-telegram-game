# Evidence: T-020-AUTHORITATIVE-GAMEPLAY-COMMIT-PRIMITIVE

## Task Identity & Git Commit Chain
- **Task ID**: `T-020-AUTHORITATIVE-GAMEPLAY-COMMIT-PRIMITIVE`
- **Task-Start Commit**: `e50fdd30f01c581cd620dcb36999ac1728cf6259`
- **Authoritative Implementation Commit**: `a9f891f9b9d25efc4e26e81d3afa40c536f650b6`
- **Evidence/State Before Metadata Reconciliation**: `14525db79b8c3730ce0b65d493675cd267edc41e`

---

## Technical Overview & Transaction Primitive

### 1. Transaction API
Implemented `executeClientGameplayTransaction` in `packages/room-runtime/src/gameplay-transaction.ts`:
```ts
export function executeClientGameplayTransaction(
  roomState: RoomAuthorityState<MatchState>,
  envelope: GameplayActionEnvelope,
  processedRegistry: ProcessedGameplayActionRegistry,
  actor: ServerResolvedActor,
  preparedNextTurn: ServerPreparedNextTurn,
  random: RandomSource
): ClientGameplayTransactionResult
```

### 2. Authorization-First Evaluation Order
1. **Authorization**: Call `evaluateServerGameplayActionRequest(roomState, envelope, processedRegistry, actor)`.
2. **REJECT Handling**: If `REJECT`, return immediately with exact reason. Zero Core dispatch, zero revision increment, zero processed record, zero RandomSource consumption.
3. **DUPLICATE Handling**: If `DUPLICATE`, return immediately with `priorResultingRevision`. Zero Core dispatch, zero revision increment, zero second record, zero RandomSource consumption.
4. **Prepared Next-Turn Validation**: Only after authorization `ACCEPT` and BEFORE Core dispatch, validate `ServerPreparedNextTurn`:
   - Must be object with non-empty string `turnId`.
   - `turnId.trim()` must NOT equal `roomState.currentTurnId`.
5. **Verified Core Command Dispatch**:
   - `PLAY_CARDS` -> `applyPlayCardsCommand(currentMatchState, actorPlayerId, envelope.payload.cardIds, random)`.
   - `CALL_LIAR` -> `applyCallLiar(currentMatchState, actorPlayerId, random)`.
6. **Core Invariant Check**: Verify status/winnerId consistency (fail-closed if IN_PROGRESS has winnerId or FINISHED lacks winnerId).
7. **Revision Increment**: `resultingRevision = nextRoomRevision(roomState.revision)` (previous + 1).
8. **Processed Record**: `recordSuccessfulGameplayAction(processedRegistry, actor, envelope, resultingRevision)`.
9. **Next Authoritative Room State**:
   - `revision`: `resultingRevision`
   - `lifecycle`: `'MATCH_FINISHED'` if Core status is FINISHED, else `'MATCH_ACTIVE'`
   - `currentTurnId`: `null` if FINISHED, else `preparedNextTurn.turnId.trim()`
   - `currentTurnDeadline`: `null`
   - `activeAlarm`: `null`
10. **COMMITTED Result**: Returns `{ decision: 'COMMITTED', roomState, processedRegistry, resultingRevision }`.

---

## Core Invariant Proofs

### 1. Forced-CALL Single-Revision Proof (AC-57..AC-62, AC-120)
- When a `PLAY_CARDS` action leaves the actor with 0 cards, `applyPlayCardsCommand` internally triggers Core's automatic forced `CALL_LIAR`.
- Single call to `executeClientGameplayTransaction` produces **exactly one** `COMMITTED` result.
- Room revision increments by **exactly 1** (`0 -> 1`).
- Processed registry receives **exactly 1** action record of type `PLAY_CARDS`.
- Zero synthetic `CALL_LIAR` processed client records are created.

### 2. Pure Logical Commit Pair vs Durable Atomic Persistence (AC-121)
- `executeClientGameplayTransaction` produces a pure, in-memory logical pair: `(roomState, processedRegistry)` where `roomState.revision === record.resultingRevision === envelope.expectedRevision + 1`.
- This pure primitive does NOT guarantee durable atomic persistence across system restarts or crashes.
- Future SQLite / Durable Object implementation will transactionally persist both parts.

### 3. Timing & Alarm Invalidation Boundary (AC-122)
- Successful transaction commit clears old turn timing metadata: `currentTurnDeadline = null` and `activeAlarm = null`.
- 30-second turn deadline scheduling, `TURN_DEADLINE` alarm scheduling, and late-command arbitration are explicitly deferred.

### 4. Life-Status & Presence Boundary (AC-123)
- Player elimination during a continuing Match leaves Room lifecycle as `MATCH_ACTIVE`.
- Authenticated connection presence accounting and zero-Living Pause re-evaluation are explicitly deferred.

---

## Verification & Test Results

### Regression Totals
- **npm ci**: PASS
- **npm run typecheck**: PASS
- **npm test**: PASS
- **Total Project Tests**: 347 passed across 21 test files
  - `game-core`: 251 tests / 16 test files (100% UNCHANGED)
  - `room-runtime`: 96 tests / 5 test files (16 transaction tests + 37 admission tests + 20 authorization tests + 16 protocol tests + 7 room-state tests)
- **Direct `room-runtime` checks from clean dist state**: PASS

### Delta Summary
- Package changes: 0
- Package-lock changes: 0
- External dependency changes: 0
- Game-core source changes: 0
- Game-core test changes: 0
- Room-state source changes: 0
- Gameplay-protocol source changes: 0
- Gameplay-admission source changes: 0
- Gameplay-authorization source changes: 0

---

## Acceptance Criteria Mapping (AC-01 .. AC-124)

- **AC-01**: Dedicated provider-independent gameplay commit primitive exists. -> PASS
- **AC-02**: Public API exported by room-runtime. -> PASS
- **AC-03**: No provider/Cloudflare/WebSocket/SQLite API introduced. -> PASS
- **AC-04**: No new external dependency. -> PASS
- **AC-05**: RoomAuthorityState shape unchanged. -> PASS
- **AC-06**: GameplayActionEnvelope shape unchanged. -> PASS
- **AC-07**: Client envelope receives no nextTurnId field. -> PASS
- **AC-08**: Client envelope remains actor-free. -> PASS
- **AC-09**: ServerPreparedNextTurn or equivalent is explicitly server-side context. -> PASS
- **AC-10**: Blank/non-string prepared next turn ID is rejected for a new accepted action. -> PASS
- **AC-11**: Prepared next turn ID equal to consumed currentTurnId is rejected. -> PASS
- **AC-12**: Prepared next turn validation occurs only after T-019 ACCEPT. -> PASS
- **AC-13**: Prepared next turn validation occurs before Core dispatch. -> PASS
- **AC-14**: Transaction delegates authorization to evaluateServerGameplayActionRequest. -> PASS
- **AC-15**: No manual duplicate authorization copy is introduced. -> PASS
- **AC-16**: REJECT result preserves exact T-019 reason. -> PASS
- **AC-17**: REJECT causes zero Core transition. -> PASS
- **AC-18**: REJECT causes zero revision increment. -> PASS
- **AC-19**: REJECT creates no processed record. -> PASS
- **AC-20**: DUPLICATE returns priorResultingRevision. -> PASS
- **AC-21**: DUPLICATE causes zero Core transition. -> PASS
- **AC-22**: DUPLICATE causes zero revision increment. -> PASS
- **AC-23**: DUPLICATE creates no second processed record. -> PASS
- **AC-24**: DUPLICATE does not rotate currentTurnId. -> PASS
- **AC-25**: DUPLICATE does not require valid preparedNextTurn. -> PASS
- **AC-26**: Same committed request retried against advanced returned state remains DUPLICATE. -> PASS
- **AC-27**: Cross-actor actionId collision remains ACTION_ID_CONFLICT. -> PASS
- **AC-28**: Stale action remains STALE_REVISION. -> PASS
- **AC-29**: Non-member remains ACTOR_NOT_MEMBER. -> PASS
- **AC-30**: Non-current actor remains ACTOR_NOT_CURRENT_PLAYER. -> PASS
- **AC-31**: Illegal action remains ACTION_NOT_ALLOWED. -> PASS
- **AC-32**: Foreign/unknown PLAY card remains INVALID_PLAY_SELECTION. -> PASS
- **AC-33**: PLAY_CARDS uses applyPlayCardsCommand. -> PASS
- **AC-34**: PLAY_CARDS does not use low-level applyPlayCards directly. -> PASS
- **AC-35**: CALL_LIAR uses applyCallLiar. -> PASS
- **AC-36**: No SYSTEM_TIMEOUT dispatch exists. -> PASS
- **AC-37**: Supplied RandomSource is passed to Core command transition. -> PASS
- **AC-38**: No additional gameplay RNG source exists. -> PASS
- **AC-39**: No Math.random introduced. -> PASS
- **AC-40**: No Date.now introduced. -> PASS
- **AC-41**: No crypto entropy introduced. -> PASS
- **AC-42**: Ordinary PLAY reaches COMMITTED. -> PASS
- **AC-43**: Ordinary PLAY resulting Match is Core-derived. -> PASS
- **AC-44**: Ordinary PLAY Room revision increments exactly once. -> PASS
- **AC-45**: Ordinary PLAY produces exactly one processed record. -> PASS
- **AC-46**: Processed record resultingRevision equals new Room revision. -> PASS
- **AC-47**: Processed record remains actor-bound. -> PASS
- **AC-48**: Successful continuing PLAY installs prepared next turn ID. -> PASS
- **AC-49**: Successful continuing PLAY clears old currentTurnDeadline. -> PASS
- **AC-50**: Successful continuing PLAY clears old activeAlarm. -> PASS
- **AC-51**: Legal CALL_LIAR reaches COMMITTED. -> PASS
- **AC-52**: CALL resulting Match is Core-derived. -> PASS
- **AC-53**: CALL Room revision increments exactly once. -> PASS
- **AC-54**: CALL creates exactly one processed client record. -> PASS
- **AC-55**: Continuing CALL installs prepared next turn ID. -> PASS
- **AC-56**: Continuing CALL clears old timing metadata. -> PASS
- **AC-57**: Forced-CALL PLAY command reaches one COMMITTED result. -> PASS
- **AC-58**: Forced-CALL PLAY increments Room revision exactly once. -> PASS
- **AC-59**: Forced-CALL PLAY adds exactly one processed action record. -> PASS
- **AC-60**: Forced-CALL PLAY record actionType remains PLAY_CARDS. -> PASS
- **AC-61**: No synthetic CALL_LIAR processed client record is created. -> PASS
- **AC-62**: Forced-CALL resulting Match matches verified Core orchestration. -> PASS
- **AC-63**: Match-winning client command reaches COMMITTED. -> PASS
- **AC-64**: Winning command increments revision exactly once. -> PASS
- **AC-65**: Winning command is recorded exactly once. -> PASS
- **AC-66**: Winning command maps Room lifecycle to MATCH_FINISHED. -> PASS
- **AC-67**: Finished Room Match status is FINISHED. -> PASS
- **AC-68**: Finished Room winnerId is non-null. -> PASS
- **AC-69**: Finished Room currentTurnId is null. -> PASS
- **AC-70**: Finished Room currentTurnDeadline is null. -> PASS
- **AC-71**: Finished Room activeAlarm is null. -> PASS
- **AC-72**: No Room-layer next Round is created after Core Match finish. -> PASS
- **AC-73**: Continuing Core Match maps Room lifecycle to MATCH_ACTIVE. -> PASS
- **AC-74**: Continuing Match with an elimination does not implement Pause logic. -> PASS
- **AC-75**: Presence accounting remains deferred. -> PASS
- **AC-76**: Life-status-triggered Pause re-evaluation remains deferred. -> PASS
- **AC-77**: Successful COMMITTED result preserves roomId. -> PASS
- **AC-78**: Successful COMMITTED result preserves members. -> PASS
- **AC-79**: Successful COMMITTED result preserves hostPlayerId. -> PASS
- **AC-80**: COMMITTED returns a fresh Room state without mutating input Room state. -> PASS
- **AC-81**: Input MatchState is not mutated. -> PASS
- **AC-82**: Input player Hands are not mutated. -> PASS
- **AC-83**: Input envelope is not mutated. -> PASS
- **AC-84**: Input actor context is not mutated. -> PASS
- **AC-85**: Input prepared-next-turn context is not mutated. -> PASS
- **AC-86**: Input processed registry is not mutated. -> PASS
- **AC-87**: Returned processed registry preserves prototype safety. -> PASS
- **AC-88**: Returned Room revision equals envelope.expectedRevision + 1. -> PASS
- **AC-89**: Returned processed record resultingRevision equals envelope.expectedRevision + 1. -> PASS
- **AC-90**: Returned Room revision equals recorded resultingRevision. -> PASS
- **AC-91**: In-progress Core state with non-null winner fails closed. -> PASS
- **AC-92**: Finished Core state with null winner fails closed. -> PASS
- **AC-93**: Invalid Core result creates no processed record. -> PASS
- **AC-94**: Transaction does not return separate Card rank/value metadata. -> PASS
- **AC-95**: Transaction is documented as internal authoritative state, not client projection. -> PASS
- **AC-96**: No recipient projection is implemented or claimed. -> PASS
- **AC-97**: No deadline scheduling is implemented. -> PASS
- **AC-98**: No TURN_DEADLINE alarm scheduling is implemented. -> PASS
- **AC-99**: No alarm provider API is introduced. -> PASS
- **AC-100**: No late-command/deadline arbitration is implemented. -> PASS
- **AC-101**: No Durable Object is implemented. -> PASS
- **AC-102**: No SQLite/persistence is implemented. -> PASS
- **AC-103**: No actual concurrent serialization is implemented. -> PASS
- **AC-104**: No WebSocket is implemented. -> PASS
- **AC-105**: No Telegram auth/session work is implemented. -> PASS
- **AC-106**: No presence/Pause/Resume is implemented. -> PASS
- **AC-107**: No T27/projection implementation is claimed. -> PASS
- **AC-108**: game-core source remains unchanged. -> PASS
- **AC-109**: game-core tests remain unchanged. -> PASS
- **AC-110**: T-017/T-018/T-019 existing tests continue passing. -> PASS
- **AC-111**: package files remain unchanged. -> PASS
- **AC-112**: package-lock remains unchanged. -> PASS
- **AC-113**: npm ci passes. -> PASS
- **AC-114**: npm run typecheck passes. -> PASS
- **AC-115**: npm test passes. -> PASS
- **AC-116**: room-runtime direct typecheck passes. -> PASS
- **AC-117**: room-runtime direct tests pass. -> PASS
- **AC-118**: game-core direct typecheck/tests pass unchanged. -> PASS
- **AC-119**: Evidence maps AC-01 through AC-118. -> PASS
- **AC-120**: Evidence explicitly proves one client command = one Room revision for forced-CALL PLAY. -> PASS
- **AC-121**: Evidence explicitly distinguishes pure logical commit pair from durable atomic persistence. -> PASS
- **AC-122**: Evidence explicitly records old deadline/alarm invalidation and next scheduling as deferred. -> PASS
- **AC-123**: Evidence explicitly records presence/life-status Pause re-evaluation as deferred. -> PASS
- **AC-124**: Task ends IMPLEMENTED only, never VERIFIED. -> PASS

---

## Explicitly Deferred Scope
- `SYSTEM_TIMEOUT` execution
- Deadline scheduling & alarm provider integration
- Late-command vs timeout arbitration
- Presence accounting & zero-Living Pause / Living-only Resume
- Durable Object / WebSocket / SQLite persistence
- Recipient-specific projections / T27

---

## Final Status
Task `T-020-AUTHORITATIVE-GAMEPLAY-COMMIT-PRIMITIVE` is **IMPLEMENTED**. Ready for independent Architect review.
