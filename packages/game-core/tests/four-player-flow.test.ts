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
 * Creates a canonical 20-card 4-player state for testing multi-empty-safe skipping:
 * - seatOrder = [A, B, C, D]
 * - A: ALIVE, EMPTY_SAFE, hand = []
 * - B: ALIVE, WITH_CARDS, hand = [bCard1, bCard2] (2 cards, current Player)
 * - C: ALIVE, EMPTY_SAFE, hand = []
 * - D: ALIVE, WITH_CARDS, hand = [dCard1, dCard2] (2 cards)
 * - undealtCards = [] (0 cards)
 * - centralPile = 16 cards
 * Total: 0 + 2 + 0 + 2 + 0 + 16 = 20 unique cards (6 KING, 6 QUEEN, 6 ACE, 2 JOKER).
 */
function createCanonicalFourPlayerMultiEmptySafeState(options: {
  tableRank?: TableRank;
  playSequence?: number;
} = {}): {
  state: MatchState;
  bCards: [Card, Card];
  dCards: [Card, Card];
} {
  const tableRank = options.tableRank ?? 'KING';

  const defaultRevolver = (): RevolverState => ({
    sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
    nextShotIndex: 0
  });

  const bCards: [Card, Card] = [
    { id: 'card-b-1', rank: 'KING' },
    { id: 'card-b-2', rank: 'QUEEN' }
  ];
  const dCards: [Card, Card] = [
    { id: 'card-d-1', rank: 'ACE' },
    { id: 'card-d-2', rank: 'KING' }
  ];

  const needed: Record<CardRank, number> = { KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 };
  for (const c of bCards) needed[c.rank]--;
  for (const c of dCards) needed[c.rank]--;

  const remainingCards: Card[] = [];
  let idCounter = 1;
  const ranks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];
  for (const r of ranks) {
    for (let i = 0; i < needed[r]; i++) {
      remainingCards.push({ id: `card-rest-${idCounter++}`, rank: r });
    }
  }
  expect(remainingCards).toHaveLength(16);

  const centralPile = remainingCards;
  const undealtCards: Card[] = [];

  const previousPlay: PlayState = {
    playId: options.playSequence ?? 30,
    playerId: 'D',
    cardIds: [centralPile[15]!.id],
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
    roundStatus: 'EMPTY_SAFE',
    hand: [],
    revolver: defaultRevolver()
  } as PlayerState;
  pDict['D'] = {
    id: 'D',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: dCards,
    revolver: defaultRevolver()
  } as PlayerState;

  const playSeq = (options.playSequence ?? 30) + 1;

  const state: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: ['A', 'B', 'C', 'D'],
    firstRoundStarter: 'A',
    players: pDict,
    round: {
      roundNumber: 1,
      tableRank,
      currentPlayerId: 'B',
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
  const pD = state.players['D']!;
  const allCards = [...pA.hand, ...pB.hand, ...pC.hand, ...pD.hand, ...state.round.centralPile, ...state.round.undealtCards];
  expect(allCards).toHaveLength(20);
  expect(new Set(allCards.map(c => c.id)).size).toBe(20);

  const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
  for (const c of allCards) counts[c.rank]++;
  expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

  return { state, bCards, dCards };
}

interface FourPlayerSoleHolderFixtureOptions {
  tableRank?: TableRank;
  cCardRank?: CardRank;
  dCardRank?: CardRank;
  aRevolver?: RevolverState;
  bRevolver?: RevolverState;
  cRevolver?: RevolverState;
  dRevolver?: RevolverState;
  roundNumber?: number;
  playSequence?: number;
}

/**
 * Creates a fully canonical 20-card 4-player sole-holder T14 state:
 * - seatOrder = [A, B, C, D]
 * - A: ALIVE, EMPTY_SAFE, hand = []
 * - B: ALIVE, EMPTY_SAFE, hand = []
 * - C: ALIVE, WITH_CARDS, hand = [cCard] (1 final card, current Player)
 * - D: ALIVE, WITH_CARDS, hand = [dCard] (1 card)
 * - undealtCards = [] (0 cards)
 * - centralPile = 18 cards
 * - previousPlay = unresolved, owned by D, cardIds referencing centralPile
 * Total 20 cards conserved: 0 + 0 + 1 + 1 + 18 + 0 = 20 unique cards (6 KING, 6 QUEEN, 6 ACE, 2 JOKER).
 */
