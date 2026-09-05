import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RecipientRoomProjection } from '@liars-telegram-game/room-runtime';
import {
  useCardSelection,
  isOwnTurn,
  isMandatoryCall,
  canPlayCards,
  canCallLiar,
  buildPlayCardsEnvelope,
  buildCallLiarEnvelope,
  generateActionId,
} from '../src/selection-and-actions.js';

function createMockProjection(overrides?: Partial<RecipientRoomProjection['publicState']>): RecipientRoomProjection {
  return {
    publicState: {
      roomId: 'test-room',
      lifecycle: 'MATCH_ACTIVE',
      revision: 4,
      memberPlayerIds: ['p1', 'p2'],
      hostPlayerId: 'p1',
      currentTurnId: 'turn-4',
      currentTurnDeadline: 30000,
      match: {
        status: 'IN_PROGRESS',
        seatOrder: ['p1', 'p2'],
        players: [
          { playerId: 'p1', lifeStatus: 'ALIVE', handCount: 5, shotsUsed: 0 },
          { playerId: 'p2', lifeStatus: 'ALIVE', handCount: 5, shotsUsed: 0 },
        ],
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'p1',
          previousPlay: null,
        },
        winnerId: null,
      },
      ...overrides,
    },
    privateState: {
      playerId: 'p1',
      hand: [
        { id: 'c1', rank: 'KING' },
        { id: 'c2', rank: 'QUEEN' },
        { id: 'c3', rank: 'ACE' },
        { id: 'c4', rank: 'JOKER' },
        { id: 'c5', rank: 'KING' },
      ],
    },
  };
}

describe('T-036 Local Selection and Action Dispatch Primitives', () => {
  describe('useCardSelection hook (ADR-008, ADR-015)', () => {
    it('toggles cards and limits selection to 3 cards max', () => {
      const { result } = renderHook(() => useCardSelection('turn-1'));

      expect(result.current.selectedCardIds).toEqual([]);

      act(() => {
        result.current.toggleCard('c1');
        result.current.toggleCard('c2');
      });
      expect(result.current.selectedCardIds).toEqual(['c1', 'c2']);
      expect(result.current.isSelected('c1')).toBe(true);
      expect(result.current.isSelected('c3')).toBe(false);

      // Select 3rd card
      act(() => {
        result.current.toggleCard('c3');
      });
      expect(result.current.selectedCardIds).toEqual(['c1', 'c2', 'c3']);

      // Attempting to select 4th card should be rejected
      act(() => {
        result.current.toggleCard('c4');
      });
      expect(result.current.selectedCardIds).toEqual(['c1', 'c2', 'c3']);

      // Toggle off c2
      act(() => {
        result.current.toggleCard('c2');
      });
      expect(result.current.selectedCardIds).toEqual(['c1', 'c3']);

      // Clear selection
      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.selectedCardIds).toEqual([]);
    });

    it('automatically resets selection when turnId changes', () => {
      let turnId = 'turn-1';
      const { result, rerender } = renderHook(() => useCardSelection(turnId));

      act(() => {
        result.current.toggleCard('c1');
        result.current.toggleCard('c2');
      });
      expect(result.current.selectedCardIds).toEqual(['c1', 'c2']);

      // Advance turn
      turnId = 'turn-2';
      rerender();

      expect(result.current.selectedCardIds).toEqual([]);
    });
  });

  describe('Turn Legality & Client Affordance Helpers', () => {
    it('evaluates isOwnTurn correctly', () => {
      const proj = createMockProjection();
      expect(isOwnTurn(proj, 'p1')).toBe(true);
      expect(isOwnTurn(proj, 'p2')).toBe(false);

      // Inactive room
      const pausedProj = createMockProjection({ lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' });
      expect(isOwnTurn(pausedProj, 'p1')).toBe(false);
    });

    it('evaluates canPlayCards legality', () => {
      const proj = createMockProjection();

      // p1 turn with 0 cards selected -> false
      expect(canPlayCards(proj, 'p1', [])).toBe(false);

      // p1 turn with 1 card selected -> true
      expect(canPlayCards(proj, 'p1', ['c1'])).toBe(true);

      // p1 turn with 3 cards selected -> true
      expect(canPlayCards(proj, 'p1', ['c1', 'c2', 'c3'])).toBe(true);

      // p1 turn with 4 cards selected -> false
      expect(canPlayCards(proj, 'p1', ['c1', 'c2', 'c3', 'c4'])).toBe(false);

      // p2 turn -> false
      expect(canPlayCards(proj, 'p2', ['c1'])).toBe(false);
    });

    it('evaluates canCallLiar legality (first turn cannot challenge)', () => {
      const firstTurnProj = createMockProjection();
      // First turn of round has previousPlay === null -> cannot challenge (T05)
      expect(canCallLiar(firstTurnProj, 'p1')).toBe(false);

      // After a play exists
      const laterTurnProj = createMockProjection();
      if (laterTurnProj.publicState.match) {
        laterTurnProj.publicState.match.round.previousPlay = {
          playerId: 'p2',
          count: 1,
          claimedRank: 'KING',
        };
      }
      expect(canCallLiar(laterTurnProj, 'p1')).toBe(true);
      expect(canCallLiar(laterTurnProj, 'p2')).toBe(false);
    });

    it('identifies mandatory call condition and blocks playCards', () => {
      const proj = createMockProjection();
      if (proj.publicState.match) {
        // p2 is empty (handCount = 0), only p1 has cards, and previousPlay exists
        proj.publicState.match.players[1].handCount = 0;
        proj.publicState.match.round.previousPlay = {
          playerId: 'p2',
          count: 1,
          claimedRank: 'KING',
        };
      }

      expect(isMandatoryCall(proj, 'p1')).toBe(true);
      // Under mandatory call, normal play is disallowed
      expect(canPlayCards(proj, 'p1', ['c1'])).toBe(false);
      expect(canCallLiar(proj, 'p1')).toBe(true);
    });
  });

  describe('Action Envelope Builders', () => {
    it('builds a valid PLAY_CARDS envelope', () => {
      const proj = createMockProjection();
      const env = buildPlayCardsEnvelope(proj, ['c1', 'c2'], 'custom-act-1');

      expect(env.actionId).toBe('custom-act-1');
      expect(env.actionType).toBe('PLAY_CARDS');
      expect(env.expectedRevision).toBe(4);
      expect(env.turnId).toBe('turn-4');
      expect(env.payload).toEqual({ cardIds: ['c1', 'c2'] });
    });

    it('builds a valid CALL_LIAR envelope', () => {
      const proj = createMockProjection();
      const env = buildCallLiarEnvelope(proj, 'custom-call-1');

      expect(env.actionId).toBe('custom-call-1');
      expect(env.actionType).toBe('CALL_LIAR');
      expect(env.expectedRevision).toBe(4);
      expect(env.turnId).toBe('turn-4');
      expect(env.payload).toEqual({});
    });

    it('generates unique action IDs', () => {
      const id1 = generateActionId();
      const id2 = generateActionId();
      expect(id1).not.toBe(id2);
      expect(id1.startsWith('act_')).toBe(true);
    });

    it('throws when currentTurnId is null', () => {
      const proj = createMockProjection({ currentTurnId: null });
      expect(() => buildPlayCardsEnvelope(proj, ['c1'])).toThrow('currentTurnId is null');
      expect(() => buildCallLiarEnvelope(proj)).toThrow('currentTurnId is null');
    });
  });
});
