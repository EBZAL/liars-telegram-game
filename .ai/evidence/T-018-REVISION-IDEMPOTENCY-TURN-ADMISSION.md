# Evidence: T-018-REVISION-IDEMPOTENCY-TURN-ADMISSION

**Task ID:** T-018-REVISION-IDEMPOTENCY-TURN-ADMISSION  
**Task Title:** Revision, Idempotency & Turn Admission  
**Stage:** STAGE-04 — Authoritative Multiplayer  
**Implementation Commit:** `87cd63313500c059e900cfe2dd357fad31d2bab0`  
**Status:** IMPLEMENTED  

---

## 1. Summary of Implementation

A dedicated provider-independent gameplay admission and idempotency layer was added to `@liars-telegram-game/room-runtime` (`packages/room-runtime/src/gameplay-admission.ts`). This layer implements ADR-006 authority semantics combining actionId idempotency, stale revision rejection, lifecycle enforcement, turnId validation, and monotonic revision progression before Game Core dispatch, Durable Object serialization, persistence, or WebSocket handlers are introduced.

### Key Deliverables

1. **Monotonic Revision Primitive (`nextRoomRevision`)**:
   - Accepts safe non-negative integer `currentRevision`.
   - Returns `currentRevision + 1` (AC-43, AC-44).
   - Rejects negative numbers, non-integers, non-numbers, NaN, Infinity, and `Number.MAX_SAFE_INTEGER` overflow (AC-45..48).

2. **Processed Action Registry & Prototype Safety (`ProcessedGameplayActionRegistry`)**:
   - `createProcessedGameplayActionRegistry()` returns an independently allocated null-prototype object (`Object.getPrototypeOf(reg) === null`) (AC-08, AC-09).
   - Safely records and looks up arbitrary opaque `actionId` keys including `__proto__` and `constructor` without mutating object prototype (AC-10, AC-11, AC-12, AC-54).
   - `recordSuccessfulGameplayAction`:
     - Requires `resultingRevision === envelope.expectedRevision + 1` (AC-49, AC-50).
     - Returns a fresh registry copy while leaving the original input registry and envelope unmodified (AC-51, AC-52, AC-53).
     - Stores detached request snapshots (`cardIds` copied into a new array) (AC-13, AC-16).
     - Excludes server hidden state/randomness (AC-15).
     - Allows idempotent re-recording of the exact same successful request and resulting revision (AC-55).
     - Throws conflict error on duplicate `actionId` with different request or different `resultingRevision` (AC-56, AC-57).

3. **Admission Decision Engine (`evaluateGameplayActionAdmission`)**:
   - Returns `ACCEPT`, `DUPLICATE`, or `REJECT` with specific rejection reasons (`ACTION_ID_CONFLICT`, `STALE_REVISION`, `MATCH_NOT_ACTIVE`, `TURN_MISMATCH`).
   - Enforces mandatory evaluation ordering:
     1. **ActionId Registry Lookup**:
        - Exact request match → `DUPLICATE` (returns `priorResultingRevision`).
        - Same `actionId` with modified request → `REJECT / ACTION_ID_CONFLICT`.
     2. **Revision Check**:
        - Unseen `expectedRevision !== roomState.revision` → `REJECT / STALE_REVISION`.
     3. **Lifecycle Check**:
        - `lifecycle !== 'MATCH_ACTIVE'` → `REJECT / MATCH_NOT_ACTIVE`.
     4. **Turn Check**:
        - `currentTurnId === null` or `turnId !== currentTurnId` → `REJECT / TURN_MISMATCH`.
     5. **Acceptance**:
        - Unseen exact-revision, MATCH_ACTIVE, matching turn action → `ACCEPT`.

---

## 2. Mandatory Ordering & Idempotency Proofs

### Duplicate-Before-Stale / Turn-Advance Ordering Proof
As required by ADR-006 and AC-18..22:
- A command is processed at `expectedRevision = 7`, `turnId = 'turn-7'`, `resultingRevision = 8`.
- Later, authoritative Room state advances to `revision = 11`, `currentTurnId = 'turn-10'`.
- The exact original command (`actionId = 'act-77'`, `expectedRevision = 7`, `turnId = 'turn-7'`, `PLAY_CARDS`, `['c1', 'c2']`) is retried.
- `evaluateGameplayActionAdmission` returns `{ decision: 'DUPLICATE', priorResultingRevision: 8 }`.
- It does **NOT** return `STALE_REVISION`, `TURN_MISMATCH`, or `ACCEPT`.
- This proves that exact retry/idempotency lookup occurs **BEFORE** stale revision and turn validation.

### Action ID Conflict Proofs
- When an `actionId` already exists in `processedRegistry`, any attempt to reuse it with:
  - different `expectedRevision` → `ACTION_ID_CONFLICT` (AC-23)
  - different `turnId` → `ACTION_ID_CONFLICT` (AC-24)
  - different `actionType` (`CALL_LIAR` vs `PLAY_CARDS`) → `ACTION_ID_CONFLICT` (AC-25)
  - different PLAY `cardIds` → `ACTION_ID_CONFLICT` (AC-26)
  - different PLAY `cardIds` ordering (e.g. `['c1', 'c2']` vs `['c2', 'c1']`) → `ACTION_ID_CONFLICT` (AC-27)
