# Current State

**Current Stage:**
STAGE-04 — Authoritative Multiplayer

**Last Verified Task:**
T-027-CLIENT-GAMEPLAY-PRESENCE-LIFECYCLE-COMPOSITION

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
- canonical command-level PLAY_CARDS orchestration established via applyPlayCardsCommand
- verified low-level applyPlayCards primitive remains intentionally unchanged
- PLAY command execution flow:
  - apply verified low-level PLAY transition
  - capture detached createdPlay snapshot
  - derive forced caller through verified getForcedCallerId
  - ordinary path: return post-PLAY state, forcedCall = null, consume no RandomSource
  - forced path:
    - forcedCaller must equal post-PLAY currentPlayerId
    - forced caller allowed actions must equal exactly ['CALL_LIAR']
    - invoke verified applyCallLiar automatically
    - return its final authoritative MatchState
- createdPlay metadata:
  - detached PlayState object and cardIds array
  - preserves created playId
  - resolved=false at Play creation time
  - remains available after automatic CALL / Round Reset
- T13 automatic orchestration verified:
  - 1v1 final PLAY automatically dispatches opponent CALL_LIAR
  - no second user/client CALL action required
- T13 BLANK path verified:
  - automatic CALL occurs
  - exactly one canonical Shot consumed
  - Match continues IN_PROGRESS
  - canonical next Round begins
- T13 LETHAL/T26 path verified:
  - automatic CALL occurs
  - LETHAL elimination
  - Match immediately FINISHED when sole Living remains
  - sole Living Player wins
  - no next Round created
  - no next-Round RNG consumed
- T14 automatic orchestration verified:
  - prior ALIVE EMPTY_SAFE Player may remain empty
  - newly-empty Player's final Play becomes challenge target
  - sole remaining Living card-holder automatically CALLs
  - newest Play is challenged
- T12 remains preserved:
  - choosing PLAY over prior challenge closes prior challenge window
  - prior EMPTY_PENDING_CHALLENGE Player becomes EMPTY_SAFE
- if an ordinary PLAY leaves >=2 Living Players holding Cards:
  - no automatic CALL
  - Challenge window remains open normally
  - no RNG consumed
- a Player already forced to CALL cannot submit PLAY_CARDS
- PLAY identity remains exactly-once:
  - no duplicate Play allocation
  - playSequence increments once
- Hand and centralPile PLAY effects occur once only
- forced transition:
  - exactly one Challenge through T-009
  - exactly one Roulette Shot through T-009
  - Round Reset / winner logic remains owned by T-009
- single authoritative result state:
  - result.state only
  - forcedCall metadata contains no nested MatchState
- automatic resolution metadata survives Round Reset:
  - createdPlay
  - challenge
  - shot
  - terminal
  - winnerId
- prototype-safe participant handling preserved (__proto__ Player IDs supported)
- input MatchState/requestedCardIds not mutated
- transition deterministic
- npm ci PASS, typecheck PASS, 171-test suite PASS
- authoritative pure SYSTEM_TIMEOUT Core effect established via applySystemTimeout
- SYSTEM_TIMEOUT authority:
  - actor derived from round.currentPlayerId
  - no actor input
  - no selected-card input
  - no UI/draft selection input
- local selected-but-unconfirmed cards remain outside Engine authority
- current Player must:
  - exist
  - be ALIVE
  - be WITH_CARDS
  - have non-empty authoritative Hand
- malformed current Player states reject before RNG:
  - missing Player
  - ELIMINATED Player
  - empty Hand
  - wrong RoundStatus
- mandatory CALL-only state rejects SYSTEM_TIMEOUT auto-PLAY before RNG consumption
- PLAY_CARDS must be authoritative legal action before fallback selection
- timeout fallback selection:
  - exactly one direct random index: random.nextInt(currentHand.length)
  - no rank/truth/Joker filtering
  - no weighted selection
  - exactly one authoritative Hand Card
- same injected RandomSource is forwarded into verified applyPlayCardsCommand
- T29 verified:
  - no committed action timeout effect
  - exactly one random current-Hand Card auto-played
  - ordinary 5-card Hand decreases to 4
  - claim count = 1
  - claim rank = tableRank
  - timeout Play remains normally challengeable
- T30 verified:
  - timeout never auto-plays multiple Cards
- T31 verified:
  - truthful Card selectable by index
  - lying Card selectable by index
  - Joker selectable by index
  - no intentional truth/Joker bias
- first-Turn timeout one-card PLAY verified
- later ordinary Turn where PLAY and CALL are both legal:
  - timeout fallback chooses one-card PLAY
  - does not automatically choose CALL_LIAR
- T12 semantics preserved through timeout PLAY:
  - old Challenge Window closes
  - prior EMPTY_PENDING_CHALLENGE Player becomes EMPTY_SAFE
  - new timeout Play becomes previousPlay
- timeout final-card PLAY integrates through T-010:
  - automatic forced CALL
  - newest timeout-created Play challenged
  - exactly one Challenge
  - exactly one Roulette Shot
- forced BLANK path:
  - Shot index advances exactly one
  - Match continues
  - canonical next Round starts
- forced LETHAL / T26 path:
  - Match FINISHED immediately
  - sole Living winner
  - no new Round
  - total RNG calls = exactly 1 when Hand size is 1 (timeout index selection only)
  - no next-Round RNG consumed
- timeout metadata retained across downstream Round Reset:
  - timedOutPlayerId
  - autoPlayedCardId
  - createdPlay
  - forcedCall challenge
  - forcedCall shot
  - terminal/winner metadata
- prototype-safe __proto__ current Player path verified
- input MatchState remains immutable
- transition remains deterministic
- npm ci PASS, typecheck PASS, 189 total tests PASS
- Core does NOT determine whether 30 seconds elapsed.
- No clock, deadline, remaining-time calculation, alarm scheduling or alarm generation exists in T-011.
- Room/Application layer must later validate that the authoritative deadline is due before invoking SYSTEM_TIMEOUT.
- Late-command arbitration remains unimplemented at Room layer.
- TURN_DEADLINE alarm handling remains unimplemented.
- Revision/dedupe, Pause/Resume, persistence, networking and Telegram/UI remain outside Core.
- Original-PC exact timeout auto-selection algorithm remains SOURCE_GAP.
- Exactly one random authoritative Hand Card is the explicit Project Override.
- T-012 Two-Player Flow Hardening VERIFIED.
- Dedicated heads-up scenario hardening suite established.
- Task remained test-only: YES
- Product defect discovered: NONE
- 2-player real initialization:
  - exactly 5 Cards per Player
  - exactly 10 undealt
  - full canonical 20-card partition
  - 6 KING / 6 QUEEN / 6 ACE / 2 JOKER
  - unique Card IDs
- Canonical pre-final 1v1 fixture hardening:
  - 20 authoritative Cards conserved
  - hands 1 + 1
  - centralPile 8
  - undealt 10
  - coherent unresolved previousPlay
  - previousPlay Card references centralPile
  - fixed canonical deck composition preserved
- Ordinary heads-up command flow:
  - turns alternate cyclically
  - no forced CALL while both retain Cards
- Empty Hand:
  - empty Hand alone never wins Match
  - final-card outcome proceeds through forced CALL / Challenge / Shot
- Automatic final-card CALL:
  - opponent becomes forced caller
  - forced Challenge targets newly created final Play
- Four canonical matrix branches VERIFIED:
  - Truth + Blank
  - Lie + Blank
  - Truth + Lethal
  - Lie + Lethal
- Truth branch: caller loses Challenge/shoots
- Lie branch: accused loses Challenge/shoots
- BLANK continuation:
  - exactly one Shot
  - shooter nextShotIndex advances exactly one
  - surviving round loser starts next Round
  - both Living Players receive fresh 5-card Hands
  - exactly 10 undealt
  - new Round partition remains 20 unique Cards
  - post-reset composition remains 6K/6Q/6A/2J
  - centralPile resets
  - previousPlay resets
  - metadata from resolved command remains returned
- Revolver persistence:
  - revolver sequences persist across Round reset
  - non-shooter index unchanged
  - shooter index persists advanced
- Cross-Round same-Player progression:
  - Player B loses/shoots at index 0 in Round 1
  - survives BLANK and enters next Round at index 1
  - Player B later loses again through canonical command flow
  - second Shot consumes index 1
  - nextShotIndex becomes 2
  - no revolver reset or reshuffle
- Play identity:
  - playSequence remains monotonic across Round boundary
- LETHAL:
  - shooter eliminated
  - exactly one Living Player remains
  - Match FINISHED immediately
  - correct winnerId
  - no new Round
  - no fresh deal
  - no next-Round RNG
- AC-26 interpretation:
  - eliminated Player receives no fresh Hand because no Round reset occurs
  - terminal winner contract was not changed merely to clear pre-existing Hand contents
- FINISHED guards:
  - subsequent applyPlayCardsCommand rejected
  - subsequent applySystemTimeout rejected before RNG
- 1v1 SYSTEM_TIMEOUT integration:
  - ordinary timeout auto-plays one Card
  - final-card timeout flows into automatic forced CALL
- Input immutability VERIFIED for:
  - ordinary PLAY
  - forced final-card PLAY
  - SYSTEM_TIMEOUT
- Determinism VERIFIED for:
  - ordinary heads-up flow
  - forced terminal MATCH_WON flow
- Prototype safety:
  - __proto__ PlayerId regression PASS
- Latest verification:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 204 tests across 12 test files
- No dependency change.
- No product source change.
- No forbidden nondeterminism.
- T-013 Three-Player Flow Hardening VERIFIED.
- Task remained test-only: YES
- Product defect discovered: NONE
- Dedicated 3-player canonical scenario suite: PASS
- Real 3-player initialization:
  - 3 Living Players
  - 5 Cards each
  - 15 dealt
  - 5 undealt
  - complete 20-card canonical partition
  - 6 KING / 6 QUEEN / 6 ACE / 2 JOKER
- Ordinary three-seat flow:
  - fixed cyclic order verified
  - P1 → P2 → P3 → P1
