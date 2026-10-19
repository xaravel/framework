---
title: 'Story 5.1: Variant vocabulary and Expectations File'
type: 'feature'
created: '2026-10-18'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/conformance/escalations/ESC-5.1-1.md'
  - '{project-root}/decisions/ESC-5.1-1.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Expectations File (FR-3, AD-15) does not exist: there is no `conformance/variants` vocabulary, no `conformance/expectations/` shards and no check that every Test ID × Variant has exactly one line, so nothing downstream (5.2 rule checks, 5.3 harness, 5.6 Ratchet) has data to read.

**Approach:** Add the closed vocabulary file, a `tools/expectations/` CLI with `init` (generate missing lines from the Inventory) and `check` (uniqueness plus sorted/UTF-8/LF format), run `init` to commit the initial shards, gate `check` in CI's required job, and cover each AC with XT-conformance-89/90/91.

## Boundaries & Constraints

**Always:**
- `conformance/variants`: UTF-8, LF, one Variant per line, `#` comment lines and blank lines ignored, Variant lines sorted by `compareUnits` and unique. A Variant matches `^[a-z0-9]+$` or `^[a-z0-9]+(-[a-z0-9]+)*@[a-z0-9]+$`. Members (ESC-5.1-1, approved): `mariadb`, `mysql`, `none`, `pgsql`, `queue-beanstalkd@beanstalkd`, `queue-database@pgsql`, `queue-database@sqlite`, `queue-redis@redis`, `queue-sync@none`, `redis`, `session-redis@redis`, `sqlite`, `sqlsrv`. It is a superset of `ALPHA_VARIANTS` (`tools/inventory/inventory.ts:93`).
- An Inventory Test ID's Variants are exactly its `backends` (AD-15). Any backend not in the vocabulary makes `init` and `check` fail naming the ID and backend.
- Shard path: `conformance/expectations/<component>/<Upstream test path>.jsonl`, where `<Upstream test path>` is the entry's `source` with the `:<start>-<end>` suffix and the `.php` extension removed (e.g. `support/framework/tests/Integration/Support/AuthFacadeTest.jsonl`). This mirrors `packages/<c>/tests/ported/<Upstream test path>.test.ts` (AD-15 location).
- A line is a JSON object with exactly the keys `id`, `variant`, `status`, `reason`, `adapted`, `escalation`, in that order, no spaces (`JSON.stringify` of the ordered object — byte-identical to `pin-bump.ts` `serialiseExpectation` for these six keys). `init` writes `status:"skip"`, `reason:"not-ported-yet"` (`"deferred:ai-sdk"` when `component` is `ai`), `adapted:null`, `escalation:null`.
- Within a shard, lines sorted by `id` then `variant` (`compareUnits`); file ends with exactly one LF; no CR, no blank lines, no BOM.
- `init` is additive and idempotent: it adds only pairs that appear in no shard, never rewrites or removes an existing line, re-sorts only shards it touches, and a second run changes nothing. It prints `Expectations init: added <n> line(s) in <m> shard(s).`
- `check` reads every `*.jsonl` under `conformance/expectations/` (recursive) and reports one violation per line on stderr, then exits 1; on success prints `Expectations OK: <lines> line(s) in <shards> shard(s) cover <pairs> Test ID × Variant pair(s).` Violations: unreadable vocabulary entry; invalid UTF-8 (`TextDecoder` fatal); CR / missing final LF / blank line / BOM; a line that is not a JSON object with exactly the six keys in order, or whose `id`/`variant` are not strings; a Variant outside the vocabulary; unsorted or duplicated line within a shard; an `(id, variant)` an Inventory pair needs that appears zero times (`missing: <id> × <variant>`); one that appears more than once across shards (`duplicate: <id> × <variant> in <paths>`); a line whose pair is not an Inventory pair (`unknown: …`); a shard not under `<component>/` of its id's Inventory component. A non-`.jsonl` file under the directory is a violation.
- CLI shape follows sibling tools: `bun tools/expectations/expectations.ts init|check [--root <dir>]`, exits 0 / 1 / 2 (usage), `if (import.meta.main)`. Read the Inventory through `readWorkingInventory` (`tools/pin-bump/pin-bump.ts:316`) and sort with `compareUnits`; reuse `EXPECTATION_KEYS` (`pin-bump.ts:62`). Don't fork these.
- Xaravel Tests use `bun:test` like the other files in `conformance/tests/xaravel/` (harness `xaravelTest` lands in 5.9); fixture roots in `mkdtemp`, never mutate tracked files.

