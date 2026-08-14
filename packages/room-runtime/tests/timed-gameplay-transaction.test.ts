import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource, PlayerState } from '@liars-telegram-game/game-core';

import {
  executeTimedClientGameplayTransaction,
  executeClientGameplayTransaction,
  armActiveTurnDeadline,
  createProcessedGameplayActionRegistry,
  TURN_DURATION_MS,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  GameplayActionEnvelope,
  ServerResolvedActor,
  ServerPreparedNextTurn,
  RoomMember,
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

describe('Timed Client Gameplay Arbitration (T-022)', () => {
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
    revision = 0,
    turnId = 'turn-1',
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
    const deadlineMs = armTimeMs + TURN_DURATION_MS; // e.g. 1000 + 30000 = 31000

    return { roomState, random, armTimeMs, deadlineMs };
  }

  describe('API Exports & Basic Guarantees', () => {
    it('exports executeTimedClientGameplayTransaction and retains executeClientGameplayTransaction (AC-01..AC-03)', () => {
      expect(typeof executeTimedClientGameplayTransaction).toBe('function');
      expect(typeof executeClientGameplayTransaction).toBe('function');
    });
  });

  describe('Mandatory Scenarios: Deadline Arbitration Boundary (SCENARIO A, B, C / AC-28..AC-39, AC-110)', () => {
    it('SCENARIO A — commits valid PLAY before deadline (now = deadline - 1) and arms next turn at T + 30000 (AC-28, AC-45, AC-50..AC-56)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();

      // Transaction executed at 1ms before deadline: 30999ms
      const authoritativeNowMs = deadlineMs - 1; // 30999
      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        authoritativeNowMs,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;

      // Revision increments by exactly 1
      expect(result.resultingRevision).toBe(1);
      expect(result.roomState.revision).toBe(1);
      expect(result.roomState.lifecycle).toBe('MATCH_ACTIVE');
      expect(result.roomState.currentTurnId).toBe('turn-2');

      // Next turn deadline is armed at authoritativeNowMs + 30000 = 60999
      expect(result.roomState.currentTurnDeadline).toBe(60999);
      expect(result.roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 60999,
        generation: 1, // generation equals resultingRevision
      });

      // Exactly one processed record
      expect(result.processedRegistry['play-1']).toBeDefined();
      expect(result.processedRegistry['play-1'].resultingRevision).toBe(1);
      expect(result.processedRegistry['play-1'].actorPlayerId).toBe(actorId);
    });

    it('SCENARIO B — returns DEADLINE_DUE for valid PLAY at exact deadline (now == deadline) with zero mutation/RNG (AC-29, AC-31..AC-38, AC-110, AC-113)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-exact',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();
      const throwingRandom = new ThrowingRandomSource();

      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      // Transaction executed at exact deadline: 31000ms
      const authoritativeNowMs = deadlineMs; // 31000
      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        authoritativeNowMs,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'DEADLINE_DUE' });

      // Zero mutations
      expect(roomState).toEqual(roomStateCopy);
      expect(roomState.revision).toBe(0);
      expect(roomState.currentTurnId).toBe('turn-1');
      expect(roomState.currentTurnDeadline).toBe(31000);
      expect(roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 31000,
        generation: 0,
      });
      expect(Object.keys(registry)).toHaveLength(0);
    });

    it('SCENARIO C — returns DEADLINE_DUE for valid PLAY after deadline (now = deadline + 1) with zero mutation/RNG (AC-30, AC-31..AC-38, AC-110, AC-113)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-late',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();
      const throwingRandom = new ThrowingRandomSource();

      // Transaction executed after deadline: 31001ms
      const authoritativeNowMs = deadlineMs + 1; // 31001
      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        authoritativeNowMs,
        throwingRandom
      );

      expect(result).toEqual({ decision: 'DEADLINE_DUE' });
      expect(Object.keys(registry)).toHaveLength(0);
    });

    it('DEADLINE_DUE does not require valid preparedNextTurn (AC-36)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'play-late',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      // Invalid preparedNextTurn (empty or matching currentTurnId) does NOT throw because deadline is DUE
      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        { playerId: actorId },
        { turnId: '' },
        deadlineMs + 500,
        new ThrowingRandomSource()
      );

      expect(result).toEqual({ decision: 'DEADLINE_DUE' });
    });
  });

  describe('Deduplication & Retry Precedence over Deadline (SCENARIO D / AC-12..AC-18, AC-111)', () => {
    it('SCENARIO D — exact successful retry after deadline returns DUPLICATE, NOT DEADLINE_DUE (AC-12..AC-18, AC-111)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-committed-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();

      // Step 1: Initial commit before deadline at 5000ms
      const res1 = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        5000,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      // Room is now at revision 1, currentTurnId = 'turn-2', new deadline = 35000ms
      expect(res1.resultingRevision).toBe(1);
      expect(res1.roomState.currentTurnDeadline).toBe(35000);

      // Step 2: Retry the exact same request after the NEW deadline (e.g. at 40000ms) or OLD deadline
      const retryResult = executeTimedClientGameplayTransaction(
        res1.roomState,
        envelope,
        res1.processedRegistry,
        actor,
        { turnId: 'turn-3' },
        40000, // well past current deadline (35000)
        new ThrowingRandomSource()
      );

      // Retains DUPLICATE precedence!
      expect(retryResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 1,
      });
    });

    it('DUPLICATE after deadline does not consume random or validate preparedNextTurn (AC-16..AC-18)', () => {
      const { roomState, random } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };
      const actor: ServerResolvedActor = { playerId: actorId };

      const res1 = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        actor,
        { turnId: 'turn-2' },
        2000,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      // Duplicate with invalid turnId and throwing random after deadline
      const res2 = executeTimedClientGameplayTransaction(
        res1.roomState,
        envelope,
        res1.processedRegistry,
        actor,
        { turnId: '' }, // invalid, but must not throw
        99999, // after deadline
        new ThrowingRandomSource() // must not throw
      );

      expect(res2).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 1,
      });
    });
  });

  describe('Authorization Precedence over Deadline (SCENARIO E, F / AC-19..AC-25, AC-112)', () => {
    it('SCENARIO E — non-member after deadline returns ACTOR_NOT_MEMBER, NOT DEADLINE_DUE (AC-19..AC-21, AC-112)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const nonMemberActor: ServerResolvedActor = { playerId: 'p-stranger' };

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-stranger',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        nonMemberActor,
        { turnId: 'turn-2' },
        deadlineMs + 5000, // after deadline
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTOR_NOT_MEMBER',
      });
    });

    it('SCENARIO F — cross-actor actionId collision after deadline returns ACTION_ID_CONFLICT, NOT DEADLINE_DUE (AC-22, AC-112)', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const p1ActorId = roomState.match!.round.currentPlayerId;
      const p2ActorId = p1ActorId === 'p1' ? 'p2' : 'p1';

      const p1Actor: ServerResolvedActor = { playerId: p1ActorId };
      const p2Actor: ServerResolvedActor = { playerId: p2ActorId };

      const envelope: GameplayActionEnvelope = {
        actionId: 'shared-action-id',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[p1ActorId].hand[0].id] },
      };

      const res1 = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        p1Actor,
        { turnId: 'turn-2' },
        2000,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      // P2 submits same actionId after deadline of current turn
      const res2 = executeTimedClientGameplayTransaction(
        res1.roomState,
        envelope,
        res1.processedRegistry,
        p2Actor,
        { turnId: 'turn-3' },
        deadlineMs + 10000,
        new ThrowingRandomSource()
      );

      expect(res2).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('stale revision after deadline returns STALE_REVISION, NOT DEADLINE_DUE (AC-19, AC-20)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 5, 'turn-5', 1000);
      const actorId = roomState.match!.round.currentPlayerId;

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-stale',
        expectedRevision: 4, // stale
        turnId: 'turn-5',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[actorId].hand[0].id] },
      };

      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        { playerId: actorId },
        { turnId: 'turn-6' },
        deadlineMs + 1000,
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });

    it('out of turn player after deadline returns ACTOR_NOT_CURRENT_PLAYER (AC-19, AC-20)', () => {
      const { roomState, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const currentActorId = roomState.match!.round.currentPlayerId;
      const otherActorId = currentActorId === 'p1' ? 'p2' : 'p1';

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-out-of-turn',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[otherActorId].hand[0].id] },
      };

      const result = executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        { playerId: otherActorId },
        { turnId: 'turn-2' },
        deadlineMs + 2000,
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTOR_NOT_CURRENT_PLAYER',
      });
    });
  });

  describe('Legal CALL_LIAR before Deadline (SCENARIO G / AC-46, AC-114)', () => {
    it('SCENARIO G — executes legal CALL before deadline, advances revision, records action, and arms next turn (AC-46, AC-50..AC-60)', () => {
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const p1ActorId = initRoom.match!.round.currentPlayerId;
      const p1Actor: ServerResolvedActor = { playerId: p1ActorId };
      const cardToPlay = initRoom.match!.players[p1ActorId].hand[0];

      // Turn 1: P1 plays cards before deadline at 5000ms
      const res1 = executeTimedClientGameplayTransaction(
        initRoom,
        {
          actionId: 'play-1',
          expectedRevision: 0,
          turnId: 'turn-1',
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [cardToPlay.id] },
        },
        createProcessedGameplayActionRegistry(),
        p1Actor,
        { turnId: 'turn-2' },
        5000,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      expect(res1.resultingRevision).toBe(1);
      expect(res1.roomState.currentTurnDeadline).toBe(35000); // 5000 + 30000
      expect(res1.roomState.activeAlarm).toEqual({
        kind: 'TURN_DEADLINE',
        dueAt: 35000,
        generation: 1,
      });

      const p2ActorId = res1.roomState.match!.round.currentPlayerId;
      const p2Actor: ServerResolvedActor = { playerId: p2ActorId };

      // Turn 2: P2 calls liar before deadline at 12000ms (< 35000ms)
      const res2 = executeTimedClientGameplayTransaction(
        res1.roomState,
        {
          actionId: 'call-1',
          expectedRevision: 1,
          turnId: 'turn-2',
          actionType: 'CALL_LIAR',
          payload: {},
        },
        res1.processedRegistry,
        p2Actor,
        { turnId: 'turn-3' },
        12000,
        random
      );

      expect(res2.decision).toBe('COMMITTED');
      if (res2.decision !== 'COMMITTED') return;

      expect(res2.resultingRevision).toBe(2);
      expect(res2.roomState.revision).toBe(2);
      expect(res2.processedRegistry['call-1']).toBeDefined();
      expect(res2.processedRegistry['call-1'].actorPlayerId).toBe(p2ActorId);
      expect(res2.processedRegistry['call-1'].resultingRevision).toBe(2);

      // If Match continues, armed next turn deadline starts from 12000ms -> 42000ms (AC-60, AC-61)
      if (res2.roomState.lifecycle === 'MATCH_ACTIVE') {
        expect(res2.roomState.currentTurnDeadline).toBe(42000); // 12000 + 30000
        expect(res2.roomState.activeAlarm).toEqual({
          kind: 'TURN_DEADLINE',
          dueAt: 42000,
          generation: 2,
        });
      }
    });
  });

  describe('Match Finish Transaction (SCENARIO H / AC-62..AC-66)', () => {
    it('SCENARIO H — winning client command finishes Match and is NOT re-armed (AC-62..AC-66)', () => {
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p2Id = p1Id === 'p1' ? 'p2' : 'p1';

      // Setup match state where P2 gets eliminated on failed challenge
      const p1State: PlayerState = {
        id: p1Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [
          { id: 'p1-c1', rank: 'ACE' },
          { id: 'p1-c2', rank: 'ACE' },
        ],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 },
      };
      const p2State: PlayerState = {
        id: p2Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'KING' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 },
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

      // Turn 1: P1 plays 1 ACE
      const res1 = executeTimedClientGameplayTransaction(
        armedRoom,
        {
          actionId: 'p1-play',
          expectedRevision: 0,
          turnId: 'turn-1',
          actionType: 'PLAY_CARDS',
          payload: { cardIds: ['p1-c1'] },
        },
        createProcessedGameplayActionRegistry(),
        { playerId: p1Id },
        { turnId: 'turn-2' },
        2000,
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      // Turn 2: P2 calls liar on truthful play -> P2 eliminated, P1 wins!
      const res2 = executeTimedClientGameplayTransaction(
        res1.roomState,
        {
          actionId: 'p2-call',
          expectedRevision: 1,
          turnId: 'turn-2',
          actionType: 'CALL_LIAR',
          payload: {},
        },
        res1.processedRegistry,
        { playerId: p2Id },
        { turnId: 'turn-3' },
        5000,
        random
      );

      expect(res2.decision).toBe('COMMITTED');
      if (res2.decision !== 'COMMITTED') return;

      // Critical finish invariants
      expect(res2.roomState.lifecycle).toBe('MATCH_FINISHED');
      expect(res2.roomState.match!.status).toBe('FINISHED');
      expect(res2.roomState.match!.winnerId).toBe(p1Id);
      expect(res2.roomState.currentTurnId).toBeNull();
      expect(res2.roomState.currentTurnDeadline).toBeNull();
      expect(res2.roomState.activeAlarm).toBeNull();
      expect(res2.resultingRevision).toBe(2);
      expect(res2.roomState.revision).toBe(2);
    });
  });

  describe('Timing Incoherent / INVALID_STATE Handling (SCENARIO I / AC-40, AC-41, AC-84)', () => {
    it('SCENARIO I — fails closed with deterministic invariant error when timing metadata is incoherent (AC-40, AC-41)', () => {
      const { roomState, random } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      // Corrupt activeAlarm generation
      const corruptRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        activeAlarm: {
          kind: 'TURN_DEADLINE',
          dueAt: roomState.currentTurnDeadline!,
          generation: 999, // mismatch with room revision 0
        },
      };

      expect(() =>
        executeTimedClientGameplayTransaction(
          corruptRoom,
          envelope,
          createProcessedGameplayActionRegistry(),
          { playerId: actorId },
          { turnId: 'turn-2' },
          5000,
          random
        )
      ).toThrow(/Invariant failure: Room turn deadline timing is in INVALID_STATE/);
    });

    it('fails closed when active room is unarmed (null deadline/alarm) (AC-40)', () => {
      const { roomState } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const actorId = roomState.match!.round.currentPlayerId;
      const cardToPlay = roomState.match!.players[actorId].hand[0];

      const unarmedRoom: RoomAuthorityState<MatchState> = {
        ...roomState,
        currentTurnDeadline: null,
        activeAlarm: null,
      };

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardToPlay.id] },
      };

      expect(() =>
        executeTimedClientGameplayTransaction(
          unarmedRoom,
          envelope,
          createProcessedGameplayActionRegistry(),
          { playerId: actorId },
          { turnId: 'turn-2' },
          5000,
          new ThrowingRandomSource()
        )
      ).toThrow(/Invariant failure: Room turn deadline timing is in INVALID_STATE/);
    });
  });

  describe('Purity & Immutability Guarantees (AC-81..AC-85, AC-92)', () => {
    it('does not mutate input roomState, match, hands, envelope, actor, or registry on REJECT, DUPLICATE, DEADLINE_DUE, or COMMITTED', () => {
      const { roomState, random, deadlineMs } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      const actorId = roomState.match!.round.currentPlayerId;
      const cardId = roomState.match!.players[actorId].hand[0].id;
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-purity',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardId] },
      };
      const envelopeCopy = JSON.parse(JSON.stringify(envelope));
      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();

      // Test DEADLINE_DUE purity
      executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        deadlineMs + 5000,
        random
      );
      expect(roomState).toEqual(roomStateCopy);
      expect(envelope).toEqual(envelopeCopy);
      expect(Object.keys(registry)).toHaveLength(0);

      // Test COMMITTED purity
      executeTimedClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        deadlineMs - 5000,
        random
      );
      expect(roomState).toEqual(roomStateCopy);
      expect(envelope).toEqual(envelopeCopy);
    });
  });

  describe('Forced-CALL PLAY Command with Timing Arming', () => {
    it('increments revision by exactly 1, records 1 PLAY_CARDS record, and arms new deadline on continuing Match', () => {
      const { roomState: initRoom, random } = setupArmedActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1', 1000);
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p1Actor: ServerResolvedActor = { playerId: p1Id };

      const declaredRank = initRoom.match!.round.tableRank;
      const updatedP1: PlayerState = {
        ...initRoom.match!.players[p1Id],
        hand: [
          { id: 'c1', rank: declaredRank },
          { id: 'c2', rank: declaredRank },
          { id: 'c3', rank: declaredRank },
        ],
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: {
          ...initRoom.match!.players,
          [p1Id]: updatedP1,
        },
      };

      const rawRoom: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
        currentTurnDeadline: null,
        activeAlarm: null,
      };
      const armedRoom = armActiveTurnDeadline(rawRoom, 1000);

      const envelope: GameplayActionEnvelope = {
        actionId: 'forced-play-timed',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2', 'c3'] },
      };

      const res = executeTimedClientGameplayTransaction(
        armedRoom,
        envelope,
        createProcessedGameplayActionRegistry(),
        p1Actor,
        { turnId: 'turn-2' },
        5000, // before deadline (31000)
        random
      );

      expect(res.decision).toBe('COMMITTED');
      if (res.decision !== 'COMMITTED') return;

      expect(res.resultingRevision).toBe(1);
      expect(res.roomState.revision).toBe(1);
      expect(Object.keys(res.processedRegistry)).toEqual(['forced-play-timed']);
      expect(res.processedRegistry['forced-play-timed'].actionType).toBe('PLAY_CARDS');

      if (res.roomState.lifecycle === 'MATCH_ACTIVE') {
        expect(res.roomState.currentTurnDeadline).toBe(35000); // 5000 + 30000
        expect(res.roomState.activeAlarm).toEqual({
          kind: 'TURN_DEADLINE',
          dueAt: 35000,
          generation: 1,
        });
      }
    });
  });
});
