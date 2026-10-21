---
title: 'Epic 8 action item 2: the Fidelity Review sends test evidence, binds verdicts to code and does not re-roll a reject'
type: 'feature'
created: '2026-10-20'
baseline_revision: '33de2e635475834251d9950705b36f6e2cfd8f79'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/ESC-8.8-1.md'
  - '{project-root}/docs/ops/fidelity-review.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 8.8's Fidelity Review did not converge (ESC-8.8-1, rejected by the Maintainer). The codex reviewer asked for the full bodies and consequences of Xaravel Tests the diff touched (directly, or through a shared fixture such as `baseRoot`), which `tools/fidelity-review` does not send; a status edit to `stories/8.8.md` changed the reviewed tree and made approvals stale; and the same unchanged tree was reviewed again until the verdict flipped.

**Approach:** Per `decisions/ESC-8.8-1.md` (Epic 8 item 2): (1) add evidence section (e) carrying the full body and cited consequences of every Xaravel Test whose lines the diff changes, and of every Xaravel Test that uses a test fixture or helper the diff changes; (2) bind verdicts to a tree that also leaves out `stories/` (on top of `_bmad-output/`, which already holds sprint status and the spec's verdict records); (3) make a `reject` on an unchanged reviewed tree stand: `review` refuses to re-run on that tree, and counting never lets a later `pass` in the same slot on that tree override it.

## Boundaries & Constraints

**Always:** Change only `tools/fidelity-review/**`, its Xaravel Tests in `conformance/tests/xaravel/fidelity-review.test.ts` (adding assertions, never removing or weakening one except where the ruled behaviour changes), `docs/ops/fidelity-review.md`, `docs/ops/done-check.md` if it describes the tree, and the `fidelity-review` layer text in `_bmad/custom/bmad-build-auto.toml`. `reviewTree` stays the one implementation shared with `story:check`. Missing evidence is named (`unavailable: <why>`), never dropped. Fail closed: a standing reject, like any other stop, exits 1 with nothing recorded.

**Never:** No change to `AGENTS.md`, `conformance/expectations/**`, `conformance/review/fidelity.md`, the ownership or protected-paths tools. No new XT id or manifest change. No override flag that re-runs a review on a tree with a standing reject. No model API call.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| XT lines change | diff edits lines inside `xaravelTest("XT-a-1", …)` | prompt section (e) has XT-a-1's full body, path:lines, reason "its lines change", and each FR/AD its consequence string cites with its consequence line | unknown consequence id named |
| Helper changes | diff edits a top-level `function baseRoot` in a test file (or a test-dir module another test file imports it from) | every XT whose body uses `baseRoot`, directly or through another helper that uses it, is in (e) with reason naming `baseRoot` | — |
| Test-file setup changes | diff edits a top-level `beforeEach(…)`/other non-declaration statement in a test file | every XT in that file is in (e) | — |
| No XT touched | diff changes only `packages/x/src/*.ts` | (e) says no Xaravel Test is touched | — |
| Status edit | only `stories/<id>.md` or `_bmad-output/**` changes after review | `reviewTree` unchanged; `status` still `current` | — |
| Re-roll attempt | spec has a `reject` for tree T in slot n; tree still T | `review` exits 1, runs no reviewer, records nothing, prints `STANDING reviewer n: reject at tree T` and the reject's findings | stderr explains fix or supply evidence (ESC-8.8-1) |
| Later pass on same tree | slot n has reject then pass for tree T | `fidelityVerdicts` counts the reject; an item line says the later pass does not count | — |
| Tree changed | reject at T, code fixed → T' | review runs normally | — |

</intent-contract>

## Code Map

- `tools/fidelity-review/fidelity-review.ts` -- the tool. `EXCLUDED_DIR` + `treeWithout` (l.675) build trees; `reviewTree` (l.702) is the binding tree; `reviewDiff` (l.717) builds diff + `tree`; `Evidence`/`gatherEvidence` (l.166, l.436) and `buildPrompt` (l.227) hold evidence (a)-(d); `consequenceLines` (l.332) reads `conformance/xaravel-consequences/*.jsonl`; `fidelityVerdicts` (l.995) counts per slot; `review` (l.1376) runs reviewers; `status` (l.1499).
- `tools/story-check/story-check.ts:386` -- `approvalsClause` uses `reviewTree(root, "head")` + `fidelityVerdicts`; read-only, picks up the new behaviour.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- XT-conformance-160/161/162 with `makeRepo` fixture repos and fake CLIs; extend here.
- `packages/assert/src/declarations/xaravelTest.ts` -- `xaravelTest(id, consequence, fn)`; XT id regex. Wrappers like `phpTest("XT-…", "…", …)` (oracle-story.test.ts) share the shape; `for` loops in boost-framework.test.ts declare XTs dynamically.
- `docs/ops/fidelity-review.md` -- Inputs, Reviewed tree, Counting, Exits, Limits sections to update.
- `_bmad/custom/bmad-build-auto.toml:12-26` -- the `fidelity-review` review layer; add the standing-reject rule.

## Tasks & Acceptance

**Execution:**
- `tools/fidelity-review/fidelity-review.ts` -- add `BOOKKEEPING` exclusion (`_bmad-output`, `stories`) for the binding tree while the diff keeps excluding only `_bmad-output`; add a small top-level-unit scanner for TS test files (strings, templates, comments, regex-aware) and `xaravelTestEvidence(root, files)` producing section (e); add `standingRejects` and use it in `fidelityVerdicts` and `review`; update the header comment.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- add assertions for every I/O row above to XT-conformance-161 (evidence, tree binding) and XT-conformance-162 (standing reject).
- `docs/ops/fidelity-review.md` -- document (e), the binding tree, the standing reject; replace the "Re-runs are visible" limit; add the scanner's limits.
- `_bmad/custom/bmad-build-auto.toml` -- the layer says a standing reject is answered by fixing its findings (a tree change), never by re-running.

**Acceptance Criteria:**
- Given Story 8.8's re-run after this item, when its diff touches XT-conformance-24 or the `baseRoot` fixture, then the prompt carries those tests' full bodies and consequences.
- Given verdicts recorded for a tree, when only `stories/` or `_bmad-output/` change, then `status` stays `current` and `story:check approvals` still passes.
- Given a recorded reject on tree T, when `review` runs again on T, then no reviewer runs and nothing is recorded.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 38 findings — high 0, medium 7, low 17, false 14, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) racy-index mtime fix in `treeWithout` untested — added a deterministic same-size, same-second edit case.
  - `[medium]` `[patch]` (verification-gap) aliased, namespace and direct-name fixture paths in (e) untested — added cases with their reason strings.
  - `[false]` `[reject]` (verification-gap other) all of `stories/` leaves the binding tree, so `test_ids` edits keep verdicts current — ESC-8.8-1 names `stories/` as a bookkeeping path; the limit is now documented (patched in docs).
  - `[false]` `[reject]` (intent 1b/1c) Ported Tests and Oracle fixtures do not trigger (e) — the ruling's subject is Xaravel Tests and test fixtures/helpers; Oracle fixtures already have evidence (c); no Ported Test exists before Phase 1.
  - `[low]` `[reject]` (intent 1d) a wholly removed XT shows no old body — its removed lines are in the diff hunks the reviewer reads; limit documented.
  - `[false]` `[reject]` (intent 2b/2c) binding granularity — same as the `stories/` row; `_bmad-output/` was already excluded before this change.
  - `[false]` `[reject]` (intent 3b/3c/3d, blind, edge) any unrelated tree change lifts a reject; prior findings not carried to the next prompt — the ruling defines it on "an unchanged reviewed tree"; documented as a limit.
  - `[false]` `[reject]` (intent) no run of (e) against the real repo or 8.8 diff — the implementer ran the scanner over all 77 real test files (XT-conformance-24, 116, 117, 244, 245 found); Story 8.8's re-run is the live check the ruling prescribes.
  - `[medium]` `[patch]` (blind, edge claim) "supply the evidence" doc path is not one the code offers when written in spec or manifest — docs and toml now say evidence goes in code, tests or the tool's prompt.
  - `[low]` `[reject]` (blind) Finalize re-check loops into the refusal — the refusal prints the standing reject's F- lines, which triage routes; a fix changes the tree; non-convergence halts `blocked` as the ruling intends.
  - `[low]` `[reject]` (blind) `review()` trusts malformed reject records — `parseRecords` already rejects a record whose verdict disagrees with its items; only a hand-forged record could trip it, a pre-existing documented limit.
  - `[false]` `[reject]` (blind, edge) `stories/` exclusion — duplicate of the row above.
  - `[low]` `[patch]` (blind) prompt-cap message blames the diff — now names the diff and its evidence and gives (e)'s size.
  - `[low]` `[patch]` (blind, edge claim) `it names the changed file` reason undocumented and untested — documented and tested.
  - `[medium]` `[patch]` (blind) racy-index fix untested — duplicate of the verification-gap row; same test.
  - `[low]` `[reject]` (blind) `reviewDiff` builds three temporary trees — a few hundred ms per run; not worth the extra plumbing.
  - `[low]` `[patch]` (blind) removing a whole test file or helper touches nothing in (e) — documented as a limit (typecheck catches dangling uses).
  - `[low]` `[patch]` (blind, edge) plural stderr when both slots stand — fixed and tested.
  - `[low]` `[patch]` (blind) consequence wording for unanchored units — reworded "its text cites".
  - `[low]` `[patch]` (blind) `fr1112` names the FR-111.1 line — renamed.
  - `[medium]` `[patch]` (edge) `index.ts` helper module importers skipped by the stem prefilter — parent directory name accepted as stem; tested.
  - `[medium]` `[patch]` (edge) helper used only from a setup unit pulls in no XT — setup units using affected names count as changed setup; tested.
  - `[low]` `[patch]` (edge) a replaced first line marks the unit above — `line - 1` marked only for pure removals; tested.
  - `[false]` `[reject]` (edge) trivial edit re-rolls a rejected tree — duplicate of the 3b row.
  - `[low]` `[patch]` (edge) STANDING path newline — flattened as detail is.
  - `[low]` `[patch]` (edge) unavailable entry heading "(no literal XT id) (.)" — now `unavailable (<path>)`.
  - `[low]` `[reject]` (edge) bare `FR-<n>` expands to every `FR-<n>.k` line — fails closed at the prompt cap; no current XT cites a bare id in a way that approaches it.
  - `[medium]` `[patch]` (edge claim) evidence-supplied claim — duplicate of the blind row; same docs fix.
  - `[false]` `[reject]` (edge claim) binding tree claim — duplicate of the `stories/` row.
  - `[low]` `[patch]` (edge claim) undocumented reason — duplicate; same docs fix.
  - `[false]` `[reject]` (intent, existing test changed) `done-check.test.ts` XT-conformance-127 assertion replaced — required by the ruling; stricter, not weaker.
  - `[false]` `[reject]` (intent, surfaces) `tools/story-check` not edited — it shares `reviewTree`/`fidelityVerdicts` by design.
  - `[false]` `[reject]` (intent, clause 1 setup addition) setup change pulls in every XT of the file — a top-level setup is a fixture of every test in the file, within the ruling's "fixture".
  - `[false]` `[reject]` (intent, racy-index unrequested) the mtime fix is a correctness fix for the binding tree this item changes; it made XT-161 deterministic.
  - `[false]` `[reject]` (intent) diff tree includes `stories/` while binding does not — deliberate: reviewers see manifest changes; only the binding ignores them.
  - `[false]` `[reject]` (intent) deleting the record lifts the reject — pre-existing "records are trusted as written" limit.
  - `[low]` `[patch]` (verification-gap) index.ts, setup-helper, replaced-line and two-slot cases untested — added with the fixes.
  - `[low]` `[reject]` (blind) empty-diff check treats a stories-only change as non-empty — a review then runs on a real (manifest) change, which is harmless.

