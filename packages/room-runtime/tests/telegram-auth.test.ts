import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateTelegramInitData, ValidatedTelegramUser } from '../src/telegram-auth.js';

/**
 * Test helper to synthesize a valid signed Telegram initData query string.
 */
function createMockInitData(
  params: Record<string, string>,
  botToken: string
): string {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'hash') {
      pairs.push({ key, value });
    }
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

describe('T-030 Telegram InitData HMAC Validation Boundary', () => {
  const MOCK_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567';
  const FIXED_TIME_SEC = 1700000000;

  const validUser: ValidatedTelegramUser = {
    id: 987654321,
    first_name: 'Alice',
    last_name: 'Liddell',
    username: 'alice_wonder',
    language_code: 'en',
    is_premium: true,
    allows_write_to_pm: true,
  };

  it('successfully verifies a valid Telegram initData payload with all user fields', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        query_id: 'AAHdF6IQAAAAAN0XohDhrP_Q',
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.authDate).toBe(FIXED_TIME_SEC - 100);
    expect(result.user).toEqual({
      id: 987654321,
      first_name: 'Alice',
      last_name: 'Liddell',
      username: 'alice_wonder',
      language_code: 'en',
      is_premium: true,
      allows_write_to_pm: true,
    });
  });

  it('successfully verifies a minimal valid payload with only required user fields', () => {
    const minimalUser = {
      id: 11223344,
      first_name: 'Bob',
    };

    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 50),
        user: JSON.stringify(minimalUser),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.user).toEqual({
      id: 11223344,
      first_name: 'Bob',
    });
  });

  it('rejects tampered payload where user.id was altered after signing (INVALID_HASH)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    // Tamper with user parameter
    const tamperedParams = new URLSearchParams(rawInitData);
    const tamperedUser = { ...validUser, id: 999999999 };
    tamperedParams.set('user', JSON.stringify(tamperedUser));

    const result = validateTelegramInitData(
      tamperedParams.toString(),
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_HASH');
    expect(result.user).toBeUndefined();
  });

  it('rejects payload with wrong bot token (INVALID_HASH)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      'DIFFERENT_BOT_TOKEN_987654321',
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_HASH');
  });

  it('rejects payload with arbitrary forged hash (INVALID_HASH)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const forgedParams = new URLSearchParams(rawInitData);
    forgedParams.set('hash', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');

    const result = validateTelegramInitData(
      forgedParams.toString(),
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_HASH');
  });

  it('rejects payload with non-hex or malformed hash length (INVALID_HASH)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const malformedHashParams = new URLSearchParams(rawInitData);
    malformedHashParams.set('hash', 'not_a_valid_hex_hash');

    const result = validateTelegramInitData(
      malformedHashParams.toString(),
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_HASH');
  });

  it('rejects payload missing hash parameter (INVALID_HASH)', () => {
    const searchParams = new URLSearchParams();
    searchParams.set('auth_date', String(FIXED_TIME_SEC - 100));
    searchParams.set('user', JSON.stringify(validUser));

    const result = validateTelegramInitData(
      searchParams.toString(),
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_HASH');
  });

  it('rejects expired payload where auth_date exceeds maxAgeSeconds (EXPIRED_AUTH_DATE)', () => {
    // 25 hours old = 90,000 seconds
    const expiredAuthDate = FIXED_TIME_SEC - 90000;
    const rawInitData = createMockInitData(
      {
        auth_date: String(expiredAuthDate),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400, // 24 hours TTL
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('EXPIRED_AUTH_DATE');
    expect(result.user).toBeUndefined();
  });

  it('accepts payload within custom short TTL and rejects when expired under that TTL', () => {
    const shortTtlSec = 300; // 5 minutes
    const validTime = FIXED_TIME_SEC - 200; // 200s old -> valid under 300s
    const expiredTime = FIXED_TIME_SEC - 400; // 400s old -> expired under 300s

    const validInitData = createMockInitData(
      {
        auth_date: String(validTime),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const expiredInitData = createMockInitData(
      {
        auth_date: String(expiredTime),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const validRes = validateTelegramInitData(validInitData, MOCK_BOT_TOKEN, shortTtlSec, FIXED_TIME_SEC);
    expect(validRes.success).toBe(true);

    const expiredRes = validateTelegramInitData(expiredInitData, MOCK_BOT_TOKEN, shortTtlSec, FIXED_TIME_SEC);
    expect(expiredRes.success).toBe(false);
    expect(expiredRes.error).toBe('EXPIRED_AUTH_DATE');
  });

  it('rejects payload missing auth_date (MALFORMED_INIT_DATA)', () => {
    const rawInitData = createMockInitData(
      {
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MALFORMED_INIT_DATA');
  });

  it('rejects payload with non-integer auth_date (MALFORMED_INIT_DATA)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: 'not_a_number',
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MALFORMED_INIT_DATA');
  });

  it('rejects payload missing user parameter (MISSING_USER)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        query_id: 'AAHdF6IQAAAAAN0XohDhrP_Q',
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MISSING_USER');
  });

  it('rejects payload with malformed non-JSON user parameter (MALFORMED_INIT_DATA)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: 'invalid{json_string',
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MALFORMED_INIT_DATA');
  });

  it('rejects payload with user JSON missing numeric id (MISSING_USER)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify({ first_name: 'NoIdUser' }),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MISSING_USER');
  });

  it('rejects payload with user JSON missing first_name (MALFORMED_INIT_DATA)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify({ id: 12345 }),
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MALFORMED_INIT_DATA');
  });

  it('rejects empty or blank rawInitData (MALFORMED_INIT_DATA)', () => {
    expect(validateTelegramInitData('', MOCK_BOT_TOKEN).error).toBe('MALFORMED_INIT_DATA');
    expect(validateTelegramInitData('   ', MOCK_BOT_TOKEN).error).toBe('MALFORMED_INIT_DATA');
    expect(validateTelegramInitData(null as unknown as string, MOCK_BOT_TOKEN).error).toBe('MALFORMED_INIT_DATA');
  });

  it('rejects empty or blank botToken (MALFORMED_INIT_DATA)', () => {
    const rawInitData = createMockInitData(
      {
        auth_date: String(FIXED_TIME_SEC - 100),
        user: JSON.stringify(validUser),
      },
      MOCK_BOT_TOKEN
    );

    expect(validateTelegramInitData(rawInitData, '').error).toBe('MALFORMED_INIT_DATA');
    expect(validateTelegramInitData(rawInitData, '   ').error).toBe('MALFORMED_INIT_DATA');
  });

  it('correctly handles multi-key dataCheckString sorting across diverse parameter keys', () => {
    const rawInitData = createMockInitData(
      {
        chat_type: 'sender',
        auth_date: String(FIXED_TIME_SEC - 10),
        start_param: 'room_12345',
        user: JSON.stringify(validUser),
        chat_instance: '-8573920194820',
      },
      MOCK_BOT_TOKEN
    );

    const result = validateTelegramInitData(
      rawInitData,
      MOCK_BOT_TOKEN,
      86400,
      FIXED_TIME_SEC
    );

    expect(result.success).toBe(true);
    expect(result.user?.id).toBe(validUser.id);
  });
});
