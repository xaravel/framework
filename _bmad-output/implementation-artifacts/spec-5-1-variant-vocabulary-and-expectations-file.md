---
title: 'Story 5.1: Variant vocabulary and Expectations File'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: 'efa6702c350b3afcda20ae567a17dd6915b3dc2d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/conformance/escalations/ESC-5.1-1.md'
  - '{project-root}/decisions/ESC-5.1-1.md'
warnings: [oversized]
deferred:
  - summary: >-
      pin-bump's applyBump keeps line order when it renames a Test ID, so a rename in a multi-line shard can leave it unsorted and fail expectations:check after a real pin:bump --apply.
    evidence: |-
      tools/pin-bump/pin-bump.ts applyBump rewrites renamed lines in place ("line order is kept"); expectations:check requires lines sorted by id then variant (Story 5.1 AC). No pin-bump test runs check on --apply output. The fix (re-sort touched shards) belongs in tools/pin-bump, outside this spec.
    location: >-
      tools/pin-bump/pin-bump.ts:426
    severity: medium
  - summary: >-
      pin-bump resets a changed laravel/ai Test ID to not-ported-yet, while expectations:init writes deferred:ai-sdk for Component ai.
    evidence: |-
      applyBump's changed branch sets reason not-ported-yet for every Component; initialLine uses deferred:ai-sdk for ai. Stricter, not weaker; Story 5.2's reason rules may want them aligned.
    location: >-
      tools/pin-bump/pin-bump.ts:426
    severity: low
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

### 2026-10-18 — Review pass
- verdicts: 33 findings — high 0, medium 9, low 18, false 6, maybe-false 0
- findings:
  - (intent-alignment) `[false]` `[reject]` `queue-database@pgsql` / `session-redis@redis` have no lines — AD-15: a Test ID's Variants are its Inventory `backends`; the AC names them as vocabulary members; now documented in `docs/ops/expectations.md`.
  - (intent-alignment) `[false]` `[reject]` post-alpha Variants exceed the AC's list — approved by `decisions/ESC-5.1-1.md`.
  - (intent-alignment) `[low]` `[reject]` init can't produce slice shards — `check` accepts any `.jsonl` under the Component dir, so sprint planning can split later; no everyday path reaches a defect.
  - (intent-alignment) `[low]` `[reject]` real-Inventory init only shown by committed output — verified by hand: a fresh `init` into a temp copy of Inventory + variants is byte-identical to `conformance/expectations/` (`diff -r`); a permanent byte-compare test would break as Stories edit lines.
  - (intent-alignment) `[false]` `[reject]` tests use `bun:test` `expect` — AGENTS.md's rule targets Ported Tests; every `conformance/tests/xaravel` file does this until 5.9.
  - (edge) `[medium]` `[patch]` duplicate key after the six passes `check` — fixed: `check` compares each raw line with `serialiseLine(parsed)` (`not in canonical form`), tested.
  - (edge) `[medium]` `[patch]` spaced line passes `check` — same fix, tested.
  - (edge) `[low]` `[reject]` line under the right Component but not at `shardPathFor` — pin-bump's renames keep lines in the old shard by design (ESC-2.8-1), so an exact-path rule would fail after a Pin bump; the harness finds lines by unique pair.
  - (edge) `[medium]` `[patch]` init rewrites invalid UTF-8 as U+FFFD — fixed: init decodes every shard with check's strict `textLines` and throws before writing; tested.
  - (edge) `[medium]` `[patch]` init keeps a CR — same fix; tested with a CRLF shard.
  - (edge) `[low]` `[reject]` partial write on I/O failure — unlikely (disk full/permissions) and git restores; temp-and-rename adds machinery.
  - (edge) `[medium]` `[patch]` init keeps an existing duplicated pair — fixed: a pair already on an earlier line is an init fault; tested.
  - (edge) `[low]` `[patch]` NUL in id breaks the duplicate message — fixed: `seen` stores `{id, variant}`.
  - (edge) `[medium]` `[patch]` pin-bump parity test is circular — fixed: the test runs pin-bump's real `applyBump` rename on an init-produced shard and compares with `serialiseLine`.
  - (verification-gap) `[low]` `[patch]` init's refusal on an unparsable line untested — added XT-90 cases (malformed JSON, invalid UTF-8, CRLF, duplicate) asserting throw, CLI exit 1 and unchanged snapshot.
  - (verification-gap) `[low]` `[patch]` `empty shard`, `malformed JSON`, `lists no Variant`, `does not exist` untested — added.
  - (verification-gap) `[medium]` `[defer]` pin-bump `applyBump` keeps line order on rename, so `check`'s sort rule can fail after a real `pin:bump --apply` — pre-existing pin-bump behaviour (Story 2.8) against the AC's sort rule; fix belongs in `tools/pin-bump`, which this spec excludes; deferred.
  - (verification-gap other) `[low]` `[defer]` pin-bump resets a changed `ai` ID to `not-ported-yet`, not `deferred:ai-sdk` — pre-existing pin-bump behaviour; stricter, not weaker; deferred for 5.2's reason rules.
  - (verification-gap other) `[low]` `[reject]` `check` doesn't enforce `shardPathFor` — same as the edge finding above.
  - (verification-gap other) `[false]` `[reject]` docs example block empty — the file holds the example line (`docs/ops/expectations.md`).
  - (blind) `[medium]` `[patch]` init silently changes lines with format faults — grouped with the init strict-decode fix.
  - (blind) `[low]` `[patch]` within-shard duplicate reported twice — fixed: dropped the per-line message; the matrix row asserts one violation.
  - (blind) `[low]` `[reject]` `check` doesn't enforce the path rule — same as the edge finding.
  - (blind) `[low]` `[reject]` nothing checks committed shards are init output — verified by hand (byte-identical); see above.
  - (blind) `[medium]` `[patch]` circular parity test — grouped with the edge fix.
  - (blind) `[low]` `[patch]` unused vocabulary members unreported — documented in `docs/ops/expectations.md`.
  - (blind) `[low]` `[reject]` `.DS_Store` / symlink loop under `conformance/expectations/` — unlikely in everyday use; ignoring files adds rules that could hide a real stray file.
  - (blind) `[false]` `[reject]` `shardPathFor` trusts `source` — `source` comes from the generated, Protected Inventory, whose lister emits repo-relative `<repo>/tests/…:<a>-<b>` paths only.
  - (blind) `[low]` `[patch]` documented violations and CLI exit 1 on a format fault untested — added (seventh key, canonical form, CLI `check` exit 1).
  - (blind) `[low]` `[reject]` partial write — same as the edge finding.
  - (blind) `[low]` `[patch]` docs miss the removed/renamed-ID case — added "After an Inventory change".
  - (blind) `[low]` `[patch]` brittle `ci.yml` slice in XT-91 — deleted; `repository-policy.test.ts` pins the step list from parsed YAML.
  - (blind) `[false]` `[reject]` field types beyond id/variant unchecked — status and reason values are Story 5.2's rules, and the canonical-form check already rejects non-JSON-stringify shapes; no consumer reads them yet.

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

