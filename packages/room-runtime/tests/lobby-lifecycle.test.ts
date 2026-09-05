import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  createInitialRoomState,
  RoomAuthorityState,
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
  unregisterAuthenticatedRoomConnection,
  HOST_GRACE_DURATION_MS,
  joinLobbyRoom,
  leaveLobbyRoom,
  handleLobbyHostPresenceChange,
  applyHostGraceTimeout,
  startMatchFromLobby,
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

describe('T-031 Lobby Membership and Host Lifecycle', () => {
  describe('joinLobbyRoom (AC-01 through AC-08)', () => {
    it('successfully joins first player as host with joinOrder 1 and revision 1 (AC-01, AC-06, AC-07, AC-08)', () => {
      const initial = createInitialRoomState('room-1');
      expect(initial.members).toHaveLength(0);
      expect(initial.hostPlayerId).toBeNull();
      expect(initial.revision).toBe(0);

      const state1 = joinLobbyRoom(initial, 'p1');
      expect(state1.members).toHaveLength(1);
      expect(state1.members[0]).toEqual({ playerId: 'p1', joinOrder: 1 });
      expect(state1.hostPlayerId).toBe('p1');
      expect(state1.revision).toBe(1);
    });

    it('subsequent joins preserve original host and increment joinOrder and revision (AC-06, AC-07, AC-08)', () => {
      const state0 = createInitialRoomState('room-1');
      const state1 = joinLobbyRoom(state0, 'p1');
      const state2 = joinLobbyRoom(state1, 'p2');
      const state3 = joinLobbyRoom(state2, 'p3');

      expect(state3.members).toHaveLength(3);
      expect(state3.hostPlayerId).toBe('p1');
      expect(state3.members.map((m) => m.playerId)).toEqual(['p1', 'p2', 'p3']);
      expect(state3.members.map((m) => m.joinOrder)).toEqual([1, 2, 3]);
      expect(state3.revision).toBe(3);
    });

    it('rejects joining if lifecycle is not LOBBY (AC-02)', () => {
      const activeRoom: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
      };
      expect(() => joinLobbyRoom(activeRoom, 'p1')).toThrow(/expected 'LOBBY'/);

      const finishedRoom: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_FINISHED',
      };
      expect(() => joinLobbyRoom(finishedRoom, 'p1')).toThrow(/expected 'LOBBY'/);
    });

    it('rejects empty or whitespace-only playerId (AC-03)', () => {
      const lobby = createInitialRoomState('room-1');
      expect(() => joinLobbyRoom(lobby, '')).toThrow(/Invalid playerId/);
      expect(() => joinLobbyRoom(lobby, '   ')).toThrow(/Invalid playerId/);
      expect(() => joinLobbyRoom(lobby, null as unknown as string)).toThrow(/Invalid playerId/);
    });

    it('enforces maximum 4 members capacity and rejects 5th player (AC-04)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');
      state = joinLobbyRoom(state, 'p3');
      state = joinLobbyRoom(state, 'p4');
      expect(state.members).toHaveLength(4);

      expect(() => joinLobbyRoom(state, 'p5')).toThrow(/maximum 4 players/);
    });

    it('is idempotent for already joined player (AC-05)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');
      const revBefore = state.revision;

      // Re-joining p2 should return existing state reference without incrementing revision
      const sameState = joinLobbyRoom(state, 'p2');
      expect(sameState).toBe(state);
      expect(sameState.members).toHaveLength(2);
      expect(sameState.revision).toBe(revBefore);
    });
  });

  describe('leaveLobbyRoom (AC-09 through AC-15)', () => {
    it('rejects leave when lifecycle is not LOBBY (AC-10)', () => {
      const activeRoom: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        members: [{ playerId: 'p1', joinOrder: 1 }],
      };
      expect(() => leaveLobbyRoom(activeRoom, 'p1')).toThrow(/expected 'LOBBY'/);
    });

    it('rejects leave when player is not a member (AC-11)', () => {
      const lobby = createInitialRoomState('room-1');
      expect(() => leaveLobbyRoom(lobby, 'p_unknown')).toThrow(/not a member/);
    });

    it('removes non-host player, preserves host, and increments revision (AC-12)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');
      state = joinLobbyRoom(state, 'p3');
      expect(state.revision).toBe(3);

      const stateAfterLeave = leaveLobbyRoom(state, 'p2');
      expect(stateAfterLeave.members.map((m) => m.playerId)).toEqual(['p1', 'p3']);
      expect(stateAfterLeave.hostPlayerId).toBe('p1');
      expect(stateAfterLeave.revision).toBe(4);
    });

    it('migrates host to earliest joined remaining player when host departs (AC-13)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1'); // host
      state = joinLobbyRoom(state, 'p2');
      state = joinLobbyRoom(state, 'p3');

      // Host p1 leaves
      const nextState = leaveLobbyRoom(state, 'p1');
      expect(nextState.members.map((m) => m.playerId)).toEqual(['p2', 'p3']);
      expect(nextState.hostPlayerId).toBe('p2'); // p2 was joinOrder 2, p3 was 3
      expect(nextState.revision).toBe(4);
    });

    it('sets hostPlayerId to null when last remaining member leaves (AC-14)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      expect(state.hostPlayerId).toBe('p1');

      const emptyRoom = leaveLobbyRoom(state, 'p1');
      expect(emptyRoom.members).toHaveLength(0);
      expect(emptyRoom.hostPlayerId).toBeNull();
      expect(emptyRoom.revision).toBe(2);
    });

    it('clears active HOST_GRACE alarm if departing player was host (AC-15)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');

      // Disconnect host to trigger HOST_GRACE alarm
      let reg = createRoomPresenceRegistry();
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c2', playerId: 'p2' });
      state = handleLobbyHostPresenceChange(state, reg, 1000);
      expect(state.activeAlarm?.kind).toBe('HOST_GRACE');

      // Host leaves explicitly
      const nextState = leaveLobbyRoom(state, 'p1');
      expect(nextState.activeAlarm).toBeNull();
      expect(nextState.hostPlayerId).toBe('p2');
    });
  });

  describe('handleLobbyHostPresenceChange (AC-16 through AC-19)', () => {
    it('arms single activeAlarm with kind HOST_GRACE for 60s when host disconnects in LOBBY (AC-16, AC-17)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1'); // host
      state = joinLobbyRoom(state, 'p2');

      // Only p2 has an active connection
      let reg = createRoomPresenceRegistry();
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c2', playerId: 'p2' });

      const now = 5000;
      const armed = handleLobbyHostPresenceChange(state, reg, now);
      expect(armed.activeAlarm).toEqual({
        kind: 'HOST_GRACE',
        dueAt: now + HOST_GRACE_DURATION_MS, // 65000
        generation: state.revision,
      });
      // Same-revision timing completion
      expect(armed.revision).toBe(state.revision);
    });

    it('cancels HOST_GRACE alarm when host reconnects before grace expires (AC-18)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');

      let reg = createRoomPresenceRegistry();
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c2', playerId: 'p2' });
      state = handleLobbyHostPresenceChange(state, reg, 1000);
      expect(state.activeAlarm?.kind).toBe('HOST_GRACE');

      // Host p1 reconnects
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c1', playerId: 'p1' });
      const recovered = handleLobbyHostPresenceChange(state, reg, 5000);
      expect(recovered.activeAlarm).toBeNull();
    });

    it('does not arm or clear HOST_GRACE when non-host member connects/disconnects (AC-19)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');

      let reg = createRoomPresenceRegistry();
      // Host p1 is connected, p2 is not
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c1', playerId: 'p1' });
      const afterP2Disc = handleLobbyHostPresenceChange(state, reg, 1000);
      expect(afterP2Disc.activeAlarm).toBeNull();

      // p2 connects
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c2', playerId: 'p2' });
      const afterP2Conn = handleLobbyHostPresenceChange(state, reg, 2000);
      expect(afterP2Conn.activeAlarm).toBeNull();
    });

    it('does not re-arm or change dueAt if HOST_GRACE is already active', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      const reg = createRoomPresenceRegistry();

      const armed1 = handleLobbyHostPresenceChange(state, reg, 1000);
      expect(armed1.activeAlarm?.dueAt).toBe(1000 + HOST_GRACE_DURATION_MS);

      const armed2 = handleLobbyHostPresenceChange(armed1, reg, 10000);
      expect(armed2.activeAlarm?.dueAt).toBe(1000 + HOST_GRACE_DURATION_MS);
    });
  });

  describe('applyHostGraceTimeout (AC-20 through AC-24)', () => {
    it('rejects stale generation or wrong alarm kind (AC-21)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = {
        ...state,
        activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 60000, generation: state.revision },
      };
      const reg = createRoomPresenceRegistry();
      expect(() => applyHostGraceTimeout(state, reg, 70000)).toThrow(/not HOST_GRACE/);

      state = {
        ...state,
        activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: state.revision + 1 },
      };
      expect(() => applyHostGraceTimeout(state, reg, 70000)).toThrow(/Stale host grace alarm/);
    });

    it('rejects if alarm is not yet due (AC-21)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = {
        ...state,
        activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: state.revision },
      };
      const reg = createRoomPresenceRegistry();
      expect(() => applyHostGraceTimeout(state, reg, 59999)).toThrow(/not yet due/);
    });

    it('migrates host to earliest joined connected member, clears alarm, and increments revision (AC-22, AC-24)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1'); // host (joinOrder 1)
      state = joinLobbyRoom(state, 'p2'); // joinOrder 2
      state = joinLobbyRoom(state, 'p3'); // joinOrder 3

      // Arm grace at revision 3
      state = {
        ...state,
        activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: 3 },
      };

      // Connected: p2 and p3 (p1 disconnected)
      let reg = createRoomPresenceRegistry();
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c2', playerId: 'p2' });
      reg = registerAuthenticatedRoomConnection(state, reg, { connectionId: 'c3', playerId: 'p3' });

      const resolved = applyHostGraceTimeout(state, reg, 60000);
      expect(resolved.hostPlayerId).toBe('p2');
      expect(resolved.activeAlarm).toBeNull();
      expect(resolved.revision).toBe(4);
    });

    it('sets hostPlayerId to null if no members are currently connected (AC-23)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');

      state = {
        ...state,
        activeAlarm: { kind: 'HOST_GRACE', dueAt: 60000, generation: state.revision },
      };

      const reg = createRoomPresenceRegistry(); // 0 connected
      const resolved = applyHostGraceTimeout(state, reg, 60000);
      expect(resolved.hostPlayerId).toBeNull();
      expect(resolved.activeAlarm).toBeNull();
      expect(resolved.revision).toBe(state.revision + 1);

      // When p2 reconnects, handleLobbyHostPresenceChange recomputes host
      let reconnectedReg = registerAuthenticatedRoomConnection(resolved, reg, {
        connectionId: 'c2',
        playerId: 'p2',
      });
      const recomputed = handleLobbyHostPresenceChange(resolved, reconnectedReg, 65000);
      expect(recomputed.hostPlayerId).toBe('p2');
    });
  });

  describe('startMatchFromLobby (AC-25 through AC-30)', () => {
    it('rejects starting match if caller is not host (AC-26)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');
      const rng = createMockRandom([0]);

      expect(() => startMatchFromLobby(state, 'p2', rng, 1000)).toThrow(/not the room host/);
    });

    it('rejects starting match if lifecycle is not LOBBY (AC-27)', () => {
      const activeRoom: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        hostPlayerId: 'p1',
        members: [
          { playerId: 'p1', joinOrder: 1 },
          { playerId: 'p2', joinOrder: 2 },
        ],
      };
      const rng = createMockRandom([0]);
      expect(() => startMatchFromLobby(activeRoom, 'p1', rng, 1000)).toThrow(/expected 'LOBBY'/);
    });

    it('rejects starting match if player count is not 2..4 (AC-28)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1'); // only 1 player
      const rng = createMockRandom([0]);

      expect(() => startMatchFromLobby(state, 'p1', rng, 1000)).toThrow(/between 2 and 4/);
    });

    it('successfully starts match with 2 players, transitions to MATCH_ACTIVE, and arms 30s deadline (AC-25, AC-29, AC-30)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');
      expect(state.revision).toBe(2);

      const rng = createMockRandom([0]);
      const now = 10000;
      const matchRoom = startMatchFromLobby(state, 'p1', rng, now, 'turn-1');

      expect(matchRoom.lifecycle).toBe('MATCH_ACTIVE');
      expect(matchRoom.revision).toBe(3);
      expect(matchRoom.match).not.toBeNull();
      expect(matchRoom.match?.status).toBe('IN_PROGRESS');
      expect(matchRoom.currentTurnId).toBe('turn-1');
      expect(matchRoom.currentTurnDeadline).toBe(now + 30_000); // 40000
      expect(matchRoom.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 40000,
        generation: 3,
      });
    });

    it('successfully starts match with 4 players (AC-28, AC-29)', () => {
      let state = createInitialRoomState('room-1');
      state = joinLobbyRoom(state, 'p1');
      state = joinLobbyRoom(state, 'p2');
      state = joinLobbyRoom(state, 'p3');
      state = joinLobbyRoom(state, 'p4');

      const rng = createMockRandom([0]);
      const matchRoom = startMatchFromLobby(state, 'p1', rng, 5000);

      expect(matchRoom.lifecycle).toBe('MATCH_ACTIVE');
      expect(matchRoom.match?.players['p1']).toBeDefined();
      expect(matchRoom.match?.players['p4']).toBeDefined();
      expect(matchRoom.currentTurnDeadline).toBe(35000);
      expect(matchRoom.activeAlarm?.kind).toBe('TURN_DEADLINE');
    });
  });
});
