import { describe, it, expect, beforeEach } from 'vitest';
import { resolveLiarChallenge } from '../src/challenge-rules.js';
import { MatchState, PlayerState, PlayState } from '../src/game-state.js';
import { Card } from '../src/cards.js';

describe('resolveLiarChallenge', () => {
  let baseState: MatchState;

  const validPlayCards: Card[] = [
    { id: 'c1', rank: 'KING' },
    { id: 'c2', rank: 'KING' }
  ];

  const validPlayState: PlayState = {
    playId: 1,
    playerId: 'A',
    cardIds: ['c1', 'c2'],
    count: 2,
    claimedRank: 'KING',
    resolved: false
  };

  beforeEach(() => {
    const players = Object.create(null);
    players['A'] = {
      id: 'A',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [],
      revolver: { sequence: [], nextShotIndex: 0 }
    } as PlayerState;
    players['B'] = {
      id: 'B',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [{ id: 'c3', rank: 'QUEEN' }],
      revolver: { sequence: [], nextShotIndex: 0 }
    } as PlayerState;
    players['C'] = {
      id: 'C',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [{ id: 'c4', rank: 'ACE' }],
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
        currentPlayerId: 'B',
        previousPlay: validPlayState,
        centralPile: [...validPlayCards],
        undealtCards: [],
        playSequence: 2
      }
    };
  });

  it('previousPlay null -> reject (AC-04)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, previousPlay: null }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/Cannot challenge when previousPlay is null./);
  });

  it('out-of-turn caller -> reject (AC-05)', () => {
    expect(() => resolveLiarChallenge(baseState, 'C')).toThrow(/not the current player/);
  });

  it('ineligible caller -> reject (AC-06)', () => {
    // B has no cards (zero-hand). B is currentPlayer.
    const state: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        B: { ...baseState.players['B']!, hand: [] }
      }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/not allowed to CALL_LIAR/);
  });

  it('ordinary legal CALL -> resolution (AC-07)', () => {
    const result = resolveLiarChallenge(baseState, 'B');
    expect(result.callerId).toBe('B');
    expect(result.accusedPlayerId).toBe('A');
  });

  it('forced 1v1 CALL -> accepted (AC-08)', () => {
    const state: MatchState = {
      ...baseState,
      seatOrder: ['A', 'B'],
      players: {
        ...baseState.players,
        A: { ...baseState.players['A']!, roundStatus: 'EMPTY_PENDING_CHALLENGE' }
      }
    };
    // Caller is B.
    const result = resolveLiarChallenge(state, 'B');
    expect(result.callerId).toBe('B');
    expect(result.accusedPlayerId).toBe('A');
  });

  it('forced 3p CALL -> accepted (AC-08)', () => {
    // A is EMPTY_SAFE, B is EMPTY_PENDING_CHALLENGE, C has cards and must call liar on B.
    const state: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        A: { ...baseState.players['A']!, roundStatus: 'EMPTY_SAFE' },
        B: { ...baseState.players['B']!, roundStatus: 'EMPTY_PENDING_CHALLENGE', hand: [] }
      },
      round: {
        ...baseState.round,
        currentPlayerId: 'C',
        previousPlay: { ...validPlayState, playerId: 'B', cardIds: ['c3'], count: 1 },
        centralPile: [{ id: 'c3', rank: 'KING' }]
      }
    };
    
    const result = resolveLiarChallenge(state, 'C');
    expect(result.callerId).toBe('C');
    expect(result.accusedPlayerId).toBe('B');
  });

  it('T09: Only previousPlay targeted, never older pile cards (AC-09, AC-21)', () => {
    const state: MatchState = {
      ...baseState,
      round: {
        ...baseState.round,
        // central pile has c0 (older), c1, c2 (current)
        centralPile: [{ id: 'c0', rank: 'ACE' }, ...validPlayCards]
      }
    };
    const result = resolveLiarChallenge(state, 'B');
    expect(result.revealedCards).toHaveLength(2);
    expect(result.revealedCards.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('T10: Skipped seat target (AC-10)', () => {
    // A plays, B is EMPTY_SAFE, C is currentPlayer
    const state: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        B: { ...baseState.players['B']!, roundStatus: 'EMPTY_SAFE', hand: [] }
      },
      round: {
        ...baseState.round,
        currentPlayerId: 'C'
      }
    };
    
    const result = resolveLiarChallenge(state, 'C');
    expect(result.callerId).toBe('C');
    expect(result.accusedPlayerId).toBe('A');
  });

  it('T11: Final Play challengeable (AC-11)', () => {
    const state: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        A: { ...baseState.players['A']!, roundStatus: 'EMPTY_PENDING_CHALLENGE' }
      }
    };
    
    const result = resolveLiarChallenge(state, 'B');
    expect(result.callerId).toBe('B');
    expect(result.accusedPlayerId).toBe('A');
  });

  it('T15: Incorrect play (Lie) -> accused loses/shoots (AC-26)', () => {
    const state: MatchState = {
      ...baseState,
      round: {
        ...baseState.round,
        centralPile: [{ id: 'c1', rank: 'QUEEN' }, { id: 'c2', rank: 'KING' }] // c1 is Lie
      }
    };
    const result = resolveLiarChallenge(state, 'B');
    expect(result.playWasTruthful).toBe(false);
    expect(result.challengerWasCorrect).toBe(true);
    expect(result.roundLoserId).toBe('A');
    expect(result.shooterId).toBe('A');
  });

  it('T16: Truthful play -> caller loses/shoots (AC-27)', () => {
    const state = { ...baseState }; // c1 and c2 are KING
    const result = resolveLiarChallenge(state, 'B');
    expect(result.playWasTruthful).toBe(true);
    expect(result.challengerWasCorrect).toBe(false);
    expect(result.roundLoserId).toBe('B');
    expect(result.shooterId).toBe('B');
  });

  it('mixed: Table + Joker + invalid -> accused loses (AC-25)', () => {
    const state: MatchState = {
      ...baseState,
      round: {
        ...baseState.round,
        previousPlay: {
          ...validPlayState,
          cardIds: ['c1', 'c2', 'c3'],
          count: 3
        },
        centralPile: [
          { id: 'c1', rank: 'KING' },
          { id: 'c2', rank: 'JOKER' },
          { id: 'c3', rank: 'QUEEN' } // invalid
        ]
      }
    };
    const result = resolveLiarChallenge(state, 'B');
    expect(result.playWasTruthful).toBe(false);
    expect(result.roundLoserId).toBe('A');
  });

  it('target reveal preserves cardIds order (AC-22)', () => {
    const state: MatchState = {
      ...baseState,
      round: {
        ...baseState.round,
        previousPlay: { ...validPlayState, cardIds: ['c2', 'c1'] } // Reversed order in previousPlay
      }
    };
    
    const result = resolveLiarChallenge(state, 'B');
    expect(result.revealedCards.map(c => c.id)).toEqual(['c2', 'c1']);
  });

  it('resolved previousPlay rejected (AC-12)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, previousPlay: { ...validPlayState, resolved: true } }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/previously resolved/);
  });

  it('previousPlay count mismatch rejected (AC-15)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, previousPlay: { ...validPlayState, count: 3 } } // mismatch
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/does not match/);
  });

  it('claimedRank mismatch rejected (AC-16)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, previousPlay: { ...validPlayState, claimedRank: 'QUEEN' } }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/does not match tableRank/);
  });

  it('duplicate target cardIds rejected (AC-17)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, previousPlay: { ...validPlayState, cardIds: ['c1', 'c1'] } }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/duplicate/);
  });

  it('missing target Card rejected (AC-19)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, centralPile: [{ id: 'c1', rank: 'KING' }] } // c2 missing
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/not found in central pile/);
  });

  it('duplicate central target rejected (AC-20)', () => {
    const state: MatchState = {
      ...baseState,
      round: {
        ...baseState.round,
        centralPile: [
          { id: 'c1', rank: 'KING' },
          { id: 'c2', rank: 'KING' },
          { id: 'c1', rank: 'KING' }
        ]
      }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/multiple times/);
  });

  it('accused missing rejected (AC-14)', () => {
    const state: MatchState = {
      ...baseState,
      round: { ...baseState.round, previousPlay: { ...validPlayState, playerId: 'Z' } }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/not found/);
  });

  it('accused ELIMINATED rejected (AC-14)', () => {
    const state: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        A: { ...baseState.players['A']!, lifeStatus: 'ELIMINATED' }
      }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/is eliminated/);
  });

  it('accused EMPTY_SAFE rejected (AC-14)', () => {
    const state: MatchState = {
      ...baseState,
      players: {
        ...baseState.players,
        A: { ...baseState.players['A']!, roundStatus: 'EMPTY_SAFE' }
      }
    };
    expect(() => resolveLiarChallenge(state, 'B')).toThrow(/is EMPTY_SAFE/);
  });

  it('reveal array is fresh and objects are detached snapshots (AC-23)', () => {
    const result = resolveLiarChallenge(baseState, 'B');
    
    expect(result.revealedCards).not.toBe(baseState.round.centralPile);
    expect(result.revealedCards[0]).not.toBe(baseState.round.centralPile[0]);
    
    // Mutating returned structure
    (result.revealedCards as any).push({ id: 'c3' });
    (result.revealedCards[0] as any).rank = 'QUEEN';

    expect(baseState.round.centralPile).toHaveLength(2);
    expect(baseState.round.centralPile[0]!.rank).toBe('KING');
  });

  it('no input mutation (AC-28, AC-29, AC-30)', () => {
    const stateStr = JSON.stringify(baseState);
    resolveLiarChallenge(baseState, 'B');
    expect(JSON.stringify(baseState)).toBe(stateStr);
  });
});
