# Evidence: T-012-TWO-PLAYER-FLOW-HARDENING

**Task ID:** `T-012-TWO-PLAYER-FLOW-HARDENING`  
**Implementation Commit SHA:** `7f90608`  
**Task Remained Test-Only:** YES  
**Discovered Product Defects:** NONE  

---

## 1. 2-Player Flow Verification Summary

The dedicated 2-player flow hardening test suite in `packages/game-core/tests/two-player-flow.test.ts` was strengthened to use canonical 20-card pre-final fixtures and explicit scenario-level assertions across all heads-up branches. All tests pass against the verified Core engine.

Key verified behaviors:
- **Initialization & Partition:** Real 2-player initialization (`initializeMatch(['A', 'B'], rng)`) deals exactly 5 cards to Player A, 5 cards to Player B, and leaves 10 undealt cards. Full 20-card canonical deck partition (6 KING, 6 QUEEN, 6 ACE, 2 JOKER) with 20 unique card IDs verified.
- **Canonical Pre-Final Fixtures:** All four matrix branches, empty-hand non-win, forced-call identity, final-card timeout, `__proto__` forced path, and FINISHED-state producer tests use `createCanonicalTwoPlayerFinalCardState(...)`. This helper enforces full canonical card conservation before test execution:
  - Total 20 cards conserved: 6 KING, 6 QUEEN, 6 ACE, 2 JOKER. All 20 IDs unique.
  - Hands: 1 card (A) + 1 card (B).
  - `centralPile`: 8 already-played cards.
  - `undealtCards`: 10 remaining deck cards.
  - `previousPlay`: coherent unresolved Play owned by opponent, referencing a card in `centralPile`.
- **Ordinary Turn Alternation:** Turns alternate cyclically via `applyPlayCardsCommand` when both players hold cards.
- **Empty Hand Non-Win:** Emptying a hand alone never triggers a victory condition. Outcome derives strictly from Roulette elimination.
- **Automatic Forced CALL:** Playing one's final card automatically forces the opponent to CALL_LIAR targeting the newly-created Play.
- **Four Truth/Lie × Blank/Lethal Matrix Branches (Canonical 20-Card Fixtures):**
  1. *Truth + Blank:* Caller loses challenge and shoots BLANK. Shooter revolver index advances by 1. Surviving loser (caller) starts next Round. Both players dealt fresh 5-card hands, 10 undealt cards. Post-reset composition verified (5+5+10 = 20 unique cards, 6K/6Q/6A/2J).
  2. *Lie + Blank:* Accused loses challenge and shoots BLANK. Shooter revolver index advances by 1. Surviving loser (accused) starts next Round. Both players dealt fresh 5-card hands, 10 undealt cards.
  3. *Truth + Lethal:* Caller loses challenge and shoots LETHAL. Caller is ELIMINATED. Accused wins. Match status becomes FINISHED. No next Round deal or RNG consumed.
  4. *Lie + Lethal:* Accused loses challenge and shoots LETHAL. Accused is ELIMINATED. Caller wins. Match status becomes FINISHED. No next Round deal or RNG consumed.
- **Starter Rule:** Surviving round loser starts the next Round.
- **Cross-Round Same-Player Shot Progression:** Player B loses in Round 1 (shoots index 0 -> nextIndex 1, BLANK, new Round starts). Player B loses again in Round 2 through canonical command flow (shoots index 1 -> nextIndex 2, BLANK). Revolver sequence remains unchanged across both Rounds.
- **Play ID Continuity:** `playSequence` increments monotonically across Round boundaries.
- **FINISHED Guards:** `applyPlayCardsCommand` and `applySystemTimeout` reject cleanly when called on a FINISHED match state before consuming RNG.
- **SYSTEM_TIMEOUT Integration:** Ordinary timeout auto-plays 1 card without CALL when player holds >1 cards. Final-card timeout auto-plays the card and triggers forced CALL automatically.
- **Metadata Retention:** `createdPlay`, `forcedCall.challenge`, `forcedCall.shot`, `terminal`, and `winnerId` remain available after Round reset or Match win.
- **Forced Final-Card Input Immutability:** Passing a canonical pre-final state into `applyPlayCardsCommand` leaves the source `MatchState` completely untouched (`players`, `hands`, `centralPile`, `undealtCards`, `previousPlay`, `revolvers`, `round`, `winnerId/status`).
- **Forced Terminal Determinism:** Executing `applyPlayCardsCommand` on two independently constructed equivalent canonical pre-final states with identical RNG behavior produces deep-equal command results (MATCH_WON, FINISHED).
- **Prototype Safety:** `__proto__` functions cleanly as a `PlayerId` with `Object.getPrototypeOf(players) === null`.

---

## 2. Acceptance Criteria Mapping