- Empty-hand / EMPTY_SAFE composition:
  - final-card Player becomes EMPTY_PENDING_CHALLENGE
  - no premature forced CALL while two other Players retain Cards
  - next Player may PLAY instead of CALL
  - previous empty Player becomes EMPTY_SAFE
  - EMPTY_SAFE Player remains ALIVE and is skipped for current Round
  - latest unresolved Play remains correct challenge target across skipped empty seat
- T14 3-player mandatory CALL:
  - A EMPTY_SAFE
  - B plays final Card
  - C is sole remaining Player with Cards
  - C automatically CALLs B
  - forced Challenge targets B's newly created Play
  - no separate external CALL required
- Canonical T14 fixture:
  - full 20 Cards conserved
  - hands 0 + 1 + 1
  - centralPile 13
  - undealt 5
  - 20 unique Card IDs
  - 6K / 6Q / 6A / 2J
  - coherent unresolved previousPlay
- Four T14 branches VERIFIED:
  - Truth + Blank
  - Lie + Blank
  - Truth + Lethal
  - Lie + Lethal
- BLANK continuation:
  - exactly one Shot
  - shooter Revolver index advances exactly once
  - surviving round loser starts next Round
  - all 3 Living Players receive fresh 5-card Hands
  - undealt = 5
  - canonical 20-card reset preserved
  - EMPTY_SAFE Player returns WITH_CARDS
- Revolver persistence:
  - all Revolver sequences remain unchanged across Round reset
  - shooter index advances exactly once
  - non-shooter indices remain unchanged
- First elimination in 3-player Match:
  - does NOT finish Match
  - exactly 2 Living Players remain
  - Match remains IN_PROGRESS
  - winnerId remains null
- 3 → 2 Round reset:
  - two Living Players receive 5 Cards each
  - eliminated Player receives no new Hand
  - undealt = 10
  - 20 unique Cards retained across Living Hands + undealt
  - canonical 6K / 6Q / 6A / 2J composition retained
- Eliminated loser starter fallback:
  - C eliminated in [A,B,C] → A starts next Round
  - B eliminated in [A,B,C] → C starts next Round
- Eliminated-seat turn skipping:
  - original fixed seatOrder remains [A,B,C]
  - with C eliminated, actual command flow A → B → A proves C is skipped
- Lethal Revolver persistence:
  - eliminated shooter's Revolver sequence persists
  - eliminated shooter index advances exactly once
  - Living Player Revolver sequences and indices remain unchanged
- Play identity:
  - first actual PLAY after new Round receives a later unique Play ID
  - no cross-Round Play ID collision
- SYSTEM_TIMEOUT 3-player integration:
  - ordinary timeout auto-plays exactly one Card
  - claim count = 1
  - claim rank = tableRank
  - normal next eligible seat receives turn
  - final-card T14 timeout automatically flows through forced CALL / Challenge / one Shot
  - Challenge targets timeout-created Play
- Automatic forced-branch bounded effects:
  - one created Play
  - one forced Challenge
  - one Shot-index advance
  - all Truth/Lie × Blank/Lethal branches covered
- Input immutability VERIFIED for:
  - ordinary 3-player PLAY
  - empty-safe A final transition
  - subsequent B transition making A EMPTY_SAFE
  - T14 forced final-card PLAY
  - SYSTEM_TIMEOUT
- Determinism VERIFIED for:
  - ordinary 3-player flow
  - T14 forced Blank flow
  - 3→2 Lethal flow
- Prototype safety:
  - __proto__ PlayerId works in real 3-player initialization and command flow
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 218 tests across 13 test files
- No dependency changes.
- No dependency changes.
- No product source changes.
- No forbidden nondeterminism.
- No Architecture change.
- T-014 Four-Player Flow Hardening VERIFIED.
- Task remained test-only: YES
- Product defect discovered: NONE
- Dedicated 4-player canonical scenario suite: PASS
- Real 4-player initialization:
  - 4 ALIVE Players
  - each WITH_CARDS
  - 5 Cards each
  - 20 dealt
  - zero undealt
  - full canonical 20-card partition
  - 20 unique Card IDs
  - 6 KING / 6 QUEEN / 6 ACE / 2 JOKER
- Ordinary four-seat flow:
  - fixed cyclic seat order verified
  - P1 → P2 → P3 → P4 → P1
- Multiple EMPTY_SAFE seats:
  - canonical full-20-card fixture
  - A and C EMPTY_SAFE
  - B PLAY skips C → D
  - D PLAY skips A and C → B
  - seatOrder remains [A,B,C,D]
- Latest Play targeting:
  - skipped EMPTY_SAFE seats do not erase previousPlay
  - D CALL_LIAR targets B's newest Play
  - older D Play is not incorrectly challenged
- Four-player sole-holder mandatory CALL:
  - A and B EMPTY_SAFE
  - C has final 1 Card
  - D retains 1 Card
  - centralPile = 18
  - undealt = 0
  - 20-card canonical partition preserved
  - C final PLAY automatically forces D CALL
  - Challenge targets C's newly-created Play
  - no external CALL required
- Four canonical forced branches VERIFIED:
  - Truth + Blank
  - Lie + Blank
  - Truth + Lethal
  - Lie + Lethal
- Automatic forced-branch bounded effects:
  - exactly one created Play
  - exactly one Challenge resolution
  - exactly one Shot-index advance
  - shotIndex 0 → nextShotIndex 1 in canonical matrix fixtures
- Four-player BLANK reset:
  - all 4 Players remain ALIVE
  - 5 Cards each
  - undealt = 0
  - canonical 20-card 6K/6Q/6A/2J partition restored
  - previousPlay reset
  - centralPile reset
  - surviving round loser starts next Round
  - prior EMPTY_SAFE Players return WITH_CARDS
- Revolver persistence on BLANK:
  - all four Revolver sequences remain unchanged
  - shooter nextShotIndex advances exactly once
  - all non-shooter indices remain unchanged
- First lethal elimination from four Players:
  - does NOT finish Match
  - exactly 3 Living Players remain
  - exactly 1 Player ELIMINATED
  - state remains IN_PROGRESS
  - winnerId remains null
  - terminal = NEXT_ROUND
- Truth + Lethal:
  - D eliminated
  - A/B/C remain Living
  - starter fallback wraps D → A
- Lie + Lethal:
  - C eliminated
  - A/B/D remain Living
  - starter fallback resolves C → D
- 4 → 3 Round reset:
  - 3 Living Players receive 5 Cards each
  - eliminated Player receives no fresh Hand
  - undealt becomes 5
  - Living Hands + undealt = 20
  - 20 unique IDs
  - 6K / 6Q / 6A / 2J
- Fixed seat order after elimination:
  - original [A,B,C,D] remains authoritative
  - eliminated Player remains represented but is ineligible
- Eliminated-seat skipping:
  - with D eliminated, actual command flow: A → B → C → A
  - final C → A transition proves D is skipped
- Revolver persistence on lethal reset:
  - eliminated shooter's Revolver sequence persists
  - eliminated shooter's index advances exactly once
  - Living Player Revolver sequences remain unchanged
  - Living Player indices remain unchanged
- Play identity:
  - first actual PLAY after BLANK Round reset receives a later unique Play ID
  - no cross-Round Play ID collision
- 4-player SYSTEM_TIMEOUT:
  - ordinary timeout chooses exactly one current-Hand Card
  - Hand 5 → 4
  - claimCount = 1
  - claimedRank = tableRank
  - no forced CALL while multiple Players retain Cards
  - turn advances normally
- Final-card four-player SYSTEM_TIMEOUT:
  - timeout auto-plays C's only authoritative Card
  - D automatically CALLs
  - Challenge targets timeout-created Play
  - exactly one Shot resolves
- No selected-but-unconfirmed model was added.
- Input immutability VERIFIED for:
  - ordinary 4-player PLAY
  - multi-EMPTY_SAFE sequence
  - forced final-card PLAY
  - SYSTEM_TIMEOUT
  - 4→3 lethal transition
- Determinism VERIFIED for:
  - ordinary 4-player flow
  - forced Blank flow
  - 4→3 lethal flow
- Prototype safety:
  - __proto__ PlayerId works with four-player initialization
  - players dictionary retains null prototype after command transition
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 231 tests across 14 test files
  - No dependency change.
- No product source change.
- No forbidden nondeterminism.
- No Architecture change.
- T-015 Selected-Unconfirmed Timeout Hardening VERIFIED.
- Task remained test-only: YES
- Product defect discovered: NONE
- Architecture change required: NO
- STAGE-03 Core selected-but-unconfirmed authority boundary: PASS
- applySystemTimeout authority contract:
  - exact type inputs remain MatchState + RandomSource
  - runtime arity remains 2
  - no actor/card/local-selection argument exists
- Authoritative Core state schema:
  - MatchState contains none of the 8 prohibited local-selection keys
  - RoundState contains none of the 8 prohibited local-selection keys
  - PlayerState contains none of the 8 prohibited local-selection keys
- Prohibited keys exhaustively locked:
  - selectedCards
  - selectedCardIds
  - selectedButUnconfirmedCards
  - highlightedCards
  - highlightedCardIds
  - draftSelection
  - pendingSelection
  - localSelection
- Pre-confirm card selection:
  - remains Local Presentation State only
  - does not enter MatchState
  - does not create a Core transition
  - does not become authoritative before PLAY_CARDS confirmation
- Timeout invariance:
  - equivalent authoritative states
  - equivalent RNG
  - different local-only highlights
  produce deep-equal SYSTEM_TIMEOUT results
- Local selection cannot:
  - override RNG-selected Card
  - bypass RNG
  - make timeout play multiple Cards
  - alter claim count
  - bias Truth selection
  - bias Lie selection
  - bias Joker selection
  - replace timedOutPlayerId
- SYSTEM_TIMEOUT:
  - derives actor from state.round.currentPlayerId
  - chooses Card from authoritative current Hand
  - uses injected RandomSource
  - ordinary timeout consumes exactly one card-selection RNG call
  - RNG max equals authoritative Hand size
  - createdPlay count remains 1
  - createdPlay cardIds length remains 1
