---
title: 'SM-1 target: Phase and Inventory hash in history, the never-decreases check, the Inventory diff between Pin series (Epic 7 item 10)'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '9ef64a386e14d75e42f83213b7af0ca36eef82e3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/MAINT-2026-10-20-epic-6-7-items.md'
  - '{project-root}/docs/ops/conformance-report.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** PRD SM-1's target says the Conformance Rate "never decreases between Phase boundaries under the same Baseline Pin" and that the dashboard shows "the Test Inventory diff between" Pin series (`prd.md` §8). The history record (`tools/conformance-report/history.ts`) has no Phase and no Inventory hash, so neither the check nor the diff can be built (Epic 7 retro S3; action `epic-7-retro-item-10-sm1-target`, ruling `decisions/MAINT-2026-10-20-epic-6-7-items.md`). It must land before Story 8.8's Phase 1 gate closes.

**Approach:** `report.json` gains `phase` and `inventory: {ids, sha256}`; every new history record carries them. A new `conformance:target` CLI reads `history.jsonl` and fails on any decrease between consecutive Phase boundaries of one Pin series; `dashboard.yml` runs it as its last step. The site gains an "SM-1 target" section (boundary points, verdict) and, per Pin change, the Test Inventory diff.

## Boundaries & Constraints

**Always:**
- **Phase** of a commit = the smallest `n ≥ 0` with no `decisions/PHASE-<n>-EXIT.md` at `--root` (the same files `conformance/protected-paths`' `after-phase:<n>` reads; reuse `activePhases` from `tools/protected-paths/protected-paths.ts`). Today that is `0`.
- **Inventory hash** = lowercase hex sha256 of the sorted (`compareUnits`), de-duplicated Inventory Test IDs, each followed by `\n`; `ids` is their count.
- Record key order: `commit, pin, phase, inventory, overall, alpha, components`. `readReport` requires an integer `phase ≥ 0` and `inventory.ids` number / `inventory.sha256` 64-hex; the record key `(commit, pin)` and every guard in history.ts are unchanged.
- Old history lines without `phase`/`inventory` stay valid in `readHistory` and are re-serialised byte-for-byte unchanged (fields optional when read).
- **Target check** (`targetViolations(records)`, pure): split records into Pin series as `historySeries` does. In a series, the reference points are the series' first record and every **boundary record**: a record with a `phase` higher than the `phase` of the nearest earlier record in the series that has one. Consecutive reference points must not decrease: overall, and each Component present with `pairs > 0` at both points, compared exactly by cross-multiplication (`p2·n1 ≥ p1·n2`). A record whose `phase` is lower than an earlier record's in the series is a violation (`phase went back`). Records with `pairs = 0` are skipped for that rate.
- Violation lines name the Pin tag, both commits (12 chars), the phases, the scope (`overall` or `component <c>`) and both rates as `passing/pairs`.
- CLI `bun --no-env-file tools/conformance-report/target.ts --history <file>` (`bun run conformance:target`): prints `conformance:target: ok (<k> Phase boundaries checked across <s> Pin series)` and exits 0, or prints each violation on stderr and exits 1; missing or malformed history exits 1; bad usage exits 2.
- `dashboard.yml`: a final step `Check the SM-1 target` runs `conformance:target` on `.cache/conformance/history.jsonl` after publish, so the site still publishes and the run goes red.
- Site: `#target` section after History: the verdict (held / the violation lines) and a table of reference points (Pin, commit, phase, overall rate). For each Pin change, a "Test Inventory diff" entry: `from tag → to tag`, using the last record of the earlier series and the first of the later; when both records carry `inventory.sha256` and they are equal, "no change"; otherwise `readInventoryAt(root, commit)` for both, showing added and removed counts per Component and total, with the IDs in a `<details>` capped at 200 per side (`… and N more`); when a commit or its Inventory cannot be read, "unavailable (<reason>)". All text escaped.

**Never:** change the Conformance Rate's definition or any existing report number; touch `conformance/expectations/**`, AGENTS.md, PRD, spine, SPEC or `epics.md`; rewrite or backfill existing `dashboard-data` lines; make the site build fail on a target violation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rate held | one Pin, phases 0,0,1,1,2 with overall 1/10, 2/10, 3/10, 2/10, 4/10 | ok; 2 boundaries (phase-1 record 3/10 ≥ 1/10 start; phase-2 record 4/10 ≥ 3/10) | exit 0 |
| Decrease at boundary | phases 0,1 with 5/10 then 4/10 | violation naming both commits, `overall 5/10 → 4/10` | exit 1 |
| Component decrease | overall rises, component `support` 3/4 → 2/4 at a boundary | violation `component support` | exit 1 |
| Pin change | series A ends 9/10 phase 1, series B starts 1/10 phase 1 | no violation (new series) | exit 0 |
| Legacy lines | records without `phase` then `phase: 0` | no boundary created by the unknown → 0 step | exit 0 |
| Phase back | phases 1 then 0 | `phase went back` violation | exit 1 |
| Inventory diff | two series, hashes differ, commits readable | per-Component added/removed, IDs listed | — |

</intent-contract>

## Code Map

- `tools/conformance-report/report.ts` -- `Report` l.88; `computeReport` l.191 (reads `readWorkingInventory` l.198 into `componentOf`); return l.319. Add `phase`, `inventory`; header comment l.1-40.
- `tools/protected-paths/protected-paths.ts` -- `activePhases(root)` l.122 (imports only `node:fs`/`node:path`).
- `tools/conformance-report/history.ts` -- `HistoryRecord` l.58, `historyRecord` l.80, `readReport` l.318, header comment documents the record shape l.15-18.
- `tools/conformance-report/site.ts` -- `historySeries` l.118, `renderHistoryChart` l.141, `readHistory` l.186, index page history section l.601, `SiteInput`/`collectSiteInput` l.492/697 (has `root`; add the computed Inventory diffs there so `buildSite` stays pure).
- `tools/pin-bump/pin-bump.ts` -- `readInventoryAt(root, sha)` l.404 (throws on missing revision/Inventory).
- `package.json` -- `conformance:*` scripts l.28-31: add `conformance:target`.
- `.github/workflows/dashboard.yml` -- steps; header comment lists the steps.
- `conformance/tests/xaravel/conformance-report.test.ts` (XT-143..145) and `dashboard.test.ts` (XT-146..148) -- existing fixtures to extend; record-shape assertions there may need the new fields.
- `docs/ops/conformance-report.md` -- documents report, history record and dashboard pages.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- off-manifest XT registry; next free is `XT-conformance-257`.

## Tasks & Acceptance

**Execution:**
- `tools/conformance-report/report.ts` -- add `phase` and `inventory` to `Report` and `computeReport` (helpers `currentPhase(root)`, `inventoryHash(ids)` exported) -- the data the record needs.
- `tools/conformance-report/history.ts` -- record and validate the new fields; update the header comment -- S3's missing data.
- `tools/conformance-report/target.ts` (new) -- `targetViolations`, `referencePoints`, CLI as above -- the check.
- `tools/conformance-report/site.ts` -- optional fields in `readHistory`; `#target` section; Inventory diffs computed in `collectSiteInput` and rendered -- the dashboard view.
- `package.json`, `.github/workflows/dashboard.yml` -- script and final step.
- `conformance/tests/xaravel/dashboard.test.ts` -- `XT-conformance-257`: every matrix row of the check plus CLI exit codes; `XT-conformance-258`: report/record carry phase and hash (fixture with `PHASE-0-EXIT.md` → 1), legacy line round-trips unchanged, site renders the target section and the Inventory diff (git fixture with two Pin series) -- proves each part.
- `docs/ops/conformance-report.md`, `story-manifests.md` -- document; register 257/258, next free 259.

**Acceptance Criteria:**
- Given a repo at Phase 0, when `conformance:report` and `conformance:history` run, then the appended line carries `"phase":0` and the Inventory's `ids` and `sha256`.
- Given a history with a decrease between two Phase boundaries of one Pin, when `bun run conformance:target --history <file>` runs, then it exits 1 naming the decrease; with no decrease it exits 0.
- Given two Pin series in the history, when the site is built, then `index.html` shows the Test Inventory diff between them and the SM-1 target verdict.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 33 findings — high 0, medium 4, low 23, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) No test separates "nearest earlier phased record" from "highest so far" for a boundary — added a 1,0,1 row to XT-conformance-257 asserting the boundary point, the `phase went back` line and the decrease.
  - `[medium]` `[patch]` (verification-gap, other) A zero-pair or missing reference point breaks the comparison chain (5/10 → 0/0 → 4/10 unreported) — each point is now compared, per scope, with the last earlier point that had pairs; tests end in a drop.
  - `[medium]` `[patch]` (verification-gap, other) `pinSeries` and `historySeries` split series independently — `historySeries` now builds on `pinSeries`.
  - `[medium]` `[patch]` (edge-case) Middle point with 0 pairs / absent Component hides a decrease — same root cause and fix as the chain finding above.
  - `[low]` `[reject]` (edge-case) `components` entries not validated, `{"x":null}` makes `decreased` throw — history lines are written only by `historyRecord` on a bot-pushed branch; the crash still exits 1; a deep guard adds complexity for an input no tool writes.
  - `[low]` `[reject]` (edge-case) One recorded violation keeps every later dashboard run red — the publish step runs first, so the site still updates; a broken SM-1 target is a lasting fact the Maintainer must see, and a waiver mode is new surface the intent does not ask for.
  - `[false]` `[reject]` (edge-case) Phases 2,1,2: the return to 2 counted as a boundary is "spurious" — the spec defines a boundary against the nearest earlier phased record, and the went-back violation is reported; the behaviour is the specified one (now pinned by test).
  - `[low]` `[reject]` (edge-case) 2,1,1,1 reports one went-back line per later record — spec says each such record is a violation; a phase going back needs a Protected-Path deletion of an exit decision, so it is not met in practice.
  - `[false]` `[reject]` (edge-case) Pin A → B → A is never compared across the two A runs — PRD SM-1: "A pin bump starts a new series"; a revert is a bump, as in `historySeries`.
  - `[low]` `[reject]` (edge-case) Inventory hash ignores Component moves — the spec defines the hash on Test IDs (the ruling asks for "a Test Inventory hash"); per-Component reassignment is a Component-map change outside SM-1's Inventory diff; fix adds a second diff kind.
  - `[low]` `[reject]` (edge-case) Negative pairs / passing > pairs invert the comparison — no writer produces them (`computeReport` counts), and guarding adds validation for an input never shown reachable.
  - `[low]` `[reject]` (blind) A violation keeps the dashboard red forever — same as the edge-case row above.
  - `[medium]` `[patch]` (blind) Zero-pair reference point hides a decrease — same root cause as the chain finding; fixed there.
  - `[low]` `[reject]` (blind) Inventory hash ignores Components — same as the edge-case row.
  - `[low]` `[reject]` (blind) The check never uses the recorded Inventory hash — the Conformance Rate's denominator is every Expectations line by definition; the intent asks to record the hash and show the diff, not to split series on it.
  - `[low]` `[patch]` (blind) `pinSeries` duplicates `historySeries` and the docs are wrong about it — fixed with the verification-gap row.
  - `[low]` `[patch]` (blind) After a phase goes back, the next record counts as a boundary; went-back floods — the boundary rule is the spec's (pinned by test); the flood is rejected as above.
  - `[low]` `[reject]` (blind) Validation of `inventory.ids` / components entries incomplete; validators repeat the regex — same as the edge-case validation row; the duplicated regex is two lines in two readers of different inputs.
  - `[low]` `[patch]` (blind) "1 Phase boundaries" — singular "boundary" for a count of 1, in CLI, site, docs and tests.
  - `[low]` `[reject]` (blind) `inventoryDiffs` re-reads Inventories per Pin change and publishes raw git error text — Pin changes are a handful per year; the text is escaped and holds no secret.
  - `[low]` `[patch]` (blind) Docs say Phase comes from "signed" exit decisions; `activePhases` checks file names only — reworded to the exit decision files, noting `decisions/` is Protected.
  - `[low]` `[reject]` (blind) No CLI test for `--history` given twice — last one wins like the other tools' flags; never met in the workflow.
  - `[low]` `[reject]` (blind) No test for an ID changing Component in the diff — follows from the rejected hash row.
  - `[low]` `[reject]` (blind) No test that the target step runs when publish fails — GitHub skips later steps after a failure; the publish failure is itself the red signal.
  - `[false]` `[reject]` (blind) XT-145 does not assert the new step needs no token — XT-146's `withToken` check covers every step's env.
  - `[low]` `[patch]` (blind) Docs Tests paragraph reads "… and XT-148 (…), XT-257" — list punctuation fixed.
  - `[low]` `[reject]` (blind) The spec's Code Map line numbers go stale — fix edits this build's spec.
  - `[low]` `[reject]` (intent) Boundary sampling (B1) vs no drop within a Phase (B2/B3) — the ruling's words are "decreases between Phase boundaries"; B1 is the literal reading and the Design Notes record it.
  - `[low]` `[reject]` (intent) If the Pin bumps in the same commit as a Phase exit, the series has no boundary to compare — inherent to SM-1's "a pin bump starts a new series"; a bump in a later commit (the normal `pin:bump` PR) gives the comparison.
  - `[false]` `[reject]` (intent) The check is post-merge, not a gate — the ruling asks for "a check that fails when the rate decreases"; a rate at a Phase boundary exists only on `main`, after the merge that closes the Phase.
  - `[false]` `[reject]` (intent) Phase from exit files rather than sprint status — the spec chose the repo's existing Phase-boundary definition (`after-phase:<n>`), recorded in Design Notes.
  - `[low]` `[reject]` (intent) Existing lines are not backfilled — the spec forbids rewriting `dashboard-data`; legacy lines are handled explicitly.
  - `[false]` `[reject]` (intent) Tests are synthetic, no live run — the live dashboard run happens only on `main` after merge; recorded as a residual risk.

