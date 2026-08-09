# Current State

**Current Stage:**
STAGE-02 — Canonical Core Engine

**Last Verified Task:**
T-002-MATCH-ROUND-INITIALIZATION

**Current Active Task:**
None

**Verified Product Capabilities:**
- npm/TypeScript workspace foundation
- isolated packages/game-core
- canonical CardRank/Card primitives
- canonical 20-card Liar Deck composition
- canonical 3-card Table Deck composition
- PlayerCount validation for 2/3/4
- base Revolver composition 1 LETHAL + 5 BLANK
- injected RandomSource
- deterministic non-mutating shuffle
- strict TypeScript/typecheck and automated tests operational
- canonical initializeMatch boundary
- validated 2-4 unique non-empty Player IDs
- randomized fixed cyclic seat order
- random first-round starter
- per-player persistent shuffled revolver initialization
- initial ALIVE / WITH_CARDS Player states
- Round 1 state
- TableRank restricted to KING/QUEEN/ACE
- full canonical 20-card shuffled Round deck
- 5-card initial hands
- 4p: 20 dealt / 0 undealt
- 3p: 15 dealt / 5 undealt
- 2p: 10 dealt / 10 undealt
- deterministic injected-random initialization
- prototype-safe serializable Player state dictionary

**Active Blockers:**
None

**Known Failure / Issue:**
None currently evidenced.

**Open Risks:**
* Core rule correctness
* 2/3/4-player edge cases
* realtime concurrency
* timeout/reconnect races
* Telegram identity/trust boundary
* hidden information leakage
* free-tier operational constraints

**Active Architectural Constraints:**
* GAME_RULES v3 authority
* deterministic isolated Engine
* approved Cloudflare/TypeScript stack
* one Durable Object per Room
* server authority
* Local-only selection
* Living-only Pause/Resume
* one active alarm
* no D1/VPS/custom domain MVP
* no separate Bot Backend

**Next Approved Action:**
Project Architect must re-read this State Sync commit, then select the next smallest bounded STAGE-02 task, determine Workflow Profile/Risk, run the Pre-Execution Consistency Gate, and only after PASS issue exactly one Executor prompt.
