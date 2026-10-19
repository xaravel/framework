---
title: 'Story 5.4: Fast mode, seeds and filters'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'e50427c1ca449271b75838e404c6588779a8a69b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-harness-runner-and-greppable-report.md'
  - '{project-root}/decisions/ESC-4.8-1.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** `bun run harness` (Story 5.3) always runs every Ported Test on every Variant. An agent can't run a reproducible sample, or only one Component's, glob's or Story's Test IDs (FR-9, PRD :298). Nothing installs the `xaravel.api.signature` lookup that ESC-4.8-1 item 1 assigned to this Story, so Mockery's Double never sees a declared return type under the harness.

**Approach:** Add a selection layer to `conformance/harness/harness.ts`. Filters (`--component`, `--id`, `--story`) pick Test IDs, `--fast` / `--seed` samples them by a seeded hash, and each Variant run gets only the selected Components' files plus a `bun test -t` name pattern. The comparison checks only the selected lines. The preload installs the signature lookup, which reads the committed `conformance/api-surface/*.jsonl` of the run's root.

## Boundaries & Constraints

**Always:**
- **CLI.** `harness.ts [--root <dir>] [--fast] [--seed <s>] [--component <c>]… [--id <glob>]… [--story <story-id>]`. A repeated filter takes the union of its values. Different filters intersect. Usage errors exit 2, as in 5.3: an unknown flag, a missing value, a second `--seed` or `--story`, or a seed that doesn't match `^[A-Za-z0-9._-]{1,64}$`.
- **Selection.** The universe is the Expectations Test IDs. Each ID's Component is the first path segment of its shard under `conformance/expectations/`.
  - `--component c`: IDs whose Component is `c`.
  - `--id g`: IDs the glob matches as a whole. `*` matches any run of characters, `?` matches one, and everything else is literal, including `\`.
  - `--story s`: the `test_ids` of `stories/<s>.md`, parsed with `parseManifest` from `tools/ownership`. A missing or invalid manifest fails a precondition (exit 1). Listed IDs that have no Expectations line go to stderr as one diagnostic with their count.
  - An empty selection fails a precondition (exit 1) with `no Test ID matches <the filters>`.
- **Fast mode** (AC 1, 2). `--seed s` implies `--fast`. Without `--seed`, the seed is 8 random hex characters.
  - The sample is the first `min(FAST_SAMPLE = 100, n)` selected IDs, ranked by the hex SHA-256 of `<seed>\n<id>`, with ties broken by `compareUnits`. It depends only on the seed and the selected set, so the same seed on the same commit gives the same sample.
  - The first stdout line is `FAST seed=<s> sample=<k>/<n>`. The SUMMARY line gets ` mode=fast seed=<s>` appended (AC 4).
  - A non-fast SUMMARY line is unchanged. Filters don't make a run a sample.
- **Done-check contract** (AC 4). `isFullRun(summaryLine)` is exported. It is true only for a `SUMMARY ` line without ` mode=fast`. `HarnessResult.sample` is `{seed, size, of}` in fast mode and `null` otherwise. `docs/ops/harness.md` states that Story 5.9's done check must use `isFullRun`, so a fast run never satisfies it.
- **Running a selection.** With no filter and no `--fast`, behavior is exactly 5.3's. Otherwise:
  - Only the Variants that have selected lines are listed and probed, and each checks only its selected lines. `checked` counts those lines.
  - The files are the Ported Test files under `packages/<c>/tests/ported/` for each selected Component.
  - The run gets `-t ^(?:<escaped ids>)$` unless one of these holds, in which case it gets no `-t`: every Expectations line of those Components on that Variant is selected, or the pattern is longer than 65,536 characters.
  - When `-t` is given and bun leaves no junit file and its stderr says `matched 0 tests`, the run counts as empty: every selected line's outcome is `missing`. `knownIds` stays the full Expectations set.
- **Signature lookup** (AC 5, ESC-4.8-1 item 1), `conformance/harness/signatures.ts`, `signatureLookup(dir) → (fqcn, member) => row | null`.
  - The index is built on the first call from every `*.jsonl` in `dir`, keeping only `kind: "method"` rows, keyed exactly on `fqcn` and `member`. Rows are deep-frozen, and every call for a key returns the same object.
  - A missing dir yields a lookup that always returns null. A malformed line throws an `Error` naming `file:line`. Non-string arguments return null.
  - The preload installs the lookup at `Symbol.for('xaravel.api.signature')`, non-writable, non-enumerable and **configurable**, so the save-and-restore install in Mockery's own tests (`double-scenarios.ts`) keeps working. It reads `XARAVEL_API_SURFACE`. The harness sets that to `<root>/conformance/api-surface`, and the default is the preload's sibling `../api-surface`.
- **Xaravel Tests.** Add `conformance/tests/xaravel/harness-select.test.ts` with XT-conformance-106..109 (manifest order) and XT-conformance-186 (AC 5). They use `bun:test`, and hermetic `mkdtemp` roots that hold two Components and Ported Tests importing the real `packages/assert` by absolute path. The real repo is only read. Add XT-186 to `stories/5.4.md`, and move the registry's next free ID to 187.

**Never:**
- No change to `compare.ts`'s matching, the 5.3 report line formats, the full-run SUMMARY, the Inventory, any shard, `tools/expectations`, `tools/ownership` or `AGENTS.md` (its harness TODO line stays for the Maintainer).
- No change to `packages/**`: Mockery's `SafeDefaultResolver` already reads the lookup.
- No worktree keys or locks (5.5), Ratchet (5.6), CI wiring (5.7) or `story:check` (5.9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fast | 150 IDs, `--fast` | `FAST seed=<8hex> sample=100/150` first; SUMMARY `… mode=fast seed=<s>` | exit per differences |
| Same seed | `--seed abc` twice | identical selected set and output | — |
| Small set | 3 IDs, `--seed x` | `sample=3/3` | — |
| Component | `--component support` | only support lines checked; only support files passed | — |
| Glob | `--id 'X\T::test*'` | matches `X\T::testA`, not `X\Tz::testA` | — |
| Story | `stories/9.9.md` test_ids [A, Z(no line)] | checks A; stderr notes 1 unknown | missing manifest → exit 1 |
| Empty | `--component nope` | `harness: no Test ID matches --component nope` | exit 1 |
| Zero matched | selected IDs with no declared test | every line `missing` (skip lines match) | no junit → not a failure |
| Usage | `--seed` w/o value, `--seed 'a b'`, `--story` twice | usage message | exit 2 |
| Signature | surface row for `A\B::m` | lookup returns frozen row; `(A\B, nope)` → null; same object on 2nd call | malformed → throws file:line |
| Real repo | `signatureLookup(<repo>/conformance/api-surface)` | `Illuminate\Support\Arr::__call` row has 2 parameters | — |

</intent-contract>

## Code Map

- `conformance/harness/harness.ts:62-77,234-345,347-400` -- `HarnessOptions`/`HarnessResult`, `runHarness` (where to filter lines, files and variants), `parseArgs` (returns only the root today; extend it to an options object), `main`.
- `conformance/harness/harness.ts:184-232` -- `runVariant`: add the `-t` arg, the `XARAVEL_API_SURFACE` env and the zero-match handling, before the "no junit" precondition.
- `conformance/harness/preload.ts:23-51` -- `install()` creates non-configurable properties; add a configurable variant for the lookup.
- `conformance/harness/compare.ts:233-263` -- `compare` iterates over `lines` and flags UNKNOWN only for IDs outside `knownIds`, so passing it the filtered lines is enough.
- `tools/pin-bump/pin-bump.ts:365` -- `readExpectations` returns `Shard{path (repo-relative, conformance/expectations/<component>/…), lines}`.
- `tools/ownership/ownership.ts:147` -- `parseManifest(file, text)` returns `{manifest: {testIds}, violations}`.
- `tools/inventory/inventory.ts:167` -- `compareUnits`.
- `packages/assert/src/declarations/portedTest.ts:85` -- a test's bun label is its full Test ID, so `-t ^(?:…)$` selects it exactly. Bun 1.4.3 reports filtered-out tests as junit `<skipped/>`, and exits 1 with `regex … matched 0 tests` and no junit when nothing matches (checked).
- `packages/mockery/src/JMac/Testing/Engine/SafeDefaultResolver.ts:24-45` -- the read-only consumer. It reads `returns` and `nullable`.
- `packages/mockery/tests/xaravel/double-scenarios.ts:212-235` -- saves and restores the lookup descriptor, which is why the global is configurable.
- `conformance/api-surface/*.jsonl` -- 44 files, about 21k rows, 15,077 of them `method`. Row fields: `fqcn, kind, member, static, parameters[{name,type,nullable,default,optional,variadic,byRef}], returns, nullable`.
- `conformance/tests/xaravel/harness.test.ts:30-120` -- the fixture helpers (`inventory`, `shard`, `ported`) to copy.
- `stories/5.4.md`, `_bmad-output/implementation-artifacts/story-manifests.md:18` -- XT-186 and the registry.
- `docs/ops/harness.md` -- the usage, the FAST line, the `mode=fast` SUMMARY, `isFullRun`, the signature lookup, and the configurable exception in the preload section.

## Tasks & Acceptance

**Execution:**
- `conformance/harness/select.ts` -- `globToRegExp`, `sampleIds(ids, seed, size)`, `selectIds(universe, filters)`, `namePattern(ids)`.
- `conformance/harness/signatures.ts` -- `signatureLookup(dir)`.
- `conformance/harness/preload.ts` -- install the lookup.
- `conformance/harness/harness.ts` -- the options, selection, per-Variant files and pattern, FAST/SUMMARY, `isFullRun`, `sample`, parseArgs, and the header comment.
- `conformance/tests/xaravel/harness-select.test.ts` -- XT-106..109 and 186, covering the matrix.
- `stories/5.4.md`, `story-manifests.md`, `docs/ops/harness.md` -- as above.

**Acceptance Criteria:**
- Given `--fast`, then the seed is printed and the sample is deterministic from it (XT-conformance-106).
- Given `--seed <s>` twice on the same tree, then the same sample runs (XT-107).
- Given `--component`, `--id` or `--story`, then only matching Test IDs run, and `--story` reads the manifest's `test_ids` (XT-108).
- Given a fast run, then the report notes the sample, and `isFullRun` is false for its SUMMARY (XT-109).
- Given the committed api-surface, then a Ported Test under the harness sees `globalThis[Symbol.for('xaravel.api.signature')]` return the row, or null (XT-186).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 25 findings — high 0, medium 3, low 16, false 6, maybe-false 0 (the intent-alignment report is descriptive and counted as one row)
- findings:
  - (blind) `[low]` `[patch]` `--story` on a manifest with empty `test_ids` (every conformance Story) fails with the generic "no Test ID matches" — now fails with `stories/<s>.md lists no test_ids`. Grouped with edge 4. Selecting `xaravel_test_ids` is not this Story's: the AC says `test_ids`, and Xaravel Tests come under the harness in 5.9.
  - (blind) `[false]` `[reject]` the `matched 0 tests` rule hides import failures — checked on bun 1.4.3: a selected file that throws at import reports `1 fail / 1 error`, never `matched 0 tests`, so the empty-run rule doesn't fire. Grouped with edge 5.
  - (blind) `[false]` `[reject]` `isFullRun` is true for filtered runs — by design: Story 5.7's per-PR run is "a full run of the Story's `test_ids`", i.e. a filtered unsampled run, and 5.9's "last CI run was a full run" means not sampled. Grouped with edge 6.
  - (blind) `[low]` `[reject]` UNKNOWN lines appear only when `-t` is omitted — an UNKNOWN is a Ported Test with no Expectations line, which every full run reports; making a filtered run consistent needs a new branch in `compare`, and the case is rare.
  - (blind) `[medium]` `[patch]` new paths untested, chiefly the MAX_PATTERN fallback — added a >65,536-character partial selection case to XT-108. Grouped with verification-gap 1 and edge 1/edge claim. The other listed paths (fast+filter, invalid seed via `runHarness`) are direct code covered by the same branches.
  - (blind) `[low]` `[patch]` a malformed `--story` id exits 1 with "does not exist" — now a usage error (exit 2) naming `<epic>.<story>`.
  - (blind) `[low]` `[reject]` `--root` can repeat — last-wins, as in 5.3; no harm named.
  - (blind) `[low]` `[reject]` the signature lookup is configurable — deliberate (spec Always): Mockery's own tests save and restore its descriptor (`double-scenarios.ts:212-235`), ESC-4.8-1 sets no non-configurable requirement, and a replaced lookup changes only Double's default return values, which fidelity review sees. Grouped with edge 10.
  - (blind) `[low]` `[reject]` `signatures.ts` validates little (duplicates, row shape, lazy throw) — the committed surface has no duplicate method rows (checked with jq) and is generated and checked by Story 3.5's tool; a lazy throw needs malformed committed data. Grouped with edge 8, edge 9.
  - (blind) `[low]` `[reject]` exact-case lookup — Double asks with `fqcn()`'s declared-case FQCN, the same text the surface records (ESC-4.8-1 item 1); PHP-style case folding would add a normalisation rule nothing calls for.
  - (blind) `[low]` `[patch]` the unknown `--story` ID diagnostic is unbounded — it now prints the count and at most 10 IDs.
  - (blind) `[low]` `[reject]` XT-186 hard-codes the committed `Arr::__call` row's 2 parameters — a pin bump regenerates the surface and re-runs this suite, where a changed row is visible at once.
  - (edge 1) `[medium]` `[patch]` oversized pattern runs every test of the files — grouped with the MAX_PATTERN test patch; the behaviour (slower, comparison still restricted) is the spec's and is documented.
  - (edge 2) `[low]` `[reject]` the same Test ID in two Components' shards — an Inventory ID has exactly one Component and shards mirror it; `expectations:check` ties lines to the Inventory.
  - (edge 3) `[low]` `[reject]` a shard directly under `conformance/expectations/` — the Story 5.1 layout requires `<component>/…`, and none exists.
  - (edge 4) `[low]` `[patch]` empty `test_ids` — grouped with blind 1.
  - (edge 5) `[false]` `[reject]` import errors swallowed by `matched 0 tests` — refuted by the bun 1.4.3 check above.
  - (edge 6) `[false]` `[reject]` filtered SUMMARY counted as full — see blind 3.
  - (edge 7) `[low]` `[patch]` `signatures.ts` reads `node:fs` functions at first call, so a `mock.module('node:fs')` in a Ported Test would be read through — the functions are captured at load.
  - (edge 8) `[low]` `[reject]` a malformed line throws inside the first calling test — grouped with blind 9.
  - (edge 9) `[false]` `[reject]` duplicate rows depend on file order — none exist in the committed surface (checked).
  - (edge 10) `[low]` `[reject]` a test can delete the configurable global — grouped with blind 8.
  - (edge claim) `[false]` `[reject]` "only matching Test IDs run" is broken when `-t` is omitted — with no `-t` because every Component line is selected, the only extra tests are ones with no Expectations line; past MAX_PATTERN the spec accepts a slower run with an unchanged comparison.
  - (verification-gap 1) `[medium]` `[patch]` the MAX_PATTERN branch is never exercised — test added (grouped above).
  - (intent) `[low]` `[reject]` descriptive: AC 1/2 are tested on fixture roots and the CLI, not the real repo's commit — the real-repo CLI runs are in Verification; AC 4's done check is 5.9's, bound through `isFullRun`; AC 5's harness test uses a fixture surface, with the committed surface read directly and through the preload default.

## Design Notes

Ranking by a per-ID hash, rather than shuffling with a PRNG, keeps the sample independent of file order and stable when unrelated IDs are added. Filtering through `-t` and per-Component files keeps a fast run fast as the port grows, while the full-set comparison semantics stay in `compare`. The 64 KiB cap keeps a single argv entry under Linux's 128 KiB `MAX_ARG_STRLEN`. Past the cap the run is only slower, never wrong, because the comparison is restricted anyway.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/harness-select.test.ts conformance/tests/xaravel/harness.test.ts` -- all pass.
- `bun run harness --fast --seed demo` twice -- identical output with `FAST seed=demo sample=100/<n>`; exit 0.
- `bun run harness --component support` -- SUMMARY with checked equal to the support lines on run variants; exit 0.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check`, `bun run expectations:check`, `bun run protected-paths:codeowners` -- all pass.

## Auto Run Result

Status: done

**Summary.** `bun run harness` gains a selection layer and the API signature lookup.
- **Filters.** `--component <c>`, `--id <glob>` and `--story <story-id>`. A repeated filter is a union and different filters intersect. `--story` reads the manifest's `test_ids` through `parseManifest`.
- **Fast mode.** `--fast`, or `--seed <s>`, samples up to 100 selected Test IDs, ranked by SHA-256 of `<seed>\n<id>`. It prints `FAST seed=<s> sample=<k>/<n>` first and appends ` mode=fast seed=<s>` to SUMMARY. `isFullRun(summary)` is false for such a run, and `docs/ops/harness.md` binds Story 5.9's done check to it.
- **Running a selection.** Each Variant run gets only the selected Components' Ported Test files, plus a `-t` name pattern when the selection is partial and the pattern is at most 64 KiB. The comparison checks only the selected lines.
- **Signature lookup.** The preload installs `globalThis[Symbol.for('xaravel.api.signature')]`, built lazily from `<root>/conformance/api-surface/*.jsonl`. It returns deep-frozen method rows or null (ESC-4.8-1 item 1).

**Files changed.**
- `conformance/harness/select.ts` (new): glob, sample, selection and the `-t` pattern.
- `conformance/harness/signatures.ts` (new): `signatureLookup(dir)`.
- `conformance/harness/preload.ts`: installs the lookup (configurable, non-writable).
- `conformance/harness/harness.ts`: the CLI flags, selection, per-Variant files and pattern, FAST and SUMMARY, `isFullRun`, `sample`, and `XARAVEL_API_SURFACE`.
- `conformance/tests/xaravel/harness-select.test.ts` (new): XT-conformance-106..109 and 186.
- `stories/5.4.md`: XT-conformance-186 for AC 5. `story-manifests.md`: the next free ID is 187.
- `docs/ops/harness.md`: the filters, fast mode, the done-check contract and the lookup.

**Deviation from the spec's text (not its intent).** The contract says a `-t` run that matches nothing leaves no junit file. On bun 1.4.3 it writes one, with every testcase skipped, and exits 1 with `matched 0 tests`. The empty-run rule therefore keys on a non-zero exit plus that stderr text, whether or not a junit file exists. The selected lines come out `missing`, as intended. An import failure doesn't trigger the rule: bun reports it as `1 fail / 1 error` (checked).

**Review.** 25 findings: 3 medium, 16 low, 6 false.
- **Patched: 5 entries** (1 medium, 4 low):
  - the MAX_PATTERN fallback test;
  - a malformed `--story` is now a usage error;
  - `lists no test_ids` for an empty manifest;
  - the unknown-ID diagnostic is capped at 10 IDs;
  - the `node:fs` functions in `signatures.ts` are captured at load.
- **Deferred:** none.
- **Rejected:** each with its reason in the triage log.
  - The false findings: the import-failure swallow, filtered runs counting as full, duplicate surface rows, and "only matching IDs run".
  - The low ones: UNKNOWN consistency without `-t`, a repeated `--root`, the configurable lookup (Mockery's tests save and restore it), surface validation and the lazy throw, exact-case matching, the same ID in two Components, a shard without a Component directory, and the hard-coded `Arr::__call` row.

**Follow-up review recommended: false.** The only medium patched was a test addition, so 1 medium and 4 low were patched.

**Verification.**
- `bun test` on `harness-select.test.ts` and `harness.test.ts`: 11 pass.
- `bun run harness --fast --seed demo`, run twice: identical output (`FAST seed=demo sample=100/22070`, `SUMMARY variants=9 run=4 not-run=5 checked=97 differ=0 mode=fast seed=demo`), exit 0.
- `bun run harness --component support`: `SUMMARY variants=1 run=1 not-run=0 checked=1260 differ=0`.
- `bun run test`: 195 pass, 0 fail.
- `typecheck`, `lint`, `escalations:check` (only the existing ESC-5.3-2/3 warnings), `expectations:check` and `protected-paths:codeowners` all pass, with no CODEOWNERS drift.

**Residual risks.**
- **Manual check under the preload.** Story 5.3's manual check `bun test --preload conformance/harness/preload.ts packages` now has one failure: XT-mockery-7 (`packages/mockery/tests/xaravel/mockery.test.ts:983`) asserts that no lookup is installed. The harness never runs that file. Story 5.9 brings Xaravel Tests under the harness and must resolve it; 5.4 may not edit `packages/**`.
- **The `--story` workflow.** It selects nothing for any Story whose `test_ids` are empty (all Phase 0 Stories), by AC.
- **Configurable lookup.** It is configurable, so a Ported Test could replace it.
