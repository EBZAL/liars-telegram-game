# Risk Gate — <TASK-ID>

Version: 0.6.0
Owner: Project Architect

Use when a task is MEDIUM/HIGH risk, or whenever explicit risk controls are useful.

## Task

Task ID: `<TASK-ID>`  
Stage: `<STAGE-ID>`  
Risk Level: LOW / MEDIUM / HIGH

## Workflow Profile

Selected profile: LIGHT / STANDARD / STRICT

HIGH risk normally requires STRICT.

Risk level increases verification rigor; it does not automatically authorize broad executor context.

## Risk Drivers

- [ ] Authentication
- [ ] Authorization
- [ ] Payments / financial state
- [ ] Secrets / credentials
- [ ] Sensitive or personal data
- [ ] Public API / internet exposure
- [ ] File upload / untrusted content
- [ ] Persistent data mutation
- [ ] Database migration
- [ ] Destructive operation
- [ ] Infrastructure / deployment change
- [ ] Production environment
- [ ] External dependency / third-party API
- [ ] Security boundary change
- [ ] Architecture boundary change
- [ ] Other: __________

## Potential Failure Impact
-

## Required Controls

### LOW
- [ ] bounded scope
- [ ] acceptance criteria
- [ ] normal task verification

### MEDIUM
- [ ] explicit acceptance criteria
- [ ] relevant integration/regression tests
- [ ] relevant security checks
- [ ] rollback/recovery considered
- [ ] Architect verification

### HIGH
- [ ] architecture review
- [ ] security review
- [ ] least-privilege check
- [ ] explicit destructive-action approval if relevant
- [ ] deterministic integration/E2E verification
- [ ] rollback plan
- [ ] independent reviewer when practical
- [ ] Architect final verification

The Architect may adjust controls when justified and must record the reason.

## Required Skills / Reviewers

- Skills:
  - ...
- Independent reviewer required: YES / NO
- Security reviewer required: YES / NO
- UI reviewer required: YES / NO

## Approval Decision

- `APPROVED_FOR_EXECUTION`
- `APPROVED_WITH_CONTROLS`
- `BLOCKED_PENDING_DECISION`
- `REJECTED`
- `ARCHITECTURE_CHANGE_REQUIRED`

## Conditions / Notes
-

## Persistence Rule

The read-only Architect does not save this file as a per-task record.

The approved Risk Gate must be copied into the approved executor task and persisted by the repository writer inside that task's `.ai/TASK_LEDGER.yaml` record under `risk_gate`.

A task requiring a Risk Gate must not enter `READY` while its gate is unresolved.

## Architect Record

Decision by: Project Architect  
Date: YYYY-MM-DD  
Related ADRs: -
