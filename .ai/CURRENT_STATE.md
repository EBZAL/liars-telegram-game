# Current State

**Current Stage:**
STAGE-02 — Canonical Core Engine

**Last Verified Task:**
T-004-TURN-ACTION-ELIGIBILITY

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
- canonical Card truth evaluation
- canonical whole-Play truth/lie evaluation
- T01 Pure Truth verified
- T02 Joker Truth verified
- T03 Mixed Truth verified
- T04 Mixed Lie verified
- canonical Claim rank derived from TableRank
- canonical Claim count derived from played-card count
- PlayCount restricted to 1/2/3
- authoritative hand-based card selection validation
- zero-card Play rejection
- four-card Play rejection
- unknown-card rejection
- duplicate-card rejection
- hand-size ceiling enforcement
- selection validation preserves authoritative Card objects
- RoundStatus now supports EMPTY_PENDING_CHALLENGE
- canonical TurnActionType is PLAY_CARDS | CALL_LIAR only
- PASS is not a canonical turn action
- normal turn eligibility requires ALIVE + WITH_CARDS + non-empty hand
- ELIMINATED Players are skipped
- EMPTY_SAFE Players are skipped
- EMPTY_PENDING_CHALLENGE Players are skipped as normal turn actors
- zero-hand Players are defensively ineligible
- fixed cyclic next-eligible traversal
- cyclic wrap-around
- multi-seat eligibility skipping
- no self-return when seeking next eligible Player
- deterministic living-with-cards counting in seat order
- T05 First Turn cannot challenge verified
- ordinary later turn permits PLAY_CARDS or CALL_LIAR
- mandatory-call trigger detection when exactly one ALIVE Player holds cards and a previous Play exists
- forced caller is restricted to CALL_LIAR
- out-of-turn actor receives no legal actions
- prototype-safe Player IDs remain supported
- T08 No Pass verified

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
