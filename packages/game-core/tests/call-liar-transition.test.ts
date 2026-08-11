import { describe, it, expect } from 'vitest';
import { applyCallLiar } from '../src/call-liar-transition.js';
import { initializeMatch } from '../src/match.js';
import { applyPlayCards } from '../src/play-transition.js';
import { resolveLiarChallenge } from '../src/challenge-rules.js';
import { initializeNextRound } from '../src/round-transition.js';
import { MatchState, PlayerState } from '../src/game-state.js';
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

  // Helper to set up a state where current player can CALL
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
      // Force A to play a Lie (e.g. claim TableRank when playing a card of different rank)
      const actorId = initial.round.currentPlayerId;
      const actorHand = initial.players[actorId]!.hand;
      const nonMatchingCard = actorHand.find((c) => c.rank !== initial.round.tableRank) || actorHand[0]!;

      const stateAfterPlay = applyPlayCards(initial, actorId, [nonMatchingCard.id]);
      const callerId = stateAfterPlay.round.currentPlayerId; // next player

      // Set accused (actorId) revolver sequence to start with BLANK
      const stateWithBlankRevolver: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [actorId]: {
            ...stateAfterPlay.players[actorId]!,
            revolver: {
              sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
              nextShotIndex: 0
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(100);
      const result = applyCallLiar(stateWithBlankRevolver, callerId, transitionRng);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.winnerId).toBeNull();
      expect(result.challenge.playWasTruthful).toBe(nonMatchingCard.rank === initial.round.tableRank || nonMatchingCard.rank === 'JOKER');
      
      if (!result.challenge.playWasTruthful) {
        expect(result.challenge.challengerWasCorrect).toBe(true);
        expect(result.challenge.shooterId).toBe(actorId); // accused
      }

      expect(result.shot.outcome).toBe('BLANK');
      expect(result.shot.eliminated).toBe(false);

      // T20: Surviving round loser starts next round
      expect(result.state.round.currentPlayerId).toBe(result.challenge.roundLoserId);
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.centralPile).toEqual([]);
    });

    it('T16 + T17 + T20: Truth -> caller shoots BLANK -> next round starts, caller starts', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B', 'C', 'D'], random);
      const actorId = initial.round.currentPlayerId;
      const actorHand = initial.players[actorId]!.hand;
      // Find a truthful card matching tableRank
      const matchingCard = actorHand.find((c) => c.rank === initial.round.tableRank || c.rank === 'JOKER');

      if (!matchingCard) {
        // Skip test if no matching card in hand for this seed
        return;
      }

      const stateAfterPlay = applyPlayCards(initial, actorId, [matchingCard.id]);
      const callerId = stateAfterPlay.round.currentPlayerId;

      // Set caller revolver sequence to start with BLANK
      const stateWithBlankRevolver: MatchState = {
        ...stateAfterPlay,
        players: {
          ...stateAfterPlay.players,
          [callerId]: {
            ...stateAfterPlay.players[callerId]!,
            revolver: {
              sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
              nextShotIndex: 0
            }
          }
        }
      };

      const transitionRng = new PredictableRandom(100);
      const result = applyCallLiar(stateWithBlankRevolver, callerId, transitionRng);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.challenge.playWasTruthful).toBe(true);
      expect(result.challenge.challengerWasCorrect).toBe(false);
      expect(result.challenge.shooterId).toBe(callerId); // caller
      expect(result.shot.outcome).toBe('BLANK');
      expect(result.state.round.currentPlayerId).toBe(callerId);
    });
  });

  describe('T18 + T21 Integration (Continuing Match, LETHAL Shot)', () => {
    it('3+ Living -> loser shoots LETHAL -> loser ELIMINATED -> next round starts with fallback starter', () => {
      const stateAfterPlay = createPlayState();
      const callerId = stateAfterPlay.round.currentPlayerId;

      // Set shooter (whoever is round loser) revolver sequence to start with LETHAL
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

      const transitionRng = new PredictableRandom(200);
      const result = applyCallLiar(stateWithLethal, callerId, transitionRng);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.winnerId).toBeNull();
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
      // Set up 2 living players A and B
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

      // Pass ThrowingRandom to prove next-round RNG is NOT consumed!
      const throwingRng = new ThrowingRandom();
      const result = applyCallLiar(stateWithLethal, callerId, throwingRng);

      expect(result.terminal).toBe('MATCH_WON');
      expect(result.state.status).toBe('FINISHED');

      const expectedWinner = shooterId === 'A' ? 'B' : 'A';
      expect(result.winnerId).toBe(expectedWinner);
      expect(result.state.winnerId).toBe(expectedWinner);

      // Verify no new round cleanup performed
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

  describe('Forced Caller Compatibility', () => {
    it('1v1 forced caller can execute full stateful CALL', () => {
      const random = new PredictableRandom(rngSeed);
      const initial = initializeMatch(['A', 'B'], random);
      // Make A play their last card or single card
      const starter = initial.round.currentPlayerId;
      const singleCardHand = [initial.players[starter]!.hand[0]!];
      const customState: MatchState = {
        ...initial,
        players: {
          ...initial.players,
          [starter]: { ...initial.players[starter]!, hand: singleCardHand }
        }
      };

      // A plays their last card -> becomes EMPTY_PENDING_CHALLENGE
      const stateAfterPlay = applyPlayCards(customState, starter, [singleCardHand[0]!.id]);
      const forcedCallerId = stateAfterPlay.round.currentPlayerId; // B is forced caller

      // Set B revolver to BLANK
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
  });

  describe('Result Metadata & Detached Snapshots', () => {
    it('Challenge & Shot metadata remain available on transition result after Round Reset clears previousPlay', () => {
      const stateAfterPlay = createPlayState();
      const callerId = stateAfterPlay.round.currentPlayerId;

      const random = new PredictableRandom(rngSeed);
      const result = applyCallLiar(stateAfterPlay, callerId, random);

      expect(result.terminal).toBe('NEXT_ROUND');
      expect(result.state.round.previousPlay).toBeNull();

      // Transition metadata still holds original challenge & shot summaries!
      expect(result.challenge.playId).toBe(stateAfterPlay.round.previousPlay!.playId);
      expect(result.challenge.revealedCards.length).toBeGreaterThan(0);
      expect(result.shot.playerId).toBe(result.challenge.shooterId);
      expect(typeof result.shot.nextShotIndex).toBe('number');
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
