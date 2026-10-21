---
title: 'Epic 8 action item 4: the Fidelity Review binding leaves out only ESC-8.8-1 bookkeeping, and the next review must address the latest reject'
type: 'feature'
created: '2026-10-20'
baseline_revision: 'd1eb33c4b9abe79eecef79c1ef1826ed850a7abf'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/ESC-8.8-1.md'
  - '{project-root}/docs/ops/fidelity-review.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-retro-2026-10-20.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The verdict binding tree leaves out all of `_bmad-output/` and `stories/` (`BOOKKEEPING`, `tools/fidelity-review/fidelity-review.ts:86`), wider than ESC-8.8-1 item 2 ruled (finding S4): a `test_ids` edit in `stories/<id>.md`, or an edit to `epics.md`, the PRD or the spine (which tools read at check time), keeps approvals current. And a reject is lifted by any tree change, even a whitespace edit, because the next review never sees the reject's findings (finding L7, ESC-8.8-1 item 3: a reject stands "until its findings are fixed").

**Approach:** (1) Narrow the binding tree to the repository minus exactly: `_bmad-output/implementation-artifacts/sprint-status.yaml`, the Story's own spec file (where its verdict records live), and the `status:` frontmatter line of every `stories/*.md` manifest (normalised, not removed). (2) Carry the latest reject's findings into the next review: for each reviewer slot whose last record is a `reject` on another tree, its fail findings are listed in the prompt as `P-1..P-n`; the answer must then hold one `addressed` entry per finding (`fixed`, `note`), and a finding answered `fixed: false` must make its checklist item `fail`. The tool records those answers in the verdict record as `prior`, and counting treats a record whose `prior` does not match the findings it should have addressed as malformed.

## Boundaries & Constraints

**Always:** Change only `tools/fidelity-review/fidelity-review.ts`, `tools/story-check/story-check.ts` (the `approvalsClause` call and its comment), the Xaravel Tests in `conformance/tests/xaravel/fidelity-review.test.ts` (extending XT-conformance-161 and XT-conformance-162; existing assertions kept unless the ruled behaviour changes them), `docs/ops/fidelity-review.md`, `docs/ops/done-check.md` if it describes the tree, the bookkeeping sentence of `conformance/review/fidelity.md`, and the bookkeeping sentence of the `fidelity-review` layer in `_bmad/custom/bmad-build-auto.toml`. `reviewTree` stays the one implementation shared with `story:check`. The real git index is never written. Answers with no prior findings keep today's schema (no `addressed` property), so a first review is unchanged.

**Never:** No change to `AGENTS.md`, `conformance/expectations/**`, the ownership or protected-paths tools, the checklist items F-1..F-10, or the reviewers' diff (it still leaves out `_bmad-output/` and shows `stories/`). No new XT id and no manifest change. No override flag. No model API call.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Status-only manifest edit | `status: in-progress` → `done` in `stories/9.1.md` | `reviewTree` unchanged; `status` prints `current` | — |
| Manifest `test_ids` edit | an id added to or removed from `stories/9.1.md` | new tree; `status` prints `stale` | — |
| Planning doc edit | a line added to `_bmad-output/planning-artifacts/epics.md` | new tree; `stale` | — |
| Sprint status or Story spec edit | `sprint-status.yaml` rewritten; spec gets `Finalized.` | tree unchanged; `current` | — |
| Another spec in implementation-artifacts | `spec-9-2-*.md` edited | new tree | — |
| Review after a reject, tree changed | slot 1 last record `reject` with F-2 finding | prompt lists `P-1 (reviewer 1, F-2) <path>: <detail>`; schema requires `addressed` | answer without `addressed`, or missing/extra/duplicate P id: malformed, retried, then fails closed |
| Prior finding not fixed | `addressed: [{id:"P-1", fixed:false}]` with F-2 `pass` | malformed: `P-1 is not fixed, so F-2 must fail` | retried once, then no verdict |
| Counting | record whose `prior` omits a finding it should address | `fidelityVerdicts` reports it malformed | count fails |

</intent-contract>

## Code Map

