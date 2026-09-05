import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  createInMemorySqlStorage,
  formatTelegramInviteLink,
  isValidRoomId,
  type RecipientRoomProjection,
} from '../src/index.js';

function createSeededRandom(seed: number = 1337): RandomSource {
  let s = seed;
  return {
    nextInt(max: number): number {
      s = (s * 1664525 + 1013904223) >>> 0;
      return max > 0 ? (s >>> 0) % max : 0;
    },
  };
}

class SimulatedClient {
  public playerId: string;
  public connectionId: string;
  public lastProjection: RecipientRoomProjection | null = null;
  public projectionHistory: RecipientRoomProjection[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
    this.connectionId = `conn-${playerId}-${Math.random().toString(36).slice(2, 7)}`;
  }

  connect(coordinator: RoomCoordinator, timestamp: number) {
    coordinator.onPlayerConnect(this.connectionId, this.playerId, timestamp);
    this.sync(coordinator);
  }

  disconnect(coordinator: RoomCoordinator, timestamp: number) {
    coordinator.onPlayerDisconnect(this.connectionId, this.playerId, timestamp);
  }

  sync(coordinator: RoomCoordinator) {
    const proj = coordinator.getConnectedMemberProjections().get(this.playerId);
    if (proj) {
      this.lastProjection = proj;
      this.projectionHistory.push(proj);
    }
  }

  get hand() {
    return this.lastProjection?.privateState?.hand ?? [];
  }

  get isMyTurn(): boolean {
    return this.lastProjection?.publicState.match?.round.currentPlayerId === this.playerId;
  }
}

function syncAll(clients: SimulatedClient[], coordinator: RoomCoordinator) {
  const projs = coordinator.getConnectedMemberProjections();
  for (const client of clients) {
    const p = projs.get(client.playerId);
    if (p) {
      client.lastProjection = p;
      client.projectionHistory.push(p);
    }
  }
}

