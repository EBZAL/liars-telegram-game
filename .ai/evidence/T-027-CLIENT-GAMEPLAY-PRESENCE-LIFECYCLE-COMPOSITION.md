# Evidence: T-027-CLIENT-GAMEPLAY-PRESENCE-LIFECYCLE-COMPOSITION

## Task Identity & Git Commit Chain
- **Task ID**: `T-027-CLIENT-GAMEPLAY-PRESENCE-LIFECYCLE-COMPOSITION`
- **Task-Start Commit**: `27b6f27b9525287f3408a28f731a57e3c1a329d4`
- **Authoritative Implementation Commit**: `50a9480fd9185460d47991859bd7ea906176ec75`

---

## Executive Summary
Task `T-027-CLIENT-GAMEPLAY-PRESENCE-LIFECYCLE-COMPOSITION` establishes the provider-independent authoritative composition layer (`executeTimedClientGameplayWithPresenceLifecycle`) that executes verified T-022 timed client gameplay and, only after a successful continuing gameplay commit, reconciles the resulting Match using verified T-025 zero-Living Pause semantics.

Crucially, this task establishes the exact authoritative client retry / revision contract when a successful client gameplay action is immediately followed by a separate `ACTIVE \to PAUSED` lifecycle transition:
1. **Historical Action Revision vs Final Room Revision**:
   - Initial Room revision: $N$
   - Client action commit: $N \to N+1$ (`actionResultingRevision = N+1`)
   - `ProcessedGameplayActionRecord.resultingRevision` = $N+1$
   - Subsequent zero-Living Pause transition: $N+1 \to N+2$ (`finalResultingRevision = N+2`)
   - **Critical Invariant**: The processed action record **remains $N+1$** and is never rewritten to $N+2$.
   - `priorResultingRevision` on an exact duplicate retry represents "the revision produced by that already-successful client action", **not** the Room's current revision.
2. **Strict Composition Precedence & Ordering**:
   - Step 1: `executeTimedClientGameplayTransaction` is invoked exactly once.
   - Step 2: Non-`COMMITTED` outcomes (`REJECT`, `DUPLICATE`, `DEADLINE_DUE`) pass through immediately without invoking Pause, creating lifecycle revisions, mutating registries, or consuming RNG.
   - Step 3: `MATCH_FINISHED` has absolute precedence: returns `COMMITTED_FINISHED` immediately ($N \to N+1$, winner preserved, deadline/alarm null, zero Pause invocation).
   - Step 4: Continuing `MATCH_ACTIVE`: delegates presence reconciliation to verified `pauseActiveMatchForNoLivingConnections`.
   - Step 5: `NO_CHANGE` $\to$ `COMMITTED_ACTIVE` (1 revision increment $N \to N+1$, +30000 armed deadline, alarm generation $N+1$); `PAUSED` $\to$ `COMMITTED_PAUSED` (2 revision increments: gameplay revision $N+1$, pause revision $N+2$, deadline/alarm null, prepared next turn ID preserved).
3. **Idempotency & Replay Survival**:
   - Replaying the exact envelope against the paused Room ($N+2$) returns `DUPLICATE` with `priorResultingRevision = N+1`, consuming zero Core, zero RNG, and zero revisions.
   - Replaying after a later Resume ($N+3$) still returns `DUPLICATE` with `priorResultingRevision = N+1`.
   - Modifying any request field under the same `actionId` against the paused Room returns `ACTION_ID_CONFLICT` preceding stale revision or paused lifecycle checks.
   - Unseen actions against the paused Room correctly reject as `STALE_REVISION` (if `expectedRevision = N+1`) or `MATCH_NOT_ACTIVE` (if `expectedRevision = N+2`).

---

