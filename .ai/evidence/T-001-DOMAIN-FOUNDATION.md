# T-001-DOMAIN-FOUNDATION Evidence

**Implementation Commit:** `e3cf83a9977efca40b4ba966dae4e9d94c969d45`

## Files Changed/Created
- `.gitignore` (new)
- `package.json` (new)
- `package-lock.json` (new)
- `packages/game-core/package.json` (new)
- `packages/game-core/tsconfig.json` (new)
- `packages/game-core/src/index.ts` (new)
- `packages/game-core/src/cards.ts` (new)
- `packages/game-core/src/deck.ts` (new)
- `packages/game-core/src/player-count.ts` (new)
- `packages/game-core/src/revolver.ts` (new)
- `packages/game-core/src/randomness.ts` (new)
- `packages/game-core/tests/domain.test.ts` (new)

## Verification Commands & Results

1. **`npm ci`**:
   - Result: `added 78 packages, and audited 80 packages in 3s`
2. **`npm run typecheck`**:
   - Result: Success, no errors (`tsc --noEmit` exited 0)
3. **`npm test`**:
   - Result: `Test Files  1 passed (1)` / `Tests  7 passed (7)`
4. **No direct `Math.random` in production**:
   - Result: `grep_search` found 0 occurrences in `packages/game-core/*.ts`.

## Acceptance Criteria Result
- AC-01: Minimal npm workspace with lockfile/gitignore: **PASS**
- AC-02: `packages/game-core` TS package / ESM / strict: **PASS**
- AC-03: No React/Telegram/CF/network deps: **PASS**
- AC-04: Canonical CardRank/Card primitives: **PASS**
- AC-05: Liar Deck factory 20 cards (6K/6Q/6A/2J): **PASS**
- AC-06: Independent mutable containers: **PASS**
- AC-07: Table Deck factory (1K/1Q/1A): **PASS**
- AC-08: PlayerCount 2,3,4: **PASS**
- AC-09: Base Revolver 1 LETHAL, 5 BLANK: **PASS**
- AC-10: Injected RandomSource: **PASS**
- AC-11: Copy-based deterministic shuffle: **PASS**
- AC-12: No `Math.random()`: **PASS**
- AC-13: Automated tests for AC-04-12: **PASS**
- AC-14: `npm ci` succeeds: **PASS**
- AC-15: TS typecheck passes: **PASS**
- AC-16: Automated tests non-watch pass: **PASS**
- AC-17: No forbidden behavior: **PASS**
- AC-18: Architecture/project files unmodified: **PASS**

**OVERALL:** PASS

## Known Limitations
- Revolver does not yet have shot logic (explicitly deferred by task constraints).
- Deck cards ID sequence uses an internal process-lifetime incrementor which is deterministic per factory session, sufficient for this foundation layer but could be revised if the engine needs globally stable ids across matches later (not required by canonical rules currently).

## Scope Confirmation
Confirmed fully IN_SCOPE. No architecture changes required. No product scope drift.
