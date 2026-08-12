import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  createInitialRoomState,
  parseGameplayActionEnvelope,
  createProcessedGameplayActionRegistry,
  nextRoomRevision,
  evaluateGameplayActionAdmission,
  recordSuccessfulGameplayAction,
  isExactRequest,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  GameplayActionEnvelope,
  ProcessedGameplayActionRegistry,
  ProcessedGameplayActionRecord,
  ServerResolvedActor,
} from '../src/index.js';

const dummyActor: ServerResolvedActor = { playerId: 'player-1' };

describe('Gameplay Admission & Idempotency Layer', () => {
  describe('API Exports & Type Invariants', () => {
    it('exports all admission functions from room-runtime index', () => {
      expect(typeof createProcessedGameplayActionRegistry).toBe('function');
      expect(typeof nextRoomRevision).toBe('function');
      expect(typeof evaluateGameplayActionAdmission).toBe('function');
      expect(typeof recordSuccessfulGameplayAction).toBe('function');
      expect(typeof isExactRequest).toBe('function');
    });

    it('enforces mandatory non-optional ServerResolvedActor parameter #4 type (Architect Finding 1)', () => {
      type AdmissionActorParameter = Parameters<typeof evaluateGameplayActionAdmission>[3];
      expectTypeOf<AdmissionActorParameter>().toEqualTypeOf<ServerResolvedActor>();
    });
  });

  describe('Monotonic Revision Primitive: nextRoomRevision', () => {
    it('increments 0 to 1', () => {
      expect(nextRoomRevision(0)).toBe(1);
    });

    it('increments representative safe non-negative integers', () => {
      expect(nextRoomRevision(1)).toBe(2);
      expect(nextRoomRevision(42)).toBe(43);
      expect(nextRoomRevision(999999)).toBe(1000000);
      expect(nextRoomRevision(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('rejects negative integers', () => {
      expect(() => nextRoomRevision(-1)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(-100)).toThrow(/Invalid revision input/);
    });

    it('rejects non-integers', () => {
      expect(() => nextRoomRevision(1.5)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(NaN)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(Infinity)).toThrow(/Invalid revision input/);
    });

    it('rejects non-safe or invalid inputs', () => {
      expect(() => nextRoomRevision('5' as unknown as number)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(null as unknown as number)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(undefined as unknown as number)).toThrow(/Invalid revision input/);
    });

    it('rejects Number.MAX_SAFE_INTEGER increment', () => {
      expect(() => nextRoomRevision(Number.MAX_SAFE_INTEGER)).toThrow(/Invalid revision input/);
    });
  });

  describe('Processed Action Registry & Prototype Safety', () => {
    it('creates fresh null-prototype registry allocation', () => {
      const reg1 = createProcessedGameplayActionRegistry();
      const reg2 = createProcessedGameplayActionRegistry();

      expect(reg1).not.toBe(reg2);
      expect(Object.getPrototypeOf(reg1)).toBeNull();
      expect(Object.getPrototypeOf(reg2)).toBeNull();
    });

    it('supports __proto__ actionId safely', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: '__proto__',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-1'] },
      };

      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope, 6);
      expect(Object.getPrototypeOf(updated)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(updated, '__proto__')).toBe(true);

      const record = updated['__proto__'];
      expect(record.actionId).toBe('__proto__');
      expect(record.actorPlayerId).toBe('player-1');
      expect(record.resultingRevision).toBe(6);

      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 10,
        currentTurnId: 'turn-5',
      };

      const evalResult = evaluateGameplayActionAdmission(roomState, envelope, updated, dummyActor);
      expect(evalResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 6,
      });
    });

    it('supports constructor actionId safely', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'constructor',
        expectedRevision: 2,
        turnId: 'turn-2',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope, 3);
      expect(Object.getPrototypeOf(updated)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(updated, 'constructor')).toBe(true);

      const record = updated['constructor'];
      expect(record.actionId).toBe('constructor');
      expect(record.actorPlayerId).toBe('player-1');
      expect(record.resultingRevision).toBe(3);

      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 3,
        currentTurnId: 'turn-2',
      };

      const evalResult = evaluateGameplayActionAdmission(roomState, envelope, updated, dummyActor);
      expect(evalResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 3,
      });
    });

    it('retains actorPlayerId, detached request snapshot, and resultingRevision without server hidden state', () => {
      const registry = createProcessedGameplayActionRegistry();
      const originalCardIds = ['c1', 'c2'];
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-100',
        expectedRevision: 4,
        turnId: 'turn-4',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: originalCardIds },
      };

      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope, 5);
      const record = updated['act-100'];

      expect(record).toEqual({
        actorPlayerId: 'player-1',
        actionId: 'act-100',
        expectedRevision: 4,
        turnId: 'turn-4',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2'] },
        resultingRevision: 5,
      });

      originalCardIds.push('c3');
      expect(record.payload.cardIds).toEqual(['c1', 'c2']);

      const recordKeys = Object.keys(record);
      expect(recordKeys.sort()).toEqual([
        'actionId',
        'actionType',
        'actorPlayerId',
        'expectedRevision',
        'payload',
        'resultingRevision',
        'turnId',
      ]);
    });
  });

  describe('Low-Level Actor-Binding & Fail-Closed Behavior (Architect Mandatory Proofs)', () => {
    function setupActiveRoomState(revision = 5, currentTurnId = 'turn-1'): RoomAuthorityState {
      return {
        ...createInitialRoomState('room-test'),
        lifecycle: 'MATCH_ACTIVE',
        revision,
        currentTurnId,
      };
    }

    it('returns INVALID_ACTOR_CONTEXT when runtime actor is malformed (Architect Proof 3)', () => {
      const roomState = setupActiveRoomState(5, 'turn-1');
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      expect(
        evaluateGameplayActionAdmission(roomState, envelope, registry, undefined as unknown as ServerResolvedActor)
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateGameplayActionAdmission(roomState, envelope, registry, null as unknown as ServerResolvedActor)
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateGameplayActionAdmission(roomState, envelope, registry, { playerId: '' })
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateGameplayActionAdmission(roomState, envelope, registry, { playerId: '   ' })
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });
    });

    it('returns DUPLICATE for same actor exact retry on advanced room state (Architect Proof 1)', () => {
      const p1Actor: ServerResolvedActor = { playerId: 'p1' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'a1',
        expectedRevision: 7,
        turnId: 'turn-7',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        p1Actor,
        envelope,
        8
      );

      const advancedRoomState = setupActiveRoomState(11, 'turn-10');

      const result = evaluateGameplayActionAdmission(advancedRoomState, envelope, registry, p1Actor);
      expect(result).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 8,
      });
    });

    it('returns ACTION_ID_CONFLICT for different actor submitting same actionId (Architect Proof 2)', () => {
      const p1Actor: ServerResolvedActor = { playerId: 'p1' };
      const p2Actor: ServerResolvedActor = { playerId: 'p2' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'a1',
        expectedRevision: 7,
        turnId: 'turn-7',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        p1Actor,
        envelope,
        8
      );

      const roomState = setupActiveRoomState(7, 'turn-7');

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry, p2Actor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });
  });

  describe('Successful Action Recording', () => {
    it('requires valid server actor context', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 10,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      expect(() => recordSuccessfulGameplayAction(registry, null as unknown as ServerResolvedActor, envelope, 11)).toThrow(/Invalid server actor context/);
      expect(() => recordSuccessfulGameplayAction(registry, { playerId: '' }, envelope, 11)).toThrow(/Invalid server actor context/);
    });

    it('requires resultingRevision = expectedRevision + 1', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 10,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      expect(() => recordSuccessfulGameplayAction(registry, dummyActor, envelope, 11)).not.toThrow();
      expect(() => recordSuccessfulGameplayAction(registry, dummyActor, envelope, 10)).toThrow(/must equal expectedRevision \+ 1/);
      expect(() => recordSuccessfulGameplayAction(registry, dummyActor, envelope, 12)).toThrow(/must equal expectedRevision \+ 1/);
      expect(() => recordSuccessfulGameplayAction(registry, dummyActor, envelope, -1)).toThrow(/must equal expectedRevision \+ 1/);
    });

    it('returns an immutable fresh registry update without mutating original', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-a'] },
      };

      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope, 1);

      expect(updated).not.toBe(registry);
      expect(Object.prototype.hasOwnProperty.call(registry, 'act-1')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(updated, 'act-1')).toBe(true);
      expect(envelope.payload.cardIds).toEqual(['card-a']);
    });

    it('allows idempotent re-recording of exact same successful request and result', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-a'] },
      };

      const updated1 = recordSuccessfulGameplayAction(registry, dummyActor, envelope, 1);
      const updated2 = recordSuccessfulGameplayAction(updated1, dummyActor, envelope, 1);

      expect(updated2['act-1']).toEqual(updated1['act-1']);
    });

    it('rejects re-recording same actionId with different request', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope1: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-a'] },
      };
      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope1, 1);

      const envelope2: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-b'] },
      };

      expect(() => recordSuccessfulGameplayAction(updated, dummyActor, envelope2, 1)).toThrow(
        /Action ID conflict/
      );
    });

    it('rejects re-recording same actionId with different actor as Action ID conflict', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const updated = recordSuccessfulGameplayAction(registry, { playerId: 'p1' }, envelope, 1);

      expect(() => recordSuccessfulGameplayAction(updated, { playerId: 'p2' }, envelope, 1)).toThrow(
        /Action ID conflict/
      );
    });

    it('rejects re-recording same actionId with different resultingRevision specifically as Action ID conflict', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope1: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope1, 1);

      expect(() => recordSuccessfulGameplayAction(updated, dummyActor, envelope1, 2)).toThrow(
        /Action ID conflict/
      );
    });

    it('enforces existing actionId conflict precedence over new-record resultingRevision validation', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope1: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const updated = recordSuccessfulGameplayAction(registry, dummyActor, envelope1, 1);

      const conflictingEnvelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      expect(() => recordSuccessfulGameplayAction(updated, dummyActor, conflictingEnvelope, -1)).toThrow(
        /Action ID conflict/
      );
      expect(() => recordSuccessfulGameplayAction(updated, dummyActor, conflictingEnvelope, 99)).toThrow(
        /Action ID conflict/
      );
    });
  });

  describe('Admission Decision Model & Ordering Semantics', () => {
    function setupActiveRoomState(revision = 5, currentTurnId = 'turn-1'): RoomAuthorityState {
      return {
        ...createInitialRoomState('room-test'),
        lifecycle: 'MATCH_ACTIVE',
        revision,
        currentTurnId,
      };
    }

    it('admits unseen exact-state action as ACCEPT', () => {
      const roomState = setupActiveRoomState(5, 'turn-10');
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-new',
        expectedRevision: 5,
        turnId: 'turn-10',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry, dummyActor);
      expect(result).toEqual({ decision: 'ACCEPT' });
    });

    it('evaluates DUPLICATE before stale revision and turn checks', () => {
      const initialRegistry = createProcessedGameplayActionRegistry();
      const originalEnvelope: GameplayActionEnvelope = {
        actionId: 'act-77',
        expectedRevision: 7,
        turnId: 'turn-7',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2'] },
      };
      const registry = recordSuccessfulGameplayAction(initialRegistry, dummyActor, originalEnvelope, 8);

      const advancedRoomState: RoomAuthorityState = {
        ...createInitialRoomState('room-test'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 11,
        currentTurnId: 'turn-10',
      };

      const retryEnvelope: GameplayActionEnvelope = {
        actionId: 'act-77',
        expectedRevision: 7,
        turnId: 'turn-7',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2'] },
      };

      const result = evaluateGameplayActionAdmission(advancedRoomState, retryEnvelope, registry, dummyActor);

      expect(result).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 8,
      });
    });

    it('rejects reused actionId with different expectedRevision as ACTION_ID_CONFLICT', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        dummyActor,
        {
          actionId: 'act-1',
          expectedRevision: 5,
          turnId: 'turn-1',
          actionType: 'CALL_LIAR',
          payload: {},
        },
        6
      );

      const roomState = setupActiveRoomState(6, 'turn-2');

      const conflictingEnvelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 6,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different turnId as ACTION_ID_CONFLICT', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        dummyActor,
        {
          actionId: 'act-1',
          expectedRevision: 5,
          turnId: 'turn-1',
          actionType: 'CALL_LIAR',
          payload: {},
        },
        6
      );

      const roomState = setupActiveRoomState(5, 'turn-1');

      const conflictingEnvelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 5,
        turnId: 'turn-2',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different actionType as ACTION_ID_CONFLICT', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        dummyActor,
        {
          actionId: 'act-1',
          expectedRevision: 5,
          turnId: 'turn-1',
          actionType: 'CALL_LIAR',
          payload: {},
        },
        6
      );

      const roomState = setupActiveRoomState(5, 'turn-1');

      const conflictingEnvelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different PLAY cardIds as ACTION_ID_CONFLICT', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        dummyActor,
        {
          actionId: 'act-1',
          expectedRevision: 5,
          turnId: 'turn-1',
          actionType: 'PLAY_CARDS',
          payload: { cardIds: ['c1'] },
        },
        6
      );

      const roomState = setupActiveRoomState(5, 'turn-1');

      const conflictingEnvelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c2'] },
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different PLAY cardIds ordering as ACTION_ID_CONFLICT', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        dummyActor,
        {
          actionId: 'act-1',
          expectedRevision: 5,
          turnId: 'turn-1',
          actionType: 'PLAY_CARDS',
          payload: { cardIds: ['c1', 'c2'] },
        },
        6
      );

      const roomState = setupActiveRoomState(5, 'turn-1');

      const conflictingEnvelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c2', 'c1'] },
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects unseen lower expectedRevision as STALE_REVISION', () => {
      const roomState = setupActiveRoomState(5, 'turn-1');
      const registry = createProcessedGameplayActionRegistry();

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 4,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });

    it('rejects unseen higher expectedRevision as STALE_REVISION', () => {
      const roomState = setupActiveRoomState(5, 'turn-1');
      const registry = createProcessedGameplayActionRegistry();

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 6,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry, dummyActor);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });

    it('rejects non-MATCH_ACTIVE lifecycles when revision matches', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const baseRoom = createInitialRoomState('room-1');

      const lobbyRoom = { ...baseRoom, revision: 5, lifecycle: 'LOBBY' as const };
      expect(evaluateGameplayActionAdmission(lobbyRoom, envelope, registry, dummyActor)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });

      const pausedRoom = { ...baseRoom, revision: 5, lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' as const };
      expect(evaluateGameplayActionAdmission(pausedRoom, envelope, registry, dummyActor)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });

      const finishedRoom = { ...baseRoom, revision: 5, lifecycle: 'MATCH_FINISHED' as const };
      expect(evaluateGameplayActionAdmission(finishedRoom, envelope, registry, dummyActor)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });

      const abandonedRoom = { ...baseRoom, revision: 5, lifecycle: 'ABANDONED' as const };
      expect(evaluateGameplayActionAdmission(abandonedRoom, envelope, registry, dummyActor)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });
    });

    it('rejects null currentTurnId as TURN_MISMATCH when MATCH_ACTIVE and revision matches', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 5,
        currentTurnId: null,
      };

      expect(evaluateGameplayActionAdmission(roomState, envelope, registry, dummyActor)).toEqual({
        decision: 'REJECT',
        reason: 'TURN_MISMATCH',
      });
    });

    it('rejects wrong turnId as TURN_MISMATCH when MATCH_ACTIVE and revision matches', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 5,
        currentTurnId: 'turn-2',
      };

      expect(evaluateGameplayActionAdmission(roomState, envelope, registry, dummyActor)).toEqual({
        decision: 'REJECT',
        reason: 'TURN_MISMATCH',
      });
    });
  });

  describe('Purity & Immutability Guarantees', () => {
    it('does not mutate RoomAuthorityState, envelope, or registry during admission evaluation', () => {
      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 5,
        currentTurnId: 'turn-1',
      };
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-1'] },
      };
      const envelopeCopy = JSON.parse(JSON.stringify(envelope));

      const registry = createProcessedGameplayActionRegistry();

      evaluateGameplayActionAdmission(roomState, envelope, registry, dummyActor);

      expect(roomState).toEqual(roomStateCopy);
      expect(envelope).toEqual(envelopeCopy);
      expect(Object.keys(registry)).toHaveLength(0);
    });

    it('rejected admission never creates a processed-action record', () => {
      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 5,
        currentTurnId: 'turn-1',
      };

      const staleEnvelope: GameplayActionEnvelope = {
        actionId: 'act-stale',
        expectedRevision: 4,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateGameplayActionAdmission(roomState, staleEnvelope, registry, dummyActor);
      expect(result).toEqual({ decision: 'REJECT', reason: 'STALE_REVISION' });
      expect(Object.prototype.hasOwnProperty.call(registry, 'act-stale')).toBe(false);
    });
  });
});
