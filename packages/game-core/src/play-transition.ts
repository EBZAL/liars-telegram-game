import { MatchState, PlayerId, PlayState } from './game-state.js';
import { validatePlaySelection, deriveClaim } from './play-rules.js';
import { getAllowedTurnActions, getNextEligiblePlayerId } from './turn-rules.js';

export function applyPlayCards(
  state: MatchState,
  actorId: PlayerId,
  requestedCardIds: readonly string[]
): MatchState {
  // 1. Authoritative validation
  const allowedActions = getAllowedTurnActions(
    state.seatOrder,
    state.players,
    state.round.currentPlayerId,
    actorId,
    state.round.previousPlay !== null
  );

  if (!allowedActions.includes('PLAY_CARDS')) {
    throw new Error(`Player ${actorId} is not allowed to PLAY_CARDS.`);
  }

  const actor = state.players[actorId];
  if (!actor) {
    throw new Error(`Actor ${actorId} not found.`);
  }

  // 2. Authoritative card selection
  const selectedCards = validatePlaySelection(actor.hand, requestedCardIds);
  const selectedCardIds = selectedCards.map(c => c.id);

  // 3. Claim derivation
  const claim = deriveClaim(state.round.tableRank, selectedCards);

  // 4. Old challenge window / T12 no-challenge safe transition
  let players = { ...state.players }; // Shallow clone prototype-safe dictionary
  
  // We need to keep the prototype if the dictionary was created with Object.create(null)
  if (Object.getPrototypeOf(state.players) === null) {
    players = Object.assign(Object.create(null), state.players);
  }

  const prevPlay = state.round.previousPlay;
  if (prevPlay) {
    const prevActor = players[prevPlay.playerId];
    if (prevActor && prevActor.roundStatus === 'EMPTY_PENDING_CHALLENGE') {
      players[prevPlay.playerId] = {
        ...prevActor,
        roundStatus: 'EMPTY_SAFE'
      };
    }
  }

  // 5. Remove cards from actor hand
  const selectedIdSet = new Set(selectedCardIds);
  const newHand = actor.hand.filter(c => !selectedIdSet.has(c.id));
  const newRoundStatus = newHand.length === 0 ? 'EMPTY_PENDING_CHALLENGE' : 'WITH_CARDS';
  
  players[actorId] = {
    ...actor,
    hand: newHand,
    roundStatus: newRoundStatus
  };

  // 6. Central Pile
  const newCentralPile = [...state.round.centralPile, ...selectedCards];

  // 7. Previous Play
  const playSequence = state.round.playSequence;
  const newPlay: PlayState = {
    playId: playSequence,
    playerId: actorId,
    cardIds: selectedCardIds,
    count: claim.count,
    claimedRank: claim.rank,
    resolved: false
  };

  // 9. Next Player
  const nextPlayerId = getNextEligiblePlayerId(state.seatOrder, players, actorId);
  if (nextPlayerId === null) {
    throw new Error('No eligible successor found.');
  }

  // Return new MatchState
  return {
    ...state,
    players,
    round: {
      ...state.round,
      currentPlayerId: nextPlayerId,
      previousPlay: newPlay,
      centralPile: newCentralPile,
      playSequence: playSequence + 1
    }
  };
}