- `tools/fidelity-review/fidelity-review.ts:81-88` -- `EXCLUDED_DIR` (diff exclusion, keep), `BOOKKEEPING` (replace with the narrow set: `SPRINT_STATUS` path plus spec path plus manifest-status normalisation).
- `tools/fidelity-review/fidelity-review.ts:1244-1278` -- `treeWithout` builds a temp index (`GIT_INDEX_FILE`); `reviewTree(root, mode)` gains the spec's repo-relative path. Normalise manifests in the temp index: `git ls-files -s -- stories/` → blob ids → `git cat-file --batch` → rewrite the frontmatter `status:` line to `status: (bookkeeping)` → `git hash-object -w --stdin-paths` (files in the temp dir) → `git update-index --index-info`. The `git` helper needs an optional stdin.
- `tools/fidelity-review/fidelity-review.ts:1294-1306` -- `reviewDiff` uses `reviewTree(root, "worktree")`; pass the spec through.
- `tools/fidelity-review/fidelity-review.ts:1081-1213` -- `verdictSchema`, `parseVerdict`, `VerdictResult`: add the optional prior-findings argument and the `addressed` answers.
- `tools/fidelity-review/fidelity-review.ts:246-325` -- `buildPrompt`: system rule for `addressed`; user section `## Findings of the latest reject (ESC-8.8-1)` (or "No earlier reject…"). `PromptInput` gains `prior`.
- `tools/fidelity-review/fidelity-review.ts:1367-1420,1483-1526` -- `VerdictRecord` gains `prior` (array, may be absent on old records = `[]`); `renderRecord` lists it; `recordProblem` validates its shape.
- `tools/fidelity-review/fidelity-review.ts:1570-1643` -- `standingRejects` (unchanged), `fidelityVerdicts`: re-validate each counted record's `prior` against the findings expected from the records before its run (same tree and date, contiguous).
- `tools/fidelity-review/fidelity-review.ts:1698-1712,1875-1897` -- `ReviewerOptions`/`ReviewerOutcome` carry `prior` / `addressed`.
- `tools/fidelity-review/fidelity-review.ts:1985-2126` -- `review`: compute prior findings, pass to prompt and reviewers, record `prior` (an unfixed finding surfaces through its item's fail findings, already printed). `status`: pass spec.
- `tools/story-check/story-check.ts:386-406` -- `approvalsClause` passes the found spec to `reviewTree`.
- `conformance/tests/xaravel/fidelity-review.test.ts:311-424` (XT-conformance-161, bookkeeping) and `:852-1116` (XT-conformance-162, reject) -- extend; `makeRepo` writes spec at `SPEC`.
- `docs/ops/fidelity-review.md:56,79-86,103-112,142-143` -- reviewed tree, counting, known limits ("All of `stories/` is bookkeeping" becomes obsolete).

## Tasks & Acceptance

**Execution:**
- `tools/fidelity-review/fidelity-review.ts` -- narrow binding; prior findings through prompt, schema, parse, record, counting -- S4, L7.
- `tools/story-check/story-check.ts` -- pass spec to `reviewTree` -- shared binding.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- cover every I/O matrix row -- proof.
- `docs/ops/fidelity-review.md`, `conformance/review/fidelity.md`, `_bmad/custom/bmad-build-auto.toml` -- describe the new binding and the prior-findings rule -- lesson (epic 8): update every file that describes the tool.

**Acceptance Criteria:**
- Given a reviewed tree with two passes, when only the manifest `status`, sprint status or the Story spec change (worktree and committed), then `status` prints `current` and `approvalsClause` passes.
- Given the same, when `test_ids` or `epics.md` change, then `status` prints `stale`.
- Given a reject recorded at tree A, when the tree changes and `review` runs, then both reviewers' stdin carries each reject finding as `P-<k>`, the schema they get requires `addressed`, and the recorded records hold `prior` with each answer.
- Given a reviewer answer that leaves `P-1` unfixed while its item passes, or omits it, then it is malformed and retried.
- Given hand-written records, when a counted record's `prior` omits an expected finding, then `fidelityVerdicts` fails it as malformed.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 23 findings — high 0, medium 5, low 11, false 7, maybe-false 0 (Fidelity Review layer skipped: not a Story)
- findings:
  - `[low]` `patch` (blind) docs/comments say "exactly ESC-8.8-1's bookkeeping" though the ruling lists `stories/` whole — reworded to name action item 4's narrowing.
  - `[false]` `reject` (blind) Protected Path `conformance/review/fidelity.md` edited without approval — Phase 0 retro item on `planning/retro-8-*`; the MAINT 2026-10-17 amendment is the approval; the action item and the epic 8 lesson require updating the files that describe the tool.
  - `[false]` `reject` (blind) other post-review `_bmad-output/` writes make verdicts stale — after review the loop writes only the Story spec, sprint status and the manifest status (all bookkeeping); `bmad-build-auto-result-*` is written only when no spec exists, `lessons.md` only by retrospectives.
  - `[false]` `reject` (blind) untracked scratch files under `_bmad-output/` split worktree and head trees — step-04 Finalize requires a clean working copy before `done`, as it already did for every other path.
  - `[low]` `reject` (blind) planning-artifact changes are bound but not shown to reviewers — documented limit; Stories cannot edit planning artifacts (ownership), and showing them would add diff surface beyond the ruling.
  - `[medium]` `patch` (blind) an unfixed prior finding is dropped after one round — priorFindings now also carries the last reject's `fixed: false` prior answers.
  - `[low]` `reject` (blind) the no-spec form of `reviewTree` differs — every production caller passes the spec (grep); the multi-spec agreement is now pinned by the verification-gap patch.
  - `[medium]` `patch` (blind) `--spec` is never checked to be a spec — `reviewTree` now throws unless the spec is a `.md` under `SPECS_DIR/`.
  - `[low]` `patch` (blind) pre-change records are reported malformed, not absent — doc corrected.
  - `[false]` `reject` (blind) committed status/spec/sprint edits untested in head mode — covered at `conformance/tests/xaravel/fidelity-review.test.ts:424-434` (commit "bookkeeping" and "story done", then `approvalsClause` PASS).
  - `[low]` `reject` (blind) normalisation edge cases (CRLF, multi-line status, non-UTF-8, nested manifests) — CRLF is handled by the regex; manifests are generated single-line UTF-8 YAML; a fix adds byte-level handling for inputs that do not occur.
  - `[low]` `reject` (blind) untested `addressed`/`prior` shape branches — simple type guards; an empty prior note is rejected anyway when counting re-runs parseVerdict.
  - `[low]` `reject` (blind) run grouping by tree+date is fragile/quadratic — records are written only by the tool, one date per run; record counts are tens.
  - `[false]` `reject` (blind) this spec's name and metadata — not a Story spec; the fix would edit this build's spec.
  - `[low]` `reject` (edge) prior item no longer in the checklist — checklist ids are Protected and stable; a fix adds a guard branch.
  - `[medium]` `patch` (edge) `repoPath` null silently binds the spec — same root cause and fix as the `--spec` check.
  - `[low]` `patch` (edge) a relative root doubles the spec path — CLI and story:check always resolve root absolute; fixed directly by resolving against `resolve(root)` in the same patch.
  - `[low]` `reject` (edge) non-UTF-8 manifest bytes — as above.
  - `[low]` `reject` (edge) two `status:` lines or an empty frontmatter — manifests are generated with one `status:` key; not reachable.
  - `[false]` `reject` (edge) the first-review prompt text changes — the spec promises only an unchanged schema and system text, which holds.
  - `[medium]` `patch` (verification-gap) the spec argument at the status/story:check/reviewDiff call sites is unverified with more than one Story spec — makeRepo commits a second spec; XT-161 asserts current/PASS and stale/FAIL on editing it.
  - `[medium]` `patch` (verification-gap) multi-manifest `cat-file --batch` parsing is unverified — makeRepo commits `stories/9.2.md`; a status edit to it keeps both trees.
  - `[false]` `reject` (intent-alignment) descriptive report; it records the diff's readings (whole spec, every manifest's status, per-slot latest reject, "addressed" as answered) and every one is the spec's recorded choice, with no defect named.

