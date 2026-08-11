import { MatchState, PlayerId } from './game-state.js';
import { RandomSource } from './randomness.js';
import { getAllowedTurnActions } from './turn-rules.js';
import {
  applyPlayCardsCommand,
  PlayCardsCommandResult
} from './play-command-transition.js';

export interface SystemTimeoutResult extends PlayCardsCommandResult {
  readonly timedOutPlayerId: PlayerId;
  readonly autoPlayedCardId: string;
}

export function applySystemTimeout(
  state: MatchState,
  random: RandomSource
): SystemTimeoutResult {
  // 1. Match must be active
  if (state.status !== 'IN_PROGRESS' || state.winnerId !== null) {
    throw new Error('Match is already FINISHED.');
  }

  // 2. Derive authoritative timed-out player
  const timedOutPlayerId = state.round.currentPlayerId;
  const player = state.players[timedOutPlayerId];
  if (
    !player ||
    player.lifeStatus !== 'ALIVE' ||
    player.roundStatus !== 'WITH_CARDS' ||
    player.hand.length === 0
  ) {
    throw new Error(
      `Current player (${timedOutPlayerId}) is not eligible for system timeout.`
    );
  }

  // 3. Inspect turn action legality before RNG consumption
  const allowedActions = getAllowedTurnActions(
    state.seatOrder,
    state.players,
    state.round.currentPlayerId,
    timedOutPlayerId,
    state.round.previousPlay !== null
  );

  if (allowedActions.length === 1 && allowedActions[0] === 'CALL_LIAR') {
    throw new Error(
      `Current player (${timedOutPlayerId}) is in a mandatory CALL_LIAR state and cannot undergo SYSTEM_TIMEOUT auto-PLAY.`
    );
  }

  if (!allowedActions.includes('PLAY_CARDS')) {
    throw new Error(
      `PLAY_CARDS is not an allowed turn action for player (${timedOutPlayerId}).`
    );
  }

  // 4. Exact random card index selection from authoritative Hand
  const selectedIndex = random.nextInt(player.hand.length);
  const selectedCard = player.hand[selectedIndex];
  if (!selectedCard) {
    throw new Error(
      `Invariant failure: selected card index ${selectedIndex} not found in hand.`
    );
  }

  // 5. Reuse T-010 command-level transition with same RandomSource instance
  const playCommandResult = applyPlayCardsCommand(
    state,
    timedOutPlayerId,
    [selectedCard.id],
    random
  );

  // 6. Return combined result with metadata
  return {
    ...playCommandResult,
    timedOutPlayerId,
    autoPlayedCardId: selectedCard.id
  };
}
