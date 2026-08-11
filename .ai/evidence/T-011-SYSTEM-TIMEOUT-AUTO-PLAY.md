# Evidence Record — T-011-SYSTEM-TIMEOUT-AUTO-PLAY

## Task Summary

- **Task ID:** T-011-SYSTEM-TIMEOUT-AUTO-PLAY
- **Stage:** STAGE-02 — Canonical Core Engine
- **Implementation SHA:** `fae82d03259d8d95133b54ec88ea579c756f27dc`
- **Files Modified/Created:**
  - `packages/game-core/src/system-timeout-transition.ts` [NEW]
  - `packages/game-core/src/index.ts` [MODIFY]
  - `packages/game-core/tests/system-timeout-transition.test.ts` [NEW/HARDENED]

---

## Architectural & Design Verification

### Required Claims & Disclaimers

- Authoritative `SYSTEM_TIMEOUT` Core effect established via `applySystemTimeout`.
- Canonical T29 complete (no selection at timeout -> 1 random hand card auto-played).
- Canonical T30 complete (timeout fallback never auto-plays multiple cards; always count = 1).
- Canonical T31 complete (timeout random choice is direct and unbiased by rank, truthfulness, or Joker).
- Timeout selects exactly one random card from the player's authoritative current Hand.
- Timeout selection uses direct unbiased Hand index (`random.nextInt(hand.length)`).
- Timeout auto-Play routes through canonical `applyPlayCardsCommand`.
- Timeout auto-Play preserves downstream automatic forced CALL / Challenge / Shot / Winner / Next Round composition.
- Local pre-confirm UI selections are not part of Core timeout authority.
- **The Core does NOT determine whether 30 seconds elapsed.**
- **No clock/deadline/alarm scheduling is implemented.**
- **The Room/Application layer must validate that the authoritative deadline is due before invoking `SYSTEM_TIMEOUT`.**
- **Late-command arbitration, stale alarm handling, revision/dedupe and Pause/Resume remain outside this task.**
- **Original-PC exact timeout selection algorithm remains a Source Gap.**
- **The one-random-card behavior is the project's explicit override.**

---

## Technical Details

### Command-Level SYSTEM_TIMEOUT API

`applySystemTimeout(state: MatchState, random: RandomSource)` returns `SystemTimeoutResult`:

```ts
export interface SystemTimeoutResult extends PlayCardsCommandResult {
  readonly timedOutPlayerId: PlayerId;
  readonly autoPlayedCardId: string;
}
```

### Transition Steps & Invariants

1. **Active Match Guard:** Requires `state.status === 'IN_PROGRESS'` and `state.winnerId === null`. Does not consume RNG if FINISHED.
2. **Authoritative Timed-Out Player:** Derived directly from `state.round.currentPlayerId`. Must be `ALIVE`, `WITH_CARDS`, and have `hand.length > 0`.
3. **Mandatory CALL-Only Invariant:** Inspects `getAllowedTurnActions(...)`. If actions equal `['CALL_LIAR']`, `SYSTEM_TIMEOUT` rejects before RNG consumption.
4. **PLAY Legality:** Requires `PLAY_CARDS` to be among legal turn actions for current player.
5. **Exact Random Card Selection:** Executes `selectedIndex = random.nextInt(player.hand.length)` on current Hand.
6. **Reuse T-010 Command Orchestration:** Delegates execution to `applyPlayCardsCommand(state, timedOutPlayerId, [selectedCard.id], random)` forwarding the same `RandomSource` instance.
7. **Metadata & Result:** Returns `PlayCardsCommandResult` fields plus `timedOutPlayerId` and `autoPlayedCardId`.

---

## Acceptance Criteria Mapping (AC-01 through AC-45)

