import type { MatchState, RandomSource } from '@liars-telegram-game/game-core';
import type {
  RoomAuthorityState,
} from './room-state.js';
import { createInitialRoomState } from './room-state.js';
import type {
  RoomPresenceRegistry,
} from './presence.js';
import {
  createRoomPresenceRegistry,
  registerAuthenticatedRoomConnection,
  unregisterAuthenticatedRoomConnection,
  evaluateRoomPresence,
} from './presence.js';
import {
  pauseActiveMatchForNoLivingConnections,
  resumePausedMatchForLivingPresenceTransition,
} from './presence-lifecycle.js';
import type {
  ProcessedGameplayActionRegistry,
} from './gameplay-admission.js';
import {
  createProcessedGameplayActionRegistry,
} from './gameplay-admission.js';
import type { GameplayActionEnvelope } from './gameplay-protocol.js';
import {
  executeTimedClientGameplayWithPresenceLifecycle,
} from './timed-gameplay-presence-lifecycle.js';
import {
  executeSystemTimeoutWithPresenceLifecycle,
} from './system-timeout-presence-lifecycle.js';
import type { RecipientRoomProjection } from './recipient-projection.js';
import { deriveRecipientRoomProjection } from './recipient-projection.js';
import {
  joinLobbyRoom,
  leaveLobbyRoom,
  handleLobbyHostPresenceChange,
  applyHostGraceTimeout,
  startMatchFromLobby,
} from './lobby-lifecycle.js';
import type { SqlStorage } from './sqlite-persistence.js';
import {
  initRoomSqliteSchema,
  saveRoomStateSqlite,
  loadRoomStateSqlite,
  saveProcessedActionSqlite,
  loadProcessedActionsSqlite,
  isRoomEligibleForRetentionDeletion,
  armRoomRetentionAlarm,
  deleteRoomSqlite,
} from './sqlite-persistence.js';

export type RoomClientCommand =
  | { type: 'JOIN' }
  | { type: 'LEAVE' }
  | { type: 'START_MATCH'; initialTurnId?: string }
  | { type: 'GAMEPLAY_ACTION'; envelope: GameplayActionEnvelope };

export interface RoomCommandExecutionResult {
  success: boolean;
  error?: string;
  roomState: RoomAuthorityState<MatchState | null>;
  projections: Map<string, RecipientRoomProjection>;
}

export class RoomCoordinator {
  private roomState: RoomAuthorityState<MatchState | null>;
  private presenceRegistry: RoomPresenceRegistry;
  private processedRegistry: ProcessedGameplayActionRegistry;
  private sql: SqlStorage;
  private nextTurnCounter: number;

  constructor(
    roomId: string,
    sql: SqlStorage,
    initialTurnCounter: number = 1
  ) {
    this.sql = sql;
    this.nextTurnCounter = initialTurnCounter;
    this.presenceRegistry = createRoomPresenceRegistry();
    this.processedRegistry = createProcessedGameplayActionRegistry();

    // Initialize database tables
    initRoomSqliteSchema(this.sql);

    // Load from SQLite or create initial room state
    const existing = loadRoomStateSqlite<MatchState | null>(this.sql, roomId);
    if (existing !== null) {
      this.roomState = existing;
      this.processedRegistry = loadProcessedActionsSqlite(this.sql);
    } else {
      this.roomState = createInitialRoomState(roomId);
      saveRoomStateSqlite(this.sql, this.roomState);
    }
  }

  public getRoomState(): RoomAuthorityState<MatchState | null> {
    return this.roomState;
  }

  public getPresenceRegistry(): RoomPresenceRegistry {
    return this.presenceRegistry;
  }

  public getProcessedRegistry(): ProcessedGameplayActionRegistry {
    return this.processedRegistry;
  }

  /**
   * Derives projections for all currently connected members.
   */
  public getConnectedMemberProjections(): Map<string, RecipientRoomProjection> {
    const projections = new Map<string, RecipientRoomProjection>();
    const presence = evaluateRoomPresence(this.roomState, this.presenceRegistry);

    for (const memberId of presence.connectedMemberPlayerIds) {
      const result = deriveRecipientRoomProjection(
        this.roomState as RoomAuthorityState<MatchState>,
        { playerId: memberId }
      );
      if (result.decision === 'PROJECTED') {
        projections.set(memberId, result.projection);
      }
    }

    return projections;
  }

