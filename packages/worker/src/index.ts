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
  isMockOrTestUserId,
  notifyAdminsOnBotStart,
  notifyAdminsOnUserEntry,
  modRegisterUser,
  modCheckBan,
  modBanUser,
  modUnbanUser,
  modSearchUsers,
  modListBanned,
  modGetStats,
  buildAdminDashboardPayload,
} from './admin.js';

export { RoomDurableObject, cryptoRandomSource } from './durable-object.js';
export * from './types.js';
export * from './admin.js';

export interface ExecutionContextLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

function verifyAdminRequest(
  request: Request,
  url: URL,
  env: Env
): { authorized: boolean; error?: string; status?: number; adminId?: string; username?: string; firstName?: string } {
  const initData =
    url.searchParams.get('initData') || request.headers.get('x-telegram-init-data');
  if (!initData) {
    return { authorized: false, error: 'MISSING_INIT_DATA', status: 401 };
  }

  const botToken = env.BOT_TOKEN ? env.BOT_TOKEN.trim().replace(/^["']|["']$/g, '') : 'DEV_TOKEN';
  const authResult = validateTelegramInitData(initData, botToken);
  if (!authResult.success || !authResult.user) {
    return { authorized: false, error: 'INVALID_INIT_DATA', status: 401 };
  }

  if (!isAdminUser(authResult.user.id, env.ADMIN_IDS)) {
    return { authorized: false, error: 'FORBIDDEN_NOT_ADMIN', status: 403 };
  }

  return {
    authorized: true,
    adminId: String(authResult.user.id),
    username: authResult.user.username,
    firstName: authResult.user.first_name,
  };
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
      const botUsername = env.BOT_USERNAME || 'LIRESBARBOT';
      const appName = env.APP_NAME;

      // 3.1 Handle Callback Queries (Admin interactive buttons)
      if (update.callback_query) {
        const cq = update.callback_query;
        const senderId = cq.from.id;
        const chatId = cq.message?.chat.id || senderId;
        const data = cq.data || '';
        const isAdmin = isAdminUser(senderId, env.ADMIN_IDS);

        if (!isAdmin) {
          return new Response(
            JSON.stringify({
              method: 'answerCallbackQuery',
              callback_query_id: cq.id,
              text: '⛔ شما دسترسی ادمین ندارید.',
              show_alert: true,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (data === 'admin_dashboard') {
          const stats = await modGetStats(env);
          return new Response(JSON.stringify(buildAdminDashboardPayload(chatId, stats)), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (data === 'admin_banned') {
          const banned = await modListBanned(env);
          if (banned.length === 0) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '🟢 <b>هیچ کاربری در لیست مسدودشده‌ها وجود ندارد.</b>',
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
                },
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          const text =
            `🚫 <b>لیست کاربران مسدودشده (${banned.length} نفر):</b>\n\n` +
            banned
              .slice(0, 10)
              .map(
                (b: any) =>
                  `🆔 <code>${b.userId}</code>\n📝 علت: ${b.reason || 'تعیین‌نشده'}\n⏳ انقضا: ${
                    b.expiresAt
                      ? new Date(b.expiresAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
                      : 'دائم'
                  }`
              )
              .join('\n\n');
          const buttons = banned.slice(0, 10).map((b: any) => [
            { text: `✅ رفع مسدودیت (${b.userId})`, callback_data: `unban_${b.userId}` },
          ]);
          buttons.push([{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]);
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (data === 'admin_search_help') {
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text:
                `🔍 <b>راهنمای جستجوی کاربران</b>\n\n` +
                `برای جستجو، دستور زیر را با آیدی عددی، نام یا یوزرنیم کاربر ارسال کنید:\n\n` +
                `<code>/search 12345678</code>\n` +
                `یا\n` +
                `<code>/search alireza</code>`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (data.startsWith('unban_')) {
          const targetId = data.slice('unban_'.length);
          await modUnbanUser(env, targetId);
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: `✅ کاربر <code>${targetId}</code> با موفقیت رفع مسدودیت (آن‌بن) شد.`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (data.startsWith('ban_perm_')) {
          const targetId = data.slice('ban_perm_'.length);
          await modBanUser(env, {
            userId: targetId,
            reason: 'مسدود دائم توسط ادمین',
            bannedBy: String(senderId),
          });
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: `🚫 کاربر <code>${targetId}</code> به صورت دائم مسدود شد.`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (data.startsWith('ban_24h_')) {
          const targetId = data.slice('ban_24h_'.length);
          await modBanUser(env, {
            userId: targetId,
            reason: 'مسدود موقت ۲۴ ساعته',
            durationHours: 24,
            bannedBy: String(senderId),
          });
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: `⏳ کاربر <code>${targetId}</code> به مدت ۲۴ ساعت مسدود شد.`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 3.2 Handle Messages
      if (update.message?.from && update.message.text) {
        const sender = update.message.from;
        const senderId = sender.id;
        const chatId = update.message.chat.id;
        const text = update.message.text.trim();
        const isAdmin = isAdminUser(senderId, env.ADMIN_IDS);

        // Check if user is banned
        if (!isAdmin) {
          const banCheck = await modCheckBan(env, String(senderId));
          if (banCheck.isBanned) {
            const expiryText = banCheck.expiresAt
              ? `\n⏳ تا تاریخ: ${new Date(banCheck.expiresAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })}`
              : '\n⏳ مدت: دائمی';
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: `🚫 <b>دسترسی شما به بازی مسدود شده است.</b>\n\n📝 علت: ${banCheck.reason || 'نقض قوانین'}${expiryText}`,
                parse_mode: 'HTML',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
        }

        // Register user in background
        const regPromise = modRegisterUser(env, {
          userId: String(senderId),
          firstName: sender.first_name,
          lastName: sender.last_name,
          username: sender.username,
        });
        if (ctx?.waitUntil) ctx.waitUntil(regPromise);
        else regPromise.catch(() => {});

        // /admin command
        if (text === '/admin') {
          if (!isAdmin) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⛔ شما دسترسی ادمین ندارید.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          const stats = await modGetStats(env);
          return new Response(JSON.stringify(buildAdminDashboardPayload(chatId, stats)), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // /search command
        if (text.startsWith('/search')) {
          if (!isAdmin) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⛔ شما دسترسی ادمین ندارید.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          const query = text.slice('/search'.length).trim();
          if (!query) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⚠️ لطفاً عبارت جستجو را وارد کنید:\n<code>/search &lt;آیدی یا نام&gt;</code>',
                parse_mode: 'HTML',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }

          const users = await modSearchUsers(env, query);
          if (users.length === 0) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: `❌ هیچ کاربری با مشخصات "<code>${query}</code>" یافت نشد.`,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
                },
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }

          const userRows = users.slice(0, 5);
          let resultText = `🔍 <b>نتایج جستجو برای "${query}" (${users.length} مورد):</b>\n\n`;
          const buttons: any[] = [];

          userRows.forEach((u: any, idx: number) => {
            const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'بی‌نام';
            const uname = u.username ? `@${u.username}` : 'ندارد';
            const status = u.isBanned ? `🚫 مسدود (${u.banReason || 'علت نامشخص'})` : '🟢 فعال';
            resultText += `#${idx + 1} <b>${name}</b>\n` +
              `🆔 <code>${u.userId}</code> | یوزرنیم: ${uname}\n` +
              `وضعیت: ${status}\n\n`;

            if (u.isBanned) {
              buttons.push([{ text: `✅ رفع مسدودیت (${u.userId})`, callback_data: `unban_${u.userId}` }]);
            } else {
              buttons.push([
                { text: `🚫 بن دائم (${u.userId})`, callback_data: `ban_perm_${u.userId}` },
                { text: `⏳ بن ۲۴h (${u.userId})`, callback_data: `ban_24h_${u.userId}` },
              ]);
            }
          });

          buttons.push([{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]);
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: resultText.trim(),
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        // /ban command
        if (text.startsWith('/ban')) {
          if (!isAdmin) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⛔ شما دسترسی ادمین ندارید.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }

          const rawArgs = text.slice('/ban'.length).trim().split(/\s+/);
          const targetId = rawArgs[0];
          if (!targetId) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⚠️ فرمت دستور:\n<code>/ban &lt;آیدی&gt; [مدت به ساعت مثلا 24h] [علت]</code>\nمثال:\n<code>/ban 1234567 24h متقلب</code>',
                parse_mode: 'HTML',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }

          let durationHours: number | null = null;
          let reason = 'مسدود توسط ادمین';

          if (rawArgs.length > 1) {
            const second = rawArgs[1].toLowerCase();
            if (/^\d+h?$/.test(second)) {
              durationHours = parseInt(second.replace('h', ''), 10);
              reason = rawArgs.slice(2).join(' ') || reason;
            } else {
              reason = rawArgs.slice(1).join(' ');
            }
          }

          await modBanUser(env, {
            userId: targetId,
            reason,
            durationHours,
            bannedBy: String(senderId),
          });

          const durLabel = durationHours ? `${durationHours} ساعت` : 'دائمی';
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: `🚫 <b>کاربر مسدود شد.</b>\n\n🆔 آیدی: <code>${targetId}</code>\n⏳ مدت: ${durLabel}\n📝 علت: ${reason}`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        // /unban command
        if (text.startsWith('/unban')) {
          if (!isAdmin) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⛔ شما دسترسی ادمین ندارید.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          const targetId = text.slice('/unban'.length).trim().split(/\s+/)[0];
          if (!targetId) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⚠️ لطفاً آیدی کاربر را وارد کنید:\n<code>/unban 12345678</code>',
                parse_mode: 'HTML',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          await modUnbanUser(env, targetId);
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: `✅ کاربر <code>${targetId}</code> با موفقیت رفع مسدودیت (آن‌بن) شد.`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]],
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        // /banned command
        if (text === '/banned') {
          if (!isAdmin) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '⛔ شما دسترسی ادمین ندارید.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          const banned = await modListBanned(env);
          if (banned.length === 0) {
            return new Response(
              JSON.stringify({
                method: 'sendMessage',
                chat_id: chatId,
                text: '🟢 هیچ کاربری در لیست مسدودشده‌ها نیست.',
              }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          }
          const listText =
            `🚫 <b>کاربران مسدودشده (${banned.length} نفر):</b>\n\n` +
            banned
              .map(
                (b: any) =>
                  `🆔 <code>${b.userId}</code> | علت: ${b.reason || 'تعیین‌نشده'} | ${
                    b.expiresAt
                      ? 'انقضا: ' + new Date(b.expiresAt).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' })
                      : 'دائمی'
                  }`
              )
              .join('\n\n');
          const buttons = banned.map((b: any) => [
            { text: `✅ رفع مسدودیت (${b.userId})`, callback_data: `unban_${b.userId}` },
          ]);
          buttons.push([{ text: '🔙 بازگشت به پنل', callback_data: 'admin_dashboard' }]);
          return new Response(
            JSON.stringify({
              method: 'sendMessage',
              chat_id: chatId,
              text: listText,
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: buttons },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        // /start command
        if (text.startsWith('/start')) {
          const parts = text.split(/\s+/);
          const startArg = parts.length > 1 ? parts[1] : undefined;
          const startRoomId = parseTelegramStartParam(startArg);
          const botToken = env.BOT_TOKEN ? env.BOT_TOKEN.trim().replace(/^["']|["']$/g, '') : undefined;
          if (botToken) {
            const notifyPromise = notifyAdminsOnBotStart(botToken, sender, startRoomId, env.ADMIN_IDS);
            if (ctx?.waitUntil) ctx.waitUntil(notifyPromise);
            else notifyPromise.catch(() => {});
          }

          const defaultPayload = formatTelegramBotWebhookResponse(update, appUrl, botUsername, appName);
          if (defaultPayload) {
            // ONLY if user is admin, append the Admin Panel button to their keyboard!
            if (isAdmin) {
              defaultPayload.reply_markup = defaultPayload.reply_markup || { inline_keyboard: [] };
              defaultPayload.reply_markup.inline_keyboard.push([
                { text: '⚙️ پنل مدیریت (مخصوص ادمین)', callback_data: 'admin_dashboard' },
              ]);
            }
            return new Response(JSON.stringify(defaultPayload), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

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

    // 3.6. Admin Moderation Management Endpoints: /api/admin/*
    if (pathname.startsWith('/api/admin/')) {
      const auth = verifyAdminRequest(request, url, env);
      if (!auth.authorized) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status || 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname === '/api/admin/ban' && request.method === 'POST') {
        const body = (await request.json()) as any;
        await modBanUser(env, { ...body, bannedBy: auth.adminId || 'admin' });
        return new Response(JSON.stringify({ ok: true, banned: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname === '/api/admin/unban' && request.method === 'POST') {
        const body = (await request.json()) as any;
        await modUnbanUser(env, body.userId);
        return new Response(JSON.stringify({ ok: true, unbanned: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname === '/api/admin/search' && request.method === 'GET') {
        const query = url.searchParams.get('query') || '';
        const users = await modSearchUsers(env, query);
        return new Response(JSON.stringify({ users }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname === '/api/admin/banned' && request.method === 'GET') {
        const banned = await modListBanned(env);
        return new Response(JSON.stringify({ banned }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (pathname === '/api/admin/stats' && request.method === 'GET') {
        const stats = await modGetStats(env);
        return new Response(JSON.stringify(stats), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
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
          if (!isMockOrTestUserId(playerId)) {
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

      // Enforcement: Reject connection if player is banned
      if (playerId && !isAdminUser(playerId, env.ADMIN_IDS)) {
        const banCheck = await modCheckBan(env, playerId);
        if (banCheck.isBanned) {
          return new Response(
            JSON.stringify({
              error: 'BANNED',
              message: 'حساب کاربری شما از ورود به بازی مسدود شده است.',
              reason: banCheck.reason || 'نقض قوانین',
              expiresAt: banCheck.expiresAt,
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }

      // Register / update user in global user directory (skip mock/dev IDs)
      if (playerId && !isMockOrTestUserId(playerId)) {
        const regPromise = modRegisterUser(env, {
          userId: playerId,
          firstName: playerName,
        });
        if (ctx?.waitUntil) {
          ctx.waitUntil(regPromise);
        } else {
          regPromise.catch(() => {});
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
