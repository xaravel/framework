---
title: 'Harden the dashboard workflow against a missing Expectations check and stale re-runs (Epic 7 retro item 6)'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: 'c614ef46257b7a4d0aad3da12c253f119430f01f'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `dashboard.yml` computes the report without running `expectations:check`, so an Inventory ID with no Expectations line silently leaves the denominator and the shrunken rate is published (retro L4). A re-run of an older dashboard run appends its record after newer ones and replaces the site with stale figures, because neither `conformance:history` nor `conformance:publish` checks the source commit against what is already there (retro L5; records `[v1, v2, v1 (re-run), v2]` drew three Pin-change markers where one was real).

**Approach:** Add a `bun run expectations:check` step before `conformance:report`. Give history and publish one shared guard: the source commit may be recorded or published only when it is the last recorded/published source commit itself, a descendant of it, or the current tip of `main` on the remote; otherwise the tool refuses (exit 1) and pushes nothing. History reads the last source from the last line of `history.jsonl`; publish records the full source commit as a `Source-Commit:` trailer on each `gh-pages` commit and reads it back (falling back to the existing `conformance site: <12-hex>` subject).

## Boundaries & Constraints

**Always:** The guard runs on every attempt, after the branch tip is fetched, before any commit is built, so a refused run never pushes. History's source is `report.commit`; publish's is `HEAD` (full 40-hex). "Descendant" is `git merge-base --is-ancestor <last> <source>`; a `<last>` absent from the local object store is not an ancestor. The `main` tip is `git ls-remote <remote> refs/heads/<main-branch>`, looked up only when the ancestry test fails, with a new `--main-branch <branch>` flag (default `main`) on both CLIs. An empty or missing history, or a missing `gh-pages` branch, accepts any source. A `gh-pages` tip with no readable source accepts only the `main` tip. The refusal message names the source, the last commit (or `unknown`) and the `main` tip (or `missing`). `null`, never `undefined`.

**Never:** Do not touch `packages/**`, `conformance/expectations/**`, `AGENTS.md`, protected-path or ownership tooling. Do not remove or weaken any existing assertion in XT-conformance-145 or XT-conformance-146; only extend them (the workflow-shape assertions gain the new step). No force pushes, no new Test IDs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First record / first publish | no branch or empty history | created | — |
| Same commit (re-run of latest, Pin change) | last == source | already recorded / appended / unchanged as today | — |
| Next push | source descends from last | appended / updated | — |
| Re-run of older run | last descends from source; main tip is newer | refused, exit 1, branch tip unchanged | `refusing <source>: …` on stderr |
| Older run but it is the main tip | source == remote main tip | accepted | — |
| Last commit unknown locally | last not in object store, source not main tip | refused | message says not a descendant |
| Old-format gh-pages tip | subject `conformance site: <12-hex>`, no trailer | 12-hex resolved as last source | unresolvable → only main tip accepted |
| Workflow | `dashboard.yml` | `expectations:check` runs after install, before `conformance:report` | a failing check stops the job |

</intent-contract>

## Code Map

- `tools/conformance-report/history.ts:131-139` -- `fetchTip`; add the exported guard beside it (e.g. `checkSource(root, remote, mainBranch, source, last): void`, throwing `HistoryError`) and a `remoteTip` helper reusing `ls-remote`.
- `tools/conformance-report/history.ts:142-198` -- `buildCommit`/`appendHistory`: take the last non-empty line's `commit` as last source; call the guard each attempt before building. `appendHistory` options gain `mainBranch`.
- `tools/conformance-report/history.ts:203-287` -- CLI flags/USAGE: `--main-branch` (validated with `check-ref-format` like `--branch`); header comment documents the guard.
- `tools/conformance-report/publish.ts:84-113` -- `publishSite`: full `HEAD` as source (refuse when there is none), last source from the tip's `Source-Commit` trailer or old subject, guard each attempt before the tree compare; commit message gains `-m "Source-Commit: <full>"`. Options gain `mainBranch`; CLI gains `--main-branch`.
- `.github/workflows/dashboard.yml:58-63` -- insert `Check the Expectations File` step (`bun run expectations:check`) between install and report; update the header comment.
- `conformance/tests/xaravel/conformance-report.test.ts:328-460` -- XT-conformance-145; its workflow assertions (`runs.slice(0, 2)`, `runs.length` 5, `runs[2]`) must account for the new step.
- `conformance/tests/xaravel/dashboard.test.ts:298-349`, `:384-391` -- XT-conformance-146 publish block and `lastLines`/`withToken` indices.
- `docs/ops/conformance-report.md:84-94`, `:124-134`, `:148`, `:167-169` -- History, Publish, Workflow, Tests sections.

