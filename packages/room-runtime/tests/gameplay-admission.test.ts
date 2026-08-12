import { describe, it, expect } from 'vitest';
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
} from '../src/index.js';

describe('Gameplay Admission & Idempotency Layer', () => {
  describe('API Exports (AC-01, AC-07)', () => {
    it('exports all admission functions from room-runtime index', () => {
      expect(typeof createProcessedGameplayActionRegistry).toBe('function');
      expect(typeof nextRoomRevision).toBe('function');
      expect(typeof evaluateGameplayActionAdmission).toBe('function');
      expect(typeof recordSuccessfulGameplayAction).toBe('function');
      expect(typeof isExactRequest).toBe('function');
    });
  });

  describe('Monotonic Revision Primitive: nextRoomRevision (AC-43 .. AC-48)', () => {
    it('increments 0 to 1 (AC-43)', () => {
      expect(nextRoomRevision(0)).toBe(1);
    });

    it('increments representative safe non-negative integers (AC-44)', () => {
      expect(nextRoomRevision(1)).toBe(2);
      expect(nextRoomRevision(42)).toBe(43);
      expect(nextRoomRevision(999999)).toBe(1000000);
      expect(nextRoomRevision(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('rejects negative integers (AC-45)', () => {
      expect(() => nextRoomRevision(-1)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(-100)).toThrow(/Invalid revision input/);
    });

    it('rejects non-integers (AC-46)', () => {
      expect(() => nextRoomRevision(1.5)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(NaN)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(Infinity)).toThrow(/Invalid revision input/);
    });

    it('rejects non-safe or invalid inputs (AC-47)', () => {
      expect(() => nextRoomRevision('5' as unknown as number)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(null as unknown as number)).toThrow(/Invalid revision input/);
      expect(() => nextRoomRevision(undefined as unknown as number)).toThrow(/Invalid revision input/);
    });

    it('rejects Number.MAX_SAFE_INTEGER increment (AC-48)', () => {
      expect(() => nextRoomRevision(Number.MAX_SAFE_INTEGER)).toThrow(/Invalid revision input/);
    });
  });

  describe('Processed Action Registry & Prototype Safety (AC-08 .. AC-16, AC-54)', () => {
    it('creates fresh null-prototype registry allocation (AC-08, AC-09, AC-10)', () => {
      const reg1 = createProcessedGameplayActionRegistry();
      const reg2 = createProcessedGameplayActionRegistry();

      expect(reg1).not.toBe(reg2);
      expect(Object.getPrototypeOf(reg1)).toBeNull();
      expect(Object.getPrototypeOf(reg2)).toBeNull();
    });

    it('supports __proto__ actionId safely (AC-10, AC-11, AC-54)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: '__proto__',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-1'] },
      };

      const updated = recordSuccessfulGameplayAction(registry, envelope, 6);
      expect(Object.getPrototypeOf(updated)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(updated, '__proto__')).toBe(true);

      const record = updated['__proto__'];
      expect(record.actionId).toBe('__proto__');
      expect(record.resultingRevision).toBe(6);

      // Lookup in admission evaluation
      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 10,
        currentTurnId: 'turn-5',
      };

      // Exact retry -> DUPLICATE even if room state advanced
      const evalResult = evaluateGameplayActionAdmission(roomState, envelope, updated);
      expect(evalResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 6,
      });
    });

    it('supports constructor actionId safely (AC-10, AC-12, AC-54)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'constructor',
        expectedRevision: 2,
        turnId: 'turn-2',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const updated = recordSuccessfulGameplayAction(registry, envelope, 3);
      expect(Object.getPrototypeOf(updated)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(updated, 'constructor')).toBe(true);

      const record = updated['constructor'];
      expect(record.actionId).toBe('constructor');
      expect(record.resultingRevision).toBe(3);

      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 3,
        currentTurnId: 'turn-2',
      };

      const evalResult = evaluateGameplayActionAdmission(roomState, envelope, updated);
      expect(evalResult).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 3,
      });
    });

    it('retains detached request snapshot and resultingRevision without server hidden state (AC-13 .. AC-16)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const originalCardIds = ['c1', 'c2'];
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-100',
        expectedRevision: 4,
        turnId: 'turn-4',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: originalCardIds },
      };

      const updated = recordSuccessfulGameplayAction(registry, envelope, 5);
      const record = updated['act-100'];

      expect(record).toEqual({
        actionId: 'act-100',
        expectedRevision: 4,
        turnId: 'turn-4',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2'] },
        resultingRevision: 5,
      });

      // Detachment check (AC-16)
      originalCardIds.push('c3');
      expect(record.payload.cardIds).toEqual(['c1', 'c2']);

      // Check no hidden server state present (AC-15)
      const recordKeys = Object.keys(record);
      expect(recordKeys.sort()).toEqual([
        'actionId',
        'actionType',
        'expectedRevision',
        'payload',
        'resultingRevision',
        'turnId',
      ]);
    });
  });

  describe('Successful Action Recording (AC-49 .. AC-57)', () => {
    it('requires resultingRevision = expectedRevision + 1 (AC-49, AC-50)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 10,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      expect(() => recordSuccessfulGameplayAction(registry, envelope, 11)).not.toThrow();
      expect(() => recordSuccessfulGameplayAction(registry, envelope, 10)).toThrow(/must equal expectedRevision \+ 1/);
      expect(() => recordSuccessfulGameplayAction(registry, envelope, 12)).toThrow(/must equal expectedRevision \+ 1/);
      expect(() => recordSuccessfulGameplayAction(registry, envelope, -1)).toThrow(/must equal expectedRevision \+ 1/);
    });

    it('returns an immutable fresh registry update without mutating original (AC-51, AC-52, AC-53)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-a'] },
      };

      const updated = recordSuccessfulGameplayAction(registry, envelope, 1);

      expect(updated).not.toBe(registry);
      expect(Object.prototype.hasOwnProperty.call(registry, 'act-1')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(updated, 'act-1')).toBe(true);
      expect(envelope.payload.cardIds).toEqual(['card-a']);
    });

    it('allows idempotent re-recording of exact same successful request and result (AC-55)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-a'] },
      };

      const updated1 = recordSuccessfulGameplayAction(registry, envelope, 1);
      const updated2 = recordSuccessfulGameplayAction(updated1, envelope, 1);

      expect(updated2['act-1']).toEqual(updated1['act-1']);
    });

    it('rejects re-recording same actionId with different request (AC-56)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope1: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-a'] },
      };
      const updated = recordSuccessfulGameplayAction(registry, envelope1, 1);

      const envelope2: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-b'] },
      };

      expect(() => recordSuccessfulGameplayAction(updated, envelope2, 1)).toThrow(
        /Action ID conflict/
      );
    });

    it('rejects re-recording same actionId with different resultingRevision (AC-57)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope1: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 0,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const updated = recordSuccessfulGameplayAction(registry, envelope1, 1);

      // Suppose someone attempts to re-record act-1 with resultingRevision 2 (which is invalid anyway)
      expect(() => recordSuccessfulGameplayAction(updated, envelope1, 2)).toThrow();
    });
  });

  describe('Admission Decision Model & Ordering Semantics (AC-17 .. AC-39)', () => {
    function setupActiveRoomState(
      revision = 5,
      currentTurnId = 'turn-1'
    ): RoomAuthorityState {
      return {
        ...createInitialRoomState('room-test'),
        lifecycle: 'MATCH_ACTIVE',
        revision,
        currentTurnId,
      };
    }

    it('admits unseen exact-state action as ACCEPT (AC-17, AC-39)', () => {
      const roomState = setupActiveRoomState(5, 'turn-10');
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-new',
        expectedRevision: 5,
        turnId: 'turn-10',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry);
      expect(result).toEqual({ decision: 'ACCEPT' });
    });

    it('evaluates DUPLICATE before stale revision and turn checks (AC-18, AC-19, AC-20, AC-21, AC-22)', () => {
      // CRITICAL DUPLICATE ORDERING PROOF:
      // Processed at expectedRevision = 7, turnId = 'turn-7', resultingRevision = 8
      const initialRegistry = createProcessedGameplayActionRegistry();
      const originalEnvelope: GameplayActionEnvelope = {
        actionId: 'act-77',
        expectedRevision: 7,
        turnId: 'turn-7',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2'] },
      };
      const registry = recordSuccessfulGameplayAction(initialRegistry, originalEnvelope, 8);

      // Later authoritative Room state becomes: revision = 11, currentTurnId = 'turn-10'
      const advancedRoomState: RoomAuthorityState = {
        ...createInitialRoomState('room-test'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 11,
        currentTurnId: 'turn-10',
      };

      // Exact retry of original command
      const retryEnvelope: GameplayActionEnvelope = {
        actionId: 'act-77',
        expectedRevision: 7,
        turnId: 'turn-7',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1', 'c2'] },
      };

      const result = evaluateGameplayActionAdmission(advancedRoomState, retryEnvelope, registry);

      // Must be DUPLICATE, NOT STALE_REVISION or TURN_MISMATCH or ACCEPT
      expect(result).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 8,
      });
    });

    it('rejects reused actionId with different expectedRevision as ACTION_ID_CONFLICT (AC-23, AC-28, AC-29)', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
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
        expectedRevision: 6, // different expectedRevision
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different turnId as ACTION_ID_CONFLICT (AC-24, AC-28, AC-29)', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
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
        turnId: 'turn-2', // different turnId
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different actionType as ACTION_ID_CONFLICT (AC-25)', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
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
        actionType: 'PLAY_CARDS', // CALL vs PLAY
        payload: { cardIds: ['c1'] },
      };

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different PLAY cardIds as ACTION_ID_CONFLICT (AC-26)', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
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

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects reused actionId with different PLAY cardIds ordering as ACTION_ID_CONFLICT (AC-27)', () => {
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
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

      const result = evaluateGameplayActionAdmission(roomState, conflictingEnvelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'ACTION_ID_CONFLICT',
      });
    });

    it('rejects unseen lower expectedRevision as STALE_REVISION (AC-30, AC-32)', () => {
      const roomState = setupActiveRoomState(5, 'turn-1');
      const registry = createProcessedGameplayActionRegistry();

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 4, // lower
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });

    it('rejects unseen higher expectedRevision as STALE_REVISION (AC-31, AC-32)', () => {
      const roomState = setupActiveRoomState(5, 'turn-1');
      const registry = createProcessedGameplayActionRegistry();

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 6, // higher
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const result = evaluateGameplayActionAdmission(roomState, envelope, registry);
      expect(result).toEqual({
        decision: 'REJECT',
        reason: 'STALE_REVISION',
      });
    });

    it('rejects non-MATCH_ACTIVE lifecycles when revision matches (AC-33 .. AC-36)', () => {
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unseen',
        expectedRevision: 5,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const baseRoom = createInitialRoomState('room-1');

      // LOBBY (AC-33)
      const lobbyRoom = { ...baseRoom, revision: 5, lifecycle: 'LOBBY' as const };
      expect(evaluateGameplayActionAdmission(lobbyRoom, envelope, registry)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });

      // MATCH_PAUSED_NO_LIVING_CONNECTIONS (AC-34)
      const pausedRoom = { ...baseRoom, revision: 5, lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' as const };
      expect(evaluateGameplayActionAdmission(pausedRoom, envelope, registry)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });

      // MATCH_FINISHED (AC-35)
      const finishedRoom = { ...baseRoom, revision: 5, lifecycle: 'MATCH_FINISHED' as const };
      expect(evaluateGameplayActionAdmission(finishedRoom, envelope, registry)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });

      // ABANDONED (AC-36)
      const abandonedRoom = { ...baseRoom, revision: 5, lifecycle: 'ABANDONED' as const };
      expect(evaluateGameplayActionAdmission(abandonedRoom, envelope, registry)).toEqual({
        decision: 'REJECT',
        reason: 'MATCH_NOT_ACTIVE',
      });
    });

    it('rejects null currentTurnId as TURN_MISMATCH when MATCH_ACTIVE and revision matches (AC-37)', () => {
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

      expect(evaluateGameplayActionAdmission(roomState, envelope, registry)).toEqual({
        decision: 'REJECT',
        reason: 'TURN_MISMATCH',
      });
    });

    it('rejects wrong turnId as TURN_MISMATCH when MATCH_ACTIVE and revision matches (AC-38)', () => {
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
        currentTurnId: 'turn-2', // wrong turn
      };

      expect(evaluateGameplayActionAdmission(roomState, envelope, registry)).toEqual({
        decision: 'REJECT',
        reason: 'TURN_MISMATCH',
      });
    });
  });

  describe('Purity & Immutability Guarantees (AC-40 .. AC-42, AC-58, AC-59)', () => {
    it('does not mutate RoomAuthorityState, envelope, or registry during admission evaluation (AC-40, AC-41, AC-42)', () => {
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

      evaluateGameplayActionAdmission(roomState, envelope, registry);

      expect(roomState).toEqual(roomStateCopy);
      expect(envelope).toEqual(envelopeCopy);
      expect(Object.keys(registry)).toHaveLength(0);
    });

    it('rejected admission never creates a processed-action record (AC-58)', () => {
      const roomState: RoomAuthorityState = {
        ...createInitialRoomState('room-1'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 5,
        currentTurnId: 'turn-1',
      };

      const staleEnvelope: GameplayActionEnvelope = {
        actionId: 'act-stale',
        expectedRevision: 4, // stale
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };

      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateGameplayActionAdmission(roomState, staleEnvelope, registry);
      expect(result).toEqual({ decision: 'REJECT', reason: 'STALE_REVISION' });
      expect(Object.prototype.hasOwnProperty.call(registry, 'act-stale')).toBe(false);
    });
  });
});
