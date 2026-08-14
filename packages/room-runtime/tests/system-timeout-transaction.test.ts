import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource, PlayerState } from '@liars-telegram-game/game-core';

import {
  executeSystemTimeoutDeadlineTransaction,
  executeTimedClientGameplayTransaction,
  armActiveTurnDeadline,
  createProcessedGameplayActionRegistry,
  TURN_DURATION_MS,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  ServerTurnDeadlineTrigger,
  ServerPreparedNextTurn,
  RoomMember,
  GameplayActionEnvelope,
  ServerResolvedActor,
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

describe('System Timeout Deadline Transaction (T-023)', () => {
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

  describe('API Exports & Trigger Validation (AC-01..AC-08)', () => {
    it('exports executeSystemTimeoutDeadlineTransaction (AC-01, AC-02)', () => {
      expect(typeof executeSystemTimeoutDeadlineTransaction).toBe('function');
    });

    it('validates trigger shape and fails closed on malformed triggers (AC-03..AC-06)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom();
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-next' };

      // Null trigger
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          null as unknown as ServerTurnDeadlineTrigger,
          preparedTurn,
          deadlineMs,
          random
        )
      ).toThrow(/Invalid ServerTurnDeadlineTrigger/);

      // Wrong kind
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          { kind: 'HOST_GRACE' as unknown as 'TURN_DEADLINE', dueAt: deadlineMs, generation: 8 },
          preparedTurn,
          deadlineMs,
          random
        )
      ).toThrow(/Invalid ServerTurnDeadlineTrigger/);

      // Invalid dueAt
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          { kind: 'TURN_DEADLINE', dueAt: -1, generation: 8 },
          preparedTurn,
          deadlineMs,
          random
        )
      ).toThrow(/Invalid ServerTurnDeadlineTrigger/);

      // Invalid generation
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          { kind: 'TURN_DEADLINE', dueAt: deadlineMs, generation: 1.5 },
          preparedTurn,
          deadlineMs,
          random
        )
      ).toThrow(/Invalid ServerTurnDeadlineTrigger/);

      // Invalid authoritativeNowMs
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          { kind: 'TURN_DEADLINE', dueAt: deadlineMs, generation: 8 },
          preparedTurn,
          -100,
          random
        )
      ).toThrow(/Invalid authoritativeNowMs/);
    });
  });

  describe('Mandatory Scenarios A, B, C: Exact Due Boundaries (AC-18..AC-24, AC-111)', () => {
    it('MANDATORY TEST A — exact alarm before deadline returns NOT_DUE with zero RNG and state unchanged (AC-19, AC-22..AC-24)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const throwingRandom = new ThrowingRandomSource();
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      // now = 30999 (deadline - 1ms)
      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        deadlineMs - 1,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'NOT_DUE' });
      expect(roomState).toEqual(roomStateCopy);
      expect(roomState.revision).toBe(8);
      expect(roomState.currentTurnDeadline).toBe(31000);
      expect(roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 8,
      });
    });

    it('MANDATORY TEST B — exact alarm at deadline (now == deadline) commits timeout exactly once and arms next turn at T + 30000 (AC-20, AC-31, AC-38, AC-48..AC-53, AC-111, AC-113)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      // now = 31000 (exact deadline)
      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        deadlineMs,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;

      // Revision increments from 8 to 9 exactly once
      expect(result.resultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.lifecycle).toBe('MATCH_ACTIVE');
      expect(result.roomState.currentTurnId).toBe('turn-9');

      // Re-armed deadline = 31000 + 30000 = 61000
      expect(result.roomState.currentTurnDeadline).toBe(61000);
      expect(result.roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 61000,
        generation: 9, // generation equals resultingRevision
      });

      // Internal metadata returned
      expect(result.timedOutPlayerId).toBeDefined();
      expect(result.autoPlayedCardId).toBeDefined();
    });

    it('MANDATORY TEST C — exact alarm after deadline (now = deadline + 1) commits timeout (AC-21)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      // now = 31001
      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        deadlineMs + 1,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;
      expect(result.resultingRevision).toBe(9);
      expect(result.roomState.currentTurnDeadline).toBe(61001); // 31001 + 30000
      expect(result.roomState.activeAlarm?.generation).toBe(9);
    });
  });

  describe('Stale & Retry Idempotency Guards (MANDATORY TESTS D, E, F, G / AC-09..AC-17, AC-60..AC-65, AC-110)', () => {
    it('MANDATORY TEST D — stale generation returns STALE_ALARM with zero RNG (AC-13..AC-16, AC-65)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 7, // mismatch with current generation 8
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const throwingRandom = new ThrowingRandomSource();

      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        deadlineMs + 5000,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'STALE_ALARM' });
    });

    it('MANDATORY TEST E — stale dueAt returns STALE_ALARM with zero RNG (AC-12, AC-14..AC-16, AC-64)', () => {
      const { roomState } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: 30000, // mismatch with current dueAt 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const throwingRandom = new ThrowingRandomSource();

      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        50000,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'STALE_ALARM' });
    });

    it('MANDATORY TEST F — replay old trigger after successful timeout returns STALE_ALARM (AC-60, AC-110)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const gen8Trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };

      // Step 1: Initial timeout commit at 31000ms
      const res1 = executeSystemTimeoutDeadlineTransaction(
        roomState,
        gen8Trigger,
        preparedTurn,
        deadlineMs,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      expect(res1.resultingRevision).toBe(9);
      expect(res1.roomState.activeAlarm?.generation).toBe(9);

      // Step 2: Replay the original generation-8 trigger against new room state (revision 9)
      const replayResult = executeSystemTimeoutDeadlineTransaction(
        res1.roomState,
        gen8Trigger,
        { turnId: 'turn-10' },
        31000,
        new ThrowingRandomSource()
      );

      expect(replayResult).toEqual({ decision: 'STALE_ALARM' });
    });

    it('MANDATORY TEST G — replay old trigger after NEW next-turn deadline has also passed still returns STALE_ALARM (AC-61, AC-62, AC-110)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const gen8Trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };

      // Step 1: Timeout commits turn 8 -> new deadline is 61000ms, generation is 9
      const res1 = executeSystemTimeoutDeadlineTransaction(
        roomState,
        gen8Trigger,
        { turnId: 'turn-9' },
        deadlineMs,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      expect(res1.roomState.currentTurnDeadline).toBe(61000);
      expect(res1.roomState.activeAlarm?.generation).toBe(9);

      // Step 2: Replay old generation-8 trigger at now = 65000 (well after the new turn deadline 61000)
      const replayResult = executeSystemTimeoutDeadlineTransaction(
        res1.roomState,
        gen8Trigger,
        { turnId: 'turn-10' },
        65000, // new deadline has passed!
        new ThrowingRandomSource() // must NOT execute timeout or consume RNG
      );

      // Old trigger MUST NEVER timeout the second turn
      expect(replayResult).toEqual({ decision: 'STALE_ALARM' });
    });

    it('returns STALE_ALARM when activeAlarm is null or wrong kind (AC-10, AC-11)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      // Null alarm
      const nullAlarmRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        activeAlarm: null,
      };
      expect(
        executeSystemTimeoutDeadlineTransaction(
          nullAlarmRoom,
          trigger,
          { turnId: 'turn-9' },
          deadlineMs,
          new ThrowingRandomSource()
        )
      ).toEqual({ decision: 'STALE_ALARM' });

      // Wrong alarm kind
      const hostGraceRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        activeAlarm: {
          kind: 'HOST_GRACE',
          dueAt: deadlineMs,
          generation: 8,
        },
      };
      expect(
        executeSystemTimeoutDeadlineTransaction(
          hostGraceRoom,
          trigger,
          { turnId: 'turn-9' },
          deadlineMs,
          new ThrowingRandomSource()
        )
      ).toEqual({ decision: 'STALE_ALARM' });
    });

    it('STALE_ALARM does not validate preparedNextTurn (AC-17)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const staleTrigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 7, // stale
      };

      // Invalid preparedNextTurn (empty turnId) does NOT throw because trigger is STALE
      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        staleTrigger,
        { turnId: '' },
        deadlineMs,
        new ThrowingRandomSource()
      );

      expect(result).toEqual({ decision: 'STALE_ALARM' });
    });
  });

  describe('Core Timeout Delegation & Metadata (MANDATORY TEST H / AC-31..AC-37)', () => {
    it('MANDATORY TEST H — Core derives timedOutPlayerId and selects autoPlayedCardId from authoritative hand (AC-31..AC-37)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const currentActorId = roomState.match!.round.currentPlayerId;
      const originalHand = [...roomState.match!.players[currentActorId].hand];

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      const result = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        { turnId: 'turn-9' },
        deadlineMs,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;

      expect(result.timedOutPlayerId).toBe(currentActorId);
      expect(originalHand.some((c) => c.id === result.autoPlayedCardId)).toBe(true);

      // Core Hand decreased by 1
      const updatedHand = result.roomState.match!.players[currentActorId].hand;
      expect(updatedHand.length).toBe(originalHand.length - 1);
      expect(updatedHand.some((c) => c.id === result.autoPlayedCardId)).toBe(false);
    });
  });

  describe('Downstream Forced Call & Next Round / Match Finish (MANDATORY TESTS I, J / AC-42..AC-58, AC-112..AC-114)', () => {
    it('MANDATORY TEST I — timeout causing forced Core resolution / next Round increments revision only once (AC-38, AC-53, AC-112)', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p2Id = p1Id === 'p1' ? 'p2' : 'p1';

      // Setup 1v1 state where P1 has 1 card left and P2 has 1 card left -> P1 timeout plays final card -> forced P2 CALL
      const p1State: PlayerState = {
        id: p1Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: p2Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: { [p1Id]: p1State, [p2Id]: p2State },
        round: { ...initRoom.match!.round, tableRank: 'ACE', currentPlayerId: p1Id, previousPlay: null },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      const result = executeSystemTimeoutDeadlineTransaction(
        armedRoom,
        trigger,
        { turnId: 'turn-9' },
        deadlineMs,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;

      // Crucial: exactly 1 revision increment despite auto-CALL + Shot + next-Round reset
      expect(result.resultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);
      expect(result.roomState.currentTurnId).toBe('turn-9');
      expect(result.roomState.currentTurnDeadline).toBe(61000);
      expect(result.roomState.activeAlarm?.generation).toBe(9);
    });

    it('MANDATORY TEST J — timeout causing Match finish maps to MATCH_FINISHED without turn alarm (AC-54..AC-58, AC-63, AC-114)', () => {
      const { roomState: initRoom, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p2Id = p1Id === 'p1' ? 'p2' : 'p1';

      // Setup 1v1 state where P1 timeout plays 1 KING (Lie on ACE table) -> forced P2 CALL -> P1 eliminated by LETHAL
      const p1State: PlayerState = {
        id: p1Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1-lie', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: p2Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: { [p1Id]: p1State, [p2Id]: p2State },
        round: { ...initRoom.match!.round, tableRank: 'ACE', currentPlayerId: p1Id, previousPlay: null },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      const result = executeSystemTimeoutDeadlineTransaction(
        armedRoom,
        trigger,
        { turnId: 'turn-9' },
        deadlineMs,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;

      // Invariants on finished match
      expect(result.roomState.lifecycle).toBe('MATCH_FINISHED');
      expect(result.roomState.match!.status).toBe('FINISHED');
      expect(result.roomState.match!.winnerId).toBe(p2Id);
      expect(result.roomState.currentTurnId).toBeNull();
      expect(result.roomState.currentTurnDeadline).toBeNull();
      expect(result.roomState.activeAlarm).toBeNull();
      expect(result.resultingRevision).toBe(9);
      expect(result.roomState.revision).toBe(9);

      // Old trigger replay against finished match returns STALE_ALARM (AC-63)
      const replayResult = executeSystemTimeoutDeadlineTransaction(
        result.roomState,
        trigger,
        { turnId: 'turn-10' },
        deadlineMs + 5000,
        new ThrowingRandomSource()
      );
      expect(replayResult).toEqual({ decision: 'STALE_ALARM' });
    });
  });

  describe('Defensive & Fail-Closed Guards (MANDATORY TEST K / AC-27..AC-30, AC-66..AC-68, AC-115)', () => {
    it('MANDATORY TEST K — propagates Core rejection on mandatory CALL-only state with zero Room mutation and no auto-CALL (AC-66..AC-68, AC-115)', () => {
      const { roomState: initRoom, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p2Id = p1Id === 'p1' ? 'p2' : 'p1';

      // Setup fixture where P1 is already in mandatory CALL_LIAR state (e.g. P2 played final card)
      const customMatch: MatchState = {
        ...initRoom.match!,
        players: {
          [p1Id]: {
            id: p1Id,
            lifeStatus: 'ALIVE',
            roundStatus: 'WITH_CARDS',
            hand: [{ id: 'p1-c1', rank: 'ACE' }],
            revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
          },
          [p2Id]: {
            id: p2Id,
            lifeStatus: 'ALIVE',
            roundStatus: 'EMPTY_PENDING_CHALLENGE',
            hand: [],
            revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
          },
        },
        round: {
          ...initRoom.match!.round,
          currentPlayerId: p1Id,
          previousPlay: {
            playId: 1,
            playerId: p2Id,
            cardIds: ['p2-final'],
            count: 1,
            claimedRank: 'ACE',
            resolved: false,
          },
        },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);
      const roomCopy = JSON.parse(JSON.stringify(armedRoom));

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      // In mandatory CALL state, applySystemTimeout rejects before RNG
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          armedRoom,
          trigger,
          { turnId: 'turn-9' },
          deadlineMs,
          new ThrowingRandomSource()
        )
      ).toThrow(/mandatory CALL_LIAR state/);

      // Room state remains completely unmutated
      expect(armedRoom).toEqual(roomCopy);
    });

    it('validates preparedNextTurn before Core dispatch (AC-27, AC-28)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };

      // Empty turnId throws before RNG
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          trigger,
          { turnId: '' },
          deadlineMs,
          new ThrowingRandomSource()
        )
      ).toThrow(/Invalid ServerPreparedNextTurn/);

      // Matching current turnId throws before RNG
      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          trigger,
          { turnId: 'turn-8' },
          deadlineMs,
          new ThrowingRandomSource()
        )
      ).toThrow(/cannot equal current turnId/);
    });

    it('validates nextRoomRevision before Core RNG (AC-29, AC-30)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], Number.MAX_SAFE_INTEGER, 'turn-8', 1000);
      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: Number.MAX_SAFE_INTEGER,
      };

      expect(() =>
        executeSystemTimeoutDeadlineTransaction(
          roomState,
          trigger,
          { turnId: 'turn-9' },
          deadlineMs,
          new ThrowingRandomSource()
        )
      ).toThrow(/Invalid revision input/);
    });
  });

  describe('Sequential Race Precedence (MANDATORY TEST L / AC-87, AC-88)', () => {
    it('MANDATORY TEST L — committed timeout advances revision so old unseen client command cannot override timeout (AC-87, AC-88)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const p1ActorId = roomState.match!.round.currentPlayerId;
      const p1Actor: ServerResolvedActor = { playerId: p1ActorId };
      const cardToPlay = roomState.match!.players[p1ActorId].hand[0];

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs, // 31000
        generation: 8,
      };

      // Step 1: Timeout commits at 31000ms
      const timeoutResult = executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        { turnId: 'turn-9' },
        deadlineMs,
        random
      );
      expect(timeoutResult.decision).toBe('COMMITTED');
      if (timeoutResult.decision !== 'COMMITTED') return;

      expect(timeoutResult.resultingRevision).toBe(9);
      expect(timeoutResult.roomState.currentTurnId).toBe('turn-9');

      // Step 2: Unseen client action intended for revision 8 / turn-8 arrives late
      const lateClientEnvelope: GameplayActionEnvelope = {
        actionId: 'late-client-play',
        expectedRevision: 8, // old revision
        turnId: 'turn-8', // old turn
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      const clientResult = executeTimedClientGameplayTransaction(
        timeoutResult.roomState, // new room state at revision 9
        lateClientEnvelope,
        createProcessedGameplayActionRegistry(),
        p1Actor,
        { turnId: 'turn-10' },
        deadlineMs + 50,
        random
      );

      // Client command MUST NOT override committed timeout -> rejected with STALE_REVISION
      expect(clientResult).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });
  });

  describe('Purity & Immutability Guarantees (AC-76..AC-80)', () => {
    it('does not mutate input roomState, match, hands, trigger, or preparedNextTurn on NOT_DUE, STALE_ALARM, or COMMITTED', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 8, 'turn-8', 1000);
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      const trigger: ServerTurnDeadlineTrigger = {
        kind: 'TURN_DEADLINE',
        dueAt: deadlineMs,
        generation: 8,
      };
      const triggerCopy = JSON.parse(JSON.stringify(trigger));
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-9' };
      const preparedTurnCopy = JSON.parse(JSON.stringify(preparedTurn));

      // NOT_DUE test
      executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        deadlineMs - 5000,
        random
      );
      expect(roomState).toEqual(roomStateCopy);
      expect(trigger).toEqual(triggerCopy);
      expect(preparedTurn).toEqual(preparedTurnCopy);

      // STALE test
      executeSystemTimeoutDeadlineTransaction(
        roomState,
        { ...trigger, generation: 99 },
        preparedTurn,
        deadlineMs,
        random
      );
      expect(roomState).toEqual(roomStateCopy);

      // COMMITTED test
      executeSystemTimeoutDeadlineTransaction(
        roomState,
        trigger,
        preparedTurn,
        deadlineMs,
        random
      );
      expect(roomState).toEqual(roomStateCopy);
      expect(trigger).toEqual(triggerCopy);
      expect(preparedTurn).toEqual(preparedTurnCopy);
    });
  });
});
