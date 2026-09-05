import { useState, useEffect, useCallback } from 'react';
import type { RecipientRoomProjection, GameplayActionEnvelope } from '@liars-telegram-game/room-runtime';

/**
 * Generates a unique client action ID for idempotency tracking.
 */
export function generateActionId(prefix = 'act_'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export interface CardSelectionState {
  selectedCardIds: string[];
  toggleCard: (cardId: string) => void;
  clearSelection: () => void;
  isSelected: (cardId: string) => boolean;
}

/**
 * Local-only pre-confirm card selection hook (ADR-008, ADR-015).
 * - Maximum 3 cards selectable (GAME_RULES canonical limit).
 * - Toggling a selected card removes it.
 * - Selecting beyond 3 is rejected.
 * - Selection automatically clears when turnId changes.
 */
export function useCardSelection(turnId: string | null): CardSelectionState {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  // Automatically reset selection on turn boundary
  useEffect(() => {
    setSelectedCardIds([]);
  }, [turnId]);

  const toggleCard = useCallback((cardId: string) => {
    setSelectedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId);
      }
      if (current.length >= 3) {
        return current; // Maximum 3 cards allowed
      }
      return [...current, cardId];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedCardIds([]);
  }, []);

  const isSelected = useCallback(
    (cardId: string) => selectedCardIds.includes(cardId),
    [selectedCardIds]
  );

  return {
    selectedCardIds,
    toggleCard,
    clearSelection,
    isSelected,
  };
}

/**
 * Determines whether it is currently the given player's turn to act.
 */
export function isOwnTurn(projection: RecipientRoomProjection | null, ownPlayerId: string): boolean {
  if (!projection || projection.publicState.lifecycle !== 'MATCH_ACTIVE') {
    return false;
  }
  return projection.publicState.match?.round.currentPlayerId === ownPlayerId;
}

/**
 * Determines whether a mandatory CALL_LIAR is enforced (GAME_RULES T10 / T14).
 * Enforced when exactly 1 living player has cards and a previousPlay exists.
 */
export function isMandatoryCall(projection: RecipientRoomProjection | null, ownPlayerId: string): boolean {
  if (!isOwnTurn(projection, ownPlayerId)) {
    return false;
  }
  const match = projection?.publicState.match;
  if (!match || match.round.previousPlay === null) {
    return false;
  }

  const livingWithCards = match.players.filter(
    (p) => p.lifeStatus === 'ALIVE' && p.handCount > 0
  );

  return livingWithCards.length === 1 && livingWithCards[0].playerId === ownPlayerId;
}

/**
 * Determines whether PLAY_CARDS action is currently legal for the client.
 */
export function canPlayCards(
  projection: RecipientRoomProjection | null,
  ownPlayerId: string,
  selectedCardIds: string[]
): boolean {
  if (!isOwnTurn(projection, ownPlayerId)) {
    return false;
  }
  if (isMandatoryCall(projection, ownPlayerId)) {
    return false;
  }
  if (selectedCardIds.length < 1 || selectedCardIds.length > 3) {
    return false;
  }

  const ownPlayer = projection?.publicState.match?.players.find((p) => p.playerId === ownPlayerId);
  if (!ownPlayer || ownPlayer.lifeStatus !== 'ALIVE' || ownPlayer.handCount === 0) {
    return false;
  }

  return true;
}

/**
 * Determines whether CALL_LIAR action is currently legal for the client.
 */
export function canCallLiar(
  projection: RecipientRoomProjection | null,
  ownPlayerId: string
): boolean {
  if (!isOwnTurn(projection, ownPlayerId)) {
    return false;
  }
  const match = projection?.publicState.match;
  if (!match) {
    return false;
  }
  // First turn of round cannot challenge (GAME_RULES T05)
  if (match.round.previousPlay === null) {
    return false;
  }

  const ownPlayer = match.players.find((p) => p.playerId === ownPlayerId);
  if (!ownPlayer || ownPlayer.lifeStatus !== 'ALIVE') {
    return false;
  }

  return true;
}

/**
 * Constructs a valid GameplayActionEnvelope for PLAY_CARDS.
 */
export function buildPlayCardsEnvelope(
  projection: RecipientRoomProjection,
  cardIds: string[],
  actionId?: string
): GameplayActionEnvelope {
  const turnId = projection.publicState.currentTurnId;
  if (!turnId) {
    throw new Error('Cannot build gameplay action envelope: currentTurnId is null');
  }

  return {
    actionId: actionId ?? generateActionId(),
    expectedRevision: projection.publicState.revision,
    turnId,
    actionType: 'PLAY_CARDS',
    payload: { cardIds: [...cardIds] },
  };
}

/**
 * Constructs a valid GameplayActionEnvelope for CALL_LIAR.
 */
export function buildCallLiarEnvelope(
  projection: RecipientRoomProjection,
  actionId?: string
): GameplayActionEnvelope {
  const turnId = projection.publicState.currentTurnId;
  if (!turnId) {
    throw new Error('Cannot build gameplay action envelope: currentTurnId is null');
  }

  return {
    actionId: actionId ?? generateActionId(),
    expectedRevision: projection.publicState.revision,
    turnId,
    actionType: 'CALL_LIAR',
    payload: {},
  };
}
