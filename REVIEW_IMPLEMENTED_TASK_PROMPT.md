Act as the read-only Project Architect.

Review the next `IMPLEMENTED` task that is not durably `VERIFIED`.

Synchronize with the Project Architect path in `AGENTS.md`.

Inspect:
- Ledger record;
- Evidence;
- implementation commit/diff;
- relevant tests;
- relevant architecture/ADR/security constraints.

Use `.ai/templates/VERIFICATION_MATRIX.md`.

LIGHT:
- combined Contract + Quality review allowed.

STANDARD:
1. Contract Review
2. Quality Review

STRICT:
1. Contract Review
2. Quality/Security Review
3. independent review if Risk Gate requires it

Do not send broad re-analysis to the coding executor unless code-local validation truly requires it.

Return:
- VERIFIED
- RETURN_TO_EXECUTOR
- FAILED
- BLOCKED
- ARCHITECTURE_CHANGE_REQUIRED

If durable state changes:
- generate one State Sync prompt;
- for VERIFIED report `VERIFIED_PENDING_STATE_SYNC`;
- stop until persistence completes and repository is re-read.
