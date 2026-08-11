# Evidence: T-014-FOUR-PLAYER-FLOW-HARDENING

**Task ID:** `T-014-FOUR-PLAYER-FLOW-HARDENING`  
**Stage:** `STAGE-03 — Player-Count & Rule Hardening`  
**Workflow Profile:** `STANDARD`  
**Risk Level:** `MEDIUM`  
**Status:** `IMPLEMENTED`  
**Implementation Commit:** `947fc6cb3f9521780ced5b4103aa0e017c7be55b`  

---

## 1. Executive Summary

Task `T-014-FOUR-PLAYER-FLOW-HARDENING` created a dedicated, exhaustive 4-player canonical flow hardening suite (`packages/game-core/tests/four-player-flow.test.ts`) proving that the already-VERIFIED pure Game Core composes correctly across the unique 4-player state-space.

### Key Capabilities Verified:
- **Real 4-player initialization**: 4 ALIVE Players with 5 Cards each, 20 dealt / 0 undealt Cards, and canonical 20-card unique 6K/6Q/6A/2J partition.
- **Ordinary four-seat cyclic turn flow**: Turn order rotates cyclically P1 → P2 → P3 → P4 → P1 through public commands while all Players retain Cards.
- **Multi-EMPTY_SAFE seat skipping**: From a 20-card canonical fixture with A and C `EMPTY_SAFE`, B plays a card → turn skips C to D; D plays a card → turn skips both A and C to wrap back to B. Fixed `seatOrder` remains `['A', 'B', 'C', 'D']`.
- **Latest Play targeting across empty seats**: `applyCallLiar` executed after skipped empty seats correctly challenges B's newest Play, not D's older Play.
- **4-player sole-holder mandatory CALL**: With A and B `EMPTY_SAFE`, C holding 1 final Card, and D holding 1 Card, C playing its final Card automatically forces D to `CALL_LIAR` on C's newly created Play without external CALL commands.
- **Four-branch Truth/Lie × Blank/Lethal matrix**: Verified for 4-player fixtures, each branch resolving exactly one Shot-index advance.
- **4-player Blank reset**: Surviving round loser starts next Round, all 4 Players dealt fresh 5-card Hands with 0 undealt, and previous `EMPTY_SAFE` Players return `WITH_CARDS`.
- **First lethal 4 → 3 Living transition**: First elimination in a 4-player Match leaves 3 Living Players and does NOT finish the Match (`terminal = NEXT_ROUND`, `status = IN_PROGRESS`, `winnerId = null`).
- **4 → 3 deck-count transition**: 3 Living Players receive 5 Cards each, eliminated Player receives 0 Cards, and `undealtCards` becomes 5. Canonical 20-card partition is preserved across Living Hands + undealt Cards.
- **Eliminated-seat skipping & starter fallback**: Eliminated D starter fallback wraps to A; eliminated C starter fallback resolves to D. Post-elimination turn flow skips eliminated seats while preserving original `['A', 'B', 'C', 'D']` `seatOrder`.
- **Revolver persistence**: Sequence and index persist across 4-player Blank and 4 → 3 Lethal Round resets.
- **Play ID continuity**: Monotonic Play identity verified by executing actual next-Round PLAY (`r2Play.createdPlay.playId > finalPlayId`).
- **4-player SYSTEM_TIMEOUT integration**: Ordinary timeout auto-plays 1 card from a 5-card Hand without forced CALL; final-card timeout triggers automatic forced CALL.
- **Input immutability & determinism**: Source state immutability verified across all key transitions; deterministic equivalence verified across runs.
- **Prototype safety**: `__proto__` Player ID works cleanly in 4-player initialization and command flow.

---

## 2. Acceptance Criteria Mapping

