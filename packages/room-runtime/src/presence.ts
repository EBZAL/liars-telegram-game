import type { MatchState } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState } from './room-state.js';

export interface ServerAuthenticatedRoomConnection {
  connectionId: string;
  playerId: string;
}

export interface RoomPresenceRegistry {
  /** Map from connectionId to playerId */
  readonly connectionToPlayer: Readonly<Record<string, string>>;
  /** Map from playerId to array of connectionIds */
  readonly playerToConnections: Readonly<Record<string, readonly string[]>>;
}

export interface RoomPresenceSummary {
  readonly connectedMemberPlayerIds: readonly string[];
  readonly connectedLivingPlayerIds: readonly string[];
  readonly connectedLivingPlayers: number;
}

export function createRoomPresenceRegistry(): RoomPresenceRegistry {
  return {
    connectionToPlayer: Object.create(null),
    playerToConnections: Object.create(null),
  };
}

function validateConnectionInput(
  connection: ServerAuthenticatedRoomConnection
): { connectionId: string; playerId: string } {
  if (typeof connection !== 'object' || connection === null) {
    throw new Error('Invalid connection: connection must be a non-null object');
  }

  if (typeof connection.connectionId !== 'string' || connection.connectionId.trim() === '') {
    throw new Error('Invalid connectionId: must be a non-empty string');
  }

  if (typeof connection.playerId !== 'string' || connection.playerId.trim() === '') {
    throw new Error('Invalid playerId: must be a non-empty string');
  }

  return {
    connectionId: connection.connectionId.trim(),
    playerId: connection.playerId.trim(),
  };
}

export function registerAuthenticatedRoomConnection<TMatchSnapshot = MatchState>(
  roomState: RoomAuthorityState<TMatchSnapshot>,
  presenceRegistry: RoomPresenceRegistry,
  connection: ServerAuthenticatedRoomConnection
): RoomPresenceRegistry {
  const { connectionId, playerId } = validateConnectionInput(connection);

  if (typeof roomState !== 'object' || roomState === null || !Array.isArray(roomState.members)) {
    throw new Error('Invalid roomState: must have valid members array');
  }

  // Registration requires Room membership (fail closed for non-members)
  const isMember = roomState.members.some((m) => m.playerId === playerId);
  if (!isMember) {
    throw new Error(`Registration rejected: player ${playerId} is not a member of room ${roomState.roomId}`);
  }

  const existingPlayerId = Object.prototype.hasOwnProperty.call(
    presenceRegistry.connectionToPlayer,
    connectionId
  )
    ? presenceRegistry.connectionToPlayer[connectionId]
    : undefined;

  // Exact same playerId + connectionId registered again -> idempotent
  if (existingPlayerId === playerId) {
    return presenceRegistry;
  }

  // Cross-player connectionId collision -> fail closed
  if (existingPlayerId !== undefined) {
    throw new Error(
      `Connection conflict: connectionId ${connectionId} is already registered to player ${existingPlayerId}`
    );
  }

  // Create fresh prototype-safe immutable registry
  const nextConnectionToPlayer: Record<string, string> = Object.assign(
    Object.create(null),
    presenceRegistry.connectionToPlayer
  );
  nextConnectionToPlayer[connectionId] = playerId;

  const nextPlayerToConnections: Record<string, readonly string[]> = Object.assign(
    Object.create(null),
    presenceRegistry.playerToConnections
  );

  const existingConnections = Object.prototype.hasOwnProperty.call(
    presenceRegistry.playerToConnections,
    playerId
  )
    ? presenceRegistry.playerToConnections[playerId]
    : [];

  nextPlayerToConnections[playerId] = Object.freeze([...existingConnections, connectionId]);

  return {
    connectionToPlayer: Object.freeze(nextConnectionToPlayer),
    playerToConnections: Object.freeze(nextPlayerToConnections),
  };
}

