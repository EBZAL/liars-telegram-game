import { PlayerState } from './game-state.js';

export type TurnActionType = 'PLAY_CARDS' | 'CALL_LIAR';

export function isTurnEligible(playerState: PlayerState): boolean {
  return (
    playerState.lifeStatus === 'ALIVE' &&
    playerState.roundStatus === 'WITH_CARDS' &&
    playerState.hand.length > 0
  );
}

export function getLivingPlayersWithCards(
  seatOrder: readonly string[],
  players: Record<string, PlayerState>
): string[] {
  const result: string[] = [];
  for (const id of seatOrder) {
    const p = players[id];
    if (p && p.lifeStatus === 'ALIVE' && p.hand.length > 0) {
      result.push(id);
    }
  }
  return result;
}

export function getNextEligiblePlayerId(
  seatOrder: readonly string[],
  players: Record<string, PlayerState>,
  fromPlayerId: string
): string | null {
  const startIndex = seatOrder.indexOf(fromPlayerId);
  if (startIndex === -1) {
    throw new Error(`Player ID not found in seat order: ${fromPlayerId}`);
  }

  const length = seatOrder.length;
  for (let offset = 1; offset < length; offset++) {
    const checkIndex = (startIndex + offset) % length;
    const checkId = seatOrder[checkIndex];
    const p = players[checkId];
    if (p && isTurnEligible(p)) {
      return checkId;
    }
  }

  return null;
}

export function getForcedCallerId(
  seatOrder: readonly string[],
  players: Record<string, PlayerState>,
  hasPreviousPlay: boolean
): string | null {
  if (!hasPreviousPlay) {
    return null;
  }

  const livingWithCards = getLivingPlayersWithCards(seatOrder, players);
  if (livingWithCards.length === 1) {
    return livingWithCards[0] as string;
  }

  return null;
}

export function getAllowedTurnActions(
  seatOrder: readonly string[],
  players: Record<string, PlayerState>,
  currentPlayerId: string,
  actorId: string,
  hasPreviousPlay: boolean
): TurnActionType[] {
  if (actorId !== currentPlayerId) {
    return [];
  }

  const actor = players[actorId];
  if (!actor || !isTurnEligible(actor)) {
    return [];
  }

  if (!hasPreviousPlay) {
    return ['PLAY_CARDS'];
  }

  const forcedCaller = getForcedCallerId(seatOrder, players, hasPreviousPlay);
  if (forcedCaller === actorId) {
    return ['CALL_LIAR'];
  }

  return ['PLAY_CARDS', 'CALL_LIAR'];
}
