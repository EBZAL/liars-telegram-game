# T-009-CALL-LIAR-MATCH-TRANSITION Evidence

**Task ID**: T-009-CALL-LIAR-MATCH-TRANSITION
**Implementation Commit**: 70ae9302a11a1a2bdcce084f38901d610f17793a

## Files Changed
- `packages/game-core/src/game-state.ts`
- `packages/game-core/src/play-transition.ts`
- `packages/game-core/src/challenge-rules.ts`
- `packages/game-core/src/round-transition.ts`
- `packages/game-core/src/call-liar-transition.ts` (created)
- `packages/game-core/src/index.ts`
- `packages/game-core/tests/call-liar-transition.test.ts` (created)

## Contract & Core Integration Mechanics
- **MatchStatus Contract**: Introduced `export type MatchStatus = 'IN_PROGRESS' | 'FINISHED'` in `game-state.ts` and updated `MatchState.status`.
- **Stateful CALL Transition (`applyCallLiar`)**: Atomically composes `resolveLiarChallenge`, `resolved` previousPlay lifecycle, `resolveRouletteShot`, post-Shot living derivation, and `initializeNextRound` (or T26 `MATCH_WON` terminal).
- **Challenge Resolver Reuse**: Reuses `resolveLiarChallenge` for caller authority, turn legality, and truth/lie evaluation. Derive shooter as `challenge.shooterId` (Lie -> accused; Truth -> caller).
- **Resolved PreviousPlay Lifecycle**: Sets `previousPlay.resolved = true` on intermediate post-Shot MatchState.
- **Roulette Resolver Reuse**: Reuses `resolveRouletteShot` for the shooter. Advances `nextShotIndex` by 1 and derives `ALIVE` (BLANK) or `ELIMINATED` (LETHAL) status.
- **Continuing Match Branch (>= 2 Living)**: Returns `terminal = 'NEXT_ROUND'` and invokes `initializeNextRound(postShotState, challenge.roundLoserId, random)`. Preserves T20 surviving-loser starter, T21 eliminated-loser cyclic fallback starter, T22 safe-empty return, fresh 20-card dealing, and persistent Revolver state.
- **T26 Immediate Match Winner (1 Living)**: Returns `terminal = 'MATCH_WON'`, `status = 'FINISHED'`, and sets `winnerId` to the sole ALIVE player. No next Round is initialized, no fresh deal occurs, and no next-round RNG is consumed (verified via `ThrowingRandom`).
- **FINISHED State Guards**: `applyPlayCards`, `resolveLiarChallenge`, `initializeNextRound`, and `applyCallLiar` all reject if `state.status !== 'IN_PROGRESS'` or `state.winnerId !== null`.
- **Forced-Caller Compatibility**: Verified full stateful CALL execution for 1v1 forced caller and 3-player single-card-holder forced caller.
- **Detached Metadata**: Transition result exposes detached `challenge` resolution and scalar `shot` summary (`playerId`, `shotIndex`, `outcome`, `nextShotIndex`, `eliminated`) without exposing mutable aliases to authoritative PlayerState.

## Bounded Scope Confirmation
PLAY_CARDS does NOT yet automatically dispatch a forced CALL_LIAR. T13/T14 automatic post-PLAY forced-call orchestration is not claimed complete by T-009. SYSTEM_TIMEOUT is not implemented. T29/T30/T31 remain unimplemented. Room MATCH_FINISHED lifecycle is not implemented. Networking/persistence/projection/events remain outside this task.

