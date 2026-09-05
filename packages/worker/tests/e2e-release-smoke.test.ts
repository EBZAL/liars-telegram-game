import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import workerDefault, { RoomDurableObject, cryptoRandomSource } from '../src/index.js';
import type { Env } from '../src/types.js';
import {
  createInMemorySqlStorage,
  type SqlStorage,
  type RecipientRoomProjection,
  type GameplayActionEnvelope,
} from '@liars-telegram-game/room-runtime';

class MockWebSocket {
  public peer: MockWebSocket | null = null;
  public onmessage: ((ev: { data: string }) => any) | null = null;
  public onclose: ((event?: any) => any) | null = null;
  public onerror: ((event?: any) => any) | null = null;
  public messageListeners: Array<(ev: { data: string }) => any> = [];
  public closeListeners: Array<() => any> = [];
  public errorListeners: Array<() => any> = [];
  public accepted = false;
  public closed = false;
  public receivedMessages: any[] = [];
  public latestProjection: RecipientRoomProjection | null = null;

  accept() {
    this.accepted = true;
  }

  addEventListener(event: string, handler: any) {
    if (event === 'message') this.messageListeners.push(handler);
    if (event === 'close') this.closeListeners.push(handler);
    if (event === 'error') this.errorListeners.push(handler);
  }

  async send(data: string): Promise<void> {
    if (this.closed) throw new Error('Socket closed');
    if (this.peer && !this.peer.closed) {
      const ev = { data };
      this.peer.receivedMessages.push(data);
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'PROJECTION') {
          this.peer.latestProjection = parsed.projection;
        }
      } catch {}

