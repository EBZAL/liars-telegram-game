# Evidence: T-032 Telegram Deep Link Invite and Routing Primitives

## Task Metadata
- **Task ID**: `T-032-TELEGRAM-DEEP-LINK-INVITE-ROUTING`
- **Stage**: `STAGE-05` (Telegram Integration)
- **Workflow Profile**: `STANDARD`
- **Risk Level**: `MEDIUM`
- **Task Start Commit**: `224fca8`
- **Implementation Commit**: `0cda05b`
- **Authoritative Implementation Commit for Verification**: `0cda05b`

---

## 1. Architectural Intent

This module establishes pure, server-authoritative Telegram deep linking, `startapp` parameter routing, safe Room ID generation/validation, invite link formatting, and Telegram Bot webhook command message/keyboard formatting in `packages/room-runtime`.

### Architectural Rules & Invariants
- **Telegram WebApp Authentication**: `validateTelegramInitData` safely extracts `start_param` as `startParam` on `TelegramAuthResult` while maintaining HMAC integrity.
- **Safe Room IDs**: `isValidRoomId` ensures IDs are strictly alphanumeric, dash, or underscore (4..32 chars), preventing path traversal, script injection, or malformed routing.
- **Canonical Invite Links**: `formatTelegramInviteLink` builds canonical Telegram Mini App deep links for bot or direct app endpoints (`https://t.me/<bot>[/<app>]?startapp=<roomId>`).
- **Telegram Bot Webhook Response**: `formatTelegramBotWebhookResponse` generates clean, schema-compliant Telegram Bot API `sendMessage` payloads with inline WebApp launch buttons for `/start` (Create Room / Play) and `/start <roomId>` (Join Room Lobby).

---

## 2. Acceptance Criteria Mapping

| ID | Criterion | Evidence / Test | Status |
|---|---|---|---|
| AC-01 | `validateTelegramInitData` extracts optional `start_param` as `startParam` on `TelegramAuthResult` | `telegram-routing.test.ts` ("extracts startParam when start_param is present in signed initData") | PASS |
| AC-02 | Pure `generateRoomId` exported from room-runtime | `src/telegram-routing.ts`, `src/index.ts` | PASS |
| AC-03 | `generateRoomId` creates URL-safe alphanumeric ID with default prefix `r_` | `telegram-routing.test.ts` ("generates valid room IDs matching default prefix r_") | PASS |
| AC-04 | Pure `isValidRoomId` exported from room-runtime | `src/telegram-routing.ts`, `src/index.ts` | PASS |
| AC-05 | `isValidRoomId` strictly validates non-empty, URL-safe alphanumeric strings (4-32 chars) and rejects invalid/malicious characters | `telegram-routing.test.ts` ("isValidRoomId accepts valid...", "isValidRoomId rejects invalid...") | PASS |
| AC-06 | Pure `formatTelegramInviteLink` exported from room-runtime | `src/telegram-routing.ts`, `src/index.ts` | PASS |
| AC-07 | `formatTelegramInviteLink` formats standard t.me deep link with startapp parameter | `telegram-routing.test.ts` ("formats direct bot link with startapp parameter when appName is omitted") | PASS |
| AC-08 | `formatTelegramInviteLink` supports optional appName | `telegram-routing.test.ts` ("formats bot Mini App link when appName is provided") | PASS |
| AC-09 | Pure `parseTelegramStartParam` exported from room-runtime | `src/telegram-routing.ts`, `src/index.ts` | PASS |
| AC-10 | `parseTelegramStartParam` extracts and sanitizes valid roomId from start_param or query string | `telegram-routing.test.ts` ("extracts and returns valid roomId from raw parameter") | PASS |
| AC-11 | Pure `formatTelegramBotWebhookResponse` exported from room-runtime | `src/telegram-routing.ts`, `src/index.ts` | PASS |
| AC-12 | `formatTelegramBotWebhookResponse` formats /start without params as welcome message with Mini App WebApp button | `telegram-routing.test.ts` ("formats generic /start command response with play WebApp button") | PASS |
| AC-13 | `formatTelegramBotWebhookResponse` formats /start <roomId> as invite message with join Mini App WebApp button containing startapp parameter | `telegram-routing.test.ts` ("formats /start <roomId> deep link response with Join Room WebApp button") | PASS |
| AC-14 | `formatTelegramBotWebhookResponse` returns null for unhandled commands | `telegram-routing.test.ts` ("returns null for non-start bot commands or malformed updates") | PASS |
| AC-15 | Full test suite passes across all workspaces with zero regressions | `npm test` (626 tests / 33 test files pass) | PASS |

---

## 3. Verification Output

### Typecheck
```
> typecheck
> npm run typecheck --workspace=@liars-telegram-game/game-core && npm run typecheck --workspace=@liars-telegram-game/room-runtime

> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/game-core && tsc --noEmit

> @liars-telegram-game/game-core@0.1.0 build
> tsc
```
Status: PASS (Code 0)

### Automated Test Suite
```
RUN  v1.6.1 D:/LiarsTelegram/packages/game-core
Test Files  16 passed (16)
     Tests  251 passed (251)

RUN  v1.6.1 D:/LiarsTelegram/packages/room-runtime
 ✓ tests/room-state.test.ts  (7 tests)
 ✓ tests/gameplay-protocol.test.ts  (16 tests)
 ✓ tests/recipient-projection.test.ts  (30 tests)
 ✓ tests/telegram-auth.test.ts  (18 tests)
 ✓ tests/presence.test.ts  (20 tests)
 ✓ tests/telegram-routing.test.ts  (16 tests)
 ✓ tests/system-timeout-presence-lifecycle.test.ts  (10 tests)
 ✓ tests/presence-lifecycle.test.ts  (20 tests)
 ✓ tests/timed-gameplay-presence-lifecycle.test.ts  (15 tests)
 ✓ tests/gameplay-authorization.test.ts  (20 tests)
 ✓ tests/gameplay-transaction.test.ts  (16 tests)
 ✓ tests/system-timeout-transaction.test.ts  (19 tests)
 ✓ tests/timed-gameplay-transaction.test.ts  (17 tests)
 ✓ tests/gameplay-admission.test.ts  (37 tests)
 ✓ tests/turn-deadline.test.ts  (22 tests)
 ✓ tests/lobby-lifecycle.test.ts  (25 tests)
 ✓ tests/provider-alarm-sync.test.ts  (67 tests)

Test Files  17 passed (17)
     Tests  375 passed (375)
```
Total: 33 test files, 626 tests passed, 0 failures (100% pass rate).