## Design Notes

The series' first record is a reference point so the check applies at the first Phase boundary under a Pin (the Phase 0 exit, per the ruling), not only from the second one. Checking each Component as well as overall follows SM-1's "the overall rate and the rate per Component". Phase comes from the signed exit decisions, not sprint status, because that is the repo's existing definition of a Phase boundary (`after-phase:<n>`) and it is a Maintainer act.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/dashboard.test.ts conformance/tests/xaravel/conformance-report.test.ts conformance/tests/xaravel/boost-framework.test.ts` -- all pass
- `bun run typecheck` and `bun run lint` -- clean
- `bun run conformance:report && bun --no-env-file tools/conformance-report/target.ts --history /tmp/<fixture>` -- report shows phase 0; target exits 0/1 as expected
- `bun run harness --xaravel` -- no differences

## Auto Run Result

Status: done

**Summary.** SM-1's target now has data, a check and a dashboard view (Epic 7 retro item 10, S3). `report.json` and every new `dashboard-data` history line carry `phase` (the smallest n with no `decisions/PHASE-<n>-EXIT.md`) and `inventory: {ids, sha256}`. `bun run conformance:target --history <file>` fails when, within one Pin series, the overall or a Component's Conformance Rate decreases between consecutive reference points (the series start and each Phase boundary), comparing each scope against the last point that had pairs for it, or when a phase goes back. `dashboard.yml` runs it last, after publish. The site has a `#target` section with the verdict, the reference points and, per Pin change, the Test Inventory diff.