- **AC-01 (SYSTEM_TIMEOUT Core API):** PASS — `applySystemTimeout` exported from `@liars-telegram-game/game-core`.
- **AC-02 (No actor input):** PASS — `timedOutPlayerId` derived from `state.round.currentPlayerId`.
- **AC-03 (No selection input):** PASS — API accepts no UI/draft selection arguments.
- **AC-04 (Active Match required):** PASS — Throws error on FINISHED match before calling RNG.
- **AC-05 (Valid current Player):** PASS — Validates player existence, `ALIVE`, `WITH_CARDS`, and non-empty hand before RNG call. Missing player ID, `ELIMINATED` status, empty hand (`[]`), and malformed `roundStatus` (e.g. `EMPTY_PENDING_CHALLENGE` / `EMPTY_SAFE`) are all explicitly tested and verified to reject with zero RNG calls.
- **AC-06 (CALL-only invariant):** PASS — Rejects timeout auto-PLAY when player is in mandatory `CALL_LIAR` state.
- **AC-07 (PLAY legality):** PASS — Rejects if `PLAY_CARDS` is not an allowed action.
- **AC-08 (Authoritative Hand):** PASS — Card selected strictly from current player's authoritative `hand`.
- **AC-09 (One direct random index):** PASS — Calls `random.nextInt(hand.length)` directly without rejection sampling.
- **AC-10 (No filtering/bias):** PASS — No pre-inspection, sorting, or filtering by rank, truthfulness, or Joker status.
- **AC-11 (Exactly one Card):** PASS — Single card ID passed to play command transition.
- **AC-12 (Reuse T-010):** PASS — Delegates PLAY execution to `applyPlayCardsCommand`.
- **AC-13 (Same RandomSource):** PASS — Forwards same `RandomSource` instance for downstream resolution.
- **AC-14 (T29 selected Card):** PASS — Card at selected index is auto-played.
- **AC-15 (T29 Hand decrease):** PASS — Hand length decreases by 1 on ordinary PLAY path.
- **AC-16 (T29 Claim count):** PASS — `createdPlay.count` equals 1.
- **AC-17 (T29 Claim rank):** PASS — `createdPlay.claimedRank` equals `tableRank`.
- **AC-18 (T29 challengeability):** PASS — Auto-played card creates normal unresolved `previousPlay`.
- **AC-19 (T30 one-card invariant):** PASS — `createdPlay.count` and `cardIds.length` are always 1, even with 3+ cards in hand.
- **AC-20 (T31 truthful selectable):** PASS — Table-rank matching card selectable by its index.
- **AC-21 (T31 Lie selectable):** PASS — Non-matching card selectable by its index.
- **AC-22 (T31 Joker selectable):** PASS — Joker selectable by its index.
- **AC-23 (Random max):** PASS — `random.nextInt` called with max = current `hand.length`.
- **AC-24 (Ordinary RNG count):** PASS — Ordinary non-forced timeout consumes exactly 1 RNG call.
- **AC-25 (First-turn timeout):** PASS — Legal first-turn timeout auto-plays 1 card normally.
- **AC-26 (Later optional-CALL timeout):** PASS — When PLAY and CALL are both legal, timeout chooses one-card PLAY.
- **AC-27 (T12 preservation):** PASS — Timeout PLAY closes prior challenge window and transitions prior empty-pending player to `EMPTY_SAFE`.
- **AC-28 (Forced CALL integration):** PASS — Timeout auto-play of final card triggers automatic `T-010` forced CALL.
- **AC-29 (Newest Play target):** PASS — Forced CALL after timeout challenges newly created timeout Play.
- **AC-30 (Forced BLANK continuation):** PASS — 1v1 timeout final card + BLANK shot creates canonical next Round.
- **AC-31 (Forced LETHAL/T26):** PASS — 1v1 timeout final card + LETHAL shot finishes Match immediately.
- **AC-32 (Winner no reset):** PASS — Winner path creates no new Round and explicitly proves exactly 1 total RNG call (the timeout index-selection call) with max=1 and returned=0, with zero subsequent next-Round RNG calls.
- **AC-33 (Metadata retention):** PASS — `timedOutPlayerId`, `autoPlayedCardId`, `createdPlay`, and `forcedCall` survive Round Reset.
- **AC-34 (Single authoritative state):** PASS — Only `result.state` contains MatchState.
- **AC-35 (No duplicate PLAY):** PASS — Hand, pile, and playSequence mutations occur exactly once.
- **AC-36 (No duplicate Challenge/Shot):** PASS — Exactly one Challenge and one Shot on forced path (explicitly verified: `shotIndex` equals `beforeShotIndex` and `nextShotIndex` equals `beforeShotIndex + 1`).
- **AC-37 (Prototype safety):** PASS — `__proto__` player ID supported as timed-out player.
- **AC-38 (Input immutability):** PASS — `MatchState` input is not mutated.
- **AC-39 (Determinism):** PASS — Equivalent input + RNG sequence produces identical result.
- **AC-40 (No forbidden nondeterminism):** PASS — Zero `Math.random`, `Date.now`, `performance.now`, `crypto.randomUUID`, `setTimeout`, or `setInterval`.
- **AC-41 (No timer/Room scope):** PASS — No clock, deadline, alarm, revision, persistence, or network transport implemented.
- **AC-42 (Full regression):** PASS — All 189 tests across 11 test suites pass.
- **AC-43 (Tooling):** PASS — `npm ci`, `npm run typecheck`, `npm test` all exit code 0.
- **AC-44 (Evidence completeness):** PASS — Evidence maps ACs and distinguishes Core effect from Room deadline.
- **AC-45 (Control lifecycle):** PASS — Ledger and Evidence lifecycle rules respected.

---

## Verification Results

### 1. `npm ci`
```text
added 80 packages, and audited 82 packages in 9s
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

 ✓ tests/roulette-rules.test.ts  (13 tests)
 ✓ tests/challenge-rules.test.ts  (24 tests)
 ✓ tests/turn-rules.test.ts  (21 tests)
 ✓ tests/play-rules.test.ts  (20 tests)
 ✓ tests/call-liar-transition.test.ts  (18 tests)
 ✓ tests/system-timeout-transition.test.ts  (18 tests)
 ✓ tests/play-transition.test.ts  (17 tests)
 ✓ tests/play-command-transition.test.ts  (16 tests)
 ✓ tests/initialization.test.ts  (11 tests)
 ✓ tests/round-transition.test.ts  (23 tests)
 ✓ tests/domain.test.ts  (8 tests)

 Test Files  11 passed (11)
      Tests  189 passed (189)
```
Status: PASS (exited 0)

---

## Known Limitations

- Realtime clock, 30-second timer scheduling, and Room Durable Object alarms are intentionally outside Core scope.
- Room-level late command arbitration and stale alarm filtering remain to be implemented in Stage 04.