## Verification Commands & Results
- `npm ci`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS (152 total tests across 9 test files, 15 new focused tests for call-liar-transition)
- No new dependencies added.
- No forbidden nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID`) used.

## Acceptance Criteria Results
- AC-01 PASS — MatchStatus supports IN_PROGRESS and FINISHED.
- AC-02 PASS — Stateful applyCallLiar transition implemented.
- AC-03 PASS — Caller provides no target/accused/truth/loser/shooter/outcome/winner authority.
- AC-04 PASS — Active Match required; FINISHED match rejects applyCallLiar.
- AC-05 PASS — IN_PROGRESS CALL requires winnerId == null.
- AC-06 PASS — At least 2 ALIVE players required before CALL.
- AC-07 PASS — Reuses verified resolveLiarChallenge for legality and challenge result.
- AC-08 PASS — Atomically marks previousPlay.resolved = true.
- AC-09 PASS — Shooter equals challenge.shooterId / roundLoserId.
- AC-10 PASS — Reuses verified resolveRouletteShot for shooter.
- AC-11 PASS — Exactly one Shot consumed per CALL.
- AC-12 PASS — Prototype-safe shooter update in players dictionary.
- AC-13 PASS — Post-Shot Living count derived solely from lifeStatus === 'ALIVE'.
- AC-14 PASS — >= 2 Living routes to initializeNextRound.
- AC-15 PASS — T15 integrated: Lie -> accused shoots.
- AC-16 PASS — T16 integrated: Truth -> caller shoots.
- AC-17 PASS — T17 integrated: BLANK keeps shooter ALIVE and advances nextShotIndex.
- AC-18 PASS — T20 integrated: Surviving round loser starts next Round.
- AC-19 PASS — T18 integrated: LETHAL eliminates shooter.
- AC-20 PASS — T21 integrated: Eliminated loser falls forward to next ALIVE starter seat.
- AC-21 PASS — T26 integrated: Exactly 1 Living player after Shot immediately wins Match.
- AC-22 PASS — T26 status returns FINISHED.
- AC-23 PASS — T26 winnerId equals sole ALIVE player.
- AC-24 PASS — Winning transition does not create or deal a new Round.
- AC-25 PASS — Winning transition does not consume next-round RNG.
- AC-26 PASS — FINISHED state invariant: winnerId != null and exactly 1 ALIVE player.
- AC-27 PASS — IN_PROGRESS state invariant: winnerId == null and >= 2 ALIVE players.
- AC-28 PASS — Revealed challenge cards remain detached snapshots.
- AC-29 PASS — Shot summary exposes scalar result without authoritative Player alias.
- AC-30 PASS — Challenge & Shot metadata remain available on transition result even after Round Reset clears previousPlay.
- AC-31 PASS — Forced 1v1 caller compatibility verified.
- AC-32 PASS — Forced 3-player single-card-holder caller compatibility verified.
- AC-33 PASS — No claim of automatic post-PLAY CALL dispatch.
- AC-34 PASS — First-turn CALL (previousPlay == null) rejected.
- AC-35 PASS — Out-of-turn caller rejected.
- AC-36 PASS — Resolved previousPlay cannot be challenged again.
- AC-37 PASS — Illegal CALL causes no Shot or RNG consumption.
- AC-38 PASS — FINISHED Match rejects applyPlayCards.
- AC-39 PASS — FINISHED Match rejects resolveLiarChallenge.
- AC-40 PASS — FINISHED Match rejects initializeNextRound.
- AC-41 PASS — FINISHED Match rejects applyCallLiar.
- AC-42 PASS — Input MatchState and nested containers remain unmutated.
- AC-43 PASS — Revolver correctness retained (no reshuffle/reset/double-consumption).
- AC-44 PASS — Next-Round semantics (T20/T21/T22/T28/partitions) retained on continuing branch.
- AC-45 PASS — Winner branch preserves final Round state with resolved previousPlay.
- AC-46 PASS — Deterministic output for equivalent input.
- AC-47 PASS — No forbidden nondeterminism or dependency changes.
- AC-48 PASS — Prior Core regression suite (T-001..T-008) passes cleanly.
- AC-49 PASS — npm ci, typecheck, and test all pass.
- AC-50 PASS — Bounded scope: no timeout, networking, persistence, Room lifecycle, Telegram or UI.
- AC-51 PASS — Evidence explicitly accounts for AC-01 through AC-52.
- AC-52 PASS — Control files updated per normal Ledger/Evidence lifecycle only.
