---
title: 'Story 5.4: Fast mode, seeds and filters'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
baseline_revision: 'c2ec7d6e91f889f9a78f0a840d86d1b9fbb82996'
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

## Design Notes

Ranking by a per-ID hash, rather than shuffling with a PRNG, keeps the sample independent of file order and stable when unrelated IDs are added. Filtering through `-t` and per-Component files keeps a fast run fast as the port grows, while the full-set comparison semantics stay in `compare`. The 64 KiB cap keeps a single argv entry under Linux's 128 KiB `MAX_ARG_STRLEN`. Past the cap the run is only slower, never wrong, because the comparison is restricted anyway.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/harness-select.test.ts conformance/tests/xaravel/harness.test.ts` -- all pass.
- `bun run harness --fast --seed demo` twice -- identical output with `FAST seed=demo sample=100/<n>`; exit 0.
- `bun run harness --component support` -- SUMMARY with checked equal to the support lines on run variants; exit 0.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check`, `bun run expectations:check`, `bun run protected-paths:codeowners` -- all pass.
