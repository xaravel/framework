---
title: 'A Ported Test runs only on its own Variants, and each SQLite Variant gets a fresh cache (retro epic-5 item 14, ESC-5.3-4)'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'b62ae314d5ecf7e39de608e0f5d46a284c5197b4'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/ESC-5.3-4.md'
  - '{project-root}/conformance/escalations/ESC-5.3-4.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The harness spawns `bun test` over every Ported Test file on every Variant (`harness.ts` `let files = allFiles`), nothing under `packages/` reads `XARAVEL_VARIANT`, and `compare` silently drops reports for Test IDs that belong to another Variant. A hang or crash on a non-member Variant costs a run with no line naming it. Backend preparation is memoised per backend, so `.cache/sqlite/` is reset once and the second SQLite Variant inherits the first one's state. The Maintainer approved both fixes in ESC-5.3-4.

**Approach:** (1) The preload installs a membership hook built from the Inventory and `XARAVEL_VARIANT`. `portedTest` reserves every row's Test ID but declares with bun only the rows the hook admits. The harness passes each Variant run only the Ported Test files that mirror an Expectations shard with a line on that Variant. `compare` reports a Ported Test report with no line on the run's Variant as `UNKNOWN`. (2) The harness prepares the `sqlite` backend before every Variant run whose backend is `sqlite`. Every other backend stays memoised.

## Boundaries & Constraints

**Always:**
- Membership comes only from the Inventory `backends` (AD-15: "Variants: from the Test Inventory's `backends`").
- Membership looks up the full Test ID (`<id>` or `<id>#<key>`; Inventory IDs are per dataset row). An ID that is not in the Inventory is always declared, so it surfaces as `UNKNOWN`.
- FR-2's duplicate check still covers every row, including rows that are not declared.
- The hook exists only when the harness sets both `XARAVEL_VARIANT` and `XARAVEL_INVENTORY`, which it does for Ported Test Variant runs only. Plain `bun test` and the Xaravel run (`XARAVEL_VARIANT=none`, no `XARAVEL_INVENTORY`) declare everything, as they do today.
- The hook is installed non-writable and non-configurable, like `REPORT`. It parses the Inventory lazily, on its first call.
- A fast run still only creates `.cache/sqlite/`, and never removes it.
- Existing XT assertions keep their expected values. Tests only gain cases.

**Never:** Do not edit `conformance/expectations/**`, `conformance/inventory/**`, `conformance/protected-paths`, `.github/workflows/*`, `AGENTS.md`, `epics.md`, the spine, the PRD or SPEC. Do not drop or weaken any assertion. Do not make `@xaravel/assert` import from `conformance/` or `tools/`: it reads only the global hook.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Member | `A` backends `[none]`, run Variant `none` | `A` declared, run and graded | — |
| Non-member | `B` backends `[sqlite]`, run Variant `none` | `B` not declared on `none`: no testcase, no report, no difference | — |
| Unknown id | `portedTest("Z")`, `Z` not in Inventory | declared on every Variant its file runs on; `UNKNOWN Z [v]` | counts as a difference |
| Stray report | a report for `B` (line only on `sqlite`) arrives on the `none` run | `UNKNOWN B [none] expected=- actual=…` | one difference |
| Duplicate non-member | two `portedTest("B")`, run on `none` | FR-2 "already declared" error still thrown | file import fails, as today |
| File mirrors shard | `packages/c/tests/ported/<U>.test.ts` (or a slice `<U>/<s>.test.ts`), shard `conformance/expectations/c/<U>.jsonl` with lines only on `sqlite` | file is passed only to the `sqlite` run | — |
| Unmapped file | no shard mirrors the file | passed to every Variant run (its rows are still filtered by membership) | — |
| No file for Variant | none of the Variant's shards has a file | `emptyRun()`; its lines are `missing` | — |
| Two SQLite Variants | full run with `queue-database@sqlite` then `sqlite` | `.cache/sqlite/` removed and recreated before each one | — |
| Fast run | `--fast`, both SQLite Variants | only created; files survive | — |
| Plain `bun test` | no `XARAVEL_INVENTORY` | every row declared | — |

</intent-contract>

## Code Map