| Criteria | Status | Verification Detail |
|---|---|---|
| AC-01: Dedicated 2-player scenario suite exists | PASS | `packages/game-core/tests/two-player-flow.test.ts` |
| AC-02: Real 2-player initialization deals 5/5 with 10 undealt | PASS | `initializeMatch(['A', 'B'], rng)` verified |
| AC-03: Full 20-card unique canonical partition verified | PASS | 6K+6Q+6A+2J, 20 unique IDs verified |
| AC-04: Ordinary 1v1 turns alternate through command API | PASS | Verified alternation via `applyPlayCardsCommand` |
| AC-05: Empty Hand alone never wins | PASS | Verified empty hand triggers forced CALL, not win |
| AC-06: Final-card PLAY automatically forces opponent CALL | PASS | `forcedCall` populated automatically |
| AC-07: Forced CALL targets newly-created final Play | PASS | `challenge.playId === createdPlay.playId` verified |
| AC-08: Truthful final Play makes caller loser/shooter | PASS | Verified in Truth+Blank and Truth+Lethal tests |
| AC-09: Lying final Play makes accused loser/shooter | PASS | Verified in Lie+Blank and Lie+Lethal tests |
| AC-10: Truth+Blank branch verified | PASS | `terminal === 'NEXT_ROUND'`, shooter = caller (canonical 20-card fixture) |
| AC-11: Lie+Blank branch verified | PASS | `terminal === 'NEXT_ROUND'`, shooter = accused (canonical 20-card fixture) |
| AC-12: Truth+Lethal branch verified | PASS | `terminal === 'MATCH_WON'`, winner = accused (canonical 20-card fixture) |
| AC-13: Lie+Lethal branch verified | PASS | `terminal === 'MATCH_WON'`, winner = caller (canonical 20-card fixture) |
| AC-14: Blank advances shot index exactly once | PASS | `nextShotIndex === prior + 1` verified |
| AC-15: Surviving loser starts next Round | PASS | Verified in both Truth+Blank and Lie+Blank |
| AC-16: Both Living Players receive 5 fresh Cards next Round | PASS | 5 cards each dealt in new round |
| AC-17: New Round has 10 undealt Cards | PASS | `undealtCards.length === 10` verified |
| AC-18: Round-reset full deck conservation verified | PASS | 5+5+10 = 20 unique cards conserved |
| AC-19: Revolver sequences persist across Round reset | PASS | Revolver sequence & index preserved |
| AC-20: Shooter index persists advanced; non-shooter unchanged | PASS | Shooter index +1, non-shooter +0 verified |
| AC-21: Revolver progression survives at least one Round boundary | PASS | Player B loses in Round 1 (index 0->1) and again in Round 2 (index 1->2) |
| AC-22: Play identity remains monotonic across Round boundary | PASS | `playSequence` monotonic across round reset |
| AC-23: Lethal leaves exactly one Living Player and FINISHES Match | PASS | `status = 'FINISHED'`, `winnerId` set |
| AC-24: Winner branch creates no new Round | PASS | `roundNumber` unchanged, no deal |
| AC-25: Winner branch consumes no next-Round RNG | PASS | Verified via `ThrowingRandom` |
| AC-26: Winner branch performs no Round reset or fresh deal | PASS | The eliminated Player receives no new Hand |
| AC-27: FINISHED state rejects subsequent PLAY command | PASS | Throws `Match is already FINISHED` |
| AC-28: FINISHED state rejects SYSTEM_TIMEOUT before RNG | PASS | Throws before RNG call |
| AC-29: Ordinary 1v1 SYSTEM_TIMEOUT one-card PLAY verified | PASS | Auto-plays 1 card, advances turn |
| AC-30: Final-card 1v1 SYSTEM_TIMEOUT integrates forced CALL | PASS | Triggers forced CALL automatically |
| AC-31: Metadata survives Round reset / winner branches | PASS | Metadata snapshots intact after reset/win |
| AC-32: Exactly one PLAY, Challenge and Shot on forced branch | PASS | Single play, challenge, shot execution |
| AC-33: Representative input immutability verified | PASS | Source MatchState unmutated across normal PLAY, forced final PLAY, and SYSTEM_TIMEOUT |
| AC-34: Deterministic scenario equivalence verified | PASS | Ordinary flow and forced terminal flow produce deep-equal results for identical seeds |
| AC-35: `__proto__` Player ID regression verified | PASS | `__proto__` handled cleanly as PlayerId |
| AC-36: No new rule / Room / projection / UI-selection scope | PASS | Strictly test hardening within `packages/game-core` |
| AC-37: No forbidden nondeterminism or dependency added | PASS | Only injected `RandomSource` used |
| AC-38: Full existing regression suite passes | PASS | All 11 existing test files PASS |
| AC-39: `npm ci` / `typecheck` / `test` PASS | PASS | All commands exit 0 |
| AC-40: Evidence accurately maps all ACs and defect status | PASS | Documented in this file |

---

## 3. Verification Command Output

- `npm ci`: PASS (0 vulnerabilities, 0 tracked files modified)
- `npm run typecheck`: PASS (0 errors)
- `npm test`: PASS (204 tests passed across 12 test files)
