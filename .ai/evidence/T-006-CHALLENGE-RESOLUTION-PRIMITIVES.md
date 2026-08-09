# T-006-CHALLENGE-RESOLUTION-PRIMITIVES Evidence

**Task ID**: T-006-CHALLENGE-RESOLUTION-PRIMITIVES
**Implementation Commit**: a479f534fbe5d94c4d6cb1ab21192d676c6848a7

## Files Changed
- `packages/game-core/src/index.ts`
- `packages/game-core/src/challenge-rules.ts` (created)
- `packages/game-core/tests/challenge-rules.test.ts` (created)

## ChallengeResolution Contract
A pure, deterministic resolver `resolveLiarChallenge` has been implemented. It takes `MatchState` and `callerId` as input and returns a `ChallengeResolution` object containing:
- `playId`
- `callerId`
- `accusedPlayerId`
- `revealedCards`
- `playWasTruthful`
- `challengerWasCorrect`
- `roundLoserId`
- `shooterId`

## Bounded Scope Confirmation
- This task is a pure challenge-resolution primitive.
- It does NOT persist CALL_LIAR as a MatchState transition.
- It does NOT set `previousPlay.resolved = true`.
- It does NOT perform Roulette.
- It does NOT eliminate a Player.
- It does NOT start the next Round.

## Implemented Behaviors
- **CALL Authority Derivation**: Reuses T-004 `getAllowedTurnActions`. First Turn, out-of-turn caller, and ineligible callers are correctly rejected. Ordinary legal CALLs and forced CALLs are accepted.
- **Authoritative challenge target derivation**: Always targets `state.round.previousPlay` explicitly.
- **T09 latest-Play targeting semantics**: Ensures only the latest Play is targeted and never older pile Cards.
- **T10 skipped-seat challenge targeting**: Confirms skipped seats (e.g., `EMPTY_SAFE`) do not erase the challenge target.
- **T11 final-Play challengeability resolution**: Ensures `EMPTY_PENDING_CHALLENGE` final Play can be resolved normally.
- **Canonical reveal-card selection**: The exact cards from the target Play are resolved against the `centralPile`. Extraneous cards in the pile are excluded, duplicate cards in the Play or centralPile are rejected, and missing cards are rejected.
- **Truth/Lie Resolution**: Reuses T-003 `isPlayTruthful` primitive to canonical evaluation. A mixed Lie correctly resolves as a Lie.
- **Detached reveal snapshots**: The `revealedCards` array and objects are fresh copies that cannot alias or mutate the authoritative `MatchState`.
- **T15 round-loser/shooter identity**: Derived correctly when the Play is a Lie (accused loses/shoots).
- **T16 round-loser/shooter identity**: Derived correctly when the Play is Truthful (caller loses/shoots).
- **Forced-call resolver compatibility**: Both 1v1 and 3p forced-call conditions are validated and accurately supported.

## Limitations / Deferred
- T13/T14 full challenge+Roulette flow is not complete.
- T17+ (Roulette transitions) are deferred.
- Round reset and Match winner flow are deferred.

## Verification
- `npm ci`, `npm run typecheck`, and `npm test` all pass.
- No dependencies were added.
- No forbiddden APIs (Math.random, Date.now, crypto.randomUUID) were used.
- `MatchState` and `Revolver` remain completely unmodified during resolution.

## Acceptance Criteria Results
- AC-01 PASS — ChallengeResolution exposes the required result fields (playId, callerId, accusedPlayerId, revealedCards, playWasTruthful, challengerWasCorrect, roundLoserId, shooterId).
- AC-02 PASS — resolveLiarChallenge is a pure MatchState + callerId resolver.
- AC-03 PASS — no caller-provided target/play/card/truth/loser authority exists.
- AC-04 PASS — previousPlay=null rejected.
- AC-05 PASS — out-of-turn caller rejected.
- AC-06 PASS — CALL_LIAR must be in authoritative allowed actions.
- AC-07 PASS — ordinary legal CALL resolves.
- AC-08 PASS — forced 1v1 and 3p CALL states resolve.
- AC-09 PASS — only previousPlay targeted / T09.
- AC-10 PASS — skipped EMPTY_SAFE seat does not erase target / T10.
- AC-11 PASS — EMPTY_PENDING_CHALLENGE final Play resolves / T11.
- AC-12 PASS — resolved previousPlay rejected.
- AC-13 PASS — accused derived from previousPlay.playerId.
- AC-14 PASS — implementation guard verified by code inspection; tests explicitly cover missing/eliminated/EMPTY_SAFE accused.
- AC-15 PASS — count/cardIds invariant enforced.
- AC-16 PASS — claimedRank/tableRank invariant enforced.
- AC-17 PASS — duplicate target IDs rejected.
- AC-18 PASS — target Cards resolved from authoritative centralPile.
- AC-19 PASS — missing target Card rejected.
- AC-20 PASS — duplicate occurrence of a target Card in centralPile rejected.
- AC-21 PASS — unrelated pile Cards excluded from reveal/evaluation.
- AC-22 PASS — reveal follows previousPlay.cardIds order.
- AC-23 PASS — reveal array and Card snapshots detached from MatchState.
- AC-24 PASS — T-003 isPlayTruthful used with authoritative Table Rank.
- AC-25 PASS — mixed valid/Joker/invalid Play resolves as Lie.
- AC-26 PASS — T15 Lie → accused loses/shoots.
- AC-27 PASS — T16 Truth → caller loses/shoots.
- AC-28 PASS — MatchState remains unmodified.
- AC-29 PASS — previousPlay.resolved remains unmodified.
- AC-30 PASS — Revolver state is neither resolved nor mutated.
- AC-31 PASS — no elimination, winner or Round flow implemented.
- AC-32 PASS — no new dependency or forbidden nondeterminism.
- AC-33 PASS — prior Core regression suite passes.
- AC-34 PASS — npm ci / typecheck / test pass.
- AC-35 PASS — resolver remains pure; stateful CALL/Roulette/etc. deferred.
- AC-36 PASS — only normal Ledger/Evidence lifecycle control changes.
