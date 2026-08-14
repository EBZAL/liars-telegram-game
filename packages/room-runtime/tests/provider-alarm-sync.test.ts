import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';

import {
  deriveProviderAlarmSyncPlan,
  armActiveTurnDeadline,
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
  createProcessedGameplayActionRegistry,
  executeTimedClientGameplayWithPresenceLifecycle,
  executeSystemTimeoutWithPresenceLifecycle,
  resumePausedMatchForLivingPresenceTransition,
  TURN_DURATION_MS,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  RoomMember,
  GameplayActionEnvelope,
  ServerResolvedActor,
  ServerPreparedNextTurn,
  ServerTurnDeadlineTrigger,
} from '../src/index.js';

class TestRandomSource implements RandomSource {
  public calls = 0;
  private sequence: number[];

  constructor(sequence: number[] = [0]) {
    this.sequence = sequence;
  }

  nextInt(max: number): number {
    this.calls++;
    const val = this.sequence[(this.calls - 1) % this.sequence.length];
    return Math.abs(val) % max;
  }
}

describe('T-028 Final-State Provider Alarm Synchronization Plan', () => {
  function setupActiveMatch(playerIds: string[] = ['p1', 'p2', 'p3']): {
    match: MatchState;
    random: TestRandomSource;
  } {
    const random = new TestRandomSource([0, 0, 0, 0, 0]);
    const match = initializeMatch(playerIds, random);
    return { match, random };
  }

  function setupArmedActiveRoom(
    roomId = 'room-1',
    playerIds: string[] = ['p1', 'p2', 'p3'],
    revision = 8,
    turnId = 'turn-8',
    armTimeMs = 1000
  ): {
    roomState: RoomAuthorityState<MatchState>;
    random: TestRandomSource;
    armTimeMs: number;
    deadlineMs: number;
  } {
    const { match, random } = setupActiveMatch(playerIds);
    const members: RoomMember[] = playerIds.map((id, index) => ({
      playerId: id,
      joinOrder: index + 1,
    }));

    const rawRoom: RoomAuthorityState<MatchState> = {
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

    const roomState = armActiveTurnDeadline(rawRoom, armTimeMs);
    const deadlineMs = armTimeMs + TURN_DURATION_MS; // 1000 + 30000 = 31000

    return { roomState, random, armTimeMs, deadlineMs };
  }

  describe('API Exports & Discriminated Result Union (AC-01..AC-10)', () => {
    it('exports deriveProviderAlarmSyncPlan from room-runtime (AC-01, AC-02)', () => {
      expect(typeof deriveProviderAlarmSyncPlan).toBe('function');
    });

    it('returns discriminated union plans (AC-05..AC-10)', () => {
      const { roomState } = setupArmedActiveRoom();
      // NO_CHANGE
      const noChangePlan = deriveProviderAlarmSyncPlan(roomState, roomState.currentTurnDeadline);
      expect(noChangePlan).toEqual({ decision: 'NO_CHANGE' });

      // SET_ALARM (carries desired dueAt only, no provider alarm kind/generation payload)
      const setPlan = deriveProviderAlarmSyncPlan(roomState, null);
      expect(setPlan).toEqual({
        decision: 'SET_ALARM',
        dueAt: roomState.currentTurnDeadline,
      });
      expect((setPlan as any).kind).toBeUndefined();
      expect((setPlan as any).generation).toBeUndefined();

      // DELETE_ALARM
      const pausedRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const deletePlan = deriveProviderAlarmSyncPlan(pausedRoom, 31000);
      expect(deletePlan).toEqual({ decision: 'DELETE_ALARM' });

      // INVALID_STATE
      const invalidPlan = deriveProviderAlarmSyncPlan(roomState, -1);
      expect(invalidPlan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });
  });

  describe('Provider Observation Validation (AC-11..AC-17)', () => {
    it('accepts null provider observation (AC-11)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, null);
      expect(plan.decision).toBe('SET_ALARM');
    });

    it('accepts safe non-negative integer provider observation (AC-12)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, 0);
      expect(plan.decision).toBe('SET_ALARM');

      const plan2 = deriveProviderAlarmSyncPlan(roomState, 31000);
      expect(plan2.decision).toBe('NO_CHANGE');
    });

    it('fails closed with INVALID_STATE on negative provider observation (AC-13)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, -1);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });

    it('fails closed with INVALID_STATE on fractional provider observation (AC-14)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, 31000.5);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });

    it('fails closed with INVALID_STATE on NaN provider observation (AC-15)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, Number.NaN);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });

    it('fails closed with INVALID_STATE on Infinity provider observation (AC-16)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan1 = deriveProviderAlarmSyncPlan(roomState, Number.POSITIVE_INFINITY);
      expect(plan1).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });

      const plan2 = deriveProviderAlarmSyncPlan(roomState, Number.NEGATIVE_INFINITY);
      expect(plan2).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });

    it('fails closed with INVALID_STATE on unsafe integer provider observation (AC-17)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, Number.MAX_SAFE_INTEGER + 10);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });

    it('fails closed on non-number/non-null provider observation', () => {
      const { roomState } = setupArmedActiveRoom();
      expect(deriveProviderAlarmSyncPlan(roomState, '31000' as any)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
      expect(deriveProviderAlarmSyncPlan(roomState, {} as any)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
      expect(deriveProviderAlarmSyncPlan(roomState, undefined as any)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PROVIDER_OBSERVATION',
      });
    });
  });

  describe('Room Revision and State Validation (AC-18)', () => {
    it('fails closed on invalid Room revision (AC-18)', () => {
      const { roomState } = setupArmedActiveRoom();
      const invalidRevs = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '8' as any];
      for (const rev of invalidRevs) {
        const plan = deriveProviderAlarmSyncPlan({ ...roomState, revision: rev }, null);
        expect(plan).toEqual({
          decision: 'INVALID_STATE',
          reason: 'INVALID_ROOM_STATE',
        });
      }
    });

    it('fails closed on null or non-object Room state', () => {
      expect(deriveProviderAlarmSyncPlan(null as any, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      });
      expect(deriveProviderAlarmSyncPlan(undefined as any, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      });
      expect(deriveProviderAlarmSyncPlan('room' as any, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      });
    });

    it('fails closed on invalid/empty roomId', () => {
      const { roomState } = setupArmedActiveRoom();
      expect(deriveProviderAlarmSyncPlan({ ...roomState, roomId: '' }, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      });
      expect(deriveProviderAlarmSyncPlan({ ...roomState, roomId: '   ' }, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      });
    });

    it('fails closed on unknown lifecycle', () => {
      const { roomState } = setupArmedActiveRoom();
      expect(deriveProviderAlarmSyncPlan({ ...roomState, lifecycle: 'UNKNOWN_LIFECYCLE' as any }, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      });
    });
  });

  describe('MATCH_ACTIVE Delegation to T-021 & Alarm Reconciliation (AC-19..AC-31)', () => {
    it('delegates to T-021 and accepts NOT_DUE and DUE active states (AC-19..AC-21)', () => {
      const { roomState } = setupArmedActiveRoom();
      // DueAt is 31000. With 0 sentinel, authoritative evaluation status is NOT_DUE -> coherent
      const plan = deriveProviderAlarmSyncPlan(roomState, null);
      expect(plan).toEqual({ decision: 'SET_ALARM', dueAt: 31000 });
    });

    it('fails closed if T-021 returns INVALID_STATE (AC-22)', () => {
      const { roomState } = setupArmedActiveRoom();
      // Incoherent alarm dueAt vs currentTurnDeadline
      const incoherentState: RoomAuthorityState<MatchState> = {
        ...roomState,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 99999, // Mismatched
          generation: roomState.revision,
        },
      };
      const plan = deriveProviderAlarmSyncPlan(incoherentState, null);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ACTIVE_DEADLINE_STATE',
      });
    });

    it('fails closed if MATCH_ACTIVE is claimed but match is finished (AC-22, AC-23)', () => {
      const { roomState } = setupArmedActiveRoom();
      const finishedMatch: MatchState = {
        ...roomState.match!,
        status: 'FINISHED',
        winnerId: 'p1',
      };
      const plan = deriveProviderAlarmSyncPlan({ ...roomState, match: finishedMatch }, null);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ACTIVE_DEADLINE_STATE',
      });
    });

    it('fails closed if MATCH_ACTIVE has mismatched alarm generation (AC-22)', () => {
      const { roomState } = setupArmedActiveRoom();
      const mismatchedGen: RoomAuthorityState<MatchState> = {
        ...roomState,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: roomState.currentTurnDeadline!,
          generation: roomState.revision + 1,
        },
      };
      const plan = deriveProviderAlarmSyncPlan(mismatchedGen, null);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ACTIVE_DEADLINE_STATE',
      });
    });

    it('derives desired dueAt from activeAlarm and plans SET_ALARM when provider is null (AC-25, AC-26)', () => {
      const { roomState } = setupArmedActiveRoom('r1', ['p1', 'p2'], 5, 't-5', 2000);
      // Deadline is 2000 + 30000 = 32000
      const plan = deriveProviderAlarmSyncPlan(roomState, null);
      expect(plan).toEqual({ decision: 'SET_ALARM', dueAt: 32000 });
    });

    it('plans SET_ALARM when provider timestamp differs from desired (AC-27)', () => {
      const { roomState } = setupArmedActiveRoom('r1', ['p1', 'p2'], 5, 't-5', 2000);
      const plan = deriveProviderAlarmSyncPlan(roomState, 31000);
      expect(plan).toEqual({ decision: 'SET_ALARM', dueAt: 32000 });
    });

    it('plans NO_CHANGE when provider timestamp matches desired (AC-28)', () => {
      const { roomState } = setupArmedActiveRoom('r1', ['p1', 'p2'], 5, 't-5', 2000);
      const plan = deriveProviderAlarmSyncPlan(roomState, 32000);
      expect(plan).toEqual({ decision: 'NO_CHANGE' });
    });
  });

  describe('MATCH_PAUSED_NO_LIVING_CONNECTIONS Reconciliation (AC-32..AC-37)', () => {
    it('requires currentTurnDeadline null and activeAlarm null (AC-32, AC-33)', () => {
      const { roomState } = setupArmedActiveRoom();
      const validPaused: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(deriveProviderAlarmSyncPlan(validPaused, null)).toEqual({ decision: 'NO_CHANGE' });
      expect(deriveProviderAlarmSyncPlan(validPaused, 31000)).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('fails closed when PAUSED state has stale deadline (AC-34)', () => {
      const { roomState } = setupArmedActiveRoom();
      const staleDeadlinePaused: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: 31000,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(staleDeadlinePaused, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PAUSED_ALARM_STATE',
      });
    });

    it('fails closed when PAUSED state has stale activeAlarm (AC-35)', () => {
      const { roomState } = setupArmedActiveRoom();
      const staleAlarmPaused: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 31000,
          generation: roomState.revision,
        },
      };
      expect(deriveProviderAlarmSyncPlan(staleAlarmPaused, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PAUSED_ALARM_STATE',
      });
    });

    it('emits NO_CHANGE when observed provider alarm is null (AC-36)', () => {
      const { roomState } = setupArmedActiveRoom();
      const validPaused: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(validPaused, null)).toEqual({ decision: 'NO_CHANGE' });
    });

    it('emits DELETE_ALARM when observed provider alarm is scheduled timestamp (AC-37)', () => {
      const { roomState } = setupArmedActiveRoom();
      const validPaused: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(validPaused, 31000)).toEqual({ decision: 'DELETE_ALARM' });
    });
  });

  describe('LOBBY Reconciliation (AC-38..AC-46)', () => {
    it('requires currentTurnDeadline null and permits null activeAlarm (AC-38, AC-39)', () => {
      const lobbyState: RoomAuthorityState<MatchState> = {
        roomId: 'room-lobby',
        lifecycle: 'LOBBY',
        revision: 0,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(deriveProviderAlarmSyncPlan(lobbyState, null)).toEqual({ decision: 'NO_CHANGE' });
      expect(deriveProviderAlarmSyncPlan(lobbyState, 45000)).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('permits structurally valid HOST_GRACE alarm (AC-40, AC-43, AC-44)', () => {
      const lobbyWithHostGrace: RoomAuthorityState<MatchState> = {
        roomId: 'room-lobby',
        lifecycle: 'LOBBY',
        revision: 2,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'HOST_GRACE',
          dueAt: 60000,
          generation: 2,
        },
      };

      expect(deriveProviderAlarmSyncPlan(lobbyWithHostGrace, null)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 60000,
      });
      expect(deriveProviderAlarmSyncPlan(lobbyWithHostGrace, 60000)).toEqual({
        decision: 'NO_CHANGE',
      });
      expect(deriveProviderAlarmSyncPlan(lobbyWithHostGrace, 55000)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 60000,
      });
    });

    it('rejects TURN_DEADLINE in LOBBY (AC-41)', () => {
      const lobbyWithTurnDeadline: RoomAuthorityState<MatchState> = {
        roomId: 'room-lobby',
        lifecycle: 'LOBBY',
        revision: 0,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 30000,
          generation: 0,
        },
      };
      expect(deriveProviderAlarmSyncPlan(lobbyWithTurnDeadline, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_LOBBY_ALARM_STATE',
      });
    });

    it('rejects ROOM_RETENTION in LOBBY (AC-42)', () => {
      const lobbyWithRetention: RoomAuthorityState<MatchState> = {
        roomId: 'room-lobby',
        lifecycle: 'LOBBY',
        revision: 0,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 86400000,
          generation: 0,
        },
      };
      expect(deriveProviderAlarmSyncPlan(lobbyWithRetention, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_LOBBY_ALARM_STATE',
      });
    });

    it('fails closed on non-null currentTurnDeadline in LOBBY', () => {
      const lobbyWithDeadline: RoomAuthorityState<MatchState> = {
        roomId: 'room-lobby',
        lifecycle: 'LOBBY',
        revision: 0,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: 30000,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(lobbyWithDeadline, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_LOBBY_ALARM_STATE',
      });
    });

    it('fails closed on structurally invalid HOST_GRACE alarm (AC-43, AC-44)', () => {
      const baseLobby: RoomAuthorityState<MatchState> = {
        roomId: 'room-lobby',
        lifecycle: 'LOBBY',
        revision: 0,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      // Negative dueAt
      expect(
        deriveProviderAlarmSyncPlan(
          { ...baseLobby, activeAlarm: { kind: 'HOST_GRACE', dueAt: -1, generation: 0 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });

      // Fractional dueAt
      expect(
        deriveProviderAlarmSyncPlan(
          { ...baseLobby, activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000.5, generation: 0 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });

      // Negative generation
      expect(
        deriveProviderAlarmSyncPlan(
          { ...baseLobby, activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: -1 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });

      // Unsafe generation
      expect(
        deriveProviderAlarmSyncPlan(
          {
            ...baseLobby,
            activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: Number.MAX_SAFE_INTEGER + 10 },
          },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });
    });
  });

  describe('MATCH_FINISHED Reconciliation (AC-47..AC-53)', () => {
    it('requires currentTurnDeadline null and permits null activeAlarm (AC-47, AC-48)', () => {
      const { roomState } = setupArmedActiveRoom();
      const finishedState: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_FINISHED',
        match: { ...roomState.match!, status: 'FINISHED', winnerId: 'p1' },
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(deriveProviderAlarmSyncPlan(finishedState, null)).toEqual({ decision: 'NO_CHANGE' });
      expect(deriveProviderAlarmSyncPlan(finishedState, 31000)).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('permits structurally valid ROOM_RETENTION (AC-49, AC-58, AC-59)', () => {
      const { roomState } = setupArmedActiveRoom();
      const finishedWithRetention: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_FINISHED',
        match: { ...roomState.match!, status: 'FINISHED', winnerId: 'p1' },
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 86400000,
          generation: 15,
        },
      };

      expect(deriveProviderAlarmSyncPlan(finishedWithRetention, null)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 86400000,
      });
      expect(deriveProviderAlarmSyncPlan(finishedWithRetention, 86400000)).toEqual({
        decision: 'NO_CHANGE',
      });
      expect(deriveProviderAlarmSyncPlan(finishedWithRetention, 31000)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 86400000,
      });
    });

    it('rejects TURN_DEADLINE in MATCH_FINISHED (AC-50)', () => {
      const { roomState } = setupArmedActiveRoom();
      const finishedWithTurnAlarm: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_FINISHED',
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 31000,
          generation: 8,
        },
      };
      expect(deriveProviderAlarmSyncPlan(finishedWithTurnAlarm, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_FINISHED_ALARM_STATE',
      });
    });

    it('rejects HOST_GRACE in MATCH_FINISHED (AC-51)', () => {
      const { roomState } = setupArmedActiveRoom();
      const finishedWithHostGrace: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_FINISHED',
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'HOST_GRACE',
          dueAt: 60000,
          generation: 8,
        },
      };
      expect(deriveProviderAlarmSyncPlan(finishedWithHostGrace, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_FINISHED_ALARM_STATE',
      });
    });

    it('fails closed on non-null currentTurnDeadline in MATCH_FINISHED', () => {
      const { roomState } = setupArmedActiveRoom();
      const finishedWithDeadline: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_FINISHED',
        currentTurnDeadline: 31000,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(finishedWithDeadline, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_FINISHED_ALARM_STATE',
      });
    });

    it('fails closed on structurally invalid ROOM_RETENTION alarm in MATCH_FINISHED', () => {
      const { roomState } = setupArmedActiveRoom();
      const baseFinished: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_FINISHED',
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(
        deriveProviderAlarmSyncPlan(
          { ...baseFinished, activeAlarm: { kind: 'ROOM_RETENTION', dueAt: -1, generation: 0 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });

      expect(
        deriveProviderAlarmSyncPlan(
          { ...baseFinished, activeAlarm: { kind: 'ROOM_RETENTION', dueAt: 86400000, generation: -5 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });
    });
  });

  describe('ABANDONED Reconciliation (AC-54..AC-61)', () => {
    it('requires currentTurnDeadline null and permits null activeAlarm (AC-54, AC-55)', () => {
      const abandonedState: RoomAuthorityState<MatchState> = {
        roomId: 'room-abandoned',
        lifecycle: 'ABANDONED',
        revision: 5,
        members: [],
        hostPlayerId: null,
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(deriveProviderAlarmSyncPlan(abandonedState, null)).toEqual({ decision: 'NO_CHANGE' });
      expect(deriveProviderAlarmSyncPlan(abandonedState, 20000)).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('permits structurally valid ROOM_RETENTION in ABANDONED (AC-56)', () => {
      const abandonedWithRetention: RoomAuthorityState<MatchState> = {
        roomId: 'room-abandoned',
        lifecycle: 'ABANDONED',
        revision: 5,
        members: [],
        hostPlayerId: null,
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 86400000,
          generation: 5,
        },
      };

      expect(deriveProviderAlarmSyncPlan(abandonedWithRetention, null)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 86400000,
      });
      expect(deriveProviderAlarmSyncPlan(abandonedWithRetention, 86400000)).toEqual({
        decision: 'NO_CHANGE',
      });
      expect(deriveProviderAlarmSyncPlan(abandonedWithRetention, 10000)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 86400000,
      });
    });

    it('rejects TURN_DEADLINE and HOST_GRACE in ABANDONED (AC-57)', () => {
      const abandonedBase: RoomAuthorityState<MatchState> = {
        roomId: 'room-abandoned',
        lifecycle: 'ABANDONED',
        revision: 5,
        members: [],
        hostPlayerId: null,
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(
        deriveProviderAlarmSyncPlan(
          { ...abandonedBase, activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 30000, generation: 5 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_ABANDONED_ALARM_STATE' });

      expect(
        deriveProviderAlarmSyncPlan(
          { ...abandonedBase, activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: 5 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_ABANDONED_ALARM_STATE' });
    });

    it('fails closed on non-null currentTurnDeadline in ABANDONED', () => {
      const abandonedWithDeadline: RoomAuthorityState<MatchState> = {
        roomId: 'room-abandoned',
        lifecycle: 'ABANDONED',
        revision: 5,
        members: [],
        hostPlayerId: null,
        match: null,
        currentTurnId: null,
        currentTurnDeadline: 30000,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(abandonedWithDeadline, null)).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_ABANDONED_ALARM_STATE',
      });
    });

    it('fails closed on structurally invalid ROOM_RETENTION in ABANDONED', () => {
      const abandonedBase: RoomAuthorityState<MatchState> = {
        roomId: 'room-abandoned',
        lifecycle: 'ABANDONED',
        revision: 5,
        members: [],
        hostPlayerId: null,
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      expect(
        deriveProviderAlarmSyncPlan(
          { ...abandonedBase, activeAlarm: { kind: 'ROOM_RETENTION', dueAt: -100, generation: 0 } },
          null
        )
      ).toEqual({ decision: 'INVALID_STATE', reason: 'INVALID_NON_TURN_ALARM' });
    });
  });

  describe('Generic Decision Table (AC-62..AC-67)', () => {
    it('desired null + observed null -> NO_CHANGE (AC-62)', () => {
      const { roomState } = setupArmedActiveRoom();
      const pausedState: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(pausedState, null)).toEqual({ decision: 'NO_CHANGE' });
    });

    it('desired null + observed timestamp -> DELETE_ALARM (AC-63)', () => {
      const { roomState } = setupArmedActiveRoom();
      const pausedState: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      expect(deriveProviderAlarmSyncPlan(pausedState, 31000)).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('desired timestamp + observed null -> SET_ALARM (AC-64)', () => {
      const { roomState } = setupArmedActiveRoom();
      expect(deriveProviderAlarmSyncPlan(roomState, null)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 31000,
      });
    });

    it('desired timestamp differs from observed -> SET_ALARM desired (AC-65)', () => {
      const { roomState } = setupArmedActiveRoom();
      expect(deriveProviderAlarmSyncPlan(roomState, 20000)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 31000,
      });
    });

    it('desired timestamp equals observed -> NO_CHANGE (AC-66)', () => {
      const { roomState } = setupArmedActiveRoom();
      expect(deriveProviderAlarmSyncPlan(roomState, 31000)).toEqual({ decision: 'NO_CHANGE' });
    });

    it('produces exactly one synchronization intent maximum (AC-67)', () => {
      const { roomState } = setupArmedActiveRoom();
      const plan = deriveProviderAlarmSyncPlan(roomState, 31000);
      expect(Object.keys(plan).length).toBe(1);
      expect(plan.decision).toBe('NO_CHANGE');
    });
  });

  describe('Durable Alarm Identity vs Provider Timestamp Distinction (AC-68..AC-73, AC-144)', () => {
    it('equal dueAt with changed durable kind/generation requires no timestamp operation (AC-71..AC-73)', () => {
      // Room state has ROOM_RETENTION at 50000 with generation 9
      const finishedRoom: RoomAuthorityState<MatchState> = {
        roomId: 'room-1',
        lifecycle: 'MATCH_FINISHED',
        revision: 9,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 50000,
          generation: 9,
        },
      };

      // Provider observation contains only scheduled timestamp 50000 (from previous TURN_DEADLINE or old schedule)
      const plan = deriveProviderAlarmSyncPlan(finishedRoom, 50000);
      expect(plan).toEqual({ decision: 'NO_CHANGE' });
    });
  });

  describe('Mandatory Direct Tests A through N', () => {
    it('MANDATORY DIRECT TEST A — T-027 final COMMITTED_ACTIVE, provider has old deadline', () => {
      const { roomState: initialRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const initialDeadline = 31000;
      expect(initialRoom.currentTurnDeadline).toBe(initialDeadline);

      let registry = createRoomPresenceRegistry();
      registry = registerAuthenticatedRoomConnection(initialRoom, registry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });
      registry = registerAuthenticatedRoomConnection(initialRoom, registry, {
        connectionId: 'conn-2',
        playerId: 'p2',
      });
      registry = registerAuthenticatedRoomConnection(initialRoom, registry, {
        connectionId: 'conn-3',
        playerId: 'p3',
      });

      const processedRegistry = createProcessedGameplayActionRegistry();
      const actingPlayerId = initialRoom.match!.round.currentPlayerId;
      const actingPlayer = initialRoom.match!.players[actingPlayerId];
      const cardToPlay = actingPlayer.hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'action-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      const actor: ServerResolvedActor = {
        playerId: actingPlayerId,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        initialRoom,
        envelope,
        processedRegistry,
        actor,
        preparedNextTurn,
        registry,
        2000,
        random
      );

      expect(result.decision).toBe('COMMITTED_ACTIVE');
      if (result.decision !== 'COMMITTED_ACTIVE') return;

      const finalRoom = result.roomState;
      expect(finalRoom.revision).toBe(9);
      expect(finalRoom.currentTurnDeadline).toBe(32000);
      expect(finalRoom.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 32000,
        generation: 9,
      });

      // Provider has old deadline (31000)
      const oldProviderAlarm = 31000;
      const plan = deriveProviderAlarmSyncPlan(finalRoom, oldProviderAlarm);

      expect(plan).toEqual({
        decision: 'SET_ALARM',
        dueAt: 32000,
      });

      // Verify room state is untouched
      expect(finalRoom.revision).toBe(9);
      expect(finalRoom.currentTurnDeadline).toBe(32000);
    });

    it('MANDATORY DIRECT TEST B — same ACTIVE, provider already matches', () => {
      const { roomState: initialRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      let registry = createRoomPresenceRegistry();
      registry = registerAuthenticatedRoomConnection(initialRoom, registry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });
      registry = registerAuthenticatedRoomConnection(initialRoom, registry, {
        connectionId: 'conn-2',
        playerId: 'p2',
      });

      const processedRegistry = createProcessedGameplayActionRegistry();
      const actingPlayerId = initialRoom.match!.round.currentPlayerId;
      const actingPlayer = initialRoom.match!.players[actingPlayerId];
      const cardToPlay = actingPlayer.hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'action-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      const actor: ServerResolvedActor = {
        playerId: actingPlayerId,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        initialRoom,
        envelope,
        processedRegistry,
        actor,
        preparedNextTurn,
        registry,
        2000,
        random
      );

      expect(result.decision).toBe('COMMITTED_ACTIVE');
      if (result.decision !== 'COMMITTED_ACTIVE') return;

      const finalRoom = result.roomState;
      // Provider already has 32000
      const plan = deriveProviderAlarmSyncPlan(finalRoom, 32000);
      expect(plan).toEqual({ decision: 'NO_CHANGE' });
    });

    it('MANDATORY DIRECT TEST C — T-027 final COMMITTED_PAUSED, provider has old alarm', () => {
      const { roomState: initialRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // Zero living connections in presence registry
      const presenceRegistry = createRoomPresenceRegistry();
      const processedRegistry = createProcessedGameplayActionRegistry();

      const actingPlayerId = initialRoom.match!.round.currentPlayerId;
      const actingPlayer = initialRoom.match!.players[actingPlayerId];
      const cardToPlay = actingPlayer.hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'action-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      const actor: ServerResolvedActor = {
        playerId: actingPlayerId,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        initialRoom,
        envelope,
        processedRegistry,
        actor,
        preparedNextTurn,
        presenceRegistry,
        2000,
        random
      );

      expect(result.decision).toBe('COMMITTED_PAUSED');
      if (result.decision !== 'COMMITTED_PAUSED') return;

      const finalRoom = result.roomState;
      expect(finalRoom.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(finalRoom.activeAlarm).toBeNull();
      expect(finalRoom.currentTurnDeadline).toBeNull();

      // Provider still has old 31000 alarm
      const plan = deriveProviderAlarmSyncPlan(finalRoom, 31000);
      expect(plan).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('MANDATORY DIRECT TEST D — same PAUSED final state, provider observation equals T-022 intermediate alarm (proves FINAL state wins)', () => {
      const { roomState: initialRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const presenceRegistry = createRoomPresenceRegistry();
      const processedRegistry = createProcessedGameplayActionRegistry();

      const actingPlayerId = initialRoom.match!.round.currentPlayerId;
      const actingPlayer = initialRoom.match!.players[actingPlayerId];
      const cardToPlay = actingPlayer.hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'action-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      const actor: ServerResolvedActor = {
        playerId: actingPlayerId,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        initialRoom,
        envelope,
        processedRegistry,
        actor,
        preparedNextTurn,
        presenceRegistry,
        2000,
        random
      );

      expect(result.decision).toBe('COMMITTED_PAUSED');
      if (result.decision !== 'COMMITTED_PAUSED') return;

      const finalRoom = result.roomState;
      // Provider observation is hypothetical intermediate 32000
      const plan = deriveProviderAlarmSyncPlan(finalRoom, 32000);
      expect(plan).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('MANDATORY DIRECT TEST E — PAUSED with no provider alarm', () => {
      const { roomState: initialRoom } = setupArmedActiveRoom();
      const pausedRoom: RoomAuthorityState<MatchState> = {
        ...initialRoom,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      const plan = deriveProviderAlarmSyncPlan(pausedRoom, null);
      expect(plan).toEqual({ decision: 'NO_CHANGE' });
    });

    it('MANDATORY DIRECT TEST F — T-026 COMMITTED_FINISHED with stale previous provider alarm', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);

      // 1v1 state where p1 plays Lie -> p2 CALLs -> p1 eliminated by LETHAL -> p2 wins Match
      const customMatch: MatchState = {
        ...initRoom.match!,
        players: {
          p1: {
            id: 'p1',
            lifeStatus: 'ALIVE',
            roundStatus: 'WITH_CARDS',
            hand: [{ id: 'p1-lie', rank: 'KING' }],
            revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
          },
          p2: {
            id: 'p2',
            lifeStatus: 'ALIVE',
            roundStatus: 'WITH_CARDS',
            hand: [{ id: 'p2-c1', rank: 'ACE' }],
            revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
          },
        },
        seatOrder: ['p1', 'p2'],
        round: {
          ...initRoom.match!.round,
          tableRank: 'ACE',
          currentPlayerId: 'p1',
          previousPlay: null,
        },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'conn-2',
        playerId: 'p2',
      });

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      // Execute timeout at 31000
      const result = executeSystemTimeoutWithPresenceLifecycle(
        armedRoom,
        trigger,
        preparedNextTurn,
        presenceRegistry,
        deadlineMs,
        random
      );

      expect(result.decision).toBe('COMMITTED_FINISHED');
      if (result.decision !== 'COMMITTED_FINISHED') return;

      const finalRoom = result.roomState;
      expect(finalRoom.lifecycle).toBe('MATCH_FINISHED');
      expect(finalRoom.activeAlarm).toBeNull();

      // Provider still has old 31000 alarm
      const plan = deriveProviderAlarmSyncPlan(finalRoom, 31000);
      expect(plan).toEqual({ decision: 'DELETE_ALARM' });
    });

    it('MANDATORY DIRECT TEST G — T-025 Resume', () => {
      const { roomState: initialRoom } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const pausedRoom: RoomAuthorityState<MatchState> = {
        ...initialRoom,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        revision: 9,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      const prevPresence = createRoomPresenceRegistry();
      let nextPresence = createRoomPresenceRegistry();
      nextPresence = registerAuthenticatedRoomConnection(pausedRoom, nextPresence, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        prevPresence,
        nextPresence,
        90000
      );

      expect(resumeResult.status).toBe('RESUMED');
      if (resumeResult.status !== 'RESUMED') return;

      const finalRoom = resumeResult.roomState;
      expect(finalRoom.lifecycle).toBe('MATCH_ACTIVE');
      expect(finalRoom.revision).toBe(10);
      expect(finalRoom.currentTurnDeadline).toBe(120000);
      expect(finalRoom.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 120000,
        generation: 10,
      });

      // Provider observed is null
      const plan = deriveProviderAlarmSyncPlan(finalRoom, null);
      expect(plan).toEqual({
        decision: 'SET_ALARM',
        dueAt: 120000,
      });

      // Room revision unchanged by planner
      expect(finalRoom.revision).toBe(10);
    });

    it('MANDATORY DIRECT TEST H — provider drift repair', () => {
      const { roomState } = setupArmedActiveRoom('r1', ['p1', 'p2'], 5, 't-5', 40000);
      // Deadline is 40000 + 30000 = 70000
      expect(roomState.currentTurnDeadline).toBe(70000);

      // Case 1: Provider observed is 60000 (wrong dueAt) -> SET_ALARM 70000
      const plan1 = deriveProviderAlarmSyncPlan(roomState, 60000);
      expect(plan1).toEqual({ decision: 'SET_ALARM', dueAt: 70000 });

      // Case 2: Provider observed is null (missing provider alarm) -> SET_ALARM 70000
      const plan2 = deriveProviderAlarmSyncPlan(roomState, null);
      expect(plan2).toEqual({ decision: 'SET_ALARM', dueAt: 70000 });

      // Case 3: Desired is null (paused room), provider observed is 60000 -> DELETE_ALARM
      const pausedRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const plan3 = deriveProviderAlarmSyncPlan(pausedRoom, 60000);
      expect(plan3).toEqual({ decision: 'DELETE_ALARM' });

      // Drift repair adds zero Room revision
      expect(roomState.revision).toBe(5);
      expect(pausedRoom.revision).toBe(5);
    });

    it('MANDATORY DIRECT TEST I — lifecycle/alarm mismatch', () => {
      const { roomState } = setupArmedActiveRoom();
      const mismatchedRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 31000,
          generation: roomState.revision,
        },
      };

      const plan = deriveProviderAlarmSyncPlan(mismatchedRoom, 31000);
      expect(plan).toEqual({
        decision: 'INVALID_STATE',
        reason: 'INVALID_PAUSED_ALARM_STATE',
      });
    });

    it('MANDATORY DIRECT TEST J — future-compatible LOBBY HOST_GRACE metadata', () => {
      const lobbyState: RoomAuthorityState<MatchState> = {
        roomId: 'room-1',
        lifecycle: 'LOBBY',
        revision: 3,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'HOST_GRACE',
          dueAt: 60000,
          generation: 3,
        },
      };

      const plan = deriveProviderAlarmSyncPlan(lobbyState, null);
      expect(plan).toEqual({
        decision: 'SET_ALARM',
        dueAt: 60000,
      });
    });

    it('MANDATORY DIRECT TEST K — future-compatible FINISHED ROOM_RETENTION metadata', () => {
      const finishedRetentionRoom: RoomAuthorityState<MatchState> = {
        roomId: 'room-1',
        lifecycle: 'MATCH_FINISHED',
        revision: 12,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 86400000,
          generation: 12,
        },
      };

      const plan = deriveProviderAlarmSyncPlan(finishedRetentionRoom, 86400000);
      expect(plan).toEqual({ decision: 'NO_CHANGE' });
    });

    it('MANDATORY DIRECT TEST L — same provider dueAt, changed durable identity', () => {
      const finishedRetentionRoom: RoomAuthorityState<MatchState> = {
        roomId: 'room-1',
        lifecycle: 'MATCH_FINISHED',
        revision: 9,
        members: [{ playerId: 'p1', joinOrder: 1 }],
        hostPlayerId: 'p1',
        match: null,
        currentTurnId: null,
        currentTurnDeadline: null,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 50000,
          generation: 9,
        },
      };

      const plan = deriveProviderAlarmSyncPlan(finishedRetentionRoom, 50000);
      expect(plan).toEqual({ decision: 'NO_CHANGE' });
    });

    it('MANDATORY DIRECT TEST M — invalid provider observation', () => {
      const { roomState } = setupArmedActiveRoom();
      const invalidObservations = [-10, 31000.25, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 10];

      for (const obs of invalidObservations) {
        const plan = deriveProviderAlarmSyncPlan(roomState, obs);
        expect(plan).toEqual({
          decision: 'INVALID_STATE',
          reason: 'INVALID_PROVIDER_OBSERVATION',
        });
      }
    });

    it('MANDATORY DIRECT TEST N — purity / zero revision', () => {
      const { roomState } = setupArmedActiveRoom('r1', ['p1', 'p2'], 7, 't-7', 10000);
      const snapshotBefore = JSON.parse(JSON.stringify(roomState));

      const plan1 = deriveProviderAlarmSyncPlan(roomState, null);
      expect(plan1).toEqual({ decision: 'SET_ALARM', dueAt: 40000 });

      const plan2 = deriveProviderAlarmSyncPlan(roomState, 40000);
      expect(plan2).toEqual({ decision: 'NO_CHANGE' });

      const plan3 = deriveProviderAlarmSyncPlan(roomState, 30000);
      expect(plan3).toEqual({ decision: 'SET_ALARM', dueAt: 40000 });

      const snapshotAfter = JSON.parse(JSON.stringify(roomState));
      expect(snapshotAfter).toEqual(snapshotBefore);
      expect(roomState.revision).toBe(7);
      expect(roomState.currentTurnDeadline).toBe(40000);
      expect(roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 40000,
        generation: 7,
      });
    });
  });

  describe('T-026 Integration Coverage (AC-79..AC-82, AC-141)', () => {
    it('handles T-026 COMMITTED_ACTIVE result', () => {
      const { roomState: initialRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(initialRoom, presenceRegistry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });
      presenceRegistry = registerAuthenticatedRoomConnection(initialRoom, presenceRegistry, {
        connectionId: 'conn-2',
        playerId: 'p2',
      });
      presenceRegistry = registerAuthenticatedRoomConnection(initialRoom, presenceRegistry, {
        connectionId: 'conn-3',
        playerId: 'p3',
      });

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      const result = executeSystemTimeoutWithPresenceLifecycle(
        initialRoom,
        trigger,
        preparedNextTurn,
        presenceRegistry,
        31000,
        random
      );

      expect(result.decision).toBe('COMMITTED_ACTIVE');
      if (result.decision !== 'COMMITTED_ACTIVE') return;

      const finalRoom = result.roomState;
      expect(finalRoom.currentTurnDeadline).toBe(61000);

      // Old provider alarm was 31000
      expect(deriveProviderAlarmSyncPlan(finalRoom, 31000)).toEqual({
        decision: 'SET_ALARM',
        dueAt: 61000,
      });
      // Matching provider alarm
      expect(deriveProviderAlarmSyncPlan(finalRoom, 61000)).toEqual({
        decision: 'NO_CHANGE',
      });
    });

    it('handles T-026 COMMITTED_PAUSED result', () => {
      const { roomState: initialRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // Zero living connections in presence registry
      const presenceRegistry = createRoomPresenceRegistry();

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      };

      const preparedNextTurn: ServerPreparedNextTurn = {
        turnId: 'turn-9',
      };

      const result = executeSystemTimeoutWithPresenceLifecycle(
        initialRoom,
        trigger,
        preparedNextTurn,
        presenceRegistry,
        31000,
        random
      );

      expect(result.decision).toBe('COMMITTED_PAUSED');
      if (result.decision !== 'COMMITTED_PAUSED') return;

      const finalRoom = result.roomState;
      expect(finalRoom.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(finalRoom.activeAlarm).toBeNull();

      // Old provider alarm was 31000 -> DELETE_ALARM
      expect(deriveProviderAlarmSyncPlan(finalRoom, 31000)).toEqual({
        decision: 'DELETE_ALARM',
      });
    });
  });

  describe('Past DueAt Behavior (AC-96..AC-101)', () => {
    it('synchronizes exact authoritative dueAt even if in the past without local clock rewrite (AC-101)', () => {
      // Room state has dueAt 1000 (which is in the past relative to typical real clock)
      const { roomState } = setupArmedActiveRoom('r1', ['p1', 'p2'], 1, 't-1', 1000);
      const plan = deriveProviderAlarmSyncPlan(roomState, null);
      expect(plan).toEqual({
        decision: 'SET_ALARM',
        dueAt: 31000,
      });
    });
  });
});
