import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  createInMemorySqlStorage,
  ROOM_RETENTION_DURATION_MS,
  loadRoomStateSqlite,
} from '../src/index.js';

function createDeterministicRng(): RandomSource {
  let seed = 31415;
  return {
    nextInt(max: number): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return max > 0 ? (seed >>> 0) % max : 0;
    },
  };
}

describe('T-043 Hibernation and Persistence Recovery', () => {
  it('AC-01: RoomCoordinator rehydrates seamlessly from SQLite after simulated DO hibernation', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_hibernate_ac1';
    const rng = createDeterministicRng();

    let time = 1000;

    // --- INSTANCE 1: Pre-hibernation lifecycle ---
    let coord: RoomCoordinator | null = new RoomCoordinator(roomId, sql);
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.onPlayerConnect('c_alice', 'alice', time + 200);
    coord.onPlayerConnect('c_bob', 'bob', time + 200);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 500, rng);

    // Play 1 turn
    const actorId = coord.getRoomState().match!.round.currentPlayerId;
    const actorHand = coord.getRoomState().match!.players[actorId].hand;
    const revBefore = coord.getRoomState().revision;
    const turnId = coord.getRoomState().currentTurnId!;

    coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-pre-hibernate',
          expectedRevision: revBefore,
          turnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      time + 1000,
      rng
    );

    const snapshotBeforeHibernation = coord.getRoomState();
    expect(snapshotBeforeHibernation.revision).toBe(revBefore + 1);
    expect(snapshotBeforeHibernation.lifecycle).toBe('MATCH_ACTIVE');
    expect(snapshotBeforeHibernation.currentTurnDeadline).not.toBeNull();
    expect(snapshotBeforeHibernation.activeAlarm?.kind).toBe('TURN_DEADLINE');

    // --- SIMULATED HIBERNATION / PROCESS EVICTION ---
    // Destroy instance reference; in-memory JS state is evicted
    coord = null;

    // --- INSTANCE 2: Post-hibernation rehydration from SQLite ---
    const rehydrated = new RoomCoordinator(roomId, sql);
    const stateAfter = rehydrated.getRoomState();

    expect(stateAfter.roomId).toBe(snapshotBeforeHibernation.roomId);
    expect(stateAfter.lifecycle).toBe(snapshotBeforeHibernation.lifecycle);
    expect(stateAfter.revision).toBe(snapshotBeforeHibernation.revision);
    expect(stateAfter.currentTurnId).toBe(snapshotBeforeHibernation.currentTurnId);
    expect(stateAfter.currentTurnDeadline).toBe(snapshotBeforeHibernation.currentTurnDeadline);
    expect(stateAfter.activeAlarm).toEqual(snapshotBeforeHibernation.activeAlarm);
    expect(stateAfter.hostPlayerId).toBe('alice');
    expect(stateAfter.members).toHaveLength(2);

    // Verify projection derivation works seamlessly on rehydrated coordinator
    rehydrated.onPlayerConnect('c_alice_reconn', 'alice', time + 2000);
    const projs = rehydrated.getConnectedMemberProjections();
    expect(projs.has('alice')).toBe(true);
    expect(projs.get('alice')?.privateState?.hand).toHaveLength(
      snapshotBeforeHibernation.match!.players['alice'].hand.length
    );
  });

  it('AC-02: Action dedupe records survive coordinator restarts and prevent replay attacks', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_dedupe_restart_ac2';
    const rng = createDeterministicRng();

    let time = 1000;
    let coord: RoomCoordinator | null = new RoomCoordinator(roomId, sql);
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);

    const actorId = coord.getRoomState().match!.round.currentPlayerId;
    const actorHand = coord.getRoomState().match!.players[actorId].hand;
    const actionId = 'action-persisted-dedupe-123';
    const rev = coord.getRoomState().revision;
    const turnId = coord.getRoomState().currentTurnId!;

    // Execute action on Instance 1
    const res1 = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId,
          expectedRevision: rev,
          turnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      time + 500,
      rng
    );
    expect(res1.success).toBe(true);
    const committedRev = coord.getRoomState().revision;

    // Simulate DO eviction
    coord = null;

    // Boot Instance 2 from SQLite
    const coord2 = new RoomCoordinator(roomId, sql);
    expect(coord2.getRoomState().revision).toBe(committedRev);

    // 1. Replay identical actionId on Instance 2 -> Caught as DUPLICATE
    const replayRes = coord2.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId,
          expectedRevision: rev,
          turnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      time + 1000,
      rng
    );
    expect(replayRes.success).toBe(true);
    expect(coord2.getRoomState().revision).toBe(committedRev); // Not incremented!

    // 2. Replay same actionId with conflicting payload on Instance 2 -> ACTION_ID_CONFLICT
    const conflictRes = coord2.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId,
          expectedRevision: rev,
          turnId,
          actionType: 'CALL_LIAR',
          payload: {},
        },
      },
      time + 1100,
      rng
    );
    expect(conflictRes.success).toBe(false);
    expect(conflictRes.error).toBe('ACTION_ID_CONFLICT');
  });

  it('AC-03: Active alarms survive hibernation and fire accurately in rehydrated coordinator', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_alarm_survival_ac3';
    const rng = createDeterministicRng();

    let time = 1000;
    let coord: RoomCoordinator | null = new RoomCoordinator(roomId, sql);
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);

    const activeAlarm = coord.getRoomState().activeAlarm!;
    expect(activeAlarm.kind).toBe('TURN_DEADLINE');
    const dueAt = activeAlarm.dueAt;
    const revBefore = coord.getRoomState().revision;

    // Hibernate DO while alarm is armed
    coord = null;

    // Runtime wakes DO upon alarm due time with connected client
    const alarmWakeupTime = dueAt + 25;
    const wokeCoordinator = new RoomCoordinator(roomId, sql);
    wokeCoordinator.onPlayerConnect('c_alice_wakeup', 'alice', alarmWakeupTime);

    // Coordinator processes alarm
    const alarmResult = wokeCoordinator.onAlarm(alarmWakeupTime, rng);
    expect(alarmResult.decision).toBe('COMMITTED_ACTIVE');
    expect(wokeCoordinator.getRoomState().revision).toBe(revBefore + 1);

    // New alarm is armed for next turn
    expect(wokeCoordinator.getRoomState().activeAlarm?.kind).toBe('TURN_DEADLINE');
    expect(wokeCoordinator.getRoomState().activeAlarm?.dueAt).toBe(alarmWakeupTime + 30000);
  });

  it('AC-04: Match finish, 24h retention alarm survival, and database cleanup', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_retention_ac4';
    const rng = createDeterministicRng();

    let time = 1000;
    let coord: RoomCoordinator | null = new RoomCoordinator(roomId, sql);
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.onPlayerConnect('c_alice', 'alice', time + 150);
    coord.onPlayerConnect('c_bob', 'bob', time + 150);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);

    // Play to match finish
    let actionCount = 0;
    while (coord.getRoomState().lifecycle === 'MATCH_ACTIVE' && actionCount < 60) {
      actionCount++;
      time += 1000;
      const state = coord.getRoomState();
      const currentActor = state.match!.round.currentPlayerId;
      const currentTurnId = state.currentTurnId!;
      const currentRev = state.revision;

      const canChallenge = state.match!.round.previousPlay !== null;
      if (canChallenge) {
        coord.handleClientCommand(
          currentActor,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-retention-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'CALL_LIAR',
              payload: {},
            },
          },
          time,
          rng
        );
      } else {
        const card = state.match!.players[currentActor].hand[0];
        coord.handleClientCommand(
          currentActor,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-retention-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'PLAY_CARDS',
              payload: { cardIds: [card.id] },
            },
          },
          time,
          rng
        );
      }
    }

    expect(coord.getRoomState().lifecycle).toBe('MATCH_FINISHED');
    const finishTime = time;
    const retentionDue = coord.getRoomState().activeAlarm!.dueAt;
    expect(retentionDue).toBe(finishTime + ROOM_RETENTION_DURATION_MS);

    // Hibernate finished room
    coord = null;

    // Wake up early at 24h - 1 minute -> NOT_EXPIRED
    const earlyWakeTime = retentionDue - 60000;
    const earlyCoord = new RoomCoordinator(roomId, sql);
    const earlyRes = earlyCoord.onAlarm(earlyWakeTime, rng);
    expect(earlyRes.decision).toBe('NOT_EXPIRED');

    // Verify room is still present in SQLite
    expect(loadRoomStateSqlite(sql, roomId)).not.toBeNull();

    // Wake up after 24h has elapsed -> ROOM_DELETED
    const lateWakeTime = retentionDue + 1000;
    const lateCoord = new RoomCoordinator(roomId, sql);
    const lateRes = lateCoord.onAlarm(lateWakeTime, rng);
    expect(lateRes.decision).toBe('ROOM_DELETED');

    // Verify room is deleted from SQLite
    expect(loadRoomStateSqlite(sql, roomId)).toBeNull();

    // Fresh coordinator on same roomId now creates fresh initial state (revision 0, LOBBY)
    const freshCoord = new RoomCoordinator(roomId, sql);
    expect(freshCoord.getRoomState().lifecycle).toBe('LOBBY');
    expect(freshCoord.getRoomState().revision).toBe(0);
  });
});
