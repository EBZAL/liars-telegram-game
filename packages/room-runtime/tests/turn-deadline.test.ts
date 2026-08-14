import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource, PlayerState } from '@liars-telegram-game/game-core';

import {
  TURN_DURATION_MS,
  armActiveTurnDeadline,
  evaluateTurnDeadlineDueState,
  createProcessedGameplayActionRegistry,
  executeClientGameplayTransaction,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  RoomMember,
  ServerResolvedActor,
  GameplayActionEnvelope,
} from '../src/index.js';

class TestRandomSource implements RandomSource {
  private sequence: number[];
  private index = 0;

  constructor(sequence: number[] = [0]) {
    this.sequence = sequence;
  }

  nextInt(max: number): number {
    const val = this.sequence[this.index % this.sequence.length];
    this.index++;
    return Math.abs(val) % max;
  }
}

describe('Turn Deadline Authority Foundation (T-021)', () => {
  function setupActiveMatch(playerIds: string[] = ['p1', 'p2', 'p3']): MatchState {
    return initializeMatch(playerIds, new TestRandomSource([0]));
  }

  function setupActiveRoom(
    roomId = 'room-1',
    playerIds: string[] = ['p1', 'p2', 'p3'],
    revision = 8,
    turnId = 'turn-8'
  ): RoomAuthorityState<MatchState> {
    const match = setupActiveMatch(playerIds);
    const members: RoomMember[] = playerIds.map((id, index) => ({
      playerId: id,
      joinOrder: index + 1,
      joinedAt: 1000 + index,
      connected: true,
    }));

    return {
      roomId,
      lifecycle: 'MATCH_ACTIVE',
      revision,
      members,
      hostPlayerId: playerIds[0],
      match,
      currentTurnId: turnId,
      currentTurnDeadline: null,
      activeAlarm: null,
    };
  }

  describe('Module & Constant Export Boundaries', () => {
    it('exports TURN_DURATION_MS constant as exactly 30000', () => {
      expect(TURN_DURATION_MS).toBe(30_000);
    });

    it('exports armActiveTurnDeadline and evaluateTurnDeadlineDueState functions', () => {
      expect(typeof armActiveTurnDeadline).toBe('function');
      expect(typeof evaluateTurnDeadlineDueState).toBe('function');
    });
  });

  describe('Arming Active Turn Deadline (armActiveTurnDeadline)', () => {
    it('arms a valid T-020 continuing state with exact 30s deadline and matching generation without incrementing revision (Mandatory Test 1)', () => {
      const roomState = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const authoritativeNowMs = 1000;

      const armedState = armActiveTurnDeadline(roomState, authoritativeNowMs);

      expect(armedState.revision).toBe(8);
      expect(armedState.currentTurnDeadline).toBe(31000); // 1000 + 30000
      expect(armedState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      });
      expect(armedState.lifecycle).toBe('MATCH_ACTIVE');
      expect(armedState.currentTurnId).toBe('turn-8');
      expect(armedState.roomId).toBe('room-1');
      expect(armedState.hostPlayerId).toBe('p1');
      expect(armedState.match).toBe(roomState.match);
    });

    it('rejects non-safe, non-integer, negative, or overflow authoritativeNowMs', () => {
      const roomState = setupActiveRoom();

      expect(() => armActiveTurnDeadline(roomState, NaN)).toThrow(/Invalid authoritativeNowMs/);
      expect(() => armActiveTurnDeadline(roomState, -1)).toThrow(/Invalid authoritativeNowMs/);
      expect(() => armActiveTurnDeadline(roomState, 1.5)).toThrow(/Invalid authoritativeNowMs/);
      expect(() => armActiveTurnDeadline(roomState, Number.MAX_SAFE_INTEGER)).toThrow(/Invalid authoritativeNowMs/);
    });

    it('rejects arming when lifecycle is not MATCH_ACTIVE', () => {
      const baseRoom = setupActiveRoom();

      expect(() => armActiveTurnDeadline({ ...baseRoom, lifecycle: 'LOBBY' }, 1000)).toThrow(/Cannot arm deadline/);
      expect(() => armActiveTurnDeadline({ ...baseRoom, lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' }, 1000)).toThrow(/Cannot arm deadline/);
      expect(() => armActiveTurnDeadline({ ...baseRoom, lifecycle: 'MATCH_FINISHED' }, 1000)).toThrow(/Cannot arm deadline/);
      expect(() => armActiveTurnDeadline({ ...baseRoom, lifecycle: 'ABANDONED' }, 1000)).toThrow(/Cannot arm deadline/);
    });

    it('rejects arming when match is null or finished', () => {
      const baseRoom = setupActiveRoom();

      expect(() => armActiveTurnDeadline({ ...baseRoom, match: null }, 1000)).toThrow(/Cannot arm deadline/);

      const finishedMatch: MatchState = {
        ...baseRoom.match!,
        status: 'FINISHED',
        winnerId: 'p1',
      };
      expect(() => armActiveTurnDeadline({ ...baseRoom, match: finishedMatch }, 1000)).toThrow(/Cannot arm deadline/);
    });

    it('rejects arming when currentTurnId is null or blank', () => {
      const baseRoom = setupActiveRoom();

      expect(() => armActiveTurnDeadline({ ...baseRoom, currentTurnId: null }, 1000)).toThrow(/Cannot arm deadline/);
      expect(() => armActiveTurnDeadline({ ...baseRoom, currentTurnId: '   ' }, 1000)).toThrow(/Cannot arm deadline/);
    });

    it('rejects arming if currentTurnDeadline is already set (Mandatory Test 9)', () => {
      const baseRoom = setupActiveRoom();
      const alreadyArmed = { ...baseRoom, currentTurnDeadline: 20000 };

      expect(() => armActiveTurnDeadline(alreadyArmed, 1000)).toThrow(/currentTurnDeadline is already set/);
    });

    it('rejects arming if any activeAlarm is already present (Mandatory Test 8)', () => {
      const baseRoom = setupActiveRoom();

      const withTurnAlarm: RoomAuthorityState<MatchState> = {
        ...baseRoom,
        activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 30000, generation: 8 },
      };
      expect(() => armActiveTurnDeadline(withTurnAlarm, 1000)).toThrow(/activeAlarm is already set/);

      const withGraceAlarm: RoomAuthorityState<MatchState> = {
        ...baseRoom,
        activeAlarm: { kind: 'HOST_GRACE', dueAt: 30000, generation: 8 },
      };
      expect(() => armActiveTurnDeadline(withGraceAlarm, 1000)).toThrow(/activeAlarm is already set/);

      const withRetentionAlarm: RoomAuthorityState<MatchState> = {
        ...baseRoom,
        activeAlarm: { kind: 'ROOM_RETENTION', dueAt: 30000, generation: 8 },
      };
      expect(() => armActiveTurnDeadline(withRetentionAlarm, 1000)).toThrow(/activeAlarm is already set/);
    });

    it('does not mutate input roomState or match (Purity Check)', () => {
      const roomState = setupActiveRoom();
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      armActiveTurnDeadline(roomState, 1000);

      expect(roomState).toEqual(roomStateCopy);
    });
  });

  describe('Evaluating Turn Deadline Due State (evaluateTurnDeadlineDueState)', () => {
    it('returns NOT_DUE when authoritativeNowMs < dueAt (Mandatory Test 2)', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const armed = armActiveTurnDeadline(baseRoom, 1000); // dueAt = 31000

      const result = evaluateTurnDeadlineDueState(armed, 30999);
      expect(result).toEqual({ status: 'NOT_DUE' });
    });

    it('returns DUE when authoritativeNowMs == dueAt (Mandatory Test 3)', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const armed = armActiveTurnDeadline(baseRoom, 1000); // dueAt = 31000

      const result = evaluateTurnDeadlineDueState(armed, 31000);
      expect(result).toEqual({ status: 'DUE' });
    });

    it('returns DUE when authoritativeNowMs > dueAt (Mandatory Test 4)', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const armed = armActiveTurnDeadline(baseRoom, 1000); // dueAt = 31000

      const result = evaluateTurnDeadlineDueState(armed, 31001);
      expect(result).toEqual({ status: 'DUE' });
    });

    it('returns NOT_APPLICABLE for LOBBY, MATCH_PAUSED_NO_LIVING_CONNECTIONS, MATCH_FINISHED, and ABANDONED states (Mandatory Tests 10 & 11)', () => {
      const baseRoom = setupActiveRoom();
      const armed = armActiveTurnDeadline(baseRoom, 1000);

      expect(evaluateTurnDeadlineDueState({ ...armed, lifecycle: 'LOBBY' }, 35000)).toEqual({ status: 'NOT_APPLICABLE' });
      expect(evaluateTurnDeadlineDueState({ ...armed, lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' }, 35000)).toEqual({ status: 'NOT_APPLICABLE' });
      expect(evaluateTurnDeadlineDueState({ ...armed, lifecycle: 'MATCH_FINISHED' }, 35000)).toEqual({ status: 'NOT_APPLICABLE' });
      expect(evaluateTurnDeadlineDueState({ ...armed, lifecycle: 'ABANDONED' }, 35000)).toEqual({ status: 'NOT_APPLICABLE' });
    });

    it('returns INVALID_STATE for stale generation mismatch (Mandatory Test 5)', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const armed = armActiveTurnDeadline(baseRoom, 1000);

      const staleGenerationRoom: RoomAuthorityState<MatchState> = {
        ...armed,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 31000,
          generation: 7, // mismatch with room.revision (8)
        },
      };

      expect(evaluateTurnDeadlineDueState(staleGenerationRoom, 35000)).toEqual({ status: 'INVALID_STATE' });
    });

    it('returns INVALID_STATE for deadline and activeAlarm.dueAt mismatch (Mandatory Test 6)', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const armed = armActiveTurnDeadline(baseRoom, 1000);

      const mismatchedDueAtRoom: RoomAuthorityState<MatchState> = {
        ...armed,
        currentTurnDeadline: 31000,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 32000, // mismatch with currentTurnDeadline (31000)
          generation: 8,
        },
      };

      expect(evaluateTurnDeadlineDueState(mismatchedDueAtRoom, 35000)).toEqual({ status: 'INVALID_STATE' });
    });

    it('returns INVALID_STATE for non-TURN_DEADLINE activeAlarm in MATCH_ACTIVE (Mandatory Test 7)', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');
      const armed = armActiveTurnDeadline(baseRoom, 1000);

      const hostGraceRoom: RoomAuthorityState<MatchState> = {
        ...armed,
        activeAlarm: {
          kind: 'HOST_GRACE',
          dueAt: 31000,
          generation: 8,
        },
      };

      expect(evaluateTurnDeadlineDueState(hostGraceRoom, 35000)).toEqual({ status: 'INVALID_STATE' });
    });

    it('returns INVALID_STATE when active timing metadata is null or incoherent', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8');

      // Unarmed room (null deadline & null alarm)
      expect(evaluateTurnDeadlineDueState(baseRoom, 35000)).toEqual({ status: 'INVALID_STATE' });

      // Deadline set, but null activeAlarm
      expect(evaluateTurnDeadlineDueState({ ...baseRoom, currentTurnDeadline: 31000 }, 35000)).toEqual({ status: 'INVALID_STATE' });

      // Alarm set, but null deadline
      expect(
        evaluateTurnDeadlineDueState(
          { ...baseRoom, activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 31000, generation: 8 } },
          35000
        )
      ).toEqual({ status: 'INVALID_STATE' });
    });

    it('returns INVALID_STATE for invalid authoritativeNowMs', () => {
      const baseRoom = setupActiveRoom();
      const armed = armActiveTurnDeadline(baseRoom, 1000);

      expect(evaluateTurnDeadlineDueState(armed, -5)).toEqual({ status: 'INVALID_STATE' });
      expect(evaluateTurnDeadlineDueState(armed, NaN)).toEqual({ status: 'INVALID_STATE' });
      expect(evaluateTurnDeadlineDueState(armed, 1.5)).toEqual({ status: 'INVALID_STATE' });
    });

    it('does not mutate input roomState or match during evaluation', () => {
      const baseRoom = setupActiveRoom();
      const armed = armActiveTurnDeadline(baseRoom, 1000);
      const armedCopy = JSON.parse(JSON.stringify(armed));

      evaluateTurnDeadlineDueState(armed, 31000);

      expect(armed).toEqual(armedCopy);
    });
  });

  describe('Integration Boundary with T-020 Gameplay Transaction', () => {
    it('composes clean T-020 continuing COMMITTED result into armed turn deadline with same revision', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const p1ActorId = baseRoom.match!.round.currentPlayerId;
      const p1Actor: ServerResolvedActor = { playerId: p1ActorId };
      const cardToPlay = baseRoom.match!.players[p1ActorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      // T-020 execution -> revision 1, currentTurnId = 'turn-2', deadline = null, activeAlarm = null
      const txResult = executeClientGameplayTransaction(
        baseRoom,
        envelope,
        createProcessedGameplayActionRegistry(),
        p1Actor,
        { turnId: 'turn-2' },
        new TestRandomSource([0])
      );

      expect(txResult.decision).toBe('COMMITTED');
      if (txResult.decision !== 'COMMITTED') return;

      expect(txResult.roomState.revision).toBe(1);
      expect(txResult.roomState.currentTurnDeadline).toBeNull();
      expect(txResult.roomState.activeAlarm).toBeNull();

      // Arm active turn deadline at server time 5000ms -> dueAt = 35000ms
      const armedRoom = armActiveTurnDeadline(txResult.roomState, 5000);

      expect(armedRoom.revision).toBe(1); // SAME revision retained!
      expect(armedRoom.currentTurnDeadline).toBe(35000);
      expect(armedRoom.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 35000,
        generation: 1, // matches revision 1
      });

      // Evaluation before 35000ms -> NOT_DUE
      expect(evaluateTurnDeadlineDueState(armedRoom, 34999)).toEqual({ status: 'NOT_DUE' });
      // Evaluation at 35000ms -> DUE
      expect(evaluateTurnDeadlineDueState(armedRoom, 35000)).toEqual({ status: 'DUE' });
    });

    it('rejects arming when T-020 result is MATCH_FINISHED', () => {
      const baseRoom = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const p1Id = baseRoom.match!.round.currentPlayerId;
      const p2Id = p1Id === 'p1' ? 'p2' : 'p1';

      // Custom finished match setup
      const p1State: PlayerState = {
        id: p1Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [
          { id: 'p1-c1', rank: 'ACE' },
          { id: 'p1-c2', rank: 'ACE' },
        ],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: p2Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };

      const customMatch: MatchState = {
        ...baseRoom.match!,
        players: { [p1Id]: p1State, [p2Id]: p2State },
        round: { ...baseRoom.match!.round, tableRank: 'ACE', currentPlayerId: p1Id, previousPlay: null },
      };

      const roomState = { ...baseRoom, match: customMatch };

      const res1 = executeClientGameplayTransaction(
        roomState,
        { actionId: 'p1-play', expectedRevision: 0, turnId: 'turn-1', actionType: 'PLAY_CARDS', payload: { cardIds: ['p1-c1'] } },
        createProcessedGameplayActionRegistry(),
        { playerId: p1Id },
        { turnId: 'turn-2' },
        new TestRandomSource([0])
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      const res2 = executeClientGameplayTransaction(
        res1.roomState,
        { actionId: 'p2-call', expectedRevision: 1, turnId: 'turn-2', actionType: 'CALL_LIAR', payload: {} },
        res1.processedRegistry,
        { playerId: p2Id },
        { turnId: 'turn-3' },
        new TestRandomSource([0])
      );
      expect(res2.decision).toBe('COMMITTED');
      if (res2.decision !== 'COMMITTED') return;

      expect(res2.roomState.lifecycle).toBe('MATCH_FINISHED');

      // Attempting to arm a MATCH_FINISHED room throws error
      expect(() => armActiveTurnDeadline(res2.roomState, 10000)).toThrow(/Cannot arm deadline/);

      // Due state evaluation on MATCH_FINISHED returns NOT_APPLICABLE
      expect(evaluateTurnDeadlineDueState(res2.roomState, 10000)).toEqual({ status: 'NOT_APPLICABLE' });
    });
  });
});
