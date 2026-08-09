# Architect Verification Matrix

Task: `<TASK-ID>`  
Workflow Profile: LIGHT / STANDARD / STRICT

## Contract Review

Completeness: PASS / FAIL  
Correctness: PASS / FAIL  
Scope Compliance: PASS / FAIL

Evidence:
-

## Quality Review

Coherence: PASS / FAIL  
Security / Risk Controls: PASS / FAIL / N/A  
Evidence Validity: PASS / FAIL  
Regression Impact: NONE / COVERED / GAP

Evidence:
-

## Evidence Freshness

Record:
- implementation commit;
- Evidence/state commit;
- relevant paths/tests.

Do not invalidate prior VERIFIED tasks merely because HEAD changed.

If this task affects a prior verified behavior/invariant, require regression evidence in this task.

## Architect Decision

- VERIFIED
- RETURN_TO_EXECUTOR
- FAILED
- BLOCKED
- ARCHITECTURE_CHANGE_REQUIRED
