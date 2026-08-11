import { describe, it, expect } from 'vitest';
import { initializeMatch } from '../src/match.js';
import { applyPlayCardsCommand } from '../src/play-command-transition.js';
import { applySystemTimeout } from '../src/system-timeout-transition.js';
import { MatchState, PlayerState, PlayState, RevolverState, TableRank } from '../src/game-state.js';
import { RandomSource } from '../src/randomness.js';
import { Card, CardRank } from '../src/cards.js';

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

interface CanonicalFixtureOptions {
  tableRank?: TableRank;
  currentPlayerId?: 'A' | 'B';
  aCardRank?: CardRank;
  bCardRank?: CardRank;
  aRevolver?: RevolverState;
  bRevolver?: RevolverState;
  roundNumber?: number;
  playSequence?: number;
}

/**
 * Creates a fully canonical 20-card 2-player pre-final state:
 * - A hand = 1 card (aCardRank)
 * - B hand = 1 card (bCardRank)
 * - centralPile = 8 cards already played in prior turns of the round
 * - undealtCards = 10 cards remaining in deck
 * - previousPlay = unresolved, owned by opponent, cardIds referencing centralPile
 * - Total 20 cards conserved: 6 KING, 6 QUEEN, 6 ACE, 2 JOKER. All 20 IDs unique.
 */
