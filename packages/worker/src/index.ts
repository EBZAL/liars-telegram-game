import {
  isValidRoomId,
  generateRoomId,
  formatTelegramBotWebhookResponse,
  validateTelegramInitData,
  parseTelegramStartParam,
  type TelegramUpdate,
} from '@liars-telegram-game/room-runtime';
import type { Env } from './types.js';
import {
  isAdminUser,
  notifyAdminsOnBotStart,
  notifyAdminsOnUserEntry,
} from './admin.js';

export { RoomDurableObject, cryptoRandomSource } from './durable-object.js';
export * from './types.js';
export * from './admin.js';

export interface ExecutionContextLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContextLike): Promise<Response> {
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

      // Notify admins if a new user initiates /start with the bot
      if (update.message?.from && update.message.text?.startsWith('/start')) {
        const parts = update.message.text.trim().split(/\s+/);
        const startArg = parts.length > 1 ? parts[1] : undefined;
        const startRoomId = parseTelegramStartParam(startArg);
        const botToken = env.BOT_TOKEN ? env.BOT_TOKEN.trim().replace(/^["']|["']$/g, '') : undefined;
        if (botToken) {
          const notifyPromise = notifyAdminsOnBotStart(botToken, update.message.from, startRoomId, env.ADMIN_IDS);
          if (ctx?.waitUntil) {
            ctx.waitUntil(notifyPromise);
          } else {
            notifyPromise.catch(() => {});
          }
        }
      }

      if (payload) {
        return new Response(JSON.stringify(payload), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3.5. Admin Authentication Verification: /api/admin/verify
    if (pathname === '/api/admin/verify' && request.method === 'GET') {
      const initData =
        url.searchParams.get('initData') || request.headers.get('x-telegram-init-data');
      if (!initData) {
        return new Response(JSON.stringify({ error: 'MISSING_INIT_DATA', isAdmin: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const botToken = env.BOT_TOKEN ? env.BOT_TOKEN.trim().replace(/^["']|["']$/g, '') : 'DEV_TOKEN';
      const authResult = validateTelegramInitData(initData, botToken);
      if (!authResult.success || !authResult.user) {
        return new Response(JSON.stringify({ error: 'INVALID_INIT_DATA', isAdmin: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const isAdmin = isAdminUser(authResult.user.id, env.ADMIN_IDS);
      if (!isAdmin) {
        return new Response(
          JSON.stringify({
            error: 'FORBIDDEN_NOT_ADMIN',
            isAdmin: false,
            userId: authResult.user.id,
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          isAdmin: true,
          adminId: String(authResult.user.id),
          username: authResult.user.username,
          firstName: authResult.user.first_name,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
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
      let playerName: string | null = null;
      const initData =
        url.searchParams.get('initData') || request.headers.get('x-telegram-init-data');

      if (env.BOT_TOKEN) {
        const botToken = env.BOT_TOKEN.trim().replace(/^["']|["']$/g, '');
        if (initData) {
          const authResult = validateTelegramInitData(initData, botToken);
          if (!authResult.success || !authResult.user) {
            return new Response(`Unauthorized: Invalid Telegram initData (${authResult.error})`, {
              status: 401,
            });
          }
          playerId = String(authResult.user.id);
          playerName = authResult.user.first_name || authResult.user.username || playerId;

          const notifyPromise = notifyAdminsOnUserEntry(botToken, authResult.user, roomId, env.ADMIN_IDS);
          if (ctx?.waitUntil) {
            ctx.waitUntil(notifyPromise);
          } else {
            notifyPromise.catch(() => {});
          }
        } else if (env.ALLOW_INSECURE_AUTH === 'true') {
          playerId = url.searchParams.get('playerId') || request.headers.get('x-player-id');
          playerName = url.searchParams.get('playerName') || request.headers.get('x-player-name') || playerId;
          if (!playerId) {
            return new Response('Unauthorized: Missing credentials', { status: 401 });
          }
          const notifyPromise = notifyAdminsOnUserEntry(
            botToken,
            { id: playerId, first_name: playerName },
            roomId,
            env.ADMIN_IDS
          );
          if (ctx?.waitUntil) {
            ctx.waitUntil(notifyPromise);
          } else {
            notifyPromise.catch(() => {});
          }
        } else {
          return new Response('Unauthorized: initData required', { status: 401 });
        }
      } else {
        // Test / development environment without BOT_TOKEN
        if (initData) {
          const authResult = validateTelegramInitData(initData, 'DEV_TOKEN');
          playerId = authResult.success && authResult.user ? String(authResult.user.id) : null;
          if (authResult.success && authResult.user) {
            playerName = authResult.user.first_name || authResult.user.username || playerId;
          }
        }
        if (!playerId) {
          playerId =
            url.searchParams.get('playerId') ||
            request.headers.get('x-player-id') ||
            'dev_player';
        }
        if (!playerName) {
          playerName =
            url.searchParams.get('playerName') ||
            request.headers.get('x-player-name') ||
            playerId;
        }
      }

      // Route to Durable Object
      const doId = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(doId);

      const doHeaders = new Headers(request.headers);
      doHeaders.set('x-player-id', playerId);
      doHeaders.set('x-room-id', roomId);
      if (playerName) {
        doHeaders.set('x-player-name', encodeURIComponent(playerName));
      }

      const doRequest = new Request(request, {
        headers: doHeaders,
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
