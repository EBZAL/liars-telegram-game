import { describe, it, expect } from 'vitest';
import { initializeMatch, RandomSource } from '@liars-telegram-game/game-core';
import type { MatchState } from '@liars-telegram-game/game-core';
import {
  createInitialRoomState,
  createProcessedGameplayActionRegistry,
  recordSuccessfulGameplayAction,
  evaluateServerGameplayActionRequest,
} from '../src/index.js';
import type {
  RoomAuthorityState,
  GameplayActionEnvelope,
  ServerResolvedActor,
  RoomMember,
} from '../src/index.js';

function createMockRandom(values: number[] = []): RandomSource {
  let index = 0;
  return {
    nextInt(max: number): number {
      if (index < values.length) {
        const val = values[index++];
        return Math.abs(val) % max;
      }
      return 0;
    },
  };
}

function setupMatchAndRoom(
  playerIds: string[] = ['p1', 'p2', 'p3'],
  seed = [0, 1, 2, 3, 4, 5]
): {
  roomState: RoomAuthorityState<MatchState>;
  matchState: MatchState;
  members: RoomMember[];
} {
  const matchState = initializeMatch(playerIds, createMockRandom(seed));
  const members: RoomMember[] = playerIds.map((id, index) => ({
    playerId: id,
    joinOrder: index + 1,
  }));

  const roomState: RoomAuthorityState<MatchState> = {
    ...createInitialRoomState('room-auth-test'),
    lifecycle: 'MATCH_ACTIVE',
    revision: 1,
    members,
    hostPlayerId: playerIds[0],
    match: matchState,
    currentTurnId: 'turn-1',
  };

  return { roomState, matchState, members };
}

