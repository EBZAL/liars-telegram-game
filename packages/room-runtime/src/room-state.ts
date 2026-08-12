export type RoomLifecycle =
  | 'LOBBY'
  | 'MATCH_ACTIVE'
  | 'MATCH_PAUSED_NO_LIVING_CONNECTIONS'
  | 'MATCH_FINISHED'
  | 'ABANDONED';

export type RoomAlarmKind =
  | 'TURN_DEADLINE'
  | 'HOST_GRACE'
  | 'ROOM_RETENTION';

export interface ActiveRoomAlarm {
  kind: RoomAlarmKind;
  dueAt: number;
  generation: number;
}

export interface RoomMember {
  playerId: string;
  joinOrder: number;
}

export interface RoomAuthorityState<TMatchSnapshot = unknown> {
  roomId: string;
  lifecycle: RoomLifecycle;
  revision: number;
  members: RoomMember[];
  hostPlayerId: string | null;
  match: TMatchSnapshot | null;
  currentTurnId: string | null;
  currentTurnDeadline: number | null;
  activeAlarm: ActiveRoomAlarm | null;
}

export const FORBIDDEN_LOCAL_SELECTION_KEYS = [
  'selectedCards',
  'selectedCardIds',
  'selectedButUnconfirmedCards',
  'highlightedCards',
  'highlightedCardIds',
  'draftSelection',
  'pendingSelection',
  'localSelection',
] as const;

export type ForbiddenLocalSelectionKey = (typeof FORBIDDEN_LOCAL_SELECTION_KEYS)[number];

export function createInitialRoomState<TMatchSnapshot = unknown>(
  roomId: string
): RoomAuthorityState<TMatchSnapshot> {
  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    throw new Error('Invalid Room ID: must be a non-empty string');
  }

  return {
    roomId: roomId.trim(),
    lifecycle: 'LOBBY',
    revision: 0,
    members: [],
    hostPlayerId: null,
    match: null,
    currentTurnId: null,
    currentTurnDeadline: null,
    activeAlarm: null,
  };
}
