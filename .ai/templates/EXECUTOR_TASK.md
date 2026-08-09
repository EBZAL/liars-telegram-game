# Executor Task

## MODE
`IMPLEMENTATION_MODE`

## EXECUTION INTENT
`NEW_TASK` / `RESUME_TASK`

## TASK ID
`<TASK-ID>`

## STAGE
`<STAGE-ID>`

## WORKFLOW PROFILE
`LIGHT` / `STANDARD` / `STRICT`

## OBJECTIVE
<one primary objective>

## EXPECTED BASE
Branch: `<branch>`  
HEAD: `<sha>`

If materially different:

`TASK_BASE_CONFLICT`

## REQUIRED PRE-READ

Read only:

- `.ai/EXECUTOR_RUNTIME.md`
- this task prompt
- `MUST_READ`

Do not bulk-read Architect/project-control context.

## CONTEXT CAPSULE

### VERIFIED_CONTEXT
-

### ARCHITECTURE_CONSTRAINTS
-

### SECURITY_CONSTRAINTS
-

### DEPENDENCIES
-

### MUST_READ
- `path` — exact symbol/section/purpose

### OPTIONAL_IF_NEEDED
- `path` — reason

### DO_NOT_BULK_READ
- full repository
- full `.ai/`
- Project/Roadmap history
- unrelated ADRs/Skills
- giant logs

## SCOPE
-

## DO NOT CHANGE
-

## ACCEPTANCE CRITERIA
- [ ] ...

## VERIFICATION COMMANDS / CHECKS
1. ...

## APPROVED GATES

Consistency: PASS  
Risk Gate: N/A / PASS

## STOP CONDITIONS

Use:
- `TASK_BASE_CONFLICT`
- `TASK_REGISTRATION_CONFLICT`
- `WORKTREE_NOT_CLEAN`
- `SECRET_EXPOSURE_RISK`
- `ARCHITECTURE_CHANGE_REQUIRED`
- `BLOCKED`

## STATE

Executor may persist:

```text
READY → IN_PROGRESS → IMPLEMENTED
```

Never decide VERIFIED.

## GIT COMPLETION

For NEW_TASK:
1. persist exact approved Task;
2. READY → IN_PROGRESS;
3. task-start state commit;
4. implementation + tests;
5. implementation commit;
6. concise Evidence;
7. Ledger → IMPLEMENTED;
8. Evidence/state commit;
9. non-force push when authorized.

For RESUME_TASK:
- same Task ID must already be IN_PROGRESS;
- Architect must explicitly authorize resume.

## REPORT

Return:
- Task ID / profile / outcome
- branch + starting HEAD
- worktree safety
- task-start commit
- implementation commit
- Evidence/state commit
- files changed
- context expanded YES/NO + reason
- checks/results
- acceptance criteria
- unresolved issues
- push status
- recommended Architect action

Do not claim VERIFIED.
