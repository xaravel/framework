---
title: 'Retro 5 item 7: refine the Xaravel Tests'' citations to FR and AD bullets'
type: 'chore'
created: '2026-10-19'
status: 'done'
baseline_revision: '91e024acd9b2d759122def85674bfbc0b1b4fedb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      FR-116.4 and FR-116.5 can never be covered as written, so `xt:coverage conformance` cannot reach exit 0 even after Epics 7 and 8.
    evidence: |-
      FR-116.4 says PHPUnit `createMock` goes through `@xaravel/mockery`; decisions/ESC-4.4-2.md item 6 reversed that and XT-assert-13 checks the opposite. FR-116.5 ("each of these rules is verified by its own Xaravel Tests") is a meta rule no single test verifies. Changing the PRD bullet is the Maintainer's call.
    location: >-
      _bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md FR-116
    severity: medium
  - summary: >-
      Nothing checks the real declarations' cited bullets in CI, so a typo (`AD-16.10`) or a reverted citation passes every workflow.
    evidence: |-
      XT-conformance-126 runs coverage only on inline lists and a temporary root; ci.yml runs assert:coverage and mockery:coverage but not xt:coverage, which exits 1 by design while 25 bullets are uncovered.
    location: >-
      tools/xt-coverage/coverage.ts:114
    severity: low
---

<intent-contract>

## Intent

**Problem:** `bun run xt:coverage conformance` fails on `main` (`consequences=96 covered=12 uncovered=84`, Epic 5 retro finding S5) because the Conformance System's Xaravel Tests cite requirement-level tokens (`(FR-3, AD-15)`), which declare nothing under the whole-token rule (`CONSEQUENCE_TOKEN`, tools/xt-coverage/consequences.ts). ESC-5.9-1 part (2), approved, and `decisions/MAINT-2026-10-19-epic-5-items.md` item 7 give the orchestrator the refinement; the rest of item 7 (the three rulings, ESC-5.7-1's `test_ids` staying XT-conformance-121) is already done.

**Approach:** In each `xaravelTest(id, consequence, …)` declaration under `conformance/tests/xaravel/` and `packages/{assert,mockery}/tests/xaravel/*.test.ts`, rewrite each `FR-n` / `AD-n` token for an FR or AD in the conformance consequence set (FR-1..9, FR-111..116, AD-15, 16, 17, 21, 28) into the `FR-<n>.<k>` / `AD-<n>.<k>` bullet(s) of `conformance/xaravel-consequences/conformance.jsonl` that the test's assertions actually verify. Where the test verifies a set consequence it does not cite (for example an assert/mockery test verifying FR-116.2), add that bullet to the consequence string's parenthesised citation. Then run the coverage check and report what stays uncovered.

## Boundaries & Constraints

**Always:** Judge each mapping from the test body (its assertions), not its title alone; cite a bullet only when the test's assertions would fail if that bullet's rule broke. Keep each consequence string's prose unchanged apart from the parenthesised citation; keep the citation's existing position and style (`(FR-3.1, AD-15.2)`). Keep a bare `FR-n` / `AD-n` when no bullet of it fits, and leave tokens for FRs/ADs outside the conformance set (e.g. `AD-2`, `AD-18`, `FR-10`, `FR-13`, `DIV-10`, `MAINT-…`) as they are: their bullets belong to other Components' consequence files (ESC-5.9-1 part 1). A consequence string must stay unique and must keep matching anything that reads it verbatim (grep the repo for each changed string's old form).

**Never:** Change an assertion, expected value, Test ID, skip, test body or test order. Touch fixture files under `*/tests/xaravel/fixtures/` (they are test data for the declaration checks). Edit `tools/xt-coverage/**`, `conformance/xaravel-consequences/**`, `conformance/expectations/**`, AGENTS.md, the PRD, the spine, SPEC or `epics.md`. Cite a bullet to raise the coverage count without the test verifying it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| In-set FR | `(FR-3, AD-15)` on a test of the Ratchet's PR verdict | `(FR-4.1, FR-4.2, AD-28.1)` or whichever bullets the assertions check | No error |
| No fitting bullet | `(AD-16)` on a test of a rule no AD-16 bullet states | stays `(AD-16)` | listed in Design Notes as kept |
| Out-of-set | `(AD-18, FR-13)` | unchanged | No error |
| Uncited grader test | `XT-assert-9` (assertSame key order) | `… (FR-116.2)` appended | No error |
| Unknown bullet | a cited id not in conformance.jsonl | none may remain: `xt:coverage` prints no `declares … which is not in` warning | fix the citation |

</intent-contract>

## Code Map

