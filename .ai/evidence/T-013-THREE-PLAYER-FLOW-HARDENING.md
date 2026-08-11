# Evidence: T-013-THREE-PLAYER-FLOW-HARDENING

## Task Identification

- **Task ID**: `T-013-THREE-PLAYER-FLOW-HARDENING`
- **Implementation Commit**: `414d7c1e1fdab0c9fdda558bdb753fc2b179705d`
- **Task Remained Test-Only**: `YES`
- **Product Code Defect Found**: `NO`

---

## Technical Summary

A dedicated 3-player canonical flow hardening suite has been created and strengthened in `packages/game-core/tests/three-player-flow.test.ts`. This suite proves that the verified pure Game Core correctly composes 3-player initialization, cyclic turn flow, empty-safe turn skipping, latest-Play challenge targeting, T14 automatic forced CALL, the complete 4-branch Truth/Lie × Blank/Lethal matrix, 3-player Round reset (5/5/5 + 5 undealt), 3 → 2 Living transition after first elimination (5/5 + 10 undealt), fallback starter selection around eliminated seats, post-elimination turn skipping, Revolver persistence, Play ID monotonic continuity, 3-player `SYSTEM_TIMEOUT` integration, input immutability, determinism, and `__proto__` prototype safety.

No production code changes were required; the verified Core primitives fully support all canonical 3-player invariants without defect.

---

## Key Scenario & Rule Verification

1. **Real 3-Player Initialization**:
   - `initializeMatch(['A', 'B', 'C'], rng)` deals 5 cards to A, 5 to B, 5 to C, leaving 5 undealt cards.
   - Verified canonical 20-card partition: 6 KING, 6 QUEEN, 6 ACE, 2 JOKER across hands + undealt cards.
2. **Ordinary Cyclic Turn Flow**:
   - Fixed seat order `P1 -> P2 -> P3 -> P1` verified across 3 consecutive legal non-final 1-card `PLAY` commands.
3. **Empty-Safe Transition & Skipping**:
   - Player A plays final card: `roundStatus` becomes `EMPTY_PENDING_CHALLENGE`. No forced CALL while B and C both hold cards (`playersWithCards = 2`).
   - Player B plays next: closes A's challenge window, converting A to `EMPTY_SAFE`. Turn skips A and advances to C.
   - Player C calls liar: targets B's newly created play (`playId`, `accusedPlayerId = 'B'`), never A's closed older play.
4. **Canonical T14 Pre-Final Fixture & Forced CALL**:
   - Established canonical fixture with A `EMPTY_SAFE`, B `WITH_CARDS` (1 final card, current player), C `WITH_CARDS` (1 card), 13 central pile cards, 5 undealt cards (total 20 conserved cards: 6K/6Q/6A/2J).
   - B final PLAY automatically triggers C CALL without external command or manual challenge invocation.
5. **Four-Branch T14 Matrix & Revolver / Deck Hardening**:
   - **Truth + Blank**: C caller loses challenge, shoots BLANK (`shotIndex` 0 -> `nextShotIndex` 1). 3 Living players survive. Round 2 deals 5/5/5 with 5 undealt. Surviving loser C starts Round 2. Safe-empty A returns to `WITH_CARDS` with 5 cards. All three Revolver sequences deep-equal pre-reset sequences; only shooter C index advances (0 -> 1); non-shooters A and B indices remain unchanged (0).
   - **Lie + Blank**: B accused loses challenge, shoots BLANK (`shotIndex` 0 -> `nextShotIndex` 1). 3 Living players survive. Round 2 deals 5/5/5 with 5 undealt. Surviving loser B starts Round 2. Shooter B index advances (0 -> 1); non-shooters A and C indices remain unchanged (0).
   - **Truth + Lethal (C Eliminated)**: C caller loses challenge, shoots LETHAL. C eliminated. Match does NOT finish because 2 Living players (A & B) remain (`terminal = NEXT_ROUND`, `status = IN_PROGRESS`, `winnerId = null`). Round 2 deals 5/5 to A & B with 10 undealt (`A.hand + B.hand + undealtCards = 20` cards, 20 unique IDs, 6K/6Q/6A/2J). Eliminated C receives 0 cards. Eliminated shooter C's Revolver sequence persists and index advances (0 -> 1); living players A and B Revolver sequences persist and indices remain unchanged. Starter fallback wraps from C to A in `['A', 'B', 'C']` cycle.
   - **Lie + Lethal (B Eliminated)**: B accused loses challenge, shoots LETHAL. B eliminated. Match does NOT finish (`terminal = NEXT_ROUND`, `status = IN_PROGRESS`, `winnerId = null`). Round 2 deals 5/5 to A & C with 10 undealt. Eliminated B receives 0 cards. Starter fallback advances from B to C in `['A', 'B', 'C']` cycle.
   - **Exactly One Shot Across Matrix (AC-36)**: All four automatic T14 matrix branches prove `forcedCall != null`, `forcedCall.challenge.playId === createdPlay.playId`, `forcedCall.shot.shotIndex === 0`, and `forcedCall.shot.nextShotIndex === 1` (`nextShotIndex === shotIndex + 1`).
