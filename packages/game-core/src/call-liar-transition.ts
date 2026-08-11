import { MatchState, PlayerId, PlayerState, PlayState } from './game-state.js';
import { RandomSource } from './randomness.js';
import { RevolverOutcome } from './revolver.js';
import { ChallengeResolution, resolveLiarChallenge } from './challenge-rules.js';
import { resolveRouletteShot } from './roulette-rules.js';
import { initializeNextRound } from './round-transition.js';

export type CallLiarTerminal = 'NEXT_ROUND' | 'MATCH_WON';

export interface CallLiarShotResult {
  readonly playerId: PlayerId;
  readonly shotIndex: number;
  readonly outcome: RevolverOutcome;
  readonly nextShotIndex: number;
  readonly eliminated: boolean;
}

export interface CallLiarTransitionResult {
  readonly state: MatchState;
  readonly challenge: ChallengeResolution;
  readonly shot: CallLiarShotResult;
  readonly terminal: CallLiarTerminal;
  readonly winnerId: PlayerId | null;
}

export function applyCallLiar(
  state: MatchState,
  callerId: PlayerId,
  random: RandomSource
): CallLiarTransitionResult {
  // 1. Match must be active core state
  if (state.status !== 'IN_PROGRESS' || state.winnerId !== null) {
    throw new Error('Match is already FINISHED.');
  }

  // 2. Pre-CALL living invariant (>= 2 ALIVE players)
  const preCallLivingIds = state.seatOrder.filter(
    (id) => state.players[id]?.lifeStatus === 'ALIVE'
  );

  if (preCallLivingIds.length < 2) {
    throw new Error('Active match must have at least 2 ALIVE players.');
  }

  // 3. Challenge resolution (validates turn legality, caller identity, unresolved previousPlay)
  const challenge = resolveLiarChallenge(state, callerId);

  // 4. Shooter authority & previousPlay resolved lifecycle
  const shooterId = challenge.shooterId;
  const shooterPlayer = state.players[shooterId];
  if (!shooterPlayer) {
    throw new Error(`Shooter ${shooterId} not found in match players.`);
  }

  const resolvedPreviousPlay: PlayState = {
    ...state.round.previousPlay!,
    resolved: true
  };

  // 5. Apply Roulette Shot
  const shotRes = resolveRouletteShot(shooterPlayer);

  // Build intermediate prototype-safe Players dictionary
  const intermediatePlayers = Object.create(null) as Record<PlayerId, PlayerState>;
  for (const id of state.seatOrder) {
    if (id === shooterId) {
      intermediatePlayers[id] = shotRes.updatedPlayer;
    } else {
      intermediatePlayers[id] = state.players[id]!;
    }
  }

  // Build intermediate MatchState with resolved previousPlay
  const postShotState: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: state.seatOrder,
    firstRoundStarter: state.firstRoundStarter,
    players: intermediatePlayers,
    round: {
      ...state.round,
      previousPlay: resolvedPreviousPlay
    },
    winnerId: null
  };

  // Construct detached scalar shot result summary
  const shot: CallLiarShotResult = {
    playerId: shotRes.playerId,
    shotIndex: shotRes.shotIndex,
    outcome: shotRes.outcome,
    nextShotIndex: shotRes.nextShotIndex,
    eliminated: shotRes.eliminated
  };

  // 6. Post-Shot Living count branch
  const postShotLivingIds = state.seatOrder.filter(
    (id) => intermediatePlayers[id]!.lifeStatus === 'ALIVE'
  );

  if (postShotLivingIds.length >= 2) {
    // Continuing match: initialize next round
    const nextRoundState = initializeNextRound(
      postShotState,
      challenge.roundLoserId,
      random
    );

    return {
      state: nextRoundState,
      challenge,
      shot,
      terminal: 'NEXT_ROUND',
      winnerId: null
    };
  } else if (postShotLivingIds.length === 1) {
    // T26: Immediate Match Winner (no next round, no RNG consumption)
    const winnerId = postShotLivingIds[0]!;
    const finishedState: MatchState = {
      ...postShotState,
      status: 'FINISHED',
      winnerId
    };

    return {
      state: finishedState,
      challenge,
      shot,
      terminal: 'MATCH_WON',
      winnerId
    };
  } else {
    throw new Error('Invalid state: no living players remain after shot.');
  }
}