- Canonical Truth/Lie/Joker boundary fixture:
  - full authoritative 20-card partition
  - 20 unique Cards
  - 6 KING / 6 QUEEN / 6 ACE / 2 JOKER
  - A Hand = KING + QUEEN + JOKER
  - B retains Card
  - centralPile = 6
  - undealt = 10
  - coherent unresolved previousPlay owned by B
  - same RNG result remains unaffected by local Truth/Lie/Joker preference
- Confirmed PLAY_CARDS authority boundary:
  - local highlighting alone has no authoritative effect
  - confirmed PLAY_CARDS with explicit Card X authoritatively plays X
  - unconfirmed local X does not cause SYSTEM_TIMEOUT to use X when RNG chooses Y
  - no SELECT/HIGHLIGHT/DRAFT Core command was introduced
- Immutability:
  - local-selection mutation leaves MatchState unchanged
  - SYSTEM_TIMEOUT leaves source MatchState unchanged
- End-to-end UI selection: NOT IMPLEMENTED HERE
- Room deadline/revision behavior: NOT IMPLEMENTED HERE
- No Room revision/dedupe/deadline implementation added.
- No UI implementation added.
- No dependency change.
- No product source change.
- No forbidden nondeterminism.
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 242 tests across 15 test files
  - T-015 suite = 11 tests
- T-016 Invariant & Property Hardening VERIFIED.
- Task remained test-only: YES
- Product defect discovered: NONE
- Architecture change required: NO
- Dependencies added: NONE
- Deterministic property harness:
  - existing Vitest + TypeScript only
  - injected deterministic RandomSource
  - no external property-testing dependency
  - no forbidden nondeterministic API
- Initialization property sweep:
  - Player counts 2 / 3 / 4
  - seeds 0..31
  - 96 canonical initialization cases
  - invalid Player counts 0 / 1 / 5 / 6 rejected
- Canonical initialization properties:
  - seatOrder exact unique Player permutation
  - firstRoundStarter/current Player coherent
  - every Living Player receives exactly 5 Cards
  - undealt = 10 / 5 / 0 for 2 / 3 / 4 Players
  - full 20-card conservation
  - 20 unique Card IDs
  - 6 KING / 6 QUEEN / 6 ACE / 2 JOKER
  - Table Rank always KING / QUEEN / ACE
  - every Revolver = 1 LETHAL + 5 BLANK
  - every Revolver begins at index 0
- Initialization determinism:
  - same input + same RNG stream
  - deep-equal MatchState
- Exhaustive Truth/Lie properties:
  - 252 cases
  - all rank tuples of length 1..3
  - all Table Ranks
  - Joker validity
  - mixed invalid Card makes whole Play Lie
  - Claim Rank = Table Rank
  - Claim Count = actual played count
- Generated legal trace sweep:
  - 48 traces
  - 2/3/4 Players
  - seeds 0..15
  - max 24 authoritative commands per trace
  - exact authoritative command total = 894
  - legality derived through getAllowedTurnActions
  - public applyPlayCardsCommand / applyCallLiar paths
  - source MatchState immutable on every command
- Authoritative state invariants:
  - fixed seatOrder
  - fixed firstRoundStarter
  - exact Player identity set preserved
  - 20-card conservation
  - unique Card IDs
  - 6K / 6Q / 6A / 2J
  - Table Rank valid
  - previousPlay coherent
  - current Player authoritative turn-eligible
  - ALIVE/roundStatus/Hand coherence
  - fresh-Round 5-card Living distribution
  - Eliminated Players receive no fresh Hand
  - winner coherence
  - Revolver sequence persists for Match
- PLAY transition properties:
  - createdPlay ID = pre-command playSequence
  - post-command playSequence = pre + 1
  - Play IDs globally unique and monotonic across Round boundaries
  - createdPlay count = selected Card count
  - Claim Rank = pre-command Table Rank
  - ordinary PLAY removes selected Cards from Hand
  - selected Cards enter centralPile exactly once
  - unselected Hand Cards remain
  - ordinary no-Shot PLAY leaves every Revolver index unchanged
- CALL / Shot properties:
  - forced CALL targets newly-created Play
  - explicit CALL targets exact pre-command previousPlay
  - challenge shooter = round loser
  - Shot player = challenge shooter
  - Shot nextShotIndex = shotIndex + 1
  - authoritative shooter index advances exactly one
  - all non-shooter indices remain unchanged
- Non-vacuous deterministic observations:
  - EMPTY_SAFE states = 3
  - ALIVE zero-card states = 84
  - actual fresh Round 2+ states = 181
  - FINISHED matches = 22
  - Blank shots = 159
  - fresh Round 2+ states containing Eliminated Player = 41
- Repeated Table Rank:
  - prior Table Rank = KING
  - next Round Table Rank = KING
  - explicit prior == next assertion
  - Round 2 canonical state verified
  - repeated Table Rank confirmed legal
- Timeout property sweep:
  - 45 cases
  - every Hand index 0..4
  - 2/3/4 Players
  - exact authoritative Card selected by injected RNG index
  - exactly one Card
  - Claim Rank = Table Rank
  - actor = authoritative currentPlayerId
  - exactly one ordinary timeout selection RNG call
  - source state immutable
- Deterministic replay:
  - 6 full replay cases
  - independently allocated equivalent inputs/RNGs
  - final states deep-equal
  - authoritative event logs deep-equal
- Prototype safety:
  - __proto__ Player ID
  - constructor Player ID
  - null-prototype players dictionary persists through generated commands
- GAME_RULES §24 matrix:
  - 33 total invariants classified
  - PROPERTY_DIRECT = 20
  - SCENARIO_VERIFIED = 12
  - STAGE04_DEFERRED = 1
  - I29 alone remains STAGE04_DEFERRED
  - T27 recipient-projection/security remains mandatory Stage-04 work
  - no other invariant deferred
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 251 tests across 16 files
  - T-016 suite = 9 test blocks
- No product source changes.
- No dependency changes.
- No Architecture change.
- No forbidden nondeterminism.

**STAGE-02 — Canonical Core Engine:**
COMPLETE

**Stage Exit Gate:**
PASS

**Stage-02 Required Tasks:**
T-002 through T-011 all VERIFIED

**Canonical Core Coverage:**
T01–T26 PASS
T28–T31 PASS

**T27:**
mandatory project requirement
not waived
not implemented yet
retained for STAGE-04 recipient-specific hidden-information projections

No currently evidenced unresolved pure-Core GAME_RULES ambiguity remains.

Core deterministic-transition requirement PASS.

**STAGE-03 — Player-Count & Rule Hardening:**
COMPLETE

**Stage Exit Gate:**
PASS

**Stage-03 Required Tasks:**
- T-012-TWO-PLAYER-FLOW-HARDENING VERIFIED
- T-013-THREE-PLAYER-FLOW-HARDENING VERIFIED
- T-014-FOUR-PLAYER-FLOW-HARDENING VERIFIED
- T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING VERIFIED
- T-016-INVARIANT-PROPERTY-HARDENING VERIFIED

**Stage-Level Acceptance:**
- 2-player suite PASS
- 3-player suite PASS
- 4-player suite PASS
- selected-but-unconfirmed timeout policy PASS
- invariant/property tests PASS

Remaining Stage-03 implementation work:
NONE

**Formal Architect Stage Gate:**
PASS

**Architecture Review:**
PASS

**Security Boundary Review:**
PASS — T27 retained as mandatory STAGE-04 work

**UI Review:**
N/A

**Release Review:**
N/A

**Open Blockers:**
NONE

**Latest Full Regression:**
npm ci PASS
npm run typecheck PASS
npm test PASS
251 tests across 16 test files

**Boundary Wording:**

T27 dead-spectator hidden-Hand isolation:
MANDATORY STAGE-04 WORK
NOT WAIVED
NOT IMPLEMENTED BY STAGE-03

Recipient-specific hidden-information projections:
STAGE-04

Actual 30-second deadline scheduling:
STAGE-04 / Application runtime

TURN_DEADLINE alarms:
STAGE-04

stale-alarm behavior:
STAGE-04

late-command arbitration:
STAGE-04

revision / dedupe:
STAGE-04

concurrent action safety:
STAGE-04

Room persistence / reconnect:
STAGE-04

Living-presence Pause/Resume:
STAGE-04

- 2/3/4 Players
  - seeds 0..15
  - max 24 authoritative commands per trace
  - exact authoritative command total = 894
  - legality derived through getAllowedTurnActions
  - public applyPlayCardsCommand / applyCallLiar paths
  - source MatchState immutable on every command
- Authoritative state invariants:
  - fixed seatOrder
  - fixed firstRoundStarter
  - exact Player identity set preserved
  - 20-card conservation
  - unique Card IDs
  - 6K / 6Q / 6A / 2J
  - Table Rank valid
  - previousPlay coherent
  - current Player authoritative turn-eligible
  - ALIVE/roundStatus/Hand coherence
  - fresh-Round 5-card Living distribution
  - Eliminated Players receive no fresh Hand
  - winner coherence
  - Revolver sequence persists for Match
- PLAY transition properties:
  - createdPlay ID = pre-command playSequence
  - post-command playSequence = pre + 1
  - Play IDs globally unique and monotonic across Round boundaries
  - createdPlay count = selected Card count
  - Claim Rank = pre-command Table Rank
  - ordinary PLAY removes selected Cards from Hand
  - selected Cards enter centralPile exactly once
  - unselected Hand Cards remain
  - ordinary no-Shot PLAY leaves every Revolver index unchanged
- CALL / Shot properties:
  - forced CALL targets newly-created Play
  - explicit CALL targets exact pre-command previousPlay
  - challenge shooter = round loser
  - Shot player = challenge shooter
  - Shot nextShotIndex = shotIndex + 1
  - authoritative shooter index advances exactly one
  - all non-shooter indices remain unchanged
