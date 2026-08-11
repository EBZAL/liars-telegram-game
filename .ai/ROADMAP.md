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
**Status**: COMPLETE
**Goals**: full canonical game state machine, GAME_RULES behavior, challenge/empty-hand/roulette/round flow
**Exit Gate**: PASS
**Evidence basis**:
- T-002 through T-011 VERIFIED
- canonical Core-relevant T01–T26 PASS
- T28–T31 PASS
- T27 explicitly retained as mandatory STAGE-04 hidden-projection/security acceptance
- no unresolved pure-Core rule ambiguity evidenced
- deterministic Core transitions verified
- latest full regression: 189 tests PASS
- Stage-02/T27 boundary reconciled in ec9063502a30d57e87e2981d5db8d1da37eaed32
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
**Status**: COMPLETE
**Goals**: exhaustive 2/3/4-player flows, timeout behavior, edge/invariant testing
**Exit Gate**: PASS
**Evidence basis**:
- T-012 through T-016 all VERIFIED
- 2-player dedicated hardening suite PASS
- 3-player dedicated hardening suite PASS
- 4-player dedicated hardening suite PASS
- selected-but-unconfirmed timeout authority policy PASS
- invariant/property suite PASS
- latest regression 251 tests / 16 test files PASS
- all 33 GAME_RULES §24 invariants classified
- I29/T27 explicitly retained as mandatory STAGE-04 projection/security work
- no unresolved Stage-03 implementation bucket
- no active blocker
**Progress**:
- T-012-TWO-PLAYER-FLOW-HARDENING VERIFIED
- dedicated 2-player scenario suite PASS
- real 2-player 5/5/10 initialization and full deck partition verified
- ordinary cyclic heads-up turns verified
- Empty Hand confirmed not to be a win condition
- final-card automatic forced CALL verified
- canonical Truth/Lie × Blank/Lethal matrix verified
- canonical 20-card pre-final fixtures established for heads-up hardening
- post-BLANK 5/5/10 deck reset and 6K/6Q/6A/2J composition verified
- surviving loser next-Round starter verified
- persistent Revolver behavior verified
- same Player second Shot across a Round boundary verified
- monotonic Play identity across Rounds verified
- immediate LETHAL winner/no reset/no next-Round RNG verified
- FINISHED command guards verified
- ordinary and final-card SYSTEM_TIMEOUT heads-up integration verified
- representative immutability verified
- ordinary and forced-terminal determinism verified
- __proto__ heads-up regression verified
- T-012 remained test-only; no product defect discovered
- T-013-THREE-PLAYER-FLOW-HARDENING VERIFIED
- dedicated 3-player scenario suite PASS
- real 5/5/5 + 5 undealt initialization verified
- full canonical 20-card 3-player partition verified
- ordinary three-seat cyclic turn flow verified
- EMPTY_PENDING_CHALLENGE → EMPTY_SAFE flow verified
- EMPTY_SAFE turn skipping verified
- latest unresolved Play targeting across skipped empty seat verified
- T14 automatic forced CALL after two Players are empty verified
- canonical 20-card T14 fixture verified
- Truth/Lie × Blank/Lethal T14 matrix verified
- 3-player Blank reset 5/5/5 + 5 verified
- safe-empty Player return verified
- Revolver sequence/index persistence verified
- first lethal elimination confirmed non-terminal
- 3→2 Living transition verified
- 3→2 next Round 5/5 + 10 undealt verified
- 3→2 canonical 20-card partition verified
- eliminated loser starter fallback verified
- eliminated-seat A→B→A skip verified
- cross-Round Play ID continuity through actual next PLAY verified
- ordinary and final-card SYSTEM_TIMEOUT integration verified
- empty-safe / forced / timeout immutability verified
- ordinary / Blank / lethal determinism verified
- __proto__ 3-player regression verified
- T-013 remained test-only; no product defect discovered
- T-014-FOUR-PLAYER-FLOW-HARDENING VERIFIED
- dedicated 4-player scenario suite PASS
- real 5/5/5/5 + 0 undealt initialization verified
- canonical 20-card initial partition verified
- four-seat cyclic order verified
- multiple EMPTY_SAFE seat skipping verified
- fixed four-seat order preserved under empty-seat skips
- latest Play targeting across skipped seats verified
- four-player sole-holder mandatory CALL verified
- canonical 20-card sole-holder fixture verified
- Truth/Lie × Blank/Lethal four-branch matrix verified
- exactly one Shot-index advance across forced branches verified
- Blank reset 5/5/5/5 + 0 undealt verified
- safe-empty Player return verified
- Revolver sequence/index persistence on Blank verified
- first lethal elimination confirmed non-terminal
- 4→3 Living transition verified
- 4→3 reset 5/5/5 + 5 undealt verified
- canonical 20-card 4→3 partition verified
- eliminated loser starter fallback verified
- eliminated-seat A→B→C→A skip verified
- original four-seat order preserved after elimination
- lethal Revolver persistence verified
- actual next-Round Play ID continuity verified
- ordinary four-player SYSTEM_TIMEOUT integration verified
- final-card timeout forced CALL targeting verified
- representative immutability verified
- ordinary / Blank / lethal determinism verified
- __proto__ four-player regression verified
- T-014 remained test-only; no product defect discovered
- T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING VERIFIED
- selected-but-unconfirmed timeout Core authority boundary PASS
- applySystemTimeout exact MatchState + RandomSource contract verified
- runtime arity 2 verified
- exhaustive 8-key state-schema exclusion verified across MatchState/RoundState/PlayerState
- local pre-confirm selection confirmed non-authoritative
- same authoritative state + same RNG unaffected by different local highlights
- local single-card selection cannot override timeout RNG
- local multi-selection cannot cause multi-card timeout PLAY
- Truth/Lie/Joker local preference cannot bias timeout selection
- canonical 20-card Truth/Lie/Joker boundary fixture verified
- current timeout Player derived from authoritative currentPlayerId
- local-selection mutation isolation verified
- timeout source immutability verified
- ordinary one-call RNG selection behavior verified
- confirmed PLAY_CARDS explicit-card authority boundary verified
- no selection/draft Core transition introduced
- no authoritative draft/selection state introduced
- no Room/revision/deadline implementation introduced
- no UI implementation introduced
- T-015 remained test-only; no product defect discovered
- latest full regression: 242 tests / 15 test files PASS
- T-016-INVARIANT-PROPERTY-HARDENING VERIFIED
- deterministic dependency-free property harness PASS
- 96 initialization sweep cases PASS
- invalid Player-count exclusivity PASS
- 252 exhaustive Truth/Lie/Claim cases PASS
- 48 bounded legal command traces PASS
- exact 894 authoritative generated commands PASS
- canonical 20-card conservation invariant PASS
- fixed seat/player identity invariant PASS
- authoritative current-turn eligibility PASS
- fresh-Round distribution invariant PASS
- Eliminated fresh-Hand exclusion PASS
- Revolver sequence persistence PASS
- exact shooter index progression PASS
- PLAY Hand→centralPile delta PASS
- exact playSequence +1 per PLAY PASS
- global/cross-Round Play ID monotonicity PASS
- explicit latest previousPlay CALL targeting PASS
- forced newest-Play CALL targeting PASS
- non-vacuous EMPTY_SAFE / empty-Hand / Round-reset / winner / Blank / elimination observations PASS
- repeated Table Rank KING → KING legality PASS
- 45 timeout index-property cases PASS
- 6 deterministic full-trace replays PASS
- prototype-safe generated trace PASS
- all 33 GAME_RULES §24 invariants classified
- PROPERTY_DIRECT 20
- SCENARIO_VERIFIED 12
- I29 alone STAGE04_DEFERRED
- mandatory T27 Stage-04 boundary preserved
- latest full regression: 251 tests / 16 files PASS
- task remained test-only
- no product defect discovered
- 2-player suite COMPLETE / VERIFIED
- 3-player suite COMPLETE / VERIFIED
- 4-player suite COMPLETE / VERIFIED
- selected-but-unconfirmed timeout policy COMPLETE / VERIFIED
- invariant/property testing COMPLETE / VERIFIED
- Remaining Stage-03 implementation work: NONE
- Formal STAGE-03 Exit Gate: PASS

## STAGE-04 — Authoritative Multiplayer
**Status**: NOT_STARTED
**Goals**: Durable Object Room Coordinator, WebSocket, revision/dedupe, persistence, timeout, Pause/Resume, hidden projections, T27 dead-spectator hidden-Hand protection (Eliminated spectators receive Public State only and cannot read Living Players' hidden Hand values)
**Exit Gate**: action dedupe; stale revision; turn validation; concurrent action safety; deadline races; unique Living presence accounting; zero-Living-connected Pause; Living-only Resume; life-status-triggered Pause evaluation; fresh 30-second Resume deadline; single activeAlarm invariant; stale/idempotent alarm behavior; persistence reload; reconnect; recipient-specific hidden-information projections, including T27 dead-spectator Hand isolation.
Current project stage after Stage-03 completion.
No Stage-04 task registered yet.

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