  /**
   * Handles a player connection:
   * - Registers connection in presence registry if member.
   * - Handles lobby host presence or match resume (if paused with living reconnect).
   * - Persists state if changed.
   * - Returns projections for all connected members.
   */
  public onPlayerConnect(
    connectionId: string,
    playerId: string,
    nowMs: number
  ): Map<string, RecipientRoomProjection> {
    const isMember = this.roomState.members.some((m) => m.playerId === playerId);
    if (!isMember) {
      // Non-member connection in Lobby or Match (e.g. prospective player)
      return this.getConnectedMemberProjections();
    }

    const previousPresence = this.presenceRegistry;
    this.presenceRegistry = registerAuthenticatedRoomConnection(
      this.roomState,
      this.presenceRegistry,
      { connectionId, playerId }
    );

    if (this.roomState.lifecycle === 'LOBBY') {
      const stateBefore = this.roomState;
      this.roomState = handleLobbyHostPresenceChange(this.roomState, this.presenceRegistry, nowMs);
      if (stateBefore !== this.roomState) {
        saveRoomStateSqlite(this.sql, this.roomState, nowMs);
      }
    } else if (this.roomState.lifecycle === 'MATCH_PAUSED_NO_LIVING_CONNECTIONS') {
      const resumeResult = resumePausedMatchForLivingPresenceTransition(
        this.roomState as RoomAuthorityState<MatchState>,
        previousPresence,
        this.presenceRegistry,
        nowMs
      );
      if (resumeResult.status === 'RESUMED') {
        this.roomState = resumeResult.roomState;
        saveRoomStateSqlite(this.sql, this.roomState, nowMs);
      }
    }

    return this.getConnectedMemberProjections();
  }

  /**
   * Handles a player disconnect:
   * - Unregisters connection.
   * - Handles lobby host grace or match pause if living connections hit 0.
   * - Persists state if changed.
   * - Returns projections for all remaining connected members.
   */
  public onPlayerDisconnect(
    connectionId: string,
    playerId: string,
    nowMs: number
  ): Map<string, RecipientRoomProjection> {
    this.presenceRegistry = unregisterAuthenticatedRoomConnection(this.presenceRegistry, {
      connectionId,
      playerId,
    });

    if (this.roomState.lifecycle === 'LOBBY') {
      const stateBefore = this.roomState;
      this.roomState = handleLobbyHostPresenceChange(this.roomState, this.presenceRegistry, nowMs);
      if (stateBefore !== this.roomState) {
        saveRoomStateSqlite(this.sql, this.roomState, nowMs);
      }
    } else if (this.roomState.lifecycle === 'MATCH_ACTIVE') {
      const pauseResult = pauseActiveMatchForNoLivingConnections(
        this.roomState as RoomAuthorityState<MatchState>,
        this.presenceRegistry
      );
      if (pauseResult.status === 'PAUSED') {
        this.roomState = pauseResult.roomState;
        saveRoomStateSqlite(this.sql, this.roomState, nowMs);
      }
    }

    return this.getConnectedMemberProjections();
  }