- `tools/xt-coverage/consequences.ts:57-62` -- `CONSEQUENCE_TOKEN` / `declaredConsequences`: whole-token `FR-\d+.\d+` / `AD-\d+.\d+`; read-only.
- `tools/xt-coverage/coverage.ts` -- `bun run xt:coverage conformance` runs `harness --xaravel` and prints `UNCOVERED …` and `XT-COVERAGE conformance consequences=96 covered= uncovered=`; warnings for unknown ids on stderr. Read-only.
- `conformance/xaravel-consequences/conformance.jsonl` -- the 96 bullet ids and texts (FR-1.1..FR-116.5, AD-15.1..AD-28.7); full PRD/spine text at the paths in `consequences.ts:28-29`. Read-only.
- `conformance/harness/xaravel.ts:110-157` -- results are keyed by the label `<id>: <consequence>`, so a changed string needs no other edit unless something matches it verbatim.
- `conformance/tests/xaravel/*.test.ts` -- 41 files, ~230 declarations; `packages/assert/tests/xaravel/{assertions,comparison,declarations,expectations,doubles}.test.ts` and `packages/mockery/tests/xaravel/mockery.test.ts` -- grader XTs, mostly uncited, verifying FR-113, FR-116 and AD-15.9.
- `conformance/tests/xaravel/done-check.test.ts:60` -- XT-conformance-126, the coverage tool's own test; read before editing in case it inspects real declarations.

## Tasks & Acceptance

**Execution:**
- `conformance/tests/xaravel/*.test.ts` -- refine each declaration's in-set citation to bullets per the rules above -- S5 / ESC-5.9-1 (2).
- `packages/assert/tests/xaravel/*.test.ts`, `packages/mockery/tests/xaravel/mockery.test.ts` -- refine or add in-set bullet citations (FR-113.x, FR-116.x, AD-15.9) where the test verifies them -- same.
- `_bmad-output/implementation-artifacts/spec-retro-5-xt-citations.md` -- record the before/after coverage counts and the remaining uncovered bullets.

**Acceptance Criteria:**
- Given the edited tree, when `git diff` is filtered to non-citation changes, then only the parenthesised citation part of `xaravelTest` consequence strings differs.
- Given the edited tree, when `bun run xt:coverage conformance` runs, then it prints no unknown-id warning and `covered` is higher than the baseline 12; each remaining `UNCOVERED` line is reported honestly.
- Given the edited tree, when `bun run harness --xaravel`, `bun run typecheck` and `bun run lint` run, then each passes as on the baseline.

## Design Notes

A bullet earns a citation only if the test fails when that rule breaks; a test of one tool's CLI usage error verifies no PRD bullet and keeps its bare token. Uncovered bullets after this change (dashboard FR-5.x, Fidelity Review FR-111.x, Phase rules FR-7.4, FR-8.x) mostly belong to Stories not yet built (Epics 7 and 8); they stay uncovered, correctly.

## Verification

**Commands:**
- `bun run xt:coverage conformance` -- expected: no unknown-id warnings; covered > 12.
- `bun run harness --xaravel` -- expected: exit 0, as on baseline.
- `bun run typecheck` and `bun run lint` -- expected: exit 0.

## Results

**Coverage:** `bun run xt:coverage conformance` went from `consequences=96 covered=13 uncovered=83` on the baseline tree (the retro's figure was 12; XT-conformance-195's `AD-17.6` landed since) to `consequences=96 covered=71 uncovered=25`. It prints no unknown-id warning. 162 consequence strings changed across 41 test files; only their parenthesised citation differs, appended where a test had none. `bun run harness --xaravel` (242/242), `bun run typecheck` and `bun run lint` exit 0.

