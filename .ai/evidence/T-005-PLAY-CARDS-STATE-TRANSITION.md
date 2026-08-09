# T-005-PLAY-CARDS-STATE-TRANSITION Evidence

**Task ID**: T-005-PLAY-CARDS-STATE-TRANSITION
**Implementation Commit**: ca23d488b4a6744a5385adb5701d986b9540b2f5

## Files Changed
- `packages/game-core/src/game-state.ts`
- `packages/game-core/src/index.ts`
- `packages/game-core/src/match.ts`
- `packages/game-core/src/play-transition.ts` (created)
- `packages/game-core/tests/play-transition.test.ts` (created)

## PlayState Contract
The `PlayState` interface has been added to `game-state.ts`. It includes:
- `playId: PlayId` (a numeric sequence ID)
- `playerId: PlayerId`
- `cardIds: readonly string[]` (derived into a fresh Core-owned array)
- `count: 1 | 2 | 3`
- `claimedRank: TableRank`
- `resolved: boolean`

This strictly enforces that the caller only provides card IDs, while the canonical Core evaluates the Play count and derives the `claimedRank` from the canonical TableRank. The returned state does not alias `requestedCardIds`; post-return request mutation cannot alter MatchState.

## Play-ID Strategy
Deterministic Play identity is achieved via a monotonic `playSequence` stored in `RoundState`, initialized to `1` by `initializeMatch`. Each successful `applyPlayCards` transition uses the sequence and increments it for the new state, guaranteeing unique, non-colliding IDs within a match without nondeterminism (no Math.random/UUIDs).

## Canonical Rules Implemented
- **Authoritative Action Legality**: Out-of-turn actors, eliminated players, and actors restricted by mandatory `CALL_LIAR` rules are properly rejected via T-004 `getAllowedTurnActions`.
- **Authoritative Card Selection**: Validated using T-003 `validatePlaySelection` directly against the server hand.
- **Authoritative Claim**: Rank and Count derived via T-003 `deriveClaim`.
- **Hand Removal**: Authoritative cards accurately removed from the actor's hand using the derived authoritative selection.
- **Central Pile**: Appended correctly.
- **Previous Play Creation/Replacement**: The `previousPlay` in `RoundState` is created/updated, closing old challenge windows and leaving the final Play as the challengeable target.
- **Final-Card Status**: Actor properly transitions to `EMPTY_PENDING_CHALLENGE`.
- **Turn Advancement**: The next player is selected cyclically by skipping eliminated/empty/zero-hand players using T-004 logic.
- **T12 Mapping**: Fully implemented. When an `EMPTY_PENDING_CHALLENGE` player is the existing `previousPlay` owner, and the next player successfully chooses `PLAY_CARDS`, the prior player transitions to `EMPTY_SAFE`.
- **20-Card Conservation**: Verified through a canonical real 20-card conservation test starting from a real `initializeMatch` state. A successful PLAY maintains exactly 20 cards and 20 unique IDs across all player hands, the central pile, and undealt cards. The composition is verified to be 6 Kings, 6 Queens, 6 Aces, and 2 Jokers. Selected cards are removed exactly once from the hand and added exactly once to the central pile.

## Bounded Scope Statements
- **T09**: Bounded to latest-target state foundation only (the previousPlay replacement mechanism).
- **T10**: Bounded to skipped-seat target/eligibility foundation only. `previousPlay` safely survives ineligible seats.
- **T11**: Bounded to final-Play challengeability state only. `previousPlay` correctly points to the final play while the actor is `EMPTY_PENDING_CHALLENGE`.
- **T13 / T14**: Bounded to forced-call integration only. We explicitly verified that a forced-call state throws an error if a player attempts to `PLAY_CARDS`.
- **CALL_LIAR execution/reveal/resolution is not implemented by T-005.**

## Prototype-Safe ID Evidence
Explicit tests construct a dictionary without a prototype and a player with the ID `__proto__`. The `applyPlayCards` transition correctly resolves the player, mutates the state via Object.assign/shallow copies of the null-prototype object, and returns a new valid dictionary without prototype pollution.

## Verification
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (75 tests passing)
- No `Math.random`, `Date.now`, or UUID used.
- No new dependencies.

## Acceptance Criteria
- AC-01 to AC-36: **PASS**

## Known Limitations
- Does not implement `CALL_LIAR`, challenge resolution, elimination, round winners, or round resets.
- Does not implement networking, persistence, or Telegram UI.

## Scope Confirmation
Confirmed fully IN_SCOPE. No architecture changes. No product scope drift.