  /**
   * Handles client commands (JOIN, LEAVE, START_MATCH, GAMEPLAY_ACTION).
   */
  public handleClientCommand(
    playerId: string,
    command: RoomClientCommand,
    nowMs: number,
    random: RandomSource
  ): RoomCommandExecutionResult {
    try {
      switch (command.type) {
        case 'JOIN': {
          this.roomState = joinLobbyRoom(this.roomState, playerId);
          saveRoomStateSqlite(this.sql, this.roomState, nowMs);
          break;
        }

        case 'LEAVE': {
          this.roomState = leaveLobbyRoom(this.roomState, playerId);
          saveRoomStateSqlite(this.sql, this.roomState, nowMs);
          break;
        }

        case 'START_MATCH': {
          const matchRoom = startMatchFromLobby(
            this.roomState,
            playerId,
            random,
            nowMs,
            command.initialTurnId
          );
          this.roomState = matchRoom;
          saveRoomStateSqlite(this.sql, this.roomState, nowMs);
          break;
        }

        case 'GAMEPLAY_ACTION': {
          const preparedNextTurn = { turnId: `turn-${++this.nextTurnCounter}` };
          const result = executeTimedClientGameplayWithPresenceLifecycle(
            this.roomState as RoomAuthorityState<MatchState>,
            command.envelope,
            this.processedRegistry,
            { playerId },
            preparedNextTurn,
            this.presenceRegistry,
            nowMs,
            random
          );

          if (
            result.decision === 'COMMITTED_ACTIVE' ||
            result.decision === 'COMMITTED_PAUSED' ||
            result.decision === 'COMMITTED_FINISHED'
          ) {
            this.roomState = result.roomState;
            this.processedRegistry = result.processedRegistry;

            // If match finished, arm retention alarm
            if (this.roomState.lifecycle === 'MATCH_FINISHED') {
              this.roomState = armRoomRetentionAlarm(this.roomState, nowMs);
            }

            // Save processed action and state to SQLite
            const record = this.processedRegistry[command.envelope.actionId];
            if (record) {
              saveProcessedActionSqlite(this.sql, record);
            }
            saveRoomStateSqlite(this.sql, this.roomState, nowMs);
          } else if (result.decision === 'REJECT') {
            return {
              success: false,
              error: result.reason,
              roomState: this.roomState,
              projections: this.getConnectedMemberProjections(),
            };
          } else if (result.decision === 'DUPLICATE') {
            return {
              success: true,
              roomState: this.roomState,
              projections: this.getConnectedMemberProjections(),
            };
          } else if (result.decision === 'DEADLINE_DUE') {
            return {
              success: false,
              error: 'DEADLINE_DUE',
              roomState: this.roomState,
              projections: this.getConnectedMemberProjections(),
            };
          }
          break;
        }
      }

      return {
        success: true,
        roomState: this.roomState,
        projections: this.getConnectedMemberProjections(),
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        roomState: this.roomState,
        projections: this.getConnectedMemberProjections(),
      };
    }
  }

  /**
   * Handles provider alarms (HOST_GRACE, TURN_DEADLINE, ROOM_RETENTION).
   */
  public onAlarm(
    nowMs: number,
    random: RandomSource
  ): { decision: string; projections: Map<string, RecipientRoomProjection> } {
    if (this.roomState.activeAlarm === null) {
      return { decision: 'NO_ALARM', projections: this.getConnectedMemberProjections() };
    }

    const alarmKind = this.roomState.activeAlarm.kind;

    if (alarmKind === 'HOST_GRACE') {
      this.roomState = applyHostGraceTimeout(this.roomState, this.presenceRegistry, nowMs);
      saveRoomStateSqlite(this.sql, this.roomState, nowMs);
      return { decision: 'HOST_GRACE_MIGRATED', projections: this.getConnectedMemberProjections() };
    }

    if (alarmKind === 'TURN_DEADLINE') {
      const preparedNextTurn = { turnId: `turn-${++this.nextTurnCounter}` };
      const trigger = {
        kind: 'TURN_DEADLINE' as const,
        dueAt: this.roomState.activeAlarm.dueAt,
        generation: this.roomState.activeAlarm.generation,
      };

      const res = executeSystemTimeoutWithPresenceLifecycle(
        this.roomState as RoomAuthorityState<MatchState>,
        trigger,
        preparedNextTurn,
        this.presenceRegistry,
        nowMs,
        random
      );

      if (
        res.decision === 'COMMITTED_ACTIVE' ||
        res.decision === 'COMMITTED_PAUSED' ||
        res.decision === 'COMMITTED_FINISHED'
      ) {
        this.roomState = res.roomState;

        if (this.roomState.lifecycle === 'MATCH_FINISHED') {
          this.roomState = armRoomRetentionAlarm(this.roomState, nowMs);
        }

        saveRoomStateSqlite(this.sql, this.roomState, nowMs);
      }

      return { decision: res.decision, projections: this.getConnectedMemberProjections() };
    }

    if (alarmKind === 'ROOM_RETENTION') {
      if (isRoomEligibleForRetentionDeletion(this.roomState, nowMs)) {
        deleteRoomSqlite(this.sql, this.roomState.roomId);
        return { decision: 'ROOM_DELETED', projections: new Map() };
      }
      return { decision: 'NOT_EXPIRED', projections: this.getConnectedMemberProjections() };
    }

    return { decision: 'UNHANDLED_ALARM', projections: this.getConnectedMemberProjections() };
  }
}
