import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';

import type { RoomAuthorityState } from './room-state.js';
import type { ServerPreparedNextTurn } from './gameplay-transaction.js';
import {
  type ServerTurnDeadlineTrigger,
  executeSystemTimeoutDeadlineTransaction,
} from './system-timeout-transaction.js';
import type { RoomPresenceRegistry } from './presence.js';
import { pauseActiveMatchForNoLivingConnections } from './presence-lifecycle.js';

export interface SystemTimeoutPresenceLifecycleStaleAlarmResult {
  readonly decision: 'STALE_ALARM';
}

export interface SystemTimeoutPresenceLifecycleNotDueResult {
  readonly decision: 'NOT_DUE';
}

export interface SystemTimeoutPresenceLifecycleNotApplicableResult {
  readonly decision: 'NOT_APPLICABLE';
}

export interface SystemTimeoutPresenceLifecycleInvalidStateResult {
  readonly decision: 'INVALID_STATE';
}

export interface SystemTimeoutPresenceLifecycleCommittedActiveResult {
  readonly decision: 'COMMITTED_ACTIVE';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly timeoutResultingRevision: number;
  readonly finalResultingRevision: number;
  readonly timedOutPlayerId: string;
  readonly autoPlayedCardId: string;
}

export interface SystemTimeoutPresenceLifecycleCommittedPausedResult {
  readonly decision: 'COMMITTED_PAUSED';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly timeoutResultingRevision: number;
  readonly finalResultingRevision: number;
  readonly timedOutPlayerId: string;
  readonly autoPlayedCardId: string;
}

export interface SystemTimeoutPresenceLifecycleCommittedFinishedResult {
  readonly decision: 'COMMITTED_FINISHED';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly timeoutResultingRevision: number;
  readonly finalResultingRevision: number;
  readonly timedOutPlayerId: string;
  readonly autoPlayedCardId: string;
}

export type SystemTimeoutPresenceLifecycleResult =
  | SystemTimeoutPresenceLifecycleStaleAlarmResult
  | SystemTimeoutPresenceLifecycleNotDueResult
  | SystemTimeoutPresenceLifecycleNotApplicableResult
  | SystemTimeoutPresenceLifecycleInvalidStateResult
  | SystemTimeoutPresenceLifecycleCommittedActiveResult
  | SystemTimeoutPresenceLifecycleCommittedPausedResult
  | SystemTimeoutPresenceLifecycleCommittedFinishedResult;

/**
 * Provider-independent authoritative composition layer that executes the verified T-023
 * SYSTEM_TIMEOUT deadline transaction and, only after a successful continuing timeout transition,
 * reconciles the resulting authoritative Match against verified T-024 Living presence using
 * verified T-025 zero-Living Pause semantics.
 *
 * Mandatory Composition Ordering:
 * 1. Execute T-023 SYSTEM_TIMEOUT deadline transaction.
 * 2. Non-COMMITTED outcomes (STALE_ALARM, NOT_DUE, NOT_APPLICABLE, INVALID_STATE) pass through immediately.
 * 3. MATCH_FINISHED outcome has absolute precedence: returns COMMITTED_FINISHED without invoking Pause.
 * 4. Continuing MATCH_ACTIVE outcome delegates presence reconciliation to T-025 zero-Living Pause.
 * 5. T-025 NO_CHANGE -> COMMITTED_ACTIVE (1 revision increment).
 *    T-025 PAUSED -> COMMITTED_PAUSED (2 revision increments: timeout revision N+1, pause revision N+2).
 *    Any unexpected T-025 outcome fails closed.
 */
export function executeSystemTimeoutWithPresenceLifecycle(
  roomState: RoomAuthorityState<MatchState>,
  trigger: ServerTurnDeadlineTrigger,
  preparedNextTurn: ServerPreparedNextTurn,
  presenceRegistry: RoomPresenceRegistry,
  authoritativeNowMs: number,
  random: RandomSource
): SystemTimeoutPresenceLifecycleResult {
  // STEP 1 — Call exactly the VERIFIED T-023 system timeout deadline transaction
  const timeoutResult = executeSystemTimeoutDeadlineTransaction(
    roomState,
    trigger,
    preparedNextTurn,
    authoritativeNowMs,
    random
  );

  // STEP 2 — Non-COMMITTED pass-through
  if (timeoutResult.decision === 'STALE_ALARM') {
    return { decision: 'STALE_ALARM' };
  }

  if (timeoutResult.decision === 'NOT_DUE') {
    return { decision: 'NOT_DUE' };
  }

  if (timeoutResult.decision === 'NOT_APPLICABLE') {
    return { decision: 'NOT_APPLICABLE' };
  }

  if (timeoutResult.decision === 'INVALID_STATE') {
    return { decision: 'INVALID_STATE' };
  }

  // At this point, timeoutResult must be COMMITTED
  if (timeoutResult.decision !== 'COMMITTED') {
    throw new Error(
      `Unexpected system timeout decision: ${(timeoutResult as { decision: string }).decision}`
    );
  }

  // STEP 3 — Match Finish precedence
  if (timeoutResult.roomState.lifecycle === 'MATCH_FINISHED') {
    return {
      decision: 'COMMITTED_FINISHED',
      roomState: timeoutResult.roomState,
      timeoutResultingRevision: timeoutResult.resultingRevision,
      finalResultingRevision: timeoutResult.resultingRevision,
      timedOutPlayerId: timeoutResult.timedOutPlayerId,
      autoPlayedCardId: timeoutResult.autoPlayedCardId,
    };
  }

  // STEP 4 — Continuing Active Match: invoke zero-Living Pause
  if (timeoutResult.roomState.lifecycle === 'MATCH_ACTIVE') {
    const pauseResult = pauseActiveMatchForNoLivingConnections(
      timeoutResult.roomState,
      presenceRegistry
    );

    // STEP 5 — Map T-025 outcomes
    if (pauseResult.status === 'NO_CHANGE') {
      return {
        decision: 'COMMITTED_ACTIVE',
        roomState: timeoutResult.roomState,
        timeoutResultingRevision: timeoutResult.resultingRevision,
        finalResultingRevision: timeoutResult.resultingRevision,
        timedOutPlayerId: timeoutResult.timedOutPlayerId,
        autoPlayedCardId: timeoutResult.autoPlayedCardId,
      };
    }

    if (pauseResult.status === 'PAUSED') {
      return {
        decision: 'COMMITTED_PAUSED',
        roomState: pauseResult.roomState,
        timeoutResultingRevision: timeoutResult.resultingRevision,
        finalResultingRevision: pauseResult.resultingRevision,
        timedOutPlayerId: timeoutResult.timedOutPlayerId,
        autoPlayedCardId: timeoutResult.autoPlayedCardId,
      };
    }

    // Invariant divergence
    throw new Error(
      `Invariant failure: unexpected presence lifecycle status after continuing timeout commit: ${pauseResult.status}`
    );
  }

  // If lifecycle is neither MATCH_FINISHED nor MATCH_ACTIVE, throw invariant failure
  throw new Error(
    `Invariant failure: unexpected room lifecycle after timeout commit: ${timeoutResult.roomState.lifecycle}`
  );
}
