# Skill: Security Review

Use for:
- auth;
- authorization;
- payments;
- secrets;
- public APIs;
- uploads;
- destructive actions;
- infrastructure;
- sensitive data.

Review:
1. authentication
2. authorization
3. least privilege
4. secret handling
5. validation
6. injection
7. sensitive logging
8. network exposure
9. abuse/rate limiting
10. dependency risk
11. unsafe defaults
12. approval requirements
13. regression tests

Principles:
- prompts are not security boundaries;
- never weaken security to pass tests;
- never expose secrets in evidence.

Output:
- PASS
- PASS_WITH_REQUIRED_FIXES
- FAIL
- SECURITY_ARCHITECTURE_CHANGE_REQUIRED
