# Evidence: T-030 Telegram InitData HMAC Cryptographic Validation Boundary

## Task Metadata
- **Task ID**: `T-030-TELEGRAM-AUTH-INITDATA-VALIDATION`
- **Stage**: `STAGE-05` (Telegram Integration)
- **Workflow Profile**: `STRICT`
- **Risk Level**: `HIGH`
- **Base Commit**: `4fc8bb1422929da069bd3da9ba85c3f044662fc1`
- **Task Start Commit**: `e0b001614749f7e77a28892784534431e33c66f9`
- **Implementation Commit**: `54de4f8a526d968964aa574b3745fd14858bbdb9`
- **Authoritative Implementation Commit for Verification**: `54de4f8a526d968964aa574b3745fd14858bbdb9`

---

## 1. Architectural & Security Intent

This module establishes a pure, fail-closed, cryptographic validation boundary for Telegram Mini App `initData` query strings in `packages/room-runtime`.

### Security Invariants & Guardrails
- **Zero Trust Client Data**: `Telegram.WebApp.initDataUnsafe` is explicitly untrusted. Only raw `initData` verified against the server's Bot Token secret is accepted.
- **Timing Attack Prevention**: Uses `crypto.timingSafeEqual` for constant-time comparison of expected vs. received hex signatures.
- **Cryptographic Standard**:
  - `secret_key = HMAC-SHA256("WebAppData", botToken)`
  - `data_check_string = key1=val1\nkey2=val2...` (alphabetically sorted, excluding `hash`)
  - `expected_hash = HMAC-SHA256(secret_key, data_check_string)` hex-encoded
- **Expiration Enforcement**: `auth_date` checked against `maxAgeSeconds` (default 24 hours / 86400s) to prevent replay of old authenticated sessions.
- **Deterministic Testing**: Supports optional `currentTimeSec` override for reproducible unit tests.
- **Pure Function**: Zero side effects, zero external networking, zero global state modification.

---

## 2. API Contract

```typescript
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
}

export function validateTelegramInitData(
  rawInitData: string,
  botToken: string,
  maxAgeSeconds?: number,
  currentTimeSec?: number
): TelegramAuthResult;
```

---

## 3. Acceptance Criteria Mapping

| ID | Criterion | Evidence / Test | Status |
|---|---|---|---|
| AC-01 | Pure fail-closed `validateTelegramInitData` exported from room-runtime | `src/telegram-auth.ts`, `src/index.ts` | PASS |
| AC-02 | `ValidatedTelegramUser` and `TelegramAuthResult` interfaces defined and exported | `src/telegram-auth.ts`, `src/index.ts` | PASS |
| AC-03 | Rejects missing or empty `rawInitData` with `MALFORMED_INIT_DATA` | `telegram-auth.test.ts` ("rejects empty or blank rawInitData") | PASS |
| AC-04 | Rejects missing hash parameter with `INVALID_HASH` | `telegram-auth.test.ts` ("rejects payload missing hash parameter") | PASS |
| AC-05 | Builds `dataCheckString` with alphabetical sorting of key-value pairs joined by `\n`, excluding `hash` | `telegram-auth.test.ts` ("correctly handles multi-key dataCheckString sorting") | PASS |
| AC-06 | Computes secret key via `HMAC-SHA256("WebAppData", botToken)` | `src/telegram-auth.ts:63` | PASS |
| AC-07 | Computes expected signature via `HMAC-SHA256(secretKey, dataCheckString)` hex | `src/telegram-auth.ts:66` | PASS |
| AC-08 | Uses `crypto.timingSafeEqual` for constant-time comparison against received hash | `src/telegram-auth.ts:73` | PASS |
| AC-09 | Rejects mismatched hash with `INVALID_HASH` | `telegram-auth.test.ts` ("rejects tampered payload", "rejects wrong bot token", "rejects arbitrary forged hash") | PASS |
| AC-10 | Validates `auth_date` and rejects expired payloads older than `maxAgeSeconds` with `EXPIRED_AUTH_DATE` | `telegram-auth.test.ts` ("rejects expired payload where auth_date exceeds maxAgeSeconds") | PASS |
| AC-11 | Validates and parses user JSON payload, extracting id, first_name, and optional fields | `telegram-auth.test.ts` ("successfully verifies a valid Telegram initData payload with all user fields") | PASS |
| AC-12 | Rejects missing user or malformed user JSON with `MISSING_USER` or `MALFORMED_INIT_DATA` | `telegram-auth.test.ts` ("missing user parameter", "malformed non-JSON", "missing id", "missing first_name") | PASS |
| AC-13 | Supports optional deterministic `currentTimeSec` for deterministic unit testing | `src/telegram-auth.ts:85`, `telegram-auth.test.ts` | PASS |
| AC-14 | Zero external network or runtime dependencies introduced | `package.json` unchanged | PASS |
| AC-15 | Full test suite passes across all workspaces | `npm test` (585 tests / 31 test files) | PASS |

---

## 4. Verification Output

### Typecheck
```
> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/game-core && tsc --noEmit
```
Status: PASS (Code 0)

### Automated Test Suite
```
RUN  v1.6.1 D:/LiarsTelegram/packages/game-core
Test Files  16 passed (16)
     Tests  251 passed (251)

RUN  v1.6.1 D:/LiarsTelegram/packages/room-runtime
 ✓ tests/gameplay-protocol.test.ts  (16 tests)
 ✓ tests/room-state.test.ts  (7 tests)
 ✓ tests/telegram-auth.test.ts  (18 tests)
 ✓ tests/recipient-projection.test.ts  (30 tests)
 ✓ tests/presence.test.ts  (20 tests)
 ✓ tests/presence-lifecycle.test.ts  (20 tests)
 ✓ tests/system-timeout-presence-lifecycle.test.ts  (10 tests)
 ✓ tests/turn-deadline.test.ts  (22 tests)
 ✓ tests/gameplay-authorization.test.ts  (20 tests)
 ✓ tests/system-timeout-transaction.test.ts  (19 tests)
 ✓ tests/gameplay-admission.test.ts  (37 tests)
 ✓ tests/timed-gameplay-presence-lifecycle.test.ts  (15 tests)
 ✓ tests/gameplay-transaction.test.ts  (16 tests)
 ✓ tests/timed-gameplay-transaction.test.ts  (17 tests)
 ✓ tests/provider-alarm-sync.test.ts  (67 tests)

Test Files  15 passed (15)
     Tests  334 passed (334)
```
Total: 31 test files, 585 tests passed, 0 failures (100% pass rate).
