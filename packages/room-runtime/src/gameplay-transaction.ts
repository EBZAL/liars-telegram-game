import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';
import { applyPlayCardsCommand, applyCallLiar } from '@liars-telegram-game/game-core';

import type { RoomAuthorityState } from './room-state.js';
import type { GameplayActionEnvelope } from './gameplay-protocol.js';
import type {
  ServerResolvedActor,
  ProcessedGameplayActionRegistry,
} from './gameplay-admission.js';
import { nextRoomRevision, recordSuccessfulGameplayAction } from './gameplay-admission.js';
import type { ServerGameplayActionRejectionReason } from './gameplay-authorization.js';
import { evaluateServerGameplayActionRequest } from './gameplay-authorization.js';

export interface ServerPreparedNextTurn {
  turnId: string;
}

export interface RejectTransactionResult {
  decision: 'REJECT';
  reason: ServerGameplayActionRejectionReason;
}

export interface DuplicateTransactionResult {
  decision: 'DUPLICATE';
  priorResultingRevision: number;
}

export interface CommittedTransactionResult {
  decision: 'COMMITTED';
  roomState: RoomAuthorityState<MatchState>;
  processedRegistry: ProcessedGameplayActionRegistry;
  resultingRevision: number;
}

export type ClientGameplayTransactionResult =
  | RejectTransactionResult
  | DuplicateTransactionResult
  | CommittedTransactionResult;

export function executeClientGameplayTransaction(
  roomState: RoomAuthorityState<MatchState>,
  envelope: GameplayActionEnvelope,
  processedRegistry: ProcessedGameplayActionRegistry,
  actor: ServerResolvedActor,
  preparedNextTurn: ServerPreparedNextTurn,
  random: RandomSource
): ClientGameplayTransactionResult {
  // Step 1 — Delegate authorization check to evaluateServerGameplayActionRequest
  const authResult = evaluateServerGameplayActionRequest(
    roomState,
    envelope,
    processedRegistry,
    actor
  );

  // Step 2 — REJECT: return immediately without Core dispatch, revision increment, or turn validation
  if (authResult.decision === 'REJECT') {
    return {
      decision: 'REJECT',
      reason: authResult.reason,
    };
  }

  // Step 3 — DUPLICATE: return immediately without Core dispatch, revision increment, or turn validation
  if (authResult.decision === 'DUPLICATE') {
    return {
      decision: 'DUPLICATE',
      priorResultingRevision: authResult.priorResultingRevision,
    };
  }

  // Step 4 — ServerPreparedNextTurn validation (only after ACCEPT, BEFORE Core dispatch)
  if (
    typeof preparedNextTurn !== 'object' ||
    preparedNextTurn === null ||
    typeof preparedNextTurn.turnId !== 'string' ||
    preparedNextTurn.turnId.trim() === ''
  ) {
    throw new Error('Invalid ServerPreparedNextTurn: turnId must be a non-empty string');
  }

  const nextTurnId = preparedNextTurn.turnId.trim();
  if (roomState.currentTurnId !== null && nextTurnId === roomState.currentTurnId) {
    throw new Error(
      `Invalid ServerPreparedNextTurn: turnId '${nextTurnId}' cannot equal current turnId '${roomState.currentTurnId}'`
    );
  }

  const actorPlayerId = actor.playerId.trim();
  const currentMatchState = roomState.match!;
  let nextMatchState: MatchState;

  // Step 5 — Dispatch verified Core command
  if (envelope.actionType === 'PLAY_CARDS') {
    const playResult = applyPlayCardsCommand(
      currentMatchState,
      actorPlayerId,
      envelope.payload.cardIds,
      random
    );
    nextMatchState = playResult.state;
  } else if (envelope.actionType === 'CALL_LIAR') {
    const callResult = applyCallLiar(currentMatchState, actorPlayerId, random);
    nextMatchState = callResult.state;
  } else {
    throw new Error(`Unsupported actionType: ${(envelope as GameplayActionEnvelope).actionType}`);
  }

  // Step 6 — Fail closed on impossible Core result combinations
  if (nextMatchState.status === 'IN_PROGRESS' && nextMatchState.winnerId !== null) {
    throw new Error('Invariant failure: MatchState status is IN_PROGRESS but winnerId is non-null');
  }
  if (nextMatchState.status === 'FINISHED' && nextMatchState.winnerId === null) {
    throw new Error('Invariant failure: MatchState status is FINISHED but winnerId is null');
  }

  // Step 7 — Calculate resulting revision
  const resultingRevision = nextRoomRevision(roomState.revision);

  // Step 8 — Record successful action in processed registry
  const nextRegistry = recordSuccessfulGameplayAction(
    processedRegistry,
    actor,
    envelope,
    resultingRevision
  );

  // Step 9 — Construct next authoritative RoomAuthorityState<MatchState>
  const isMatchFinished = nextMatchState.status === 'FINISHED';

  const nextRoomState: RoomAuthorityState<MatchState> = {
    roomId: roomState.roomId,
    lifecycle: isMatchFinished ? 'MATCH_FINISHED' : 'MATCH_ACTIVE',
    revision: resultingRevision,
    members: roomState.members,
    hostPlayerId: roomState.hostPlayerId,
    match: nextMatchState,
    currentTurnId: isMatchFinished ? null : nextTurnId,
    currentTurnDeadline: null,
    activeAlarm: null,
  };

  // Step 10 — Return COMMITTED result
  return {
    decision: 'COMMITTED',
    roomState: nextRoomState,
    processedRegistry: nextRegistry,
    resultingRevision,
  };
}
