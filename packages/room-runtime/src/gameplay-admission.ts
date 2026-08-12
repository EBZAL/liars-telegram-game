import type { RoomAuthorityState } from './room-state.js';
import type {
  GameplayActionEnvelope,
  ClientGameplayActionType,
  PlayCardsPayload,
  CallLiarPayload,
} from './gameplay-protocol.js';

export interface ProcessedGameplayActionRecord {
  actionId: string;
  expectedRevision: number;
  turnId: string;
  actionType: ClientGameplayActionType;
  payload: PlayCardsPayload | CallLiarPayload;
  resultingRevision: number;
}

export type ProcessedGameplayActionRegistry = Record<string, ProcessedGameplayActionRecord>;

export type GameplayActionAdmissionDecision = 'ACCEPT' | 'DUPLICATE' | 'REJECT';

export type GameplayActionRejectionReason =
  | 'ACTION_ID_CONFLICT'
  | 'STALE_REVISION'
  | 'MATCH_NOT_ACTIVE'
  | 'TURN_MISMATCH';

export interface AcceptAdmissionResult {
  decision: 'ACCEPT';
}

export interface DuplicateAdmissionResult {
  decision: 'DUPLICATE';
  priorResultingRevision: number;
}

export interface RejectAdmissionResult {
  decision: 'REJECT';
  reason: GameplayActionRejectionReason;
}

export type GameplayActionAdmissionResult =
  | AcceptAdmissionResult
  | DuplicateAdmissionResult
  | RejectAdmissionResult;

export function createProcessedGameplayActionRegistry(): ProcessedGameplayActionRegistry {
  return Object.create(null) as ProcessedGameplayActionRegistry;
}

export function nextRoomRevision(currentRevision: number): number {
  if (
    typeof currentRevision !== 'number' ||
    !Number.isSafeInteger(currentRevision) ||
    currentRevision < 0 ||
    currentRevision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`Invalid revision input: ${currentRevision}`);
  }
  return currentRevision + 1;
}

export function isExactRequest(
  record: ProcessedGameplayActionRecord,
  envelope: GameplayActionEnvelope
): boolean {
  if (record.expectedRevision !== envelope.expectedRevision) return false;
  if (record.turnId !== envelope.turnId) return false;
  if (record.actionType !== envelope.actionType) return false;

  if (record.actionType === 'PLAY_CARDS' && envelope.actionType === 'PLAY_CARDS') {
    const recCardIds = record.payload.cardIds;
    const envCardIds = envelope.payload.cardIds;
    if (recCardIds.length !== envCardIds.length) return false;
    for (let i = 0; i < recCardIds.length; i++) {
      if (recCardIds[i] !== envCardIds[i]) return false;
    }
    return true;
  }

  if (record.actionType === 'CALL_LIAR' && envelope.actionType === 'CALL_LIAR') {
    return true;
  }

  return false;
}

export function evaluateGameplayActionAdmission(
  roomState: RoomAuthorityState<unknown>,
  envelope: GameplayActionEnvelope,
  processedRegistry: ProcessedGameplayActionRegistry
): GameplayActionAdmissionResult {
  const actionId = envelope.actionId;
  const hasExisting = Object.prototype.hasOwnProperty.call(processedRegistry, actionId);

  // Step 1 — actionId lookup
  if (hasExisting) {
    const existingRecord = processedRegistry[actionId];
    if (isExactRequest(existingRecord, envelope)) {
      return {
        decision: 'DUPLICATE',
        priorResultingRevision: existingRecord.resultingRevision,
      };
    }
    return {
      decision: 'REJECT',
      reason: 'ACTION_ID_CONFLICT',
    };
  }

  // Step 2 — unseen actionId revision check
  if (envelope.expectedRevision !== roomState.revision) {
    return {
      decision: 'REJECT',
      reason: 'STALE_REVISION',
    };
  }

  // Step 3 — lifecycle check
  if (roomState.lifecycle !== 'MATCH_ACTIVE') {
    return {
      decision: 'REJECT',
      reason: 'MATCH_NOT_ACTIVE',
    };
  }

  // Step 4 — turn check
  if (roomState.currentTurnId === null || envelope.turnId !== roomState.currentTurnId) {
    return {
      decision: 'REJECT',
      reason: 'TURN_MISMATCH',
    };
  }

  // Step 5 — ACCEPT
  return {
    decision: 'ACCEPT',
  };
}

export function recordSuccessfulGameplayAction(
  registry: ProcessedGameplayActionRegistry,
  envelope: GameplayActionEnvelope,
  resultingRevision: number
): ProcessedGameplayActionRegistry {
  if (
    typeof resultingRevision !== 'number' ||
    !Number.isSafeInteger(resultingRevision) ||
    resultingRevision !== envelope.expectedRevision + 1
  ) {
    throw new Error(
      `Invalid resultingRevision ${resultingRevision}: must equal expectedRevision + 1 (${envelope.expectedRevision + 1})`
    );
  }

  const actionId = envelope.actionId;
  const hasExisting = Object.prototype.hasOwnProperty.call(registry, actionId);

  if (hasExisting) {
    const existingRecord = registry[actionId];
    if (
      isExactRequest(existingRecord, envelope) &&
      existingRecord.resultingRevision === resultingRevision
    ) {
      return registry;
    }
    throw new Error(
      `Action ID conflict: actionId '${actionId}' already exists with different request or resultingRevision`
    );
  }

  const record: ProcessedGameplayActionRecord = {
    actionId: envelope.actionId,
    expectedRevision: envelope.expectedRevision,
    turnId: envelope.turnId,
    actionType: envelope.actionType,
    payload:
      envelope.actionType === 'PLAY_CARDS'
        ? { cardIds: [...envelope.payload.cardIds] }
        : {},
    resultingRevision,
  };

  const nextRegistry = Object.create(null) as ProcessedGameplayActionRegistry;
  Object.assign(nextRegistry, registry);
  nextRegistry[actionId] = record;

  return nextRegistry;
}