## Tasks & Acceptance

**Execution:**
- `tools/conformance-report/history.ts` -- guard, `--main-branch`, apply to append.
- `tools/conformance-report/publish.ts` -- trailer, last-source read, guard, `--main-branch`.
- `.github/workflows/dashboard.yml` -- `expectations:check` step and comment.
- `conformance/tests/xaravel/conformance-report.test.ts` -- extend XT-conformance-145: a second caller commit descending from the first appends; a re-run of the first commit after it is refused with the branch unchanged; the same with the remote `main` at the first commit is accepted; an unknown last commit is refused; workflow assertions include `expectations:check` before the report.
- `conformance/tests/xaravel/dashboard.test.ts` -- extend XT-conformance-146: publish commits carry `Source-Commit: <head>`; a newer commit publishes; publishing from the older commit is refused with `gh-pages` unchanged; an old-format tip resolves via its subject; workflow `lastLines` include the check.
- `docs/ops/conformance-report.md` -- document the guard, trailer, `--main-branch`, the new step, and the tests.

**Acceptance Criteria:**
- Given a dashboard run, when it starts, then `expectations:check` runs before `conformance:report` and a failure stops the job before any push.
- Given a history or site already holding a newer commit, when an older run is re-run, then the tool exits 1 with a `refusing` message and the branch tip is unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 19, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) Docs say an older re-run fails unless main tip, but a descendant of the last record is accepted — docs and workflow comment now say "older than the last record".
  - `[low]` `[patch]` (blind) The guard needs `fetch-depth: 0`, undocumented — docs and workflow comment name it as a second reason.
  - `[low]` `[reject]` (blind) History judges `report.commit`, publish `HEAD`, never compared — both come from the same checkout in `dashboard.yml`; a mismatch check guards a hand-run case no workflow reaches.
  - `[low]` `[reject]` (blind) No test forces a non-fast-forward rejection, so the per-attempt guard placement is unproven — needs a remote hook or an injectable push; the concurrency group makes the race rare; complexity for an uncommon case.
  - `[low]` `[patch]` (blind) Publish has no case for a trailer naming an unknown object — XT-conformance-146 adds it.
  - `[low]` `[patch]` (blind) No-HEAD publish refusal untested — XT-conformance-146 adds a no-commit caller.
  - `[low]` `[patch]` (blind) `--main-branch` tested only against a missing branch — a test now accepts via a real `trunk` tip.
  - `[low]` `[patch]` (blind) Refusal says "last recorded source" for publish — wording now covers recorded or published.
  - `[low]` `[reject]` (blind) Trailer regex matches anywhere in the message — `gh-pages` is written only by the bot; the subject starts `conformance site:` so cannot match `^Source-Commit:`; tampering needs write access the guard does not defend against.
  - `[low]` `[reject]` (blind) Ambiguous 12-hex fallback returns null — one-time transition from the current old-format tip; null still lets the main-tip run publish and writes a trailer.
  - `[low]` `[reject]` (blind) `history.jsonl` read twice per attempt — one extra `cat-file`, negligible; refactor gains nothing observable.
  - `[low]` `[patch]` (blind) `remoteTip` tail-matches `ls-remote` — `--heads` and an exact ref match.
  - `[low]` `[patch]` (blind) Overlap with `ci.yml`'s `expectations:check` unexplained — docs say it is a second line of defence (admin merges skip the queue).
  - `[false]` `[reject]` (blind) Spec bookkeeping incomplete — the triage log and status are filled by this step; the fix edits this spec.
  - `[low]` `[patch]` (edge-case) Non-hex `last`/`source` reach `merge-base` as a revision or option — non-hex `last` is unknown, non-hex `source` refused.
  - `[low]` `[patch]` (edge-case) `remoteTip` may pick the wrong ref — same fix as the blind row.
  - `[low]` `[patch]` (verification-gap) The check step could gain `continue-on-error`/`if:` unnoticed — XT-conformance-145 now asserts both absent.
  - `[low]` `[reject]` (verification-gap) Guard re-run on retry untested — filed `defer`; same as the blind retry row, rejected for the same reason.
  - `[low]` `[patch]` (verification-gap) No-HEAD refusal untested — same as the blind row.
  - `[false]` `[reject]` (intent) The main-tip escape accepts an older commit — the intent's literal rule is "the origin/main tip or a descendant"; reaching it needs `main` rewound, which the merge queue never does.
  - `[low]` `[patch]` (intent) Header exit-code comment omits the refusal — the exit 1 description now names it.
  - `[false]` `[reject]` (intent) The publish guard is not reached in CI on a stale re-run — history fails first by design; publish keeps its own guard for direct runs and is tested in XT-conformance-146.
  - `[false]` `[reject]` (intent) Trailer, `--main-branch`, no-HEAD refusal go beyond the one-line intent — they are the means to read the last published commit and the configurable `origin/main`.
  - `[false]` `[reject]` (intent) `origin/main` made configurable — defaults equal the intent.

