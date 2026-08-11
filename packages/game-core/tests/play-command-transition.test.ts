import { describe, it, expect } from 'vitest';
import { applyPlayCardsCommand } from '../src/play-command-transition.js';
import { applyPlayCards } from '../src/play-transition.js';
import { initializeMatch } from '../src/match.js';
import { getAllowedTurnActions } from '../src/turn-rules.js';
import { Card } from '../src/cards.js';
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

describe('applyPlayCardsCommand Orchestration', () => {
  describe('Ordinary PLAY Path (AC-06, AC-07, AC-20)', () => {
    it('>=2 Living Players hold cards -> returns post-PLAY state, createdPlay, and forcedCall=null', () => {
      const rng = new PredictableRandom(42);
      const initial = initializeMatch(['A', 'B', 'C'], rng);
      const starter = initial.round.currentPlayerId;
      const cardToPlay = [initial.players[starter]!.hand[0]!.id];

      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(initial, starter, cardToPlay, throwingRng);

      expect(result.forcedCall).toBeNull();
      expect(result.createdPlay).toBeDefined();
      expect(result.createdPlay.playerId).toBe(starter);
      expect(result.createdPlay.cardIds).toEqual(cardToPlay);
      expect(result.createdPlay.resolved).toBe(false);

      const expectedDirectState = applyPlayCards(initial, starter, cardToPlay);
      expect(result.state).toEqual(expectedDirectState);
    });

    it('AC-07: Ordinary PLAY consumes zero RNG (ThrowingRandom succeeds)', () => {
      const rng = new PredictableRandom(10);
      const initial = initializeMatch(['A', 'B', 'C', 'D'], rng);
      const starter = initial.round.currentPlayerId;
      const cardToPlay = [initial.players[starter]!.hand[0]!.id];

      const throwingRng = new ThrowingRandom();
      expect(() => {
        applyPlayCardsCommand(initial, starter, cardToPlay, throwingRng);
      }).not.toThrow();
    });
  });

  describe('T13 — 1v1 Automatic Forced CALL (AC-12, AC-13, AC-14, AC-15, AC-16)', () => {
    it('T13 BLANK: 1v1 final Play automatically executes opponent CALL, results in next round', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-card-1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const state1v1: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'A',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 1
        },
        winnerId: null
      };

      // A plays their final card. Afterwards, B is sole living with cards -> B automatically CALLs A.
      const transitionRng = new PredictableRandom(123);
      const result = applyPlayCardsCommand(state1v1, 'A', ['a-card-1'], transitionRng);

      // Verify createdPlay snapshot metadata
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.createdPlay.cardIds).toEqual(['a-card-1']);
      expect(result.createdPlay.resolved).toBe(false);

      // Verify automatic forced CALL occurred
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.playerId).toBe(result.forcedCall!.challenge.shooterId);
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();

      // Final state verification
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.centralPile).toEqual([]);
    });

    it('T13 LETHAL: 1v1 final Play automatic CALL results in LETHAL -> Match FINISHED without next-Round RNG', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-card-1', rank: 'QUEEN' }], // Lie on KING table
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const state1v1: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'A',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 10
        },
        winnerId: null
      };

      // A plays a Lie. B automatically CALLs A. A shoots LETHAL and is eliminated. B wins immediately (T26).
      // ThrowingRandom proves zero next-Round RNG is consumed on MATCH_WON terminal.
      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(state1v1, 'A', ['a-card-1'], throwingRng);

      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.shooterId).toBe('A');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);
      expect(result.forcedCall!.terminal).toBe('MATCH_WON');
      expect(result.forcedCall!.winnerId).toBe('B');

      expect(result.state.status).toBe('FINISHED');
      expect(result.state.winnerId).toBe('B');
      expect(result.state.round.roundNumber).toBe(1); // Round number did not advance
    });
  });

  describe('T14 — 3-Player Automatic Forced CALL (AC-17, AC-18, AC-19)', () => {
    it('3-player scenario: B plays final cards, C becomes sole card holder -> C automatically CALLs B', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['C'] = {
        id: 'C',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'c-card-1', rank: 'ACE' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const state3p: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B', 'C'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'B',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 5
        },
        winnerId: null
      };

      const rng = new PredictableRandom(99);
      const result = applyPlayCardsCommand(state3p, 'B', ['b-card-1'], rng);

      expect(result.createdPlay.playerId).toBe('B');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('C');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('B');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
    });

    it('AC-19: Forced CALL targets newest Play even when prior round-state setup is present', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_SAFE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-final', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['C'] = {
        id: 'C',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'c-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const stateWithPrevious: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B', 'C'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'B',
          previousPlay: {
            playId: 99,
            playerId: 'A',
            cardIds: ['a-old-card'],
            count: 1,
            claimedRank: 'KING',
            resolved: false
          },
          centralPile: [{ id: 'a-old-card', rank: 'KING' }],
          undealtCards: [],
          playSequence: 100
        },
        winnerId: null
      };

      const rng = new PredictableRandom(7);
      const result = applyPlayCardsCommand(stateWithPrevious, 'B', ['b-card-final'], rng);

      expect(result.createdPlay.playId).toBe(100);
      expect(result.createdPlay.playerId).toBe('B');
      expect(result.forcedCall!.challenge.playId).toBe(100);
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('B');
    });
  });

  describe('T12 Challenge Window Preservation (AC-21, AC-22)', () => {
    it('T12: old EMPTY_PENDING_CHALLENGE player becomes EMPTY_SAFE when next player chooses PLAY', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_PENDING_CHALLENGE',
        hand: [],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'KING' }, { id: 'b-card-2', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['C'] = {
        id: 'C',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'c-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const state: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B', 'C'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'B',
          previousPlay: {
            playId: 1,
            playerId: 'A',
            cardIds: ['a-card-1'],
            count: 1,
            claimedRank: 'KING',
            resolved: false
          },
          centralPile: [{ id: 'a-card-1', rank: 'KING' }],
          undealtCards: [],
          playSequence: 2
        },
        winnerId: null
      };

      // B plays 1 card (not final card)
      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(state, 'B', ['b-card-1'], throwingRng);

      expect(result.forcedCall).toBeNull();
      expect(result.state.players['A']!.roundStatus).toBe('EMPTY_SAFE');
      expect(result.state.players['B']!.hand).toHaveLength(1);
      expect(result.state.round.currentPlayerId).toBe('C');
    });
  });

  describe('Already Forced Actor Cannot PLAY (AC-23)', () => {
    it('actor already required to CALL is rejected when attempting PLAY command', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'EMPTY_PENDING_CHALLENGE',
        hand: [],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;

      const forcedState: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'B',
          previousPlay: {
            playId: 1,
            playerId: 'A',
            cardIds: ['a-card-1'],
            count: 1,
            claimedRank: 'KING',
            resolved: false
          },
          centralPile: [{ id: 'a-card-1', rank: 'KING' }],
          undealtCards: [],
          playSequence: 2
        },
        winnerId: null
      };

      // B is sole living player with cards and previousPlay exists.
      // B MUST CALL_LIAR.
      const throwingRng = new ThrowingRandom();
      expect(() => {
        applyPlayCardsCommand(forcedState, 'B', ['b-card-1'], throwingRng);
      }).toThrow(/not allowed to PLAY_CARDS/);
    });
  });

  describe('Metadata Retention & Detachment (AC-03, AC-04, AC-25, AC-26, AC-27, AC-31, AC-32, AC-33, AC-34)', () => {
    it('Metadata survives Round Reset: createdPlay and forcedCall metadata remain available when state.round.previousPlay is null', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-card-1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const state: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'A',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 10
        },
        winnerId: null
      };

      const rng = new PredictableRandom(55);
      const result = applyPlayCardsCommand(state, 'A', ['a-card-1'], rng);

      // Final state has start of new round: previousPlay is null
      expect(result.state.round.previousPlay).toBeNull();

      // Result metadata retains createdPlay, challenge, and shot
      expect(result.createdPlay.playId).toBe(10);
      expect(result.createdPlay.cardIds).toEqual(['a-card-1']);

      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.playId).toBe(10);
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.shot.playerId).toBe(result.forcedCall!.challenge.shooterId);
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');


      // AC-32: forcedCall has no nested state property
      expect(result.forcedCall).not.toHaveProperty('state');
    });

    it('AC-33: createdPlay object and cardIds array are detached snapshots', () => {
      const rng = new PredictableRandom(42);
      const initial = initializeMatch(['A', 'B', 'C'], rng);
      const starter = initial.round.currentPlayerId;
      const cardToPlay = [initial.players[starter]!.hand[0]!.id];

      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(initial, starter, cardToPlay, throwingRng);

      expect(result.createdPlay).not.toBe(result.state.round.previousPlay);
      expect(result.createdPlay.cardIds).not.toBe(result.state.round.previousPlay!.cardIds);

      // Mutate consumer copy
      (result.createdPlay.cardIds as string[]).push('mutated-id');
      expect(result.state.round.previousPlay!.cardIds).toEqual(cardToPlay);
    });

    it('AC-25 / AC-26 / AC-27: playSequence, hand removal, and central pile mutated exactly once', () => {
      const rng = new PredictableRandom(42);
      const initial = initializeMatch(['A', 'B', 'C'], rng);
      const starter = initial.round.currentPlayerId;
      const initialSeq = initial.round.playSequence;
      const cardToPlay = [initial.players[starter]!.hand[0]!.id];

      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(initial, starter, cardToPlay, throwingRng);

      expect(result.createdPlay.playId).toBe(initialSeq);
      expect(result.state.round.playSequence).toBe(initialSeq + 1);
      expect(result.state.round.centralPile).toHaveLength(1);
    });
  });

  describe('Rejection & Invariant Guards (AC-35, AC-36, AC-37)', () => {
    it('FINISHED Match rejects PLAY command orchestration without consuming RNG', () => {
      const rng = new PredictableRandom(42);
      const initial = initializeMatch(['A', 'B', 'C'], rng);
      const finishedState: MatchState = {
        ...initial,
        status: 'FINISHED',
        winnerId: 'A'
      };

      const throwingRng = new ThrowingRandom();
      expect(() => {
        applyPlayCardsCommand(finishedState, 'A', ['card1'], throwingRng);
      }).toThrow(/Match is already FINISHED/);
    });

    it('Illegal PLAY inputs are rejected by verified primitive and cause zero RNG', () => {
      const rng = new PredictableRandom(42);
      const initial = initializeMatch(['A', 'B', 'C'], rng);
      const starter = initial.round.currentPlayerId;
      const wrongActor = initial.seatOrder.find((id) => id !== starter)!;

      const throwingRng = new ThrowingRandom();

      // Out-of-turn
      expect(() => applyPlayCardsCommand(initial, wrongActor, ['card1'], throwingRng)).toThrow();
      // Empty cards
      expect(() => applyPlayCardsCommand(initial, starter, [], throwingRng)).toThrow();
      // Unknown card
      expect(() => applyPlayCardsCommand(initial, starter, ['unknown-card-id'], throwingRng)).toThrow();
    });
  });

  describe('Prototype Safety (AC-38)', () => {
    it('prototype-safe dictionary with __proto__ key', () => {
      const pDict = Object.create(null);
      pDict['__proto__'] = {
        id: '__proto__',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p-card-1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const protoState: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['__proto__', 'B'],
        firstRoundStarter: '__proto__',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: '__proto__',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 1
        },
        winnerId: null
      };

      const rng = new PredictableRandom(88);
      const result = applyPlayCardsCommand(protoState, '__proto__', ['p-card-1'], rng);

      expect(Object.getPrototypeOf(result.state.players)).toBeNull();
      expect(result.createdPlay.playerId).toBe('__proto__');
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('__proto__');
    });
  });

  describe('Immutability & Determinism (AC-39, AC-40, AC-41)', () => {
    it('AC-39: Input MatchState and requestedCardIds are not mutated', () => {
      const rng = new PredictableRandom(42);
      const initial = initializeMatch(['A', 'B', 'C'], rng);
      const starter = initial.round.currentPlayerId;
      const requestedCardIds = [initial.players[starter]!.hand[0]!.id];

      const frozenStateStr = JSON.stringify(initial);
      const frozenCardsStr = JSON.stringify(requestedCardIds);

      const throwingRng = new ThrowingRandom();
      applyPlayCardsCommand(initial, starter, requestedCardIds, throwingRng);

      expect(JSON.stringify(initial)).toBe(frozenStateStr);
      expect(JSON.stringify(requestedCardIds)).toBe(frozenCardsStr);
    });

    it('AC-40: Equivalent input + RNG produces equivalent command result', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-card-1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const state: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank: 'KING',
          currentPlayerId: 'A',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 1
        },
        winnerId: null
      };

      const res1 = applyPlayCardsCommand(state, 'A', ['a-card-1'], new PredictableRandom(50));
      const res2 = applyPlayCardsCommand(state, 'A', ['a-card-1'], new PredictableRandom(50));

      expect(res1).toEqual(res2);
    });
  });
});
