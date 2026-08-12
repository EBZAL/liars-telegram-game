export type ClientGameplayActionType = 'PLAY_CARDS' | 'CALL_LIAR';

export interface PlayCardsPayload {
  cardIds: string[];
}

export type CallLiarPayload = Record<string, never>;

export interface PlayCardsEnvelope {
  actionId: string;
  expectedRevision: number;
  turnId: string;
  actionType: 'PLAY_CARDS';
  payload: PlayCardsPayload;
}

export interface CallLiarEnvelope {
  actionId: string;
  expectedRevision: number;
  turnId: string;
  actionType: 'CALL_LIAR';
  payload: CallLiarPayload;
}

export type GameplayActionEnvelope = PlayCardsEnvelope | CallLiarEnvelope;

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'actionId',
  'expectedRevision',
  'turnId',
  'actionType',
  'payload',
]);

export function parseGameplayActionEnvelope(input: unknown): GameplayActionEnvelope | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }

  const keys = Object.keys(input);
  if (keys.length !== 5 || !keys.every((k) => ALLOWED_TOP_LEVEL_KEYS.has(k))) {
    return null;
  }

  const record = input as Record<string, unknown>;

  const { actionId, expectedRevision, turnId, actionType, payload } = record;

  if (typeof actionId !== 'string' || actionId.trim().length === 0) {
    return null;
  }

  if (
    typeof expectedRevision !== 'number' ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return null;
  }

  if (typeof turnId !== 'string' || turnId.trim().length === 0) {
    return null;
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const payloadKeys = Object.keys(payloadRecord);

  if (actionType === 'PLAY_CARDS') {
    if (payloadKeys.length !== 1 || payloadKeys[0] !== 'cardIds') {
      return null;
    }

    const { cardIds } = payloadRecord;
    if (!Array.isArray(cardIds)) {
      return null;
    }

    if (cardIds.length < 1 || cardIds.length > 3) {
      return null;
    }

    const detachedCardIds: string[] = [];
    const seen = new Set<string>();

    for (const cardId of cardIds) {
      if (typeof cardId !== 'string' || cardId.trim().length === 0) {
        return null;
      }
      if (seen.has(cardId)) {
        return null;
      }
      seen.add(cardId);
      detachedCardIds.push(cardId);
    }

    return {
      actionId,
      expectedRevision,
      turnId,
      actionType: 'PLAY_CARDS',
      payload: {
        cardIds: detachedCardIds,
      },
    };
  } else if (actionType === 'CALL_LIAR') {
    if (payloadKeys.length !== 0) {
      return null;
    }

    return {
      actionId,
      expectedRevision,
      turnId,
      actionType: 'CALL_LIAR',
      payload: {},
    };
  }

  return null;
}