## Design Notes

The `main`-tip escape keeps the normal push run working when the last source cannot be proven (old-format tip, missing object) without disabling the guard. Under the `dashboard` concurrency group a newer push's run only ever follows an older run, so a non-tip run that descends from the last record is still accepted.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/conformance-report.test.ts conformance/tests/xaravel/dashboard.test.ts` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run harness --xaravel` -- expected: differ=0

## Auto Run Result

Status: done

- **Change:** `dashboard.yml` runs `bun run expectations:check` after the install and before `conformance:report`, so an Expectations File that does not cover the Inventory stops the job before anything is computed or pushed (retro L4). `conformance:history` and `conformance:publish` share a source guard (`checkSource` in `history.ts`): the source commit must be the last recorded or published source, a descendant of it, or the remote `main` tip; otherwise they exit 1 with `refusing <source>: …` and push nothing (retro L5). Publish records its full source as a `Source-Commit:` trailer and reads it back, falling back to the old `conformance site: <12-hex>` subject.
- **Files:** `tools/conformance-report/history.ts` (guard, exact-ref `remoteTip`, non-hex handling, `--main-branch`); `tools/conformance-report/publish.ts` (trailer, `publishedSource`, guard, no-HEAD refusal, `--main-branch`); `.github/workflows/dashboard.yml` (new step, header); `conformance/tests/xaravel/conformance-report.test.ts` (XT-conformance-145 extended: descendant append, stale refusals, main-tip and `--main-branch` acceptance, unknown last commit, workflow step order, no `if`/`continue-on-error`); `conformance/tests/xaravel/dashboard.test.ts` (XT-conformance-146 extended: trailer, newer publish, stale refusal, old-format and unresolvable tips, unknown trailer object, no-HEAD caller, workflow lines); `docs/ops/conformance-report.md` (guard, trailer, flag, step, `fetch-depth: 0` reason, tests).
- **Review:** 24 findings; 13 low rows patched, 6 low rejected (retry race untested ×2, `report.commit` vs `HEAD`, trailer regex, ambiguous 12-hex fallback, double read), 5 false; none deferred. Patched by verdict: high 0, medium 0, low 13.
- **Follow-up review:** false (no high or medium patched).
- **Verification:** `bun test` on both files 6 pass; `bun run typecheck`, `bun run lint` clean; `bun run harness --xaravel` 265/265, differ=0; `bun run expectations:check` passes on the real tree.
- **Residual risk:** the guard re-running after a non-fast-forward retry is untested; the live workflow behaviour is unverified until the next push to `main` (the first run meets an old-format `gh-pages` tip, resolved through its subject with the full-history checkout).
