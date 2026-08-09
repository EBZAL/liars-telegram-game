# Architecture

## Stack
* TypeScript
* React
* Vite
* Telegram Mini App
* Cloudflare Worker
* One SQLite-backed Durable Object per Room
* WebSocket realtime transport
* No D1 initially
* No VPS
* No custom domain for MVP

Separate Bot Backend: NO.
If a Telegram webhook is needed, the same Cloudflare Worker serves it.

## Component Map
```text
Telegram User
    ↓
React/Vite Telegram Mini App
    ↓ HTTPS / WebSocket
Cloudflare Worker
    ├─ Static Assets
    ├─ Telegram InitData Validation
    ├─ Session/Auth
    ├─ Room Routing
    └─ Optional Telegram Webhook
              ↓
Room Durable Object
    ├─ Lobby / Membership
    ├─ Host Policy
    ├─ Presence
    ├─ Pause / Resume
    ├─ Revision / Dedupe
    ├─ Single Active Alarm
    ├─ WebSocket Coordination
    ├─ Recipient-specific Projections
    ├─ SQLite Persistence
    └─ Pure Deterministic Game Engine
```

## Core Game Engine Boundary
Engine owns:
deck, dealing, table rank, turn legality, playing cards, claims, LIAR challenge, truth/lie resolution, empty-hand rules, mandatory challenge, round reset, round starter, roulette progression, elimination, winner, canonical game randomness, Project Timeout card-selection effect.

Engine must not own:
Telegram, HTTP, WebSocket, Cloudflare, database APIs, room invites, host, presence, network disconnect, Pause/Resume network policy, UI card selection, animations, CSS.

## Canonical Rule Invariant
`docs/GAME_RULES.md v3` remains unchanged and authoritative.
Maintain explicit distinction: Canonical game rules vs Project/Product policies.
Network/room policies must never be represented as canonical Liar's Deck mechanics.

## Randomness
Use injected/testable randomness. Production randomness is server-owned. Testing must support fixed/scripted deterministic randomness.
Randomized areas include: seat order, first round starter, deck shuffle, table-rank shuffle, revolver sequence, timeout fallback card.
Clients must never receive future revolver outcomes, hidden undealt cards or authoritative random seeds.

## Multiplayer Authority
One Durable Object is the authoritative coordination unit for one Room. Clients submit intents only.

Gameplay command envelope:
actionId, expectedRevision, turnId, actionType, payload

Server derives:
actor authority, claim rank, claim count, truth/lie, round loser, roulette result, elimination, winner, next state

### Dedupe
`actionId` is the idempotency key. Same successfully processed action must never mutate state twice.

### Revision
Use a monotonic authoritative Room revision. Revision increments on authoritative durable state transitions such as: membership mutation, Start Match, Game Core transition, Active → Paused, Paused → Active, host migration, finish / abandon.
Ordinary presence noise must not unnecessarily invalidate gameplay commands.

### Stale Client
Client snapshots never overwrite server state. Revision mismatch results in rejection/resync.

### Concurrency
All state-changing Room operations are serialized through the Room Durable Object. No contradictory simultaneous transition may commit.

## Local Card Selection
Pre-confirm card selection is **Local Presentation State only**.
Before the user confirms PLAY: no authoritative draft, no server selection state, no revision mutation, no Game Core transition.
Only confirmed `PLAY_CARDS` enters the server authority boundary.

## Timeout Policy
Canonical Turn Timer: 30 seconds
Historical original-PC selection algorithm remains an acknowledged Source Gap. Project Rule is binding.
If no PLAY/CALL_LIAR has been authoritatively committed before deadline:
SYSTEM_TIMEOUT → choose exactly 1 random card → from authoritative current hand → auto-play it → claimCount = 1 → claimRank = tableRank
Local selected-but-unconfirmed cards do not exist from Engine/server perspective and are ignored.
Timeout random selection must not bias toward truthful, lying or Joker cards.
Server deadline is authoritative. Late commands must not override an already-due timeout transition.