## Design Notes

The whole Story spec is bookkeeping, not only its `## Fidelity Review` section. ESC-8.8-1 names "the spec's own `fidelity-verdict` records", but `bmad-build-auto` step 4 writes the spec after the review layer runs on every pass (the Review Triage Log, `review_loop_iteration`, `deferred`, `## Auto Run Result`, `followup_review_recommended`, `status: done`). Binding any of that would make every Story's verdicts stale at Finalize, an unending re-review loop. The spec is the review's own record and the reviewers never see it (the diff leaves out `_bmad-output/`), so leaving the whole file out matches the ruling's intent; this is the recorded reason the epic 8 lesson asks for. Everything else under `_bmad-output/` (planning artifacts, other specs, epic context) is now bound.

Changing the binding changes every tree id, so verdicts recorded before this change (Stories 8.7, 8.8) no longer count; those Stories are done and their story:check does not re-run.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/fidelity-review.test.ts conformance/tests/xaravel/done-check.test.ts` -- expected: all pass.
- `bunx tsc --noEmit -p .` -- expected: no errors.
- `bunx oxlint` (repo config) -- expected: no new errors.
- `bun run harness --xaravel` -- expected: SUMMARY with no difference.

## Auto Run Result

Status: done

**Summary.** The Fidelity Review's binding tree now leaves out only the bookkeeping set ESC-8.8-1 names, as Epic 8 action item 4 narrows it: sprint status, the Story's whole spec, and the frontmatter `status:` line of each `stories/*.md` manifest (normalised in a temporary index). Everything else, `test_ids`, planning artifacts and other specs included, is bound (finding S4). A reject's findings, plus any of its own carried findings answered not fixed, are carried into the next review as `P-1..P-n`. The answer must address each one in `addressed`, and an unfixed finding must fail its item. The answers are recorded as `prior`, and `fidelityVerdicts` re-checks them (finding L7). A named spec must be a `.md` file under `_bmad-output/implementation-artifacts/`.

**Files changed.**
- `tools/fidelity-review/fidelity-review.ts`: the narrow binding (`reviewTree(root, mode, spec)`, `normaliseManifestStatus`, `specRepoPath`), and prior findings across the prompt, schema, `parseVerdict`, the record and counting.
- `tools/story-check/story-check.ts`: `approvalsClause` passes the spec to `reviewTree`.
- `conformance/tests/xaravel/fidelity-review.test.ts`: XT-conformance-161 covers the binding with two specs and two manifests; XT-conformance-162 covers the prior-findings rules.
- `docs/ops/fidelity-review.md`, `docs/ops/done-check.md`, `conformance/review/fidelity.md`, `_bmad/custom/bmad-build-auto.toml`: they describe the new binding and the rule.

**Review findings.** There were 23 findings. 9 were patched: 5 medium (dropped unfixed prior findings; the unchecked `--spec`; the null `repoPath`; no multi-spec coverage; no multi-manifest coverage) and 4 low (ruling wording; the doc on pre-change records; the relative root; the test comment wording, which was grouped with the ruling wording). 14 were rejected; their reasons are in the Review Triage Log. Nothing was deferred. The Fidelity Review layer was skipped because this is not a Story.

**Follow-up review: recommended.** On a first pass, five medium entries were patched. The unverified risk is that the prior-findings schema (`addressed`) and the narrowed binding have run only against fake reviewer CLIs. The first real Story review, Story 9.1, is the first live run: watch the codex `--output-schema` acceptance of the conditional `addressed` property.

**Verification.** `bun test` on `fidelity-review.test.ts` and `done-check.test.ts`: 7 pass, 0 fail. `bunx tsc --noEmit -p .`: clean. `bunx oxlint`: clean. `bun run harness --xaravel`: 289/289, `differ=0`. On the real repository, `fidelity:review status --story 8.8` now prints `stale`, as expected: every tree id changed.

**Residual risks.** Verdicts recorded before this change (Stories 8.7 and 8.8) no longer count. A planning-artifact edit is bound but is not shown in the reviewers' diff (a documented limit).