export function unregisterAuthenticatedRoomConnection(
  presenceRegistry: RoomPresenceRegistry,
  connection: ServerAuthenticatedRoomConnection
): RoomPresenceRegistry {
  const { connectionId, playerId } = validateConnectionInput(connection);

  const existingPlayerId = Object.prototype.hasOwnProperty.call(
    presenceRegistry.connectionToPlayer,
    connectionId
  )
    ? presenceRegistry.connectionToPlayer[connectionId]
    : undefined;

  // Exact missing connection -> idempotent no-op
  if (existingPlayerId === undefined) {
    return presenceRegistry;
  }

  // Cross-player unregister conflict -> fail closed
  if (existingPlayerId !== playerId) {
    throw new Error(
      `Unregister conflict: connectionId ${connectionId} belongs to player ${existingPlayerId}, not ${playerId}`
    );
  }

  // Create fresh prototype-safe immutable registry
  const nextConnectionToPlayer: Record<string, string> = Object.assign(
    Object.create(null),
    presenceRegistry.connectionToPlayer
  );
  delete nextConnectionToPlayer[connectionId];

  const nextPlayerToConnections: Record<string, readonly string[]> = Object.assign(
    Object.create(null),
    presenceRegistry.playerToConnections
  );

  const existingConnections = Object.prototype.hasOwnProperty.call(
    presenceRegistry.playerToConnections,
    playerId
  )
    ? presenceRegistry.playerToConnections[playerId]
    : [];

  const remainingConnections = existingConnections.filter((c) => c !== connectionId);
  if (remainingConnections.length === 0) {
    delete nextPlayerToConnections[playerId];
  } else {
    nextPlayerToConnections[playerId] = Object.freeze(remainingConnections);
  }

  return {
    connectionToPlayer: Object.freeze(nextConnectionToPlayer),
    playerToConnections: Object.freeze(nextPlayerToConnections),
  };
}

export function evaluateRoomPresence(
  roomState: RoomAuthorityState<MatchState | null | unknown>,
  presenceRegistry: RoomPresenceRegistry
): RoomPresenceSummary {
  if (typeof roomState !== 'object' || roomState === null || !Array.isArray(roomState.members)) {
    throw new Error('Invalid roomState: must have valid members array');
  }

  if (
    typeof presenceRegistry !== 'object' ||
    presenceRegistry === null ||
    typeof presenceRegistry.connectionToPlayer !== 'object' ||
    typeof presenceRegistry.playerToConnections !== 'object'
  ) {
    throw new Error('Invalid presenceRegistry');
  }

  // 1. Derive connectedMemberPlayerIds in Room membership/join order
  const connectedMemberPlayerIds: string[] = [];
  for (const member of roomState.members) {
    const memberId = member.playerId;
    const hasActiveConnections =
      Object.prototype.hasOwnProperty.call(presenceRegistry.playerToConnections, memberId) &&
      presenceRegistry.playerToConnections[memberId].length > 0;

    if (hasActiveConnections && !connectedMemberPlayerIds.includes(memberId)) {
      connectedMemberPlayerIds.push(memberId);
    }
  }

  // 2. Derive connectedLivingPlayerIds if match exists
  const match = roomState.match as MatchState | null;
  const connectedLivingPlayerIds: string[] = [];

  if (match !== null && typeof match === 'object' && match.players) {
    for (const memberId of connectedMemberPlayerIds) {
      if (Object.prototype.hasOwnProperty.call(match.players, memberId)) {
        const playerState = match.players[memberId];
        if (playerState && playerState.lifeStatus === 'ALIVE') {
          connectedLivingPlayerIds.push(memberId);
        }
      }
    }
  }

  return {
    connectedMemberPlayerIds: Object.freeze(connectedMemberPlayerIds),
    connectedLivingPlayerIds: Object.freeze(connectedLivingPlayerIds),
    connectedLivingPlayers: connectedLivingPlayerIds.length,
  };
}