describe('Server Actor Authorization & Action Binding Layer (T-019)', () => {
  describe('API Exports & Server Actor Context Validation (AC-01, AC-11, AC-12, AC-14)', () => {
    it('rejects null, non-object, or invalid actor context as INVALID_ACTOR_CONTEXT', () => {
      const { roomState } = setupMatchAndRoom();
      const registry = createProcessedGameplayActionRegistry();
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-1',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      expect(
        evaluateServerGameplayActionRequest(roomState, envelope, registry, null as unknown as ServerResolvedActor)
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateServerGameplayActionRequest(roomState, envelope, registry, undefined as unknown as ServerResolvedActor)
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateServerGameplayActionRequest(roomState, envelope, registry, { playerId: '' })
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateServerGameplayActionRequest(roomState, envelope, registry, { playerId: '   ' })
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });

      expect(
        evaluateServerGameplayActionRequest(roomState, envelope, registry, { playerId: 123 as unknown as string })
      ).toEqual({ decision: 'REJECT', reason: 'INVALID_ACTOR_CONTEXT' });
    });
  });

  describe('16 Mandatory Security Test Cases (AC-15 .. AC-77)', () => {
    it('1. non-member + known exact actionId => ACTOR_NOT_MEMBER, not DUPLICATE (AC-15, AC-16, AC-17)', () => {
      const { roomState } = setupMatchAndRoom(['p1', 'p2']);
      const originalActor: ServerResolvedActor = { playerId: 'p1' };
      const originalEnvelope: GameplayActionEnvelope = {
        actionId: 'act-known-1',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      // Record successful action processed by p1
      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        originalActor,
        originalEnvelope,
        2
      );

      // Non-member p99 submits exact same envelope
      const nonMemberActor: ServerResolvedActor = { playerId: 'p99' };
      const result = evaluateServerGameplayActionRequest(roomState, originalEnvelope, registry, nonMemberActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTOR_NOT_MEMBER' });
      expect(result.decision).not.toBe('DUPLICATE');
    });

    it('2. original member + exact processed action + advanced revision/turn => DUPLICATE (AC-23, AC-24, AC-25, AC-26, AC-27, AC-28)', () => {
      const { roomState } = setupMatchAndRoom(['p1', 'p2']);
      const actor: ServerResolvedActor = { playerId: 'p1' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-p1-1',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        actor,
        envelope,
        2
      );

      // Room revision advances to 10 and turn advances to turn-5
      const advancedRoomState: RoomAuthorityState<MatchState> = {
        ...roomState,
        revision: 10,
        currentTurnId: 'turn-5',
      };

      const result = evaluateServerGameplayActionRequest(advancedRoomState, envelope, registry, actor);

      expect(result).toEqual({
        decision: 'DUPLICATE',
        priorResultingRevision: 2,
      });
    });

    it('3. second valid member + exact same actionId/envelope => ACTION_ID_CONFLICT, not DUPLICATE (AC-29, AC-31, AC-32, AC-33)', () => {
      const { roomState } = setupMatchAndRoom(['p1', 'p2']);
      const p1Actor: ServerResolvedActor = { playerId: 'p1' };
      const p2Actor: ServerResolvedActor = { playerId: 'p2' };

      const envelope: GameplayActionEnvelope = {
        actionId: 'shared-act-id',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        p1Actor,
        envelope,
        2
      );

      // Member p2 submits exact same actionId and envelope
      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, p2Actor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTION_ID_CONFLICT' });
      expect(result.decision).not.toBe('DUPLICATE');
      expect(result.decision).not.toBe('ACCEPT');
    });

    it('4. second valid member is current Player and revision/turn match but actionId belongs to original actor => ACTION_ID_CONFLICT', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const otherPlayerId = currentPlayerId === 'p1' ? 'p2' : 'p1';

      const originalOwner: ServerResolvedActor = { playerId: otherPlayerId };
      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };

      const envelope: GameplayActionEnvelope = {
        actionId: 'action-owned-by-other',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };

      const registry = recordSuccessfulGameplayAction(
        createProcessedGameplayActionRegistry(),
        originalOwner,
        envelope,
        2
      );

      // currentActor (who is current turn player) submits actionId owned by otherPlayerId
      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, currentActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTION_ID_CONFLICT' });
    });

    it('5. unseen current actor + legal PLAY with own card => ACCEPT (AC-54, AC-61)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const currentActorState = matchState.players[currentPlayerId];
      const ownCardId = currentActorState.hand[0].id;

      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-valid-play',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [ownCardId] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, currentActor);

      expect(result).toEqual({ decision: 'ACCEPT' });
    });

    it('6. unseen current actor + foreign Player card ID => INVALID_PLAY_SELECTION (AC-59)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const otherPlayerId = currentPlayerId === 'p1' ? 'p2' : 'p1';
      const foreignCardId = matchState.players[otherPlayerId].hand[0].id;

      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-foreign-card',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [foreignCardId] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, currentActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'INVALID_PLAY_SELECTION' });
    });

    it('7. unseen current actor + unknown card ID => INVALID_PLAY_SELECTION (AC-60)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;

      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-unknown-card',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['card-does-not-exist-999'] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, currentActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'INVALID_PLAY_SELECTION' });
    });

    it('8. first Turn CALL_LIAR => ACTION_NOT_ALLOWED (AC-53)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;

      // On Round 1 first turn, previousPlay is null => CALL_LIAR is not allowed by Core
      expect(matchState.round.previousPlay).toBeNull();

      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-first-turn-call',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, currentActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTION_NOT_ALLOWED' });
    });

    it('9. forced-CALL state PLAY_CARDS => ACTION_NOT_ALLOWED (AC-56)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);

      const p2Hand = [matchState.players.p2.hand[0]];
      const forcedMatch: MatchState = {
        ...matchState,
        players: {
          p1: { ...matchState.players.p1, hand: [], roundStatus: 'EMPTY_PENDING_CHALLENGE' },
          p2: { ...matchState.players.p2, hand: p2Hand, roundStatus: 'WITH_CARDS' },
        },
        round: {
          ...matchState.round,
          currentPlayerId: 'p2',
          previousPlay: {
            playId: 0,
            playerId: 'p1',
            claimedRank: 'KING',
            cardIds: ['c1'],
            count: 1,
            resolved: false,
          },
        },
      };

      const forcedRoomState: RoomAuthorityState<MatchState> = {
        ...roomState,
        match: forcedMatch,
      };

      const p2Actor: ServerResolvedActor = { playerId: 'p2' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-play-in-forced-call',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [p2Hand[0].id] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(forcedRoomState, envelope, registry, p2Actor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTION_NOT_ALLOWED' });
    });

    it('10. forced-CALL state CALL_LIAR => ACCEPT (AC-57)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);

      const p2Hand = [matchState.players.p2.hand[0]];
      const forcedMatch: MatchState = {
        ...matchState,
        players: {
          p1: { ...matchState.players.p1, hand: [], roundStatus: 'EMPTY_PENDING_CHALLENGE' },
          p2: { ...matchState.players.p2, hand: p2Hand, roundStatus: 'WITH_CARDS' },
        },
        round: {
          ...matchState.round,
          currentPlayerId: 'p2',
          previousPlay: {
            playId: 0,
            playerId: 'p1',
            claimedRank: 'KING',
            cardIds: ['c1'],
            count: 1,
            resolved: false,
          },
        },
      };

      const forcedRoomState: RoomAuthorityState<MatchState> = {
        ...roomState,
        match: forcedMatch,
      };

      const p2Actor: ServerResolvedActor = { playerId: 'p2' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-call-in-forced-call',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'CALL_LIAR',
        payload: {},
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(forcedRoomState, envelope, registry, p2Actor);

      expect(result).toEqual({ decision: 'ACCEPT' });
    });

    it('11. non-current Room member => ACTOR_NOT_CURRENT_PLAYER (AC-50)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const nonCurrentPlayerId = currentPlayerId === 'p1' ? 'p2' : 'p1';

      const nonCurrentActor: ServerResolvedActor = { playerId: nonCurrentPlayerId };
      const ownCardId = matchState.players[nonCurrentPlayerId].hand[0].id;
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-out-of-turn',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [ownCardId] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, nonCurrentActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTOR_NOT_CURRENT_PLAYER' });
    });

    it('12. Room member absent from Match players => ACTOR_NOT_MATCH_PLAYER (AC-49)', () => {
      const { roomState } = setupMatchAndRoom(['p1', 'p2']);

      const roomWithExtraMember: RoomAuthorityState<MatchState> = {
        ...roomState,
        members: [
          ...roomState.members,
          { playerId: 'p3-spectator', joinOrder: 99 },
        ],
      };

      const spectatorActor: ServerResolvedActor = { playerId: 'p3-spectator' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-spectator',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomWithExtraMember, envelope, registry, spectatorActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTOR_NOT_MATCH_PLAYER' });
    });

    it('13. null Match snapshot => MATCH_STATE_MISSING (AC-45)', () => {
      const { roomState } = setupMatchAndRoom(['p1', 'p2']);
      const roomStateNoMatch: RoomAuthorityState<MatchState> = {
        ...roomState,
        match: null,
      };

      const p1Actor: ServerResolvedActor = { playerId: 'p1' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-no-match',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomStateNoMatch, envelope, registry, p1Actor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'MATCH_STATE_MISSING' });
    });

    it('14. hostPlayerId actor who is not current Player => no Host bypass (AC-51)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const otherPlayerId = currentPlayerId === 'p1' ? 'p2' : 'p1';

      const roomWithOtherHost: RoomAuthorityState<MatchState> = {
        ...roomState,
        hostPlayerId: otherPlayerId,
      };

      const hostActor: ServerResolvedActor = { playerId: otherPlayerId };
      const ownCardId = matchState.players[otherPlayerId].hand[0].id;
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-host-out-of-turn',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [ownCardId] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomWithOtherHost, envelope, registry, hostActor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'ACTOR_NOT_CURRENT_PLAYER' });
    });

    it('15. __proto__ / constructor action IDs => prototype safe (AC-74, AC-75)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };
      const ownCardId = matchState.players[currentPlayerId].hand[0].id;

      const protoEnvelope: GameplayActionEnvelope = {
        actionId: '__proto__',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [ownCardId] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const res1 = evaluateServerGameplayActionRequest(roomState, protoEnvelope, registry, currentActor);
      expect(res1).toEqual({ decision: 'ACCEPT' });

      const updatedReg = recordSuccessfulGameplayAction(registry, currentActor, protoEnvelope, 2);
      expect(Object.getPrototypeOf(updatedReg)).toBeNull();

      const res2 = evaluateServerGameplayActionRequest(roomState, protoEnvelope, updatedReg, currentActor);
      expect(res2).toEqual({ decision: 'DUPLICATE', priorResultingRevision: 2 });
    });

    it('16. __proto__ / constructor actor IDs => safe values, no prototype mutation (AC-76, AC-77)', () => {
      const specialActor: ServerResolvedActor = { playerId: '__proto__' };
      const matchState = initializeMatch(['__proto__', 'p2'], createMockRandom());

      const roomState: RoomAuthorityState<MatchState> = {
        ...createInitialRoomState('room-proto-actor'),
        lifecycle: 'MATCH_ACTIVE',
        revision: 1,
        members: [
          { playerId: '__proto__', joinOrder: 1 },
          { playerId: 'p2', joinOrder: 2 },
        ],
        hostPlayerId: '__proto__',
        match: matchState,
        currentTurnId: 'turn-1',
      };

      const currentPlayerId = matchState.round.currentPlayerId;
      if (currentPlayerId === '__proto__') {
        const ownCardId = matchState.players['__proto__'].hand[0].id;
        const envelope: GameplayActionEnvelope = {
          actionId: 'act-special-actor',
          expectedRevision: 1,
          turnId: 'turn-1',
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [ownCardId] },
        };
        const registry = createProcessedGameplayActionRegistry();

        const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, specialActor);
        expect(result).toEqual({ decision: 'ACCEPT' });

        const updated = recordSuccessfulGameplayAction(registry, specialActor, envelope, 2);
        expect(Object.getPrototypeOf(updated)).toBeNull();
        expect(updated['act-special-actor'].actorPlayerId).toBe('__proto__');
      }
    });
  });

  describe('Additional Edge Cases & Security Invariants (AC-39 .. AC-64)', () => {
    it('rejects when MatchState is already FINISHED as MATCH_NOT_ACTIVE (AC-46)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const finishedMatch: MatchState = {
        ...matchState,
        status: 'FINISHED',
        winnerId: 'p1',
      };

      const roomStateFinishedMatch: RoomAuthorityState<MatchState> = {
        ...roomState,
        match: finishedMatch,
      };

      const p1Actor: ServerResolvedActor = { playerId: 'p1' };
      const envelope: GameplayActionEnvelope = {
        actionId: 'act-finished-match',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomStateFinishedMatch, envelope, registry, p1Actor);

      expect(result).toEqual({ decision: 'REJECT', reason: 'MATCH_NOT_ACTIVE' });
    });

    it('never exposes Card rank/value or other player hand in authorization result (AC-62, AC-63)', () => {
      const { roomState, matchState } = setupMatchAndRoom(['p1', 'p2']);
      const currentPlayerId = matchState.round.currentPlayerId;
      const ownCardId = matchState.players[currentPlayerId].hand[0].id;
      const currentActor: ServerResolvedActor = { playerId: currentPlayerId };

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-info-leak-test',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: [ownCardId] },
      };
      const registry = createProcessedGameplayActionRegistry();

      const result = evaluateServerGameplayActionRequest(roomState, envelope, registry, currentActor);

      expect(result).toEqual({ decision: 'ACCEPT' });
      expect(result).not.toHaveProperty('card');
      expect(result).not.toHaveProperty('rank');
      expect(result).not.toHaveProperty('hand');
      expect(result).not.toHaveProperty('undealt');
    });

    it('does not mutate RoomAuthorityState, MatchState, envelope, actor, or registry (AC-78 .. AC-83)', () => {
      const { roomState } = setupMatchAndRoom(['p1', 'p2']);
      const roomStateCopy = JSON.parse(JSON.stringify(roomState));

      const actor: ServerResolvedActor = { playerId: 'p1' };
      const actorCopy = JSON.parse(JSON.stringify(actor));

      const envelope: GameplayActionEnvelope = {
        actionId: 'act-purity-test',
        expectedRevision: 1,
        turnId: 'turn-1',
        actionType: 'PLAY_CARDS',
        payload: { cardIds: ['c1'] },
      };
      const envelopeCopy = JSON.parse(JSON.stringify(envelope));

      const registry = createProcessedGameplayActionRegistry();

      evaluateServerGameplayActionRequest(roomState, envelope, registry, actor);

      expect(roomState).toEqual(roomStateCopy);
      expect(actor).toEqual(actorCopy);
      expect(envelope).toEqual(envelopeCopy);
      expect(Object.keys(registry)).toHaveLength(0);
    });
  });
});
