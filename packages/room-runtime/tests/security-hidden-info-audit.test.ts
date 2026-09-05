import { describe, it, expect } from 'vitest';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  createInMemorySqlStorage,
  deriveRecipientRoomProjection,
  type RecipientRoomProjection,
  type RoomAuthorityState,
} from '../src/index.js';

function createDeterministicRng(): RandomSource {
  let seed = 98765;
  return {
    nextInt(max: number): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return max > 0 ? (seed >>> 0) % max : 0;
    },
  };
}

/**
 * Deep search a JSON-serializable object for any occurrence of a secret string.
 */
function containsSecretString(obj: unknown, secret: string): boolean {
  const json = JSON.stringify(obj);
  return json.includes(secret);
}

describe('T-044 Hidden Info Leakage and Security Audit', () => {
  it('AC-01: No private card identities of other players are exposed in any projection', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_sec_cards_ac1';
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createDeterministicRng();

    let time = 1000;
    const playerIds = ['alice', 'bob', 'charlie', 'dave'];
    for (const pid of playerIds) {
      coord.handleClientCommand(pid, { type: 'JOIN' }, time, rng);
      coord.onPlayerConnect(`c_${pid}`, pid, time);
      time += 100;
    }
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time, rng);

    const projs = coord.getConnectedMemberProjections();
    const authMatch = coord.getRoomState().match!;

    // For each player, gather their private card IDs
    const privateCardsByPlayer: Record<string, string[]> = {};
    for (const pid of playerIds) {
      privateCardsByPlayer[pid] = authMatch.players[pid].hand.map((c) => c.id);
    }

    // Audit every player's projection
    for (const viewerId of playerIds) {
      const viewerProj = projs.get(viewerId)!;
      expect(viewerProj.privateState?.playerId).toBe(viewerId);

      // Verify that NO other player's card IDs appear anywhere in viewerProj
      for (const targetId of playerIds) {
        if (targetId === viewerId) continue;

        for (const secretCardId of privateCardsByPlayer[targetId]) {
          expect(containsSecretString(viewerProj, secretCardId)).toBe(false);
        }
      }

      // Public state audit: ensure players array has only whitelisted public fields
      for (const publicPlayer of viewerProj.publicState.match!.players) {
        expect(publicPlayer).toHaveProperty('playerId');
        expect(publicPlayer).toHaveProperty('lifeStatus');
        expect(publicPlayer).toHaveProperty('handCount');
        expect(publicPlayer).toHaveProperty('shotsUsed');

        // Must NOT have hand, cards, or revolver sequence
        expect(publicPlayer).not.toHaveProperty('hand');
        expect(publicPlayer).not.toHaveProperty('cards');
        expect(publicPlayer).not.toHaveProperty('revolver');
      }
    }
  });

  it('AC-02: Undealt cards, central pile face-down cards, and revolver sequences are never leaked', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_sec_undealt_ac2';
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createDeterministicRng();

    let time = 1000;
    // 2-player match: 10 dealt cards, 10 undealt cards!
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.onPlayerConnect('c_alice', 'alice', time + 150);
    coord.onPlayerConnect('c_bob', 'bob', time + 150);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);

    const authMatch = coord.getRoomState().match!;
    const undealtCards = authMatch.round.undealtCards;
    expect(undealtCards).toHaveLength(10);

    // 1. Audit undealt cards: none of their IDs may appear in ANY projection
    const projs = coord.getConnectedMemberProjections();
    for (const card of undealtCards) {
      expect(containsSecretString(projs.get('alice'), card.id)).toBe(false);
      expect(containsSecretString(projs.get('bob'), card.id)).toBe(false);
    }

    // 2. Play cards face-down
    const actorId = authMatch.round.currentPlayerId;
    const actorHand = authMatch.players[actorId].hand;
    const playedCard = actorHand[0];

    time += 1000;
    coord.handleClientCommand(
      actorId,
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-sec-play',
          expectedRevision: coord.getRoomState().revision,
          turnId: coord.getRoomState().currentTurnId!,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [playedCard.id] },
        },
      },
      time,
      rng
    );

    // Verify face-down play does not leak card ID to other player
    const otherId = actorId === 'alice' ? 'bob' : 'alice';
    const otherProj = coord.getConnectedMemberProjections().get(otherId)!;
    expect(otherProj.publicState.match?.round.previousPlay).not.toBeNull();
    expect(otherProj.publicState.match?.round.previousPlay?.count).toBe(1);
    expect(otherProj.publicState.match?.round.previousPlay?.claimedRank).toBeDefined();

    // Must NOT reveal the played card ID to the other player
    expect(containsSecretString(otherProj, playedCard.id)).toBe(false);

    // 3. Audit revolver sequences: future chamber layouts must not leak to any player
    for (const pid of ['alice', 'bob']) {
      const pRevolver = authMatch.players[pid].revolver;
      // The sequence is secret!
      expect(containsSecretString(projs.get(pid), 'nextShotIndex')).toBe(false);
      expect(containsSecretString(projs.get(pid), 'sequence')).toBe(false);
    }
  });

  it('AC-03: Eliminated spectators receive strictly public state (privateState === null)', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_sec_spectator_ac3';
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createDeterministicRng();

    let time = 1000;
    const pids = ['alice', 'bob', 'charlie'];
    for (const pid of pids) {
      coord.handleClientCommand(pid, { type: 'JOIN' }, time, rng);
      coord.onPlayerConnect(`c_${pid}`, pid, time);
      time += 100;
    }
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time, rng);

    // Play until a player is eliminated
    let actionCount = 0;
    let eliminatedId: string | null = null;

    while (coord.getRoomState().lifecycle === 'MATCH_ACTIVE' && actionCount < 60) {
      const match = coord.getRoomState().match!;
      const eliminated = Object.values(match.players).filter((p) => p.lifeStatus === 'ELIMINATED');
      if (eliminated.length > 0) {
        eliminatedId = eliminated[0].id;
        break;
      }

      actionCount++;
      time += 1000;
      const currentActor = match.round.currentPlayerId;
      const currentTurnId = coord.getRoomState().currentTurnId!;
      const currentRev = coord.getRoomState().revision;

      const canChallenge = match.round.previousPlay !== null;
      if (canChallenge) {
        coord.handleClientCommand(
          currentActor,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-sec-elim-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'CALL_LIAR',
              payload: {},
            },
          },
          time,
          rng
        );
      } else {
        const card = match.players[currentActor].hand[0];
        coord.handleClientCommand(
          currentActor,
          {
            type: 'GAMEPLAY_ACTION',
            envelope: {
              actionId: `act-sec-elim-${actionCount}`,
              expectedRevision: currentRev,
              turnId: currentTurnId,
              actionType: 'PLAY_CARDS',
              payload: { cardIds: [card.id] },
            },
          },
          time,
          rng
        );
      }
    }

    expect(eliminatedId).not.toBeNull();
    const spectatorProj = coord.getConnectedMemberProjections().get(eliminatedId!)!;

    // Invariant I29 & GAME_RULES T27: Eliminated spectator receives null privateState
    expect(spectatorProj.privateState).toBeNull();

    // Verify spectator cannot inspect living players' private card IDs
    const livingPlayer = Object.values(coord.getRoomState().match!.players).find(
      (p) => p.lifeStatus === 'ALIVE'
    )!;
    for (const card of livingPlayer.hand) {
      expect(containsSecretString(spectatorProj, card.id)).toBe(false);
    }
  });

  it('AC-04: Fail-closed recipient authorization & prototype pollution immunity', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_sec_auth_ac4';
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);

    const roomState = coord.getRoomState();

    // 1. Non-member request rejected fail-closed
    const nonMemberResult = deriveRecipientRoomProjection(
      roomState as RoomAuthorityState<any>,
      { playerId: 'eve-eavesdropper' }
    );
    expect(nonMemberResult.decision).toBe('REJECT');
    expect(nonMemberResult).toHaveProperty('reason');

    // 2. Prototype pollution injection attempts
    const maliciousIds = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'];
    for (const badId of maliciousIds) {
      const maliciousResult = deriveRecipientRoomProjection(
        roomState as RoomAuthorityState<any>,
        { playerId: badId }
      );
      expect(maliciousResult.decision).toBe('REJECT');
    }
    expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('AC-05: Error responses are sanitized and do not leak hidden state', () => {
    const sql = createInMemorySqlStorage();
    const roomId = 'r_sec_err_ac5';
    const coord = new RoomCoordinator(roomId, sql);
    const rng = createDeterministicRng();

    let time = 1000;
    coord.handleClientCommand('alice', { type: 'JOIN' }, time, rng);
    coord.handleClientCommand('bob', { type: 'JOIN' }, time + 100, rng);
    coord.onPlayerConnect('c_alice', 'alice', time);
    coord.onPlayerConnect('c_bob', 'bob', time);
    coord.handleClientCommand('alice', { type: 'START_MATCH' }, time + 200, rng);

    // Alice attempts to play cards that do not belong to her
    const bobCard = coord.getRoomState().match!.players['bob'].hand[0];
    const illegalRes = coord.handleClientCommand(
      'alice',
      {
        type: 'GAMEPLAY_ACTION',
        envelope: {
          actionId: 'act-illegal-card',
          expectedRevision: coord.getRoomState().revision,
          turnId: coord.getRoomState().currentTurnId!,
          actionType: 'PLAY_CARDS',
          payload: { cardIds: [bobCard.id] },
        },
      },
      time + 500,
      rng
    );

    expect(illegalRes.success).toBe(false);
    // Error response must not leak bobCard's rank or full card object
    expect(illegalRes.error).not.toContain(bobCard.rank);
  });
});
