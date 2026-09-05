import { randomBytes } from 'node:crypto';

export interface TelegramInlineKeyboardButton {
  text: string;
  web_app?: { url: string };
  url?: string;
}

export interface TelegramSendMessagePayload {
  method: 'sendMessage';
  chat_id: number | string;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: {
    inline_keyboard: TelegramInlineKeyboardButton[][];
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number | string;
      type: string;
    };
    text?: string;
  };
}

/**
 * Validates a Room ID:
 * - Must be a non-empty string between 4 and 32 characters.
 * - Must consist strictly of URL-safe alphanumeric characters, dashes, or underscores.
 * - Rejects path traversal, whitespace, control characters, and prototypes.
 */
export function isValidRoomId(roomId: unknown): roomId is string {
  if (typeof roomId !== 'string') {
    return false;
  }
  const trimmed = roomId.trim();
  if (trimmed.length < 4 || trimmed.length > 32) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Generates a cryptographically random, URL-safe Room ID.
 * Default format: r_<8-hex-chars> (e.g., "r_a3f81c9b")
 */
export function generateRoomId(prefix: string = 'r_'): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  const randomHex = randomBytes(4).toString('hex');
  return `${safePrefix}${randomHex}`;
}

export interface FormatTelegramInviteLinkOptions {
  botUsername: string;
  roomId: string;
  appName?: string;
}

/**
 * Formats a canonical Telegram Mini App deep link for inviting players to a Room.
 * - If appName is provided: https://t.me/<botUsername>/<appName>?startapp=<roomId>
 * - If appName is omitted: https://t.me/<botUsername>?startapp=<roomId>
 */
export function formatTelegramInviteLink(options: FormatTelegramInviteLinkOptions): string {
  if (!options || typeof options !== 'object') {
    throw new Error('Invalid options: must be an object');
  }

  const { botUsername, roomId, appName } = options;

  if (typeof botUsername !== 'string' || botUsername.trim().length === 0) {
    throw new Error('Invalid botUsername: must be a non-empty string');
  }

  if (!isValidRoomId(roomId)) {
    throw new Error(`Invalid roomId: '${roomId}' is not a valid room ID`);
  }

  const cleanBot = botUsername.replace(/^@/, '').trim();

  if (typeof appName === 'string' && appName.trim().length > 0) {
    const cleanApp = appName.trim();
    return `https://t.me/${cleanBot}/${cleanApp}?startapp=${encodeURIComponent(roomId.trim())}`;
  }

  return `https://t.me/${cleanBot}?startapp=${encodeURIComponent(roomId.trim())}`;
}

/**
 * Parses and sanitizes a start_param value (e.g. from initData or URL query string).
 * Returns the valid roomId if valid, or null if missing/malformed.
 */
export function parseTelegramStartParam(rawParam: unknown): string | null {
  if (typeof rawParam !== 'string') {
    return null;
  }

  const trimmed = rawParam.trim();
  if (isValidRoomId(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Generates a webhook response payload for Telegram Bot /start commands.
 * - `/start`: General welcome message with button to open the Mini App.
 * - `/start <roomId>`: Room invitation message with button to launch Mini App with startapp=<roomId>.
 * - Unhandled commands or malformed updates return null.
 */
export function formatTelegramBotWebhookResponse(
  update: TelegramUpdate,
  appUrl: string,
  botUsername: string,
  appName?: string
): TelegramSendMessagePayload | null {
  if (!update || typeof update !== 'object' || !update.message || !update.message.chat) {
    return null;
  }

  const text = update.message.text;
  if (typeof text !== 'string' || !text.startsWith('/start')) {
    return null;
  }

  const chatId = update.message.chat.id;
  const parts = text.trim().split(/\s+/);
  const startArg = parts.length > 1 ? parts[1] : undefined;
  const roomId = parseTelegramStartParam(startArg);

  if (roomId !== null) {
    // Invited to a specific room
    const joinUrl = appUrl.includes('?')
      ? `${appUrl}&startapp=${encodeURIComponent(roomId)}`
      : `${appUrl}?startapp=${encodeURIComponent(roomId)}`;

    return {
      method: 'sendMessage',
      chat_id: chatId,
      text: `🃏 <b>Liar's Deck Invitation</b>\n\nYou have been invited to join room: <code>${roomId}</code>\n\nTap the button below to join the lobby!`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🃏 Join Room',
              web_app: { url: joinUrl },
            },
          ],
        ],
      },
    };
  }

  // Generic /start without room argument
  return {
    method: 'sendMessage',
    chat_id: chatId,
    text: `🃏 <b>Welcome to Liar's Deck!</b>\n\nA game of deception, bluffing, and survival for 2–4 players.\n\nTap below to play with friends!`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🎮 Play Liar\'s Deck',
            web_app: { url: appUrl },
          },
        ],
      ],
    },
  };
}
