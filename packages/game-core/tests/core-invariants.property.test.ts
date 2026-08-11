import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  initializeMatch,
  getAllowedTurnActions,
  applyPlayCardsCommand,
  applyCallLiar,
  applySystemTimeout,
  isPlayTruthful,
  deriveClaim,
  MatchState,
  RoundState,
  PlayerState,
  RandomSource,
  Card,
  CardRank,
  TableRank,
  TurnActionType
} from '../src/index.js';

/**
 * Pure, deterministic pseudo-random number generator for seed-driven property sweeps.
 * Uses Mulberry32 algorithm with deterministic 32-bit integer arithmetic.
 */
class SeededRandom implements RandomSource {
  private state: number;
  public calls: { max: number; returned: number }[] = [];

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextInt(max: number): number {
    this.state = (this.state + 0x9e3779b9) | 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    const returned = z % max;
    this.calls.push({ max, returned });
    return returned;
  }
}

/**
 * ScriptedRandom for exact index testing (e.g. system timeout index sweeps).
 */
class ScriptedRandom implements RandomSource {
  private indices: number[];
  public calls: { max: number; returned: number }[] = [];

  constructor(indices: number[]) {
    this.indices = [...indices];
  }

  nextInt(max: number): number {
    const nextVal = this.indices.shift();
    const val = nextVal !== undefined ? nextVal % max : 0;
    this.calls.push({ max, returned: val });
    return val;
  }
}

/**
 * Helper to query legal turn actions using pure Core getAllowedTurnActions.
 */
function getLegalActions(state: MatchState, actorId: string): TurnActionType[] {
  return getAllowedTurnActions(
    state.seatOrder,
    state.players,
    state.round.currentPlayerId,
    actorId,
    state.round.previousPlay !== null
  );
}

/**
 * Reusable test-only authoritative MatchState invariant checker.
 * Validates structural, card conservation, status, turn eligibility, winner,
 * and Revolver invariants after initialization and after every transition step.
 */
