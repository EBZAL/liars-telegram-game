import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';
import { applySystemTimeout } from '@liars-telegram-game/game-core';

import type { RoomAuthorityState } from './room-state.js';
import { nextRoomRevision } from './gameplay-admission.js';
import type { ServerPreparedNextTurn } from './gameplay-transaction.js';
import { evaluateTurnDeadlineDueState, armActiveTurnDeadline } from './turn-deadline.js';

export interface ServerTurnDeadlineTrigger {
  readonly kind: 'TURN_DEADLINE';
  readonly dueAt: number;
  readonly generation: number;
}

export interface StaleAlarmTransactionResult {
  readonly decision: 'STALE_ALARM';
}

export interface NotDueTransactionResult {
  readonly decision: 'NOT_DUE';
}

export interface NotApplicableTransactionResult {
  readonly decision: 'NOT_APPLICABLE';
}

export interface InvalidStateTransactionResult {
  readonly decision: 'INVALID_STATE';
}

export interface CommittedSystemTimeoutTransactionResult {
  readonly decision: 'COMMITTED';
  readonly roomState: RoomAuthorityState<MatchState>;
  readonly resultingRevision: number;
  readonly timedOutPlayerId: string;
  readonly autoPlayedCardId: string;
}

export type SystemTimeoutDeadlineTransactionResult =
  | StaleAlarmTransactionResult
  | NotDueTransactionResult
  | NotApplicableTransactionResult
  | InvalidStateTransactionResult
  | CommittedSystemTimeoutTransactionResult;

/**
 * Executes a provider-independent authoritative Room transaction that consumes one exact due TURN_DEADLINE trigger,
 * executes the verified Core applySystemTimeout transition exactly once, advances Room revision exactly once, and:
 * - arms the next active turn at authoritativeNowMs + 30000 if Match continues, or
 * - maps a finished Core Match to MATCH_FINISHED with no turn alarm.
 *
 * Stale/Retry Protection:
 * - Trigger kind, dueAt, and generation must exactly match roomState.activeAlarm before due evaluation.
 * - Any mismatch returns STALE_ALARM with zero Core dispatch, zero revision mutation, zero RNG.
 */
export function executeSystemTimeoutDeadlineTransaction(
  roomState: RoomAuthorityState<MatchState>,
  trigger: ServerTurnDeadlineTrigger,
  preparedNextTurn: ServerPreparedNextTurn,
  authoritativeNowMs: number,
  random: RandomSource
): SystemTimeoutDeadlineTransactionResult {
  // Step 1 — Validate trigger shape & authoritativeNowMs
  if (
    typeof trigger !== 'object' ||
    trigger === null ||
    trigger.kind !== 'TURN_DEADLINE' ||
    typeof trigger.dueAt !== 'number' ||
    !Number.isSafeInteger(trigger.dueAt) ||
    trigger.dueAt < 0 ||
    typeof trigger.generation !== 'number' ||
    !Number.isSafeInteger(trigger.generation) ||
    trigger.generation < 0
  ) {
    throw new Error('Invalid ServerTurnDeadlineTrigger: trigger is malformed');
  }

  if (
    typeof authoritativeNowMs !== 'number' ||
    !Number.isSafeInteger(authoritativeNowMs) ||
    authoritativeNowMs < 0
  ) {
    throw new Error(`Invalid authoritativeNowMs: ${authoritativeNowMs}`);
  }

  // Step 2 — Exact alarm identity check BEFORE due evaluation
  const currentAlarm = roomState.activeAlarm;
  if (
    currentAlarm === null ||
    typeof currentAlarm !== 'object' ||
    currentAlarm.kind !== trigger.kind ||
    currentAlarm.dueAt !== trigger.dueAt ||
    currentAlarm.generation !== trigger.generation
  ) {
    return {
      decision: 'STALE_ALARM',
    };
  }

  // Step 3 — Evaluate authoritative timing through evaluateTurnDeadlineDueState
  const timingResult = evaluateTurnDeadlineDueState(roomState, authoritativeNowMs);

  // Step 4 — Map timing result
  if (timingResult.status === 'NOT_DUE') {
    return {
      decision: 'NOT_DUE',
    };
  }

  if (timingResult.status === 'NOT_APPLICABLE') {
    return {
      decision: 'NOT_APPLICABLE',
    };
  }

  if (timingResult.status === 'INVALID_STATE') {
    return {
      decision: 'INVALID_STATE',
    };
  }

  // Invariant: status must be 'DUE' at this point
  if (timingResult.status !== 'DUE') {
    throw new Error(`Unexpected timing status: ${timingResult.status}`);
  }

  // Step 5 — For exact DUE trigger, validate preparedNextTurn BEFORE Core dispatch
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

  // Step 6 — Validate/compute next Room revision BEFORE Core RNG consumption
  const resultingRevision = nextRoomRevision(roomState.revision);

  // Step 7 — Call verified Core system timeout transition
  const currentMatchState = roomState.match;
  if (currentMatchState === null || currentMatchState === undefined) {
    throw new Error('Invariant failure: Room match state is null or undefined on DUE trigger');
  }

  const timeoutResult = applySystemTimeout(currentMatchState, random);
  const nextMatchState = timeoutResult.state;

  // Step 8 — Validate Core result consistency
  if (nextMatchState.status === 'IN_PROGRESS' && nextMatchState.winnerId !== null) {
    throw new Error('Invariant failure: MatchState status is IN_PROGRESS but winnerId is non-null');
  }
  if (nextMatchState.status === 'FINISHED' && nextMatchState.winnerId === null) {
    throw new Error('Invariant failure: MatchState status is FINISHED but winnerId is null');
  }

  // Step 9 — Construct Room Authority State transition
  const isMatchFinished = nextMatchState.status === 'FINISHED';

  if (isMatchFinished) {
    const finishedRoomState: RoomAuthorityState<MatchState> = {
      roomId: roomState.roomId,
      lifecycle: 'MATCH_FINISHED',
      revision: resultingRevision,
      members: roomState.members,
      hostPlayerId: roomState.hostPlayerId,
      match: nextMatchState,
      currentTurnId: null,
      currentTurnDeadline: null,
      activeAlarm: null,
    };

    return {
      decision: 'COMMITTED',
      roomState: finishedRoomState,
      resultingRevision,
      timedOutPlayerId: timeoutResult.timedOutPlayerId,
      autoPlayedCardId: timeoutResult.autoPlayedCardId,
    };
  }

  // Continuing match: construct intermediate Room state and re-arm
  const intermediateRoomState: RoomAuthorityState<MatchState> = {
    roomId: roomState.roomId,
    lifecycle: 'MATCH_ACTIVE',
    revision: resultingRevision,
    members: roomState.members,
    hostPlayerId: roomState.hostPlayerId,
    match: nextMatchState,
    currentTurnId: nextTurnId,
    currentTurnDeadline: null,
    activeAlarm: null,
  };

  const armedRoomState = armActiveTurnDeadline(intermediateRoomState, authoritativeNowMs);

  return {
    decision: 'COMMITTED',
    roomState: armedRoomState,
    resultingRevision,
    timedOutPlayerId: timeoutResult.timedOutPlayerId,
    autoPlayedCardId: timeoutResult.autoPlayedCardId,
  };
}
