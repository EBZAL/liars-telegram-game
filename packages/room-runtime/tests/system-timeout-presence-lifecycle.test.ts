import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource, PlayerState } from '@liars-telegram-game/game-core';

import {
  executeSystemTimeoutWithPresenceLifecycle,
  executeSystemTimeoutDeadlineTransaction,
  armActiveTurnDeadline,
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
  resumePausedMatchForLivingPresenceTransition,
  TURN_DURATION_MS,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  ServerTurnDeadlineTrigger,
  ServerPreparedNextTurn,
  RoomMember,
  RoomPresenceRegistry,
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

describe('T-026 System Timeout Presence Lifecycle Composition', () => {
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
    it('exports executeSystemTimeoutWithPresenceLifecycle from room-runtime (AC-01, AC-02)', () => {
      expect(typeof executeSystemTimeoutWithPresenceLifecycle).toBe('function');
    });
  });

  describe('Mandatory Direct Tests A..I', () => {
    it('MANDATORY TEST A — stale timeout trigger returns STALE_ALARM without Pause or extra revision (AC-09, AC-13, AC-14)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const staleTrigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 7, // Stale generation mismatch
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const presenceRegistry = createRoomPresenceRegistry();
      const throwingRandom = new ThrowingRandomSource();
      const roomCopy = JSON.parse(JSON.stringify(roomState));

      const result = executeSystemTimeoutWithPresenceLifecycle(
        roomState,
        staleTrigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs + 5000,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'STALE_ALARM' });
      expect(roomState).toEqual(roomCopy);
      expect(roomState.revision).toBe(8);
      expect(roomState.currentTurnDeadline).toBe(31000);
      expect(roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      });
    });

    it('MANDATORY TEST B — exact trigger before deadline returns NOT_DUE with room unchanged (AC-10, AC-13, AC-14)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const presenceRegistry = createRoomPresenceRegistry();
      const throwingRandom = new ThrowingRandomSource();
      const roomCopy = JSON.parse(JSON.stringify(roomState));

      // now = 30999 (deadline - 1ms)
      const result = executeSystemTimeoutWithPresenceLifecycle(
        roomState,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs - 1,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'NOT_DUE' });
      expect(roomState).toEqual(roomCopy);
      expect(roomState.revision).toBe(8);
      expect(roomState.currentTurnDeadline).toBe(31000);
      expect(roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      });
    });

    it('MANDATORY TEST C — due timeout, Match continues, Living connection remains -> COMMITTED_ACTIVE with 1 revision increment (AC-23..AC-30, AC-114)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      // Living player p2 is connected
      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(roomState, presenceRegistry, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      // now = 31000 (due)
      const result = executeSystemTimeoutWithPresenceLifecycle(
        roomState,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs,
        random
      );

      expect(result.decision).toBe('COMMITTED_ACTIVE');
      if (result.decision !== 'COMMITTED_ACTIVE') return;

      // Exactly 1 revision increment: 8 -> 9
      expect(result.timeoutResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.lifecycle).toBe('MATCH_ACTIVE');
      expect(result.roomState.currentTurnId).toBe('turn-9');

      // Re-armed deadline = 31000 + 30000 = 61000
      expect(result.roomState.currentTurnDeadline).toBe(61000);
      expect(result.roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 61000,
        generation: 9,
      });

      // Internal metadata preserved
      expect(result.timedOutPlayerId).toBeDefined();
      expect(result.autoPlayedCardId).toBeDefined();
    });

    it('MANDATORY TEST D & E — due timeout, authoritative Core eliminates only connected Living Player, Match remains IN_PROGRESS -> COMMITTED_PAUSED (2 revisions) with same registry (AC-31..AC-49, AC-115, AC-116)', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // Canonical 3-player elimination fixture:
      // p1 is current player with 1 card (KING) on ACE table. Revolver starts with LETHAL.
      // p2 is ALIVE with 1 card (ACE).
      // p3 is ALIVE with 0 cards (EMPTY_SAFE).
      // When p1 plays final card, p2 automatically CALLs p1 (sole remaining cardholder).
      // p1's Lie is caught -> p1 shoots -> LETHAL -> p1 is ELIMINATED!
      // p2 and p3 remain ALIVE -> Match continues IN_PROGRESS (status: 'IN_PROGRESS', winnerId: null).
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

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      const result = executeSystemTimeoutWithPresenceLifecycle(
        armedRoom,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs,
        random
      );

      // Verify COMMITTED_PAUSED outcome
      expect(result.decision).toBe('COMMITTED_PAUSED');
      if (result.decision !== 'COMMITTED_PAUSED') return;

      // Two distinct revision increments:
      // First revision: T-023 timeout Core transition: 8 -> 9
      // Second revision: T-025 ACTIVE -> PAUSED lifecycle transition: 9 -> 10
      expect(result.timeoutResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(10);
      expect(result.roomState.revision).toBe(10);

      // Lifecycle & timing properties of paused result
      expect(result.roomState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(result.roomState.match?.status).toBe('IN_PROGRESS');
      expect(result.roomState.match?.winnerId).toBeNull();
      expect(result.roomState.currentTurnId).toBe('turn-9');
      expect(result.roomState.currentTurnDeadline).toBeNull();
      expect(result.roomState.activeAlarm).toBeNull();

      // Metadata preserved
      expect(result.timedOutPlayerId).toBe('p1');
      expect(result.autoPlayedCardId).toBe('p1-lie');

      // Living players in resulting match: p1 is ELIMINATED, p2 and p3 are ALIVE
      expect(result.roomState.match?.players['p1']?.lifeStatus).toBe('ELIMINATED');
      expect(result.roomState.match?.players['p2']?.lifeStatus).toBe('ALIVE');
      expect(result.roomState.match?.players['p3']?.lifeStatus).toBe('ALIVE');

      // MANDATORY TEST E proof: presenceRegistry itself remained unchanged
      expect(JSON.parse(JSON.stringify(presenceRegistry))).toEqual(registryBeforeCopy);
    });

    it('MANDATORY TEST F — timeout finishes Match -> COMMITTED_FINISHED has absolute precedence over zero-Living Pause (AC-15..AC-22, AC-50, AC-51, AC-117)', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);

      // 1v1 state where p1 plays Lie -> p2 CALLs -> p1 eliminated by LETHAL -> p2 wins Match
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

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: { p1: p1State, p2: p2State },
        seatOrder: ['p1', 'p2'],
        round: {
          ...initRoom.match!.round,
          tableRank: 'ACE',
          currentPlayerId: 'p1',
          previousPlay: null,
        },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      // Presence registry is completely EMPTY (zero connected living players)
      const emptyRegistry = createRoomPresenceRegistry();

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      const result = executeSystemTimeoutWithPresenceLifecycle(
        armedRoom,
        trigger,
        preparedTurn,
        emptyRegistry,
        deadlineMs,
        random
      );

      // Finished precedence: MUST NOT pause, MUST remain MATCH_FINISHED
      expect(result.decision).toBe('COMMITTED_FINISHED');
      if (result.decision !== 'COMMITTED_FINISHED') return;

      expect(result.timeoutResultingRevision).toBe(9);
      expect(result.finalResultingRevision).toBe(9); // Only 1 revision increment
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.lifecycle).toBe('MATCH_FINISHED');
      expect(result.roomState.match?.status).toBe('FINISHED');
      expect(result.roomState.match?.winnerId).toBe('p2');
      expect(result.roomState.currentTurnId).toBeNull();
      expect(result.roomState.currentTurnDeadline).toBeNull();
      expect(result.roomState.activeAlarm).toBeNull();
    });

    it('MANDATORY TEST G — replay original trigger after COMMITTED_PAUSED returns STALE_ALARM with zero Core timeout (AC-52..AC-54, AC-119)', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // Setup 3-player post-elimination pause scenario
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
        round: { ...initRoom.match!.round, tableRank: 'ACE', currentPlayerId: 'p1', previousPlay: null },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(armedRoom, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      // Execute timeout + pause composition
      const pausedResult = executeSystemTimeoutWithPresenceLifecycle(
        armedRoom,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs,
        random
      );
      expect(pausedResult.decision).toBe('COMMITTED_PAUSED');
      if (pausedResult.decision !== 'COMMITTED_PAUSED') return;

      expect(pausedResult.roomState.revision).toBe(10);
      expect(pausedResult.roomState.activeAlarm).toBeNull();

      // Replay original generation-8 trigger against final paused room using T-023
      const replayResult = executeSystemTimeoutDeadlineTransaction(
        pausedResult.roomState,
        trigger,
        { turnId: 'turn-10' },
        deadlineMs + 5000,
        new ThrowingRandomSource() // zero RNG
      );

      expect(replayResult).toEqual({ decision: 'STALE_ALARM' });
    });

    it('MANDATORY TEST H — Resume composed paused result with exact 0 -> 1 Living reconnect preserves turnId with fresh +30000 deadline (AC-55..AC-58, AC-120)', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);

      // Setup 3-player post-elimination pause scenario
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
        round: { ...initRoom.match!.round, tableRank: 'ACE', currentPlayerId: 'p1', previousPlay: null },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      let initialRegistry = createRoomPresenceRegistry();
      initialRegistry = registerAuthenticatedRoomConnection(armedRoom, initialRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      const pausedResult = executeSystemTimeoutWithPresenceLifecycle(
        armedRoom,
        trigger,
        preparedTurn,
        initialRegistry,
        deadlineMs,
        random
      );
      expect(pausedResult.decision).toBe('COMMITTED_PAUSED');
      if (pausedResult.decision !== 'COMMITTED_PAUSED') return;

      const pausedRoom = pausedResult.roomState;
      expect(pausedRoom.revision).toBe(10);
      expect(pausedRoom.currentTurnId).toBe('turn-9');

      // Now Living player p2 reconnects (exact Living transition 0 -> 1)
      const resumeRegistry = registerAuthenticatedRoomConnection(pausedRoom, initialRegistry, {
        connectionId: 'c-p2',
        playerId: 'p2',
      });

      const authoritativeResumeTimeMs = 90000;
      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        pausedRoom,
        initialRegistry, // before: Living count is 0 because p1 is eliminated
        resumeRegistry,  // after: Living count is 1 because p2 connected
        authoritativeResumeTimeMs
      );

      expect(resumeResult.status).toBe('RESUMED');
      if (resumeResult.status !== 'RESUMED') return;

      // Resumed revision increments from 10 to 11
      expect(resumeResult.resultingRevision).toBe(11);
      expect(resumeResult.roomState.revision).toBe(11);
      expect(resumeResult.roomState.lifecycle).toBe('MATCH_ACTIVE');

      // Preserves same prepared next turnId created by T-023
      expect(resumeResult.roomState.currentTurnId).toBe('turn-9');

      // Fresh deadline at 90000 + 30000 = 120000
      expect(resumeResult.roomState.currentTurnDeadline).toBe(120000);
      expect(resumeResult.roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 120000,
        generation: 11,
      });
    });

    it('MANDATORY TEST I — input purity: verifies Room, Match, Hands, trigger, preparedTurn, registry unmutated (AC-81..AC-86)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2', 'p3'], 8, 'turn-8', 1000);
      const roomCopy = JSON.stringify(roomState);

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };
      const triggerCopy = JSON.stringify(trigger);

      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const preparedTurnCopy = JSON.stringify(preparedTurn);

      let presenceRegistry = createRoomPresenceRegistry();
      presenceRegistry = registerAuthenticatedRoomConnection(roomState, presenceRegistry, {
        connectionId: 'c-p1',
        playerId: 'p1',
      });
      const registryCopy = JSON.stringify(presenceRegistry);

      executeSystemTimeoutWithPresenceLifecycle(
        roomState,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs,
        random
      );

      expect(JSON.stringify(roomState)).toBe(roomCopy);
      expect(JSON.stringify(trigger)).toBe(triggerCopy);
      expect(JSON.stringify(preparedTurn)).toBe(preparedTurnCopy);
      expect(JSON.stringify(presenceRegistry)).toBe(registryCopy);
    });
  });

  describe('Non-COMMITTED Pass-Through & Fail-Closed Guards (AC-11, AC-12, AC-59, AC-60)', () => {
    it('passes through NOT_APPLICABLE and INVALID_STATE without extra revision or RNG (AC-11..AC-14)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const presenceRegistry = createRoomPresenceRegistry();

      // NOT_APPLICABLE room (e.g. null match)
      const notApplicableRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        lifecycle: 'LOBBY',
        match: null,
      };
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      const resultNA = executeSystemTimeoutWithPresenceLifecycle(
        notApplicableRoom,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs,
        new ThrowingRandomSource()
      );
      expect(resultNA).toEqual({ decision: 'NOT_APPLICABLE' });

      // INVALID_STATE room (e.g. active without currentTurnDeadline)
      const invalidRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        currentTurnDeadline: null,
        activeAlarm: { kind: 'TURN_DEADLINE', dueAt: deadlineMs, generation: 8 },
      };

      const resultInvalid = executeSystemTimeoutWithPresenceLifecycle(
        invalidRoom,
        trigger,
        preparedTurn,
        presenceRegistry,
        deadlineMs,
        new ThrowingRandomSource()
      );
      expect(resultInvalid).toEqual({ decision: 'INVALID_STATE' });
    });
  });
});
