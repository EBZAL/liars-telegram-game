# Task Evidence: T-042-ALARM-CONCURRENCY-RACE-HARDENING

## Task Overview
- **Task ID**: `T-042-ALARM-CONCURRENCY-RACE-HARDENING`
- **Component**: `packages/room-runtime`
- **Objective**: Implement hardening test suite for alarm and action concurrency races, stale alarms, duplicate alarms, action vs deadline races, and revision idempotency.

## Acceptance Criteria Verification

### AC-01: Stale and Premature Alarms Dropped Without Mutation
- Verified: Premature alarm (`nowMs < dueAt`) returns `NOT_DUE` with zero state or revision mutation. Action committed before deadline advances generation; stale provider alarm trigger with old generation returns `STALE_ALARM`. Paused room (`activeAlarm === null`) returns `NO_ALARM`.
- Evidence: `packages/room-runtime/tests/alarm-concurrency-hardening.test.ts` ("AC-01: Stale and premature alarm triggers are safely dropped without state mutation").

### AC-02: Duplicate Alarm Deliveries are Idempotent
- Verified: First alarm delivery commits `TURN_DEADLINE` timeout auto-play, advancing room revision N to N+1 and setting the next turn's deadline. Duplicate/retry alarm delivery at the same timestamp detects the new deadline in the future and returns `NOT_DUE` without second auto-play or revision advance.
- Evidence: `packages/room-runtime/tests/alarm-concurrency-hardening.test.ts` ("AC-02: Duplicate alarm deliveries are idempotent and do not advance state twice").

### AC-03: Action vs Deadline Expiration Clean Arbitration
- Verified: Client action arriving at or past deadline (`nowMs >= deadline`) is rejected as `DEADLINE_DUE`. Timeout alarm commits cleanly. Subsequent retried client action is rejected as `STALE_REVISION`.
- Evidence: `packages/room-runtime/tests/alarm-concurrency-hardening.test.ts` ("AC-03: Client action arriving concurrently with deadline expiration is cleanly arbitrated").

### AC-04: Revision Idempotency Under Concurrency and Duplication
- Verified: Valid action commits and bumps revision N to N+1. Identical duplicate returns success without state mutation. Action with duplicate ID but conflicting payload returns `ACTION_ID_CONFLICT`. Out-of-order action with stale `expectedRevision` returns `STALE_REVISION`.
- Evidence: `packages/room-runtime/tests/alarm-concurrency-hardening.test.ts` ("AC-04: Concurrent/duplicate and out-of-order action envelopes maintain revision idempotency").

### AC-05: Zero Regressions Across Full Workspace
- Verified: Full regression test suite passes cleanly across all workspaces: 251 tests in `game-core`, 406 tests in `room-runtime`, and 36 tests in `client` (693 tests total across 44 test files). Typecheck passes cleanly without error.

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
 Test Files  22 passed (22)
      Tests  406 passed (406)

 RUN  v1.6.1 D:/LiarsTelegram/packages/client
 Test Files  6 passed (6)
      Tests  36 passed (36)
```
Total: 693 passing tests across 44 test files.