6. **Post-Elimination Seat Skipping (AC-33)**:
   - In 2-living-player Round after C elimination, executing actual `A -> B -> A` command sequence (`A` plays card -> `currentPlayerId = B`; `B` plays card -> `currentPlayerId = A`) proves C eliminated seat is skipped while preserving original fixed 3-seat `seatOrder = ['A', 'B', 'C']`.
7. **Play ID Monotonic Continuity (AC-34)**:
   - On Blank -> new Round state, first actual PLAY in next Round receives later unique Play ID (`r2Play.createdPlay.playId > finalPlayId`).
8. **SYSTEM_TIMEOUT Integration**:
   - Ordinary 3-player timeout auto-plays 1 card from hand (5 -> 4 cards), creating valid play claiming `tableRank`.
   - Final-card T14 timeout auto-plays B's only card and triggers automatic forced CALL, challenge, shot (`shotIndex` 0 -> `nextShotIndex` 1), and Round reset.
9. **Immutability & Determinism (AC-40, AC-41)**:
   - Source `MatchState` immutability verified via JSON snapshot comparison for ordinary PLAY, empty-safe `A -> B` transition sequence, T14 forced final PLAY, and `SYSTEM_TIMEOUT`.
   - Deterministic execution verified across duplicate inputs with identical RNG sequences for ordinary 3p flow, forced Blank flow, and 3 -> 2 lethal flow.
10. **Prototype Safety**:
    - `__proto__` handled safely as PlayerId in 3-player match initialization and command transitions.

---

## Acceptance Criteria Mapping

