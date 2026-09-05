# Liar's Deck — Production Deployment Runbook

This runbook describes the end-to-end procedure for deploying Liar's Deck to **Cloudflare Workers** on the **Free Tier** with **Telegram Mini App** integration.

---

## 1. Architecture Summary (Zero-Cost MVP)

- **Compute & Routing**: Cloudflare Worker handling HTTP routing, Telegram auth validation, and static asset serving.
- **State & Realtime Coordination**: Single SQLite-backed Durable Object (`RoomDurableObject`) per game room coordinating authoritative game state, presence, alarms, and WebSockets.
- **Frontend Presentation**: React 18 / Vite Telegram Mini App bundled into static assets served directly from Cloudflare edge.
- **Database**: In-memory + SQLite persistence embedded directly within each Room Durable Object. No separate D1 database or external database required.
- **Cost**: **$0.00 / month** on Cloudflare Workers Free Tier. No VPS, no external databases, and no custom domain required (`*.workers.dev` provided).

---

## 2. Prerequisites

1. **Node.js**: v20.0.0 or higher.
2. **Cloudflare Account**: Free tier account at [cloudflare.com](https://cloudflare.com).
3. **Telegram Account**: With access to `@BotFather`.
4. **Wrangler CLI**: Installed via devDependencies or run via `npx wrangler`.

---

## 3. Step-by-Step Setup Guide

### Step 3.1: Configure Telegram Bot with @BotFather

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts:
   - Enter a display name (e.g. `Liar's Deck`).
   - Choose a unique username ending in `bot` (e.g. `LiarsDeckGameBot`).
   - Save the **Bot Token** provided (format: `123456789:ABCdefGHI...`).
3. Create the Telegram Mini App:
   - Send `/newapp` to `@BotFather`.
   - Select your bot.
   - Enter a title (e.g. `Liar's Deck`).
   - Enter a short description.
   - Upload an app icon/image.
   - Set the Web App URL to your Cloudflare Worker URL:
     `https://liars-deck-worker.<your-subdomain>.workers.dev`
   - Specify a short name for the app (e.g. `play` or `game`).
4. (Optional) Set the bot menu button to open the Mini App:
   - Send `/setmenubutton` -> choose your bot -> configure URL.

---

### Step 3.2: Configure Worker Secrets & Environment

In `packages/worker/wrangler.jsonc`, verify or adjust the configuration:

```jsonc
{
  "name": "liars-deck-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-03",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      {
        "name": "ROOM_DO",
        "class_name": "RoomDurableObject"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["RoomDurableObject"]
    }
  ],
  "assets": {
    "directory": "../client/dist",
    "binding": "ASSETS"
  }
}
```

Store your sensitive bot token using Cloudflare Secrets:

```bash
# Set Telegram Bot Token secret
npx wrangler secret put BOT_TOKEN --cwd packages/worker

# (Optional) Set webhook secret token for securing /api/telegram-webhook
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --cwd packages/worker
```

Add non-sensitive variables in `wrangler.jsonc` (or via Cloudflare Dashboard):
- `BOT_USERNAME`: `LiarsDeckGameBot`
- `APP_NAME`: `play` (if using `/app` short name)
- `APP_URL`: `https://liars-deck-worker.<your-subdomain>.workers.dev`

---

### Step 3.3: Build and Deploy

Run the production build and deployment commands from the project root:

```bash
# 1. Install dependencies
npm ci

# 2. Run full monorepo typecheck and test validation
npm run typecheck
npm test

# 3. Build frontend client static assets into packages/client/dist
npm run build --workspace=@liars-telegram-game/client

# 4. Deploy Cloudflare Worker + Durable Objects + Static Assets
npm run deploy --workspace=@liars-telegram-game/worker
```

---

### Step 3.4: (Optional) Register Telegram Bot Webhook

To enable `/start` and `/start <roomId>` deep link responses directly in Telegram chat:

```bash
curl -F "url=https://liars-deck-worker.<your-subdomain>.workers.dev/api/telegram-webhook" \
     -F "secret_token=<YOUR_TELEGRAM_WEBHOOK_SECRET>" \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

---

## 4. Operational Verification & Smoke Testing

### 1. Health Check
```bash
curl https://liars-deck-worker.<your-subdomain>.workers.dev/api/health
# Expected: {"status":"ok"}
```

### 2. Room Creation
```bash
curl -X POST https://liars-deck-worker.<your-subdomain>.workers.dev/api/room
# Expected: {"roomId":"r_<8-hex-chars>"}
```

### 3. Telegram Mini App Launch
1. Open your bot in Telegram on iOS, Android, or Telegram Desktop.
2. Tap the menu button or send `/start`.
3. The Mini App opens inside Telegram. Verify:
   - Theatrical dark theme loads.
   - User profile badge displays Telegram username/name.
   - Lobby view renders with member slot for player.
   - "Copy Invite Link" generates canonical link `https://t.me/<bot>?startapp=<roomId>`.

### 4. Real Friend Multiplayer Match Test
1. Share the invite link with a friend on Telegram.
2. Friend taps the link -> Mini App launches into the exact same room lobby.
3. Host taps **START MATCH**.
4. Both players receive dealt hands (5 cards each) and table rank banner.
5. Play a turn, challenge a play, verify revolver animation and chamber outcome.
6. Verify match winner overlay upon elimination.

---

## 5. Rollback and Disaster Recovery

### Instant Version Rollback
If a regression or issue is detected in production:

```bash
# List recent deployments with version IDs
npx wrangler deployments list --cwd packages/worker

# Rollback to the previous stable version immediately
npx wrangler rollback <deployment-id> --cwd packages/worker
```

### Inactivity Retention & Cleanup
- Completed and abandoned rooms automatically arm a **24-hour retention alarm** (`ROOM_RETENTION`).
- After 24 hours of inactivity, the Durable Object wakes up and purges all SQLite records (`room_state` and `processed_actions`), preventing database bloat and maintaining zero storage footprint.

### Emergency Room Reset
If a room becomes corrupted or wedged during development or testing:
- Sockets can be disconnected, and the room will transition to `MATCH_PAUSED_NO_LIVING_CONNECTIONS`.
- Any participant can navigate back to lobby or launch a newly generated room via `/api/room`.

---

## 6. Live Observability

To inspect live Worker and Durable Object logs in real-time:

```bash
npx wrangler tail --cwd packages/worker
```
