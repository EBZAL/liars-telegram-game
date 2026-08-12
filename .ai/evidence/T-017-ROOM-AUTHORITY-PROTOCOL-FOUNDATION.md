# Evidence: T-017-ROOM-AUTHORITY-PROTOCOL-FOUNDATION

**Task ID:** T-017-ROOM-AUTHORITY-PROTOCOL-FOUNDATION  
**Task Title:** Room Authority & Protocol Foundation  
**Stage:** STAGE-04 — Authoritative Multiplayer  
**Implementation Commit:** `ceb93cf1153721a26e340ebcbba65946c33972dc`  
**Status:** IMPLEMENTED  

---

## 1. Summary of Changes

A new provider-independent workspace `@liars-telegram-game/room-runtime` (`packages/room-runtime`) was established to provide authoritative Room state structures, lifecycle primitives, alarm models, and strict untrusted gameplay envelope validation before Cloudflare Durable Object, WebSocket, persistence, or projection features are added.

### Key Deliverables

1. **Room State & Lifecycle Primitives (`packages/room-runtime/src/room-state.ts`)**:
   - `RoomLifecycle`: exactly `'LOBBY' | 'MATCH_ACTIVE' | 'MATCH_PAUSED_NO_LIVING_CONNECTIONS' | 'MATCH_FINISHED' | 'ABANDONED'` (AC-06).
   - `RoomAlarmKind`: exactly `'TURN_DEADLINE' | 'HOST_GRACE' | 'ROOM_RETENTION'` (AC-07).
   - `ActiveRoomAlarm`: `{ kind, dueAt, generation }` (AC-08).
   - `RoomMember`: `{ playerId, joinOrder }` minimal stable identity/order data.
   - `RoomAuthorityState<TMatchSnapshot>`: generic provider-independent room state container holding `roomId`, `lifecycle`, `revision`, `members`, `hostPlayerId`, `match`, `currentTurnId`, `currentTurnDeadline`, `activeAlarm` (AC-09, AC-10).
   - `createInitialRoomState(roomId)`: pure constructor returning fresh LOBBY state with `revision=0`, empty `members`, and all optional/derived state as `null` (AC-11..20).
   - `FORBIDDEN_LOCAL_SELECTION_KEYS`: compile-time and runtime proof excluding all 8 forbidden local-selection keys (`selectedCards`, `selectedCardIds`, `selectedButUnconfirmedCards`, `highlightedCards`, `highlightedCardIds`, `draftSelection`, `pendingSelection`, `localSelection`) from authoritative Room state (AC-42, AC-43).

2. **Strict Untrusted Protocol Parser (`packages/room-runtime/src/gameplay-protocol.ts`)**:
   - `parseGameplayActionEnvelope(input)`: pure runtime validator/parser for untrusted client action envelopes.
   - Top-level keys strictly locked to `['actionId', 'expectedRevision', 'turnId', 'actionType', 'payload']` (AC-21, AC-34).
   - `actionId`: non-empty string (AC-22).
   - `expectedRevision`: safe integer >= 0 (AC-23).
   - `turnId`: non-empty string (AC-24).
   - `actionType`: accepts `'PLAY_CARDS'` and `'CALL_LIAR'`; rejects `'SYSTEM_TIMEOUT'` and unknown strings (AC-25..28).
   - `PLAY_CARDS` payload: requires exactly `cardIds` (length 1..3, non-empty strings, unique) (AC-29..32). Returns a detached array copy (AC-40).
   - `CALL_LIAR` payload: requires exact empty object `{}` (AC-33).
   - Rejects client authority fields (`actorId`, `playerId`, `claimedRank`, `claimRank`, `claimedCount`, `claimCount`, `shooterId`, `roundLoserId`, `winnerId`, `truthful`, `targetPlayId`, `accusedPlayerId`) (AC-35..38).
   - Rejects non-objects, null, arrays, numbers, booleans, symbols, functions, and malformed inputs (AC-39).
   - Does not mutate untrusted input (AC-41).

