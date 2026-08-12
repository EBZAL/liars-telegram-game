import { describe, expect, it } from 'vitest';
import { parseGameplayActionEnvelope } from '../src/gameplay-protocol.js';

describe('Gameplay Protocol Envelope Validation', () => {
  const validPlayInput = {
    actionId: 'act-001',
    expectedRevision: 0,
    turnId: 'turn-001',
    actionType: 'PLAY_CARDS',
    payload: {
      cardIds: ['c1', 'c2'],
    },
  };

  const validCallInput = {
    actionId: 'act-002',
    expectedRevision: 1,
    turnId: 'turn-001',
    actionType: 'CALL_LIAR',
    payload: {},
  };

  it('parses valid PLAY_CARDS envelope correctly (AC-21, AC-25, AC-29..32)', () => {
    const result = parseGameplayActionEnvelope(validPlayInput);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      actionId: 'act-001',
      expectedRevision: 0,
      turnId: 'turn-001',
      actionType: 'PLAY_CARDS',
      payload: {
        cardIds: ['c1', 'c2'],
      },
    });
  });

  it('parses valid CALL_LIAR envelope correctly (AC-21, AC-26, AC-33)', () => {
    const result = parseGameplayActionEnvelope(validCallInput);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      actionId: 'act-002',
      expectedRevision: 1,
      turnId: 'turn-001',
      actionType: 'CALL_LIAR',
      payload: {},
    });
  });

  it('returns detached cardIds array and does not mutate input (AC-40, AC-41)', () => {
    const inputCopy = JSON.parse(JSON.stringify(validPlayInput));
    const result = parseGameplayActionEnvelope(inputCopy);

    expect(result).not.toBeNull();
    if (result && result.actionType === 'PLAY_CARDS') {
      expect(result.payload.cardIds).not.toBe(inputCopy.payload.cardIds);
      expect(result.payload.cardIds).toEqual(['c1', 'c2']);

      // Mutating input must not affect parsed result
      inputCopy.payload.cardIds.push('c3');
      expect(result.payload.cardIds).toEqual(['c1', 'c2']);
    }
  });

  it('rejects actionId if missing, empty, or whitespace-only (AC-22)', () => {
    expect(parseGameplayActionEnvelope({ ...validPlayInput, actionId: '' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, actionId: '   ' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, actionId: 123 })).toBeNull();
  });

  it('rejects expectedRevision if negative, non-integer, or invalid (AC-23)', () => {
    expect(parseGameplayActionEnvelope({ ...validPlayInput, expectedRevision: -1 })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, expectedRevision: 1.5 })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, expectedRevision: '0' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, expectedRevision: NaN })).toBeNull();
  });

  it('rejects turnId if missing, empty, or whitespace-only (AC-24)', () => {
    expect(parseGameplayActionEnvelope({ ...validPlayInput, turnId: '' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, turnId: '   ' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, turnId: null })).toBeNull();
  });

  it('rejects client actionType SYSTEM_TIMEOUT (AC-27)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        actionType: 'SYSTEM_TIMEOUT',
      })
    ).toBeNull();
  });

  it('rejects unknown actionType values (AC-28)', () => {
    expect(parseGameplayActionEnvelope({ ...validPlayInput, actionType: 'PASS' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, actionType: 'START_GAME' })).toBeNull();
    expect(parseGameplayActionEnvelope({ ...validPlayInput, actionType: '' })).toBeNull();
  });

  it('validates PLAY_CARDS cardIds length 1..3 and uniqueness (AC-30..32)', () => {
    // 0 cards rejected
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: [] },
      })
    ).toBeNull();

    // 4 cards rejected
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1', 'c2', 'c3', 'c4'] },
      })
    ).toBeNull();

    // Empty string card ID rejected
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1', ''] },
      })
    ).toBeNull();

    // Non-string card ID rejected
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1', 123] },
      })
    ).toBeNull();

    // Duplicate card IDs rejected
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1', 'c1'] },
      })
    ).toBeNull();

    // Valid lengths 1, 2, 3 accepted
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1'] },
      })
    ).not.toBeNull();

    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1', 'c2', 'c3'] },
      })
    ).not.toBeNull();
  });

  it('requires CALL_LIAR payload to be an exact empty object (AC-33)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validCallInput,
        payload: { targetPlayId: 'play-1' },
      })
    ).toBeNull();
  });

  it('rejects extra top-level envelope keys (AC-34)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        extraKey: 'forbidden',
      })
    ).toBeNull();
  });

  it('rejects client actorId/playerId authority fields (AC-35)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        actorId: 'player-1',
      })
    ).toBeNull();

    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        playerId: 'player-1',
      })
    ).toBeNull();
  });

  it('rejects client claimedRank/claimRank fields (AC-36)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        claimedRank: 'KING',
      })
    ).toBeNull();

    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1'], claimRank: 'KING' },
      })
    ).toBeNull();
  });

  it('rejects client claimedCount/claimCount fields (AC-37)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        claimCount: 1,
      })
    ).toBeNull();

    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1'], claimedCount: 1 },
      })
    ).toBeNull();
  });

  it('rejects client outcome authority fields (AC-38)', () => {
    expect(
      parseGameplayActionEnvelope({
        ...validCallInput,
        payload: { shooterId: 'p1', winnerId: 'p2' },
      })
    ).toBeNull();

    expect(
      parseGameplayActionEnvelope({
        ...validPlayInput,
        payload: { cardIds: ['c1'], truthful: true, roundLoserId: 'p1' },
      })
    ).toBeNull();
  });

  it('rejects primitives, null, arrays, and malformed inputs (AC-39)', () => {
    expect(parseGameplayActionEnvelope(null)).toBeNull();
    expect(parseGameplayActionEnvelope(undefined)).toBeNull();
    expect(parseGameplayActionEnvelope([])).toBeNull();
    expect(parseGameplayActionEnvelope('act-001')).toBeNull();
    expect(parseGameplayActionEnvelope(12345)).toBeNull();
    expect(parseGameplayActionEnvelope(true)).toBeNull();
  });
});
