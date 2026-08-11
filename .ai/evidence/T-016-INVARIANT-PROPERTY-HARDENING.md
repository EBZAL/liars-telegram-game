# Evidence: T-016-INVARIANT-PROPERTY-HARDENING

**Task ID:** `T-016-INVARIANT-PROPERTY-HARDENING`  
**Stage:** `STAGE-03 — Player-Count & Rule Hardening`  
**Workflow Profile:** `STANDARD`  
**Risk Level:** `MEDIUM`  
**Status:** `IMPLEMENTED`  
**Implementation Commit:** `343c84f94d8575bad300037a4559e1fc7f090889`  

---

## 1. Executive Summary

Task `T-016-INVARIANT-PROPERTY-HARDENING` implemented and strengthened a deterministic, dependency-free Core invariant and property testing suite (`packages/game-core/tests/core-invariants.property.test.ts`).

### Core Execution & Boundary Proof Findings:
- **Task Remained Test-Only:** **YES** (Zero modifications to `packages/game-core/src/**`).
- **Product Defect Discovered:** **NO** (All 251 tests across 16 test files pass cleanly).
- **Architecture Change Required:** **NO** (Core engine architecture preserved).
- **External Dependencies Added:** **NO** (Zero external property testing libraries; pure `SeededRandom` LCG / Mulberry32 integer arithmetic).

---

## 2. Property Harness Metrics

| Metric | Target / Rule | Executed Count / Status | Notes |
|---|---|---|---|
| **Deterministic Seeded RNG** | Integer-only arithmetic, no `Math.random` | **PASS** | `SeededRandom` & `ScriptedRandom` |
| **Initialization Player Sweep** | Player counts 2, 3, 4 | **3 counts** | `[2, 3, 4]` |
| **Initialization Seed Sweep** | Seeds 0..31 per player count | **32 seeds** | 96 initialization cases total |
| **Invalid Count Exclusivity** | 0, 1, 5, 6 player counts rejected | **4 cases** | Proves I01 2–4 player count exclusivity |
| **Initialization Cases** | Total initialization tests | **96 cases** | All 96 cases verified against `assertCoreStateInvariants` |
| **Generated Trace Sweep** | 2/3/4 players × seeds 0..15 | **48 traces** | Bounded to max 24 commands per trace |
| **Exact Executed Command Total** | Exact integer count across traces | **894 commands** | Driven by pure `getLegalActions` / `getAllowedTurnActions` |
| **Truth/Lie Combinatorics** | Tuples 1..3 × Table Ranks K/Q/A | **252 cases** | 84 rank tuples × 3 Table Ranks |
| **Timeout Index Sweep** | Hand indices 0..4 × 2/3/4P × 3 seeds | **45 cases** | Verified index choice, 1-card count, RNG economy |
| **Deterministic Replay** | Multi-command trace replay equality | **6 replays** | Verified `finalState` and `eventLog` deep equality |
| **Prototype-Safe Trace** | `__proto__`, `constructor` IDs | **1 trace** | Verified `Object.getPrototypeOf(players) === null` |
| **Repeated Table Rank Legality** | Consecutive same Table Rank via injected RNG | **PASS** | Proves I28 repeated rank acceptance with equality assertion |
| **Regression Suite** | All packages & scenarios | **251 tests / 16 files** | 100% PASS |

---

## 3. Exact Non-Vacuous Observation Counters

| Counter | Exact Value | Semantics |
|---|---|---|
| `emptySafeStatesObserved` | **3** | ALIVE players with `roundStatus === EMPTY_SAFE` and `isTurnEligible === false` |
| `aliveEmptyStatesObserved` | **84** | ALIVE players with `EMPTY_PENDING_CHALLENGE` or `EMPTY_SAFE` (0-card hand) |
| `freshNextRoundsObserved` | **181** | Fresh states with `roundNumber > 1`, `previousPlay === null`, `centralPile === []`, `status === IN_PROGRESS` |
| `finishedMatchesObserved` | **22** | States reaching `status === FINISHED` with exactly 1 Living Player |
| `blankShotsObserved` | **159** | Roulette shots with `outcome === BLANK` (forced call + explicit call combined) |
| `freshRoundsWithEliminatedPlayerObserved` | **41** | Round 2+ fresh states containing at least one `lifeStatus === ELIMINATED` player (with `hand.length === 0` verified) |

All counters are deterministically stable across the fixed 48-trace × 894-command sweep.

---

## 4. I28 Repeated Table Rank Proof

| Property | Value |
|---|---|
| **Prior Table Rank** | `KING` |
| **Next Table Rank** | `KING` |
| **Explicit Equality Assertion** | `expect(nextTableRank).toBe(priorTableRank)` |
| **Round Number** | 2 |
| **Canonical Partition** | 20 cards, 20 unique IDs, 6K/6Q/6A/2J |
| **RNG Injection Method** | `ScriptedRandom` with Fisher-Yates table deck indices `[2, 1]` producing `[KING, QUEEN, ACE]` → `tableRank = KING` in both `initializeMatch` and `initializeNextRound` |
| **Test Location** | `PROPERTY GROUP L` in `core-invariants.property.test.ts` |

The proof would fail if the implementation ever forced `nextTableRank !== priorTableRank`.

---

## 5. GAME_RULES §24 Invariant Coverage Matrix