3. **Workspace & Tooling Integration**:
   - `packages/room-runtime/package.json` and `tsconfig.json` created (AC-01, AC-02).
   - Root `package.json` scripts updated to execute typecheck and test across both `@liars-telegram-game/game-core` and `@liars-telegram-game/room-runtime` (AC-04).
   - Zero new external runtime or testing dependencies added (AC-03, AC-55).
   - Existing `game-core` source and tests remain 100% unchanged (AC-05).

---

## 2. Acceptance Criteria Mapping

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| AC-01 | New `@liars-telegram-game/room-runtime` workspace exists | PASS | `packages/room-runtime/package.json` created |
| AC-02 | Provider-independent TypeScript with no Cloudflare imports | PASS | Source contains zero `@cloudflare` or `workerd` imports |
| AC-03 | No new external runtime/testing library introduced | PASS | devDependencies match root/game-core (`typescript`, `vitest`, `@types/node`) |
| AC-04 | Root typecheck/test cover both workspaces | PASS | Root `npm run typecheck` and `npm test` execute both workspaces |
| AC-05 | Existing `game-core` source and tests remain unchanged | PASS | `git diff` shows 0 changes to `packages/game-core` |
| AC-06 | `RoomLifecycle` exact value set | PASS | Verified in `room-state.ts` & `room-state.test.ts` |
| AC-07 | `RoomAlarmKind` exact value set | PASS | Verified in `room-state.ts` & `room-state.test.ts` |
| AC-08 | `ActiveRoomAlarm` fields | PASS | `{ kind, dueAt, generation }` verified |
| AC-09 | Minimal Room authority state fields | PASS | All 9 required fields present |
| AC-10 | Generic match snapshot field | PASS | `match: TMatchSnapshot \| null` |
| AC-11 | Constructor rejects empty/whitespace-only Room ID | PASS | Throws `Error` for `""`, `"   "`, `null`, `undefined` |
| AC-12 | Initial `lifecycle` = `'LOBBY'` | PASS | Verified in constructor & tests |
| AC-13 | Initial `revision` = `0` | PASS | Verified in constructor & tests |
| AC-14 | Initial `members` = `[]` | PASS | Verified in constructor & tests |
| AC-15 | Initial `hostPlayerId` = `null` | PASS | Verified in constructor & tests |
| AC-16 | Initial `match` = `null` | PASS | Verified in constructor & tests |
| AC-17 | Initial `currentTurnId` = `null` | PASS | Verified in constructor & tests |
| AC-18 | Initial `currentTurnDeadline` = `null` | PASS | Verified in constructor & tests |
| AC-19 | Initial `activeAlarm` = `null` | PASS | Verified in constructor & tests |
| AC-20 | Fresh unshared objects per initial state call | PASS | Verified in `room-state.test.ts` |
| AC-21 | Gameplay envelope top-level keys exact | PASS | Locked to `actionId, expectedRevision, turnId, actionType, payload` |
| AC-22 | `actionId` must be non-empty string | PASS | Verified in parser & tests |
| AC-23 | `expectedRevision` safe integer >= 0 | PASS | Verified in parser & tests |
| AC-24 | `turnId` must be non-empty string | PASS | Verified in parser & tests |
| AC-25 | Client `actionType` accepts `PLAY_CARDS` | PASS | Verified in parser & tests |
| AC-26 | Client `actionType` accepts `CALL_LIAR` | PASS | Verified in parser & tests |
| AC-27 | Client `actionType` rejects `SYSTEM_TIMEOUT` | PASS | Verified in parser & tests |
| AC-28 | Client `actionType` rejects unknown types | PASS | Verified in parser & tests |
| AC-29 | `PLAY_CARDS` payload contains only `cardIds` | PASS | Verified in parser & tests |
| AC-30 | `PLAY_CARDS` `cardIds` length 1..3 | PASS | Rejects 0 and >3 cards |
| AC-31 | `cardIds` must be non-empty strings | PASS | Rejects empty strings and non-strings |
| AC-32 | `cardIds` must be unique | PASS | Rejects duplicate IDs in single payload |
| AC-33 | `CALL_LIAR` payload exact empty object | PASS | Rejects non-empty payload |
| AC-34 | Extra top-level envelope fields rejected | PASS | Verified in `gameplay-protocol.test.ts` |
| AC-35 | Client `actorId`/`playerId` rejected | PASS | Verified in `gameplay-protocol.test.ts` |
| AC-36 | Client `claimedRank`/`claimRank` rejected | PASS | Verified in `gameplay-protocol.test.ts` |
| AC-37 | Client `claimedCount`/`claimCount` rejected | PASS | Verified in `gameplay-protocol.test.ts` |
| AC-38 | Client challenge target/shooter/truth/winner outcome rejected | PASS | Verified in `gameplay-protocol.test.ts` |
| AC-39 | Parser rejects null / arrays / primitives / malformed shapes | PASS | Verified in `gameplay-protocol.test.ts` |
| AC-40 | Successful PLAY parse returns detached `cardIds` array | PASS | Verified array reference detachment |
| AC-41 | Parser does not mutate untrusted input | PASS | Input object remains unmodified |
| AC-42 | Exhaustive exclusion of 8 forbidden local-selection keys | PASS | Tested against `FORBIDDEN_LOCAL_SELECTION_KEYS` |
| AC-43 | No pre-confirm selection state added | PASS | Authoritative state contains zero draft/selection fields |
| AC-44 | No revision-increment implemented yet | PASS | Scope boundary preserved |
| AC-45 | No action-dedupe implemented yet | PASS | Scope boundary preserved |
| AC-46 | No presence/Pause/Resume implemented yet | PASS | Scope boundary preserved |
| AC-47 | No provider alarm scheduling implemented yet | PASS | Scope boundary preserved |
| AC-48 | No WebSocket/Durable Object/SQLite implemented yet | PASS | Scope boundary preserved |
| AC-49 | No Telegram authentication implemented yet | PASS | Scope boundary preserved |
| AC-50 | No recipient-specific projection/T27 claimed | PASS | Scope boundary preserved |
| AC-51 | No secret/logging exposure introduced | PASS | Parser does not log untrusted payloads |
| AC-52 | `npm ci` passes | PASS | Exit code 0 |
| AC-53 | `npm run typecheck` passes | PASS | All configured workspaces pass |
| AC-54 | `npm test` passes | PASS | 274 total tests pass across 18 test files |
| AC-55 | `package-lock.json` changes safe | PASS | Zero external dependency version changes |
| AC-56 | Evidence clearly documents scope boundaries | PASS | Section 4 details deferred behaviors |
| AC-57 | Lifecycle ends `IMPLEMENTED` only | PASS | Final status `IMPLEMENTED` |

