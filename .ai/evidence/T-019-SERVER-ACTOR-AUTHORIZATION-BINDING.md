# Evidence: T-019-SERVER-ACTOR-AUTHORIZATION-BINDING

## Task Identity & Authoritative Git Commit Chain
- **Task ID**: `T-019-SERVER-ACTOR-AUTHORIZATION-BINDING`
- **Task-Start Commit**: `ad653c69edae336cf264a8282649b03cee163928`
- **Initial Implementation Commit**: `df242ba38c1fdd274a9eb52c8cf445c0a99c36aa`
- **Initial Evidence/State Commit**: `6914965ca2af0def2fd36b3fe03a61128131b3d5`
- **Correction Reopen Commit**: `1371fe77b47e2ef306ed961fefcd893ff29ed8fb`
- **Correction Implementation Commit**: `01418074dcefa29b71f0df4aeaa887c2b64d4204`

---

## Technical Summary & Correction Hardening

### 1. Mandatory Low-Level Actor Parameter (Architect Finding 1)
- `evaluateGameplayActionAdmission` signature updated to require a mandatory `actor: ServerResolvedActor` parameter:
  ```ts
  export function evaluateGameplayActionAdmission(
    roomState: RoomAuthorityState<unknown>,
    envelope: GameplayActionEnvelope,
    processedRegistry: ProcessedGameplayActionRegistry,
    actor: ServerResolvedActor
  ): GameplayActionAdmissionResult
  ```
- No optional parameter `actor?: ServerResolvedActor`.
- No default actor, no fallback actor, and no actorless dedupe lookup path exists.
- Type-level proof established in test suite:
  ```ts
  type AdmissionActorParameter = Parameters<typeof evaluateGameplayActionAdmission>[3];
  expectTypeOf<AdmissionActorParameter>().toEqualTypeOf<ServerResolvedActor>();
  ```

### 2. Low-Level Malformed Actor Fail-Closed Behavior
- `evaluateGameplayActionAdmission` fails closed immediately if `actor` is malformed (`undefined`, `null`, non-object, non-string `playerId`, or blank `playerId` after `trim()`):
  Returns `{ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' }`.
- Added `'INVALID_ACTOR_CONTEXT'` to `GameplayActionRejectionReason` union.

### 3. Low-Level Actor-Bound Dedupe & Conflict Semantics
- Direct test proofs against `evaluateGameplayActionAdmission`:
  - Same actor exact retry on advanced room state => `DUPLICATE`.
  - Cross-actor submitting an existing `actionId` => `REJECT` / `ACTION_ID_CONFLICT`.
  - Malformed runtime `actor` => `REJECT` / `INVALID_ACTOR_CONTEXT`.

### 4. High-Level Safe Evaluator (`evaluateServerGameplayActionRequest`)
- Retains mandatory membership-before-dedupe ordering:
  - Step 1: Validate server actor context -> `INVALID_ACTOR_CONTEXT`.
  - Step 2: Validate room membership -> `ACTOR_NOT_MEMBER` (occurs BEFORE actionId dedupe lookup).
  - Step 3: Actor-bound actionId lookup -> `DUPLICATE` (same actor exact request) or `ACTION_ID_CONFLICT` (cross-actor).
  - Step 4: Unseen revision check -> `STALE_REVISION`.
  - Step 5: Room lifecycle check -> `MATCH_NOT_ACTIVE`.
  - Step 6: Match snapshot check -> `MATCH_STATE_MISSING` / `MATCH_NOT_ACTIVE`.
  - Step 7: Room turnId check -> `TURN_MISMATCH`.
  - Step 8: Match player & current turn player authorization -> `ACTOR_NOT_MATCH_PLAYER` / `ACTOR_NOT_CURRENT_PLAYER`.
  - Step 9: Core `getAllowedTurnActions` legal action authorization -> `ACTION_NOT_ALLOWED`.
  - Step 10: Core `validatePlaySelection` card ownership authorization -> `INVALID_PLAY_SELECTION`.
  - Step 11: `ACCEPT`.

---

## 16 Mandatory Security Test Proofs