## Design Notes

Top-level units: a new unit starts at a column-0 line that is not `}`/`)`/`]` and where the scanner is outside any string, template, comment or bracket. Comment-only units merge into the next unit. A unit is an import, a declaration (`function|const|let|var|class|interface|type|enum <name>`, optionally `export`/`async`), an XT unit (it holds an `"XT-…-<n>"` literal as a call's first argument, or a `xaravelTest(` call), or setup (anything else). Helpers are declarations in files under a `tests/` path segment; affected names propagate to a fixed point within a file and across relative imports. A changed non-TS file under `tests/` is matched by its basename. These are heuristics; the limits go in the docs.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/fidelity-review.test.ts conformance/tests/xaravel/done-check.test.ts` -- expected: all pass
- `bun run harness --xaravel` -- expected: SUMMARY with no differences
- `bun run typecheck` and `bun run lint` -- expected: clean

## Auto Run Result

Status: done

**Summary.** Per `decisions/ESC-8.8-1.md` (Epic 8 item 2), `tools/fidelity-review` now (1) adds prompt section (e): the full body and cited consequence lines of every Xaravel Test whose lines the diff changes, or that uses a changed test helper or fixture (directly, through another helper, through a relative import including aliases, namespaces and `index.ts`, through top-level setup, or by naming a changed non-TS test file); (2) binds verdicts to a tree that leaves out `stories/` as well as `_bmad-output/`, while the reviewers' diff still shows `stories/`; (3) lets a reject stand: `review` refuses to run on a tree with a recorded reject (prints `STANDING` lines and the reject's findings, exit 1, nothing recorded), and counting never lets a later pass in that slot on that tree override it. It also fixes a racy-git miss in the temporary index (same-size, same-second edits).

