---
title: 'Epic 8 retro item 9: one "Phase N is done" definition'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: 'b8b1d08ada1bbb1449ea366a0cc1c68ab3afaa9e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      An existing but unsigned decisions/PHASE-<n>-EXIT.md is ignored without a diagnostic, so a signing slip leaves after-phase entries off silently.
    evidence: |-
      activePhases and the pr head probe reduce exitSignatureProblems to a boolean. Settle by deciding whether codeowners --check and pr should report the problems; that is a new output surface beyond item 9.
    location: >-
      tools/protected-paths/protected-paths.ts:130
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Two definitions of "Phase N is done" coexist (finding L5, `_bmad-output/implementation-artifacts/epic-8-retro-2026-10-20.md`). `activePhases` (`tools/protected-paths/protected-paths.ts:121-135`), and through it `currentPhase` (`tools/conformance-report/report.ts:204-211`), the ratchet and the CODEOWNERS mirror, count Phase N done when `decisions/PHASE-<n>-EXIT.md` merely exists; the Phase 1 gate (`tools/ownership/phase-gate.ts:78-104`) also requires the Maintainer signature. An unsigned or malformed exit file therefore activates `after-phase:<n>` entries and advances the report's `phase` while the gate stays closed.

**Approach:** Make `exitSignatureProblems` the one test. `activePhases` counts Phase n only when its exit file exists and `exitSignatureProblems(text)` is empty; the `pr` command's head-mirror probe applies the same test to the head's exit-file content. `currentPhase` keeps calling `activePhases`. Update every comment and ops doc that states the old "exists" rule.

## Boundaries & Constraints

**Always:** One implementation: import `exitSignatureProblems` from `tools/ownership/phase-gate.ts`; never copy it. Keep the gate's own behaviour and messages unchanged. Update existing test fixtures that activated a Phase with an unsigned exit file to use a signed one (`SIGNED_EXIT` form), and add assertions that an unsigned exit file does not activate.

**Never:** No change to `conformance/expectations/**`, `tools/ownership/` logic, `.github/workflows/*.yml` logic, or the list's entries. No removed or weakened assertions. No new Test ID.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Signed exit | `decisions/PHASE-1-EXIT.md` with `decision: approved`, `decided_by: Maintainer`, a date and body text | `activePhases` has 1; `after-phase:1` entries protected; `currentPhase` passes 1 | No error |
| Unsigned exit | `PHASE-1-EXIT.md` = `# Phase 1 exit\n` | Phase 1 not active; `currentPhase` stays at 1 if 0 is signed | No error |
| Head probe, unsigned | head has an unsigned `PHASE-2-EXIT.md` | head mirror treats Phase 2 inactive (CODEOWNERS without `/docs/` mirrors) | No error |
| Probe failure | contents API 500 | fails closed as today | `Protected Paths check failed: …HTTP 500` |

</intent-contract>

## Code Map

- `tools/ownership/phase-gate.ts:78` -- `exitSignatureProblems(text)`, the single signature test; imports only `node:*` and `boost-framework/src/data` (no npm deps, so the no-install `protected-paths` workflow still runs). No cycle: phase-gate imports nothing from protected-paths.
- `tools/protected-paths/protected-paths.ts:121` -- `activePhases(root)`: change to read and test each `PHASE-<n>-EXIT.md`.
- `tools/protected-paths/protected-paths.ts:466-467` -- head probe: `exits[i] !== null` → also signed.
- `tools/protected-paths/protected-paths.ts:1-35` -- header comments stating "exists".
- `tools/conformance-report/report.ts:38-43,204` -- `currentPhase` doc comments.
- `conformance/protected-paths:6` -- header comment ("only once … exists"); check that CODEOWNERS rendering is unaffected (`codeowners --check`).
- `docs/ops/conformance-report.md:65` -- says `activePhases` checks only existence.
- Callers of `activePhases`: `tools/ratchet/ratchet.ts:496`, `conformance/tests/xaravel/inventory-checks.test.ts:408` (real root; no exit file on main, unaffected).
- Tests with unsigned exit fixtures: `conformance/tests/xaravel/protected-paths.test.ts:42` (`fixtureRoot`), `:370`, `:405`, `:426` (XT-conformance-19); `conformance/tests/xaravel/dashboard.test.ts:782` (XT-conformance-258). `SIGNED_EXIT` lives in `conformance/tests/xaravel/phase-gate-fixtures.ts:13` (plain module, safe to import).

