# Task Ledger Schema

Schema version: 1.0  
AI Architect OS: v0.6.0

Recommended shape:

```yaml
schema_version: "1.0"
architect_os_version: "0.6.0"

project_status: ACTIVE
current_stage: STAGE-01
last_verified_task: CORE-003
active_task: CORE-004

stages:
  STAGE-01:
    title: Foundation
    status: IN_PROGRESS
    required_tasks:
      - CORE-001
      - CORE-002
      - CORE-003
      - CORE-004
    exit_gate:
      status: NOT_EVALUATED
      evidence: []

tasks:
  CORE-004:
    title: Add persistence layer
    stage: STAGE-01
    status: IMPLEMENTED
    risk: MEDIUM
    workflow_profile: STANDARD

    pre_execution_consistency:
      status: PASS
      checked_by: architect

    risk_gate:
      status: APPROVED_WITH_CONTROLS
      required_controls:
        - integration tests
        - rollback considered
      required_reviewers: []

    depends_on:
      - CORE-003

    acceptance_criteria:
      - migration applies successfully
      - existing records remain readable
      - integration test passes

    architecture_refs:
      - .ai/ARCHITECTURE.md

    adr_refs:
      - .ai/decisions/ADR-003-database.md

    skill_refs:
      - .ai/skills/architecture-review.md

    executor: antigravity

    task_start_commit: "def5678"
    implementation_commit: "abc1234"
    evidence_file: ".ai/evidence/CORE-004.md"

    unresolved_issues: []

    architect_verification:
      result: NOT_REVIEWED
      verified_commit: null
      verified_at: null
      checks: []
```

## Rules

- Task IDs are immutable.
- The Architect approves task content and READY eligibility.
- The repository writer persists READY.
- Only the Architect decides VERIFIED.
- Gravity persists VERIFIED through State Sync.
- `implementation_commit` points to the code implementation SHA.
- `.ai/CURRENT_STATE.md` summarizes but does not replace the Ledger.
- Required dependencies must normally be durably VERIFIED before dependent tasks become eligible.
- Required Risk Gate approval must be persisted with the task.


## Recovery Metadata

When available, a task record may also include:

```yaml
task_start_commit: "<sha>"
```

This points to the durable state commit that registered/moved the task to `IN_PROGRESS`.

A durably `IN_PROGRESS` task must not be silently restarted; Architect resume authorization is required.


## v0.5 Optional Verification Metadata

These fields do not add lifecycle states:

```yaml
workflow_profile: STANDARD

pre_execution_consistency:
  status: PASS
  checked_by: architect

verification_basis:
  implementation_commit: "abc1234"
  evidence_state_commit: "def5678"
  relevant_paths: []
  relevant_tests: []

verification_matrix:
  completeness: PASS
  correctness: PASS
  scope: PASS
  coherence: PASS
  security_risk: PASS
  evidence_validity: PASS
  regression_impact: NONE
```

`workflow_profile`, consistency, and verification fields are metadata only.

They must never replace or expand the canonical task state machine.
