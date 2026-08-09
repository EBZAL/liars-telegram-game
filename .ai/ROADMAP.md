# Roadmap

## STAGE-00 — Discovery & Architecture
**Status**: COMPLETE
**Exit Gate**: PASS
**Evidence basis**:
* approved project definition;
* approved architecture;
* approved trust/security boundaries;
* approved workflow/context policy;
* approved stage plan;
* `docs/GAME_RULES.md v3`;
* final user Architecture Approval;
* successful durable PROJECT_INITIALIZATION sync.

## STAGE-01 — Domain Foundation
**Status**: COMPLETE
**Goals**: minimal TypeScript foundation, isolated game domain package, deterministic RNG/test support, foundational card/deck/player contracts
**Exit Gate**: PASS
**Evidence basis**:
* T-001-DOMAIN-FOUNDATION VERIFIED;
* implementation commit `756583ed9168a4cc23fba469308d00ef946ee3b4`;
* automated tests/typecheck PASS;
* isolated deterministic domain foundation established.

## STAGE-02 — Canonical Core Engine
**Status**: IN_PROGRESS
**Goals**: full canonical game state machine, GAME_RULES behavior, challenge/empty-hand/roulette/round flow
**Exit Gate**: canonical GAME_RULES T01–T31 covered and passing; no unresolved Core rule ambiguity; deterministic state transitions.
**Progress**:
- T-002-MATCH-ROUND-INITIALIZATION VERIFIED
- deterministic Match / Round-1 initialization established
- canonical 2/3/4-player initial dealing verified
- T-003-PLAY-RULE-PRIMITIVES VERIFIED
- canonical truth/lie and Claim derivation primitives established
- authoritative card-selection validation established
- T01-T04 and T06-T07 covered
- T-004-TURN-ACTION-ELIGIBILITY VERIFIED
- fixed cyclic eligibility and next-player traversal established
- EMPTY_PENDING_CHALLENGE domain status established
- canonical action set PLAY_CARDS / CALL_LIAR established; PASS excluded
- T05 and T08 covered
- mandatory CALL_LIAR trigger/action restriction foundation established
- T10/T13/T14 full stateful transitions remain unimplemented
- T-005-PLAY-CARDS-STATE-TRANSITION VERIFIED
- authoritative immutable PLAY_CARDS state transition established
- deterministic PlayState / previousPlay identity foundation established
- authoritative Hand → central-pile card movement established
- canonical Claim derivation integrated into committed Play state
- final-card EMPTY_PENDING_CHALLENGE behavior established
- T12 no-challenge EMPTY_SAFE transition verified
- 20-card unique/composition conservation after PLAY verified
- caller request aliasing into authoritative MatchState prevented
- T-006-CHALLENGE-RESOLUTION-PRIMITIVES VERIFIED
- pure authoritative CALL_LIAR challenge resolver established
- previousPlay-only challenge targeting established
- exact authoritative reveal-card reconciliation established
- detached reveal snapshots established
- canonical Truth/Lie challenge evaluation established
- T09 latest-Play targeting semantics verified
- T10 skipped-seat challenge targeting verified
- T11 final-Play challengeability resolution verified
- T15 correct-challenge loser/shooter identity verified
- T16 incorrect-challenge loser/shooter identity verified
- 1v1 / 3p forced-CALL resolver compatibility established
- stateful CALL_LIAR persistence remains unimplemented
- previousPlay.resolved persistence remains unimplemented
- T-007-ROULETTE-SHOT-RESOLUTION VERIFIED
- persistent authoritative Revolver Shot consumption established
- canonical sequence/composition/index invariants established
- consumed-prefix invariant established
- Shot outcome derived without new randomness or reshuffle
- exact one-position Revolver advancement established
- T17 Blank progression verified
- T18 LETHAL → ELIMINATED state effect and turn-ineligibility verified
- T19 five-Blanks/sixth-Lethal progression verified
- early-Lethal behavior verified
- post-elimination and exhausted-Revolver Shot rejection established
- Player Hand / RoundStatus remain unchanged by Shot primitive
- Challenge → Shot MatchState integration remains unimplemented
- future-Round no-deal integration remains unimplemented
- T20/T21 remain unimplemented
- Round Reset / next-Round dealing / starter selection remain unimplemented
- Winner flow remains unimplemented
- remaining canonical Core Engine behavior not yet implemented

## STAGE-03 — Player-Count & Rule Hardening
**Status**: NOT_STARTED
**Goals**: exhaustive 2/3/4-player flows, timeout behavior, edge/invariant testing
**Exit Gate**: 2-player suite PASS; 3-player suite PASS; 4-player suite PASS; selected-but-unconfirmed timeout policy PASS; invariant/property tests PASS.

## STAGE-04 — Authoritative Multiplayer
**Status**: NOT_STARTED
**Goals**: Durable Object Room Coordinator, WebSocket, revision/dedupe, persistence, timeout, Pause/Resume, hidden projections
**Exit Gate**: action dedupe; stale revision; turn validation; concurrent action safety; deadline races; unique Living presence accounting; zero-Living-connected Pause; Living-only Resume; life-status-triggered Pause evaluation; fresh 30-second Resume deadline; single activeAlarm invariant; stale/idempotent alarm behavior; persistence reload; reconnect; hidden-information projections.

## STAGE-05 — Telegram Integration
**Status**: NOT_STARTED
**Goals**: server-validated Telegram identity; Mini App bootstrap; Create/Join/Invite; Lobby; Host behavior.
**Exit Gate**: actual Telegram smoke flow works; `startapp` room flow works; Lobby-only joins; 2–4 capacity enforcement; no mid-match join; 60-second Host grace; Host migration; secrets not exposed.

## STAGE-06 — Gameplay UI/UX
**Status**: NOT_STARTED
**Goals**: mobile-first gameplay UI; responsive 2/3/4-player layouts; LIAR/turn/table/roulette clarity; winner/play-again UX.
**Exit Gate**: complete match playable via UI; required gameplay state understandable; Telegram viewport/safe-area supported; presentation never owns authority.

## STAGE-07 — Multiplayer & Failure Hardening
**Status**: NOT_STARTED
**Goals**: multi-client E2E; reconnect/fault/race/security testing.
**Exit Gate**: 2/3/4-player E2E; all Living disconnect; eliminated spectator remains while paused; Eliminated reconnect does not Resume; Living reconnect resumes; multi-tab identity; stale alarms; duplicate alarms; action/deadline races; hibernation/reload; hidden-info leakage tests; regression suite PASS.

## STAGE-08 — Friend MVP Release
**Status**: NOT_STARTED
**Goals**: free-tier deployment; Telegram release smoke; operational readiness; rollback readiness.
**Exit Gate**: real friend match successfully completed; free-tier deployment operational; no release blocker; rollback/recovery procedure documented.
