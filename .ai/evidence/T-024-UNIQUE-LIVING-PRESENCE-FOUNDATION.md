# Evidence: T-024-UNIQUE-LIVING-PRESENCE-FOUNDATION

## Task Identity & Git Commit Chain
- **Task ID**: `T-024-UNIQUE-LIVING-PRESENCE-FOUNDATION`
- **Task-Start Commit**: `51cb24e3469c53abd45bc14f90049019b7ea5e44`
- **Authoritative Implementation Commit**: `2e75481c8b81d2ff369e0d84be6bb4ed93acbfe8`

---

## Executive Summary
Task `T-024-UNIQUE-LIVING-PRESENCE-FOUNDATION` establishes the provider-independent authenticated Room presence foundation required before Pause/Resume lifecycle transitions and provider alarm integration.

Key properties established:
1. **Separation of Presence from Room State**: `RoomAuthorityState` remains unmutated and does not hold connection maps or socket IDs. Presence is modeled in an independent immutable `RoomPresenceRegistry`.
2. **Server-Authenticated Connection Identity**: `ServerAuthenticatedRoomConnection` encapsulates `connectionId: string` and `playerId: string`. Connection identifiers are server-owned and validated.
3. **Room Membership Gate**: Connection registration validates that `playerId` is an existing member of `roomState.members`. Non-members fail closed.
4. **Multi-Socket Deduplication**: A single Player may register multiple unique `connectionId`s. That Player counts exactly once toward connected members and connected Living players.
5. **Connection Identity Conflict Protection**: A `connectionId` cannot be stolen or rebound to a second Player; collisions fail closed with deterministic errors.
6. **Graceful Disconnection**: Unregistering one of multiple connections preserves the Player's presence; unregistering the final connection disconnects the Player. Unregistering a non-existent connection is an idempotent no-op; attempting to unregister another Player's connection fails closed.
7. **Eliminated Spectator Exclusion**: Eliminated players who retain open connections are tracked in `connectedMemberPlayerIds` as spectators, but are strictly excluded from `connectedLivingPlayerIds` and do not contribute to `connectedLivingPlayers`.
8. **Authoritative Living Lifecycle**: `lifeStatus === 'ALIVE'` is the sole authority for living presence. Round statuses (`WITH_CARDS`, `EMPTY_PENDING_CHALLENGE`, `EMPTY_SAFE`) and hand sizes do not bypass or replace `lifeStatus`.
9. **Zero Revision / Gameplay Mutation from Raw Presence**: Raw connect, disconnect, duplicate connect, and duplicate disconnect events cause zero Room revision increments, zero lifecycle mutations, zero deadline/alarm changes, and zero Core transitions.

---

## Architectural & Security Distinctions
- **Authenticated connection identity != authentication implementation**: T-024 operates on identity that is already server-resolved and authenticated. No client claim or token validation is performed here.
- **Presence accounting != Pause/Resume transition**: T-024 provides the factual evaluator (`evaluateRoomPresence`). Actual `MATCH_ACTIVE <-> MATCH_PAUSED_NO_LIVING_CONNECTIONS` lifecycle transitions and revision increments are deferred to subsequent tasks.
- **Raw presence event != Room revision transition**: Connection fluctuations are runtime noise and do not advance durable Room revisions.
- **connectedLivingPlayers != public recipient field**: Presence summaries are internal server authority structures and are not exposed directly to client/spectator projections.
- **Presence registry != WebSocket/provider implementation**: No Cloudflare hibernation, WebSocket, Durable Object, or SQLite code is introduced.

---

## Acceptance Criteria Mapping (AC-01 through AC-119)

