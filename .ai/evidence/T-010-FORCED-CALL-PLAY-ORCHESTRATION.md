# Evidence Record — T-010-FORCED-CALL-PLAY-ORCHESTRATION

## Task Summary

- **Task ID:** T-010-FORCED-CALL-PLAY-ORCHESTRATION
- **Stage:** STAGE-02 — Canonical Core Engine
- **Implementation SHA:** `ddc348c44973a3c8f82aa5c262fb4f60690504b5`
- **Files Modified/Created:**
  - `packages/game-core/src/play-command-transition.ts` [NEW]
  - `packages/game-core/src/index.ts` [MODIFY]
  - `packages/game-core/tests/play-command-transition.test.ts` [NEW]

---

## Architectural & Design Verification

### Required Claims & Disclaimers

- Canonical PLAY_CARDS command orchestration established via `applyPlayCardsCommand`.
- T13 automatic 1v1 forced CALL complete.
- T14 automatic 3-player forced CALL complete.
- Mandatory CALL is executed without client/user second action.
- Automatic forced CALL reuses verified T-009 (`applyCallLiar`).
- Ordinary PLAY consumes no RNG.
- Forced CALL may canonically produce Next Round (`NEXT_ROUND`) or Match Winner (`MATCH_WON`).
- PLAY/Challenge/Shot metadata retained across automatic Round reset.
- The low-level `applyPlayCards` primitive remains intentionally unchanged.
- The canonical command-level PLAY entry point is `applyPlayCardsCommand`.
- `SYSTEM_TIMEOUT` is NOT implemented.
- T29/T30/T31 remain unimplemented.
- No Room/network/persistence/Telegram/UI behavior is implemented.

---

## Technical Details

### Command-Level PLAY Transition Contract

`applyPlayCardsCommand` accepts `(state: MatchState, actorId: PlayerId, requestedCardIds: readonly string[], random: RandomSource)` and returns `PlayCardsCommandResult`:

```ts
export interface ForcedCallCommandResult {
  readonly callerId: PlayerId;
  readonly challenge: ChallengeResolution;
  readonly shot: CallLiarShotResult;
  readonly terminal: CallLiarTerminal;
  readonly winnerId: PlayerId | null;
}

export interface PlayCardsCommandResult {
  readonly state: MatchState;
  readonly createdPlay: PlayState;
  readonly forcedCall: ForcedCallCommandResult | null;
}
```

### Transition Steps & Invariants

1. **Low-level Primitive Execution:** Invokes `applyPlayCards(state, actorId, requestedCardIds)` first.
2. **Created Play Snapshot:** Immediately captures a detached snapshot `createdPlay` from `postPlayState.round.previousPlay` before any potential Round reset clears `previousPlay`.
3. **Forced Call Detection:** Uses T-004 `getForcedCallerId(postPlayState.seatOrder, postPlayState.players, true)`.
4. **Ordinary Path:** If `forcedCallerId === null`, returns `{ state: postPlayState, createdPlay, forcedCall: null }`. Consumes zero calls on `RandomSource`.
5. **Invariants:**
   - Requires `forcedCallerId === postPlayState.round.currentPlayerId`.
   - Requires `getAllowedTurnActions(...)` for the forced caller to be exactly `['CALL_LIAR']`.
6. **Automatic Dispatch:** Executes `applyCallLiar(postPlayState, forcedCallerId, random)` within the same transition.
7. **Final State & Metadata:** Returns `callResult.state` as the single authoritative `state`, with `createdPlay` and `forcedCall` summary metadata (without any nested `state` in `forcedCall`).

---

## Acceptance Criteria Mapping (AC-01 through AC-44)

