import { describe, it, expect } from 'vitest';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { MatchState, RandomSource, PlayerState } from '@liars-telegram-game/game-core';

import {
  createInitialRoomState,
  createProcessedGameplayActionRegistry,
  executeClientGameplayTransaction,
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

describe('Authoritative Gameplay Commit Primitive (T-020)', () => {
  function setupActiveMatch(playerIds: string[] = ['p1', 'p2', 'p3']): {
    match: MatchState;
    random: TestRandomSource;
  } {
    const random = new TestRandomSource([0, 0, 0, 0, 0]);
    const match = initializeMatch(playerIds, random);
    return { match, random };
  }

  function setupActiveRoom(
    roomId = 'room-1',
    playerIds: string[] = ['p1', 'p2', 'p3'],
    revision = 0,
    turnId = 'turn-1'
  ): {
    roomState: RoomAuthorityState<MatchState>;
    random: TestRandomSource;
  } {
    const { match, random } = setupActiveMatch(playerIds);
    const members: RoomMember[] = playerIds.map((id, index) => ({
      playerId: id,
      joinOrder: index + 1,
      joinedAt: 1000 + index,
      connected: true,
    }));

    const roomState: RoomAuthorityState<MatchState> = {
      roomId,
      lifecycle: 'MATCH_ACTIVE',
      revision,
      members,
      hostPlayerId: playerIds[0],
      match,
      currentTurnId: turnId,
      currentTurnDeadline: 2000,
      activeAlarm: {
        kind: 'TURN_DEADLINE',
        dueAt: 2000,
        generation: 1,
      },
    };

    return { roomState, random };
  }

  describe('API Exports & Basic Verification', () => {
    it('exports executeClientGameplayTransaction function from room-runtime index', () => {
      expect(typeof executeClientGameplayTransaction).toBe('function');
    });
  });

  describe('Authorization Failure & REJECT Paths', () => {
    it('returns REJECT with STALE_REVISION without Core dispatch, revision increment, or random consumption', () => {
      const { roomState } = setupActiveRoom('room-1', ['p1', 'p2'], 5, 'turn-5');
      const registry = createProcessedGameplayActionRegistry();
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-stale',
        expectedRevision: 4, // stale
        turnId: 'turn-5',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players['p1'].hand[0].id] },
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-6' };
      const throwingRandom = new ThrowingRandomSource();

      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        throwingRandom
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
      expect(roomState.revision).toBe(5);
      expect(Object.keys(registry)).toHaveLength(0);
    });

    it('returns REJECT with ACTOR_NOT_MEMBER for non-room member', () => {
      const { roomState } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const registry = createProcessedGameplayActionRegistry();
      const actor: ServerResolvedActor = { playerId: 'p3' }; // not in members
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        { turnId: 'turn-2' },
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTOR_NOT_MEMBER',
      });
    });

    it('returns REJECT with ACTOR_NOT_CURRENT_PLAYER when non-turn member attempts action', () => {
      const { roomState } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const currentActorId = roomState.match!.round.currentPlayerId;
      const nonCurrentActorId = currentActorId === 'p1' ? 'p2' : 'p1';

      const registry = createProcessedGameplayActionRegistry();
      const actor: ServerResolvedActor = { playerId: nonCurrentActorId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[nonCurrentActorId].hand[0].id] },
      };

      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        { turnId: 'turn-2' },
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTOR_NOT_CURRENT_PLAYER',
      });
    });

    it('returns REJECT with ACTION_NOT_ALLOWED for first-turn CALL_LIAR', () => {
      const { roomState } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const currentActorId = roomState.match!.round.currentPlayerId;

      const registry = createProcessedGameplayActionRegistry();
      const actor: ServerResolvedActor = { playerId: currentActorId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        { turnId: 'turn-2' },
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_NOT_ALLOWED',
      });
    });

    it('returns REJECT with INVALID_PLAY_SELECTION when playing foreign card', () => {
      const { roomState } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const currentActorId = roomState.match!.round.currentPlayerId;
      const otherActorId = currentActorId === 'p1' ? 'p2' : 'p1';
      const foreignCardId = roomState.match!.players[otherActorId].hand[0].id;

      const registry = createProcessedGameplayActionRegistry();
      const actor: ServerResolvedActor = { playerId: currentActorId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [foreignCardId] },
      };

      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        { turnId: 'turn-2' },
        new ThrowingRandomSource()
      );

      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'INVALID_PLAY_SELECTION',
      });
    });
  });

  describe('Deduplication & DUPLICATE Paths', () => {
    it('returns DUPLICATE with priorResultingRevision for identical retry', () => {
      const { roomState, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const actorId = roomState.match!.round.currentPlayerId;
      const actor: ServerResolvedActor = { playerId: actorId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-100',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[actorId].hand[0].id] },
      };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();

      // First call -> COMMITTED
      const result1 = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        random
      );
      expect(result1.decision).toBe('COMMITTED');

      if (result1.decision !== 'COMMITTED') return;

      // Retry against advanced returned state -> DUPLICATE
      const result2 = executeClientGameplayTransaction(
        result1.roomState,
        envelope,
        result1.processedRegistry,
        actor,
        { turnId: 'turn-3' },
        new ThrowingRandomSource()
      );

      expect(result2).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 1,
      });
    });

    it('returns ACTION_ID_CONFLICT when different actor uses existing actionId', () => {
      const { roomState, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
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

      const registry = createProcessedGameplayActionRegistry();

      const result1 = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        p1Actor,
        { turnId: 'turn-2' },
        random
      );
      expect(result1.decision).toBe('COMMITTED');
      if (result1.decision !== 'COMMITTED') return;

      // P2 attempts same actionId -> ACTION_ID_CONFLICT (not DUPLICATE or ACCEPT)
      const result2 = executeClientGameplayTransaction(
        result1.roomState,
        envelope,
        result1.processedRegistry,
        p2Actor,
        { turnId: 'turn-3' },
        new ThrowingRandomSource()
      );

      expect(result2).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });
  });

  describe('ServerPreparedNextTurn Validation', () => {
    it('throws error when preparedNextTurn is empty or whitespace for new action', () => {
      const { roomState, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const actorId = roomState.match!.round.currentPlayerId;
      const actor: ServerResolvedActor = { playerId: actorId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[actorId].hand[0].id] },
      };

      expect(() =>
        executeClientGameplayTransaction(
          roomState,
          envelope,
          createProcessedGameplayActionRegistry(),
          actor,
          { turnId: '' },
          random
        )
      ).toThrow(/Invalid ServerPreparedNextTurn/);

      expect(() =>
        executeClientGameplayTransaction(
          roomState,
          envelope,
          createProcessedGameplayActionRegistry(),
          actor,
          { turnId: '   ' },
          random
        )
      ).toThrow(/Invalid ServerPreparedNextTurn/);
    });

    it('throws error when preparedNextTurn equals current turnId', () => {
      const { roomState, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const actorId = roomState.match!.round.currentPlayerId;
      const actor: ServerResolvedActor = { playerId: actorId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players[actorId].hand[0].id] },
      };

      expect(() =>
        executeClientGameplayTransaction(
          roomState,
          envelope,
          createProcessedGameplayActionRegistry(),
          actor,
          { turnId: 'turn-1' }, // same as roomState.currentTurnId
          random
        )
      ).toThrow(/cannot equal current turnId/);
    });

    it('validates preparedNextTurn ONLY after authorization ACCEPT and BEFORE Core dispatch', () => {
      const { roomState } = setupActiveRoom('room-1', ['p1', 'p2'], 5, 'turn-5');
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 4, // stale -> REJECT
        turnId: 'turn-5',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [roomState.match!.players['p1'].hand[0].id] },
      };

      // Stale action with invalid turnId returns REJECT without throwing
      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        { playerId: 'p1' },
        { turnId: '' }, // invalid, but should not throw because request is REJECTED
        new ThrowingRandomSource()
      );

      expect(result).toEqual({ decision: 'REJECT', reason: 'STALE_REVISION' });
    });
  });

  describe('Ordinary PLAY_CARDS Transaction', () => {
    it('executes legal PLAY_CARDS, advances revision, records action, updates turnId, and clears old deadline/alarm', () => {
      const { roomState, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
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

      const result = executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        random
      );

      expect(result.decision).toBe('COMMITTED');
      if (result.decision !== 'COMMITTED') return;

      expect(result.resultingRevision).toBe(1);
      expect(result.roomState.revision).toBe(1);
      expect(result.roomState.lifecycle).toBe('MATCH_ACTIVE');
      expect(result.roomState.currentTurnId).toBe('turn-2');
      expect(result.roomState.currentTurnDeadline).toBeNull();
      expect(result.roomState.activeAlarm).toBeNull();

      // Check Core Match state update
      const postMatch = result.roomState.match!;
      expect(postMatch.round.previousPlay).not.toBeNull();
      expect(postMatch.round.previousPlay!.cardIds).toEqual([cardToPlay.id]);

      // Check Processed Registry
      const record = result.processedRegistry['play-1'];
      expect(record).toBeDefined();
      expect(record.actorPlayerId).toBe(actorId);
      expect(record.actionId).toBe('play-1');
      expect(record.resultingRevision).toBe(1);
      expect(record.payload).toEqual({ cardIds: [cardToPlay.id] });
    });
  });

  describe('Legal CALL_LIAR Transaction', () => {
    it('executes legal CALL_LIAR after PLAY_CARDS', () => {
      const { roomState: initialRoom, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const p1ActorId = initialRoom.match!.round.currentPlayerId;
      const p1Actor: ServerResolvedActor = { playerId: p1ActorId };
      const cardToPlay = initialRoom.match!.players[p1ActorId].hand[0];

      // Turn 1: P1 plays cards
      const res1 = executeClientGameplayTransaction(
        initialRoom,
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
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      const p2ActorId = res1.roomState.match!.round.currentPlayerId;
      const p2Actor: ServerResolvedActor = { playerId: p2ActorId };

      // Turn 2: P2 calls liar
      const res2 = executeClientGameplayTransaction(
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
        random
      );

      expect(res2.decision).toBe('COMMITTED');
      if (res2.decision !== 'COMMITTED') return;

      expect(res2.resultingRevision).toBe(2);
      expect(res2.roomState.revision).toBe(2);
      expect(res2.processedRegistry['call-1']).toBeDefined();
      expect(res2.processedRegistry['call-1'].actorPlayerId).toBe(p2ActorId);
      expect(res2.processedRegistry['call-1'].resultingRevision).toBe(2);
      expect(res2.roomState.currentTurnDeadline).toBeNull();
      expect(res2.roomState.activeAlarm).toBeNull();
    });
  });

  describe('Forced-CALL PLAY Command Orchestration', () => {
    it('increments revision by exactly 1 and records only 1 PLAY_CARDS record when PLAY triggers forced CALL', () => {
      const { roomState: initRoom, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p1Actor: ServerResolvedActor = { playerId: p1Id };

      // Give P1 a hand of 3 cards matching declared rank so that after PLAY, P1 has 0 cards left
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

      const roomState: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
      };

      const envelope: GameplayActionEnvelope = {
        actionId: 'forced-play-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2', 'c3'] },
      };

      const res = executeClientGameplayTransaction(
        roomState,
        envelope,
        createProcessedGameplayActionRegistry(),
        p1Actor,
        { turnId: 'turn-2' },
        random
      );

      expect(res.decision).toBe('COMMITTED');
      if (res.decision !== 'COMMITTED') return;

      // Crucial forced-CALL invariants:
      // 1. Room revision increments by EXACTLY 1 (0 -> 1)
      expect(res.resultingRevision).toBe(1);
      expect(res.roomState.revision).toBe(1);

      // 2. Exactly 1 processed record added
      const registryKeys = Object.keys(res.processedRegistry);
      expect(registryKeys).toEqual(['forced-play-1']);

      // 3. Processed record actionType is PLAY_CARDS
      const rec = res.processedRegistry['forced-play-1'];
      expect(rec.actionType).toBe('PLAY_CARDS');
      expect(rec.resultingRevision).toBe(1);
    });
  });

  describe('Match Finish Transaction', () => {
    it('maps Core FINISHED status to Room MATCH_FINISHED with winnerId and null turnId/timing', () => {
      const { roomState: initRoom, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const p1Id = initRoom.match!.round.currentPlayerId;
      const p2Id = p1Id === 'p1' ? 'p2' : 'p1';

      // Custom MatchState where P2 has nextShotIndex = 0 and sequence = ['LETHAL', ...]
      // When P2 calls liar and loses challenge, P2 takes shot 0 (LETHAL) and gets eliminated, leaving P1 as winner.
      const p1State: PlayerState = {
        id: p1Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [
          { id: 'p1-c1', rank: 'ACE' },
          { id: 'p1-c2', rank: 'ACE' },
        ],
        revolver: {
          sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
          nextShotIndex: 0,
        },
      };

      const p2State: PlayerState = {
        id: p2Id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p2-c1', rank: 'KING' }],
        revolver: {
          sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'],
          nextShotIndex: 0, // shot 0 is LETHAL -> P2 eliminated
        },
      };

      const customMatch: MatchState = {
        ...initRoom.match!,
        players: {
          [p1Id]: p1State,
          [p2Id]: p2State,
        },
        round: {
          ...initRoom.match!.round,
          tableRank: 'ACE',
          currentPlayerId: p1Id,
          previousPlay: null,
        },
      };

      const roomState: RoomAuthorityState<MatchState> = {
        ...initRoom,
        match: customMatch,
      };

      // Turn 1: P1 plays 1 ACE (truthful play)
      const res1 = executeClientGameplayTransaction(
        roomState,
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
        random
      );
      expect(res1.decision).toBe('COMMITTED');
      if (res1.decision !== 'COMMITTED') return;

      // Turn 2: P2 calls liar on P1's truthful play -> P2 loses challenge, takes LETHAL shot, gets eliminated, P1 wins match!
      const res2 = executeClientGameplayTransaction(
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
        random
      );

      expect(res2.decision).toBe('COMMITTED');
      if (res2.decision !== 'COMMITTED') return;

      expect(res2.roomState.lifecycle).toBe('MATCH_FINISHED');
      expect(res2.roomState.match!.status).toBe('FINISHED');
      expect(res2.roomState.match!.winnerId).toBe(p1Id);
      expect(res2.roomState.currentTurnId).toBeNull();
      expect(res2.roomState.currentTurnDeadline).toBeNull();
      expect(res2.roomState.activeAlarm).toBeNull();
      expect(res2.resultingRevision).toBe(2);
    });
  });

  describe('Purity & Immutability Guarantees', () => {
    it('does not mutate input roomState, match, envelope, actor, preparedNextTurn, or processedRegistry', () => {
      const { roomState, random } = setupActiveRoom('room-1', ['p1', 'p2'], 0, 'turn-1');
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      const actorId = roomState.match!.round.currentPlayerId;
      const cardId = roomState.match!.players[actorId].hand[0].id;
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [cardId] },
      };
      const envelopeCopy = JSON.parse(JSON.stringify(envelope));

      const actor: ServerResolvedActor = { playerId: actorId };
      const preparedTurn: ServerPreparedNextTurn = { turnId: 'turn-2' };
      const registry = createProcessedGameplayActionRegistry();

      executeClientGameplayTransaction(
        roomState,
        envelope,
        registry,
        actor,
        preparedTurn,
        random
      );

      expect(roomState).toEqual(roomStateCopy);
      expect(envelope).toEqual(envelopeCopy);
      expect(Object.keys(registry)).toHaveLength(0);
    });
  });
});
