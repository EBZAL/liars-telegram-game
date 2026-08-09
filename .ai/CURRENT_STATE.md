# Current State

**Current Stage:**
STAGE-02 — Canonical Core Engine

**Last Verified Task:**
T-001-DOMAIN-FOUNDATION

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
Project Architect must re-read this State Sync commit, then define the first bounded STAGE-02 task, determine Workflow Profile/Risk, run the Pre-Execution Consistency Gate, and only after PASS issue exactly one Executor prompt.
