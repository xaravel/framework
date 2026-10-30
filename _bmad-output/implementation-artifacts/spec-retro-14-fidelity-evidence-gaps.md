---
title: 'Fidelity Review shows the probe rows, assigned fixtures and Upstream fixture counterparts it omitted (epic-14-retro-item-3)'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_revision: 'da60ee7b96aeacac895050fe26a14cd087e9bce1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-16-unattended-orchestrator.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-retro-2026-10-29.md'
warnings: []
deferred:
  - summary: >-
      review() wiring of assignedTestFixtures (Story only, assigned ids minus touched) is not exercised end to end.
    evidence: |-
      Verification-gap layer: only the helpers are tested; a sample-repo run with a signed fixture for an untouched assigned id would cover it, as it would the existing testFixtures wiring at the same site.
    location: >-
      tools/fidelity-review/fidelity-review.ts review()
    severity: medium
  - summary: >-
      docs/ops/fidelity-review.md states WHOLE_FILE_CAP as 60,000 and the prompt cap as 600,000; the code has 200,000 and 1,000,000.
    evidence: |-
      Pre-existing mismatch, likely the origin of the retro E1 "over WHOLE_FILE_CAP" premise; fidelity-review.ts WHOLE_FILE_CAP = 200_000, PROMPT_CAP = 1_000_000.
    location: >-
      docs/ops/fidelity-review.md (h) bullet
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 14's Fidelity Reviews recorded three evidence gaps (retro E1–E3). E1: a changed probe output (`packages/runtime/tests/xaravel/php-set-functions.probe.txt`) that a Xaravel Test reads went to the last tier of (h), because `readData` skips a changed target and only runs for changed tests, so the budget dropped it. E2: an assigned Xaravel Test the change does not touch (XT-collections-9) had its fixture named as present but its request and output never shown. E3: a Ported Test fixture module (`packages/reflection/tests/ported/framework/tests/Support/Fixtures/ClassesWithAttributes.ts`) was shown without its Upstream counterpart.

**Approach:** Supply existing evidence items in more cases, in `tools/fidelity-review/fidelity-review.ts` only: (E1) a changed data file that a changed or sibling test reads joins (h)'s first tier as `changed; read by <test>`, and a data file that does not fit the budget shows the rows its reader selects when they fit; (E2) a new (c) section shows the request and fixture output of each assigned Xaravel Test id no touched test declares; (E3) each (h) entry or changed file under `packages/<c>/tests/ported/` that is not a `*.test.ts` brings its Upstream counterpart `conformance/upstream/<sub-path>.php` at tier 1 when it exists.

## Boundaries & Constraints

**Always:** Keep to the 2026-10-21 amendment's "What it may change": add evidence or supply an existing item in more cases; tests for each new case in `conformance/tests/xaravel/fidelity-review.test.ts`; prompt-content wording only in the evidence notes above the checklist in `conformance/review/fidelity.md`, and in `docs/ops/fidelity-review.md`. Every new entry still goes through the budget and cap, and is named as omitted for size when it does not fit. The fidelity-review header comment and docblocks describe the new cases.

**Never:** Change any F-1..F-10 Check paragraph, the verdict rule, schema, standing-reject rule, reviewer/CLI selection or the `story:check` approvals clause. Never remove or narrow evidence an existing case shows, change an existing heading or none-text, or edit an existing assertion. No `packages/**`, `AGENTS.md`, Expectations or Protected Path changes beyond the files named here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| E1 changed data, changed reader | `a/tests/rows.test.ts` and `a/tests/rows.txt` both changed; test reads `rows.txt` | `a/tests/rows.txt` in tier 1, reason `changed; read by a/tests/rows.test.ts` | — |
| E1 changed data, unchanged reader | only `a/tests/rows.txt` changed; sibling `a/tests/rows.test.ts` reads it | same entry, reason names the sibling | — |
| E1 tight budget | data file read by a test does not fit what is left | the rows the test's literals select, when they fit, with the `excerpt:` reason; else the existing omitted-for-size note | — |
| E2 assigned untouched | manifest assigns XT-x, no touched test declares it, fixture present and verified | new section `(c) … assigned Xaravel Tests the change does not touch …` shows request and output; fitted by `fitTestFixtures` (compact, then omitted) before touched entries | none-text when empty |
| E2 item | `--item` review | assigned ids are its touched ids, so the new section is empty | — |
| E3 ported fixture | `packages/r/tests/ported/framework/tests/X/Fixtures/F.ts` in (h) and `conformance/upstream/framework/tests/X/Fixtures/F.php` exists | Upstream file at tier 1, reason `Upstream counterpart of <path>` | absent snapshot file: no entry |

</intent-contract>

## Code Map

