import type { DurableObjectState } from '@cloudflare/workers-types';
import type { RandomSource } from '@liars-telegram-game/game-core';
import {
  RoomCoordinator,
  parseGameplayActionEnvelope,
  deriveProviderAlarmSyncPlan,
  type RecipientRoomProjection,
  type RoomClientCommand,
} from '@liars-telegram-game/room-runtime';
import type { Env } from './types.js';

export const cryptoRandomSource: RandomSource = {
  nextInt(max: number): number {
    if (max <= 1) return 0;
    const limit = Math.floor(0xffffffff / max) * max;
    const buf = new Uint32Array(1);
    while (true) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) {
        return buf[0] % max;
      }
    }
  },
};

interface SocketConnectionInfo {
  connectionId: string;
  playerId: string;
}

export class RoomDurableObject {
  private state: DurableObjectState;
  private env: Env;
  private coordinator: RoomCoordinator | null = null;
  private sockets = new Map<WebSocket, SocketConnectionInfo>();
  private connectionCounter = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private ensureCoordinator(roomId: string): RoomCoordinator {
    if (!this.coordinator) {
      this.coordinator = new RoomCoordinator(roomId, this.state.storage.sql as any);
    }
    return this.coordinator;
  }

  private getOrRehydrateCoordinator(): RoomCoordinator | null {
    if (this.coordinator) {
      return this.coordinator;
    }
    try {
      const row = (this.state.storage.sql as any)
        .exec('SELECT room_id FROM room_state LIMIT 1')
        .toArray()[0] as { room_id?: string } | undefined;
      if (row && row.room_id) {
        this.coordinator = new RoomCoordinator(row.room_id, this.state.storage.sql as any);
        return this.coordinator;
      }
    } catch {
      // Table may not exist yet if room was never initialized
    }
    return null;
  }

  public getRoomState() {
    const coord = this.getOrRehydrateCoordinator();
    return coord ? coord.getRoomState() : null;
  }

  public async syncAlarm(): Promise<void> {
    if (!this.coordinator) return;
    const currentAlarm = await this.state.storage.getAlarm();
    const plan = deriveProviderAlarmSyncPlan(this.coordinator.getRoomState(), currentAlarm);
    if (plan.decision === 'SET_ALARM') {
      await this.state.storage.setAlarm(plan.dueAt);
    } else if (plan.decision === 'DELETE_ALARM') {
      await this.state.storage.deleteAlarm();
    }
  }

  public broadcastProjections(projections: Map<string, RecipientRoomProjection>): void {
    for (const [ws, info] of this.sockets) {
      const projection = projections.get(info.playerId);
      if (projection) {
        try {
          ws.send(JSON.stringify({ type: 'PROJECTION', projection }));
        } catch {
          // Socket send failure will be handled by close/error handler
        }
      }
    }
  }

