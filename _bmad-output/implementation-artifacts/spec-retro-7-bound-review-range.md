---
title: 'Bound the Epic review view at the Epic end (Epic 7 retro item 5)'
type: 'bugfix'
created: '2026-10-20'
status: 'done'
baseline_revision: 'a7ed1c69cbe612a80b7aa8a2bf80de92becc7a59'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Epic review view lists the Divergence Records and Escalations added in `began..HEAD` (`site.ts:427`), so every finished Epic's page also lists everything added by later Epics (Epic 1's and Epic 2's pages each list all 31 Escalations; retro S5). The spec (`spec-7-2:48-49`) and docs say `began..HEAD`, so the defect starts in the spec. The per-Story commit matching and rename counting (retro L7) are undocumented.

**Approach:** Add `ended` to `EpicReview`: the later of the Epic's newest Story commit and the newest commit that added the Epic's retrospective document (`_bmad-output/implementation-artifacts/epic-<N>-retro-*.md`), so the retrospective only ever extends the range. List records added in `began..ended`. Show `ended` on the page, and document the bound, the commit matching and the rename counting.

## Boundaries & Constraints

**Always:** "Story commit" keeps its meaning: a commit reachable from HEAD whose subject starts `<story-id>: ` for one of the Epic's Stories. "Newest" and "after" use the existing `--topo-order` commit list. The retrospective lookup is add-only (`--diff-filter=A`), with rename detection on (`-M`), and matches only `epic-<N>-retro-*.md` directly in that directory, so `epic-1-` never matches `epic-10-`. `ended` is null exactly when `began` is null. Records must still exist at HEAD to be listed. `null`, never `undefined`.

**Never:** Do not touch `packages/**`, `conformance/expectations/**` or `AGENTS.md`. Do not remove or weaken any XT-conformance-148 assertion; only extend it (the `toEqual` for the not-begun Epic gains `ended: null`). Do not change per-Story commit/file/line counting, only document it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No retro, record after last Story commit | `1.1: a`, `planning: x`, `1.2: b`, `planning: y`, then `planning: z` adds `ESC-9.9-2` | `ended` = `1.2: b`; ESC-9.9-2 not listed | — |
| Retro commit | later commit adds `epic-1-retro-…md` and `ESC-9.9-3` | `ended` = that commit; ESC-9.9-2 and ESC-9.9-3 listed | — |
| After the retro | later commit adds `ESC-9.9-4` | not listed | — |
| Retro doc edited later | a later commit modifies the retro doc | `ended` unchanged | — |
| Story commit after the retro | an `epic-1-retro-…md` add before `1.2: b` | `ended` = `1.2: b`; ESC-1.2-1 listed | — |
| Retro renamed in the directory | `git mv` of the retro doc | `ended` unchanged | — |
| Other Epic's retro | `epic-10-retro-…md` added | not Epic 1's retro | — |
| Not begun | no Story commit | `began` and `ended` null, lists empty | — |

</intent-contract>

## Code Map

- `tools/conformance-report/site.ts:321-337` -- `EpicReview` interface; add `ended` after `began` with a doc comment, and fix the `began..HEAD` comments.
- `tools/conformance-report/site.ts:421-449` -- `oldest`/`began`, the `git log --diff-filter=A … ${began}..HEAD` query; add the newest Story commit, the retro lookup (`git log -M --diff-filter=A --format=%H HEAD -- ':(glob)_bmad-output/implementation-artifacts/epic-<N>-retro-*.md'`, first line whose index in `commits` is after `oldest`), and bound the range.
- `tools/conformance-report/site.ts:618-619` -- render `Ended at: <sha> (retrospective | last Story commit)` after `Began at`.
- `conformance/tests/xaravel/dashboard.test.ts:463-561` -- XT-conformance-148.
- `docs/ops/conformance-report.md:121`, `:123`, `:159-160` -- the "Added since" bullet, the Stories bullet, the limits.
- `_bmad-output/implementation-artifacts/spec-7-2-public-dashboard-and-epic-review-view.md:48-49`, `:84`, `:199` -- the contract text.

## Tasks & Acceptance

**Execution:**
- `tools/conformance-report/site.ts` -- add `ended` and bound the range as above; render it.
- `conformance/tests/xaravel/dashboard.test.ts` -- extend XT-conformance-148 with every matrix row, and the rendered `Ended at` line.
- `docs/ops/conformance-report.md` -- document `ended`, the bound, the add-only retro rule, the subject-prefix matching (blocked attempts and follow-ups that use the `<id>: ` subject count) and `--no-renames` counting a rename as an add plus a delete.
- `spec-7-2` -- correct the `began..HEAD` contract and fixture row, citing this item.

**Acceptance Criteria:**
- Given an Epic with a retrospective commit, when its review is built, then only records added in `began..<retro commit>` are listed and the page shows `Ended at` with that commit.
- Given an Epic with no retrospective, when its review is built, then the range ends at its newest Story commit.
- Given the docs, when read, then they state the bound, the commit matching and the rename counting.

## Spec Change Log

