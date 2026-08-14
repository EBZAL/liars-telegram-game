# Evidence: T-028 Final-State Provider Alarm Synchronization Plan

## Task Metadata
- **Task ID**: `T-028-FINAL-STATE-PROVIDER-ALARM-SYNC-PLAN`
- **Workflow Profile**: `STANDARD`
- **Risk Level**: `MEDIUM`
- **Base Commit**: `66cbc92dd004332501fbd3c957263e8cca146dc3`
- **Task-Start Commit**: `5f9c361567fffef26a9886364e3748980e30cd30`
- **Implementation Commit**: `2f1d7dd20c8efc1f39efaa8f5c55751b5c3a0154`
- **Final Status**: `IMPLEMENTED`

---

## 1. Architectural Summary & Authority Direction

This task implements the pure, provider-independent final-state alarm synchronization planning layer in `@liars-telegram-game/room-runtime`.

### Core Architectural Invariants:
1. **Room Metadata as Authoritative Source of Truth**:
   - `RoomAuthorityState.activeAlarm` owns the durable desired alarm metadata (`kind`, `dueAt`, `generation`).
   - The provider scheduled timestamp (`number | null`) is strictly an external wake-up mechanism.
   - Authority flow is strictly **one-way**: `finalRoomState -> ProviderAlarmSyncPlan`.
   - Provider observations never overwrite or mutate Room revision, lifecycle, Match, turn, or alarm metadata.
2. **Final-State-Only Synchronization Contract**:
   - The planner operates exclusively on the **final composed Room state** produced after all turn, deadline, presence, Pause, Resume, or Finished compositions have completed (e.g. from `executeTimedClientGameplayWithPresenceLifecycle`, `executeSystemTimeoutWithPresenceLifecycle`, or `resumePausedMatchForLivingPresenceTransition`).
   - Transient intermediate active alarms (such as the intermediate next-turn deadline in T-022 before a zero-Living Pause in T-025/T-027) are never scheduled on the provider.
3. **Purity & Revision Isolation**:
   - Alarm synchronization is a derived external planning side effect, not an authoritative Room state transition.
   - Calling the planner increments zero Room revisions, requires no `authoritativeNowMs`, and makes no calls to `Date.now()`, `performance.now()`, `Math.random()`, or crypto entropy.

---

## 2. API & Discriminated Result Model

Module: `packages/room-runtime/src/provider-alarm-sync.ts` (exported via `packages/room-runtime/src/index.ts`)

```typescript
export type ProviderAlarmSyncDecision =
  | 'NO_CHANGE'
  | 'SET_ALARM'
  | 'DELETE_ALARM'
  | 'INVALID_STATE';

export type ProviderAlarmSyncInvalidReason =
  | 'INVALID_PROVIDER_OBSERVATION'
  | 'INVALID_ROOM_STATE'
  | 'INVALID_ACTIVE_DEADLINE_STATE'
  | 'INVALID_PAUSED_ALARM_STATE'
  | 'INVALID_LOBBY_ALARM_STATE'
  | 'INVALID_FINISHED_ALARM_STATE'
  | 'INVALID_ABANDONED_ALARM_STATE'
  | 'INVALID_NON_TURN_ALARM';

export interface ProviderAlarmSyncNoChangePlan {
  readonly decision: 'NO_CHANGE';
}

export interface ProviderAlarmSyncSetAlarmPlan {
  readonly decision: 'SET_ALARM';
  readonly dueAt: number;
}

export interface ProviderAlarmSyncDeleteAlarmPlan {
  readonly decision: 'DELETE_ALARM';
}

export interface ProviderAlarmSyncInvalidStatePlan {
  readonly decision: 'INVALID_STATE';
  readonly reason: ProviderAlarmSyncInvalidReason;
}

export type ProviderAlarmSyncPlan =
  | ProviderAlarmSyncNoChangePlan
  | ProviderAlarmSyncSetAlarmPlan
  | ProviderAlarmSyncDeleteAlarmPlan
  | ProviderAlarmSyncInvalidStatePlan;

export function deriveProviderAlarmSyncPlan<TMatchSnapshot = MatchState>(
  finalRoomState: RoomAuthorityState<TMatchSnapshot>,
  observedProviderAlarmDueAt: number | null
): ProviderAlarmSyncPlan;
```

