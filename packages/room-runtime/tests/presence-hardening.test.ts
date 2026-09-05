import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  createInMemorySqlStorage,
  evaluateRoomPresence,
  type RecipientRoomProjection,
} from '../src/index.js';

function createDeterministicRng(): RandomSource {
  let seed = 42;
  return {
    nextInt(max: number): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return max > 0 ? (seed >>> 0) % max : 0;
    },
  };
}

describe('T-041 Presence, Pause, and Resume Hardening', () => {
  it('AC-01: Disconnecting all living players transitions to MATCH_PAUSED_NO_LIVING_CONNECTIONS and cancels TURN_DEADLINE alarm', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_pause_ac1', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);

    time += 500;
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time, rng);

    const activeState = coord.getRoomState();
    expect(activeState.lifecycle).toBe('MATCH_ACTIVE');
    expect(activeState.currentTurnDeadline).toBe(time + 30000);
    expect(activeState.activeAlarm?.kind).toBe('TURN_DEADLINE');
    const expectedTurnId = activeState.currentTurnId;
    const expectedTableRank = activeState.match?.round.tableRank;

    // Disconnect Alice (1 living remains connected: Bob)
    time += 1000;
    coord.onPlayerDisconnect('c_alice', 'alice', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');
    expect(coord.getRoomState().activeAlarm?.kind).toBe('TURN_DEADLINE');

    // Disconnect Bob (0 living remaining connected) -> Pause
    time += 2000;
    coord.onPlayerDisconnect('c_bob', 'bob', time);
    const pausedState = coord.getRoomState();

    expect(pausedState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(pausedState.currentTurnDeadline).toBeNull();
    expect(pausedState.activeAlarm).toBeNull();

    // Game state remains completely preserved
    expect(pausedState.currentTurnId).toBe(expectedTurnId);
    expect(pausedState.match?.round.tableRank).toBe(expectedTableRank);
    expect(pausedState.match?.players['alice'].hand).toHaveLength(5);
    expect(pausedState.match?.players['bob'].hand).toHaveLength(5);
  });

  it('AC-02: Eliminated spectator presence does not prevent pause or trigger resume', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_spectator_ac2', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    const playerIds = ['alice', 'bob', 'charlie', 'dave'];
    for (const pid of playerIds) {
      coord.handleClientCommand(pid, { type: 'JOIN' }, time, rng);
      coord.onPlayerConnect(`c_${pid}`, pid, time);
      time += 100;
    }

    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time, rng);

    // Play until at least one player is eliminated while >= 2 living players remain
    let actionCount = 0;
    let eliminatedId: string | null = null;

    while (coord.getRoomState().lifecycle === 'MATCH_ACTIVE' && actionCount < 60) {
      const match = coord.getRoomState().match!;
      const livingPlayers = Object.values(match.players).filter((p) => p.lifeStatus === 'ALIVE');
      const eliminated = Object.values(match.players).filter((p) => p.lifeStatus === 'ELIMINATED');

      if (eliminated.length > 0 && livingPlayers.length >= 2) {
        eliminatedId = eliminated[0].id;
        break;
      }

      actionCount++;
      time += 1000;
      const currentActor = match.round.currentPlayerId;
      const currentRev = coord.getRoomState().revision;
      const currentTurnId = coord.getRoomState().currentTurnId!;

      const canChallenge = match.round.previousPlay !== null;
      if (canChallenge) {
        coord.handleClientCommand(
          currentActor,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-spec-${actionCount}`,
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
        const card = match.players[currentActor].hand[0];
        coord.handleClientCommand(
          currentActor,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-spec-${actionCount}`,
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

    expect(eliminatedId).not.toBeNull();
    const spectatorId = eliminatedId!;
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');
    expect(coord.getRoomState().match?.players[spectatorId].lifeStatus).toBe('ELIMINATED');

    // Spectator is still connected! Projections verify spectator projection
    const projs = coord.getConnectedMemberProjections();
    const specProj = projs.get(spectatorId);
    expect(specProj?.privateState).toBeNull();
    expect(
      specProj?.publicState.match?.players.find((p) => p.playerId === spectatorId)?.lifeStatus
    ).toBe('ELIMINATED');

    // Disconnect all remaining living players
    const livingIds = Object.values(coord.getRoomState().match!.players)
      .filter((p) => p.lifeStatus === 'ALIVE')
      .map((p) => p.id);

    for (const lid of livingIds) {
      time += 500;
      coord.onPlayerDisconnect(`c_${lid}`, lid, time);
    }

    // Even though spectator is actively connected, match MUST pause!
    const pausedState = coord.getRoomState();
    expect(pausedState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(pausedState.currentTurnDeadline).toBeNull();
    expect(pausedState.activeAlarm).toBeNull();

    // Spectator disconnects and reconnects while match is paused
    time += 5000;
    coord.onPlayerDisconnect(`c_${spectatorId}`, spectatorId, time);
    time += 2000;
    coord.onPlayerConnect(`c_${spectatorId}_new`, spectatorId, time);

    // Match MUST NOT resume on eliminated spectator reconnect!
    expect(coord.getRoomState().lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(coord.getRoomState().currentTurnDeadline).toBeNull();

    // Spectator attempts to submit an action while paused
    const specAction = coord.handleClientCommand(
      spectatorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-spec-illegal',
          expectedRevision: coord.getRoomState().revision,
          turnId: coord.getRoomState().currentTurnId!,
          actionType: 'CALL_LIAR',
          payload: {},
        },
      },
      time + 100,
      rng
    );
    expect(specAction.success).toBe(false);
  });

  it('AC-03: First living player reconnection resumes with fresh 30s deadline; subsequent connections do not reset deadline', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_resume_ac3', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);

    // Disconnect both players -> Pause
    time += 5000;
    coord.onPlayerDisconnect('c_alice', 'alice', time);
    time += 1000;
    coord.onPlayerDisconnect('c_bob', 'bob', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');

    // Alice reconnects at time = 50000 -> RESUME with fresh 30s deadline
    const resumeTime = 50000;
    coord.onPlayerConnect('c_alice_new', 'alice', resumeTime);

    const resumedState = coord.getRoomState();
    expect(resumedState.lifecycle).toBe('MATCH_ACTIVE');
    const expectedDeadline = resumeTime + 30000; // 80000
    expect(resumedState.currentTurnDeadline).toBe(expectedDeadline);
    expect(resumedState.activeAlarm?.dueAt).toBe(expectedDeadline);

    // Bob reconnects 10 seconds later at time = 60000 -> Deadline must NOT be extended or reset
    const bobConnectTime = 60000;
    coord.onPlayerConnect('c_bob_new', 'bob', bobConnectTime);

    const stateAfterBob = coord.getRoomState();
    expect(stateAfterBob.lifecycle).toBe('MATCH_ACTIVE');
    expect(stateAfterBob.currentTurnDeadline).toBe(expectedDeadline); // Still 80000, NOT 90000
    expect(stateAfterBob.activeAlarm?.dueAt).toBe(expectedDeadline);
  });

  it('AC-04: Multi-tab/multi-socket connections from same player identity deduplicate properly', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_multitab_ac4', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);

    // Alice connects with 2 tabs simultaneously in Lobby
    coord.onPlayerConnect('c_alice_tab1', 'alice', time);
    coord.onPlayerConnect('c_alice_tab2', 'alice', time);
    coord.onPlayerConnect('c_bob_tab1', 'bob', time);

    // In Lobby, connectedMemberPlayerIds is 2 (alice and bob)
    const lobbyPresence = evaluateRoomPresence(coord.getRoomState(), coord.getPresenceRegistry());
    expect(lobbyPresence.connectedMemberPlayerIds).toHaveLength(2);
    expect(lobbyPresence.connectedMemberPlayerIds).toEqual(expect.arrayContaining(['alice', 'bob']));

    // Start match
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');

    // In Match, connectedLivingPlayers must be 2, not 3!
    const matchPresence = evaluateRoomPresence(coord.getRoomState(), coord.getPresenceRegistry());
    expect(matchPresence.connectedLivingPlayers).toBe(2);
    expect(matchPresence.connectedLivingPlayerIds).toEqual(expect.arrayContaining(['alice', 'bob']));

    // Bob disconnects -> Alice is still connected via 2 tabs -> Match stays active
    time += 2000;
    coord.onPlayerDisconnect('c_bob_tab1', 'bob', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');

    // Alice closes tab 1 -> Alice still has tab 2 open -> Match stays active!
    time += 3000;
    coord.onPlayerDisconnect('c_alice_tab1', 'alice', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');

    // Alice closes tab 2 -> Now living count is 0 -> Match transitions to PAUSED
    time += 4000;
    coord.onPlayerDisconnect('c_alice_tab2', 'alice', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(coord.getRoomState().currentTurnDeadline).toBeNull();

    // Alice re-opens tab 1 at time = 80000 -> Match resumes with deadline 110000
    time = 80000;
    coord.onPlayerConnect('c_alice_tab1_v2', 'alice', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');
    expect(coord.getRoomState().currentTurnDeadline).toBe(110000);

    // Alice opens tab 2 at time = 85000 -> Deadline must NOT be overwritten
    time = 85000;
    coord.onPlayerConnect('c_alice_tab2_v2', 'alice', time);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');
    expect(coord.getRoomState().currentTurnDeadline).toBe(110000);
  });

  it('AC-05: Repeated pause-resume cycles preserve game invariants and revision monotonicity', () => {
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator('r_cycle_ac5', sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 100, rng);

    // Cycle through 3 pause and resume sequences
    for (let cycle = 1; cycle <= 3; cycle++) {
      const revBeforePause = coord.getRoomState().revision;

      // Disconnect all
      time += 5000;
      coord.onPlayerDisconnect('c_alice', 'alice', time);
      coord.onPlayerDisconnect('c_bob', 'bob', time);

      expect(coord.getRoomState().lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(coord.getRoomState().revision).toBeGreaterThan(revBeforePause);

      const revBeforeResume = coord.getRoomState().revision;

      // Reconnect
      time += 10000;
      coord.onPlayerConnect('c_alice', 'alice', time);
      expect(coord.getRoomState().lifecycle).toBe('MATCH_ACTIVE');
      expect(coord.getRoomState().revision).toBeGreaterThan(revBeforeResume);
      expect(coord.getRoomState().currentTurnDeadline).toBe(time + 30000);

      coord.onPlayerConnect('c_bob', 'bob', time + 100);
    }

    // Both players still have valid hands and turn continues
    const finalState = coord.getRoomState();
    expect(finalState.match?.players['alice'].hand).toHaveLength(5);
    expect(finalState.match?.players['bob'].hand).toHaveLength(5);
    expect(finalState.match?.status).toBe('IN_PROGRESS');
  });
});
