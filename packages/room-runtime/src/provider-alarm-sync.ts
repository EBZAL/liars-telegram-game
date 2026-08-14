import type { MatchState } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from './room-state.js';
import { evaluateTurnDeadlineDueState } from './turn-deadline.js';

export type ProviderAlarmSyncDecision =
  | 'NO_CHANGE'
  | 'SET_ALARM'
  | 'DELETE_ALARM'
  | 'INVALID_STATE';

export type ProviderAlarmSyncInvalidReason =
  | 'INVALID_PROVIDER_OBSERVATION'
  | 'INVALID_ROOM_STATE'
  | 'INVALID_ACTIVE_DEADLINE_STATE'
  | 'INVALID_PAUSED_ALARM_STATE'
  | 'INVALID_LOBBY_ALARM_STATE'
  | 'INVALID_FINISHED_ALARM_STATE'
  | 'INVALID_ABANDONED_ALARM_STATE'
  | 'INVALID_NON_TURN_ALARM';

export interface ProviderAlarmSyncNoChangePlan {
  readonly decision: 'NO_CHANGE';
}

export interface ProviderAlarmSyncSetAlarmPlan {
  readonly decision: 'SET_ALARM';
  readonly dueAt: number;
}

export interface ProviderAlarmSyncDeleteAlarmPlan {
  readonly decision: 'DELETE_ALARM';
}

export interface ProviderAlarmSyncInvalidStatePlan {
  readonly decision: 'INVALID_STATE';
  readonly reason: ProviderAlarmSyncInvalidReason;
}

export type ProviderAlarmSyncPlan =
  | ProviderAlarmSyncNoChangePlan
  | ProviderAlarmSyncSetAlarmPlan
  | ProviderAlarmSyncDeleteAlarmPlan
  | ProviderAlarmSyncInvalidStatePlan;

/**
 * Derives the single provider-independent synchronization intent between the
 * FINAL authoritative Room state and the currently observed provider alarm timestamp.
 *
 * Direction of authority is always:
 * FINAL composed Room state -> provider synchronization intent.
 *
 * This function performs zero mutations on Room state, creates zero Room revisions,
 * calls no provider APIs, and takes no local time input.
 */
