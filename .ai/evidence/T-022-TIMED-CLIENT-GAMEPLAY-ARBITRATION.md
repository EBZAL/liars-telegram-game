# Evidence: T-022-TIMED-CLIENT-GAMEPLAY-ARBITRATION

## Task Identity & Git Commit Chain
- **Task ID**: `T-022-TIMED-CLIENT-GAMEPLAY-ARBITRATION`
- **Task-Start Commit**: `8c45e088c1745bde40e754d1133c5a137d15b0d2`
- **Authoritative Implementation Commit**: `0ab99f6423216a3214d9628a7ba89ab7de820685`
- **Evidence/State Before Metadata Reconciliation**: `f86601c5f76b8c8513ffbcb0b707a907ad3b157d`

---

## Technical Summary & Architecture

### 1. Timed Client Gameplay Transaction Boundary
`packages/room-runtime/src/timed-gameplay-transaction.ts` implements the provider-independent timed client gameplay arbitration boundary `executeTimedClientGameplayTransaction`.

It cleanly composes:
- **T-019**: Server actor authorization & idempotency via `evaluateServerGameplayActionRequest`
- **T-021**: Authoritative turn deadline due state evaluation via `evaluateTurnDeadlineDueState`
- **T-020**: Authoritative client gameplay commit primitive via `executeClientGameplayTransaction`
- **T-021**: Active turn deadline arming via `armActiveTurnDeadline` for continuing matches

### 2. Mandatory Evaluation Ordering
The ordering guarantees correctness, privacy, and exact idempotency semantics:
1. **Preflight Authorization & Dedupe**: Evaluates `evaluateServerGameplayActionRequest(roomState, envelope, processedRegistry, actor)` against the unmodified original Room state.
2. **DUPLICATE Precedence**: If `DUPLICATE`, returns immediately with `priorResultingRevision`. Zero deadline check, zero `preparedNextTurn` validation, zero Core dispatch, zero `RandomSource` consumption.
3. **REJECT Precedence**: If `REJECT`, returns immediately with exact `reason` (e.g. `ACTOR_NOT_MEMBER`, `ACTION_ID_CONFLICT`, `STALE_REVISION`, `ACTOR_NOT_CURRENT_PLAYER`, `ACTION_NOT_ALLOWED`, `INVALID_PLAY_SELECTION`). Zero deadline side effect, zero timeout trigger.
4. **Authoritative Turn Deadline Evaluation**: Evaluated only after T-019 `ACCEPT` using `evaluateTurnDeadlineDueState(roomState, authoritativeNowMs)`.
5. **DEADLINE_DUE Boundary**:
   - If `authoritativeNowMs >= currentTurnDeadline` (status `DUE`), returns `{ decision: 'DEADLINE_DUE' }`.
   - Zero Core dispatch, zero Room revision change, zero processed records, zero `currentTurnId` rotation, zero `RandomSource` consumption, zero prepared next turn validation.
   - Old deadline and old activeAlarm remain untouched.
6. **Timing Coherence Check**: If `INVALID_STATE` or `NOT_APPLICABLE` occurs after `ACCEPT`, fails closed deterministically with an invariant error before T-020 dispatch.
7. **T-020 Transaction Dispatch**: If timing status is `NOT_DUE` (`authoritativeNowMs < currentTurnDeadline`), dispatches to `executeClientGameplayTransaction`.
8. **Next Turn Deadline Arming**:
   - If T-020 returns `COMMITTED` and Match continues (`lifecycle === 'MATCH_ACTIVE'`), arms the new active turn using `armActiveTurnDeadline(txResult.roomState, authoritativeNowMs)` starting from the server transaction time `authoritativeNowMs + 30000`.
   - If Match finishes (`lifecycle === 'MATCH_FINISHED'`), returns T-020 finished state unchanged (no next deadline, no `activeAlarm`, `currentTurnId = null`).
   - Arming adds zero extra revisions (one accepted client command = exactly one Room revision increment).

---

## Authority Rule & Deadline Boundary Verification

