import type { MatchState } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from './room-state.js';
import { nextRoomRevision } from './gameplay-admission.js';
import { armActiveTurnDeadline, TURN_DURATION_MS } from './turn-deadline.js';
import { evaluateRoomPresence, type RoomPresenceRegistry } from './presence.js';

export type PresenceLifecycleStatus =
  | 'NO_CHANGE'
  | 'NOT_APPLICABLE'
  | 'PAUSED'
  | 'RESUMED'
  | 'INVALID_STATE';

export interface PresenceLifecycleNoChangeResult {
  readonly status: 'NO_CHANGE';
}

export interface PresenceLifecycleNotApplicableResult {
  readonly status: 'NOT_APPLICABLE';
}

export interface PresenceLifecycleInvalidStateResult {
  readonly status: 'INVALID_STATE';
}

export interface PresenceLifecyclePausedResult<TMatchSnapshot = MatchState> {
  readonly status: 'PAUSED';
  readonly roomState: RoomAuthorityState<TMatchSnapshot>;
  readonly resultingRevision: number;
}

export interface PresenceLifecycleResumedResult<TMatchSnapshot = MatchState> {
  readonly status: 'RESUMED';
  readonly roomState: RoomAuthorityState<TMatchSnapshot>;
  readonly resultingRevision: number;
}

export type PresenceLifecycleTransitionResult<TMatchSnapshot = MatchState> =
  | PresenceLifecycleNoChangeResult
  | PresenceLifecycleNotApplicableResult
  | PresenceLifecycleInvalidStateResult
  | PresenceLifecyclePausedResult<TMatchSnapshot>
  | PresenceLifecycleResumedResult<TMatchSnapshot>;

