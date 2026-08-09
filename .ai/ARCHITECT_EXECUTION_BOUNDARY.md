# Architect Execution Boundary

Default:

`ARCHITECT_REPOSITORY_MODE = READ_ONLY`

## Architect

May:
- read repository/Git/evidence;
- design architecture;
- approve tasks;
- define risk/acceptance criteria;
- verify implementation;
- decide durable project state;
- generate executor/State Sync prompts.

Does not directly claim to:
- edit repository files;
- commit;
- push;
- mutate Ledger.

## Implementation Executor

May:
- persist exact Architect-approved task;
- READY → IN_PROGRESS → IMPLEMENTED;
- change product code only within scope;
- run tests;
- create commits/evidence;
- push when authorized.

May not decide VERIFIED.

## State Sync Writer

Persists an already-made Architect decision.

May modify only explicitly authorized project-control files.

May record VERIFIED only from an explicit Architect decision.

Does not own the decision.

## Conflict

If repository state conflicts with the prompt:

- implementation → `TASK_BASE_CONFLICT` / `TASK_REGISTRATION_CONFLICT`
- State Sync → `STATE_SYNC_CONFLICT`

Stop instead of inventing a reconciliation.