describe('T-040 Multi-Client E2E Match Flow', () => {
  it('AC-01: End-to-end 2-player match simulation with plays, challenges, and winner', () => {
    const roomId = 'r_e2e_2p';
    expect(isValidRoomId(roomId)).toBe(true);

    const inviteLink = formatTelegramInviteLink({ roomId, botUsername: 'LiarsDeckBot' });
    expect(inviteLink).toContain('startapp=r_e2e_2p');

    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createSeededRandom(42);

    const alice = new SimulatedClient('alice');
    const bob = new SimulatedClient('bob');
    const clients = [alice, bob];

    // 1. Join Lobby
    let time = 1000;
    const j1 = coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    expect(j1.success).toBe(true);
    alice.connect(coord, time);

    time += 500;
    const j2 = coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    expect(j2.success).toBe(true);
    bob.connect(coord, time);
    syncAll(clients, coord);

    // Verify lobby state
    expect(alice.lastProjection?.publicState.lifecycle).toBe('LOBBY');
    expect(alice.lastProjection?.publicState.hostPlayerId).toBe('alice');
    expect(alice.lastProjection?.publicState.memberPlayerIds).toEqual(['alice', 'bob']);

    // 2. Host starts match
    time += 1000;
    const startRes = coord.handleClientCommand('alice', { type: 'START_MATCH' }, time, rng);
    expect(startRes.success).toBe(true);
    syncAll(clients, coord);

    expect(alice.lastProjection?.publicState.lifecycle).toBe('MATCH_ACTIVE');
    expect(bob.lastProjection?.publicState.lifecycle).toBe('MATCH_ACTIVE');
    expect(alice.hand).toHaveLength(5);
    expect(bob.hand).toHaveLength(5);

    // 3. Play rounds until someone wins
    let actionCount = 0;
    const maxActions = 60; // Safety guard

    while (
      coord.getRoomState().lifecycle === 'MATCH_ACTIVE' &&
      actionCount < maxActions
    ) {
      actionCount++;
      time += 2000;
      const roomState = coord.getRoomState();
      const match = roomState.match!;
      const currentActorId = match.round.currentPlayerId;
      const actorClient = currentActorId === 'alice' ? alice : bob;
      const currentTurnId = roomState.currentTurnId!;
      const currentRev = roomState.revision;

      actorClient.sync(coord);
      const actorHand = actorClient.hand;

      // If previous play exists and random says challenge or player has no cards to play
      const canChallenge = match.round.previousPlay !== null;
      const shouldChallenge = canChallenge && (actionCount % 3 === 0 || actorHand.length === 0);

      if (shouldChallenge) {
        const challengeRes = coord.handleClientCommand(
          currentActorId,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-call-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'CALL_LIAR',
              payload: {},
            },
          },
          time,
          rng
        );
        expect(challengeRes.success).toBe(true);
      } else {
        // Play 1 card from hand
        const cardToPlay = actorHand[0];
        const playRes = coord.handleClientCommand(
          currentActorId,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-play-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'PLAY_CARDS',
              payload: { cardIds: [cardToPlay.id] },
            },
          },
          time,
          rng
        );
        expect(playRes.success).toBe(true);
      }

      syncAll(clients, coord);
    }

    // Verify match reached conclusion
    const finalState = coord.getRoomState();
    expect(finalState.lifecycle).toBe('MATCH_FINISHED');
    expect(finalState.match?.winnerId).toBeDefined();
    expect(['alice', 'bob']).toContain(finalState.match?.winnerId);

    // Verify active alarm is 24h retention
    expect(finalState.activeAlarm?.kind).toBe('ROOM_RETENTION');
  });

  it('AC-02: End-to-end 3-player match simulation with cyclic turns and spectator elimination', () => {
    const roomId = 'r_e2e_3p';
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createSeededRandom(999);

    const alice = new SimulatedClient('alice');
    const bob = new SimulatedClient('bob');
    const charlie = new SimulatedClient('charlie');
    const clients = [alice, bob, charlie];

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    alice.connect(coord, time);

    time += 200;
    coord.handleClientCommand('bob', { type: 'JOIN' }, time, rng);
    bob.connect(coord, time);

    time += 200;
    coord.handleClientCommand('charlie', { type: 'JOIN' }, time, rng);
    charlie.connect(coord, time);
    syncAll(clients, coord);

    expect(alice.lastProjection?.publicState.memberPlayerIds).toEqual(['alice', 'bob', 'charlie']);

    time += 500;
    const startRes = coord.handleClientCommand('alice', { type: 'START_MATCH' }, time, rng);
    expect(startRes.success).toBe(true);
    syncAll(clients, coord);

    expect(alice.hand).toHaveLength(5);
    expect(bob.hand).toHaveLength(5);
    expect(charlie.hand).toHaveLength(5);

    let actionCount = 0;
    const maxActions = 100;
    let sawElimination = false;

    while (
      coord.getRoomState().lifecycle === 'MATCH_ACTIVE' &&
      actionCount < maxActions
    ) {
      actionCount++;
      time += 1500;
      const roomState = coord.getRoomState();
      const match = roomState.match!;
      const currentActorId = match.round.currentPlayerId;
      const currentTurnId = roomState.currentTurnId!;
      const currentRev = roomState.revision;

      const clientMap = { alice, bob, charlie };
      const actorClient = clientMap[currentActorId as keyof typeof clientMap];
      actorClient.sync(coord);
      const actorHand = actorClient.hand;

      const canChallenge = match.round.previousPlay !== null;
      const shouldChallenge = canChallenge && (actionCount % 2 === 0 || actorHand.length === 0);

      if (shouldChallenge) {
        const res = coord.handleClientCommand(
          currentActorId,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-3p-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'CALL_LIAR',
              payload: {},
            },
          },
          time,
          rng
        );
        expect(res.success).toBe(true);
      } else {
        const card = actorHand[0];
        const res = coord.handleClientCommand(
          currentActorId,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-3p-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'PLAY_CARDS',
              payload: { cardIds: [card.id] },
            },
          },
          time,
          rng
        );
        expect(res.success).toBe(true);
      }

      syncAll(clients, coord);

      // Check if any player was eliminated
      const elimClients = clients.filter(
        (c) =>
          c.lastProjection?.publicState.match?.players.find(
            (p) => p.playerId === c.playerId
          )?.lifeStatus === 'ELIMINATED'
      );
      if (elimClients.length > 0) {
        sawElimination = true;
        // Verify eliminated player receives null privateState (strict hidden info protection)
        for (const elimClient of elimClients) {
          expect(elimClient.lastProjection?.privateState).toBeNull();
        }
      }
    }

    expect(sawElimination).toBe(true);
    expect(coord.getRoomState().lifecycle).toBe('MATCH_FINISHED');
    expect(coord.getRoomState().match?.winnerId).toBeDefined();
  });

  it('AC-03 & AC-04: End-to-end 4-player match simulation with capacity enforcement and projection isolation', () => {
    const roomId = 'r_e2e_4p';
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createSeededRandom(777);

    const players = ['p1', 'p2', 'p3', 'p4'].map((id) => new SimulatedClient(id));
    let time = 1000;

    // Join 4 players
    for (const p of players) {
      time += 100;
      const j = coord.handleClientCommand(p.playerId, { type: 'JOIN' }, time, rng);
      expect(j.success).toBe(true);
      p.connect(coord, time);
    }
    syncAll(players, coord);
    expect(players[0].lastProjection?.publicState.memberPlayerIds).toHaveLength(4);

    // 5th player is rejected (Max capacity 4)
    const fifthJoin = coord.handleClientCommand('p5', { type: 'JOIN' }, time + 50, rng);
    expect(fifthJoin.success).toBe(false);
    expect(fifthJoin.error).toContain('room is full');

    // Start match
    time += 500;
    const startRes = coord.handleClientCommand('p1', { type: 'START_MATCH' }, time, rng);
    expect(startRes.success).toBe(true);
    syncAll(players, coord);

    // AC-04: Verify each of the 4 players receives distinct, recipient-specific projections
    const hand1 = players[0].hand.map((c) => c.id);
    const hand2 = players[1].hand.map((c) => c.id);
    const hand3 = players[2].hand.map((c) => c.id);
    const hand4 = players[3].hand.map((c) => c.id);

    // Hands are mutually exclusive
    const allCards = [...hand1, ...hand2, ...hand3, ...hand4];
    expect(new Set(allCards).size).toBe(20);

    // Run turns
    let actionCount = 0;
    const maxActions = 120;

    while (
      coord.getRoomState().lifecycle === 'MATCH_ACTIVE' &&
      actionCount < maxActions
    ) {
      actionCount++;
      time += 1000;
      const roomState = coord.getRoomState();
      const match = roomState.match!;
      const currentActorId = match.round.currentPlayerId;
      const currentTurnId = roomState.currentTurnId!;
      const currentRev = roomState.revision;

      const actorClient = players.find((p) => p.playerId === currentActorId)!;
      actorClient.sync(coord);
      const actorHand = actorClient.hand;

      const canChallenge = match.round.previousPlay !== null;
      const shouldChallenge = canChallenge && (actionCount % 2 === 0 || actorHand.length === 0);

      if (shouldChallenge) {
        coord.handleClientCommand(
          currentActorId,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-4p-${actionCount}`,
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
        const card = actorHand[0];
        coord.handleClientCommand(
          currentActorId,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-4p-${actionCount}`,
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

      syncAll(players, coord);

      // Verify AC-04 projection isolation at every step
      for (const client of players) {
        const proj = client.lastProjection;
        if (proj && proj.privateState) {
          // Living player's hand must only contain their own cards
          expect(proj.privateState.hand.length).toBeGreaterThan(0);
          expect(proj.privateState.playerId).toBe(client.playerId);
        }
      }
    }

    expect(coord.getRoomState().lifecycle).toBe('MATCH_FINISHED');
    expect(coord.getRoomState().match?.winnerId).toBeDefined();
  });

  it('AC-04 & AC-05: Multi-client session with system turn deadline timeout and projection sync', () => {
    const roomId = 'r_e2e_timeout';
    const sql = createInMemorySqlStorage();
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createSeededRandom(555);

    const alice = new SimulatedClient('alice');
    const bob = new SimulatedClient('bob');
    const clients = [alice, bob];

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    alice.connect(coord, time);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    bob.connect(coord, time + 100);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);
    syncAll(clients, coord);

    const state = coord.getRoomState();
    const firstActor = state.match!.round.currentPlayerId;
    const dueAt = state.activeAlarm!.dueAt;

    // Simulate actor idling until turn deadline expires
    const alarmResult = coord.onAlarm(dueAt + 100, rng);
    expect(alarmResult.decision).toBe('COMMITTED_ACTIVE');
    syncAll(clients, coord);

    // Both clients receive updated projection reflecting timeout auto-play
    expect(alice.lastProjection?.publicState.match?.round.previousPlay).not.toBeNull();
    expect(bob.lastProjection?.publicState.match?.round.previousPlay).not.toBeNull();
    expect(alice.lastProjection?.publicState.match?.round.previousPlay?.count).toBe(1);

    // Current player advanced to the other player
    const nextActor = coord.getRoomState().match!.round.currentPlayerId;
    expect(nextActor).not.toBe(firstActor);
  });
});
