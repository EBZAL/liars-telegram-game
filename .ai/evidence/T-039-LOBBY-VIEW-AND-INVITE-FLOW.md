# Task Evidence: T-039-LOBBY-VIEW-AND-INVITE-FLOW

## Task Overview
- **Task ID**: `T-039-LOBBY-VIEW-AND-INVITE-FLOW`
- **Component**: `packages/client`
- **Objective**: Implement Lobby screen with member list, host crown badge, invite link sharing, host start-match button, and App-level lifecycle routing between LobbyView and TableView.

## Acceptance Criteria Verification

### AC-01: LobbyView Member Slots & Host Crown Badge
- Verified: `LobbyView` displays the room ID, member slots for 2–4 players (filled slots with display name, username, ready status, and host crown badge 👑; empty slots with placeholder styling and waiting indicator).
- Evidence: `packages/client/tests/lobby-view.test.tsx` ("renders room ID and member slots with host crown").

### AC-02: Copy / Share Invite Link Button
- Verified: An invite button renders with "Share Invite Link" / "Copy Invite Link". When clicked, it generates a canonical Telegram Mini App invite link (`https://t.me/TestBot/app?startapp=r_room_1`) via `formatTelegramInviteLink` and copies it to the clipboard or triggers the Telegram share URL.
- Evidence: `packages/client/tests/lobby-view.test.tsx` ("formats and copies invite link to clipboard").

### AC-03: Host START MATCH Button (>= 2 Players Required)
- Verified: The "START MATCH" button is visible to the host. It is disabled when fewer than 2 players are present (with notice "Waiting for at least 2 players to start..."), and becomes enabled when 2 or more players have joined.
- Evidence: `packages/client/tests/lobby-view.test.tsx` ("disables start match button when fewer than 2 players" & "enables start match button when 2 or more players joined").

### AC-04: Non-Host Waiting View
- Verified: Non-host members do not see the "START MATCH" button; instead, they see an informative waiting indicator: "Waiting for host (@alice) to start the match...".
- Evidence: `packages/client/tests/lobby-view.test.tsx` ("renders waiting message for non-host members").

### AC-05: App.tsx Lifecycle Routing
- Verified: `App.tsx` routes to `LobbyView` when `publicState.lifecycle === 'LOBBY'`, routes to `TableView` when `publicState.lifecycle === 'MATCH_ACTIVE'` or `'MATCH_PAUSED'`, and displays the `MatchWinnerOverlay` when `lifecycle === 'MATCH_FINISHED'`.
- Evidence: `packages/client/tests/lobby-view.test.tsx` ("routes to LobbyView when lifecycle is LOBBY", "routes to TableView when lifecycle is MATCH_ACTIVE", "renders MatchWinnerOverlay when lifecycle is MATCH_FINISHED").

### AC-06: Automated Component Tests
- Verified: 8 comprehensive component test cases in `packages/client/tests/lobby-view.test.tsx` pass cleanly.

### AC-07: Full Test Regression & Zero Errors Across Workspaces
- Verified: All 41 test files across `@liars-telegram-game/game-core` (251 tests), `@liars-telegram-game/room-runtime` (393 tests), and `@liars-telegram-game/client` (36 tests) pass cleanly (680 tests total). Typecheck passes across all three packages without error.

## Automated Test & Typecheck Evidence

### Typecheck Output
```
> typecheck
> npm run typecheck --workspace=@liars-telegram-game/game-core && npm run typecheck --workspace=@liars-telegram-game/room-runtime && npm run typecheck --workspace=@liars-telegram-game/client

> @liars-telegram-game/game-core@0.1.0 typecheck
> tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/game-core && tsc --noEmit

> @liars-telegram-game/game-core@0.1.0 build
> tsc

> @liars-telegram-game/client@0.1.0 typecheck
> npm run build --workspace=@liars-telegram-game/room-runtime && tsc --noEmit

> @liars-telegram-game/room-runtime@0.1.0 build
> npm run build --workspace=@liars-telegram-game/game-core && tsc

> @liars-telegram-game/game-core@0.1.0 build
> tsc
```

### Vitest Test Suite Output
```
 RUN  v1.6.1 D:/LiarsTelegram/packages/game-core
 Test Files  16 passed (16)
      Tests  251 passed (251)

 RUN  v1.6.1 D:/LiarsTelegram/packages/room-runtime
 Test Files  19 passed (19)
      Tests  393 passed (393)

 RUN  v1.6.1 D:/LiarsTelegram/packages/client
 ✓ tests/telegram.test.ts  (2 tests)
 ✓ tests/selection-and-actions.test.ts  (10 tests)
 ✓ tests/room-context.test.tsx  (3 tests)
 ✓ tests/roulette-and-reveals.test.tsx  (8 tests)
 ✓ tests/table-view.test.tsx  (5 tests)
 ✓ tests/lobby-view.test.tsx  (8 tests)

 Test Files  6 passed (6)
      Tests  36 passed (36)
```
Total: 680 passing tests across 41 test files.