function assertCoreStateInvariants(
  state: MatchState,
  baseline?: { seatOrder: string[]; initialRevolvers: Record<string, string[]> }
) {
  // D1 — Fixed Match Identity
  if (baseline) {
    expect(state.seatOrder).toEqual(baseline.seatOrder);
    for (const pId of baseline.seatOrder) {
      expect(state.players[pId]).toBeDefined();
    }
  }

  // D2 — Authoritative Card Conservation (20 Cards total, 20 unique IDs, 6K/6Q/6A/2J)
  const allCards: Card[] = [];
  for (const pId of state.seatOrder) {
    const p = state.players[pId];
    if (p) {
      allCards.push(...p.hand);
    }
  }
  allCards.push(...state.round.centralPile);
  allCards.push(...state.round.undealtCards);

  expect(allCards).toHaveLength(20);

  const uniqueIds = new Set(allCards.map((c) => c.id));
  expect(uniqueIds.size).toBe(20);

  const rankCounts: Record<CardRank, number> = { KING: 0, QUEEN: 0, ACE: 0, JOKER: 0 };
  for (const c of allCards) {
    rankCounts[c.rank]++;
  }
  expect(rankCounts).toEqual({ KING: 6, QUEEN: 6, ACE: 6, JOKER: 2 });

  // D3 — Table / Play Coherence
  expect(['KING', 'QUEEN', 'ACE']).toContain(state.round.tableRank);
  expect(state.round.playSequence).toBeGreaterThanOrEqual(1);
  expect(state.seatOrder).toContain(state.round.currentPlayerId);

  if (state.round.previousPlay !== null) {
    const prev = state.round.previousPlay;
    expect(state.seatOrder).toContain(prev.playerId);
    expect(prev.cardIds.length).toBeGreaterThanOrEqual(1);
    expect(prev.cardIds.length).toBeLessThanOrEqual(3);
    expect(prev.count).toBe(prev.cardIds.length);
    expect(prev.claimedRank).toBe(state.round.tableRank);
    expect(prev.playId).toBeLessThan(state.round.playSequence);

    const centralIds = new Set(state.round.centralPile.map((c) => c.id));
    for (const cardId of prev.cardIds) {
      expect(centralIds.has(cardId)).toBe(true);
    }

    if (state.status === 'IN_PROGRESS') {
      expect(prev.resolved).toBe(false);
    }
  }

  // D4 — Player Status / Hand Coherence
  let livingCount = 0;
  let aliveWinnerCandidate: string | null = null;

  for (const pId of state.seatOrder) {
    const p = state.players[pId]!;
    if (p.lifeStatus === 'ALIVE') {
      livingCount++;
      aliveWinnerCandidate = pId;

      if (p.roundStatus === 'WITH_CARDS') {
        expect(p.hand.length).toBeGreaterThan(0);
      } else if (p.roundStatus === 'EMPTY_PENDING_CHALLENGE' || p.roundStatus === 'EMPTY_SAFE') {
        expect(p.hand.length).toBe(0);
      }
    }
  }

  // D5 & D6 — Status, Turn Eligibility, and Winner Coherence
  if (state.status === 'IN_PROGRESS') {
    expect(state.winnerId).toBeNull();
    expect(livingCount).toBeGreaterThanOrEqual(2);

    const curPlayer = state.players[state.round.currentPlayerId]!;
    expect(curPlayer.lifeStatus).toBe('ALIVE');
    expect(curPlayer.roundStatus).toBe('WITH_CARDS');
    expect(curPlayer.hand.length).toBeGreaterThan(0);
  } else if (state.status === 'FINISHED') {
    expect(livingCount).toBe(1);
    expect(state.winnerId).toBe(aliveWinnerCandidate);
  }

  // D7 — Fresh-Round Distribution Check
  if (state.round.previousPlay === null && state.round.centralPile.length === 0 && state.status === 'IN_PROGRESS') {
    for (const pId of state.seatOrder) {
      const p = state.players[pId]!;
      if (p.lifeStatus === 'ALIVE') {
        expect(p.roundStatus).toBe('WITH_CARDS');
        expect(p.hand.length).toBe(5);
      } else {
        expect(p.hand.length).toBe(0);
      }
    }
    expect(state.round.undealtCards.length).toBe(20 - livingCount * 5);
  }

  // D8 — Revolver Invariants
  for (const pId of state.seatOrder) {
    const p = state.players[pId]!;
    expect(p.revolver.sequence).toHaveLength(6);

    const lethalCount = p.revolver.sequence.filter((s) => s === 'LETHAL').length;
    const blankCount = p.revolver.sequence.filter((s) => s === 'BLANK').length;
    expect(lethalCount).toBe(1);
    expect(blankCount).toBe(5);

    expect(p.revolver.nextShotIndex).toBeGreaterThanOrEqual(0);
    expect(p.revolver.nextShotIndex).toBeLessThanOrEqual(6);

    if (baseline && baseline.initialRevolvers[pId]) {
      expect(p.revolver.sequence).toEqual(baseline.initialRevolvers[pId]);
    }
  }
}