| AC | Description | Status | Verification / Proof |
|---|---|---|---|
| AC-01 | Dedicated provider-independent presence module exists | PASS | Implemented in `packages/room-runtime/src/presence.ts` |
| AC-02 | Presence API exported from room-runtime | PASS | Exported in `packages/room-runtime/src/index.ts` |
| AC-03 | Server-authenticated connection type exists | PASS | `ServerAuthenticatedRoomConnection` defined and exported |
| AC-04 | Presence registry is separate from RoomAuthorityState | PASS | `RoomPresenceRegistry` is standalone and not a field on `RoomAuthorityState` |
| AC-05 | RoomAuthorityState shape unchanged | PASS | `packages/room-runtime/src/room-state.ts` untouched |
| AC-06 | GameplayActionEnvelope unchanged | PASS | `packages/room-runtime/src/gameplay-protocol.ts` untouched |
| AC-07 | connectionId non-empty validation | PASS | Verified in `validates non-empty connectionId and playerId` |
| AC-08 | playerId non-empty validation | PASS | Verified in `validates non-empty connectionId and playerId` |
| AC-09 | Registration requires Room membership | PASS | Enforced in `registerAuthenticatedRoomConnection` |
| AC-10 | Non-member registration fails closed | PASS | Verified in `fails closed when registering a non-member` |
| AC-11 | Exact duplicate registration is idempotent | PASS | Verified in `MANDATORY TEST K` |
| AC-12 | Duplicate registration does not create second connection | PASS | Verified in `MANDATORY TEST K` |
| AC-13 | One connectionId cannot belong to two Players | PASS | Enforced via `connectionToPlayer` uniqueness |
| AC-14 | Cross-player connectionId collision fails closed | PASS | Verified in `MANDATORY TEST I` |
| AC-15 | Collision does not steal connection | PASS | Verified in `MANDATORY TEST I` |
| AC-16 | One Player may own multiple unique connections | PASS | Verified in `MANDATORY TEST B` |
| AC-17 | Unregister removes only exact connection | PASS | Verified in `MANDATORY TEST C` |
| AC-18 | Unregister one of multiple connections keeps Player connected | PASS | Verified in `MANDATORY TEST C` |
| AC-19 | Unregister final connection disconnects Player | PASS | Verified in `MANDATORY TEST D` |
| AC-20 | Missing exact unregister is idempotent | PASS | Verified in `MANDATORY TEST L` |
| AC-21 | Cross-player unregister conflict fails closed | PASS | Verified in `MANDATORY TEST J` |
| AC-22 | Cross-player unregister cannot remove victim connection | PASS | Verified in `MANDATORY TEST J` |
| AC-23 | Registry implementation is prototype-safe | PASS | Uses `Object.create(null)` containers throughout |
| AC-24 | playerId "__proto__" supported safely | PASS | Verified in `MANDATORY TEST M` |
| AC-25 | playerId "constructor" supported safely | PASS | Verified in `MANDATORY TEST M` |
| AC-26 | connectionId "__proto__" supported safely | PASS | Verified in `MANDATORY TEST M` |
| AC-27 | connectionId "constructor" supported safely | PASS | Verified in `MANDATORY TEST M` |
| AC-28 | Connected member IDs derived only from Room members | PASS | Verified in `orders connectedMemberPlayerIds and connectedLivingPlayerIds...` |
| AC-29 | One Player with multiple sockets appears once in connected members | PASS | Verified in `MANDATORY TEST B` |
| AC-30 | Connected member ordering follows Room membership/join order | PASS | Verified in `orders connectedMemberPlayerIds and connectedLivingPlayerIds...` |
| AC-31 | Match null → connectedLivingPlayers 0 | PASS | Verified in `MANDATORY TEST N` |
| AC-32 | Match null may still report connected Room members | PASS | Verified in `MANDATORY TEST N` |
| AC-33 | ALIVE connected Player counts as Living | PASS | Verified in `MANDATORY TEST A` |
| AC-34 | ALIVE Player with 2+ sockets counts exactly once | PASS | Verified in `MANDATORY TEST B` |
| AC-35 | ALIVE disconnected Player does not count | PASS | Verified in `MANDATORY TEST D` |
| AC-36 | ELIMINATED connected Player does not count | PASS | Verified in `MANDATORY TEST F` |
| AC-37 | Eliminated spectator connections may remain tracked | PASS | Verified in `MANDATORY TEST F` |
| AC-38 | Eliminated spectator never increases connectedLivingPlayers | PASS | Verified in `MANDATORY TEST F` |
| AC-39 | lifeStatus is the Living authority | PASS | Verified in `MANDATORY TEST F, G, H` |
| AC-40 | roundStatus WITH_CARDS does not independently determine life | PASS | Verified in `MANDATORY TEST F` |
| AC-41 | roundStatus EMPTY_PENDING_CHALLENGE with ALIVE still counts | PASS | Verified in `MANDATORY TEST H` |
| AC-42 | roundStatus EMPTY_SAFE with ALIVE still counts | PASS | Verified in `MANDATORY TEST G` |
| AC-43 | Hand length is not Living-presence authority | PASS | Verified in `MANDATORY TEST G, H` |
| AC-44 | Host status does not bypass lifeStatus | PASS | Verified in `evaluates Living Host vs Eliminated Host correctly` |
| AC-45 | Living Host counts normally | PASS | Verified in `evaluates Living Host vs Eliminated Host correctly` |
| AC-46 | Eliminated Host does not count Living | PASS | Verified in `evaluates Living Host vs Eliminated Host correctly` |
| AC-47 | Current-player identity does not control overall Living count | PASS | Verified in `MANDATORY TEST E` |
| AC-48 | Disconnected current Player + connected other Living Player → count >0 | PASS | Verified in `MANDATORY TEST E` |
| AC-49 | connectedLivingPlayers equals connectedLivingPlayerIds.length | PASS | Verified in `MANDATORY TEST A..H, N` |
| AC-50 | connectedLivingPlayerIds contain no duplicates | PASS | Verified in `MANDATORY TEST B` |
| AC-51 | connectedLivingPlayerIds deterministic by Room order | PASS | Verified in `orders connectedMemberPlayerIds and connectedLivingPlayerIds...` |
| AC-52 | Summary is internal server data | PASS | Not exposed as public projection |
| AC-53 | Summary is not recipient projection | PASS | Recipient projection remains deferred |
| AC-54 | No spectator projection implemented | PASS | Deferred |
| AC-55 | No hidden information included in presence summary | PASS | Contains only player IDs and count |
| AC-56 | Register does not mutate Room | PASS | Verified in `MANDATORY TEST O` |
| AC-57 | Unregister does not mutate Room | PASS | Verified in `MANDATORY TEST O` |
| AC-58 | Evaluation does not mutate Room | PASS | Verified in `MANDATORY TEST O` |
| AC-59 | Register does not mutate input registry | PASS | Verified in `MANDATORY TEST O` |
| AC-60 | Unregister does not mutate input registry | PASS | Verified in `MANDATORY TEST O` |
| AC-61 | Evaluator does not mutate registry | PASS | Verified in `MANDATORY TEST O` |
| AC-62 | Input connection object not mutated | PASS | Verified in `MANDATORY TEST O` |
| AC-63 | Raw connect causes zero Room revision | PASS | Verified in `causes ZERO Room revision...` |
| AC-64 | Raw disconnect causes zero Room revision | PASS | Verified in `causes ZERO Room revision...` |
| AC-65 | Duplicate connect causes zero Room revision | PASS | Verified in `causes ZERO Room revision...` |
| AC-66 | Duplicate disconnect causes zero Room revision | PASS | Verified in `causes ZERO Room revision...` |
| AC-67 | No nextRoomRevision call | PASS | `nextRoomRevision` is not imported or called |
| AC-68 | No lifecycle mutation | PASS | Verified in `causes ZERO Room revision...` |
| AC-69 | No MATCH_ACTIVE→PAUSED implementation | PASS | Lifecycle transitions deferred |
| AC-70 | No PAUSED→MATCH_ACTIVE implementation | PASS | Lifecycle transitions deferred |
| AC-71 | No deadline clearing | PASS | Verified in `causes ZERO Room revision...` |
| AC-72 | No deadline re-arming | PASS | Verified in `causes ZERO Room revision...` |
| AC-73 | No activeAlarm mutation | PASS | Verified in `causes ZERO Room revision...` |
| AC-74 | No Core transition | PASS | Core transitions not called |
| AC-75 | No gameplay transaction dispatch | PASS | Gameplay transactions not called |
| AC-76 | No SYSTEM_TIMEOUT dispatch | PASS | SYSTEM_TIMEOUT not called |
| AC-77 | No processed gameplay record | PASS | Processed action registry not used |
| AC-78 | No RandomSource required | PASS | Zero RNG used |
| AC-79 | No Date.now | PASS | `Date.now` is not used in room-runtime |
| AC-80 | No performance.now | PASS | `performance.now` is not used in room-runtime |
| AC-81 | No Math.random | PASS | `Math.random` is not used in room-runtime |
| AC-82 | No crypto entropy | PASS | `crypto` entropy is not used in room-runtime |
| AC-83 | No WebSocket implementation | PASS | Deferred |
| AC-84 | No Durable Object implementation | PASS | Deferred |
| AC-85 | No SQLite/persistence implementation | PASS | Deferred |
| AC-86 | No provider alarm API | PASS | Deferred |
| AC-87 | No reconnect orchestration | PASS | Deferred |
| AC-88 | No Telegram authentication implementation | PASS | Deferred |
| AC-89 | Task assumes identity already authenticated/server-resolved | PASS | Input represents pre-resolved identity |
| AC-90 | No client-supplied presence count authority | PASS | Count computed strictly by server |
| AC-91 | No client-supplied lifeStatus authority | PASS | Derived strictly from authoritative MatchState |
| AC-92 | T27 remains deferred | PASS | Mandatory Stage-04 security requirement deferred |
| AC-93 | T-017 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-protocol.test.ts` PASS |
| AC-94 | T-019 regression remains PASS | PASS | `packages/room-runtime/tests/gameplay-authorization.test.ts` PASS |
| AC-95 | T-021 regression remains PASS | PASS | `packages/room-runtime/tests/turn-deadline.test.ts` PASS |
| AC-96 | T-022 regression remains PASS | PASS | `packages/room-runtime/tests/timed-gameplay-transaction.test.ts` PASS |
| AC-97 | T-023 regression remains PASS | PASS | `packages/room-runtime/tests/system-timeout-transaction.test.ts` PASS |
| AC-98 | No game-core source changes | PASS | `packages/game-core/src` untouched |
| AC-99 | No game-core test changes | PASS | `packages/game-core/tests` untouched |
| AC-100 | No package changes | PASS | `package.json` files untouched |
| AC-101 | No package-lock changes | PASS | `package-lock.json` untouched |
| AC-102 | No external dependencies | PASS | 0 new dependencies added |
| AC-103 | npm ci PASS | PASS | Verified clean install |
| AC-104 | npm run typecheck PASS | PASS | Verified clean typecheck across all workspaces |
| AC-105 | npm test PASS | PASS | 425 tests passing across 25 test files |
| AC-106 | room-runtime direct typecheck PASS | PASS | Verified direct workspace typecheck |
| AC-107 | room-runtime direct tests PASS | PASS | 174 tests passing across 9 test files |
| AC-108 | game-core direct typecheck/tests PASS unchanged | PASS | 251 tests passing across 16 test files |
| AC-109 | Evidence records exact multi-socket unique-player proof | PASS | Documented in Direct Scenario Proofs (Test B) |
| AC-110 | Evidence records final-socket disconnect proof | PASS | Documented in Direct Scenario Proofs (Test D) |
| AC-111 | Evidence records Eliminated spectator exclusion proof | PASS | Documented in Direct Scenario Proofs (Test F) |
| AC-112 | Evidence records ALIVE empty-round-status presence proof | PASS | Documented in Direct Scenario Proofs (Test G, H) |
| AC-113 | Evidence records prototype-safe hostile identifiers | PASS | Documented in Direct Scenario Proofs (Test M) |
| AC-114 | Evidence records zero revision/lifecycle/timing mutation | PASS | Documented in Direct Scenario Proofs (Zero Mutation test) |
| AC-115 | Evidence explicitly states Pause/Resume remains deferred | PASS | Documented in Deferred Scope |
| AC-116 | Evidence explicitly states provider/WebSocket integration remains deferred | PASS | Documented in Deferred Scope |
| AC-117 | Evidence distinguishes authenticated presence facts from authentication | PASS | Documented in Architectural Distinctions |
| AC-118 | Evidence distinguishes internal presence summary from recipient projection | PASS | Documented in Architectural Distinctions |
| AC-119 | Task ends IMPLEMENTED only, never VERIFIED | PASS | Status set to IMPLEMENTED awaiting Architect verification |

---

## Direct Scenario Proof Summaries

### Scenario A — One Living Player, One Connection (AC-33)
- Living player `p1` registers `conn-1`.
- `connectedMemberPlayerIds: ['p1']`, `connectedLivingPlayerIds: ['p1']`, `connectedLivingPlayers: 1`.

### Scenario B — Same Living Player, Three Connections (AC-16, AC-29, AC-34)
- `p1` registers `conn-1a`, `conn-1b`, `conn-1c`.
- Multi-socket deduplication yields `connectedMemberPlayerIds: ['p1']`, `connectedLivingPlayers: 1`.

### Scenario C — Disconnect One of Three (AC-18)
- `p1` unregisters `conn-1b` while `conn-1a` and `conn-1c` remain.
- `connectedLivingPlayers: 1`.

### Scenario D — Disconnect Final Connection (AC-19, AC-35)
- `p1` unregisters remaining connections.
- `connectedMemberPlayerIds: []`, `connectedLivingPlayers: 0`.

### Scenario E — Current Player Disconnected, Other Living Player Connected (AC-47, AC-48)
- Current turn player is disconnected, other Living player connects.
- `connectedLivingPlayers: 1` (proving current player identity does not control overall living count).

### Scenario F — Eliminated Spectator with Three Connections (AC-36, AC-37, AC-38)
- `p3` is `ELIMINATED` and has 3 active connections; living `p1` has 1 connection.
- `connectedMemberPlayerIds: ['p1', 'p3']`, `connectedLivingPlayerIds: ['p1']`, `connectedLivingPlayers: 1`.

### Scenario G & H — ALIVE Player with EMPTY_SAFE / EMPTY_PENDING_CHALLENGE (AC-41, AC-42)
- Player with `roundStatus === 'EMPTY_SAFE'` or `'EMPTY_PENDING_CHALLENGE'` and `lifeStatus === 'ALIVE'` counts as Living (`connectedLivingPlayers: 1`).

### Scenario I & J — Connection Identity and Unregister Conflicts (AC-13..AC-15, AC-21, AC-22)
- Attempting to register an existing `connectionId` to a different player throws a conflict error without stealing the connection.
- Attempting to unregister another player's `connectionId` throws a conflict error without removing the victim's connection.

### Scenario K & L — Idempotent Duplicate Registration and Missing Unregister (AC-11, AC-12, AC-20)
- Registering the exact same `(playerId, connectionId)` pair returns the registry unchanged.
- Unregistering a non-existent connection returns the registry unchanged.

### Scenario M — Prototype-Safe Hostile Identifiers (AC-23..AC-27, AC-113)
- Player IDs and connection IDs using `'__proto__'` and `'constructor'` are registered, evaluated, and unregistered safely without prototype pollution.

### Scenario N — Null Match / Lobby Presence (AC-31, AC-32)
- In a Lobby room (`match === null`), connected members are reported in `connectedMemberPlayerIds`, while `connectedLivingPlayers: 0`.

### Scenario O — Source Immutability & Zero Side-Effects (AC-56..AC-66, AC-114)
- Original `roomState`, input `connection`, and source `presenceRegistry` remain completely unmutated across register, unregister, and evaluate operations.
- Room revision, lifecycle, deadline, and alarms experience 0 mutations.

---

## Regression Verification
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (425 tests across 25 test files)
  - `game-core`: 251 tests across 16 test files (all passing)
  - `room-runtime`: 174 tests across 9 test files (all passing)

---

## Deferred Scope
- `MATCH_ACTIVE <-> MATCH_PAUSED_NO_LIVING_CONNECTIONS` lifecycle transitions
- Life-status-triggered Pause re-evaluation
- Cloudflare Durable Object alarm APIs and WebSocket handling
- SQLite persistence / reload
- Reconnect orchestration
- Telegram session & authentication
- Recipient-specific projections & T27 dead-spectator hidden-Hand protection
