import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createInitialRoomState,
  FORBIDDEN_LOCAL_SELECTION_KEYS,
  ForbiddenLocalSelectionKey,
  RoomAuthorityState,
  RoomLifecycle,
  RoomAlarmKind,
  ActiveRoomAlarm,
} from '../src/room-state.js';

describe('Room Authority State Foundation', () => {
  it('defines the exact allowed RoomLifecycle values (AC-06)', () => {
    const validLifecycles: RoomLifecycle[] = [
      'LOBBY',
      'MATCH_ACTIVE',
      'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
      'MATCH_FINISHED',
      'ABANDONED',
    ];
    expect(validLifecycles).toHaveLength(5);
  });

  it('defines the exact allowed RoomAlarmKind values (AC-07)', () => {
    const validAlarmKinds: RoomAlarmKind[] = [
      'TURN_DEADLINE',
      'HOST_GRACE',
      'ROOM_RETENTION',
    ];
    expect(validAlarmKinds).toHaveLength(3);
  });

  it('structures ActiveRoomAlarm with kind, dueAt, and generation (AC-08)', () => {
    const alarm: ActiveRoomAlarm = {
      kind: 'TURN_DEADLINE',
      dueAt: 1700000000000,
      generation: 1,
    };
    expect(alarm.kind).toBe('TURN_DEADLINE');
    expect(alarm.dueAt).toBe(1700000000000);
    expect(alarm.generation).toBe(1);
  });

  it('rejects empty or whitespace-only Room IDs (AC-11)', () => {
    expect(() => createInitialRoomState('')).toThrow('Invalid Room ID');
    expect(() => createInitialRoomState('   ')).toThrow('Invalid Room ID');
    expect(() => createInitialRoomState(null as unknown as string)).toThrow('Invalid Room ID');
    expect(() => createInitialRoomState(undefined as unknown as string)).toThrow('Invalid Room ID');
  });

  it('creates canonical initial LOBBY room state with correct defaults (AC-09, AC-10, AC-12..19)', () => {
    const state = createInitialRoomState('room-123');

    expect(state.roomId).toBe('room-123');
    expect(state.lifecycle).toBe('LOBBY');
    expect(state.revision).toBe(0);
    expect(state.members).toEqual([]);
    expect(state.hostPlayerId).toBeNull();
    expect(state.match).toBeNull();
    expect(state.currentTurnId).toBeNull();
    expect(state.currentTurnDeadline).toBeNull();
    expect(state.activeAlarm).toBeNull();
  });

  it('ensures repeated initial construction returns fresh, unshared objects (AC-20)', () => {
    const state1 = createInitialRoomState('room-1');
    const state2 = createInitialRoomState('room-1');

    expect(state1).toEqual(state2);
    expect(state1).not.toBe(state2);
    expect(state1.members).not.toBe(state2.members);

    state1.members.push({ playerId: 'p1', joinOrder: 1 });
    expect(state2.members).toEqual([]);
  });

  it('locks exact compile-time and runtime RoomAuthorityState key surface (AC-09, AC-42, AC-43)', () => {
    // 1. Compile-time proof: RoomAuthorityState must extract NO forbidden local-selection key
    type RoomSelectionLeak = Extract<
      keyof RoomAuthorityState<unknown>,
      ForbiddenLocalSelectionKey
    >;
    expectTypeOf<RoomSelectionLeak>().toEqualTypeOf<never>();

    // 2. Compile-time proof: RoomAuthorityState key surface must match expected keys exactly
    type ExpectedRoomAuthorityKey =
      | 'roomId'
      | 'lifecycle'
      | 'revision'
      | 'members'
      | 'hostPlayerId'
      | 'match'
      | 'currentTurnId'
      | 'currentTurnDeadline'
      | 'activeAlarm';

    type ExtraKeys = Exclude<
      keyof RoomAuthorityState<unknown>,
      ExpectedRoomAuthorityKey
    >;
    type MissingKeys = Exclude<
      ExpectedRoomAuthorityKey,
      keyof RoomAuthorityState<unknown>
    >;

    expectTypeOf<ExtraKeys>().toEqualTypeOf<never>();
    expectTypeOf<MissingKeys>().toEqualTypeOf<never>();

    // 3. Runtime constructed-state proof: runtime object contains zero forbidden key
    const sampleState = createInitialRoomState('room-test');
    const keys = Object.keys(sampleState);

    for (const forbiddenKey of FORBIDDEN_LOCAL_SELECTION_KEYS) {
      expect(keys).not.toContain(forbiddenKey);
      expect(sampleState).not.toHaveProperty(forbiddenKey);
    }

    expect(FORBIDDEN_LOCAL_SELECTION_KEYS).toEqual([
      'selectedCards',
      'selectedCardIds',
      'selectedButUnconfirmedCards',
      'highlightedCards',
      'highlightedCardIds',
      'draftSelection',
      'pendingSelection',
      'localSelection',
    ]);
  });
});
