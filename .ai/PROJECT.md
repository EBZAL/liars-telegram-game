# Project: Liar's Telegram Game

## Status
ACTIVE

## Product Goal
Build a reliable 2–4 player Liar's Deck game playable between friends inside Telegram through a Telegram Mini App.

Priority order:
1. Correct game logic
2. Reliability / low bug count
3. Correct 2-player behavior
4. Correct 3-player behavior
5. Correct 4-player behavior
6. Multiplayer synchronization
7. Telegram Mini App usability
8. UI/UX quality
9. Visual polish

`docs/GAME_RULES.md v3` is the binding Source of Truth for Core game logic.

## Primary Users
Small private groups of friends.
This is not currently a commercial/public multiplayer service.

## Core Journey
Create Room
→ Invite / Join
→ Lobby
→ 2–4 Players
→ Start Match
→ Game
→ Winner
→ Play Again / Leave

## In Scope
* Telegram Mini App
* Telegram identity
* private rooms
* 2–4 players
* canonical Liar's Deck Basic/Classic rules from `docs/GAME_RULES.md`
* Project Timeout Override
* realtime multiplayer
* reconnect
* Living-player-aware Pause/Resume
* server-authoritative state
* hidden-information protection
* automated rule tests
* 2/3/4-player test matrices
* mobile-first UX
* play again
* near-zero-cost MVP deployment

## Out of Scope
* public matchmaking
* ranking / leaderboard
* shop / economy
* cosmetics
* battle pass
* payments
* blockchain
* AI opponents
* tournaments
* multiple modes
* Devil/Chaos/Deck 2/Dice/Poker/Slots
* advanced anti-cheat
* complex account system
* external spectators in MVP
* long-term match history
* paid VPS as default
* custom domain requirement
* microservices / Kubernetes / enterprise infrastructure

## Constraints
* Near-zero / ideally zero operating cost.
* No paid VPS by default.
* No custom domain required for MVP.
* Core Game Engine must remain independent from UI, Telegram, networking and persistence.
* Randomness must be injectable/testable.
* Client is never authoritative for game state.
* Hidden information must be filtered server-side.
* Executor context must remain bounded per AI Architect OS Runtime.

## Success Criteria
A private group can reliably play complete deterministic-rule matches with 2, 3 or 4 players through Telegram, including reconnect and failure scenarios, without violations of `docs/GAME_RULES.md`.

## Workflow Profile Policy
* **LIGHT**: Localized low-risk/non-behavioral work.
* **STANDARD**: Project default for Game Engine, canonical rule implementation, rule tests, multiplayer features, persistence, gameplay behavior, normal UI functionality. Core gameplay work must be at least STANDARD.
* **STRICT**: Use for HIGH-risk security/trust changes such as Telegram authentication, authorization boundaries, secrets, destructive production changes, sensitive deployment/security boundary changes. STRICT increases verification rigor, but does NOT authorize broad Executor context.

## Executor Context Policy
Every implementation task receives a Minimal Context Capsule only:
`WORKFLOW_PROFILE, TASK_ID, OBJECTIVE, VERIFIED_CONTEXT, ARCHITECTURE_CONSTRAINTS, SECURITY_CONSTRAINTS, DEPENDENCIES, MUST_READ, OPTIONAL_IF_NEEDED, DO_NOT_BULK_READ, ACCEPTANCE_CRITERIA, VERIFICATION_COMMANDS, STOP_CONDITIONS`
Executor must not be instructed to bulk-read full repository, full `.ai/`, full Roadmap, all ADRs, or all design/security history. STRICT means stronger verification, not larger context.
