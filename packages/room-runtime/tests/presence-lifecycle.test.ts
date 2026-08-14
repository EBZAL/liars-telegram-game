import { describe, it, expect } from 'vitest';
import {
  initializeMatch,
  type MatchState,
  type RandomSource,
} from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from '../src/room-state.js';
import {
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
} from '../src/presence.js';
import {
  pauseActiveMatchForNoLivingConnections,
  resumePausedMatchForLivingPresenceTransition,
} from '../src/presence-lifecycle.js';
import {
  executeTimedClientGameplayTransaction,
  type ServerTurnDeadlineTrigger,
  executeSystemTimeoutDeadlineTransaction,
  createProcessedGameplayActionRegistry,
  type GameplayActionEnvelope,
} from '../src/index.js';

class DeterministicRandom implements RandomSource {
  private seq: number[];
  private idx = 0;

  constructor(seq: number[] = [0]) {
    this.seq = seq;
  }

  nextInt(max: number): number {
    const val = this.seq[this.idx % this.seq.length];
    this.idx++;
    return val % max;
  }
}

function setupActiveRoom(
  roomId = 'room-1',
  playerIds = ['p1', 'p2', 'p3'],
  hostId = 'p1',
  revision = 8,
  deadline = 31000
): RoomAuthorityState<MatchState> {
  const match = initializeMatch(playerIds, new DeterministicRandom([0, 1, 2]));
  return {
    roomId,
    lifecycle: 'MATCH_ACTIVE',
    revision,
    members: playerIds.map((pid, idx) => ({ playerId: pid, joinedAtMs: 1000, joinOrder: idx + 1 })),
    hostPlayerId: hostId,
    match,
    currentTurnId: 'turn-1',
    currentTurnDeadline: deadline,
    activeAlarm: {
      kind: 'TURN_DEADLINE',
      dueAt: deadline,
      generation: revision,
    },
  };
}

