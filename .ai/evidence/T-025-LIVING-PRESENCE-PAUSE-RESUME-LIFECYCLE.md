# Evidence: T-025-LIVING-PRESENCE-PAUSE-RESUME-LIFECYCLE

## Task Identity & Git Commit Chain
- **Task ID**: `T-025-LIVING-PRESENCE-PAUSE-RESUME-LIFECYCLE`
- **Task-Start Commit**: `ef0d927a7154d61f287f0c90e3df84496ecead21`
- **Authoritative Implementation Commit**: `2dfed314a15374073f9d34124108a8dab02232db`

---

## Executive Summary
Task `T-025-LIVING-PRESENCE-PAUSE-RESUME-LIFECYCLE` establishes the provider-independent authoritative Room lifecycle foundation that composes T-024 Living-presence facts with Room revision and T-021 turn-deadline primitives.

Key capabilities established:
1. **Zero-Living Pause Transition (`pauseActiveMatchForNoLivingConnections`)**:
   - `MATCH_ACTIVE` + `connectedLivingPlayers == 0` transitions Room to `MATCH_PAUSED_NO_LIVING_CONNECTIONS`.
   - Advances Room revision exactly once (`nextRoomRevision`).
   - Clears `currentTurnDeadline` (`null`) and `activeAlarm` (`null`).
   - Preserves exact authoritative gameplay state (`match`, `currentTurnId`, `members`, `hostPlayerId`).
   - Does not depend on wall-clock time; requires active timing coherence.
2. **Exact 0→1 Living Resume Transition (`resumePausedMatchForLivingPresenceTransition`)**:
   - `MATCH_PAUSED_NO_LIVING_CONNECTIONS` + exact Living count transition `0 → 1` transitions Room to `MATCH_ACTIVE`.
   - Advances Room revision exactly once.
   - Arms a completely fresh deadline (`authoritativeResumeTimeMs + 30000`) and fresh `TURN_DEADLINE` alarm with `generation == resultingRevision`.
   - Preserves exact gameplay state and current turn identity. Old remaining time is NOT restored.
3. **Stale Alarm Invalidation on Pause**:
   - Replaying a pre-pause `TURN_DEADLINE` trigger against the paused Room results in `STALE_ALARM` with zero Core execution and zero RNG consumption.
4. **Gameplay Blocked While Paused**:
   - Client actions submitted via T-022 against a paused Room are rejected with `MATCH_NOT_ACTIVE`.
5. **Eliminated Spectator Exclusion**:
   - Reconnecting Eliminated spectators yields `0 → 0` Living presence, remaining in `MATCH_PAUSED_NO_LIVING_CONNECTIONS` without revision or alarm mutation.
6. **Unchanged-Registry Post-Elimination Foundation**:
   - When a player's `lifeStatus` transitions to `ELIMINATED` in authoritative MatchState, Pause correctly detects `connectedLivingPlayers == 0` and commits Pause even with an unchanged presence registry.
7. **Finished Precedence**:
   - `MATCH_FINISHED` Rooms return `NOT_APPLICABLE` for Pause and Resume, ensuring finished winner states are never overridden.

---

## Architectural & Security Distinctions
- **Raw presence event != lifecycle revision transition**: Raw socket events cause zero Room revision increments. Only actual lifecycle state changes (`ACTIVE <-> PAUSED`) advance revision.
- **Pause != Core gameplay transition**: Pause is a Room authority state transition only; it executes zero Core transitions and does not modify hands, pile, or roulette progress.
- **Resume != new gameplay turn**: Resume restores the existing turn with a fresh 30-second window; it does not advance turn order or change `currentTurnId`.
- **Resume timer != old remaining timer**: Resume establishes a clean 30-second deadline from `authoritativeResumeTimeMs + 30000`, preventing timer starvation.
- **Living connection != Eliminated spectator connection**: Only connections belonging to `lifeStatus === 'ALIVE'` players count toward Living presence.
- **provider-independent activeAlarm metadata != Cloudflare alarm scheduling**: Pure alarm metadata (`TURN_DEADLINE`, `dueAt`, `generation`) is modeled without invoking Cloudflare runtime APIs.
- **lifecycle primitive != post-Core composition**: T-025 provides the pure lifecycle evaluator functions; automated post-action wiring is deferred.

