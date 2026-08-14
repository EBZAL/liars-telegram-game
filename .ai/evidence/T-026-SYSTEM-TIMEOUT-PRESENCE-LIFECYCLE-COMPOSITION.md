# Evidence: T-026-SYSTEM-TIMEOUT-PRESENCE-LIFECYCLE-COMPOSITION

## Task Identity & Git Commit Chain
- **Task ID**: `T-026-SYSTEM-TIMEOUT-PRESENCE-LIFECYCLE-COMPOSITION`
- **Task-Start Commit**: `72626f932ee59923c73f224690c3b5bd7dcc6837`
- **Authoritative Implementation Commit**: `096cef0e15eb2a754c07943d1452aac5268d6496`

---

## Executive Summary
Task `T-026-SYSTEM-TIMEOUT-PRESENCE-LIFECYCLE-COMPOSITION` establishes the smallest provider-independent authoritative composition layer (`executeSystemTimeoutWithPresenceLifecycle`) that executes the verified T-023 `SYSTEM_TIMEOUT` deadline transaction and, only after a successful continuing timeout transition, reconciles the resulting authoritative Match against verified T-024 Living presence using verified T-025 zero-Living Pause semantics.

Key properties established:
1. **Strict Authoritative Ordering**:
   - Step 1: Executes `executeSystemTimeoutDeadlineTransaction` exactly once.
   - Step 2: Non-`COMMITTED` outcomes (`STALE_ALARM`, `NOT_DUE`, `NOT_APPLICABLE`, `INVALID_STATE`) pass through immediately without evaluating Pause, creating lifecycle revisions, or consuming RNG.
   - Step 3: `MATCH_FINISHED` outcomes have absolute precedence and return `COMMITTED_FINISHED` immediately without invoking zero-Living Pause (1 revision increment, winner preserved, deadline/alarm null).
   - Step 4: Continuing `MATCH_ACTIVE` outcomes delegate presence reconciliation to verified `pauseActiveMatchForNoLivingConnections`.
   - Step 5: `NO_CHANGE` maps to `COMMITTED_ACTIVE` (1 revision increment, +30000 armed deadline, active alarm generation matching revision); `PAUSED` maps to `COMMITTED_PAUSED` (2 revision increments: timeout revision $N+1$, pause revision $N+2$, deadline/alarm null, prepared next turn ID preserved).
2. **Two-Transition Revision Sequencing**:
   - Successful `SYSTEM_TIMEOUT` Core transition = Revision $N \to N+1$.
   - Subsequent `ACTIVE \to PAUSED` lifecycle transition = Revision $N+1 \to N+2$.
   - Total revision delta for paused timeout is exactly 2 increments, reflecting two distinct authoritative state transitions.
3. **Real Post-Timeout Elimination Reconciliation**:
   - Canonical 3-player scenario where timeout auto-play triggers automatic forced CALL and eliminates the current player via LETHAL shot while the Match remains `IN_PROGRESS` (2 surviving living players).
   - Same `presenceRegistry` where only the eliminated player was connected transitions from `connectedLivingPlayers = 1` before timeout to `connectedLivingPlayers = 0` after timeout due strictly to authoritative Core `lifeStatus` update.
   - Authoritative Pause executes immediately, producing `COMMITTED_PAUSED`.
4. **Intermediate Alarm Invalidation**:
   - Intermediate T-023 next-turn alarm metadata created at revision $N+1$ does not survive the final `COMMITTED_PAUSED` result ($N+2$, `activeAlarm = null`, `currentTurnDeadline = null`).
   - T-026 does not schedule intermediate alarms with any provider.
5. **Old Trigger Replay & Resume Compatibility**:
   - Replaying the pre-timeout trigger against the final paused Room results in `STALE_ALARM` with zero Core execution and zero RNG.
   - Final `COMMITTED_PAUSED` Room is fully compatible with T-025 exact $0 \to 1$ Living Resume, preserving the T-023 prepared turn ID and establishing a fresh $+30000$ deadline.

---

