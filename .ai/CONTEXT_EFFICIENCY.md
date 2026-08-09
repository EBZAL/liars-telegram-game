# Context Efficiency

Goal: spend coding-agent tokens on implementation uncertainty, not repeated project history.

## Architect

The Architect performs broad:
- repository understanding;
- architecture/dependency analysis;
- consistency checking;
- risk reasoning;
- regression analysis;
- verification.

## Coding Executor

The executor receives a concise Context Capsule:

```text
WORKFLOW_PROFILE
TASK_ID
OBJECTIVE
VERIFIED_CONTEXT
ARCHITECTURE_CONSTRAINTS
SECURITY_CONSTRAINTS
DEPENDENCIES
MUST_READ
OPTIONAL_IF_NEEDED
DO_NOT_BULK_READ
ACCEPTANCE_CRITERIA
VERIFICATION_COMMANDS
STOP_CONDITIONS
```

## Progressive Read

1. Search for the exact symbol/path when needed.
2. Read `MUST_READ`.
3. Follow only dependencies required to understand/change the task.
4. Expand context only for a concrete reason.

Do not duplicate broad Architect analysis in the executor prompt.

## Risk

STRICT means stronger verification, not automatic broad context.

Only directly relevant security/architecture material should expand executor context.

## Evidence

Record exact commands, concise results, relevant failures, and commit IDs.

Avoid full logs unless the failure itself requires them.
