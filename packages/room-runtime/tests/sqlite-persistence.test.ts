import { describe, it, expect } from 'vitest';
import type { MatchState } from '@liars-telegram-game/game-core';
import {
  createInitialRoomState,
  RoomAuthorityState,
  initRoomSqliteSchema,
  saveRoomStateSqlite,
  loadRoomStateSqlite,
  saveProcessedActionSqlite,
  loadProcessedActionsSqlite,
  isRoomEligibleForRetentionDeletion,
  armRoomRetentionAlarm,
  deleteRoomSqlite,
  createInMemorySqlStorage,
  ROOM_RETENTION_DURATION_MS,
  joinLobbyRoom,
} from '../src/index.js';

describe('T-033 SQLite Durable Object Persistence Layer', () => {
  it('initializes schema successfully (AC-01, AC-02, AC-03)', () => {
    const sql = createInMemorySqlStorage();
    expect(() => initRoomSqliteSchema(sql)).not.toThrow();
  });

  describe('RoomState persistence round-trip (AC-04 through AC-08)', () => {
    it('returns null when loading non-existent room (AC-07)', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      const loaded = loadRoomStateSqlite(sql, 'non_existent_room');
      expect(loaded).toBeNull();
    });

    it('round-trips a LOBBY room with members, host, and no alarm (AC-04, AC-05, AC-07, AC-08)', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      let room = createInitialRoomState('room-lobby');
      room = joinLobbyRoom(room, 'alice');
      room = joinLobbyRoom(room, 'bob');

      saveRoomStateSqlite(sql, room, 1000);
      const loaded = loadRoomStateSqlite(sql, 'room-lobby');

      expect(loaded).not.toBeNull();
      expect(loaded?.roomId).toBe('room-lobby');
      expect(loaded?.lifecycle).toBe('LOBBY');
      expect(loaded?.revision).toBe(2);
      expect(loaded?.hostPlayerId).toBe('alice');
      expect(loaded?.members).toEqual([
        { playerId: 'alice', joinOrder: 1 },
        { playerId: 'bob', joinOrder: 2 },
      ]);
      expect(loaded?.match).toBeNull();
      expect(loaded?.currentTurnId).toBeNull();
      expect(loaded?.currentTurnDeadline).toBeNull();
      expect(loaded?.activeAlarm).toBeNull();
    });

    it('round-trips a LOBBY room with HOST_GRACE alarm (AC-08)', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      const room: RoomAuthorityState = {
        ...createInitialRoomState('room-grace'),
        members: [{ playerId: 'alice', joinOrder: 1 }],
        hostPlayerId: 'alice',
        revision: 3,
        activeAlarm: {
          kind: 'HOST_GRACE',
          dueAt: 65000,
          generation: 3,
        },
      };

      saveRoomStateSqlite(sql, room, 5000);
      const loaded = loadRoomStateSqlite(sql, 'room-grace');

      expect(loaded).not.toBeNull();
      expect(loaded?.activeAlarm).toEqual({
        kind: 'HOST_GRACE',
        dueAt: 65000,
        generation: 3,
      });
    });

    it('round-trips a MATCH_ACTIVE room with match snapshot and TURN_DEADLINE (AC-08)', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      const mockMatch = {
        status: 'IN_PROGRESS',
        seatOrder: ['p1', 'p2'],
        players: {
          p1: { playerId: 'p1', lifeStatus: 'ALIVE', hand: [] },
          p2: { playerId: 'p2', lifeStatus: 'ALIVE', hand: [] },
        },
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'p1',
          previousPlay: null,
        },
        winnerId: null,
      } as unknown as MatchState;

      const room: RoomAuthorityState<MatchState> = {
        roomId: 'room-active',
        lifecycle: 'MATCH_ACTIVE',
        revision: 7,
        members: [
          { playerId: 'p1', joinOrder: 1 },
          { playerId: 'p2', joinOrder: 2 },
        ],
        hostPlayerId: 'p1',
        match: mockMatch,
        currentTurnId: 'turn-4',
        currentTurnDeadline: 40000,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: 40000,
          generation: 7,
        },
      };

      saveRoomStateSqlite(sql, room, 10000);
      const loaded = loadRoomStateSqlite<MatchState>(sql, 'room-active');

      expect(loaded).not.toBeNull();
      expect(loaded?.lifecycle).toBe('MATCH_ACTIVE');
      expect(loaded?.currentTurnId).toBe('turn-4');
      expect(loaded?.currentTurnDeadline).toBe(40000);
      expect(loaded?.match?.status).toBe('IN_PROGRESS');
      expect(loaded?.match?.round.tableRank).toBe('KING');
      expect(loaded?.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 40000,
        generation: 7,
      });
    });

    it('round-trips MATCH_PAUSED_NO_LIVING_CONNECTIONS and ABANDONED rooms (AC-08)', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      const pausedRoom: RoomAuthorityState = {
        ...createInitialRoomState('room-paused'),
        lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
        revision: 8,
        members: [{ playerId: 'p1', joinOrder: 1 }],
      };
      saveRoomStateSqlite(sql, pausedRoom);
      expect(loadRoomStateSqlite(sql, 'room-paused')?.lifecycle).toBe(
        'MATCH_PAUSED_NO_LIVING_CONNECTIONS'
      );

      const abandonedRoom: RoomAuthorityState = {
        ...createInitialRoomState('room-abandoned'),
        lifecycle: 'ABANDONED',
        revision: 12,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: 90000000,
          generation: 12,
        },
      };
      saveRoomStateSqlite(sql, abandonedRoom);
      const loadedAbandoned = loadRoomStateSqlite(sql, 'room-abandoned');
      expect(loadedAbandoned?.lifecycle).toBe('ABANDONED');
      expect(loadedAbandoned?.activeAlarm?.kind).toBe('ROOM_RETENTION');
    });
  });

  describe('Processed actions persistence round-trip (AC-09 through AC-11)', () => {
    it('saves and loads processed action records faithfully (AC-09, AC-10, AC-11)', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      saveProcessedActionSqlite(sql, {
        actorPlayerId: 'alice',
        actionId: 'act-001',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c_king_1', 'c_king_2'] },
        resultingRevision: 2,
      });

      saveProcessedActionSqlite(sql, {
        actorPlayerId: 'bob',
        actionId: 'act-002',
        expectedRevision: 2,
        turnId: 'turn-2',
        actionType: 'CALL_LIAR',
        payload: {},
        resultingRevision: 3,
      });

      const registry = loadProcessedActionsSqlite(sql);
      expect(Object.keys(registry)).toHaveLength(2);

      const act1 = registry['act-001'];
      expect(act1).toBeDefined();
      expect(act1.actorPlayerId).toBe('alice');
      expect(act1.actionType).toBe('PLAY_CARDS');
      expect(act1.payload).toEqual({ cardIds: ['c_king_1', 'c_king_2'] });
      expect(act1.resultingRevision).toBe(2);

      const act2 = registry['act-002'];
      expect(act2).toBeDefined();
      expect(act2.actorPlayerId).toBe('bob');
      expect(act2.actionType).toBe('CALL_LIAR');
      expect(act2.resultingRevision).toBe(3);
    });
  });

  describe('Room Retention (ADR-014, AC-12)', () => {
    it('arms 24-hour ROOM_RETENTION alarm on MATCH_FINISHED room', () => {
      const finished: RoomAuthorityState = {
        ...createInitialRoomState('room-fin'),
        lifecycle: 'MATCH_FINISHED',
        revision: 20,
      };

      const now = 1_000_000;
      const armed = armRoomRetentionAlarm(finished, now);
      expect(armed.activeAlarm).toEqual({
        kind: 'ROOM_RETENTION',
        dueAt: now + ROOM_RETENTION_DURATION_MS,
        generation: 20,
      });
    });

    it('rejects arming retention alarm on active room', () => {
      const active: RoomAuthorityState = {
        ...createInitialRoomState('room-act'),
        lifecycle: 'MATCH_ACTIVE',
      };
      expect(() => armRoomRetentionAlarm(active, 1000)).toThrow(/Cannot arm retention alarm/);
    });

    it('identifies room eligibility for deletion after 24 hours of inactivity (AC-12)', () => {
      const now = 100_000_000;
      const finishedWithAlarm: RoomAuthorityState = {
        ...createInitialRoomState('room-del'),
        lifecycle: 'MATCH_FINISHED',
        revision: 10,
        activeAlarm: {
          kind: 'ROOM_RETENTION',
          dueAt: now,
          generation: 10,
        },
      };

      // Before dueAt -> false
      expect(isRoomEligibleForRetentionDeletion(finishedWithAlarm, now - 1)).toBe(false);
      // At dueAt -> true
      expect(isRoomEligibleForRetentionDeletion(finishedWithAlarm, now)).toBe(true);
      // After dueAt -> true
      expect(isRoomEligibleForRetentionDeletion(finishedWithAlarm, now + 5000)).toBe(true);

      // Active room is never eligible even with past due time
      const activeRoom: RoomAuthorityState = {
        ...finishedWithAlarm,
        lifecycle: 'MATCH_ACTIVE',
      };
      expect(isRoomEligibleForRetentionDeletion(activeRoom, now + 5000)).toBe(false);
    });

    it('deletes room state and actions upon deletion call', () => {
      const sql = createInMemorySqlStorage();
      initRoomSqliteSchema(sql);

      saveRoomStateSqlite(sql, createInitialRoomState('room-to-delete'));
      saveProcessedActionSqlite(sql, {
        actorPlayerId: 'p1',
        actionId: 'act-del',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
        resultingRevision: 1,
      });

      expect(loadRoomStateSqlite(sql, 'room-to-delete')).not.toBeNull();
      expect(Object.keys(loadProcessedActionsSqlite(sql))).toHaveLength(1);

      deleteRoomSqlite(sql, 'room-to-delete');

      expect(loadRoomStateSqlite(sql, 'room-to-delete')).toBeNull();
      expect(Object.keys(loadProcessedActionsSqlite(sql))).toHaveLength(0);
    });
  });
});
