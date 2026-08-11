import { describe, it, expect } from 'vitest';
import { initializeMatch } from '../src/match.js';
import { applyPlayCardsCommand } from '../src/play-command-transition.js';
import { applyCallLiar } from '../src/call-liar-transition.js';
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

/**
 * Creates a canonical 20-card 3-player state for testing empty-safe skipping:
 * - A hand = 1 card
 * - B hand = 2 cards
 * - C hand = 2 cards
 * - centralPile = 10 cards
 * - undealtCards = 5 cards
 * Total: 1 + 2 + 2 + 10 + 5 = 20 unique cards (6 KING, 6 QUEEN, 6 ACE, 2 JOKER).
 */
function createCanonicalThreePlayerEmptySafeScenarioState(options: {
  tableRank?: TableRank;
  playSequence?: number;
} = {}): {
  state: MatchState;
  aCard: Card;
  bCards: [Card, Card];
  cCards: [Card, Card];
} {
  const tableRank = options.tableRank ?? 'KING';

  const defaultRevolver = (): RevolverState => ({
    sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
    nextShotIndex: 0
  });

  const aCard: Card = { id: 'card-a-1', rank: 'KING' };
  const bCards: [Card, Card] = [
    { id: 'card-b-1', rank: 'QUEEN' },
    { id: 'card-b-2', rank: 'ACE' }
  ];
  const cCards: [Card, Card] = [
    { id: 'card-c-1', rank: 'KING' },
    { id: 'card-c-2', rank: 'QUEEN' }
  ];

  const needed: Record<CardRank, number> = { KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 };
  needed[aCard.rank]--;
  for (const c of bCards) needed[c.rank]--;
  for (const c of cCards) needed[c.rank]--;

  const remainingCards: Card[] = [];
  let idCounter = 1;
  const ranks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];
  for (const r of ranks) {
    for (let i = 0; i < needed[r]; i++) {
      remainingCards.push({ id: `card-rest-${idCounter++}`, rank: r });
    }
  }
  expect(remainingCards).toHaveLength(15);

  const centralPile = remainingCards.slice(0, 10);
  const undealtCards = remainingCards.slice(10, 15);

  const previousPlay: PlayState = {
    playId: options.playSequence ?? 30,
    playerId: 'C',
    cardIds: [centralPile[9]!.id],
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
    revolver: defaultRevolver()
  } as PlayerState;
  pDict['B'] = {
    id: 'B',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: bCards,
    revolver: defaultRevolver()
  } as PlayerState;
  pDict['C'] = {
    id: 'C',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: cCards,
    revolver: defaultRevolver()
  } as PlayerState;

  const playSeq = (options.playSequence ?? 30) + 1;

  const state: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: ['A', 'B', 'C'],
    firstRoundStarter: 'A',
    players: pDict,
    round: {
      roundNumber: 1,
      tableRank,
      currentPlayerId: 'A',
      previousPlay,
      centralPile,
      undealtCards,
      playSequence: playSeq
    },
    winnerId: null
  };

  // Precondition verification for canonical 20-card partition
  const pA = state.players['A']!;
  const pB = state.players['B']!;
  const pC = state.players['C']!;
  const allCards = [...pA.hand, ...pB.hand, ...pC.hand, ...state.round.centralPile, ...state.round.undealtCards];
  expect(allCards).toHaveLength(20);
  expect(new Set(allCards.map(c => c.id)).size).toBe(20);

  const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
  for (const c of allCards) counts[c.rank]++;
  expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

  return { state, aCard, bCards, cCards };
}

interface ThreePlayerT14FixtureOptions {
  tableRank?: TableRank;
  bCardRank?: CardRank;
  cCardRank?: CardRank;
  aRevolver?: RevolverState;
  bRevolver?: RevolverState;
  cRevolver?: RevolverState;
  roundNumber?: number;
  playSequence?: number;
}

