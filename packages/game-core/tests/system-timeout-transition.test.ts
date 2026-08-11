import { describe, it, expect } from 'vitest';
import { applySystemTimeout } from '../src/system-timeout-transition.js';
import { initializeMatch } from '../src/match.js';
import { Card } from '../src/cards.js';
import { MatchState, PlayerState } from '../src/game-state.js';
import { RandomSource } from '../src/randomness.js';

class ScriptedRandom implements RandomSource {
  private values: number[];
  private index: number = 0;
  public calls: { max: number; returned: number }[] = [];

  constructor(values: number[]) {
    this.values = values;
  }

  nextInt(max: number): number {
    const val = this.values[this.index % this.values.length]!;
    this.index++;
    const returned = Math.min(val, max - 1);
    this.calls.push({ max, returned });
    return returned;
  }
}

class ThrowingRandom implements RandomSource {
  nextInt(_max: number): number {
    throw new Error('RandomSource should not be called!');
  }
}

describe('applySystemTimeout Transition', () => {
  describe('T29 & Basic Timeout Auto-Play (AC-01, AC-02, AC-03, AC-08, AC-09, AC-11, AC-14, AC-15, AC-16, AC-17, AC-18, AC-23, AC-24)', () => {
    it('T29: 5-card hand + timeout -> selects exact index card, auto-plays 1 card, claimCount 1, claimRank tableRank, hand 5->4', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);
      const starterId = initial.round.currentPlayerId;
      const starterHand = initial.players[starterId]!.hand;
      expect(starterHand.length).toBe(5);

      // Scripted index = 2 (3rd card in hand)
      const rngTimeout = new ScriptedRandom([2]);
      const result = applySystemTimeout(initial, rngTimeout);

      // Metadata assertions
      expect(result.timedOutPlayerId).toBe(starterId);
      expect(result.autoPlayedCardId).toBe(starterHand[2]!.id);
      expect(result.createdPlay.cardIds).toEqual([starterHand[2]!.id]);
      expect(result.createdPlay.count).toBe(1);
      expect(result.createdPlay.claimedRank).toBe(initial.round.tableRank);
      expect(result.createdPlay.resolved).toBe(false);
      expect(result.forcedCall).toBeNull();

      // State assertions
      expect(result.state.players[starterId]!.hand.length).toBe(4);
      expect(result.state.players[starterId]!.hand.find(c => c.id === starterHand[2]!.id)).toBeUndefined();
      expect(result.state.round.centralPile).toHaveLength(1);
      expect(result.state.round.previousPlay).toBeDefined();

      // RNG assertions: max passed to first nextInt call was hand.length (5)
      expect(rngTimeout.calls[0]!.max).toBe(5);
      expect(rngTimeout.calls[0]!.returned).toBe(2);
      expect(rngTimeout.calls.length).toBe(1); // Ordinary path consumes exactly 1 RNG call
    });

    it('AC-02 & AC-03: Accepts no actor or card input (derived exclusively from state + RNG)', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);
      const starterId = initial.round.currentPlayerId;

      const rngTimeout = new ScriptedRandom([0]);
      const result = applySystemTimeout(initial, rngTimeout);

      expect(result.timedOutPlayerId).toBe(starterId);
      expect(result.createdPlay.playerId).toBe(starterId);
    });
  });

  describe('T30 — Never Auto-Plays Multiple Cards (AC-19)', () => {
    it('T30: Hand size >= 3 -> createdPlay.count is always 1 and cardIds.length is 1', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C', 'D'], rngSetup);
      const starterId = initial.round.currentPlayerId;
      expect(initial.players[starterId]!.hand.length).toBe(5);

      const rngTimeout = new ScriptedRandom([1]);
      const result = applySystemTimeout(initial, rngTimeout);

      expect(result.createdPlay.count).toBe(1);
      expect(result.createdPlay.cardIds.length).toBe(1);
    });
  });

  describe('T31 — Direct Index Selection Without Truth/Joker Bias (AC-10, AC-20, AC-21, AC-22)', () => {
    it('T31: Index 0, 1, 2 select corresponding truthful, lie, or Joker cards directly without filtering', () => {
      const tableRank = 'KING';
      const cards: Card[] = [
        { id: 'card-king', rank: 'KING' },  // Truthful
        { id: 'card-queen', rank: 'QUEEN' }, // Lie
        { id: 'card-joker', rank: 'JOKER' }  // Joker
      ];

      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: cards,
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b1', rank: 'ACE' }],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;

      const testState: MatchState = {
        status: 'IN_PROGRESS',
        seatOrder: ['A', 'B'],
        firstRoundStarter: 'A',
        players: pDict,
        round: {
          roundNumber: 1,
          tableRank,
          currentPlayerId: 'A',
          previousPlay: null,
          centralPile: [],
          undealtCards: [],
          playSequence: 1
        },
        winnerId: null
      };

      // Test index 0 -> King
      const res0 = applySystemTimeout(testState, new ScriptedRandom([0]));
      expect(res0.autoPlayedCardId).toBe('card-king');

      // Test index 1 -> Queen
      const res1 = applySystemTimeout(testState, new ScriptedRandom([1]));
      expect(res1.autoPlayedCardId).toBe('card-queen');

      // Test index 2 -> Joker
      const res2 = applySystemTimeout(testState, new ScriptedRandom([2]));
      expect(res2.autoPlayedCardId).toBe('card-joker');
    });
  });

  describe('Turn Eligibility & Action Scenarios (AC-25, AC-26, AC-27)', () => {
    it('AC-25: First-turn timeout (previousPlay null) auto-plays 1 card normally', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);
      expect(initial.round.previousPlay).toBeNull();

      const result = applySystemTimeout(initial, new ScriptedRandom([0]));
      expect(result.createdPlay).toBeDefined();
      expect(result.forcedCall).toBeNull();
    });

    it('AC-26: Later ordinary turn (PLAY & CALL both legal) timeout chooses one-card PLAY (does not CALL)', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a1', rank: 'KING' }],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b1', rank: 'QUEEN' }, { id: 'b2', rank: 'QUEEN' }],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;
      pDict['C'] = {
        id: 'C',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'c1', rank: 'ACE' }],
        revolver: { sequence: [], nextShotIndex: 0 }
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
            cardIds: ['a1'],
            count: 1,
            claimedRank: 'KING',
            resolved: false
          },
          centralPile: [{ id: 'a1', rank: 'KING' }],
          undealtCards: [],
          playSequence: 2
        },
        winnerId: null
      };

      // B has choice of PLAY_CARDS or CALL_LIAR. Timeout auto-plays 1 card from B's hand.
      const result = applySystemTimeout(state, new ScriptedRandom([0]));
      expect(result.autoPlayedCardId).toBe('b1');
      expect(result.forcedCall).toBeNull();
      expect(result.state.round.currentPlayerId).toBe('C');
    });

    it('AC-27 / T12: Timeout PLAY closes prior EMPTY_PENDING_CHALLENGE window and makes prior player EMPTY_SAFE', () => {
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
        hand: [{ id: 'b1', rank: 'QUEEN' }, { id: 'b2', rank: 'QUEEN' }],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;
      pDict['C'] = {
        id: 'C',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'c1', rank: 'ACE' }],
        revolver: { sequence: [], nextShotIndex: 0 }
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
            cardIds: ['a1'],
            count: 1,
            claimedRank: 'KING',
            resolved: false
          },
          centralPile: [{ id: 'a1', rank: 'KING' }],
          undealtCards: [],
          playSequence: 2
        },
        winnerId: null
      };

      const result = applySystemTimeout(state, new ScriptedRandom([0]));

      expect(result.state.players['A']!.roundStatus).toBe('EMPTY_SAFE');
      expect(result.state.round.previousPlay!.playerId).toBe('B');
    });
  });

  describe('Forced CALL Integration (AC-28, AC-29, AC-30, AC-31, AC-32, AC-33)', () => {
    it('1v1 Timeout on final card + BLANK shot -> automatic forced CALL, exactly 1 shot, creates next Round', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-final', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b1', rank: 'QUEEN' }],
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

      const rng = new ScriptedRandom([0, 0, 0, 0, 0]); // Index 0 for timeout, rest for next-round shuffle
      const result = applySystemTimeout(state1v1, rng);

      expect(result.autoPlayedCardId).toBe('a-final');
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');

      // Metadata survives next round reset
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.roundNumber).toBe(2);
    });

    it('1v1 Timeout on final card (Lie) + LETHAL shot -> automatic forced CALL, Match FINISHED, sole survivor winner', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-final-lie', rank: 'QUEEN' }], // Lie on KING table
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b1', rank: 'QUEEN' }],
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

      // ThrowingRandom after index 0 proves zero next-round RNG consumed
      const rng = new ScriptedRandom([0]);
      const result = applySystemTimeout(state1v1, rng);

      expect(result.forcedCall!.terminal).toBe('MATCH_WON');
      expect(result.forcedCall!.winnerId).toBe('B');
      expect(result.state.status).toBe('FINISHED');
      expect(result.state.winnerId).toBe('B');
      expect(result.state.round.roundNumber).toBe(1); // No new round
    });
  });

  describe('Rejection & Invariant Guards (AC-04, AC-05, AC-06, AC-24, AC-34)', () => {
    it('AC-04: FINISHED Match rejects applySystemTimeout without consuming RNG', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);
      const finishedState: MatchState = {
        ...initial,
        status: 'FINISHED',
        winnerId: 'A'
      };

      const throwingRng = new ThrowingRandom();
      expect(() => {
        applySystemTimeout(finishedState, throwingRng);
      }).toThrow(/Match is already FINISHED/);
    });

    it('AC-06: CALL-only state (e.g. 1v1 forced caller) rejects applySystemTimeout without consuming RNG', () => {
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
        hand: [{ id: 'b1', rank: 'QUEEN' }],
        revolver: { sequence: [], nextShotIndex: 0 }
      } as PlayerState;

      const mandatoryCallState: MatchState = {
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
            cardIds: ['a1'],
            count: 1,
            claimedRank: 'KING',
            resolved: false
          },
          centralPile: [{ id: 'a1', rank: 'KING' }],
          undealtCards: [],
          playSequence: 2
        },
        winnerId: null
      };

      // B is required to CALL_LIAR. Calling timeout on B must throw without consuming RNG.
      const throwingRng = new ThrowingRandom();
      expect(() => {
        applySystemTimeout(mandatoryCallState, throwingRng);
      }).toThrow(/mandatory CALL_LIAR state/);
    });

    it('AC-05: Malformed current Player state (missing / ELIMINATED / empty hand) rejected before RNG', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);

      // Current player ELIMINATED
      const malformedState: MatchState = {
        ...initial,
        players: {
          ...initial.players,
          [initial.round.currentPlayerId]: {
            ...initial.players[initial.round.currentPlayerId]!,
            lifeStatus: 'ELIMINATED'
          }
        }
      };

      const throwingRng = new ThrowingRandom();
      expect(() => applySystemTimeout(malformedState, throwingRng)).toThrow();
    });
  });

  describe('Prototype Safety (AC-37)', () => {
    it('AC-37: __proto__ current Player ID supported through system timeout', () => {
      const pDict = Object.create(null);
      pDict['__proto__'] = {
        id: '__proto__',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'p1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b1', rank: 'QUEEN' }],
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

      const rng = new ScriptedRandom([0, 0, 0]);
      const result = applySystemTimeout(protoState, rng);

      expect(result.timedOutPlayerId).toBe('__proto__');
      expect(result.autoPlayedCardId).toBe('p1');
      expect(Object.getPrototypeOf(result.state.players)).toBeNull();
    });
  });

  describe('Immutability & Determinism (AC-38, AC-39, AC-40)', () => {
    it('AC-38: Input MatchState is not mutated by applySystemTimeout', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);
      const frozenInputStr = JSON.stringify(initial);

      applySystemTimeout(initial, new ScriptedRandom([0]));
      expect(JSON.stringify(initial)).toBe(frozenInputStr);
    });

    it('AC-39: Equivalent state + RNG sequence produces equivalent timeout result', () => {
      const rngSetup = new ScriptedRandom([0]);
      const initial = initializeMatch(['A', 'B', 'C'], rngSetup);

      const res1 = applySystemTimeout(initial, new ScriptedRandom([1]));
      const res2 = applySystemTimeout(initial, new ScriptedRandom([1]));

      expect(res1).toEqual(res2);
    });
  });
});
