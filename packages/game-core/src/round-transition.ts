import { MatchState, PlayerId, PlayerState, RoundState, TableRank } from './game-state.js';
import { RandomSource, shuffle } from './randomness.js';
import { createLiarDeck, createTableDeck } from './deck.js';

export function initializeNextRound(
  state: MatchState,
  roundLoserId: PlayerId,
  random: RandomSource
): MatchState {
  // Precondition 1: Winner boundary
  if (state.winnerId !== null) {
    throw new Error('Match winner must be resolved before starting another Round.');
  }

  // Precondition 2: Resolved previousPlay required
  if (state.round.previousPlay === null) {
    throw new Error('Cannot initialize next round when previousPlay is null.');
  }

  if (!state.round.previousPlay.resolved) {
    throw new Error('Cannot initialize next round when previousPlay is unresolved.');
  }

  // Precondition 3: Round loser validation
  const loserPlayer = state.players[roundLoserId];
  if (!loserPlayer || !state.seatOrder.includes(roundLoserId)) {
    throw new Error(`roundLoserId ${roundLoserId} is not in match players or seat order.`);
  }

  // Precondition 4: Living player derivation & boundary
  const livingPlayerIds = state.seatOrder.filter(
    (id) => state.players[id]?.lifeStatus === 'ALIVE'
  );

  if (livingPlayerIds.length === 0) {
    throw new Error('Invalid state: no living players remain.');
  }

  if (livingPlayerIds.length === 1) {
    throw new Error('Match winner must be resolved before starting another Round.');
  }

  // Derive Next-Round Starter (T20 / T21)
  let nextRoundFirstPlayer: PlayerId;
  if (loserPlayer.lifeStatus === 'ALIVE') {
    // T20: Surviving round loser starts next round
    nextRoundFirstPlayer = roundLoserId;
  } else {
    // T21: Eliminated round loser falls forward to next ALIVE seat in fixed seatOrder
    const loserIndex = state.seatOrder.indexOf(roundLoserId);
    let foundStarter: PlayerId | null = null;
    for (let offset = 1; offset < state.seatOrder.length; offset++) {
      const checkIndex = (loserIndex + offset) % state.seatOrder.length;
      const checkId = state.seatOrder[checkIndex]!;
      if (state.players[checkId]?.lifeStatus === 'ALIVE') {
        foundStarter = checkId;
        break;
      }
    }
    if (!foundStarter) {
      throw new Error('Invariant failure: Could not find next living player for round starter.');
    }
    nextRoundFirstPlayer = foundStarter;
  }

  // New Round Number
  const newRoundNumber = state.round.roundNumber + 1;

  // Fresh Table Rank shuffle (T28)
  const tableDeck = createTableDeck();
  const shuffledTableDeck = shuffle(tableDeck, random);
  const topRank = shuffledTableDeck[0]!.rank;
  if (topRank === 'JOKER') {
    throw new Error('Invariant failure: Table Rank cannot be JOKER');
  }
  const tableRank: TableRank = topRank;

  // Fresh Liar Deck shuffle & Dealing
  const liarDeck = createLiarDeck();
  const shuffledLiarDeck = shuffle(liarDeck, random);

  // Prototype-safe Players dictionary
  const newPlayers = Object.create(null) as Record<PlayerId, PlayerState>;

  let currentCardIndex = 0;
  for (const id of state.seatOrder) {
    const oldPlayer = state.players[id]!;
    if (oldPlayer.lifeStatus === 'ALIVE') {
      const hand = shuffledLiarDeck.slice(currentCardIndex, currentCardIndex + 5);
      currentCardIndex += 5;

      newPlayers[id] = {
        id: oldPlayer.id,
        lifeStatus: 'ALIVE',
        roundStatus: 'WITH_CARDS',
        hand,
        revolver: oldPlayer.revolver
      };
    } else {
      newPlayers[id] = {
        id: oldPlayer.id,
        lifeStatus: 'ELIMINATED',
        roundStatus: oldPlayer.roundStatus,
        hand: [],
        revolver: oldPlayer.revolver
      };
    }
  }

  // Undealt cards
  const undealtCards = shuffledLiarDeck.slice(currentCardIndex);

  const round: RoundState = {
    roundNumber: newRoundNumber,
    tableRank,
    currentPlayerId: nextRoundFirstPlayer,
    previousPlay: null,
    centralPile: [],
    undealtCards,
    playSequence: state.round.playSequence
  };

  return {
    status: state.status,
    seatOrder: state.seatOrder,
    firstRoundStarter: state.firstRoundStarter,
    players: newPlayers,
    round,
    winnerId: state.winnerId
  };
}
