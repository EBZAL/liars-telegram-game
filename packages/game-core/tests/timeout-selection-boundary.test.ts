import { describe, it, expect, expectTypeOf } from 'vitest';
import { applySystemTimeout } from '../src/system-timeout-transition.js';
import { applyPlayCardsCommand } from '../src/play-command-transition.js';
import { initializeMatch } from '../src/match.js';
import { MatchState, RoundState, PlayerState } from '../src/game-state.js';
import { RandomSource } from '../src/randomness.js';
import { Card } from '../src/cards.js';

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

describe('Selected Unconfirmed Timeout Hardening (T-015)', () => {
  describe('1. API Arity & Type Contract (AC-02, AC-03)', () => {
    it('locks applySystemTimeout type parameters to exactly [MatchState, RandomSource] (AC-02)', () => {
      expectTypeOf<Parameters<typeof applySystemTimeout>>().toEqualTypeOf<[MatchState, RandomSource]>();
    });

    it('locks applySystemTimeout runtime arity to exactly 2 (AC-03)', () => {
      expect(applySystemTimeout.length).toBe(2);
    });
  });

  describe('2. Authoritative State Schema Negative Checks (AC-04, AC-05, AC-06, AC-27, AC-28, AC-29, AC-30)', () => {
    it('proves MatchState, RoundState, and PlayerState expose no local selection/draft fields (AC-04, AC-05, AC-06)', () => {
      expectTypeOf<MatchState>().not.toHaveProperty('selectedCards');
      expectTypeOf<MatchState>().not.toHaveProperty('selectedCardIds');
      expectTypeOf<MatchState>().not.toHaveProperty('selectedButUnconfirmedCards');
      expectTypeOf<MatchState>().not.toHaveProperty('draftSelection');
      expectTypeOf<MatchState>().not.toHaveProperty('highlightedCards');
      expectTypeOf<MatchState>().not.toHaveProperty('pendingSelection');

      expectTypeOf<RoundState>().not.toHaveProperty('selectedCards');
      expectTypeOf<RoundState>().not.toHaveProperty('selectedCardIds');
      expectTypeOf<RoundState>().not.toHaveProperty('draftSelection');

      expectTypeOf<PlayerState>().not.toHaveProperty('selectedCards');
      expectTypeOf<PlayerState>().not.toHaveProperty('selectedCardIds');
      expectTypeOf<PlayerState>().not.toHaveProperty('draftSelection');
    });
  });

  describe('3. Local Selection Variables Are Outside MatchState (AC-08, AC-21)', () => {
    it('proves local-only selection variables remain outside MatchState and local mutation leaves MatchState unchanged (AC-08, AC-21)', () => {
      const rng = new ScriptedRandom([0]);
      const match = initializeMatch(['A', 'B', 'C'], rng);
      const frozenMatch = JSON.stringify(match);

      // Local presentation selection variables (not in Core)
      const localSelectionA: string[] = ['card-1', 'card-2'];
      const localSelectionB: Set<string> = new Set(['card-3']);

      // Mutate local selection variables
      localSelectionA.push('card-4');
      localSelectionA.length = 0;
      localSelectionB.add('card-5');
      localSelectionB.clear();

      // Authoritative MatchState remains completely unaffected
      expect(JSON.stringify(match)).toBe(frozenMatch);
    });
  });

  describe('4. Same State + Same RNG + Different Local Highlights = Same Timeout (AC-09, AC-18, AC-19, AC-20)', () => {
    it('produces deep-equal timeout results for identical MatchStates and RNG regardless of local highlights (AC-09, AC-18, AC-19, AC-20)', () => {
      const matchA = initializeMatch(['A', 'B', 'C'], new ScriptedRandom([0]));
      const matchB = JSON.parse(JSON.stringify(matchA)) as MatchState;

      // Local presentation highlights (invisible to Core)
      const localHighlightA = ['some-card-id'];
      const localHighlightB = ['other-card-id-1', 'other-card-id-2'];

      const timeoutRngA = new ScriptedRandom([2]);
      const timeoutRngB = new ScriptedRandom([2]);

      const resultA = applySystemTimeout(matchA, timeoutRngA);
      const resultB = applySystemTimeout(matchB, timeoutRngB);

      // Deep equal results (AC-09)
      expect(resultA).toEqual(resultB);

      // Card determined by RNG index, not local highlights (AC-18)
      const starter = matchA.round.currentPlayerId;
      const expectedCardId = matchA.players[starter]!.hand[2]!.id;
      expect(resultA.autoPlayedCardId).toBe(expectedCardId);
      expect(resultA.createdPlay.cardIds).toEqual([expectedCardId]);

      // Current Player derived from state.round.currentPlayerId, not local highlight owner (AC-19, AC-20)
      expect(resultA.timedOutPlayerId).toBe(starter);
      expect(resultA.createdPlay.playerId).toBe(starter);

      expect(localHighlightA).toBeDefined();
      expect(localHighlightB).toBeDefined();
    });
  });

  describe('5. Local Selection Disagrees With Timeout Card (AC-10, AC-14)', () => {
    it('does not allow local single-card selection to override RNG-selected Card (AC-10, AC-14)', () => {
      const initRng = new ScriptedRandom([0]);
      const match = initializeMatch(['A', 'B', 'C'], initRng);
      const starter = match.round.currentPlayerId;
      const hand = match.players[starter]!.hand;

      const card0 = hand[0]!;
      const card2 = hand[2]!;
      expect(card0.id).not.toBe(card2.id);

      // Local selection points to card0
      const localSelection = [card0.id];

      // Timeout RNG chooses index 2 (card2)
      const timeoutRng = new ScriptedRandom([2]);
      const result = applySystemTimeout(match, timeoutRng);

      // RNG chooses card2, ignoring local selection card0
      expect(result.autoPlayedCardId).toBe(card2.id);
      expect(result.createdPlay.cardIds).toEqual([card2.id]);
      expect(result.createdPlay.count).toBe(1);

      expect(localSelection).toContain(card0.id);
    });
  });

  describe('6. Multiple Locally Selected Cards Do Not Cause Multi-Play (AC-11, AC-12, AC-13)', () => {
    it('ensures timeout auto-plays exactly 1 card even if local selection has 2 or 3 cards (AC-11, AC-12, AC-13)', () => {
      const initRng = new ScriptedRandom([0]);
      const match = initializeMatch(['A', 'B', 'C'], initRng);
      const starter = match.round.currentPlayerId;
      const hand = match.players[starter]!.hand;

      // Local selection has 3 cards
      const localMultiSelection = [hand[0]!.id, hand[1]!.id, hand[2]!.id];

      const timeoutRng = new ScriptedRandom([1]);
      const result = applySystemTimeout(match, timeoutRng);

      // Timeout count is strictly 1 (AC-12, AC-13)
      expect(result.createdPlay.count).toBe(1);
      expect(result.createdPlay.cardIds).toHaveLength(1);
      expect(result.createdPlay.cardIds).toEqual([hand[1]!.id]);

      expect(localMultiSelection).toHaveLength(3);
    });
  });

  describe('7. Local Truth/Lie/Joker Choice Cannot Bias Timeout (AC-15, AC-16, AC-17, AC-32)', () => {
    it('ensures local pre-confirm preference for Truth, Lie, or Joker cannot bias timeout selection (AC-15, AC-16, AC-17, AC-32)', () => {
      const tableRank = 'KING';
      const pHand: Card[] = [
        { id: 'c-king', rank: 'KING' },   // Truth
        { id: 'c-queen', rank: 'QUEEN' }, // Lie
        { id: 'c-joker', rank: 'JOKER' }  // Joker
      ];
      const bHand: Card[] = [
        { id: 'b-1', rank: 'ACE' }
      ];

      const pDict = Object.create(null);
      pDict['A'] = { id: 'A', lifeStatus: 'ALIVE', roundStatus: 'WITH_CARDS', hand: pHand, revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 } };
      pDict['B'] = { id: 'B', lifeStatus: 'ALIVE', roundStatus: 'WITH_CARDS', hand: bHand, revolver: { sequence: ['BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'LETHAL'], nextShotIndex: 0 } };

      const match: MatchState = {
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

      // Local preferences (Truth, Lie, Joker)
      const localTruthPref = ['c-king'];
      const localLiePref = ['c-queen'];
      const localJokerPref = ['c-joker'];

      // For index 1 (c-queen), timeout always produces c-queen regardless of local preference
      const resTruth = applySystemTimeout(match, new ScriptedRandom([1]));
      const resLie = applySystemTimeout(match, new ScriptedRandom([1]));
      const resJoker = applySystemTimeout(match, new ScriptedRandom([1]));

      expect(resTruth.autoPlayedCardId).toBe('c-queen');
      expect(resLie.autoPlayedCardId).toBe('c-queen');
      expect(resJoker.autoPlayedCardId).toBe('c-queen');
      expect(resTruth).toEqual(resLie);
      expect(resLie).toEqual(resJoker);

      expect(localTruthPref).toBeDefined();
      expect(localLiePref).toBeDefined();
      expect(localJokerPref).toBeDefined();
    });
  });

  describe('8. Confirmed PLAY is the Authority Boundary (AC-24, AC-25, AC-26)', () => {
    it('proves local highlighting has no effect while confirmed PLAY_CARDS is the sole authority boundary (AC-24, AC-25, AC-26)', () => {
      const matchA = initializeMatch(['A', 'B', 'C'], new ScriptedRandom([0]));
      const matchB = JSON.parse(JSON.stringify(matchA)) as MatchState;
      const starter = matchA.round.currentPlayerId;

      const cardX = matchA.players[starter]!.hand[0]!.id; // Local highlight choice
      const cardY = matchA.players[starter]!.hand[3]!.id; // Timeout choice

      // Branch A — Unconfirmed / Timeout:
      // Local selection was cardX, but timeout RNG chooses index 3 (cardY)
      const timeoutRes = applySystemTimeout(matchA, new ScriptedRandom([3]));
      expect(timeoutRes.createdPlay.cardIds).toEqual([cardY]);

      // Branch B — Confirmed PLAY_CARDS:
      // Player explicitly confirms cardX via applyPlayCardsCommand
      const playRes = applyPlayCardsCommand(matchB, starter, [cardX], new ScriptedRandom([0]));
      expect(playRes.createdPlay.cardIds).toEqual([cardX]);

      // Proves confirmed PLAY_CARDS is the explicit card authority boundary
      expect(timeoutRes.createdPlay.cardIds).not.toEqual(playRes.createdPlay.cardIds);
    });
  });

  describe('9. Exactly One Timeout Selection RNG Call on Ordinary Path (AC-23)', () => {
    it('consumes exactly 1 RNG call with max = current Hand size during ordinary timeout (AC-23)', () => {
      const match = initializeMatch(['A', 'B', 'C'], new ScriptedRandom([0]));
      const starter = match.round.currentPlayerId;
      const handSize = match.players[starter]!.hand.length; // 5

      const rng = new ScriptedRandom([2]);
      applySystemTimeout(match, rng);

      expect(rng.calls).toHaveLength(1);
      expect(rng.calls[0]).toEqual({ max: handSize, returned: 2 });
    });
  });

  describe('10. Timeout Input Immutability (AC-22)', () => {
    it('preserves source MatchState immutability during applySystemTimeout (AC-22)', () => {
      const match = initializeMatch(['A', 'B', 'C'], new ScriptedRandom([0]));
      const frozenStr = JSON.stringify(match);

      applySystemTimeout(match, new ScriptedRandom([1]));

      expect(JSON.stringify(match)).toBe(frozenStr);
    });
  });
});