**Files changed.**
- `tools/conformance-report/report.ts` -- `phase`, `inventory`, `currentPhase`, `inventoryHash`.
- `tools/conformance-report/history.ts` -- record carries and `readReport` validates the new fields; legacy lines stay valid.
- `tools/conformance-report/target.ts` (new) -- `parseHistory`, `pinSeries`, `referencePoints`, `targetViolations`, `checkedSummary`, CLI.
- `tools/conformance-report/site.ts` -- `historySeries` on `pinSeries`, `#target` section, `inventoryDiffs` (commit ids validated before git).
- `package.json`, `.github/workflows/dashboard.yml` -- `conformance:target` script and final step.
- `conformance/tests/xaravel/dashboard.test.ts` -- XT-conformance-257 and -258; XT-145/146 step lists.
- `conformance/tests/xaravel/conformance-report.test.ts` -- report key list.
- `docs/ops/conformance-report.md`, `story-manifests.md` -- documentation; XT-257/258 registered, next free 259.

**Review.** One pass, 33 findings: 6 entries patched (two medium: the broken comparison chain at zero-pair points, the duplicated Pin split; four low: boundary-rule test, singular wording, docs wording, docs list), none deferred, the rest rejected with reasons in the triage log. Before review, the orchestrator also added a commit-id check before `readInventoryAt`.

**Follow-up review recommended:** true -- two medium entries were patched on a first pass; the rewritten per-scope comparison in `targetViolations` was checked by tests, not by a fresh review.

**Verification.** `bun test` on dashboard, conformance-report and boost-framework tests: 14 pass. `bun run typecheck` and `bun run lint`: clean. `bun run conformance:report` on the repo: `phase 0`, 22,070 Inventory IDs. `bun run harness --xaravel`: 289/289 passed, `differ=0`.

**Residual risks.** The live `dashboard.yml` run is unverified until the first push to `main` after merge; its first record will be the first with `phase`. A recorded violation keeps later dashboard runs red (accepted: the target is a lasting fact). Component moves with an unchanged Test ID set read as `no change` in the Inventory diff.