- `tools/fidelity-review/fidelity-review.ts:39-91` -- header comment listing the prompt's evidence; (c) at :50-58, (h) at :72-87.
- `tools/fidelity-review/fidelity-review.ts:279-302` -- `Evidence` interface and `NO_EVIDENCE`; add `assignedTestFixtures`.
- `tools/fidelity-review/fidelity-review.ts:471-474` -- `buildPrompt` (c) sections; add the new one after the touched-test section.
- `tools/fidelity-review/fidelity-review.ts:1031-1263` -- `wholeFileEvidence`: `readData` (:1059) skips changed targets and runs only for changed tests (:1095); `other` at tier 4 (:1174); final map, cap branch (:1252) and budget branch (:1257).
- `tools/fidelity-review/fidelity-review.ts:1666` -- `touchedTestFixtures(root, [{ ids }])` already builds E2 entries for any id list.
- `tools/fidelity-review/fidelity-review.ts:1780` -- `fitTestFixtures`; extend to the new list, trimming it first.
- `tools/fidelity-review/fidelity-review.ts:2751` -- `dataFileExcerpt(text, testText)`; add an optional `cap` (default `WHOLE_FILE_CAP`).
- `tools/fidelity-review/fidelity-review.ts:2359` -- `UPSTREAM_SNAPSHOT_DIR`.
- `tools/fidelity-review/fidelity-review.ts:4710-4718` -- `runFidelity` assembly: fill `assignedTestFixtures` from `subject.xaravelTestIds` minus touched ids (Story only).
- `conformance/tests/xaravel/fidelity-review.test.ts` -- XT-conformance-161 cases to copy: data root :1511-1522, excerpt :1593-1600, tight budget :1834-1837, upstream temp root :1778-1837, (c) fixtures :2031-2068.
- `conformance/review/fidelity.md:11,17` -- Oracle fixtures and Whole files evidence notes.
- `docs/ops/fidelity-review.md:61,67` -- (c) and (h) input descriptions.

## Tasks & Acceptance

**Execution:**
- `tools/fidelity-review/fidelity-review.ts` -- implement E1, E2, E3 as in Approach; update header comment and docblocks.
- `conformance/tests/xaravel/fidelity-review.test.ts` -- add cases for each matrix row (new `expect`s inside XT-conformance-161, existing ones unchanged), including a real-repo E2 case for XT-collections-9 and a real-snapshot E3 case for `ClassesWithAttributes` guarded by the snapshot's presence as neighbouring cases do.
- `conformance/review/fidelity.md` -- evidence notes: one sentence each in **Oracle fixtures** and **Whole files**.
- `docs/ops/fidelity-review.md` -- (c) and (h) bullets describe the new cases.

**Acceptance Criteria:**
- Given the matrix inputs, when `wholeFileEvidence`, `touchedTestFixtures`/`fitTestFixtures` and `buildPrompt` run, then each row's output appears.
- Given the full tool, when `bun test conformance/tests/xaravel/fidelity-review.test.ts` runs, then all tests pass with no existing assertion changed.
- Given the repository, when `bun run typecheck`, `bun run lint` and `bun run harness --xaravel` run, then they report no new failures.

## Spec Change Log

## Review Triage Log

