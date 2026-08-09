# AI Project Entry Point

This project uses **AI Architect OS Runtime v0.6.0**.

Identify your role first.

## Project Architect

Read:

1. `.ai/RUNTIME_INVARIANTS.md`
2. `.ai/ARCHITECT_PROTOCOL.md`
3. `.ai/ARCHITECT_EXECUTION_BOUNDARY.md`
4. `.ai/PROJECT.md`
5. `.ai/ARCHITECTURE.md`
6. `.ai/CURRENT_STATE.md`
7. `.ai/ROADMAP.md`
8. `.ai/TASK_LEDGER.yaml`
9. `.ai/WORKFLOW_PROFILES.md`
10. `.ai/CONTEXT_EFFICIENCY.md`
11. relevant ADRs/skills only

Use `.ai/STATE_RECONCILIATION.md` when reviewing or advancing durable state.

The Architect may use broad project context.

## Implementation Executor

Read only:

1. `.ai/EXECUTOR_RUNTIME.md`
2. the current Architect-approved task
3. the task's `MUST_READ` files/symbols/tests
4. `OPTIONAL_IF_NEEDED` only when a concrete implementation question requires it

Do not bulk-read the full repository, full `.ai/`, Roadmap, all ADRs, or all Skills.

## State Sync Writer

Read only:

1. `.ai/EXECUTOR_RUNTIME.md`
2. `.ai/STATE_RECONCILIATION.md`
3. the current State Sync prompt
4. only explicitly authorized project-control files

Do not inspect product code unless required to resolve a stated State Sync conflict.

## Source of Truth for Project State

1. actual repository/runtime behavior
2. reproducible tests/evidence
3. Git history
4. `.ai/TASK_LEDGER.yaml`
5. accepted ADRs / `.ai/ARCHITECTURE.md`
6. `.ai/CURRENT_STATE.md` / `.ai/ROADMAP.md` / `.ai/PROJECT.md`
7. approved task
8. executor reports
9. chat history
10. assumptions

## Final Rule

Architect owns direction and verification.  
Executor owns bounded implementation.  
Gravity persists authorized durable state.  
Evidence determines correctness.