      if (this.peer.onmessage) await this.peer.onmessage(ev);
      for (const l of this.peer.messageListeners) {
        await l(ev);
      }
    }
  }

  async close(_code = 1000, _reason = '') {
    if (this.closed) return;
    this.closed = true;
    if (this.onclose) await this.onclose();
    for (const l of this.closeListeners) await l();
    if (this.peer && !this.peer.closed) {
      this.peer.closed = true;
      if (this.peer.onclose) await this.peer.onclose();
      for (const l of this.peer.closeListeners) await l();
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
  public id = { toString: () => 'e2e_mock_do_id' };
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

describe('T-047 End-to-End Release Smoke Test', () => {
  const BOT_TOKEN = '987654321:XYZ-abcdef_TEST_BOT_TOKEN_12345';
  let mockNamespace: MockDurableObjectNamespace;
  let env: Env;

  beforeEach(() => {
    (globalThis as any).WebSocketPair = MockWebSocketPair;
    mockNamespace = new MockDurableObjectNamespace();
    env = {
      ROOM_DO: mockNamespace as any,
      BOT_TOKEN,
      BOT_USERNAME: 'LiarsDeckOfficialBot',
      APP_URL: 'https://liarsdeck.workers.dev',
      TELEGRAM_WEBHOOK_SECRET: 'webhook_secret_xyz',
    };
  });

  it('executes full multi-tier end-to-end lifecycle: HTTP API -> Webhook -> Auth -> WebSocket -> DO -> Game -> Alarms -> Retention', async () => {
    // 1. Healthcheck
    const healthReq = new Request('https://liarsdeck.workers.dev/api/health');
    const healthRes = await workerDefault.fetch(healthReq, env);
    expect(healthRes.status).toBe(200);
    const healthData = (await healthRes.json()) as any;
    expect(healthData.status).toBe('ok');

    // 2. Create room via API
    const createReq = new Request('https://liarsdeck.workers.dev/api/room', { method: 'POST' });
    const createRes = await workerDefault.fetch(createReq, env);
    expect(createRes.status).toBe(200);
    const { roomId } = (await createRes.json()) as { roomId: string };
    expect(roomId).toMatch(/^r_[a-f0-9]{8}$/);

    // 3. BotFather Webhook: User queries bot with room invite /start <roomId>
    const webhookReq = new Request('https://liarsdeck.workers.dev/api/telegram-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'webhook_secret_xyz',
      },
      body: JSON.stringify({
        update_id: 100,
        message: {
          message_id: 50,
          chat: { id: 7777777, type: 'private' },
          text: `/start ${roomId}`,
        },
      }),
    });
    const webhookRes = await workerDefault.fetch(webhookReq, env);
    expect(webhookRes.status).toBe(200);
    const webhookData = (await webhookRes.json()) as any;
    expect(webhookData.reply_markup.inline_keyboard[0][0].web_app.url).toContain(
      `startapp=${roomId}`
    );

    // 4. Player 1 (Alice) connects over WebSocket with valid signed initData
    const nowSec = Math.floor(Date.now() / 1000);
    const aliceInitData = createSignedInitData(
      {
        auth_date: String(nowSec),
        user: JSON.stringify({ id: 1001, first_name: 'Alice', username: 'alice' }),
      },
      BOT_TOKEN
    );

    const wsReqAlice = new Request(
      `https://liarsdeck.workers.dev/room/${roomId}/ws?initData=${encodeURIComponent(aliceInitData)}`,
      {
        headers: { Upgrade: 'websocket' },
      }
    );
    const wsResAlice = await workerDefault.fetch(wsReqAlice, env);
    expect(wsResAlice.status).toBe(101);
    const aliceClientWs = (wsResAlice as any).webSocket as MockWebSocket;

    // Alice sends JOIN command
    await aliceClientWs.send(JSON.stringify({ type: 'JOIN' }));
    expect(aliceClientWs.latestProjection).toBeDefined();
    expect(aliceClientWs.latestProjection?.publicState.lifecycle).toBe('LOBBY');
    expect(aliceClientWs.latestProjection?.publicState.hostPlayerId).toBe('1001');

    // 5. Player 2 (Bob) connects over WebSocket with valid signed initData
    const bobInitData = createSignedInitData(
      {
        auth_date: String(nowSec),
        user: JSON.stringify({ id: 1002, first_name: 'Bob', username: 'bob' }),
      },
      BOT_TOKEN
    );

    const wsReqBob = new Request(
      `https://liarsdeck.workers.dev/room/${roomId}/ws?initData=${encodeURIComponent(bobInitData)}`,
      {
        headers: { Upgrade: 'websocket' },
      }
    );
    const wsResBob = await workerDefault.fetch(wsReqBob, env);
    expect(wsResBob.status).toBe(101);
    const bobClientWs = (wsResBob as any).webSocket as MockWebSocket;

    // Bob sends JOIN command
    await bobClientWs.send(JSON.stringify({ type: 'JOIN' }));

    // Both players see 2 lobby members
    expect(aliceClientWs.latestProjection?.publicState.memberPlayerIds).toEqual(['1001', '1002']);
    expect(bobClientWs.latestProjection?.publicState.memberPlayerIds).toEqual(['1001', '1002']);

    // 6. Host (Alice) starts the match
    await aliceClientWs.send(JSON.stringify({ type: 'START_MATCH' }));

    // Both receive MATCH_ACTIVE projection with hidden private cards isolated
    const aliceMatchProj = aliceClientWs.latestProjection!;
    const bobMatchProj = bobClientWs.latestProjection!;
    expect(aliceMatchProj.publicState.lifecycle).toBe('MATCH_ACTIVE');
    expect(bobMatchProj.publicState.lifecycle).toBe('MATCH_ACTIVE');

    expect(aliceMatchProj.privateState?.playerId).toBe('1001');
    expect(aliceMatchProj.privateState?.hand.length).toBe(5);
    expect(bobMatchProj.privateState?.playerId).toBe('1002');
    expect(bobMatchProj.privateState?.hand.length).toBe(5);

    // Verify DO storage has turn deadline alarm scheduled
    const doEntry = mockNamespace.instances.get(roomId)!;
    const alarmDueAt = await doEntry.state.storage.getAlarm();
    expect(alarmDueAt).toBe(aliceMatchProj.publicState.currentTurnDeadline);

    // 7. Active player plays cards
    const currentRound = aliceMatchProj.publicState.match!.round;
    const activePlayerId = currentRound.currentPlayerId;
    const activeWs = activePlayerId === '1001' ? aliceClientWs : bobClientWs;
    const activeProj = activePlayerId === '1001' ? aliceMatchProj : bobMatchProj;
    const cardIdToPlay = activeProj.privateState!.hand[0].id;

    const playEnvelope: GameplayActionEnvelope = {
      actionId: 'e2e_act_001',
      expectedRevision: aliceMatchProj.publicState.revision,
      turnId: aliceMatchProj.publicState.currentTurnId!,
      actionType: 'PLAY_CARDS',
      payload: { cardIds: [cardIdToPlay] },
    };

    await activeWs.send(JSON.stringify({ type: 'GAMEPLAY_ACTION', envelope: playEnvelope }));

    // State advanced: central claim updated
    const afterPlayProj = aliceClientWs.latestProjection!;
    expect(afterPlayProj.publicState.revision).toBe(aliceMatchProj.publicState.revision + 1);
    expect(afterPlayProj.publicState.match!.round.previousPlay).toBeDefined();
    expect(afterPlayProj.publicState.match!.round.previousPlay?.count).toBe(1);

    // 8. Next player calls liar
    const nextPlayerId = afterPlayProj.publicState.match!.round.currentPlayerId;
    const nextWs = nextPlayerId === '1001' ? aliceClientWs : bobClientWs;

    const callLiarEnvelope: GameplayActionEnvelope = {
      actionId: 'e2e_act_002',
      expectedRevision: afterPlayProj.publicState.revision,
      turnId: afterPlayProj.publicState.currentTurnId!,
      actionType: 'CALL_LIAR',
      payload: {},
    };

    await nextWs.send(JSON.stringify({ type: 'GAMEPLAY_ACTION', envelope: callLiarEnvelope }));

    // Challenge resolved: revision advanced, round updated
    const afterChallengeProj = aliceClientWs.latestProjection!;
    expect(afterChallengeProj.publicState.revision).toBe(afterPlayProj.publicState.revision + 1);

    // 9. Zero-living presence outcome & lifecycle verification
    await aliceClientWs.close();
    await bobClientWs.close();

    const doState = doEntry.do.getRoomState();
    if (doState?.lifecycle === 'MATCH_FINISHED') {
      // Lethal shot in 2-player game -> match ended with winner!
      expect(doState.match?.winnerId).toBeDefined();

      // 24-hour retention alarm armed
      const retentionAlarm = await doEntry.state.storage.getAlarm();
      expect(retentionAlarm).toBeDefined();
      expect(retentionAlarm!).toBeGreaterThan(Date.now() + 86_000_000);

      // Trigger 24h retention alarm -> room cleanly deleted from SQLite
      await doEntry.do.alarm(retentionAlarm! + 1000);
      expect(await doEntry.state.storage.getAlarm()).toBeNull();
    } else {
      // Blank shot -> match paused due to zero living connections
      expect(doState?.lifecycle).toBe('MATCH_PAUSED_NO_LIVING_CONNECTIONS');
      expect(await doEntry.state.storage.getAlarm()).toBeNull();

      // Reconnection: Alice reconnects and match resumes
      const wsResAliceReconnect = await workerDefault.fetch(wsReqAlice, env);
      expect(wsResAliceReconnect.status).toBe(101);
      const aliceReconnectedWs = (wsResAliceReconnect as any).webSocket as MockWebSocket;

      expect(aliceReconnectedWs.latestProjection?.publicState.lifecycle).toBe('MATCH_ACTIVE');
      expect(await doEntry.state.storage.getAlarm()).toBeDefined();

      await aliceReconnectedWs.close();
    }
  });
});
