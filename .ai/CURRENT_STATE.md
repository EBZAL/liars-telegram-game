# Current State

**Current Stage:**
STAGE-02 — Canonical Core Engine

**Last Verified Task:**
T-009-CALL-LIAR-MATCH-TRANSITION

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
- canonical PlayState / previousPlay state contract
- deterministic monotonic Play identity foundation
- RoundState previousPlay now supports PlayState | null
- pure authoritative PLAY_CARDS state transition
- PLAY legality derived from authoritative Turn rules
- card-selection intent resolved against authoritative current Hand
- caller-owned request arrays are not retained by returned MatchState
- PlayState cardIds are derived into a fresh Core-owned array
- post-return caller request mutation cannot alter authoritative state
- Claim rank derived from TableRank
- Claim count derived from authoritative played-card count
- selected Cards removed from authoritative Hand
- selected Cards appended exactly once to central pile
- previousPlay creation and replacement
- normal PLAY does not precompute/reveal truth or lie
- non-final Player remains WITH_CARDS
- final-card Player becomes EMPTY_PENDING_CHALLENGE
- final Play remains previousPlay and is not immediately safe
- T12 no-challenge branch verified:
  - prior EMPTY_PENDING_CHALLENGE Player becomes EMPTY_SAFE when next eligible Player chooses PLAY_CARDS
- cyclic next-player advancement uses updated authoritative Player state
- ineligible seats are skipped without clearing the new previousPlay
- 1v1 mandatory-call state integration established
- 3-player mandatory-call state integration established
- canonical 20-card conservation after PLAY verified:
  - total 20
  - unique IDs 20
  - 6 KING
  - 6 QUEEN
  - 6 ACE
  - 2 JOKER
- Revolver state unchanged by PLAY
- lifeStatus unchanged by PLAY
- prototype-safe Player IDs preserved
- pure deterministic ChallengeResolution contract
- pure resolveLiarChallenge(MatchState, callerId) resolver
- CALL_LIAR legality derived from authoritative Turn rules
- caller has no authority over target Play, accused, reveal Cards, truth, loser or shooter
- challenge target is always current unresolved previousPlay
- resolved previousPlay is rejected
- accused is derived from previousPlay.playerId
- malformed missing / eliminated / EMPTY_SAFE / self-accused targets are rejected
- previousPlay count/cardIds consistency enforced
- previousPlay claimedRank/tableRank consistency enforced
- duplicate previousPlay Card IDs rejected
- target Cards are reconciled exactly against authoritative centralPile
- missing target Card rejected
- duplicate central-pile occurrence of a target Card rejected
- only previousPlay Cards are revealed/evaluated
- reveal order follows previousPlay.cardIds
- revealedCards are detached value snapshots and do not alias MatchState
- truth/lie evaluation reuses canonical TableRank/Joker semantics
- mixed Play with one invalid Card resolves as Lie
- T09 challenge-target semantics verified:
  - only latest previousPlay is challenged
- T10 skipped-seat challenge targeting verified:
  - skipped ineligible seats do not erase previousPlay
- T11 final-Play challengeability resolution verified:
  - EMPTY_PENDING_CHALLENGE final Play resolves normally
- T15 correct challenge result identity verified:
  - Lie → accused is round loser / shooter
- T16 incorrect challenge result identity verified:
  - Truth → caller is round loser / shooter
- forced-CALL legality/resolver compatibility exists, but full challenge + Roulette flow remains unimplemented
- resolver does not mutate MatchState
- resolver does not mutate previousPlay.resolved
- resolver does not resolve or mutate Revolver
- pure deterministic RouletteShotResolution primitive
- pure PlayerState-level resolveRouletteShot transition
- Shot outcome derived exclusively from persistent authoritative Revolver sequence
- no caller authority over outcome, shot index, elimination or sequence
- canonical Revolver invariant enforced:
  - exactly 6 positions
  - exactly 1 LETHAL
  - exactly 5 BLANK
- nextShotIndex must be a finite integer in 0..5
- ALIVE consumed-prefix must contain only BLANK outcomes
- current outcome = sequence[nextShotIndex]
- every successful Shot advances nextShotIndex exactly once
- Revolver sequence/order persists unchanged
- no Revolver reshuffle or reset during Shot
- T17 verified:
  - BLANK keeps Player ALIVE
  - index advances exactly one
  - sequence remains unchanged
- T18 elimination state effect and turn-ineligibility are verified (Future-Round no-deal behavior remains unimplemented)
- T19 verified:
  - five sequential BLANK outcomes preserve progress
  - index advances 0→1→2→3→4→5
  - sixth unresolved outcome is LETHAL for canonical five-Blank-prefix sequence
  - sixth Shot eliminates and advances index to 6
  - further Shot attempt is rejected
- early LETHAL behavior verified
- already ELIMINATED Player cannot shoot again
- exhausted Revolver cannot shoot
- Player id unchanged by Shot
- roundStatus unchanged by Shot
- hand unchanged by Shot
- input Player/Revolver/Hand/sequence are not mutated
- updated PlayerState and RevolverState are fresh changed state containers
- Shot resolution is deterministic
- pure deterministic initializeNextRound transition
- post-Shot / post-Challenge boundary:
  - previousPlay must exist
  - previousPlay must already be resolved
  - Challenge and Shot are not re-executed