| Acceptance Criteria | Description | Result | Evidence / Notes |
|---|---|---|---|
| **AC-01** | Dedicated four-player scenario suite exists | **PASS** | `packages/game-core/tests/four-player-flow.test.ts` |
| **AC-02** | Real 4-player initialization verifies 5/5/5/5 | **PASS** | `pA`, `pB`, `pC`, `pD` each have 5 Cards |
| **AC-03** | Four-player initialization has zero undealt Cards | **PASS** | `match.round.undealtCards` length is 0 |
| **AC-04** | Initial 20-card unique 6K/6Q/6A/2J partition verified | **PASS** | 20 unique Card IDs, 6 KING, 6 QUEEN, 6 ACE, 2 JOKER |
| **AC-05** | Ordinary four-seat cyclic PLAY flow P1→P2→P3→P4→P1 verified | **PASS** | `applyPlayCardsCommand` executed 4 times in sequence |
| **AC-06** | Canonical multi-EMPTY_SAFE 20-card fixture established | **PASS** | `createCanonicalFourPlayerMultiEmptySafeState` helper |
| **AC-07** | Multiple EMPTY_SAFE seats are skipped through eligibility | **PASS** | B PLAY skips C to D; D PLAY skips A & C to B |
| **AC-08** | Fixed seatOrder remains unchanged while empty seats are skipped | **PASS** | `seatOrder` remains `['A', 'B', 'C', 'D']` |
| **AC-09** | Latest Play remains correct Challenge target across skipped empty seat | **PASS** | `applyCallLiar` challenges B's newest Play |
| **AC-10** | Canonical four-player sole-holder forced-CALL fixture established | **PASS** | `createCanonicalFourPlayerSoleHolderState` helper |
| **AC-11** | Sole remaining card-holder D automatically CALLs C final Play | **PASS** | `result.forcedCall.callerId = 'D'` |
| **AC-12** | Forced CALL targets C newly-created final Play | **PASS** | `forcedCall.challenge.playId = result.createdPlay.playId` |
| **AC-13** | Truth + Blank four-player branch verified | **PASS** | D loses Challenge, shoots BLANK, starts Round 2 |
| **AC-14** | Lie + Blank four-player branch verified | **PASS** | C loses Challenge, shoots BLANK, starts Round 2 |
| **AC-15** | Truth + Lethal four-player branch verified | **PASS** | D eliminated, A/B/C Living, Match remains `IN_PROGRESS` |
| **AC-16** | Lie + Lethal four-player branch verified | **PASS** | C eliminated, A/B/D Living, Match remains `IN_PROGRESS` |
| **AC-17** | All four automatic branches resolve exactly one Shot-index advance | **PASS** | `shotIndex = 0`, `nextShotIndex = 1` for all 4 matrix branches |
| **AC-18** | Four-player Blank reset deals 5/5/5/5 with zero undealt | **PASS** | All 4 Living Players dealt 5 Cards, `undealtCards` = 0 |
| **AC-19** | Four-player Blank reset preserves canonical 20-card composition | **PASS** | 20 unique IDs, 6 KING, 6 QUEEN, 6 ACE, 2 JOKER |
| **AC-20** | Previous EMPTY_SAFE Players return WITH_CARDS with five Cards | **PASS** | A and B return from `EMPTY_SAFE` to `WITH_CARDS` with 5 Cards |
| **AC-21** | Surviving round loser starts next Round after Blank | **PASS** | Shooter D starts Round 2 after Truth+Blank |
| **AC-22** | All Revolver sequences persist across Blank Round reset | **PASS** | Pre-reset Revolver sequences deep-equal post-reset sequences |
| **AC-23** | Only shooter Revolver index advances on Blank | **PASS** | Shooter index 0 → 1, non-shooter indices remain 0 |
| **AC-24** | First lethal elimination from four Players does not finish Match | **PASS** | `terminal = NEXT_ROUND`, `status = IN_PROGRESS`, `winnerId = null` |
| **AC-25** | Truth+Lethal D elimination yields A/B/C Living | **PASS** | A, B, C `ALIVE`; D `ELIMINATED` |
| **AC-26** | D-elimination next Round deals 5/5/5 with five undealt | **PASS** | Living A, B, C get 5 Cards each; `undealtCards` = 5 |
| **AC-27** | D-elimination 4→3 Round preserves 20 unique 6K/6Q/6A/2J Cards | **PASS** | 20 unique IDs across Living Hands + `undealtCards` |
| **AC-28** | Eliminated D receives no fresh Hand | **PASS** | D `hand` length is 0 |
| **AC-29** | Eliminated D starter fallback wraps to A | **PASS** | Round 2 starter is `'A'` |
| **AC-30** | Lie+Lethal C elimination yields A/B/D Living | **PASS** | A, B, D `ALIVE`; C `ELIMINATED` |
| **AC-31** | C-elimination next Round deals 5/5/5 with five undealt | **PASS** | Living A, B, D get 5 Cards each; `undealtCards` = 5 |
| **AC-32** | Eliminated C receives no fresh Hand | **PASS** | C `hand` length is 0 |
| **AC-33** | Eliminated C starter fallback resolves to D | **PASS** | Round 2 starter is `'D'` |
| **AC-34** | Post-4→3 command flow actually skips eliminated seat in fixed four-seat cycle | **PASS** | A → B → C → A sequence skipping eliminated D verified |
| **AC-35** | Fixed original four-seat seatOrder persists after elimination | **PASS** | `seatOrder` remains `['A', 'B', 'C', 'D']` |
| **AC-36** | Eliminated shooter Revolver sequence persists and index advances once | **PASS** | Eliminated shooter Revolver sequence preserved, index 0 → 1 |
| **AC-37** | Living Player Revolver sequences/indices remain unchanged on lethal reset | **PASS** | Living Player Revolver sequences and indices remain unchanged |
| **AC-38** | First actual next-Round PLAY receives a later unique Play ID | **PASS** | `r2Play.createdPlay.playId > finalPlayId` |
| **AC-39** | Forced branch metadata remains returned after Round reset | **PASS** | `createdPlay`, `challenge`, `shot`, `terminal` retained |
| **AC-40** | Ordinary four-player SYSTEM_TIMEOUT one-card integration verified | **PASS** | 5 → 4 Cards, `count = 1`, `claimedRank = tableRank`, `forcedCall = null` |
| **AC-41** | Final-card four-player SYSTEM_TIMEOUT triggers automatic forced CALL | **PASS** | C timeout auto-plays final Card, D automatically CALLs |
| **AC-42** | Timeout-created Play is the forced Challenge target | **PASS** | `forcedCall.challenge.playId = createdPlay.playId` |
| **AC-43** | No selected-but-unconfirmed/UI selection model introduced | **PASS** | No draft/selection UI state added to Core |
| **AC-44** | Representative input immutability verified | **PASS** | `JSON.stringify(state)` unchanged after operations |
| **AC-45** | Ordinary / forced Blank / 4→3 Lethal deterministic equivalence verified | **PASS** | Identical inputs produce `toEqual` results |
| **AC-46** | `__proto__` four-player regression verified | **PASS** | Null-prototype `players` dictionary works seamlessly |
| **AC-47** | Handcrafted fixtures conserve full canonical 20-card state | **PASS** | Pre-conditions explicitly check 20-card 6K/6Q/6A/2J partition |
| **AC-48** | No Room/network/projection/deadline/UI scope introduced | **PASS** | Core package isolated |
| **AC-49** | No forbidden nondeterminism introduced | **PASS** | Injected `RandomSource` used exclusively |
| **AC-50** | Task remains test-only unless PRODUCT_DEFECT_DISCOVERED causes Architect re-decision | **PASS** | Zero production source files modified |
| **AC-51** | Full existing regression suite passes | **PASS** | 231 tests across 14 test files PASS |
| **AC-52** | `npm ci` / `typecheck` / `test` all PASS | **PASS** | All verification commands PASSED cleanly |
| **AC-53** | Evidence accurately maps every AC and actual verification totals | **PASS** | Document accurately records all verification totals |
| **AC-54** | Control lifecycle remains READY→IN_PROGRESS→IMPLEMENTED only; never VERIFIED | **PASS** | Task lifecycle set to `IMPLEMENTED` |

---

## 3. Verification Execution Results

### Commands Executed:
1. `npm ci`: PASS (0 tracked file changes)
2. `npm run typecheck`: PASS (0 type errors)
3. `npm test`: PASS (14 test files, 231 total tests)

### Verification Totals:
- **Total Test Files**: 14
- **Total Tests**: 231
- **`four-player-flow.test.ts` Tests**: 13
- **Tracked File Changes from `npm ci`**: 0
- **Dependency Changes**: 0
- **Product Source Changes**: 0 (`packages/game-core/src/**` unmodified)
- **Forbidden Nondeterminism Result**: PASS (No `Math.random()`, `Date.now()`, etc.)

---

## 4. File Impact Summary

- **New Test File**:
  - `packages/game-core/tests/four-player-flow.test.ts` (944 lines, 13 comprehensive scenario test blocks)
- **Product Source Files**:
  - `NONE` (Zero source modifications)
- **Control Files Updated**:
  - `.ai/TASK_LEDGER.yaml`
  - `.ai/evidence/T-014-FOUR-PLAYER-FLOW-HARDENING.md`
