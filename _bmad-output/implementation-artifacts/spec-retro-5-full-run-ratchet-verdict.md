---
title: 'The done check full-run clause reads the ratchet story step and passes on the Ratchet verdict (retro epic-5 item 15, ESC-5.9-2)'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '58f0393d7e905468f9cdf6762caebb16fd248dd5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/ESC-5.9-2.md'
  - '{project-root}/conformance/escalations/ESC-5.9-2.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `story:check`'s `full-run` clause reads whichever `SUMMARY` the PR `ratchet` job printed last and requires `differ=0`. The Maintainer's ruling ESC-5.9-2 says it must read the `ratchet story` step's SUMMARY (the Story's `test_ids`, every Variant, not fast) and pass on the Ratchet's own verdict (job `success`, `failures=0`, no unwarned unexpected pass), so a warned difference a Story may not fix never fails it. Today `ratchet story` also just forwards the harness exit, so any warned difference fails the job.

**Approach:** `ratchet story` classifies its harness differences with the same `classify` and fail-closed rules as `ratchet run` and ends with a verdict line `STORY ref=<r> failures=<f> passes=<p> warnings=<w>`, exiting 1 only when `failures + passes > 0`. `fullRunClause` finds the last `STORY ref=` line in the job log and the last SUMMARY between the preceding `RATCHET ` line and it, and passes on that verdict instead of `differ=0`.

## Boundaries & Constraints

**Always:** The job `conclusion` checks stay first and unchanged (log fetched only on `success`). The STORY SUMMARY must still satisfy `isFullRun`. `STORY ref=<r> skipped: no test_ids` passes the clause (the ruling's 10.1 case: nothing of the Story's to run). Fail closed: no STORY line, an unreadable one, `skipped: not a Story ref`, no SUMMARY in the story segment, or a harness precondition failure all fail. Classification reuses `classify`/`openManifests` from `tools/ratchet/ratchet.ts` (one implementation, lesson epic 4). Changed expected values in Xaravel Tests follow the ruling; the test cases stay and gain rows.

**Never:** Do not touch `conformance/expectations/**`, any `packages/**`, `.github/workflows/*`, `conformance/protected-paths`, `tools/ownership/`, `AGENTS.md`, `epics.md` or the spine. Do not change `ratchet run`'s output or exit rules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| story clean | harness exit 0, no differences | report, then `STORY ref=story/x failures=0 passes=0 warnings=0`; exit 0 | — |
| story warned pass only | unexpected pass on a line no open Story / another open Story owns | report, `WARNING …` line (+ `::warning::` under Actions), `STORY … failures=0 passes=0 warnings=1`; exit 0 | — |
| story own failure/pass | FAIL, or UNEXPECTED-PASS the ref's open Story owns | `UNEXPECTED-FAILURE …` / pass line, STORY counts; exit 1 | — |
| story no SUMMARY / exit≠0 with no difference | precondition failure / silent crash | exit 1 with err message / `UNEXPECTED-FAILURE harness exited <n> with no counted difference` counted | fail closed |
| clause pass | success; story segment full SUMMARY; `STORY … failures=0 passes=0 warnings=<w>` | `PASS full-run: <where>: <SUMMARY>; <STORY line>` even if SUMMARY `differ>0` | — |
| clause no test_ids | success; last STORY line `… skipped: no test_ids` | `PASS full-run: <where>: <STORY line>` | — |
| clause failed verdict | `failures>0` or `passes>0` | `FAIL full-run: <where>: <STORY line> failed` | exit 1 |
| clause no STORY line | success; log has none | `FAIL full-run: <where>: the log has no STORY line from the ratchet story step` | exit 1 |
| clause not a Story run / unreadable | `skipped: not a Story ref` or malformed | `FAIL full-run: <where>: <STORY line> is not a Story verdict` | exit 1 |
| clause no story SUMMARY / fast | no SUMMARY after the last RATCHET line before STORY; or `mode=fast` | `… the ratchet story step printed no SUMMARY line` / `… <SUMMARY> was a fast run` | exit 1 |

</intent-contract>

## Code Map

- `tools/ratchet/ratchet.ts` -- `runRatchet` (~line 199): post-harness verdict logic (precondition check, `classify`, `::warning::` annotation, silent-crash failure, exit rule) to extract into a shared helper used by both commands. `runStoryTests` (~line 251): after the harness, read `openManifests(root)` (fail closed on error), apply the helper, out = harness `out` lines, then verdict lines, then the STORY line; harness `err` stays err. Header comment (`story` entry ~line 86, exit codes ~line 97).
- `tools/story-check/story-check.ts` -- `fullRunClause(where, conclusion, log)` (~line 342) and `lastSummary` (~line 330, keep exported, same behaviour); header `full-run` entry (~line 46). `githubClauses` unchanged.
- `conformance/tests/xaravel/ci-pipeline.test.ts` -- XT-conformance-202 (line 266) story part (~lines 328-354): `forwarded` and real-CLI expectations gain the STORY line; add a warned-only case (exit 0) and an own-failure case through the injected `harness` (`fakeHarness` with `differences`); description's "forwards the harness's exit" becomes "exits on the Ratchet's verdict".
- `conformance/tests/xaravel/done-check.test.ts` -- XT-conformance-127: `LOG_FULL`/`LOG_FAST` (line 309) become two-step logs (run SUMMARY + RATCHET, then story SUMMARY + STORY line); expected PASS text (line 367), fast text (line 396), and the `differed` pure case (line 514) move to the new rules; add the matrix's clause rows as pure `fullRunClause` calls.
- `docs/ops/done-check.md:61`, `docs/ops/ratchet.md:17,53-58` -- document the new clause and the `story` verdict line / exit rule.
- Read-only: `conformance/harness/harness.ts:241` `isFullRun`; `.github/workflows/ratchet.yml` (story step runs after `run --scope`; job log holds both steps' stdout/stderr in order).

## Tasks & Acceptance

**Execution:**
- `tools/ratchet/ratchet.ts` -- shared verdict helper; `runStoryTests` classifies and prints the STORY line; header -- ruling part (2) at the source.
- `tools/story-check/story-check.ts` -- new `fullRunClause` reading the story segment and verdict; header -- ruling parts (1) and (2).
- `conformance/tests/xaravel/ci-pipeline.test.ts`, `conformance/tests/xaravel/done-check.test.ts` -- update and add every matrix row.
- `docs/ops/done-check.md`, `docs/ops/ratchet.md` -- document.

**Acceptance Criteria:**
- Given a PR whose latest `ratchet` job concluded `success`, whose story step printed a full SUMMARY with `differ=1` and `STORY ref=story/9.1 failures=0 passes=0 warnings=1`, when `bun run story:check 9.1` runs, then `full-run` PASSes.
- Given a log whose last SUMMARY is the scope run's (no STORY line), when the clause runs, then it FAILs with `the log has no STORY line from the ratchet story step`.
- Given the repository, when `bun test`, `bun run typecheck`, `bun run lint`, `bun run ownership:check` and `bun run escalations:check` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 16 findings — high 0, medium 1, low 9, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) The STORY line's `ref` is not checked against the Story under check. The log comes from the `ratchet` job of the PR head SHA, and `githubClauses` already requires that PR's head to be `story/<id>`; the step's ref is that head ref. It cannot happen through the workflow, and the guard would add a parameter.
  - `[false]` `[reject]` (blind) "Every Variant" is not enforced: `not-run=4` passes. Under `CI=true` the NOT-RUN of an alpha Variant is an `UNEXPECTED-FAILURE` in the classified verdict, so `failures=0` already proves every alpha Variant ran; the remaining `not-run` count is non-alpha Variants.
  - `[low]` `[reject]` (blind) `story` keeps the harness report on stdout while `run` sends it to stderr, so each difference prints twice. This is cosmetic, and the spec chose to keep `story`'s existing stdout report. The docs describe that layout accurately.
  - `[low]` `[patch]` (blind) `runStoryTests` reads the manifests after the full harness run. Patched: the read moved before the harness, as in `runRatchet`.
  - `[medium]` `[patch]` (blind + verification-gap) The unreadable-manifests fail-closed path in `runStoryTests` has no test, so a fail-open regression (`open = []` turns the Story's own pass into a warning) would go unseen. Patched: an XT-conformance-202 case with an invalid second manifest asserts exit 1, the stderr message, no STORY line and no harness call.
  - `[low]` `[reject]` (blind) No injected-harness test for the clean case. The real-CLI run of `story/11.1` covers it (exit 0, `failures=0 passes=0 warnings=0`).
  - `[low]` `[patch]` (blind) The story precondition message is built by slicing `PRECONDITION`. Patched: one shared message body, prefixed per command.
  - `[false]` `[reject]` (blind) With no `RATCHET` line, the SUMMARY scan runs to the top of the log. The clause runs only on a job that concluded `success`, and in that job the `run --scope` step exited 0. That step always prints its `RATCHET` line on exit 0, scope `none` included, so a success log always has the bound.
  - `[low]` `[reject]` (blind) `lastSummary` is no longer called by production code. It is exported, and XT-conformance-127 tests it. Removing it means deleting a test assertion, so the spec keeps it.
  - `[low]` `[reject]` (blind) `docs/ops/ratchet.md:17` and the header's exit-code paragraph were not updated. Both already say "1 when failures + passes > 0 … warnings never do", which is now true of `story` as well.
  - `[low]` `[reject]` (blind) The ACs do not cover the `ratchet story` side. The fix would edit this build's spec. The matrix rows for `story` are tested in XT-conformance-202.
  - `[false]` `[reject]` (blind) Nothing shows end to end that a story step exiting 0 leaves the job `success`. A job's conclusion is `success` when every step exits 0, which is how GitHub Actions works. The workflow's comment at `ratchet.yml:19` says only that `story` runs the Story's `test_ids` in full, which is still true.
  - `[false]` `[reject]` (blind) `ratchet.yml:19` is out of date. It describes no exit behaviour (see above).
  - `[low]` `[reject]` (edge) The STORY line's ref is not this Story's. This has the same root cause as the first row, and it cannot happen through the workflow.
  - `[false]` `[reject]` (edge) `skipped: no test_ids` passes although the local manifest has `test_ids`. The `tests` clause runs the local manifest's `test_ids` in full and fails on any problem, so the Story cannot pass `story:check` without its own tests passing. The Ratchet reads the base manifest, which is the same one once the manifest has merged.
  - `[false]` `[reject]` (intent) The diff takes reading B: it changes `ratchet story`'s exit and adds a new STORY line rather than reading the scope run's `RATCHET` line. Readings A and C leave a warned pass in the story step failing the job. That contradicts the ruling's own condition (job `success` with no unwarned pass) and its rationale, so B is the only reading that meets all three conditions. No grader is weakened: warned passes already do not fail `run`, and the merge-queue Ratchet stays the gate for the whole suite.

## Design Notes

The story step's segment is bounded by the last `RATCHET ` line before the STORY line, because the `run --scope` step (which always ends in `RATCHET …`) precedes it in the same job log; with `scope=none` that step prints no SUMMARY at all, so the bound also stops a scope SUMMARY from being taken. A STORY verdict line rather than a `RATCHET` one keeps the two steps distinguishable and extends the existing `STORY ref=<r> skipped: …` vocabulary.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/done-check.test.ts conformance/tests/xaravel/ci-pipeline.test.ts conformance/tests/xaravel/ratchet.test.ts` -- expected: pass
- `bun test` / `bun run typecheck` / `bun run lint` -- expected: pass
- `bun run ownership:check` and `bun run escalations:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** `ratchet story` now grades its run like `ratchet run` does: the same `classify`, `::warning::` annotations and fail-closed rules, with the manifests read before the harness. It ends with `STORY ref=<r> failures=<f> passes=<p> warnings=<w>` and exits 1 only when `failures + passes > 0`, so a run whose only differences are warned passes no longer fails the PR `ratchet` job. `story:check`'s `full-run` clause still checks the job conclusion first, then reads the `ratchet story` step. That is the log's last `STORY ref=` line, together with the last SUMMARY after the preceding `RATCHET ` line, which must be a full run. The clause passes on `failures=0 passes=0` (or `skipped: no test_ids`) instead of SUMMARY's `differ=0`, as ruling ESC-5.9-2 asks.

**Files changed.**
- `tools/ratchet/ratchet.ts`: shared `judge` helper; `runStoryTests` classifies and prints the STORY verdict; one shared precondition message; header.
- `tools/story-check/story-check.ts`: `fullRunClause` reads the story step's segment and verdict; `logLines` helper; header.
- `conformance/tests/xaravel/ci-pipeline.test.ts` (XT-conformance-202): verdict cases for warned-only, own pass plus failure, precondition failure, unreadable manifests and the silent crash; the real-CLI output now ends with the STORY line; the description is updated.
- `conformance/tests/xaravel/done-check.test.ts` (XT-conformance-127): two-step job logs; the end-to-end PASS is on a warned `differ=1` story run; a pure case for every clause row of the matrix.
- `docs/ops/done-check.md`, `docs/ops/ratchet.md`: the new clause, and the `story` verdict and exit rule.

**Review.** 16 findings: high 0, medium 1, low 9, false 6.
- Patched 3: 1 medium (no test for the unreadable-manifests path) and 2 low (manifests read after the harness; message built by slicing).
- Deferred: none.
- Rejected 13, each with its reason in the Review Triage Log.

**Follow-up review:** not recommended. One medium and no high finding were patched.

**Verification.** `bun test` (242 pass, 0 fail), `bun run typecheck`, `bun run lint` (oxlint type-aware plus disables), `bun run ownership:check` and `bun run escalations:check` all pass.

**Residual risk.** The new `ratchet story` output only takes effect in CI after merge: `pull_request_target` runs the base's tool. Until then, a log from an older job has no STORY verdict, and the clause fails closed on it. No live `story:check` was run, since no `story/*` PR exists for this planning change.
