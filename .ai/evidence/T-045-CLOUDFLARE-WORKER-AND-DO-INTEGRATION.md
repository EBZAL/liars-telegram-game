# Task Evidence: T-045-CLOUDFLARE-WORKER-AND-DO-INTEGRATION

## Task Overview
- **Task ID**: `T-045-CLOUDFLARE-WORKER-AND-DO-INTEGRATION`
- **Component**: `packages/worker`
- **Workflow Profile**: `STRICT`
- **Risk Level**: `HIGH`
- **Objective**: Implement `@liars-telegram-game/worker` workspace package, Cloudflare Worker entrypoint, SQLite-backed `RoomDurableObject`, WebSocket upgrade handling, provider alarm integration, Telegram initData validation, bot webhook routing, and static asset fallback.

## Acceptance Criteria Verification

### AC-01: Workspace Package & Configuration
- Verified: `@liars-telegram-game/worker` workspace package created with TypeScript, `@cloudflare/workers-types`, `wrangler.jsonc` (declaring `ROOM_DO` binding and `new_sqlite_classes: ["RoomDurableObject"]` migration tag), and `package.json` scripts (`typecheck`, `test`, `deploy`).
- Evidence: `packages/worker/package.json`, `packages/worker/tsconfig.json`, `packages/worker/wrangler.jsonc`.

### AC-02: SQLite-Backed RoomDurableObject & WebSocket Upgrade Handling
- Verified: `RoomDurableObject` wraps `RoomCoordinator` with `this.state.storage.sql`, manages WebSocket connection pairs via `serverWs.accept()`, registers connection presence on connect and on `JOIN`, synchronizes alarm state via `deriveProviderAlarmSyncPlan` to `this.state.storage.setAlarm()` / `deleteAlarm()`, and handles client commands (`JOIN`, `LEAVE`, `START_MATCH`, `GAMEPLAY_ACTION`).
- Evidence: `packages/worker/src/durable-object.ts`, `packages/worker/tests/worker.test.ts` ("RoomDurableObject Lifecycle & Coordination").

### AC-03: Cloudflare Worker HTTP Router & Authentication Boundary
- Verified: Worker entrypoint routes:
  1. `GET /api/health`: 200 OK `{ status: 'ok' }`.
  2. `POST /api/room`: 200 OK `{ roomId: 'r_...' }`.
  3. `POST /api/telegram-webhook`: Telegram secret token validation, bot `/start` and `/start <roomId>` deep link button responses via `formatTelegramBotWebhookResponse`.
  4. `GET /room/:roomId/ws`: Validates room ID, rejects non-websocket upgrades with 426, authenticates Telegram HMAC initData (rejects missing/tampered with 401, forwards valid with `x-player-id` header), forwards to DO stub.
  5. Static assets / fallback service response.
- Evidence: `packages/worker/src/index.ts`, `packages/worker/tests/worker.test.ts` ("Worker HTTP Router", "WebSocket Routing & Telegram Authentication Boundary").

### AC-04: Automated Unit & Integration Tests
- Verified: 12 tests in `packages/worker/tests/worker.test.ts` testing healthcheck, room generation, webhook authentication, startapp deep links, websocket upgrade verification, initData HMAC authentication, dev/insecure auth fallbacks, lobby flow, match start, turn gameplay, turn deadline alarms, presence pause, living reconnect resumption, and 24h retention room deletion.
- Evidence: `packages/worker/tests/worker.test.ts` (12 passing tests).

### AC-05: Zero Regressions Across Full Monorepo
- Verified: All 4 workspaces compile cleanly with zero TypeScript errors. Full test regression suite passes 714 tests across 47 test files (251 `game-core`, 415 `room-runtime`, 36 `client`, 12 `worker`).

## Automated Test & Typecheck Evidence

### Monorepo Typecheck Output
```
> typecheck
> npm run typecheck --workspace=@liars-telegram-game/game-core && npm run typecheck --workspace=@liars-telegram-game/room-runtime && npm run typecheck --workspace=@liars-telegram-game/client && npm run typecheck --workspace=@liars-telegram-game/worker

> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/game-core && tsc --noEmit

> @liars-telegram-game/client@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/room-runtime && tsc --noEmit

> @liars-telegram-game/worker@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/room-runtime && tsc --noEmit
```

### Full Test Suite Output
```
 Test Files  47 passed (47)
      Tests  714 passed (714)
   - game-core:    16 files, 251 tests passed
   - room-runtime: 24 files, 415 tests passed
   - client:        6 files,  36 tests passed
   - worker:        1 file,   12 tests passed
```
