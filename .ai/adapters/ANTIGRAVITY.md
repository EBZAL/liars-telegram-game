# Antigravity / Gravity Adapter

Use the Implementation Executor path in `AGENTS.md`.

Start with:
- `.ai/EXECUTOR_RUNTIME.md`
- current Task Context Capsule
- task MUST_READ files/tests

Do not bulk-read the Architect control plane.

IMPLEMENTATION_MODE:
- exact approved task;
- READY → IN_PROGRESS;
- task-start state commit;
- scoped implementation/tests;
- implementation commit;
- concise Evidence;
- Ledger → IMPLEMENTED;
- Evidence/state commit;
- non-force push when authorized.

STATE_SYNC_MODE:
- persist only the Architect decision;
- modify only authorized project-control files;
- reconcile state;
- commit/push.

Never decide VERIFIED.

Resume existing IN_PROGRESS only with explicit `RESUME_TASK`.
