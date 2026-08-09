# T-003-PLAY-RULE-PRIMITIVES Evidence

**Task ID**: T-003-PLAY-RULE-PRIMITIVES
**Implementation Commit**: b42081d41e5e20eff8782a427d2608e675a504de

## Files Changed/Created
- `packages/game-core/src/index.ts` (modified)
- `packages/game-core/src/play-rules.ts` (created)
- `packages/game-core/tests/play-rules.test.ts` (created)

## Canonical Rules Covered
- §7 Table Rank
- §8 Claim (rank must be tableRank, count derived from selection)
- §9.2 PLAY_CARDS count rule (1-3 cards)
- §12 Truth / Lie Resolution (truthful if all cards are tableRank or JOKER)
- §24 invariants 5–10 and 14
- §25 T01 (Pure Truth), T02 (Joker Truth), T03 (Mixed Truth), T04 (Mixed Lie), T06 (Zero selection rejected), T07 (Four-card selection rejected)

## Verification Commands & Results
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (39 tests total passing)
- No forbidden nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID` absent): Confirmed via code inspection
- No global mutable state: Confirmed, pure functions used
- No new dependencies: Confirmed

## Acceptance Criteria Results
- AC-01: Pure play-rule module: PASS
- AC-02: Card truth: PASS
- AC-03: T01 Pure Truth: PASS
- AC-04: T02 Joker Truth: PASS
- AC-05: T03 Mixed Truth: PASS
- AC-06: T04 Mixed Lie: PASS
- AC-07: Claim rank derivation: PASS
- AC-08: Claim count derivation: PASS
- AC-09: Joker cannot be Claim rank: PASS (enforced by `TableRank` type)
- AC-10: Valid card selection: PASS
- AC-11: T06 zero-card Play: PASS
- AC-12: T07 four-card Play: PASS
- AC-13: Hand-size ceiling: PASS
- AC-14: Unknown card rejection: PASS
- AC-15: Duplicate selection rejection: PASS
- AC-16: Authoritative Card objects: PASS
- AC-17: No mutation: PASS
- AC-18: Existing canonical type safety retained: PASS
- AC-19: No forbidden nondeterminism: PASS
- AC-20: No new dependencies: PASS
- AC-21: Full regression: PASS
- AC-22: Tooling: PASS
- AC-23: Scope: PASS (no gameplay transitions implemented)
- AC-24: Control documents: PASS

## Selection Ownership & Duplicate Evidence
Tests explicitly prove that requesting duplicate IDs from the hand throws an error. Similarly, requesting IDs not present in the hand throws an error. The returned selection maps strictly to reference-equal Card objects from the provided hand array. 

## Known Limitations
- The module provides only primitives. It does not enforce turn logic, current player legality, central pile mutation, or game state transitions, which are deferred to subsequent tasks.

## Scope Confirmation
Confirmed fully IN_SCOPE. No architecture changes required. No product scope drift. No UI or persistence logic implemented.