## Architectural & Security Distinctions
- **client action revision != later lifecycle revision**: The client action advanced the state from $N \to N+1$; the subsequent lifecycle transition advanced from $N+1 \to N+2$.
- **historical duplicate revision != current authoritative Room revision**: `priorResultingRevision` reflects the historical revision at which the action executed ($N+1$). Current Room revision ($N+2$, $N+3$, etc.) is obtained through authoritative Room state synchronization, not duplicate metadata.
- **processed action record != Room snapshot**: `ProcessedGameplayActionRecord` stores immutable evidence of client command admission and resulting revision.
- **idempotent retry metadata != resync transport**: Duplicate acknowledgements allow clients to safely verify command execution without acting as a state synchronization mechanism.
- **intermediate activeAlarm metadata != provider scheduling**: Intermediate alarm metadata generated at $N+1$ during T-022 is cleared by Pause at $N+2$ and is never provider-scheduled.
- **pure composed state != durable atomic transaction**: In-memory state transformations are verified without claiming database persistence atomicity.

---

## Acceptance Criteria Mapping (AC-01 through AC-166)

| AC | Description | Status | Verification / Proof |
|---|---|---|---|
| AC-01 | Dedicated provider-independent client gameplay/presence composition module exists | PASS | Implemented in `packages/room-runtime/src/timed-gameplay-presence-lifecycle.ts` |
| AC-02 | API exported from room-runtime | PASS | Exported in `packages/room-runtime/src/index.ts` |
| AC-03 | T-022 called exactly once per execution | PASS | Called in Step 1 of `executeTimedClientGameplayWithPresenceLifecycle` |
| AC-04 | No duplicated authorization logic | PASS | Fully delegated to T-022 (`evaluateServerGameplayActionRequest`) |
| AC-05 | No duplicated admission logic | PASS | Fully delegated to T-022 / T-018 |
| AC-06 | No duplicated deadline logic | PASS | Fully delegated to T-022 (`evaluateTurnDeadlineDueState`) |
| AC-07 | No duplicated Core gameplay dispatch | PASS | Fully delegated to T-022 (`executeClientGameplayTransaction`) |
| AC-08 | No duplicated Living-count logic | PASS | Fully delegated to T-025 / T-024 (`evaluateRoomPresence`) |
| AC-09 | No manual Pause implementation | PASS | Fully delegated to `pauseActiveMatchForNoLivingConnections` |
| AC-10 | REJECT passes through exact reason | PASS | Verified in Rejection Pass-Through tests (e.g. `ACTOR_NOT_CURRENT_PLAYER`, `ACTOR_NOT_MEMBER`) |
| AC-11 | DUPLICATE passes through priorResultingRevision | PASS | Verified in Mandatory Direct Tests C, D, J |
| AC-12 | DEADLINE_DUE passes through | PASS | Verified in Mandatory Direct Test I |
| AC-13 | Non-COMMITTED outcomes do not invoke Pause | PASS | Verified in Mandatory Direct Tests C, D, I, and Rejection tests |
| AC-14 | Non-COMMITTED outcomes add zero revision | PASS | Verified in Tests C, D, I, and Rejection tests |
| AC-15 | Non-COMMITTED outcomes add zero RNG | PASS | Verified via `ThrowingRandomSource` in Tests C, D, I, and Rejection tests |
| AC-16 | Non-COMMITTED outcomes do not mutate registry | PASS | Verified in Tests C, D, I, and Rejection tests |
| AC-17 | T-022 COMMITTED MATCH_FINISHED has absolute precedence | PASS | Verified in Mandatory Direct Test H |
| AC-18 | FINISHED does not invoke Pause | PASS | Verified in Mandatory Direct Test H (Pause bypassed) |
| AC-19 | FINISHED remains MATCH_FINISHED | PASS | Verified in Mandatory Direct Test H |
| AC-20 | FINISHED winner preserved | PASS | Verified in Mandatory Direct Test H (`winnerId: 'p1'`) |
| AC-21 | FINISHED currentTurnId null | PASS | Verified in Mandatory Direct Test H |
| AC-22 | FINISHED deadline null | PASS | Verified in Mandatory Direct Test H |
| AC-23 | FINISHED alarm null | PASS | Verified in Mandatory Direct Test H |
| AC-24 | FINISHED actionResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test H (8 -> 9) |
| AC-25 | FINISHED finalResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test H (8 -> 9) |
| AC-26 | FINISHED processed record resultingRevision = N+1 | PASS | Verified in Mandatory Direct Test H (`resultingRevision: 9`) |
| AC-27 | Continuing T-022 COMMITTED delegates to T-025 | PASS | Verified in Mandatory Direct Tests A, B |
| AC-28 | T-025 NO_CHANGE maps COMMITTED_ACTIVE | PASS | Verified in Mandatory Direct Test A |
| AC-29 | ACTIVE actionResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test A (8 -> 9) |
| AC-30 | ACTIVE finalResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test A (8 -> 9) |
| AC-31 | ACTIVE Room revision = N+1 | PASS | Verified in Mandatory Direct Test A (`revision: 9`) |
| AC-32 | ACTIVE processed record resultingRevision = N+1 | PASS | Verified in Mandatory Direct Test A (`resultingRevision: 9`) |
| AC-33 | ACTIVE next turnId preserved | PASS | Verified in Mandatory Direct Test A (`'turn-9'`) |
| AC-34 | ACTIVE +30000 deadline preserved | PASS | Verified in Mandatory Direct Test A (`32000`) |
| AC-35 | ACTIVE alarm generation = N+1 | PASS | Verified in Mandatory Direct Test A (`generation: 9`) |
| AC-36 | ACTIVE adds zero lifecycle revision | PASS | Verified in Mandatory Direct Test A |
| AC-37 | T-025 PAUSED maps COMMITTED_PAUSED | PASS | Verified in Mandatory Direct Test B |
| AC-38 | PAUSED actionResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test B (`actionResultingRevision: 9`) |
| AC-39 | PAUSED finalResultingRevision = N+2 | PASS | Verified in Mandatory Direct Test B (`finalResultingRevision: 10`) |
| AC-40 | PAUSED Room revision = N+2 | PASS | Verified in Mandatory Direct Test B (`revision: 10`) |
| AC-41 | Total initial→paused delta exactly 2 | PASS | Verified in Mandatory Direct Test B (8 -> 10) |
| AC-42 | No third revision | PASS | Verified in Mandatory Direct Test B |
| AC-43 | First revision is client gameplay/Core transition | PASS | Verified in Mandatory Direct Test B (8 -> 9) |
| AC-44 | Second revision is ACTIVE→PAUSED lifecycle transition | PASS | Verified in Mandatory Direct Test B (9 -> 10) |
| AC-45 | PAUSED lifecycle correct | PASS | Verified in Mandatory Direct Test B (`MATCH_PAUSED_NO_LIVING_CONNECTIONS`) |
| AC-46 | PAUSED Match equals T-022 resulting Match | PASS | Verified in Mandatory Direct Test B |
| AC-47 | PAUSED next turnId preserved | PASS | Verified in Mandatory Direct Test B (`'turn-9'`) |
| AC-48 | PAUSED deadline null | PASS | Verified in Mandatory Direct Test B |
| AC-49 | PAUSED activeAlarm null | PASS | Verified in Mandatory Direct Test B |
| AC-50 | Intermediate T-022 alarm does not survive Pause | PASS | Verified in Mandatory Direct Test B |
| AC-51 | Intermediate T-022 alarm is not provider-scheduled | PASS | Verified; no provider scheduling logic in T-027 |
| AC-52 | Processed registry returned by T-022 is reused unchanged | PASS | Verified in Mandatory Direct Test B |
| AC-53 | No second recordSuccessfulGameplayAction call | PASS | Verified in implementation code |
| AC-54 | No registry reconstruction after Pause | PASS | Verified in implementation code |
| AC-55 | PAUSED processed record.resultingRevision remains N+1 | PASS | Verified in Mandatory Direct Test B (`resultingRevision: 9`) |
| AC-56 | PAUSED processed record.resultingRevision differs from final N+2 | PASS | Verified in Mandatory Direct Test B (9 != 10) |
| AC-57 | recordSuccessfulGameplayAction invariant expectedRevision+1 remains unchanged | PASS | Untouched in T-018 / runtime |
| AC-58 | Exact retry after PAUSED returns DUPLICATE | PASS | Verified in Mandatory Direct Test C |
| AC-59 | Exact retry after PAUSED priorResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test C (`priorResultingRevision: 9`) |
| AC-60 | Exact retry after PAUSED does not report N+2 as priorResultingRevision | PASS | Verified in Mandatory Direct Test C (reports 9, not 10) |
| AC-61 | Duplicate retry after PAUSE executes zero Core | PASS | Verified in Mandatory Direct Test C |
| AC-62 | Duplicate retry after PAUSE consumes zero RNG | PASS | Verified via `ThrowingRandomSource` in Test C |
| AC-63 | Duplicate retry after PAUSE causes zero Room revision | PASS | Verified in Mandatory Direct Test C |
| AC-64 | Duplicate retry after PAUSE causes zero Pause transition | PASS | Verified in Mandatory Direct Test C |
| AC-65 | Duplicate retry after PAUSE does not reset deadline/alarm | PASS | Verified in Mandatory Direct Test C |
| AC-66 | Duplicate retry after later Resume remains DUPLICATE | PASS | Verified in Mandatory Direct Test D |
| AC-67 | Duplicate retry after Resume still priorResultingRevision = N+1 | PASS | Verified in Mandatory Direct Test D (`priorResultingRevision: 9`) |
| AC-68 | Duplicate retry after Resume causes zero mutation | PASS | Verified in Mandatory Direct Test D |
| AC-69 | Same actionId modified request after PAUSE is ACTION_ID_CONFLICT | PASS | Verified in Mandatory Direct Test E |
| AC-70 | ACTION_ID_CONFLICT precedes stale revision | PASS | Verified in Mandatory Direct Test E |
| AC-71 | ACTION_ID_CONFLICT precedes paused lifecycle rejection | PASS | Verified in Mandatory Direct Test E |
| AC-72 | New actionId expectedRevision=N+1 against final N+2 PAUSED → STALE_REVISION | PASS | Verified in Mandatory Direct Test F |
| AC-73 | New actionId expectedRevision=N+2 against PAUSED → MATCH_NOT_ACTIVE | PASS | Verified in Mandatory Direct Test G |
| AC-74 | Final Room revision remains authoritative independently from historical duplicate revision | PASS | Verified in Mandatory Direct Tests C, F, G |
| AC-75 | Evidence explains priorResultingRevision historical semantics | PASS | Documented in Executive Summary & Distinctions |
| AC-76 | Evidence explains current Room revision must come from authoritative Room state/resync | PASS | Documented in Executive Summary & Distinctions |
| AC-77 | No client resync transport implemented | PASS | Deferred |
| AC-78 | Post-action Core lifeStatus change can alter connectedLivingPlayers with unchanged registry | PASS | Verified in Mandatory Direct Test B |
| AC-79 | Canonical deterministic client action ALIVE→ELIMINATED continuing-Match case covered | PASS | Verified in Mandatory Direct Test B |
| AC-80 | Only connected Living player eliminated case reaches COMMITTED_PAUSED | PASS | Verified in Mandatory Direct Test B |
| AC-81 | Other Living Players remain alive but disconnected | PASS | Verified in Mandatory Direct Test B (p2, p3 alive but disconnected) |
| AC-82 | Presence registry unchanged across gameplay | PASS | Verified in Mandatory Direct Test B |
| AC-83 | Processed action record created exactly once in elimination case | PASS | Verified in Mandatory Direct Test B |
| AC-84 | Eliminated actor/action record remains valid historical record | PASS | Verified in Mandatory Direct Test B |
| AC-85 | Match-finished precedence tested with zero Living connections | PASS | Verified in Mandatory Direct Test H |
| AC-86 | Winner never becomes PAUSED | PASS | Verified in Mandatory Direct Test H |
| AC-87 | Current/acting Player disconnected/eliminated but another Living connected → COMMITTED_ACTIVE | PASS | Verified in Mandatory Direct Test K |
| AC-88 | Pause uses global unique Living semantics | PASS | Verified in Mandatory Direct Test K |
| AC-89 | Exact deadline unseen valid action → DEADLINE_DUE | PASS | Verified in Mandatory Direct Test I |
| AC-90 | After-deadline unseen valid action → DEADLINE_DUE | PASS | Verified in Mandatory Direct Test I & regression suite |
| AC-91 | DEADLINE_DUE creates no processed record | PASS | Verified in Mandatory Direct Test I |
| AC-92 | DEADLINE_DUE does not invoke Pause | PASS | Verified in Mandatory Direct Test I |
| AC-93 | Duplicate precedence remains before deadline arbitration | PASS | Verified in Mandatory Direct Test J |
| AC-94 | Duplicate after deadline remains DUPLICATE | PASS | Verified in Mandatory Direct Test J |
| AC-95 | Resume composed PAUSED result exact 0→1 succeeds | PASS | Verified in Mandatory Direct Test D |
| AC-96 | Resume revision = N+3 after N+2 Pause | PASS | Verified in Mandatory Direct Test D (10 -> 11) |
| AC-97 | Resume same prepared turnId preserved | PASS | Verified in Mandatory Direct Test D (`'turn-9'`) |
| AC-98 | Resume fresh deadline = resumeTime+30000 | PASS | Verified in Mandatory Direct Test D (`120000`) |
| AC-99 | Resume alarm generation = N+3 | PASS | Verified in Mandatory Direct Test D (`generation: 11`) |
| AC-100 | Processed action record remains N+1 after Resume | PASS | Verified in Mandatory Direct Test D (`resultingRevision: 9`) |
| AC-101 | No ProcessedGameplayActionRecord shape change | PASS | `gameplay-admission.ts` untouched |
| AC-102 | No ProcessedGameplayActionRegistry semantic change | PASS | Semantics untouched |
| AC-103 | No priorResultingRevision semantic mutation in T-018/T-022 | PASS | Untouched |
| AC-104 | No actionId synthesis | PASS | Zero synthetic actionId created |
| AC-105 | No GameplayActionEnvelope change | PASS | `gameplay-protocol.ts` untouched |
| AC-106 | No RoomAuthorityState shape change | PASS | `room-state.ts` untouched |
| AC-107 | No T-018 source modification | PASS | `gameplay-admission.ts` untouched |
| AC-108 | No T-019 source modification | PASS | `gameplay-authorization.ts` untouched |
| AC-109 | No T-020 source modification | PASS | `gameplay-transaction.ts` untouched |
| AC-110 | No T-021 source modification | PASS | `turn-deadline.ts` untouched |
| AC-111 | No T-022 source modification | PASS | `timed-gameplay-transaction.ts` untouched |
| AC-112 | No T-024 source modification | PASS | `presence.ts` untouched |
| AC-113 | No T-025 source modification | PASS | `presence-lifecycle.ts` untouched |
| AC-114 | No T-026 source modification | PASS | `system-timeout-presence-lifecycle.ts` untouched |
| AC-115 | No game-core source change | PASS | `packages/game-core/src` untouched |
| AC-116 | No game-core test change | PASS | `packages/game-core/tests` untouched |
| AC-117 | Input Room immutable | PASS | Verified in Mandatory Direct Test L |
| AC-118 | Input Match immutable | PASS | Verified in Mandatory Direct Test L |
| AC-119 | Input Hands immutable | PASS | Verified in Mandatory Direct Test L |
| AC-120 | Envelope immutable | PASS | Verified in Mandatory Direct Test L |
| AC-121 | Input processedRegistry immutable | PASS | Verified in Mandatory Direct Test L |
| AC-122 | Actor input immutable | PASS | Verified in Mandatory Direct Test L |
| AC-123 | preparedNextTurn immutable | PASS | Verified in Mandatory Direct Test L |
| AC-124 | presenceRegistry immutable | PASS | Verified in Mandatory Direct Test L |
| AC-125 | No new RandomSource | PASS | Only caller-supplied RandomSource forwarded |
| AC-126 | No Date.now | PASS | `Date.now` not used |
| AC-127 | No performance.now | PASS | `performance.now` not used |
| AC-128 | No Math.random | PASS | `Math.random` not used |
| AC-129 | No crypto entropy | PASS | `crypto` entropy not used |
| AC-130 | No WebSocket implementation | PASS | Deferred |
| AC-131 | No Durable Object implementation | PASS | Deferred |
| AC-132 | No provider alarm API | PASS | Deferred |
| AC-133 | No SQLite/persistence | PASS | Deferred |
| AC-134 | No actual concurrency implementation | PASS | Deferred |
| AC-135 | No recipient projection | PASS | Deferred |
| AC-136 | T27 remains deferred | PASS | Mandatory Stage-04 security requirement deferred |
| AC-137 | No package changes | PASS | `package.json` untouched |
| AC-138 | No package-lock changes | PASS | `package-lock.json` untouched |
| AC-139 | No external dependency | PASS | 0 new dependencies |
| AC-140 | npm ci PASS | PASS | Clean install passes |
| AC-141 | npm run typecheck PASS | PASS | Clean typecheck across all workspaces |
| AC-142 | npm test PASS | PASS | 470 tests passing across 28 test files |
| AC-143 | room-runtime direct typecheck PASS | PASS | Direct workspace typecheck passes |
| AC-144 | room-runtime direct tests PASS | PASS | 219 tests passing across 12 test files |
| AC-145 | game-core direct typecheck/tests PASS unchanged | PASS | 251 tests passing across 16 test files |
| AC-146 | T-018 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-admission.test.ts` PASS |
| AC-147 | T-019 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-authorization.test.ts` PASS |
| AC-148 | T-020 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-transaction.test.ts` PASS |
| AC-149 | T-021 regression remains PASS | PASS | `packages/room-runtime/tests/turn-deadline.test.ts` PASS |
| AC-150 | T-022 regression remains PASS | PASS | `packages/room-runtime/tests/timed-gameplay-transaction.test.ts` PASS |
| AC-151 | T-024 regression remains PASS | PASS | `packages/room-runtime/tests/presence.test.ts` PASS |
| AC-152 | T-025 regression remains PASS | PASS | `packages/room-runtime/tests/presence-lifecycle.test.ts` PASS |
| AC-153 | T-026 regression remains PASS | PASS | `packages/room-runtime/tests/system-timeout-presence-lifecycle.test.ts` PASS |
| AC-154 | Evidence maps AC-01 through AC-153 | PASS | Mapped in this table |
| AC-155 | Evidence records ACTIVE one-revision case | PASS | Documented in Direct Scenario Proofs (Test A) |
| AC-156 | Evidence records PAUSED two-revision case | PASS | Documented in Direct Scenario Proofs (Test B) |
| AC-157 | Evidence records processed record N+1 vs final Room N+2 distinction | PASS | Documented in Executive Summary & Direct Proofs |
| AC-158 | Evidence records exact duplicate after PAUSE returning N+1 | PASS | Documented in Direct Scenario Proofs (Test C) |
| AC-159 | Evidence records exact duplicate after Resume returning N+1 | PASS | Documented in Direct Scenario Proofs (Test D) |
| AC-160 | Evidence records ACTION_ID_CONFLICT precedence after Pause | PASS | Documented in Direct Scenario Proofs (Test E) |
| AC-161 | Evidence records new-action stale-vs-paused ordering | PASS | Documented in Direct Scenario Proofs (Test F, G) |
| AC-162 | Evidence records post-action elimination with unchanged registry | PASS | Documented in Direct Scenario Proofs (Test B) |
| AC-163 | Evidence records Finished precedence | PASS | Documented in Direct Scenario Proofs (Test H) |
| AC-164 | Evidence records deadline pass-through | PASS | Documented in Direct Scenario Proofs (Test I, J) |
| AC-165 | Evidence explicitly defers provider/persistence/concurrency | PASS | Documented in Deferred Scope |
| AC-166 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Status set to IMPLEMENTED awaiting Architect verification |

---

## Direct Scenario Proof Summaries

### Scenario A — Continuing Gameplay with Living Connection Remains (AC-28..AC-36, AC-155)
- Initial Room revision: 8, arm time: 1000ms, deadline: 31000ms.
- Living player `p2` connected.
- At `now = 2000ms`, client `p1` commits `PLAY_CARDS` (`actionId: 'act-1'`).
- T-022 commits gameplay ($8 \to 9$), records `processedRegistry['act-1'].resultingRevision = 9`.
- T-025 evaluates `connectedLivingPlayers = 1` -> returns `NO_CHANGE`.
- Result: `COMMITTED_ACTIVE`.
- `actionResultingRevision: 9`, `finalResultingRevision: 9`, `roomState.revision: 9`.
- Lifecycle remains `MATCH_ACTIVE`, `currentTurnId: 'turn-9'`, fresh deadline: `32000` (`2000 + 30000`), `activeAlarm.generation: 9`.
- Revision delta = 1.

### Scenario B — Post-Action Elimination with Unchanged Registry (AC-37..AC-57, AC-78..AC-84, AC-156, AC-157, AC-162)
- 3-player Match: `p1` (current, 1 KING on ACE table, LETHAL revolver), `p2` (1 ACE), `p3` (EMPTY_SAFE).
- Initial Room revision: 8.
- Presence registry: only `p1` registered.
- `p1` submits `PLAY_CARDS` (`actionId: 'play-elim-1'`) -> triggers automatic forced CALL from `p2` -> `p1` eliminated by LETHAL shot.
- `p2` and `p3` remain ALIVE -> Match status remains `IN_PROGRESS` (round 2 starts).
- T-022 intermediate: revision 9, `processedRegistry['play-elim-1'].resultingRevision = 9`.
- T-025 evaluates `connectedLivingPlayers`: `p1` is ELIMINATED, `p2` and `p3` disconnected -> `connectedLivingPlayers == 0`.
- T-025 commits Pause: revision 9 -> 10, lifecycle `MATCH_PAUSED_NO_LIVING_CONNECTIONS`, `currentTurnDeadline: null`, `activeAlarm: null`.
- Result: `COMMITTED_PAUSED`.
- `actionResultingRevision: 9`, `finalResultingRevision: 10`, `roomState.revision: 10`.
- Processed registry retains exact `resultingRevision: 9` (NOT 10!).
- Total revision delta = 2.
- `presenceRegistry` remained 100% unmutated; Pause was driven purely by authoritative Core `lifeStatus` update.

### Scenario C — Exact Duplicate Against Final Paused Room (AC-58..AC-65, AC-158)
- Exact envelope (`actionId: 'play-elim-1'`, `expectedRevision: 8`) resubmitted against paused Room (`revision: 10`) with final processed registry.
- Returns `{ decision: 'DUPLICATE', priorResultingRevision: 9 }`.
- Zero Core execution, zero RNG consumption, zero Room revision mutation, zero Pause transition.

### Scenario D — Exact Duplicate After Resume (AC-66..AC-68, AC-95..AC-100, AC-159)
- Paused Room (`revision: 10`). Living player `p2` connects -> Resumed at `authoritativeResumeTimeMs = 90000` ($10 \to 11$).
- Resumed Room: `revision: 11`, `currentTurnId: 'turn-9'`, `currentTurnDeadline: 120000`.
- Exact original envelope retried against resumed Room with same processed registry.
- Returns `{ decision: 'DUPLICATE', priorResultingRevision: 9 }` with zero mutation.

### Scenario E — Action ID Conflict Precedence After Pause (AC-69..AC-71, AC-160)
- Envelope reusing `actionId: 'play-elim-1'` with modified `expectedRevision: 10` submitted against paused Room (`revision: 10`).
- Returns `{ decision: 'REJECT', reason: 'ACTION_ID_CONFLICT' }`.
- Conflict check strictly precedes stale revision or paused lifecycle checks.

### Scenario F & G — Unseen Actions Against Paused Room (AC-72, AC-73, AC-161)
- Case F: New action with `expectedRevision: 9` against paused Room (`revision: 10`) -> `{ decision: 'REJECT', reason: 'STALE_REVISION' }`.
- Case G: New action with `expectedRevision: 10` against paused Room (`revision: 10`, `lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS'`) -> `{ decision: 'REJECT', reason: 'MATCH_NOT_ACTIVE' }`.

