import type { CardRank, LifeStatus, MatchState, MatchStatus, PlayerState, TableRank } from '@liars-telegram-game/game-core';
import type { RoomAuthorityState, RoomLifecycle } from './room-state.js';

export interface ServerResolvedRecipient {
  playerId: string;
}

export interface PrivateCardProjection {
  id: string;
  rank: CardRank;
}

export interface PrivateRecipientState {
  playerId: string;
  hand: PrivateCardProjection[];
}

export interface PublicPlayerProjection {
  playerId: string;
  lifeStatus: LifeStatus;
  handCount: number;
  shotsUsed: number;
}

export interface PublicPreviousPlayProjection {
  playerId: string;
  count: number;
  claimedRank: TableRank;
}

export interface PublicRoundProjection {
  roundNumber: number;
  tableRank: TableRank;
  currentPlayerId: string;
  previousPlay: PublicPreviousPlayProjection | null;
}

export interface PublicMatchProjection {
  status: MatchStatus;
  seatOrder: string[];
  players: PublicPlayerProjection[];
  round: PublicRoundProjection;
  winnerId: string | null;
}

export interface PublicRoomProjection {
  roomId: string;
  lifecycle: RoomLifecycle;
  revision: number;
  memberPlayerIds: string[];
  hostPlayerId: string;
  currentTurnId: string | null;
  currentTurnDeadline: number | null;
  match: PublicMatchProjection | null;
}

export interface RecipientRoomProjection {
  publicState: PublicRoomProjection;
  privateState: PrivateRecipientState | null;
}

export type RecipientRoomProjectionRejectReason =
  | 'INVALID_RECIPIENT_CONTEXT'
  | 'RECIPIENT_NOT_MEMBER'
  | 'INVALID_ROOM_STATE'
  | 'MATCH_STATE_MISSING'
  | 'RECIPIENT_NOT_MATCH_PLAYER';

export type RecipientRoomProjectionResult =
  | {
      decision: 'PROJECTED';
      projection: RecipientRoomProjection;
    }
  | {
      decision: 'REJECT';
      reason: RecipientRoomProjectionRejectReason;
    };

const VALID_LIFECYCLES = new Set<RoomLifecycle>([
  'LOBBY',
  'MATCH_ACTIVE',
  'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
  'MATCH_FINISHED',
  'ABANDONED',
]);

const VALID_TABLE_RANKS = new Set<TableRank>(['KING', 'QUEEN', 'ACE']);