function createCanonicalFourPlayerSoleHolderState(options: FourPlayerSoleHolderFixtureOptions = {}): {
  state: MatchState;
  cCard: Card;
  dCard: Card;
} {
  const tableRank = options.tableRank ?? 'KING';
  const cCardRank = options.cCardRank ?? 'KING';
  const dCardRank = options.dCardRank ?? 'QUEEN';

  const defaultRevolver = (): RevolverState => ({
    sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'],
    nextShotIndex: 0
  });

  const aRevolver = options.aRevolver ?? defaultRevolver();
  const bRevolver = options.bRevolver ?? defaultRevolver();
  const cRevolver = options.cRevolver ?? defaultRevolver();
  const dRevolver = options.dRevolver ?? defaultRevolver();

  const cCard: Card = { id: 'card-c-final', rank: cCardRank };
  const dCard: Card = { id: 'card-d-held', rank: dCardRank };

  const needed: Record<CardRank, number> = { KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 };
  needed[cCard.rank]--;
  needed[dCard.rank]--;

  const remainingCards: Card[] = [];
  let idCounter = 1;
  const ranks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];
  for (const r of ranks) {
    for (let i = 0; i < needed[r]; i++) {
      remainingCards.push({ id: `card-rest-${idCounter++}`, rank: r });
    }
  }
  expect(remainingCards).toHaveLength(18);

  const centralPile = remainingCards;
  const undealtCards: Card[] = [];

  const previousPlay: PlayState = {
    playId: options.playSequence ?? 50,
    playerId: 'D',
    cardIds: [centralPile[17]!.id],
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
    roundStatus: 'EMPTY_SAFE',
    hand: [],
    revolver: bRevolver
  } as PlayerState;
  pDict['C'] = {
    id: 'C',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [cCard],
    revolver: cRevolver
  } as PlayerState;
  pDict['D'] = {
    id: 'D',
    lifeStatus: 'ALIVE',
    roundStatus: 'WITH_CARDS',
    hand: [dCard],
    revolver: dRevolver
  } as PlayerState;

  const playSeq = (options.playSequence ?? 50) + 1;

  const state: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: ['A', 'B', 'C', 'D'],
    firstRoundStarter: 'A',
    players: pDict,
    round: {
      roundNumber: options.roundNumber ?? 1,
      tableRank,
      currentPlayerId: 'C',
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
  const pD = state.players['D']!;
  const allCards = [...pA.hand, ...pB.hand, ...pC.hand, ...pD.hand, ...state.round.centralPile, ...state.round.undealtCards];
  expect(allCards).toHaveLength(20);
  expect(new Set(allCards.map(c => c.id)).size).toBe(20);

  const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
  for (const c of allCards) counts[c.rank]++;
  expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

  expect(state.round.centralPile.map(c => c.id)).toContain(state.round.previousPlay!.cardIds[0]);
  expect(state.round.previousPlay!.playerId).toBe('D');
  expect(state.round.previousPlay!.resolved).toBe(false);

  return { state, cCard, dCard };
}