- next-Round participation derives from lifeStatus only
- winner boundary:
  - one Living Player rejects next-Round initialization
  - zero Living Players rejects invalid state
- T20 verified:
  - surviving round loser starts next Round
- T21 verified:
  - eliminated round loser falls forward to the next ALIVE Player
  - fallback uses fixed cyclic seatOrder
  - wraparound supported
  - multiple eliminated seats skipped
- Round number increments exactly once
- fresh canonical Table Deck shuffle each Round
- Table Rank remains KING / QUEEN / ACE
- T28 verified:
  - consecutive identical Table Rank is legal
- fresh canonical 20-card Liar Deck each Round
- Living Players dealt in fixed seatOrder order
- every Living Player:
  - receives exactly 5 fresh Cards
  - roundStatus resets to WITH_CARDS
  - lifeStatus remains ALIVE
  - Revolver persists unchanged
- T22 verified:
  - prior ALIVE EMPTY_SAFE Player returns WITH_CARDS with 5 Cards
- ALIVE EMPTY_PENDING_CHALLENGE also returns WITH_CARDS with 5 Cards
- every Eliminated Player:
  - remains ELIMINATED
  - receives no Cards
  - hand becomes empty
  - Revolver persists unchanged
  - is not revived
- 4 Living: 20 dealt / 0 undealt
- 3 Living: 15 dealt / 5 undealt
- 2 Living: 10 dealt / 10 undealt
- next-Round Card conservation verified:
  - total 20
  - unique IDs 20
  - 6 KING
  - 6 QUEEN
  - 6 ACE
  - 2 JOKER
- centralPile resets to empty
- previousPlay resets to null
- match-wide Play identity continuity preserved:
  - playSequence carries unchanged across Round reset
  - first PLAY of new Round consumes preserved next Play ID
- Revolver sequences and nextShotIndex persist without reset/reshuffle
- seatOrder preserved
- firstRoundStarter preserved
- winnerId remains null on valid next-Round path
- Match status remains IN_PROGRESS
- prototype-safe Player dictionary preserved
- __proto__ Player ID remains supported
- input state is not mutated
- transition is deterministic
- Core Match lifecycle now supports IN_PROGRESS and FINISHED
- authoritative stateful applyCallLiar transition established
- CALL_LIAR composition:
  - verified CALL legality
  - previousPlay-only Challenge
  - Truth/Lie resolution
  - authoritative round loser
  - authoritative shooter
  - resolved previousPlay lifecycle
  - exactly one Roulette Shot
  - elimination
  - post-Shot living-count branch
  - Next Round OR Match Winner
- challenge.shooterId == challenge.roundLoserId is enforced as an internal invariant
- T15 integrated: Lie -> accused is round loser/shooter
- T16 integrated: Truth -> caller is round loser/shooter
- T17 integrated: BLANK keeps shooter ALIVE, Shot index advances exactly one
- T18 integrated: LETHAL eliminates shooter
- continuing Match: >= 2 Living Players routes through verified initializeNextRound
- T20 integrated: surviving loser starts next Round
- T21 integrated: eliminated loser falls forward to next Living seat
- T22/T28 and verified next-Round redistribution remain preserved through CALL integration
- T26 verified:
  - if Shot leaves exactly one ALIVE Player:
    - Match status becomes FINISHED
    - winnerId = sole ALIVE Player
    - no new Round is created
    - no new deal occurs
    - no Table/deck reshuffle occurs
    - no next-Round RandomSource consumption occurs
- winner authority derives solely from sole ALIVE Player after Shot
- winning final Round preserves resolved previousPlay, current roundNumber, and existing final Round state
- Challenge result metadata remains available after continuing Round reset: playId, accusedPlayerId, revealedCards, truth result, roundLoserId
- Shot result metadata remains available: playerId, shotIndex, outcome, nextShotIndex, eliminated
- Shot metadata contains no authoritative PlayerState alias
- FINISHED Core Match rejects PLAY_CARDS, Challenge resolution, Next-Round initialization, and CALL_LIAR
- mandatory-caller stateful CALL execution verified:
  - 1v1 forced caller
  - 3-player single-card-holder forced caller
- prototype-safe Player dictionary preserved through CALL transition (__proto__ participant support verified)
- input MatchState remains unmutated
- transition remains deterministic
- npm ci PASS, typecheck PASS, 155-test suite PASS
- T13/T14 mandatory-caller legality and stateful CALL execution are established, but PLAY_CARDS does not yet automatically dispatch the forced CALL_LIAR; SYSTEM_TIMEOUT is not implemented (T29/T30/T31 remain unimplemented); Core FINISHED is implemented (Room MATCH_FINISHED lifecycle is not implemented); Networking, persistence, projections and transport events remain outside this task

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

**Next Approved Action:**
Project Architect must re-read this State Sync commit, then determine the remaining STAGE-02 canonical Core gaps, select the next smallest bounded task, determine Workflow Profile/Risk, run the Pre-Execution Consistency Gate, and only after PASS issue exactly one Executor prompt.
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