---

## 3. Detailed Lifecycle & Alarm Reconciliation Rules

### Provider Observation Validation
- Valid observations: `null` or a safe non-negative integer (`typeof v === 'number' && Number.isSafeInteger(v) && v >= 0`).
- Any negative number, fraction, NaN, Infinity, unsafe integer, string, or object immediately fails closed with `{ decision: 'INVALID_STATE', reason: 'INVALID_PROVIDER_OBSERVATION' }`.

### MATCH_ACTIVE
- Coherence validation delegates to verified T-021 (`evaluateTurnDeadlineDueState(finalRoomState, 0)`).
- Valid active statuses (`NOT_DUE` / `DUE`) verify: Match `IN_PROGRESS`, `winnerId: null`, non-empty `currentTurnId`, valid `currentTurnDeadline`, `activeAlarm.kind === 'TURN_DEADLINE'`, `activeAlarm.dueAt === currentTurnDeadline`, `activeAlarm.generation === revision`.
- Incoherent states return `{ decision: 'INVALID_STATE', reason: 'INVALID_ACTIVE_DEADLINE_STATE' }`.
- Desired provider timestamp: `finalRoomState.activeAlarm.dueAt`.

### MATCH_PAUSED_NO_LIVING_CONNECTIONS
- Invariant: `currentTurnDeadline === null` and `activeAlarm === null`.
- Violation returns `{ decision: 'INVALID_STATE', reason: 'INVALID_PAUSED_ALARM_STATE' }`.
- Desired provider timestamp: `null`.
- If provider has scheduled timestamp -> `DELETE_ALARM`. If null -> `NO_CHANGE`.

### LOBBY
- Invariant: `currentTurnDeadline === null`.
- Allowed alarms: `null` (desired `null`) or `HOST_GRACE` (structural validation of `dueAt` and `generation` safe non-negative integers; desired `activeAlarm.dueAt`).
- Other alarm kinds (`TURN_DEADLINE`, `ROOM_RETENTION`) return `INVALID_LOBBY_ALARM_STATE`.

### MATCH_FINISHED & ABANDONED
- Invariant: `currentTurnDeadline === null`.
- Allowed alarms: `null` (desired `null`) or `ROOM_RETENTION` (structural validation of `dueAt` and `generation`; desired `activeAlarm.dueAt`).
- Other alarm kinds return `INVALID_FINISHED_ALARM_STATE` / `INVALID_ABANDONED_ALARM_STATE`.

### Generic Decision Table
| Desired Provider Timestamp | Observed Provider Timestamp | Plan Decision |
|---|---|---|
| `null` | `null` | `NO_CHANGE` |
| `null` | `timestamp` | `DELETE_ALARM` |
| `timestamp A` | `null` | `SET_ALARM (dueAt: A)` |
| `timestamp A` | `timestamp B (A != B)` | `SET_ALARM (dueAt: A)` |
| `timestamp A` | `timestamp A` | `NO_CHANGE` |

---

## 4. Integration & Direct Test Verification

