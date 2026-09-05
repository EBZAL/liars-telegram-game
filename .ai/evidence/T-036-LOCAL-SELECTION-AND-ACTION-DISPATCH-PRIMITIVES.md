# Task Evidence: T-036-LOCAL-SELECTION-AND-ACTION-DISPATCH-PRIMITIVES

## Task Overview
- **Task ID**: `T-036-LOCAL-SELECTION-AND-ACTION-DISPATCH-PRIMITIVES`
- **Component**: `packages/client`
- **Objective**: Implement local-only pre-confirm card selection state (`useCardSelection`) per ADR-008/ADR-015, client action envelope builders (`buildPlayCardsEnvelope`, `buildCallLiarEnvelope`), and turn legality evaluation helpers (`canPlayCards`, `canCallLiar`, `isMandatoryCall`, `isOwnTurn`).

## Acceptance Criteria Verification

### AC-01: useCardSelection Hook
- Verified: `packages/client/src/selection-and-actions.ts` provides `useCardSelection(turnId)` maintaining strictly local selection state (up to 3 cards max, toggle on/off, clear, and automatic reset on turn boundary).
- Evidence: `tests/selection-and-actions.test.ts` ("toggles cards and limits selection to 3 cards max" & "automatically resets selection when turnId changes").

### AC-02: Turn Legality & Client Affordances
- Verified: `isOwnTurn`, `isMandatoryCall`, `canPlayCards`, and `canCallLiar` accurately derive client action legality from `RecipientRoomProjection`.
- Evidence: First turn cannot challenge (GAME_RULES T05); mandatory call enforces CALL_LIAR when 1 living player holds cards (GAME_RULES T10/T14); PLAY_CARDS requires 1–3 selected cards and living status with cards.
- Evidence: `tests/selection-and-actions.test.ts` ("evaluates isOwnTurn correctly", "evaluates canPlayCards legality", "evaluates canCallLiar legality", "identifies mandatory call condition and blocks playCards").

### AC-03: Action Envelope Construction
- Verified: `buildPlayCardsEnvelope` and `buildCallLiarEnvelope` construct schema-compliant `GameplayActionEnvelope` with matching `expectedRevision` and `turnId`.
- Evidence: `tests/selection-and-actions.test.ts` ("builds a valid PLAY_CARDS envelope", "builds a valid CALL_LIAR envelope", "generates unique action IDs", "throws when currentTurnId is null").

### AC-04: Unit Tests
- Verified: 10 unit tests in `packages/client/tests/selection-and-actions.test.ts` pass cleanly.

### AC-05: Zero Regressions Across Workspaces
- Verified: Full regression suite across `@liars-telegram-game/game-core`, `@liars-telegram-game/room-runtime`, and `@liars-telegram-game/client` passes.

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

 Test Files  3 passed (3)
      Tests  15 passed (15)
```
Total: 659 passing tests across 38 test files.
