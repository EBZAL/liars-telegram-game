# Evidence: T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING

**Task ID:** `T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING`  
**Stage:** `STAGE-03 — Player-Count & Rule Hardening`  
**Workflow Profile:** `STANDARD`  
**Risk Level:** `MEDIUM`  
**Status:** `IMPLEMENTED`  
**Implementation Commit:** `e079c0a401ea7302d0c1a948431a53dc48be3914`  

---

## 1. Executive Summary

Task `T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING` created a dedicated test hardening suite (`packages/game-core/tests/timeout-selection-boundary.test.ts`) that locks and proves the approved architectural authority boundary for selected-but-unconfirmed cards at timeout.

### Boundary Wording & Scope Distinctions:
- **STAGE-03 Core authority boundary:** **PASS** (Core authority schema, `applySystemTimeout` signature, and confirmed `PLAY_CARDS` boundary fully hardened).
- **End-to-end UI highlight behavior:** **NOT IMPLEMENTED HERE** (Card highlight UI, selection components, presentation reducers remain Stage-06 UI work).
- **Room deadline/revision behavior:** **NOT IMPLEMENTED HERE** (30-second timer, `TURN_DEADLINE` alarms, late-command arbitration, revision deduplication remain Stage-04 Authoritative Multiplayer work).

### Key Boundary Rules Hardened:
- **`applySystemTimeout` signature & arity:** Locked to exactly `(state: MatchState, random: RandomSource): SystemTimeoutResult` with arity 2. No local selection or draft input parameters exist.
- **Authoritative Core Schema Isolation:** Type and runtime checks verify `MatchState`, `RoundState`, and `PlayerState` expose zero local/presentation selection properties (`selectedCards`, `draftSelection`, `highlightedCards`, etc.).
- **Local State Independence:** Local presentation selection variables exist strictly outside `MatchState`. Local selection mutations do not alter authoritative Core state (`JSON.stringify(match)` preserved).
- **Timeout Invariance under Local Highlights:** Identical `MatchState` + identical `RandomSource` with different local highlights produce deep-equal `SystemTimeoutResult` outputs (`resultA deepEquals resultB`).
- **RNG Authority & Disagreement:** Local single-card selection cannot override an RNG-selected Card; local multi-card selection cannot cause timeout to play multiple Cards (`createdPlay.count` remains strictly 1).
- **Truth/Lie/Joker Unbiased Selection:** Local pre-confirm preferences favoring Truth, Lie, or Joker cards cannot bias or alter timeout selection.
- **Confirmed `PLAY_CARDS` Authority Boundary:** Local highlighting has zero authoritative effect; confirmed `PLAY_CARDS` via `applyPlayCardsCommand` is the sole boundary where explicit Card IDs become authoritative.
- **RNG Call Economy:** Ordinary timeout card-selection phase consumes exactly 1 RNG call with `max = currentHand.length`.
- **Current Player Derivation:** Timeout actor is derived strictly from `state.round.currentPlayerId` and cannot be replaced by local selection owners.

---

## 2. Acceptance Criteria Mapping