## Architectural & Security Distinctions
- **SYSTEM_TIMEOUT Core transition != Pause lifecycle transition**: The Core timeout advances gameplay state ($N \to N+1$); the Pause transition advances Room lifecycle ($N+1 \to N+2$).
- **timeoutResultingRevision != finalResultingRevision when Pause occurs**: For `COMMITTED_ACTIVE` and `COMMITTED_FINISHED`, `timeoutResultingRevision == finalResultingRevision`. For `COMMITTED_PAUSED`, `finalResultingRevision == timeoutResultingRevision + 1`.
- **intermediate activeAlarm metadata != provider alarm scheduling**: Intermediate pure memory alarm metadata is cleared by Pause and never scheduled with any provider.
- **presence reconciliation != socket mutation**: Presence reconciliation reacts to authoritative Match lifeStatus changes against the unchanged connection registry.
- **T-026 SYSTEM_TIMEOUT composition != client gameplay idempotency composition**: Client actionId and retry idempotency composition with lifecycle transitions remains explicitly deferred.
- **pure final state != durable atomic persistence**: Pure in-memory authoritative state transitions are produced without claiming durable persistence atomicity.

---

## Acceptance Criteria Mapping (AC-01 through AC-123)

| AC | Description | Status | Verification / Proof |
|---|---|---|---|
| AC-01 | Dedicated provider-independent composition module exists | PASS | Implemented in `packages/room-runtime/src/system-timeout-presence-lifecycle.ts` |
| AC-02 | API exported from room-runtime | PASS | Exported in `packages/room-runtime/src/index.ts` |
| AC-03 | T-023 called exactly once per execution | PASS | Called in Step 1 of `executeSystemTimeoutWithPresenceLifecycle` |
| AC-04 | No duplicate timeout/deadline algorithm | PASS | Delegates entirely to `executeSystemTimeoutDeadlineTransaction` |
| AC-05 | No manual timeout Card selection | PASS | Timeout selection owned by Core `applySystemTimeout` |
| AC-06 | No manual life-status calculation | PASS | Handled by T-024 `evaluateRoomPresence` |
| AC-07 | No manual zero-Living counting | PASS | Handled by T-024 / T-025 |
| AC-08 | No manual Pause implementation | PASS | Delegates to `pauseActiveMatchForNoLivingConnections` |
| AC-09 | STALE_ALARM passes through without Pause | PASS | Verified in Mandatory Direct Test A |
| AC-10 | NOT_DUE passes through without Pause | PASS | Verified in Mandatory Direct Test B |
| AC-11 | NOT_APPLICABLE passes through without Pause | PASS | Verified in Non-COMMITTED Pass-Through test |
| AC-12 | INVALID_STATE passes through without Pause | PASS | Verified in Non-COMMITTED Pass-Through test |
| AC-13 | Non-COMMITTED path causes zero additional revision | PASS | Verified in Mandatory Direct Tests A, B, and Pass-Through tests |
| AC-14 | Non-COMMITTED path causes zero additional RNG | PASS | Verified with `ThrowingRandomSource` in Tests A, B |
| AC-15 | T-023 COMMITTED FINISHED has precedence | PASS | Verified in Mandatory Direct Test F |
| AC-16 | FINISHED does not invoke Pause | PASS | Verified in Mandatory Direct Test F (Pause step bypassed) |
| AC-17 | FINISHED remains MATCH_FINISHED | PASS | Verified in Mandatory Direct Test F |
| AC-18 | FINISHED adds no lifecycle revision | PASS | Verified in Mandatory Direct Test F (8 -> 9 only) |
| AC-19 | FINISHED preserves winnerId | PASS | Verified in Mandatory Direct Test F (`winnerId: 'p2'`) |
| AC-20 | FINISHED turnId null | PASS | Verified in Mandatory Direct Test F (`currentTurnId: null`) |
| AC-21 | FINISHED deadline null | PASS | Verified in Mandatory Direct Test F (`currentTurnDeadline: null`) |
| AC-22 | FINISHED activeAlarm null | PASS | Verified in Mandatory Direct Test F (`activeAlarm: null`) |
| AC-23 | Continuing T-023 result delegates Pause decision to T-025 | PASS | Verified in Mandatory Direct Tests C, D |
| AC-24 | T-025 NO_CHANGE → COMMITTED_ACTIVE | PASS | Verified in Mandatory Direct Test C |
| AC-25 | COMMITTED_ACTIVE final revision equals timeout revision | PASS | Verified in Mandatory Direct Test C (8 -> 9) |
| AC-26 | COMMITTED_ACTIVE remains MATCH_ACTIVE | PASS | Verified in Mandatory Direct Test C |
| AC-27 | COMMITTED_ACTIVE retains T-023 next turnId | PASS | Verified in Mandatory Direct Test C (`'turn-9'`) |
| AC-28 | COMMITTED_ACTIVE retains T-023 +30000 deadline | PASS | Verified in Mandatory Direct Test C (`61000`) |
| AC-29 | COMMITTED_ACTIVE retains T-023 alarm generation | PASS | Verified in Mandatory Direct Test C (`generation: 9`) |
| AC-30 | COMMITTED_ACTIVE adds zero lifecycle revision | PASS | Verified in Mandatory Direct Test C |
| AC-31 | T-025 PAUSED → COMMITTED_PAUSED | PASS | Verified in Mandatory Direct Test D |
| AC-32 | COMMITTED_PAUSED final revision = timeout revision +1 | PASS | Verified in Mandatory Direct Test D (timeout: 9, final: 10) |
| AC-33 | Total initial→paused revision delta = 2 | PASS | Verified in Mandatory Direct Test D (8 -> 10) |
| AC-34 | First revision represents SYSTEM_TIMEOUT/Core transition | PASS | Verified in Mandatory Direct Test D (`timeoutResultingRevision: 9`) |
| AC-35 | Second revision represents ACTIVE→PAUSED lifecycle transition | PASS | Verified in Mandatory Direct Test D (`finalResultingRevision: 10`) |
| AC-36 | No third revision | PASS | Verified in Mandatory Direct Test D |
| AC-37 | COMMITTED_PAUSED lifecycle = MATCH_PAUSED_NO_LIVING_CONNECTIONS | PASS | Verified in Mandatory Direct Test D |
| AC-38 | COMMITTED_PAUSED preserves T-023 resulting Match | PASS | Verified in Mandatory Direct Test D |
| AC-39 | COMMITTED_PAUSED preserves prepared next turnId | PASS | Verified in Mandatory Direct Test D (`'turn-9'`) |
| AC-40 | COMMITTED_PAUSED deadline null | PASS | Verified in Mandatory Direct Test D |
| AC-41 | COMMITTED_PAUSED activeAlarm null | PASS | Verified in Mandatory Direct Test D |
| AC-42 | Intermediate T-023 alarm does not survive final Pause | PASS | Verified in Mandatory Direct Test D |
| AC-43 | Intermediate alarm is not provider-scheduled by T-026 | PASS | No provider scheduling exists in T-026 |
| AC-44 | Post-timeout Living count uses resulting Match lifeStatus | PASS | Verified in Mandatory Direct Test D |
| AC-45 | Same registry may produce different Living count after Core | PASS | Verified in Mandatory Direct Test D & E |
| AC-46 | Actual timeout ALIVE→ELIMINATED continuing-Match scenario covered | PASS | Verified in Mandatory Direct Test D |
| AC-47 | That scenario reaches COMMITTED_PAUSED | PASS | Verified in Mandatory Direct Test D |
| AC-48 | Presence registry remains unchanged | PASS | Verified in Mandatory Direct Test D & E |
| AC-49 | Other disconnected Living Players remain eligible but unconnected | PASS | Verified in Mandatory Direct Test D (p2, p3 alive but not in registry) |
| AC-50 | Match-finished precedence tested with zero Living presence | PASS | Verified in Mandatory Direct Test F |
| AC-51 | Winner never becomes PAUSED | PASS | Verified in Mandatory Direct Test F |
| AC-52 | Old trigger replay after final Pause → STALE_ALARM | PASS | Verified in Mandatory Direct Test G |
| AC-53 | Old trigger replay executes zero second timeout | PASS | Verified in Mandatory Direct Test G |
| AC-54 | Old trigger replay consumes zero Core RNG | PASS | Verified via `ThrowingRandomSource` in Test G |
| AC-55 | Final PAUSED result is compatible with T-025 exact 0→1 Resume | PASS | Verified in Mandatory Direct Test H |
| AC-56 | Resume preserves T-023 prepared next turnId | PASS | Verified in Mandatory Direct Test H (`'turn-9'`) |
| AC-57 | Resume uses fresh resume-time +30000 deadline | PASS | Verified in Mandatory Direct Test H (`120000`) |
| AC-58 | Resume revision follows final paused revision | PASS | Verified in Mandatory Direct Test H (10 -> 11) |
| AC-59 | T-025 unexpected outcome fails closed | PASS | Fail-closed error thrown for non-NO_CHANGE/PAUSED |
| AC-60 | No silent repair of composition divergence | PASS | Fail-closed error thrown on invariant divergence |
| AC-61 | Timeout metadata timedOutPlayerId preserved | PASS | Verified in Mandatory Direct Tests C, D |
| AC-62 | Timeout metadata autoPlayedCardId preserved | PASS | Verified in Mandatory Direct Tests C, D |
| AC-63 | Metadata remains internal server data | PASS | Documented as internal server data |
| AC-64 | No client GameplayActionEnvelope added | PASS | Client protocol untouched |
| AC-65 | No client SYSTEM_TIMEOUT authority | PASS | Server authority only |
| AC-66 | No client Pause authority | PASS | Server authority only |
| AC-67 | No client presence authority | PASS | Server authority only |
| AC-68 | No recipient projection added | PASS | Deferred |
| AC-69 | T27 remains deferred | PASS | Mandatory Stage-04 security requirement deferred |
| AC-70 | No ProcessedGameplayActionRegistry modification | PASS | Processed registry untouched by system timeout |
| AC-71 | No actionId synthesis | PASS | Zero synthetic actionId created |
| AC-72 | No priorResultingRevision semantics change | PASS | Semantics untouched |
| AC-73 | Client gameplay/presence composition remains deferred | PASS | Explicitly deferred |
| AC-74 | No T-020 source changes | PASS | `gameplay-transaction.ts` untouched |
| AC-75 | No T-022 source changes | PASS | `timed-gameplay-transaction.ts` untouched |
| AC-76 | No T-023 source changes | PASS | `system-timeout-transaction.ts` untouched |
| AC-77 | No T-024 source changes | PASS | `presence.ts` untouched |
| AC-78 | No T-025 source changes | PASS | `presence-lifecycle.ts` untouched |
| AC-79 | No RoomAuthorityState shape change | PASS | `room-state.ts` untouched |
| AC-80 | No GameplayActionEnvelope shape change | PASS | `gameplay-protocol.ts` untouched |
| AC-81 | Input Room immutable | PASS | Verified in Mandatory Direct Test I |
| AC-82 | Input Match immutable | PASS | Verified in Mandatory Direct Test I |
| AC-83 | Input Hands immutable | PASS | Verified in Mandatory Direct Test I |
| AC-84 | trigger immutable | PASS | Verified in Mandatory Direct Test I |
| AC-85 | preparedNextTurn immutable | PASS | Verified in Mandatory Direct Test I |
| AC-86 | presenceRegistry immutable | PASS | Verified in Mandatory Direct Test I |
| AC-87 | Only supplied RandomSource reaches T-023 | PASS | Supplied `random` passed to T-023 |
| AC-88 | T-025 consumes zero RNG | PASS | T-025 consumes zero RNG |
| AC-89 | No Date.now | PASS | `Date.now` not used |
| AC-90 | No performance.now | PASS | `performance.now` not used |
| AC-91 | No Math.random | PASS | `Math.random` not used |
| AC-92 | No crypto entropy | PASS | `crypto` entropy not used |
| AC-93 | No WebSocket | PASS | Deferred |
| AC-94 | No Durable Object | PASS | Deferred |
| AC-95 | No provider alarm APIs | PASS | Deferred |
| AC-96 | No SQLite/persistence | PASS | Deferred |
| AC-97 | No actual concurrency implementation | PASS | Deferred |
| AC-98 | No package changes | PASS | `package.json` untouched |
| AC-99 | No package-lock changes | PASS | `package-lock.json` untouched |
| AC-100 | No external dependencies | PASS | 0 new dependencies |
| AC-101 | No game-core source changes | PASS | `packages/game-core/src` untouched |
| AC-102 | No game-core test changes | PASS | `packages/game-core/tests` untouched |
| AC-103 | T-023 regression remains PASS | PASS | `packages/room-runtime/tests/system-timeout-transaction.test.ts` PASS |
| AC-104 | T-024 regression remains PASS | PASS | `packages/room-runtime/tests/presence.test.ts` PASS |
| AC-105 | T-025 regression remains PASS | PASS | `packages/room-runtime/tests/presence-lifecycle.test.ts` PASS |
| AC-106 | T-021 regression remains PASS | PASS | `packages/room-runtime/tests/turn-deadline.test.ts` PASS |
| AC-107 | npm ci PASS | PASS | Verified clean install |
| AC-108 | npm run typecheck PASS | PASS | Verified clean typecheck across all workspaces |
| AC-109 | npm test PASS | PASS | 455 tests passing across 27 test files |
| AC-110 | room-runtime direct typecheck PASS | PASS | Verified direct workspace typecheck |
| AC-111 | room-runtime direct tests PASS | PASS | 204 tests passing across 11 test files |
| AC-112 | game-core direct typecheck/tests PASS unchanged | PASS | 251 tests passing across 16 test files |
| AC-113 | Evidence maps AC-01 through AC-112 | PASS | Mapped in this table |
| AC-114 | Evidence records one-revision ACTIVE case | PASS | Documented in Direct Scenario Proofs (Test C) |
| AC-115 | Evidence records two-revision PAUSED case | PASS | Documented in Direct Scenario Proofs (Test D) |
| AC-116 | Evidence records real post-timeout elimination reconciliation | PASS | Documented in Direct Scenario Proofs (Test D & E) |
| AC-117 | Evidence records Finished precedence | PASS | Documented in Direct Scenario Proofs (Test F) |
| AC-118 | Evidence records intermediate alarm never provider-scheduled | PASS | Documented in Executive Summary & Distinctions |
| AC-119 | Evidence records old-trigger stale after composed Pause | PASS | Documented in Direct Scenario Proofs (Test G) |
| AC-120 | Evidence records Resume compatibility | PASS | Documented in Direct Scenario Proofs (Test H) |
| AC-121 | Evidence explicitly defers client-gameplay presence composition | PASS | Documented in Deferred Scope |
| AC-122 | Evidence explicitly defers provider/persistence/concurrency | PASS | Documented in Deferred Scope |
| AC-123 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Status set to IMPLEMENTED awaiting Architect verification |