---

## 3. Verification Results

### `npm ci`
- Exit Code: 0
- Tracked File Impact: Clean

### `npm run typecheck`
- `@liars-telegram-game/game-core`: `tsc --noEmit` PASS
- `@liars-telegram-game/room-runtime`: `tsc --noEmit` PASS
- Exit Code: 0

### `npm test`
- Total Test Files: 18 passed (18)
- Total Tests: 274 passed (274)
  - `game-core`: 16 test files / 251 tests PASS
  - `room-runtime`: 2 test files / 23 tests PASS
- Exit Code: 0

### Package & Dependency Audit
- External dependency version changes: 0
- `packages/game-core` source changes: 0
- `packages/game-core` test changes: 0
- Forbidden nondeterminism: 0

---

## 4. Explicitly Deferred Stage-04 Scope

This task established the protocol and state foundation only. The following behaviors were NOT implemented and remain deferred to subsequent Stage-04 tasks:

- Cloudflare Durable Objects / Worker bindings
- WebSocket realtime transport
- SQLite persistence
- Revision mutation / auto-increment
- Action deduplication
- Concurrent action serialization
- TURN_DEADLINE / alarm scheduling & dispatch
- Room presence accounting / disconnect monitoring
- Pause / Resume state machine transitions
- Telegram identity / authentication
- Recipient-specific state projections
- T27 dead-spectator hidden-hand isolation
- Game Core command dispatch
