import { describe, it, expect } from 'vitest';
import type { MatchState, PlayerId } from '@liars-telegram-game/game-core';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from '../src/room-state.js';
import { createInitialRoomState } from '../src/room-state.js';
import type {
  ServerAuthenticatedRoomConnection,
  RoomPresenceRegistry,
  RoomPresenceSummary,
} from '../src/presence.js';
import {
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
  unregisterAuthenticatedRoomConnection,
  evaluateRoomPresence,
} from '../src/presence.js';

class DeterministicRandomSource {
  private values: number[];
  private index = 0;
  constructor(values: number[]) {
    this.values = values;
  }
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
    const val = this.values[this.index % this.values.length];
    this.index++;
    return Math.abs(val) % maxExclusive;
  }
}

function setupRoomWithMatch(
  roomId = 'room-test',
  playerIds: string[] = ['p1', 'p2', 'p3'],
  hostPlayerId = 'p1'
): RoomAuthorityState<MatchState> {
  const random = new DeterministicRandomSource([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const match = initializeMatch(playerIds as PlayerId[], random);

  const room = createInitialRoomState<MatchState>(roomId);
  room.members = playerIds.map((pid, idx) => ({ playerId: pid, joinOrder: idx + 1 }));
  room.hostPlayerId = hostPlayerId;
  room.match = match;
  room.lifecycle = 'MATCH_ACTIVE';
  room.currentTurnId = 'turn-1';
  room.currentTurnDeadline = 30000;
  room.activeAlarm = {
    kind: 'TURN_DEADLINE',
    dueAt: 30000,
    generation: 0,
  };
  return room;
}

describe('T-024 Unique Living Presence Foundation', () => {
  describe('Mandatory Direct Tests A through O', () => {
    it('MANDATORY TEST A — one Living Player, one connection (AC-33)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedMemberPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayers).toBe(1);
    });

    it('MANDATORY TEST B — same Living Player, three connections (AC-16, AC-29, AC-34)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-1a',
        playerId: 'p1',
      });
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-1b',
        playerId: 'p1',
      });
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-1c',
        playerId: 'p1',
      });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedMemberPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayers).toBe(1);
      expect(registry.playerToConnections['p1']).toEqual(['conn-1a', 'conn-1b', 'conn-1c']);
    });

    it('MANDATORY TEST C — disconnect one of three (AC-18)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'conn-1a', playerId: 'p1' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'conn-1b', playerId: 'p1' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'conn-1c', playerId: 'p1' });

      // Unregister conn-1b
      registry = unregisterAuthenticatedRoomConnection(registry, { connectionId: 'conn-1b', playerId: 'p1' });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedMemberPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayers).toBe(1);
      expect(registry.playerToConnections['p1']).toEqual(['conn-1a', 'conn-1c']);
    });

    it('MANDATORY TEST D — disconnect final connection (AC-19, AC-35)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'conn-1a', playerId: 'p1' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'conn-1b', playerId: 'p1' });

      registry = unregisterAuthenticatedRoomConnection(registry, { connectionId: 'conn-1a', playerId: 'p1' });
      expect(evaluateRoomPresence(room, registry).connectedLivingPlayers).toBe(1);

      // Disconnect final connection
      registry = unregisterAuthenticatedRoomConnection(registry, { connectionId: 'conn-1b', playerId: 'p1' });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedMemberPlayerIds).toEqual([]);
      expect(summary.connectedLivingPlayerIds).toEqual([]);
      expect(summary.connectedLivingPlayers).toBe(0);
      expect(registry.playerToConnections['p1']).toBeUndefined();
    });

    it('MANDATORY TEST E — two Living Players, current Player disconnected, other Living Player connected (AC-47, AC-48)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      const currentPlayerId = room.match!.round.currentPlayerId;
      const otherPlayerId = currentPlayerId === 'p1' ? 'p2' : 'p1';

      let registry = createRoomPresenceRegistry();
      // Connect only the OTHER player (non-current turn player)
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-other',
        playerId: otherPlayerId,
      });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedMemberPlayerIds).toEqual([otherPlayerId]);
      expect(summary.connectedLivingPlayerIds).toEqual([otherPlayerId]);
      expect(summary.connectedLivingPlayers).toBe(1);
    });

    it('MANDATORY TEST F — Eliminated spectator with three connections (AC-36, AC-37, AC-38)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2', 'p3']);
      // Mark p3 as ELIMINATED
      room.match = {
        ...room.match!,
        players: {
          ...room.match!.players,
          p3: {
            ...room.match!.players['p3'],
            lifeStatus: 'ELIMINATED',
            hand: [],
          },
        },
      };

      let registry = createRoomPresenceRegistry();
      // p3 connects 3 spectator sockets
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'p3-c1', playerId: 'p3' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'p3-c2', playerId: 'p3' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'p3-c3', playerId: 'p3' });

      // Living p1 connects 1 socket
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'p1-c1', playerId: 'p1' });

      const summary = evaluateRoomPresence(room, registry);
      // p3 is a connected room member, but NOT a connected living player
      expect(summary.connectedMemberPlayerIds).toEqual(['p1', 'p3']);
      expect(summary.connectedLivingPlayerIds).toEqual(['p1']);
      expect(summary.connectedLivingPlayers).toBe(1);
    });

    it('MANDATORY TEST G — ALIVE EMPTY_SAFE Player connected (AC-41, AC-42)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      // p2 has EMPTY_SAFE but is ALIVE
      room.match = {
        ...room.match!,
        players: {
          ...room.match!.players,
          p2: {
            ...room.match!.players['p2'],
            lifeStatus: 'ALIVE',
            roundStatus: 'EMPTY_SAFE',
            hand: [],
          },
        },
      };

      let registry = createRoomPresenceRegistry();
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'p2-conn', playerId: 'p2' });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedLivingPlayerIds).toEqual(['p2']);
      expect(summary.connectedLivingPlayers).toBe(1);
    });

    it('MANDATORY TEST H — ALIVE EMPTY_PENDING_CHALLENGE Player connected (AC-41)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      // p2 has EMPTY_PENDING_CHALLENGE but is ALIVE
      room.match = {
        ...room.match!,
        players: {
          ...room.match!.players,
          p2: {
            ...room.match!.players['p2'],
            lifeStatus: 'ALIVE',
            roundStatus: 'EMPTY_PENDING_CHALLENGE',
            hand: [],
          },
        },
      };

      let registry = createRoomPresenceRegistry();
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'p2-conn', playerId: 'p2' });

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedLivingPlayerIds).toEqual(['p2']);
      expect(summary.connectedLivingPlayers).toBe(1);
    });

    it('MANDATORY TEST I — same connectionId registered to second Player (AC-13, AC-14, AC-15)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-shared',
        playerId: 'p1',
      });

      // Attempt to register same connectionId to p2
      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, {
          connectionId: 'conn-shared',
          playerId: 'p2',
        })
      ).toThrow(/Connection conflict: connectionId conn-shared is already registered to player p1/);

      // Verify connection was not stolen
      expect(registry.connectionToPlayer['conn-shared']).toBe('p1');
      expect(registry.playerToConnections['p1']).toEqual(['conn-shared']);
      expect(registry.playerToConnections['p2']).toBeUndefined();
    });

    it('MANDATORY TEST J — wrong-player unregister of another Player connection (AC-21, AC-22)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-p1',
        playerId: 'p1',
      });

      // p2 attempts to unregister p1's connectionId
      expect(() =>
        unregisterAuthenticatedRoomConnection(registry, {
          connectionId: 'conn-p1',
          playerId: 'p2',
        })
      ).toThrow(/Unregister conflict: connectionId conn-p1 belongs to player p1, not p2/);

      // Verify p1's connection was not removed
      expect(registry.connectionToPlayer['conn-p1']).toBe('p1');
      expect(registry.playerToConnections['p1']).toEqual(['conn-p1']);
    });

    it('MANDATORY TEST K — duplicate same registration is idempotent (AC-11, AC-12)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      let registry = createRoomPresenceRegistry();

      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });

      const registryCopy = { ...registry };

      // Register exact same connection again
      const regAfterDuplicate = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'conn-1',
        playerId: 'p1',
      });

      expect(regAfterDuplicate).toBe(registry);
      expect(regAfterDuplicate.playerToConnections['p1']).toEqual(['conn-1']);
    });

    it('MANDATORY TEST L — missing exact unregister is idempotent no-op (AC-20)', () => {
      let registry = createRoomPresenceRegistry();

      const regAfter = unregisterAuthenticatedRoomConnection(registry, {
        connectionId: 'non-existent-conn',
        playerId: 'p1',
      });

      expect(regAfter).toBe(registry);
    });

    it('MANDATORY TEST M — prototype-safe hostile identifiers (AC-23..AC-27, AC-113)', () => {
      const hostilePlayerIds = ['__proto__', 'constructor', 'p3'];
      const room = setupRoomWithMatch('room-proto', hostilePlayerIds);

      let registry = createRoomPresenceRegistry();

      // Register connection with __proto__ as playerId and constructor as connectionId
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'constructor',
        playerId: '__proto__',
      });

      // Register connection with constructor as playerId and __proto__ as connectionId
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: '__proto__',
        playerId: 'constructor',
      });

      expect(registry.connectionToPlayer['constructor']).toBe('__proto__');
      expect(registry.connectionToPlayer['__proto__']).toBe('constructor');

      const summary = evaluateRoomPresence(room, registry);
      expect(summary.connectedMemberPlayerIds).toEqual(['__proto__', 'constructor']);
      expect(summary.connectedLivingPlayerIds).toEqual(['__proto__', 'constructor']);
      expect(summary.connectedLivingPlayers).toBe(2);

      // Unregister constructor connection
      registry = unregisterAuthenticatedRoomConnection(registry, {
        connectionId: 'constructor',
        playerId: '__proto__',
      });

      const summaryAfter = evaluateRoomPresence(room, registry);
      expect(summaryAfter.connectedMemberPlayerIds).toEqual(['constructor']);
      expect(summaryAfter.connectedLivingPlayers).toBe(1);
    });

    it('MANDATORY TEST N — Match null / Lobby-like Room (AC-31, AC-32)', () => {
      const lobbyRoom = createInitialRoomState('lobby-room');
      lobbyRoom.members = [
        { playerId: 'p1', joinOrder: 1 },
        { playerId: 'p2', joinOrder: 2 },
      ];

      let registry = createRoomPresenceRegistry();
      registry = registerAuthenticatedRoomConnection(lobbyRoom, registry, {
        connectionId: 'c1',
        playerId: 'p1',
      });
      registry = registerAuthenticatedRoomConnection(lobbyRoom, registry, {
        connectionId: 'c2',
        playerId: 'p2',
      });

      const summary = evaluateRoomPresence(lobbyRoom, registry);
      expect(summary.connectedMemberPlayerIds).toEqual(['p1', 'p2']);
      expect(summary.connectedLivingPlayerIds).toEqual([]);
      expect(summary.connectedLivingPlayers).toBe(0);
    });

    it('MANDATORY TEST O — source immutability (AC-56..AC-62)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      const roomSnapshot = JSON.parse(JSON.stringify(room));

      const registry = createRoomPresenceRegistry();
      const conn: ServerAuthenticatedRoomConnection = { connectionId: 'c1', playerId: 'p1' };
      const connSnapshot = JSON.parse(JSON.stringify(conn));

      const reg1 = registerAuthenticatedRoomConnection(room, registry, conn);
      expect(room).toEqual(roomSnapshot);
      expect(conn).toEqual(connSnapshot);
      expect(registry.connectionToPlayer).toEqual({});
      expect(registry.playerToConnections).toEqual({});

      const reg2 = unregisterAuthenticatedRoomConnection(reg1, conn);
      expect(reg1.connectionToPlayer).toEqual({ c1: 'p1' });
      expect(conn).toEqual(connSnapshot);

      evaluateRoomPresence(room, reg1);
      expect(room).toEqual(roomSnapshot);
      expect(reg1.connectionToPlayer).toEqual({ c1: 'p1' });
    });
  });

  describe('Validation & Edge Cases', () => {
    it('validates non-empty connectionId and playerId (AC-07, AC-08)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      const registry = createRoomPresenceRegistry();

      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, null as unknown as ServerAuthenticatedRoomConnection)
      ).toThrow(/must be a non-null object/);

      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, { connectionId: '', playerId: 'p1' })
      ).toThrow(/Invalid connectionId/);

      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, { connectionId: '   ', playerId: 'p1' })
      ).toThrow(/Invalid connectionId/);

      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c1', playerId: '' })
      ).toThrow(/Invalid playerId/);

      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c1', playerId: '   ' })
      ).toThrow(/Invalid playerId/);
    });

    it('fails closed when registering a non-member (AC-09, AC-10)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      const registry = createRoomPresenceRegistry();

      expect(() =>
        registerAuthenticatedRoomConnection(room, registry, {
          connectionId: 'c-intruder',
          playerId: 'intruder',
        })
      ).toThrow(/player intruder is not a member of room/);
    });

    it('orders connectedMemberPlayerIds and connectedLivingPlayerIds strictly by Room membership join order (AC-28, AC-30, AC-50, AC-51)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2', 'p3', 'p4']);
      let registry = createRoomPresenceRegistry();

      // Connect in reverse order: p4, then p2, then p1
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c4', playerId: 'p4' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c2', playerId: 'p2' });
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c1', playerId: 'p1' });

      const summary = evaluateRoomPresence(room, registry);
      // Result must preserve Room member join order: p1, p2, p4
      expect(summary.connectedMemberPlayerIds).toEqual(['p1', 'p2', 'p4']);
      expect(summary.connectedLivingPlayerIds).toEqual(['p1', 'p2', 'p4']);
      expect(summary.connectedLivingPlayers).toBe(3);
    });

    it('evaluates Living Host vs Eliminated Host correctly (AC-44, AC-45, AC-46)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2'], 'p1'); // p1 is host
      let registry = createRoomPresenceRegistry();

      // Case 1: Living host connected
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c1', playerId: 'p1' });
      expect(evaluateRoomPresence(room, registry).connectedLivingPlayers).toBe(1);

      // Case 2: Host eliminated
      room.match = {
        ...room.match!,
        players: {
          ...room.match!.players,
          p1: {
            ...room.match!.players['p1'],
            lifeStatus: 'ELIMINATED',
          },
        },
      };
      const summaryEliminatedHost = evaluateRoomPresence(room, registry);
      expect(summaryEliminatedHost.connectedMemberPlayerIds).toEqual(['p1']);
      expect(summaryEliminatedHost.connectedLivingPlayerIds).toEqual([]);
      expect(summaryEliminatedHost.connectedLivingPlayers).toBe(0);
    });

    it('causes ZERO Room revision, lifecycle, deadline, or alarm mutations from raw presence events (AC-63..AC-77, AC-114)', () => {
      const room = setupRoomWithMatch('room-1', ['p1', 'p2']);
      const initialRevision = room.revision;
      const initialLifecycle = room.lifecycle;
      const initialDeadline = room.currentTurnDeadline;
      const initialAlarm = JSON.parse(JSON.stringify(room.activeAlarm));
      const initialMatch = JSON.parse(JSON.stringify(room.match));

      let registry = createRoomPresenceRegistry();

      // 1. Connect p1
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c1', playerId: 'p1' });
      // 2. Duplicate connect p1
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c1', playerId: 'p1' });
      // 3. Connect p2
      registry = registerAuthenticatedRoomConnection(room, registry, { connectionId: 'c2', playerId: 'p2' });
      // 4. Disconnect p1
      registry = unregisterAuthenticatedRoomConnection(registry, { connectionId: 'c1', playerId: 'p1' });
      // 5. Duplicate disconnect p1
      registry = unregisterAuthenticatedRoomConnection(registry, { connectionId: 'c1', playerId: 'p1' });
      // 6. Evaluate presence
      evaluateRoomPresence(room, registry);

      // Assert zero Room state mutation
      expect(room.revision).toBe(initialRevision);
      expect(room.lifecycle).toBe(initialLifecycle);
      expect(room.currentTurnDeadline).toBe(initialDeadline);
      expect(room.activeAlarm).toEqual(initialAlarm);
      expect(room.match).toEqual(initialMatch);
    });
  });
});
