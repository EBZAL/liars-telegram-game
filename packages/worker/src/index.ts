import {
  isValidRoomId,
  generateRoomId,
  formatTelegramBotWebhookResponse,
  validateTelegramInitData,
  type TelegramUpdate,
} from '@liars-telegram-game/room-runtime';
import type { Env } from './types.js';

export { RoomDurableObject, cryptoRandomSource } from './durable-object.js';
export * from './types.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Health check
    if (pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Room creation endpoint
    if (pathname === '/api/room' && request.method === 'POST') {
      const roomId = generateRoomId();
      return new Response(JSON.stringify({ roomId }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Telegram Bot Webhook endpoint
    if (pathname === '/api/telegram-webhook' && request.method === 'POST') {
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
        if (secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }

      const appUrl = env.APP_URL || `${url.protocol}//${url.host}`;
      const botUsername = env.BOT_USERNAME || 'LiarsDeckBot';
      const appName = env.APP_NAME;

      const payload = formatTelegramBotWebhookResponse(update, appUrl, botUsername, appName);
      if (payload) {
        return new Response(JSON.stringify(payload), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Room WebSocket Route: /room/:roomId/ws
    const roomWsMatch = pathname.match(/^\/room\/([^/]+)\/ws$/);
    if (roomWsMatch) {
      const roomId = roomWsMatch[1];
      if (!isValidRoomId(roomId)) {
        return new Response('Invalid roomId', { status: 400 });
      }

      const upgrade = request.headers.get('Upgrade');
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket Upgrade', { status: 426 });
      }

      let playerId: string | null = null;
      const initData =
        url.searchParams.get('initData') || request.headers.get('x-telegram-init-data');

      if (env.BOT_TOKEN) {
        if (initData) {
          const authResult = validateTelegramInitData(initData, env.BOT_TOKEN);
          if (!authResult.success || !authResult.user) {
            return new Response(`Unauthorized: Invalid Telegram initData (${authResult.error})`, {
              status: 401,
            });
          }
          playerId = String(authResult.user.id);
        } else if (env.ALLOW_INSECURE_AUTH === 'true') {
          playerId = url.searchParams.get('playerId') || request.headers.get('x-player-id');
          if (!playerId) {
            return new Response('Unauthorized: Missing credentials', { status: 401 });
          }
        } else {
          return new Response('Unauthorized: initData required', { status: 401 });
        }
      } else {
        // Test / development environment without BOT_TOKEN
        if (initData) {
          const authResult = validateTelegramInitData(initData, 'DEV_TOKEN');
          playerId = authResult.success && authResult.user ? String(authResult.user.id) : null;
        }
        if (!playerId) {
          playerId =
            url.searchParams.get('playerId') ||
            request.headers.get('x-player-id') ||
            'dev_player';
        }
      }

      // Route to Durable Object
      const doId = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(doId);

      const doHeaders = new Headers(request.headers);
      doHeaders.set('x-player-id', playerId);
      doHeaders.set('x-room-id', roomId);

      const doRequest = new Request(request.url, {
        method: request.method,
        headers: doHeaders,
        body: request.body,
      });

      return stub.fetch(doRequest);
    }

    // 5. Static assets / Fallback
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Liar's Deck Service Running", {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
