import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';
import { initializeMatch } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState, RoomMember } from './room-state.js';
import { nextRoomRevision } from './gameplay-admission.js';
import { armActiveTurnDeadline } from './turn-deadline.js';
import type { RoomPresenceRegistry } from './presence.js';
import { evaluateRoomPresence } from './presence.js';

export const HOST_GRACE_DURATION_MS = 60_000;

function validatePlayerId(playerId: unknown): string {
  if (typeof playerId !== 'string' || playerId.trim().length === 0) {
    throw new Error('Invalid playerId: must be a non-empty string');
  }
  return playerId.trim();
}

/**
 * Adds a new player to the room in LOBBY lifecycle.
 * - Rejects if not in LOBBY.
 * - Rejects if capacity (4 members) is exceeded.
 * - Idempotent if player is already a member (returns existing roomState without revision bump).
 * - Assigns earliest joiner as hostPlayerId if host is null.
 * - Assigns monotonic joinOrder.
 * - Increments revision by 1 on new member join.
 */
export function joinLobbyRoom<TMatchSnapshot = unknown>(
  roomState: RoomAuthorityState<TMatchSnapshot>,
  playerIdInput: string
): RoomAuthorityState<TMatchSnapshot> {
  if (typeof roomState !== 'object' || roomState === null || !Array.isArray(roomState.members)) {
    throw new Error('Invalid roomState: must be a valid room state object');
  }

  const playerId = validatePlayerId(playerIdInput);

  if (roomState.lifecycle !== 'LOBBY') {
    throw new Error(`Cannot join room: room lifecycle is '${roomState.lifecycle}' (expected 'LOBBY')`);
  }

  // Idempotency: if already a member, return unchanged state
  const isAlreadyMember = roomState.members.some((m) => m.playerId === playerId);
  if (isAlreadyMember) {
    return roomState;
  }

  // Capacity enforcement (max 4 players)
  if (roomState.members.length >= 4) {
    throw new Error('Cannot join room: room is full (maximum 4 players)');
  }

  const maxJoinOrder = roomState.members.length === 0
    ? 0
    : Math.max(...roomState.members.map((m) => m.joinOrder));
  const newMember: RoomMember = {
    playerId,
    joinOrder: maxJoinOrder + 1,
  };

  const nextMembers = Object.freeze([...roomState.members, newMember]);
  const nextHostPlayerId = roomState.hostPlayerId === null ? playerId : roomState.hostPlayerId;
  const nextRevision = nextRoomRevision(roomState.revision);

  return {
    ...roomState,
    revision: nextRevision,
    members: nextMembers as RoomMember[],
    hostPlayerId: nextHostPlayerId,
  };
}

/**
 * Removes a player from the room in LOBBY lifecycle.
 * - Rejects if not in LOBBY.
 * - Rejects if player is not a member.
 * - If host leaves, migrates host to earliest joined remaining member (minimum joinOrder).
 * - If last member leaves, hostPlayerId becomes null.
 * - If departing player was host, clears any active HOST_GRACE alarm.
 * - Increments revision by 1.
 */
export function leaveLobbyRoom<TMatchSnapshot = unknown>(
  roomState: RoomAuthorityState<TMatchSnapshot>,
  playerIdInput: string
): RoomAuthorityState<TMatchSnapshot> {
  if (typeof roomState !== 'object' || roomState === null || !Array.isArray(roomState.members)) {
    throw new Error('Invalid roomState: must be a valid room state object');
  }

  const playerId = validatePlayerId(playerIdInput);

  if (roomState.lifecycle !== 'LOBBY') {
    throw new Error(`Cannot leave room: room lifecycle is '${roomState.lifecycle}' (expected 'LOBBY')`);
  }

  const memberIndex = roomState.members.findIndex((m) => m.playerId === playerId);
  if (memberIndex === -1) {
    throw new Error(`Cannot leave room: player '${playerId}' is not a member`);
  }

  const nextMembers = Object.freeze(roomState.members.filter((m) => m.playerId !== playerId));
  let nextHostPlayerId = roomState.hostPlayerId;
  let nextActiveAlarm = roomState.activeAlarm;

  if (roomState.hostPlayerId === playerId) {
    // Clear pending HOST_GRACE alarm if active
    if (nextActiveAlarm?.kind === 'HOST_GRACE') {
      nextActiveAlarm = null;
    }

    if (nextMembers.length === 0) {
      nextHostPlayerId = null;
    } else {
      // Migrate to earliest joined remaining member
      const sortedRemaining = [...nextMembers].sort((a, b) => a.joinOrder - b.joinOrder);
      nextHostPlayerId = sortedRemaining[0].playerId;
    }
  }

  const nextRevision = nextRoomRevision(roomState.revision);

  return {
    ...roomState,
    revision: nextRevision,
    members: nextMembers as RoomMember[],
    hostPlayerId: nextHostPlayerId,
    activeAlarm: nextActiveAlarm,
  };
}

