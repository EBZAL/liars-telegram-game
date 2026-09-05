# Task Evidence: T-037-GAMEPLAY-TABLE-AND-PLAYER-LAYOUTS

## Task Overview
- **Task ID**: `T-037-GAMEPLAY-TABLE-AND-PLAYER-LAYOUTS`
- **Component**: `packages/client`
- **Objective**: Implement mobile-first card-room table components, responsive 2/3/4-player seating, table rank display, 30s turn countdown bar, central claim presentation, player hand with local selection, and action controls.

## Acceptance Criteria Verification

### AC-01: TableView Required Gameplay Hierarchy
- Verified: `TableView` combines `TableRankBanner`, `TurnTimerBar`, `CentralClaimBanner`, `OpponentSeat`, `PlayerHand`, and `ActionControls` into an integrated card-room interface per `DESIGN_SYSTEM.md`.
- Evidence: `tests/table-view.test.tsx` ("renders 2-player layout with 1 opponent at top").

### AC-02: Responsive 2, 3, and 4 Player Arrangements
- Verified: Seating positions opponents dynamically relative to `ownPlayerId`:
  - 2 players (1 opponent): top
  - 3 players (2 opponents): left, right
  - 4 players (3 opponents): left, top, right
- Evidence: `tests/table-view.test.tsx` ("renders 2-player layout with 1 opponent at top", "renders 3-player layout with opponents at left and right", "renders 4-player layout with opponents at left, top, and right").

### AC-03: Interactive Hand & Action Controls
- Verified: `PlayerHand` integrates `useCardSelection`, visual card elevation, and checkmarks. `ActionControls` enables "PLAY (N)" when 1–3 cards are selected and "CALL LIAR" when a challenge is legal.
- Evidence: `tests/table-view.test.tsx` ("handles card selection and triggers onPlayCards dispatch" and "handles challenge button dispatch and mandatory challenge display").

### AC-04: Automated Component Tests
- Verified: 5 component test cases in `packages/client/tests/table-view.test.tsx` pass cleanly.

### AC-05: Zero Regressions Across Workspaces
- Verified: Full test suite passes across all 3 workspaces (`@liars-telegram-game/game-core`, `@liars-telegram-game/room-runtime`, `@liars-telegram-game/client`).

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
 ✓ tests/table-view.test.tsx  (5 tests)

 Test Files  4 passed (4)
      Tests  20 passed (20)
```
Total: 664 passing tests across 39 test files.