- `packages/assert/src/declarations/portedTest.ts`: `portedTest` builds `planned` rows, then `registerTests("portedTest()", "ported", null, planned, true)`. Add `const MEMBER = Symbol.for("xaravel.harness.member")` and set `declare: member(label)` on each row. Update the header comment.
- `packages/assert/src/declarations/Declarations.ts`: `PlannedTest` and `registerTests`. Add an optional `declare?: boolean`. The duplicate check covers every row; `test(...)` is called only for rows whose `declare !== false`. Document the field in the header.
- `conformance/harness/preload.ts`: installs `REPORT`, `LATE` and `SIGNATURE`. Add step 4: install `Symbol.for('xaravel.harness.member')` when `XARAVEL_VARIANT` and `XARAVEL_INVENTORY` are both non-empty.
- `conformance/harness/membership.ts` (new): `membership(dir, variant): (id: string) => boolean`. It is lazy and reads every `*.jsonl` in `dir` with one `JSON.parse` per line, taking `id` and `backends`. It returns true for unknown IDs. A malformed line throws on the first call, naming the file and line.
- `conformance/harness/harness.ts`: `runVariant` (child env, ~l.360-375) gains `XARAVEL_INVENTORY=<root>/conformance/inventory` only when `label !== "xaravel"` (pass it via `isolated` or a parameter). The shard loop (~l.526) records each Variant's shard sub-paths: `shard.path` minus `conformance/expectations/` and `.jsonl`, giving `<c>/<U>`. The per-Variant file choice (~l.613) intersects `files` with the Variant's mirrored files plus the unmapped files. Pass `knownIds` per Variant, built from `byVariant.get(variant)` (all lines, not only the selected ones). In the backend loop (~l.592-597), call `prepare("sqlite")` on every Variant whose backend is `sqlite`, not memoised. Update the header paragraphs (l.60-82) to match.
- `conformance/harness/compare.ts`: `CompareInput.knownIds` (l.100) becomes every ID with a line on `variant`. Update its doc comment and the header's `UNKNOWN` sentence (l.35-36).
- `conformance/tests/xaravel/harness.test.ts`: fixture `makeRoot`, `TEST_FILE` (does not mirror `SHARD`, so it is an unmapped file), and XT-conformance-101 (l.150), which is ESC-5.3-4's `test_ids`.
- `conformance/tests/xaravel/harness-isolation.test.ts`: XT-conformance-111 (l.417), the SQLite cache. Its fixture `inventory()` derives `backends` from the lines.
- `tools/expectations/expectations.ts` `shardPathFor` (l.167): shard = `conformance/expectations/<component>/<source without line range and .php>.jsonl`. Read-only evidence for the file mirror (AD-15 Location: `packages/<c>/tests/ported/<Upstream test path>.test.ts`, slice `<Upstream test path>/<slice>.test.ts`).

## Tasks & Acceptance

**Execution:**
- `conformance/harness/membership.ts`: create the lazy membership reader. It is the only Inventory reader in the child process.
- `conformance/harness/preload.ts`: install the hook as above, with the header updated.
- `packages/assert/src/declarations/Declarations.ts` and `portedTest.ts`: reserve every row, and declare only the member rows.
- `conformance/harness/compare.ts` and `harness.ts`: per-Variant `knownIds`, per-Variant files, `XARAVEL_INVENTORY` on Ported runs, and an SQLite reset before each Variant. Update the headers.
- `conformance/tests/xaravel/harness.test.ts`: extend XT-conformance-101 with cases for membership (non-member not declared), the mirrored-file filter (a file that mirrors a `sqlite`-only shard is not passed to `none`, checked through the `bun test exited … over <n> file(s)` diagnostics), an unknown ID giving `UNKNOWN`, and a `compare` unit case where a report known only on another Variant gives `UNKNOWN`.
- `conformance/tests/xaravel/harness-isolation.test.ts`: extend XT-conformance-111. A full run with `queue-database@sqlite` and `sqlite` lines must show each Variant starting with an empty `.cache/sqlite/`: the test writes a marker file and asserts no marker was there at its start. Extend the matching VARIANTS fixture if needed.