- Non-vacuous deterministic observations:
  - EMPTY_SAFE states = 3
  - ALIVE zero-card states = 84
  - actual fresh Round 2+ states = 181
  - FINISHED matches = 22
  - Blank shots = 159
  - fresh Round 2+ states containing Eliminated Player = 41
- Repeated Table Rank:
  - prior Table Rank = KING
  - next Round Table Rank = KING
  - explicit prior == next assertion
  - Round 2 canonical state verified
  - repeated Table Rank confirmed legal
- Timeout property sweep:
  - 45 cases
  - every Hand index 0..4
  - 2/3/4 Players
  - exact authoritative Card selected by injected RNG index
  - exactly one Card
  - Claim Rank = Table Rank
  - actor = authoritative currentPlayerId
  - exactly one ordinary timeout selection RNG call
  - source state immutable
- Deterministic replay:
  - 6 full replay cases
  - independently allocated equivalent inputs/RNGs
  - final states deep-equal
  - authoritative event logs deep-equal
- Prototype safety:
  - __proto__ Player ID
  - constructor Player ID
  - null-prototype players dictionary persists through generated commands
- GAME_RULES §24 matrix:
  - 33 total invariants classified
  - PROPERTY_DIRECT = 20
  - SCENARIO_VERIFIED = 12
  - STAGE04_DEFERRED = 1
  - I29 alone remains STAGE04_DEFERRED
  - T27 recipient-projection/security remains mandatory Stage-04 work
  - no other invariant deferred
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 251 tests across 16 files
  - T-016 suite = 9 test blocks
- No product source changes.
- No dependency changes.
- No Architecture change.
- No forbidden nondeterminism.

**STAGE-02 — Canonical Core Engine:**
COMPLETE

**Stage Exit Gate:**
PASS

**Stage-02 Required Tasks:**
T-002 through T-011 all VERIFIED

**Canonical Core Coverage:**
T01–T26 PASS
T28–T31 PASS

**T27:**
mandatory project requirement
not waived
not implemented yet
retained for STAGE-04 recipient-specific hidden-information projections

No currently evidenced unresolved pure-Core GAME_RULES ambiguity remains.

Core deterministic-transition requirement PASS.

**STAGE-03 — Player-Count & Rule Hardening:**
COMPLETE

**Stage Exit Gate:**
PASS

**Stage-03 Required Tasks:**
- T-012-TWO-PLAYER-FLOW-HARDENING VERIFIED
- T-013-THREE-PLAYER-FLOW-HARDENING VERIFIED
- T-014-FOUR-PLAYER-FLOW-HARDENING VERIFIED
- T-015-SELECTED-UNCONFIRMED-TIMEOUT-HARDENING VERIFIED
- T-016-INVARIANT-PROPERTY-HARDENING VERIFIED

**Stage-Level Acceptance:**
- 2-player suite PASS
- 3-player suite PASS
- 4-player suite PASS
- selected-but-unconfirmed timeout policy PASS
- invariant/property tests PASS

Remaining Stage-03 implementation work:
NONE

**Formal Architect Stage Gate:**
PASS

**Architecture Review:**
PASS

**Security Boundary Review:**
PASS — T27 retained as mandatory STAGE-04 work

**UI Review:**
N/A

**Release Review:**
N/A

**Open Blockers:**
NONE

**Latest Full Regression:**
npm ci PASS
npm run typecheck PASS
npm test PASS
251 tests across 16 test files

**Boundary Wording:**

T27 dead-spectator hidden-Hand isolation:
MANDATORY STAGE-04 WORK
NOT WAIVED
NOT IMPLEMENTED BY STAGE-03

Recipient-specific hidden-information projections:
STAGE-04

Actual 30-second deadline scheduling:
STAGE-04 / Application runtime

TURN_DEADLINE alarms:
STAGE-04

stale-alarm behavior:
STAGE-04

late-command arbitration:
STAGE-04

revision / dedupe:
STAGE-04

concurrent action safety:
STAGE-04

Room persistence / reconnect:
STAGE-04

Living-presence Pause/Resume:
STAGE-04

End-to-end card-selection/highlight UI:
later UI work

These are not Stage-03 failures.

**STAGE-04 — Authoritative Multiplayer:**

**Status:**
IN_PROGRESS

**Current Stage:**
YES

**Registered Tasks:**
- T-017-ROOM-AUTHORITY-PROTOCOL-FOUNDATION VERIFIED
- T-018-REVISION-IDEMPOTENCY-TURN-ADMISSION VERIFIED
- T-019-SERVER-ACTOR-AUTHORIZATION-BINDING VERIFIED
- T-020-AUTHORITATIVE-GAMEPLAY-COMMIT-PRIMITIVE VERIFIED
- T-021-TURN-DEADLINE-AUTHORITY-FOUNDATION VERIFIED

**Exit Gate:**
NOT_EVALUATED

**T-017 Room Authority & Protocol Foundation VERIFIED:**
- New workspace `@liars-telegram-game/room-runtime` established
- Provider-independent: YES
- Cloudflare/provider APIs: NOT IMPLEMENTED HERE
- Room authority foundation:
  - RoomLifecycle exact set: `LOBBY`, `MATCH_ACTIVE`, `MATCH_PAUSED_NO_LIVING_CONNECTIONS`, `MATCH_FINISHED`, `ABANDONED`
  - RoomAlarmKind exact set: `TURN_DEADLINE`, `HOST_GRACE`, `ROOM_RETENTION`
  - ActiveRoomAlarm: `{ kind, dueAt, generation }`
  - RoomAuthorityState exact authoritative key surface: `roomId`, `lifecycle`, `revision`, `members`, `hostPlayerId`, `match`, `currentTurnId`, `currentTurnDeadline`, `activeAlarm`
  - generic Match snapshot boundary preserved
  - initial Room: `LOBBY`, revision `0`, empty members, null host, null Match, null turnId, null deadline, null alarm
  - fresh independently allocated initial state
  - invalid blank/whitespace Room ID rejected
- Room-state authority boundary:
  - 8 forbidden local-selection keys
  - exhaustive compile-time extraction proof PASS (`RoomSelectionLeak = never`)
  - exact key-surface `ExtraKeys = never` PASS
  - exact key-surface `MissingKeys = never` PASS
  - runtime constructed-state forbidden-key proof PASS
  - pre-confirm card selection remains non-authoritative
- Gameplay protocol:
  - exact client envelope: `actionId`, `expectedRevision`, `turnId`, `actionType`, `payload`
  - Client gameplay actions: `PLAY_CARDS`, `CALL_LIAR`
  - `SYSTEM_TIMEOUT` client action: REJECTED
  - `PLAY_CARDS`: payload only `cardIds`, 1..3 IDs, non-empty strings, unique IDs
  - `CALL_LIAR`: exact empty payload, target not client-specified
- Strict trust boundary:
  - unexpected envelope fields rejected
  - `actorId`/`playerId` authority rejected
  - claim rank/count authority rejected
  - challenge/shooter/truth/winner authority rejected
  - malformed input rejected
  - `expectedRevision` safe integer >= 0
  - `actionId` non-empty string
  - `turnId` non-empty string
  - `PLAY` `cardIds` detached from untrusted input
  - parser input immutable
- Latest regression:
  - `npm ci` PASS
  - `npm run typecheck` PASS
  - `npm test` PASS
  - 274 tests across 18 files
  - `game-core` = 251 tests / 16 files
  - `room-runtime` = 23 tests / 2 files
- No external dependency changes.
- No package-lock correction changes.
- No `game-core` source changes.
- No `game-core` test changes.
- No product Room-state source correction required.

**T-018 Revision, Idempotency & Turn Admission VERIFIED:**
- Provider-independent: YES
- ADR-006 admission ordering:
  1. existing actionId lookup
  2. unseen revision check
  3. MATCH_ACTIVE lifecycle check
  4. current turnId check
  5. ACCEPT
- Admission outcomes: ACCEPT, DUPLICATE, REJECT
- Rejection reasons: ACTION_ID_CONFLICT, STALE_REVISION, MATCH_NOT_ACTIVE, TURN_MISMATCH
- Successful retry behavior:
  - exact successfully processed request = DUPLICATE
  - duplicate lookup occurs before stale-revision validation
  - duplicate lookup occurs before current-turn validation
  - retry remains DUPLICATE after Room revision advances
  - retry remains DUPLICATE after current turn changes
  - prior resulting revision returned
- ActionId conflict behavior:
  - same actionId + different expectedRevision = conflict
  - same actionId + different turnId = conflict
  - same actionId + different actionType = conflict
  - same actionId + different PLAY cardIds = conflict
  - different PLAY card ordering = conflict
- Processed-action recording:
  - existing actionId lookup occurs before new-record resultingRevision validation
  - exact same request + same resultingRevision = idempotent no-op
  - same actionId + different request = Action ID conflict
  - same actionId + different resultingRevision = Action ID conflict
  - conflict takes precedence over generic resultingRevision validation
  - unseen invalid resultingRevision remains rejected by revision rule
  - unseen successful record requires resultingRevision = expectedRevision + 1
- Revision primitive:
  - monotonic +1
  - safe non-negative integers only
  - negative rejected
  - non-integer rejected
  - unsafe values rejected
  - MAX_SAFE_INTEGER overflow rejected
- Processed registry:
  - independently allocated
  - null-prototype
  - prototype-safe opaque actionId support
  - __proto__ safe
  - constructor safe
  - request snapshot retained
  - PLAY cardIds detached
  - original registry immutable
  - input envelope immutable
  - no hidden Match/randomness data stored
- Admission purity:
  - RoomAuthorityState not mutated
  - envelope not mutated
  - processed registry not mutated
  - rejected admission creates no record
  - admission itself does not mutate Room revision
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 305 tests / 19 files
  - game-core: 251 tests / 16 files
  - room-runtime: 54 tests / 3 files
  - No package.json changes.
  - No package-lock changes.
  - No external dependency changes.
  - No game-core changes.
  - No T-017 source/test changes.
  - No forbidden nondeterminism.