### Scenario H — Match Finish Precedence (AC-17..AC-26, AC-85, AC-86, AC-163)
- Heads-up Match: `p1` calls liar on `p2`'s lie -> `p2` shoots LETHAL -> `p1` wins (`FINISHED`, `winnerId: 'p1'`).
- Presence registry is empty (`connectedLivingPlayers == 0`).
- Result: `COMMITTED_FINISHED`.
- `actionResultingRevision: 9`, `finalResultingRevision: 9`, `processedRegistry['call-win-1'].resultingRevision: 9`.
- Room lifecycle becomes `MATCH_FINISHED`, `currentTurnId: null`, `currentTurnDeadline: null`, `activeAlarm: null`.
- Pause is never called; finished state has absolute precedence over zero-Living pause.

### Scenario I & J — Deadline Pass-Through & Duplicate Precedence (AC-12, AC-89..AC-94, AC-164)
- Test I: At exact deadline (`now = 31000`), unseen action returns `{ decision: 'DEADLINE_DUE' }` with no processed record created and no Pause invoked.
- Test J: After deadline (`now = 50000 > 32000`), duplicate retry returns `{ decision: 'DUPLICATE', priorResultingRevision: 9 }` (duplicate precedence before timing arbitration).

### Scenario K — Other Connected Living Presence (AC-87, AC-88)
- Current player `p1` eliminated on turn, but living player `p2` is connected.
- Result: `COMMITTED_ACTIVE` ($8 \to 9$, 1 revision increment). Room remains active.

### Scenario L — Input Purity & Immutability (AC-117..AC-124)
- Input `RoomAuthorityState`, `MatchState`, player hands, `envelope`, `processedRegistry`, `actor`, `preparedNextTurn`, and `presenceRegistry` verified completely unmutated across execution.

---

## Regression Verification
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (470 tests across 28 test files)
  - `game-core`: 251 tests across 16 test files (all passing)
  - `room-runtime`: 219 tests across 12 test files (all passing)

---

## Deferred Scope
- Cloudflare Durable Object alarm APIs (`storage.setAlarm`, `storage.getAlarm`, `storage.deleteAlarm`, `alarm()`)
- Provider alarm synchronization & alarm handler integration
- SQLite persistence / state reload
- Actual concurrency serialization
- WebSocket & reconnect orchestration
- Telegram session & authentication
- Recipient-specific projections & T27 dead-spectator hidden-Hand protection