### 2026-10-20 — Review pass 1
- Trigger: edge-case, blind and intent-alignment layers found that taking the retrospective whenever it follows the oldest Story commit drops Story commits that land after the retrospective (2.6, 4.7, 4.8, 5.9 on `main`) and their Escalations, while the Stories table still counts them.
- Amended: the intent contract's Approach and matrix now take the later of the newest Story commit and the newest retrospective add. The invocation intent ("last Story commit (or the retrospective commit when present)") admits both readings; the MAINT ruling's best-case rule (`decisions/MAINT-2026-10-16-unattended-orchestrator.md`) selects the one that never drops an Epic's own records.
- Known-bad state avoided: an Epic page missing its own post-retrospective Story records.
- KEEP: add-only `-M` retrospective lookup with `:(glob)`; `ended` object with `by`; `Ended at` line; record existence at HEAD; per-Story counting unchanged.

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 21 findings — high 0, medium 1, low 15, false 1, maybe-false 0
- findings:
  - `[low]` `[patch]` (edge-case) A move into the directory or an undetected rename counts as an add and moves `ended` — docs now say so instead of claiming every rename is ignored.
  - `[medium]` `[patch]` (edge-case) Retro before a later Story commit drops that commit's records — `ended` is now the later of the newest Story commit and the newest retro add; fixture adds an early retro before `1.2: b`.
  - `[low]` `[patch]` (edge-case) `began..ended` is reachability, ordering is --topo-order; wrong on non-linear history — `main` squash-merges; docs now state the linear-history assumption.
  - `[low]` `[patch]` (edge-case) Docs rename claim overstated — same fix as the first row.
  - `[medium]` `[patch]` (intent) Post-retro Story commits (2.6, 4.7, 4.8, 5.9 on `main`) and ESC-2.6-2, ESC-4.7-1, ESC-4.8-1, ESC-5.9-2 left out — same root cause and fix as the second row.
  - `[low]` `[patch]` (intent) L7's third point (`began` ignores planning commits just before the first Story) undocumented — docs now state it.
  - `[false]` `[reject]` (intent) No test against real history — the hermetic fixture now reproduces the real-history case (Story commit after a retro); real-history state changes every merge and cannot be pinned.
  - `[medium]` `[patch]` (blind) Story commit after the retrospective falls outside the range — same as the second row.
  - `[low]` `[patch]` (blind) Escalations raised by retro action items after the end (ESC-5.3-4) are excluded silently — docs Limits now name it; open ones still show under Blocking acceptance.
  - `[low]` `[patch]` (blind) Rename detection untested — XT-conformance-148 now `git mv`s the retro and asserts `ended` unchanged.
  - `[low]` `[patch]` (blind) Newest retro add wins on re-add, undocumented — docs now say a deleted-and-re-added or second retrospective moves `ended` to the newer add (a rerun retrospective should extend the range).
  - `[low]` `[patch]` (blind) `(last Story commit)` HTML untested; duplicate `epicReview` call — test renders the early review with `buildSite` and asserts the line; one stored review.
  - `[low]` `[reject]` (blind) Stale injected `sources` can disagree with the live retro lookup — `buildSite` reads `epicSources` once at the same HEAD; guarding a caller misuse adds complexity for a case no caller reaches.
  - `[low]` `[patch]` (blind) topo-order vs reachability on merges — same as the third row.
  - `[low]` `[reject]` (blind) Root-commit `began` null case undocumented — pre-existing, rejected in spec-7-2's triage: no Story commit on `main` is the root commit.
  - `[low]` `[patch]` (blind) spec-7-2 contract changed with no Change Log entry — dated entry added.
  - `[low]` `[reject]` (blind) Glob boundary for nested paths untested — `:(glob)` semantics are git's; nobody nests retro docs; a test adds fixture weight for no reachable case.
  - `[low]` `[patch]` (verification-gap) `-M` untested — same as the rename-test row.
  - `[low]` `[patch]` (verification-gap) The "after" guard untested — the early-retro fixture commit now exercises `retroAt > newestAt` false.
  - `[low]` `[patch]` (verification-gap) "Newest" selection untested — fixture has two Epic 1 retro adds; `ended` is the later one.
  - `[low]` `[patch]` (verification-gap other) Move into the directory counts as an add — same as the first row.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/dashboard.test.ts` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: clean
- `bun run harness --xaravel` -- expected: differ=0

## Auto Run Result

Status: done

- **Change:** the Epic review view lists Divergence Records and Escalations added in `began..ended`, not `began..HEAD`. `ended` is the later of the Epic's newest Story commit and the newest commit that added `epic-<N>-retro-*.md`, and the page shows `Ended at: <sha> (retrospective | last Story commit)`. On `main`, Epic 1's page drops from 31 Escalations to its own.
- **Files:** `tools/conformance-report/site.ts` (`ended`, bounded range, page line); `conformance/tests/xaravel/dashboard.test.ts` (XT-conformance-148 extended: no retro, early retro then Story commit, other Epic's retro, retro, after retro, edit, rename, rendered lines); `docs/ops/conformance-report.md` (bound, retro rule, L7 commit matching, `--no-renames` counting, `began`, limits); `spec-7-2` (contract, fixture row, Change Log).
- **Review:** 21 findings; 17 rows patched (1 medium root cause, the rest low), 4 rejected with reasons above, none deferred. The intent contract was amended once under the MAINT best-case rule (Spec Change Log).
- **Follow-up review:** false (one medium entry patched, no high).
- **Verification:** `bun test conformance/tests/xaravel/dashboard.test.ts` 3 pass; `bun run typecheck`, `bun run lint` clean; `bun run harness --xaravel` 265/265, differ=0.
- **Residual risk:** records raised by retrospective action items after `ended` are not listed under "Added since" (documented).