**T-019 Server Actor Authorization & Action Binding VERIFIED:**
- Workflow: STRICT
- Risk: HIGH
- Provider-independent: YES
- Server actor boundary:
  - ServerResolvedActor exists
  - actor identity is server-derived
  - GameplayActionEnvelope remains actor-free
  - low-level gameplay admission requires actor parameter
  - actor parameter is compile-time non-optional
  - no actorless duplicate path remains
  - malformed actor fails closed as INVALID_ACTOR_CONTEXT
  - no fallback to host/current player/client fields
- Safe request evaluation ordering:
  1. validate server actor context
  2. validate Room membership
  3. actor-bound actionId lookup
  4. unseen revision validation
  5. lifecycle validation
  6. Match snapshot validation
  7. Room turnId validation
  8. Match/current-player authorization
  9. Core legal-action validation
  10. Core PLAY ownership validation
  11. ACCEPT
- Membership privacy:
  - non-member rejected before dedupe disclosure
  - non-member known actionId = ACTOR_NOT_MEMBER
  - not DUPLICATE
- Actor-bound idempotency:
  - ProcessedGameplayActionRecord contains actorPlayerId
  - same actor exact retry = DUPLICATE
  - same actor retry remains DUPLICATE after revision advance
  - same actor retry remains DUPLICATE after current turn changes
  - priorResultingRevision returned
  - cross-actor same actionId = ACTION_ID_CONFLICT
  - cross-actor conflict never ACCEPT
  - cross-actor conflict never DUPLICATE
  - rejection does not expose original actor identity
- Successful action recording:
  - server actor required
  - successful record binds actorPlayerId
  - same actor/request/result re-record = idempotent
  - different actor = Action ID conflict
  - different request = Action ID conflict
  - different resultingRevision = Action ID conflict
  - existing-action conflict precedence preserved
  - PLAY cardIds detached
  - null-prototype registry preserved
- Authorization:
  - Room membership required
  - Match player membership required
  - new command actor must be Match currentPlayerId
  - Host has no gameplay bypass
  - null Match snapshot rejected
  - finished/inconsistent Core Match fails closed
- Core rule delegation:
  - getAllowedTurnActions used
  - validatePlaySelection used
  - no duplicate gameplay-rule implementation in Room layer
- Action legality:
  - first-turn CALL_LIAR rejected
  - ordinary legal PLAY_CARDS accepted
  - ordinary CALL_LIAR accepted when Core permits
  - forced-CALL PLAY_CARDS rejected
  - forced-CALL CALL_LIAR accepted
- Card ownership:
  - authoritative actor Hand used
  - own legal card accepted
  - foreign Player card rejected
  - unknown card rejected
  - authorization result exposes no Card rank/value
  - other Players' Hands are not returned
- Prototype safety:
  - actionId __proto__ PASS
  - actionId constructor PASS
  - actor playerId __proto__ safe as value
  - actor playerId constructor safe as value
- Purity:
  - Room state not mutated
  - Match state not mutated
  - Hands not mutated
  - envelope not mutated
  - actor context not mutated
  - registry not mutated by request evaluation
  - Room revision not mutated
  - rejected request creates no processed record
  - no RandomSource consumed
  - no Core mutation/transition dispatched
  - no forbidden nondeterminism
- Workspace integration:
  - room-runtime has internal runtime dependency on game-core
  - game-core package exports/build resolution supports workspace consumption
  - no game-core source changes
  - no game-core test changes
  - no external dependency/version changes
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 331 tests / 20 files
  - game-core: 251 tests / 16 files
  - room-runtime: 80 tests / 4 files
- Direct room-runtime checks from clean dist state: PASS
- Correction package delta: 0
- Correction package-lock delta: 0
- Correction game-core delta: 0

**T-020 Authoritative Gameplay Commit Primitive VERIFIED:**
- Workflow: STANDARD
- Risk: MEDIUM
- Provider-independent: YES
- Transaction boundary:
  - executeClientGameplayTransaction exists
  - client actions supported: PLAY_CARDS, CALL_LIAR
  - SYSTEM_TIMEOUT not handled
  - no provider API
  - no persistence API
- Transaction ordering:
  1. T-019 authorization
  2. REJECT/DUPLICATE early return
  3. validate server-prepared next turn
  4. verified Core command dispatch
  5. validate Core result consistency
  6. compute exactly one next Room revision
  7. record exactly one successful processed client action
  8. construct next authoritative Room state
  9. return COMMITTED
- Authorization preservation:
  - delegates to evaluateServerGameplayActionRequest
  - no duplicate authorization implementation
  - REJECT preserves T-019 reason
  - REJECT performs no Core transition
  - REJECT does not increment revision
  - REJECT creates no record
  - DUPLICATE returns priorResultingRevision
  - DUPLICATE performs no Core transition
  - DUPLICATE does not increment revision
  - DUPLICATE creates no second record
  - DUPLICATE does not rotate turnId
  - DUPLICATE does not require valid preparedNextTurn
- Server-prepared next turn:
  - server-only context
  - client envelope unchanged
  - actor-free client envelope preserved
  - non-empty turnId required for new accepted command
  - next turnId cannot equal consumed currentTurnId
  - validated after authorization ACCEPT
  - validated before Core dispatch
  - no turnId generation in room-runtime
- Core dispatch:
  - PLAY_CARDS uses applyPlayCardsCommand
  - CALL_LIAR uses applyCallLiar
  - low-level applyPlayCards not used
  - Core derives claims/challenge/roulette/round reset/winner
  - supplied RandomSource passed through
  - no extra randomness source
- One-command / one-revision:
  - one accepted client command increments Room revision exactly once
  - processed record resultingRevision equals Room revision
  - both equal envelope.expectedRevision + 1
- Ordinary PLAY:
  - COMMITTED
  - Core-derived Match update
  - selected cards removed by Core
  - previousPlay Core-derived
  - exactly one processed record
  - prepared next turn installed
  - old currentTurnDeadline cleared
  - old activeAlarm cleared
- CALL_LIAR:
  - COMMITTED
  - Core-derived challenge/roulette/next-round behavior
  - exactly one Room revision
  - exactly one processed CALL_LIAR record
  - continuing Match receives prepared next turn
  - stale timing metadata cleared
- Forced-CALL PLAY:
  - Core command orchestration may internally execute forced CALL
  - still one client transaction
  - Room revision increments exactly once
  - exactly one processed client record
  - record actionType remains PLAY_CARDS
  - zero synthetic CALL_LIAR client record
- Match finish:
  - winning client command COMMITTED
  - Room lifecycle becomes MATCH_FINISHED
  - Core Match status FINISHED
  - winnerId non-null
  - currentTurnId null
  - currentTurnDeadline null
  - activeAlarm null
  - no Room-layer next round
- Continuing Match:
  - lifecycle remains MATCH_ACTIVE
  - prepared next turn installed
  - old deadline/alarm invalidated
- Core consistency guards:
  - IN_PROGRESS + winnerId non-null fails closed
  - FINISHED + winnerId null fails closed
  - invalid Core result creates no processed action record
- Purity:
  - input Room state not mutated
  - input Match not mutated
  - input Hands not mutated
  - envelope not mutated
  - actor not mutated
  - prepared next turn not mutated
  - input registry not mutated
  - fresh Room state returned on COMMITTED
  - registry prototype safety retained
- Randomness:
  - only injected Core RandomSource used
  - rejected request consumes no gameplay randomness
  - duplicate consumes no gameplay randomness
  - no Math.random
  - no Date.now
  - no crypto entropy introduced
- Important persistence distinction:
  - T-020 provides a pure in-memory logical commit pair: Room state + processed registry
  - it does NOT provide durable atomic persistence
  - future Durable Object / SQLite work must persist both transactionally
- Timing boundary:
  - successful client command invalidates consumed turn deadline/alarm
  - next 30-second deadline remains deferred
  - TURN_DEADLINE scheduling remains deferred
  - alarm generation remains deferred
  - late-command/deadline arbitration remains deferred
- Presence boundary:
  - elimination may occur through Core
  - presence information is unavailable here
  - no Pause/Resume logic
  - life-status-triggered Pause re-evaluation deferred
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 347 tests / 21 files
  - game-core: 251 tests / 16 files
  - room-runtime: 96 tests / 5 files
- Direct room-runtime checks: PASS
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core source/test changes.
- No T-017/T-018/T-019 source changes.

**Explicitly NOT IMPLEMENTED BY T-020:**
- SYSTEM_TIMEOUT Room orchestration
- deadline scheduling
- TURN_DEADLINE alarm scheduling
- late-command/deadline arbitration
- presence accounting
- Pause/Resume
- life-status-triggered Pause
- Durable Object
- WebSocket
- SQLite persistence/reload
- durable atomic transaction
- actual concurrency serialization
- Telegram auth/session
- recipient-specific projection
- T27

T27 remains mandatory STAGE-04 security work.

**T-021 Turn Deadline Authority Foundation VERIFIED:**
- Workflow: STANDARD
- Risk: MEDIUM
- Provider-independent: YES
- Turn duration:
  - exact TURN_DURATION_MS = 30000
  - no configurable client duration
  - no client clock authority
- Server-time boundary:
  - authoritativeNowMs is trusted server-side input
  - must be safe non-negative integer
  - dueAt overflow guarded
  - no Date.now
  - no performance.now
  - no Math.random
  - no crypto entropy
  - no RandomSource
- Arming primitive:
  - armActiveTurnDeadline exists
  - requires MATCH_ACTIVE
  - requires non-null Core Match
  - requires Match IN_PROGRESS
  - requires winnerId null
  - requires non-blank currentTurnId
  - requires currentTurnDeadline null
  - requires activeAlarm null
  - requires valid Room revision
  - refuses to overwrite any existing active alarm
- Canonical armed state:
  - currentTurnDeadline = authoritativeNowMs + 30000
  - activeAlarm:
    - kind = TURN_DEADLINE
    - dueAt = currentTurnDeadline
    - generation = Room revision
- Revision semantics:
  - arming does NOT increment Room revision
  - activeAlarm.generation equals existing Room revision
  - timing completion belongs to same logical authoritative revision
  - T-020 continuing COMMITTED state can be armed while retaining same revision