function createCanonicalTwoPlayerFinalCardState(options: CanonicalFixtureOptions = {}): {
  state: MatchState;
  aCard: Card;
  bCard: Card;
} {
  const tableRank = options.tableRank ?? 'KING';
  const currentPlayerId = options.currentPlayerId ?? 'A';
  const opponentId = currentPlayerId === 'A' ? 'B' : 'A';
  const aCardRank = options.aCardRank ?? 'KING';
  const bCardRank = options.bCardRank ?? 'QUEEN';

  const aRevolver = options.aRevolver ?? {
    sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
    nextShotIndex: 0
  };
  const bRevolver = options.bRevolver ?? {
    sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
    nextShotIndex: 0
  };

  const aCard: Card = { id: 'card-a-final', rank: aCardRank };
  const bCard: Card = { id: 'card-b-final', rank: bCardRank };

  // Calculate remaining counts out of 6K, 6Q, 6A, 2J
  const needed: Record<CardRank, number> = { KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 };
  needed[aCard.rank]--;
  needed[bCard.rank]--;

  const remainingCards: Card[] = [];
  let idCounter = 1;
  const ranks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];
  for (const r of ranks) {
    for (let i = 0; i < needed[r]; i++) {
      remainingCards.push({ id: `card-rest-${idCounter++}`, rank: r });
    }
  }
  expect(remainingCards).toHaveLength(18);

  const centralPile = remainingCards.slice(0, 8);
  const undealtCards = remainingCards.slice(8, 18);

  const previousPlay: PlayState = {
    playId: options.playSequence ?? 40,
    playerId: opponentId,
    cardIds: [centralPile[7]!.id],
    count: 1,
    claimedRank: tableRank,
    resolved: false
  };

  const pDict = Object.create(null);
  pDict['A'] = {
    id: 'A',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [aCard],
    revolver: aRevolver
  } as PlayerState;
  pDict['B'] = {
    id: 'B',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [bCard],
    revolver: bRevolver
  } as PlayerState;

  const playSeq = (options.playSequence ?? 40) + 1;

  const state: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: ['A', 'B'],
    firstRoundStarter: 'A',
    players: pDict,
    round: {
      roundNumber: options.roundNumber ?? 1,
      tableRank,
      currentPlayerId,
      previousPlay,
      centralPile,
      undealtCards,
      playSequence: playSeq
    },
    winnerId: null
  };

  // Precondition checks for full canonical partition
  const pA = state.players['A']!;
  const pB = state.players['B']!;
  const allCards = [...pA.hand, ...pB.hand, ...state.round.centralPile, ...state.round.undealtCards];
  expect(allCards).toHaveLength(20);
  expect(new Set(allCards.map((c) => c.id)).size).toBe(20);

  const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
  for (const c of allCards) counts[c.rank]++;
  expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

  expect(state.round.centralPile.map((c) => c.id)).toContain(state.round.previousPlay!.cardIds[0]);
  expect(state.round.previousPlay!.playerId).toBe(opponentId);
  expect(state.round.previousPlay!.resolved).toBe(false);

  return { state, aCard, bCard };
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
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING'
      });

      const rng = new PredictableRandom(50);
      const result = applyPlayCardsCommand(state, 'A', [aCard.id], rng);

      // Emptying hand did NOT make A the winner!
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.shot.playerId).toBe('B');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.winnerId).toBeNull();
    });
  });

  describe('4. Final-Card Forced CALL Identity (AC-06, AC-07)', () => {
    it('automatically forces opponent CALL on final-card PLAY targeting the newly-created Play', () => {
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING',
        playSequence: 42
      });

      const rng = new PredictableRandom(7);
      const result = applyPlayCardsCommand(state, 'A', [aCard.id], rng);

      expect(result.createdPlay.playId).toBe(43);
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.challenge.playId).toBe(43);
    });
  });

  describe('5. Canonical Four-Branch Matrix (AC-08 through AC-18, AC-20, AC-23, AC-24, AC-25, AC-26, AC-31, AC-32)', () => {
    it('Truth + Blank Matrix Branch (AC-08, AC-10, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20)', () => {
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING',
        bCardRank: 'QUEEN'
      });

      const rng = new PredictableRandom(100);
      const result = applyPlayCardsCommand(state, 'A', [aCard.id], rng);

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

      // Finding 5: Hands & Full Canonical Deck Conservation Post-Reset
      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(10);

      const allCards = [...pA2.hand, ...pB2.hand, ...result.state.round.undealtCards];
      expect(allCards).toHaveLength(20);
      const uniqueIds = new Set(allCards.map((c) => c.id));
      expect(uniqueIds.size).toBe(20);

      const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const c of allCards) counts[c.rank]++;
      expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

      // Revolver persistence
      expect(pB2.revolver.nextShotIndex).toBe(1);
      expect(pB2.revolver.sequence).toEqual(['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL']);
      expect(pA2.revolver.nextShotIndex).toBe(0);
      expect(pA2.revolver.sequence).toEqual(['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL']);

      // Metadata survival across reset
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
    });

    it('Lie + Blank Matrix Branch (AC-09, AC-11, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20)', () => {
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'QUEEN', // Lie on KING table
        bCardRank: 'ACE'
      });

      const rng = new PredictableRandom(200);
      const result = applyPlayCardsCommand(state, 'A', [aCard.id], rng);

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
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING',
        bCardRank: 'QUEEN',
        bRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      // ThrowingRandom proves zero next-Round RNG is consumed on MATCH_WON terminal
      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(state, 'A', [aCard.id], throwingRng);

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
      // AC-26 Clarification: winner branch performs no round reset or fresh deal; eliminated player receives no new hand.
      expect(pB2.hand).toHaveLength(1);
      expect(pB2.hand[0]!.rank).toBe('QUEEN');
    });

    it('Lie + Lethal Matrix Branch (AC-09, AC-13, AC-23, AC-24, AC-25, AC-26)', () => {
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'QUEEN', // Lie on KING table
        aRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      const throwingRng = new ThrowingRandom();
      const result = applyPlayCardsCommand(state, 'A', [aCard.id], throwingRng);

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

  describe('6. Finding 2 — Cross-Round Same-Player Shot Progression & Play Sequence Continuity (AC-21, AC-22)', () => {
    it('proves same player (B) loses twice across separate rounds through canonical command flow', () => {
      // Round 1 setup: A plays truth on KING table, B forced caller loses and shoots index 0 (BLANK)
      const { state: stateR1, aCard: aCardR1 } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING',
        roundNumber: 1,
        playSequence: 10
      });

      const rng1 = new PredictableRandom(1);
      const resR1 = applyPlayCardsCommand(stateR1, 'A', [aCardR1.id], rng1);

      // Verify B's Round 1 shot
      expect(resR1.forcedCall!.shot.playerId).toBe('B');
      expect(resR1.forcedCall!.shot.shotIndex).toBe(0);
      expect(resR1.forcedCall!.shot.nextShotIndex).toBe(1);

      expect(resR1.state.round.roundNumber).toBe(2);
      expect(resR1.state.players['B']!.revolver.nextShotIndex).toBe(1);

      // Play sequence in new round continues from resR1.state.round.playSequence
      const seqAfterR1 = resR1.state.round.playSequence;

      // In Round 2, B is current player (surviving loser starts).
      // Play 1 card from B's fresh 5-card hand
      const bCardR2 = resR1.state.players['B']!.hand[0]!.id;
      const throwingRng = new ThrowingRandom();
      const resR2Play1 = applyPlayCardsCommand(resR1.state, 'B', [bCardR2], throwingRng);

      expect(resR2Play1.createdPlay.playId).toBe(seqAfterR1);
      expect(resR2Play1.state.round.playSequence).toBe(seqAfterR1 + 1);

      // Now set up Round 2 final card state where B again loses:
      // B plays truth on r2TableRank, A forced caller loses -> wait, we want B to lose!
      // B plays LIE on r2TableRank as B's final card -> A forced caller CALLs -> B loses challenge and shoots at index 1!
      const r2TableRank = resR2Play1.state.round.tableRank;
      const lieRankInR2: CardRank = r2TableRank === 'KING' ? 'QUEEN' : 'KING';

      const stateR2Final = createCanonicalTwoPlayerFinalCardState({
        tableRank: r2TableRank,
        currentPlayerId: 'B',
        bCardRank: lieRankInR2, // B plays LIE in Round 2
        aCardRank: r2TableRank,
        bRevolver: resR2Play1.state.players['B']!.revolver, // nextShotIndex = 1
        aRevolver: resR2Play1.state.players['A']!.revolver,
        roundNumber: 2,
        playSequence: resR2Play1.state.round.playSequence
      });

      const rng2 = new PredictableRandom(2);
      const resR2Final = applyPlayCardsCommand(stateR2Final.state, 'B', [stateR2Final.bCard.id], rng2);

      // Second shot by B!
      expect(resR2Final.forcedCall!.shot.playerId).toBe('B');
      expect(resR2Final.forcedCall!.shot.shotIndex).toBe(1);
      expect(resR2Final.forcedCall!.shot.nextShotIndex).toBe(2);
      expect(resR2Final.forcedCall!.shot.outcome).toBe('BLANK');

      expect(resR2Final.state.players['B']!.revolver.nextShotIndex).toBe(2);
      expect(resR2Final.state.players['B']!.revolver.sequence).toEqual(['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL']);
    });
  });

  describe('7. FINISHED Match Command Guards (AC-27, AC-28)', () => {
    it('FINISHED match state rejects applyPlayCardsCommand and applySystemTimeout', () => {
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'QUEEN', // Lie
        aRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      // Produce real FINISHED state via lethal branch
      const finishedRes = applyPlayCardsCommand(state, 'A', [aCard.id], new ThrowingRandom());
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
      const { state, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING'
      });

      const timeoutRng = new PredictableRandom(50);
      const result = applySystemTimeout(state, timeoutRng);

      expect(result.timedOutPlayerId).toBe('A');
      expect(result.autoPlayedCardId).toBe(aCard.id);
      expect(result.createdPlay.playerId).toBe('A');
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('A');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.state.round.roundNumber).toBe(2);
    });
  });

  describe('9. Finding 3 & 4 — Immutability & Determinism (AC-33, AC-34)', () => {
    it('Finding 3: preserves source MatchState immutability across ordinary PLAY, forced final-card PLAY, and SYSTEM_TIMEOUT', () => {
      // Ordinary PLAY immutability
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B'], rng);
      const starter = match.round.currentPlayerId;
      const frozenMatchStr = JSON.stringify(match);

      applyPlayCardsCommand(match, starter, [match.players[starter]!.hand[0]!.id], new ThrowingRandom());
      expect(JSON.stringify(match)).toBe(frozenMatchStr);

      applySystemTimeout(match, new PredictableRandom(0));
      expect(JSON.stringify(match)).toBe(frozenMatchStr);

      // Forced final-card PLAY immutability
      const { state: canonicalFinalState, aCard } = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING'
      });

      const snapshotBefore = JSON.parse(JSON.stringify(canonicalFinalState));

      applyPlayCardsCommand(canonicalFinalState, 'A', [aCard.id], new PredictableRandom(100));

      expect(JSON.stringify(canonicalFinalState)).toBe(JSON.stringify(snapshotBefore));
      expect(canonicalFinalState.players).toEqual(snapshotBefore.players);
      expect(canonicalFinalState.round.centralPile).toEqual(snapshotBefore.round.centralPile);
      expect(canonicalFinalState.round.undealtCards).toEqual(snapshotBefore.round.undealtCards);
      expect(canonicalFinalState.round.previousPlay).toEqual(snapshotBefore.round.previousPlay);
      expect(canonicalFinalState.status).toBe(snapshotBefore.status);
      expect(canonicalFinalState.winnerId).toBe(snapshotBefore.winnerId);
    });

    it('Finding 4: verifies deterministic scenario equivalence for ordinary flow and forced terminal flow', () => {
      // Ordinary flow determinism
      const rng1 = new PredictableRandom(42);
      const m1 = initializeMatch(['A', 'B'], rng1);

      const rng2 = new PredictableRandom(42);
      const m2 = initializeMatch(['A', 'B'], rng2);

      expect(m1).toEqual(m2);

      const res1 = applyPlayCardsCommand(m1, m1.round.currentPlayerId, [m1.players[m1.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());
      const res2 = applyPlayCardsCommand(m2, m2.round.currentPlayerId, [m2.players[m2.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());

      expect(res1).toEqual(res2);

      // Forced terminal flow determinism (Truth + Lethal branch)
      const state1 = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING',
        bCardRank: 'QUEEN',
        bRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      const state2 = createCanonicalTwoPlayerFinalCardState({
        tableRank: 'KING',
        aCardRank: 'KING',
        bCardRank: 'QUEEN',
        bRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      expect(state1.state).toEqual(state2.state);

      const termRes1 = applyPlayCardsCommand(state1.state, 'A', [state1.aCard.id], new ThrowingRandom());
      const termRes2 = applyPlayCardsCommand(state2.state, 'A', [state2.aCard.id], new ThrowingRandom());

      expect(termRes1).toEqual(termRes2);
      expect(termRes1.forcedCall!.terminal).toBe('MATCH_WON');
      expect(termRes1.state.status).toBe('FINISHED');
    });
  });

  describe('10. Prototype-Safe Player ID Regression (AC-35)', () => {
    it('handles __proto__ safely as a PlayerId in a canonical 2-player forced match state', () => {
      const { state: protoState, aCard } = createCanonicalTwoPlayerFinalCardState({
        currentPlayerId: 'A',
        tableRank: 'KING',
        aCardRank: 'KING'
      });

      // Replace player A ID with __proto__
      const pDict = Object.create(null);
      pDict['__proto__'] = {
        ...protoState.players['A']!,
        id: '__proto__'
      };
      pDict['B'] = protoState.players['B']!;

      const customState: MatchState = {
        ...protoState,
        seatOrder: ['__proto__', 'B'],
        firstRoundStarter: '__proto__',
        players: pDict,
        round: {
          ...protoState.round,
          currentPlayerId: '__proto__'
        }
      };

      const rng = new PredictableRandom(88);
      const result = applyPlayCardsCommand(customState, '__proto__', [aCard.id], rng);

      expect(Object.getPrototypeOf(result.state.players)).toBeNull();
      expect(result.createdPlay.playerId).toBe('__proto__');
      expect(result.forcedCall!.callerId).toBe('B');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('__proto__');
    });
  });
});
