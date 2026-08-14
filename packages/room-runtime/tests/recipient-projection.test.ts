import { describe, it, expect } from 'vitest';
import type { Card, CardRank, LifeStatus, MatchState, PlayerState, RevolverOutcome, RoundStatus, TableRank } from '@liars-telegram-game/game-core';

import {
  deriveRecipientRoomProjection,
  type ServerResolvedRecipient,
  type PublicRoomProjection,
  type PublicMatchProjection,
  type PublicPlayerProjection,
  type PublicRoundProjection,
  type PrivateRecipientState,
} from '../src/recipient-projection.js';
import type { RoomAuthorityState, RoomMember } from '../src/room-state.js';

function createAuthoritativeRoomFixture(
  playerIds: string[] = ['p1', 'p2', 'p3'],
  options?: {
    eliminatedPlayerId?: string;
    staleDeadHandCard?: Card;
  }
): {
  roomState: RoomAuthorityState<MatchState>;
  p1HandCards: Card[];
  p2HandCards: Card[];
  p3HandCards: Card[];
  undealtCards: Card[];
  centralPileCards: Card[];
  secretPreviousPlayCardIds: string[];
} {
  const p1HandCards: Card[] = [
    { id: 'secret-card-p1-alpha', rank: 'KING' },
    { id: 'secret-card-p1-beta', rank: 'ACE' },
    { id: 'secret-card-p1-gamma', rank: 'JOKER' },
  ];
  const p2HandCards: Card[] = [
    { id: 'secret-card-p2-delta', rank: 'QUEEN' },
    { id: 'secret-card-p2-epsilon', rank: 'KING' },
  ];
  const p3HandCards: Card[] = options?.staleDeadHandCard
    ? [options.staleDeadHandCard]
    : [];

  const undealtCards: Card[] = [
    { id: 'secret-card-undealt-1', rank: 'ACE' },
    { id: 'secret-card-undealt-2', rank: 'KING' },
  ];
  const centralPileCards: Card[] = [
    { id: 'secret-card-central-1', rank: 'QUEEN' },
    { id: 'secret-card-central-2', rank: 'JOKER' },
  ];
  const secretPreviousPlayCardIds = ['secret-play-card-x', 'secret-play-card-y'];

  const p3LifeStatus: LifeStatus = (options?.eliminatedPlayerId === 'p3' || !options?.eliminatedPlayerId) ? 'ELIMINATED' : 'ALIVE';

  const players: Record<string, PlayerState> = {
    p1: {
      id: 'p1',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [...p1HandCards],
      revolver: {
        sequence: ['BLANK', 'BLANK', 'LETHAL', 'BLANK', 'BLANK', 'BLANK'] as RevolverOutcome[],
        nextShotIndex: 1, // 1 shot used
      },
    },
    p2: {
      id: 'p2',
      lifeStatus: 'ALIVE',
      roundStatus: 'WITH_CARDS',
      hand: [...p2HandCards],
      revolver: {
        sequence: ['BLANK', 'LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK'] as RevolverOutcome[],
        nextShotIndex: 2, // 2 shots used
      },
    },
    p3: {
      id: 'p3',
      lifeStatus: p3LifeStatus,
      roundStatus: 'WITH_CARDS',
      hand: [...p3HandCards],
      revolver: {
        sequence: ['LETHAL', 'BLANK', 'BLANK', 'BLANK', 'BLANK', 'BLANK'] as RevolverOutcome[],
        nextShotIndex: 1,
      },
    },
  };

  const match: MatchState = {
    status: 'IN_PROGRESS',
    seatOrder: [...playerIds],
    firstRoundStarter: 'p1',
    players,
    round: {
      roundNumber: 1,
      tableRank: 'KING',
      currentPlayerId: 'p1',
      previousPlay: {
        playId: 99,
        playerId: 'p2',
        cardIds: [...secretPreviousPlayCardIds],
        count: 2,
        claimedRank: 'KING',
        resolved: false,
      },
      centralPile: [...centralPileCards],
      undealtCards: [...undealtCards],
      playSequence: 1,
    },
    winnerId: null,
  };

  const members: RoomMember[] = playerIds.map((pid, idx) => ({
    playerId: pid,
    joinOrder: idx,
  }));

  const roomState: RoomAuthorityState<MatchState> = {
    roomId: 'room-101',
    lifecycle: 'MATCH_ACTIVE',
    revision: 14,
    members,
    hostPlayerId: 'p1',
    currentTurnId: 'turn-14',
    currentTurnDeadline: 45000,
    activeAlarm: {
      kind: 'TURN_DEADLINE',
      dueAt: 45000,
      generation: 14,
    },
    match,
  };

  return {
    roomState,
    p1HandCards,
    p2HandCards,
    p3HandCards,
    undealtCards,
    centralPileCards,
    secretPreviousPlayCardIds,
  };
}

