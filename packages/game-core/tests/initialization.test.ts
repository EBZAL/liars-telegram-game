import { describe, it, expect } from 'vitest';
import { initializeMatch } from '../src/match.js';
import { RandomSource } from '../src/randomness.js';

// Simple deterministic PRNG for tests
class PredictableRandom implements RandomSource {
  private state: number;
  constructor(seed: number = 0) {
    this.state = seed;
  }
  nextInt(max: number): number {
    // LCG
    this.state = (this.state * 9301 + 49297) % 233280;
    return Math.floor((this.state / 233280) * max);
  }
}

describe('Match and Round Initialization', () => {
  it('AC-01/02: Rejects invalid player counts, empty IDs, and duplicates', () => {
    const r = new PredictableRandom();
    
    // 1 player
    expect(() => initializeMatch(['p1'], r)).toThrow();
    // 5 players
    expect(() => initializeMatch(['p1', 'p2', 'p3', 'p4', 'p5'], r)).toThrow();
    // Duplicates
    expect(() => initializeMatch(['p1', 'p2', 'p1'], r)).toThrow();
    // Empty ID
    expect(() => initializeMatch(['p1', '   ', 'p2'], r)).toThrow();
  });

  it('AC-03/15: Seat order is a valid permutation and input array is not mutated', () => {
    const r = new PredictableRandom();
    const input = ['p1', 'p2', 'p3'];
    const inputCopy = [...input];

    const match = initializeMatch(input, r);

    expect(input).toEqual(inputCopy); // No mutation
    expect(match.seatOrder).toHaveLength(3);
    
    // Check permutation
    const originalSet = new Set(input);
    const resultSet = new Set(match.seatOrder);
    expect(resultSet).toEqual(originalSet);
  });

  it('AC-06: First round starter is valid and matches currentPlayerId', () => {
    const match = initializeMatch(['A', 'B', 'C', 'D'], new PredictableRandom(123));
    expect(match.seatOrder).toContain(match.firstRoundStarter);
    expect(match.round.currentPlayerId).toBe(match.firstRoundStarter);
  });

  it('AC-07/08: Round 1 baseline fields and table rank domain', () => {
    const match = initializeMatch(['A', 'B'], new PredictableRandom());
    expect(match.round.roundNumber).toBe(1);
    expect(match.round.previousPlay).toBeNull();
    expect(match.round.centralPile).toEqual([]);
    
    // Table rank domain
    expect(['KING', 'QUEEN', 'ACE']).toContain(match.round.tableRank);
  });

  it('AC-04/05/16: Initial Player state, independent persistent revolver', () => {
    const match = initializeMatch(['p1', 'p2'], new PredictableRandom(42));
    
    const p1 = match.players['p1'];
    const p2 = match.players['p2'];

    expect(p1.lifeStatus).toBe('ALIVE');
    expect(p1.roundStatus).toBe('WITH_CARDS');
    expect(p1.hand.length).toBe(5);

    expect(p1.revolver.nextShotIndex).toBe(0);
    expect(p1.revolver.sequence.length).toBe(6);
    
    // 1 LETHAL, 5 BLANK
    const p1Lethals = p1.revolver.sequence.filter(o => o === 'LETHAL').length;
    const p1Blanks = p1.revolver.sequence.filter(o => o === 'BLANK').length;
    expect(p1Lethals).toBe(1);
    expect(p1Blanks).toBe(5);

    // Independence
    expect(p1.revolver.sequence).not.toBe(p2.revolver.sequence);
    expect(p1.hand).not.toBe(p2.hand);
  });

  it('AC-10/13: 4-player dealing (T23)', () => {
    const match = initializeMatch(['A', 'B', 'C', 'D'], new PredictableRandom(10));
    
    const pA = match.players['A'].hand;
    const pB = match.players['B'].hand;
    const pC = match.players['C'].hand;
    const pD = match.players['D'].hand;
    const undealt = match.round.undealtCards;

    expect(pA).toHaveLength(5);
    expect(pB).toHaveLength(5);
    expect(pC).toHaveLength(5);
    expect(pD).toHaveLength(5);
    expect(undealt).toHaveLength(0);

    const allCards = [...pA, ...pB, ...pC, ...pD, ...undealt];
    expect(allCards).toHaveLength(20);

    const uniqueIds = new Set(allCards.map(c => c.id));
    expect(uniqueIds.size).toBe(20);
    
    // Check canonical composition
    const kings = allCards.filter(c => c.rank === 'KING').length;
    const queens = allCards.filter(c => c.rank === 'QUEEN').length;
    const aces = allCards.filter(c => c.rank === 'ACE').length;
    const jokers = allCards.filter(c => c.rank === 'JOKER').length;

    expect(kings).toBe(6);
    expect(queens).toBe(6);
    expect(aces).toBe(6);
    expect(jokers).toBe(2);
  });

  it('AC-11: 3-player dealing (T24)', () => {
    const match = initializeMatch(['A', 'B', 'C'], new PredictableRandom(10));
    expect(match.round.undealtCards).toHaveLength(5);
    
    const allCards = [
      ...match.players['A'].hand,
      ...match.players['B'].hand,
      ...match.players['C'].hand,
      ...match.round.undealtCards
    ];
    expect(allCards).toHaveLength(20);
  });

  it('AC-12: 2-player dealing (T25)', () => {
    const match = initializeMatch(['A', 'B'], new PredictableRandom(10));
    expect(match.round.undealtCards).toHaveLength(10);
    
    const allCards = [
      ...match.players['A'].hand,
      ...match.players['B'].hand,
      ...match.round.undealtCards
    ];
    expect(allCards).toHaveLength(20);
  });

  it('AC-14: Deterministic initialization', () => {
    const match1 = initializeMatch(['A', 'B', 'C'], new PredictableRandom(999));
    const match2 = initializeMatch(['A', 'B', 'C'], new PredictableRandom(999));

    expect(match1).toEqual(match2); // Deep equality check
  });
});
