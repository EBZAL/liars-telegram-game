import { describe, it, expect } from 'vitest';
import { PlayerState } from '../src/game-state.js';
import { Card } from '../src/cards.js';
import {
  TurnActionType,
  isTurnEligible,
  getLivingPlayersWithCards,
  getNextEligiblePlayerId,
  getForcedCallerId,
  getAllowedTurnActions
} from '../src/turn-rules.js';

describe('Turn Action Eligibility', () => {
  const dummyCard: Card = { id: 'test-card', rank: 'QUEEN' };

  const createPlayer = (
    life: 'ALIVE' | 'ELIMINATED',
    round: 'WITH_CARDS' | 'EMPTY_SAFE' | 'EMPTY_PENDING_CHALLENGE',
    handSize: number
  ): PlayerState => ({
    id: 'dummy',
    lifeStatus: life,
    roundStatus: round,
    hand: Array(handSize).fill(dummyCard),
    revolver: { sequence: [], nextShotIndex: 0 }
  });

  const pEligible = createPlayer('ALIVE', 'WITH_CARDS', 1);
  const pEliminated = createPlayer('ELIMINATED', 'WITH_CARDS', 1);
  const pEmptySafe = createPlayer('ALIVE', 'EMPTY_SAFE', 0);
  const pEmptyPending = createPlayer('ALIVE', 'EMPTY_PENDING_CHALLENGE', 0);
  const pZeroHand = createPlayer('ALIVE', 'WITH_CARDS', 0);

  describe('isTurnEligible', () => {
    it('AC-04: eligible ALIVE/WITH_CARDS Player', () => {
      expect(isTurnEligible(pEligible)).toBe(true);
    });

    it('AC-05: ELIMINATED skipped', () => {
      expect(isTurnEligible(pEliminated)).toBe(false);
    });

    it('AC-06: EMPTY_SAFE skipped', () => {
      expect(isTurnEligible(pEmptySafe)).toBe(false);
    });

    it('AC-07: EMPTY_PENDING_CHALLENGE skipped', () => {
      expect(isTurnEligible(pEmptyPending)).toBe(false);
    });

    it('AC-08: zero-hand WITH_CARDS skipped', () => {
      expect(isTurnEligible(pZeroHand)).toBe(false);
    });
  });

  describe('getNextEligiblePlayerId', () => {
    const seatOrder = ['A', 'B', 'C', 'D'];
    const players: Record<string, PlayerState> = {
      A: { ...pEligible, id: 'A' },
      B: { ...pEmptySafe, id: 'B' },
      C: { ...pEliminated, id: 'C' },
      D: { ...pEligible, id: 'D' }
    };

    it('AC-09/AC-11: cyclic next eligible (skips B and C)', () => {
      expect(getNextEligiblePlayerId(seatOrder, players, 'A')).toBe('D');
    });

    it('AC-10: wrap-around', () => {
      expect(getNextEligiblePlayerId(seatOrder, players, 'D')).toBe('A');
    });

    it('AC-12/AC-13: no eligible successor (returns null)', () => {
      const singleEligible = { ...players, D: { ...pEliminated, id: 'D' } };
      expect(getNextEligiblePlayerId(seatOrder, singleEligible, 'A')).toBe(null);
    });

    it('AC-14: unknown fromPlayer rejected', () => {
      expect(() => getNextEligiblePlayerId(seatOrder, players, 'unknown')).toThrow();
    });

    it('AC-24: __proto__ Player ID compatibility', () => {
      const specialOrder = ['__proto__', 'A'];
      const specialPlayers = Object.create(null);
      specialPlayers['__proto__'] = { ...pEliminated, id: '__proto__' };
      specialPlayers['A'] = { ...pEligible, id: 'A' };

      expect(getNextEligiblePlayerId(specialOrder, specialPlayers, '__proto__')).toBe('A');
      expect(getNextEligiblePlayerId(specialOrder, specialPlayers, 'A')).toBe(null);
    });
  });

  describe('getForcedCallerId', () => {
    it('AC-18: 1v1 forced-call trigger', () => {
      const seatOrder = ['A', 'B'];
      const players = {
        A: { ...pEmptyPending, id: 'A' },
        B: { ...pEligible, id: 'B' }
      };
      expect(getForcedCallerId(seatOrder, players, true)).toBe('B');
    });

    it('AC-19: 3-player forced-call trigger', () => {
      const seatOrder = ['A', 'B', 'C'];
      const players = {
        A: { ...pEmptySafe, id: 'A' },
        B: { ...pEmptyPending, id: 'B' },
        C: { ...pEligible, id: 'C' }
      };
      expect(getForcedCallerId(seatOrder, players, true)).toBe('C');
    });

    it('AC-20: no forced call without previousPlay', () => {
      const seatOrder = ['A', 'B'];
      const players = {
        A: { ...pEmptyPending, id: 'A' },
        B: { ...pEligible, id: 'B' }
      };
      expect(getForcedCallerId(seatOrder, players, false)).toBe(null);
    });
    
    it('returns null if multiple living players have cards', () => {
      const seatOrder = ['A', 'B'];
      const players = {
        A: { ...pEligible, id: 'A' },
        B: { ...pEligible, id: 'B' }
      };
      expect(getForcedCallerId(seatOrder, players, true)).toBe(null);
    });
  });

  describe('getAllowedTurnActions', () => {
    const seatOrder = ['A', 'B'];
    const players = {
      A: { ...pEligible, id: 'A' },
      B: { ...pEligible, id: 'B' }
    };

    it('AC-16 / T05: First turn allows only PLAY_CARDS', () => {
      const actions = getAllowedTurnActions(seatOrder, players, 'A', 'A', false);
      expect(actions).toEqual(['PLAY_CARDS']);
    });

    it('AC-17: Ordinary later turn allows PLAY_CARDS and CALL_LIAR', () => {
      const actions = getAllowedTurnActions(seatOrder, players, 'B', 'B', true);
      expect(actions).toContain('PLAY_CARDS');
      expect(actions).toContain('CALL_LIAR');
      expect(actions).toHaveLength(2);
    });

    it('AC-18: Forced call restricts to CALL_LIAR only', () => {
      const forcedPlayers = {
        A: { ...pEmptyPending, id: 'A' },
        B: { ...pEligible, id: 'B' }
      };
      const actions = getAllowedTurnActions(seatOrder, forcedPlayers, 'B', 'B', true);
      expect(actions).toEqual(['CALL_LIAR']);
    });

    it('AC-21: out-of-turn actor gets no actions', () => {
      const actions = getAllowedTurnActions(seatOrder, players, 'A', 'B', false);
      expect(actions).toEqual([]);
    });

    it('AC-22: ineligible current actor gets no actions', () => {
      const ineligPlayers = {
        A: { ...pEliminated, id: 'A' },
        B: { ...pEligible, id: 'B' }
      };
      const actions = getAllowedTurnActions(seatOrder, ineligPlayers, 'A', 'A', false);
      expect(actions).toEqual([]);
    });

    it('AC-02 / T08: PASS not part of action type/action list', () => {
      const actions = getAllowedTurnActions(seatOrder, players, 'A', 'A', true);
      expect(actions).not.toContain('PASS');

      // Compile-time guard that PASS is not in the type:
      // @ts-expect-error
      const _test: TurnActionType = 'PASS';
    });
  });

  describe('Input Immutability', () => {
    it('AC-23: does not mutate seatOrder or players', () => {
      const seatOrder = ['A', 'B'];
      const players = {
        A: { ...pEligible, id: 'A' },
        B: { ...pEligible, id: 'B' }
      };
      const originalOrder = [...seatOrder];
      const originalA = { ...players.A };

      getNextEligiblePlayerId(seatOrder, players, 'A');
      getAllowedTurnActions(seatOrder, players, 'B', 'B', true);
      getForcedCallerId(seatOrder, players, true);

      expect(seatOrder).toEqual(originalOrder);
      expect(players.A).toEqual(originalA);
    });
  });
});