**Acceptance Criteria:**
- Given an Inventory entry with `backends: ["sqlite"]` and a Ported Test for it, when the harness runs Variant `none`, then no junit testcase and no report exist for it on `none`, and the run reports no difference for it.
- Given a Ported Test file that mirrors a shard whose lines are all on `sqlite`, when the harness runs, then the `none` run's `bun test` is not given that file.
- Given a full run with two SQLite-backend Variants, when the second starts, then `.cache/sqlite/` holds nothing the first left behind.
- Given the existing XT suite, when it runs, then every pre-existing assertion passes unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 25 findings — high 4, medium 5, low 10, false 6, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The `oracle-nondeterminism.jsonl` exclusion and the malformed-line error are untested. Added an XT-101 fixture with a real-shaped nondeterminism line and a malformed-line case.
  - `[medium]` `[patch]` (verification-gap) Dataset-row membership (full `<id>#<key>` lookup) is untested. Added a dataset case to XT-101 whose rows have different backends.
  - `[medium]` `[patch]` (verification-gap) Per-Variant `knownIds` is tested only through a hand-built `compare` call. Added an end-to-end stray `UNKNOWN B [none]` case to XT-101.
  - `[medium]` `[patch]` (verification-gap) The mirror filter is untested under a selection. Added a `components` run over the mirror fixture.
  - `[low]` `[reject]` (verification-gap) Stripping an inherited `XARAVEL_INVENTORY` from the Xaravel run is untested. It only matters when someone exports the variable by hand, and the fix is a new test fixture.
  - `[high]` `[patch]` (edge-case) When every row in a Variant's files is a non-member, bun runs 0 tests, exits 0 and writes no junit file, so the harness aborts. Checked on bun 1.4.3. Such a run is now an empty run, with a diagnostic and its lines `missing`, and an XT-101 case covers it.
  - `[high]` `[patch]` (edge-case) The same zero-test abort on the `-t` selection path. It shares the root cause and the fix.
  - `[low]` `[reject]` (edge-case) Another non-entry `*.jsonl` could be added beside the Inventory. The filter is identical to `tools/pin-bump`'s `inventoryNames`, and adding such a file would need tool changes anyway; sharing the filter would load `tools/` in every child.
  - `[high]` `[patch]` (edge-case claim) A partly ported file can abort full runs. Same root cause as the zero-test abort.
  - `[high]` `[patch]` (blind) A Variant run with zero tests aborts the harness. Same root cause and fix.
  - `[medium]` `[patch]` (blind) An unmapped Ported Test file runs everywhere and no line names it. Added one `mirrors no Expectations shard` stderr diagnostic per file.
  - `[low]` `[reject]` (blind) `mirroredShards` accepts any ancestor directory, but AD-15 allows one slice level. A shard name equal to an ancestor directory of an unrelated file does not occur in practice, and the extra match only widens a file's Variants.
  - `[low]` `[reject]` (blind) `membership.ts` duplicates Inventory reading and each child re-parses 8 MB. The parse is lazy and costs about 50 ms per Variant run, and writing a per-Variant file is a redesign for negligible gain.
  - `[low]` `[reject]` (blind) Some Always constraints are untested: the hook being non-writable, the lazy parse, the env strip. The malformed-line and nondeterminism cases were added under the verification-gap rows; the rest are cosmetic.
  - `[false]` `[reject]` (blind) A fast run reports a spurious FAIL from state leaking between SQLite Variants. ESC-5.3-4 limits the reset to "on a full run", fast runs never satisfy the done check, and Story 5.5 keeps fast runs create-only on purpose.
  - `[low]` `[patch]` (blind) XT-110's fixture now depends on `TEST_FILE` being unmapped. Added a comment on `TEST_FILE` in both test files; the change is recorded in the Auto Run Result.
  - `[false]` `[reject]` (blind) The plain `bun test` check is fragile. If Bun passed the string "undefined", the hook would read a missing directory and the test would fail loudly, never pass falsely.
  - `[low]` `[patch]` (blind) A stale memo write and stale doc text. Reflowed the header, corrected the `portedEnv` comment, and skipped `prepared.set` for `sqlite`.
  - `[false]` `[reject]` (intent) `portedTest` does not read `XARAVEL_VARIANT` itself. The ruling asks only that it not declare non-members under the harness; plain `bun test` has no Variant.
  - `[false]` `[reject]` (intent) Membership uses the Inventory while the file filter and UNKNOWN use the Expectations. `expectations:check` requires a Test ID's Variants to be exactly its `backends`, so the two agree on valid data.
  - `[low]` `[reject]` (intent) Unmapped files run everywhere, wider than the literal "only the files". This is deliberate, so the filter cannot rot silently, and it is now named by a diagnostic.
  - `[false]` `[reject]` (intent) The SQLite reset applies to full runs only. That matches ESC-5.3-4's "On a full run"; see the fast-run row above.
  - `[low]` `[reject]` (intent) The XT-110 fixture changed and the VARIANTS fixture grew. The audit says no assertion or expected value changed; this is informational.
  - `[low]` `[reject]` (intent) Readings enumerated: descriptive only, no defect.
  - `[false]` `[reject]` (intent) The test surface is end-to-end `runHarness` plus one `compare` call. That matches the intent's surfaces: the harness and `portedTest` under the harness.

## Design Notes