function getOwnPlayer(players: Record<string, PlayerState>, playerId: string): PlayerState | null {
  if (!players || typeof players !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(players, playerId)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(players, playerId);
  if (descriptor && 'value' in descriptor) {
    return descriptor.value as PlayerState;
  }
  return (players as Record<string, PlayerState>)[playerId] ?? null;
}

/**
 * Pure provider-independent recipient-specific projection boundary.
 * Derives explicit whitelist DTOs for public room/match snapshot and private recipient state.
 */
export function deriveRecipientRoomProjection(
  roomState: RoomAuthorityState<MatchState>,
  recipient: ServerResolvedRecipient
): RecipientRoomProjectionResult {
  // 1. Recipient context validation
  if (!recipient || typeof recipient !== 'object') {
    return { decision: 'REJECT', reason: 'INVALID_RECIPIENT_CONTEXT' };
  }
  if (typeof recipient.playerId !== 'string' || recipient.playerId.trim().length === 0) {
    return { decision: 'REJECT', reason: 'INVALID_RECIPIENT_CONTEXT' };
  }

  // 2. Room authority state structure validation
  if (!roomState || typeof roomState !== 'object') {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (typeof roomState.roomId !== 'string' || roomState.roomId.trim().length === 0) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!VALID_LIFECYCLES.has(roomState.lifecycle)) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!Number.isSafeInteger(roomState.revision) || roomState.revision < 0) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!Array.isArray(roomState.members)) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (typeof roomState.hostPlayerId !== 'string' || roomState.hostPlayerId.trim().length === 0) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (roomState.currentTurnId !== null && typeof roomState.currentTurnId !== 'string') {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (roomState.currentTurnDeadline !== null && (!Number.isSafeInteger(roomState.currentTurnDeadline) || roomState.currentTurnDeadline < 0)) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }

  // Validate member uniqueness and non-empty IDs (prototype-safe)
  const memberIdSet = new Set<string>();
  const memberPlayerIds: string[] = [];
  let recipientIsMember = false;

  for (let i = 0; i < roomState.members.length; i++) {
    const member = roomState.members[i];
    if (!member || typeof member !== 'object') {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    const pid = member.playerId;
    if (typeof pid !== 'string' || pid.length === 0) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (memberIdSet.has(pid)) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' }; // duplicate member ID
    }
    memberIdSet.add(pid);
    memberPlayerIds.push(pid);

    if (pid === recipient.playerId) {
      recipientIsMember = true;
    }
  }

  if (!recipientIsMember) {
    return { decision: 'REJECT', reason: 'RECIPIENT_NOT_MEMBER' };
  }

  const lifecycle = roomState.lifecycle;
  const match = roomState.match;

  // 3. Lifecycle-specific Match validation
  if (lifecycle === 'LOBBY') {
    if (match !== null) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }

    const publicState: PublicRoomProjection = {
      roomId: roomState.roomId,
      lifecycle: 'LOBBY',
      revision: roomState.revision,
      memberPlayerIds,
      hostPlayerId: roomState.hostPlayerId,
      currentTurnId: roomState.currentTurnId,
      currentTurnDeadline: roomState.currentTurnDeadline,
      match: null,
    };

    return {
      decision: 'PROJECTED',
      projection: {
        publicState,
        privateState: null,
      },
    };
  }

  if (lifecycle === 'MATCH_ACTIVE' || lifecycle === 'MATCH_PAUSED_NO_LIVING_CONNECTIONS') {
    if (match === null) {
      return { decision: 'REJECT', reason: 'MATCH_STATE_MISSING' };
    }
    if (match.status !== 'IN_PROGRESS' || match.winnerId !== null) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
  } else if (lifecycle === 'MATCH_FINISHED') {
    if (match === null) {
      return { decision: 'REJECT', reason: 'MATCH_STATE_MISSING' };
    }
    if (match.status !== 'FINISHED' || typeof match.winnerId !== 'string' || match.winnerId.length === 0) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
  } else if (lifecycle === 'ABANDONED') {
    if (match === null) {
      const publicState: PublicRoomProjection = {
        roomId: roomState.roomId,
        lifecycle: 'ABANDONED',
        revision: roomState.revision,
        memberPlayerIds,
        hostPlayerId: roomState.hostPlayerId,
        currentTurnId: roomState.currentTurnId,
        currentTurnDeadline: roomState.currentTurnDeadline,
        match: null,
      };
      return {
        decision: 'PROJECTED',
        projection: {
          publicState,
          privateState: null,
        },
      };
    }
  }

  // 4. Non-null Match structure and coherence validation
  if (!match || typeof match !== 'object') {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!Array.isArray(match.seatOrder) || match.seatOrder.length < 2 || match.seatOrder.length > 4) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!match.players || typeof match.players !== 'object') {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }

  // SeatOrder uniqueness & non-empty
  const seatIdSet = new Set<string>();
  const seatOrder: string[] = [];
  for (let i = 0; i < match.seatOrder.length; i++) {
    const sId = match.seatOrder[i];
    if (typeof sId !== 'string' || sId.length === 0) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (seatIdSet.has(sId)) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    seatIdSet.add(sId);
    seatOrder.push(sId);
  }

  // Coherence: Room members vs Match seats
  if (memberIdSet.size !== seatIdSet.size) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  for (const sId of seatIdSet) {
    if (!memberIdSet.has(sId)) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
  }

  // Check recipient exists in match.players using own-property check
  if (!Object.prototype.hasOwnProperty.call(match.players, recipient.playerId)) {
    return { decision: 'REJECT', reason: 'RECIPIENT_NOT_MATCH_PLAYER' };
  }

  // Validate Round structure
  const round = match.round;
  if (!round || typeof round !== 'object') {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!Number.isSafeInteger(round.roundNumber) || round.roundNumber < 1) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (!VALID_TABLE_RANKS.has(round.tableRank)) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }
  if (typeof round.currentPlayerId !== 'string' || round.currentPlayerId.length === 0) {
    return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
  }

  let publicPreviousPlay: PublicPreviousPlayProjection | null = null;
  if (round.previousPlay !== null) {
    if (typeof round.previousPlay !== 'object') {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    const prev = round.previousPlay;
    if (typeof prev.playerId !== 'string' || prev.playerId.length === 0) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (!Number.isSafeInteger(prev.count) || prev.count < 1 || prev.count > 3) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (!VALID_TABLE_RANKS.has(prev.claimedRank)) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    publicPreviousPlay = {
      playerId: prev.playerId,
      count: prev.count,
      claimedRank: prev.claimedRank,
    };
  }

  const publicRound: PublicRoundProjection = {
    roundNumber: round.roundNumber,
    tableRank: round.tableRank,
    currentPlayerId: round.currentPlayerId,
    previousPlay: publicPreviousPlay,
  };

  // Validate each player in seatOrder and construct public player projections
  const publicPlayers: PublicPlayerProjection[] = [];
  for (let i = 0; i < seatOrder.length; i++) {
    const sId = seatOrder[i];
    const player = getOwnPlayer(match.players, sId);
    if (!player || typeof player !== 'object') {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (player.id !== sId) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (player.lifeStatus !== 'ALIVE' && player.lifeStatus !== 'ELIMINATED') {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (!Array.isArray(player.hand)) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }
    if (!player.revolver || typeof player.revolver !== 'object' || !Number.isSafeInteger(player.revolver.nextShotIndex) || player.revolver.nextShotIndex < 0 || player.revolver.nextShotIndex > 6) {
      return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
    }

    publicPlayers.push({
      playerId: player.id,
      lifeStatus: player.lifeStatus,
      handCount: player.hand.length,
      shotsUsed: player.revolver.nextShotIndex,
    });
  }

  const publicMatch: PublicMatchProjection = {
    status: match.status,
    seatOrder,
    players: publicPlayers,
    round: publicRound,
    winnerId: match.winnerId,
  };

  const publicState: PublicRoomProjection = {
    roomId: roomState.roomId,
    lifecycle: roomState.lifecycle,
    revision: roomState.revision,
    memberPlayerIds,
    hostPlayerId: roomState.hostPlayerId,
    currentTurnId: roomState.currentTurnId,
    currentTurnDeadline: roomState.currentTurnDeadline,
    match: publicMatch,
  };

  // 5. Derive private state for recipient
  const recipientPlayer = getOwnPlayer(match.players, recipient.playerId);
  if (!recipientPlayer || typeof recipientPlayer !== 'object') {
    return { decision: 'REJECT', reason: 'RECIPIENT_NOT_MATCH_PLAYER' };
  }

  let privateState: PrivateRecipientState | null = null;
  if (recipientPlayer.lifeStatus === 'ALIVE') {
    const clonedHand: PrivateCardProjection[] = [];
    for (let i = 0; i < recipientPlayer.hand.length; i++) {
      const card = recipientPlayer.hand[i];
      if (!card || typeof card !== 'object' || typeof card.id !== 'string' || typeof card.rank !== 'string') {
        return { decision: 'REJECT', reason: 'INVALID_ROOM_STATE' };
      }
      clonedHand.push({
        id: card.id,
        rank: card.rank,
      });
    }
    privateState = {
      playerId: recipient.playerId,
      hand: clonedHand,
    };
  } else {
    // ELIMINATED recipient -> public state only, privateState MUST be null
    privateState = null;
  }

  return {
    decision: 'PROJECTED',
    projection: {
      publicState,
      privateState,
    },
  };
}