1. **Non-member + known exact actionId**: Returns `ACTOR_NOT_MEMBER`, NOT `DUPLICATE`.
2. **Original member + exact processed action + advanced revision/turn**: Returns `DUPLICATE` with `priorResultingRevision`.
3. **Second valid member + exact same actionId/envelope**: Returns `ACTION_ID_CONFLICT`, NOT `DUPLICATE` or `ACCEPT`.
4. **Second valid member is current Player and revision/turn match but actionId belongs to original actor**: Returns `ACTION_ID_CONFLICT`.
5. **Unseen current actor + legal PLAY with own card**: Returns `ACCEPT`.
6. **Unseen current actor + foreign Player card ID**: Returns `INVALID_PLAY_SELECTION`.
7. **Unseen current actor + unknown card ID**: Returns `INVALID_PLAY_SELECTION`.
8. **First Turn CALL_LIAR**: Returns `ACTION_NOT_ALLOWED`.
9. **Forced-CALL state PLAY_CARDS**: Returns `ACTION_NOT_ALLOWED`.
10. **Forced-CALL state CALL_LIAR**: Returns `ACCEPT`.
11. **Non-current Room member**: Returns `ACTOR_NOT_CURRENT_PLAYER`.
12. **Room member absent from Match players**: Returns `ACTOR_NOT_MATCH_PLAYER`.
13. **Null Match snapshot**: Returns `MATCH_STATE_MISSING`.
14. **hostPlayerId actor who is not current Player**: Returns `ACTOR_NOT_CURRENT_PLAYER` (no Host bypass).
15. **`__proto__` / `constructor` action IDs**: Prototype safe (null prototype preserved).
16. **`__proto__` / `constructor` actor IDs**: Handled safely as values, no prototype pollution.

---

## Verification & Regression Totals

### Build & Test Commands
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS
- Direct `room-runtime` typecheck & test from clean dist state: PASS

### Regression Totals
- **Total Project Tests**: 331 passed across 20 test files
  - `game-core`: 251 tests / 16 test files (100% UNCHANGED)
  - `room-runtime`: 80 tests / 4 test files (37 admission tests + 20 authorization tests + 16 protocol tests + 7 room-state tests)

### Correction Package Delta
- Correction package changes: 0
- Correction package-lock changes: 0
- External dependency changes: 0
- Game-core source/test changes: 0

---

## Acceptance Criteria Mapping (AC-01 .. AC-112)

