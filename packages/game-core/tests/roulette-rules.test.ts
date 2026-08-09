import { describe, it, expect } from 'vitest';
import { resolveRouletteShot } from '../src/roulette-rules.js';
import { PlayerState } from '../src/game-state.js';
import { RevolverOutcome } from '../src/revolver.js';
import { isTurnEligible } from '../src/turn-rules.js';

describe('resolveRouletteShot', () => {
  const basePlayer: PlayerState = {
    id: 'P1',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [{ id: 'card1', rank: 'KING' }],
    revolver: {
      sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
      nextShotIndex: 0
    }
  };

  describe('Canonical Sequence Validation', () => {
    it('length != 6 rejected', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          sequence: ['BLANK', 'LETHAL'] as RevolverOutcome[],
          nextShotIndex: 0
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/Revolver sequence must have exactly 6 outcomes./);
    });

    it('0 LETHAL rejected', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'] as RevolverOutcome[],
          nextShotIndex: 0
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/Revolver sequence must contain exactly 1 LETHAL and 5 BLANK outcomes./);
    });

    it('>1 LETHAL rejected', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          sequence: ['LETHAL', 'LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK'] as RevolverOutcome[],
          nextShotIndex: 0
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/Revolver sequence must contain exactly 1 LETHAL and 5 BLANK outcomes./);
    });
  });

  describe('Index Validation', () => {
    it('negative index rejected', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          ...basePlayer.revolver,
          nextShotIndex: -1
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/nextShotIndex cannot be negative./);
    });

    it('fractional index rejected', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          ...basePlayer.revolver,
          nextShotIndex: 1.5
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/nextShotIndex must be a finite integer./);
    });

    it('index 6 rejected (exhausted)', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          ...basePlayer.revolver,
          nextShotIndex: 6
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/Revolver is exhausted \(index >= 6\)./);
    });
  });

  describe('Consumed-Prefix Invariant', () => {
    it('ALIVE Player with previously consumed LETHAL rejected', () => {
      const player: PlayerState = {
        ...basePlayer,
        lifeStatus: 'ALIVE',
        revolver: {
          sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'],
          nextShotIndex: 1
        }
      };
      expect(() => resolveRouletteShot(player)).toThrow(/ALIVE player cannot have a consumed LETHAL shot in prefix./);
    });
  });

  describe('T17: Blank Progression', () => {
    it('BLANK preserves ALIVE, increments index, preserves sequence without reshuffle', () => {
      const result = resolveRouletteShot(basePlayer);

      expect(result.playerId).toBe('P1');
      expect(result.shotIndex).toBe(0);
      expect(result.outcome).toBe('BLANK');
      expect(result.nextShotIndex).toBe(1);
      expect(result.eliminated).toBe(false);

      expect(result.updatedPlayer.lifeStatus).toBe('ALIVE');
      expect(result.updatedPlayer.revolver.nextShotIndex).toBe(1);
      expect(result.updatedPlayer.revolver.sequence).toEqual(basePlayer.revolver.sequence);
    });
  });

  describe('T18: Lethal Elimination', () => {
    it('LETHAL sets ELIMINATED, increments index, integrates with turn-ineligibility', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'],
          nextShotIndex: 0
        }
      };

      const result = resolveRouletteShot(player);

      expect(result.shotIndex).toBe(0);
      expect(result.outcome).toBe('LETHAL');
      expect(result.nextShotIndex).toBe(1);
      expect(result.eliminated).toBe(true);

      expect(result.updatedPlayer.lifeStatus).toBe('ELIMINATED');
      expect(result.updatedPlayer.revolver.nextShotIndex).toBe(1);
      expect(result.updatedPlayer.revolver.sequence).toEqual(player.revolver.sequence);

      // Verify turn ineligibility
      expect(isTurnEligible(result.updatedPlayer)).toBe(false);
    });
  });

  describe('T19: Five Blanks Progression & Sixth Lethal', () => {
    it('progresses through 5 blanks to 6th lethal and rejects 7th attempt', () => {
      let current = basePlayer;

      // 5 Sequential Blanks
      for (let step = 0; step < 5; step++) {
        const res = resolveRouletteShot(current);
        expect(res.shotIndex).toBe(step);
        expect(res.outcome).toBe('BLANK');
        expect(res.nextShotIndex).toBe(step + 1);
        expect(res.eliminated).toBe(false);
        expect(res.updatedPlayer.lifeStatus).toBe('ALIVE');
        current = res.updatedPlayer;
      }

      expect(current.revolver.nextShotIndex).toBe(5);
      expect(current.lifeStatus).toBe('ALIVE');

      // 6th Shot: LETHAL
      const finalRes = resolveRouletteShot(current);
      expect(finalRes.shotIndex).toBe(5);
      expect(finalRes.outcome).toBe('LETHAL');
      expect(finalRes.nextShotIndex).toBe(6);
      expect(finalRes.eliminated).toBe(true);
      expect(finalRes.updatedPlayer.lifeStatus).toBe('ELIMINATED');

      // 7th Attempt (on ELIMINATED player with index 6)
      expect(() => resolveRouletteShot(finalRes.updatedPlayer)).toThrow(/already ELIMINATED/);
    });
  });

  describe('Early Lethal', () => {
    it('LETHAL before 6th position eliminates immediately and rejects subsequent shot', () => {
      const player: PlayerState = {
        ...basePlayer,
        revolver: {
          sequence: ['BLANK', 'LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK'],
          nextShotIndex: 0
        }
      };

      // 1st Shot -> BLANK
      const res1 = resolveRouletteShot(player);
      expect(res1.outcome).toBe('BLANK');
      expect(res1.nextShotIndex).toBe(1);
      expect(res1.updatedPlayer.lifeStatus).toBe('ALIVE');

      // 2nd Shot -> LETHAL
      const res2 = resolveRouletteShot(res1.updatedPlayer);
      expect(res2.outcome).toBe('LETHAL');
      expect(res2.nextShotIndex).toBe(2);
      expect(res2.updatedPlayer.lifeStatus).toBe('ELIMINATED');

      // 3rd attempt on resulting ELIMINATED player rejected
      expect(() => resolveRouletteShot(res2.updatedPlayer)).toThrow(/already ELIMINATED/);
    });
  });

  describe('Immutability and Fresh State', () => {
    it('does not mutate input objects and produces fresh references', () => {
      const frozenInputStr = JSON.stringify(basePlayer);

      const result = resolveRouletteShot(basePlayer);

      // Input remains unchanged
      expect(JSON.stringify(basePlayer)).toBe(frozenInputStr);

      // Fresh object references
      expect(result.updatedPlayer).not.toBe(basePlayer);
      expect(result.updatedPlayer.revolver).not.toBe(basePlayer.revolver);

      // Unchanged fields preserved
      expect(result.updatedPlayer.id).toBe(basePlayer.id);
      expect(result.updatedPlayer.roundStatus).toBe(basePlayer.roundStatus);
      expect(result.updatedPlayer.hand).toBe(basePlayer.hand);
      expect(result.updatedPlayer.revolver.sequence).toBe(basePlayer.revolver.sequence);
    });
  });

  describe('Determinism', () => {
    it('equivalent valid input produces equivalent resolution result', () => {
      const res1 = resolveRouletteShot(basePlayer);
      const res2 = resolveRouletteShot(basePlayer);

      expect(res1).toEqual(res2);
    });
  });
});
