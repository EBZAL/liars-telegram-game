import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  validateTelegramInitData,
  isValidRoomId,
  generateRoomId,
  formatTelegramInviteLink,
  parseTelegramStartParam,
  formatTelegramBotWebhookResponse,
  TelegramUpdate,
} from '../src/index.js';

function createValidInitData(
  params: Record<string, string>,
  botToken: string
): string {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(params)) {
    pairs.push({ key, value });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheckString = pairs.map(({ key, value }) => `${key}=${value}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const urlParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    urlParams.set(k, v);
  }
  urlParams.set('hash', hash);

  return urlParams.toString();
}

describe('T-032 Telegram Deep Link Invite and Routing Primitives', () => {
  describe('validateTelegramInitData start_param extraction (AC-01)', () => {
    const botToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    const nowSec = 1700000000;

    it('extracts startParam when start_param is present in signed initData (AC-01)', () => {
      const raw = createValidInitData(
        {
          auth_date: String(nowSec),
          user: JSON.stringify({ id: 42, first_name: 'Alice' }),
          start_param: 'r_game1234',
        },
        botToken
      );

      const res = validateTelegramInitData(raw, botToken, 86400, nowSec);
      expect(res.success).toBe(true);
      expect(res.user?.id).toBe(42);
      expect(res.startParam).toBe('r_game1234');
    });

    it('leaves startParam undefined when start_param is not present in signed initData', () => {
      const raw = createValidInitData(
        {
          auth_date: String(nowSec),
          user: JSON.stringify({ id: 42, first_name: 'Alice' }),
        },
        botToken
      );

      const res = validateTelegramInitData(raw, botToken, 86400, nowSec);
      expect(res.success).toBe(true);
      expect(res.startParam).toBeUndefined();
    });
  });

  describe('generateRoomId and isValidRoomId (AC-02 through AC-05)', () => {
    it('generates valid room IDs matching default prefix r_ (AC-02, AC-03)', () => {
      const id1 = generateRoomId();
      const id2 = generateRoomId();

      expect(id1.startsWith('r_')).toBe(true);
      expect(id2.startsWith('r_')).toBe(true);
      expect(id1).not.toBe(id2);
      expect(isValidRoomId(id1)).toBe(true);
      expect(isValidRoomId(id2)).toBe(true);
    });

    it('supports custom prefix (AC-03)', () => {
      const id = generateRoomId('room-');
      expect(id.startsWith('room-')).toBe(true);
      expect(isValidRoomId(id)).toBe(true);
    });

    it('isValidRoomId accepts valid alphanumeric, dash, and underscore strings (AC-04, AC-05)', () => {
      expect(isValidRoomId('r_a1b2c3d4')).toBe(true);
      expect(isValidRoomId('room-123')).toBe(true);
      expect(isValidRoomId('GAME_ROOM_42')).toBe(true);
      expect(isValidRoomId('test')).toBe(true); // 4 chars (min)
    });

    it('isValidRoomId rejects invalid or malicious inputs (AC-05)', () => {
      expect(isValidRoomId('')).toBe(false);
      expect(isValidRoomId('   ')).toBe(false);
      expect(isValidRoomId('abc')).toBe(false); // < 4 chars
      expect(isValidRoomId('a'.repeat(33))).toBe(false); // > 32 chars
      expect(isValidRoomId(null)).toBe(false);
      expect(isValidRoomId(undefined)).toBe(false);
      expect(isValidRoomId(12345)).toBe(false);
      expect(isValidRoomId('../path/traversal')).toBe(false);
      expect(isValidRoomId('room 123')).toBe(false); // spaces
      expect(isValidRoomId('room?start=1')).toBe(false); // query chars
      expect(isValidRoomId('<script>')).toBe(false);
    });
  });

  describe('formatTelegramInviteLink (AC-06 through AC-08)', () => {
    it('formats direct bot link with startapp parameter when appName is omitted (AC-06, AC-07)', () => {
      const link = formatTelegramInviteLink({
        botUsername: 'LiarsDeckBot',
        roomId: 'r_abc12345',
      });
      expect(link).toBe('https://t.me/LiarsDeckBot?startapp=r_abc12345');
    });

    it('strips leading @ from botUsername', () => {
      const link = formatTelegramInviteLink({
        botUsername: '@LiarsDeckBot',
        roomId: 'r_abc12345',
      });
      expect(link).toBe('https://t.me/LiarsDeckBot?startapp=r_abc12345');
    });

    it('formats bot Mini App link when appName is provided (AC-08)', () => {
      const link = formatTelegramInviteLink({
        botUsername: 'LiarsDeckBot',
        appName: 'game',
        roomId: 'r_abc12345',
      });
      expect(link).toBe('https://t.me/LiarsDeckBot/game?startapp=r_abc12345');
    });

    it('rejects invalid botUsername or invalid roomId', () => {
      expect(() =>
        formatTelegramInviteLink({
          botUsername: '',
          roomId: 'r_valid123',
        })
      ).toThrow(/Invalid botUsername/);

      expect(() =>
        formatTelegramInviteLink({
          botUsername: 'MyBot',
          roomId: 'invalid/room/path',
        })
      ).toThrow(/Invalid roomId/);
    });
  });

  describe('parseTelegramStartParam (AC-09, AC-10)', () => {
    it('extracts and returns valid roomId from raw parameter (AC-09, AC-10)', () => {
      expect(parseTelegramStartParam('r_1234abcd')).toBe('r_1234abcd');
      expect(parseTelegramStartParam('  r_1234abcd  ')).toBe('r_1234abcd');
    });

    it('returns null for invalid or missing parameter', () => {
      expect(parseTelegramStartParam(null)).toBeNull();
      expect(parseTelegramStartParam(undefined)).toBeNull();
      expect(parseTelegramStartParam('')).toBeNull();
      expect(parseTelegramStartParam('../malicious')).toBeNull();
    });
  });

  describe('formatTelegramBotWebhookResponse (AC-11 through AC-15)', () => {
    const appUrl = 'https://liars-deck.app';
    const botUsername = 'LiarsDeckBot';

    it('formats generic /start command response with play WebApp button (AC-12)', () => {
      const update: TelegramUpdate = {
        update_id: 100,
        message: {
          message_id: 1,
          chat: { id: 12345, type: 'private' },
          text: '/start',
        },
      };

      const res = formatTelegramBotWebhookResponse(update, appUrl, botUsername);
      expect(res).not.toBeNull();
      expect(res?.method).toBe('sendMessage');
      expect(res?.chat_id).toBe(12345);
      expect(res?.text).toContain('Welcome to Liar\'s Deck');
      expect(res?.reply_markup?.inline_keyboard[0][0].web_app?.url).toBe(appUrl);
    });

    it('formats /start <roomId> deep link response with Join Room WebApp button (AC-13)', () => {
      const update: TelegramUpdate = {
        update_id: 101,
        message: {
          message_id: 2,
          chat: { id: 12345, type: 'private' },
          text: '/start r_target99',
        },
      };

      const res = formatTelegramBotWebhookResponse(update, appUrl, botUsername);
      expect(res).not.toBeNull();
      expect(res?.method).toBe('sendMessage');
      expect(res?.chat_id).toBe(12345);
      expect(res?.text).toContain('r_target99');
      expect(res?.reply_markup?.inline_keyboard[0][0].text).toBe('🃏 Join Room');
      expect(res?.reply_markup?.inline_keyboard[0][0].web_app?.url).toBe(
        'https://liars-deck.app?startapp=r_target99'
      );
    });

    it('properly appends &startapp if appUrl already contains query parameters', () => {
      const update: TelegramUpdate = {
        update_id: 102,
        message: {
          message_id: 3,
          chat: { id: 12345, type: 'private' },
          text: '/start r_target99',
        },
      };

      const res = formatTelegramBotWebhookResponse(
        update,
        'https://liars-deck.app?v=2',
        botUsername
      );
      expect(res?.reply_markup?.inline_keyboard[0][0].web_app?.url).toBe(
        'https://liars-deck.app?v=2&startapp=r_target99'
      );
    });

    it('returns null for non-start bot commands or malformed updates (AC-14)', () => {
      const helpUpdate: TelegramUpdate = {
        update_id: 103,
        message: {
          message_id: 4,
          chat: { id: 12345, type: 'private' },
          text: '/help',
        },
      };
      expect(formatTelegramBotWebhookResponse(helpUpdate, appUrl, botUsername)).toBeNull();

      const malformedUpdate: TelegramUpdate = {
        update_id: 104,
      };
      expect(formatTelegramBotWebhookResponse(malformedUpdate, appUrl, botUsername)).toBeNull();
    });
  });
});