- One-active-alarm:
  - existing TURN_DEADLINE rejected
  - existing HOST_GRACE rejected
  - existing ROOM_RETENTION rejected
  - no implicit alarm replacement
- Due evaluation:
  - evaluateTurnDeadlineDueState exists
  - coherent MATCH_ACTIVE state required
  - now < dueAt → NOT_DUE
  - now == dueAt → DUE
  - now > dueAt → DUE
- Fail-closed timing coherence:
  - null deadline → INVALID_STATE
  - null activeAlarm → INVALID_STATE
  - wrong alarm kind → INVALID_STATE
  - alarm dueAt mismatch → INVALID_STATE
  - alarm generation mismatch → INVALID_STATE
  - invalid revision → INVALID_STATE
  - blank/null turnId → INVALID_STATE
  - missing Match → INVALID_STATE
  - finished Core Match while Room active → INVALID_STATE
  - active Match with winner → INVALID_STATE
- Stale alarm safety:
  - alarm generation older/different from Room revision never authorizes timeout
  - stale generation returns INVALID_STATE, not DUE
- Lifecycle applicability:
  - LOBBY → NOT_APPLICABLE
  - MATCH_PAUSED_NO_LIVING_CONNECTIONS → NOT_APPLICABLE
  - MATCH_FINISHED → NOT_APPLICABLE
  - ABANDONED → NOT_APPLICABLE
- T-020 integration:
  - continuing client gameplay commit produces new turn with deadline/alarm null
  - T-021 arms that turn at the SAME revision
  - finished T-020 result cannot be armed
  - T-020 gameplay transaction source remains unchanged
  - T-020 one-command/one-revision semantics preserved
- Purity:
  - input Room state not mutated
  - input Match not mutated
  - Hands not mutated
  - revision not mutated by arming/evaluation
  - due evaluator is pure
  - fresh Room state returned by arming
- No gameplay execution:
  - no Core transition
  - no applySystemTimeout
  - no applyPlayCardsCommand
  - no applyCallLiar
  - no Card selection
  - no SYSTEM_TIMEOUT client action
  - no synthetic actionId
- Important boundary:
  - activeAlarm here is authoritative Room metadata
  - it is NOT Cloudflare alarm scheduling
  - no provider setAlarm/getAlarm/deleteAlarm
  - no alarm handler
- Important persistence distinction:
  - same-revision timing completion is pure in-memory state composition
  - it is NOT durable atomic persistence
  - future coordinator must persist gameplay result + timing metadata atomically
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 369 tests / 22 files
  - room-runtime: 118 tests / 6 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core changes.
- No room-state changes.
- No gameplay-protocol changes.
- No gameplay-transaction changes.
- T-022 Timed Client Gameplay Arbitration VERIFIED
- Workflow: STANDARD
- Risk: MEDIUM
- Provider-independent: YES
- Composition:
  - T-019 authorization/idempotency
  - T-021 authoritative deadline evaluation
  - T-020 authoritative gameplay commit
  - T-021 next-turn re-arm
- Mandatory ordering:
  1. evaluateServerGameplayActionRequest
  2. DUPLICATE early return
  3. REJECT early return
  4. evaluateTurnDeadlineDueState
  5. DUE → DEADLINE_DUE
  6. NOT_DUE → executeClientGameplayTransaction
  7. continuing Match → armActiveTurnDeadline
  8. finished Match → no re-arm
- DUPLICATE precedence:
  - exact successful retry wins over deadline arbitration
  - retry after deadline remains DUPLICATE
  - retry after revision/turn advance remains DUPLICATE
  - priorResultingRevision preserved
  - no deadline evaluation required
  - no preparedNextTurn validation
  - no Core dispatch
  - no gameplay randomness
- Authorization precedence:
  - rejected traffic remains rejected before timing arbitration
  - non-member after deadline → ACTOR_NOT_MEMBER
  - cross-actor actionId collision after deadline → ACTION_ID_CONFLICT
  - stale revision remains STALE_REVISION
  - unauthorized traffic does not reveal/trigger timeout state
- Deadline policy:
  - authoritativeNowMs < currentTurnDeadline → client may commit
  - authoritativeNowMs == currentTurnDeadline → DEADLINE_DUE
  - authoritativeNowMs > currentTurnDeadline → DEADLINE_DUE
  - no grace period
  - no client timestamp authority
- DEADLINE_DUE semantics:
  - means client authority for that turn expired
  - does NOT mean SYSTEM_TIMEOUT committed
  - no Core dispatch
  - no Room revision change
  - no processed action record
  - no turn rotation
  - no RandomSource consumption
  - no prepared-next-turn validation
  - old deadline remains unchanged
  - old activeAlarm remains unchanged
- Before-deadline COMMITTED behavior:
  - delegates mutation to verified T-020
  - ordinary PLAY supported
  - legal CALL_LIAR supported
  - Room revision increments exactly once
  - one processed client action record
  - processed resultingRevision equals Room revision
  - continuing Match installs prepared next turn
  - consumed old timing metadata cleared by T-020
  - T-021 arms fresh next-turn deadline
- Next-turn timing:
  - new deadline = authoritativeNowMs + 30000
  - not oldDeadline + 30000
  - activeAlarm.kind = TURN_DEADLINE
  - activeAlarm.dueAt = new deadline
  - activeAlarm.generation = resultingRevision
  - arming adds zero extra revision
- One-command/one-revision:
  - one successful client command = exactly one Room revision increment
  - T-021 timing completion retains that resulting revision
  - no extra revision for re-arm
- Match finish:
  - successful winning client command remains COMMITTED
  - lifecycle = MATCH_FINISHED
  - winnerId present
  - currentTurnId = null
  - currentTurnDeadline = null
  - activeAlarm = null
  - no next-turn re-arm
- Timing coherence:
  - INVALID_STATE after T-019 ACCEPT fails closed before T-020
  - NOT_APPLICABLE after T-019 ACCEPT treated as invariant failure
  - no silent repair
- Purity:
  - non-COMMITTED outcomes do not mutate Room
  - Match not mutated directly by timed layer
  - Hands not mutated directly
  - envelope not mutated
  - actor not mutated
  - registry not mutated
  - T-020/T-021 immutable semantics retained on COMMITTED
- Randomness:
  - only supplied RandomSource may reach T-020/Core
  - DUPLICATE consumes zero gameplay randomness
  - REJECT consumes zero gameplay randomness
  - DEADLINE_DUE consumes zero gameplay randomness
  - no Date.now
  - no performance.now
  - no Math.random
  - no crypto entropy
- SYSTEM_TIMEOUT boundary:
  - applySystemTimeout not imported
  - applySystemTimeout not called
  - no timeout Card selection
  - no synthetic system actionId
  - no system processed-action record
- Provider boundary:
  - no storage.setAlarm
  - no storage.getAlarm
  - no storage.deleteAlarm
  - no Durable Object alarm handler
  - no provider scheduling
- Security/hidden-information boundary:
  - GameplayActionEnvelope unchanged
  - no client timestamp/deadline fields
  - no client SYSTEM_TIMEOUT
  - no hidden Card-value metadata added to timed result
  - COMMITTED Room state is internal authoritative server state
  - not safe broadcast projection
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 386 tests / 23 files
  - room-runtime: 135 tests / 7 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core source/test changes.
- No room-state changes.
- No gameplay-protocol changes.
- No gameplay-admission changes.
- No gameplay-authorization changes.
- No gameplay-transaction changes.
- No turn-deadline changes.
- T-023 System Timeout Deadline Transaction VERIFIED
- Workflow: STANDARD
- Risk: MEDIUM
- Provider-independent: YES
- Server-only trigger:
  - ServerTurnDeadlineTrigger:
    - kind = TURN_DEADLINE
    - dueAt
    - generation
    - not client input
- Trigger validation:
  - trigger object required
  - kind exactly TURN_DEADLINE
  - dueAt safe non-negative integer
  - generation safe non-negative integer
  - authoritativeNowMs safe non-negative integer
- Exact alarm identity:
  - trigger compared against current activeAlarm before due evaluation
  - kind must match
  - dueAt must match
  - generation must match
- STALE_ALARM:
  - null current alarm → STALE_ALARM
  - wrong current alarm kind → STALE_ALARM
  - dueAt mismatch → STALE_ALARM
  - generation mismatch → STALE_ALARM
  - zero Core dispatch
  - zero RNG
  - zero revision mutation
  - no preparedNextTurn validation
- Stale/retry safety:
  - old trigger after successful timeout → STALE_ALARM
  - old trigger remains STALE_ALARM even after next turn's deadline becomes due
  - old trigger can never timeout the next turn
  - old trigger after Match finish cannot execute Core again
- Deadline evaluation:
  - delegates to T-021 evaluateTurnDeadlineDueState
- Exact boundary:
  - now < dueAt → NOT_DUE
  - now == dueAt → DUE / eligible for SYSTEM_TIMEOUT
  - now > dueAt → DUE / eligible for SYSTEM_TIMEOUT
- NOT_DUE:
  - no Core dispatch
  - no RNG
  - no state mutation
  - existing deadline/alarm preserved
- NOT_APPLICABLE:
  - no Core transition
- INVALID_STATE:
  - no Core transition
- DUE preparation:
  - preparedNextTurn validated before Core
  - prepared turnId non-empty
  - prepared turnId differs from current turnId
  - nextRoomRevision validated before Core RNG
  - revision overflow fails before RNG
- Core delegation:
  - exactly applySystemTimeout(roomState.match, random)
  - no direct applyPlayCardsCommand
  - no Room manual card selection
  - no Room manual claim construction
  - Core derives timedOutPlayerId
  - Core derives autoPlayedCardId
  - same injected RandomSource forwarded
- Revision:
  - successful SYSTEM_TIMEOUT = exactly one Room revision increment
  - resultingRevision = previous revision + 1
  - no client actionId
  - no synthetic GameplayActionEnvelope
  - no processed client action record
  - system-event replay protection uses alarm identity/generation
