import type { MatchState } from '@liars-telegram-game/game-core';
import { getAllowedTurnActions, validatePlaySelection } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from './room-state.js';
import type { GameplayActionEnvelope } from './gameplay-protocol.js';
import type {
  ProcessedGameplayActionRegistry,
  GameplayActionRejectionReason,
  ServerResolvedActor,
} from './gameplay-admission.js';
import { isExactRequest } from './gameplay-admission.js';

export type { ServerResolvedActor };

export type ServerGameplayActionRejectionReason =
  | 'INVALID_ACTOR_CONTEXT'
  | 'ACTOR_NOT_MEMBER'
  | GameplayActionRejectionReason
  | 'MATCH_STATE_MISSING'
  | 'ACTOR_NOT_MATCH_PLAYER'
  | 'ACTOR_NOT_CURRENT_PLAYER'
  | 'ACTION_NOT_ALLOWED'
  | 'INVALID_PLAY_SELECTION';

export interface AcceptServerActionResult {
  decision: 'ACCEPT';
}

export interface DuplicateServerActionResult {
  decision: 'DUPLICATE';
  priorResultingRevision: number;
}

export interface RejectServerActionResult {
  decision: 'REJECT';
  reason: ServerGameplayActionRejectionReason;
}

export type ServerGameplayActionAuthorizationResult =
  | AcceptServerActionResult
  | DuplicateServerActionResult
  | RejectServerActionResult;

export function evaluateServerGameplayActionRequest(
  roomState: RoomAuthorityState<MatchState>,
  envelope: GameplayActionEnvelope,
  processedRegistry: ProcessedGameplayActionRegistry,
  actor: ServerResolvedActor
): ServerGameplayActionAuthorizationResult {
  // Step 1 — Validate Server Actor Context
  if (
    typeof actor !== 'object' ||
    actor === null ||
    typeof actor.playerId !== 'string' ||
    actor.playerId.trim() === ''
  ) {
    return {
      decision: 'REJECT',
      reason: 'INVALID_ACTOR_CONTEXT',
    };
  }

  const actorId = actor.playerId.trim();

  // Step 2 — Room Membership Authorization (BEFORE dedupe lookup)
  const isMember = roomState.members.some((m) => m.playerId === actorId);
  if (!isMember) {
    return {
      decision: 'REJECT',
      reason: 'ACTOR_NOT_MEMBER',
    };
  }

  // Step 3 — Actor-Bound ActionId Lookup (Dedupe / Conflict)
  const actionId = envelope.actionId;
  const hasExisting = Object.prototype.hasOwnProperty.call(processedRegistry, actionId);
  if (hasExisting) {
    const existing = processedRegistry[actionId];
    if (existing.actorPlayerId === actorId && isExactRequest(existing, envelope)) {
      return {
        decision: 'DUPLICATE',
        priorResultingRevision: existing.resultingRevision,
      };
    }
    return {
      decision: 'REJECT',
      reason: 'ACTION_ID_CONFLICT',
    };
  }

  // Step 4 — Unseen ActionId Revision Check
  if (envelope.expectedRevision !== roomState.revision) {
    return {
      decision: 'REJECT',
      reason: 'STALE_REVISION',
    };
  }

  // Step 5 — Lifecycle Check
  if (roomState.lifecycle !== 'MATCH_ACTIVE') {
    return {
      decision: 'REJECT',
      reason: 'MATCH_NOT_ACTIVE',
    };
  }

  // Step 6 — Match Snapshot Validation
  if (roomState.match === null) {
    return {
      decision: 'REJECT',
      reason: 'MATCH_STATE_MISSING',
    };
  }

  const match = roomState.match;

  // Fail closed if Core Match is already finished
  if (match.status === 'FINISHED' || match.winnerId !== null) {
    return {
      decision: 'REJECT',
      reason: 'MATCH_NOT_ACTIVE',
    };
  }

  // Step 7 — Room TurnId Check
  if (roomState.currentTurnId === null || envelope.turnId !== roomState.currentTurnId) {
    return {
      decision: 'REJECT',
      reason: 'TURN_MISMATCH',
    };
  }

  // Step 8 — Match Player Authorization
  if (!Object.prototype.hasOwnProperty.call(match.players, actorId)) {
    return {
      decision: 'REJECT',
      reason: 'ACTOR_NOT_MATCH_PLAYER',
    };
  }

  if (actorId !== match.round.currentPlayerId) {
    return {
      decision: 'REJECT',
      reason: 'ACTOR_NOT_CURRENT_PLAYER',
    };
  }

  // Step 9 — Core Legal-Action Authorization
  const allowedActions = getAllowedTurnActions(
    match.seatOrder,
    match.players,
    match.round.currentPlayerId,
    actorId,
    match.round.previousPlay !== null
  );

  if (!allowedActions.includes(envelope.actionType)) {
    return {
      decision: 'REJECT',
      reason: 'ACTION_NOT_ALLOWED',
    };
  }

  // Step 10 — PLAY Card Ownership Validation
  if (envelope.actionType === 'PLAY_CARDS') {
    const actorPlayerState = match.players[actorId];
    if (!actorPlayerState) {
      return {
        decision: 'REJECT',
        reason: 'ACTOR_NOT_MATCH_PLAYER',
      };
    }
    try {
      validatePlaySelection(actorPlayerState.hand, envelope.payload.cardIds);
    } catch {
      return {
        decision: 'REJECT',
        reason: 'INVALID_PLAY_SELECTION',
      };
    }
  }

  // Step 11 — ACCEPT
  return {
    decision: 'ACCEPT',
  };
}
