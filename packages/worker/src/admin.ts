export const DEFAULT_ADMIN_IDS = ['7833747178', '2131332245'] as const;

export function getAdminIds(envAdminIds?: string): string[] {
  if (envAdminIds && typeof envAdminIds === 'string' && envAdminIds.trim().length > 0) {
    return envAdminIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }
  return [...DEFAULT_ADMIN_IDS];
}

export function isAdminUser(
  userId: string | number | null | undefined,
  envAdminIds?: string
): boolean {
  if (userId === null || userId === undefined) {
    return false;
  }
  const idStr = String(userId).trim();
  if (idStr.length === 0) {
    return false;
  }
  return getAdminIds(envAdminIds).includes(idStr);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// In-memory cache to debounce notifications per user/action (10-minute cooldown)
const notificationTimestamps = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 10 * 60 * 1000;

export function shouldNotifyUser(key: string, cooldownMs: number = NOTIFICATION_COOLDOWN_MS): boolean {
  const now = Date.now();
  const lastTime = notificationTimestamps.get(key);
  if (lastTime && now - lastTime < cooldownMs) {
    return false;
  }
  notificationTimestamps.set(key, now);

  // Prune map if it grows large
  if (notificationTimestamps.size > 2000) {
    for (const [k, v] of notificationTimestamps.entries()) {
      if (now - v >= cooldownMs) {
        notificationTimestamps.delete(k);
      }
    }
  }
  return true;
}

export function clearNotificationCacheForTest(): void {
  notificationTimestamps.clear();
}

/**
 * Sends a message via Telegram Bot API to all registered admin IDs.
 */
export async function notifyAdmins(
  botToken: string,
  message: string,
  envAdminIds?: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  if (!botToken || botToken === 'DEV_TOKEN') {
    return;
  }
  const cleanToken = botToken.trim().replace(/^["']|["']$/g, '');
  const adminIds = getAdminIds(envAdminIds);

  const promises = adminIds.map(async (adminId) => {
    try {
      const resp = await fetchFn(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (!resp.ok) {
        console.error(`Admin notify error: ${resp.status} for admin ${adminId}`);
      }
    } catch (err) {
      console.error(`Admin notify network failure for admin ${adminId}:`, err);
    }
  });

  await Promise.allSettled(promises);
}

export interface UserNotificationInfo {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

/**
 * Notifies admins when a user launches/enters a game room via WebApp.
 */
export async function notifyAdminsOnUserEntry(
  botToken: string | undefined,
  user: UserNotificationInfo,
  roomId: string,
  envAdminIds?: string,
  fetchFn?: typeof fetch
): Promise<void> {
  if (!botToken) return;
  const userIdStr = String(user.id);

  // Do not spam admins when they themselves enter
  if (isAdminUser(userIdStr, envAdminIds)) {
    return;
  }

  const cacheKey = `entry:${userIdStr}`;
  if (!shouldNotifyUser(cacheKey)) {
    return;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'بی‌نام';
  const usernameText = user.username ? `@${user.username}` : 'ندارد';
  const timeStr = new Date().toLocaleTimeString('fa-IR', {
    timeZone: 'Asia/Tehran',
    hour12: false,
  });

  const message =
    `🎮 <b>ورود کاربر به بازی Liar's Deck</b>\n\n` +
    `👤 <b>نام:</b> ${escapeHtml(fullName)}\n` +
    `🆔 <b>آیدی عددی:</b> <code>${userIdStr}</code>\n` +
    `🔗 <b>یوزرنیم:</b> ${escapeHtml(usernameText)}\n` +
    `🚪 <b>اتاق:</b> <code>${escapeHtml(roomId)}</code>\n` +
    `⏰ <b>ساعت (ایران):</b> ${timeStr}`;

  await notifyAdmins(botToken, message, envAdminIds, fetchFn);
}

/**
 * Notifies admins when a user sends /start to the Telegram Bot.
 */
export async function notifyAdminsOnBotStart(
  botToken: string | undefined,
  user: UserNotificationInfo,
  roomId?: string | null,
  envAdminIds?: string,
  fetchFn?: typeof fetch
): Promise<void> {
  if (!botToken) return;
  const userIdStr = String(user.id);

  // Do not spam admins when they themselves start the bot
  if (isAdminUser(userIdStr, envAdminIds)) {
    return;
  }

  const cacheKey = `start:${userIdStr}`;
  if (!shouldNotifyUser(cacheKey)) {
    return;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'بی‌نام';
  const usernameText = user.username ? `@${user.username}` : 'ندارد';
  const timeStr = new Date().toLocaleTimeString('fa-IR', {
    timeZone: 'Asia/Tehran',
    hour12: false,
  });

  const roomLine = roomId ? `🚪 <b>دعوت به اتاق:</b> <code>${escapeHtml(roomId)}</code>\n` : '';

  const message =
    `🤖 <b>استارت ربات توسط کاربر جدید</b>\n\n` +
    `👤 <b>نام:</b> ${escapeHtml(fullName)}\n` +
    `🆔 <b>آیدی عددی:</b> <code>${userIdStr}</code>\n` +
    `🔗 <b>یوزرنیم:</b> ${escapeHtml(usernameText)}\n` +
    roomLine +
    `⏰ <b>ساعت (ایران):</b> ${timeStr}`;

  await notifyAdmins(botToken, message, envAdminIds, fetchFn);
}

/**
 * Accesses the global singleton moderation Durable Object.
 */
export function getModerationDO(env: { ROOM_DO: any }) {
  const doId = env.ROOM_DO.idFromName('__system_moderation__');
  return env.ROOM_DO.get(doId);
}

export async function modRegisterUser(
  env: { ROOM_DO: any },
  user: { userId: string; firstName?: string | null; lastName?: string | null; username?: string | null }
): Promise<void> {
  try {
    const stub = getModerationDO(env);
    await stub.fetch(
      new Request('http://internal/moderation/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      })
    );
  } catch (err) {
    console.error('Failed to register user in moderation DO:', err);
  }
}

export async function modCheckBan(
  env: { ROOM_DO: any },
  userId: string
): Promise<{ isBanned: boolean; reason?: string; expiresAt?: number | null; bannedAt?: number; bannedBy?: string }> {
  try {
    const stub = getModerationDO(env);
    const resp = await stub.fetch(
      new Request(`http://internal/moderation/check-ban?userId=${encodeURIComponent(userId)}`)
    );
    if (resp.ok) {
      return (await resp.json()) as any;
    }
  } catch (err) {
    console.error('Failed to check ban status:', err);
  }
  return { isBanned: false };
}

export async function modBanUser(
  env: { ROOM_DO: any },
  ban: { userId: string; reason: string; durationHours?: number | null; bannedBy: string }
): Promise<{ ok: boolean }> {
  try {
    const stub = getModerationDO(env);
    const resp = await stub.fetch(
      new Request('http://internal/moderation/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ban),
      })
    );
    return (await resp.json()) as any;
  } catch (err) {
    console.error('Failed to ban user:', err);
    return { ok: false };
  }
}

export async function modUnbanUser(
  env: { ROOM_DO: any },
  userId: string
): Promise<{ ok: boolean }> {
  try {
    const stub = getModerationDO(env);
    const resp = await stub.fetch(
      new Request('http://internal/moderation/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
    );
    return (await resp.json()) as any;
  } catch (err) {
    console.error('Failed to unban user:', err);
    return { ok: false };
  }
}

export async function modSearchUsers(
  env: { ROOM_DO: any },
  query: string
): Promise<Array<any>> {
  try {
    const stub = getModerationDO(env);
    const resp = await stub.fetch(
      new Request(`http://internal/moderation/search?query=${encodeURIComponent(query)}`)
    );
    if (resp.ok) {
      const data = (await resp.json()) as any;
      return data.users || [];
    }
  } catch (err) {
    console.error('Failed to search users:', err);
  }
  return [];
}

export async function modListBanned(
  env: { ROOM_DO: any }
): Promise<Array<any>> {
  try {
    const stub = getModerationDO(env);
    const resp = await stub.fetch(new Request('http://internal/moderation/banned-list'));
    if (resp.ok) {
      const data = (await resp.json()) as any;
      return data.banned || [];
    }
  } catch (err) {
    console.error('Failed to list banned users:', err);
  }
  return [];
}

export async function modGetStats(
  env: { ROOM_DO: any }
): Promise<{ totalUsers: number; totalBanned: number }> {
  try {
    const stub = getModerationDO(env);
    const resp = await stub.fetch(new Request('http://internal/moderation/stats'));
    if (resp.ok) {
      return (await resp.json()) as any;
    }
  } catch (err) {
    console.error('Failed to get stats:', err);
  }
  return { totalUsers: 0, totalBanned: 0 };
}

/**
 * Builds the Admin Dashboard message payload with action buttons.
 */
export function buildAdminDashboardPayload(chatId: string | number, stats: { totalUsers: number; totalBanned: number }) {
  return {
    method: 'sendMessage',
    chat_id: chatId,
    text:
      `⚙️ <b>پنل مدیریت Liar's Deck</b>\n\n` +
      `👥 <b>کل بازیکنان ثبت‌شده:</b> ${stats.totalUsers} نفر\n` +
      `🚫 <b>کاربران مسدودشده:</b> ${stats.totalBanned} نفر\n\n` +
      `📌 <b>دستورات سریع در چت:</b>\n` +
      `🔍 جستجو: <code>/search &lt;آیدی یا یوزرنیم&gt;</code>\n` +
      `🚫 بن دائم: <code>/ban &lt;آیدی&gt; &lt;علت&gt;</code>\n` +
      `⏳ بن موقت: <code>/ban &lt;آیدی&gt; &lt;ساعت&gt;h &lt;علت&gt;</code>\n` +
      `✅ رفع بن: <code>/unban &lt;آیدی&gt;</code>`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔍 راهنمای جستجو', callback_data: 'admin_search_help' },
          { text: '🚫 لیست مسدودشده‌ها', callback_data: 'admin_banned' },
        ],
        [
          { text: '🔄 به‌روزرسانی آمار', callback_data: 'admin_dashboard' },
        ],
      ],
    },
  };
}