| Acceptance Criteria | Description | Result | Evidence / Notes |
|---|---|---|---|
| **AC-01** | Dedicated selected-unconfirmed timeout boundary suite exists | **PASS** | `packages/game-core/tests/timeout-selection-boundary.test.ts` |
| **AC-02** | `applySystemTimeout` type parameters remain exactly `MatchState` + `RandomSource` | **PASS** | `expectTypeOf<Parameters<typeof applySystemTimeout>>().toEqualTypeOf<[MatchState, RandomSource]>()` |
| **AC-03** | `applySystemTimeout` runtime arity remains two | **PASS** | `expect(applySystemTimeout.length).toBe(2)` |
| **AC-04** | `MatchState` exposes no local selected-card field | **PASS** | `expectTypeOf<MatchState>().not.toHaveProperty('selectedCards')` |
| **AC-05** | `RoundState` exposes no local selected-card field | **PASS** | `expectTypeOf<RoundState>().not.toHaveProperty('selectedCards')` |
| **AC-06** | `PlayerState` exposes no local selected-card field | **PASS** | `expectTypeOf<PlayerState>().not.toHaveProperty('selectedCards')` |
| **AC-07** | No authoritative pre-confirm selection transition is introduced | **PASS** | Zero pre-confirm selection commands added |
| **AC-08** | Different local-only selection values do not alter equivalent MatchStates | **PASS** | Local array/set mutations leave `MatchState` unmutated |
| **AC-09** | Same authoritative state + same RNG + different local selections produce deep-equal timeout results | **PASS** | `resultA` deep-equals `resultB` |
| **AC-10** | Local single-card selection cannot override a different RNG-selected Card | **PASS** | Local `card0` ignored when RNG chooses `card2` |
| **AC-11** | Local multi-card selection cannot cause timeout to play multiple Cards | **PASS** | 3-card local selection yields `createdPlay.count = 1` |
| **AC-12** | Timeout `createdPlay.count` remains exactly one | **PASS** | `createdPlay.count === 1` |
| **AC-13** | Timeout `createdPlay.cardIds` length remains exactly one | **PASS** | `createdPlay.cardIds.length === 1` |
| **AC-14** | Local selection cannot bypass timeout RNG | **PASS** | RNG `nextInt` is always invoked and determines output |
| **AC-15** | Local Truth-preferred selection cannot bias timeout | **PASS** | Local KING preference yields QUEEN when RNG chooses QUEEN |
| **AC-16** | Local Lie-preferred selection cannot bias timeout | **PASS** | Local QUEEN preference yields QUEEN when RNG chooses QUEEN |
| **AC-17** | Local Joker-preferred selection cannot bias timeout | **PASS** | Local JOKER preference yields QUEEN when RNG chooses QUEEN |
| **AC-18** | RNG-selected authoritative Hand index determines `autoPlayedCardId` | **PASS** | `autoPlayedCardId = hand[rngIndex].id` |
| **AC-19** | Current Player is derived from `state.round.currentPlayerId` | **PASS** | `timedOutPlayerId = state.round.currentPlayerId` |
| **AC-20** | Local selection owner cannot replace `timedOutPlayerId` | **PASS** | External selection owner cannot alter actor ID |
| **AC-21** | Local-selection mutation leaves authoritative MatchState unchanged | **PASS** | `JSON.stringify(match)` unchanged after local push/clear |
| **AC-22** | `SYSTEM_TIMEOUT` preserves source-state immutability | **PASS** | `JSON.stringify(match)` preserved after timeout call |
| **AC-23** | Ordinary timeout card-selection phase consumes exactly one RNG call with max=current Hand size | **PASS** | `rng.calls` length 1 with `max = handSize` |
| **AC-24** | Confirmed `PLAY_CARDS` with explicit Card X authoritatively plays X | **PASS** | `applyPlayCardsCommand` plays explicit `cardX` |
| **AC-25** | Equivalent unconfirmed local selection of X does not make `SYSTEM_TIMEOUT` play X when RNG chooses Y | **PASS** | `applySystemTimeout` plays `cardY` when RNG chooses Y |
| **AC-26** | Confirmed `PLAY_CARDS` remains the explicit-card authority boundary | **PASS** | Confirmed command vs timeout branch comparison verified |
| **AC-27** | No `SELECT`/`HIGHLIGHT`/`DRAFT` Core command is added | **PASS** | No draft/selection commands exist in Core |
| **AC-28** | No authoritative selection/draft field is added to Core state | **PASS** | Schema remains clean of draft fields |
| **AC-29** | No Room revision/dedupe/deadline state is added | **PASS** | Core package isolated from Room concerns |
| **AC-30** | No UI/presentation implementation is added | **PASS** | No React/UI code added |
| **AC-31** | No new timeout rule or architecture reinterpretation is introduced | **PASS** | Baseline T-011 behavior preserved |
| **AC-32** | No client/local hint can bias Truth/Lie/Joker timeout selection | **PASS** | Unbiased RNG index selection enforced |
| **AC-33** | No dependency change | **PASS** | `package.json` unmodified |
| **AC-34** | No forbidden nondeterminism | **PASS** | Injected `RandomSource` used exclusively |
| **AC-35** | Task remains test-only unless stopped for defect/architecture change | **PASS** | Zero production source files modified |
| **AC-36** | Existing T-011/T-012/T-013/T-014 timeout behavior remains passing | **PASS** | All prior scenario suites pass |
| **AC-37** | Full regression suite passes | **PASS** | 242 tests across 15 test files PASS |
| **AC-38** | `npm ci` / `typecheck` / `test` all PASS | **PASS** | All verification commands PASSED cleanly |
| **AC-39** | Evidence distinguishes Core-boundary PASS from future Room/UI implementation | **PASS** | Explicitly stated in Executive Summary |
| **AC-40** | Evidence accurately maps all ACs and exact verification totals | **PASS** | Complete AC-01 to AC-41 mapping documented |
| **AC-41** | Control lifecycle remains `IN_PROGRESS`→`IMPLEMENTED` only; never `VERIFIED` | **PASS** | Task lifecycle set to `IMPLEMENTED` |

---

## 3. Verification Execution Results

### Commands Executed:
1. `npm ci`: PASS (0 tracked file changes)
2. `npm run typecheck`: PASS (0 type errors)
3. `npm test`: PASS (15 test files, 242 total tests)

### Verification Totals:
- **Total Test Files**: 15
- **Total Tests**: 242
- **`timeout-selection-boundary.test.ts` Tests**: 11
- **Tracked File Changes from `npm ci`**: 0
- **Dependency Changes**: 0
- **Product Source Changes**: 0 (`packages/game-core/src/**` unmodified)
- **Forbidden Nondeterminism Result**: PASS (No `Math.random()`, `Date.now()`, etc.)

---

## 4. File Impact Summary

- **New Test File**:
  - `packages/game-core/tests/timeout-selection-boundary.test.ts` (261 lines, 11 dedicated boundary test blocks)
- **Product Source Files**:
  - `NONE` (Zero source modifications)
- **Control Files Updated**:
  - `.ai/TASK_LEDGER.yaml`
  - `.ai/evidence/T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING.md`
