import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import workerDefault, { RoomDurableObject, cryptoRandomSource } from '../src/index.js';
import type { Env } from '../src/types.js';
import {
  createInMemorySqlStorage,
  type SqlStorage,
  type RecipientRoomProjection,
} from '@liars-telegram-game/room-runtime';

// In-memory WebSocket simulation
class MockWebSocket {
  public peer: MockWebSocket | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public messageListeners: Array<(ev: { data: string }) => void> = [];
  public closeListeners: Array<() => void> = [];
  public errorListeners: Array<() => void> = [];
  public accepted = false;
  public closed = false;
  public sentMessages: string[] = [];

  accept() {
    this.accepted = true;
  }

  addEventListener(event: string, handler: any) {
    if (event === 'message') this.messageListeners.push(handler);
    if (event === 'close') this.closeListeners.push(handler);
    if (event === 'error') this.errorListeners.push(handler);
  }

  send(data: string) {
    if (this.closed) throw new Error('Socket closed');
    this.sentMessages.push(data);
    if (this.peer && !this.peer.closed) {
      const ev = { data };
      if (this.peer.onmessage) this.peer.onmessage(ev);
      for (const l of this.peer.messageListeners) l(ev);
    }
  }

  close(_code?: number, _reason?: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.onclose) this.onclose();
    for (const l of this.closeListeners) l();
    if (this.peer && !this.peer.closed) {
      this.peer.closed = true;
      if (this.peer.onclose) this.peer.onclose();
      for (const l of this.peer.closeListeners) l();
    }
  }
}

class MockWebSocketPair {
  [0]: MockWebSocket;
  [1]: MockWebSocket;
  constructor() {
    const a = new MockWebSocket();
    const b = new MockWebSocket();
    a.peer = b;
    b.peer = a;
    this[0] = a;
    this[1] = b;
  }
}

// Durable Object mock storage
class MockDurableObjectStorage {
  public sql: SqlStorage;
  public alarmDueAt: number | null = null;

  constructor() {
    this.sql = createInMemorySqlStorage();
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmDueAt;
  }

  async setAlarm(dueAt: number | Date): Promise<void> {
    this.alarmDueAt = typeof dueAt === 'number' ? dueAt : dueAt.getTime();
  }

  async deleteAlarm(): Promise<void> {
    this.alarmDueAt = null;
  }
}

class MockDurableObjectState {
  public id = { toString: () => 'mock_room_do_id' };
  public storage = new MockDurableObjectStorage();
}

class MockDurableObjectNamespace {
  public instances = new Map<string, { do: RoomDurableObject; state: MockDurableObjectState }>();

  idFromName(name: string) {
    return { toString: () => name, name };
  }

  get(id: { name: string }) {
    let entry = this.instances.get(id.name);
    if (!entry) {
      const state = new MockDurableObjectState();
      const doInst = new RoomDurableObject(state as any, {} as any);
      entry = { do: doInst, state };
      this.instances.set(id.name, entry);
    }
    return {
      fetch: (req: Request) => entry!.do.fetch(req),
    };
  }
}