| Criteria | Description | Status | Evidence / Test |
|---|---|---|---|
| AC-01 | Dedicated 3-player scenario suite exists | PASS | `packages/game-core/tests/three-player-flow.test.ts` |
| AC-02 | Real initialization verifies 5/5/5 with 5 undealt | PASS | `three-player-flow.test.ts` Section 1 |
| AC-03 | Initial canonical 20-card unique 6K/6Q/6A/2J partition verified | PASS | `three-player-flow.test.ts` Section 1 |
| AC-04 | Ordinary three-seat cyclic turn flow verified through commands | PASS | `three-player-flow.test.ts` Section 2 |
| AC-05 | A final-card PLAY does not force CALL while B and C still hold Cards | PASS | `three-player-flow.test.ts` Section 3 |
| AC-06 | A becomes EMPTY_PENDING_CHALLENGE after final PLAY | PASS | `three-player-flow.test.ts` Section 3 |
| AC-07 | B PLAY closes A's challenge window and makes A EMPTY_SAFE | PASS | `three-player-flow.test.ts` Section 3 |
| AC-08 | EMPTY_SAFE A is skipped and current turn advances to C | PASS | `three-player-flow.test.ts` Section 3 |
| AC-09 | C can challenge B's newest Play after A is skipped | PASS | `three-player-flow.test.ts` Section 3 |
| AC-10 | C never challenges A's closed older Play | PASS | `three-player-flow.test.ts` Section 3 |
| AC-11 | Canonical T14 20-card pre-final fixture established | PASS | `three-player-flow.test.ts` Section 4 |
| AC-12 | T14 B final PLAY automatically forces C CALL | PASS | `three-player-flow.test.ts` Section 4 |
| AC-13 | Forced CALL targets B's newly-created final Play | PASS | `three-player-flow.test.ts` Section 4 |
| AC-14 | Truth + Blank T14 branch verified | PASS | `three-player-flow.test.ts` Section 5 |
| AC-15 | Lie + Blank T14 branch verified | PASS | `three-player-flow.test.ts` Section 5 |
| AC-16 | Truth + Lethal T14 branch verified | PASS | `three-player-flow.test.ts` Section 5 |
| AC-17 | Lie + Lethal T14 branch verified | PASS | `three-player-flow.test.ts` Section 5 |
| AC-18 | BLANK Shot advances exactly one Revolver position | PASS | `three-player-flow.test.ts` Section 5 |
| AC-19 | Surviving round loser starts next Round | PASS | `three-player-flow.test.ts` Section 5 |
| AC-20 | 3-player Blank reset deals 5/5/5 with 5 undealt | PASS | `three-player-flow.test.ts` Section 5 |
| AC-21 | Post-reset 20-card unique canonical composition verified | PASS | `three-player-flow.test.ts` Section 5 |
| AC-22 | EMPTY_SAFE A returns WITH_CARDS with 5 Cards | PASS | `three-player-flow.test.ts` Section 5 |
| AC-23 | Revolver sequences persist through 3-player Round reset | PASS | `three-player-flow.test.ts` Section 5 |
| AC-24 | Non-shooter Revolver indices remain unchanged | PASS | `three-player-flow.test.ts` Section 5 |
| AC-25 | First lethal elimination in 3-player Match does not finish Match | PASS | `three-player-flow.test.ts` Section 5 |
| AC-26 | Truth+Lethal C elimination yields A/B Living two-player Round | PASS | `three-player-flow.test.ts` Section 5 |
| AC-27 | Truth+Lethal next Round has 5/5 with 10 undealt | PASS | `three-player-flow.test.ts` Section 5 |
| AC-28 | Eliminated C receives no new Hand | PASS | `three-player-flow.test.ts` Section 5 |
| AC-29 | Eliminated C fallback starter resolves to A in [A,B,C] cycle | PASS | `three-player-flow.test.ts` Section 5 |
| AC-30 | Lie+Lethal B elimination yields A/C Living two-player Round | PASS | `three-player-flow.test.ts` Section 5 |
| AC-31 | Eliminated B fallback starter resolves to C | PASS | `three-player-flow.test.ts` Section 5 |
| AC-32 | Eliminated B receives no new Hand | PASS | `three-player-flow.test.ts` Section 5 |
| AC-33 | Post-elimination ordinary turn skips eliminated seat | PASS | `three-player-flow.test.ts` Section 5 |
| AC-34 | Play identity remains monotonic across Round reset | PASS | `three-player-flow.test.ts` Section 5 |
| AC-35 | Forced branch metadata remains detached/available after reset | PASS | `three-player-flow.test.ts` Section 5 |
| AC-36 | Exactly one final PLAY, Challenge and Shot occur in automatic T14 path | PASS | `three-player-flow.test.ts` Section 4 & 5 |
| AC-37 | Ordinary 3-player SYSTEM_TIMEOUT one-card integration verified | PASS | `three-player-flow.test.ts` Section 6 |
| AC-38 | Final-card T14 SYSTEM_TIMEOUT triggers automatic forced CALL | PASS | `three-player-flow.test.ts` Section 6 |
| AC-39 | No selected-but-unconfirmed/UI selection model introduced | PASS | Verified (no UI/draft state added) |
| AC-40 | Representative 3-player input immutability verified | PASS | `three-player-flow.test.ts` Section 7 |
| AC-41 | Ordinary, forced-Blank and 3->2 lethal determinism verified | PASS | `three-player-flow.test.ts` Section 7 |
| AC-42 | __proto__ PlayerId 3-player regression verified | PASS | `three-player-flow.test.ts` Section 8 |
| AC-43 | Handcrafted fixtures conserve canonical 20-card state | PASS | `three-player-flow.test.ts` Fixture helpers |
| AC-44 | No forbidden nondeterminism / Room / projection / UI scope introduced | PASS | Verified pure game-core boundary |
| AC-45 | Full existing regression suite passes | PASS | 13 test files, 218 tests passing |
| AC-46 | npm ci / typecheck / test all PASS | PASS | Ran cleanly with 0 errors |
| AC-47 | Evidence accurately maps all ACs and any product defect | PASS | This document |
| AC-48 | Control lifecycle remains IN_PROGRESS->IMPLEMENTED only; never VERIFIED | PASS | Ledger status set to IMPLEMENTED |

---

## Verification Output

- `npm ci`: PASS (80 packages audited, 0 errors)
- `npm run typecheck`: PASS (0 type errors)
- `npm test`: PASS (13 test files, 218 total tests passed)
  - `play-rules.test.ts`: 20 passed
  - `turn-rules.test.ts`: 21 passed
  - `roulette-rules.test.ts`: 13 passed
  - `challenge-rules.test.ts`: 24 passed
  - `initialization.test.ts`: 11 passed
  - `play-transition.test.ts`: 17 passed
  - `round-transition.test.ts`: 23 passed
  - `system-timeout-transition.test.ts`: 18 passed
  - `play-command-transition.test.ts`: 16 passed
  - `call-liar-transition.test.ts`: 18 passed
  - `domain.test.ts`: 8 passed
  - `two-player-flow.test.ts`: 15 passed
  - `three-player-flow.test.ts`: 14 passed
- **Tracked-file impact by npm ci**: None
- **Dependency changes**: None
- **Product source changes**: None
- **Forbidden nondeterminism**: None detected (pure random source injection maintained)