/**
 * Creates a fully canonical 20-card 3-player pre-final T14 state:
 * - seatOrder = [A, B, C]
 * - A: ALIVE, EMPTY_SAFE, hand = []
 * - B: ALIVE, WITH_CARDS, hand = [bCard] (1 card, current Player)
 * - C: ALIVE, WITH_CARDS, hand = [cCard] (1 card)
 * - undealtCards = 5 cards
 * - centralPile = 13 cards
 * - previousPlay = unresolved, owned by C, cardIds referencing centralPile
 * Total 20 cards conserved: 0 + 1 + 1 + 13 + 5 = 20 unique cards (6 KING, 6 QUEEN, 6 ACE, 2 JOKER).
 */
function createCanonicalThreePlayerT14State(options: ThreePlayerT14FixtureOptions = {}): {
  state: MatchState;
  bCard: Card;
  cCard: Card;
} {
  const tableRank = options.tableRank ?? 'KING';
  const bCardRank = options.bCardRank ?? 'KING';
  const cCardRank = options.cCardRank ?? 'QUEEN';

  const defaultRevolver = (): RevolverState => ({
    sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
    nextShotIndex: 0
  });

  const aRevolver = options.aRevolver ?? defaultRevolver();
  const bRevolver = options.bRevolver ?? defaultRevolver();
  const cRevolver = options.cRevolver ?? defaultRevolver();

  const bCard: Card = { id: 'card-b-final', rank: bCardRank };
  const cCard: Card = { id: 'card-c-held', rank: cCardRank };

  const needed: Record<CardRank, number> = { KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 };
  needed[bCard.rank]--;
  needed[cCard.rank]--;

  const remainingCards: Card[] = [];
  let idCounter = 1;
  const ranks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];
  for (const r of ranks) {
    for (let i = 0; i < needed[r]; i++) {
      remainingCards.push({ id: `card-rest-${idCounter++}`, rank: r });
    }
  }
  expect(remainingCards).toHaveLength(18);

  const centralPile = remainingCards.slice(0, 13);
  const undealtCards = remainingCards.slice(13, 18);

  const previousPlay: PlayState = {
    playId: options.playSequence ?? 50,
    playerId: 'C',
    cardIds: [centralPile[12]!.id],
    count: 1,
    claimedRank: tableRank,
    resolved: false
  };

  const pDict = Object.create(null);
  pDict['A'] = {
    id: 'A',
    lifeStatus: 'ALIVE',
    roundStatus: 'EMPTY_SAFE',
    hand: [],
    revolver: aRevolver
  } as PlayerState;
  pDict['B'] = {
    id: 'B',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [bCard],
    revolver: bRevolver
  } as PlayerState;
  pDict['C'] = {
    id: 'C',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [cCard],
    revolver: cRevolver
  } as PlayerState;

  const playSeq = (options.playSequence ?? 50) + 1;

  const state: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: ['A', 'B', 'C'],
    firstRoundStarter: 'A',
    players: pDict,
    round: {
      roundNumber: options.roundNumber ?? 1,
      tableRank,
      currentPlayerId: 'B',
      previousPlay,
      centralPile,
      undealtCards,
      playSequence: playSeq
    },
    winnerId: null
  };

  // Precondition checks for full canonical 20-card partition
  const pA = state.players['A']!;
  const pB = state.players['B']!;
  const pC = state.players['C']!;
  const allCards = [...pA.hand, ...pB.hand, ...pC.hand, ...state.round.centralPile, ...state.round.undealtCards];
  expect(allCards).toHaveLength(20);
  expect(new Set(allCards.map(c => c.id)).size).toBe(20);

  const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
  for (const c of allCards) counts[c.rank]++;
  expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

  expect(state.round.centralPile.map(c => c.id)).toContain(state.round.previousPlay!.cardIds[0]);
  expect(state.round.previousPlay!.playerId).toBe('C');
  expect(state.round.previousPlay!.resolved).toBe(false);

  return { state, bCard, cCard };
}

