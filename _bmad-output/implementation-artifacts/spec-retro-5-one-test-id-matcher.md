---
title: 'harness --story and the done check select a bare Test ID''s dataset rows, through ownership''s covers (retro epic-5 item 5)'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: 'ca3637518cfbe4009c187d0781dc944001c757af'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ownership's `covers` lets a manifest's bare Test ID `X` own its dataset rows `X#<key>`, but `harness --story` (`selectIds`) and `story:check` (`assignedLines`, `testsClause`) match Test IDs exactly. A Story listing `X` may edit and is blamed for its rows, yet `ratchet story` and the done check grade none of them, and the harness reports `X` as having no Expectations line (Epic 5 retro H2; 4,348 Inventory IDs are rows).

**Approach:** Make `covers` in `tools/ownership/ownership.ts` the one Test ID matcher. `selectIds` admits an id when the story set `covers` it; the harness's "no Expectations line" diagnostic and `story:check`'s `assignedLines` and `testsClause` count a listed `X` as having lines when its rows have them.

## Boundaries & Constraints

**Always:** Exact matches keep working unchanged (a listed `X#k` selects only `X#k`; a listed `X` with its own line selects it). Selection only widens to rows that ownership already says the Story owns. Existing assertions keep their expected values; tests only gain cases.

**Never:** No second copy of the row rule. Do not change `covers`'s semantics, `coversBlock`, the Ratchet's verdict, `conformance/expectations/**`, `conformance/protected-paths`, `.github/workflows/*`, `AGENTS.md`, `epics.md`, the spine or SPEC.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bare id, rows only | manifest lists `X`; Expectations has `X#a`, `X#b` | `harness --story` runs `X#a`, `X#b`; no "no Expectations line" diagnostic for `X` | — |
| Exact row | manifest lists `X#a`; lines `X#a`, `X#b` | runs only `X#a` | — |
| Exact id | manifest lists `Y`; line `Y` | runs `Y` (unchanged) | — |
| Prefix but not a row | manifest lists `X`; line `Xy` or `X::t` | `Xy` not selected | — |
| Done check, bare id | manifest lists `X`; rows `X#a` pass, `X#b` fail-known | `tests` FAILs on `X#b [variant]: fail-known is not done`; no `X: no Expectations line` | exit 1 |
| Done check, bare id, no rows | manifest lists `Z`; no `Z` or `Z#…` line | `Z: no Expectations line` (unchanged) | exit 1 |

</intent-contract>

## Code Map

- `tools/ownership/ownership.ts:556-567` -- `covers(ids, id)`: the shared matcher. Already imported by `conformance/harness/harness.ts:141` (parseManifest) and `tools/ratchet/ratchet.ts:107`; ownership imports neither harness nor story-check, so no cycle.
- `conformance/harness/select.ts:62-79` -- `selectIds`: `!story.has(id)` → `!covers(story, id)`; import `covers` from `../../tools/ownership/ownership`. Update its doc comment.
- `conformance/harness/harness.ts:423-444` -- `storyIds`: `unknown` = listed ids that cover no universe id (build a set of covered listed ids by checking each universe id and its `#` prefixes against the listed set).
- `tools/story-check/story-check.ts:509-520` -- `assignedLines`: `wanted.has(id)` → `covers(wanted, id)`. `testsClause` (~140-200): the `withLine` set must record the listed id that covers each line id (the id itself and each `#` prefix in the listed set), so a bare `X` with rows is not "no Expectations line". Header/doc comments mention rows.
- `docs/ops/harness.md:34` (`--story` row) and `docs/ops/done-check.md:56` (`tests` row) -- say a listed `X` also selects its rows `X#<key>`, as ownership does (`docs/ops/ratchet.md:94`).
- Tests: `conformance/tests/xaravel/harness-select.test.ts` XT-conformance-108 (pure `selectIds` near line 300; `--story` CLI near 307-313 using `makeRoot`, `manifest`, `s()`); `conformance/tests/xaravel/done-check.test.ts` XT-conformance-127 (`testsClause` pure calls, `storyRoot`, `manifest`).

## Tasks & Acceptance

**Execution:**
- `conformance/harness/select.ts` -- use `covers` in `selectIds` -- H2.
- `conformance/harness/harness.ts` -- `storyIds` unknown check counts rows -- no false diagnostic.
- `tools/story-check/story-check.ts` -- `assignedLines` via `covers`; `testsClause` `withLine` via covering ids -- H2.
- `conformance/tests/xaravel/harness-select.test.ts` -- in XT-conformance-108 add the matrix's selection rows (pure `selectIds` and one `--story` run with a dataset-row universe).
- `conformance/tests/xaravel/done-check.test.ts` -- in XT-conformance-127 add `testsClause` cases for a bare id with rows (pass and fail-known) and `assignedLines` through `runStoryCheck` if the fixture allows.
- `docs/ops/harness.md`, `docs/ops/done-check.md` -- document the row rule.