| Invariant | Short Description | Classification | Evidence / Location |
|---|---|---|---|
| **I01** | PlayerCount only 2–4 | `PROPERTY_DIRECT` | Group A: sweep & rejection of 0, 1, 5, 6 |
| **I02** | Deck always 20 = 6K + 6Q + 6A + 2J | `PROPERTY_DIRECT` | Group A, D2 |
| **I03** | Living Player gets exactly 5 Cards at fresh Round start | `PROPERTY_DIRECT` | Group A, D7 |
| **I04** | Eliminated Player gets no Cards | `PROPERTY_DIRECT` | Group D7, `freshRoundsWithEliminatedPlayerObserved = 41` |
| **I05** | Table Rank only K/Q/A | `PROPERTY_DIRECT` | Group A, D3 |
| **I06** | Joker always valid for Table Rank | `PROPERTY_DIRECT` | Group C |
| **I07** | Claim Rank always = Table Rank | `PROPERTY_DIRECT` | Group C, F |
| **I08** | Claim Count always = played Card count | `PROPERTY_DIRECT` | Group C, F |
| **I09** | Legal PLAY = 1..min(3, handCount) | `PROPERTY_DIRECT` | Group D3, F |
| **I10** | Pass does not exist | `SCENARIO_VERIFIED` | `two-player-flow.test.ts`, `three-player-flow.test.ts`, `four-player-flow.test.ts` |
| **I11** | CALL_LIAR forbidden on first Turn | `SCENARIO_VERIFIED` | `turn-rules.test.ts`, `two-player-flow.test.ts` |
| **I12** | Only latest unresolved Play is challengeable | `PROPERTY_DIRECT` | Group D3, explicit CALL target proof |
| **I13** | Reveal only Cards of previousPlay | `SCENARIO_VERIFIED` | `challenge-rules.test.ts` |
| **I14** | One invalid Card makes whole Play Lie | `PROPERTY_DIRECT` | Group C |
| **I15** | Correct Caller → Accused shoots | `SCENARIO_VERIFIED` | `call-liar-transition.test.ts` |
| **I16** | Wrong Caller → Caller shoots | `SCENARIO_VERIFIED` | `call-liar-transition.test.ts` |
| **I17** | Revolver sequence persists for Match | `PROPERTY_DIRECT` | Group A, D8 |
| **I18** | Blank consumes progress; no Revolver reshuffle | `PROPERTY_DIRECT` | Group D8, shooter index +1 delta, `blankShotsObserved = 159` |
| **I19** | Lethal is only Basic elimination route | `SCENARIO_VERIFIED` | `roulette-rules.test.ts`, `call-liar-transition.test.ts` |
| **I20** | Empty Hand is not elimination | `PROPERTY_DIRECT` | Group D4, `aliveEmptyStatesObserved = 84` |
| **I21** | Final-card Play remains challengeable | `SCENARIO_VERIFIED` | `play-transition.test.ts`, `two-player-flow.test.ts` |
| **I22** | Next eligible PLAY closes prior challenge window | `SCENARIO_VERIFIED` | `play-transition.test.ts`, `three-player-flow.test.ts` |
| **I23** | EMPTY_SAFE Player skipped for remainder of Round | `PROPERTY_DIRECT` | Group D4/D5, `isTurnEligible = false`, `emptySafeStatesObserved = 3` |
| **I24** | Sole Player with Cards must CALL_LIAR | `SCENARIO_VERIFIED` | `three-player-flow.test.ts`, `four-player-flow.test.ts` |
| **I25** | Next Round all Living Players receive fresh Hands | `PROPERTY_DIRECT` | Group D7, `freshNextRoundsObserved = 181` |
| **I26** | Surviving round loser starts next Round | `SCENARIO_VERIFIED` | `round-transition.test.ts` |
| **I27** | Eliminated round loser → next Living seat starts | `SCENARIO_VERIFIED` | `round-transition.test.ts`, `four-player-flow.test.ts` |
| **I28** | Repeated Table Rank is legal | `PROPERTY_DIRECT` | Group L: `priorTableRank = KING`, `nextTableRank = KING`, explicit equality assertion |
| **I29** | Dead spectator cannot receive Living hidden Hands | `STAGE04_DEFERRED` | Mandatory Stage-04 T27 recipient-projection work |
| **I30** | Match ends immediately with exactly one Living Player | `PROPERTY_DIRECT` | Group D6, `finishedMatchesObserved = 22` |
| **I31** | Variant mechanics do not enter Basic | `SCENARIO_VERIFIED` | `domain.test.ts`, `initialization.test.ts` |
| **I32** | Timeout auto-plays exactly one random current-Hand Card | `PROPERTY_DIRECT` | Group I |
| **I33** | Timeout fallback has no Truth/Lie/Joker bias | `PROPERTY_DIRECT` | Group I |

### Summary Classification Counts:
- **PROPERTY_DIRECT:** 20
- **SCENARIO_VERIFIED:** 12
- **STAGE04_DEFERRED:** 1 (I29 alone; explicitly retains mandatory T27 Stage-04 work)
- **TOTAL:** 33

---

## 6. Verification Execution Results

### Commands Executed:
1. `npm ci`: PASS (0 tracked file changes)
2. `npm run typecheck`: PASS (0 type errors)
3. `npm test`: PASS (16 test files, 251 total tests)

### Verification Totals:
- **Total Test Files**: 16
- **Total Tests**: 251
- **`core-invariants.property.test.ts` Tests**: 9 test blocks
- **Tracked File Changes from `npm ci`**: 0
- **Dependency Changes**: 0
- **Product Source Changes**: 0 (`packages/game-core/src/**` unmodified)
- **Forbidden Nondeterminism Result**: PASS (No `Math.random()`, `Date.now()`, etc.)

---

## 7. File Impact Summary

- **Modified Test File**:
  - `packages/game-core/tests/core-invariants.property.test.ts` (9 property test blocks)
- **Product Source Files**:
  - `NONE` (Zero source modifications)
- **Control Files Updated**:
  - `.ai/TASK_LEDGER.yaml`
  - `.ai/evidence/T-016-INVARIANT-PROPERTY-HARDENING.md`