describe('T-016 Core Invariant & Property Hardening Suite', () => {
  describe('PROPERTY GROUP A — Initialization Seed Sweep (AC-05..AC-15)', () => {
    it('verifies structural and card partition invariants across 3 player counts x 32 seeds (96 cases)', () => {
      const playerCounts = [2, 3, 4];
      let totalCases = 0;

      for (const playerCount of playerCounts) {
        const basePlayerIds = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);

        for (let seed = 0; seed < 32; seed++) {
          totalCases++;
          const inputCopy = [...basePlayerIds];
          const rng = new SeededRandom(seed);

          const match = initializeMatch(inputCopy, rng);

          // AC-06: seatOrder is exact unique permutation of input IDs
          expect(match.seatOrder).toHaveLength(playerCount);
          expect(new Set(match.seatOrder).size).toBe(playerCount);
          expect(new Set(match.seatOrder)).toEqual(new Set(basePlayerIds));

          // Input array unmodified
          expect(inputCopy).toEqual(basePlayerIds);

          // AC-07: First starter and current player coherence
          expect(match.seatOrder).toContain(match.firstRoundStarter);
          expect(match.round.currentPlayerId).toBe(match.firstRoundStarter);

          // AC-08 & AC-09: Hand size 5, undealt count 10/5/0
          for (const pId of match.seatOrder) {
            const p = match.players[pId]!;
            expect(p.lifeStatus).toBe('ALIVE');
            expect(p.roundStatus).toBe('WITH_CARDS');
            expect(p.hand).toHaveLength(5);
          }
          expect(match.round.undealtCards).toHaveLength(20 - playerCount * 5);

          // AC-10, AC-11, AC-12, AC-13: 20 cards, 20 unique IDs, 6K/6Q/6A/2J, tableRank K/Q/A
          expect(['KING', 'QUEEN', 'ACE']).toContain(match.round.tableRank);
          expect(match.round.previousPlay).toBeNull();
          expect(match.round.centralPile).toEqual([]);
          expect(match.round.roundNumber).toBe(1);
          expect(match.round.playSequence).toBe(1);
          expect(match.status).toBe('IN_PROGRESS');
          expect(match.winnerId).toBeNull();

          // AC-14, AC-15: Revolver initialization
          for (const pId of match.seatOrder) {
            const p = match.players[pId]!;
            expect(p.revolver.sequence).toHaveLength(6);
            expect(p.revolver.sequence.filter((s) => s === 'LETHAL')).toHaveLength(1);
            expect(p.revolver.sequence.filter((s) => s === 'BLANK')).toHaveLength(5);
            expect(p.revolver.nextShotIndex).toBe(0);
          }

          // Full state invariant checker
          assertCoreStateInvariants(match);
        }
      }
      expect(totalCases).toBe(96);
    });
  });

  describe('PROPERTY GROUP B — Initialization Determinism (AC-16)', () => {
    it('proves same input array + same seed produces deep-equal MatchState across sweeps', () => {
      for (const playerCount of [2, 3, 4]) {
        for (const seed of [0, 7, 15, 31]) {
          const inputA = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
          const inputB = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);

          const matchA = initializeMatch(inputA, new SeededRandom(seed));
          const matchB = initializeMatch(inputB, new SeededRandom(seed));

          expect(matchA).toEqual(matchB);
        }
      }
    });
  });

  describe('PROPERTY GROUP C — Exhaustive Truth / Lie Combinatorics (AC-17..AC-20)', () => {
    it('exhaustively tests isPlayTruthful and deriveClaim across all rank tuples of lengths 1..3 (252 cases)', () => {
      const tableRanks: TableRank[] = ['KING', 'QUEEN', 'ACE'];
      const cardRanks: CardRank[] = ['KING', 'QUEEN', 'ACE', 'JOKER'];

      // Generate all tuples of lengths 1, 2, 3
      const generateTuples = (length: number): CardRank[][] => {
        if (length === 1) return cardRanks.map((r) => [r]);
        const sub = generateTuples(length - 1);
        const result: CardRank[][] = [];
        for (const r of cardRanks) {
          for (const s of sub) {
            result.push([r, ...s]);
          }
        }
        return result;
      };

      const tuplesLength1 = generateTuples(1); // 4
      const tuplesLength2 = generateTuples(2); // 16
      const tuplesLength3 = generateTuples(3); // 64
      const allTuples = [...tuplesLength1, ...tuplesLength2, ...tuplesLength3]; // 84 tuples

      expect(allTuples).toHaveLength(84);

      let totalCases = 0;
      for (const tableRank of tableRanks) {
        for (const tuple of allTuples) {
          totalCases++;
          const cards: Card[] = tuple.map((r, idx) => ({ id: `card-${idx}`, rank: r }));

          // AC-18: isPlayTruthful predicate
          const expectedTruth = tuple.every((r) => r === tableRank || r === 'JOKER');
          expect(isPlayTruthful(cards, tableRank)).toBe(expectedTruth);

          // AC-19, AC-20: deriveClaim properties
          const claim = deriveClaim(tableRank, cards);
          expect(claim.rank).toBe(tableRank);
          expect(claim.count).toBe(cards.length);
        }
      }

      expect(totalCases).toBe(252);
    });
  });

  describe('PROPERTY GROUP D..H — Bounded Legal Command Trace Sweep (AC-21..AC-50)', () => {
    it('executes 48 legal traces (2/3/4 players x seeds 0..15, max 24 commands) enforcing state invariants, deltas, and monotonicity', () => {
      const playerCounts = [2, 3, 4];
      let totalTraces = 0;
      let totalCommandsExecuted = 0;

      for (const playerCount of playerCounts) {
        for (let seed = 0; seed < 16; seed++) {
          totalTraces++;
          const playerIds = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
          const rng = new SeededRandom(seed);
          let state = initializeMatch(playerIds, rng);

          const initialRevolvers: Record<string, string[]> = {};
          for (const pId of state.seatOrder) {
            initialRevolvers[pId] = [...state.players[pId]!.revolver.sequence];
          }
          const baseline = { seatOrder: [...state.seatOrder], initialRevolvers };

          assertCoreStateInvariants(state, baseline);

          let previousPlaySequence = state.round.playSequence;

          for (let step = 0; step < 24; step++) {
            if (state.status === 'FINISHED') break;

            const curPlayerId = state.round.currentPlayerId;
            const allowed = getLegalActions(state, curPlayerId);
            expect(allowed.length).toBeGreaterThan(0);

            // Command input immutability snapshot
            const stateSnapshotStr = JSON.stringify(state);

            let selectedAction: TurnActionType;
            if (allowed.includes('PLAY_CARDS') && allowed.includes('CALL_LIAR')) {
              selectedAction = (seed + step) % 4 === 0 ? 'CALL_LIAR' : 'PLAY_CARDS';
            } else if (allowed.includes('CALL_LIAR')) {
              selectedAction = 'CALL_LIAR';
            } else {
              selectedAction = 'PLAY_CARDS';
            }

            const oldPlaySequence = state.round.playSequence;
            const preRevolverIndices: Record<string, number> = {};
            for (const pId of state.seatOrder) {
              preRevolverIndices[pId] = state.players[pId]!.revolver.nextShotIndex;
            }

            if (selectedAction === 'PLAY_CARDS') {
              totalCommandsExecuted++;
              const hand = state.players[curPlayerId]!.hand;
              expect(hand.length).toBeGreaterThan(0);

              const maxSelectable = Math.min(3, hand.length);
              const selectCount = 1 + (rng.nextInt(maxSelectable) % maxSelectable);
              const selectedCardIds = hand.slice(0, selectCount).map((c) => c.id);

              const preTableRank = state.round.tableRank;
              const result = applyPlayCardsCommand(state, curPlayerId, selectedCardIds, rng);

              // Input state immutability check
              expect(JSON.stringify(state)).toBe(stateSnapshotStr);

              state = result.state;

              // Transition delta checks
              expect(result.createdPlay.count).toBe(selectCount);
              expect(result.createdPlay.claimedRank).toBe(preTableRank);
              expect(result.createdPlay.cardIds).toEqual(selectedCardIds);
              expect(result.createdPlay.playId).toBe(oldPlaySequence);

              if (result.forcedCall) {
                expect(result.forcedCall.challenge.playId).toBe(result.createdPlay.playId);
                expect(result.forcedCall.shot.nextShotIndex).toBe(result.forcedCall.shot.shotIndex + 1);
                expect(['NEXT_ROUND', 'MATCH_WON']).toContain(result.forcedCall.terminal);
              }
            } else {
              totalCommandsExecuted++;
              const result = applyCallLiar(state, curPlayerId, rng);

              // Input state immutability check
              expect(JSON.stringify(state)).toBe(stateSnapshotStr);

              state = result.state;

              // Transition delta checks for CALL_LIAR
              expect(result.challenge.shooterId).toBe(result.challenge.roundLoserId);
              expect(result.shot.playerId).toBe(result.challenge.shooterId);
              expect(result.shot.nextShotIndex).toBe(result.shot.shotIndex + 1);
            }

            // Monotonicity checks
            expect(state.round.playSequence).toBeGreaterThanOrEqual(previousPlaySequence);
            previousPlaySequence = state.round.playSequence;

            // Revolver nextShotIndex monotonicity check across step
            let advancingCount = 0;
            for (const pId of state.seatOrder) {
              const postIndex = state.players[pId]!.revolver.nextShotIndex;
              const preIndex = preRevolverIndices[pId]!;
              expect(postIndex).toBeGreaterThanOrEqual(preIndex);
              expect(postIndex - preIndex).toBeLessThanOrEqual(1);
              if (postIndex > preIndex) advancingCount++;
            }
            expect(advancingCount).toBeLessThanOrEqual(1);

            // Core State Invariants after transition
            assertCoreStateInvariants(state, baseline);
          }
        }
      }

      expect(totalTraces).toBe(48);
      expect(totalCommandsExecuted).toBeGreaterThan(100);
    });
  });

  describe('PROPERTY GROUP I — Timeout Index Sweep (AC-51..AC-56)', () => {
    it('sweeps all hand indices 0..4 across 3 player counts and representative seeds', () => {
      const playerCounts = [2, 3, 4];
      const seeds = [0, 5, 12];
      let totalCases = 0;

      for (const playerCount of playerCounts) {
        for (const seed of seeds) {
          const playerIds = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
          const initRng = new SeededRandom(seed);
          const match = initializeMatch(playerIds, initRng);
          const curPlayerId = match.round.currentPlayerId;
          const hand = match.players[curPlayerId]!.hand;

          for (let cardIndex = 0; cardIndex < hand.length; cardIndex++) {
            totalCases++;
            const timeoutRng = new ScriptedRandom([cardIndex]);
            const preStr = JSON.stringify(match);

            const result = applySystemTimeout(match, timeoutRng);

            // Input immutability check
            expect(JSON.stringify(match)).toBe(preStr);

            // Timeout property assertions
            const expectedCard = hand[cardIndex]!;
            expect(result.timedOutPlayerId).toBe(curPlayerId);
            expect(result.autoPlayedCardId).toBe(expectedCard.id);
            expect(result.createdPlay.cardIds).toEqual([expectedCard.id]);
            expect(result.createdPlay.count).toBe(1);
            expect(result.createdPlay.claimedRank).toBe(match.round.tableRank);

            // Exactly 1 RNG call with max = hand.length
            expect(timeoutRng.calls).toHaveLength(1);
            expect(timeoutRng.calls[0]).toEqual({ max: hand.length, returned: cardIndex });

            // Post-state invariant check
            assertCoreStateInvariants(result.state);
          }
        }
      }

      expect(totalCases).toBe(45);
    });
  });

  describe('PROPERTY GROUP J — Deterministic Trace Replay (AC-57, AC-58)', () => {
    it('replays multi-command traces from independent inputs/RNGs and verifies deep-equal final state and event log', () => {
      for (const playerCount of [2, 3, 4]) {
        for (const seed of [3, 11]) {
          const runTrace = (pCount: number, sVal: number) => {
            const ids = Array.from({ length: pCount }, (_, i) => `P${i + 1}`);
            const rng = new SeededRandom(sVal);
            let state = initializeMatch(ids, rng);
            const eventLog: any[] = [];

            for (let step = 0; step < 15; step++) {
              if (state.status === 'FINISHED') break;

              const curP = state.round.currentPlayerId;
              const allowed = getLegalActions(state, curP);
              expect(allowed.length).toBeGreaterThan(0);

              const action = allowed.includes('PLAY_CARDS') ? 'PLAY_CARDS' : 'CALL_LIAR';

              if (action === 'PLAY_CARDS') {
                const hand = state.players[curP]!.hand;
                const selectCount = 1 + (rng.nextInt(Math.min(3, hand.length)) % Math.min(3, hand.length));
                const cardIds = hand.slice(0, selectCount).map((c) => c.id);
                const res = applyPlayCardsCommand(state, curP, cardIds, rng);
                state = res.state;
                eventLog.push({
                  step,
                  action,
                  curP,
                  cardIds,
                  playId: res.createdPlay.playId,
                  forcedCall: res.forcedCall ? true : false,
                  status: state.status,
                  winnerId: state.winnerId
                });
              } else {
                const res = applyCallLiar(state, curP, rng);
                state = res.state;
                eventLog.push({
                  step,
                  action,
                  curP,
                  loser: res.challenge.roundLoserId,
                  shotOutcome: res.shot.outcome,
                  status: state.status,
                  winnerId: state.winnerId
                });
              }
            }
            return { finalState: state, eventLog };
          };

          const runA = runTrace(playerCount, seed);
          const runB = runTrace(playerCount, seed);

          expect(runA.finalState).toEqual(runB.finalState);
          expect(runA.eventLog).toEqual(runB.eventLog);
        }
      }
    });
  });

  describe('PROPERTY GROUP K — Prototype-Safe Generated Trace (AC-59, AC-60)', () => {
    it('executes a trace with __proto__ and constructor player IDs verifying null prototype is preserved', () => {
      const specialIds = ['__proto__', 'constructor', 'playerC'];
      const rng = new SeededRandom(42);
      let state = initializeMatch(specialIds, rng);

      expect(Object.getPrototypeOf(state.players)).toBeNull();
      assertCoreStateInvariants(state);

      for (let step = 0; step < 10; step++) {
        if (state.status === 'FINISHED') break;

        const curP = state.round.currentPlayerId;
        const allowed = getLegalActions(state, curP);
        expect(allowed.length).toBeGreaterThan(0);

        const action = allowed.includes('PLAY_CARDS') ? 'PLAY_CARDS' : 'CALL_LIAR';

        if (action === 'PLAY_CARDS') {
          const hand = state.players[curP]!.hand;
          const cardIds = [hand[0]!.id];
          const res = applyPlayCardsCommand(state, curP, cardIds, rng);
          state = res.state;
        } else {
          const res = applyCallLiar(state, curP, rng);
          state = res.state;
        }

        expect(Object.getPrototypeOf(state.players)).toBeNull();
        assertCoreStateInvariants(state);
      }
    });
  });
});