### Exact Boundary:
- `now < deadline` (`deadline - 1ms`): Client command commits normally -> `COMMITTED`.
- `now == deadline` (`exact deadline`): Client command loses authority -> `DEADLINE_DUE`.
- `now > deadline` (`deadline + 1ms`): Client command loses authority -> `DEADLINE_DUE`.

### Meaning of DEADLINE_DUE:
`DEADLINE_DUE` explicitly means:
> **"The client lost authority for this turn because the authoritative turn deadline has been reached."**

`DEADLINE_DUE` does **NOT** mean:
> *"SYSTEM_TIMEOUT has already committed."*

`DEADLINE_DUE` performs **zero** mutation to Room state, creates **no** processed records, selects **no** timeout card, and consumes **zero** randomness. Execution of `SYSTEM_TIMEOUT` against the due alarm remains explicitly deferred to a future bounded task.

---

## Mandatory Scenario Verification

| Scenario | Description | Outcome | Evidence |
|---|---|---|---|
| **SCENARIO A** | Valid `PLAY_CARDS` before deadline (`now = 30999`, `deadline = 31000`) | `COMMITTED` | Revision `0 -> 1`, 1 processed record, next turn armed with `dueAt = 60999`, `generation = 1` |
| **SCENARIO B** | Same valid `PLAY_CARDS` at exact deadline (`now = 31000`, `deadline = 31000`) | `DEADLINE_DUE` | Zero Room mutation, zero registry mutation, zero `RandomSource` consumption |
| **SCENARIO C** | Same valid `PLAY_CARDS` after deadline (`now = 31001`, `deadline = 31000`) | `DEADLINE_DUE` | Zero Room mutation, zero registry mutation, zero `RandomSource` consumption |
| **SCENARIO D** | Exact retry of previously committed actionId after deadline | `DUPLICATE` | Returns `priorResultingRevision = 1`, not `DEADLINE_DUE`; zero random consumption |
| **SCENARIO E** | Non-member request after deadline | `REJECT` (`ACTOR_NOT_MEMBER`) | Authorization precedes deadline check; privacy preserved |
| **SCENARIO F** | Cross-actor actionId collision after deadline | `REJECT` (`ACTION_ID_CONFLICT`) | Conflict precedes deadline check |
| **SCENARIO G** | Legal `CALL_LIAR` before deadline | `COMMITTED` | Revision `1 -> 2`, 1 processed record, next turn armed at server time + 30s |
| **SCENARIO H** | Match-finishing command before deadline | `COMMITTED` | `MATCH_FINISHED`, `winnerId` set, `currentTurnId = null`, `deadline = null`, `activeAlarm = null`, not re-armed |
| **SCENARIO I** | Incoherent active timing state (e.g. alarm generation mismatch) | Fail Closed | Deterministic invariant error thrown before T-020 dispatch |

---

## Verification & Test Results

### Full Regression Test Suite
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS
- **Total Project Tests**: 386 passed across 23 test files
  - `game-core`: 251 tests / 16 test files (100% UNCHANGED)
  - `room-runtime`: 135 tests / 7 test files (17 timed-transaction tests + 22 turn-deadline tests + 16 transaction tests + 37 admission tests + 20 authorization tests + 16 protocol tests + 7 room-state tests)
- Direct `room-runtime` typecheck & vitest run from clean dist state: PASS
- Direct `game-core` typecheck & vitest run: PASS

### Package & File Delta
- Package changes: 0
- Package-lock changes: 0
- External dependency changes: 0
- Game-core source changes: 0
- Game-core test changes: 0
- Existing room-runtime source modifications: 1 file (`packages/room-runtime/src/index.ts` to export timed transaction module)
- Existing room-runtime test modifications: 0

---

## Acceptance Criteria Mapping (AC-01 .. AC-118)

