import { Card } from './cards.js';
import { TableRank } from './game-state.js';

export type PlayCount = 1 | 2 | 3;

export interface Claim {
  readonly rank: TableRank;
  readonly count: PlayCount;
}

export function isCardTruthful(card: Card, tableRank: TableRank): boolean {
  return card.rank === tableRank || card.rank === 'JOKER';
}

export function isPlayTruthful(playedCards: readonly Card[], tableRank: TableRank): boolean {
  if (playedCards.length === 0) {
    return false;
  }
  for (const card of playedCards) {
    if (!isCardTruthful(card, tableRank)) {
      return false;
    }
  }
  return true;
}

export function validatePlaySelection(hand: readonly Card[], requestedCardIds: readonly string[]): Card[] {
  const count = requestedCardIds.length;
  if (count === 0) {
    throw new Error('Selection must contain at least 1 card');
  }
  if (count > 3) {
    throw new Error('Selection cannot exceed 3 cards');
  }
  if (count > hand.length) {
    throw new Error('Selection cannot exceed hand size');
  }

  const selection: Card[] = [];
  const requestedSet = new Set<string>();

  for (const id of requestedCardIds) {
    if (requestedSet.has(id)) {
      throw new Error(`Duplicate card ID in selection: ${id}`);
    }
    requestedSet.add(id);

    const card = hand.find(c => c.id === id);
    if (!card) {
      throw new Error(`Card ID not found in hand: ${id}`);
    }
    selection.push(card);
  }

  return selection;
}

export function deriveClaim(tableRank: TableRank, validatedPlayedCards: readonly Card[]): Claim {
  const count = validatedPlayedCards.length;
  if (count !== 1 && count !== 2 && count !== 3) {
    throw new Error('Invalid play count for claim derivation');
  }
  return {
    rank: tableRank,
    count: count as PlayCount
  };
}
