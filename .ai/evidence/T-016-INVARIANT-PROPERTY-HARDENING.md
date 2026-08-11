# Evidence: T-016-INVARIANT-PROPERTY-HARDENING

**Task ID:** `T-016-INVARIANT-PROPERTY-HARDENING`  
**Stage:** `STAGE-03 — Player-Count & Rule Hardening`  
**Workflow Profile:** `STANDARD`  
**Risk Level:** `MEDIUM`  
**Status:** `IMPLEMENTED`  
**Implementation Commit:** `34af916c0a1cbef14cfc427a95643eb63299e959`  

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
| **Repeated Table Rank Legality** | Consecutive same Table Rank | **PASS** | Proves I28 repeated rank acceptance |
| **Regression Suite** | All packages & scenarios | **251 tests / 16 files** | 100% PASS |

---

## 3. Non-Vacuous Observation Metrics Across Traces

- **`EMPTY_SAFE` States Observed:** `> 0` (Verified in trace sweep and state checker via `isTurnEligible = false`)
- **`ALIVE` Empty-Hand States Observed:** `> 0` (Verified in trace sweep)
- **Fresh Next Rounds Observed:** `> 0` (Verified fresh 5-card distribution)
- **Finished Matches Observed:** `> 0` (Verified single winner ID)

---

## 4. GAME_RULES §24 Invariant Coverage Matrix

| Invariant | Short Description | Classification | Evidence / Location |
|---|---|---|---|
| **I01** | PlayerCount only 2–4 | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A sweep & rejection of 0, 1, 5, 6) |
| **I02** | Deck always 20 = 6K + 6Q + 6A + 2J | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D2) |
| **I03** | Living Player gets exactly 5 Cards at fresh Round start | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D7) |
| **I04** | Eliminated Player gets no Cards | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D7) |
| **I05** | Table Rank only K/Q/A | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D3) |
| **I06** | Joker always valid for Table Rank | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C) |
| **I07** | Claim Rank always = Table Rank | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C, F) |
| **I08** | Claim Count always = played Card count | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C, F) |
| **I09** | Legal PLAY = 1..min(3, handCount) | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D3, F) |
| **I10** | Pass does not exist | `SCENARIO_VERIFIED` | `two-player-flow.test.ts`, `three-player-flow.test.ts`, `four-player-flow.test.ts` |
| **I11** | CALL_LIAR forbidden on first Turn | `SCENARIO_VERIFIED` | `turn-rules.test.ts`, `two-player-flow.test.ts` |
| **I12** | Only latest unresolved Play is challengeable | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D3, explicit CALL target proof) |
| **I13** | Reveal only Cards of previousPlay | `SCENARIO_VERIFIED` | `challenge-rules.test.ts` |
| **I14** | One invalid Card makes whole Play Lie | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C) |
| **I15** | Correct Caller → Accused shoots | `SCENARIO_VERIFIED` | `call-liar-transition.test.ts` |
| **I16** | Wrong Caller → Caller shoots | `SCENARIO_VERIFIED` | `call-liar-transition.test.ts` |
| **I17** | Revolver sequence persists for Match | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D8) |
| **I18** | Blank consumes progress; no Revolver reshuffle | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D8, shooter index +1 delta proof) |
| **I19** | Lethal is only Basic elimination route | `SCENARIO_VERIFIED` | `roulette-rules.test.ts`, `call-liar-transition.test.ts` |
| **I20** | Empty Hand is not elimination | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D4, non-vacuous empty-hand observation) |
| **I21** | Final-card Play remains challengeable | `SCENARIO_VERIFIED` | `play-transition.test.ts`, `two-player-flow.test.ts` |
| **I22** | Next eligible PLAY closes prior challenge window | `SCENARIO_VERIFIED` | `play-transition.test.ts`, `three-player-flow.test.ts` |
| **I23** | EMPTY_SAFE Player skipped for remainder of Round | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D4/D5 `isTurnEligible = false` & non-vacuous observation) |
| **I24** | Sole Player with Cards must CALL_LIAR | `SCENARIO_VERIFIED` | `three-player-flow.test.ts`, `four-player-flow.test.ts` |
| **I25** | Next Round all Living Players receive fresh Hands | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D7, non-vacuous next round observation) |
| **I26** | Surviving round loser starts next Round | `SCENARIO_VERIFIED` | `round-transition.test.ts` |
| **I27** | Eliminated round loser → next Living seat starts | `SCENARIO_VERIFIED` | `round-transition.test.ts`, `four-player-flow.test.ts` |
| **I28** | Repeated Table Rank is legal | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group L repeated rank proof) |
| **I29** | Dead spectator cannot receive Living hidden Hands | `STAGE04_DEFERRED` | Mandatory Stage-04 T27 recipient-projection work |
| **I30** | Match ends immediately with exactly one Living Player | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D6, non-vacuous finished match observation) |
| **I31** | Variant mechanics do not enter Basic | `SCENARIO_VERIFIED` | `domain.test.ts`, `initialization.test.ts` |
| **I32** | Timeout auto-plays exactly one random current-Hand Card | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group I) |
| **I33** | Timeout fallback has no Truth/Lie/Joker bias | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group I) |

### Summary Classification Counts:
- **PROPERTY_DIRECT:** 20
- **SCENARIO_VERIFIED:** 12
- **STAGE04_DEFERRED:** 1 (I29 alone; explicitly retains mandatory T27 Stage-04 work)
- **TOTAL:** 33

---

## 5. Verification Execution Results

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

## 6. File Impact Summary

- **New Test File**:
  - `packages/game-core/tests/core-invariants.property.test.ts` (750 lines, 9 property test blocks)
- **Product Source Files**:
  - `NONE` (Zero source modifications)
- **Control Files Updated**:
  - `.ai/TASK_LEDGER.yaml`
  - `.ai/evidence/T-016-INVARIANT-PROPERTY-HARDENING.md`
