import { describe, it, expect } from 'vitest';
import { Card } from '../src/cards.js';
import { TableRank } from '../src/game-state.js';
import {
  isCardTruthful,
  isPlayTruthful,
  validatePlaySelection,
  deriveClaim
} from '../src/play-rules.js';

describe('Play Rule Primitives', () => {
  const tableQueen: TableRank = 'QUEEN';
  const tableKing: TableRank = 'KING';

  const cardQueen: Card = { id: 'liar-QUEEN-1', rank: 'QUEEN' };
  const cardKing: Card = { id: 'liar-KING-1', rank: 'KING' };
  const cardAce: Card = { id: 'liar-ACE-1', rank: 'ACE' };
  const cardJoker: Card = { id: 'liar-JOKER-1', rank: 'JOKER' };

  describe('isCardTruthful', () => {
    it('recognizes matching TableRank as truthful', () => {
      expect(isCardTruthful(cardQueen, tableQueen)).toBe(true);
      expect(isCardTruthful(cardKing, tableKing)).toBe(true);
    });

    it('recognizes JOKER as truthful', () => {
      expect(isCardTruthful(cardJoker, tableQueen)).toBe(true);
      expect(isCardTruthful(cardJoker, tableKing)).toBe(true);
    });

    it('recognizes non-matching canonical rank as false', () => {
      expect(isCardTruthful(cardKing, tableQueen)).toBe(false);
      expect(isCardTruthful(cardAce, tableQueen)).toBe(false);
    });
  });

  describe('isPlayTruthful', () => {
    it('AC-03 / T01 Pure Truth', () => {
      expect(isPlayTruthful([cardQueen, cardQueen], tableQueen)).toBe(true);
    });

    it('AC-04 / T02 Joker Truth', () => {
      expect(isPlayTruthful([cardJoker], tableQueen)).toBe(true);
    });

    it('AC-05 / T03 Mixed Truth', () => {
      expect(isPlayTruthful([cardQueen, cardJoker, cardQueen], tableQueen)).toBe(true);
    });

    it('AC-06 / T04 Mixed Lie', () => {
      expect(isPlayTruthful([cardQueen, cardJoker, cardKing], tableQueen)).toBe(false);
    });

    it('returns false for empty play', () => {
      expect(isPlayTruthful([], tableQueen)).toBe(false);
    });
  });

  describe('deriveClaim', () => {
    it('derives claim for 1, 2, and 3 cards with correct rank and count', () => {
      const claim1 = deriveClaim(tableQueen, [cardQueen]);
      expect(claim1.rank).toBe('QUEEN');
      expect(claim1.count).toBe(1);

      const claim2 = deriveClaim(tableKing, [cardKing, cardJoker]);
      expect(claim2.rank).toBe('KING');
      expect(claim2.count).toBe(2);

      const claim3 = deriveClaim(tableQueen, [cardQueen, cardQueen, cardQueen]);
      expect(claim3.rank).toBe('QUEEN');
      expect(claim3.count).toBe(3);
    });

    it('rejects impossible counts', () => {
      expect(() => deriveClaim(tableQueen, [])).toThrow();
      expect(() => deriveClaim(tableQueen, [cardQueen, cardQueen, cardQueen, cardQueen])).toThrow();
    });
  });

  describe('validatePlaySelection', () => {
    const hand: Card[] = [
      cardQueen,
      cardKing,
      cardJoker,
      { id: 'liar-QUEEN-2', rank: 'QUEEN' },
      { id: 'liar-ACE-1', rank: 'ACE' }
    ];
    const originalHand = [...hand];

    it('AC-10: Valid 1-card selection', () => {
      const selection = validatePlaySelection(hand, ['liar-QUEEN-1']);
      expect(selection).toHaveLength(1);
      expect(selection[0]).toBe(cardQueen);
    });

    it('AC-10: Valid 2-card selection', () => {
      const selection = validatePlaySelection(hand, ['liar-QUEEN-1', 'liar-KING-1']);
      expect(selection).toHaveLength(2);
      expect(selection).toContain(cardQueen);
      expect(selection).toContain(cardKing);
    });

    it('AC-10: Valid 3-card selection', () => {
      const selection = validatePlaySelection(hand, ['liar-QUEEN-1', 'liar-KING-1', 'liar-JOKER-1']);
      expect(selection).toHaveLength(3);
    });

    it('AC-11 / T06: Zero selection rejected', () => {
      expect(() => validatePlaySelection(hand, [])).toThrow('at least 1 card');
    });

    it('AC-12 / T07: 4-card selection rejected', () => {
      expect(() => validatePlaySelection(hand, ['liar-QUEEN-1', 'liar-KING-1', 'liar-JOKER-1', 'liar-QUEEN-2'])).toThrow('cannot exceed 3 cards');
    });

    it('AC-13: Hand-size ceiling (3 requested from 2-card hand rejected)', () => {
      const smallHand = [cardQueen, cardKing];
      expect(() => validatePlaySelection(smallHand, [cardQueen.id, cardKing.id, 'other'])).toThrow('cannot exceed hand size');
    });

    it('AC-14: Unknown ID rejected', () => {
      expect(() => validatePlaySelection(hand, ['unknown-id'])).toThrow('Card ID not found');
    });

    it('AC-15: Duplicate ID rejected', () => {
      expect(() => validatePlaySelection(hand, ['liar-QUEEN-1', 'liar-QUEEN-1'])).toThrow('Duplicate card ID');
    });

    it('AC-16: Returns authoritative hand Card objects', () => {
      const selection = validatePlaySelection(hand, ['liar-QUEEN-1']);
      expect(selection[0]).toBe(hand[0]); // Must be exact reference
    });

    it('AC-17: Input hand and requested IDs are unchanged', () => {
      const ids = ['liar-QUEEN-1', 'liar-KING-1'];
      const originalIds = [...ids];
      validatePlaySelection(hand, ids);

      expect(hand).toEqual(originalHand);
      expect(ids).toEqual(originalIds);
    });
  });
});
