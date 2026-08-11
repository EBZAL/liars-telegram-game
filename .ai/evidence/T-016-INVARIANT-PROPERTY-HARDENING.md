# Evidence: T-016-INVARIANT-PROPERTY-HARDENING

**Task ID:** `T-016-INVARIANT-PROPERTY-HARDENING`  
**Stage:** `STAGE-03 — Player-Count & Rule Hardening`  
**Workflow Profile:** `STANDARD`  
**Risk Level:** `MEDIUM`  
**Status:** `IMPLEMENTED`  
**Implementation Commit:** `b73e023dd15ee272fb491810ce1964cb382782f6`  

---

## 1. Executive Summary

Task `T-016-INVARIANT-PROPERTY-HARDENING` implemented a deterministic, dependency-free Core invariant and property testing suite (`packages/game-core/tests/core-invariants.property.test.ts`).

### Core Execution Findings:
- **Task Remained Test-Only:** **YES** (Zero modifications to `packages/game-core/src/**`).
- **Product Defect Discovered:** **NO** (All 249 tests across 16 files pass cleanly).
- **Architecture Change Required:** **NO** (Core engine architecture preserved).
- **External Dependencies Added:** **NO** (Zero external property testing libraries; pure `SeededRandom` LCG / Mulberry32 integer arithmetic).

---

## 2. Property Harness Metrics

| Metric | Target / Rule | Executed Count / Status | Notes |
|---|---|---|---|
| **Deterministic Seeded RNG** | Integer-only arithmetic, no `Math.random` | **PASS** | `SeededRandom` & `ScriptedRandom` |
| **Initialization Player Sweep** | Player counts 2, 3, 4 | **3 counts** | `[2, 3, 4]` |
| **Initialization Seed Sweep** | Seeds 0..31 per player count | **32 seeds** | 96 initialization cases total |
| **Initialization Cases** | Total initialization tests | **96 cases** | All 96 cases verified against `assertCoreStateInvariants` |
| **Generated Trace Sweep** | 2/3/4 players × seeds 0..15 | **48 traces** | Bounded to max 24 commands per trace |
| **Executed Command Count** | Total legal commands across traces | **120+ commands** | Driven by pure `getAllowedTurnActions` |
| **Truth/Lie Combinatorics** | Tuples 1..3 × Table Ranks K/Q/A | **252 cases** | 84 rank tuples × 3 Table Ranks |
| **Timeout Index Sweep** | Hand indices 0..4 × 2/3/4P × 3 seeds | **45 cases** | Verified index choice, 1-card count, RNG economy |
| **Deterministic Replay** | Multi-command trace replay equality | **6 replays** | Verified `finalState` and `eventLog` deep equality |
| **Prototype-Safe Trace** | `__proto__`, `constructor` IDs | **1 trace** | Verified `Object.getPrototypeOf(players) === null` |
| **Regression Suite** | All packages & scenarios | **249 tests / 16 files** | 100% PASS |

---

## 3. GAME_RULES §24 Invariant Coverage Matrix

| Invariant | Short Description | Classification | Evidence / Location |
|---|---|---|---|
| **I01** | Player count 2–4 | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A) |
| **I02** | Canonical 20-Card Deck (6K/6Q/6A/2J) | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D2) |
| **I03** | Living fresh-Round Hand = 5 | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D7) |
| **I04** | Eliminated fresh-Round Hand = 0 | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D7) |
| **I05** | Table Rank K / Q / A | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D3) |
| **I06** | Joker truth validity | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C) |
| **I07** | Claim Rank = Table Rank | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C, F) |
| **I08** | Claim Count = played Card count | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C, F) |
| **I09** | Legal PLAY card count 1..3 | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D3, F) |
| **I10** | Round starter first Play | `SCENARIO_VERIFIED` | `two-player-flow.test.ts`, `three-player-flow.test.ts` |
| **I11** | Fixed turn order cyclic turn-passing | `SCENARIO_VERIFIED` | `two-player-flow.test.ts`, `four-player-flow.test.ts` |
| **I12** | Latest Play active challenge target | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D3, F) |
| **I13** | Challenge resolution truth check | `SCENARIO_VERIFIED` | `challenge-rules.test.ts` |
| **I14** | Any invalid Card makes Play Lie | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group C) |
| **I15** | Challenger loses -> Roulette | `SCENARIO_VERIFIED` | `call-liar-transition.test.ts` |
| **I16** | Liar loses -> Roulette | `SCENARIO_VERIFIED` | `call-liar-transition.test.ts` |
| **I17** | Revolver sequence persistence | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group A, D8) |
| **I18** | Blank shot sequence progression | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D8, F) |
| **I19** | Lethal shot elimination | `SCENARIO_VERIFIED` | `roulette-rules.test.ts`, `call-liar-transition.test.ts` |
| **I20** | Empty Hand is not elimination | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D4) |
| **I21** | EMPTY_PENDING_CHALLENGE state | `SCENARIO_VERIFIED` | `play-transition.test.ts`, `two-player-flow.test.ts` |
| **I22** | EMPTY_SAFE state | `SCENARIO_VERIFIED` | `play-transition.test.ts`, `four-player-flow.test.ts` |
| **I23** | EMPTY_SAFE turn ineligible | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D5) |
| **I24** | Sole-holder forced CALL | `SCENARIO_VERIFIED` | `three-player-flow.test.ts`, `four-player-flow.test.ts` |
| **I25** | Fresh Round 5-card distribution | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D7) |
| **I26** | Round reset deck re-shuffle | `SCENARIO_VERIFIED` | `round-transition.test.ts` |
| **I27** | Round reset Table Rank selection | `SCENARIO_VERIFIED` | `round-transition.test.ts` |
| **I28** | Repeated Table Rank legal | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D3) |
| **I29** | Dead spectator hidden Hand protection | `STAGE04_DEFERRED` | Mandatory Stage-04 T27 recipient-projection work |
| **I30** | Finished match single winner | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group D6) |
| **I31** | System timeout auto-play | `SCENARIO_VERIFIED` | `system-timeout-transition.test.ts` |
| **I32** | System timeout exactly 1 Card | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group I) |
| **I33** | System timeout rank-unbiased index selection | `PROPERTY_DIRECT` | `core-invariants.property.test.ts` (Group I) |

---

## 4. Verification Execution Results

### Commands Executed:
1. `npm ci`: PASS (0 tracked file changes)
2. `npm run typecheck`: PASS (0 type errors)
3. `npm test`: PASS (16 test files, 249 total tests)

### Verification Totals:
- **Total Test Files**: 16
- **Total Tests**: 249
- **`core-invariants.property.test.ts` Tests**: 7 test blocks (covering 400+ property assertions)
- **Tracked File Changes from `npm ci`**: 0
- **Dependency Changes**: 0
- **Product Source Changes**: 0 (`packages/game-core/src/**` unmodified)
- **Forbidden Nondeterminism Result**: PASS (No `Math.random()`, `Date.now()`, etc.)

---

## 5. File Impact Summary

- **New Test File**:
  - `packages/game-core/tests/core-invariants.property.test.ts` (587 lines, 7 property test blocks)
- **Product Source Files**:
  - `NONE` (Zero source modifications)
- **Control Files Updated**:
  - `.ai/TASK_LEDGER.yaml`
  - `.ai/evidence/T-016-INVARIANT-PROPERTY-HARDENING.md`
