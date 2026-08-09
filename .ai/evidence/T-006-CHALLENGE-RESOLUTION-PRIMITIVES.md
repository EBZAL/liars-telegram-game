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
