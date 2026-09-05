# Evidence: T-031 Lobby Membership and Host Lifecycle

## Task Metadata
- **Task ID**: `T-031-LOBBY-MEMBERSHIP-HOST-LIFECYCLE`
- **Stage**: `STAGE-05` (Telegram Integration)
- **Workflow Profile**: `STANDARD`
- **Risk Level**: `MEDIUM`
- **Task Start Commit**: `abb98f1`
- **Implementation Commit**: `ff863a7`
- **Authoritative Implementation Commit for Verification**: `ff863a7`

---

## 1. Architectural Intent

This module establishes pure, server-authoritative Lobby membership and Host lifecycle transitions in `packages/room-runtime` (`src/lobby-lifecycle.ts`).

### Architectural Rules & Invariants
- **Room Participation**: Join only in `LOBBY`. Maximum 4 players. Idempotent join for existing members.
- **Host Role**: First joiner is host. Host controls Start Match only and has no other special gameplay authority.
- **Host Leaving**: If host leaves explicitly, host immediately migrates to earliest joined remaining player (minimum `joinOrder`). If last player leaves, host becomes null.
- **Lobby Host Disconnect Grace (60s)**:
  - When host disconnects in `LOBBY`, single active alarm with `kind: 'HOST_GRACE'` is armed for 60 seconds (`dueAt = authoritativeNowMs + 60000`, `generation = roomState.revision`).
  - If host reconnects before grace expires, `HOST_GRACE` alarm is cancelled (`activeAlarm = null`).
- **Host Grace Expiration**:
  - `applyHostGraceTimeout` migrates host to earliest joined *connected* member per presence registry.
  - If zero members are connected, `hostPlayerId` becomes `null` until an eligible member reconnects.
  - Clears `activeAlarm` and increments revision by 1.
- **Start Match from Lobby**:
  - Requires `LOBBY` lifecycle and caller === `hostPlayerId`.
  - Requires 2 to 4 members.
  - Invokes `initializeMatch` from `@liars-telegram-game/game-core`.
  - Transitions lifecycle to `MATCH_ACTIVE`.
  - Arms initial 30s `TURN_DEADLINE` alarm via `armActiveTurnDeadline`.
  - Increments revision by 1.

---

## 2. Acceptance Criteria Mapping