export function pauseActiveMatchForNoLivingConnections(
  roomState: RoomAuthorityState<MatchState>,
  presenceRegistry: RoomPresenceRegistry
): PresenceLifecycleTransitionResult<MatchState> {
  if (typeof roomState !== 'object' || roomState === null) {
    return { status: 'INVALID_STATE' };
  }

  // Non-active lifecycles return NOT_APPLICABLE
  if (
    roomState.lifecycle === 'LOBBY' ||
    roomState.lifecycle === 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' ||
    roomState.lifecycle === 'MATCH_FINISHED' ||
    roomState.lifecycle === 'ABANDONED'
  ) {
    return { status: 'NOT_APPLICABLE' };
  }

  if (roomState.lifecycle !== 'MATCH_ACTIVE') {
    return { status: 'INVALID_STATE' };
  }

  // Authoritative Match invariants check
  if (
    roomState.match === null ||
    roomState.match === undefined ||
    typeof roomState.match !== 'object' ||
    roomState.match.status !== 'IN_PROGRESS' ||
    roomState.match.winnerId !== null
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (
    typeof roomState.currentTurnId !== 'string' ||
    roomState.currentTurnId.trim() === ''
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (
    typeof roomState.revision !== 'number' ||
    !Number.isSafeInteger(roomState.revision) ||
    roomState.revision < 0 ||
    roomState.revision >= Number.MAX_SAFE_INTEGER
  ) {
    return { status: 'INVALID_STATE' };
  }

  // Coherent active timing check
  if (
    typeof roomState.currentTurnDeadline !== 'number' ||
    !Number.isSafeInteger(roomState.currentTurnDeadline) ||
    roomState.currentTurnDeadline < 0
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (
    typeof roomState.activeAlarm !== 'object' ||
    roomState.activeAlarm === null
  ) {
    return { status: 'INVALID_STATE' };
  }

  const alarm = roomState.activeAlarm;
  if (
    alarm.kind !== 'TURN_DEADLINE' ||
    alarm.dueAt !== roomState.currentTurnDeadline ||
    alarm.generation !== roomState.revision
  ) {
    return { status: 'INVALID_STATE' };
  }

  // Delegate Living presence count strictly to evaluateRoomPresence
  let presenceSummary;
  try {
    presenceSummary = evaluateRoomPresence(roomState, presenceRegistry);
  } catch {
    return { status: 'INVALID_STATE' };
  }

  if (presenceSummary.connectedLivingPlayers > 0) {
    return { status: 'NO_CHANGE' };
  }

  // Commit Pause: increment Room revision exactly once
  const resultingRevision = nextRoomRevision(roomState.revision);

  const pausedState: RoomAuthorityState<MatchState> = {
    roomId: roomState.roomId,
    lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
    revision: resultingRevision,
    members: roomState.members,
    hostPlayerId: roomState.hostPlayerId,
    match: roomState.match,
    currentTurnId: roomState.currentTurnId,
    currentTurnDeadline: null,
    activeAlarm: null,
  };

  return {
    status: 'PAUSED',
    roomState: pausedState,
    resultingRevision,
  };
}

export function resumePausedMatchForLivingPresenceTransition(
  roomState: RoomAuthorityState<MatchState>,
  previousPresenceRegistry: RoomPresenceRegistry,
  nextPresenceRegistry: RoomPresenceRegistry,
  authoritativeResumeTimeMs: number
): PresenceLifecycleTransitionResult<MatchState> {
  // Validate authoritativeResumeTimeMs
  if (
    typeof authoritativeResumeTimeMs !== 'number' ||
    !Number.isSafeInteger(authoritativeResumeTimeMs) ||
    authoritativeResumeTimeMs < 0 ||
    authoritativeResumeTimeMs + TURN_DURATION_MS > Number.MAX_SAFE_INTEGER
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (typeof roomState !== 'object' || roomState === null) {
    return { status: 'INVALID_STATE' };
  }

  // Non-paused lifecycles return NOT_APPLICABLE
  if (
    roomState.lifecycle === 'LOBBY' ||
    roomState.lifecycle === 'MATCH_ACTIVE' ||
    roomState.lifecycle === 'MATCH_FINISHED' ||
    roomState.lifecycle === 'ABANDONED'
  ) {
    return { status: 'NOT_APPLICABLE' };
  }

  if (roomState.lifecycle !== 'MATCH_PAUSED_NO_LIVING_CONNECTIONS') {
    return { status: 'INVALID_STATE' };
  }

  // Paused state invariants check
  if (
    roomState.match === null ||
    roomState.match === undefined ||
    typeof roomState.match !== 'object' ||
    roomState.match.status !== 'IN_PROGRESS' ||
    roomState.match.winnerId !== null
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (
    typeof roomState.currentTurnId !== 'string' ||
    roomState.currentTurnId.trim() === ''
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (
    typeof roomState.revision !== 'number' ||
    !Number.isSafeInteger(roomState.revision) ||
    roomState.revision < 0 ||
    roomState.revision >= Number.MAX_SAFE_INTEGER
  ) {
    return { status: 'INVALID_STATE' };
  }

  if (roomState.currentTurnDeadline !== null || roomState.activeAlarm !== null) {
    return { status: 'INVALID_STATE' };
  }

  // Delegate before/after Living presence evaluations
  let beforeSummary;
  let afterSummary;
  try {
    beforeSummary = evaluateRoomPresence(roomState, previousPresenceRegistry);
    afterSummary = evaluateRoomPresence(roomState, nextPresenceRegistry);
  } catch {
    return { status: 'INVALID_STATE' };
  }

  // Paused state before-count must be exactly 0 (any non-zero in before state fails closed)
  if (beforeSummary.connectedLivingPlayers !== 0) {
    return { status: 'INVALID_STATE' };
  }

  // If after-count is still 0 (e.g. 0 -> 0), no resume
  if (afterSummary.connectedLivingPlayers === 0) {
    return { status: 'NO_CHANGE' };
  }

  // If after-count is > 1 (e.g. 0 -> 2), fail closed / INVALID_STATE
  if (afterSummary.connectedLivingPlayers !== 1) {
    return { status: 'INVALID_STATE' };
  }

  // Exact 0 -> 1 Living transition:
  // 1. Advance Room revision exactly once
  const resultingRevision = nextRoomRevision(roomState.revision);

  // 2. Construct clean resumed intermediate state
  const resumedIntermediateState: RoomAuthorityState<MatchState> = {
    roomId: roomState.roomId,
    lifecycle: 'MATCH_ACTIVE',
    revision: resultingRevision,
    members: roomState.members,
    hostPlayerId: roomState.hostPlayerId,
    match: roomState.match,
    currentTurnId: roomState.currentTurnId,
    currentTurnDeadline: null,
    activeAlarm: null,
  };

  // 3. Arm active turn deadline (adds 0 extra revisions, establishes fresh deadline + alarm)
  const finalResumedState = armActiveTurnDeadline(
    resumedIntermediateState,
    authoritativeResumeTimeMs
  );

  return {
    status: 'RESUMED',
    roomState: finalResumedState,
    resultingRevision,
  };
}