- Continuing Match:
  - lifecycle = MATCH_ACTIVE
  - Core Match = returned IN_PROGRESS state
  - currentTurnId = preparedNextTurn.turnId
  - old deadline cleared
  - old activeAlarm cleared
  - T-021 re-arms next turn
  - currentTurnDeadline = authoritativeNowMs + 30000
  - activeAlarm.kind = TURN_DEADLINE
  - activeAlarm.dueAt = new deadline
  - activeAlarm.generation = resultingRevision
  - no additional revision for re-arm
- Finished Match:
  - lifecycle = MATCH_FINISHED
  - winnerId non-null
  - currentTurnId = null
  - currentTurnDeadline = null
  - activeAlarm = null
  - no turn re-arm
  - ROOM_RETENTION intentionally not implemented by T-023
- Core consistency:
  - IN_PROGRESS + winnerId non-null fails closed
  - FINISHED + winnerId null fails closed
- Mandatory CALL defensive guard:
  - Core mandatory CALL-only rejection preserved
  - failure propagated
  - no manual timeout fallback
  - no auto-CALL invented
  - no Room mutation
  - Core rejects before timeout RNG
- Local selection boundary:
  - no selected/highlighted/draft state accepted
  - local selection cannot influence SYSTEM_TIMEOUT
  - timeout card remains Core + injected RNG authority
- T-022 race integration:
  - timeout COMMITTED advances Room revision
  - unseen client command using old revision/turn cannot override timeout
  - deterministic proof rejects old command with STALE_REVISION
- Purity:
  - input Room not mutated
  - input Match not mutated
  - input Hands not mutated
  - trigger not mutated
  - preparedNextTurn not mutated
  - COMMITTED returns fresh authoritative Room state
- Security:
  - SYSTEM_TIMEOUT is not a client action
  - timeout trigger is internal server state
  - timeout metadata is internal server data
  - autoPlayedCardId must not be treated as recipient-safe projection
  - no hidden-information broadcast introduced
- Provider boundary:
  - no storage.setAlarm
  - no storage.getAlarm
  - no storage.deleteAlarm
  - no Durable Object alarm()
  - no provider alarm handler
  - no SQLite
  - no persistence
  - no WebSocket
  - no actual concurrency implementation
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 405 tests / 24 files
  - room-runtime: 154 tests / 8 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core source/test changes.
- No T-020 source changes.
- No T-021 source changes.
- No T-022 source changes.

- T-024 Unique Living Presence Foundation VERIFIED
- Workflow: STANDARD
- Risk: MEDIUM
- Provider-independent: YES
- Presence authority:
  - separate RoomPresenceRegistry
  - NOT stored in RoomAuthorityState
  - server-authenticated/server-resolved connection identity assumed
  - authentication itself not implemented
- Connection model:
  - connectionId → playerId unique binding
  - Player may own multiple connectionIds
  - exact duplicate registration idempotent
  - exact missing unregister idempotent
  - cross-Player connection collision fails closed
  - wrong-Player unregister fails closed
  - no connection stealing/rebinding
- Prototype safety:
  - prototype-safe null-prototype maps
  - __proto__ playerId safe
  - constructor playerId safe
  - __proto__ connectionId safe
  - constructor connectionId safe
- Membership:
  - registration requires existing Room membership
  - non-member registration rejected
- Connected members:
  - only Room members with >=1 registered connection
  - multiple sockets appear once
  - deterministic Room membership ordering
- Living presence:
  - connectedLivingPlayers = count of unique connected Room members whose authoritative Match lifeStatus == ALIVE
- Living authority:
  - lifeStatus only
  - hand size is not authority
  - roundStatus is not authority
  - host status is not authority
  - current-turn identity is not authority
- ALIVE states:
  - WITH_CARDS counts
  - EMPTY_PENDING_CHALLENGE counts
  - EMPTY_SAFE counts
- Eliminated spectator:
  - may remain tracked as connected Room member
  - does not enter connectedLivingPlayerIds
  - contributes zero to connectedLivingPlayers
  - cannot prevent future Pause
  - cannot cause future Resume
- Multi-socket:
  - one Living Player / one connection → count 1
  - one Living Player / multiple connections → still count 1
  - removing one of many → still connected
  - removing final connection → disconnected
- Current Player:
  - may be disconnected
  - another connected Living Player keeps connectedLivingPlayers > 0
- Match-null/Lobby:
  - connected Room members may be tracked
  - connectedLivingPlayers = 0
  - no fake Core Living semantics
- Raw presence noise:
  - connect = zero Room revision
  - disconnect = zero Room revision
  - duplicate connect = zero Room revision
  - duplicate disconnect = zero Room revision
  - zero lifecycle mutation
  - zero deadline mutation
  - zero alarm mutation
  - zero Core transition
  - zero gameplay processed record
- Purity:
  - Room input not mutated
  - registry input not mutated
  - connection input not mutated
  - evaluator does not mutate registry
  - immutable fresh registry returned when change occurs
- Security:
  - no client presence-count authority
  - no client lifeStatus authority
  - presence summary is internal server authority data
  - not a recipient projection
  - no spectator projection added
  - T27 remains deferred
- No:
  - Pause implementation
  - Resume implementation
  - deadline clearing on disconnect
  - re-arm on reconnect
  - nextRoomRevision use
  - gameplay transaction dispatch
  - SYSTEM_TIMEOUT dispatch
  - WebSocket
  - Durable Object
  - SQLite
  - provider alarm API
  - Telegram authentication implementation
  - reconnect orchestration
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 425 tests / 25 files
  - room-runtime: 174 tests / 9 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core changes.
- No existing authority source changes.

- T-025 Living Presence Pause Resume Lifecycle VERIFIED
- Workflow: STANDARD
- Risk: MEDIUM
- Provider-independent: YES
- Pause authority:
  - delegates Living presence to T-024 evaluateRoomPresence
  - MATCH_ACTIVE + connectedLivingPlayers > 0 → NO_CHANGE
  - MATCH_ACTIVE + connectedLivingPlayers == 0 → PAUSED
  - current Player disconnect alone does not Pause if another Living Player is connected
  - host has no special presence authority
- Pause transition:
  - lifecycle → MATCH_PAUSED_NO_LIVING_CONNECTIONS
  - revision increments exactly once
  - Match preserved
  - currentTurnId preserved
  - current Player preserved
  - Hands preserved
  - table rank preserved
  - previousPlay preserved
  - round preserved
  - roulette progress preserved
  - currentTurnDeadline → null
  - activeAlarm → null
  - no Core transition
  - no gameplay processed record
- Pause timing coherence:
  - active Room requires coherent TURN_DEADLINE
  - dueAt equals currentTurnDeadline
  - generation equals Room revision
  - wrong alarm kind fails closed
  - Pause does not depend on whether deadline is already due
  - Pause takes no wall-clock input
- Old timeout after Pause:
  - old TURN_DEADLINE trigger → STALE_ALARM
  - zero SYSTEM_TIMEOUT
  - zero Core transition
  - zero gameplay RNG
- Paused gameplay:
  - T-022 client gameplay → REJECT / MATCH_NOT_ACTIVE
  - no client gameplay can commit while paused
- Resume authority:
  - only MATCH_PAUSED_NO_LIVING_CONNECTIONS
  - derives before/after Living facts through T-024
  - before connectedLivingPlayers must equal 0
  - after connectedLivingPlayers must equal 1
  - exact 0→1 only
- Resume fail-closed:
  - 0→0 → NO_CHANGE
  - paused before-count nonzero → INVALID_STATE
  - 0→2 → INVALID_STATE
  - retained paused deadline/alarm → INVALID_STATE
- Eliminated spectator:
  - reconnect produces Living 0→0
  - cannot Resume
  - Eliminated Host cannot Resume
  - cannot prevent Pause
- Resume transition:
  - lifecycle → MATCH_ACTIVE
  - revision increments exactly once
  - same Match preserved
  - same currentTurnId preserved
  - same gameplay turn preserved
  - no Core transition
- Fresh Resume timer:
  - authoritativeResumeTimeMs server-injected
  - validated safe non-negative integer
  - deadline = authoritativeResumeTimeMs + 30000
  - old deadline not restored
  - old remaining time not restored
  - T-021 armActiveTurnDeadline used
  - alarm kind = TURN_DEADLINE
  - alarm dueAt = fresh deadline
  - alarm generation = resultingRevision
  - timing arming adds zero extra revision
- Additional reconnect:
  - ACTIVE Room Resume evaluation → NOT_APPLICABLE
  - second Living reconnect does not reset timer
  - extra socket for already-connected Living Player does not reset timer
- Post-elimination foundation:
  - presence registry may remain unchanged
  - authoritative lifeStatus ALIVE→ELIMINATED can reduce Living count to zero
  - resulting IN_PROGRESS Room can then Pause
  - T-020/T-023 composition not yet implemented
- Finished precedence:
  - MATCH_FINISHED Pause → NOT_APPLICABLE
  - MATCH_FINISHED Resume → NOT_APPLICABLE
  - winner state is never converted to PAUSED
  - future post-Core orchestration must apply finished precedence before Pause
- LOBBY / ABANDONED:
  - Pause NOT_APPLICABLE
  - Resume NOT_APPLICABLE
- Security:
  - no client Pause authority
  - no client Resume authority
  - no client Living-count authority
  - presence registries remain internal
  - no recipient projection
  - T27 remains deferred
- Provider boundary:
  - no WebSocket
  - no Durable Object
  - no SQLite
  - no provider alarm API
  - no persistence
  - no actual concurrency
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 445 tests / 26 files
  - room-runtime: 194 tests / 10 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core source/test changes.
- No existing authority source changes.

- T-026 System Timeout Presence Lifecycle Composition VERIFIED.
- Workflow: STANDARD
- Risk: MEDIUM
- Composition ordering:
  1. T-023 executeSystemTimeoutDeadlineTransaction first
  2. non-COMMITTED outcomes pass through
  3. MATCH_FINISHED has absolute precedence
  4. continuing MATCH_ACTIVE delegates to T-025 Pause reconciliation
