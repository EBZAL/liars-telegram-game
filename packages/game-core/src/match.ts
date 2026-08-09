import { MatchState, PlayerId, PlayerState, RoundState } from './game-state.js';
import { RandomSource, shuffle } from './randomness.js';
import { parsePlayerCount } from './player-count.js';
import { createBaseRevolver } from './revolver.js';
import { createLiarDeck, createTableDeck } from './deck.js';

export function initializeMatch(
  playerIds: readonly PlayerId[],
  random: RandomSource
): MatchState {
  // Validate player count (2-4)
  parsePlayerCount(playerIds.length);

  // Validate duplicates and empty IDs
  const idSet = new Set<PlayerId>();
  for (const id of playerIds) {
    if (id.trim() === '') {
      throw new Error('Player ID cannot be empty');
    }
    if (idSet.has(id)) {
      throw new Error('Duplicate Player ID');
    }
    idSet.add(id);
  }

  // Determine randomized seat order (must not mutate input array)
  const seatOrder = shuffle(playerIds, random);

  // Determine first round starter
  const starterIndex = random.nextInt(seatOrder.length);
  const firstRoundStarter = seatOrder[starterIndex];

  // Table Rank
  const tableDeck = createTableDeck();
  const shuffledTableDeck = shuffle(tableDeck, random);
  const tableRank = shuffledTableDeck[0].rank;

  // Round Liar Deck
  const liarDeck = createLiarDeck();
  const shuffledLiarDeck = shuffle(liarDeck, random);

  // Deal cards and build players
  const players: Record<PlayerId, PlayerState> = {};
  
  let currentCardIndex = 0;
  for (const id of seatOrder) {
    // Deal exactly 5 cards to each player
    const hand = shuffledLiarDeck.slice(currentCardIndex, currentCardIndex + 5);
    currentCardIndex += 5;

    // Revolver sequence independent per player
    const revolverSequence = shuffle(createBaseRevolver(), random);

    players[id] = {
      id,
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand,
      revolver: {
        sequence: revolverSequence,
        nextShotIndex: 0
      }
    };
  }

  // Undealt cards
  const undealtCards = shuffledLiarDeck.slice(currentCardIndex);

  const round: RoundState = {
    roundNumber: 1,
    tableRank,
    currentPlayerId: firstRoundStarter,
    previousPlay: null,
    centralPile: [],
    undealtCards
  };

  return {
    status: 'IN_PROGRESS',
    seatOrder,
    firstRoundStarter,
    players,
    round,
    winnerId: null
  };
}