Files with no mirrored shard run on every Variant. ESC-5.3-4 wants a filter that "cannot rot silently". A misplaced or unmapped file that never ran would hide its tests, while running it everywhere keeps them visible: membership still filters known IDs, and unknown IDs report `UNKNOWN`. The existing fixtures use such unmapped files, so their behaviour is unchanged.

The file → Variant mapping uses the Expectations shard path, which AD-15 already defines as mirroring the Ported Test file, so it adds no new data. A file `packages/<c>/tests/ported/<P>.test.ts` mirrors shard sub-path `<c>/<S>` when `P === S` or `P` starts with `S + "/"` (a slice).

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/harness.test.ts conformance/tests/xaravel/harness-isolation.test.ts packages/assert` -- expected: all pass
- `bun run harness --xaravel` -- expected: SUMMARY differ=0
- `bun run typecheck` and `bun run lint` -- expected: clean

## Auto Run Result

Status: done

**Summary.** Both parts of ESC-5.3-4 are built. Under the harness, `portedTest` declares a row only when the Inventory `backends` of its full Test ID list the run's Variant. The rule comes from a preload hook that reads `XARAVEL_INVENTORY`, and plain `bun test` is unchanged. The harness gives each Variant run only the Ported Test files that mirror an Expectations shard with a line on that Variant, plus any unmapped files, each named by a diagnostic. A report for an ID with no line on the run's Variant is `UNKNOWN`. On a full run, `.cache/sqlite/` is reset before every Variant whose backend is `sqlite`. A run whose files declare no test (bun exits 0 and writes no junit) is an empty run, and its lines are `missing`.

**Files changed**
- `conformance/harness/membership.ts` (new): a lazy Inventory reader, `id` → `backends`. An unknown ID counts as a member.
- `conformance/harness/preload.ts`: installs `Symbol.for('xaravel.harness.member')` when `XARAVEL_VARIANT` and `XARAVEL_INVENTORY` are both set.
- `packages/assert/src/declarations/Declarations.ts`: `PlannedTest.declare`. Every row is reserved for FR-2, and only rows with `declare !== false` are declared.
- `packages/assert/src/declarations/portedTest.ts`: sets `declare` from the hook.
- `conformance/harness/harness.ts`:
  - per-Variant `knownIds` and shard sets, the mirror helpers and per-Variant files;
  - the unmapped-file diagnostic;
  - `XARAVEL_INVENTORY` on Ported runs only;
  - the SQLite reset before every SQLite Variant;
  - the zero-test empty run;
  - header updated.
- `conformance/harness/compare.ts`: doc comments only (`knownIds` is per Variant).
- `conformance/tests/xaravel/harness.test.ts`: new XT-conformance-101 cases for membership, plain `bun test`, the mirror and slice files, the mirror under a selection, the unmapped diagnostic, an unknown ID, a duplicate non-member, a zero-test Variant, `oracle-nondeterminism.jsonl`, a malformed Inventory line, dataset rows, and a stray `UNKNOWN` end to end. Also a `compare` unit case.
- `conformance/tests/xaravel/harness-isolation.test.ts`: XT-conformance-111 gains the two-SQLite-Variant reset case and its fast-run counterpart. The XT-conformance-110 fixture now records the env at file load rather than inside test A, because A no longer runs on `pgsql`; its assertions and expected values are unchanged. `TEST_FILE` carries a comment that it deliberately mirrors no shard.

**Review.** One review pass with 25 findings.
- Patched: 4 high (one root cause, the zero-test abort), 5 medium (test gaps and the unmapped-file diagnostic), 3 low (comments, memo, `TEST_FILE` notes).
- Deferred: none.
- Rejected: 7 low and 6 false, each with its reason in the Review Triage Log.

**Follow-up review recommended.** A high was patched on this first pass. The zero-test empty-run path and the unmapped-file diagnostic were added after the review and have not been reviewed themselves.

**Verification**
- `bun test conformance/tests/xaravel/harness.test.ts conformance/tests/xaravel/harness-isolation.test.ts conformance/tests/xaravel/harness-select.test.ts packages/assert`: 32 pass, 0 fail.
- `bun run typecheck` and `bun run lint`: clean.
- `bun run harness --xaravel`: 242/242, SUMMARY `differ=0`.
- The subagent checked that the new XT-101 and XT-111 cases fail with the harness changes stashed.

**Residual risks**
- File filtering relies on Ported Test files sitting at their full shard path, `packages/<c>/tests/ported/framework/tests/...`. Files elsewhere still run on every Variant, now with a diagnostic.
- The Xaravel run's removal of an inherited `XARAVEL_INVENTORY` is not tested.
- `conformance/bench/expectations.bench.ts` still passes one ID set covering every Variant, which is harmless for the benchmark.
