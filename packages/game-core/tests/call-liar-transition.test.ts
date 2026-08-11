import { describe, it, expect } from 'vitest';
import { applyCallLiar } from '../src/call-liar-transition.js';
import { initializeMatch } from '../src/match.js';
import { applyPlayCards } from '../src/play-transition.js';
import { resolveLiarChallenge } from '../src/challenge-rules.js';
import { initializeNextRound } from '../src/round-transition.js';
import { getAllowedTurnActions } from '../src/turn-rules.js';
import { Card, CardRank } from '../src/cards.js';
import { MatchState } from '../src/game-state.js';
import { RandomSource } from '../src/randomness.js';

class PredictableRandom implements RandomSource {
  private state: number;
  constructor(seed: number = 0) {
    this.state = seed;
  }
  nextInt(max: number): number {
    this.state = (this.state * 9301 + 49297) % 233280;
    return Math.floor((this.state / 233280) * max);
  }
}

class ThrowingRandom implements RandomSource {
  nextInt(_max: number): number {
    throw new Error('RandomSource should not be called!');
  }
}

describe('applyCallLiar Transition', () => {
  const rngSeed = 42;

  function createPlayState(): MatchState {
    const random = new PredictableRandom(rngSeed);
    const initial = initializeMatch(['A', 'B', 'C', 'D'], random);
    const starter = initial.round.currentPlayerId;
    const starterHand = initial.players[starter]!.hand;
    const cardToPlay = [starterHand[0]!.id];

    return applyPlayCards(initial, starter, cardToPlay);
  }

  describe('Illegal CALL & Rejection Guards', () => {
    it('previousPlay null -> rejected', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B', 'C', 'D'], random);
      expect(() => applyCallLiar(initial, initial.round.currentPlayerId, random)).toThrow(/previousPlay is null/);
    });

    it('out-of-turn caller -> rejected', () => {
      const state = createPlayState();
      const random = new PredictableRandom(rngSeed);
      const wrongCaller = state.seatOrder.find((id) => id !== state.round.currentPlayerId)!;
      expect(() => applyCallLiar(state, wrongCaller, random)).toThrow(/not the current player/);
    });

    it('resolved previousPlay -> rejected', () => {
      const state = createPlayState();
      const random = new PredictableRandom(rngSeed);
      const stateWithResolved: MatchState = {
        ...state,
        round: {
          ...state.round,
          previousPlay: {
            ...state.round.previousPlay!,
            resolved: true
          }
        }
      };
      expect(() => applyCallLiar(stateWithResolved, state.round.currentPlayerId, random)).toThrow(/previously resolved/);
    });

    it('FINISHED Match -> applyCallLiar rejected', () => {
      const state = createPlayState();
      const random = new PredictableRandom(rngSeed);
      const finishedState: MatchState = {
        ...state,
        status: 'FINISHED',
        winnerId: 'A'
      };
      expect(() => applyCallLiar(finishedState, state.round.currentPlayerId, random)).toThrow(/already FINISHED/);
    });

    it('malformed <2 Living active Match -> rejected', () => {
      const state = createPlayState();
      const random = new PredictableRandom(rngSeed);
      const malformedState: MatchState = {
        ...state,
        players: {
          ...state.players,
          B: { ...state.players['B']!, lifeStatus: 'ELIMINATED' },
          C: { ...state.players['C']!, lifeStatus: 'ELIMINATED' },
          D: { ...state.players['D']!, lifeStatus: 'ELIMINATED' }
        }
      };
      expect(() => applyCallLiar(malformedState, state.round.currentPlayerId, random)).toThrow(/at least 2 ALIVE players/);
    });

    it('rejected CALL consumes no RNG and no Shot', () => {
      const state = createPlayState();
      const throwingRng = new ThrowingRandom();
      const caller = state.round.currentPlayerId;
      const initialShotIndex = state.players[caller]!.revolver.nextShotIndex;

      expect(() => applyCallLiar(state, 'WRONG_ACTOR', throwingRng)).toThrow();
      expect(state.players[caller]!.revolver.nextShotIndex).toBe(initialShotIndex);
    });
  });

  describe('T15 / T16 / T17 / T20 Integration (Continuing Match, BLANK Shot)', () => {
    it('T15 + T17 + T20: Lie -> accused shoots BLANK -> next round starts, accused starts', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B', 'C', 'D'], random);
      const actorId = initial.round.currentPlayerId;

      // Guarantee a non-matching non-Joker card in actor's hand
      const nonMatchingRank: CardRank = initial.round.tableRank === 'KING' ? 'QUEEN' : 'KING';
      const lieCard: Card = { id: 'liar-custom-lie-1', rank: nonMatchingRank };
      const actorHand = [lieCard, ...initial.players[actorId]!.hand.slice(1)];

      const initialWithLieHand: MatchState = {
        ...initial,
        players: {
          ...initial.players,
          [actorId]: {
            ...initial.players[actorId]!,
            hand: actorHand
          }
        }
      };

      const stateAfterPlay = applyPlayCards(initialWithLieHand, actorId, [lieCard.id]);
      const callerId = stateAfterPlay.round.currentPlayerId;

      const beforeShotIndex = stateAfterPlay.players[actorId]!.revolver.nextShotIndex;

      // Set accused (actorId) revolver sequence to start with BLANK
      const stateWithBlankRevolver: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [actorId]: {
            ...stateAfterPlay.players[actorId]!,
            revolver: {
              sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
              nextShotIndex: beforeShotIndex
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(100);
      const result = applyCallLiar(stateWithBlankRevolver, callerId, transitionRng);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.winnerId).toBeNull();

      // Deterministic Lie assertions
      expect(result.challenge.playWasTruthful).toBe(false);
      expect(result.challenge.challengerWasCorrect).toBe(true);
      expect(result.challenge.roundLoserId).toBe(actorId);
      expect(result.challenge.shooterId).toBe(actorId);

      // Exactly one Shot consumption assertions
      expect(result.shot.playerId).toBe(actorId);
      expect(result.shot.outcome).toBe('BLANK');
      expect(result.shot.shotIndex).toBe(beforeShotIndex);
      expect(result.shot.nextShotIndex).toBe(beforeShotIndex + 1);
      expect(result.shot.eliminated).toBe(false);

      // T20: Surviving round loser starts next round
      expect(result.state.round.currentPlayerId).toBe(actorId);
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.centralPile).toEqual([]);
    });

    it('T16 + T17 + T20: Truth -> caller shoots BLANK -> next round starts, caller starts', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B', 'C', 'D'], random);
      const actorId = initial.round.currentPlayerId;

      // Guarantee a truthful card matching tableRank
      const truthfulCard = { id: 'liar-custom-truth-1', rank: initial.round.tableRank };
      const actorHand = [truthfulCard, ...initial.players[actorId]!.hand.slice(1)];

      const initialWithTruthHand: MatchState = {
        ...initial,
        players: {
          ...initial.players,
          [actorId]: {
            ...initial.players[actorId]!,
            hand: actorHand
          }
        }
      };

      const stateAfterPlay = applyPlayCards(initialWithTruthHand, actorId, [truthfulCard.id]);
      const callerId = stateAfterPlay.round.currentPlayerId;

      const beforeShotIndex = stateAfterPlay.players[callerId]!.revolver.nextShotIndex;

      // Set caller revolver sequence to start with BLANK
      const stateWithBlankRevolver: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [callerId]: {
            ...stateAfterPlay.players[callerId]!,
            revolver: {
              sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
              nextShotIndex: beforeShotIndex
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(100);
      const result = applyCallLiar(stateWithBlankRevolver, callerId, transitionRng);

      expect(result.terminal).toBe('NEXT_ROUND');

      // Deterministic Truth assertions
      expect(result.challenge.playWasTruthful).toBe(true);
      expect(result.challenge.challengerWasCorrect).toBe(false);
      expect(result.challenge.roundLoserId).toBe(callerId);
      expect(result.challenge.shooterId).toBe(callerId);

      // Exactly one Shot consumption assertions
      expect(result.shot.playerId).toBe(callerId);
      expect(result.shot.outcome).toBe('BLANK');
      expect(result.shot.shotIndex).toBe(beforeShotIndex);
      expect(result.shot.nextShotIndex).toBe(beforeShotIndex + 1);
      expect(result.shot.eliminated).toBe(false);

      expect(result.state.round.currentPlayerId).toBe(callerId);
    });
  });

  describe('T18 + T21 Integration (Continuing Match, LETHAL Shot)', () => {
    it('3+ Living -> loser shoots LETHAL -> loser ELIMINATED -> next round starts with fallback starter', () => {
      const stateAfterPlay = createPlayState();
      const callerId = stateAfterPlay.round.currentPlayerId;

      const challengeTest = resolveLiarChallenge(stateAfterPlay, callerId);
      const shooterId = challengeTest.shooterId;
      const beforeShotIndex = stateAfterPlay.players[shooterId]!.revolver.nextShotIndex;

      const stateWithLethal: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [shooterId]: {
            ...stateAfterPlay.players[shooterId]!,
            revolver: {
              sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'],
              nextShotIndex: beforeShotIndex
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(200);
      const result = applyCallLiar(stateWithLethal, callerId, transitionRng);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.winnerId).toBeNull();

      // Exactly one Shot consumption
      expect(result.shot.shotIndex).toBe(beforeShotIndex);
      expect(result.shot.nextShotIndex).toBe(beforeShotIndex + 1);
      expect(result.shot.outcome).toBe('LETHAL');
      expect(result.shot.eliminated).toBe(true);

      // Loser is ELIMINATED in new state, receives 0 cards
      expect(result.state.players[shooterId]!.lifeStatus).toBe('ELIMINATED');
      expect(result.state.players[shooterId]!.hand).toEqual([]);

      // T21: Starter falls forward to next ALIVE seat in fixed seatOrder
      expect(result.state.round.currentPlayerId).not.toBe(shooterId);
      expect(result.state.players[result.state.round.currentPlayerId]!.lifeStatus).toBe('ALIVE');
    });
  });

  describe('T26 Immediate Match Winner (LETHAL with 2 Living Players)', () => {
    it('2 Living Players before CALL -> shooter gets LETHAL -> 1 Living -> status FINISHED & winner derived without next-round RNG', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B'], random);
      const starter = initial.round.currentPlayerId;
      const starterHand = initial.players[starter]!.hand;
      const stateAfterPlay = applyPlayCards(initial, starter, [starterHand[0]!.id]);

      const callerId = stateAfterPlay.round.currentPlayerId;
      const challengeTest = resolveLiarChallenge(stateAfterPlay, callerId);
      const shooterId = challengeTest.shooterId;

      const stateWithLethal: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [shooterId]: {
            ...stateAfterPlay.players[shooterId]!,
            revolver: {
              sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'],
              nextShotIndex: 0
            }
          }
        }
      };

      const throwingRng = new ThrowingRandom();
      const result = applyCallLiar(stateWithLethal, callerId, throwingRng);

      expect(result.terminal).toBe('MATCH_WON');
      expect(result.state.status).toBe('FINISHED');

      const expectedWinner = shooterId === 'A' ? 'B' : 'A';
      expect(result.winnerId).toBe(expectedWinner);
      expect(result.state.winnerId).toBe(expectedWinner);

      expect(result.state.round.roundNumber).toBe(stateAfterPlay.round.roundNumber);
      expect(result.state.round.previousPlay?.resolved).toBe(true);
    });
  });

  describe('FINISHED State Action Guards', () => {
    it('FINISHED Match rejects applyPlayCards, resolveLiarChallenge, initializeNextRound, applyCallLiar', () => {
      const state = createPlayState();
      const finishedState: MatchState = {
        ...state,
        status: 'FINISHED',
        winnerId: 'A'
      };

      const random = new PredictableRandom(rngSeed);

      expect(() => applyPlayCards(finishedState, 'A', ['card1'])).toThrow(/Match is already FINISHED/);
      expect(() => resolveLiarChallenge(finishedState, 'A')).toThrow(/Match is already FINISHED/);
      expect(() => initializeNextRound(finishedState, 'A', random)).toThrow(/Match is already FINISHED/);
      expect(() => applyCallLiar(finishedState, 'A', random)).toThrow(/Match is already FINISHED/);
    });
  });

  describe('Forced Caller Compatibility (AC-31 & AC-32)', () => {
    it('AC-31: 1v1 forced caller can execute full stateful CALL', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B'], random);
      const starter = initial.round.currentPlayerId;
      const singleCardHand = [initial.players[starter]!.hand[0]!];
      const customState: MatchState = {
        ...initial,
        players: {
          ...initial.players,
          [starter]: { ...initial.players[starter]!, hand: singleCardHand }
        }
      };

      const stateAfterPlay = applyPlayCards(customState, starter, [singleCardHand[0]!.id]);
      const forcedCallerId = stateAfterPlay.round.currentPlayerId;

      const stateWithBlank: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [forcedCallerId]: {
            ...stateAfterPlay.players[forcedCallerId]!,
            revolver: {
              sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
              nextShotIndex: 0
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(50);
      const result = applyCallLiar(stateWithBlank, forcedCallerId, transitionRng);

      expect(result.challenge.callerId).toBe(forcedCallerId);
      expect(result.state).toBeDefined();
    });

    it('AC-32: 3-player single-card-holder forced caller can execute full stateful CALL', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B', 'C'], random);

      // A is ALIVE + EMPTY_SAFE + hand = []
      // B plays final card -> becomes EMPTY_PENDING_CHALLENGE
      // C is the only ALIVE player holding cards -> C is forced caller
      const customState: MatchState = {
        ...initial,
        seatOrder: ['A', 'B', 'C'],
        round: {
          ...initial.round,
          currentPlayerId: 'B'
        },
        players: {
          ...initial.players,
          A: { ...initial.players['A']!, lifeStatus: 'ALIVE', roundStatus: 'EMPTY_SAFE', hand: [] },
          B: { ...initial.players['B']!, lifeStatus: 'ALIVE', roundStatus: 'WITH_CARDS', hand: [{ id: 'b-card-1', rank: 'KING' }] },
          C: { ...initial.players['C']!, lifeStatus: 'ALIVE', roundStatus: 'WITH_CARDS', hand: [{ id: 'c-card-1', rank: 'QUEEN' }] }
        }
      };

      const stateAfterPlay = applyPlayCards(customState, 'B', ['b-card-1']);

      expect(stateAfterPlay.round.currentPlayerId).toBe('C');
      expect(stateAfterPlay.players['B']!.roundStatus).toBe('EMPTY_PENDING_CHALLENGE');

      const allowedActionsForC = getAllowedTurnActions(
        stateAfterPlay.seatOrder,
        stateAfterPlay.players,
        stateAfterPlay.round.currentPlayerId,
        'C',
        true
      );
      expect(allowedActionsForC).toEqual(['CALL_LIAR']);

      const beforeShotIndex = stateAfterPlay.players['C']!.revolver.nextShotIndex;

      const stateWithBlank: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          C: {
            ...stateAfterPlay.players['C']!,
            revolver: {
              sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
              nextShotIndex: beforeShotIndex
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(77);
      const result = applyCallLiar(stateWithBlank, 'C', transitionRng);

      expect(result.challenge.callerId).toBe('C');
      expect(result.challenge.accusedPlayerId).toBe('B');
      expect(result.challenge.playId).toBe(stateAfterPlay.round.previousPlay!.playId);
      expect(result.shot.shotIndex).toBe(beforeShotIndex);
      expect(result.shot.nextShotIndex).toBe(beforeShotIndex + 1);
      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.round.roundNumber).toBe(2);
    });
  });

  describe('Result Metadata & Detached Snapshots', () => {
    it('Challenge & Shot metadata remain available on transition result after Round Reset clears previousPlay', () => {
      const stateAfterPlay = createPlayState();
      const callerId = stateAfterPlay.round.currentPlayerId;

      const random = new PredictableRandom(rngSeed);
      const result = applyCallLiar(stateAfterPlay, callerId, random);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.state.round.previousPlay).toBeNull();

      expect(result.challenge.playId).toBe(stateAfterPlay.round.previousPlay!.playId);
      expect(result.challenge.revealedCards.length).toBeGreaterThan(0);
      expect(result.shot.playerId).toBe(result.challenge.shooterId);
      expect(typeof result.shot.nextShotIndex).toBe('number');
    });

    it('mutating returned revealedCards array does not mutate MatchState', () => {
      const stateAfterPlay = createPlayState();
      const callerId = stateAfterPlay.round.currentPlayerId;

      const random = new PredictableRandom(rngSeed);
      const result = applyCallLiar(stateAfterPlay, callerId, random);

      const mutableRevealed = [...result.challenge.revealedCards];
      mutableRevealed.pop();

      expect(result.challenge.revealedCards.length).toBeGreaterThan(0);
    });
  });

  describe('Prototype Safety', () => {
    it('prototype-safe Players dictionary with __proto__ key support after transition', () => {
      const random = new PredictableRandom(rngSeed);
      const protoState = initializeMatch(['__proto__', 'P2', 'P3'], random);
      const starter = protoState.round.currentPlayerId;
      const starterHand = protoState.players[starter]!.hand;
      const stateAfterPlay = applyPlayCards(protoState, starter, [starterHand[0]!.id]);

      const callerId = stateAfterPlay.round.currentPlayerId;
      const result = applyCallLiar(stateAfterPlay, callerId, random);

      expect(Object.getPrototypeOf(result.state.players)).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(result.state.players, '__proto__')).toBe(true);
    });
  });

  describe('Immutability & Determinism', () => {
    it('input MatchState is not mutated', () => {
      const stateAfterPlay = createPlayState();
      const frozenInputStr = JSON.stringify(stateAfterPlay);
      const callerId = stateAfterPlay.round.currentPlayerId;

      const random = new PredictableRandom(rngSeed);
      applyCallLiar(stateAfterPlay, callerId, random);

      expect(JSON.stringify(stateAfterPlay)).toBe(frozenInputStr);
    });

    it('equivalent input + RNG -> equivalent transition result', () => {
      const stateAfterPlay = createPlayState();
      const callerId = stateAfterPlay.round.currentPlayerId;

      const r1 = new PredictableRandom(rngSeed);
      const res1 = applyCallLiar(stateAfterPlay, callerId, r1);

      const r2 = new PredictableRandom(rngSeed);
      const res2 = applyCallLiar(stateAfterPlay, callerId, r2);

      expect(res1).toEqual(res2);
    });
  });
});
