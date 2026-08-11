import { describe, it, expect } from 'vitest';
import { initializeMatch } from '../src/match.js';
import { applyPlayCardsCommand } from '../src/play-command-transition.js';
import { applySystemTimeout } from '../src/system-timeout-transition.js';
import { MatchState, PlayerState } from '../src/game-state.js';
import { RandomSource } from '../src/randomness.js';
import { Card } from '../src/cards.js';

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

describe('2-Player Flow Hardening (T-012)', () => {
  describe('1. Real Initialization — 2-Player Partition (AC-01, AC-02, AC-03)', () => {
    it('initializes a 2-player match with 5/5 hand split and 10 undealt cards', () => {
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B'], rng);

      expect(match.status).toBe('IN_PROGRESS');
      expect(match.winnerId).toBeNull();
      expect(match.seatOrder).toEqual(['A', 'B']);
      expect(['A', 'B']).toContain(match.round.currentPlayerId);

      const pA = match.players['A']!;
      const pB = match.players['B']!;

      expect(pA.lifeStatus).toBe('ALIVE');
      expect(pA.roundStatus).toBe('WITH_CARDS');
      expect(pA.hand).toHaveLength(5);

      expect(pB.lifeStatus).toBe('ALIVE');
      expect(pB.roundStatus).toBe('WITH_CARDS');
      expect(pB.hand).toHaveLength(5);

      expect(match.round.undealtCards).toHaveLength(10);

      // Verify canonical 20-card partition across A hand, B hand, undealt
      const allCards: Card[] = [...pA.hand, ...pB.hand, ...match.round.undealtCards];
      expect(allCards).toHaveLength(20);

      const uniqueIds = new Set(allCards.map((c) => c.id));
      expect(uniqueIds.size).toBe(20);

      const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const card of allCards) {
        counts[card.rank]++;
      }
      expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });
      expect(['KING', 'QUEEN', 'ACE']).toContain(match.round.tableRank);
    });
  });

  describe('2. Ordinary Heads-Up Turn Alternation (AC-04)', () => {
    it('alternates turns between two players via applyPlayCardsCommand when both retain cards', () => {
      const rng = new PredictableRandom(10);
      const match = initializeMatch(['A', 'B'], rng);
      const firstActor = match.round.currentPlayerId;
      const secondActor = firstActor === 'A' ? 'B' : 'A';

      // First player plays 1 card (has 5 cards, leaving 4)
      const firstCardId = match.players[firstActor]!.hand[0]!.id;
      const throwingRng = new ThrowingRandom();
      const res1 = applyPlayCardsCommand(match, firstActor, [firstCardId], throwingRng);

      expect(res1.forcedCall).toBeNull();
      expect(res1.createdPlay.playerId).toBe(firstActor);
      expect(res1.createdPlay.cardIds).toEqual([firstCardId]);
      expect(res1.createdPlay.resolved).toBe(false);
      expect(res1.state.round.currentPlayerId).toBe(secondActor);

      // Second player plays 1 card (has 5 cards, leaving 4)
      const secondCardId = res1.state.players[secondActor]!.hand[0]!.id;
      const res2 = applyPlayCardsCommand(res1.state, secondActor, [secondCardId], throwingRng);

      expect(res2.forcedCall).toBeNull();
      expect(res2.createdPlay.playerId).toBe(secondActor);
      expect(res2.createdPlay.cardIds).toEqual([secondCardId]);
      expect(res2.createdPlay.resolved).toBe(false);
      expect(res2.state.round.currentPlayerId).toBe(firstActor);
    });
  });

  describe('3. Empty Hand Is Not A Win Condition (AC-05)', () => {
    it('final-card play does not trigger win condition; outcome derives only from Roulette elimination', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-final-card', rank: 'KING' }],
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

      const rng = new PredictableRandom(50);
      const result = applyPlayCardsCommand(state, 'A', ['a-final-card'], rng);

      // Emptying hand did NOT make A the winner!
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      // B was forced caller, B lost challenge because A played truthful KING
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.shot.playerId).toBe('B');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.winnerId).toBeNull();
    });
  });

  describe('4. Final-Card Forced CALL Identity (AC-06, AC-07)', () => {
    it('automatically forces opponent CALL on final-card PLAY targeting the newly-created Play', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-last', rank: 'KING' }],
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
          playSequence: 42
        },
        winnerId: null
      };

      const rng = new PredictableRandom(7);
      const result = applyPlayCardsCommand(state, 'A', ['a-last'], rng);

      expect(result.createdPlay.playId).toBe(42);
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.challenge.playId).toBe(42);
    });
  });

  describe('5. Four-Branch Matrix (AC-08 through AC-18, AC-20, AC-23, AC-24, AC-25, AC-26, AC-31, AC-32)', () => {
    it('Truth + Blank Matrix Branch (AC-08, AC-10, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20)', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-truth-card', rank: 'KING' }],
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

      const rng = new PredictableRandom(100);
      const result = applyPlayCardsCommand(state, 'A', ['a-truth-card'], rng);

      // Challenge & Shot Assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(true);
      expect(result.forcedCall!.challenge.challengerWasCorrect).toBe(false);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('B');
      expect(result.forcedCall!.challenge.shooterId).toBe('B');

      expect(result.forcedCall!.shot.playerId).toBe('B');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.eliminated).toBe(false);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();

      // New Round Assertions
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.currentPlayerId).toBe('B'); // Surviving loser B starts next round!
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.centralPile).toEqual([]);

      // Hands & Deck conservation
      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(10);

      const allCards = [...pA2.hand, ...pB2.hand, ...result.state.round.undealtCards];
      expect(allCards).toHaveLength(20);
      const uniqueIds = new Set(allCards.map((c) => c.id));
      expect(uniqueIds.size).toBe(20);

      // Revolver persistence
      expect(pB2.revolver.nextShotIndex).toBe(1);
      expect(pB2.revolver.sequence).toEqual(['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL']);
      expect(pA2.revolver.nextShotIndex).toBe(0);
      expect(pA2.revolver.sequence).toEqual(['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL']);

      // Metadata survival across reset
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
    });

    it('Lie + Blank Matrix Branch (AC-09, AC-11, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20)', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-lie-card', rank: 'QUEEN' }], // Lie on KING table
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

      const rng = new PredictableRandom(200);
      const result = applyPlayCardsCommand(state, 'A', ['a-lie-card'], rng);

      // Challenge & Shot Assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.challengerWasCorrect).toBe(true);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('A');
      expect(result.forcedCall!.challenge.shooterId).toBe('A');

      expect(result.forcedCall!.shot.playerId).toBe('A');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.eliminated).toBe(false);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');

      // New Round Assertions
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.currentPlayerId).toBe('A'); // Accused liar A survives and starts next round!
      expect(result.state.round.previousPlay).toBeNull();

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(10);

      expect(pA2.revolver.nextShotIndex).toBe(1);
      expect(pB2.revolver.nextShotIndex).toBe(0);
    });

    it('Truth + Lethal Matrix Branch (AC-08, AC-12, AC-23, AC-24, AC-25, AC-26, AC-31)', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-truth-card', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-1', rank: 'QUEEN' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
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
          playSequence: 5
        },
        winnerId: null
      };

      // ThrowingRandom proves zero next-Round RNG is consumed on MATCH_WON terminal
      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(state, 'A', ['a-truth-card'], throwingRng);

      expect(result.forcedCall!.challenge.playWasTruthful).toBe(true);
      expect(result.forcedCall!.challenge.shooterId).toBe('B');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);
      expect(result.forcedCall!.terminal).toBe('MATCH_WON');
      expect(result.forcedCall!.winnerId).toBe('A');

      expect(result.state.status).toBe('FINISHED');
      expect(result.state.winnerId).toBe('A');
      expect(result.state.round.roundNumber).toBe(1); // No round increment

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pB2.lifeStatus).toBe('ELIMINATED');
      // Eliminated loser receives no fresh hand (no new round deal occurs)
      expect(pB2.hand).toHaveLength(1);
      expect(pB2.hand[0]!.id).toBe('b-card-1');
    });

    it('Lie + Lethal Matrix Branch (AC-09, AC-13, AC-23, AC-24, AC-25, AC-26)', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-lie-card', rank: 'QUEEN' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
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
          playSequence: 5
        },
        winnerId: null
      };

      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(state, 'A', ['a-lie-card'], throwingRng);

      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.shooterId).toBe('A');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);
      expect(result.forcedCall!.terminal).toBe('MATCH_WON');
      expect(result.forcedCall!.winnerId).toBe('B');

      expect(result.state.status).toBe('FINISHED');
      expect(result.state.winnerId).toBe('B');
      expect(result.state.players['A']!.lifeStatus).toBe('ELIMINATED');
      expect(result.state.players['A']!.hand).toEqual([]); // Empty because A played its final card
      expect(result.state.players['B']!.lifeStatus).toBe('ALIVE');
    });
  });

  describe('6. Second-Round Shot Progression & Play Sequence Continuity (AC-21, AC-22)', () => {
    it('advances revolver nextShotIndex across round boundaries and preserves playSequence continuity', () => {
      // Round 1 setup
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-card-r1', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card-r1', rank: 'QUEEN' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;

      const stateR1: MatchState = {
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

      // Round 1 final play: A plays truth, B calls and shoots BLANK at index 0 -> index becomes 1
      const rng1 = new PredictableRandom(1);
      const resR1 = applyPlayCardsCommand(stateR1, 'A', ['a-card-r1'], rng1);

      expect(resR1.state.round.roundNumber).toBe(2);
      expect(resR1.state.players['B']!.revolver.nextShotIndex).toBe(1);

      // Play sequence in new round continues from resR1.state.round.playSequence
      const seqAfterR1 = resR1.state.round.playSequence;

      // In Round 2, B is current player (surviving loser starts). B plays non-final card.
      const bCardR2 = resR1.state.players['B']!.hand[0]!.id;
      const throwingRng = new ThrowingRandom();
      const resR2Play1 = applyPlayCardsCommand(resR1.state, 'B', [bCardR2], throwingRng);

      expect(resR2Play1.createdPlay.playId).toBe(seqAfterR1);
      expect(resR2Play1.state.round.playSequence).toBe(seqAfterR1 + 1);

      // Now B plays remaining 1 card to trigger second shot.
      // Make sure B plays truth matching Round 2 tableRank so A forced caller loses and shoots.
      const r2TableRank = resR2Play1.state.round.tableRank;
      const stateR2Final: MatchState = {
        ...resR2Play1.state,
        players: {
          ...resR2Play1.state.players,
          A: {
            ...resR2Play1.state.players['A']!,
            hand: [{ id: 'a-r2-final', rank: r2TableRank }]
          },
          B: {
            ...resR2Play1.state.players['B']!,
            hand: [{ id: 'b-r2-final', rank: r2TableRank }]
          }
        },
        round: {
          ...resR2Play1.state.round,
          currentPlayerId: 'B'
        }
      };

      // B plays truth matching r2TableRank -> A forced caller loses -> A shoots at index 0 (BLANK)
      const rng2 = new PredictableRandom(2);
      const resR2Final = applyPlayCardsCommand(stateR2Final, 'B', ['b-r2-final'], rng2);

      expect(resR2Final.forcedCall!.shot.playerId).toBe('A');
      expect(resR2Final.forcedCall!.shot.shotIndex).toBe(0);
      expect(resR2Final.forcedCall!.shot.nextShotIndex).toBe(1);

      // B's revolver index from Round 1 remains preserved at 1!
      expect(resR2Final.state.players['B']!.revolver.nextShotIndex).toBe(1);
    });
  });

  describe('7. FINISHED Match Command Guards (AC-27, AC-28)', () => {
    it('FINISHED match state rejects applyPlayCardsCommand and applySystemTimeout', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-card', rank: 'QUEEN' }],
        revolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card', rank: 'QUEEN' }],
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

      // Produce real FINISHED state via lethal branch
      const finishedRes = applyPlayCardsCommand(state, 'A', ['a-card'], new ThrowingRandom());
      expect(finishedRes.state.status).toBe('FINISHED');

      const throwingRng = new ThrowingRandom();
      expect(() => {
        applyPlayCardsCommand(finishedRes.state, 'B', ['b-card'], throwingRng);
      }).toThrow(/Match is already FINISHED/);

      expect(() => {
        applySystemTimeout(finishedRes.state, throwingRng);
      }).toThrow(/Match is already FINISHED/);
    });
  });

  describe('8. 1v1 SYSTEM_TIMEOUT Integration (AC-29, AC-30)', () => {
    it('ordinary 1v1 SYSTEM_TIMEOUT auto-plays 1 card without forced CALL when player has >1 cards', () => {
      const rng = new PredictableRandom(10);
      const match = initializeMatch(['A', 'B'], rng);
      const starter = match.round.currentPlayerId;
      const opponent = starter === 'A' ? 'B' : 'A';

      const timeoutRng = new PredictableRandom(0);
      const result = applySystemTimeout(match, timeoutRng);

      expect(result.timedOutPlayerId).toBe(starter);
      expect(result.autoPlayedCardId).toBeDefined();
      expect(result.forcedCall).toBeNull();
      expect(result.state.round.currentPlayerId).toBe(opponent);
      expect(result.state.players[starter]!.hand).toHaveLength(4);
    });

    it('final-card 1v1 SYSTEM_TIMEOUT integrates automatic forced CALL and round/winner transition', () => {
      const pDict = Object.create(null);
      pDict['A'] = {
        id: 'A',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'a-single-card', rank: 'KING' }],
        revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 }
      } as PlayerState;
      pDict['B'] = {
        id: 'B',
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand: [{ id: 'b-card', rank: 'QUEEN' }],
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

      const timeoutRng = new PredictableRandom(50);
      const result = applySystemTimeout(state, timeoutRng);

      expect(result.timedOutPlayerId).toBe('A');
      expect(result.autoPlayedCardId).toBe('a-single-card');
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.state.round.roundNumber).toBe(2);
    });
  });

  describe('9. Immutability & Determinism (AC-33, AC-34)', () => {
    it('preserves source MatchState immutability across normal PLAY, forced final-card PLAY, and SYSTEM_TIMEOUT', () => {
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B'], rng);
      const starter = match.round.currentPlayerId;

      const frozenStr = JSON.stringify(match);

      applyPlayCardsCommand(match, starter, [match.players[starter]!.hand[0]!.id], new ThrowingRandom());
      expect(JSON.stringify(match)).toBe(frozenStr);

      applySystemTimeout(match, new PredictableRandom(0));
      expect(JSON.stringify(match)).toBe(frozenStr);
    });

    it('verifies deterministic scenario equivalence when executed twice with identical seed', () => {
      const rng1 = new PredictableRandom(42);
      const m1 = initializeMatch(['A', 'B'], rng1);

      const rng2 = new PredictableRandom(42);
      const m2 = initializeMatch(['A', 'B'], rng2);

      expect(m1).toEqual(m2);

      const res1 = applyPlayCardsCommand(m1, m1.round.currentPlayerId, [m1.players[m1.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());
      const res2 = applyPlayCardsCommand(m2, m2.round.currentPlayerId, [m2.players[m2.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());

      expect(res1).toEqual(res2);
    });
  });

  describe('10. Prototype-Safe Player ID Regression (AC-35)', () => {
    it('handles __proto__ safely as a PlayerId in a 2-player match', () => {
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
});