---

## Acceptance Criteria Mapping (AC-01 through AC-143)

| AC | Description | Status | Verification / Proof |
|---|---|---|---|
| AC-01 | Dedicated provider-independent presence lifecycle module exists | PASS | Implemented in `packages/room-runtime/src/presence-lifecycle.ts` |
| AC-02 | Public APIs exported from room-runtime | PASS | Exported in `packages/room-runtime/src/index.ts` |
| AC-03 | RoomAuthorityState shape unchanged | PASS | `packages/room-runtime/src/room-state.ts` untouched |
| AC-04 | Presence registry remains separate from Room state | PASS | Registries passed as arguments, not stored on Room |
| AC-05 | GameplayActionEnvelope unchanged | PASS | Protocol untouched |
| AC-06 | No client PAUSE action added | PASS | No client action exists |
| AC-07 | No client RESUME action added | PASS | No client action exists |
| AC-08 | Pause delegates Living count to evaluateRoomPresence | PASS | Verified in `pauseActiveMatchForNoLivingConnections` |
| AC-09 | Pause does not reproduce T-024 counting logic | PASS | Calls `evaluateRoomPresence` exclusively |
| AC-10 | MATCH_ACTIVE + Living count >0 → NO_CHANGE | PASS | Verified in `MANDATORY TEST A` |
| AC-11 | NO_CHANGE causes zero revision mutation | PASS | Verified in `MANDATORY TEST A` |
| AC-12 | NO_CHANGE preserves deadline/alarm | PASS | Verified in `MANDATORY TEST A` |
| AC-13 | Disconnected current Player with another Living connected remains ACTIVE | PASS | Verified in `MANDATORY TEST B` |
| AC-14 | Host presence has no special Pause authority | PASS | Verified in `Living Host and Eliminated Host follow exact Living presence rules` |
| AC-15 | MATCH_ACTIVE + Living count 0 → PAUSED | PASS | Verified in `MANDATORY TEST C` |
| AC-16 | Pause lifecycle = MATCH_PAUSED_NO_LIVING_CONNECTIONS | PASS | Verified in `MANDATORY TEST C` |
| AC-17 | Pause increments Room revision exactly once | PASS | Verified in `MANDATORY TEST C` (8 -> 9) |
| AC-18 | Pause validates revision before transition | PASS | Checked via `Number.isSafeInteger` and `nextRoomRevision` |
| AC-19 | Pause preserves Match | PASS | Verified in `MANDATORY TEST C` |
| AC-20 | Pause preserves currentTurnId | PASS | Verified in `MANDATORY TEST C` |
| AC-21 | Pause preserves current Player | PASS | Verified in `MANDATORY TEST C` |
| AC-22 | Pause preserves Hands | PASS | Verified in `MANDATORY TEST C` |
| AC-23 | Pause preserves table rank | PASS | Verified in `MANDATORY TEST C` |
| AC-24 | Pause preserves previousPlay | PASS | Verified in `MANDATORY TEST C` |
| AC-25 | Pause preserves round state | PASS | Verified in `MANDATORY TEST C` |
| AC-26 | Pause preserves roulette progress | PASS | Verified in `MANDATORY TEST C` |
| AC-27 | Pause sets currentTurnDeadline = null | PASS | Verified in `MANDATORY TEST C` |
| AC-28 | Pause sets activeAlarm = null | PASS | Verified in `MANDATORY TEST C` |
| AC-29 | Deadline clearing adds no second revision | PASS | Exactly 1 revision increment total |
| AC-30 | Alarm clearing adds no second revision | PASS | Exactly 1 revision increment total |
| AC-31 | Pause requires coherent active TURN_DEADLINE metadata | PASS | Verified in `fails closed on malformed active timing metadata for Pause` |
| AC-32 | Active timing dueAt must equal currentTurnDeadline | PASS | Checked in pauseActiveMatchForNoLivingConnections |
| AC-33 | Active alarm generation must equal Room revision | PASS | Checked in pauseActiveMatchForNoLivingConnections |
| AC-34 | Wrong active alarm kind fails closed | PASS | Checked in pauseActiveMatchForNoLivingConnections |
| AC-35 | Pause does not depend on whether deadline is already due | PASS | No timing due check in Pause |
| AC-36 | Pause takes no authoritative wall-clock input | PASS | Signature takes `(roomState, presenceRegistry)` only |
| AC-37 | Old timeout trigger after Pause cannot execute SYSTEM_TIMEOUT | PASS | Verified in `MANDATORY TEST D` |
| AC-38 | Old timeout trigger after Pause consumes zero Core RNG | PASS | Verified in `MANDATORY TEST D` |
| AC-39 | Paused client gameplay cannot COMMIT through T-022 | PASS | Verified in `MANDATORY TEST E` |
| AC-40 | Pause performs zero Core transition | PASS | Core transitions not called |
| AC-41 | Pause creates zero gameplay processed records | PASS | Processed registry untouched |
| AC-42 | Pause does not modify presence registry | PASS | Verified in `MANDATORY TEST O` |
| AC-43 | Resume delegates before/after Living facts to evaluateRoomPresence | PASS | Verified in `resumePausedMatchForLivingPresenceTransition` |
| AC-44 | Resume does not reproduce T-024 counting logic | PASS | Calls `evaluateRoomPresence` exclusively |
| AC-45 | Resume applies only to MATCH_PAUSED_NO_LIVING_CONNECTIONS | PASS | Non-paused lifecycles return `NOT_APPLICABLE` |
| AC-46 | Paused state requires Match IN_PROGRESS | PASS | Checked in resume function |
| AC-47 | Paused state requires winnerId null | PASS | Checked in resume function |
| AC-48 | Paused state preserves non-empty currentTurnId | PASS | Checked in resume function |
| AC-49 | Paused state requires currentTurnDeadline null | PASS | Checked in resume function |
| AC-50 | Paused state requires activeAlarm null | PASS | Checked in resume function |
| AC-51 | Paused Room with retained alarm fails closed | PASS | Verified in `fails closed when paused room has retained deadline or alarm` |
| AC-52 | Resume requires exact Living count transition 0→1 | PASS | Verified in `MANDATORY TEST G` |
| AC-53 | 0→0 does not Resume | PASS | Verified in `MANDATORY TEST F` |
| AC-54 | 1→1 paused-before state fails closed | PASS | Verified in `MANDATORY TEST K` |
| AC-55 | 1→2 paused-before state fails closed | PASS | Verified in `MANDATORY TEST K` |
| AC-56 | 0→2 fails closed / does not silently Resume | PASS | Verified in `MANDATORY TEST L` |
| AC-57 | Eliminated spectator reconnect yields Living 0→0 | PASS | Verified in `MANDATORY TEST F` |
| AC-58 | Eliminated spectator cannot Resume | PASS | Verified in `MANDATORY TEST F` |
| AC-59 | Eliminated Host cannot Resume | PASS | Verified in `Living Host and Eliminated Host follow exact Living presence rules` |
| AC-60 | Living Player connection can produce 0→1 Resume | PASS | Verified in `MANDATORY TEST G` |
| AC-61 | Resume validates authoritativeResumeTimeMs | PASS | Verified in `fails closed on invalid authoritativeResumeTimeMs for Resume` |
| AC-62 | Resume time safe non-negative integer | PASS | Checked in resume function |
| AC-63 | Resume deadline overflow rejected before mutation | PASS | Checked via `MAX_SAFE_INTEGER` guard |
| AC-64 | Resume computes next Room revision before timing arming | PASS | Computed prior to `armActiveTurnDeadline` |
| AC-65 | Resume increments revision exactly once | PASS | Verified in `MANDATORY TEST G` (9 -> 10) |
| AC-66 | Resume lifecycle = MATCH_ACTIVE | PASS | Verified in `MANDATORY TEST G` |
| AC-67 | Resume preserves Match | PASS | Verified in `MANDATORY TEST G` |
| AC-68 | Resume preserves currentTurnId | PASS | Verified in `MANDATORY TEST G` |
| AC-69 | Resume preserves current Player | PASS | Verified in `MANDATORY TEST G` |
| AC-70 | Resume preserves Hands | PASS | Verified in `MANDATORY TEST G` |
| AC-71 | Resume preserves table rank | PASS | Verified in `MANDATORY TEST G` |
| AC-72 | Resume preserves previousPlay | PASS | Verified in `MANDATORY TEST G` |
| AC-73 | Resume preserves round | PASS | Verified in `MANDATORY TEST G` |
| AC-74 | Resume preserves roulette progress | PASS | Verified in `MANDATORY TEST G` |
| AC-75 | Resume uses T-021 armActiveTurnDeadline | PASS | Calls verified `armActiveTurnDeadline` |
| AC-76 | Fresh deadline = authoritativeResumeTimeMs + 30000 | PASS | Verified in `MANDATORY TEST G, H` |
| AC-77 | Fresh deadline does not use old deadline | PASS | Verified in `MANDATORY TEST H` |
| AC-78 | Fresh deadline does not use old remaining time | PASS | Verified in `MANDATORY TEST H` |
| AC-79 | New alarm kind = TURN_DEADLINE | PASS | Verified in `MANDATORY TEST G` |
| AC-80 | New alarm dueAt = new deadline | PASS | Verified in `MANDATORY TEST G` |
| AC-81 | New alarm generation = resumed resultingRevision | PASS | Verified in `MANDATORY TEST G` (gen 10) |
| AC-82 | T-021 arming adds zero extra revision | PASS | Verified in `MANDATORY TEST G` |
| AC-83 | One Resume = one Room revision increment | PASS | Verified in `MANDATORY TEST G` |
| AC-84 | Additional Living reconnect on active Room is NOT_APPLICABLE | PASS | Verified in `MANDATORY TEST I` |
| AC-85 | Additional Living reconnect does not reset deadline | PASS | Verified in `MANDATORY TEST I` |
| AC-86 | Extra socket for already-connected Living Player does not reset deadline | PASS | Verified in `MANDATORY TEST J` |
| AC-87 | Pause primitive reacts to lifeStatus elimination even with unchanged registry | PASS | Verified in `MANDATORY TEST M` |
| AC-88 | Resulting in-progress Match with zero connected Living players can Pause | PASS | Verified in `MANDATORY TEST M` |
| AC-89 | T-020 is not modified for elimination composition | PASS | `packages/room-runtime/src/gameplay-transaction.ts` untouched |
| AC-90 | T-023 is not modified for elimination composition | PASS | `packages/room-runtime/src/system-timeout-transaction.ts` untouched |
| AC-91 | MATCH_FINISHED Pause = NOT_APPLICABLE | PASS | Verified in `MANDATORY TEST N` |
| AC-92 | MATCH_FINISHED Resume = NOT_APPLICABLE | PASS | Verified in `MANDATORY TEST N` |
| AC-93 | Winner state never converted to PAUSED | PASS | Verified in `MANDATORY TEST N` |
| AC-94 | Evidence states Finished precedence over future Pause composition | PASS | Documented in Architectural Distinctions |
| AC-95 | LOBBY Pause/Resume NOT_APPLICABLE | PASS | Verified in `returns NOT_APPLICABLE for LOBBY and ABANDONED lifecycles` |
| AC-96 | ABANDONED Pause/Resume NOT_APPLICABLE | PASS | Verified in `returns NOT_APPLICABLE for LOBBY and ABANDONED lifecycles` |
| AC-97 | No RandomSource required | PASS | Zero RNG in presence-lifecycle |
| AC-98 | No Date.now | PASS | `Date.now` is not used in room-runtime |
| AC-99 | No performance.now | PASS | `performance.now` is not used in room-runtime |
| AC-100 | No Math.random | PASS | `Math.random` is not used in room-runtime |
| AC-101 | No crypto entropy | PASS | `crypto` entropy is not used in room-runtime |
| AC-102 | Input Room immutable | PASS | Verified in `MANDATORY TEST O` |
| AC-103 | Input Match immutable | PASS | Verified in `MANDATORY TEST O` |
| AC-104 | Input Hands immutable | PASS | Verified in `MANDATORY TEST O` |
| AC-105 | Input presence registries immutable | PASS | Verified in `MANDATORY TEST O` |
| AC-106 | No WebSocket implementation | PASS | Deferred |
| AC-107 | No Durable Object implementation | PASS | Deferred |
| AC-108 | No provider alarm API | PASS | Deferred |
| AC-109 | No SQLite/persistence implementation | PASS | Deferred |
| AC-110 | No actual concurrency implementation | PASS | Deferred |
| AC-111 | No recipient projection | PASS | Deferred |
| AC-112 | No client presence authority | PASS | Server authority only |
| AC-113 | No client lifecycle authority | PASS | Server authority only |
| AC-114 | T27 remains deferred | PASS | Mandatory Stage-04 security requirement deferred |
| AC-115 | T-021 regression remains PASS | PASS | `packages/room-runtime/tests/turn-deadline.test.ts` PASS |
| AC-116 | T-022 regression remains PASS | PASS | `packages/room-runtime/tests/timed-gameplay-transaction.test.ts` PASS |
| AC-117 | T-023 regression remains PASS | PASS | `packages/room-runtime/tests/system-timeout-transaction.test.ts` PASS |
| AC-118 | T-024 regression remains PASS | PASS | `packages/room-runtime/tests/presence.test.ts` PASS |
| AC-119 | T-017/T-018 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-protocol.test.ts` & `gameplay-admission.test.ts` PASS |
| AC-120 | No game-core source changes | PASS | `packages/game-core/src` untouched |
| AC-121 | No game-core test changes | PASS | `packages/game-core/tests` untouched |
| AC-122 | No package changes | PASS | `package.json` files untouched |
| AC-123 | No package-lock changes | PASS | `package-lock.json` untouched |
| AC-124 | No external dependencies | PASS | 0 new dependencies |
| AC-125 | npm ci PASS | PASS | Verified clean install |
| AC-126 | npm run typecheck PASS | PASS | Verified clean typecheck across all workspaces |
| AC-127 | npm test PASS | PASS | 445 tests passing across 26 test files |
| AC-128 | room-runtime direct typecheck PASS | PASS | Verified direct workspace typecheck |
| AC-129 | room-runtime direct tests PASS | PASS | 194 tests passing across 10 test files |
| AC-130 | game-core direct typecheck/tests PASS unchanged | PASS | 251 tests passing across 16 test files |
| AC-131 | Evidence maps AC-01 through AC-130 | PASS | Documented in AC Mapping |
| AC-132 | Evidence records exact zero-Living Pause proof | PASS | Documented in Direct Scenario Proofs (Test C) |
| AC-133 | Evidence records exact 0→1 Resume proof | PASS | Documented in Direct Scenario Proofs (Test G) |
| AC-134 | Evidence records fresh resume-time +30000 deadline proof | PASS | Documented in Direct Scenario Proofs (Test H) |
| AC-135 | Evidence records old timeout trigger stale after Pause | PASS | Documented in Direct Scenario Proofs (Test D) |
| AC-136 | Evidence records paused client gameplay blocked | PASS | Documented in Direct Scenario Proofs (Test E) |
| AC-137 | Evidence records additional reconnect no timer reset | PASS | Documented in Direct Scenario Proofs (Test I, J) |
| AC-138 | Evidence records Eliminated reconnect cannot Resume | PASS | Documented in Direct Scenario Proofs (Test F) |
| AC-139 | Evidence records unchanged-registry post-elimination Pause proof | PASS | Documented in Direct Scenario Proofs (Test M) |
| AC-140 | Evidence records Match-finished precedence boundary | PASS | Documented in Direct Scenario Proofs (Test N) |
| AC-141 | Evidence explicitly defers gameplay/presence composition | PASS | Documented in Deferred Scope |
| AC-142 | Evidence explicitly defers WebSocket/provider/persistence integration | PASS | Documented in Deferred Scope |
| AC-143 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Status set to IMPLEMENTED awaiting Architect verification |

---

## Direct Scenario Proof Summaries

### Scenario A — Active with One Living Connected (AC-10)
- Room in `MATCH_ACTIVE` with Living `p1` connected returns `NO_CHANGE`.
- `revision: 8`, `currentTurnDeadline: 31000`, `activeAlarm` intact.

### Scenario B — Active with Current Player Disconnected (AC-13)
- Current turn player is disconnected, but another Living player remains connected.
- Evaluates to `NO_CHANGE`, timer continues unaffected.

### Scenario C — Zero Living Connections Pause (AC-15..AC-28, AC-132)
- Room in `MATCH_ACTIVE` with 0 Living connections transitions to `MATCH_PAUSED_NO_LIVING_CONNECTIONS`.
- `revision: 8 -> 9`, `currentTurnDeadline: null`, `activeAlarm: null`.
- `currentTurnId: 'turn-1'`, Match state, and members strictly preserved.

### Scenario D — Old Timeout Trigger Invalidation (AC-37, AC-38, AC-135)
- Pre-pause `TURN_DEADLINE` trigger (`dueAt: 31000, generation: 8`) replayed against paused room (`revision: 9, activeAlarm: null`).
- Returns `STALE_ALARM` with zero Core execution and zero RNG consumption.

### Scenario E — Paused Client Gameplay Block (AC-39, AC-136)
- Client action submitted against paused Room is rejected with `MATCH_NOT_ACTIVE`.

### Scenario F — Eliminated Spectator Reconnection (AC-57, AC-58, AC-138)
- Eliminated player `p3` connects to paused room (`0 -> 0` Living presence).
- Returns `NO_CHANGE`; Room remains in `MATCH_PAUSED_NO_LIVING_CONNECTIONS` with `currentTurnDeadline: null`.

### Scenario G — Exact 0→1 Living Resume (AC-52, AC-60..AC-83, AC-133)
- Living player `p1` connects to paused room (`0 -> 1` Living presence).
- Room transitions to `MATCH_ACTIVE`.
- `revision: 9 -> 10`, `currentTurnDeadline: 120000` (`authoritativeResumeTimeMs 90000 + 30000`).
- `activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 120000, generation: 10 }`.

### Scenario H — Fresh Timer vs Old Remaining Time (AC-76..AC-78, AC-134)
- Pre-pause deadline was `31000`. Resume at `90000` sets deadline to `120000` (does not restore old deadline or remaining time).

### Scenario I & J — Additional Living Reconnect & Multi-Socket (AC-84..AC-86, AC-137)
- Connecting a second Living player (`1 -> 2`) or adding a secondary socket to an already-active Room returns `NOT_APPLICABLE` or `NO_CHANGE` without resetting the deadline.

### Scenario K & L — Malformed / Out-of-Sequence Transitions (AC-54..AC-56)
- Paused state with before-count `1` returns `INVALID_STATE`.
- Paused state with jump `0 -> 2` returns `INVALID_STATE` (fails closed).

### Scenario M — Post-Elimination Pause with Unchanged Registry (AC-87, AC-88, AC-139)
- Match in-progress where only `p1` was connected.
- Authoritative `MatchState` eliminates `p1` while other disconnected players remain alive.
- Evaluator correctly detects `connectedLivingPlayers == 0` with the unchanged presence registry and commits Pause (`MATCH_PAUSED_NO_LIVING_CONNECTIONS`).

### Scenario N — Finished Match Precedence (AC-91..AC-93, AC-140)
- `MATCH_FINISHED` room returns `NOT_APPLICABLE` for Pause and Resume, preventing finished states from ever becoming paused.

### Scenario O — Input Immutability (AC-102..AC-105)
- All input `RoomAuthorityState`, `MatchState`, player hands, and `RoomPresenceRegistry` objects remain unmutated across Pause and Resume.

---

## Regression Verification
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (445 tests across 26 test files)
  - `game-core`: 251 tests across 16 test files (all passing)
  - `room-runtime`: 194 tests across 10 test files (all passing)

---

## Deferred Scope
- Post-Core action presence/pause composition (wiring in T-020/T-023)
- Cloudflare Durable Object alarm APIs and WebSocket event dispatch
- SQLite persistence / state reload
- Reconnect orchestration
- Telegram session & authentication
- Recipient-specific projections & T27 dead-spectator hidden-Hand protection