/**
 * Handles presence changes in LOBBY regarding the host:
 * - If host is null and connected members exist, recomputes host to earliest joined connected member.
 * - If host disconnects (no active connections), arms a 60s HOST_GRACE alarm.
 * - If host reconnects before grace expires, clears the HOST_GRACE alarm.
 * - Non-host disconnect/reconnect does not alter HOST_GRACE.
 * - Same-revision timing completion (does not increment revision on alarm arm/clear).
 */
export function handleLobbyHostPresenceChange<TMatchSnapshot = unknown>(
  roomState: RoomAuthorityState<TMatchSnapshot>,
  presenceRegistry: RoomPresenceRegistry,
  authoritativeNowMs: number
): RoomAuthorityState<TMatchSnapshot> {
  if (typeof roomState !== 'object' || roomState === null) {
    throw new Error('Invalid roomState: must be a valid room state object');
  }

  if (roomState.lifecycle !== 'LOBBY') {
    return roomState;
  }

  if (
    typeof authoritativeNowMs !== 'number' ||
    !Number.isSafeInteger(authoritativeNowMs) ||
    authoritativeNowMs < 0 ||
    authoritativeNowMs + HOST_GRACE_DURATION_MS > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`Invalid authoritativeNowMs: ${authoritativeNowMs}`);
  }

  const presence = evaluateRoomPresence(roomState, presenceRegistry);

  // Case 1: host is unset (e.g. previous grace timeout had 0 connected members), recompute on reconnect
  if (roomState.hostPlayerId === null) {
    if (presence.connectedMemberPlayerIds.length > 0) {
      const connectedMembers = roomState.members.filter((m) =>
        presence.connectedMemberPlayerIds.includes(m.playerId)
      );
      connectedMembers.sort((a, b) => a.joinOrder - b.joinOrder);
      const newHost = connectedMembers[0];
      return {
        ...roomState,
        revision: nextRoomRevision(roomState.revision),
        hostPlayerId: newHost.playerId,
        activeAlarm: null,
      };
    }
    return roomState;
  }

  const isHostConnected = presence.connectedMemberPlayerIds.includes(roomState.hostPlayerId);

  // Case 2: host is disconnected
  if (!isHostConnected) {
    if (roomState.activeAlarm?.kind === 'HOST_GRACE') {
      // Already armed, keep existing dueAt and generation
      return roomState;
    }

    return {
      ...roomState,
      activeAlarm: {
        kind: 'HOST_GRACE',
        dueAt: authoritativeNowMs + HOST_GRACE_DURATION_MS,
        generation: roomState.revision,
      },
    };
  }

  // Case 3: host is connected
  if (roomState.activeAlarm?.kind === 'HOST_GRACE') {
    // Reconnected: cancel HOST_GRACE
    return {
      ...roomState,
      activeAlarm: null,
    };
  }

  return roomState;
}

/**
 * Authoritative alarm handler for HOST_GRACE expiration in LOBBY.
 * - Verifies alarm kind is HOST_GRACE and generation matches room revision.
 * - Verifies alarm is due.
 * - Migrates host to earliest joined connected member per presence registry.
 * - If no connected members exist, hostPlayerId becomes null until an eligible member reconnects.
 * - Clears activeAlarm and increments revision by 1.
 */
