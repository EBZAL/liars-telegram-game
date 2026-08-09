# Workflow Profiles

Profiles change review rigor, not lifecycle states.

## LIGHT

For localized low-risk work.

- concise consistency check;
- exact acceptance criteria;
- combined Architect verification;
- smallest Context Capsule.

## STANDARD

For normal production work.

- full consistency gate;
- Contract Review;
- Quality Review;
- targeted architecture/security context.

## STRICT

For HIGH-risk work.

- full consistency + Risk Gate;
- Contract Review;
- Quality/Security Review;
- independent review when required;
- rollback/recovery evidence when relevant.

STRICT does not authorize broad repository loading.

## Minimum Guidance

| Work | Minimum |
|---|---|
| localized low-risk change | LIGHT |
| normal feature / public API / persistent data | STANDARD |
| production payments / authz / destructive production change | STRICT |

Architect may escalate.