- **AC-01**: Dedicated `gameplay-authorization.ts` module exists. -> PASS
- **AC-02**: Workflow contains no Cloudflare/HTTP/WebSocket/Telegram API. -> PASS
- **AC-03**: `room-runtime` declares `game-core` as internal runtime workspace dependency. -> PASS
- **AC-04**: No external dependency/version introduced. -> PASS
- **AC-05**: Clean `npm ci` does not depend on stale dist artifacts. -> PASS
- **AC-06**: `game-core` source remains unchanged. -> PASS
- **AC-07**: `game-core` tests remain unchanged. -> PASS
- **AC-08**: T-017 `RoomAuthorityState` source remains unchanged. -> PASS
- **AC-09**: T-017 `GameplayActionEnvelope`/parser source remains unchanged. -> PASS
- **AC-10**: Client `GameplayActionEnvelope` contains no actor/player identity field. -> PASS
- **AC-11**: `ServerResolvedActor` interface exists. -> PASS
- **AC-12**: Server actor `playerId` must be non-empty string. -> PASS
- **AC-13**: No parser from client gameplay JSON creates actor identity. -> PASS
- **AC-14**: Invalid server actor context fails closed as `INVALID_ACTOR_CONTEXT`. -> PASS
- **AC-15**: Non-member actor is rejected (`ACTOR_NOT_MEMBER`). -> PASS
- **AC-16**: Non-member rejection occurs before processed-action duplicate disclosure. -> PASS
- **AC-17**: Existing exact envelope submitted by non-member is NOT `DUPLICATE`. -> PASS
- **AC-18**: Processed record stores server `actorPlayerId`. -> PASS
- **AC-19**: Processed record retains T-018 request snapshot. -> PASS
- **AC-20**: Processed record retains `resultingRevision`. -> PASS
- **AC-21**: Processed record contains no hidden Match/randomness/auth data. -> PASS
- **AC-22**: Successful PLAY record detaches `cardIds`. -> PASS
- **AC-23**: Same actor + exact request remains `DUPLICATE`. -> PASS
- **AC-24**: Same actor exact retry after revision advance remains `DUPLICATE`. -> PASS
- **AC-25**: Same actor exact retry after turn change remains `DUPLICATE`. -> PASS
- **AC-26**: `DUPLICATE` remains before stale revision rejection. -> PASS
- **AC-27**: `DUPLICATE` remains before current-player authorization. -> PASS
- **AC-28**: `DUPLICATE` returns `priorResultingRevision`. -> PASS
- **AC-29**: Different member using same `actionId` + same request is `ACTION_ID_CONFLICT`. -> PASS
- **AC-30**: Different member using same `actionId` + different request is `ACTION_ID_CONFLICT`. -> PASS
- **AC-31**: Cross-actor `actionId` collision is never `DUPLICATE`. -> PASS
- **AC-32**: Cross-actor `actionId` collision is never `ACCEPT`. -> PASS
- **AC-33**: Cross-actor conflict does not expose original actor identity. -> PASS
- **AC-34**: Same actor + different `expectedRevision` remains `ACTION_ID_CONFLICT`. -> PASS
- **AC-35**: Same actor + different `turnId` remains `ACTION_ID_CONFLICT`. -> PASS
- **AC-36**: Same actor + different `actionType` remains `ACTION_ID_CONFLICT`. -> PASS
- **AC-37**: Same actor + different `cardIds` remains `ACTION_ID_CONFLICT`. -> PASS
- **AC-38**: Different `cardIds` ordering remains `ACTION_ID_CONFLICT`. -> PASS
- **AC-39**: Unseen lower revision remains `STALE_REVISION`. -> PASS
- **AC-40**: Unseen higher revision remains `STALE_REVISION`. -> PASS
- **AC-41**: `LOBBY` remains `MATCH_NOT_ACTIVE`. -> PASS
- **AC-42**: `MATCH_PAUSED_NO_LIVING_CONNECTIONS` remains `MATCH_NOT_ACTIVE`. -> PASS
- **AC-43**: `MATCH_FINISHED` remains `MATCH_NOT_ACTIVE`. -> PASS
- **AC-44**: `ABANDONED` remains `MATCH_NOT_ACTIVE`. -> PASS
- **AC-45**: `MATCH_ACTIVE` with null Match snapshot is `MATCH_STATE_MISSING`. -> PASS
- **AC-46**: `MATCH_ACTIVE` with finished Core Match fails closed as `MATCH_NOT_ACTIVE`. -> PASS
- **AC-47**: Room `currentTurnId` mismatch is `TURN_MISMATCH`. -> PASS
- **AC-48**: Room `currentTurnId` null is `TURN_MISMATCH`. -> PASS
- **AC-49**: Member absent from Match players is `ACTOR_NOT_MATCH_PLAYER`. -> PASS
- **AC-50**: New command from non-current player is `ACTOR_NOT_CURRENT_PLAYER`. -> PASS
- **AC-51**: Host status grants no gameplay authorization bypass. -> PASS
- **AC-52**: Core `getAllowedTurnActions` used for legal action authorization. -> PASS
- **AC-53**: First-turn `CALL_LIAR` rejected (`ACTION_NOT_ALLOWED`). -> PASS
- **AC-54**: Ordinary legal `PLAY_CARDS` authorized (`ACCEPT`). -> PASS
- **AC-55**: Ordinary legal `CALL_LIAR` authorized when Core permits. -> PASS
- **AC-56**: Forced-CALL player cannot authorize `PLAY_CARDS`. -> PASS
- **AC-57**: Forced-CALL player can authorize `CALL_LIAR`. -> PASS
- **AC-58**: PLAY ownership uses authoritative actor Hand. -> PASS
- **AC-59**: PLAY using another Player's card ID rejected (`INVALID_PLAY_SELECTION`). -> PASS
- **AC-60**: PLAY using unknown card ID rejected (`INVALID_PLAY_SELECTION`). -> PASS
- **AC-61**: PLAY using actor-owned legal card IDs authorized. -> PASS
- **AC-62**: Authorization result does not expose selected Card rank/value. -> PASS
- **AC-63**: Authorization result does not expose any other Player Hand. -> PASS
- **AC-64**: `CALL_LIAR` target remains server/Core-derived. -> PASS
- **AC-65**: `recordSuccessfulGameplayAction` requires server actor context. -> PASS
- **AC-66**: New successful record binds `actorPlayerId`. -> PASS
- **AC-67**: Exact same actor/request/result re-record is idempotent. -> PASS
- **AC-68**: Different actor re-record is Action ID conflict. -> PASS
- **AC-69**: Different request re-record is Action ID conflict. -> PASS
- **AC-70**: Different resultingRevision re-record is Action ID conflict. -> PASS
- **AC-71**: Existing-action conflict precedence remains before generic result revision validation. -> PASS
- **AC-72**: Unseen invalid resultingRevision rejected by revision validation. -> PASS
- **AC-73**: Registry remains prototype-safe (null prototype). -> PASS
- **AC-74**: `actionId` `__proto__` remains safe. -> PASS
- **AC-75**: `actionId` `constructor` remains safe. -> PASS
- **AC-76**: `actorId` `__proto__` safe as stored value. -> PASS
- **AC-77**: `actorId` `constructor` safe as stored value. -> PASS
- **AC-78**: Request evaluation does not mutate `RoomAuthorityState`. -> PASS
- **AC-79**: Request evaluation does not mutate `MatchState`. -> PASS
- **AC-80**: Request evaluation does not mutate authoritative Hands. -> PASS
- **AC-81**: Request evaluation does not mutate `envelope`. -> PASS
- **AC-82**: Request evaluation does not mutate actor context. -> PASS
- **AC-83**: Request evaluation does not mutate `processedRegistry`. -> PASS
- **AC-84**: Rejected request does not create processed record. -> PASS
- **AC-85**: Request evaluation does not mutate Room revision. -> PASS
- **AC-86**: No Game Core transition is dispatched. -> PASS
- **AC-87**: No `RandomSource` is consumed. -> PASS
- **AC-88**: No `Date.now` / `Math.random` / `crypto` entropy introduced. -> PASS
- **AC-89**: No authentication/session mechanism claimed. -> PASS
- **AC-90**: No Durable Object/WebSocket/SQLite implementation introduced. -> PASS
- **AC-91**: No concurrency serialization introduced. -> PASS
- **AC-92**: No deadlines/alarms introduced. -> PASS
- **AC-93**: No presence/Pause/Resume introduced. -> PASS
- **AC-94**: No recipient projection/T27 implementation claimed. -> PASS
- **AC-95**: All existing T-017 tests continue passing. -> PASS
- **AC-96**: All evolved T-018 semantics remain explicitly tested. -> PASS
- **AC-97**: `npm ci` passes. -> PASS
- **AC-98**: `npm run typecheck` passes. -> PASS
- **AC-99**: `npm test` passes. -> PASS
- **AC-100**: `room-runtime` direct typecheck passes from clean dependency state. -> PASS
- **AC-101**: `room-runtime` direct test passes from clean dependency state. -> PASS
- **AC-102**: `game-core` direct typecheck passes. -> PASS
- **AC-103**: `game-core` direct tests pass unchanged. -> PASS
- **AC-104**: `package-lock.json` changes are internal-workspace-only. -> PASS
- **AC-105**: Evidence maps AC-01 through AC-104. -> PASS
- **AC-106**: Evidence explicitly records membership-before-dedupe proof. -> PASS
- **AC-107**: Evidence explicitly records same-actor duplicate-after-advance proof. -> PASS
- **AC-108**: Evidence explicitly records cross-actor actionId collision proof. -> PASS
- **AC-109**: Evidence explicitly records first-turn/forced-CALL legal-action proofs. -> PASS
- **AC-110**: Evidence explicitly records foreign-card ownership rejection proof. -> PASS
- **AC-111**: Evidence explicitly records all deferred boundaries. -> PASS
- **AC-112**: Task ends IMPLEMENTED only, never VERIFIED. -> PASS

---

## Explicitly Deferred Scope
- Telegram initData validation / session authentication
- Durable Object / WebSocket / SQLite persistence
- Core gameplay command execution / Match state mutation
- Room revision increment execution / processed record creation during dispatch
- Concurrency serialization / turnId generation
- Alarm / deadline scheduling / late-command arbitration
- Presence accounting / Pause / Resume
- Recipient-specific projections / T27 dead-spectator protection

---

## Final Status
Task `T-019-SERVER-ACTOR-AUTHORIZATION-BINDING` is **IMPLEMENTED**. Ready for independent Architect review.
