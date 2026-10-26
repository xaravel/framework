---
title: 'Retro item epic-13-retro-item-1-consequence-rows: consequence rows for macroable, conditionable, reflection and collections'
type: 'chore'
created: '2026-10-25'
status: 'done'
baseline_revision: '4f21a056cf44019b5bc6975e4f7f195cd494cc6f'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      No check fails when a package with Xaravel Tests has no CONSEQUENCE_SOURCES row, so the S2 lapse can recur.
    evidence: |-
      Pre-existing: no test, story:check step or CI job compares packages/*/tests/xaravel against CONSEQUENCE_SOURCES. Retro item epic-13-retro-item-4 (Maintainer) covers the process side.
    location: >-
      tools/xt-coverage/consequences.ts
    severity: medium
  - summary: >-
      Epic 15 (config, Covers FR-20) has no consequence row yet; the ruling needs one before its first Story with Xaravel Tests.
    evidence: |-
      epics.md:3751 Covers FR-20; Epic 15 is verified by Oracle Differential Xaravel Tests. This item names only macroable, conditionable, reflection and collections.
    location: >-
      tools/xt-coverage/consequences.ts
    severity: medium
  - summary: >-
      The AD-2 and AD-6 bullets cannot all be covered by one package's tests, so xt:coverage never exits 0 for the new rows.
    evidence: |-
      This follows from the Maintainer's rule in MAINT-2026-10-22-consequence-rows (AD-2 and AD-6 for every package); story:check does not read consequence files.
    location: >-
      conformance/xaravel-consequences/
    severity: low
  - summary: >-
      XT-macroable-2 cites AD-5.8, which is not in macroable.jsonl, so xt:coverage macroable warns.
    evidence: |-
      packages/macroable/tests/xaravel/macroable.test.ts cites AD-5.8 (a runtime id). The warning leaves the exit code unchanged. Re-citing needs packages/macroable, which this item's action does not name.
    location: >-
      packages/macroable/tests/xaravel/macroable.test.ts
    severity: low
  - summary: >-
      Open retro question: may an Xaravel Test cite an FR with no consequence list (XT-reflection-1..3 cite bare FR-26)?
    evidence: |-
      epic-13-retro-2026-10-25.md, Open questions. The Maintainer's to decide. Re-citing XT-reflection-1..3 to AD-2 or AD-6 ids they do not verify would be a false mapping.
    location: >-
      packages/reflection/tests/xaravel/reflection.test.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `CONSEQUENCE_SOURCES` (`tools/xt-coverage/consequences.ts`) has rows only for `conformance`, `runtime` and `contracts`. `decisions/MAINT-2026-10-22-consequence-rows.md` gives every later Component a row before its first Story with Xaravel Tests. Macroable, Conditionable and Reflection shipped Xaravel Tests with no row, and Collections (Story 14.1) has none yet (retro finding S2).

**Approach:** Apply the ruling's rule to each Component's Epic `**Covers:**` line. Epics 11, 12 and 13 cover only FR-26, which has no consequence list, so each of those rows is `{ frs: [], ads: [2, 6] }`. Epic 14 covers FR-23, which has a list, so its row is `{ frs: [23], ads: [2, 6] }`. Generate the four files with `bun run xt:consequences`. Extend XT-conformance-126 so it derives every row from `contracts` on from `epics.md`, the PRD and the spine, for each Epic 10–14 Component named by its `stories/<E>.1.md` manifest.

## Boundaries & Constraints

**Always:** Change only `tools/xt-coverage/consequences.ts` (the rows and their doc comment), the generated `conformance/xaravel-consequences/{macroable,conditionable,reflection,collections}.jsonl` (generated, never edited by hand), `conformance/tests/xaravel/done-check.test.ts` (XT-conformance-126), and `docs/ops/done-check.md`'s stale sentence on the rows. The test derives each row from the source contract, not from a copy (lessons, epic 8). Keep the existing `contracts` derivation and its pinned values.

**Never:** Change the `conformance`, `runtime` or `contracts` rows, the generator's parsing rules, the PRD, spine, `epics.md`, `AGENTS.md`, `conformance/expectations/**`, or the item's `action`, `owner` or `epic`. Do not remove or weaken any assertion. Touch `packages/reflection` only if `bun run xt:coverage reflection` warns about XT-reflection-1..3's citations (the action's condition). A bare `FR-26` declares nothing and raises no warning (`coverage.ts` header), so the expected result is no `packages/**` change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate | `bun run xt:consequences` | writes four new files. The three FR-26 rows hold only AD-2.k then AD-6.k. `collections.jsonl` holds FR-23.k, then AD-2.k, then AD-6.k | none |
| Drift | `bun tools/xt-coverage/consequences.ts --check` | exit 0, empty stderr | non-zero naming the file if it differs |
| Derivation | `epics.md` Covers lines for Epics 10–14, PRD, spine | each row equals the declared FRs that have a consequence list, plus the declared ADs with a Rule list, plus AD-2 and AD-6, sorted | test fails naming the Component |
| FR without a list | Epic 11–13 `**Covers:** FR-26.` | FR-26 dropped, so `frs: []` | none |
| Coverage condition | `bun run xt:coverage reflection` | no `declares … which is not in` warning for XT-reflection-1..3; uncovered AD-2/AD-6 ids are listed (exit 1 is the correct "computed, not claimed" result) | if a warning names XT-reflection-1..3, re-cite in `packages/reflection` under the 2026-10-22 amendment |

</intent-contract>

## Code Map

- `tools/xt-coverage/consequences.ts:43-56`: `CONSEQUENCE_SOURCES` and its doc comment. Add the four rows after `contracts`, each with a comment quoting its Epic's Covers line, as `contracts` has.
- `tools/xt-coverage/consequences.ts` `expectedFiles`, `prdConsequences`, `spineRules`: the file keys follow row order. The test reuses `prdConsequences` and `spineRules` for "has a list".
- `conformance/tests/xaravel/done-check.test.ts:64-90`: XT-conformance-126. It asserts the `expectedFiles` keys and derives the `contracts` row from Epic 10's Covers line. Generalise the derivation to Epics 10–14, mapping each Epic to its Component through `parseManifest` on `stories/<E>.1.md` (already imported). Keep the pinned `contracts` values and add pinned values for the new rows.
- `_bmad-output/planning-artifacts/epics.md:3458,3491,3524,3560`: Covers lines `FR-26.` ×3 and `FR-23.` (read-only).
- `_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md:507,533`: FR-23 has a consequence list. FR-26 has none (read-only).
- `docs/ops/done-check.md:18`: says "Today it has one row". Make it list the current rows and the ruling.
- `tools/xt-coverage/coverage.ts:8-22`: a bare `FR-26` declares nothing, and only a well-formed id that is missing from the file warns.

## Tasks & Acceptance

**Execution:**
- `tools/xt-coverage/consequences.ts`: add `macroable`, `conditionable`, `reflection` `{ frs: [], ads: [2, 6] }` and `collections` `{ frs: [23], ads: [2, 6] }`, with Covers-line comments. This is the action item.
- `conformance/xaravel-consequences/*.jsonl`: run `bun run xt:consequences` to generate the four files.
- `conformance/tests/xaravel/done-check.test.ts`: in XT-conformance-126, expect seven files in row order. For each of Epics 10–14, derive the row from its Covers line and check `CONSEQUENCE_SOURCES[component]` against it. Pin the new rows' values, and check that each listed FR/AD front's `.1` id is in its file.
- `docs/ops/done-check.md`: correct the rows sentence.

**Acceptance Criteria:**
- Given the branch, when XT-conformance-126 runs, then every Epic 10–14 row equals its derivation, and the test passes.
- Given `bun run xt:coverage reflection`, when it runs, then it prints no unknown-id warning for XT-reflection-1..3, and it prints the `XT-COVERAGE reflection` summary line.
- Given the full `bun run harness`, `bun run typecheck` and `bun run lint`, when they run, then they report no differences and no errors.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 16 findings — high 0, medium 3, low 8, false 4, maybe-false 0 (verification-gap reported none; 1 Fidelity Review finding)
- findings:
  - `medium` `defer` (blind-hunter) No check fails when a package with Xaravel Tests has no `CONSEQUENCE_SOURCES` row, so the S2 lapse can recur. This gap predates the change: no tool has ever checked it. A new check is wider than the item's action.
  - `medium` `defer` (blind-hunter) Epic 15 (`config`, Covers FR-20, verified by Oracle Differential Xaravel Tests) has no row yet. The item names only the four rows, and the ruling puts `config`'s row before its first Story with Xaravel Tests.
  - `medium` `patch` (blind-hunter) The derivation loop hard-codes Epics 10–14, so a later row could escape the check. Patched: assert that the derived Components equal the `CONSEQUENCE_SOURCES` keys after `conformance` and `runtime`.
  - `low` `patch` (blind-hunter) The Covers regex is not bounded to the Epic's section, so a missing Covers line would read the next Epic's. Patched: the test bounds the match to the section and asserts that the Covers line exists, naming the Epic.
  - `low` `reject` (blind-hunter) The structural checks (unique ids, order) run only on `conformance.jsonl`. Every file comes from the same generator, and `--check` pins each file byte for byte to its output, so a per-file repeat adds loops and catches nothing new.
  - `low` `defer` (blind-hunter) The AD-2 and AD-6 bullets cannot all be covered by one package's tests, so `xt:coverage <c>` never exits 0 for these rows. That is a consequence of the Maintainer's 2026-10-22 rule, not of this change, and `story:check` does not read consequence files.
  - `low` `defer` (blind-hunter) `XT-macroable-2` cites `AD-5.8` (a runtime id), so `xt:coverage macroable` now warns. The warning does not change the exit code. Re-citing needs `packages/macroable`, which the action does not name (2026-10-22 amendment scope).
  - `medium` `defer` (blind-hunter) The retro's open question remains: may an Xaravel Test cite an FR with no consequence list? The rows start with 0 or 4 of 23 covered. That is the Maintainer's question (retro, Open questions), and this item does not decide it.
  - `low` `patch` (blind-hunter) The docs copy row data, and the `collections` phrasing differs from the other rows. Patched: the phrasing is now "FR-23, AD-2 and AD-6". The per-row copy stays, as in the existing `conformance` sentence.
  - `low` `patch` (blind-hunter) The docs do not record that three rows were backfilled after their Stories. Patched: one sentence naming the action item.
  - `false` `reject` (blind-hunter) There is no bookkeeping or verification evidence. Disproved: the item is set `done` with SPS in this PR, and the verification results are recorded under Auto Run Result at finalize.
  - `low` `patch` (edge-case) A missing Covers line makes the lazy match read the next Epic's line. Same root cause and patch as the bounded-regex row above.
  - `low` `patch` (edge-case) A missing Epic heading throws a bare TypeError. Patched with the same section assertion, which names the Epic.
  - `low` `reject` (edge-case) A Covers line that wraps onto a second line would be cut off. Every Covers line in `epics.md` is a single line today, and handling a wrap adds parsing for a case nobody meets.
  - `false` `reject` (intent-alignment) Under an outcome reading (R2/R3), the conditional re-cite should fire. Disproved for the action as written: the condition is that the check "rejects XT-reflection-1..3's FR-26 citation", and the coverage check's only per-citation rejection is the unknown-id warning (`coverage.ts:114`). `bun run xt:coverage reflection` printed none (`XT-COVERAGE reflection consequences=23 covered=4 uncovered=19`). Re-citing XT-reflection-1..3 to AD-2.k or AD-6.k ids they do not verify would also be a false mapping.
  - `false` `reject` (fidelity-review) "Fidelity Review produced no verdict: the diff … holds no file of action item epic-13-retro-item-1-consequence-rows's own change (ESC-9.10-4); nothing recorded". The tool reviews only the item's `packages/reflection` scope. This change touches no `packages/**`, so under the orchestrator rule (the 2026-10-22 amendment applies to items that change `packages/**`) there is nothing for it to review.

## Verification

**Commands:**
- `bun tools/xt-coverage/consequences.ts --check`: expected exit 0.
- `bun test conformance/tests/xaravel/done-check.test.ts`: expected all pass.
- `bun run xt:coverage reflection`: expected no `declares … which is not in` warning.
- `bun run harness`, `bun run typecheck`, `bun run lint`: expected clean.

## Auto Run Result

Status: done

**Summary:** Added `CONSEQUENCE_SOURCES` rows for `macroable`, `conditionable` and `reflection` (`{ frs: [], ads: [2, 6] }`; FR-26 has no consequence list) and for `collections` (`{ frs: [23], ads: [2, 6] }`), under MAINT-2026-10-22-consequence-rows. The four files are generated, and XT-conformance-126 now derives every row from `contracts` on from its Epic's Covers line. The conditional re-cite did not fire: `bun run xt:coverage reflection` prints no unknown-id warning for XT-reflection-1..3, so `packages/**` is unchanged.

**Files changed:**
- `tools/xt-coverage/consequences.ts`: four rows with Covers-line comments, and a doc-comment note that an FR with no consequence list is dropped.
- `conformance/xaravel-consequences/{macroable,conditionable,reflection,collections}.jsonl`: generated by `bun run xt:consequences`.
- `conformance/tests/xaravel/done-check.test.ts`: XT-conformance-126 derives the Epic 10–14 rows (bounded to each Epic's section, with the Component taken from `stories/<E>.1.md`), checks that every row from `contracts` on is derived, pins the values, and checks the `.1` ids. No assertion was removed.
- `docs/ops/done-check.md`: the stale "one row" sentence now describes the current rows, the ruling and the backfill.

**Review findings:** 16 in all. 6 patched (1 medium, 5 low), 5 deferred (see `deferred`), 5 rejected:
- structural checks per file: `--check` already pins each file;
- a Covers line that wraps: none does today;
- missing bookkeeping: done in the PR;
- the intent-alignment R2 reading: the condition did not fire, and re-citing to AD-2 or AD-6 would be a false mapping;
- Fidelity Review out of scope: no `packages/**` change, so ESC-9.10-4 records nothing.

**Follow-up review:** false (1 medium patched, no high).

**Verification:**
- `consequences.ts --check`: 7 files up to date.
- `bun test conformance/tests/xaravel/done-check.test.ts`: 4 pass.
- `bun run xt:coverage reflection`: `consequences=23 covered=4 uncovered=19`, with no warning for XT-reflection-1..3.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, Xaravel 390 passed, 0 failed.
- `bun run typecheck` and `bun run lint`: clean.

**Residual risks:** see `deferred`. `config` (Epic 15) still needs its row before its first Story with Xaravel Tests.