  public async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Diagnostics / test state inspection
    if (url.pathname.endsWith('/state')) {
      const coord = this.getOrRehydrateCoordinator();
      if (!coord) {
        return new Response(JSON.stringify({ error: 'ROOM_NOT_INITIALIZED' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(coord.getRoomState()), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname.endsWith('/ping')) {
      return new Response('pong', { status: 200 });
    }

    // WebSocket upgrade
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', { status: 426 });
    }

    const playerId = request.headers.get('x-player-id');
    if (!playerId || playerId.trim().length === 0) {
      return new Response('Unauthorized: Missing x-player-id header', { status: 401 });
    }

    const roomId =
      request.headers.get('x-room-id') ||
      url.pathname.split('/').filter(Boolean)[1] ||
      'unknown_room';

    const coordinator = this.ensureCoordinator(roomId);
    const connectionId = `conn_${++this.connectionCounter}_${Date.now()}`;

    // Create WebSocket pair for Durable Object
    const webSocketPair = new (globalThis as any).WebSocketPair();
    const clientWs = (webSocketPair[0] ?? Object.values(webSocketPair)[0]) as WebSocket;
    const serverWs = (webSocketPair[1] ?? Object.values(webSocketPair)[1]) as WebSocket;

    serverWs.accept();
    this.sockets.set(serverWs, { connectionId, playerId });

    // Handle initial connect presence
    const nowMs = Date.now();
    const projections = coordinator.onPlayerConnect(connectionId, playerId, nowMs);
    this.broadcastProjections(projections);
    await this.syncAlarm();

    // Wire socket event listeners
    serverWs.addEventListener('message', async (event: any) => {
      try {
        const rawText =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
        const parsed = JSON.parse(rawText);
        await this.handleClientMessage(serverWs, parsed);
      } catch (err) {
        try {
          serverWs.send(JSON.stringify({ type: 'ERROR', error: (err as Error).message }));
        } catch {}
      }
    });

    const onCloseOrError = async () => {
      await this.handleSocketClose(serverWs);
    };

    serverWs.addEventListener('close', onCloseOrError);
    serverWs.addEventListener('error', onCloseOrError);

    try {
      return new Response(null, {
        status: 101,
        webSocket: clientWs as any,
      });
    } catch {
      // In test/Node.js environments where global Response enforces 200..599:
      const res = new Response(null, { status: 200 });
      Object.defineProperty(res, 'status', { value: 101 });
      (res as any).webSocket = clientWs;
      return res;
    }
  }

  private async handleSocketClose(ws: WebSocket): Promise<void> {
    const info = this.sockets.get(ws);
    if (!info) return;
    this.sockets.delete(ws);

    if (this.coordinator) {
      const nowMs = Date.now();
      const projections = this.coordinator.onPlayerDisconnect(info.connectionId, info.playerId, nowMs);
      this.broadcastProjections(projections);
      await this.syncAlarm();
    }
  }

  private async handleClientMessage(ws: WebSocket, rawData: unknown): Promise<void> {
    const info = this.sockets.get(ws);
    if (!info || !this.coordinator) return;

    let command: RoomClientCommand;
    if (typeof rawData !== 'object' || rawData === null) {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'MALFORMED_MESSAGE' }));
      return;
    }

    const msg = rawData as Record<string, unknown>;
    if (msg.type === 'JOIN') {
      command = { type: 'JOIN' };
    } else if (msg.type === 'LEAVE') {
      command = { type: 'LEAVE' };
    } else if (msg.type === 'START_MATCH') {
      command = {
        type: 'START_MATCH',
        initialTurnId: typeof msg.initialTurnId === 'string' ? msg.initialTurnId : undefined,
      };
    } else if (msg.type === 'GAMEPLAY_ACTION') {
      const parsedEnvelope = parseGameplayActionEnvelope(msg.envelope);
      if (!parsedEnvelope) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'INVALID_GAMEPLAY_ACTION_ENVELOPE' }));
        return;
      }
      command = { type: 'GAMEPLAY_ACTION', envelope: parsedEnvelope };
    } else if (msg.actionType === 'PLAY_CARDS' || msg.actionType === 'CALL_LIAR') {
      const parsedEnvelope = parseGameplayActionEnvelope(msg);
      if (!parsedEnvelope) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'INVALID_GAMEPLAY_ACTION_ENVELOPE' }));
        return;
      }
      command = { type: 'GAMEPLAY_ACTION', envelope: parsedEnvelope };
    } else {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'UNKNOWN_COMMAND_TYPE' }));
      return;
    }

    const nowMs = Date.now();
    const result = this.coordinator.handleClientCommand(
      info.playerId,
      command,
      nowMs,
      cryptoRandomSource
    );

    if (command.type === 'JOIN' && result.success) {
      // Register connection in presence now that player is an official member
      const memberProjections = this.coordinator.onPlayerConnect(
        info.connectionId,
        info.playerId,
        nowMs
      );
      this.broadcastProjections(memberProjections);
    } else {
      if (!result.success) {
        ws.send(JSON.stringify({ type: 'ERROR', error: result.error }));
      }
      this.broadcastProjections(result.projections);
    }

    await this.syncAlarm();
  }

  public async alarm(authoritativeNowMs?: number): Promise<void> {
    const coord = this.getOrRehydrateCoordinator();
    if (!coord) {
      return;
    }

    const nowMs = authoritativeNowMs ?? Date.now();
    const res = coord.onAlarm(nowMs, cryptoRandomSource);

    if (res.decision === 'ROOM_DELETED') {
      for (const [ws] of this.sockets) {
        try {
          ws.close(1000, 'Room expired');
        } catch {}
      }
      this.sockets.clear();
      await this.state.storage.deleteAlarm();
      return;
    }

    this.broadcastProjections(res.projections);
    await this.syncAlarm();
  }
}