| AC ID | Requirement | Status | Verification Evidence |
|---|---|---|---|
| AC-01 | Dedicated timed client gameplay transaction module exists | PASS | `packages/room-runtime/src/timed-gameplay-transaction.ts` created |
| AC-02 | Public timed API exported from room-runtime | PASS | `executeTimedClientGameplayTransaction` exported in `index.ts` |
| AC-03 | Existing executeClientGameplayTransaction remains exported | PASS | Re-exported and unchanged |
| AC-04 | Existing T-020 source remains unchanged | PASS | `gameplay-transaction.ts` untouched |
| AC-05 | Existing T-021 source remains unchanged | PASS | `turn-deadline.ts` untouched |
| AC-06 | GameplayActionEnvelope remains unchanged | PASS | `gameplay-protocol.ts` untouched |
| AC-07 | No SYSTEM_TIMEOUT client action type added | PASS | Envelope types unchanged |
| AC-08 | No client timestamp field added | PASS | Client envelope has no timestamp |
| AC-09 | authoritativeNowMs remains server-only input | PASS | Parameter to `executeTimedClientGameplayTransaction` |
| AC-10 | Timed API delegates initial request evaluation to evaluateServerGameplayActionRequest | PASS | Step 1 delegates directly |
| AC-11 | Authorization rules are not manually reimplemented | PASS | Full delegation to T-019 |
| AC-12 | DUPLICATE is returned before deadline evaluation | PASS | Step 2 returns before deadline check |
| AC-13 | Exact retry after deadline remains DUPLICATE | PASS | Verified in test suite (SCENARIO D) |
| AC-14 | Exact retry after turn/revision advance remains DUPLICATE | PASS | Verified in test suite |
| AC-15 | DUPLICATE preserves priorResultingRevision | PASS | Verified in test suite |
| AC-16 | DUPLICATE performs no Core dispatch | PASS | Verified in test suite |
| AC-17 | DUPLICATE consumes no RandomSource | PASS | Verified with `ThrowingRandomSource` |
| AC-18 | DUPLICATE does not validate preparedNextTurn | PASS | Verified with invalid `preparedNextTurn` |
| AC-19 | REJECT is returned before deadline arbitration | PASS | Step 3 returns before deadline check |
| AC-20 | REJECT preserves exact T-019 reason | PASS | Reason returned verbatim |
| AC-21 | Non-member after deadline remains ACTOR_NOT_MEMBER | PASS | Verified in test suite (SCENARIO E) |
| AC-22 | Cross-actor actionId collision after deadline remains ACTION_ID_CONFLICT | PASS | Verified in test suite (SCENARIO F) |
| AC-23 | Rejected traffic does not trigger timeout | PASS | Pure rejection, zero side effects |
| AC-24 | Rejected traffic does not mutate Room state | PASS | Verified in immutability tests |
| AC-25 | Rejected traffic does not consume RandomSource | PASS | Verified with `ThrowingRandomSource` |
| AC-26 | Only previously unseen T-019 ACCEPTed action reaches deadline evaluation | PASS | Step 4 reached only on `ACCEPT` |
| AC-27 | Deadline evaluation delegates to evaluateTurnDeadlineDueState | PASS | Step 4 delegates directly |
| AC-28 | Valid accepted command at deadline - 1 may commit | PASS | Verified in test suite (SCENARIO A) |
| AC-29 | Valid accepted command at exact deadline returns DEADLINE_DUE | PASS | Verified in test suite (SCENARIO B) |
| AC-30 | Valid accepted command after deadline returns DEADLINE_DUE | PASS | Verified in test suite (SCENARIO C) |
| AC-31 | DEADLINE_DUE causes zero Core dispatch | PASS | Verified in test suite |
| AC-32 | DEADLINE_DUE causes zero Room revision change | PASS | Verified in test suite |
| AC-33 | DEADLINE_DUE creates zero processed action records | PASS | Verified in test suite |
| AC-34 | DEADLINE_DUE does not rotate currentTurnId | PASS | Verified in test suite |
| AC-35 | DEADLINE_DUE consumes zero RandomSource | PASS | Verified with `ThrowingRandomSource` |
| AC-36 | DEADLINE_DUE does not require valid preparedNextTurn | PASS | Verified in test suite |
| AC-37 | DEADLINE_DUE does not clear old deadline | PASS | Verified in test suite |
| AC-38 | DEADLINE_DUE does not clear old activeAlarm | PASS | Verified in test suite |
| AC-39 | DEADLINE_DUE explicitly means client lost authority, not timeout committed | PASS | Documented and verified |
| AC-40 | Timing INVALID_STATE fails closed before T-020 dispatch | PASS | Verified in test suite (SCENARIO I) |
| AC-41 | Timing NOT_APPLICABLE after T-019 ACCEPT fails closed as invariant error | PASS | Verified in test suite |
| AC-42 | NOT_DUE accepted command delegates mutation to executeClientGameplayTransaction | PASS | Step 6 delegates directly |
| AC-43 | Timed layer does not manually reproduce Core PLAY rules | PASS | Pure composition |
| AC-44 | Timed layer does not manually reproduce CALL rules | PASS | Pure composition |
| AC-45 | Ordinary PLAY before deadline reaches COMMITTED | PASS | Verified in test suite |
| AC-46 | Legal CALL before deadline reaches COMMITTED | PASS | Verified in test suite (SCENARIO G) |
| AC-47 | Before-deadline COMMITTED Room revision = old revision + 1 | PASS | Verified in test suite |
| AC-48 | Processed record resultingRevision = new Room revision | PASS | Verified in test suite |
| AC-49 | Exactly one processed client action record is added | PASS | Verified in test suite |
| AC-50 | Continuing COMMITTED result is armed using armActiveTurnDeadline | PASS | Step 8 arms continuing result |
| AC-51 | New deadline = authoritativeNowMs + 30000 | PASS | Verified in test suite |
| AC-52 | New activeAlarm.kind = TURN_DEADLINE | PASS | Verified in test suite |
| AC-53 | New activeAlarm.dueAt = new currentTurnDeadline | PASS | Verified in test suite |
| AC-54 | New activeAlarm.generation = resultingRevision | PASS | Verified in test suite |
| AC-55 | Arming next turn adds zero extra revision | PASS | Arming retains `resultingRevision` |
| AC-56 | One accepted client command remains exactly one Room revision increment | PASS | Verified across all committed flows |
| AC-57 | Old consumed deadline is not preserved after COMMITTED | PASS | Replaced with new deadline |
| AC-58 | Old consumed activeAlarm is not preserved after COMMITTED | PASS | Replaced with new alarm |
| AC-59 | New currentTurnId is T-020 prepared next turn ID | PASS | Verified in test suite |
| AC-60 | New deadline uses server transaction time, not old deadline | PASS | `authoritativeNowMs + 30000` |
| AC-61 | No oldDeadline + 30000 calculation | PASS | Verified in test suite |
| AC-62 | Match-finished T-020 result is not re-armed | PASS | Step 7 skips arming for `MATCH_FINISHED` |
| AC-63 | Finished lifecycle remains MATCH_FINISHED | PASS | Verified in test suite (SCENARIO H) |
| AC-64 | Finished currentTurnId remains null | PASS | Verified in test suite (SCENARIO H) |
| AC-65 | Finished currentTurnDeadline remains null | PASS | Verified in test suite (SCENARIO H) |
| AC-66 | Finished activeAlarm remains null | PASS | Verified in test suite (SCENARIO H) |
| AC-67 | Unexpected T-020 REJECT after preflight ACCEPT fails closed | PASS | Invariant error thrown |
| AC-68 | Unexpected T-020 DUPLICATE after preflight ACCEPT fails closed | PASS | Invariant error thrown |
| AC-69 | No SYSTEM_TIMEOUT Core API is called | PASS | Verified 0 timeout imports/calls |
| AC-70 | No timeout Card is selected | PASS | No timeout selection |
| AC-71 | No synthetic system actionId exists | PASS | Zero synthetic actions |
| AC-72 | No system processed record exists | PASS | Zero system records |
| AC-73 | No provider alarm API is called | PASS | Provider-independent |
| AC-74 | No Durable Object is implemented | PASS | Deferred |
| AC-75 | No SQLite/persistence is implemented | PASS | Deferred |
| AC-76 | No actual concurrency serialization is implemented | PASS | Deferred |
| AC-77 | No presence accounting is implemented | PASS | Deferred |
| AC-78 | No Pause/Resume is implemented | PASS | Deferred |
| AC-79 | No Telegram auth/session work is implemented | PASS | Deferred |
| AC-80 | No projection/T27 implementation is claimed | PASS | Deferred |
| AC-81 | REJECT path does not mutate inputs | PASS | Verified in purity tests |
| AC-82 | DUPLICATE path does not mutate inputs | PASS | Verified in purity tests |
| AC-83 | DEADLINE_DUE path does not mutate inputs | PASS | Verified in purity tests |
| AC-84 | TIMING_INVALID_STATE path does not mutate inputs | PASS | Verified in purity tests |
| AC-85 | COMMITTED preserves T-020/T-021 immutability | PASS | Verified in purity tests |
| AC-86 | No hidden Card rank/value metadata added to result | PASS | Internal server state only |
| AC-87 | COMMITTED Room state documented as internal server state, not safe broadcast | PASS | Documented |
| AC-88 | No Date.now introduced | PASS | Clean of `Date.now` |
| AC-89 | No performance.now introduced | PASS | Clean of `performance.now` |
| AC-90 | No Math.random introduced | PASS | Clean of `Math.random` |
| AC-91 | No crypto entropy introduced | PASS | Clean of `crypto` |
| AC-92 | Only supplied gameplay RandomSource reaches T-020/Core | PASS | Verified |
| AC-93 | T-017 regression remains PASS | PASS | 16 tests PASS |
| AC-94 | T-018 regression remains PASS | PASS | 37 tests PASS |
| AC-95 | T-019 regression remains PASS | PASS | 20 tests PASS |
| AC-96 | T-020 regression remains PASS | PASS | 16 tests PASS |
| AC-97 | T-021 regression remains PASS | PASS | 22 tests PASS |
| AC-98 | No game-core source changes | PASS | 0 changes |
| AC-99 | No game-core test changes | PASS | 0 changes |
| AC-100 | No package changes | PASS | 0 changes |
| AC-101 | No package-lock changes | PASS | 0 changes |
| AC-102 | No external dependencies | PASS | 0 changes |
| AC-103 | npm ci passes | PASS | Verified |
| AC-104 | npm run typecheck passes | PASS | 0 TypeScript errors |
| AC-105 | npm test passes | PASS | 386 tests pass |
| AC-106 | room-runtime direct typecheck passes | PASS | Workspace typecheck passes |
| AC-107 | room-runtime direct tests pass | PASS | 135 tests pass |
| AC-108 | game-core direct typecheck/tests pass unchanged | PASS | 251 tests pass |
| AC-109 | Evidence maps AC-01 through AC-108 | PASS | Mapped in matrix |
| AC-110 | Evidence proves exact deadline boundary | PASS | `-1ms COMMITTED`, `exact DEADLINE_DUE`, `+1ms DEADLINE_DUE` |
| AC-111 | Evidence proves duplicate-after-deadline remains DUPLICATE | PASS | Verified in SCENARIO D |
| AC-112 | Evidence proves unauthorized-after-deadline remains authorization REJECT | PASS | Verified in SCENARIO E, F |
| AC-113 | Evidence proves DEADLINE_DUE zero mutation/zero RNG | PASS | Verified in SCENARIO B, C |
| AC-114 | Evidence proves continuing client commit receives new 30-second armed deadline at same resulting revision | PASS | Verified in SCENARIO A, G |
| AC-115 | Evidence explicitly states SYSTEM_TIMEOUT execution remains deferred | PASS | Stated in Evidence |
| AC-116 | Evidence explicitly states provider alarm execution remains deferred | PASS | Stated in Evidence |
| AC-117 | Evidence distinguishes client deadline arbitration from system timeout mutation | PASS | Stated in Evidence |
| AC-118 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Task status `IMPLEMENTED` |

---

## Explicitly Deferred Scope
- `SYSTEM_TIMEOUT` execution & Room timeout orchestration
- Provider alarm scheduling (`storage.setAlarm`) and Durable Object alarm handler
- Durable persistence (SQLite / transactional storage)
- Actual concurrency serialization
- Presence accounting / Pause / Resume
- WebSocket realtime networking & transport
- Telegram `initData` validation & session auth
- Recipient-specific state projections & T27 dead-spectator security

---

## Final Status
Task `T-022-TIMED-CLIENT-GAMEPLAY-ARBITRATION` is **IMPLEMENTED**. Ready for independent Architect verification.