**Never:**
- No Skip Reason rule validation, status vocabulary checks or `deferred:<item>` for post-alpha backends (Story 5.2), no Ratchet/ownership of lines (5.6), no harness (5.3).
- Don't edit `tools/pin-bump/`, `tools/ownership/`, `tools/protected-paths/`, `conformance/protected-paths`, the Inventory, or any `packages/**`.
- No hand-edited shards: committed shards are exactly `init` output.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh init | Inventory with framework entry `backends:["none"]` and a second one in the same file with `["mysql","sqlite"]`, plus an `ai` entry | one shard per source file; 3 lines framework, sorted; ai line `deferred:ai-sdk` | exit 0 |
| Re-run init | shards exist, one line edited to `status:"pass"` | no file changes; edited line kept; `added 0` | exit 0 |
| Backend outside vocabulary | Inventory backend `oracle` | names id and backend | exit 1, nothing written |
| Duplicate across shards | same pair in `a.jsonl` and `b/slice.jsonl` | `duplicate:` listing both paths | exit 1 |
| Missing / unknown pair | a line deleted; a line with a fake id | `missing:` / `unknown:` | exit 1 |
| Format | CRLF, no final LF, unsorted, invalid UTF-8 byte, key order changed | one violation each, naming file:line | exit 1 |
| Bad vocabulary | `MySQL`, duplicate, unsorted | violation naming the line | exit 1 |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts:93` -- `ALPHA_VARIANTS`; `:167` `compareUnits`; `:64` `NONDETERMINISM_FILE` (not an Inventory file).
- `tools/pin-bump/pin-bump.ts:57-62,316,365,407` -- `EXPECTATIONS_DIR`, `EXPECTATION_KEYS`, `readWorkingInventory`, `readExpectations` (lenient reader), `serialiseExpectation` (private; same byte format — contract test from both ends).
- `tools/escalations/escalations.ts:1-60,729` -- CLI/header/exit-code conventions to copy.
- `conformance/inventory/*.jsonl` -- 22,070 entries, 1,551 distinct source files; `source` like `framework/tests/…/X.php:11-18`, `ai/tests/Feature/X.php:39-45`.
- `conformance/tests/xaravel/component-map.test.ts` -- XT test file style (header comment, `bun:test`, tmp fixture roots, XT ids in test names).
- `package.json` scripts -- add `expectations:init`, `expectations:check`.
- `.github/workflows/ci.yml:100-122` -- job running `bun run test`; add a `Check the Expectations File` step there (the required `check` job).
- `docs/ops/` -- operator docs; add `expectations.md`.

## Tasks & Acceptance

**Execution:**
- `conformance/variants` -- create with header comment (purpose, format, ESC-5.1-1) and the 13 members.
- `tools/expectations/expectations.ts` -- `VARIANTS_FILE`, `parseVariants`, `shardPathFor(entry)`, `serialiseLine`, `init(root)`, `check(root)`, `main(argv)`; header comment documenting format, commands, violations, exit codes.
- `package.json` -- add the two scripts.
- `conformance/expectations/**` -- generate by running `bun run expectations:init`; then `bun run expectations:check` must pass.
- `.github/workflows/ci.yml` -- add `bun run expectations:check` step after `Test` in the same job.
- `docs/ops/expectations.md` -- short operator doc: vocabulary, shard path rule, both commands.
- `conformance/tests/xaravel/expectations.test.ts` -- XT-conformance-89 (real vocabulary parses, contains the four core + AC examples + every `ALPHA_VARIANTS` + every real Inventory backend; bad vocab cases fail; `init` rejects unknown backend), XT-conformance-90 (matrix rows 1-3 via `init` on a fixture root; CLI `bun run expectations:init --root` works; serialised line equals pin-bump's format), XT-conformance-91 (matrix rows 4-6 via `check`; `check` on the real repo passes).
- `stories/5.1.md`, sprint status -- `done` at the end (orchestrator bookkeeping).

**Acceptance Criteria:**
- Given `conformance/variants`, when read, then it is the closed vocabulary above and every Inventory backend is a member (XT-conformance-89).
- Given the Inventory, when `bun run expectations:init` runs, then every Test ID × Variant has one line in its shard with `skip`/`not-ported-yet` (`deferred:ai-sdk` for `ai`), `adapted:null`, `escalation:null` (XT-conformance-90).
- Given all shards, when `bun run expectations:check` runs, then a pair appearing zero or more than once fails, and shards must be sorted, UTF-8 and LF; CI runs it in the required job (XT-conformance-91).

## Spec Change Log

## Review Triage Log

## Design Notes

ESC-5.1-1 (orchestrator-approved) adds the post-alpha backends to the vocabulary so the denominator stays full (FR-5); they start `not-ported-yet`. Expected line:

```
{"id":"Illuminate\\Tests\\Integration\\Support\\AuthFacadeTest::testItFailsIfTheUiPackageIsMissing","variant":"none","status":"skip","reason":"not-ported-yet","adapted":null,"escalation":null}
```

## Verification

**Commands:**
- `bun run expectations:init` then again -- expected: second run `added 0 line(s)`, `git status` unchanged.
- `bun run expectations:check` -- expected: `Expectations OK:` with pairs = sum of Inventory `backends` lengths.
- `bun test conformance/tests/xaravel/expectations.test.ts` -- all pass.
- `bun run test`, `bun run typecheck`, `bun run lint`, `bun run escalations:check` -- pass.
