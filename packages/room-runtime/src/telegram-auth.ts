import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ValidatedTelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface TelegramAuthResult {
  success: boolean;
  error?: 'INVALID_HASH' | 'EXPIRED_AUTH_DATE' | 'MISSING_USER' | 'MALFORMED_INIT_DATA';
  user?: ValidatedTelegramUser;
  authDate?: number;
  startParam?: string;
}

/**
 * Validates Telegram Mini App initData against the Bot Token according to
 * official Telegram WebApp authentication specifications.
 *
 * Algorithm:
 * 1. Parse URL parameters from rawInitData.
 * 2. Extract and remove the `hash` parameter.
 * 3. Sort remaining key-value pairs alphabetically by key.
 * 4. Build data_check_string by joining pairs with newline `\n`.
 * 5. Compute secret_key = HMAC-SHA256("WebAppData", botToken).
 * 6. Compute expected_hash = HMAC-SHA256(secret_key, data_check_string) hex.
 * 7. Constant-time timingSafeEqual comparison between expected and received hash.
 * 8. Verify auth_date freshness against maxAgeSeconds TTL.
 * 9. Parse and validate JSON user payload.
 */
export function validateTelegramInitData(
  rawInitData: string,
  botToken: string,
  maxAgeSeconds: number = 86400,
  currentTimeSec?: number
): TelegramAuthResult {
  if (!rawInitData || typeof rawInitData !== 'string' || !rawInitData.trim()) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  if (!botToken || typeof botToken !== 'string' || !botToken.trim()) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(rawInitData);
  } catch {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  const hash = params.get('hash');
  if (!hash || typeof hash !== 'string' || hash.trim().length === 0) {
    return { success: false, error: 'INVALID_HASH' };
  }

  // Ensure hash is 64 hex characters (256-bit SHA-256 hex digest)
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    return { success: false, error: 'INVALID_HASH' };
  }

  // Remove hash and sort remaining parameters alphabetically
  params.delete('hash');

  const pairs: Array<{ key: string; value: string }> = [];
  for (const [key, value] of params.entries()) {
    pairs.push({ key, value });
  }

  if (pairs.length === 0) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const dataCheckString = pairs.map(({ key, value }) => `${key}=${value}`).join('\n');

  // Compute secret key: HMAC-SHA256("WebAppData", botToken)
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

  // Compute expected hash: HMAC-SHA256(secretKey, dataCheckString)
  const expectedHashHex = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Constant-time comparison to prevent timing attacks
  const expectedHashBuf = Buffer.from(expectedHashHex, 'hex');
  const receivedHashBuf = Buffer.from(hash, 'hex');

  if (expectedHashBuf.length !== receivedHashBuf.length || !timingSafeEqual(expectedHashBuf, receivedHashBuf)) {
    return { success: false, error: 'INVALID_HASH' };
  }

  // Validate auth_date
  const authDateStr = params.get('auth_date');
  if (!authDateStr) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  const authDate = parseInt(authDateStr, 10);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  const now = currentTimeSec !== undefined ? currentTimeSec : Math.floor(Date.now() / 1000);
  if (maxAgeSeconds > 0 && now - authDate > maxAgeSeconds) {
    return { success: false, error: 'EXPIRED_AUTH_DATE' };
  }

  // Validate user
  const userStr = params.get('user');
  if (!userStr) {
    return { success: false, error: 'MISSING_USER' };
  }

  let rawUser: unknown;
  try {
    rawUser = JSON.parse(userStr);
  } catch {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  if (!rawUser || typeof rawUser !== 'object' || Array.isArray(rawUser)) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  const userObj = rawUser as Record<string, unknown>;

  if (typeof userObj.id !== 'number' || !Number.isSafeInteger(userObj.id) || userObj.id <= 0) {
    return { success: false, error: 'MISSING_USER' };
  }

  if (typeof userObj.first_name !== 'string' || userObj.first_name.length === 0) {
    return { success: false, error: 'MALFORMED_INIT_DATA' };
  }

  const validatedUser: ValidatedTelegramUser = {
    id: userObj.id,
    first_name: userObj.first_name,
  };

  if (typeof userObj.last_name === 'string') {
    validatedUser.last_name = userObj.last_name;
  }
  if (typeof userObj.username === 'string') {
    validatedUser.username = userObj.username;
  }
  if (typeof userObj.language_code === 'string') {
    validatedUser.language_code = userObj.language_code;
  }
  if (typeof userObj.is_premium === 'boolean') {
    validatedUser.is_premium = userObj.is_premium;
  }
  if (typeof userObj.allows_write_to_pm === 'boolean') {
    validatedUser.allows_write_to_pm = userObj.allows_write_to_pm;
  }

  const startParamRaw = params.get('start_param');
  const startParam =
    typeof startParamRaw === 'string' && startParamRaw.trim().length > 0
      ? startParamRaw.trim()
      : undefined;

  return {
    success: true,
    user: validatedUser,
    authDate,
    ...(startParam !== undefined ? { startParam } : {}),
  };
}
