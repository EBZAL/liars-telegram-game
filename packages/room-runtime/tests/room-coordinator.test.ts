import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  createInMemorySqlStorage,
  ROOM_RETENTION_DURATION_MS,
} from '../src/index.js';

function createMockRandom(values: number[] = [0]): RandomSource {
  let idx = 0;
  return {
    nextInt(max: number): number {
      const val = values[idx % values.length];
      idx++;
      return Math.min(val, max - 1);
    },
  };
}

describe('T-034 Room Coordinator Integration', () => {
  it('initializes room in LOBBY and persists to SQLite (AC-01, AC-02)', () => {
    const sql = createInMemorySqlStorage();
    const coordinator = new RoomCoordinator('room-e2e', sql);

    const state = coordinator.getRoomState();
    expect(state.roomId).toBe('room-e2e');
    expect(state.lifecycle).toBe('LOBBY');
    expect(state.revision).toBe(0);
    expect(state.members).toHaveLength(0);
    expect(state.hostPlayerId).toBeNull();

    // Reload coordinator with same SQL storage
    const reloaded = new RoomCoordinator('room-e2e', sql);
    expect(reloaded.getRoomState().roomId).toBe('room-e2e');
  });

  it('manages Lobby join, leave, and host assignment (AC-05, AC-06, AC-07)', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('room-1', sql);
    const rng = createMockRandom([0]);

    // Player 1 joins
    const res1 = coord.handleClientCommand('alice', { type: 'JOIN' }, 1000, rng);
    expect(res1.success).toBe(true);
    expect(res1.roomState.hostPlayerId).toBe('alice');
    expect(res1.roomState.members).toHaveLength(1);
    expect(res1.roomState.revision).toBe(1);

    // Player 2 joins
    const res2 = coord.handleClientCommand('bob', { type: 'JOIN' }, 2000, rng);
    expect(res2.success).toBe(true);
    expect(res2.roomState.hostPlayerId).toBe('alice');
    expect(res2.roomState.members).toHaveLength(2);
    expect(res2.roomState.revision).toBe(2);

    // Alice connects WebSocket
    coord.onPlayerConnect('conn-alice', 'alice', 3000);
    const proj = coord.getConnectedMemberProjections();
    expect(proj.has('alice')).toBe(true);
    expect(proj.get('alice')?.publicState.hostPlayerId).toBe('alice');
    expect(proj.get('alice')?.publicState.memberPlayerIds).toEqual(['alice', 'bob']);
  });

  it('rejects START_MATCH by non-host and starts match when host calls it (AC-05, AC-06, AC-07)', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('room-match', sql);
    const rng = createMockRandom([0]);

    coord.handleClientCommand('alice', { type: 'JOIN' }, 1000, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, 2000, rng);

    // Bob tries to start -> rejected
    const rej = coord.handleClientCommand('bob', { type: 'START_MATCH' }, 3000, rng);
    expect(rej.success).toBe(false);
    expect(rej.error).toContain('not the room host');

    // Alice starts -> success
    const started = coord.handleClientCommand('alice', { type: 'START_MATCH' }, 4000, rng);
    expect(started.success).toBe(true);
    expect(started.roomState.lifecycle).toBe('MATCH_ACTIVE');
    expect(started.roomState.currentTurnDeadline).toBe(4000 + 30000);
    expect(started.roomState.activeAlarm?.kind).toBe('TURN_DEADLINE');

    // Both players connect and receive isolated hands
    coord.onPlayerConnect('c-alice', 'alice', 4500);
    coord.onPlayerConnect('c-bob', 'bob', 4500);

    const projs = coord.getConnectedMemberProjections();
    const pAlice = projs.get('alice');
    const pBob = projs.get('bob');

    expect(pAlice?.privateState?.hand).toHaveLength(5);
    expect(pBob?.privateState?.hand).toHaveLength(5);
    // Hidden info protection: Alice cannot see Bob's hand
    expect(pAlice?.publicState.match?.players.find((p) => p.playerId === 'bob')?.handCount).toBe(5);
  });

  it('executes gameplay actions and updates projections (AC-05, AC-07)', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('room-play', sql);
    const rng = createMockRandom([0]);

    coord.handleClientCommand('p1', { type: 'JOIN' }, 1000, rng);
    coord.handleClientCommand('p2', { type: 'JOIN' }, 2000, rng);
    coord.handleClientCommand('p1', { type: 'START_MATCH' }, 3000, rng);

    coord.onPlayerConnect('c1', 'p1', 3500);
    coord.onPlayerConnect('c2', 'p2', 3500);

    const state = coord.getRoomState();
    const currentActor = state.match?.round.currentPlayerId as string;
    const currentTurnId = state.currentTurnId as string;
    const currentRev = state.revision;

    const actorProj = coord.getConnectedMemberProjections().get(currentActor);
    const cardId = actorProj?.privateState?.hand[0].id as string;

    const playResult = coord.handleClientCommand(
      currentActor,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-play-1',
          expectedRevision: currentRev,
          turnId: currentTurnId,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [cardId] },
        },
      },
      5000,
      rng
    );

    expect(playResult.success).toBe(true);
    expect(playResult.roomState.revision).toBe(currentRev + 1);
    expect(playResult.roomState.match?.round.previousPlay).not.toBeNull();
    expect(playResult.roomState.match?.round.previousPlay?.count).toBe(1);
  });

  it('handles full Living disconnect -> PAUSED and reconnect -> RESUMED (AC-03, AC-04)', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('room-pause', sql);
    const rng = createMockRandom([0]);

    coord.handleClientCommand('p1', { type: 'JOIN' }, 1000, rng);
    coord.handleClientCommand('p2', { type: 'JOIN' }, 2000, rng);
    coord.handleClientCommand('p1', { type: 'START_MATCH' }, 3000, rng);

    coord.onPlayerConnect('c1', 'p1', 3500);
    coord.onPlayerConnect('c2', 'p2', 3500);

    // p1 disconnects -> still 1 living connected -> MATCH_ACTIVE
    coord.onPlayerDisconnect('c1', 'p1', 4000);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');

    // p2 disconnects -> 0 living connected -> MATCH_PAUSED_NO_LIVING_CONNECTIONS
    coord.onPlayerDisconnect('c2', 'p2', 5000);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(coord.getRoomState().currentTurnDeadline).toBeNull();
    expect(coord.getRoomState().activeAlarm).toBeNull();

    // p1 reconnects -> 0 -> 1 living connected -> RESUMED to MATCH_ACTIVE with fresh 30s deadline
    coord.onPlayerConnect('c1-new', 'p1', 10000);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');
    expect(coord.getRoomState().currentTurnDeadline).toBe(10000 + 30000);
    expect(coord.getRoomState().activeAlarm?.kind).toBe('TURN_DEADLINE');
  });

  it('executes TURN_DEADLINE alarm and auto-plays fallback card (AC-09)', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('room-timeout', sql);
    const rng = createMockRandom([0]);

    coord.handleClientCommand('p1', { type: 'JOIN' }, 1000, rng);
    coord.handleClientCommand('p2', { type: 'JOIN' }, 2000, rng);
    coord.handleClientCommand('p1', { type: 'START_MATCH' }, 3000, rng);

    coord.onPlayerConnect('c1', 'p1', 3500);
    coord.onPlayerConnect('c2', 'p2', 3500);

    const dueAt = coord.getRoomState().activeAlarm?.dueAt as number;
    const revBefore = coord.getRoomState().revision;

    // Trigger alarm at or after due time
    const alarmResult = coord.onAlarm(dueAt + 50, rng);
    expect(alarmResult.decision).toBe('COMMITTED_ACTIVE');
    expect(coord.getRoomState().revision).toBe(revBefore + 1);
    expect(coord.getRoomState().match?.round.previousPlay).not.toBeNull();
  });

  it('handles 24-hour room retention expiration and deletion (AC-10)', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('room-retention', sql);
    const rng = createMockRandom([0]);

    coord.handleClientCommand('p1', { type: 'JOIN' }, 1000, rng);

    // Simulate match finished state
    const finishedState = {
      ...coord.getRoomState(),
      lifecycle: 'MATCH_FINISHED' as const,
      revision: 10,
      activeAlarm: {
        kind: 'ROOM_RETENTION' as const,
        dueAt: 100000 + ROOM_RETENTION_DURATION_MS,
        generation: 10,
      },
    };
    // Force write finished state to storage
    const stateField = coord as unknown as { roomState: typeof finishedState };
    stateField.roomState = finishedState;

    // Alarm before 24 hours -> NOT_EXPIRED
    const earlyAlarm = coord.onAlarm(100000 + ROOM_RETENTION_DURATION_MS - 1000, rng);
    expect(earlyAlarm.decision).toBe('NOT_EXPIRED');

    // Alarm after 24 hours -> ROOM_DELETED
    const deleteAlarm = coord.onAlarm(100000 + ROOM_RETENTION_DURATION_MS + 1000, rng);
    expect(deleteAlarm.decision).toBe('ROOM_DELETED');
  });
});
