# T-002-MATCH-ROUND-INITIALIZATION Evidence

**Task ID**: T-002-MATCH-ROUND-INITIALIZATION
**Implementation Commit**: 0bd61d3ac1a2e4d1d3bb61c84a2f349cc04a86d2

## Files Changed/Created
- `packages/game-core/src/index.ts` (modified)
- `packages/game-core/src/game-state.ts` (created)
- `packages/game-core/src/match.ts` (created)
- `packages/game-core/tests/initialization.test.ts` (created)

## Canonical Rules Covered
- §5 Match Initialization: 2-4 players, cyclic order, first player randomized, independent revolver (1 LETHAL, 5 BLANK).
- §6 Round Initialization: shuffle 20-card Liar Deck, deal 5 per player.
- §7 Table Rank: shuffle Table Deck, reveal one.
- §24 Invariants (1-5, 17, 28, 30): Player state (ALIVE/WITH_CARDS), valid deck components.
- §25 T23 / T24 / T25 (Deal numbers mapping).

## Verification Commands & Results
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (17 tests total passing)
- No forbidden nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID` absent): Confirmed via grep search
- No global mutable state: Confirmed, MatchState returned is isolated and newly allocated
- No new dependencies: Confirmed

## Acceptance Criteria Results
- AC-01: Initialization boundary: PASS
- AC-02: Player validation: PASS
- AC-03: Fixed randomized seat order: PASS
- AC-04: Initial Player state: PASS
- AC-05: Independent persistent revolver initialization: PASS
- AC-06: Random first starter: PASS
- AC-07: Round 1 baseline: PASS
- AC-08: Canonical Table Rank: PASS
- AC-09: Canonical shuffled Round deck: PASS
- AC-10: 4-player dealing / T23 (20 dealt, 0 undealt): PASS
- AC-11: 3-player dealing / T24 (15 dealt, 5 undealt): PASS
- AC-12: 2-player dealing / T25 (10 dealt, 10 undealt): PASS
- AC-13: No card duplication/loss: PASS
- AC-14: Deterministic initialization: PASS
- AC-15: No caller-input mutation: PASS
- AC-16: Independent mutable containers: PASS
- AC-17: No forbidden nondeterminism: PASS
- AC-18: No new dependencies: PASS
- AC-19: Existing T-001 regression: PASS
- AC-20: Tooling verification: PASS
- AC-21: Scope: PASS (no gameplay implemented)
- AC-22: Control documents unchanged: PASS

## Determinism Evidence
Tests demonstrate that initializing the match with the same scripted `PredictableRandom` pseudo-random source creates a deeply equivalent match state (AC-14). No external non-determinism leaks into the core Game Domain package.

## Corrective Implementation (RETURN_TO_EXECUTOR)
Original implementation SHA: 0bd61d3ac1a2e4d1d3bb61c84a2f349cc04a86d2

Architect decision: RETURN_TO_EXECUTOR

Findings:
- TableRank type allowed JOKER
- Player dictionary was not prototype-safe
- AC-13 coverage incomplete for 2p/3p

Corrective implementation SHA: 7210018af68b5218a397642fd44a8003b15e2a9b

Verification:
- npm ci: PASS
- npm run typecheck: PASS
- npm test: PASS

Regression proof:
- __proto__ player retained and serializable: Confirmed by new test
- TableRank narrowed: Confirmed by new typecheck assertion and runtime guard
- full deck partition invariant verified for 2/3/4 players: Confirmed by `expectFullDeckPartition` helper

## Known Limitations
- Readonly serialization constraints were accommodated for pure game logic, no class instances were used (pure POJOs with standard interfaces). Map was avoided in favor of `Record<PlayerId, PlayerState>` to ensure trivial standard JSON serialization for the durable objects integration in later stages.

## Scope Confirmation
Confirmed fully IN_SCOPE. No architecture changes required. No product scope drift. No UI or persistence logic implemented.
