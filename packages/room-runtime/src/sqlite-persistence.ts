import type {
  RoomAuthorityState,
  RoomLifecycle,
  RoomAlarmKind,
} from './room-state.js';
import type {
  ProcessedGameplayActionRegistry,
  ProcessedGameplayActionRecord,
} from './gameplay-admission.js';
import type { ClientGameplayActionType } from './gameplay-protocol.js';

export const ROOM_RETENTION_DURATION_MS = 86_400_000; // 24 hours

export interface SqlStorageCursor<T = Record<string, unknown>> extends Iterable<T> {
  toArray(): T[];
  one(): T | null;
}

export interface SqlStorage {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T>;
}

/**
 * Creates the required SQLite tables for a Room Durable Object instance:
 * 1. room_state (single snapshot per room)
 * 2. processed_actions (actionId deduplication registry)
 */
export function initRoomSqliteSchema(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS room_state (
      room_id TEXT PRIMARY KEY,
      lifecycle TEXT NOT NULL,
      revision INTEGER NOT NULL,
      host_player_id TEXT,
      current_turn_id TEXT,
      current_turn_deadline INTEGER,
      active_alarm_kind TEXT,
      active_alarm_due_at INTEGER,
      active_alarm_generation INTEGER,
      members_json TEXT NOT NULL,
      match_json TEXT,
      updated_at INTEGER NOT NULL
    )
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS processed_actions (
      action_id TEXT PRIMARY KEY,
      actor_player_id TEXT NOT NULL,
      expected_revision INTEGER NOT NULL,
      turn_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      resulting_revision INTEGER NOT NULL
    )
  `);
}

/**
 * Persists the current RoomAuthorityState into SQLite.
 */
export function saveRoomStateSqlite<TMatchSnapshot = unknown>(
  sql: SqlStorage,
  roomState: RoomAuthorityState<TMatchSnapshot>,
  updatedAtMs?: number
): void {
  if (!roomState || typeof roomState !== 'object') {
    throw new Error('Invalid roomState: must be a valid room state object');
  }

  const now = updatedAtMs !== undefined ? updatedAtMs : Date.now();

  sql.exec(
    `INSERT OR REPLACE INTO room_state (
      room_id, lifecycle, revision, host_player_id, current_turn_id,
      current_turn_deadline, active_alarm_kind, active_alarm_due_at,
      active_alarm_generation, members_json, match_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    roomState.roomId,
    roomState.lifecycle,
    roomState.revision,
    roomState.hostPlayerId ?? null,
    roomState.currentTurnId ?? null,
    roomState.currentTurnDeadline ?? null,
    roomState.activeAlarm?.kind ?? null,
    roomState.activeAlarm?.dueAt ?? null,
    roomState.activeAlarm?.generation ?? null,
    JSON.stringify(roomState.members),
    roomState.match !== null && roomState.match !== undefined ? JSON.stringify(roomState.match) : null,
    now
  );
}

/**
 * Loads and deserializes RoomAuthorityState from SQLite by roomId.
 * Returns null if no record exists.
 */
export function loadRoomStateSqlite<TMatchSnapshot = unknown>(
  sql: SqlStorage,
  roomId: string
): RoomAuthorityState<TMatchSnapshot> | null {
  if (typeof roomId !== 'string' || roomId.trim().length === 0) {
    throw new Error('Invalid roomId: must be a non-empty string');
  }

  const cursor = sql.exec<{
    room_id: string;
    lifecycle: string;
    revision: number;
    host_player_id: string | null;
    current_turn_id: string | null;
    current_turn_deadline: number | null;
    active_alarm_kind: string | null;
    active_alarm_due_at: number | null;
    active_alarm_generation: number | null;
    members_json: string;
    match_json: string | null;
    updated_at: number;
  }>('SELECT * FROM room_state WHERE room_id = ?', roomId.trim());

  const row = cursor.one();
  if (!row) {
    return null;
  }

  let activeAlarm = null;
  if (
    row.active_alarm_kind &&
    row.active_alarm_due_at !== null &&
    row.active_alarm_generation !== null
  ) {
    activeAlarm = {
      kind: row.active_alarm_kind as RoomAlarmKind,
      dueAt: Number(row.active_alarm_due_at),
      generation: Number(row.active_alarm_generation),
    };
  }

  return {
    roomId: row.room_id,
    lifecycle: row.lifecycle as RoomLifecycle,
    revision: Number(row.revision),
    members: JSON.parse(row.members_json),
    hostPlayerId: row.host_player_id ?? null,
    match: row.match_json ? (JSON.parse(row.match_json) as TMatchSnapshot) : null,
    currentTurnId: row.current_turn_id ?? null,
    currentTurnDeadline: row.current_turn_deadline !== null ? Number(row.current_turn_deadline) : null,
    activeAlarm,
  };
}

