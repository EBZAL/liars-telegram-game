import { describe, it, expect, beforeEach } from 'vitest';
import { initializeNextRound } from '../src/round-transition.js';
import { initializeMatch } from '../src/match.js';
import { applyPlayCards } from '../src/play-transition.js';
import { MatchState, PlayerState, PlayState } from '../src/game-state.js';
import { RandomSource } from '../src/randomness.js';
import { Card } from '../src/cards.js';

class PredictableRandom implements RandomSource {
  private state: number;
  constructor(seed: number = 0) {
    this.state = seed;
  }
  nextInt(max: number): number {
    this.state = (this.state * 9301 + 49297) % 233280;
    return Math.floor((this.state / 233280) * max);
  }
}

describe('initializeNextRound', () => {
  let baseState: MatchState;
  const rngSeed = 42;

  const validResolvedPlay: PlayState = {
    playId: 6,
    playerId: 'A',
    cardIds: ['liar-KING-1'],
    count: 1,
    claimedRank: 'KING',
    resolved: true
  };

  beforeEach(() => {
    const random = new PredictableRandom(rngSeed);
    const initial = initializeMatch(['A', 'B', 'C', 'D'], random);
    baseState = {
      ...initial,
      round: {
        ...initial.round,
        previousPlay: validResolvedPlay,
        centralPile: [{ id: 'liar-KING-1', rank: 'KING' }],
        playSequence: 7
      }
    };
  });

  describe('Preconditions', () => {
    it('previousPlay null -> reject', () => {
      const state: MatchState = {
        ...baseState,
        round: { ...baseState.round, previousPlay: null }
      };
      const random = new PredictableRandom(rngSeed);
      expect(() => initializeNextRound(state, 'A', random)).toThrow(/previousPlay is null/);
    });

    it('previousPlay unresolved -> reject', () => {
      const state: MatchState = {
        ...baseState,
        round: {
          ...baseState.round,
          previousPlay: { ...validResolvedPlay, resolved: false }
        }
      };
      const random = new PredictableRandom(rngSeed);
      expect(() => initializeNextRound(state, 'A', random)).toThrow(/previousPlay is unresolved/);
    });

    it('unknown roundLoserId -> reject', () => {
      const random = new PredictableRandom(rngSeed);
      expect(() => initializeNextRound(baseState, 'UNKNOWN_PLAYER', random)).toThrow(/not in match players/);
    });

    it('1 Living -> reject / winner required', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          B: { ...baseState.players['B']!, lifeStatus: 'ELIMINATED' },
          C: { ...baseState.players['C']!, lifeStatus: 'ELIMINATED' },
          D: { ...baseState.players['D']!, lifeStatus: 'ELIMINATED' }
        }
      };
      const random = new PredictableRandom(rngSeed);
      expect(() => initializeNextRound(state, 'A', random)).toThrow(/Match winner must be resolved/);
    });

    it('0 Living -> reject', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          A: { ...baseState.players['A']!, lifeStatus: 'ELIMINATED' },
          B: { ...baseState.players['B']!, lifeStatus: 'ELIMINATED' },
          C: { ...baseState.players['C']!, lifeStatus: 'ELIMINATED' },
          D: { ...baseState.players['D']!, lifeStatus: 'ELIMINATED' }
        }
      };
      const random = new PredictableRandom(rngSeed);
      expect(() => initializeNextRound(state, 'A', random)).toThrow(/no living players remain/);
    });
  });

  describe('Next-Round Starter Derivation', () => {
    it('T20: Surviving round loser starts next round and receives 5 cards', () => {
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(baseState, 'B', random);

      expect(result.round.currentPlayerId).toBe('B');
      expect(result.players['B']!.hand).toHaveLength(5);
    });

    it('T21: Eliminated round loser falls forward to next ALIVE seat', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          B: { ...baseState.players['B']!, lifeStatus: 'ELIMINATED' }
        }
      };
      const random = new PredictableRandom(rngSeed);
      // B lost and was eliminated. Next seat in seatOrder ['A','B','C','D'] is 'C'
      const result = initializeNextRound(state, 'B', random);

      expect(result.round.currentPlayerId).toBe('C');
    });

    it('Fallback: Wraparound and multiple eliminated seats skipped', () => {
      // seatOrder: ['A', 'B', 'C', 'D']. Loser D is ELIMINATED. A is ELIMINATED. Next ALIVE is B.
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          D: { ...baseState.players['D']!, lifeStatus: 'ELIMINATED' },
          A: { ...baseState.players['A']!, lifeStatus: 'ELIMINATED' }
        }
      };
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(state, 'D', random);

      expect(result.round.currentPlayerId).toBe('B');
    });
  });

  describe('Living & Eliminated Player Round Reset', () => {
    it('T22: ALIVE EMPTY_SAFE player returns WITH_CARDS + 5 Cards', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          A: { ...baseState.players['A']!, roundStatus: 'EMPTY_SAFE', hand: [] }
        }
      };
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(state, 'B', random);

      expect(result.players['A']!.lifeStatus).toBe('ALIVE');
      expect(result.players['A']!.roundStatus).toBe('WITH_CARDS');
      expect(result.players['A']!.hand).toHaveLength(5);
    });

    it('Pending-empty: ALIVE EMPTY_PENDING_CHALLENGE returns WITH_CARDS + 5 Cards', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          A: { ...baseState.players['A']!, roundStatus: 'EMPTY_PENDING_CHALLENGE', hand: [] }
        }
      };
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(state, 'B', random);

      expect(result.players['A']!.lifeStatus).toBe('ALIVE');
      expect(result.players['A']!.roundStatus).toBe('WITH_CARDS');
      expect(result.players['A']!.hand).toHaveLength(5);
    });

    it('Eliminated player gets 0 Cards, remains ELIMINATED, revolver unchanged', () => {
      const oldRevolver = baseState.players['C']!.revolver;
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          C: { ...baseState.players['C']!, lifeStatus: 'ELIMINATED', hand: [] }
        }
      };
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(state, 'A', random);

      expect(result.players['C']!.lifeStatus).toBe('ELIMINATED');
      expect(result.players['C']!.hand).toEqual([]);
      expect(result.players['C']!.revolver).toBe(oldRevolver);
    });
  });

  describe('Round State & Play Identity Continuity', () => {
    it('roundNumber increments, centralPile cleared, previousPlay cleared', () => {
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(baseState, 'A', random);

      expect(result.round.roundNumber).toBe(baseState.round.roundNumber + 1);
      expect(result.round.centralPile).toEqual([]);
      expect(result.round.previousPlay).toBeNull();
    });

    it('Play sequence continuity: preserves old playSequence and first new PLAY consumes it', () => {
      const random = new PredictableRandom(rngSeed);
      const nextRoundState = initializeNextRound(baseState, 'A', random);

      expect(nextRoundState.round.playSequence).toBe(7);

      // Now test applying a play in the new round
      const starterId = nextRoundState.round.currentPlayerId;
      const starterHand = nextRoundState.players[starterId]!.hand;
      const cardToPlay = [starterHand[0]!.id];

      const afterPlayState = applyPlayCards(
        nextRoundState,
        starterId,
        cardToPlay
      );

      expect(afterPlayState.round.previousPlay?.playId).toBe(7);
      expect(afterPlayState.round.playSequence).toBe(8);
    });
  });

  describe('Table Rank & T28 Legal Repeat', () => {
    it('Table rank is KING, QUEEN, or ACE only', () => {
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(baseState, 'A', random);

      expect(['KING', 'QUEEN', 'ACE']).toContain(result.round.tableRank);
    });

    it('T28: Consecutive same Table Rank is legal', () => {
      // Find a seed that happens to produce the same rank as baseState.round.tableRank
      let currentSeed = 1;
      let matchedResult: MatchState | null = null;

      while (currentSeed < 100) {
        const rnd = new PredictableRandom(currentSeed);
        const res = initializeNextRound(baseState, 'A', rnd);
        if (res.round.tableRank === baseState.round.tableRank) {
          matchedResult = res;
          break;
        }
        currentSeed++;
      }

      expect(matchedResult).not.toBeNull();
      expect(matchedResult!.round.tableRank).toBe(baseState.round.tableRank);
    });
  });

  describe('Player-Count Partitions & Full Deck Conservation', () => {
    it('4 Living -> 20 dealt / 0 undealt', () => {
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(baseState, 'A', random);

      expect(result.round.undealtCards).toHaveLength(0);
      let totalDealt = 0;
      for (const id of result.seatOrder) {
        totalDealt += result.players[id]!.hand.length;
      }
      expect(totalDealt).toBe(20);
    });

    it('3 Living -> 15 dealt / 5 undealt', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          D: { ...baseState.players['D']!, lifeStatus: 'ELIMINATED', hand: [] }
        }
      };
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(state, 'A', random);

      expect(result.round.undealtCards).toHaveLength(5);
      let totalDealt = 0;
      for (const id of result.seatOrder) {
        totalDealt += result.players[id]!.hand.length;
      }
      expect(totalDealt).toBe(15);
    });

    it('2 Living -> 10 dealt / 10 undealt', () => {
      const state: MatchState = {
        ...baseState,
        players: {
          ...baseState.players,
          C: { ...baseState.players['C']!, lifeStatus: 'ELIMINATED', hand: [] },
          D: { ...baseState.players['D']!, lifeStatus: 'ELIMINATED', hand: [] }
        }
      };
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(state, 'A', random);

      expect(result.round.undealtCards).toHaveLength(10);
      let totalDealt = 0;
      for (const id of result.seatOrder) {
        totalDealt += result.players[id]!.hand.length;
      }
      expect(totalDealt).toBe(10);
    });

    it('Full card conservation: exactly 20 unique cards, 6K/6Q/6A/2J', () => {
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(baseState, 'A', random);

      const allCards: Card[] = [...result.round.undealtCards];
      for (const id of result.seatOrder) {
        allCards.push(...result.players[id]!.hand);
      }

      expect(allCards).toHaveLength(20);
      const uniqueIds = new Set(allCards.map((c) => c.id));
      expect(uniqueIds.size).toBe(20);

      const kings = allCards.filter((c) => c.rank === 'KING').length;
      const queens = allCards.filter((c) => c.rank === 'QUEEN').length;
      const aces = allCards.filter((c) => c.rank === 'ACE').length;
      const jokers = allCards.filter((c) => c.rank === 'JOKER').length;

      expect(kings).toBe(6);
      expect(queens).toBe(6);
      expect(aces).toBe(6);
      expect(jokers).toBe(2);
    });
  });

  describe('Match Metadata & Prototype Safety', () => {
    it('seatOrder, firstRoundStarter, winnerId, status preserved', () => {
      const random = new PredictableRandom(rngSeed);
      const result = initializeNextRound(baseState, 'A', random);

      expect(result.seatOrder).toEqual(baseState.seatOrder);
      expect(result.firstRoundStarter).toBe(baseState.firstRoundStarter);
      expect(result.winnerId).toBeNull();
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('prototype-safe Players dictionary with __proto__ key support', () => {
      const random = new PredictableRandom(rngSeed);
      const protoState = initializeMatch(['__proto__', 'P2', 'P3'], random);
      const protoBaseState: MatchState = {
        ...protoState,
        round: {
          ...protoState.round,
          previousPlay: {
            playId: 1,
            playerId: 'P2',
            cardIds: ['liar-KING-1'],
            count: 1,
            claimedRank: 'KING',
            resolved: true
          }
        }
      };

      const result = initializeNextRound(protoBaseState, 'P2', random);

      expect(Object.getPrototypeOf(result.players)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(result.players, '__proto__')).toBe(true);
      expect(result.players['__proto__']!.id).toBe('__proto__');
    });
  });

  describe('Immutability and Determinism', () => {
    it('input MatchState is not mutated', () => {
      const frozenInputStr = JSON.stringify(baseState);
      const random = new PredictableRandom(rngSeed);

      initializeNextRound(baseState, 'A', random);

      expect(JSON.stringify(baseState)).toBe(frozenInputStr);
    });

    it('equivalent state + equivalent RNG -> equivalent next round state', () => {
      const r1 = new PredictableRandom(rngSeed);
      const res1 = initializeNextRound(baseState, 'A', r1);

      const r2 = new PredictableRandom(rngSeed);
      const res2 = initializeNextRound(baseState, 'A', r2);

      expect(res1).toEqual(res2);
    });
  });
});