---

## Direct Scenario Proof Summaries

### Scenario A — Stale Timeout Trigger (AC-09, AC-13, AC-14)
- Trigger generation mismatch (`generation: 7` vs `activeAlarm.generation: 8`).
- Returns `{ decision: 'STALE_ALARM' }` with zero Pause evaluation, zero revision mutation, zero RNG.

### Scenario B — Exact Trigger Before Deadline (AC-10, AC-13, AC-14)
- `now = 30999` before `deadlineMs = 31000`.
- Returns `{ decision: 'NOT_DUE' }` with room state and activeAlarm unmutated.

### Scenario C — Continuing Timeout with Living Connected (AC-23..AC-30, AC-114)
- Initial revision: 8, arm time: 1000, deadline: 31000.
- Living player `p2` connected.
- At `now = 31000`, timeout commits. T-025 returns `NO_CHANGE`.
- Result: `COMMITTED_ACTIVE`.
- `timeoutResultingRevision: 9`, `finalResultingRevision: 9`.
- Lifecycle remains `MATCH_ACTIVE`, `currentTurnId: 'turn-9'`, fresh deadline: `61000` (`authoritativeNowMs + 30000`), `activeAlarm.generation: 9`.
- Revision delta = 1.

### Scenario D & E — Post-Timeout Elimination with Unchanged Registry (AC-31..AC-49, AC-115, AC-116)
- 3-player Match: `p1` (current, 1 KING, LETHAL revolver), `p2` (1 ACE), `p3` (EMPTY_SAFE).
- Initial revision: 8.
- Presence registry: only `p1` registered.
- Timeout auto-plays `p1`'s KING -> triggers automatic forced CALL from `p2` -> `p1` eliminated by LETHAL.
- `p2` and `p3` remain ALIVE -> Match status remains `IN_PROGRESS` (round 2 starts).
- T-023 intermediate: revision 9, `MATCH_ACTIVE`, `currentTurnId: 'turn-9'`.
- T-025 evaluates `connectedLivingPlayers`: `p1` is ELIMINATED, `p2` and `p3` disconnected -> `connectedLivingPlayers == 0`.
- T-025 commits Pause: revision 9 -> 10, lifecycle `MATCH_PAUSED_NO_LIVING_CONNECTIONS`, `currentTurnDeadline: null`, `activeAlarm: null`.
- Result: `COMMITTED_PAUSED`.
- `timeoutResultingRevision: 9`, `finalResultingRevision: 10`.
- Revision delta = 2.
- `presenceRegistry` remained 100% unmutated; Pause was driven purely by authoritative Core `lifeStatus` update.

