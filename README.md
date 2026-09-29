# Liar's Telegram Game (Liar's Deck)

A complete, production-ready, server-authoritative implementation of the canonical **Liar's Deck** game (from *Liar's Bar* PC rules), playable among 2–4 friends inside **Telegram** via a **Telegram Mini App**.

Built on a zero-cost architecture utilizing **Cloudflare Workers**, **Durable Objects (with embedded SQLite)**, **WebSockets**, and a responsive **React 18 / Vite** frontend with theatrical dark-themed UI.

---

## 🎯 Highlights & Features

- **Strict Canonical Rules**: Implements audited rules from `docs/GAME_RULES.md v3`:
  - 20-card Liar Deck (6 Kings, 6 Queens, 6 Aces, 2 Jokers) + 3-card Table Deck.
  - 2, 3, and 4 player support with exact initial card partitions.
  - Russian Roulette mechanics with persistent 6-chamber cylinders (1 lethal, 5 blanks).
  - Proper empty-hand (`EMPTY_SAFE` vs `EMPTY_PENDING_CHALLENGE`) and mandatory CALL_LIAR orchestration.
- **Server-Authoritative Multiplayer**:
  - Deterministic state transitions isolated in `@liars-telegram-game/game-core`.
  - Durable Object room coordinator in `@liars-telegram-game/room-runtime`.
  - Fail-closed actor authorization, revision idempotency, and anti-tamper protections.
  - Recipient-specific state projections (zero hidden card or revolver leakage to opponents or dead spectators).
- **Living-Player Presence & Alarms**:
  - Automatic game pause when all living players disconnect; auto-resumes with a fresh 30s timer upon reconnect.
  - Authoritative 30s turn deadline enforced by Cloudflare provider alarms.
  - Server-side random auto-play on timeout.
- **Telegram Mini App First-Class Integration**:
  - Cryptographic HMAC-SHA256 `initData` authentication against Bot Token.
  - Seamless deep-linking `/start <roomId>` and canonical `t.me/<bot>?startapp=<roomId>` invite sharing.
  - Theatrical dark theme following `DESIGN_SYSTEM.md` optimized for mobile screens.
- **Zero Operating Cost**:
  - Runs 100% within the Cloudflare Workers Free Tier.
  - Embedded SQLite inside Durable Objects (no external database or paid VPS needed).
  - 24-hour automatic retention cleanup of inactive rooms.

---

## 🏗️ Architecture & Monorepo Structure

```
LiarsTelegram/
├── packages/
│   ├── game-core/        # Pure canonical game rules engine (zero runtime dependencies)
│   ├── room-runtime/     # Authoritative room coordinator, SQLite persistence & protocols
│   ├── client/           # React 18 / Vite Telegram Mini App UI
│   └── worker/           # Cloudflare Worker, RoomDurableObject & WebSocket gateway
├── docs/
│   ├── GAME_RULES.md     # Binding source of truth for game rules
│   └── DEPLOYMENT.md     # Production deployment and operations runbook
└── .ai/                  # AI Architect OS specifications, architecture ADRs & verified task ledger
```

---

## 🧪 Quality & Test Coverage

The monorepo enforces 100% typecheck safety and exhaustive automated testing:

- **727 passing tests** across **49 test files**:
  - `game-core`: 251 tests (all rule matrices, 2/3/4-player flows, invariant property testing)
  - `room-runtime`: 415 tests (protocols, authorization, alarms, SQLite, presence, security audit)
  - `client`: 48 tests (theme, selection, layout, animations, socket transport)
  - `worker`: 13 tests (E2E release smoke, routes, webhook, WebSocket upgrades)

Run all tests:
```bash
npm run typecheck
npm test
```

---

## 🚀 Quick Start & Deployment

For full deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### 1. Local Development
```bash
# Install dependencies
npm ci

# Build client and run worker locally
npm run build --workspace=@liars-telegram-game/client
npm run dev --workspace=@liars-telegram-game/worker
```

### 2. Deploy to Cloudflare Workers
```bash
# Configure secrets
npx wrangler secret put BOT_TOKEN --cwd packages/worker

# Build and deploy
npm run build --workspace=@liars-telegram-game/client
npm run deploy --workspace=@liars-telegram-game/worker
```

### 3. Telegram Bot Setup
1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`).
2. Create a Mini App with `/newapp` pointing to your Cloudflare Worker URL (`https://...workers.dev`).
3. Set the webhook:
```bash
curl -F "url=https://<your-worker>.workers.dev/api/telegram-webhook" \
     -F "secret_token=<YOUR_SECRET>" \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

---

## 📜 License
MIT License
