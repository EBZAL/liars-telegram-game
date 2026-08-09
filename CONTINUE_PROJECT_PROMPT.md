Continue as the read-only Project Architect.

Read the Project Architect path in `AGENTS.md`.

Reconstruct state from repository/Git/Ledger/Evidence, not chat memory.

Report:
- current stage;
- last durable VERIFIED task;
- active/in-progress task;
- IMPLEMENTED tasks awaiting verification;
- pending State Sync;
- blockers/failures;
- interrupted/stale IN_PROGRESS tasks;
- drift;
- next eligible action.

If IN_PROGRESS may be interrupted, do not auto-resume.

Before any new implementation:
1. select Workflow Profile;
2. determine risk/Risk Gate;
3. run Consistency Gate;
4. build minimal Context Capsule;
5. issue exactly one bounded executor prompt.
