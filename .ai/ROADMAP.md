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
**Exit Gate**: canonical Core-relevant GAME_RULES T01–T26 and T28–T31 covered and passing; T27 dead-spectator hidden-information behavior remains mandatory but is evaluated under STAGE-04 recipient-specific hidden-information projections; no unresolved Core rule ambiguity; deterministic state transitions.
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
- T-008-NEXT-ROUND-INITIALIZATION VERIFIED
- deterministic post-Shot next-Round initialization established
- T20 surviving-loser starter verified
- T21 eliminated-loser cyclic fallback starter verified
- T22 safe-empty Player return verified
- ALIVE EMPTY_PENDING_CHALLENGE return established
- Living-only next-Round dealing established
- Eliminated-player no-deal behavior established for continuing Matches
- canonical 4/3/2-Living Round partitions verified
- fresh full 20-card Round redistribution verified
- fresh Table Rank shuffle established
- T28 repeated Table Rank legal
- previousPlay / centralPile Round cleanup established
- match-wide playSequence continuity across Round reset established
- persistent Revolver state across Round reset established
- T-009-CALL-LIAR-MATCH-TRANSITION VERIFIED
- Core IN_PROGRESS / FINISHED Match lifecycle established
- authoritative stateful CALL_LIAR transition established
- Challenge → Shot → Next-Round integration established
- previousPlay resolved lifecycle integrated
- shooter == roundLoser invariant enforced
- T15 correct-challenge path integrated
- T16 incorrect-challenge path integrated
- T17 BLANK progression integrated
- T18 LETHAL elimination integrated
- T20 surviving-loser next-Round starter integrated
- T21 eliminated-loser fallback starter integrated
- T26 immediate last-Living winner implemented
- winner branch prevents creation of another Round
- winner branch consumes no next-Round randomness
- FINISHED Core Match rejects subsequent gameplay transitions
- Challenge/Shot resolution metadata survives Round Reset
- 1v1 mandatory-caller stateful CALL execution verified
- 3-player mandatory-caller stateful CALL execution verified
- T-010-FORCED-CALL-PLAY-ORCHESTRATION VERIFIED
- canonical command-level PLAY_CARDS orchestration established
- low-level applyPlayCards remains independently verified and unchanged
- automatic post-PLAY forced-CALL dispatch established
- T13 1v1 mandatory automatic CALL complete
- T13 BLANK continuation through automatic CALL verified
- T13 LETHAL/T26 winner path through automatic CALL verified
- T14 3-player mandatory automatic CALL complete
- forced CALL targets the newly-created latest Play
- T12 prior challenge-window closure / EMPTY_SAFE semantics preserved
- ordinary PLAY path consumes no RNG
- forced-caller/current-player invariant enforced
- forced caller exact CALL_LIAR-only eligibility enforced
- forced orchestration reuses verified T-009
- no duplicate Challenge/Roulette/Round/winner logic introduced
- PLAY/Challenge/Shot metadata retained after automatic Round reset
- single authoritative command result MatchState established
- prototype-safe participant behavior retained
- T-011-SYSTEM-TIMEOUT-AUTO-PLAY VERIFIED
- pure authoritative SYSTEM_TIMEOUT Core effect established
- timeout actor derived from authoritative currentPlayerId
- local pre-confirm selection ignored by Core authority
- mandatory CALL-only timeout auto-PLAY rejected
- exact one-card random authoritative-Hand fallback established
- timeout RNG begins with nextInt(currentHand.length)
- no truth/Lie/Joker selection bias introduced
- T29 verified
- T30 verified
- T31 verified
- first-turn timeout fallback verified
- ordinary later PLAY/CALL turn timeout chooses one-card PLAY
- T12 semantics preserved through timeout PLAY
- timeout final-card PLAY reuses T-010 forced-CALL orchestration
- timeout forced BLANK continuation verified
- timeout forced LETHAL/T26 winner verified
- exactly-one-Shot integration verified
- winner path proves zero next-Round RNG
- malformed current Player cases reject before RNG
- prototype-safe timeout path verified
- Core timeout effect is deterministic
- Core contains no deadline/clock/alarm implementation
- authoritative 30-second scheduling remains Room/Application responsibility
- TURN_DEADLINE alarm, stale alarm handling and late-command arbitration remain Stage-04/runtime work
- original-PC exact auto-selection algorithm remains Source Gap
- project one-random-card override implemented
- all currently identified pure Core GAME_RULES behavior required for the STAGE-02 boundary is implemented and VERIFIED through T-011
- Stage-02 Exit Gate remains NOT_EVALUATED pending Architect re-read
- T27 dead-spectator hidden-Hand protection is not a pure Core transition and remains mandatory Stage-04 recipient-projection/security work
- actual 30-second deadline scheduling, TURN_DEADLINE alarms, stale-alarm handling, late-command arbitration, revision/dedupe, Pause/Resume, networking and persistence remain later Room/Application work and are not Stage-02 Core gaps

## STAGE-03 — Player-Count & Rule Hardening
**Status**: NOT_STARTED
**Goals**: exhaustive 2/3/4-player flows, timeout behavior, edge/invariant testing
**Exit Gate**: 2-player suite PASS; 3-player suite PASS; 4-player suite PASS; selected-but-unconfirmed timeout policy PASS; invariant/property tests PASS.

## STAGE-04 — Authoritative Multiplayer
**Status**: NOT_STARTED
**Goals**: Durable Object Room Coordinator, WebSocket, revision/dedupe, persistence, timeout, Pause/Resume, hidden projections, T27 dead-spectator hidden-Hand protection (Eliminated spectators receive Public State only and cannot read Living Players' hidden Hand values)
**Exit Gate**: action dedupe; stale revision; turn validation; concurrent action safety; deadline races; unique Living presence accounting; zero-Living-connected Pause; Living-only Resume; life-status-triggered Pause evaluation; fresh 30-second Resume deadline; single activeAlarm invariant; stale/idempotent alarm behavior; persistence reload; reconnect; recipient-specific hidden-information projections, including T27 dead-spectator Hand isolation.


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
