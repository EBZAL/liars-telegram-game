import { MatchState, PlayerId, PlayId } from './game-state.js';
import { Card } from './cards.js';
import { getAllowedTurnActions } from './turn-rules.js';
import { isPlayTruthful } from './play-rules.js';

export interface ChallengeResolution {
  readonly playId: PlayId;
  readonly callerId: PlayerId;
  readonly accusedPlayerId: PlayerId;
  readonly revealedCards: readonly Card[];
  readonly playWasTruthful: boolean;
  readonly challengerWasCorrect: boolean;
  readonly roundLoserId: PlayerId;
  readonly shooterId: PlayerId;
}

export function resolveLiarChallenge(
  state: MatchState,
  callerId: PlayerId
): ChallengeResolution {
  // 1. Target Only Previous Play
  const previousPlay = state.round.previousPlay;
  if (previousPlay === null) {
    throw new Error('Cannot challenge when previousPlay is null.');
  }

  // 2. CALL_LIAR Authority
  if (callerId !== state.round.currentPlayerId) {
    throw new Error(`Caller ${callerId} is not the current player.`);
  }

  const allowedActions = getAllowedTurnActions(
    state.seatOrder,
    state.players,
    state.round.currentPlayerId,
    callerId,
    true // previousPlay is explicitly not null here
  );

  if (!allowedActions.includes('CALL_LIAR')) {
    throw new Error(`Player ${callerId} is not allowed to CALL_LIAR.`);
  }

  // 3. Previous Play Must Be Unresolved
  if (previousPlay.resolved) {
    throw new Error('Cannot challenge a previously resolved Play.');
  }

  // 4. Accused Validity
  const accusedId = previousPlay.playerId;
  if (accusedId === callerId) {
    throw new Error('Cannot challenge your own Play.');
  }

  const accused = state.players[accusedId];
  if (!accused) {
    throw new Error(`Accused player ${accusedId} not found.`);
  }

  if (accused.lifeStatus === 'ELIMINATED') {
    throw new Error(`Accused player ${accusedId} is eliminated.`);
  }

  if (accused.roundStatus === 'EMPTY_SAFE') {
    throw new Error(`Accused player ${accusedId} is EMPTY_SAFE.`);
  }

  // 5. Play Contract Consistency
  if (previousPlay.count !== previousPlay.cardIds.length) {
    throw new Error(`Play count ${previousPlay.count} does not match cardIds length ${previousPlay.cardIds.length}.`);
  }
  if (![1, 2, 3].includes(previousPlay.count)) {
    throw new Error(`Play count ${previousPlay.count} is invalid.`);
  }
  if (previousPlay.claimedRank !== state.round.tableRank) {
    throw new Error(`Play claimedRank ${previousPlay.claimedRank} does not match tableRank ${state.round.tableRank}.`);
  }
  const uniqueCardIds = new Set(previousPlay.cardIds);
  if (uniqueCardIds.size !== previousPlay.cardIds.length) {
    throw new Error('Play contains duplicate card IDs.');
  }

  // 6. Resolve Target Cards from Central Pile
  const authoritativeTargetCards: Card[] = [];
  const centralPileIds = state.round.centralPile.map(c => c.id);
  
  for (const targetId of previousPlay.cardIds) {
    const occurrences = centralPileIds.filter(id => id === targetId).length;
    if (occurrences === 0) {
      throw new Error(`Target card ${targetId} not found in central pile.`);
    }
    if (occurrences > 1) {
      throw new Error(`Target card ${targetId} occurs multiple times in central pile.`);
    }
    
    const card = state.round.centralPile.find(c => c.id === targetId)!;
    authoritativeTargetCards.push(card);
  }

  // 7. Reveal Snapshots
  const revealedCards = authoritativeTargetCards.map(c => ({
    id: c.id,
    rank: c.rank
  }));

  // 8. Truth / Lie
  const playWasTruthful = isPlayTruthful(authoritativeTargetCards, state.round.tableRank);

  // 9. Round Loser
  const challengerWasCorrect = !playWasTruthful;
  const roundLoserId = playWasTruthful ? callerId : accusedId;
  const shooterId = roundLoserId;

  return {
    playId: previousPlay.playId,
    callerId,
    accusedPlayerId: accusedId,
    revealedCards,
    playWasTruthful,
    challengerWasCorrect,
    roundLoserId,
    shooterId
  };
}