**Acceptance Criteria:**
- Given a manifest listing a bare `X` whose Expectations lines are only `X#a` and `X#b`, when `bun run harness --story <id>` runs, then both rows run and are compared, and stderr has no "no Expectations line" diagnostic for `X`.
- Given the repository, when `bun test`, `bun run typecheck` and `bun run lint` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 18 findings — high 0, medium 5, low 13, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` (edge) `fixturesClause` still matched `assigned.has(request.id)`, so a bare `X` skipped its row requests `X#<key>` (committed requests are row-keyed). Patched: `covers(assigned, request.id)`; XT-conformance-196 case (bare `C`, request `C#k`, no fixture → FAIL).
  - `[medium]` `[patch]` (edge) The `coveringIds` doc comment claimed all of `story:check` used the matcher. True after the fixtures patch; the comment now lists ownership, the Ratchet, `harness --story`, `story:check` and `oracle:story`.
  - `[medium]` `[patch]` (edge) Same root cause as the fixtures row (intent says `story:check` grades a bare `X`'s rows). Same patch.
  - `[medium]` `[patch]` (verification-gap) No `fixturesClause` case with a bare id against row requests. Same patch adds it.
  - `[medium]` `[patch]` (blind) Fixtures clause exact match. Same patch.
  - `[low]` `[patch]` (blind) `tools/oracle/story-requests.ts` rejected a per-Story request `X#a` under a listed `X` though ownership says the Story owns it. Patched: `covers(owned, request.id)`, XT-conformance-236 case, `docs/ops/oracle.md` rule.
  - `[low]` `[patch]` (blind) Doc comment overclaim. Fixed with the two patches above.
  - `[low]` `[reject]` (blind) The spec does not record the new `coveringIds` export. Its fix edits this build's spec; the Auto Run Result records it.
  - `[low]` `[reject]` (blind) `covers` now allocates an array per call. Arrays are tiny and the loops are ~27k ids; no measurable cost, and a separate early-return loop would re-copy the row rule.
  - `[low]` `[reject]` (blind) `storyIds` scans the universe a second time. Linear and cheap; deriving it from the selection would add coupling with `--component`/`--id` filters, which must not hide the diagnostic.
  - `[low]` `[patch]` (blind) `coveringIds` has no direct test. Patched: XT-conformance-108 cases for `X#a#b` with `X` and `X#a` listed, and an exact row.
  - `[low]` `[patch]` (blind) No selection case listing both `X` and `X#a`. Patched in XT-conformance-108: each row selected once.
  - `[low]` `[reject]` (blind) The spec ACs omit the done check. Fix edits this build's spec; the matrix rows are tested.
  - `[low]` `[patch]` (blind) `docs/ops/done-check.md` `tests` row wording and missing row rule in `fixtures`. Patched both rows.
  - `[low]` `[reject]` (blind) No assertion on `at` for row lines. `at` is computed by unchanged code from the shard index; only the filter changed.
  - `[low]` `[patch]` (blind) Ragged header paragraph in `story-check.ts`. Re-wrapped.
  - `[low]` `[reject]` (intent) `ratchet story` has no direct test with a bare `X`. It calls `runHarness(root, {story})` unchanged, and XT-conformance-108 drives that call end to end.
  - `[low]` `[reject]` (intent) Pure `testsClause` cases bypass `assignedLines`. The XT-conformance-127 `runStoryCheck` case covers it end to end.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/harness-select.test.ts conformance/tests/xaravel/done-check.test.ts conformance/tests/xaravel/ownership-lines.test.ts conformance/tests/xaravel/ratchet.test.ts` -- expected: pass
- `bun test` / `bun run typecheck` / `bun run lint` -- expected: pass

## Auto Run Result

Status: done

**Summary.** `covers`/`coveringIds` in `tools/ownership/ownership.ts` is now the one Test ID matcher. `harness --story` (`selectIds`, `storyIds` diagnostic), `story:check` (`assignedLines`, `testsClause`, `fixturesClause`) and `oracle:story`'s ownership check let a listed bare `X` take its dataset rows `X#<key>`, as ownership and the Ratchet already did (Epic 5 retro H2). `ratchet story` inherits it through `runHarness`.

**Files changed.**
- `tools/ownership/ownership.ts`: `coveringIds` (listed ids covering an id); `covers` built on it, semantics unchanged.
- `conformance/harness/select.ts`, `conformance/harness/harness.ts`: selection and the "no Expectations line" diagnostic count rows.
- `tools/story-check/story-check.ts`: `assignedLines`, `testsClause`, `fixturesClause` count rows; header.
- `tools/oracle/story-requests.ts`: a request for a row of a listed `X` is owned.
- `conformance/tests/xaravel/harness-select.test.ts` (XT-108), `done-check.test.ts` (XT-127, XT-196), `oracle-story.test.ts` (XT-236): added cases only.
- `docs/ops/harness.md`, `done-check.md`, `oracle.md`: the row rule.

**Review.** 18 findings. Patched: 5 medium (one root cause: fixtures clause) and 6 low. Deferred: none. Rejected: 7, each with its reason above. Follow-up review: false (one medium root cause patched, tested).

**Verification.** `bun test` 237 pass 0 fail; `bun run typecheck`, `bun run lint` clean; `ownership:check` OK; `escalations:check` exit 0 (warnings for ESC-5.9-1/-2 only, pre-existing). The new cases fail with the source fixes reverted.

**Residual risk.** No `harness --story` run against a real Story with dataset rows yet; Epic 5 manifests list no `test_ids`.