### Scenario F — Match Finish Precedence (AC-15..AC-22, AC-50, AC-51, AC-117)
- 1v1 Match: `p1` timeout auto-plays Lie -> `p2` forced CALL -> `p1` eliminated -> `p2` wins Match (`FINISHED`, `winnerId: 'p2'`).
- Presence registry is empty (`connectedLivingPlayers == 0`).
- Result: `COMMITTED_FINISHED`.
- `timeoutResultingRevision: 9`, `finalResultingRevision: 9` (only 1 revision increment).
- Room lifecycle becomes `MATCH_FINISHED`, `currentTurnId: null`, `currentTurnDeadline: null`, `activeAlarm: null`.
- Pause is never called; finished state has absolute precedence over zero-Living pause.

### Scenario G — Old Trigger Replay After Composed Pause (AC-52..AC-54, AC-119)
- Original generation-8 trigger replayed against paused room (`revision: 10`, `activeAlarm: null`).
- Returns `{ decision: 'STALE_ALARM' }` with zero Core execution and zero RNG.

### Scenario H — Resume Composed Paused Result (AC-55..AC-58, AC-120)
- Paused room (`revision: 10`, `currentTurnId: 'turn-9'`).
- Living player `p2` reconnects (exact Living transition $0 \to 1$).
- Resumed at `authoritativeResumeTimeMs = 90000`.
- Result: `RESUMED`.
- `resultingRevision: 11` ($10 \to 11$), lifecycle `MATCH_ACTIVE`, `currentTurnId: 'turn-9'`, `currentTurnDeadline: 120000`, `activeAlarm.generation: 11`.
- Proves next turn created by T-023 remains the same turn across Pause and Resume.

### Scenario I — Input Purity & Immutability (AC-81..AC-86)
- Input `RoomAuthorityState`, `MatchState`, player hands, `trigger`, `preparedNextTurn`, and `presenceRegistry` verified completely unmutated across execution.

---

## Regression Verification
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (455 tests across 27 test files)
  - `game-core`: 251 tests across 16 test files (all passing)
  - `room-runtime`: 204 tests across 11 test files (all passing)

---

## Deferred Scope
- Client gameplay/presence composition (T-020/T-022 composition with T-025)
- `ProcessedGameplayActionRegistry` revision semantics after Pause
- Cloudflare Durable Object alarm APIs (`storage.setAlarm`, `storage.getAlarm`, `storage.deleteAlarm`, `alarm()`)
- SQLite persistence / state reload
- Actual concurrency serialization
- WebSocket & reconnect orchestration
- Telegram session & authentication
- Recipient-specific projections & T27 dead-spectator hidden-Hand protection
