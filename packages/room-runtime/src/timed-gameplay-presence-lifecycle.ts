import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';

import type { RoomAuthorityState } from './room-state.js';
import type { GameplayActionEnvelope } from './gameplay-protocol.js';
import type {
  ServerResolvedActor,
  ProcessedGameplayActionRegistry,
} from './gameplay-admission.js';
import type { ServerGameplayActionRejectionReason } from './gameplay-authorization.js';
import type { ServerPreparedNextTurn } from './gameplay-transaction.js';
import { executeTimedClientGameplayTransaction } from './timed-gameplay-transaction.js';
import type { RoomPresenceRegistry } from './presence.js';
import { pauseActiveMatchForNoLivingConnections } from './presence-lifecycle.js';

export interface TimedClientGameplayPresenceLifecycleRejectResult {
  readonly decision: 'REJECT';
  readonly reason: ServerGameplayActionRejectionReason;
}

export interface TimedClientGameplayPresenceLifecycleDuplicateResult {
  readonly decision: 'DUPLICATE';
  readonly priorResultingRevision: number;
}

export interface TimedClientGameplayPresenceLifecycleDeadlineDueResult {
  readonly decision: 'DEADLINE_DUE';
}

export interface TimedClientGameplayPresenceLifecycleCommittedActiveResult {
  readonly decision: 'COMMITTED_ACTIVE';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly processedRegistry: ProcessedGameplayActionRegistry;
  readonly actionResultingRevision: number;
  readonly finalResultingRevision: number;
}

export interface TimedClientGameplayPresenceLifecycleCommittedPausedResult {
  readonly decision: 'COMMITTED_PAUSED';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly processedRegistry: ProcessedGameplayActionRegistry;
  readonly actionResultingRevision: number;
  readonly finalResultingRevision: number;
}

export interface TimedClientGameplayPresenceLifecycleCommittedFinishedResult {
  readonly decision: 'COMMITTED_FINISHED';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly processedRegistry: ProcessedGameplayActionRegistry;
  readonly actionResultingRevision: number;
  readonly finalResultingRevision: number;
}

export type TimedClientGameplayPresenceLifecycleResult =
  | TimedClientGameplayPresenceLifecycleRejectResult
  | TimedClientGameplayPresenceLifecycleDuplicateResult
  | TimedClientGameplayPresenceLifecycleDeadlineDueResult
  | TimedClientGameplayPresenceLifecycleCommittedActiveResult
  | TimedClientGameplayPresenceLifecycleCommittedPausedResult
  | TimedClientGameplayPresenceLifecycleCommittedFinishedResult;

/**
 * Provider-independent authoritative composition layer that executes VERIFIED T-022
 * timed client gameplay and, only after a successful continuing gameplay commit, reconciles
 * the resulting Match against VERIFIED T-024 Living presence using VERIFIED T-025 zero-Living Pause semantics.
 *
 * Mandatory Ordering:
 * 1. Call executeTimedClientGameplayTransaction exactly once.
 * 2. Non-COMMITTED outcomes (REJECT, DUPLICATE, DEADLINE_DUE) pass through immediately.
 * 3. MATCH_FINISHED outcome has absolute precedence: returns COMMITTED_FINISHED without invoking Pause.
 * 4. Continuing MATCH_ACTIVE outcome delegates presence reconciliation to T-025 zero-Living Pause.
 * 5. Map T-025 outcomes:
 *    - NO_CHANGE -> COMMITTED_ACTIVE (actionResultingRevision == finalResultingRevision)
 *    - PAUSED -> COMMITTED_PAUSED (actionResultingRevision = N+1, finalResultingRevision = N+2,
 *      processedRegistry retains exact N+1 resultingRevision for the successful action)
 *    - Any unexpected status fails closed.
 */
export function executeTimedClientGameplayWithPresenceLifecycle(
  roomState: RoomAuthorityState<MatchState>,
  envelope: GameplayActionEnvelope,
  processedRegistry: ProcessedGameplayActionRegistry,
  actor: ServerResolvedActor,
  preparedNextTurn: ServerPreparedNextTurn,
  presenceRegistry: RoomPresenceRegistry,
  authoritativeNowMs: number,
  random: RandomSource
): TimedClientGameplayPresenceLifecycleResult {
  // STEP 1 — Call executeTimedClientGameplayTransaction exactly once
  const timedResult = executeTimedClientGameplayTransaction(
    roomState,
    envelope,
    processedRegistry,
    actor,
    preparedNextTurn,
    authoritativeNowMs,
    random
  );

  // STEP 2 — Non-COMMITTED pass-through
  if (timedResult.decision === 'REJECT') {
    return {
      decision: 'REJECT',
      reason: timedResult.reason,
    };
  }

  if (timedResult.decision === 'DUPLICATE') {
    return {
      decision: 'DUPLICATE',
      priorResultingRevision: timedResult.priorResultingRevision,
    };
  }

  if (timedResult.decision === 'DEADLINE_DUE') {
    return {
      decision: 'DEADLINE_DUE',
    };
  }

  // At this point, timedResult must be COMMITTED
  if (timedResult.decision !== 'COMMITTED') {
    throw new Error(
      `Unexpected timed client gameplay transaction decision: ${(timedResult as { decision: string }).decision}`
    );
  }

  // STEP 3 — Match Finish precedence
  if (timedResult.roomState.lifecycle === 'MATCH_FINISHED') {
    return {
      decision: 'COMMITTED_FINISHED',
      roomState: timedResult.roomState,
      processedRegistry: timedResult.processedRegistry,
      actionResultingRevision: timedResult.resultingRevision,
      finalResultingRevision: timedResult.resultingRevision,
    };
  }

  // STEP 4 — Continuing Active Match: invoke zero-Living Pause
  if (timedResult.roomState.lifecycle === 'MATCH_ACTIVE') {
    const pauseResult = pauseActiveMatchForNoLivingConnections(
      timedResult.roomState,
      presenceRegistry
    );

    // STEP 5 — Map T-025 outcomes
    if (pauseResult.status === 'NO_CHANGE') {
      return {
        decision: 'COMMITTED_ACTIVE',
        roomState: timedResult.roomState,
        processedRegistry: timedResult.processedRegistry,
        actionResultingRevision: timedResult.resultingRevision,
        finalResultingRevision: timedResult.resultingRevision,
      };
    }

    if (pauseResult.status === 'PAUSED') {
      return {
        decision: 'COMMITTED_PAUSED',
        roomState: pauseResult.roomState,
        processedRegistry: timedResult.processedRegistry,
        actionResultingRevision: timedResult.resultingRevision,
        finalResultingRevision: pauseResult.resultingRevision,
      };
    }

    // Invariant divergence
    throw new Error(
      `Invariant failure: unexpected presence lifecycle status after continuing gameplay commit: ${pauseResult.status}`
    );
  }

  // If lifecycle is neither MATCH_FINISHED nor MATCH_ACTIVE, throw invariant failure
  throw new Error(
    `Invariant failure: unexpected room lifecycle after client gameplay commit: ${timedResult.roomState.lifecycle}`
  );
}