| ID | Criterion | Evidence / Test | Status |
|---|---|---|---|
| AC-01 | Pure `joinLobbyRoom` exported from room-runtime | `src/lobby-lifecycle.ts`, `src/index.ts` | PASS |
| AC-02 | `joinLobbyRoom` rejects join when lifecycle is not LOBBY with NOT_IN_LOBBY | `lobby-lifecycle.test.ts` ("rejects joining if lifecycle is not LOBBY") | PASS |
| AC-03 | `joinLobbyRoom` rejects empty or invalid playerId with INVALID_PLAYER_ID | `lobby-lifecycle.test.ts` ("rejects empty or whitespace-only playerId") | PASS |
| AC-04 | `joinLobbyRoom` enforces maximum 4 members and rejects 5th player | `lobby-lifecycle.test.ts` ("enforces maximum 4 members capacity and rejects 5th player") | PASS |
| AC-05 | `joinLobbyRoom` is idempotent for existing member (no duplicate, no revision bump) | `lobby-lifecycle.test.ts` ("is idempotent for already joined player") | PASS |
| AC-06 | `joinLobbyRoom` assigns earliest joiner as hostPlayerId when host is null | `lobby-lifecycle.test.ts` ("successfully joins first player as host with joinOrder 1") | PASS |
| AC-07 | `joinLobbyRoom` assigns monotonic joinOrder | `lobby-lifecycle.test.ts` ("subsequent joins preserve original host and increment joinOrder") | PASS |
| AC-08 | `joinLobbyRoom` increments revision by 1 on new member join | `lobby-lifecycle.test.ts` ("subsequent joins preserve original host and increment joinOrder") | PASS |
| AC-09 | Pure `leaveLobbyRoom` exported from room-runtime | `src/lobby-lifecycle.ts`, `src/index.ts` | PASS |
| AC-10 | `leaveLobbyRoom` rejects leave when lifecycle is not LOBBY | `lobby-lifecycle.test.ts` ("rejects leave when lifecycle is not LOBBY") | PASS |
| AC-11 | `leaveLobbyRoom` rejects non-member playerId | `lobby-lifecycle.test.ts` ("rejects leave when player is not a member") | PASS |
| AC-12 | `leaveLobbyRoom` removes player from members array and increments revision by 1 | `lobby-lifecycle.test.ts` ("removes non-host player, preserves host, and increments revision") | PASS |
| AC-13 | `leaveLobbyRoom` on host departure migrates hostPlayerId to earliest joined remaining member (min joinOrder) | `lobby-lifecycle.test.ts` ("migrates host to earliest joined remaining player when host departs") | PASS |
| AC-14 | `leaveLobbyRoom` on last member departure sets hostPlayerId to null | `lobby-lifecycle.test.ts` ("sets hostPlayerId to null when last remaining member leaves") | PASS |
| AC-15 | `leaveLobbyRoom` clears any active HOST_GRACE alarm if departing player was host | `lobby-lifecycle.test.ts` ("clears active HOST_GRACE alarm if departing player was host") | PASS |
| AC-16 | Pure `handleLobbyHostPresenceChange` exported from room-runtime | `src/lobby-lifecycle.ts`, `src/index.ts` | PASS |
| AC-17 | When host disconnects in LOBBY, arms single activeAlarm with kind HOST_GRACE for 60s | `lobby-lifecycle.test.ts` ("arms single activeAlarm with kind HOST_GRACE for 60s when host disconnects in LOBBY") | PASS |
| AC-18 | When host reconnects in LOBBY before grace expires, clears HOST_GRACE alarm | `lobby-lifecycle.test.ts` ("cancels HOST_GRACE alarm when host reconnects before grace expires") | PASS |
| AC-19 | Non-host disconnect/reconnect in LOBBY does not arm or clear HOST_GRACE | `lobby-lifecycle.test.ts` ("does not arm or clear HOST_GRACE when non-host member connects/disconnects") | PASS |
| AC-20 | Pure `applyHostGraceTimeout` exported from room-runtime | `src/lobby-lifecycle.ts`, `src/index.ts` | PASS |
| AC-21 | `applyHostGraceTimeout` rejects stale or mismatched alarm generation/kind and not-yet-due | `lobby-lifecycle.test.ts` ("rejects stale generation or wrong alarm kind", "rejects if alarm is not yet due") | PASS |
| AC-22 | `applyHostGraceTimeout` migrates host to earliest joined connected member per presence registry | `lobby-lifecycle.test.ts` ("migrates host to earliest joined connected member, clears alarm, and increments revision") | PASS |
| AC-23 | `applyHostGraceTimeout` sets hostPlayerId to null if no members are connected | `lobby-lifecycle.test.ts` ("sets hostPlayerId to null if no members are currently connected") | PASS |
| AC-24 | `applyHostGraceTimeout` clears activeAlarm and increments revision by 1 upon migration | `lobby-lifecycle.test.ts` ("migrates host to earliest joined connected member, clears alarm, and increments revision") | PASS |
| AC-25 | Pure `startMatchFromLobby` exported from room-runtime | `src/lobby-lifecycle.ts`, `src/index.ts` | PASS |
| AC-26 | `startMatchFromLobby` requires caller to be current hostPlayerId | `lobby-lifecycle.test.ts` ("rejects starting match if caller is not host") | PASS |
| AC-27 | `startMatchFromLobby` requires lifecycle LOBBY | `lobby-lifecycle.test.ts` ("rejects starting match if lifecycle is not LOBBY") | PASS |
| AC-28 | `startMatchFromLobby` requires 2 to 4 members | `lobby-lifecycle.test.ts` ("rejects starting match if player count is not 2..4") | PASS |
| AC-29 | `startMatchFromLobby` calls initializeMatch, transitions to MATCH_ACTIVE, sets currentTurnId, arms TURN_DEADLINE for 30s, and increments revision | `lobby-lifecycle.test.ts` ("successfully starts match with 2 players", "successfully starts match with 4 players") | PASS |
| AC-30 | All functions are pure, non-mutating, prototype-safe, and pass full typecheck and test suite | `npm run typecheck`, `npm test` (610 tests pass) | PASS |

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
 ✓ tests/telegram-auth.test.ts  (18 tests)
 ✓ tests/gameplay-protocol.test.ts  (16 tests)
 ✓ tests/recipient-projection.test.ts  (30 tests)
 ✓ tests/presence.test.ts  (20 tests)
 ✓ tests/system-timeout-presence-lifecycle.test.ts  (10 tests)
 ✓ tests/gameplay-authorization.test.ts  (20 tests)
 ✓ tests/gameplay-transaction.test.ts  (16 tests)
 ✓ tests/presence-lifecycle.test.ts  (20 tests)
 ✓ tests/turn-deadline.test.ts  (22 tests)
 ✓ tests/timed-gameplay-transaction.test.ts  (17 tests)
 ✓ tests/gameplay-admission.test.ts  (37 tests)
 ✓ tests/timed-gameplay-presence-lifecycle.test.ts  (15 tests)
 ✓ tests/lobby-lifecycle.test.ts  (25 tests)
 ✓ tests/system-timeout-transaction.test.ts  (19 tests)
 ✓ tests/provider-alarm-sync.test.ts  (67 tests)

Test Files  16 passed (16)
     Tests  359 passed (359)
```
Total: 32 test files, 610 tests passed, 0 failures (100% pass rate).