## Living-Player Presence / Pause / Resume
`connectedLivingPlayers` = count of unique authenticated Players who:
- are not ELIMINATED
- have at least one active authenticated connection
Multiple sockets for one Player count once.

### Active
connectedLivingPlayers > 0 → MATCH_ACTIVE → Turn Timer continues.
The current Player may itself be disconnected; as long as at least one Living Player remains connected, Match remains active.

### Pause
connectedLivingPlayers == 0 → MATCH_PAUSED_NO_LIVING_CONNECTIONS
Pause must preserve current turn, hands, table rank, previousPlay, round, roulette progress, prevent SYSTEM_TIMEOUT, prevent Game Core advancement, invalidate/remove current turn deadline.
`MATCH_PAUSED_NO_LIVING_CONNECTIONS` is a Room/Game runtime state only.

### Eliminated Spectator
An Eliminated Player may remain in the Room; may receive Public State; must not receive Living Players' hidden information; does not count toward connectedLivingPlayers; cannot prevent Pause; cannot Resume the Match.

### Resume
Only connectedLivingPlayers 0 → 1 caused by a Living Player connection resumes the Match.
Resume must preserve same turn, same current player, same hands, same previousPlay, same table rank, same round, same revolver progress, and establish newTurnDeadline = authoritativeResumeTime + 30 seconds.
Do not restore old remaining time. Reconnect by an Eliminated Player must not Resume. Additional Living reconnects after the first must not reset the deadline.

### Life-state Re-evaluation
Re-evaluate connectedLivingPlayers after a Game Core transition that changes a Player to ELIMINATED.
If that transition ends the Match because only one Living Player remains: MATCH_FINISHED takes precedence over Pause.
Otherwise, if connected Living count becomes zero: MATCH_PAUSED_NO_LIVING_CONNECTIONS.

## Single Active Alarm Model
MVP Room state uses only:
activeAlarm: null OR { kind: TURN_DEADLINE | HOST_GRACE | ROOM_RETENTION, dueAt, generation }
Invariant: At most one active provider alarm per Room.

### Lifecycle
LOBBY: Normally no alarm. When Lobby Host disconnect grace applies: HOST_GRACE for 60 seconds.
MATCH_ACTIVE: TURN_DEADLINE
MATCH_PAUSED_NO_LIVING_CONNECTIONS: Normally activeAlarm = null
MATCH_FINISHED / ABANDONED: ROOM_RETENTION for 24-hour inactivity retention.

### Alarm Handling
Alarm handler must: 1. reload authoritative durable Room state; 2. validate kind; 3. validate generation; 4. validate lifecycle/state applicability; 5. validate due time; 6. no-op stale/invalid alarms; 7. execute at most the applicable transition; 8. clear/replace consumed alarm; 9. schedule the next single alarm only if the resulting lifecycle requires one.
Handlers must be idempotent. Alarm retries or stale delivery must never apply transitions twice.

## Room Participation / Host
Join only in LOBBY. Maximum 4 Players. Minimum Match Start = 2 Players. No mid-match join. No external spectator MVP.
Eliminated room participants may remain as Public-State spectators.
Host controls Start Match only, has no additional gameplay authority.
Lobby Host disconnect grace: 60 seconds.
If Host explicitly Leaves: immediate migration.
If 60-second grace expires: host → earliest joined connected Player.
If no eligible connected Player exists, host may remain unset until an eligible Player reconnects, then recompute deterministically.

## Persistence
MVP persistence: SQLite-backed Durable Object storage, one per Room. No D1 initially.
Persist enough authoritative state for safe eviction/restart/reconnect: room metadata, membership/order, host, Match snapshot, revision, action dedupe records sufficient for retry safety, active alarm metadata, current deadline, Room lifecycle.
No long-term match history.
Finished / abandoned Room retention: 24 hours inactivity.