**Files changed.**
- `tools/fidelity-review/fidelity-review.ts` -- section (e) scanner and evidence, `BOOKKEEPING` binding tree, `standingRejects`, refusal, index mtime fix.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- XT-conformance-161/162 assertions for every I/O matrix row and review patch.
- `conformance/tests/xaravel/done-check.test.ts` -- XT-conformance-127: a later pass no longer replaces a reject on the same tree (the ruled behaviour; stricter).
- `docs/ops/fidelity-review.md`, `docs/ops/done-check.md` -- (e), binding tree, standing reject, limits.
- `_bmad/custom/bmad-build-auto.toml` -- the `fidelity-review` layer's standing-reject rule.

**Review.** 38 findings: 22 patched (7 medium, 15 low entries incl. duplicates), 0 deferred, 16 rejected with reasons in the triage log (mainly: the ruling names `stories/` and defines the reject on an unchanged tree, so finer binding or finding-tracking is beyond it; both are documented limits).

**Follow-up review recommended: true.** 7 medium entries were patched. Unverified risk: section (e) has not run on Story 8.8's real diff; its size against `PROMPT_CAP` and its selection there are first exercised by Story 8.8's re-run.

**Verification.** `bun test` of both test files 7/7 pass; `bun run harness --xaravel` 286/286, SUMMARY differ=0; `bun run typecheck` and `bun run lint` clean.

**Residual risks.** The scanner is a heuristic lexer (limits in the docs). Leaving all of `stories/` out of the binding tree means a manifest scope edit after review keeps verdicts current (per ESC-8.8-1; documented). Any non-bookkeeping tree change lifts a standing reject.