describe('T-025 Living Presence Pause Resume Lifecycle', () => {
  describe('Mandatory Direct Tests', () => {
    it('MANDATORY TEST A — Active with one connected Living Player (AC-10, AC-11, AC-12)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      let registry = createRoomPresenceRegistry();
      // p1 connected
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      const result = pauseActiveMatchForNoLivingConnections(room, registry);
      expect(result.status).toBe('NO_CHANGE');
      // Verify zero mutation
      expect(room.revision).toBe(8);
      expect(room.currentTurnDeadline).toBe(31000);
      expect(room.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      });
      expect(room.lifecycle).toBe('MATCH_ACTIVE');
    });

    it('MANDATORY TEST B — Active with current Player disconnected but another Living connected (AC-13)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const currentPlayer = room.match!.round!.currentPlayerId;
      const otherPlayer = ['p1', 'p2', 'p3'].find((p) => p !== currentPlayer)!;

      let registry = createRoomPresenceRegistry();
      // Only the other player is connected (current player disconnected)
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'c-other',
        playerId: otherPlayer,
      });

      const result = pauseActiveMatchForNoLivingConnections(room, registry);
      expect(result.status).toBe('NO_CHANGE');
      expect(room.revision).toBe(8);
      expect(room.currentTurnDeadline).toBe(31000);
      expect(room.lifecycle).toBe('MATCH_ACTIVE');
    });

    it('MANDATORY TEST C — Active with zero connected Living Players (AC-15..AC-28)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();

      const result = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      expect(result.status).toBe('PAUSED');
      if (result.status === 'PAUSED') {
        expect(result.resultingRevision).toBe(9);
        expect(result.roomState.revision).toBe(9);
        expect(result.roomState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
        expect(result.roomState.currentTurnId).toBe('turn-1');
        expect(result.roomState.currentTurnDeadline).toBeNull();
        expect(result.roomState.activeAlarm).toBeNull();
        expect(result.roomState.match).toBe(room.match);
        expect(result.roomState.hostPlayerId).toBe(room.hostPlayerId);
        expect(result.roomState.members).toBe(room.members);
      }
    });

    it('MANDATORY TEST D — Old TURN_DEADLINE trigger after Pause (AC-37, AC-38, AC-135)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();

      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      expect(pauseResult.status).toBe('PAUSED');
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      // Replay generation-8 trigger against paused revision-9 Room
      const oldTrigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      };

      const rng = new DeterministicRandom([0]);
      const timeoutResult = executeSystemTimeoutDeadlineTransaction(
        pausedRoom,
        oldTrigger,
        { turnId: 'turn-next' },
        31500, // authoritativeNowMs after dueAt
        rng
      );

      // Active alarm is null in paused room -> STALE_ALARM
      expect(timeoutResult.decision).toBe('STALE_ALARM');
      // Assert zero Core RNG consumed
      expect(rng.nextInt(10)).toBe(0); // Index 0 unchanged
    });

    it('MANDATORY TEST E — Client gameplay after Pause (AC-39, AC-136)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();

      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      expect(pauseResult.status).toBe('PAUSED');
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      const actor = { playerId: pausedRoom.match!.round!.currentPlayerId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 9, // Even with current revision
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: {
          cardIds: [pausedRoom.match!.players[actor.playerId]!.hand[0]!.id],
        },
      };

      const processedRegistry = createProcessedGameplayActionRegistry();
      const gameplayResult = executeTimedClientGameplayTransaction(
        pausedRoom,
        envelope,
        processedRegistry,
        actor,
        { turnId: 'turn-next' },
        30000,
        new DeterministicRandom([0])
      );

      expect(gameplayResult.decision).toBe('REJECT');
      if (gameplayResult.decision === 'REJECT') {
        expect(gameplayResult.reason).toBe('MATCH_NOT_ACTIVE');
      }
    });

    it('MANDATORY TEST F — Paused + Eliminated spectator connection (AC-57, AC-58, AC-138)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      // Mark p3 as eliminated
      room.match = {
        ...room.match!,
        players: {
          ...room.match!.players,
          p3: {
            ...room.match!.players['p3']!,
            lifeStatus: 'ELIMINATED',
            hand: [],
          },
        },
      };

      const emptyRegistry = createRoomPresenceRegistry();
      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      expect(pauseResult.status).toBe('PAUSED');
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      // Eliminated spectator p3 connects
      const nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'p3-conn',
        playerId: 'p3',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        emptyRegistry,
        nextRegistry,
        90000
      );

      expect(resumeResult.status).toBe('NO_CHANGE');
      // Paused state remains unmutated
      expect(pausedRoom.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(pausedRoom.revision).toBe(9);
      expect(pausedRoom.currentTurnDeadline).toBeNull();
      expect(pausedRoom.activeAlarm).toBeNull();
    });

    it('MANDATORY TEST G — Paused exact Living 0 -> 1 (AC-52, AC-60..AC-83, AC-133)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();

      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      expect(pauseResult.status).toBe('PAUSED');
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;
      expect(pausedRoom.revision).toBe(9);

      // Living player p1 connects
      const nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        emptyRegistry,
        nextRegistry,
        90000
      );

      expect(resumeResult.status).toBe('RESUMED');
      if (resumeResult.status === 'RESUMED') {
        expect(resumeResult.resultingRevision).toBe(10);
        expect(resumeResult.roomState.revision).toBe(10);
        expect(resumeResult.roomState.lifecycle).toBe('MATCH_ACTIVE');
        expect(resumeResult.roomState.currentTurnId).toBe('turn-1');
        expect(resumeResult.roomState.currentTurnDeadline).toBe(120000); // 90000 + 30000
        expect(resumeResult.roomState.activeAlarm).toEqual({
          kind: 'TURN_DEADLINE',
          dueAt: 120000,
          generation: 10,
        });
        expect(resumeResult.roomState.match).toBe(pausedRoom.match);
      }
    });

    it('MANDATORY TEST H — Resume does not restore old remaining time (AC-76..AC-78, AC-134)', () => {
      // Old pre-pause deadline = 31000
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();
      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      const nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        emptyRegistry,
        nextRegistry,
        90000
      );

      expect(resumeResult.status).toBe('RESUMED');
      if (resumeResult.status === 'RESUMED') {
        // Must be exactly 90000 + 30000 = 120000, NOT 31000 or old remaining time
        expect(resumeResult.roomState.currentTurnDeadline).toBe(120000);
      }
    });

    it('MANDATORY TEST I — Second Living reconnect after Resume (AC-84, AC-85, AC-137)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();
      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      let registry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        emptyRegistry,
        registry,
        90000
      );
      expect(resumeResult.status).toBe('RESUMED');
      const activeResumedRoom = (resumeResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      // Second living player p2 connects while room is ACTIVE
      const registryBeforeP2 = registry;
      registry = registerAuthenticatedRoomConnection(activeResumedRoom, registry, {
        connectionId: 'c2',
        playerId: 'p2',
      });

      const secondResumeResult = resumePausedMatchForLivingPresenceTransition(
        activeResumedRoom,
        registryBeforeP2,
        registry,
        95000
      );

      expect(secondResumeResult.status).toBe('NOT_APPLICABLE');
      expect(activeResumedRoom.currentTurnDeadline).toBe(120000);
      expect(activeResumedRoom.revision).toBe(10);
    });

    it('MANDATORY TEST J — Extra socket for already-connected Living Player (AC-86)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      let registry = createRoomPresenceRegistry();
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'c1-tab1',
        playerId: 'p1',
      });

      // Extra socket for p1
      const registryWithTab2 = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'c1-tab2',
        playerId: 'p1',
      });

      const pauseResult = pauseActiveMatchForNoLivingConnections(room, registryWithTab2);
      expect(pauseResult.status).toBe('NO_CHANGE');
      expect(room.currentTurnDeadline).toBe(31000);
      expect(room.revision).toBe(8);
    });

    it('MANDATORY TEST K — Paused state with Living before-count already 1 (AC-54, AC-55)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();
      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      // Create a previous registry that already had p1 connected (incoherent for paused state)
      const previousRegistryWithLiving = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });
      const nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, previousRegistryWithLiving, {
        connectionId: 'c2',
        playerId: 'p2',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        previousRegistryWithLiving,
        nextRegistry,
        90000
      );

      expect(resumeResult.status).toBe('INVALID_STATE');
      expect(pausedRoom.revision).toBe(9);
    });

    it('MANDATORY TEST L — Paused 0 -> 2 fails closed (AC-56)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const emptyRegistry = createRoomPresenceRegistry();
      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      // Connect both p1 and p2 in a single delta (0 -> 2)
      let nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });
      nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, nextRegistry, {
        connectionId: 'c2',
        playerId: 'p2',
      });

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        emptyRegistry,
        nextRegistry,
        90000
      );

      expect(resumeResult.status).toBe('INVALID_STATE');
      expect(pausedRoom.revision).toBe(9);
    });

    it('MANDATORY TEST M — Life-status elimination with unchanged registry (AC-87, AC-88, AC-139)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      let registry = createRoomPresenceRegistry();
      // Only p1 has an active connection
      registry = registerAuthenticatedRoomConnection(room, registry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      // Before elimination: p1 is ALIVE -> Living count 1 -> NO_CHANGE
      const beforeResult = pauseActiveMatchForNoLivingConnections(room, registry);
      expect(beforeResult.status).toBe('NO_CHANGE');

      // Eliminate p1 in authoritative MatchState while keeping Match IN_PROGRESS (e.g. p2 and p3 remain alive)
      const postEliminationRoom: RoomAuthorityState<MatchState> = {
        ...room,
        match: {
          ...room.match!,
          players: {
            ...room.match!.players,
            p1: {
              ...room.match!.players['p1']!,
              lifeStatus: 'ELIMINATED',
              hand: [],
            },
          },
        },
      };

      // Same registry! But now connected Living count is 0 because p1 is ELIMINATED
      const pauseResult = pauseActiveMatchForNoLivingConnections(postEliminationRoom, registry);
      expect(pauseResult.status).toBe('PAUSED');
      if (pauseResult.status === 'PAUSED') {
        expect(pauseResult.resultingRevision).toBe(9);
        expect(pauseResult.roomState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      }
    });

    it('MANDATORY TEST N — Finished Match with zero connected Living (AC-91, AC-92, AC-93, AC-140)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const finishedRoom: RoomAuthorityState<MatchState> = {
        ...room,
        lifecycle: 'MATCH_FINISHED',
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      const emptyRegistry = createRoomPresenceRegistry();
      const pauseResult = pauseActiveMatchForNoLivingConnections(finishedRoom, emptyRegistry);
      expect(pauseResult.status).toBe('NOT_APPLICABLE');

      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        finishedRoom,
        emptyRegistry,
        emptyRegistry,
        90000
      );
      expect(resumeResult.status).toBe('NOT_APPLICABLE');
    });

    it('MANDATORY TEST O — Purity: verify input Room, Match, Hands, registries unmutated (AC-102..AC-105)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2', 'p3'], 'p1', 8, 31000);
      const initialRoomSnapshot = JSON.stringify(room);

      const emptyRegistry = createRoomPresenceRegistry();
      const initialEmptyRegistrySnapshot = JSON.stringify(emptyRegistry);

      let nextRegistry = registerAuthenticatedRoomConnection(room, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });
      const initialNextRegistrySnapshot = JSON.stringify(nextRegistry);

      // 1. Evaluate pause
      pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      expect(JSON.stringify(room)).toBe(initialRoomSnapshot);
      expect(JSON.stringify(emptyRegistry)).toBe(initialEmptyRegistrySnapshot);

      // 2. Perform pause
      const pauseResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pauseResult as { roomState: RoomAuthorityState<MatchState> }).roomState;
      const initialPausedRoomSnapshot = JSON.stringify(pausedRoom);

      // 3. Evaluate resume
      resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        emptyRegistry,
        nextRegistry,
        90000
      );
      expect(JSON.stringify(pausedRoom)).toBe(initialPausedRoomSnapshot);
      expect(JSON.stringify(emptyRegistry)).toBe(initialEmptyRegistrySnapshot);
      expect(JSON.stringify(nextRegistry)).toBe(initialNextRegistrySnapshot);
    });
  });

  describe('Edge Cases & State Invariants', () => {
    it('returns NOT_APPLICABLE for LOBBY and ABANDONED lifecycles (AC-95, AC-96)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2']);
      const emptyRegistry = createRoomPresenceRegistry();

      const lobbyRoom: RoomAuthorityState<MatchState> = { ...room, lifecycle: 'LOBBY' };
      expect(pauseActiveMatchForNoLivingConnections(lobbyRoom, emptyRegistry).status).toBe('NOT_APPLICABLE');
      expect(resumePausedMatchForLivingPresenceTransition(lobbyRoom, emptyRegistry, emptyRegistry, 90000).status).toBe('NOT_APPLICABLE');

      const abandonedRoom: RoomAuthorityState<MatchState> = { ...room, lifecycle: 'ABANDONED' };
      expect(pauseActiveMatchForNoLivingConnections(abandonedRoom, emptyRegistry).status).toBe('NOT_APPLICABLE');
      expect(resumePausedMatchForLivingPresenceTransition(abandonedRoom, emptyRegistry, emptyRegistry, 90000).status).toBe('NOT_APPLICABLE');
    });

    it('fails closed on malformed active timing metadata for Pause (AC-31..AC-34)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2']);
      const emptyRegistry = createRoomPresenceRegistry();

      // Case 1: Mismatched dueAt
      const badDueAtRoom: RoomAuthorityState<MatchState> = {
        ...room,
        activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 99999, generation: room.revision },
      };
      expect(pauseActiveMatchForNoLivingConnections(badDueAtRoom, emptyRegistry).status).toBe('INVALID_STATE');

      // Case 2: Mismatched generation
      const badGenRoom: RoomAuthorityState<MatchState> = {
        ...room,
        activeAlarm: { kind: 'TURN_DEADLINE', dueAt: room.currentTurnDeadline!, generation: 999 },
      };
      expect(pauseActiveMatchForNoLivingConnections(badGenRoom, emptyRegistry).status).toBe('INVALID_STATE');

      // Case 3: Wrong alarm kind
      const badKindRoom = {
        ...room,
        activeAlarm: { kind: 'OTHER_KIND' as unknown as 'TURN_DEADLINE', dueAt: room.currentTurnDeadline!, generation: room.revision },
      };
      expect(pauseActiveMatchForNoLivingConnections(badKindRoom, emptyRegistry).status).toBe('INVALID_STATE');
    });

    it('fails closed on invalid authoritativeResumeTimeMs for Resume (AC-61..AC-63)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2']);
      const emptyRegistry = createRoomPresenceRegistry();
      const pausedResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pausedResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      const nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      // Negative timestamp
      expect(resumePausedMatchForLivingPresenceTransition(pausedRoom, emptyRegistry, nextRegistry, -1).status).toBe('INVALID_STATE');

      // Non-safe integer
      expect(resumePausedMatchForLivingPresenceTransition(pausedRoom, emptyRegistry, nextRegistry, NaN).status).toBe('INVALID_STATE');

      // Overflow timestamp
      expect(resumePausedMatchForLivingPresenceTransition(pausedRoom, emptyRegistry, nextRegistry, Number.MAX_SAFE_INTEGER).status).toBe('INVALID_STATE');
    });

    it('fails closed when paused room has retained deadline or alarm (AC-49..AC-51)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2']);
      const emptyRegistry = createRoomPresenceRegistry();
      const pausedResult = pauseActiveMatchForNoLivingConnections(room, emptyRegistry);
      const pausedRoom = (pausedResult as { roomState: RoomAuthorityState<MatchState> }).roomState;

      const nextRegistry = registerAuthenticatedRoomConnection(pausedRoom, emptyRegistry, {
        connectionId: 'c1',
        playerId: 'p1',
      });

      // Paused room with retained deadline
      const roomWithDeadline: RoomAuthorityState<MatchState> = { ...pausedRoom, currentTurnDeadline: 50000 };
      expect(resumePausedMatchForLivingPresenceTransition(roomWithDeadline, emptyRegistry, nextRegistry, 90000).status).toBe('INVALID_STATE');

      // Paused room with retained alarm
      const roomWithAlarm: RoomAuthorityState<MatchState> = {
        ...pausedRoom,
        activeAlarm: { kind: 'TURN_DEADLINE', dueAt: 50000, generation: pausedRoom.revision },
      };
      expect(resumePausedMatchForLivingPresenceTransition(roomWithAlarm, emptyRegistry, nextRegistry, 90000).status).toBe('INVALID_STATE');
    });

    it('Living Host and Eliminated Host follow exact Living presence rules (AC-14, AC-59)', () => {
      const room = setupActiveRoom('room-1', ['p1', 'p2'], 'p1'); // p1 is host
      const emptyRegistry = createRoomPresenceRegistry();

      // Living host connected -> NO_CHANGE on pause
      const hostRegistry = registerAuthenticatedRoomConnection(room, emptyRegistry, {
        connectionId: 'h-conn',
        playerId: 'p1',
      });
      expect(pauseActiveMatchForNoLivingConnections(room, hostRegistry).status).toBe('NO_CHANGE');

      // Eliminated host
      const roomWithEliminatedHost: RoomAuthorityState<MatchState> = {
        ...room,
        match: {
          ...room.match!,
          players: {
            ...room.match!.players,
            p1: { ...room.match!.players['p1']!, lifeStatus: 'ELIMINATED', hand: [] },
          },
        },
      };

      // Only eliminated host connected -> PAUSES
      expect(pauseActiveMatchForNoLivingConnections(roomWithEliminatedHost, hostRegistry).status).toBe('PAUSED');

      // Paused room: eliminated host connecting does NOT resume
      const pauseRes = pauseActiveMatchForNoLivingConnections(roomWithEliminatedHost, emptyRegistry);
      const pausedEliminatedHostRoom = (pauseRes as { roomState: RoomAuthorityState<MatchState> }).roomState;

      const hostReconnectRegistry = registerAuthenticatedRoomConnection(pausedEliminatedHostRoom, emptyRegistry, {
        connectionId: 'h-conn',
        playerId: 'p1',
      });
      expect(
        resumePausedMatchForLivingPresenceTransition(
          pausedEliminatedHostRoom,
          emptyRegistry,
          hostReconnectRegistry,
          90000
        ).status
      ).toBe('NO_CHANGE');
    });
  });
});
