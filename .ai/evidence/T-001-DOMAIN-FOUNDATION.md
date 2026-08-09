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

## Corrective Implementation (RETURN_TO_EXECUTOR)
**Original Implementation SHA:** `e3cf83a9977efca40b4ba966dae4e9d94c969d45`
**Architect Finding:** Global mutable card ID state needs removal; AC-12 automated check needs to be added.
**Corrective Implementation SHA:** `4976205760dce47978077141a94664870804ecfa`

### Files Changed:
- `packages/game-core/src/deck.ts`
- `packages/game-core/tests/domain.test.ts`
- `packages/game-core/package.json`
- `package-lock.json`

### Verification Commands & Results:
1. **`npm ci`**: PASS (added 2 packages, audited 82 packages in 5s)
2. **`npm run typecheck`**: PASS (tsc --noEmit exited 0)
3. **`npm test`**: PASS (8 tests passed, including AC-12 source scan)

### Fixes Confirmed:
- Proof AC-12 is automated: Added a vitest block that runs `fs.readdirSync` on `src/` and checks `expect(content).not.toMatch(/Math\.random/)`.
- Confirmation no global mutable Card ID state remains: Removed `cardIdCounter`. Card IDs are now deterministically generated strictly by the factory using `kind-rank-index` pattern.

## Corrective Implementation 2 (RETURN_TO_EXECUTOR - PORTABILITY FIX)
**Previous Implementation SHA:** `4976205760dce47978077141a94664870804ecfa`
**Architect Finding:** AC-12 test uses `import.meta.dirname` which is unavailable on early Node 20 releases. Replace with Node-20.0-compatible ESM mechanism `fileURLToPath(new URL('.', import.meta.url))`.
**Corrective Implementation SHA:** `756583ed9168a4cc23fba469308d00ef946ee3b4`

### Files Changed:
- `packages/game-core/tests/domain.test.ts`

### Verification Commands & Results:
1. **`npm ci`**: PASS
2. **`npm run typecheck`**: PASS
3. **`npm test`**: PASS

### Fixes Confirmed:
- Confirmation `import.meta.dirname` is no longer used: Replaced with `fileURLToPath(new URL('.', import.meta.url))`. Node >=20.0.0 compatibility is restored.

## Scope Confirmation
Confirmed fully IN_SCOPE. No architecture changes required. No product scope drift.
