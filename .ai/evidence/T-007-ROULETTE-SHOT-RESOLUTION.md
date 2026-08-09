# T-007-ROULETTE-SHOT-RESOLUTION Evidence

**Task ID**: T-007-ROULETTE-SHOT-RESOLUTION
**Implementation Commit**: 5b51b514d6c2ae602dc382ee3a4c237abe3dacb3

## Files Changed
- `packages/game-core/src/index.ts`
- `packages/game-core/src/roulette-rules.ts` (created)
- `packages/game-core/tests/roulette-rules.test.ts` (created)

## RouletteShotResolution Contract
A pure, deterministic resolver `resolveRouletteShot` has been implemented in `roulette-rules.ts`. It takes `PlayerState` as input and returns a `RouletteShotResolution` object containing:
- `playerId`: PlayerId
- `shotIndex`: number
- `outcome`: RevolverOutcome ('LETHAL' | 'BLANK')
- `nextShotIndex`: number
- `eliminated`: boolean
- `updatedPlayer`: PlayerState

## Implemented Behaviors & Invariants
- **ALIVE Player Required**: Rejects attempts to shoot with an already ELIMINATED player.
- **Canonical Sequence Validation**: Requires exactly 6 outcomes with exactly 1 LETHAL and 5 BLANK outcomes.
- **Index Validation**: Validates `nextShotIndex` is a non-negative finite integer < 6. Rejects index >= 6 (exhausted revolver).
- **Consumed-Prefix Invariant**: Ensures an ALIVE player has no LETHAL outcome in their consumed prefix (`0` to `nextShotIndex - 1`).
- **Authoritative Outcome & Advancement**: Consumes `sequence[nextShotIndex]`, advances `nextShotIndex` by exactly 1, and derives elimination status without random rolls or sequence reshuffling.
- **T17 Blank Progression**: Outcome BLANK keeps player `ALIVE`, advances `nextShotIndex` by 1, and preserves the sequence without reshuffle.
- **T18 Elimination Effect**: Outcome LETHAL sets `lifeStatus = ELIMINATED` and advances `nextShotIndex` by 1. Integrates cleanly with existing turn eligibility (`isTurnEligible` returns `false`).
- **T19 Five Blanks & Sixth Lethal**: Evaluates 5 sequential BLANK shots progressing index `0 -> 1 -> 2 -> 3 -> 4 -> 5` while maintaining `ALIVE` status, followed by the 6th LETHAL shot eliminating the player at index `6`, and rejecting any 7th attempt.
- **Early Lethal Handling**: LETHAL occurring before the 6th position immediately eliminates the player and rejects subsequent shot attempts.
- **Immutability & Structural Isolation**: Input `PlayerState` and `RevolverState` are not mutated. Unchanged fields (`hand`, `sequence`, `id`, `roundStatus`) are preserved via structural sharing while fresh state containers are returned.

## Verification Commands & Results
- `npm run typecheck`: PASS
- `npm test`: PASS (114 total tests across 7 test files, 13 new focused tests for roulette-rules)
- No new dependencies added.
- No forbidden nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID`) used.

## Acceptance Criteria Results
- AC-01 PASS — RouletteShotResolution exposes playerId, shotIndex, outcome, nextShotIndex, eliminated, updatedPlayer.
- AC-02 PASS — resolveRouletteShot is a pure Player-level transition.
- AC-03 PASS — caller cannot supply outcome, shot index, elimination, or replacement sequence.
- AC-04 PASS — already-ELIMINATED Player is rejected.
- AC-05 PASS — sequence length must be exactly 6.
- AC-06 PASS — sequence composition must contain 1 LETHAL and 5 BLANK.
- AC-07 PASS — nextShotIndex must be a finite integer.
- AC-08 PASS — valid shot index is 0..5.
- AC-09 PASS — consumed prefix for ALIVE player must contain only BLANK.
- AC-10 PASS — outcome is sequence[nextShotIndex].
- AC-11 PASS — exact one-step index advancement.
- AC-12 PASS — sequence and order persistent.
- AC-13 PASS — no reshuffle or random selection performed.
- AC-14 PASS — BLANK outcome preserves lifeStatus = ALIVE.
- AC-15 PASS — T17 verified: BLANK increments index and preserves sequence without reshuffle.
- AC-16 PASS — LETHAL outcome sets lifeStatus = ELIMINATED.
- AC-17 PASS — T18 turn integration verified: ELIMINATED player is rejected by isTurnEligible.
- AC-18 PASS — LETHAL still consumes one position (nextShotIndex += 1).
- AC-19 PASS — T19 five BLANK progression verified across indices 0..5.
- AC-20 PASS — T19 sixth LETHAL verified at index 5 advancing to 6.
- AC-21 PASS — exhausted revolver (index >= 6) rejected.
- AC-22 PASS — no shot after elimination allowed.
- AC-23 PASS — early LETHAL eliminates immediately.
- AC-24 PASS — hand container and items unchanged.
- AC-25 PASS — roundStatus unchanged.
- AC-26 PASS — player ID unchanged.
- AC-27 PASS — revolver sequence container not mutated.
- AC-28 PASS — input PlayerState/RevolverState immutability preserved.
- AC-29 PASS — fresh updated PlayerState and RevolverState returned.
- AC-30 PASS — deterministic output for equivalent input.
- AC-31 PASS — no forbidden nondeterminism used.
- AC-32 PASS — no new dependencies added.
- AC-33 PASS — no Match/Round flow, CALL persistence, previousPlay mutation, Round Reset, or winner logic implemented.
- AC-34 PASS — prior Core regression suite passes cleanly.
- AC-35 PASS — npm ci, typecheck, and test all pass.
- AC-36 PASS — evidence explicitly bounds primitive scope vs downstream Round flow.
- AC-37 PASS — control files updated per normal Ledger/Evidence lifecycle only.

## Bounded Scope Confirmation
- This task does NOT integrate CALL_LIAR into MatchState.
- This task does NOT start a new Round.
- This task does NOT choose the next-Round starter.
- This task does NOT deal Cards.
- This task does NOT determine Match winner.
- Future-Round no-deal behavior is not implemented here and remains deferred to Round Reset/dealing integration.
- T20/T21 remain unimplemented.
