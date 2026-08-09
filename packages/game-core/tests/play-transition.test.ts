import { describe, it, expect, beforeEach } from 'vitest';
import { applyPlayCards } from '../src/play-transition.js';
import { MatchState, PlayerState } from '../src/game-state.js';
import { Card } from '../src/cards.js';
import { initializeMatch } from '../src/match.js';

describe('applyPlayCards State Transition', () => {
  let baseState: MatchState;

  const cardsA: Card[] = [
    { id: 'c1', rank: 'KING' },
    { id: 'c2', rank: 'KING' }
  ];
  const cardsB: Card[] = [
    { id: 'c3', rank: 'QUEEN' },
    { id: 'c4', rank: 'QUEEN' }
  ];
  const cardsC: Card[] = [
    { id: 'c5', rank: 'ACE' }
  ];

  beforeEach(() => {
    const players = Object.create(null);
    players['A'] = {
      id: 'A',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [...cardsA],
      revolver: { sequence: [], nextShotIndex: 0 }
    } as PlayerState;
    players['B'] = {
      id: 'B',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [...cardsB],
      revolver: { sequence: [], nextShotIndex: 0 }
    } as PlayerState;
    players['C'] = {
      id: 'C',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [...cardsC],
      revolver: { sequence: [], nextShotIndex: 0 }
    } as PlayerState;

    baseState = {
      status: 'IN_PROGRESS',
      firstRoundStarter: 'A',
      winnerId: null,
      seatOrder: ['A', 'B', 'C'],
      players,
      round: {
        roundNumber: 1,
        tableRank: 'KING',
        currentPlayerId: 'A',
        previousPlay: null,
        centralPile: [],
        undealtCards: [], // Simplified for this test file
        playSequence: 1
      }
    };
  });

  it('AC-05 / AC-30: Pure transition and input immutability', () => {
    const newState = applyPlayCards(baseState, 'A', ['c1']);

    expect(newState).not.toBe(baseState);
    expect(newState.players).not.toBe(baseState.players);
    expect(newState.players['A']).not.toBe(baseState.players['A']);
    expect(newState.round).not.toBe(baseState.round);
    expect(newState.round.centralPile).not.toBe(baseState.round.centralPile);

    // Ensure baseState is not mutated
    expect(baseState.players['A']?.hand).toHaveLength(2);
    expect(baseState.round.centralPile).toHaveLength(0);
    expect(baseState.round.previousPlay).toBeNull();
  });

  it('AC-06 / AC-07: Out-of-turn PLAY rejected', () => {
    // Current player is A, B tries to play
    expect(() => applyPlayCards(baseState, 'B', ['c3'])).toThrow();
  });

  it('AC-07 / AC-25: PLAY rejected when in mandatory-CALL state (1v1)', () => {
    // Manually set up a 1v1 mandatory call state
    const forcedState: MatchState = {
      ...baseState,
      seatOrder: ['A', 'B'],
      players: {
        ...baseState.players,
        A: {
          ...baseState.players['A']!,
          roundStatus: 'EMPTY_PENDING_CHALLENGE',
          hand: []
        }
      },
      round: {
        ...baseState.round,
        currentPlayerId: 'B',
        previousPlay: {
          playId: 1,
          playerId: 'A',
          cardIds: ['c1', 'c2'],
          count: 2,
          claimedRank: 'KING',
          resolved: false
        }
      }
    };
    
    // B is the only living player with cards. B MUST CALL_LIAR.
    // Trying to PLAY_CARDS should throw.
    expect(() => applyPlayCards(forcedState, 'B', ['c3'])).toThrow(/not allowed to PLAY_CARDS/);
  });

  it('AC-26: PLAY rejected when in mandatory-CALL state (3p)', () => {
    // A is EMPTY_SAFE, B is EMPTY_PENDING, C is WITH_CARDS
    const forcedState: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        A: {
          ...baseState.players['A']!,
          roundStatus: 'EMPTY_SAFE',
          hand: []
        },
        B: {
          ...baseState.players['B']!,
          roundStatus: 'EMPTY_PENDING_CHALLENGE',
          hand: []
        }
      },
      round: {
        ...baseState.round,
        currentPlayerId: 'C',
        previousPlay: {
          playId: 1,
          playerId: 'B',
          cardIds: ['c3', 'c4'],
          count: 2,
          claimedRank: 'KING',
          resolved: false
        }
      }
    };
    
    // C must CALL_LIAR.
    expect(() => applyPlayCards(forcedState, 'C', ['c5'])).toThrow(/not allowed to PLAY_CARDS/);
  });

  it('AC-08: Invalid selection rejected', () => {
    expect(() => applyPlayCards(baseState, 'A', ['unknown'])).toThrow();
    expect(() => applyPlayCards(baseState, 'A', ['c1', 'c1'])).toThrow();
    expect(() => applyPlayCards(baseState, 'A', [])).toThrow();
  });

  it('AC-01 / AC-14: valid first PLAY creates previousPlay and updates round', () => {
    const newState = applyPlayCards(baseState, 'A', ['c1', 'c2']);

    expect(newState.round.previousPlay).not.toBeNull();
    expect(newState.round.previousPlay!.playerId).toBe('A');
    expect(newState.round.previousPlay!.cardIds).toEqual(['c1', 'c2']);
    
    // AC-09: Claim rank derived
    expect(newState.round.previousPlay!.claimedRank).toBe('KING');
    // AC-10: Claim count derived
    expect(newState.round.previousPlay!.count).toBe(2);
    expect(newState.round.previousPlay!.resolved).toBe(false);

    // AC-12: Hand removal
    expect(newState.players['A']!.hand).toHaveLength(0);

    // AC-13: Central pile append
    expect(newState.round.centralPile).toHaveLength(2);
    expect(newState.round.centralPile).toEqual(cardsA);

    // AC-22: Cyclic next Player
    expect(newState.round.currentPlayerId).toBe('B');

    // AC-18: Final card status
    expect(newState.players['A']!.roundStatus).toBe('EMPTY_PENDING_CHALLENGE');
  });

  it('AC-17: Non-final hand status', () => {
    const newState = applyPlayCards(baseState, 'A', ['c1']);
    expect(newState.players['A']!.hand).toHaveLength(1);
    expect(newState.players['A']!.roundStatus).toBe('WITH_CARDS');
  });

  it('AC-15 / AC-20 / T12: Sequential plays, target survives, previous empty-pending becomes empty-safe', () => {
    // A plays final cards
    const state2 = applyPlayCards(baseState, 'A', ['c1', 'c2']);
    expect(state2.players['A']!.roundStatus).toBe('EMPTY_PENDING_CHALLENGE');
    expect(state2.round.currentPlayerId).toBe('B');

    // B plays non-final cards
    const state3 = applyPlayCards(state2, 'B', ['c3']);
    
    // PreviousPlay is replaced by B
    expect(state3.round.previousPlay!.playerId).toBe('B');
    
    // Central pile retains both
    expect(state3.round.centralPile).toHaveLength(3);
    
    // A is now EMPTY_SAFE
    expect(state3.players['A']!.roundStatus).toBe('EMPTY_SAFE');

    // C is next
    expect(state3.round.currentPlayerId).toBe('C');
  });

  it('AC-23 / AC-24: skip chain & target survives skipped seats', () => {
    // A plays 1 card (WITH_CARDS) -> D
    // B is EMPTY_SAFE
    // C is ELIMINATED
    // next should be D
    const customState: MatchState = {
      ...baseState,
      seatOrder: ['A', 'B', 'C', 'D'],
      players: {
        ...baseState.players,
        B: { ...baseState.players['B']!, roundStatus: 'EMPTY_SAFE', hand: [] },
        C: { ...baseState.players['C']!, lifeStatus: 'ELIMINATED' },
        D: {
          id: 'D',
          lifeStatus: 'ALIVE',
          roundStatus: 'WITH_CARDS',
          hand: [{ id: 'c6', rank: 'KING' }],
          revolver: { sequence: [], nextShotIndex: 0 }
        }
      }
    };

    const newState = applyPlayCards(customState, 'A', ['c1']);

    expect(newState.round.currentPlayerId).toBe('D');
    // B and C are skipped. Target survives.
    expect(newState.round.previousPlay!.playerId).toBe('A');
  });

  it('AC-03: Deterministic distinct playIds', () => {
    const state2 = applyPlayCards(baseState, 'A', ['c1']);
    const state3 = applyPlayCards(state2, 'B', ['c3']);
    
    expect(state2.round.previousPlay!.playId).toBe(1);
    expect(state3.round.previousPlay!.playId).toBe(2);
  });

  it('AC-16: Normal PLAY contains no precomputed truth/lie field', () => {
    const newState = applyPlayCards(baseState, 'A', ['c1']);
    const play = newState.round.previousPlay!;
    
    expect(play).not.toHaveProperty('isTruthful');
    expect(play).not.toHaveProperty('isLie');
    expect(play).not.toHaveProperty('revealedCards');
  });

  it('AC-28: Revolver unchanged', () => {
    const newState = applyPlayCards(baseState, 'A', ['c1']);
    expect(newState.players['A']!.revolver).toBe(baseState.players['A']!.revolver);
  });

  it('AC-29: Life status unchanged', () => {
    const newState = applyPlayCards(baseState, 'A', ['c1', 'c2']);
    expect(newState.players['A']!.lifeStatus).toBe('ALIVE');
  });

  it('AC-31: __proto__ compatibility', () => {
    const pDict = Object.create(null);
    pDict['__proto__'] = {
      id: '__proto__',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [...cardsA],
      revolver: { sequence: [], nextShotIndex: 0 }
    };
    pDict['B'] = baseState.players['B'];
    pDict['C'] = baseState.players['C'];

    const protoState: MatchState = {
      ...baseState,
      seatOrder: ['__proto__', 'B', 'C'],
      players: pDict,
      round: {
        ...baseState.round,
        currentPlayerId: '__proto__'
      }
    };

    const newState = applyPlayCards(protoState, '__proto__', ['c1']);
    expect(newState.round.previousPlay!.playerId).toBe('__proto__');
    expect(newState.round.currentPlayerId).toBe('B');
    expect(Object.getPrototypeOf(newState.players)).toBeNull();
  });

  it('AC-27: 20-card conservation logic (summing array lengths)', () => {
    // Since we don't have all 20 cards in the setup, we just test that
    // original cards count == new cards count
    const totalOriginal = 
      baseState.players['A']!.hand.length + 
      baseState.players['B']!.hand.length + 
      baseState.players['C']!.hand.length + 
      baseState.round.centralPile.length + 
      baseState.round.undealtCards.length;

    const state2 = applyPlayCards(baseState, 'A', ['c1', 'c2']);
    const state3 = applyPlayCards(state2, 'B', ['c3']);

    const totalNew =
      state3.players['A']!.hand.length + 
      state3.players['B']!.hand.length + 
      state3.players['C']!.hand.length + 
      state3.round.centralPile.length + 
      state3.round.undealtCards.length;

    expect(totalNew).toBe(totalOriginal);
    
    // Explicit central pile vs hands verification
    expect(state3.round.centralPile).toHaveLength(3);
    expect(state3.players['A']!.hand).toHaveLength(0);
    expect(state3.players['B']!.hand).toHaveLength(1);
    expect(state3.players['C']!.hand).toHaveLength(1);
  });

  it('Aliasing regression test: returned state does not alias requested array', () => {
    const request = ['c1'];
    const nextState = applyPlayCards(baseState, 'A', request);
    
    expect(nextState.round.previousPlay!.cardIds).not.toBe(request);
    
    // Mutate request after return
    request.push('c2');
    
    // Confirm no mutation of authoritative state
    expect(nextState.round.previousPlay!.cardIds).toEqual(['c1']);
    expect(nextState.players['A']!.hand).toHaveLength(1); // 'c2' still in hand
    expect(nextState.round.centralPile).toHaveLength(1);
    expect(nextState.round.centralPile[0]!.id).toBe('c1');
  });

  it('AC-27: Real 20-card conservation test', () => {
    const mockRandom = {
      nextInt: (max: number) => 0, // Always 0
    };

    const state = initializeMatch(['A', 'B', 'C'], mockRandom);
    
    const actorId = state.round.currentPlayerId;
    const actor = state.players[actorId]!;
    expect(actor).toBeDefined();
    
    // Select one card from actor
    const playedCardId = actor.hand[0]!.id;
    
    const nextState = applyPlayCards(state, actorId, [playedCardId]);

    // Gather all cards
    const allCards: Card[] = [
      ...nextState.players['A']!.hand,
      ...nextState.players['B']!.hand,
      ...nextState.players['C']!.hand,
      ...nextState.round.centralPile,
      ...nextState.round.undealtCards
    ];

    expect(allCards).toHaveLength(20);

    const uniqueIds = new Set(allCards.map(c => c.id));
    expect(uniqueIds.size).toBe(20);

    let kings = 0, queens = 0, aces = 0, jokers = 0;
    for (const c of allCards) {
      if (c.rank === 'KING') kings++;
      if (c.rank === 'QUEEN') queens++;
      if (c.rank === 'ACE') aces++;
      if (c.rank === 'JOKER') jokers++;
    }

    expect(kings).toBe(6);
    expect(queens).toBe(6);
    expect(aces).toBe(6);
    expect(jokers).toBe(2);

    expect(nextState.players[actorId]!.hand.find(c => c.id === playedCardId)).toBeUndefined();
    expect(nextState.round.centralPile.filter(c => c.id === playedCardId)).toHaveLength(1);
  });
});