## Auto Run Result

Status: done

**Summary.** Added the closed Variant vocabulary (`conformance/variants`, 13 members per ESC-5.1-1), the `tools/expectations/` CLI (`expectations:init` additive/idempotent generator, `expectations:check` uniqueness and format gate), the initial Expectations File (23,291 lines in 1,551 shards, exactly `init` output), a CI step in the required `check` job, operator docs and XT-conformance-89/90/91.

**Files changed.**
- `conformance/variants` -- the vocabulary, with header.
- `tools/expectations/expectations.ts` -- `init`, `check`, `parseVariants`, `shardPathFor`, `serialiseLine`.
- `conformance/expectations/**` -- generated shards.
- `conformance/tests/xaravel/expectations.test.ts` -- 13 Xaravel Tests.
- `conformance/tests/xaravel/repository-policy.test.ts` -- XT-conformance-33's pinned `check` step list gains `bun run expectations:check`.
- `.github/workflows/ci.yml` -- `Check the Expectations File` step.
- `package.json`, `tsconfig.json` -- scripts; typecheck include.
- `docs/ops/expectations.md` -- operator doc.
- `conformance/escalations/ESC-5.1-1.md`, `decisions/ESC-5.1-1.md` -- post-alpha Variants; approved by the orchestrator under MAINT-2026-10-16.

**Review.** 33 findings: 17 patched (init strict decoding and duplicate refusal, canonical-form check, single duplicate violation, real pin-bump parity test, missing violation tests, docs, brittle CI slice removed), 2 deferred (pin-bump rename ordering, pin-bump ai reason), 14 rejected with reasons in the triage log.

**Follow-up review recommended: true.** Patched: 6 medium entries (canonical form, init strict decoding, init duplicate refusal, parity test, and grouped members), 0 high. Unverified risk: the post-review `init` fault path and `check` canonical-form rule were not re-reviewed.

**Verification.** `expectations:init` re-run: `added 0`; fresh init into a temp copy is byte-identical to the committed shards (`diff -r`); `expectations:check`: OK, 23,291 lines / 1,551 shards / 23,291 pairs; `bun run test` 171 pass, 0 fail; `typecheck`, `lint`, `escalations:check`, `graph:check`, `scaffold:check` pass.

**Residual risks.** The deferred pin-bump ordering issue can fail `expectations:check` after the next Pin bump with a rename; ESC-5.1-1 was ruled by the orchestrator, and the Maintainer may overrule it.
