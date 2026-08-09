# State Reconciliation Protocol

Version: 0.6.0
Status: Canonical Procedure

## Purpose

Keep durable project-control state synchronized after implementation, verification, failures, blockers, architecture decisions, or stage transitions.

## Source Priority

When sources disagree:

1. actual repository/runtime behavior
2. reproducible tests and evidence
3. Git history / implementation commits
4. `.ai/TASK_LEDGER.yaml`
5. accepted ADRs and `.ai/ARCHITECTURE.md`
6. `.ai/CURRENT_STATE.md` / `.ai/ROADMAP.md`
7. executor report
8. conversation memory
9. assumptions

Never overwrite stronger evidence with weaker narrative state.

## Read-Only Architect Model

Reconciliation has two phases:

```text
Architect derives authoritative desired state
        ↓
Gravity persists it through STATE_SYNC_MODE
        ↓
Architect re-reads repository
```

Until persistence succeeds, describe a durable decision as:

`APPROVED_PENDING_PERSISTENCE`

For a verified task use:

`VERIFIED_PENDING_STATE_SYNC`

## Mandatory Triggers

Run reconciliation logic after:

- an executor reports BLOCKED/FAILED/conflict/security-stop outcomes;
- a durably IN_PROGRESS task appears abandoned/interrupted;
- Architect verifies or rejects an IMPLEMENTED task;
- a task becomes BLOCKED/FAILED/CANCELLED;
- an architecture/ADR decision is approved;
- a stage may have reached its exit gate;
- a session finds contradictory control files;
- project initialization is approved;
- repository drift is detected.

## Reconciliation Flow

```text
Read TASK_LEDGER
      ↓
Read Evidence / Git / relevant architecture
      ↓
Determine authoritative desired task/stage state
      ↓
Generate State Sync instructions
      ↓
Gravity updates TASK_LEDGER
      ↓
Gravity derives CURRENT_STATE
      ↓
Gravity updates ROADMAP if needed
      ↓
Gravity updates stage exit_gate if needed
      ↓
Commit / Push
      ↓
Architect re-reads repository
```

## Task State

Confirm:

- stable Task ID;
- current Ledger state;
- implementation commit;
- Evidence file;
- dependencies;
- acceptance criteria;
- unresolved issues;
- Architect verification decision.

Only the Architect decides `VERIFIED`.

## CURRENT_STATE Derivation

`.ai/CURRENT_STATE.md` is a concise derived summary.

Maintain:

- Current Stage
- Last Verified Task
- Current Active Task
- Current Objective
- Verified Capabilities
- Active Blockers
- Open Risks
- Known Failure / Issue
- Next Approved Action

If a task is `IMPLEMENTED` but not VERIFIED:

```text
Last Verified Task = previous durable verified task
Current Active Task = implemented task awaiting Architect verification
Next Approved Action = verify current task
```

If a task is `BLOCKED`:

```text
Current Active Task = blocked task
Active Blockers = blocker
Next Approved Action = resolve blocker
```

Do not copy the entire Ledger into Current State.

## ROADMAP Derivation

Update `.ai/ROADMAP.md` only from actual task/gate state.

Recommended stage states:

- NOT_STARTED
- READY
- IN_PROGRESS
- BLOCKED
- VERIFYING
- COMPLETE

A stage may be COMPLETE only if:

1. all required tasks are durably VERIFIED;
2. mandatory reviews passed;
3. canonical `exit_gate` is PASS;
4. blockers are resolved/accepted;
5. project-control state is synchronized.

## Canonical Stage Gate

Persist the authoritative gate result in:

`.ai/TASK_LEDGER.yaml` → `stages.<STAGE-ID>.exit_gate`

Use `.ai/templates/STAGE_GATE.md` to evaluate it.

Summarize the result in `.ai/ROADMAP.md`.

## Next Task Eligibility

A task may be approved for READY only when:

- required dependencies are durably VERIFIED;
- architecture permits it;
- blockers do not prevent it;
- required Risk Gate is approved;
- required user approval is obtained;
- no prerequisite State Sync is pending.

The read-only Architect prepares the task; the implementation executor persists READY.

## Drift Types

### State Drift
Ledger and Current State disagree.

### Roadmap Drift
Roadmap claims unsupported progress.

### Architecture Drift
Implementation violates architecture.

### Evidence Drift
Evidence references missing/wrong commits or stale results.

### Scope Drift
Implementation contains unrelated changes.

When drift exists:

1. stop dependent work;
2. identify last durable verified state;
3. Architect determines correction;
4. persist correction via State Sync or issue a corrective implementation task;
5. re-read before advancing.

## Minimal Reconciliation Report

```text
Current Stage:
Last durable VERIFIED Task:
Current Task:
Current Task Status:
Pending State Sync:
Stage Gate:
Blockers:
Drift Detected:
Next Eligible Action:
```

## Final Rule

Project status is derived from verified repository evidence, not remembered from chat and not declared by an executor.


## Interrupted / Stale IN_PROGRESS Tasks

A durable `IN_PROGRESS` task may represent:

- an actively running executor;
- an interrupted/crashed executor;
- a task waiting for user input;
- a stale state.

Do not automatically mark it failed and do not automatically restart it.

The Architect must inspect available evidence/report/context and decide one of:

- resume same Task ID;
- BLOCKED;
- FAILED;
- CANCELLED;
- corrective architecture decision.

A resume requires an explicit `RESUME_TASK` executor prompt.

## Executor-Reported Non-Success

An executor report of BLOCKED/FAILED/CONFLICT is evidence, not the final durable Architect decision.

The Architect evaluates it.

If durable project state must change, Gravity persists the Architect decision through `STATE_SYNC_MODE`.