### 2026-10-29 — Review pass
- layers: blind-hunter, edge-case-hunter, verification-gap, intent-alignment; fidelity-review skipped (the item's `action` names no `packages/<component>`; MAINT-2026-10-16 amendment 2026-10-22).
- verdicts: 22 findings — high 0, medium 3, low 9, false 4, maybe-false 0 (6 intent-alignment observations triaged below as reject)
- findings:
  - `[medium]` `[patch]` E3 counterpart loop walks tier 4, so another PR's out-of-scope changed fixture pulls its PHP into tier 1 — loop now skips changed files that fail `inScope`; test added.
  - `[low]` `[patch]` `upstreamCounterpart` maps any extension (`.json`, `.stub`) to `.php` — now maps only TypeScript modules; test added.
  - `[low]` `[reject]` no note when a counterpart is absent — the matrix specifies no entry; adding a note is new surface for a case the reviewer can already see (the fixture's header names its Upstream file).
  - `[low]` `[reject]` sibling-reader search only covers the data file's directory — every recorded E1 case (probe beside its test) is covered; a parent-dir walk adds branches for an unobserved layout.
  - `[low]` `[reject]` tight-budget excerpt may be rejected by its longer reason — only at a budget within a few dozen characters of the excerpt; falls back to the existing omitted note, never drops silently.
  - `[false]` `[reject]` `fitTestFixtures` drops all assigned fixtures before compacting touched ones — the trim compacts each assigned entry before omitting it, and trimming the untouched tests' evidence first is the spec's stated order.
  - `[low]` `[reject]` E2 section lacks the untouched test's body — the intent names the request and decoded output only; (e) scope is unchanged.
  - `[low]` `[patch]` untested new branches (scope guards) — covered by the added scope tests; the dedupe and changed-counterpart guards are direct `add`/`listed` reuse.
  - `[low]` `[reject]` budget tests hard-code the 220 entry overhead — neighbouring tests (:1476, :1834) do the same; a change to the constant fails loudly.
  - `[low]` `[reject]` real-snapshot E3 case is vacuous without the snapshot; E2 hard-codes a sha — same guard pattern as the existing snapshot cases; the synthetic E3 case always runs.
  - `[low]` `[reject]` fidelity.md note is shorter than the ops doc — the note says what the prompt carries; ordering detail lives in the ops doc, as for the existing items.
  - `[false]` `[reject]` spec Code Map line numbers stale — the fix is an edit of this build's spec.
  - `[medium]` `[defer]` (verification-gap) `review()` wiring of `assignedTestFixtures` is not exercised end to end — a sample-repo signed fixture is needed; like `testFixtures` at the same site, it is unit-covered only.
  - `[medium]` `[patch]` (verification-gap) out-of-scope guard on a changed data file read by a changed test is untested — expect added.
  - `[low]` `[patch]` (edge) a changed out-of-scope test reading an in-scope changed data file promotes it naming that reader — `readData` now also skips when the reader fails `inScope`; test added.
  - `[low]` `[reject]` (edge) budget excerpt reason growth — same as the blind-hunter row above.
  - `[false]` `[reject]` (edge) a changed `.md`/`.ts` data file is not labelled with its reader — it is already shown whole at tier 2 with its diff; no evidence is lost.
  - `[false]` `[reject]` (edge, claim) E3 scope — duplicate of the first row, patched there.
  - `[low]` `[reject]` (intent) E1's literal reading (over `WHOLE_FILE_CAP`) is a no-op for a 35,573-byte file; the diff implements the by-cause reading, which the retro finding's evidence supports.
  - `[low]` `[reject]` (intent) "decoded output" is shown in the Oracle encoding, as the existing touched-test section does — consistent with docs/ops/oracle.md.
  - `[low]` `[reject]` (intent) real-cap prompt reruns of items 10/11/15/16, 14.5 and 18 are not reproduced — a re-review needs the reviewer CLIs; the unit cases cover each mechanism, and the next counted review will show it.
  - `[low]` `[defer]` (intent) docs say `WHOLE_FILE_CAP` is 60,000 and the cap 600,000 — pre-existing mismatch, not caused by this change; deferred.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/fidelity-review.test.ts` -- expected: 0 fail
- `bun run typecheck` -- expected: exit 0
- `bun run lint` -- expected: exit 0
- `bun run harness --xaravel` -- expected: SUMMARY with no differences (NOT-RUN variants allowed)

## Auto Run Result

Status: done

**Summary.** `bun run fidelity:review` now supplies the three kinds of evidence Epic 14's reviews found missing (retro E1–E3), all within the 2026-10-21 amendment's "What it may change":
- E1: a changed data file (such as `php-set-functions.probe.txt`) that an in-scope changed test, or an unchanged test file beside it, reads joins (h)'s first tier as `changed; read by <test>`, instead of the last tier where the budget dropped it. A data file that does not fit what the budget leaves shows the rows its reader's literals select, when they fit (`dataFileExcerpt` gained a `cap`).
- E2: a new (c) section shows the request line and fixture output of each assigned Xaravel Test id that no touched test declares (Story reviews only), and `fitTestFixtures` trims it before the touched tests' section.
- E3: each in-scope (h) TypeScript entry under `packages/<c>/tests/ported/` that is not a `*.test.*` brings `conformance/upstream/<sub-path>.php` at tier 1, when the snapshot has it.

**Files.**
- `tools/fidelity-review/fidelity-review.ts`: E1–E3, the header comment and the docblocks.
- `conformance/tests/xaravel/fidelity-review.test.ts`: 28 new expects in XT-conformance-161. No existing assertion changed.
- `conformance/review/fidelity.md`: one sentence each in the Oracle fixtures and Whole files evidence notes. No Check paragraph changed.
- `docs/ops/fidelity-review.md`: the (c) and (h) inputs.

**Review.** 22 findings. 5 patched: the E3 counterpart scope guard, the TypeScript-only counterpart mapping, the reader scope guard in `readData`, and tests for the scope guards. 2 deferred: the end-to-end `review()` wiring test for `assignedTestFixtures`, and the pre-existing cap numbers in the ops doc. 15 rejected, each with the reason recorded in the triage log. The Fidelity Review layer did not run: the item's `action` names no `packages/<component>`.

**Follow-up review:** false. Two medium entries were patched, but both were scope guards that now have direct tests, so no unverified risk remains to name.

**Verification:**
- `bun test conformance/tests/xaravel/fidelity-review.test.ts`: 3 pass, 0 fail, 1116 expects.
- `bun run typecheck`: exit 0.
- `bun run lint`: ok.
- `bun run harness --xaravel`: 494 tests, 0 failed, `differ=0`.

**Residual risks.** The search for an unchanged reader covers only the data file's own directory. A counterpart is found only by mirrored path.