**Still uncovered (25), honestly:**
- Not built yet: FR-3.5 (fail-known on the dashboard and at Epic acceptance), FR-5.1..5.5 and AD-28.6 (dashboard), FR-111.2, 111.3, 111.4 and FR-115.3 (Fidelity Review), FR-114.2 and 114.3 (Escalation flow and Epic acceptance), FR-112.4 (Infrastructure Stories' timing), FR-8.1..8.4 (`PORTING.md` and Divergence Records), AD-15.7 (generator references), AD-15.10 (Boost framework mode), AD-21.2, 21.3, 21.4 (cross-package Story, contract and large-class rules).
- FR-116.4: no test verifies it, because `decisions/ESC-4.4-2.md` item 6 reversed it. XT-assert-13 checks that `createMock` works without `@xaravel/mockery`. It needs a PRD change or a Maintainer note.
- FR-116.5 is a meta rule: each of FR-116.1..4 has its own Xaravel Tests. No single test verifies it.

**Bare tokens kept:** where no bullet fits, the citation keeps a bare token. Examples: FR-6 on request, API-surface and verify tooling that is neither determinism nor containerisation; FR-3 on Ratchet and recorder tests; AD-16 on request-ownership tests; AD-28 on tool-level tests that do not check CI configuration. Tests that verify no set bullet (CLI usage, init idempotence, mockery API details) stay uncited.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 13, false 4, maybe-false 2
- findings:
  - `[low]` `[patch]` FR-6.1 applied inconsistently across determinism tests (blind) — XT-70, 81 and 200 check extraction/export determinism, not expected values, so FR-6.1 does not fit them; but XT-conformance-220 cited FR-6.1 while evaluating each request once. Patched: XT-220 now cites `(AD-15.4)`; FR-6.1 stays covered by XT-188, 230, 232, 233.
  - `[low]` `[reject]` Siblings lack AD-15.4 / AD-15.5 (blind) — an omission, not false coverage; both bullets are already covered, and each addition needs per-test judgement that the Fidelity Review owns.
  - `[low]` `[reject]` XT-47 and XT-203 keep bare FR-1 (blind) — same: an omission; FR-1.7 and AD-15.3 are covered elsewhere.
  - `[false]` `[reject]` XT-mockery-2 and XT-assert-16 should cite FR-113.x (blind) — mockery-2 checks how a Mockery expectation counts, not that a zero-assertion test fails (FR-113.1) or that the harness reports counts (FR-113.3); assert-16's kind-less test passes, the opposite case to FR-113.1.
  - `[low]` `[reject]` Design Notes contradict Results on FR-7.4 / FR-111.x (blind) — the fix edits this spec; Results is authoritative.
  - `[low]` `[reject]` done-check.test.ts drops bare parent tokens (blind) — cosmetic; the tool ignores bare tokens and no reader depends on them.
  - `[low]` `[reject]` Token order inconsistent (blind) — cosmetic; no consumer orders tokens.
  - `[medium]` `[defer]` FR-116.4 conflicts with ESC-4.4-2 item 6 and FR-116.5 is a meta rule, so coverage cannot reach 0 (blind) — pre-existing PRD/decision conflict; needs a Maintainer PRD change. Deferred.
  - `[low]` `[reject]` No per-test mapping table (blind) — the fix edits this spec; the diff itself is the audit trail for the Fidelity Review.
  - `[false]` `[reject]` Uniqueness and old-string grep never verified (blind) — the edge-case layer found no duplicate consequence strings in real declarations, and the implementer and verification-gap layer grepped the old forms: only prose in planning docs matches.
  - `[low]` `[reject]` Spec numbers out of date (baseline 12 vs 13, file counts) (blind) — the fix edits this spec; Results records the measured 13.
  - `[maybe-false]` `[reject]` XT-conformance-58 should cite FR-1.2, not FR-6.1 (blind) — the baseline attempts are Oracle runs whose outcomes are expected values, so FR-6.1 is defensible; settling it is a Fidelity Review call, and if true it is low.
  - `[low]` `[reject]` Design Notes list FR-7.4 as uncovered (edge) — the fix edits this spec.
  - `[low]` `[defer]` No CI check on the real declarations' citations (verification-gap) — filed as defer; xt:coverage cannot gate CI while it exits 1 by design. Deferred.
  - `[low]` `[patch]` docs/ops/done-check.md:37 says the tests still cite bare FRs (verification-gap) — patched: the paragraph now describes the refinement and why the command still exits 1.
  - `[low]` `[reject]` `// Verifies:` comments stay requirement-level (intent) — no tool reads them; they are coarse, not wrong.
  - `[false]` `[reject]` Bare in-set tokens remain (intent) — by design: a bare token stays where no bullet fits (intent: "cite only bullets the test genuinely verifies").
  - `[low]` `[reject]` Out-of-set tokens (AD-2, AD-18, FR-13) not refined (intent) — no consequence file reads them, and ESC-5.9-1 part 1 leaves those sets to their epics; refining them would only add unknown-id warnings.
  - `[false]` `[reject]` Citations added to uncited tests go beyond "refine" (intent) — ESC-5.9-1 names packages/{assert,mockery}/tests/xaravel, whose tests had no citations; covering them requires adding one.
  - `[maybe-false]` `[reject]` XT-56/57 (AD-15.2) and XT-124 (AD-16.6) are judgement calls (intent) — each is backed by an assertion on the data layout or the promotion bot; the Fidelity Review checks the mapping; if wrong, low.

## Auto Run Result

Status: done

- **Summary:** refined 162 Xaravel Test consequence strings in 41 files from requirement-level `FR-n` / `AD-n` to the `FR-<n>.<k>` / `AD-<n>.<k>` bullets their assertions verify, plus updated `docs/ops/done-check.md`. Only the parenthesised citations changed; no assertion, body, Test ID or skip.
- **Files:** 36 `conformance/tests/xaravel/*.test.ts`; `packages/assert/tests/xaravel/{assertions,comparison,declarations,expectations}.test.ts`; `packages/mockery/tests/xaravel/mockery.test.ts`; `docs/ops/done-check.md` (paragraph on the refined citations).
- **Review:** 20 findings. 2 patches (low): XT-conformance-220 drops FR-6.1, done-check.md updated. 2 deferred (FR-116.4/116.5 need a Maintainer PRD change; no CI check of real citations). 16 rejected, with reasons in the triage log.
- **Follow-up review recommended:** false (patched: 0 high, 0 medium, 2 low).
- **Verification:** `bun run xt:coverage conformance` → `consequences=96 covered=71 uncovered=25` (baseline 13), no unknown-id warnings, exit 1 as expected; harness Xaravel 242/242 pass; `bun run typecheck` 0; `bun run lint` 0.
- **Residual risks:** the 162 mappings are judgement; the Fidelity Review must check them (ESC-5.9-1). FR-116.4 and FR-116.5 keep the command at exit 1 until the Maintainer amends FR-116.