/**
 * Saves a single processed action into the SQLite processed_actions table.
 */
export function saveProcessedActionSqlite(
  sql: SqlStorage,
  record: ProcessedGameplayActionRecord
): void {
  sql.exec(
    `INSERT OR REPLACE INTO processed_actions (
      action_id, actor_player_id, expected_revision, turn_id, action_type, payload_json, resulting_revision
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    record.actionId,
    record.actorPlayerId,
    record.expectedRevision,
    record.turnId,
    record.actionType,
    JSON.stringify(record.payload),
    record.resultingRevision
  );
}

/**
 * Loads all processed action records from SQLite into a prototype-safe registry.
 */
export function loadProcessedActionsSqlite(sql: SqlStorage): ProcessedGameplayActionRegistry {
  const cursor = sql.exec<{
    action_id: string;
    actor_player_id: string;
    expected_revision: number;
    turn_id: string;
    action_type: string;
    payload_json: string;
    resulting_revision: number;
  }>('SELECT * FROM processed_actions');

  const rows = cursor.toArray();
  const registry: ProcessedGameplayActionRegistry = Object.create(null);

  for (const row of rows) {
    registry[row.action_id] = {
      actionId: row.action_id,
      actorPlayerId: row.actor_player_id,
      expectedRevision: Number(row.expected_revision),
      turnId: row.turn_id,
      actionType: row.action_type as ClientGameplayActionType,
      payload: JSON.parse(row.payload_json),
      resultingRevision: Number(row.resulting_revision),
    };
  }

  return registry;
}

/**
 * Pure check implementing 24-hour inactivity retention policy for finished or abandoned rooms (ADR-014).
 */
export function isRoomEligibleForRetentionDeletion(
  roomState: RoomAuthorityState<unknown>,
  nowMs: number
): boolean {
  if (roomState.lifecycle !== 'MATCH_FINISHED' && roomState.lifecycle !== 'ABANDONED') {
    return false;
  }

  if (roomState.activeAlarm?.kind === 'ROOM_RETENTION') {
    return nowMs >= roomState.activeAlarm.dueAt;
  }

  return false;
}

/**
 * Arms the 24-hour ROOM_RETENTION alarm when a room transitions to MATCH_FINISHED or ABANDONED.
 */
export function armRoomRetentionAlarm<TMatchSnapshot = unknown>(
  roomState: RoomAuthorityState<TMatchSnapshot>,
  authoritativeNowMs: number
): RoomAuthorityState<TMatchSnapshot> {
  if (roomState.lifecycle !== 'MATCH_FINISHED' && roomState.lifecycle !== 'ABANDONED') {
    throw new Error(`Cannot arm retention alarm for active lifecycle '${roomState.lifecycle}'`);
  }

  return {
    ...roomState,
    activeAlarm: {
      kind: 'ROOM_RETENTION',
      dueAt: authoritativeNowMs + ROOM_RETENTION_DURATION_MS,
      generation: roomState.revision,
    },
  };
}

/**
 * Deletes all state associated with a room from SQLite.
 */
export function deleteRoomSqlite(sql: SqlStorage, roomId: string): void {
  sql.exec('DELETE FROM room_state WHERE room_id = ?', roomId.trim());
  sql.exec('DELETE FROM processed_actions');
}

/**
 * In-memory test implementation of Cloudflare Durable Object SqlStorage interface.
 */
export function createInMemorySqlStorage(): SqlStorage {
  const roomStateTable = new Map<string, Record<string, unknown>>();
  const processedActionsTable = new Map<string, Record<string, unknown>>();

  return {
    exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T> {
      const normalized = query.trim().replace(/\s+/g, ' ');

      if (normalized.startsWith('CREATE TABLE')) {
        // Schema creation no-op in memory
        return createCursor([]);
      }

      if (normalized.startsWith('INSERT OR REPLACE INTO room_state')) {
        const [
          roomId, lifecycle, revision, hostPlayerId, currentTurnId,
          currentTurnDeadline, activeAlarmKind, activeAlarmDueAt,
          activeAlarmGeneration, membersJson, matchJson, updatedAt
        ] = bindings;

        const row: Record<string, unknown> = {
          room_id: roomId,
          lifecycle,
          revision,
          host_player_id: hostPlayerId,
          current_turn_id: currentTurnId,
          current_turn_deadline: currentTurnDeadline,
          active_alarm_kind: activeAlarmKind,
          active_alarm_due_at: activeAlarmDueAt,
          active_alarm_generation: activeAlarmGeneration,
          members_json: membersJson,
          match_json: matchJson,
          updated_at: updatedAt,
        };
        roomStateTable.set(String(roomId), row);
        return createCursor([]);
      }

      if (
        normalized.startsWith('SELECT room_id FROM room_state LIMIT 1') ||
        normalized.startsWith('SELECT * FROM room_state LIMIT 1')
      ) {
        const first = Array.from(roomStateTable.values())[0];
        return createCursor(first ? [(first as unknown) as T] : []);
      }

      if (
        normalized.startsWith('SELECT * FROM room_state WHERE room_id = ?') ||
        normalized.startsWith('SELECT room_id FROM room_state WHERE room_id = ?')
      ) {
        const roomId = String(bindings[0]);
        const row = roomStateTable.get(roomId);
        return createCursor(row ? [(row as unknown) as T] : []);
      }

      if (normalized.startsWith('INSERT OR REPLACE INTO processed_actions')) {
        const [
          actionId, actorPlayerId, expectedRevision, turnId, actionType, payloadJson, resultingRevision
        ] = bindings;

        const row: Record<string, unknown> = {
          action_id: actionId,
          actor_player_id: actorPlayerId,
          expected_revision: expectedRevision,
          turn_id: turnId,
          action_type: actionType,
          payload_json: payloadJson,
          resulting_revision: resultingRevision,
        };
        processedActionsTable.set(String(actionId), row);
        return createCursor([]);
      }

      if (normalized.startsWith('SELECT * FROM processed_actions')) {
        const rows = Array.from(processedActionsTable.values()) as unknown as T[];
        return createCursor(rows);
      }

      if (normalized.startsWith('DELETE FROM room_state WHERE room_id = ?')) {
        const roomId = String(bindings[0]);
        roomStateTable.delete(roomId);
        return createCursor([]);
      }

      if (normalized.startsWith('UPDATE room_state SET')) {
        const roomId = String(bindings[bindings.length - 1]);
        const existing = roomStateTable.get(roomId);
        if (existing) {
          if (normalized.includes("lifecycle = 'MATCH_FINISHED'")) {
            existing.lifecycle = 'MATCH_FINISHED';
          }
          if (normalized.includes("active_alarm_kind = 'ROOM_RETENTION'")) {
            existing.active_alarm_kind = 'ROOM_RETENTION';
            existing.active_alarm_generation = 1;
          }
          existing.active_alarm_due_at = bindings[0];
          existing.updated_at = bindings[1];
        }
        return createCursor([]);
      }

      if (normalized.startsWith('DELETE FROM processed_actions')) {
        processedActionsTable.clear();
        return createCursor([]);
      }

      throw new Error(`Unsupported query in test in-memory SQL mock: ${query}`);
    },
  };
}

function createCursor<T>(rows: T[]): SqlStorageCursor<T> {
  return {
    toArray(): T[] {
      return [...rows];
    },
    one(): T | null {
      return rows.length > 0 ? rows[0] : null;
    },
    [Symbol.iterator](): Iterator<T> {
      let index = 0;
      return {
        next(): IteratorResult<T> {
          if (index < rows.length) {
            return { value: rows[index++], done: false };
          }
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };
}
