import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  createInMemorySqlStorage,
  executeSystemTimeoutWithPresenceLifecycle,
  type RoomAuthorityState,
} from '../src/index.js';

function createDeterministicRng(): RandomSource {
  let seed = 777;
  return {
    nextInt(max: number): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return max > 0 ? (seed >>> 0) % max : 0;
    },
  };
}

describe('T-042 Alarm and Concurrency Race Hardening', () => {
  it('AC-01: Stale and premature alarm triggers are safely dropped without state mutation', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_stale_alarm_ac1', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);

    const activeAlarm = coord.getRoomState().activeAlarm!;
    expect(activeAlarm.kind).toBe('TURN_DEADLINE');
    const dueAt = activeAlarm.dueAt;
    const revBefore = coord.getRoomState().revision;

    // 1. Premature alarm: fires before due time (dueAt - 5000)
    const prematureResult = coord.onAlarm(dueAt - 5000, rng);
    expect(prematureResult.decision).toBe('NOT_DUE');
    expect(coord.getRoomState().revision).toBe(revBefore);
    expect(coord.getRoomState().activeAlarm?.dueAt).toBe(dueAt);

    // 2. Client plays before deadline (time = dueAt - 10000)
    const actorId = coord.getRoomState().match!.round.currentPlayerId;
    const actorHand = coord.getRoomState().match!.players[actorId].hand;
    const playRes = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-premature-race',
          expectedRevision: revBefore,
          turnId: coord.getRoomState().currentTurnId!,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      dueAt - 10000,
      rng
    );
    expect(playRes.success).toBe(true);
    expect(coord.getRoomState().revision).toBe(revBefore + 1);

    const newAlarm = coord.getRoomState().activeAlarm!;
    expect(newAlarm.generation).toBeGreaterThan(activeAlarm.generation);
    expect(newAlarm.dueAt).toBeGreaterThan(dueAt);

    // 3. Stale provider alarm with OLD trigger metadata fires at original dueAt
    // Directly invoking timeout primitive with old generation to simulate stale provider delivery
    const staleTrigger = {
      kind: 'TURN_DEADLINE' as const,
      dueAt: activeAlarm.dueAt,
      generation: activeAlarm.generation, // Old generation!
    };
    const staleRes = executeSystemTimeoutWithPresenceLifecycle(
      coord.getRoomState() as RoomAuthorityState<any>,
      staleTrigger,
      { turnId: 'turn-stale-attempt' },
      coord.getPresenceRegistry(),
      dueAt + 100,
      rng
    );
    expect(staleRes.decision).toBe('STALE_ALARM');

    // Room coordinator onAlarm with current time < newAlarm.dueAt
    const droppedOnAlarm = coord.onAlarm(dueAt + 100, rng);
    expect(droppedOnAlarm.decision).toBe('NOT_DUE');

    // 4. Paused room alarm: disconnect all -> activeAlarm is null -> onAlarm returns NO_ALARM
    coord.onPlayerDisconnect('c_alice', 'alice', dueAt + 200);
    coord.onPlayerDisconnect('c_bob', 'bob', dueAt + 300);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(coord.getRoomState().activeAlarm).toBeNull();

    const pausedAlarm = coord.onAlarm(dueAt + 1000, rng);
    expect(pausedAlarm.decision).toBe('NO_ALARM');
  });

  it('AC-02: Duplicate alarm deliveries are idempotent and do not advance state twice', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_dup_alarm_ac2', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);

    const dueAt = coord.getRoomState().activeAlarm!.dueAt;
    const revBefore = coord.getRoomState().revision;

    // First alarm delivery at dueAt + 50
    const alarm1 = coord.onAlarm(dueAt + 50, rng);
    expect(alarm1.decision).toBe('COMMITTED_ACTIVE');
    expect(coord.getRoomState().revision).toBe(revBefore + 1);

    const revAfterFirst = coord.getRoomState().revision;
    const newDueAt = coord.getRoomState().activeAlarm!.dueAt;

    // Duplicate/retry alarm delivery at same or near time (dueAt + 55)
    const alarm2 = coord.onAlarm(dueAt + 55, rng);
    // Since state moved to next turn, newDueAt is ~30s in the future:
    expect(alarm2.decision).toBe('NOT_DUE');
    expect(coord.getRoomState().revision).toBe(revAfterFirst); // Unchanged!
  });

  it('AC-03: Client action arriving concurrently with deadline expiration is cleanly arbitrated', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_race_ac3', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);

    const activeState = coord.getRoomState();
    const actorId = activeState.match!.round.currentPlayerId;
    const actorHand = activeState.match!.players[actorId].hand;
    const deadline = activeState.currentTurnDeadline!;
    const turnId = activeState.currentTurnId!;
    const rev = activeState.revision;

    // Sub-case A: Client action arrives strictly at deadline (time = deadline)
    // Server deadline is authoritative; late command must be rejected as DEADLINE_DUE
    const lateAction = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-late-race',
          expectedRevision: rev,
          turnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      deadline, // Exactly at deadline
      rng
    );
    expect(lateAction.success).toBe(false);
    expect(lateAction.error).toBe('DEADLINE_DUE');

    // Sub-case B: Timeout alarm fires and commits cleanly
    const timeoutResult = coord.onAlarm(deadline + 10, rng);
    expect(timeoutResult.decision).toBe('COMMITTED_ACTIVE');
    expect(coord.getRoomState().revision).toBe(rev + 1);

    // Sub-case C: Retried client action arrives after timeout committed
    const postTimeoutAction = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-late-race',
          expectedRevision: rev, // Stale revision
          turnId, // Stale turn
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      deadline + 20,
      rng
    );
    expect(postTimeoutAction.success).toBe(false);
    expect(postTimeoutAction.error).toContain('STALE_REVISION');
  });

  it('AC-04: Concurrent/duplicate and out-of-order action envelopes maintain revision idempotency', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_idempotency_ac4', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);

    const state = coord.getRoomState();
    const actorId = state.match!.round.currentPlayerId;
    const actorHand = state.match!.players[actorId].hand;
    const rev = state.revision;
    const turnId = state.currentTurnId!;

    // 1. Initial valid action
    const action1 = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'action-unique-1',
          expectedRevision: rev,
          turnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      time + 1000,
      rng
    );
    expect(action1.success).toBe(true);
    const revAfterPlay = coord.getRoomState().revision;
    expect(revAfterPlay).toBe(rev + 1);

    // 2. Exact duplicate of action-unique-1 sent again (e.g. network retry)
    const duplicateAction = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'action-unique-1',
          expectedRevision: rev,
          turnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [actorHand[0].id] },
        },
      },
      time + 1500,
      rng
    );
    expect(duplicateAction.success).toBe(true);
    // Revision did NOT advance; duplicate was safely caught by idempotency registry
    expect(coord.getRoomState().revision).toBe(revAfterPlay);

    // 3. Action with same actionId but different payload/type -> ACTION_ID_CONFLICT
    const conflictingAction = coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'action-unique-1', // Same ID
          expectedRevision: rev,
          turnId,
          actionType: 'CALL_LIAR', // Conflicting action type!
          payload: {},
        },
      },
      time + 1600,
      rng
    );
    expect(conflictingAction.success).toBe(false);
    expect(conflictingAction.error).toBe('ACTION_ID_CONFLICT');

    // 4. Out-of-order action with stale expectedRevision
    const nextActorId = coord.getRoomState().match!.round.currentPlayerId;
    const staleRevAction = coord.handleClientCommand(
      nextActorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'action-stale-rev',
          expectedRevision: rev, // Expected rev is rev, but room is rev + 1
          turnId: coord.getRoomState().currentTurnId!,
          actionType: 'CALL_LIAR',
          payload: {},
        },
      },
      time + 2000,
      rng
    );
    expect(staleRevAction.success).toBe(false);
    expect(staleRevAction.error).toBe('STALE_REVISION');
  });
});