- Non-COMMITTED:
  - STALE_ALARM → pass through
  - NOT_DUE → pass through
  - NOT_APPLICABLE → pass through
  - INVALID_STATE → pass through
  - no additional lifecycle revision
  - no additional RNG
  - no Pause composition
- COMMITTED_ACTIVE:
  - T-023 timeout transition only
  - initial revision N
  - timeout revision N+1
  - final revision N+1
  - lifecycle MATCH_ACTIVE
  - prepared next turnId preserved
  - deadline = authoritativeNowMs + 30000
  - TURN_DEADLINE generation = timeout revision
  - zero additional lifecycle revision
- COMMITTED_PAUSED:
  - T-023 Core timeout transition N → N+1
  - T-025 ACTIVE→PAUSED transition N+1 → N+2
  - final revision = timeout revision +1
  - exactly two total Room revisions
  - lifecycle MATCH_PAUSED_NO_LIVING_CONNECTIONS
  - T-023 resulting Match preserved
  - prepared next turnId preserved
  - final deadline null
  - final activeAlarm null
  - intermediate T-023 alarm does not survive
  - no third revision
- Post-timeout elimination reconciliation:
  - same presence registry may remain unchanged
  - authoritative Core lifeStatus change ALIVE→ELIMINATED can change connectedLivingPlayers
  - verified 3-player scenario:
    only connected Living player eliminated
    Match remains IN_PROGRESS
    other Living players disconnected
    resulting connected Living count = 0
    final result = COMMITTED_PAUSED
- Finished precedence:
  - timeout-produced MATCH_FINISHED → COMMITTED_FINISHED
  - winner preserved
  - no T-025 Pause
  - no lifecycle revision after timeout
  - currentTurnId null
  - deadline null
  - activeAlarm null
  - winner state never becomes PAUSED
- Old trigger replay:
  - original pre-timeout trigger against composed paused Room → STALE_ALARM
  - no second SYSTEM_TIMEOUT
  - zero Core execution
  - zero RNG
- Resume compatibility:
  - final COMMITTED_PAUSED state is compatible with T-025
  - exact Living 0→1 Resume
  - revision N+2 → N+3
  - same prepared next turnId preserved
  - fresh resumeTime + 30000 deadline
  - alarm generation = resumed revision
  - no Core transition during Resume
- Timeout metadata:
  - timedOutPlayerId preserved
  - autoPlayedCardId preserved
  - both internal server data
- Client idempotency boundary:
  - ProcessedGameplayActionRegistry unchanged
  - actionId semantics unchanged
  - priorResultingRevision semantics unchanged
  - client gameplay + presence lifecycle composition NOT implemented
- Security:
  - no client SYSTEM_TIMEOUT authority
  - no client Pause authority
  - no client presence authority
  - no recipient projection
  - T27 remains mandatory/deferred
- Provider boundary:
  - no storage.setAlarm/getAlarm/deleteAlarm
  - no alarm handler
  - no Durable Object
  - no SQLite
  - no persistence
  - no WebSocket
  - no actual concurrency
- Intermediate pure activeAlarm metadata:
  - not provider scheduling
  - future provider orchestration must act on FINAL composed Room state
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 455 tests / 27 files
  - room-runtime: 204 tests / 11 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependencies.
- No game-core changes.
- No T-023/T-024/T-025 source changes.

- T-027 Client Gameplay Presence Lifecycle Composition VERIFIED.
- Workflow: STANDARD
- Risk: MEDIUM
- Composition ordering:
  1. T-022 timed client gameplay first
  2. REJECT / DUPLICATE / DEADLINE_DUE pass through
  3. MATCH_FINISHED has absolute precedence
  4. continuing MATCH_ACTIVE delegates to T-025 zero-Living Pause reconciliation
- Non-COMMITTED:
  - exact REJECT reason preserved
  - DUPLICATE priorResultingRevision preserved
  - DEADLINE_DUE preserved
  - no Pause reconciliation
  - no additional Room revision
  - no additional RNG
  - no processed registry mutation
- COMMITTED_ACTIVE:
  - client gameplay Core transition N → N+1
  - actionResultingRevision = N+1
  - finalResultingRevision = N+1
  - Room revision = N+1
  - processed record resultingRevision = N+1
  - lifecycle MATCH_ACTIVE
  - prepared next turnId preserved
  - deadline = authoritativeNowMs + 30000
  - alarm generation = N+1
  - zero extra lifecycle revision
- COMMITTED_PAUSED:
  - client gameplay transition N → N+1
  - T-025 Pause transition N+1 → N+2
  - exactly two total Room revisions
  - actionResultingRevision = N+1
  - finalResultingRevision = N+2
  - final Room revision = N+2
  - processed action record resultingRevision remains N+1
  - processed registry is exactly the T-022 returned registry
  - no re-recording
  - no third revision
  - lifecycle MATCH_PAUSED_NO_LIVING_CONNECTIONS
  - T-022 resulting Match preserved
  - prepared next turnId preserved
  - final deadline null
  - final activeAlarm null
  - intermediate T-022 alarm does not survive Pause
- Historical duplicate revision contract:
  - priorResultingRevision means the revision produced by the already-successful client action
  - it is NOT the latest/current Room revision
  - after action→Pause, priorResultingRevision may be N+1 while Room is N+2
  - after later Resume, priorResultingRevision remains N+1 while Room is N+3
  - authoritative current Room revision must come from Room state/resync
- Exact retry after Pause:
  - final Room revision N+2
  - original expectedRevision N
  - exact original actionId/envelope → DUPLICATE
  - priorResultingRevision = N+1
  - not N+2
  - zero Core
  - zero RNG
  - zero revision
  - zero Pause
  - zero timing mutation
- Exact retry after Resume:
  - Room may be N+3
  - same historical action → DUPLICATE
  - priorResultingRevision still N+1
  - no deadline reset
  - no lifecycle mutation
- ActionId conflict precedence:
  - same actionId with modified request → ACTION_ID_CONFLICT
  - conflict precedes stale revision
  - conflict precedes MATCH_NOT_ACTIVE
  - conflict precedes turn mismatch
- Unseen action against final Paused Room:
  - expectedRevision N+1 vs current N+2 → STALE_REVISION
  - expectedRevision N+2 → MATCH_NOT_ACTIVE
- This proves:
  historical action result revision != current authoritative Room revision.
- Post-action elimination reconciliation:
  - same presence registry may remain unchanged
  - successful client Core transition can change ALIVE→ELIMINATED
  - if only connected Living Player becomes Eliminated
  - Match remains IN_PROGRESS
  - other Living Players remain disconnected
  - connectedLivingPlayers becomes zero
  - final result COMMITTED_PAUSED
- Current Player/global presence:
  - current/acting Player disconnect/elimination alone does not force Pause if another Living Player remains connected
  - T-024 global unique Living semantics remain authority
- Finished precedence:
  - gameplay-produced MATCH_FINISHED → COMMITTED_FINISHED
  - actionResultingRevision = finalResultingRevision = N+1
  - processed record revision = N+1
  - winner preserved
  - no Pause lifecycle revision
  - currentTurnId null
  - deadline null
  - activeAlarm null
  - winner never becomes PAUSED
- Deadline arbitration:
  - before deadline unseen valid client may commit
  - at deadline → DEADLINE_DUE
  - after deadline → DEADLINE_DUE
  - DEADLINE_DUE creates no processed record
  - DEADLINE_DUE does not invoke Pause
  - exact duplicate keeps duplicate precedence over deadline arbitration
- Resume compatibility:
  - COMMITTED_PAUSED N+2
  - exact Living 0→1 Resume → N+3
  - same prepared next turnId
  - fresh resumeTime +30000 deadline
  - alarm generation N+3
  - historical processed record remains N+1
- Security:
  - no client presence authority
  - no client Pause authority
  - no client final revision override
  - GameplayActionEnvelope unchanged
  - no recipient projection
  - no hidden state added to processed records
  - T27 remains mandatory/deferred
- Provider boundary:
  - no WebSocket
  - no Durable Object
  - no SQLite
  - no storage alarm API
  - no persistence
  - no actual concurrency
  - no client resync transport
- Latest regression:
  - npm ci PASS
  - npm run typecheck PASS
  - npm test PASS
  - 470 tests / 28 files
  - room-runtime: 219 tests / 12 files
  - game-core: 251 tests / 16 files unchanged
- No package changes.
- No package-lock changes.
- No external dependency changes.
- No game-core changes.
- No existing authority source changes.
- Git metadata:
  - authoritative T-027 task-start: 27b6f27fab3f3c7838b54d86038a417b359eada9
  - implementation: 50a9480fd9185460d47991859bd7ea906176ec75
  - evidence/state: 901a75645164f4abdb1cff904f2dc420db1fe79b
  - evidence metadata reconciliation: 0eef168dde99b5f727115d0b56f6b5acfa6d740c

**Explicitly NOT IMPLEMENTED BY T-027:**
- provider alarm synchronization
- provider alarm handler
- Durable Object serialization
- SQLite atomic persistence/reload
- actual concurrency serialization
- WebSocket/reconnect orchestration
- Telegram authentication/session
- recipient-specific hidden-information projections
- T27

T27 remains mandatory STAGE-04 security work.

**Known Risks:**
* realtime concurrency
* deadline/reconnect races
* Telegram identity/trust boundary
* hidden information leakage
* free-tier operational constraints

These known risks belong to later stages and do not block Stage-03 completion or T-027 verification.

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

**Active Blockers:**
None

**Known Failure / Issue:**
None currently evidenced.

**Next Approved Action:**
Project Architect must re-read this T-027 verification State Sync. No T-028 or future implementation task is pre-authorized. Only after successful re-read may Architect inspect remaining Stage-04 goals, Architecture, Security, relevant ADRs, Ledger, Current State, Roadmap and actual Git state; derive the smallest bounded next task; run Risk Gate and Consistency Gate; then issue exactly one Executor prompt.
