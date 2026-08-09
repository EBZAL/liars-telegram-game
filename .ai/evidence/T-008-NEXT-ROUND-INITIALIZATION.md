# T-008-NEXT-ROUND-INITIALIZATION Evidence

**Task ID**: T-008-NEXT-ROUND-INITIALIZATION
**Implementation Commit**: afa0ad4782b33ac73c681a55bd01b4864ab97790

## Files Changed
- `packages/game-core/src/index.ts`
- `packages/game-core/src/round-transition.ts` (created)
- `packages/game-core/tests/round-transition.test.ts` (created)

## Contract & Precondition Mechanics
`initializeNextRound(state: MatchState, roundLoserId: PlayerId, random: RandomSource): MatchState` implements the bounded deterministic transition to initialize a subsequent Round after Challenge and Shot resolution.
- **Preconditions**: Requires `previousPlay != null` and `previousPlay.resolved == true`. Requires `roundLoserId` to exist in `players` and `seatOrder`. Rejects if exactly 1 Living Player remains (winner boundary) or 0 Living Players remain.
- **T20 Surviving Loser Starter**: If `roundLoserId` is `ALIVE`, they start the next Round (`round.currentPlayerId = roundLoserId`).
- **T21 Eliminated Loser Fallback Starter**: If `roundLoserId` is `ELIMINATED`, starter falls forward to the first `ALIVE` seat in fixed `seatOrder`, wrapping around and skipping multiple eliminated seats if necessary.
- **T22 Safe-Empty Return**: `ALIVE` players in `EMPTY_SAFE` or `EMPTY_PENDING_CHALLENGE` states return to `WITH_CARDS` and receive 5 fresh cards.
- **Eliminated No-Deal**: `ELIMINATED` players receive 0 cards (`hand = []`), remain `ELIMINATED`, and preserve their `revolver`.
- **2/3/4-Living Partitions**: Deals 5 cards to each Living player (4 Living = 20 dealt / 0 undealt; 3 Living = 15 dealt / 5 undealt; 2 Living = 10 dealt / 10 undealt).
- **Full Card Conservation**: Re-creates full 20-card deck (6K/6Q/6A/2J) with 20 unique IDs across Living hands and undealt cards. Central pile is cleared (`centralPile = []`).
- **Table Rank & T28**: Table rank is independently shuffled from `createTableDeck()` (KING/QUEEN/ACE only). T28 confirmed: repeated Table Rank across consecutive rounds is legal.
- **Play Sequence Continuity**: Preserves `round.playSequence` across Round reset so the next PLAY in the new Round consumes the preserved sequence ID.
- **Revolver & Match Persistence**: Revolver sequence and `nextShotIndex` are preserved without reshuffle or reset. `seatOrder`, `firstRoundStarter`, `winnerId` (null), and `status` ('IN_PROGRESS') remain unchanged.
- **Prototype Safety**: Returned `players` dictionary is prototype-safe (`Object.create(null)`) and retains own-property support for `__proto__` Player ID.
- **Input Immutability**: Input `MatchState` and nested containers are not mutated.

## Bounded Scope Confirmation
This task assumes Challenge and Shot have already been resolved. It does NOT implement stateful CALL_LIAR. It does NOT set `previousPlay.resolved=true`. It does NOT execute Roulette. It does NOT determine or persist Match winner. It rejects next-Round creation when exactly one Living Player remains. T26 remains deferred.

## Verification Commands & Results
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (137 total tests across 8 test files, 23 new focused tests for round-transition)
- No new dependencies added.
- No forbidden nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID`) used.

## Acceptance Criteria Results
- AC-01 PASS — initializeNextRound is a pure deterministic next-Round transition.
- AC-02 PASS — post-Shot boundary: does not execute Challenge or Shot behavior.
- AC-03 PASS — resolved previousPlay (previousPlay != null && resolved == true) required.
- AC-04 PASS — unknown roundLoserId rejected.
- AC-05 PASS — next-Round participation derived only from lifeStatus === 'ALIVE'.
- AC-06 PASS — 1 Living Player rejects next-Round creation (winner boundary).
- AC-07 PASS — 0 Living Players rejects as invalid state.
- AC-08 PASS — T20 verified: surviving round loser starts next Round.
- AC-09 PASS — T21 verified: eliminated round loser falls forward to next ALIVE seat.
- AC-10 PASS — fallback starter search wraps around fixed seatOrder.
- AC-11 PASS — fallback starter search skips multiple consecutive ELIMINATED seats.
- AC-12 PASS — roundNumber increments by 1.
- AC-13 PASS — fresh Table Rank shuffled from createTableDeck().
- AC-14 PASS — TableRank is KING, QUEEN, or ACE only.
- AC-15 PASS — T28 verified: repeated Table Rank in consecutive Rounds is legal.
- AC-16 PASS — fresh full 20-card Liar deck created and shuffled.
- AC-17 PASS — Living Players dealt in fixed seatOrder order.
- AC-18 PASS — every Living Player receives exactly 5 new Cards.
- AC-19 PASS — every ELIMINATED Player receives 0 Cards (hand = []).
- AC-20 PASS — T22 verified: ALIVE EMPTY_SAFE Player returns WITH_CARDS with 5 Cards.
- AC-21 PASS — ALIVE EMPTY_PENDING_CHALLENGE Player returns WITH_CARDS with 5 Cards.
- AC-22 PASS — Living WITH_CARDS Player receives a fresh 5-card Hand.
- AC-23 PASS — 4-Living partition: 20 dealt / 0 undealt.
- AC-24 PASS — 3-Living partition: 15 dealt / 5 undealt.
- AC-25 PASS — 2-Living partition: 10 dealt / 10 undealt.
- AC-26 PASS — full Card conservation: exactly 20 unique cards (6K/6Q/6A/2J).
- AC-27 PASS — central pile cleared (centralPile = []).
- AC-28 PASS — previousPlay cleared (previousPlay = null).
- AC-29 PASS — playSequence preserved across Round transition.
- AC-30 PASS — first new PLAY in new Round consumes preserved playSequence ID.
- AC-31 PASS — Revolver sequence and nextShotIndex preserved for all Players.
- AC-32 PASS — no Revolver reshuffle or reset performed.
- AC-33 PASS — fixed seatOrder preserved.
- AC-34 PASS — firstRoundStarter preserved.
- AC-35 PASS — status ('IN_PROGRESS') and winnerId (null) preserved.
- AC-36 PASS — prototype-safe Players dictionary with __proto__ key support.
- AC-37 PASS — input MatchState and sub-containers remain unmutated.
- AC-38 PASS — deterministic output for equivalent state + RNG input.
- AC-39 PASS — no forbidden nondeterminism or dependency changes.
- AC-40 PASS — prior Core regression suite (T-001..T-007) passes cleanly.
- AC-41 PASS — npm ci, typecheck, and test all pass.
- AC-42 PASS — scope strictly bounded; stateful CALL, Shot execution, winner persistence deferred.
- AC-43 PASS — evidence explicitly accounts for AC-01 through AC-44 and canonical tests.
- AC-44 PASS — control files updated per normal Ledger/Evidence lifecycle only.
