import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from './room-state.js';
import type { GameplayActionEnvelope } from './gameplay-protocol.js';
import type {
  ServerResolvedActor,
  ProcessedGameplayActionRegistry,
} from './gameplay-admission.js';
import type { ServerGameplayActionRejectionReason } from './gameplay-authorization.js';
import { evaluateServerGameplayActionRequest } from './gameplay-authorization.js';
import type { ServerPreparedNextTurn } from './gameplay-transaction.js';
import { executeClientGameplayTransaction } from './gameplay-transaction.js';
import { evaluateTurnDeadlineDueState, armActiveTurnDeadline } from './turn-deadline.js';

export interface RejectTimedTransactionResult {
  decision: 'REJECT';
  reason: ServerGameplayActionRejectionReason;
}

export interface DuplicateTimedTransactionResult {
  decision: 'DUPLICATE';
  priorResultingRevision: number;
}

export interface DeadlineDueTimedTransactionResult {
  decision: 'DEADLINE_DUE';
}

export interface CommittedTimedTransactionResult {
  decision: 'COMMITTED';
  roomState: RoomAuthorityState<MatchState>;
  processedRegistry: ProcessedGameplayActionRegistry;
  resultingRevision: number;
}

export type TimedClientGameplayTransactionResult =
  | RejectTimedTransactionResult
  | DuplicateTimedTransactionResult
  | DeadlineDueTimedTransactionResult
  | CommittedTimedTransactionResult;

/**
 * Executes a provider-independent timed client gameplay transaction by composing:
 * 1. T-019 server actor authorization & deduplication
 * 2. T-021 turn deadline evaluation
 * 3. T-020 authoritative client gameplay commit
 * 4. T-021 next turn deadline arming
 *
 * Authority rule:
 * - now < deadline: client transaction may proceed
 * - now >= deadline: client transaction cannot proceed -> DEADLINE_DUE
 * - Duplicate retries and authorization rejections take precedence over deadline arbitration.
 * - This function does NOT execute SYSTEM_TIMEOUT.
 */
export function executeTimedClientGameplayTransaction(
  roomState: RoomAuthorityState<MatchState>,
  envelope: GameplayActionEnvelope,
  processedRegistry: ProcessedGameplayActionRegistry,
  actor: ServerResolvedActor,
  preparedNextTurn: ServerPreparedNextTurn,
  authoritativeNowMs: number,
  random: RandomSource
): TimedClientGameplayTransactionResult {
  // Step 1 — Evaluate authorization & deduplication against original Room state
  const authResult = evaluateServerGameplayActionRequest(
    roomState,
    envelope,
    processedRegistry,
    actor
  );

  // Step 2 — DUPLICATE precedence: return immediately without deadline check or Core dispatch
  if (authResult.decision === 'DUPLICATE') {
    return {
      decision: 'DUPLICATE',
      priorResultingRevision: authResult.priorResultingRevision,
    };
  }

  // Step 3 — REJECT precedence: return immediately without deadline side effect
  if (authResult.decision === 'REJECT') {
    return {
      decision: 'REJECT',
      reason: authResult.reason,
    };
  }

  // Step 4 — Evaluate authoritative turn deadline due state (only for unseen ACCEPTed action)
  const timingResult = evaluateTurnDeadlineDueState(roomState, authoritativeNowMs);

  // Step 5 — If deadline is DUE, client lost authority for this turn -> DEADLINE_DUE
  if (timingResult.status === 'DUE') {
    return {
      decision: 'DEADLINE_DUE',
    };
  }

  // Timing Invalid State handling: fail closed before T-020 dispatch
  if (timingResult.status === 'INVALID_STATE') {
    throw new Error('Invariant failure: Room turn deadline timing is in INVALID_STATE');
  }

  if (timingResult.status === 'NOT_APPLICABLE') {
    throw new Error(
      'Invariant failure: evaluateTurnDeadlineDueState returned NOT_APPLICABLE after T-019 ACCEPT'
    );
  }

  // Step 6 — Timing is NOT_DUE: dispatch to verified T-020 client gameplay transaction primitive
  const txResult = executeClientGameplayTransaction(
    roomState,
    envelope,
    processedRegistry,
    actor,
    preparedNextTurn,
    random
  );

  // Invariant verification: preflight ACCEPT + NOT_DUE must produce COMMITTED
  if (txResult.decision !== 'COMMITTED') {
    throw new Error(
      `Invariant failure: unexpected transaction decision '${txResult.decision}' after preflight ACCEPT and NOT_DUE`
    );
  }

  // Step 7 — If Match finished, do not arm next deadline; return finished state unchanged
  if (txResult.roomState.lifecycle === 'MATCH_FINISHED') {
    return {
      decision: 'COMMITTED',
      roomState: txResult.roomState,
      processedRegistry: txResult.processedRegistry,
      resultingRevision: txResult.resultingRevision,
    };
  }

  // Step 8 — Match continues: arm the next turn deadline using server transaction time
  const armedRoomState = armActiveTurnDeadline(
    txResult.roomState,
    authoritativeNowMs
  );

  return {
    decision: 'COMMITTED',
    roomState: armedRoomState,
    processedRegistry: txResult.processedRegistry,
    resultingRevision: txResult.resultingRevision,
  };
}