describe('Three-Player Flow Hardening (T-013)', () => {
  describe('1. Real 3-Player Initialization (AC-01, AC-02, AC-03)', () => {
    it('initializes a 3-player match with 5/5/5 hands and 5 undealt cards', () => {
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B', 'C'], rng);

      expect(match.status).toBe('IN_PROGRESS');
      expect(match.winnerId).toBeNull();
      expect(match.seatOrder).toEqual(['A', 'B', 'C']);
      expect(['A', 'B', 'C']).toContain(match.round.currentPlayerId);

      const pA = match.players['A']!;
      const pB = match.players['B']!;
      const pC = match.players['C']!;

      expect(pA.lifeStatus).toBe('ALIVE');
      expect(pA.roundStatus).toBe('WITH_CARDS');
      expect(pA.hand).toHaveLength(5);

      expect(pB.lifeStatus).toBe('ALIVE');
      expect(pB.roundStatus).toBe('WITH_CARDS');
      expect(pB.hand).toHaveLength(5);

      expect(pC.lifeStatus).toBe('ALIVE');
      expect(pC.roundStatus).toBe('WITH_CARDS');
      expect(pC.hand).toHaveLength(5);

      expect(match.round.undealtCards).toHaveLength(5);

      // Total dealt = 15, undealt = 5 -> 20 cards total
      const allCards: Card[] = [...pA.hand, ...pB.hand, ...pC.hand, ...match.round.undealtCards];
      expect(allCards).toHaveLength(20);

      const uniqueIds = new Set(allCards.map(c => c.id));
      expect(uniqueIds.size).toBe(20);

      const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const card of allCards) {
        counts[card.rank]++;
      }
      expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });
      expect(['KING', 'QUEEN', 'ACE']).toContain(match.round.tableRank);
    });
  });

  describe('2. Ordinary Cyclic Three-Player Turn Flow (AC-04)', () => {
    it('executes three consecutive legal non-final one-card PLAY commands following fixed seatOrder P1 -> P2 -> P3 -> P1', () => {
      const rng = new PredictableRandom(15);
      const match = initializeMatch(['A', 'B', 'C'], rng);

      const p1 = match.round.currentPlayerId;
      const seatIdx = match.seatOrder.indexOf(p1);
      const p2 = match.seatOrder[(seatIdx + 1) % 3]!;
      const p3 = match.seatOrder[(seatIdx + 2) % 3]!;

      const throwingRng = new ThrowingRandom();

      // P1 plays 1 card
      const c1 = match.players[p1]!.hand[0]!.id;
      const res1 = applyPlayCardsCommand(match, p1, [c1], throwingRng);
      expect(res1.forcedCall).toBeNull();
      expect(res1.createdPlay.playerId).toBe(p1);
      expect(res1.state.round.currentPlayerId).toBe(p2);

      // P2 plays 1 card
      const c2 = res1.state.players[p2]!.hand[0]!.id;
      const res2 = applyPlayCardsCommand(res1.state, p2, [c2], throwingRng);
      expect(res2.forcedCall).toBeNull();
      expect(res2.createdPlay.playerId).toBe(p2);
      expect(res2.state.round.currentPlayerId).toBe(p3);

      // P3 plays 1 card
      const c3 = res2.state.players[p3]!.hand[0]!.id;
      const res3 = applyPlayCardsCommand(res2.state, p3, [c3], throwingRng);
      expect(res3.forcedCall).toBeNull();
      expect(res3.createdPlay.playerId).toBe(p3);
      expect(res3.state.round.currentPlayerId).toBe(p1); // Wrapped back to P1!

      // All three retain cards (5 - 1 = 4 cards each)
      expect(res3.state.players[p1]!.hand).toHaveLength(4);
      expect(res3.state.players[p2]!.hand).toHaveLength(4);
      expect(res3.state.players[p3]!.hand).toHaveLength(4);
    });
  });

  describe('3. Canonical Empty-Safe Skip & Latest Play Challenge Target (AC-05 through AC-10)', () => {
    it('verifies final play does not force call while B/C hold cards, A becomes EMPTY_SAFE on B play, A is skipped, and C challenges B play', () => {
      const { state, aCard, bCards } = createCanonicalThreePlayerEmptySafeScenarioState();

      const throwingRng = new ThrowingRandom();

      // 1. A plays final card (AC-05, AC-06)
      const resA = applyPlayCardsCommand(state, 'A', [aCard.id], throwingRng);

      expect(resA.createdPlay.playerId).toBe('A');
      expect(resA.state.players['A']!.roundStatus).toBe('EMPTY_PENDING_CHALLENGE');
      expect(resA.state.players['A']!.hand).toHaveLength(0);
      expect(resA.forcedCall).toBeNull(); // No forced CALL because both B and C still hold cards (playersWithCards = 2)
      expect(resA.state.round.currentPlayerId).toBe('B');

      // 2. B plays instead of calling (AC-07, AC-08)
      const resB = applyPlayCardsCommand(resA.state, 'B', [bCards[0].id], throwingRng);

      expect(resB.state.players['A']!.roundStatus).toBe('EMPTY_SAFE');
      expect(resB.state.players['A']!.hand).toHaveLength(0);
      expect(resB.state.players['A']!.lifeStatus).toBe('ALIVE');
      expect(resB.createdPlay.playerId).toBe('B');

      // EMPTY_SAFE A is skipped, current turn advances to C (not A!)
      expect(resB.state.round.currentPlayerId).toBe('C');

      // 3. C challenges B's newest Play (AC-09, AC-10)
      const rng = new PredictableRandom(77);
      const callRes = applyCallLiar(resB.state, 'C', rng);

      expect(callRes.challenge.playId).toBe(resB.createdPlay.playId);
      expect(callRes.challenge.accusedPlayerId).toBe('B');
      expect(callRes.challenge.callerId).toBe('C');
    });
  });

  describe('4. Canonical T14 Pre-Final Fixture & Forced CALL (AC-11, AC-12, AC-13, AC-36, AC-43)', () => {
    it('establishes T14 canonical fixture and verifies B final PLAY automatically forces C CALL targeting B newly-created Play', () => {
      const { state, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING'
      });

      const rng = new PredictableRandom(100);
      const result = applyPlayCardsCommand(state, 'B', [bCard.id], rng);

      expect(result.createdPlay.playerId).toBe('B');
      expect(result.createdPlay.cardIds).toEqual([bCard.id]);
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.players['B']!.hand).toHaveLength(5);

      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('C');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('B');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);

      // Exactly one final PLAY, Challenge and Shot occur (Finding 7 / AC-36)
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);
    });
  });

  describe('5. Four-Branch T14 Matrix (AC-14 through AC-36)', () => {
    it('Truth + Blank T14 Branch (AC-14, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-34, AC-35, AC-36)', () => {
      const { state, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING', // Truth
        cCardRank: 'QUEEN'
      });

      // Capture revolver sequences and indices before Round reset (Finding 2 / AC-23 / AC-24)
      const aSeqBefore = [...state.players['A']!.revolver.sequence];
      const bSeqBefore = [...state.players['B']!.revolver.sequence];
      const cSeqBefore = [...state.players['C']!.revolver.sequence];
      const aIdxBefore = state.players['A']!.revolver.nextShotIndex;
      const bIdxBefore = state.players['B']!.revolver.nextShotIndex;
      const cIdxBefore = state.players['C']!.revolver.nextShotIndex;

      const rng = new PredictableRandom(100);
      const result = applyPlayCardsCommand(state, 'B', [bCard.id], rng);

      // Finding 7 / AC-36: Exactly one shot assertion across matrix
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      // Challenge & Shot assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(true);
      expect(result.forcedCall!.challenge.challengerWasCorrect).toBe(false);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('C');
      expect(result.forcedCall!.challenge.shooterId).toBe('C');

      expect(result.forcedCall!.shot.playerId).toBe('C');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.eliminated).toBe(false);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();
      expect(result.state.status).toBe('IN_PROGRESS');

      // New Round assertions
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.currentPlayerId).toBe('C'); // Surviving round loser C starts next Round!

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;

      // 5/5/5 hands + 5 undealt
      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(pC2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(5);

      // EMPTY_SAFE A returned WITH_CARDS with 5 Cards (AC-22)
      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pA2.roundStatus).toBe('WITH_CARDS');

      expect(pB2.lifeStatus).toBe('ALIVE');
      expect(pB2.roundStatus).toBe('WITH_CARDS');

      expect(pC2.lifeStatus).toBe('ALIVE');
      expect(pC2.roundStatus).toBe('WITH_CARDS');

      // Canonical 20-card unique 6K/6Q/6A/2J partition post-reset (AC-21)
      const allCards = [...pA2.hand, ...pB2.hand, ...pC2.hand, ...result.state.round.undealtCards];
      expect(allCards).toHaveLength(20);
      expect(new Set(allCards.map(c => c.id)).size).toBe(20);

      const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const c of allCards) counts[c.rank]++;
      expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

      // Finding 2 / AC-23 / AC-24: Revolver sequences deep-equal pre-reset, shooter index 0 -> 1, non-shooters unchanged
      expect(pA2.revolver.sequence).toEqual(aSeqBefore);
      expect(pB2.revolver.sequence).toEqual(bSeqBefore);
      expect(pC2.revolver.sequence).toEqual(cSeqBefore);

      expect(pC2.revolver.nextShotIndex).toBe(cIdxBefore + 1); // 0 -> 1
      expect(pA2.revolver.nextShotIndex).toBe(aIdxBefore); // 0
      expect(pB2.revolver.nextShotIndex).toBe(bIdxBefore); // 0

      // Finding 5 / AC-34: Play identity monotonic continuity by executing actual next Round play
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.centralPile).toEqual([]);

      const finalPlayId = result.createdPlay.playId;
      const r2StarterId = result.state.round.currentPlayerId; // 'C'
      const r2CardId = result.state.players[r2StarterId]!.hand[0]!.id;

      const r2PlayRes = applyPlayCardsCommand(result.state, r2StarterId, [r2CardId], new ThrowingRandom());
      expect(r2PlayRes.createdPlay.playId).toBeGreaterThan(finalPlayId);
      expect(r2PlayRes.createdPlay.playId).not.toBe(finalPlayId);

      // Metadata retention (AC-35)
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
    });

    it('Lie + Blank T14 Branch (AC-15, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-36)', () => {
      const { state, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'QUEEN', // Lie on KING table
        cCardRank: 'ACE'
      });

      const rng = new PredictableRandom(200);
      const result = applyPlayCardsCommand(state, 'B', [bCard.id], rng);

      // Finding 7 / AC-36: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      // Challenge & Shot assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.challengerWasCorrect).toBe(true);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('B');
      expect(result.forcedCall!.challenge.shooterId).toBe('B');

      expect(result.forcedCall!.shot.playerId).toBe('B');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.eliminated).toBe(false);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');

      // New Round assertions
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.currentPlayerId).toBe('B'); // Surviving round loser B starts next Round!

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;

      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(pC2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(5);

      expect(pB2.revolver.nextShotIndex).toBe(1);
      expect(pA2.revolver.nextShotIndex).toBe(0);
      expect(pC2.revolver.nextShotIndex).toBe(0);
    });

    it('Truth + Lethal T14 Branch — C Eliminated (AC-16, AC-25, AC-26, AC-27, AC-28, AC-29, AC-33, AC-36)', () => {
      const { state, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING', // Truth
        cCardRank: 'QUEEN',
        cRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      // Capture revolver sequences and indices before Round reset (Finding 3)
      const aSeqBefore = [...state.players['A']!.revolver.sequence];
      const bSeqBefore = [...state.players['B']!.revolver.sequence];
      const cSeqBefore = [...state.players['C']!.revolver.sequence];
      const aIdxBefore = state.players['A']!.revolver.nextShotIndex;
      const bIdxBefore = state.players['B']!.revolver.nextShotIndex;
      const cIdxBefore = state.players['C']!.revolver.nextShotIndex;

      const rng = new PredictableRandom(300);
      const result = applyPlayCardsCommand(state, 'B', [bCard.id], rng);

      // Finding 7 / AC-36: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      // Challenge & Shot assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(true);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('C');
      expect(result.forcedCall!.challenge.shooterId).toBe('C');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);

      // First lethal elimination in 3-player match does NOT finish match! (AC-25)
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.winnerId).toBeNull();

      // 3 -> 2 Round reset (AC-26, AC-27, AC-28)
      expect(result.state.round.roundNumber).toBe(2);

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;

      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pA2.hand).toHaveLength(5);

      expect(pB2.lifeStatus).toBe('ALIVE');
      expect(pB2.hand).toHaveLength(5);

      expect(pC2.lifeStatus).toBe('ELIMINATED');
      expect(pC2.hand).toHaveLength(0); // Eliminated C gets no new hand (AC-28)

      // Finding 4 / AC-27: Complete 20-card canonical partition proof for 3->2 reset (5 + 5 + 10 = 20)
      expect(result.state.round.undealtCards).toHaveLength(10);
      const allLivingAndUndealtCards = [...pA2.hand, ...pB2.hand, ...result.state.round.undealtCards];
      expect(allLivingAndUndealtCards).toHaveLength(20);
      expect(new Set(allLivingAndUndealtCards.map(c => c.id)).size).toBe(20);

      const r2Counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const c of allLivingAndUndealtCards) r2Counts[c.rank]++;
      expect(r2Counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

      // Finding 3: Lethal elimination revolver persistence assertions
      expect(pC2.revolver.sequence).toEqual(cSeqBefore);
      expect(pC2.revolver.nextShotIndex).toBe(cIdxBefore + 1); // 0 -> 1

      expect(pA2.revolver.sequence).toEqual(aSeqBefore);
      expect(pB2.revolver.sequence).toEqual(bSeqBefore);
      expect(pA2.revolver.nextShotIndex).toBe(aIdxBefore);
      expect(pB2.revolver.nextShotIndex).toBe(bIdxBefore);

      // Eliminated C fallback starter resolves to A in [A, B, C] cycle (AC-29)
      expect(result.state.round.currentPlayerId).toBe('A');

      // Finding 1 / AC-33: Complete proof of eliminated-seat skip (A -> B -> A)
      const throwingRng = new ThrowingRandom();

      // First transition: A plays a card, current player becomes B
      const aCardInR2 = pA2.hand[0]!.id;
      const resAfterAPlay = applyPlayCardsCommand(result.state, 'A', [aCardInR2], throwingRng);

      expect(resAfterAPlay.createdPlay.playerId).toBe('A');
      expect(resAfterAPlay.state.round.currentPlayerId).toBe('B');
      expect(resAfterAPlay.state.seatOrder).toEqual(['A', 'B', 'C']);
      expect(resAfterAPlay.state.players['C']!.lifeStatus).toBe('ELIMINATED');

      // Second transition: B plays a card, current player wraps from B -> A skipping eliminated C!
      const bCardInR2 = resAfterAPlay.state.players['B']!.hand[0]!.id;
      const resAfterBPlay = applyPlayCardsCommand(resAfterAPlay.state, 'B', [bCardInR2], throwingRng);

      expect(resAfterBPlay.createdPlay.playerId).toBe('B');
      expect(resAfterBPlay.state.round.currentPlayerId).toBe('A'); // Turn wraps B -> A, skipping eliminated C!
      expect(resAfterBPlay.state.seatOrder).toEqual(['A', 'B', 'C']);
      expect(resAfterBPlay.state.players['C']!.lifeStatus).toBe('ELIMINATED');
    });

    it('Lie + Lethal T14 Branch — B Eliminated (AC-17, AC-25, AC-30, AC-31, AC-32, AC-36)', () => {
      const { state, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'QUEEN', // Lie on KING table
        cCardRank: 'ACE',
        bRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      const rng = new PredictableRandom(400);
      const result = applyPlayCardsCommand(state, 'B', [bCard.id], rng);

      // Finding 7 / AC-36: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('B');
      expect(result.forcedCall!.challenge.shooterId).toBe('B');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);

      // First lethal elimination in 3-player match does NOT finish match!
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.winnerId).toBeNull();

      // 3 -> 2 Round reset for B elimination (AC-30, AC-31, AC-32)
      expect(result.state.round.roundNumber).toBe(2);

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;

      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pA2.hand).toHaveLength(5);

      expect(pC2.lifeStatus).toBe('ALIVE');
      expect(pC2.hand).toHaveLength(5);

      expect(pB2.lifeStatus).toBe('ELIMINATED');
      expect(pB2.hand).toHaveLength(0); // Eliminated B receives no new hand (AC-32)

      expect(result.state.round.undealtCards).toHaveLength(10);

      // Eliminated B fallback starter resolves to C in [A, B, C] cycle (AC-31)
      expect(result.state.round.currentPlayerId).toBe('C');
    });
  });

  describe('6. 3-Player SYSTEM_TIMEOUT Integration (AC-37, AC-38)', () => {
    it('ordinary 3-player SYSTEM_TIMEOUT auto-plays 1 card from 5-card hand without forced CALL', () => {
      const rng = new PredictableRandom(10);
      const match = initializeMatch(['A', 'B', 'C'], rng);
      const starter = match.round.currentPlayerId;
      const seatIdx = match.seatOrder.indexOf(starter);
      const nextSeat = match.seatOrder[(seatIdx + 1) % 3]!;

      const timeoutRng = new PredictableRandom(0);
      const result = applySystemTimeout(match, timeoutRng);

      expect(result.timedOutPlayerId).toBe(starter);
      expect(result.autoPlayedCardId).toBeDefined();
      expect(result.createdPlay.playerId).toBe(starter);
      expect(result.createdPlay.count).toBe(1);
      expect(result.createdPlay.claimedRank).toBe(match.round.tableRank);
      expect(result.forcedCall).toBeNull();

      expect(result.state.round.currentPlayerId).toBe(nextSeat);
      expect(result.state.players[starter]!.hand).toHaveLength(4);
    });

    it('final-card T14 SYSTEM_TIMEOUT triggers automatic forced CALL', () => {
      const { state, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING'
      });

      const timeoutRng = new PredictableRandom(50);
      const result = applySystemTimeout(state, timeoutRng);

      expect(result.timedOutPlayerId).toBe('B');
      expect(result.autoPlayedCardId).toBe(bCard.id);
      expect(result.createdPlay.playerId).toBe('B');

      // Finding 8: Strengthened T14 SYSTEM_TIMEOUT forced CALL assertions
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('C');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('B');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.state.round.roundNumber).toBe(2);
    });
  });

  describe('7. Input Immutability & Determinism (AC-40, AC-41)', () => {
    it('preserves source MatchState immutability across representative 3-player transitions', () => {
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B', 'C'], rng);
      const starter = match.round.currentPlayerId;
      const frozenStr = JSON.stringify(match);

      applyPlayCardsCommand(match, starter, [match.players[starter]!.hand[0]!.id], new ThrowingRandom());
      expect(JSON.stringify(match)).toBe(frozenStr);

      applySystemTimeout(match, new PredictableRandom(0));
      expect(JSON.stringify(match)).toBe(frozenStr);

      // T14 forced transition immutability
      const { state: t14State, bCard } = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING'
      });
      const frozenT14Str = JSON.stringify(t14State);

      applyPlayCardsCommand(t14State, 'B', [bCard.id], new PredictableRandom(100));
      expect(JSON.stringify(t14State)).toBe(frozenT14Str);
    });

    it('Finding 6 / AC-40: preserves source MatchState immutability across empty-safe transition sequence (A final PLAY -> B PLAY)', () => {
      const { state: initialState, aCard, bCards } = createCanonicalThreePlayerEmptySafeScenarioState();
      
      const frozenInitial = JSON.stringify(initialState);
      const throwingRng = new ThrowingRandom();

      const resA = applyPlayCardsCommand(initialState, 'A', [aCard.id], throwingRng);
      expect(JSON.stringify(initialState)).toBe(frozenInitial);

      const frozenResAState = JSON.stringify(resA.state);
      applyPlayCardsCommand(resA.state, 'B', [bCards[0].id], throwingRng);
      expect(JSON.stringify(resA.state)).toBe(frozenResAState);
    });

    it('verifies deterministic scenario equivalence for ordinary 3p flow, forced Blank flow, and 3->2 lethal flow', () => {
      // 1. Ordinary 3p flow determinism
      const rng1 = new PredictableRandom(42);
      const m1 = initializeMatch(['A', 'B', 'C'], rng1);

      const rng2 = new PredictableRandom(42);
      const m2 = initializeMatch(['A', 'B', 'C'], rng2);

      expect(m1).toEqual(m2);

      const res1 = applyPlayCardsCommand(m1, m1.round.currentPlayerId, [m1.players[m1.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());
      const res2 = applyPlayCardsCommand(m2, m2.round.currentPlayerId, [m2.players[m2.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());

      expect(res1).toEqual(res2);

      // 2. Forced Blank flow determinism
      const t14A = createCanonicalThreePlayerT14State({ tableRank: 'KING', bCardRank: 'KING' });
      const t14B = createCanonicalThreePlayerT14State({ tableRank: 'KING', bCardRank: 'KING' });

      const blankRes1 = applyPlayCardsCommand(t14A.state, 'B', [t14A.bCard.id], new PredictableRandom(100));
      const blankRes2 = applyPlayCardsCommand(t14B.state, 'B', [t14B.bCard.id], new PredictableRandom(100));

      expect(blankRes1).toEqual(blankRes2);

      // 3. 3 -> 2 lethal flow determinism
      const lethalA = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING',
        cRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });
      const lethalB = createCanonicalThreePlayerT14State({
        tableRank: 'KING',
        bCardRank: 'KING',
        cRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      const lethRes1 = applyPlayCardsCommand(lethalA.state, 'B', [lethalA.bCard.id], new PredictableRandom(300));
      const lethRes2 = applyPlayCardsCommand(lethalB.state, 'B', [lethalB.bCard.id], new PredictableRandom(300));

      expect(lethRes1).toEqual(lethRes2);
      expect(lethRes1.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(lethRes1.state.players['C']!.lifeStatus).toBe('ELIMINATED');
      expect(lethRes1.state.status).toBe('IN_PROGRESS');
    });
  });

  describe('8. Prototype-Safe Player ID Regression (AC-42)', () => {
    it('handles __proto__ safely as a PlayerId in a real 3-player match initialization and command transition', () => {
      const rng = new PredictableRandom(123);
      const match = initializeMatch(['__proto__', 'B', 'C'], rng);

      expect(Object.getPrototypeOf(match.players)).toBeNull();
      expect(match.players['__proto__']).toBeDefined();
      expect(match.players['B']).toBeDefined();
      expect(match.players['C']).toBeDefined();

      const starter = match.round.currentPlayerId;
      const cardToPlay = match.players[starter]!.hand[0]!.id;

      const res = applyPlayCardsCommand(match, starter, [cardToPlay], new ThrowingRandom());
      expect(Object.getPrototypeOf(res.state.players)).toBeNull();
      expect(res.createdPlay.playerId).toBe(starter);
    });
  });
});