export function deriveProviderAlarmSyncPlan<TMatchSnapshot = MatchState>(
  finalRoomState: RoomAuthorityState<TMatchSnapshot>,
  observedProviderAlarmDueAt: number | null
): ProviderAlarmSyncPlan {
  // Validate observed provider alarm metadata
  if (
    observedProviderAlarmDueAt !== null &&
    (typeof observedProviderAlarmDueAt !== 'number' ||
      !Number.isSafeInteger(observedProviderAlarmDueAt) ||
      observedProviderAlarmDueAt < 0)
  ) {
    return {
      decision: 'INVALID_STATE',
      reason: 'INVALID_PROVIDER_OBSERVATION',
    };
  }

  // Validate Room state structure and revision
  if (
    typeof finalRoomState !== 'object' ||
    finalRoomState === null ||
    typeof finalRoomState.roomId !== 'string' ||
    finalRoomState.roomId.trim().length === 0 ||
    typeof finalRoomState.revision !== 'number' ||
    !Number.isSafeInteger(finalRoomState.revision) ||
    finalRoomState.revision < 0
  ) {
    return {
      decision: 'INVALID_STATE',
      reason: 'INVALID_ROOM_STATE',
    };
  }

  let desiredDueAt: number | null = null;

  switch (finalRoomState.lifecycle) {
    case 'MATCH_ACTIVE': {
      // Delegate active timing validation to verified T-021 foundation.
      // The 0 input is a deterministic validation sentinel.
      const activeDueResult = evaluateTurnDeadlineDueState(
        finalRoomState as unknown as RoomAuthorityState<MatchState>,
        0
      );

      if (activeDueResult.status !== 'NOT_DUE' && activeDueResult.status !== 'DUE') {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_ACTIVE_DEADLINE_STATE',
        };
      }

      desiredDueAt = finalRoomState.activeAlarm!.dueAt;
      break;
    }

    case 'MATCH_PAUSED_NO_LIVING_CONNECTIONS': {
      // Paused state requires no active deadline or alarm
      if (
        finalRoomState.currentTurnDeadline !== null ||
        finalRoomState.activeAlarm !== null
      ) {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_PAUSED_ALARM_STATE',
        };
      }

      desiredDueAt = null;
      break;
    }

    case 'LOBBY': {
      if (finalRoomState.currentTurnDeadline !== null) {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_LOBBY_ALARM_STATE',
        };
      }

      if (finalRoomState.activeAlarm === null) {
        desiredDueAt = null;
      } else if (finalRoomState.activeAlarm.kind === 'HOST_GRACE') {
        const alarm = finalRoomState.activeAlarm;
        if (
          typeof alarm.dueAt !== 'number' ||
          !Number.isSafeInteger(alarm.dueAt) ||
          alarm.dueAt < 0 ||
          typeof alarm.generation !== 'number' ||
          !Number.isSafeInteger(alarm.generation) ||
          alarm.generation < 0
        ) {
          return {
            decision: 'INVALID_STATE',
            reason: 'INVALID_NON_TURN_ALARM',
          };
        }
        desiredDueAt = alarm.dueAt;
      } else {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_LOBBY_ALARM_STATE',
        };
      }
      break;
    }

    case 'MATCH_FINISHED': {
      if (finalRoomState.currentTurnDeadline !== null) {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_FINISHED_ALARM_STATE',
        };
      }

      if (finalRoomState.activeAlarm === null) {
        desiredDueAt = null;
      } else if (finalRoomState.activeAlarm.kind === 'ROOM_RETENTION') {
        const alarm = finalRoomState.activeAlarm;
        if (
          typeof alarm.dueAt !== 'number' ||
          !Number.isSafeInteger(alarm.dueAt) ||
          alarm.dueAt < 0 ||
          typeof alarm.generation !== 'number' ||
          !Number.isSafeInteger(alarm.generation) ||
          alarm.generation < 0
        ) {
          return {
            decision: 'INVALID_STATE',
            reason: 'INVALID_NON_TURN_ALARM',
          };
        }
        desiredDueAt = alarm.dueAt;
      } else {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_FINISHED_ALARM_STATE',
        };
      }
      break;
    }

    case 'ABANDONED': {
      if (finalRoomState.currentTurnDeadline !== null) {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_ABANDONED_ALARM_STATE',
        };
      }

      if (finalRoomState.activeAlarm === null) {
        desiredDueAt = null;
      } else if (finalRoomState.activeAlarm.kind === 'ROOM_RETENTION') {
        const alarm = finalRoomState.activeAlarm;
        if (
          typeof alarm.dueAt !== 'number' ||
          !Number.isSafeInteger(alarm.dueAt) ||
          alarm.dueAt < 0 ||
          typeof alarm.generation !== 'number' ||
          !Number.isSafeInteger(alarm.generation) ||
          alarm.generation < 0
        ) {
          return {
            decision: 'INVALID_STATE',
            reason: 'INVALID_NON_TURN_ALARM',
          };
        }
        desiredDueAt = alarm.dueAt;
      } else {
        return {
          decision: 'INVALID_STATE',
          reason: 'INVALID_ABANDONED_ALARM_STATE',
        };
      }
      break;
    }

    default: {
      return {
        decision: 'INVALID_STATE',
        reason: 'INVALID_ROOM_STATE',
      };
    }
  }

  // Generic decision table
  if (desiredDueAt === null) {
    if (observedProviderAlarmDueAt === null) {
      return { decision: 'NO_CHANGE' };
    }
    return { decision: 'DELETE_ALARM' };
  }

  if (observedProviderAlarmDueAt === null) {
    return { decision: 'SET_ALARM', dueAt: desiredDueAt };
  }

  if (observedProviderAlarmDueAt === desiredDueAt) {
    return { decision: 'NO_CHANGE' };
  }

  return { decision: 'SET_ALARM', dueAt: desiredDueAt };
}
