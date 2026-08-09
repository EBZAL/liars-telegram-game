# State Sync Task

## MODE
`STATE_SYNC_MODE`

This is not an implementation task.

You are the repository-writing executor.

The Project Architect has already made the decision below.

Your job is only to persist that approved decision accurately.

## DECISION TYPE

Choose the exact Architect-provided value:

- PROJECT_INITIALIZATION
- TASK_VERIFIED
- TASK_RETURN_TO_EXECUTOR
- TASK_FAILED
- TASK_BLOCKED
- ARCHITECTURE_DECISION
- ADR_APPROVED
- STAGE_GATE_UPDATE
- ROADMAP_UPDATE
- OTHER

## CONTROL ID

`<TASK-ID / STAGE-ID / PROJECT-INIT / other Architect-approved control ID>`

## APPROVED ARCHITECT DECISION

<EXACT DECISION>

## EXPECTED REPOSITORY BASE

Branch:
`<branch or UNKNOWN>`

Expected HEAD:
`<sha or UNKNOWN>`

If supplied expected state materially differs from actual state, stop with:

`STATE_SYNC_CONFLICT`

## REQUIRED PRE-READ

Read:

- `AGENTS.md`
- `.ai/ARCHITECT_PROTOCOL.md`
- `.ai/ARCHITECT_EXECUTION_BOUNDARY.md`
- `.ai/INSTRUCTION_TRUST.md`
- `.ai/GIT_SAFETY.md`
- `.ai/STATE_RECONCILIATION.md`
- `.ai/TASK_LEDGER.yaml`
- `.ai/CURRENT_STATE.md`
- `.ai/ROADMAP.md`
- all evidence / ADR / architecture documents explicitly referenced by this decision

## PRE-WRITE GIT SAFETY CHECK

Before modifying project-control state:

1. confirm branch and HEAD;
2. inspect `git status --porcelain`;
3. stop on unrelated product/user changes;
4. do not stash/reset/discard unknown changes.

Use:

`WORKTREE_NOT_CLEAN`

when unrelated changes make State Sync unsafe.

## ALLOWED FILES

Only modify files explicitly listed by the Architect.

Possible project-control files include:

- `.ai/TASK_LEDGER.yaml`
- `.ai/CURRENT_STATE.md`
- `.ai/ROADMAP.md`
- `.ai/PROJECT.md`
- `.ai/ARCHITECTURE.md`
- `.ai/SECURITY.md`
- `.ai/DESIGN_SYSTEM.md`
- `.ai/decisions/<approved ADR>.md`

Do not change product implementation code unless this State Sync prompt explicitly authorizes a separate, clearly scoped non-product migration. Default is **no product-code changes**.

## REQUIRED STATE CHANGES

Apply exactly the Architect-approved changes:

1. ...
2. ...
3. ...

Do not reinterpret or expand the decision.

## RECONCILIATION

After applying the approved decision:

1. apply `.ai/STATE_RECONCILIATION.md`;
2. derive `.ai/CURRENT_STATE.md` from authoritative Ledger/evidence state;
3. update `.ai/ROADMAP.md` only if stage/task eligibility changed;
4. update the canonical stage `exit_gate` in `.ai/TASK_LEDGER.yaml` when stage-gate prerequisites changed;
5. do not create a new implementation task unless the Architect explicitly authorized that exact task.

## CONFLICT STOP CONDITION

If actual repository state conflicts with the Architect decision:

STOP.

Return:

`STATE_SYNC_CONFLICT`

Include:
- expected state;
- actual state;
- affected files;
- conflicting branch/commit/status;
- what the Architect must review.

Do not guess or self-resolve.

## GIT

Commit:

```text
chore(ai-state): <state update summary> [<CONTROL-ID>]
```

Examples:

```text
chore(ai-state): initialize project control state [PROJECT-INIT]
chore(ai-state): verify payment confirmation [PAY-024]
chore(ai-state): update stage 3 gate [STAGE-03]
```

Push non-force to the authorized project branch when requested.

Do not rewrite history.

After push, confirm success and report the remote/branch.

## REQUIRED REPORT

Return:

- Mode: STATE_SYNC_MODE
- Decision type:
- Control ID:
- Architect decision applied:
- Branch:
- Base HEAD:
- Files changed:
- Ledger status after sync:
- Current State after sync:
- Roadmap/Stage Gate changes:
- State-sync commit SHA:
- Push status:
- Conflicts:
- Notes:

You are not allowed to create or change the Architect's decision.