/** Recursively collect all object keys in a JSON-serializable structure */
function collectAllKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  if (obj === null || typeof obj !== 'object') {
    return keys;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      keys.push(...collectAllKeys(obj[i], `${prefix}[${i}]`));
    }
    return keys;
  }
  for (const k of Object.keys(obj)) {
    keys.push(k);
    keys.push(...collectAllKeys((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
  }
  return keys;
}

describe('Recipient-Specific Hidden-Information Projection [T-029]', () => {
  // =========================================================================
  // MANDATORY DIRECT TESTS A - R
  // =========================================================================

  it('MANDATORY DIRECT TEST A — Living p1 projection (own Hand only)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const recipient: ServerResolvedRecipient = { playerId: 'p1' };

    const result = deriveRecipientRoomProjection(fixture.roomState, recipient);

    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    // Private state contains only p1
    expect(result.projection.privateState).not.toBeNull();
    expect(result.projection.privateState?.playerId).toBe('p1');
    expect(result.projection.privateState?.hand).toEqual([
      { id: 'secret-card-p1-alpha', rank: 'KING' },
      { id: 'secret-card-p1-beta', rank: 'ACE' },
      { id: 'secret-card-p1-gamma', rank: 'JOKER' },
    ]);

    // Hidden secrets of p2 / p3 / undealt / central pile / previousPlay / revolver must NOT appear
    const serialized = JSON.stringify(result.projection);
    expect(serialized).not.toContain('secret-card-p2-delta');
    expect(serialized).not.toContain('secret-card-p2-epsilon');
    expect(serialized).not.toContain('secret-card-undealt-1');
    expect(serialized).not.toContain('secret-card-undealt-2');
    expect(serialized).not.toContain('secret-card-central-1');
    expect(serialized).not.toContain('secret-card-central-2');
    expect(serialized).not.toContain('secret-play-card-x');
    expect(serialized).not.toContain('secret-play-card-y');
    expect(serialized).not.toContain('internal-play-secret-id-99');
  });

  it('MANDATORY DIRECT TEST B — Living p2 projection (own Hand only)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const recipient: ServerResolvedRecipient = { playerId: 'p2' };

    const result = deriveRecipientRoomProjection(fixture.roomState, recipient);

    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    // Private state contains only p2
    expect(result.projection.privateState).not.toBeNull();
    expect(result.projection.privateState?.playerId).toBe('p2');
    expect(result.projection.privateState?.hand).toEqual([
      { id: 'secret-card-p2-delta', rank: 'QUEEN' },
      { id: 'secret-card-p2-epsilon', rank: 'KING' },
    ]);

    // Hidden secrets of p1 absent
    const serialized = JSON.stringify(result.projection);
    expect(serialized).not.toContain('secret-card-p1-alpha');
    expect(serialized).not.toContain('secret-card-p1-beta');
    expect(serialized).not.toContain('secret-card-p1-gamma');
  });

  it('MANDATORY DIRECT TEST C — Canonical GAME_RULES T27 (dead spectator receives Public State only)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const recipient: ServerResolvedRecipient = { playerId: 'p3' }; // p3 is ELIMINATED

    const result = deriveRecipientRoomProjection(fixture.roomState, recipient);

    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    // T27: Eliminated spectator receives privateState === null
    expect(result.projection.privateState).toBeNull();

    // Serialized output must not contain any Living player secret cards
    const serialized = JSON.stringify(result.projection);
    expect(serialized).not.toContain('secret-card-p1-alpha');
    expect(serialized).not.toContain('secret-card-p1-beta');
    expect(serialized).not.toContain('secret-card-p1-gamma');
    expect(serialized).not.toContain('secret-card-p2-delta');
    expect(serialized).not.toContain('secret-card-p2-epsilon');
    expect(serialized).not.toContain('secret-card-undealt-1');
    expect(serialized).not.toContain('secret-card-central-1');
    expect(serialized).not.toContain('secret-play-card-x');
  });

  it('MANDATORY DIRECT TEST D — Eliminated stale own Hand defense (synthetic dead Hand canary is stripped)', () => {
    const staleDeadCard: Card = { id: 'dead-own-secret-card-999', rank: 'ACE' };
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3'], {
      eliminatedPlayerId: 'p3',
      staleDeadHandCard: staleDeadCard,
    });

    const recipient: ServerResolvedRecipient = { playerId: 'p3' };
    const result = deriveRecipientRoomProjection(fixture.roomState, recipient);

    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    // Must be null even with stale cards in authoritative state
    expect(result.projection.privateState).toBeNull();

    const serialized = JSON.stringify(result.projection);
    expect(serialized).not.toContain('dead-own-secret-card-999');
  });

  it('MANDATORY DIRECT TEST E — Public equality (p1, p2, p3 publicState is deep-equal)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    const res1 = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });
    const res2 = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p2' });
    const res3 = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p3' });

    expect(res1.decision).toBe('PROJECTED');
    expect(res2.decision).toBe('PROJECTED');
    expect(res3.decision).toBe('PROJECTED');

    if (res1.decision !== 'PROJECTED' || res2.decision !== 'PROJECTED' || res3.decision !== 'PROJECTED') return;

    expect(res1.projection.publicState).toEqual(res2.projection.publicState);
    expect(res2.projection.publicState).toEqual(res3.projection.publicState);
  });

  it('MANDATORY DIRECT TEST F — Public hand counts visible numerically, not card values', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const result = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });

    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    const publicPlayers = result.projection.publicState.match?.players;
    expect(publicPlayers).toBeDefined();
    expect(publicPlayers?.find(p => p.playerId === 'p1')?.handCount).toBe(3);
    expect(publicPlayers?.find(p => p.playerId === 'p2')?.handCount).toBe(2);
    expect(publicPlayers?.find(p => p.playerId === 'p3')?.handCount).toBe(0);

    // Ensure publicState contains no card IDs
    const publicSerialized = JSON.stringify(result.projection.publicState);
    expect(publicSerialized).not.toContain('secret-card-p1-alpha');
    expect(publicSerialized).not.toContain('secret-card-p2-delta');
  });

  it('MANDATORY DIRECT TEST G — Undealt isolation', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    for (const pid of ['p1', 'p2', 'p3']) {
      const res = deriveRecipientRoomProjection(fixture.roomState, { playerId: pid });
      expect(res.decision).toBe('PROJECTED');
      if (res.decision !== 'PROJECTED') return;

      const serialized = JSON.stringify(res.projection);
      expect(serialized).not.toContain('secret-card-undealt-1');
      expect(serialized).not.toContain('secret-card-undealt-2');
    }
  });

  it('MANDATORY DIRECT TEST H — Central Pile isolation', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    for (const pid of ['p1', 'p2', 'p3']) {
      const res = deriveRecipientRoomProjection(fixture.roomState, { playerId: pid });
      expect(res.decision).toBe('PROJECTED');
      if (res.decision !== 'PROJECTED') return;

      const serialized = JSON.stringify(res.projection);
      expect(serialized).not.toContain('secret-card-central-1');
      expect(serialized).not.toContain('secret-card-central-2');
    }
  });

  it('MANDATORY DIRECT TEST I — previousPlay isolation (summary public, cardIds hidden)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const res = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });

    expect(res.decision).toBe('PROJECTED');
    if (res.decision !== 'PROJECTED') return;

    const prevPlay = res.projection.publicState.match?.round.previousPlay;
    expect(prevPlay).toEqual({
      playerId: 'p2',
      count: 2,
      claimedRank: 'KING',
    });

    const serialized = JSON.stringify(res.projection);
    expect(serialized).not.toContain('secret-play-card-x');
    expect(serialized).not.toContain('secret-play-card-y');
    expect(serialized).not.toContain('internal-play-secret-id-99');
  });

  it('MANDATORY DIRECT TEST J — Revolver secrecy (shotsUsed visible, sequence hidden from everyone including owner)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    // Check p1 (owner of p1 revolver)
    const res1 = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });
    expect(res1.decision).toBe('PROJECTED');
    if (res1.decision !== 'PROJECTED') return;

    const p1Public = res1.projection.publicState.match?.players.find(p => p.playerId === 'p1');
    expect(p1Public?.shotsUsed).toBe(1);

    const p2Public = res1.projection.publicState.match?.players.find(p => p.playerId === 'p2');
    expect(p2Public?.shotsUsed).toBe(2);

    // Revolver sequence should NOT appear in p1's projection even though p1 owns the revolver
    const serialized = JSON.stringify(res1.projection);
    expect(serialized).not.toContain('LETHAL');
    expect(serialized).not.toContain('BLANK');
    expect(serialized).not.toContain('sequence');
  });

  it('MANDATORY DIRECT TEST K — Future canary defense (synthetic extra fields on all objects are stripped)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    // Cast and inject synthetic extra fields (canaries)
    const rawRoom = fixture.roomState as unknown as Record<string, unknown>;
    rawRoom.futureRoomSecretCanary = 'CANARY_ROOM_LEAK';

    const rawMatch = fixture.roomState.match as unknown as Record<string, unknown>;
    rawMatch.futureMatchSecretCanary = 'CANARY_MATCH_LEAK';

    const rawPlayer1 = fixture.roomState.match?.players['p1'] as unknown as Record<string, unknown>;
    rawPlayer1.futurePlayerSecretCanary = 'CANARY_PLAYER_LEAK';

    const rawRound = fixture.roomState.match?.round as unknown as Record<string, unknown>;
    rawRound.futureRoundSecretCanary = 'CANARY_ROUND_LEAK';

    const rawPlay = fixture.roomState.match?.round.previousPlay as unknown as Record<string, unknown>;
    rawPlay.futurePlaySecretCanary = 'CANARY_PLAY_LEAK';

    const rawRevolver = fixture.roomState.match?.players['p1'].revolver as unknown as Record<string, unknown>;
    rawRevolver.futureRevolverSecretCanary = 'CANARY_REVOLVER_LEAK';

    const rawCard = fixture.p1HandCards[0] as unknown as Record<string, unknown>;
    rawCard.futureCardSecretCanary = 'CANARY_CARD_LEAK';

    const result = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });
    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    const serialized = JSON.stringify(result.projection);
    expect(serialized).not.toContain('CANARY_ROOM_LEAK');
    expect(serialized).not.toContain('CANARY_MATCH_LEAK');
    expect(serialized).not.toContain('CANARY_PLAYER_LEAK');
    expect(serialized).not.toContain('CANARY_ROUND_LEAK');
    expect(serialized).not.toContain('CANARY_PLAY_LEAK');
    expect(serialized).not.toContain('CANARY_REVOLVER_LEAK');
    expect(serialized).not.toContain('CANARY_CARD_LEAK');
  });

  it('MANDATORY DIRECT TEST L — Hostile Player IDs (__proto__, constructor, toString)', () => {
    const hostileIds = ['__proto__', 'constructor', 'toString'];

    const players: Record<string, PlayerState> = Object.create(null);
    players['__proto__'] = {
      id: '__proto__',
      lifeStatus: 'ALIVE' as LifeStatus,
      roundStatus: 'WITH_CARDS' as RoundStatus,
      hand: [{ id: 'card-proto-secret', rank: 'KING' as CardRank }],
      revolver: { sequence: ['BLANK'] as RevolverOutcome[], nextShotIndex: 0 },
    };
    players['constructor'] = {
      id: 'constructor',
      lifeStatus: 'ALIVE' as LifeStatus,
      roundStatus: 'WITH_CARDS' as RoundStatus,
      hand: [{ id: 'card-ctor-secret', rank: 'QUEEN' as CardRank }],
      revolver: { sequence: ['BLANK'] as RevolverOutcome[], nextShotIndex: 0 },
    };
    players['toString'] = {
      id: 'toString',
      lifeStatus: 'ALIVE' as LifeStatus,
      roundStatus: 'WITH_CARDS' as RoundStatus,
      hand: [{ id: 'card-tostr-secret', rank: 'ACE' as CardRank }],
      revolver: { sequence: ['BLANK'] as RevolverOutcome[], nextShotIndex: 0 },
    };

    const match: MatchState = {
      status: 'IN_PROGRESS',
      seatOrder: [...hostileIds],
      firstRoundStarter: '__proto__',
      players,
      round: {
        roundNumber: 1,
        tableRank: 'KING' as TableRank,
        currentPlayerId: '__proto__',
        previousPlay: null,
        centralPile: [],
        undealtCards: [],
        playSequence: 1,
      },
      winnerId: null,
    };

    const members: RoomMember[] = hostileIds.map((pid, idx) => ({
      playerId: pid,
      joinOrder: idx,
    }));

    const roomState: RoomAuthorityState<MatchState> = {
      roomId: 'room-hostile',
      lifecycle: 'MATCH_ACTIVE',
      revision: 1,
      members,
      hostPlayerId: '__proto__',
      currentTurnId: 'turn-1',
      currentTurnDeadline: 30000,
      activeAlarm: null,
      match,
    };

    // Test projection for __proto__
    const resProto = deriveRecipientRoomProjection(roomState, { playerId: '__proto__' });
    expect(resProto.decision).toBe('PROJECTED');
    if (resProto.decision === 'PROJECTED') {
      expect(resProto.projection.privateState?.playerId).toBe('__proto__');
      expect(resProto.projection.privateState?.hand).toEqual([{ id: 'card-proto-secret', rank: 'KING' }]);
      expect(JSON.stringify(resProto.projection)).not.toContain('card-ctor-secret');
      expect(JSON.stringify(resProto.projection)).not.toContain('card-tostr-secret');
    }

    // Test projection for constructor
    const resCtor = deriveRecipientRoomProjection(roomState, { playerId: 'constructor' });
    expect(resCtor.decision).toBe('PROJECTED');
    if (resCtor.decision === 'PROJECTED') {
      expect(resCtor.projection.privateState?.playerId).toBe('constructor');
      expect(resCtor.projection.privateState?.hand).toEqual([{ id: 'card-ctor-secret', rank: 'QUEEN' }]);
    }
  });

  it('MANDATORY DIRECT TEST M — Non-member recipient rejected fail-closed', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const recipient: ServerResolvedRecipient = { playerId: 'intruder-not-member' };

    const result = deriveRecipientRoomProjection(fixture.roomState, recipient);

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.reason).toBe('RECIPIENT_NOT_MEMBER');
      // No secret data in reject result
      expect(JSON.stringify(result)).not.toContain('secret-card');
      expect(JSON.stringify(result)).not.toContain('room-101');
    }
  });

  it('MANDATORY DIRECT TEST N — Active Room missing Match fails closed', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const roomStateNoMatch: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      match: null,
    };

    const result = deriveRecipientRoomProjection(roomStateNoMatch, { playerId: 'p1' });

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.reason).toBe('MATCH_STATE_MISSING');
    }
  });

  it('MANDATORY DIRECT TEST O — Room/Match player-set mismatch fails closed', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    // Modify members to not match seatOrder
    const mismatchedRoom: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      members: [
        { playerId: 'p1', joinOrder: 0 },
        { playerId: 'p2', joinOrder: 1 },
        { playerId: 'p_mismatch', joinOrder: 2 },
      ],
    };

    const result = deriveRecipientRoomProjection(mismatchedRoom, { playerId: 'p1' });

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.reason).toBe('INVALID_ROOM_STATE');
    }
  });

  it('MANDATORY DIRECT TEST P — Mutation isolation (mutating returned projection does not mutate authority)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const result = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });

    expect(result.decision).toBe('PROJECTED');
    if (result.decision !== 'PROJECTED') return;

    // Mutate projected arrays and objects
    result.projection.publicState.memberPlayerIds.push('hacker-member');
    result.projection.publicState.match!.seatOrder.push('hacker-seat');
    result.projection.publicState.match!.players[0].playerId = 'mutated-p1';
    result.projection.privateState!.hand[0].id = 'mutated-card-id';
    result.projection.privateState!.hand[0].rank = 'QUEEN';
    result.projection.privateState!.hand.push({ id: 'hacker-card', rank: 'ACE' });

    // Assert original RoomAuthorityState remains completely unaffected
    expect(fixture.roomState.members.map(m => m.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(fixture.roomState.match!.seatOrder).toEqual(['p1', 'p2', 'p3']);
    expect(fixture.roomState.match!.players['p1'].id).toBe('p1');
    expect(fixture.p1HandCards[0].id).toBe('secret-card-p1-alpha');
    expect(fixture.p1HandCards[0].rank).toBe('KING');
    expect(fixture.p1HandCards.length).toBe(3);
  });

  it('MANDATORY DIRECT TEST Q — Deterministic projection (identical repeated outputs)', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    const resA = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });
    const resB = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });

    expect(resA).toEqual(resB);
  });

  it('MANDATORY DIRECT TEST R — No raw hidden keys anywhere in public/eliminated projections', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    const forbiddenHiddenKeys = [
      'revolver',
      'sequence',
      'roundStatus',
      'undealtCards',
      'centralPile',
      'cardIds',
      'playId',
      'playSequence',
      'firstRoundStarter',
      'activeAlarm',
    ];

    // 1. Check Public projection for all participants
    const res1 = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });
    const res3 = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p3' });

    expect(res1.decision).toBe('PROJECTED');
    expect(res3.decision).toBe('PROJECTED');
    if (res1.decision !== 'PROJECTED' || res3.decision !== 'PROJECTED') return;

    const publicKeys = collectAllKeys(res1.projection.publicState);
    for (const forbidden of forbiddenHiddenKeys) {
      expect(publicKeys).not.toContain(forbidden);
    }
    // Also public snapshot must not have 'hand' key (it has 'handCount')
    expect(publicKeys).not.toContain('hand');

    // 2. Check Eliminated full projection (privateState is null, so total keys == public keys)
    const eliminatedTotalKeys = collectAllKeys(res3.projection);
    for (const forbidden of forbiddenHiddenKeys) {
      expect(eliminatedTotalKeys).not.toContain(forbidden);
    }
    expect(eliminatedTotalKeys).not.toContain('hand');

    // 3. Check Living projection: 'hand' must only appear at privateState.hand
    const livingTotalKeys = collectAllKeys(res1.projection);
    for (const forbidden of forbiddenHiddenKeys) {
      expect(livingTotalKeys).not.toContain(forbidden);
    }
    expect(livingTotalKeys).toContain('hand');
    expect(res1.projection.privateState?.hand).toBeDefined();
  });

  // =========================================================================
  // ADDITIONAL LIFECYCLE & EDGE CASE TESTS
  // =========================================================================

  it('LOBBY lifecycle with null Match projects cleanly', () => {
    const roomState: RoomAuthorityState<MatchState> = {
      roomId: 'lobby-1',
      lifecycle: 'LOBBY',
      revision: 0,
      members: [
        { playerId: 'p1', joinOrder: 0 },
        { playerId: 'p2', joinOrder: 1 },
      ],
      hostPlayerId: 'p1',
      currentTurnId: null,
      currentTurnDeadline: null,
      activeAlarm: null,
      match: null,
    };

    const res = deriveRecipientRoomProjection(roomState, { playerId: 'p1' });
    expect(res.decision).toBe('PROJECTED');
    if (res.decision !== 'PROJECTED') return;

    expect(res.projection.publicState.lifecycle).toBe('LOBBY');
    expect(res.projection.publicState.match).toBeNull();
    expect(res.projection.publicState.memberPlayerIds).toEqual(['p1', 'p2']);
    expect(res.projection.privateState).toBeNull();
  });

  it('LOBBY lifecycle with non-null Match fails closed as INVALID_ROOM_STATE', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const lobbyRoom: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      lifecycle: 'LOBBY',
    };

    const res = deriveRecipientRoomProjection(lobbyRoom, { playerId: 'p1' });
    expect(res.decision).toBe('REJECT');
    if (res.decision === 'REJECT') {
      expect(res.reason).toBe('INVALID_ROOM_STATE');
    }
  });

  it('MATCH_PAUSED_NO_LIVING_CONNECTIONS preserves same hidden isolation', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const pausedRoom: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      lifecycle: 'MATCH_PAUSED_NO_LIVING_CONNECTIONS',
      currentTurnDeadline: null,
      activeAlarm: null,
    };

    const res1 = deriveRecipientRoomProjection(pausedRoom, { playerId: 'p1' });
    expect(res1.decision).toBe('PROJECTED');
    if (res1.decision !== 'PROJECTED') return;

    expect(res1.projection.publicState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
    expect(res1.projection.privateState?.playerId).toBe('p1');
    expect(res1.projection.privateState?.hand).toHaveLength(3);

    const res3 = deriveRecipientRoomProjection(pausedRoom, { playerId: 'p3' });
    expect(res3.decision).toBe('PROJECTED');
    if (res3.decision !== 'PROJECTED') return;
    expect(res3.projection.privateState).toBeNull();
  });

  it('MATCH_FINISHED projects winnerId and keeps private Hand isolated', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const finishedMatch: MatchState = {
      ...fixture.roomState.match!,
      status: 'FINISHED',
      winnerId: 'p1',
    };
    const finishedRoom: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      lifecycle: 'MATCH_FINISHED',
      match: finishedMatch,
      currentTurnDeadline: null,
      activeAlarm: null,
    };

    const res1 = deriveRecipientRoomProjection(finishedRoom, { playerId: 'p1' });
    expect(res1.decision).toBe('PROJECTED');
    if (res1.decision !== 'PROJECTED') return;

    expect(res1.projection.publicState.lifecycle).toBe('MATCH_FINISHED');
    expect(res1.projection.publicState.match?.winnerId).toBe('p1');
    expect(res1.projection.publicState.match?.status).toBe('FINISHED');
    expect(res1.projection.privateState?.playerId).toBe('p1');

    const res3 = deriveRecipientRoomProjection(finishedRoom, { playerId: 'p3' });
    expect(res3.decision).toBe('PROJECTED');
    if (res3.decision !== 'PROJECTED') return;
    expect(res3.projection.privateState).toBeNull();
  });

  it('ABANDONED lifecycle supports null or retained Match', () => {
    const roomStateNullMatch: RoomAuthorityState<MatchState> = {
      roomId: 'abandoned-1',
      lifecycle: 'ABANDONED',
      revision: 5,
      members: [{ playerId: 'p1', joinOrder: 0 }],
      hostPlayerId: 'p1',
      currentTurnId: null,
      currentTurnDeadline: null,
      activeAlarm: null,
      match: null,
    };

    const res = deriveRecipientRoomProjection(roomStateNullMatch, { playerId: 'p1' });
    expect(res.decision).toBe('PROJECTED');
    if (res.decision !== 'PROJECTED') return;
    expect(res.projection.publicState.lifecycle).toBe('ABANDONED');
    expect(res.projection.publicState.match).toBeNull();
    expect(res.projection.privateState).toBeNull();
  });

  it('Invalid recipient context (null, empty, whitespace) rejects fail-closed', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    // @ts-expect-error test invalid null input
    expect(deriveRecipientRoomProjection(fixture.roomState, null).decision).toBe('REJECT');
    // @ts-expect-error test invalid undefined input
    expect(deriveRecipientRoomProjection(fixture.roomState, undefined).decision).toBe('REJECT');
    expect(deriveRecipientRoomProjection(fixture.roomState, { playerId: '' }).decision).toBe('REJECT');
    expect(deriveRecipientRoomProjection(fixture.roomState, { playerId: '   ' }).decision).toBe('REJECT');
  });

  it('Invalid RoomAuthorityState structures reject fail-closed', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    // Duplicate members
    const dupMembers: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      members: [
        { playerId: 'p1', joinOrder: 0 },
        { playerId: 'p1', joinOrder: 1 },
      ],
    };
    expect(deriveRecipientRoomProjection(dupMembers, { playerId: 'p1' }).decision).toBe('REJECT');

    // Negative revision
    const negRev: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      revision: -1,
    };
    expect(deriveRecipientRoomProjection(negRev, { playerId: 'p1' }).decision).toBe('REJECT');

    // Invalid lifecycle string
    const invalidLc = { ...fixture.roomState, lifecycle: 'NOT_A_LIFECYCLE' as any };
    expect(deriveRecipientRoomProjection(invalidLc, { playerId: 'p1' }).decision).toBe('REJECT');
  });

  // =========================================================================
  // NULLABLE HOST TESTS (CORRECTION SUITE)
  // =========================================================================

  it('NULLABLE HOST TEST A — LOBBY with null Host projects cleanly', () => {
    const lobbyNullHost: RoomAuthorityState<MatchState> = {
      roomId: 'lobby-null-host',
      lifecycle: 'LOBBY',
      revision: 0,
      members: [
        { playerId: 'p1', joinOrder: 0 },
        { playerId: 'p2', joinOrder: 1 },
      ],
      hostPlayerId: null,
      currentTurnId: null,
      currentTurnDeadline: null,
      activeAlarm: null,
      match: null,
    };

    const res = deriveRecipientRoomProjection(lobbyNullHost, { playerId: 'p1' });
    expect(res.decision).toBe('PROJECTED');
    if (res.decision !== 'PROJECTED') return;

    expect(res.projection.publicState.hostPlayerId).toBeNull();
    expect(res.projection.publicState.lifecycle).toBe('LOBBY');
    expect(res.projection.publicState.match).toBeNull();
    expect(res.projection.privateState).toBeNull();
  });

  it('NULLABLE HOST TEST B — ABANDONED with null Host projects cleanly', () => {
    const abandonedNullHost: RoomAuthorityState<MatchState> = {
      roomId: 'abandoned-null-host',
      lifecycle: 'ABANDONED',
      revision: 3,
      members: [{ playerId: 'p1', joinOrder: 0 }],
      hostPlayerId: null,
      currentTurnId: null,
      currentTurnDeadline: null,
      activeAlarm: null,
      match: null,
    };

    const res = deriveRecipientRoomProjection(abandonedNullHost, { playerId: 'p1' });
    expect(res.decision).toBe('PROJECTED');
    if (res.decision !== 'PROJECTED') return;

    expect(res.projection.publicState.hostPlayerId).toBeNull();
    expect(res.projection.publicState.lifecycle).toBe('ABANDONED');
    expect(res.projection.publicState.match).toBeNull();
    expect(res.projection.privateState).toBeNull();
  });

  it('NULLABLE HOST TEST C — Non-null Host regression preserves string host', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    expect(fixture.roomState.hostPlayerId).toBe('p1');

    const res = deriveRecipientRoomProjection(fixture.roomState, { playerId: 'p1' });
    expect(res.decision).toBe('PROJECTED');
    if (res.decision !== 'PROJECTED') return;

    expect(res.projection.publicState.hostPlayerId).toBe('p1');
  });

  it('NULLABLE HOST TEST D — Malformed Host values reject fail-closed', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);

    // Empty string host
    const emptyHost = { ...fixture.roomState, hostPlayerId: '' };
    expect(deriveRecipientRoomProjection(emptyHost, { playerId: 'p1' }).decision).toBe('REJECT');

    // Whitespace string host
    const wsHost = { ...fixture.roomState, hostPlayerId: '   ' };
    expect(deriveRecipientRoomProjection(wsHost, { playerId: 'p1' }).decision).toBe('REJECT');

    // Non-string non-null host
    const numHost = { ...fixture.roomState, hostPlayerId: 123 as any };
    expect(deriveRecipientRoomProjection(numHost, { playerId: 'p1' }).decision).toBe('REJECT');
  });

  it('NULLABLE HOST TEST E — Security regression with null Host and retained Match', () => {
    const fixture = createAuthoritativeRoomFixture(['p1', 'p2', 'p3']);
    const abandonedWithMatchNullHost: RoomAuthorityState<MatchState> = {
      ...fixture.roomState,
      lifecycle: 'ABANDONED',
      hostPlayerId: null,
    };

    // Living p1 projection
    const res1 = deriveRecipientRoomProjection(abandonedWithMatchNullHost, { playerId: 'p1' });
    expect(res1.decision).toBe('PROJECTED');
    if (res1.decision !== 'PROJECTED') return;
    expect(res1.projection.publicState.hostPlayerId).toBeNull();
    expect(res1.projection.privateState?.playerId).toBe('p1');
    expect(res1.projection.privateState?.hand).toHaveLength(3);

    // Eliminated p3 projection
    const res3 = deriveRecipientRoomProjection(abandonedWithMatchNullHost, { playerId: 'p3' });
    expect(res3.decision).toBe('PROJECTED');
    if (res3.decision !== 'PROJECTED') return;
    expect(res3.projection.publicState.hostPlayerId).toBeNull();
    expect(res3.projection.privateState).toBeNull();

    // Verify all hidden isolations remain intact under null host
    const serialized3 = JSON.stringify(res3.projection);
    expect(serialized3).not.toContain('secret-card-p1-alpha');
    expect(serialized3).not.toContain('secret-card-p2-delta');
    expect(serialized3).not.toContain('secret-card-undealt-1');
    expect(serialized3).not.toContain('secret-card-central-1');
    expect(serialized3).not.toContain('secret-play-card-x');
  });
});