- **AC-01 (Command-level PLAY API):** PASS — `applyPlayCardsCommand` exported from `@liars-telegram-game/game-core`.
- **AC-02 (Reuse PLAY primitive):** PASS — Delegates low-level play to `applyPlayCards`.
- **AC-03 (Created Play snapshot):** PASS — Returns detached `createdPlay` snapshot.
- **AC-04 (Play snapshot identity):** PASS — Snapshot matches created Play attributes (`playId`, `cardIds`, `count`, `claimedRank`, `resolved: false`).
- **AC-05 (Forced detection reuse):** PASS — Delegates forced caller identification to T-004 `getForcedCallerId`.
- **AC-06 (Ordinary path):** PASS — Returns `forcedCall = null` when no forced caller condition exists.
- **AC-07 (No RNG ordinary path):** PASS — Ordinary path accepts `ThrowingRandom` without calling RNG.
- **AC-08 (Forced current-player invariant):** PASS — Throws invariant error if forced caller is not post-play `currentPlayerId`.
- **AC-09 (Forced action invariant):** PASS — Throws invariant error if forced caller allowed actions is not `['CALL_LIAR']`.
- **AC-10 (Reuse CALL transition):** PASS — Invokes verified T-009 `applyCallLiar`.
- **AC-11 (No external CALL needed):** PASS — Dispatches automatic CALL in the same command execution.
- **AC-12 (T13 automatic dispatch):** PASS — 1v1 final Play automatically executes opponent CALL.
- **AC-13 (T13 target):** PASS — Forced caller challenges newly created Play.
- **AC-14 (T13 BLANK continuation):** PASS — BLANK shot outcome creates next Round with surviving loser starting.
- **AC-15 (T13 LETHAL winner):** PASS — LETHAL shot outcome immediately finishes match with sole survivor winner.
- **AC-16 (No next-Round RNG on forced winner):** PASS — MATCH_WON terminal accepts `ThrowingRandom` during CALL resolution.
- **AC-17 (T14 automatic dispatch):** PASS — 3-player scenario with 2 empty hands automatically dispatches sole card holder's CALL.
- **AC-18 (T14 caller):** PASS — Sole living player with cards is forced caller.
- **AC-19 (T14 target):** PASS — Forced CALL targets newly created Play even if prior history exists.
- **AC-20 (No forced call with >=2 card-holders):** PASS — Match remains unresolved in normal turn cycle when >=2 hold cards.
- **AC-21 (T12 preserved):** PASS — Previous EMPTY_PENDING_CHALLENGE player transitions to EMPTY_SAFE when next player chooses PLAY.
- **AC-22 (New-play precedence):** PASS — Automatic CALL targets newly created Play, leaving previous EMPTY_SAFE player untouched.
- **AC-23 (Already-forced actor cannot PLAY):** PASS — PLAY command rejected if actor is already required to CALL.
- **AC-24 (First-turn compatibility):** PASS — Legal first-turn PLAY executes normally without error.
- **AC-25 (Play ID exactly once):** PASS — `playId` created once by `applyPlayCards` and `playSequence` increments once.
- **AC-26 (Hand mutation exactly once):** PASS — Cards removed once from actor's hand.
- **AC-27 (Pile mutation exactly once):** PASS — Played cards appended once to `centralPile`.
- **AC-28 (Challenge exactly once):** PASS — Exactly one `applyCallLiar` call executed.
- **AC-29 (Shot exactly once):** PASS — Shot index advances by exactly 1 on shooter's revolver.
- **AC-30 (No duplicated Round/winner logic):** PASS — Round reset and winner logic completely delegated to T-009.
- **AC-31 (Metadata survives reset):** PASS — `createdPlay`, `challenge`, and `shot` remain accessible on result even when `state.round.previousPlay` is null.
- **AC-32 (Single authoritative returned state):** PASS — Only `result.state` contains MatchState (`forcedCall` has no `state` property).
- **AC-33 (Detached createdPlay):** PASS — `createdPlay` and `createdPlay.cardIds` are detached copies.
- **AC-34 (Detached forced metadata):** PASS — `forcedCall` exposes detached Challenge and Shot scalar summaries.
- **AC-35 (FINISHED rejection):** PASS — Command throws error if called on FINISHED match.
- **AC-36 (Illegal PLAY regression):** PASS — All low-level PLAY rejection rules preserved.
- **AC-37 (No downstream effects after rejected PLAY):** PASS — Rejected PLAY causes no CALL, Shot, or RNG.
- **AC-38 (Prototype safety):** PASS — Dicts with `__proto__` player IDs remain prototype-safe.
- **AC-39 (Input immutability):** PASS — `state` and `requestedCardIds` inputs are not mutated.
- **AC-40 (Determinism):** PASS — Same input + RNG produces identical output.
- **AC-41 (No forbidden nondeterminism/dependencies):** PASS — Zero direct `Math.random()`, `Date.now()`, `crypto.randomUUID()`, or external packages.
- **AC-42 (Full regression):** PASS — All 171 tests across 10 test suites pass.
- **AC-43 (Tooling):** PASS — `npm ci`, `npm run typecheck`, `npm test` all exit code 0.
- **AC-44 (Scope / Evidence / Control lifecycle):** PASS — Evidence accurately reflects ACs; no scope drift.

---

## Verification Results

### 1. `npm ci`
```text
added 80 packages, and audited 82 packages in 4s
```
Status: PASS (exited 0)

### 2. `npm run typecheck`
```text
> typecheck
> npm run typecheck --workspace=@liars-telegram-game/game-core

> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit
```
Status: PASS (exited 0)

### 3. `npm test`
```text
 RUN  v1.6.1 D:/LiarsTelegram/packages/game-core

 ✓ tests/turn-rules.test.ts  (21 tests)
 ✓ tests/play-rules.test.ts  (20 tests)
 ✓ tests/roulette-rules.test.ts  (13 tests)
 ✓ tests/challenge-rules.test.ts  (24 tests)
 ✓ tests/play-transition.test.ts  (17 tests)
 ✓ tests/initialization.test.ts  (11 tests)
 ✓ tests/call-liar-transition.test.ts  (18 tests)
 ✓ tests/play-command-transition.test.ts  (16 tests)
 ✓ tests/round-transition.test.ts  (23 tests)
 ✓ tests/domain.test.ts  (8 tests)

 Test Files  10 passed (10)
      Tests  171 passed (171)
```
Status: PASS (exited 0)

---

## Known Limitations

- `SYSTEM_TIMEOUT` / timer-based forced action dispatch is intentionally NOT implemented in T-010.
- No network, persistence, room lifecycle, UI, or Telegram handlers are included in this game-core unit.