export function applyHostGraceTimeout<TMatchSnapshot = unknown>(
  roomState: RoomAuthorityState<TMatchSnapshot>,
  presenceRegistry: RoomPresenceRegistry,
  authoritativeNowMs: number
): RoomAuthorityState<TMatchSnapshot> {
  if (typeof roomState !== 'object' || roomState === null) {
    throw new Error('Invalid roomState: must be a valid room state object');
  }

  if (roomState.lifecycle !== 'LOBBY') {
    throw new Error(`Cannot apply host grace timeout: room is in '${roomState.lifecycle}' lifecycle`);
  }

  if (roomState.activeAlarm === null || roomState.activeAlarm.kind !== 'HOST_GRACE') {
    throw new Error('Cannot apply host grace timeout: activeAlarm is not HOST_GRACE');
  }

  if (roomState.activeAlarm.generation !== roomState.revision) {
    throw new Error(
      `Stale host grace alarm: generation ${roomState.activeAlarm.generation} does not match room revision ${roomState.revision}`
    );
  }

  if (
    typeof authoritativeNowMs !== 'number' ||
    !Number.isSafeInteger(authoritativeNowMs) ||
    authoritativeNowMs < roomState.activeAlarm.dueAt
  ) {
    throw new Error(
      `Host grace alarm is not yet due: now ${authoritativeNowMs} < dueAt ${roomState.activeAlarm.dueAt}`
    );
  }

  const presence = evaluateRoomPresence(roomState, presenceRegistry);

  // Find all connected members ordered by joinOrder
  const connectedMembers = roomState.members.filter((m) =>
    presence.connectedMemberPlayerIds.includes(m.playerId)
  );
  connectedMembers.sort((a, b) => a.joinOrder - b.joinOrder);

  const nextHostPlayerId = connectedMembers.length > 0 ? connectedMembers[0].playerId : null;
  const nextRevision = nextRoomRevision(roomState.revision);

  return {
    ...roomState,
    revision: nextRevision,
    hostPlayerId: nextHostPlayerId,
    activeAlarm: null,
  };
}

/**
 * Transitions room from LOBBY to MATCH_ACTIVE by starting a new match.
 * - Caller must be the hostPlayerId.
 * - Lifecycle must be LOBBY.
 * - Player count must be between 2 and 4.
 * - Calls game-core initializeMatch.
 * - Arms initial 30s TURN_DEADLINE.
 * - Increments revision by 1.
 */
export function startMatchFromLobby(
  roomState: RoomAuthorityState<unknown>,
  actorPlayerIdInput: string,
  random: RandomSource,
  authoritativeNowMs: number,
  initialTurnId?: string
): RoomAuthorityState<MatchState> {
  if (typeof roomState !== 'object' || roomState === null || !Array.isArray(roomState.members)) {
    throw new Error('Invalid roomState: must be a valid room state object');
  }

  const actorPlayerId = validatePlayerId(actorPlayerIdInput);

  if (roomState.lifecycle !== 'LOBBY') {
    throw new Error(`Cannot start match: room lifecycle is '${roomState.lifecycle}' (expected 'LOBBY')`);
  }

  if (roomState.hostPlayerId !== actorPlayerId) {
    throw new Error(`Cannot start match: player '${actorPlayerId}' is not the room host`);
  }

  if (roomState.members.length < 2 || roomState.members.length > 4) {
    throw new Error(
      `Cannot start match: player count must be between 2 and 4 (found ${roomState.members.length})`
    );
  }

  const playerIds = roomState.members.map((m) => m.playerId);
  const match = initializeMatch(playerIds, random);

  const turnId = typeof initialTurnId === 'string' && initialTurnId.trim() !== ''
    ? initialTurnId.trim()
    : 'turn-1';

  const nextRevision = nextRoomRevision(roomState.revision);

  const unArmedRoom: RoomAuthorityState<MatchState> = {
    roomId: roomState.roomId,
    lifecycle: 'MATCH_ACTIVE',
    revision: nextRevision,
    members: roomState.members,
    hostPlayerId: roomState.hostPlayerId,
    match,
    currentTurnId: turnId,
    currentTurnDeadline: null,
    activeAlarm: null,
  };

  return armActiveTurnDeadline(unArmedRoom, authoritativeNowMs);
}
