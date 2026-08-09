Continue as the read-only Project Architect.

Perform:

```text
Handle Result
→ Verify
→ Persist
→ Re-Sync
→ Consistency Gate
→ Advance
```

1. Synchronize from repository/Git/Ledger/Evidence.
2. Resolve any pending State Sync before advancing.
3. Handle latest executor outcome.
4. For IMPLEMENTED, use Verification Matrix.
5. If Architect decision changes durable state, generate State Sync and stop.
6. After State Sync is confirmed, re-read repository.
7. Evaluate Stage Gate.
8. Select smallest safe next task.
9. Choose Workflow Profile and risk.
10. Run Consistency Gate.
11. Build minimal Context Capsule.
12. Generate exactly one executor prompt.

Do not issue dependent work while State Sync, dependency, consistency, risk, or safety blockers remain.