### Mandatory Direct Tests A through N
- **Test A (T-027 COMMITTED_ACTIVE, old provider alarm 31000)**: Final Room revision 9, deadline 32000 -> `SET_ALARM (dueAt: 32000)`, Room unchanged.
- **Test B (Same ACTIVE, provider matching 32000)**: -> `NO_CHANGE`.
- **Test C (T-027 COMMITTED_PAUSED, old provider alarm 31000)**: Final Room revision 10, alarm null -> `DELETE_ALARM`.
- **Test D (T-027 COMMITTED_PAUSED, hypothetical intermediate 32000 observation)**: -> `DELETE_ALARM` (proves final state wins).
- **Test E (PAUSED, provider observed null)**: -> `NO_CHANGE`.
- **Test F (T-026 COMMITTED_FINISHED, old provider alarm 31000)**: Final Room `MATCH_FINISHED`, alarm null -> `DELETE_ALARM` (does not create retention alarm).
- **Test G (T-025 Resume at 90000)**: Final Room revision 10, deadline 120000, provider observed null -> `SET_ALARM (dueAt: 120000)`, zero extra revisions.
- **Test H (Provider Drift Repair)**: Desired 70000 vs observed 60000 -> `SET_ALARM (dueAt: 70000)`; Desired 70000 vs observed null -> `SET_ALARM (dueAt: 70000)`; Desired null vs observed 60000 -> `DELETE_ALARM`. Adds zero Room revisions.
- **Test I (Lifecycle/Alarm Mismatch)**: `MATCH_PAUSED` + `TURN_DEADLINE` metadata -> `INVALID_STATE` (`INVALID_PAUSED_ALARM_STATE`).
- **Test J (Future-Compatible LOBBY HOST_GRACE)**: Valid `HOST_GRACE` at 60000, observed null -> `SET_ALARM (dueAt: 60000)`.
- **Test K (Future-Compatible FINISHED ROOM_RETENTION)**: Valid `ROOM_RETENTION` at 86400000, observed 86400000 -> `NO_CHANGE`.
- **Test L (Same DueAt / Changed Durable Identity)**: Old durable identity `TURN_DEADLINE` -> new durable identity `ROOM_RETENTION` at 50000, observed provider 50000 -> `NO_CHANGE`. (Identity remains durable Room metadata).
- **Test M (Invalid Provider Observation)**: Negative, fraction, NaN, Infinity, unsafe integer -> `INVALID_STATE` (`INVALID_PROVIDER_OBSERVATION`).
- **Test N (Purity / Zero Revision)**: All inputs immutable, zero Room mutations.

---

## 5. Explicit System Distinctions & Deferred Boundaries

### Explicit Invariant Distinctions:
1. **Room activeAlarm metadata != provider scheduled timestamp**: Durable Room metadata owns kind, dueAt, and generation; provider observation is timestamp-only.
2. **Durable alarm identity != provider timestamp**: When durable alarm kind/generation changes but dueAt is unchanged, zero provider scheduling operations are needed.
3. **Final composed Room != intermediate active state**: Synchronization is only performed after all compositional transitions finish.
4. **Alarm synchronization != Room state transition**: The planning layer never increments revision or modifies Room state.
5. **Provider drift repair != Room revision**: Re-synchronizing a missing/drifted alarm never creates a Room state revision.
6. **SET_ALARM intent != actual storage.setAlarm call**: The planning layer produces an abstract plan; provider adapter execution is decoupled.
7. **Pure plan != durable atomic provider transaction**: Atomicity and crash ordering are handled at the provider adapter boundary.

### Explicitly Deferred Scope:
- Cloudflare Worker scaffold / wrangler configuration
- Durable Object implementation (`storage.setAlarm`, `storage.getAlarm`, `storage.deleteAlarm`, `alarm()` handler)
- SQLite / persistence schema / reload recovery orchestration
- Crash ordering / transactional atomicity between storage put and alarm scheduling
- Actual WebSocket transport / connection management
- `HOST_GRACE` producer transition and host migration policy
- `ROOM_RETENTION` producer transition and 24-hour retention duration calculation
- Telegram authentication / webhook handling
- Recipient projections / hidden card filtering (T27 requirement)

---

## 6. Acceptance Criteria Traceability (AC-01 through AC-148)

