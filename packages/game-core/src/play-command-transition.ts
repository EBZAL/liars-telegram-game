import { MatchState, PlayerId, PlayState } from './game-state.js';
import { RandomSource } from './randomness.js';
import { applyPlayCards } from './play-transition.js';
import { getForcedCallerId, getAllowedTurnActions } from './turn-rules.js';
import { ChallengeResolution } from './challenge-rules.js';
import {
  applyCallLiar,
  CallLiarShotResult,
  CallLiarTerminal
} from './call-liar-transition.js';

export interface ForcedCallCommandResult {
  readonly callerId: PlayerId;
  readonly challenge: ChallengeResolution;
  readonly shot: CallLiarShotResult;
  readonly terminal: CallLiarTerminal;
  readonly winnerId: PlayerId | null;
}

export interface PlayCardsCommandResult {
  readonly state: MatchState;
  readonly createdPlay: PlayState;
  readonly forcedCall: ForcedCallCommandResult | null;
}

export function applyPlayCardsCommand(
  state: MatchState,
  actorId: PlayerId,
  requestedCardIds: readonly string[],
  random: RandomSource
): PlayCardsCommandResult {
  // 1. Execute low-level verified PLAY transition
  const postPlayState = applyPlayCards(state, actorId, requestedCardIds);

  // 2. Capture detached createdPlay snapshot before any forced CALL reset
  const rawPlay = postPlayState.round.previousPlay;
  if (!rawPlay) {
    throw new Error('Invariant failure: previousPlay must exist after successful play transition.');
  }

  const createdPlay: PlayState = {
    ...rawPlay,
    cardIds: [...rawPlay.cardIds]
  };

  // 3. Detect post-PLAY forced CALL requirement using T-004 logic
  const forcedCallerId = getForcedCallerId(
    postPlayState.seatOrder,
    postPlayState.players,
    true
  );

  // 4. Ordinary PLAY path (no forced caller)
  if (forcedCallerId === null) {
    return {
      state: postPlayState,
      createdPlay,
      forcedCall: null
    };
  }

  // 5. Invariant check: forced caller must be current player
  if (forcedCallerId !== postPlayState.round.currentPlayerId) {
    throw new Error(
      `Invariant failure: forcedCallerId (${forcedCallerId}) does not equal post-play currentPlayerId (${postPlayState.round.currentPlayerId}).`
    );
  }

  // 6. Invariant check: forced caller action eligibility must be exactly CALL_LIAR
  const allowedActions = getAllowedTurnActions(
    postPlayState.seatOrder,
    postPlayState.players,
    postPlayState.round.currentPlayerId,
    forcedCallerId,
    true
  );

  if (allowedActions.length !== 1 || allowedActions[0] !== 'CALL_LIAR') {
    throw new Error(
      `Invariant failure: detected forced caller (${forcedCallerId}) does not have allowed actions ['CALL_LIAR']. Allowed: [${allowedActions.join(', ')}]`
    );
  }

  // 7. Automatic dispatch of verified CALL transition
  const callResult = applyCallLiar(postPlayState, forcedCallerId, random);

  // 8. Construct forcedCall metadata summary (no state property nested inside forcedCall)
  const forcedCall: ForcedCallCommandResult = {
    callerId: forcedCallerId,
    challenge: callResult.challenge,
    shot: callResult.shot,
    terminal: callResult.terminal,
    winnerId: callResult.winnerId
  };

  return {
    state: callResult.state,
    createdPlay,
    forcedCall
  };
}