## Tasks & Acceptance

**Execution:**
- `tools/protected-paths/protected-paths.ts` -- import `exitSignatureProblems`; `activePhases` adds n only for a signed file; head probe tests content; update header/doc comments -- one definition.
- `tools/conformance-report/report.ts` -- update the `phase`/`currentPhase` comments to "signed" -- docs match code.
- `conformance/protected-paths`, `docs/ops/conformance-report.md` -- reword the "exists" rule to "exists and is Maintainer-signed (`exitSignatureProblems`)".
- `conformance/tests/xaravel/protected-paths.test.ts` -- signed fixtures where a Phase should activate; add an unsigned-base case (contracts stay unprotected) and an unsigned-head case (Phase 2 inactive in the mirror) -- covers the matrix.
- `conformance/tests/xaravel/dashboard.test.ts` -- XT-conformance-258: signed PHASE-0/2 fixtures give phase 1; an unsigned PHASE-0 gives phase 0.

**Acceptance Criteria:**
- Given a base with an unsigned `decisions/PHASE-1-EXIT.md`, when `protected-paths pr` judges a PR touching `packages/contracts/src/a.ts`, then it passes as unprotected; with a signed one it fails `protected path:`.
- Given a root whose only exit file is an unsigned `PHASE-0-EXIT.md`, when `computeReport` runs, then `phase` is 0.
- Given the repository, when `bun test conformance/tests/xaravel`, `tsc`, oxlint and `codeowners --check` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 16 findings — high 0, medium 1, low 7, false 6, maybe-false 2
- findings:
  - `[false]` `[reject]` (edge) `activePhases` throws when `PHASE-<n>-EXIT.md` is a directory or unreadable — a loud failure on a state nothing shows reachable: `decisions/` is a Protected Path, and `computeReport` wraps the throw in `DataError`, `pr` fails closed.
  - `[maybe-false]` `[defer]` (edge) an existing but unsigned exit file is ignored without a diagnostic — if a signing slip reached `main`, `after-phase` entries would stay off silently (medium, unverified); settle by deciding whether `codeowners --check`/`pr` should report `exitSignatureProblems`, a new output surface the intent does not ask for.
  - `[false]` `[reject]` (edge) the drift assertion pins CODEOWNERS line 30 — the same hard-coded line was already asserted before this change (`phase2Stale`, `drift`); not introduced here.
  - `[maybe-false]` `[defer]` (blind) unsigned exit file is silent — same root cause as the edge finding above; deferred with it.
  - `[low]` `[patch]` (blind) unsigned fixtures only miss frontmatter, so a frontmatter-only check would pass — added an `activePhases` case with valid frontmatter and `decision: pending`.
  - `[false]` `[reject]` (blind) `readFileSync` can throw — same as the first edge finding; loud failure, not a defect.
  - `[low]` `[patch]` (blind) `docs/ops/porting.md` does not say later exit files need the same signed form — added one sentence; `epics.md` and `stories/10.6.md` "is merged" wording is planning text this item may not edit (epics.md is Maintainer-only) and was left.
  - `[low]` `[reject]` (blind) nothing binds an exit file's body to its Phase number — pre-existing in the gate's test, and only the Maintainer writes `decisions/` (Protected); unlikely and outside "one definition".
  - `[low]` `[patch]` (blind) comments say "the same test the Phase 1 gate applies", overstating it — reworded to the gate's signature test in `docs/ops/conformance-report.md` and `report.ts`.
  - `[false]` `[reject]` (blind) the unsigned-base case does not separate base from head, and no transition PR (unsigned/missing base, signed head) is tested — the `phase2` case is exactly that transition (base with no exit, signed head, CODEOWNERS `{2}`, passes), and base protection is shown by `unsignedContracts` touching contracts.
  - `[low]` `[patch]` (blind) `unsigned1` checks only `currentPhase` — added `computeReport(unsigned1).phase`.
  - `[low]` `[reject]` (blind) `isSignedExit` export has no direct test — it is exercised through `activePhases` and the head probe in XT-18/19; a direct assertion adds nothing.
  - `[low]` `[patch]` (blind) head-probe filter `exit !== null && exit !== undefined` — simplified to `exits[i] ?? null`.
  - `[medium]` `[reject]` (intent) the gate keeps its own `isFile` + `exitSignatureProblems` path rather than calling `activePhases` — the intent asks report.ts and `after-phase` to use `exitSignatureProblems`; both now do, so the signature test is one function; the gate checks PHASE-0 only and must report its problems, which `activePhases` discards.
  - `[false]` `[reject]` (intent) ratchet's unsigned case untested — `overlay` calls `activePhases` unchanged, and XT-18 covers `activePhases` on signed, unsigned and pending files.
  - `[false]` `[reject]` (intent) the directory/undefined differences between the two "exists" checks — directory case as the first edge finding; the `undefined` guard is removed by the filter patch.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/protected-paths.test.ts conformance/tests/xaravel/dashboard.test.ts conformance/tests/xaravel/phase-gate.test.ts conformance/tests/xaravel/inventory-checks.test.ts` -- expected: pass
- `bun tools/protected-paths/protected-paths.ts codeowners --check` -- expected: mirrors
- `bunx tsc --noEmit -p .` and `bun run lint` (or the repo's lint script) -- expected: clean
- `bun test` -- expected: no new failures

## Auto Run Result

Status: done

**Summary.** A Phase now counts as done only when `decisions/PHASE-<n>-EXIT.md` exists and passes `exitSignatureProblems`, the Phase 1 gate's signature test. `activePhases` applies it, so `currentPhase` (the report's `phase`), the CODEOWNERS mirror, the ratchet and the `pr` base side all share it; the `pr` head probe applies it to the head's exit-file content.

**Files changed.**
- `tools/protected-paths/protected-paths.ts` -- imports `exitSignatureProblems`; `isSignedExit`; `activePhases` and the head probe count only signed exits; header comments.
- `tools/conformance-report/report.ts` -- `phase` and `currentPhase` comments.
- `conformance/protected-paths` -- header comment (CODEOWNERS rendering unchanged).
- `docs/ops/conformance-report.md`, `docs/ops/porting.md` -- the signed rule for every exit file.
- `conformance/tests/xaravel/protected-paths.test.ts` -- XT-conformance-18/19: signed fixtures; unsigned and `decision: pending` exits activate nothing; unsigned base leaves contracts unprotected; unsigned head Phase 2 stays out of the mirror.
- `conformance/tests/xaravel/dashboard.test.ts` -- XT-conformance-258: unsigned exits do not end their Phase.

**Review.** 16 findings: 5 patched (all low: frontmatter-only test gap, `computeReport(unsigned1)`, head-probe filter, overstated "same test" wording, porting.md sentence); 1 deferred (silent unsigned exit, medium unverified; its blind duplicate shares the deferral); 10 rejected with reasons in the triage log. Patched by verdict: high 0, medium 0, low 5. Follow-up review recommended: false.

**Verification.** `bun test`: 289 pass, 0 fail. `bun run harness --xaravel`: 289/289. `codeowners --check`: mirrors. `bun run typecheck` and `bun run lint`: clean.

**Residual risks.** No exit file is on `main` yet, so the live effect appears only once the Maintainer signs `PHASE-0-EXIT.md`. `epics.md` and `stories/10.6.md` still say contracts become Protected when the Phase 1 decision "is merged"; that planning text is the Maintainer's to edit.