describe('Four-Player Flow Hardening (T-014)', () => {
  describe('1. Real 4-Player Initialization (AC-01, AC-02, AC-03, AC-04)', () => {
    it('initializes a 4-player match with 5/5/5/5 hands and 0 undealt cards', () => {
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B', 'C', 'D'], rng);

      expect(match.status).toBe('IN_PROGRESS');
      expect(match.winnerId).toBeNull();
      expect(match.seatOrder).toEqual(['A', 'B', 'C', 'D']);
      expect(['A', 'B', 'C', 'D']).toContain(match.round.currentPlayerId);

      const pA = match.players['A']!;
      const pB = match.players['B']!;
      const pC = match.players['C']!;
      const pD = match.players['D']!;

      expect(pA.lifeStatus).toBe('ALIVE');
      expect(pA.roundStatus).toBe('WITH_CARDS');
      expect(pA.hand).toHaveLength(5);

      expect(pB.lifeStatus).toBe('ALIVE');
      expect(pB.roundStatus).toBe('WITH_CARDS');
      expect(pB.hand).toHaveLength(5);

      expect(pC.lifeStatus).toBe('ALIVE');
      expect(pC.roundStatus).toBe('WITH_CARDS');
      expect(pC.hand).toHaveLength(5);

      expect(pD.lifeStatus).toBe('ALIVE');
      expect(pD.roundStatus).toBe('WITH_CARDS');
      expect(pD.hand).toHaveLength(5);

      expect(match.round.undealtCards).toHaveLength(0); // Zero undealt cards in 4p init! (AC-03)

      // Total dealt = 20, undealt = 0 -> 20 cards total (AC-04)
      const allCards: Card[] = [...pA.hand, ...pB.hand, ...pC.hand, ...pD.hand, ...match.round.undealtCards];
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

  describe('2. Ordinary Four-Seat Cyclic Flow (AC-05)', () => {
    it('executes four consecutive legal non-final one-card PLAY commands following fixed seatOrder P1 -> P2 -> P3 -> P4 -> P1', () => {
      const rng = new PredictableRandom(20);
      const match = initializeMatch(['A', 'B', 'C', 'D'], rng);

      const p1 = match.round.currentPlayerId;
      const seatIdx = match.seatOrder.indexOf(p1);
      const p2 = match.seatOrder[(seatIdx + 1) % 4]!;
      const p3 = match.seatOrder[(seatIdx + 2) % 4]!;
      const p4 = match.seatOrder[(seatIdx + 3) % 4]!;

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
      expect(res3.state.round.currentPlayerId).toBe(p4);

      // P4 plays 1 card
      const c4 = res3.state.players[p4]!.hand[0]!.id;
      const res4 = applyPlayCardsCommand(res3.state, p4, [c4], throwingRng);
      expect(res4.forcedCall).toBeNull();
      expect(res4.createdPlay.playerId).toBe(p4);
      expect(res4.state.round.currentPlayerId).toBe(p1); // Wrapped back to P1!

      // All four retain cards (5 - 1 = 4 cards each)
      expect(res4.state.players[p1]!.hand).toHaveLength(4);
      expect(res4.state.players[p2]!.hand).toHaveLength(4);
      expect(res4.state.players[p3]!.hand).toHaveLength(4);
      expect(res4.state.players[p4]!.hand).toHaveLength(4);
    });
  });

  describe('3. Canonical Multi-EMPTY_SAFE Fixture & Seat Skipping (AC-06, AC-07, AC-08, AC-09)', () => {
    it('skips multiple EMPTY_SAFE seats (A and C) while maintaining fixed seatOrder and correct newest challenge target', () => {
      const { state, bCards, dCards } = createCanonicalFourPlayerMultiEmptySafeState();

      const throwingRng = new ThrowingRandom();

      // B plays 1 card (leaving B with 1 card)
      const resB = applyPlayCardsCommand(state, 'B', [bCards[0].id], throwingRng);

      expect(resB.createdPlay.playerId).toBe('B');
      expect(resB.state.players['B']!.hand).toHaveLength(1);

      // C is EMPTY_SAFE, so turn skips C and advances to D! (AC-07)
      expect(resB.state.round.currentPlayerId).toBe('D');
      expect(resB.state.seatOrder).toEqual(['A', 'B', 'C', 'D']); // seatOrder unchanged (AC-08)

      // D plays 1 card (leaving D with 1 card)
      const resD = applyPlayCardsCommand(resB.state, 'D', [dCards[0].id], throwingRng);

      expect(resD.createdPlay.playerId).toBe('D');
      expect(resD.state.players['D']!.hand).toHaveLength(1);

      // A is EMPTY_SAFE, C is EMPTY_SAFE, so turn skips both A and C and wraps back to B! (AC-07)
      expect(resD.state.round.currentPlayerId).toBe('B');
      expect(resD.state.seatOrder).toEqual(['A', 'B', 'C', 'D']);

      // Latest Play target across empty seats (AC-09):
      // D challenges B's play state (resB.state where B just played and current player was D)
      const rng = new PredictableRandom(77);
      const callRes = applyCallLiar(resB.state, 'D', rng);

      expect(callRes.challenge.playId).toBe(resB.createdPlay.playId);
      expect(callRes.challenge.accusedPlayerId).toBe('B');
      expect(callRes.challenge.callerId).toBe('D');
    });
  });

  describe('4. Canonical 4-Player Sole-Holder Fixture & Forced CALL (AC-10, AC-11, AC-12, AC-17, AC-47)', () => {
    it('establishes 4-player sole-holder fixture and verifies C final PLAY automatically forces D CALL targeting C newly-created Play', () => {
      const { state, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING'
      });

      const rng = new PredictableRandom(100);
      const result = applyPlayCardsCommand(state, 'C', [cCard.id], rng);

      expect(result.createdPlay.playerId).toBe('C');
      expect(result.createdPlay.cardIds).toEqual([cCard.id]);
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.players['C']!.hand).toHaveLength(5); // In Round 2, C has 5 fresh cards dealt

      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('D');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('C');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);

      // Exactly one final PLAY, Challenge and Shot occur (AC-17)
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);
    });
  });

  describe('5. Four-Branch Four-Player Matrix (AC-13 through AC-39)', () => {
    it('Truth + Blank 4-Player Branch (AC-13, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-38, AC-39)', () => {
      const { state, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING', // Truth
        dCardRank: 'QUEEN'
      });

      // Capture Revolver state before reset (AC-22, AC-23)
      const aSeqBefore = [...state.players['A']!.revolver.sequence];
      const bSeqBefore = [...state.players['B']!.revolver.sequence];
      const cSeqBefore = [...state.players['C']!.revolver.sequence];
      const dSeqBefore = [...state.players['D']!.revolver.sequence];
      const aIdxBefore = state.players['A']!.revolver.nextShotIndex;
      const bIdxBefore = state.players['B']!.revolver.nextShotIndex;
      const cIdxBefore = state.players['C']!.revolver.nextShotIndex;
      const dIdxBefore = state.players['D']!.revolver.nextShotIndex;

      const rng = new PredictableRandom(100);
      const result = applyPlayCardsCommand(state, 'C', [cCard.id], rng);

      // AC-17: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      // Challenge & Shot assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(true);
      expect(result.forcedCall!.challenge.challengerWasCorrect).toBe(false);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('D');
      expect(result.forcedCall!.challenge.shooterId).toBe('D');

      expect(result.forcedCall!.shot.playerId).toBe('D');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.eliminated).toBe(false);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();
      expect(result.state.status).toBe('IN_PROGRESS');

      // New Round assertions (AC-18, AC-21)
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.currentPlayerId).toBe('D'); // Surviving round loser D starts next Round!

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;
      const pD2 = result.state.players['D']!;

      // 5/5/5/5 hands + 0 undealt (AC-18)
      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(pC2.hand).toHaveLength(5);
      expect(pD2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(0);

      // Previous EMPTY_SAFE Players A and B return WITH_CARDS with 5 Cards (AC-20)
      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pA2.roundStatus).toBe('WITH_CARDS');

      expect(pB2.lifeStatus).toBe('ALIVE');
      expect(pB2.roundStatus).toBe('WITH_CARDS');

      expect(pC2.lifeStatus).toBe('ALIVE');
      expect(pC2.roundStatus).toBe('WITH_CARDS');

      expect(pD2.lifeStatus).toBe('ALIVE');
      expect(pD2.roundStatus).toBe('WITH_CARDS');

      // Canonical 20-card unique 6K/6Q/6A/2J partition post-reset (AC-19)
      const allCards = [...pA2.hand, ...pB2.hand, ...pC2.hand, ...pD2.hand, ...result.state.round.undealtCards];
      expect(allCards).toHaveLength(20);
      expect(new Set(allCards.map(c => c.id)).size).toBe(20);

      const counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const c of allCards) counts[c.rank]++;
      expect(counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

      // Revolver persistence (AC-22, AC-23)
      expect(pA2.revolver.sequence).toEqual(aSeqBefore);
      expect(pB2.revolver.sequence).toEqual(bSeqBefore);
      expect(pC2.revolver.sequence).toEqual(cSeqBefore);
      expect(pD2.revolver.sequence).toEqual(dSeqBefore);

      expect(pD2.revolver.nextShotIndex).toBe(dIdxBefore + 1); // 0 -> 1
      expect(pA2.revolver.nextShotIndex).toBe(aIdxBefore); // 0
      expect(pB2.revolver.nextShotIndex).toBe(bIdxBefore); // 0
      expect(pC2.revolver.nextShotIndex).toBe(cIdxBefore); // 0

      // Play identity monotonic continuity by executing actual next Round play (AC-38)
      expect(result.state.round.previousPlay).toBeNull();
      expect(result.state.round.centralPile).toEqual([]);

      const finalPlayId = result.createdPlay.playId;
      const r2StarterId = result.state.round.currentPlayerId; // 'D'
      const r2CardId = result.state.players[r2StarterId]!.hand[0]!.id;

      const r2PlayRes = applyPlayCardsCommand(result.state, r2StarterId, [r2CardId], new ThrowingRandom());
      expect(r2PlayRes.createdPlay.playId).toBeGreaterThan(finalPlayId);
      expect(r2PlayRes.createdPlay.playId).not.toBe(finalPlayId);

      // Metadata retention (AC-39)
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
    });

    it('Lie + Blank 4-Player Branch (AC-14, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23)', () => {
      const { state, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'QUEEN', // Lie on KING table
        dCardRank: 'ACE'
      });

      const rng = new PredictableRandom(200);
      const result = applyPlayCardsCommand(state, 'C', [cCard.id], rng);

      // AC-17: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      // Challenge & Shot assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.challengerWasCorrect).toBe(true);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('C');
      expect(result.forcedCall!.challenge.shooterId).toBe('C');

      expect(result.forcedCall!.shot.playerId).toBe('C');
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.eliminated).toBe(false);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');

      // New Round assertions
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.round.roundNumber).toBe(2);
      expect(result.state.round.currentPlayerId).toBe('C'); // Surviving round loser C starts next Round!

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;
      const pD2 = result.state.players['D']!;

      expect(pA2.hand).toHaveLength(5);
      expect(pB2.hand).toHaveLength(5);
      expect(pC2.hand).toHaveLength(5);
      expect(pD2.hand).toHaveLength(5);
      expect(result.state.round.undealtCards).toHaveLength(0);

      expect(pC2.revolver.nextShotIndex).toBe(1);
      expect(pA2.revolver.nextShotIndex).toBe(0);
      expect(pB2.revolver.nextShotIndex).toBe(0);
      expect(pD2.revolver.nextShotIndex).toBe(0);
    });

    it('Truth + Lethal 4-Player Branch — D Eliminated (AC-15, AC-17, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-34, AC-35, AC-36, AC-37)', () => {
      const { state, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING', // Truth
        dCardRank: 'QUEEN',
        dRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      // Capture Revolver state before reset (AC-36, AC-37)
      const aSeqBefore = [...state.players['A']!.revolver.sequence];
      const bSeqBefore = [...state.players['B']!.revolver.sequence];
      const cSeqBefore = [...state.players['C']!.revolver.sequence];
      const dSeqBefore = [...state.players['D']!.revolver.sequence];
      const aIdxBefore = state.players['A']!.revolver.nextShotIndex;
      const bIdxBefore = state.players['B']!.revolver.nextShotIndex;
      const cIdxBefore = state.players['C']!.revolver.nextShotIndex;
      const dIdxBefore = state.players['D']!.revolver.nextShotIndex;

      const rng = new PredictableRandom(300);
      const result = applyPlayCardsCommand(state, 'C', [cCard.id], rng);

      // AC-17: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      // Challenge & Shot assertions
      expect(result.forcedCall!.challenge.playWasTruthful).toBe(true);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('D');
      expect(result.forcedCall!.challenge.shooterId).toBe('D');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);

      // First lethal elimination from 4 players does NOT finish Match (AC-24, AC-31)
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.winnerId).toBeNull();

      // 4 -> 3 Round reset (AC-25, AC-26, AC-28)
      expect(result.state.round.roundNumber).toBe(2);

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;
      const pD2 = result.state.players['D']!;

      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pA2.hand).toHaveLength(5);

      expect(pB2.lifeStatus).toBe('ALIVE');
      expect(pB2.hand).toHaveLength(5);

      expect(pC2.lifeStatus).toBe('ALIVE');
      expect(pC2.hand).toHaveLength(5);

      expect(pD2.lifeStatus).toBe('ELIMINATED');
      expect(pD2.hand).toHaveLength(0); // Eliminated D gets no new hand (AC-28)

      // 4 -> 3 deck-count partition: 5 + 5 + 5 + 5 = 20 total cards (AC-26, AC-27)
      expect(result.state.round.undealtCards).toHaveLength(5);
      const allLivingAndUndealtCards = [...pA2.hand, ...pB2.hand, ...pC2.hand, ...result.state.round.undealtCards];
      expect(allLivingAndUndealtCards).toHaveLength(20);
      expect(new Set(allLivingAndUndealtCards.map(c => c.id)).size).toBe(20);

      const r2Counts = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
      for (const c of allLivingAndUndealtCards) r2Counts[c.rank]++;
      expect(r2Counts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

      // Revolver persistence on lethal reset (AC-36, AC-37)
      expect(pD2.revolver.sequence).toEqual(dSeqBefore);
      expect(pD2.revolver.nextShotIndex).toBe(dIdxBefore + 1); // 0 -> 1

      expect(pA2.revolver.sequence).toEqual(aSeqBefore);
      expect(pB2.revolver.sequence).toEqual(bSeqBefore);
      expect(pC2.revolver.sequence).toEqual(cSeqBefore);
      expect(pA2.revolver.nextShotIndex).toBe(aIdxBefore);
      expect(pB2.revolver.nextShotIndex).toBe(bIdxBefore);
      expect(pC2.revolver.nextShotIndex).toBe(cIdxBefore);

      // Eliminated D starter fallback wraps to A in [A, B, C, D] cycle (AC-29)
      expect(result.state.round.currentPlayerId).toBe('A');

      // Post-4 -> 3 command flow skips eliminated seat D in fixed four-seat cycle (AC-34, AC-35)
      const throwingRng = new ThrowingRandom();

      // A plays a card -> turn advances to B
      const aCardInR2 = pA2.hand[0]!.id;
      const resAfterAPlay = applyPlayCardsCommand(result.state, 'A', [aCardInR2], throwingRng);
      expect(resAfterAPlay.createdPlay.playerId).toBe('A');
      expect(resAfterAPlay.state.round.currentPlayerId).toBe('B');

      // B plays a card -> turn advances to C
      const bCardInR2 = resAfterAPlay.state.players['B']!.hand[0]!.id;
      const resAfterBPlay = applyPlayCardsCommand(resAfterAPlay.state, 'B', [bCardInR2], throwingRng);
      expect(resAfterBPlay.createdPlay.playerId).toBe('B');
      expect(resAfterBPlay.state.round.currentPlayerId).toBe('C');

      // C plays a card -> turn wraps C -> A, skipping eliminated D!
      const cCardInR2 = resAfterBPlay.state.players['C']!.hand[0]!.id;
      const resAfterCPlay = applyPlayCardsCommand(resAfterBPlay.state, 'C', [cCardInR2], throwingRng);
      expect(resAfterCPlay.createdPlay.playerId).toBe('C');
      expect(resAfterCPlay.state.round.currentPlayerId).toBe('A'); // Wraps C -> A, skipping D!
      expect(resAfterCPlay.state.seatOrder).toEqual(['A', 'B', 'C', 'D']); // seatOrder remains original 4 seats
      expect(resAfterCPlay.state.players['D']!.lifeStatus).toBe('ELIMINATED');
    });

    it('Lie + Lethal 4-Player Branch — C Eliminated (AC-16, AC-17, AC-24, AC-30, AC-31, AC-32, AC-33, AC-35, AC-36, AC-37)', () => {
      const { state, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'QUEEN', // Lie on KING table
        dCardRank: 'ACE',
        cRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      const rng = new PredictableRandom(400);
      const result = applyPlayCardsCommand(state, 'C', [cCard.id], rng);

      // AC-17: Exactly one shot assertion
      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      expect(result.forcedCall!.challenge.playWasTruthful).toBe(false);
      expect(result.forcedCall!.challenge.roundLoserId).toBe('C');
      expect(result.forcedCall!.challenge.shooterId).toBe('C');
      expect(result.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(result.forcedCall!.shot.eliminated).toBe(true);

      // First lethal elimination from 4 players does NOT finish match!
      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.forcedCall!.winnerId).toBeNull();
      expect(result.state.status).toBe('IN_PROGRESS');
      expect(result.state.winnerId).toBeNull();

      // 4 -> 3 Round reset for C elimination (AC-30, AC-31, AC-32)
      expect(result.state.round.roundNumber).toBe(2);

      const pA2 = result.state.players['A']!;
      const pB2 = result.state.players['B']!;
      const pC2 = result.state.players['C']!;
      const pD2 = result.state.players['D']!;

      expect(pA2.lifeStatus).toBe('ALIVE');
      expect(pA2.hand).toHaveLength(5);

      expect(pB2.lifeStatus).toBe('ALIVE');
      expect(pB2.hand).toHaveLength(5);

      expect(pD2.lifeStatus).toBe('ALIVE');
      expect(pD2.hand).toHaveLength(5);

      expect(pC2.lifeStatus).toBe('ELIMINATED');
      expect(pC2.hand).toHaveLength(0); // Eliminated C receives no new hand (AC-32)

      expect(result.state.round.undealtCards).toHaveLength(5);

      // Eliminated C fallback starter resolves to D in [A, B, C, D] cycle (AC-33)
      expect(result.state.round.currentPlayerId).toBe('D');
    });
  });

  describe('6. 4-Player SYSTEM_TIMEOUT Integration (AC-40, AC-41, AC-42)', () => {
    it('ordinary 4-player SYSTEM_TIMEOUT auto-plays 1 card from 5-card hand without forced CALL (AC-40)', () => {
      const rng = new PredictableRandom(10);
      const match = initializeMatch(['A', 'B', 'C', 'D'], rng);
      const starter = match.round.currentPlayerId;
      const seatIdx = match.seatOrder.indexOf(starter);
      const nextSeat = match.seatOrder[(seatIdx + 1) % 4]!;

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

    it('final-card 4-player SYSTEM_TIMEOUT triggers automatic forced CALL (AC-41, AC-42)', () => {
      const { state, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING'
      });

      const timeoutRng = new PredictableRandom(50);
      const result = applySystemTimeout(state, timeoutRng);

      expect(result.timedOutPlayerId).toBe('C');
      expect(result.autoPlayedCardId).toBe(cCard.id);
      expect(result.createdPlay.playerId).toBe('C');

      expect(result.forcedCall).not.toBeNull();
      expect(result.forcedCall!.callerId).toBe('D');
      expect(result.forcedCall!.challenge.accusedPlayerId).toBe('C');
      expect(result.forcedCall!.challenge.playId).toBe(result.createdPlay.playId);
      expect(result.forcedCall!.shot.outcome).toBe('BLANK');
      expect(result.forcedCall!.shot.shotIndex).toBe(0);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(1);
      expect(result.forcedCall!.shot.nextShotIndex).toBe(result.forcedCall!.shot.shotIndex + 1);

      expect(result.forcedCall!.terminal).toBe('NEXT_ROUND');
      expect(result.state.round.roundNumber).toBe(2);
    });
  });

  describe('7. Input Immutability & Determinism (AC-44, AC-45)', () => {
    it('preserves source MatchState immutability across representative 4-player transitions (AC-44)', () => {
      // 1. Ordinary 4-player PLAY immutability
      const rng = new PredictableRandom(42);
      const match = initializeMatch(['A', 'B', 'C', 'D'], rng);
      const starter = match.round.currentPlayerId;
      const frozenStr = JSON.stringify(match);

      applyPlayCardsCommand(match, starter, [match.players[starter]!.hand[0]!.id], new ThrowingRandom());
      expect(JSON.stringify(match)).toBe(frozenStr);

      // 2. SYSTEM_TIMEOUT immutability
      applySystemTimeout(match, new PredictableRandom(0));
      expect(JSON.stringify(match)).toBe(frozenStr);

      // 3. Multi-EMPTY_SAFE skip PLAY sequence immutability
      const { state: multiEmptyState, bCards, dCards } = createCanonicalFourPlayerMultiEmptySafeState();
      const frozenMultiEmpty = JSON.stringify(multiEmptyState);
      const throwingRng = new ThrowingRandom();

      const resB = applyPlayCardsCommand(multiEmptyState, 'B', [bCards[0].id], throwingRng);
      expect(JSON.stringify(multiEmptyState)).toBe(frozenMultiEmpty);

      const frozenResBState = JSON.stringify(resB.state);
      applyPlayCardsCommand(resB.state, 'D', [dCards[0].id], throwingRng);
      expect(JSON.stringify(resB.state)).toBe(frozenResBState);

      // 4. T14 forced final-card PLAY immutability
      const { state: t14State, cCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING'
      });
      const frozenT14Str = JSON.stringify(t14State);

      applyPlayCardsCommand(t14State, 'C', [cCard.id], new PredictableRandom(100));
      expect(JSON.stringify(t14State)).toBe(frozenT14Str);

      // 5. 4 -> 3 lethal transition immutability
      const { state: lethalState, cCard: cLethalCard } = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING',
        dRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });
      const frozenLethalStr = JSON.stringify(lethalState);

      applyPlayCardsCommand(lethalState, 'C', [cLethalCard.id], new PredictableRandom(300));
      expect(JSON.stringify(lethalState)).toBe(frozenLethalStr);
    });

    it('verifies deterministic scenario equivalence for ordinary 4p flow, forced Blank flow, and 4->3 lethal flow (AC-45)', () => {
      // 1. Ordinary 4p flow determinism
      const rng1 = new PredictableRandom(42);
      const m1 = initializeMatch(['A', 'B', 'C', 'D'], rng1);

      const rng2 = new PredictableRandom(42);
      const m2 = initializeMatch(['A', 'B', 'C', 'D'], rng2);

      expect(m1).toEqual(m2);

      const res1 = applyPlayCardsCommand(m1, m1.round.currentPlayerId, [m1.players[m1.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());
      const res2 = applyPlayCardsCommand(m2, m2.round.currentPlayerId, [m2.players[m2.round.currentPlayerId]!.hand[0]!.id], new ThrowingRandom());

      expect(res1).toEqual(res2);

      // 2. Forced Blank flow determinism
      const t14A = createCanonicalFourPlayerSoleHolderState({ tableRank: 'KING', cCardRank: 'KING' });
      const t14B = createCanonicalFourPlayerSoleHolderState({ tableRank: 'KING', cCardRank: 'KING' });

      const blankRes1 = applyPlayCardsCommand(t14A.state, 'C', [t14A.cCard.id], new PredictableRandom(100));
      const blankRes2 = applyPlayCardsCommand(t14B.state, 'C', [t14B.cCard.id], new PredictableRandom(100));

      expect(blankRes1).toEqual(blankRes2);

      // 3. 4 -> 3 lethal flow determinism
      const lethalA = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING',
        dRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });
      const lethalB = createCanonicalFourPlayerSoleHolderState({
        tableRank: 'KING',
        cCardRank: 'KING',
        dRevolver: { sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'], nextShotIndex: 0 }
      });

      const lethRes1 = applyPlayCardsCommand(lethalA.state, 'C', [lethalA.cCard.id], new PredictableRandom(300));
      const lethRes2 = applyPlayCardsCommand(lethalB.state, 'C', [lethalB.cCard.id], new PredictableRandom(300));

      expect(lethRes1).toEqual(lethRes2);
      expect(lethRes1.forcedCall!.shot.outcome).toBe('LETHAL');
      expect(lethRes1.state.players['D']!.lifeStatus).toBe('ELIMINATED');
      expect(lethRes1.state.status).toBe('IN_PROGRESS');
    });
  });

  describe('8. Prototype-Safe Player ID Regression (AC-46)', () => {
    it('handles __proto__ safely as a PlayerId in a real 4-player match initialization and command transition', () => {
      const rng = new PredictableRandom(123);
      const match = initializeMatch(['__proto__', 'B', 'C', 'D'], rng);

      expect(Object.getPrototypeOf(match.players)).toBeNull();
      expect(match.players['__proto__']).toBeDefined();
      expect(match.players['B']).toBeDefined();
      expect(match.players['C']).toBeDefined();
      expect(match.players['D']).toBeDefined();

      const starter = match.round.currentPlayerId;
      const cardToPlay = match.players[starter]!.hand[0]!.id;

      const res = applyPlayCardsCommand(match, starter, [cardToPlay], new ThrowingRandom());
      expect(Object.getPrototypeOf(res.state.players)).toBeNull();
      expect(res.createdPlay.playerId).toBe(starter);
    });
  });
});