function createSignedInitData(params: Record<string, string>, botToken: string): string {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'hash') pairs.push({ key, value });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheckString = pairs.map(({ key, value }) => `${key}=${value}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, value);
  }
  searchParams.set('hash', hash);
  return searchParams.toString();
}

describe('Cloudflare Worker and Durable Object Integration', () => {
  const TEST_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567';
  let mockNamespace: MockDurableObjectNamespace;

  beforeEach(() => {
    (globalThis as any).WebSocketPair = MockWebSocketPair;
    mockNamespace = new MockDurableObjectNamespace();
  });

  describe('Worker HTTP Router', () => {
    it('serves GET /api/health with 200 OK', async () => {
      const req = new Request('https://game.example.com/api/health', { method: 'GET' });
      const env: Env = { ROOM_DO: mockNamespace as any };

      const res = await workerDefault.fetch(req, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe('ok');
    });

    it('generates a URL-safe room ID on POST /api/room', async () => {
      const req = new Request('https://game.example.com/api/room', { method: 'POST' });
      const env: Env = { ROOM_DO: mockNamespace as any };

      const res = await workerDefault.fetch(req, env);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { roomId: string };
      expect(typeof data.roomId).toBe('string');
      expect(data.roomId).toMatch(/^r_[a-f0-9]{8}$/);
    });

    it('handles Telegram webhook secret verification and bot start command', async () => {
      const env: Env = {
        ROOM_DO: mockNamespace as any,
        TELEGRAM_WEBHOOK_SECRET: 'my_secret_token',
        BOT_USERNAME: 'LiarsDeckBot',
        APP_URL: 'https://game.example.com',
      };

      // 1. Rejects wrong secret token
      const wrongSecretReq = new Request('https://game.example.com/api/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong',
        },
        body: JSON.stringify({}),
      });
      const res401 = await workerDefault.fetch(wrongSecretReq, env);
      expect(res401.status).toBe(401);

      // 2. Accepts valid webhook /start command without roomId
      const startReq = new Request('https://game.example.com/api/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'my_secret_token',
        },
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 10,
            chat: { id: 12345, type: 'private' },
            text: '/start',
          },
        }),
      });
      const resStart = await workerDefault.fetch(startReq, env);
      expect(resStart.status).toBe(200);
      const dataStart = (await resStart.json()) as any;
      expect(dataStart.method).toBe('sendMessage');
      expect(dataStart.reply_markup.inline_keyboard[0][0].text).toContain('Play');

      // 3. Accepts /start with room ID deep link
      const inviteReq = new Request('https://game.example.com/api/telegram-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'my_secret_token',
        },
        body: JSON.stringify({
          update_id: 2,
          message: {
            message_id: 11,
            chat: { id: 12345, type: 'private' },
            text: '/start r_abc12345',
          },
        }),
      });
      const resInvite = await workerDefault.fetch(inviteReq, env);
      expect(resInvite.status).toBe(200);
      const dataInvite = (await resInvite.json()) as any;
      expect(dataInvite.text).toContain('r_abc12345');
      expect(dataInvite.reply_markup.inline_keyboard[0][0].web_app.url).toContain(
        'startapp=r_abc12345'
      );
    });

    it('falls back to static assets or service message', async () => {
      let assetFetched = false;
      const envWithAssets: Env = {
        ROOM_DO: mockNamespace as any,
        ASSETS: {
          fetch: async () => {
            assetFetched = true;
            return new Response('<html>Mock SPA</html>', { status: 200 });
          },
        } as any,
      };

      const req = new Request('https://game.example.com/', { method: 'GET' });
      const resAssets = await workerDefault.fetch(req, envWithAssets);
      expect(assetFetched).toBe(true);
      expect(await resAssets.text()).toBe('<html>Mock SPA</html>');

      const envNoAssets: Env = { ROOM_DO: mockNamespace as any };
      const resFallback = await workerDefault.fetch(req, envNoAssets);
      expect(resFallback.status).toBe(200);
      expect(await resFallback.text()).toContain("Liar's Deck Service");
    });
  });

  describe('WebSocket Routing & Telegram Authentication Boundary', () => {
    it('rejects non-websocket requests to /room/:roomId/ws', async () => {
      const req = new Request('https://game.example.com/room/r_test123/ws', { method: 'GET' });
      const env: Env = { ROOM_DO: mockNamespace as any };

      const res = await workerDefault.fetch(req, env);
      expect(res.status).toBe(426);
    });

    it('rejects invalid room ID formats', async () => {
      const req = new Request('https://game.example.com/room/invalid!chars/ws', {
        method: 'GET',
        headers: { Upgrade: 'websocket' },
      });
      const env: Env = { ROOM_DO: mockNamespace as any };

      const res = await workerDefault.fetch(req, env);
      expect(res.status).toBe(400);
    });

    it('authenticates valid Telegram initData when BOT_TOKEN is configured', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const validInitData = createSignedInitData(
        {
          auth_date: String(nowSec),
          user: JSON.stringify({ id: 1001, first_name: 'Alice' }),
        },
        TEST_BOT_TOKEN
      );

      const env: Env = {
        ROOM_DO: mockNamespace as any,
        BOT_TOKEN: TEST_BOT_TOKEN,
      };

      // 1. Missing initData -> 401
      const reqMissing = new Request('https://game.example.com/room/r_test123/ws', {
        headers: { Upgrade: 'websocket' },
      });
      const resMissing = await workerDefault.fetch(reqMissing, env);
      expect(resMissing.status).toBe(401);

      // 2. Tampered initData -> 401
      const reqTampered = new Request(
        `https://game.example.com/room/r_test123/ws?initData=${encodeURIComponent(validInitData + 'tamper')}`,
        { headers: { Upgrade: 'websocket' } }
      );
      const resTampered = await workerDefault.fetch(reqTampered, env);
      expect(resTampered.status).toBe(401);

      // 3. Valid initData -> 101 Switching Protocols
      const reqValid = new Request(
        `https://game.example.com/room/r_test123/ws?initData=${encodeURIComponent(validInitData)}`,
        { headers: { Upgrade: 'websocket' } }
      );
      const resValid = await workerDefault.fetch(reqValid, env);
      expect(resValid.status).toBe(101);
      expect((resValid as any).webSocket).toBeDefined();
    });

    it('supports insecure auth when ALLOW_INSECURE_AUTH is enabled', async () => {
      const env: Env = {
        ROOM_DO: mockNamespace as any,
        BOT_TOKEN: TEST_BOT_TOKEN,
        ALLOW_INSECURE_AUTH: 'true',
      };

      const req = new Request('https://game.example.com/room/r_test123/ws?playerId=player_bob', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await workerDefault.fetch(req, env);
      expect(res.status).toBe(101);
    });

    it('supports dev mode fallback when BOT_TOKEN is not set', async () => {
      const env: Env = { ROOM_DO: mockNamespace as any };

      const req = new Request('https://game.example.com/room/r_test123/ws?playerId=dev_alice', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await workerDefault.fetch(req, env);
      expect(res.status).toBe(101);
    });
  });

  describe('RoomDurableObject Lifecycle & Coordination', () => {
    it('manages lobby join, start match, turn gameplay, alarms, and presence pause/resume', async () => {
      const state = new MockDurableObjectState();
      const roomDO = new RoomDurableObject(state as any, {} as any);
      const roomId = 'r_match_test';

      // Connect Player 1 (Alice)
      const reqP1 = new Request(`https://game.example.com/room/${roomId}/ws`, {
        headers: {
          Upgrade: 'websocket',
          'x-player-id': 'alice',
          'x-room-id': roomId,
        },
      });
      const resP1 = await roomDO.fetch(reqP1);
      expect(resP1.status).toBe(101);
      const clientWsP1 = (resP1 as any).webSocket as MockWebSocket;

      // Alice sends JOIN
      clientWsP1.send(JSON.stringify({ type: 'JOIN' }));

      // Connect Player 2 (Bob)
      const reqP2 = new Request(`https://game.example.com/room/${roomId}/ws`, {
        headers: {
          Upgrade: 'websocket',
          'x-player-id': 'bob',
          'x-room-id': roomId,
        },
      });
      const resP2 = await roomDO.fetch(reqP2);
      const clientWsP2 = (resP2 as any).webSocket as MockWebSocket;

      // Bob sends JOIN
      clientWsP2.send(JSON.stringify({ type: 'JOIN' }));

      // Both should have received projections
      expect(clientWsP1.sentMessages.length).toBeGreaterThan(0);
      expect(clientWsP2.sentMessages.length).toBeGreaterThan(0);

      // Verify state inspection endpoint
      const stateReq = new Request(`https://game.example.com/room/${roomId}/state`);
      const stateRes = await roomDO.fetch(stateReq);
      const roomState = (await stateRes.json()) as any;
      expect(roomState.roomId).toBe(roomId);
      expect(roomState.lifecycle).toBe('LOBBY');
      expect(roomState.members.length).toBe(2);
      expect(roomState.hostPlayerId).toBe('alice');

      // Alice (Host) starts match
      clientWsP1.send(JSON.stringify({ type: 'START_MATCH' }));

      // Inspect updated match state
      const matchRes = await roomDO.fetch(stateReq);
      const matchState = (await matchRes.json()) as any;
      expect(matchState.lifecycle).toBe('MATCH_ACTIVE');
      expect(matchState.match).toBeDefined();
      expect(matchState.currentTurnDeadline).toBeDefined();

      // Check alarm synchronization: alarm was set for turn deadline
      const alarmDueAt = await state.storage.getAlarm();
      expect(alarmDueAt).toBe(matchState.currentTurnDeadline);

      // Current player plays cards
      const currentRound = matchState.match.round;
      const currentPlayerId = currentRound.currentPlayerId;
      const activeWs = currentPlayerId === 'alice' ? clientWsP1 : clientWsP2;
      const cardIdToPlay = matchState.match.players[currentPlayerId].hand[0].id;

      // Send PLAY_CARDS
      activeWs.send(
        JSON.stringify({
          type: 'GAMEPLAY_ACTION',
          envelope: {
            actionId: 'act_p1_001',
            expectedRevision: matchState.revision,
            turnId: matchState.currentTurnId,
            actionType: 'PLAY_CARDS',
            payload: { cardIds: [cardIdToPlay] },
          },
        })
      );

      // Verify turn advanced
      const afterPlayRes = await roomDO.fetch(stateReq);
      const afterPlayState = (await afterPlayRes.json()) as any;
      expect(afterPlayState.revision).toBe(matchState.revision + 1);

      // Trigger alarm: DO alarm() handles system timeout
      const preAlarmRevision = afterPlayState.revision;
      await roomDO.alarm(afterPlayState.currentTurnDeadline + 1000);

      const postAlarmRes = await roomDO.fetch(stateReq);
      const postAlarmState = (await postAlarmRes.json()) as any;
      expect(postAlarmState.revision).toBeGreaterThan(preAlarmRevision);

      // Disconnect all players -> Presence Pause
      clientWsP1.close();
      clientWsP2.close();

      const pausedRes = await roomDO.fetch(stateReq);
      const pausedState = (await pausedRes.json()) as any;
      expect(pausedState.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');

      // Alarm should be deleted on pause
      const pausedAlarm = await state.storage.getAlarm();
      expect(pausedAlarm).toBeNull();

      // Living player reconnects -> Resumes match
      const reconnectReq = new Request(`https://game.example.com/room/${roomId}/ws`, {
        headers: {
          Upgrade: 'websocket',
          'x-player-id': 'alice',
          'x-room-id': roomId,
        },
      });
      const reconnectRes = await roomDO.fetch(reconnectReq);
      expect(reconnectRes.status).toBe(101);

      const resumedRes = await roomDO.fetch(stateReq);
      const resumedState = (await resumedRes.json()) as any;
      expect(resumedState.lifecycle).toBe('MATCH_ACTIVE');
      expect(await state.storage.getAlarm()).toBeDefined();
    });

    it('cleans up expired rooms when ROOM_RETENTION alarm fires', async () => {
      const state = new MockDurableObjectState();
      const roomDO = new RoomDurableObject(state as any, {} as any);
      const roomId = 'r_retention_test';

      // Connect & JOIN
      const req = new Request(`https://game.example.com/room/${roomId}/ws`, {
        headers: {
          Upgrade: 'websocket',
          'x-player-id': 'alice',
          'x-room-id': roomId,
        },
      });
      await roomDO.fetch(req);

      // Inspect SQLite storage before deletion
      const rowBefore = state.storage.sql
        .exec('SELECT room_id FROM room_state WHERE room_id = ?', roomId)
        .one();
      expect(rowBefore).toBeDefined();

      // Manually set room state in SQLite to finished with expired retention alarm
      const pastTime = Date.now() - 90_000_000; // 25 hours ago
      state.storage.sql.exec(
        `UPDATE room_state SET lifecycle = 'MATCH_FINISHED', active_alarm_kind = 'ROOM_RETENTION', active_alarm_due_at = ?, updated_at = ? WHERE room_id = ?`,
        pastTime,
        pastTime,
        roomId
      );

      // Rehydrate new DO instance to simulate hibernation wake-up
      const rehydratedDO = new RoomDurableObject(state as any, {} as any);
      await rehydratedDO.alarm();

      // SQLite room_state row should be deleted
      const rowAfter = state.storage.sql
        .exec('SELECT room_id FROM room_state WHERE room_id = ?', roomId)
        .one();
      expect(rowAfter).toBeNull();
      expect(await state.storage.getAlarm()).toBeNull();
    });

    it('cryptoRandomSource produces valid random integers within bounds', () => {
      for (let max = 1; max <= 10; max++) {
        for (let i = 0; i < 50; i++) {
          const val = cryptoRandomSource.nextInt(max);
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThan(max);
        }
      }
    });
  });
});