- **AC-01**: Dedicated provider-independent alarm sync planning module exists (`packages/room-runtime/src/provider-alarm-sync.ts`). **PASS**
- **AC-02**: API exported from room-runtime (`packages/room-runtime/src/index.ts`). **PASS**
- **AC-03**: Input explicitly represents FINAL authoritative Room state (`finalRoomState`). **PASS**
- **AC-04**: Provider observation represented without Cloudflare types (`observedProviderAlarmDueAt: number | null`). **PASS**
- **AC-05**: Result discriminates `NO_CHANGE`. **PASS**
- **AC-06**: Result discriminates `SET_ALARM`. **PASS**
- **AC-07**: Result discriminates `DELETE_ALARM`. **PASS**
- **AC-08**: Result discriminates `INVALID_STATE`. **PASS**
- **AC-09**: `SET_ALARM` carries desired `dueAt` only. **PASS**
- **AC-10**: No provider alarm kind/generation payload is invented. **PASS**
- **AC-11**: Observed `null` is accepted. **PASS**
- **AC-12**: Observed safe non-negative integer is accepted. **PASS**
- **AC-13**: Negative provider observation fails closed with `INVALID_STATE`. **PASS**
- **AC-14**: Fractional provider observation fails closed with `INVALID_STATE`. **PASS**
- **AC-15**: NaN provider observation fails closed with `INVALID_STATE`. **PASS**
- **AC-16**: Infinity provider observation fails closed with `INVALID_STATE`. **PASS**
- **AC-17**: Unsafe integer provider observation fails closed with `INVALID_STATE`. **PASS**
- **AC-18**: Invalid Room revision fails closed with `INVALID_STATE`. **PASS**
- **AC-19**: `MATCH_ACTIVE` validation delegates to T-021. **PASS**
- **AC-20**: T-021 `NOT_DUE` active state accepted. **PASS**
- **AC-21**: T-021 `DUE` active state accepted. **PASS**
- **AC-22**: T-021 `INVALID_STATE` maps `INVALID_STATE`. **PASS**
- **AC-23**: T-021 `NOT_APPLICABLE` from claimed `MATCH_ACTIVE` fails closed. **PASS**
- **AC-24**: No full T-021 timing algorithm duplication. **PASS**
- **AC-25**: Coherent `ACTIVE` desired `dueAt` comes from `activeAlarm`. **PASS**
- **AC-26**: `ACTIVE` provider `null` -> `SET_ALARM`. **PASS**
- **AC-27**: `ACTIVE` provider different `dueAt` -> `SET_ALARM`. **PASS**
- **AC-28**: `ACTIVE` provider matching `dueAt` -> `NO_CHANGE`. **PASS**
- **AC-29**: `ACTIVE` plan adds zero Room revision. **PASS**
- **AC-30**: `ACTIVE` plan does not mutate deadline. **PASS**
- **AC-31**: `ACTIVE` plan does not mutate alarm metadata. **PASS**
- **AC-32**: `PAUSED` requires `currentTurnDeadline` null. **PASS**
- **AC-33**: `PAUSED` requires `activeAlarm` null. **PASS**
- **AC-34**: `PAUSED` with stale deadline fails closed. **PASS**
- **AC-35**: `PAUSED` with stale alarm fails closed. **PASS**
- **AC-36**: `PAUSED` observed `null` -> `NO_CHANGE`. **PASS**
- **AC-37**: `PAUSED` observed timestamp -> `DELETE_ALARM`. **PASS**
- **AC-38**: `LOBBY` requires `currentTurnDeadline` null. **PASS**
- **AC-39**: `LOBBY` permits no `activeAlarm`. **PASS**
- **AC-40**: `LOBBY` permits structurally valid `HOST_GRACE`. **PASS**
- **AC-41**: `LOBBY` rejects `TURN_DEADLINE`. **PASS**
- **AC-42**: `LOBBY` rejects `ROOM_RETENTION`. **PASS**
- **AC-43**: `HOST_GRACE` `dueAt` safe non-negative integer. **PASS**
- **AC-44**: `HOST_GRACE` `generation` safe non-negative integer. **PASS**
- **AC-45**: T-028 does not create `HOST_GRACE` metadata. **PASS**
- **AC-46**: T-028 does not calculate 60-second host grace. **PASS**
- **AC-47**: `MATCH_FINISHED` requires `currentTurnDeadline` null. **PASS**
- **AC-48**: `MATCH_FINISHED` permits `activeAlarm` null. **PASS**
- **AC-49**: `MATCH_FINISHED` permits structurally valid `ROOM_RETENTION`. **PASS**
- **AC-50**: `MATCH_FINISHED` rejects `TURN_DEADLINE`. **PASS**
- **AC-51**: `MATCH_FINISHED` rejects `HOST_GRACE`. **PASS**
- **AC-52**: T-028 does not create `ROOM_RETENTION` metadata. **PASS**
- **AC-53**: T-028 does not calculate 24-hour retention. **PASS**
- **AC-54**: `ABANDONED` requires `currentTurnDeadline` null. **PASS**
- **AC-55**: `ABANDONED` permits null alarm. **PASS**
- **AC-56**: `ABANDONED` permits structurally valid `ROOM_RETENTION`. **PASS**
- **AC-57**: `ABANDONED` rejects `TURN_DEADLINE`/`HOST_GRACE`. **PASS**
- **AC-58**: Non-turn alarm `dueAt` validation implemented. **PASS**
- **AC-59**: Non-turn alarm `generation` validation implemented. **PASS**
- **AC-60**: No new `HOST_GRACE` generation/revision semantic invented. **PASS**
- **AC-61**: No new `ROOM_RETENTION` generation/revision semantic invented. **PASS**
- **AC-62**: Desired `null` + observed `null` -> `NO_CHANGE`. **PASS**
- **AC-63**: Desired `null` + observed timestamp -> `DELETE_ALARM`. **PASS**
- **AC-64**: Desired timestamp + observed `null` -> `SET_ALARM`. **PASS**
- **AC-65**: Desired timestamp differs from observed -> `SET_ALARM desired`. **PASS**
- **AC-66**: Desired timestamp equals observed -> `NO_CHANGE`. **PASS**
- **AC-67**: Exactly one synchronization intent maximum. **PASS**
- **AC-68**: Provider state never overwrites Room `activeAlarm`. **PASS**
- **AC-69**: Provider state never overwrites Room lifecycle. **PASS**
- **AC-70**: Provider state never overwrites Room revision. **PASS**
- **AC-71**: Equal `dueAt` with changed durable kind/generation requires no timestamp operation. **PASS**
- **AC-72**: Durable alarm identity remains Room-owned. **PASS**
- **AC-73**: Provider observation is timestamp-only. **PASS**
- **AC-74**: T-027 `COMMITTED_ACTIVE` final state can produce `SET_ALARM`. **PASS**
- **AC-75**: T-027 `COMMITTED_ACTIVE` matching provider can produce `NO_CHANGE`. **PASS**
- **AC-76**: T-027 `COMMITTED_PAUSED` final state produces `DELETE_ALARM` when old alarm exists. **PASS**
- **AC-77**: T-027 `COMMITTED_PAUSED` deletes hypothetical intermediate deadline timestamp. **PASS**
- **AC-78**: T-027 intermediate active state is not automatically synchronized. **PASS**
- **AC-79**: T-026 `COMMITTED_ACTIVE` integration covered. **PASS**
- **AC-80**: T-026 `COMMITTED_PAUSED` integration covered. **PASS**
- **AC-81**: T-026 `COMMITTED_FINISHED` integration covered. **PASS**
- **AC-82**: Finished final null alarm deletes stale previous deadline. **PASS**
- **AC-83**: T-025 Resume final active state produces `SET_ALARM` fresh deadline. **PASS**
- **AC-84**: Resume synchronization adds zero revision. **PASS**
- **AC-85**: No old remaining timer calculation. **PASS**
- **AC-86**: Drift null-provider/desired-alarm repairs with `SET_ALARM`. **PASS**
- **AC-87**: Drift wrong-provider-dueAt repairs with `SET_ALARM`. **PASS**
- **AC-88**: Drift provider-alarm/desired-null repairs with `DELETE_ALARM`. **PASS**
- **AC-89**: Drift repair adds zero Room revision. **PASS**
- **AC-90**: No `nextRoomRevision` call. **PASS**
- **AC-91**: No Match mutation. **PASS**
- **AC-92**: No `currentTurnId` mutation. **PASS**
- **AC-93**: No `currentTurnDeadline` mutation. **PASS**
- **AC-94**: No `activeAlarm` mutation. **PASS**
- **AC-95**: No processed-action registry mutation. **PASS**
- **AC-96**: No `authoritativeNowMs` parameter. **PASS**
- **AC-97**: No `Date.now()`. **PASS**
- **AC-98**: No `performance.now()`. **PASS**
- **AC-99**: No `Math.random()`. **PASS**
- **AC-100**: No crypto entropy. **PASS**
- **AC-101**: Past `dueAt` is not rewritten based on local clock. **PASS**
- **AC-102**: Input Room immutable. **PASS**
- **AC-103**: Input Match immutable. **PASS**
- **AC-104**: Input members immutable. **PASS**
- **AC-105**: Input `activeAlarm` immutable. **PASS**
- **AC-106**: No hidden Match data emitted in result. **PASS**
- **AC-107**: No `GameplayActionEnvelope` change. **PASS**
- **AC-108**: No client alarm authority. **PASS**
- **AC-109**: No client `dueAt` authority. **PASS**
- **AC-110**: No recipient projection. **PASS**
- **AC-111**: T27 remains deferred. **PASS**
- **AC-112**: No `storage.setAlarm`. **PASS**
- **AC-113**: No `storage.getAlarm`. **PASS**
- **AC-114**: No `storage.deleteAlarm`. **PASS**
- **AC-115**: No `alarm()` handler. **PASS**
- **AC-116**: No Durable Object implementation. **PASS**
- **AC-117**: No SQLite/persistence. **PASS**
- **AC-118**: No WebSocket. **PASS**
- **AC-119**: No actual concurrency implementation. **PASS**
- **AC-120**: No Worker package/scaffold. **PASS**
- **AC-121**: No wrangler configuration. **PASS**
- **AC-122**: No package changes. **PASS**
- **AC-123**: No package-lock changes. **PASS**
- **AC-124**: No external dependency. **PASS**
- **AC-125**: No game-core source changes. **PASS**
- **AC-126**: No game-core test changes. **PASS**
- **AC-127**: T-021 regression remains PASS. **PASS**
- **AC-128**: T-025 regression remains PASS. **PASS**
- **AC-129**: T-026 regression remains PASS. **PASS**
- **AC-130**: T-027 regression remains PASS. **PASS**
- **AC-131**: `npm ci` PASS. **PASS**
- **AC-132**: `npm run typecheck` PASS. **PASS**
- **AC-133**: `npm test` PASS. **PASS**
- **AC-134**: room-runtime direct typecheck PASS. **PASS**
- **AC-135**: room-runtime direct tests PASS. **PASS**
- **AC-136**: game-core direct typecheck/tests PASS unchanged. **PASS**
- **AC-137**: Evidence maps AC-01 through AC-136. **PASS**
- **AC-138**: Evidence records final-state-only synchronization contract. **PASS**
- **AC-139**: Evidence records T-027 ACTIVE set/no-change proof. **PASS**
- **AC-140**: Evidence records T-027 PAUSED delete proof. **PASS**
- **AC-141**: Evidence records T-026 ACTIVE/PAUSED/FINISHED proof. **PASS**
- **AC-142**: Evidence records Resume fresh alarm proof. **PASS**
- **AC-143**: Evidence records drift-repair semantics. **PASS**
- **AC-144**: Evidence records alarm identity vs provider timestamp distinction. **PASS**
- **AC-145**: Evidence records HOST_GRACE/ROOM_RETENTION producer semantics deferred. **PASS**
- **AC-146**: Evidence records durable atomicity/crash ordering deferred. **PASS**
- **AC-147**: Evidence records no provider API implementation. **PASS**
- **AC-148**: Task ends IMPLEMENTED only, never VERIFIED. **PASS**

---

## 7. Verification Logs & Metrics

- **Full Workspace Typecheck**: `npm run typecheck` -> PASS
- **Full Workspace Vitest**: `npm test` -> PASS (537 tests across 29 files)
  - `packages/game-core`: 251 tests across 16 files (PASS, 0 regressions)
  - `packages/room-runtime`: 286 tests across 13 files (PASS, 67 new tests)
