import type { MatchState } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from './room-state.js';

export const TURN_DURATION_MS = 30_000;

export type TurnDeadlineDueStatus =
  | 'NOT_DUE'
  | 'DUE'
  | 'NOT_APPLICABLE'
  | 'INVALID_STATE';

export interface TurnDeadlineDueResult {
  status: TurnDeadlineDueStatus;
}

export function armActiveTurnDeadline(
  roomState: RoomAuthorityState<MatchState>,
  authoritativeNowMs: number
): RoomAuthorityState<MatchState> {
  // Validate server time input
  if (
    typeof authoritativeNowMs !== 'number' ||
    !Number.isSafeInteger(authoritativeNowMs) ||
    authoritativeNowMs < 0 ||
    authoritativeNowMs + TURN_DURATION_MS > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`Invalid authoritativeNowMs: ${authoritativeNowMs}`);
  }

  // Preconditions for arming
  if (roomState.lifecycle !== 'MATCH_ACTIVE') {
    throw new Error(`Cannot arm deadline for room lifecycle '${roomState.lifecycle}'`);
  }

  if (roomState.match === null || roomState.match === undefined) {
    throw new Error('Cannot arm deadline: room match state is null or undefined');
  }

  if (roomState.match.status !== 'IN_PROGRESS' || roomState.match.winnerId !== null) {
    throw new Error('Cannot arm deadline: Core Match is not active/IN_PROGRESS');
  }

  if (
    typeof roomState.currentTurnId !== 'string' ||
    roomState.currentTurnId.trim() === ''
  ) {
    throw new Error('Cannot arm deadline: currentTurnId must be a non-empty string');
  }

  if (roomState.currentTurnDeadline !== null) {
    throw new Error(
      `Cannot arm deadline: currentTurnDeadline is already set (${roomState.currentTurnDeadline})`
    );
  }

  if (roomState.activeAlarm !== null) {
    throw new Error(
      `Cannot arm deadline: activeAlarm is already set (${roomState.activeAlarm.kind})`
    );
  }

  if (
    typeof roomState.revision !== 'number' ||
    !Number.isSafeInteger(roomState.revision) ||
    roomState.revision < 0
  ) {
    throw new Error(`Cannot arm deadline: invalid room revision (${roomState.revision})`);
  }

  const dueAt = authoritativeNowMs + TURN_DURATION_MS;

  // Return fresh RoomAuthorityState preserving exact same revision and state
  return {
    roomId: roomState.roomId,
    lifecycle: 'MATCH_ACTIVE',
    revision: roomState.revision,
    members: roomState.members,
    hostPlayerId: roomState.hostPlayerId,
    match: roomState.match,
    currentTurnId: roomState.currentTurnId,
    currentTurnDeadline: dueAt,
    activeAlarm: {
      kind: 'TURN_DEADLINE',
      dueAt,
      generation: roomState.revision,
    },
  };
}

export function evaluateTurnDeadlineDueState(
  roomState: RoomAuthorityState<MatchState>,
  authoritativeNowMs: number
): TurnDeadlineDueResult {
  // Validate server time input
  if (
    typeof authoritativeNowMs !== 'number' ||
    !Number.isSafeInteger(authoritativeNowMs) ||
    authoritativeNowMs < 0
  ) {
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

  // Validate active turn coherence
  if (
    roomState.match === null ||
    roomState.match === undefined ||
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

  if (
    typeof roomState.revision !== 'number' ||
    !Number.isSafeInteger(roomState.revision) ||
    roomState.revision < 0
  ) {
    return { status: 'INVALID_STATE' };
  }

  // Coherent active deadline evaluation
  if (authoritativeNowMs < roomState.currentTurnDeadline) {
    return { status: 'NOT_DUE' };
  }

  return { status: 'DUE' };
}
