# Pre-Execution Consistency Gate

Task: `<TASK-ID>`  
Workflow Profile: LIGHT / STANDARD / STRICT  
Owner: Architect

This gate adds no lifecycle state.

| Check | Result |
|---|---|
| Project/product alignment | PASS / FAIL |
| Architecture boundaries | PASS / FAIL |
| Relevant ADRs | PASS / FAIL / N/A |
| Dependencies | PASS / FAIL |
| Scope | PASS / FAIL |
| Acceptance criteria | PASS / FAIL |
| Risk / Risk Gate | PASS / FAIL / N/A |
| Verification method | PASS / FAIL |
| Context Capsule completeness | PASS / FAIL |

Token check:
- broad analysis completed by Architect;
- MUST_READ is targeted;
- no full-repo/full-.ai read requested without justification;
- architecture/security constraints summarized for executor.

Decision:

`PASS` / `FAIL`

Only PASS allows Architect to approve READY eligibility.
