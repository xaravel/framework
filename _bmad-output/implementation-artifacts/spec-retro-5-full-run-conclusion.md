---
title: 'The done check full-run clause requires the ratchet job to conclude success, and Stories 5.7-5.10 manifests say done (retro epic-5 item 3)'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '87ac73920427529500b6df85f1996aa7bc2a9af0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md'
  - '{project-root}/conformance/escalations/ESC-5.9-2.md'
warnings: []
deferred:
  - summary: >-
      Retro item 3's third part, a check that fails when a sprint-status done Story's manifest is not done, was not built and waits on the Maintainer.
    evidence: |-
      story-manifests.md:6 makes sprint status the only authority and says Story PRs never edit stories/*.md. allowedPath (tools/ownership/ownership.ts:428) does not let an Epic 9+ story/* PR edit stories/, so every such PR that marks itself done would fail the check. AGENTS.md: a conflict with an AD is raised to the Maintainer, never decided locally.
    location: >-
      _bmad-output/implementation-artifacts/story-manifests.md:6
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `story:check`'s `full-run` clause reads the `ratchet` job's last SUMMARY line but never the job's conclusion, so a job that failed (`UNEXPECTED-FAILURE harness exited <n> with no counted difference`) or was cancelled after its last SUMMARY still passes on `differ=0` (Epic 5 retro C3). Separately, `stories/5.7.md`…`5.10.md` still say `status: backlog` though sprint status marks all four `done` (S1).

**Approach:** Give `fullRunClause` the `ratchet` job's `conclusion` and fail the clause unless it is exactly `success`, checked before the SUMMARY. Set the four manifests to `status: done`. Retro item 3's third part, a check that fails when a sprint-status `done` Story's manifest is not `done`, is not built here (see Design Notes); the item stays `in-progress` and waits on the Maintainer.

## Boundaries & Constraints

**Always:** The clause still passes only when the job concluded `success` **and** the last SUMMARY is a full run (`isFullRun`) with `differ=0`; this change only adds a condition. The job's conclusion comes from the `/actions/runs/<id>/jobs` response that `githubClauses` already fetches. Existing assertions keep their expected values; test fixtures gain `conclusion` fields and the tests gain cases.

**Never:** Do not change which SUMMARY counts or replace `differ=0` with the Ratchet's verdict: that is ESC-5.9-2, waiting on the Maintainer. Do not touch `tools/ownership/`, `tools/ratchet/`, `conformance/protected-paths`, `.github/workflows/*`, `AGENTS.md`, `epics.md` or the spine. Do not change any manifest field other than `status` in the four files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Job succeeded, full, differ=0 | conclusion `success`, full SUMMARY `differ=0` | `PASS full-run: <where>: <SUMMARY>` (unchanged text) | — |
| Job failed | conclusion `failure`, log with full SUMMARY `differ=0` | `FAIL full-run: <where>: the ratchet job concluded failure, not success` | exit 1 |
| Job cancelled | conclusion `cancelled` | `FAIL full-run: <where>: the ratchet job concluded cancelled, not success` | exit 1 |
| Job not finished | conclusion `null` or absent | `FAIL full-run: <where>: the ratchet job has not finished` | exit 1 |
| Success but fast / differed / no SUMMARY | conclusion `success` | the existing `… was a fast run`, `… differed`, `the log has no SUMMARY line` | exit 1 |

</intent-contract>

## Code Map

- `tools/story-check/story-check.ts` -- `fullRunClause(where, log)` at ~line 332: add a required `conclusion: string | null` parameter, checked first. `interface Job` (~line 358): add `readonly conclusion?: string | null`. `githubClauses` (~line 425): pass `job.conclusion ?? null`. Header comment `full-run` entry (~line 41) gains the conclusion condition.
- `conformance/tests/xaravel/done-check.test.ts` -- `FakeGitHub.jobs` type (line 249) gains `conclusion?: string | null`; `fakeGitHub()` jobs (line 337) get `conclusion: "success"`; the inline job at line 378 too. XT-conformance-127 pure-piece calls at lines 483 and 501 pass `"success"`; add the matrix's failed, cancelled and unfinished rows as pure calls and one CLI case through `withGitHub` where job 99 concluded `failure` with `LOG_FULL`.
- `docs/ops/done-check.md:61` -- the `full-run` row gains the conclusion condition and its two failure messages.
- `stories/5.7.md`, `5.8.md`, `5.9.md`, `5.10.md` -- `status: backlog` → `status: done`.
- Read-only: `tools/ownership/ownership.ts:330` (`applySprintStatus`), `tools/ratchet/ratchet.ts:170-177` (`openManifests`) and `tools/escalations/escalations.ts:420` already resolve status from sprint status; `_bmad-output/implementation-artifacts/story-manifests.md:6` documents that authority.

## Tasks & Acceptance

**Execution:**
- `tools/story-check/story-check.ts` -- add the conclusion parameter, the `Job.conclusion` field, pass it, update the header -- closes C3.
- `conformance/tests/xaravel/done-check.test.ts` -- fixtures gain `conclusion: "success"`; add every matrix row -- pins the new condition.
- `docs/ops/done-check.md` -- document the condition.
- `stories/5.7.md`…`5.10.md` -- `status: done` -- closes the current S1 drift.
- `_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md` -- under S1, record why the sync check was not built.

**Acceptance Criteria:**
- Given a PR whose latest `ratchet` job concluded `failure` but whose log ends in a full `differ=0` SUMMARY, when `bun run story:check <id>` runs, then `full-run` FAILs with `the ratchet job concluded failure, not success` and the command exits 1.
- Given the repository, when `bun test`, `bun run typecheck`, `bun run lint`, `bun run ownership:check` and `bun run escalations:check` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 18 findings — high 0, medium 3, low 12, false 2, maybe-false 1
- findings:
  - `[medium]` `[patch]` (verification-gap) No CLI case sends an unfinished (`null`/absent) job through `githubClauses`, so the `?? null` mapping is untested. Patched: two `withGitHub` cases (`conclusion: null`, field absent) assert `the ratchet job has not finished`, exit 1 and no log request.
  - `[medium]` `[patch]` (edge) The log is fetched before the conclusion is checked, so an in-progress job whose log endpoint 404s reports `cannot check: … HTTP 404`, not `has not finished`. Patched: `githubClauses` fetches the log only after a `success` conclusion.
  - `[medium]` `[patch]` (edge) The "checked first" claim in the spec matrix is false at the CLI for the same reason. Same patch as above.
  - `[low]` `[patch]` (edge) `docs/ops/done-check.md` says the conclusion is checked first while the CLI could report an HTTP error. The same patch makes the doc true.
  - `[maybe-false]` `[reject]` (blind) Same root cause as the log-before-conclusion finding (GitHub may serve no log for a running job). Covered by that patch.
  - `[low]` `[reject]` (blind) The diff says item 3 "stays `in-progress`" while sprint status says `open`. The orchestrator sets it `in-progress` with SPS in the same PR (iteration step D), outside this build.
  - `[low]` `[reject]` (blind) S1's original sentence (ratchet treats them as open) still reads as stated, and H1/C2/C3 has no note that C3 landed. The S1 follow-up corrects the premise. The PR and the status issue record that C3 landed. A retro document is not rewritten after the fact.
  - `[low]` `[reject]` (blind) The sync check is dropped with no tracked artifact. The orchestrator records the item in `retro-gates.yaml` `waiting_on_maintainer` and on the status issue (iteration step D), which is the route for an item it may not finish.
  - `[false]` `[reject]` (blind) Editing the Protected Path `stories/` on a `planning/*` branch is unauthorised. The MAINT-2026-10-16 ruling approves orchestrator PRs that change Protected Paths, and the action item explicitly asks for these four edits.
  - `[low]` `[reject]` (blind) No CLI test with the `conclusion` field absent. Patched together with the null case above.
  - `[low]` `[reject]` (blind) No case for `skipped`, `timed_out` or `neutral`. Every non-`success` value takes the same branch, and `failure` and `cancelled` already pin it. More cases would add tests, not coverage.
  - `[low]` `[reject]` (blind) The cancelled and unfinished rows are tested only as pure calls. The unfinished row is now also covered through the CLI, and cancelled shares the `failure` code path that the CLI case tests.
  - `[low]` `[reject]` (blind) The acceptance criteria are narrower than the matrix, and verification omits `bun run harness` and a live `story:check`. The matrix rows are all tested. CI runs the harness. A live `story:check` needs a `story/*` PR, and none exists for this planning change.
  - `[low]` `[reject]` (blind) The rationale appears twice (spec Design Notes and the retro follow-up). The spec is the build record and the retro note is the reader's pointer. They serve different readers, and neither is maintained afterwards.
  - `[low]` `[patch]` (blind) The header comment attaches the conclusion to "that job's log". Reworded to name the jobs response as the source.
  - `[low]` `[reject]` (blind) The docs do not say which attempt of a re-run counts. This predates the change: the job lookup and its default `filter=latest` are unchanged.
  - `[medium]` `[defer]` (intent) Part (c) of the intent, a check that fails when a sprint-status `done` Story's manifest is not `done`, is not built. It conflicts with AD-16 as the repo applies it (`story-manifests.md:6`; `allowedPath` bars `stories/` on Epic 9+ `story/*` PRs, so every such done-PR would fail). AGENTS.md says such a conflict is never decided locally, so it goes to the Maintainer (Design Notes).
  - `[false]` `[reject]` (intent) "The run-level conclusion might be meant." The intent says "ratchet job conclusion", which is what the diff reads.

## Design Notes

The sync check was not built because it conflicts with the repo's rules. `story-manifests.md:6` makes sprint status the only authority: "Story PRs update sprint status, never `stories/*.md` (a Protected Path)". `allowedPath` in the ownership check does not let a `story/*` PR from Epic 9 on edit `stories/`. If a check required the manifest to match, every Epic 9+ Story PR that marks itself `done` would fail it, because that PR cannot edit its own manifest. S1's stated harm is also already handled: `openManifests`, `ownership manifests` and `escalations` all read the effective status through `applySprintStatus`, so 5.7–5.10 are not counted as open. Whether manifests should mirror sprint status, and who updates them from Epic 9 on, is a decision for the Maintainer.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/done-check.test.ts` -- expected: pass
- `bun test` / `bun run typecheck` / `bun run lint` -- expected: pass
- `bun run ownership:check` and `bun run escalations:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** `story:check`'s `full-run` clause now fails unless the PR head's latest `ratchet` job concluded `success`. The log is read only after that, so an unfinished job reports `the ratchet job has not finished` and a failed or cancelled one reports `the ratchet job concluded <c>, not success` (retro C3). `stories/5.7.md`…`5.10.md` now say `status: done` (S1). The sync check (item 3, part 3) was not built (Design Notes) and waits on the Maintainer.

**Files changed.**
- `tools/story-check/story-check.ts`: `fullRunClause(where, conclusion, log)`, `Job.conclusion`, log fetched only on `success`, header comment.
- `conformance/tests/xaravel/done-check.test.ts`: fixtures gain `conclusion: "success"`; pure cases for success, failure, cancelled and null; CLI cases for failure, null and absent (no log request).
- `docs/ops/done-check.md`: the `full-run` row.
- `stories/5.7.md`, `5.8.md`, `5.9.md`, `5.10.md`: `status: done`.
- `_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md`: S1 follow-up note.

**Review.** 18 findings. Patches: 3 medium (log fetched before the conclusion check, two rows; missing CLI null/absent case) and 2 low (doc claim, header wording). Deferred: 1 medium (the sync check, waits on the Maintainer). Rejected: 12, each with its reason in the Review Triage Log above.

**Follow-up review:** not recommended. No `high` was patched, and the medium patches are covered by the new CLI cases.

**Verification.** `bun test`: 237 pass, 0 fail. `bun run typecheck`, `bun run lint`, `bun run ownership:check` (277 manifests, 236 open) and `bun run escalations:check` all exit 0. The `escalations:check` warnings for ESC-5.7-1, 5.8-1, 5.9-1 and 5.9-2 were there before this change too.

**Residual risk.** That a real GitHub `ratchet` job concludes `failure` when the Ratchet exits `UNEXPECTED-FAILURE` is checked only against the fake API, not a live run.
