# T-004-TURN-ACTION-ELIGIBILITY Evidence

**Task ID**: T-004-TURN-ACTION-ELIGIBILITY
**Implementation Commit**: 59030c30fff29f2bbecf23eb19158f121046e1ae

## Files Changed/Created
- `packages/game-core/src/game-state.ts` (modified)
- `packages/game-core/src/index.ts` (modified)
- `packages/game-core/src/turn-rules.ts` (created)
- `packages/game-core/tests/turn-rules.test.ts` (created)

## Canonical Coverage

Verified behavior:
- fixed cyclic seat-order traversal
- normal turn eligibility and skip behavior
- First Turn permits PLAY_CARDS only
- CALL_LIAR forbidden when no previous Play exists
- PASS is not a canonical action
- ordinary later turn action set is PLAY_CARDS or CALL_LIAR
- mandatory-call trigger detection when exactly one ALIVE Player has cards
- forced caller action restriction to CALL_LIAR
- T05 complete
- T08 complete

Source context incorporated but NOT claimed complete:
- §11 / T10: skipped-seat eligibility prerequisite only; previousPlay/challenge-target persistence deferred
- §14 / T13: 1v1 mandatory-call trigger/action restriction only; full final-card/challenge transition deferred
- §14 / T14: 3-player mandatory-call trigger/action restriction only; full challenge transition deferred
- §24 invariant 20: Empty Hand != Elimination is architectural/domain context; no empty-hand state transition is implemented here
- §24 invariant 21: final empty-hand Play remains challengeable is NOT implemented here
- §24 invariant 23: EMPTY_SAFE skip behavior is supported by eligibility rules; transition into EMPTY_SAFE is deferred
- §24 invariant 24: mandatory-call trigger/action restriction is supported; CALL_LIAR execution is deferred

## T05 / T08 Mapping
- T05: Verified by checking that when `hasPreviousPlay = false`, the only allowed action is `PLAY_CARDS` (no `CALL_LIAR` allowed).
- T08: `TurnActionType` union strictly rejects `PASS`. The `getAllowedTurnActions` never returns `PASS`. Compile-time tests assert this.

## Forced-Call Trigger Coverage
- 1v1 forced call: Detects when exactly one ALIVE player has cards remaining (after another goes EMPTY_PENDING_CHALLENGE) and restricts their actions to `CALL_LIAR`.
- 3-player forced call: Detects forced call if two players empty out and only one has cards remaining.
- Confirmed that no forced call is triggered if `hasPreviousPlay = false` (first turn).
- T13/T14 full challenge transitions are NOT claimed complete. Only mandatory-call trigger/action restriction is implemented.

## Cyclic Eligibility Coverage
- Correctly iterates forward through the cyclic seat order wrapping around using modulo arithmetic.
- Eliminates/skips players with `lifeStatus === 'ELIMINATED'`, `roundStatus === 'EMPTY_SAFE'`, `roundStatus === 'EMPTY_PENDING_CHALLENGE'`, or 0 cards in hand.
- Correctly returns `null` if no other eligible player is found.

## Prototype-Safe ID Regression
- Tests explicitly verify that a `__proto__` player ID can be retrieved from the dictionary when resolving next eligible player.

## Verification Commands & Results
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (60 tests total passing)
- No forbidden nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID` absent): Confirmed via code inspection
- No global mutable state: Confirmed, pure functions used
- No new dependencies: Confirmed

## Acceptance Criteria Results
- AC-01: Turn action type: PASS
- AC-02: No PASS / T08: PASS
- AC-03: RoundStatus extension: PASS (added EMPTY_PENDING_CHALLENGE)
- AC-04: Normal eligibility: PASS
- AC-05: Eliminated skip: PASS
- AC-06: Empty-safe skip: PASS
- AC-07: Empty-pending skip: PASS
- AC-08: Zero-hand guard: PASS
- AC-09: Fixed cyclic traversal: PASS
- AC-10: Wrap-around: PASS
- AC-11: Skip chain: PASS
- AC-12: No self-return: PASS
- AC-13: No eligible successor: PASS
- AC-14: Unknown starting seat: PASS
- AC-15: Living-with-cards counting: PASS
- AC-16: First Turn / T05: PASS
- AC-17: Ordinary later turn: PASS
- AC-18: 1v1 mandatory-call trigger: PASS
- AC-19: 3-player mandatory-call trigger: PASS
- AC-20: No forced call on first turn: PASS
- AC-21: Out-of-turn actor: PASS
- AC-22: Ineligible current actor: PASS
- AC-23: Input immutability: PASS
- AC-24: Prototype-safe Player IDs: PASS
- AC-25: No nondeterminism / dependencies: PASS
- AC-26: Regression: PASS
- AC-27: Tooling: PASS
- AC-28: Scope: PASS (no gameplay transitions implemented)
- AC-29: Control files: PASS

## Known Limitations
- Does not mutate MatchState, create plays, or resolve challenges. Full T13/T14 challenge sequences are deferred.
- T10 full behavior is NOT complete in T-004 because previousPlay/challenge-target lifecycle is intentionally outside this task.

## Scope Confirmation
Confirmed fully IN_SCOPE. No architecture changes required. No product scope drift. No UI or persistence logic implemented.
