import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource, PlayerState } from '@liars-telegram-game/game-core';

import {
  executeTimedClientGameplayWithPresenceLifecycle,
  executeTimedClientGameplayTransaction,
  armActiveTurnDeadline,
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
  createProcessedGameplayActionRegistry,
  resumePausedMatchForLivingPresenceTransition,
  TURN_DURATION_MS,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  GameplayActionEnvelope,
  ServerResolvedActor,
  ServerPreparedNextTurn,
  RoomMember,
  RoomPresenceRegistry,
  ProcessedGameplayActionRegistry,
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

class ThrowingRandomSource implements RandomSource {
  nextInt(): number {
    throw new Error('RandomSource must not be called');
  }
}

describe('T-027 Client Gameplay Presence Lifecycle Composition', () => {
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

  describe('API Exports & Shape (AC-01, AC-02)', () => {
    it('exports executeTimedClientGameplayWithPresenceLifecycle from room-runtime (AC-01, AC-02)', () => {
      expect(typeof executeTimedClientGameplayWithPresenceLifecycle).toBe('function');
    });
  });

  describe('Mandatory Direct Tests A..L', () => {
    it('MANDATORY TEST A — continuing gameplay with Living connection remains -> COMMITTED_ACTIVE (1 revision) (AC-28..AC-36, AC-155)', () => {
      const { roomState, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      // Living player p2 is connected
      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(roomState, presenceRegistry, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      // Submit action before deadline: 2000ms
      const authoritativeNowMs = 2000;
      const result = executeTimedClientGameplayWithPresenceLifecycle(
        roomState,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        authoritativeNowMs,
        random
      );

      expect(result.decision).toBe('COMMITTED_ACTIVE');
      if (result.decision !== 'COMMITTED_ACTIVE') return;

      // Exactly 1 revision increment: 8 -> 9
      expect(result.actionResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.lifecycle).toBe('MATCH_ACTIVE');
      expect(result.roomState.currentTurnId).toBe('turn-9');

      // Processed registry contains record with resultingRevision 9
      expect(result.processedRegistry['act-1']).toBeDefined();
      expect(result.processedRegistry['act-1'].resultingRevision).toBe(9);

      // Re-armed deadline = 2000 + 30000 = 32000
      expect(result.roomState.currentTurnDeadline).toBe(32000);
      expect(result.roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 32000,
        generation: 9,
      });
    });

    it('MANDATORY TEST B — client gameplay eliminates only connected Living Player while Match continues -> COMMITTED_PAUSED (2 revisions) with same registry (AC-37..AC-57, AC-78..AC-84, AC-156, AC-157, AC-162)', () => {
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // Canonical 3-player elimination fixture:
      // p1 is current player with 1 card (KING) on ACE table. Revolver starts with LETHAL.
      // p2 is ALIVE with 1 card (ACE).
      // p3 is ALIVE with 0 cards (EMPTY_SAFE).
      // When p1 plays final card, p2 automatically CALLs p1 (sole remaining cardholder).
      // p1's Lie is caught -> p1 shoots -> LETHAL -> p1 is ELIMINATED!
      // p2 and p3 remain ALIVE -> Match continues IN_PROGRESS (round 2 initialized).
      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: { p1: p1State, p2: p2State, p3: p3State },
        seatOrder: ['p1', 'p2', 'p3'],
        round: {
          ...initRoom.match!.round,
          tableRank: 'ACE',
          currentPlayerId: 'p1',
          previousPlay: null,
          roundNumber: 1,
          playSequence: 1,
        },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      // Presence setup: ONLY p1 has a connection registered.
      // Disconnected p2 and p3 remain eligible living players in MatchState, but have NO registered connections.
      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const registryBeforeCopy = JSON.parse(JSON.stringify(presenceRegistry));

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const authoritativeNowMs = 2000;
      const result = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        authoritativeNowMs,
        random
      );

      // Verify COMMITTED_PAUSED outcome
      expect(result.decision).toBe('COMMITTED_PAUSED');
      if (result.decision !== 'COMMITTED_PAUSED') return;

      // Two distinct revision increments:
      // First revision: T-022 client gameplay Core transition: 8 -> 9
      // Second revision: T-025 ACTIVE -> PAUSED lifecycle transition: 9 -> 10
      expect(result.actionResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(10);
      expect(result.roomState.revision).toBe(10);

      // Processed registry MUST retain action resultingRevision = 9 (NOT 10!)
      expect(result.processedRegistry['play-elim-1']).toBeDefined();
      expect(result.processedRegistry['play-elim-1'].resultingRevision).toBe(9);
      expect(result.processedRegistry['play-elim-1'].resultingRevision).not.toBe(result.finalResultingRevision);

      // Room lifecycle and state checks
      expect(result.roomState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(result.roomState.match!.status).toBe('IN_PROGRESS');
      expect(result.roomState.match!.winnerId).toBeNull();
      expect(result.roomState.match!.players.p1.lifeStatus).toBe('ELIMINATED');
      expect(result.roomState.match!.players.p2.lifeStatus).toBe('ALIVE');
      expect(result.roomState.match!.players.p3.lifeStatus).toBe('ALIVE');

      // Prepared turn preserved across pause
      expect(result.roomState.currentTurnId).toBe('turn-9');

      // Deadline and alarm cleared by Pause
      expect(result.roomState.currentTurnDeadline).toBeNull();
      expect(result.roomState.activeAlarm).toBeNull();

      // Presence registry remained 100% unmutated
      expect(presenceRegistry).toEqual(registryBeforeCopy);
    });

    it('MANDATORY TEST C — exact duplicate against final paused Room returns DUPLICATE with priorResultingRevision=9 (AC-58..AC-65, AC-158)', () => {
      // Setup the paused state from Test B
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: { p1: p1State, p2: p2State, p3: p3State },
        seatOrder: ['p1', 'p2', 'p3'],
        round: {
          ...initRoom.match!.round,
          tableRank: 'ACE',
          currentPlayerId: 'p1',
          previousPlay: null,
          roundNumber: 1,
          playSequence: 1,
        },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const initialResult = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      expect(initialResult.decision).toBe('COMMITTED_PAUSED');
      if (initialResult.decision !== 'COMMITTED_PAUSED') return;

      const pausedRoom = initialResult.roomState;
      const finalRegistry = initialResult.processedRegistry;
      expect(pausedRoom.revision).toBe(10);
      expect(finalRegistry['play-elim-1'].resultingRevision).toBe(9);

      // Now retry the EXACT same envelope against the paused Room (revision 10)
      const throwingRandom = new ThrowingRandomSource();
      const pausedRoomCopy = JSON.parse(JSON.stringify(pausedRoom));
      const registryCopy = JSON.parse(JSON.stringify(finalRegistry));

      const retryResult = executeTimedClientGameplayWithPresenceLifecycle(
        pausedRoom,
        envelope,
        finalRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        5000,
        throwingRandom
      );

      expect(retryResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 9,
      });

      // Zero side-effects / zero mutations
      expect(pausedRoom).toEqual(pausedRoomCopy);
      expect(finalRegistry).toEqual(registryCopy);
    });

    it('MANDATORY TEST D — exact duplicate after Resume returns DUPLICATE with priorResultingRevision=9 (AC-66..AC-68, AC-95..AC-100, AC-159)', () => {
      // Step 1: Reach COMMITTED_PAUSED (Room revision 10, action record resultingRevision 9)
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: {
          ...initRoom.match!,
          players: { p1: p1State, p2: p2State, p3: p3State },
          seatOrder: ['p1', 'p2', 'p3'],
          round: {
            ...initRoom.match!.round,
            tableRank: 'ACE',
            currentPlayerId: 'p1',
            previousPlay: null,
            roundNumber: 1,
            playSequence: 1,
          },
        },
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const initialResult = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      expect(initialResult.decision).toBe('COMMITTED_PAUSED');
      if (initialResult.decision !== 'COMMITTED_PAUSED') return;

      const pausedRoom = initialResult.roomState;
      const finalRegistry = initialResult.processedRegistry;
      expect(pausedRoom.revision).toBe(10);

      // Step 2: Living player p2 reconnects (exact 0 -> 1 Living presence transition)
      const previousPresence = presenceRegistry;
      const nextPresence = registerAuthenticatedRoomConnection(pausedRoom, previousPresence, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      const resumeTimeMs = 90000;
      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        previousPresence,
        nextPresence,
        resumeTimeMs
      );

      expect(resumeResult.status).toBe('RESUMED');
      if (resumeResult.status !== 'RESUMED') return;

      const resumedRoom = resumeResult.roomState;
      expect(resumedRoom.revision).toBe(11);
      expect(resumedRoom.lifecycle).toBe('MATCH_ACTIVE');
      expect(resumedRoom.currentTurnId).toBe('turn-9');
      expect(resumedRoom.currentTurnDeadline).toBe(120000); // 90000 + 30000

      // Step 3: Retry exact original envelope against resumed room (revision 11) using same processed registry
      const throwingRandom = new ThrowingRandomSource();
      const resumedRoomCopy = JSON.parse(JSON.stringify(resumedRoom));
      const registryCopy = JSON.parse(JSON.stringify(finalRegistry));

      const retryResult = executeTimedClientGameplayWithPresenceLifecycle(
        resumedRoom,
        envelope,
        finalRegistry,
        actor,
        preparedTurn,
        nextPresence,
        95000,
        throwingRandom
      );

      expect(retryResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 9,
      });

      // Zero side-effects
      expect(resumedRoom).toEqual(resumedRoomCopy);
      expect(finalRegistry).toEqual(registryCopy);
    });

    it('MANDATORY TEST E — same actionId modified request after Pause returns ACTION_ID_CONFLICT (AC-69..AC-71, AC-160)', () => {
      // Reach paused room with processedRegistry containing 'play-elim-1'
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: {
          ...initRoom.match!,
          players: { p1: p1State, p2: p2State, p3: p3State },
          seatOrder: ['p1', 'p2', 'p3'],
          round: {
            ...initRoom.match!.round,
            tableRank: 'ACE',
            currentPlayerId: 'p1',
            previousPlay: null,
            roundNumber: 1,
            playSequence: 1,
          },
        },
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const initialResult = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      if (initialResult.decision !== 'COMMITTED_PAUSED') throw new Error('Expected COMMITTED_PAUSED');
      const pausedRoom = initialResult.roomState;
      const finalRegistry = initialResult.processedRegistry;

      // Submit envelope with same actionId but modified expectedRevision
      const modifiedEnvelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 10, // Modified expectedRevision
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };

      const conflictResult = executeTimedClientGameplayWithPresenceLifecycle(
        pausedRoom,
        modifiedEnvelope,
        finalRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        5000,
        new ThrowingRandomSource()
      );

      expect(conflictResult).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('MANDATORY TEST F — unseen action expectedRevision 9 against paused revision 10 returns STALE_REVISION (AC-72, AC-161)', () => {
      // Setup paused room at revision 10
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: {
          ...initRoom.match!,
          players: { p1: p1State, p2: p2State, p3: p3State },
          seatOrder: ['p1', 'p2', 'p3'],
          round: {
            ...initRoom.match!.round,
            tableRank: 'ACE',
            currentPlayerId: 'p1',
            previousPlay: null,
            roundNumber: 1,
            playSequence: 1,
          },
        },
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const initialResult = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      if (initialResult.decision !== 'COMMITTED_PAUSED') throw new Error('Expected COMMITTED_PAUSED');
      const pausedRoom = initialResult.roomState;
      const finalRegistry = initialResult.processedRegistry;
      expect(pausedRoom.revision).toBe(10);

      // New unseen action with expectedRevision = 9 (stale revision against pausedRoom.revision = 10)
      const unseenStaleEnvelope: GameplayActionEnvelope = {
        actionId: 'unseen-action-1',
        expectedRevision: 9,
        turnId: 'turn-9',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p2-c1'] },
      };
      const p2Actor: ServerResolvedActor = { playerId: 'p2' };

      const staleResult = executeTimedClientGameplayWithPresenceLifecycle(
        pausedRoom,
        unseenStaleEnvelope,
        finalRegistry,
        p2Actor,
        preparedTurn,
        presenceRegistry,
        5000,
        new ThrowingRandomSource()
      );

      expect(staleResult).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });

    it('MANDATORY TEST G — unseen action expectedRevision 10 against paused revision 10 returns MATCH_NOT_ACTIVE (AC-73, AC-161)', () => {
      // Setup paused room at revision 10
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: {
          ...initRoom.match!,
          players: { p1: p1State, p2: p2State, p3: p3State },
          seatOrder: ['p1', 'p2', 'p3'],
          round: {
            ...initRoom.match!.round,
            tableRank: 'ACE',
            currentPlayerId: 'p1',
            previousPlay: null,
            roundNumber: 1,
            playSequence: 1,
          },
        },
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const initialResult = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      if (initialResult.decision !== 'COMMITTED_PAUSED') throw new Error('Expected COMMITTED_PAUSED');
      const pausedRoom = initialResult.roomState;
      const finalRegistry = initialResult.processedRegistry;
      expect(pausedRoom.revision).toBe(10);
      expect(pausedRoom.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');

      // New unseen action with matching expectedRevision = 10 (lifecycle MATCH_NOT_ACTIVE)
      const unseenAction: GameplayActionEnvelope = {
        actionId: 'unseen-action-2',
        expectedRevision: 10,
        turnId: 'turn-9',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p2-c1'] },
      };
      const p2Actor: ServerResolvedActor = { playerId: 'p2' };

      const pausedRejectResult = executeTimedClientGameplayWithPresenceLifecycle(
        pausedRoom,
        unseenAction,
        finalRegistry,
        p2Actor,
        preparedTurn,
        presenceRegistry,
        5000,
        new ThrowingRandomSource()
      );

      expect(pausedRejectResult).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });
    });

    it('MANDATORY TEST H — client action finishes Match with zero presence -> COMMITTED_FINISHED (1 revision, winner preserved, never paused) (AC-17..AC-26, AC-85, AC-86, AC-163)', () => {
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);

      // Heads-up fixture where p1 CALL_LIAR catches p2 lying -> p2 shoots LETHAL -> p1 wins!
      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: { p1: p1State, p2: p2State },
        seatOrder: ['p1', 'p2'],
        round: {
          ...initRoom.match!.round,
          tableRank: 'ACE',
          currentPlayerId: 'p1',
          centralPile: [{ id: 'p2-lie', rank: 'KING' }],
          previousPlay: {
            playId: 1,
            playerId: 'p2',
            count: 1,
            claimedRank: 'ACE',
            cardIds: ['p2-lie'],
            resolved: false,
          },
          roundNumber: 1,
          playSequence: 2,
        },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      // Presence is empty (zero living connections)
      const emptyPresenceRegistry = createRoomPresenceRegistry();

      const envelope: GameplayActionEnvelope = {
        actionId: 'call-win-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        emptyPresenceRegistry,
        2000,
        random
      );

      expect(result.decision).toBe('COMMITTED_FINISHED');
      if (result.decision !== 'COMMITTED_FINISHED') return;

      // Exactly 1 revision: 8 -> 9 (Pause is NEVER called!)
      expect(result.actionResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.lifecycle).toBe('MATCH_FINISHED');
      expect(result.roomState.match!.status).toBe('FINISHED');
      expect(result.roomState.match!.winnerId).toBe('p1');

      // Processed registry contains record at revision 9
      expect(result.processedRegistry['call-win-1']).toBeDefined();
      expect(result.processedRegistry['call-win-1'].resultingRevision).toBe(9);

      // Timing and turn cleared on finish
      expect(result.roomState.currentTurnId).toBeNull();
      expect(result.roomState.currentTurnDeadline).toBeNull();
      expect(result.roomState.activeAlarm).toBeNull();
    });

    it('MANDATORY TEST I — exact deadline unseen action returns DEADLINE_DUE without processed record or Pause (AC-12, AC-89..AC-92, AC-164)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-due-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();
      const presenceRegistry = createRoomPresenceRegistry();
      const roomCopy = JSON.parse(JSON.stringify(roomState));

      // Exact deadline: now = 31000
      const result = executeTimedClientGameplayWithPresenceLifecycle(
        roomState,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        deadlineMs, // 31000
        random
      );

      expect(result).toEqual({ decision: 'DEADLINE_DUE' });
      expect(processedRegistry['act-due-1']).toBeUndefined();
      expect(roomState).toEqual(roomCopy);
    });

    it('MANDATORY TEST J — exact duplicate after deadline returns DUPLICATE (AC-93, AC-94)', () => {
      const { roomState, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-dup-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      let processedRegistry = createProcessedGameplayActionRegistry();

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(roomState, presenceRegistry, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      // Commit action successfully before deadline
      const firstResult = executeTimedClientGameplayWithPresenceLifecycle(
        roomState,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      expect(firstResult.decision).toBe('COMMITTED_ACTIVE');
      if (firstResult.decision !== 'COMMITTED_ACTIVE') return;

      const nextRoom = firstResult.roomState;
      processedRegistry = firstResult.processedRegistry;

      // Now retry AFTER deadline passes (e.g. at 50000ms > 32000ms deadline)
      const duplicateResult = executeTimedClientGameplayWithPresenceLifecycle(
        nextRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        50000,
        new ThrowingRandomSource()
      );

      expect(duplicateResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 9,
      });
    });

    it('MANDATORY TEST K — another Living Player remains connected after acting player eliminated -> COMMITTED_ACTIVE (AC-87, AC-88)', () => {
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // p1 is current, plays lie, p2 forced call -> p1 eliminated. p2 and p3 remain ALIVE.
      const p1State: PlayerState = {
        id: 'p1',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: 'p2',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p3State: PlayerState = {
        id: 'p3',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const armedRoom = armActiveTurnDeadline({
        ...initRoom,
        match: {
          ...initRoom.match!,
          players: { p1: p1State, p2: p2State, p3: p3State },
          seatOrder: ['p1', 'p2', 'p3'],
          round: {
            ...initRoom.match!.round,
            tableRank: 'ACE',
            currentPlayerId: 'p1',
            previousPlay: null,
            roundNumber: 1,
            playSequence: 1,
          },
        },
        currentTurnDeadline: null,
        activeAlarm: null,
      }, 1000);

      // BOTH p1 and living player p2 are connected
      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-elim-p1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['p1-lie'] },
      };
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        armedRoom,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      // Because living player p2 is connected, room remains ACTIVE!
      expect(result.decision).toBe('COMMITTED_ACTIVE');
      if (result.decision !== 'COMMITTED_ACTIVE') return;

      expect(result.actionResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.lifecycle).toBe('MATCH_ACTIVE');
      expect(result.roomState.match!.players.p1.lifeStatus).toBe('ELIMINATED');
      expect(result.roomState.match!.players.p2.lifeStatus).toBe('ALIVE');
    });

    it('MANDATORY TEST L — input purity and immutability across execution (AC-117..AC-124)', () => {
      const { roomState, random } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'purity-act-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(roomState, presenceRegistry, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      // Snapshot copies of all inputs
      const roomCopy = JSON.parse(JSON.stringify(roomState));
      const envelopeCopy = JSON.parse(JSON.stringify(envelope));
      const actorCopy = JSON.parse(JSON.stringify(actor));
      const preparedTurnCopy = JSON.parse(JSON.stringify(preparedTurn));
      const registryCopy = JSON.parse(JSON.stringify(processedRegistry));
      const presenceCopy = JSON.parse(JSON.stringify(presenceRegistry));

      executeTimedClientGameplayWithPresenceLifecycle(
        roomState,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        random
      );

      // Verify no input mutation
      expect(roomState).toEqual(roomCopy);
      expect(envelope).toEqual(envelopeCopy);
      expect(actor).toEqual(actorCopy);
      expect(preparedTurn).toEqual(preparedTurnCopy);
      expect(processedRegistry).toEqual(registryCopy);
      expect(presenceRegistry).toEqual(presenceCopy);
    });
  });

  describe('Non-COMMITTED Rejection Pass-Through (AC-10, AC-13..AC-16)', () => {
    it('passes through ACTOR_NOT_CURRENT_PLAYER without invoking Pause or creating revision', () => {
      const { roomState } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const currentPlayerId = roomState.match!.round.currentPlayerId;
      const notCurrentPlayer = currentPlayerId === 'p1' ? 'p2' : 'p1';

      const envelope: GameplayActionEnvelope = {
        actionId: 'reject-1',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[notCurrentPlayer].hand[0].id] },
      };
      const actor: ServerResolvedActor = { playerId: notCurrentPlayer };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();
      const presenceRegistry = createRoomPresenceRegistry();

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        roomState,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTOR_NOT_CURRENT_PLAYER',
      });
    });

    it('passes through ACTOR_NOT_MEMBER without invoking Pause or creating revision', () => {
      const { roomState } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      const envelope: GameplayActionEnvelope = {
        actionId: 'reject-2',
        expectedRevision: 8,
        turnId: 'turn-8',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['some-card'] },
      };
      const actor: ServerResolvedActor = { playerId: 'stranger' };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const processedRegistry = createProcessedGameplayActionRegistry();
      const presenceRegistry = createRoomPresenceRegistry();

      const result = executeTimedClientGameplayWithPresenceLifecycle(
        roomState,
        envelope,
        processedRegistry,
        actor,
        preparedTurn,
        presenceRegistry,
        2000,
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTOR_NOT_MEMBER',
      });
    });
  });
});