- `ACTION_ID_CONFLICT` is evaluated before ordinary revision/turn admission and is never converted to `ACCEPT` (AC-28, AC-29).

---

## 3. Acceptance Criteria Mapping

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| AC-01 | Provider-independent admission implementation | PASS | `packages/room-runtime/src/gameplay-admission.ts` |
| AC-02 | No external dependency added | PASS | Verified in package.json & lockfile |
| AC-03 | No Cloudflare/provider API imported | PASS | Zero provider imports in room-runtime |
| AC-04 | T-017 RoomAuthorityState source unchanged | PASS | `git diff` shows 0 changes to `room-state.ts` |
| AC-05 | T-017 GameplayActionEnvelope source unchanged | PASS | `git diff` shows 0 changes to `gameplay-protocol.ts` |
| AC-06 | Existing T-017 tests remain unchanged | PASS | Existing tests untouched and passing |
| AC-07 | New API exported from room-runtime index.ts | PASS | Exported via `index.ts` |
| AC-08 | Processed-action retry-safety registry exists | PASS | `ProcessedGameplayActionRegistry` implemented |
| AC-09 | Fresh registry construction independently allocated | PASS | `createProcessedGameplayActionRegistry()` returns new object |
| AC-10 | Registry prototype-safe for opaque actionIds | PASS | `Object.getPrototypeOf(reg) === null` maintained |
| AC-11 | `__proto__` actionId safely recordable/looked-up | PASS | Verified in `gameplay-admission.test.ts` |
| AC-12 | `constructor` actionId safely recordable/looked-up | PASS | Verified in `gameplay-admission.test.ts` |
| AC-13 | Processed records contain request snapshot | PASS | Stores actionId, expectedRevision, turnId, actionType, payload |
| AC-14 | Processed records contain resultingRevision | PASS | Verified `resultingRevision` field |
| AC-15 | Records do not contain server hidden state | PASS | Only public request fields & resultingRevision stored |
| AC-16 | Stored PLAY cardIds detached from source array | PASS | Array shallow copy performed on record creation |
| AC-17 | Unseen exact revision/turn MATCH_ACTIVE is ACCEPT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-18 | Exact previously successful request is DUPLICATE | PASS | Verified in `gameplay-admission.test.ts` |
| AC-19 | DUPLICATE decided before stale revision evaluation | PASS | Step 1 duplicate check returns before revision check |
| AC-20 | DUPLICATE decided before current-turn evaluation | PASS | Step 1 duplicate check returns before turn check |
| AC-21 | Exact retry remains DUPLICATE after revision advances | PASS | Tested at revision 11 vs expectedRevision 7 |
| AC-22 | Exact retry remains DUPLICATE after turn changes | PASS | Tested at turn-10 vs turn-7 |
| AC-23 | Same actionId with different expectedRevision is ACTION_ID_CONFLICT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-24 | Same actionId with different turnId is ACTION_ID_CONFLICT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-25 | Same actionId with different actionType is ACTION_ID_CONFLICT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-26 | Same actionId with different PLAY cardIds is ACTION_ID_CONFLICT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-27 | Same actionId PLAY cardIds with different ordering is ACTION_ID_CONFLICT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-28 | ACTION_ID_CONFLICT is never converted to ACCEPT | PASS | Rejection returned immediately |
| AC-29 | ACTION_ID_CONFLICT checked before revision/turn admission | PASS | Step 1 conflict check precedes Steps 2-4 |
| AC-30 | Unseen lower expectedRevision is STALE_REVISION | PASS | Verified in `gameplay-admission.test.ts` |
| AC-31 | Unseen higher expectedRevision is STALE_REVISION | PASS | Verified in `gameplay-admission.test.ts` |
| AC-32 | Revision mismatch never returns ACCEPT | PASS | Returns STALE_REVISION |
| AC-33 | With matching revision, LOBBY rejects MATCH_NOT_ACTIVE | PASS | Verified in `gameplay-admission.test.ts` |
| AC-34 | With matching revision, PAUSED rejects MATCH_NOT_ACTIVE | PASS | Verified in `gameplay-admission.test.ts` |
| AC-35 | With matching revision, FINISHED rejects MATCH_NOT_ACTIVE | PASS | Verified in `gameplay-admission.test.ts` |
| AC-36 | With matching revision, ABANDONED rejects MATCH_NOT_ACTIVE | PASS | Verified in `gameplay-admission.test.ts` |
| AC-37 | With matching revision & MATCH_ACTIVE, null turnId rejects TURN_MISMATCH | PASS | Verified in `gameplay-admission.test.ts` |
| AC-38 | With matching revision & MATCH_ACTIVE, wrong turnId rejects TURN_MISMATCH | PASS | Verified in `gameplay-admission.test.ts` |
| AC-39 | Only unseen exact-revision exact-turn MATCH_ACTIVE reaches ACCEPT | PASS | Verified in `gameplay-admission.test.ts` |
| AC-40 | Admission evaluation does not mutate RoomAuthorityState | PASS | Inputs remain 100% frozen/unmodified |
| AC-41 | Admission evaluation does not mutate envelope | PASS | Input envelope remains unmodified |
| AC-42 | Admission evaluation does not mutate registry | PASS | Registry remains unmodified |
| AC-43 | `nextRoomRevision(0)` = 1 | PASS | Verified |
| AC-44 | `nextRoomRevision(n)` = n + 1 for safe integers | PASS | Verified |
| AC-45 | Negative revision input rejected | PASS | Throws error |
| AC-46 | Non-integer revision input rejected | PASS | Throws error |
| AC-47 | Non-safe revision input rejected | PASS | Throws error |
| AC-48 | Number.MAX_SAFE_INTEGER cannot be incremented | PASS | Throws error |
| AC-49 | Successful recording requires resultingRevision = expectedRevision + 1 | PASS | Enforced |
| AC-50 | Successful recording rejects any other resultingRevision | PASS | Throws error |
| AC-51 | Successful recording returns immutable fresh update | PASS | Original registry untouched, new null-prototype returned |
| AC-52 | Original registry unchanged after new successful record | PASS | Verified in `gameplay-admission.test.ts` |
| AC-53 | Original envelope unchanged after recording | PASS | Verified in `gameplay-admission.test.ts` |
| AC-54 | Recording preserves null-prototype safety | PASS | `Object.getPrototypeOf(reg) === null` |
| AC-55 | Re-recording exact same successful request/result is idempotent | PASS | No-op return |
| AC-56 | Re-recording same actionId with different request rejected as conflict | PASS | Throws error |
| AC-57 | Re-recording same actionId with different resultingRevision rejected | PASS | Throws error |
| AC-58 | Rejected admission never creates a processed-action record | PASS | Evaluator is pure read-only function |
| AC-59 | No RoomAuthorityState revision mutation during admission evaluation | PASS | Verified |
| AC-60 | No Game Core command is dispatched | PASS | Pure admission layer only |
| AC-61 | No actor/membership/card-ownership/legal-action authorization claimed | PASS | Authority checks remain explicitly deferred |
| AC-62 | No Durable Object/WebSocket/SQLite implementation introduced | PASS | Scope boundary maintained |
| AC-63 | No deadline/alarm/presence/Pause/Resume implementation introduced | PASS | Scope boundary maintained |
| AC-64 | No Telegram authentication introduced | PASS | Scope boundary maintained |
| AC-65 | No recipient projection or T27 implementation claimed | PASS | Scope boundary maintained |
| AC-66 | No forbidden nondeterminism used | PASS | Zero Date.now(), Math.random(), crypto |
| AC-67 | game-core source and tests remain unchanged | PASS | 0 changes to game-core |
| AC-68 | package.json remains unchanged | PASS | 0 changes to package.json |
| AC-69 | package-lock.json remains unchanged | PASS | 0 changes to package-lock.json |
| AC-70 | `npm ci` passes with zero unexpected tracked-file impact | PASS | Clean workspace |
| AC-71 | `npm run typecheck` passes | PASS | All configured workspaces pass |
| AC-72 | `npm test` passes | PASS | 304 tests passed across 19 test files |
| AC-73 | room-runtime direct typecheck passes | PASS | `tsc --noEmit` PASS |
| AC-74 | room-runtime direct tests pass | PASS | 53 tests / 3 files PASS |
| AC-75 | game-core direct typecheck/tests pass | PASS | 251 tests / 16 files PASS |
| AC-76 | Evidence maps all ACs and duplicate-before-stale ordering proof | PASS | Complete Evidence document |
| AC-77 | Evidence states persistence/concurrency/Core dispatch/auth deferred | PASS | Section 5 explicitly details deferred items |
| AC-78 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Status `IMPLEMENTED` |

---

## 4. Verification Results

### `npm ci`
- Exit code: 0
- Tracked file impact: clean

### `npm run typecheck`
- `@liars-telegram-game/game-core`: PASS
- `@liars-telegram-game/room-runtime`: PASS
- Exit code: 0

### `npm test`
- Total Test Files: 19 passed (19)
- Total Tests: 304 passed (304)
  - `game-core`: 16 test files / 251 tests PASS
  - `room-runtime`: 3 test files / 53 tests PASS (7 room-state, 16 gameplay-protocol, 30 gameplay-admission)
- Exit code: 0

---

## 5. Explicitly Deferred Scope

The following behaviors remain explicitly deferred and are NOT claimed by this task:
- Persistence (SQLite / Durable Object storage)
- Durable Objects runtime bindings & HTTP/WebSocket routing
- Actual concurrent request serialization primitives
- Game Core command dispatch (`applyPlayCardsCommand` / `applyCallLiar`)
- Authenticated actor resolution
- Membership validation
- Current-player actor authorization
- Card ownership validation
- Core legal-action validation
- Alarm / deadline handling
- Presence tracking / Pause & Resume flow
- Telegram authentication
- Recipient-specific state projections / T27
