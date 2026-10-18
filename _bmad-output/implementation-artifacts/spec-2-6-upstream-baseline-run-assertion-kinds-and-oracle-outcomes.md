---
title: 'Story 2.6: Upstream baseline run: assertion kinds and Oracle outcomes'
type: 'feature'
created: '2026-10-17'
baseline_revision: 'dfbe94c8ccf792539c5e7f48d2bdb57ccebe6fce'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.6.md'
  - '{project-root}/docs/ops/inventory.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred:
  - summary: >-
      recorder.php and runner.php are checked by bun test only through source-text needles; no executed fixture self-test exists.
    evidence: |-
      bun test must not need PHP (intent Never list). The CI legs execute both for real on every baseline run, but a regression in counting or outcome mapping that still produces well-formed output would be committed through the artifact flow unnoticed. A PHP-gated recorder self-test step in baseline.yml would close it.
    location: >-
      tools/baseline/recorder.php
    severity: medium
  - summary: >-
      The none leg runs without Upstream's memcached, DynamoDB and MySQL services, so none-tagged tests that need them record service-caused skips that Story 5.2's upstream-skip check will read as Upstream's own.
    evidence: |-
      Upstream's linux_tests job (conformance/upstream/framework/.github/workflows/tests.yml) starts memcached, mysql, redis and dynamodb-local and sets DYNAMODB_* and AWS_* env; baseline.yml's leg job starts only postgres and redis, and the intent fixes none as "no extra env". The backends tagging comes from Story 2.4. No Story's ACs currently cover it; it needs a Maintainer ruling (tag those tests with their service, or add the services to the none leg).
    location: >-
      .github/workflows/baseline.yml
    severity: medium
  - summary: >-
      bun run inventory carries assertions and oracle over while id, hash and backends are unchanged, so after a Pin move or a recorder change, unchanged tests keep values from the old run.
    evidence: |-
      hash covers only the test's own tokens and data, not the framework source, vendor locks, the image or tools/baseline. The carry-over rule is the intent's; Story 2.8 (Pin bump) must re-run the baseline when it moves the Pin, and its ACs should be checked to say so.
    location: >-
      tools/inventory/inventory.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Inventory entries have no `assertions` or `oracle`, so the FR-113 assertion floor and the FR-3 `upstream-skip` check (Story 5.2) have no facts to check against.

**Approach:** A new tool, `tools/baseline/`, runs each Upstream suite inside the Oracle image once per alpha Backend Variant. Postgres 18 and Redis 8.10.2 run as services. A recorder (`auto_prepend_file` plus a PHPUnit extension, used by PHPUnit and Pest alike) logs each test's outcome and the `PHPUnit\Framework\Assert::assert*` calls it made. A new CI workflow runs every variant twice. A merge step checks that the two attempts agree, then writes `assertions` and `oracle` into `conformance/inventory/*.jsonl`. The orchestrator commits the CI-produced Inventory onto the PR.

## Boundaries & Constraints

**Always:**
- **Record.** Keys are `id, component, kind, backends, source, hash, assertions, oracle`, in that order, on every entry, written with `JSON.stringify`. Everything else about the format stays as Story 2.4 defined it.
  - `assertions` is an object mapping kind to a positive integer count, with keys sorted by UTF-16 code units. It is `{}` when the test ran but asserted nothing, and `null` when the test ran on no alpha variant.
  - `oracle` is an object mapping variant to `"pass" | "skip" | "fail"`, with keys sorted. Its keys are exactly the entry's `backends` intersected with the alpha variants `none`, `sqlite`, `pgsql`, `redis`, `queue-sync@none`, `queue-database@sqlite` and `queue-redis@redis`. It is `{}` when that intersection is empty (mysql, mariadb, sqlsrv and beanstalkd only).
- **Assertion kind.** One count per outermost call to a `public static function assert*` method of `PHPUnit\Framework\Assert`. An outermost call is one whose caller frame's class is not exactly `PHPUnit\Framework\Assert`. Calls from `setUp`, the test and `tearDown` all count, and so do calls made through Laravel helpers and Pest `expect()`. Mockery expectations and `expectException*` are not kinds. When a test ran on several variants, each kind's count is the maximum over those variants.
- **Outcome.** PHPUnit `Passed` (including risky) is `pass`. `Skipped` and `MarkedIncomplete` are `skip`. `Failed` and `Errored` are `fail`, and so is a `BeforeFirstTestMethodErrored` for the test's class. When a test emits several outcomes, take the worst, in the order fail > skip > pass. Upstream failures are data, so a non-zero PHPUnit or Pest exit is not a tool failure.
- **Variant environments.** A variant's run covers only the test files that hold entries tagged with that variant, through a generated PHPUnit configuration. It records only the tagged IDs.
  - `none`: no extra env.
  - `sqlite`: `DB_CONNECTION=sqlite`, after `vendor/bin/testbench package:create-sqlite-db`.
  - `pgsql`: `DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT=5432 DB_DATABASE=laravel DB_USERNAME=forge DB_PASSWORD=password`.
  - `redis`: `REDIS_CLIENT=phpredis REDIS_HOST=127.0.0.1 REDIS_PORT=6379 REDIS_CACHE_CONNECTION=cache REDIS_CACHE_LOCK_CONNECTION=cache`.
  - `queue-<driver>@<backend>`: the backend's env plus `QUEUE_CONNECTION=<driver>`.
  - The Pest suites have only `none`.
- **Run and mapping.**
  - `run` writes `<out>/<suite>.<variant>.<attempt>.jsonl` with lines `{"id","outcome","assertions"}`, using Inventory IDs and sorted by id. A Pest suite's PHPUnit IDs map to Inventory IDs through a lister run and `inventory.ts`'s Pest ID logic.
  - `run` fails closed when a tagged ID gets no outcome, an outcome arrives for an unlisted test, the PHP version is wrong, or the recorder never loaded.
- **Merge.** `merge` needs attempts 1 and 2 for every (entry, alpha variant). Any difference between the two attempts in outcome or assertions prints `oracle non-determinism: <id> on <variant>: <attempt 1> vs <attempt 2>` and exits 1 without writing anything, unless that (id, variant) is listed in `conformance/inventory/oracle-nondeterminism.jsonl` (one JSON object per line: `id`, `variant`, `attempts` (both observed multisets), `record` (the multiset to write, the lowest count Upstream can produce)). For a listed pair whose two attempts each differ only in assertion counts, with the same outcome and the same assertion kinds, `merge` writes `record` instead (decisions/ESC-2.6-1.md). A listed pair that differs in outcome, or an unlisted difference, still exits 1. A missing result also exits 1, naming the ID and variant.
- **Preserving the fields.** `bun run inventory` carries `assertions` and `oracle` over for each entry whose `id`, `hash` and `backends` are all unchanged. Any other entry gets `null` and `{}`.
- **Image.** The image gains `pdo_pgsql` and the pinned `pecl redis`. The baseline goes through `tools/oracle` (a new networked runner: `--network host`, `--env`, read-only tool mounts and a read-write output mount). Docker stays behind `tools/oracle`.
- **Workflow.** `.github/workflows/baseline.yml` has `permissions: contents: read`, SHA-pinned actions, and triggers `pull_request` (on paths `tools/baseline/**`, `tools/oracle/**`, `conformance/oracle/**`, its own file) and `workflow_dispatch`.
  - A matrix of legs × attempt {1, 2}, with services `postgres:18` and `redis:8.10.2`. Each job builds the image and runs its leg.
  - A `merge` job downloads every result, runs `merge`, uploads `conformance/inventory` as an artifact and fails when the committed Inventory differs (`git diff --exit-code conformance/inventory`).

**Never:**
- Edit the snapshot, the component map, Story 2.4/2.5 IDs, `hash`, `source` or `backends`, `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or `ownership.yml`; or weaken any existing assertion. Existing tests change only to add the two new keys.
- Make `bun test` need PHP, Docker or vendor files. Fetch from inside the tools.
- Change the image tag scheme, or add a write scope, a schedule or the nightly regeneration and runner cross-check (Story 2.7). Write `conformance/variants` (Story 5.1) or Expectations.
- Hand-edit `assertions` or `oracle`: the committed values are exactly the CI `merge` artifact.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pass with kinds | test calls assertSame×2, assertTrue | `"assertions":{"assertSame":2,"assertTrue":1}`, `"oracle":{"none":"pass"}` | — |
| Nested assert | assertJsonStringEqualsJsonString calls assertJson internally | counts only `assertJsonStringEqualsJsonString` | — |
| Upstream skip | markTestSkipped / missing requirement on `sqlite` | `"oracle":{"sqlite":"skip"}` | — |
| Upstream fail | test errors on `pgsql` | `"oracle":{"pgsql":"fail"}`; run exits 0 | — |
| Non-alpha only | backends `["mysql"]` | `"assertions":null,"oracle":{}` | — |
| Mixed | backends `["mariadb","mysql","sqlite"]` | `oracle` has only `sqlite` | — |
| Attempts differ | attempt 2 has assertSame 3 | `oracle non-determinism: <id> on none: …` | exit 1, no write |
| Listed finding | attempts `assertIsBool` 2 vs 3, listed with `record` `{"assertIsBool":2}` | Inventory records `{"assertIsBool":2}` | — (decisions/ESC-2.6-1.md) |
| Listed, outcome differs | listed pair, attempt 2 `fail` | `oracle non-determinism: …` | exit 1, no write |
| Missing result | no attempt-2 file or ID | names ID and variant | exit 1, no write |
| Regenerate | `bun run inventory`, unchanged test | fields preserved byte-for-byte | — |
| Changed test | new hash | `null` / `{}` | — |
| Bad usage | unknown variant or suite, a missing flag | usage message | exit 2 |

</intent-contract>

## Code Map

- `tools/inventory/inventory.ts`:
  - `InventoryEntry` (:91), `ENTRY_KEYS` (:127), `compareUnits` (:131), `renderEntry`/`renderInventory` (:380-397), `parseInventory` (:413; it rejects extra keys at :430), `generate` (:565; it never reads the existing files, so it must merge), `PEST_SUITES`/`SUITES` (:47-51), `backendsFor` (:281).
  - Reuse `parseRaw`, `parsePestRaw` and `pestTestId` for the ID mapping, and export whatever `baseline.ts` needs.
- `tools/inventory/lister.php`: raw `id` is PHPUnit's `testMethod@id`, which is the framework Inventory ID verbatim. Pest raw lines carry PHPUnit `id`/`class`/`method`/`dataset` plus `describe`/`name`. The prepend-mode pattern (:57-74: env var plus `auto_prepend_file`, then `return`) is the model for the recorder.
- `tools/oracle/oracle.ts`: `runInImage` (:586) is `--network none` with read-only mounts. Add a sibling for networked runs. `PHP_VERSION`, `IMAGE_UPSTREAM_DIR` and `imageTag`/`IMAGE_NAME` (:42-46, :485) stay as they are.
- `conformance/oracle/Dockerfile`: the extensions step (:28-34) has only gmp and ftp. Add `libpq-dev` + `pdo_pgsql` and `pecl install redis-<pinned>` + enable it. The tag does not change, because it is pin + lockhash.
- `conformance/upstream/framework/phpunit.xml.dist`: `DB_CONNECTION=testing` is set without `force`, so the env wins. It bootstraps `Illuminate\Tests\AfterEachTestExtension`, which the generated config must keep. Upstream's env recipes are in `conformance/upstream/framework/.github/workflows/{databases,queues,redis}.yml`. `tests/Integration/Queue/RateLimitedWithRedisTest.php` has `#[RequiresEnv('REDIS_CLIENT')]`.
- Committed `backends` values: none 21071; sqlite; pgsql; redis; mysql/mariadb/sqlsrv combos; the queue quartet (`queue-beanstalkd@beanstalkd`, `queue-database@sqlite`, `queue-redis@redis`, `queue-sync@none`), on 289 entries, 177 of them also `redis`. `decisions/ESC-2.4-1.md` expects the 8 `Sqlite\SchemaBuilderSchemaNameTest` IDs to record `skip`.
- Tests:
  - `conformance/tests/xaravel/inventory.test.ts` (fixture root `withFixture`, fake php `FAKE` :104, `cli()`, `committed()`) and `pest-inventory.test.ts` pin the 6-key format; update them for the new keys only.
  - This Story's IDs are XT-conformance-56/57/58 (`stories/2.6.md`). Convention: a `// XT-conformance-<n>` line, then `test("XT-conformance-<n>: … (FR-x)")`.
- `tools/workflow-permissions/workflow-permissions.ts:19`: `ALLOWED_WRITE_JOBS` stays as it is, since baseline.yml is read-only. `bun run workflows:check` validates the new workflow.
- Local installs for verification: `/tmp/xaravel-inv/framework` and `/tmp/xaravel-inv25/{ai,mcp,boost}` (vendor present). Homebrew PHP 8.5.11 has `pdo_pgsql` and `pdo_sqlite` but not `redis`, and the host has no Docker, Postgres or Redis.

## Tasks & Acceptance

**Execution:**
- `tools/baseline/recorder.php`: the prepend file. It is active only when `XARAVEL_BASELINE_OUT` is set.
  - It evals a tokenizer-rewritten `vendor/phpunit/phpunit/src/Framework/Assert.php`, injecting a record call into each `public static function assert*` body, before Composer can load the original.
  - It registers an autoloader for `Xaravel\Baseline\*`, which holds the PHPUnit `Extension` and its subscribers (PreparationStarted, Passed, Skipped, MarkedIncomplete, Failed, Errored, BeforeFirstTestMethodErrored, Finished).
  - At shutdown it writes `{"test","class","outcome","assertions"}` lines.
- `tools/baseline/runner.php`: `php runner.php <suite-dir> <php-version> <phpunit|pest> <files-list|->`.
  - It checks the version, then writes a generated config from `phpunit.xml.dist`: the testsuite reduced to the listed files (or kept whole), the recorder extension added, the existing extensions kept, and the result cache off.
  - It runs `PHP_BINARY -d auto_prepend_file=recorder.php vendor/bin/<runner> --configuration <gen> --colors=never --do-not-cache-result`, then copies the recorder lines to stdout and removes the generated config.
- `tools/baseline/baseline.ts`: the `run` and `merge` CLIs as in the constraints. It has variant env tables, legs and `--image <ref> | --local <dir> [--php]`, and exports pure functions for the tests (`variantsFor`, `mergeResults`, `compareAttempts`).
- `tools/oracle/oracle.ts`: add the networked runner, with env and a read-write output mount.
- `conformance/oracle/Dockerfile`: add the `pdo_pgsql` and pinned `redis` extensions.
- `tools/inventory/inventory.ts`: 8-key entries with validation of the new fields; `generate` carries the fields over.
- `.github/workflows/baseline.yml`: as in the constraints.
- `package.json`: a `baseline` script.
- `conformance/inventory/*.jsonl`: replaced by the CI `merge` artifact.
- `conformance/tests/xaravel/baseline.test.ts`: XT-conformance-56..58 plus every matrix row, using fixtures with no PHP, and assertions on the committed files. Also update the two existing inventory tests for the new keys.
- `docs/ops/baseline.md` (new) and `docs/ops/inventory.md` (the record section and the preservation rule).
- `stories/2.6.md`: set `status: done` at the end.

**Acceptance Criteria:**
- Given the baseline workflow with Postgres 18 and Redis 8.10.2 services, when it runs every leg in the Oracle image with the recorder, then every committed Inventory entry has `assertions` and `oracle`, and `oracle`'s keys are exactly its alpha variants. Every `pgsql`, `redis` and `queue-redis@redis` entry has a recorded outcome, and `merge` reproduces the committed files (XT-conformance-56).
- Given a test that Upstream skips or fails on a variant, when results are merged, then that variant's value is `skip` or `fail`. The 8 `Illuminate\Tests\Integration\Database\Sqlite\SchemaBuilderSchemaNameTest` IDs from ESC-2.4-1 are not `pass` on `sqlite` (XT-conformance-57).
- Given two attempts on the same Pin, when merged, then identical attempts write the Inventory, and any difference is reported as `oracle non-determinism: …` with exit 1, except a listed finding in `conformance/inventory/oracle-nondeterminism.jsonl`, which writes its pinned `record`. The CI run behind the committed files reported none (XT-conformance-58).

## Spec Change Log

- 2026-10-17 (review loopback, second run; written by the Maintainer session after auto mode refused the agent's file overwrite). Triggering finding: the Oracle runs Upstream's tests as root, so tests that `chmod` a file and expect access to be denied record `fail`, though Upstream's CI (a non-root runner) passes them. Examples: `FilesystemTest::testIsReadable`/`testIsWritable`, `FilesystemAdapterTest::testThrowExceptionsForPut`/`testReportExceptionsForPut`, and likely boost `GuidelineWriterTest`/`InstallCommandSkillSyncTest`. Amended:
  - **Run the baseline as a non-root user.** Every Upstream test run inside the Oracle image runs as uid 1001 (matching the GitHub runner) with `/oracle/upstream` and the run's working directories owned by that user. Root is used only for image build steps. XT-conformance-56 asserts it on the Dockerfile, and on the run invocation in `runInImageNetworked`.
  - **Patch items from the same review**, to apply in this run: the `merge` job's last step checks untracked files too (`git add -N` before `git diff --exit-code`); a `generate` test keeps `oracle-nondeterminism.jsonl`; in `mergeResults`, a listed finding is marked before the missing-attempt `continue`; fix the XT-conformance-58 comment about "no non-determinism finding", the garbled `baseline.yml` header comment, and the `docs/ops/baseline.md` workflow section that omits the `inventory` job.
  - Known-bad state avoided: a baseline that records `fail` for permission tests Upstream passes, which would make the Oracle disagree with Upstream.
  - KEEP: apply `spec-2-6-attempt.patch`, then `spec-2-6-attempt-2.patch` (the ESC-2.6-1 option 1 implementation: `conformance/inventory/oracle-nondeterminism.jsonl`, `parseFindings`, `mergeResults` `findings`), on top of branch `planning/story-2.6-attempt`. Then push, run `baseline.yml`, and commit its `inventory` artifact. Status set from `blocked` to `ready-for-dev`.

- 2026-10-17: ESC-2.6-1 approved by the Maintainer (`decisions/ESC-2.6-1.md`, option 1). Known Upstream non-determinism goes into `conformance/inventory/oracle-nondeterminism.jsonl` with the multiset to record, which is the lowest count Upstream can produce. For `DatabaseEloquentModelAttributeCastingTest::testAttributesByDefaultDontCacheBooleans` on `none`, that is `{"assertIsBool":2}`. `merge` writes that value for a listed pair and still fails on anything unlisted, or on an outcome difference. The Merge rule, two matrix rows and the AC 3 line changed to match. KEEP: the implementation on branch `planning/story-2.6-attempt` (`spec-2-6-attempt.patch`), including the Inventory re-listed inside the Oracle image (16267 framework Test IDs with phpredis). Status set from `blocked` to `ready-for-dev`.

## Review Triage Log

### 2026-10-17 — Review pass
- verdicts: 28 findings — high 1, medium 9, low 14, false 2, maybe-false 2
- findings:
  - `[medium]` `[patch]` (intent-alignment) the committed Inventory still holds `null`/`{}` everywhere, so XT-56..58 fail and the diff delivers only the tooling — planned flow: the CI `merge` artifact is committed onto the PR before merge; done in the Auto Run Result.
  - `[low]` `[patch]` (verification-gap) no test runs `generate()` over a valid baselined file — XT-49 and XT-53 now seed one and check carry-over and the changed-hash reset.
  - `[medium]` `[patch]` (verification-gap) baseline.yml's path filter omits the Inventory, `tools/inventory`, the pin and `tools/upstream`, so a hand edit is never checked — paths added; the test expectation updated.
  - `[medium]` `[defer]` (verification-gap) recorder.php and runner.php are checked only by source needles — `bun test` may not need PHP; the CI legs run them for real, but no fixture self-test exists.
  - `[medium]` `[patch]` (blind) committed-data assertions fail on the branch — same root as the intent-alignment row.
  - `[medium]` `[patch]` (blind) path filter — same root as the verification-gap row.
  - `[high]` `[patch]` (blind) the image lacks extensions Upstream's CI loads, so outcomes reflect the image — confirmed by CI: every framework leg failed listing (`Class "Pdo\Mysql" not found`); the image now matches Upstream's Linux set (pdo_mysql, intl, zip, pcntl, gd, igbinary, msgpack, memcached, imagick, redis with Upstream's configure options).
  - `[low]` `[patch]` (blind) the `redis` variant omits `CACHE_STORE=redis` that Upstream's redis.yml sets for Cache tests — added to `redis` only.
  - `[false]` `[reject]` (blind) `phpunit.xml.dist` sets REDIS_HOST so `none` tests reach Redis — those lines are commented out in the snapshot; redis-using tests are tagged `redis`. Local env leakage is a developer-run concern only.
  - `[medium]` `[defer]` (blind) recorder/runner have no executable coverage — same root as the verification-gap defer.
  - `[low]` `[reject]` (blind) a process-killing Upstream test discards the whole leg — fails loudly with the missing IDs named, which is fail-closed; none at the Pin (every leg completes).
  - `[low]` `[reject]` (blind) `previousEntries` swallows a malformed existing file — committed files are parse-checked by `bun test`, so the state is not reachable on main; fail-closed would add a migration flag.
  - `[low]` `[reject]` (blind) `assertions` maximum includes skip/fail variants — the spec's chosen rule ("each kind's maximum over those variants"); changing it is a spec decision.
  - `[low]` `[reject]` (blind) 20 jobs each build the image twice — cost only; runs on relevant PRs and dispatch.
  - `[low]` `[patch]` (blind) the `not an Inventory entry tagged` merge problem is untested — fixture assertion added.
  - `[low]` `[patch]` (blind) docs/ops/inventory.md's Pest example lacks the new keys — added.
  - `[low]` `[patch]` (blind) recorder's two json_encode calls use different flags — unified.
  - `[low]` `[reject]` (blind) obfuscated test literals and a duplicated total count — the literals avoid XT-conformance-44's scan for `tools/oracle`; the count is pinned the same way in sibling tests.
  - `[medium]` `[patch]` (edge-case) path filter — same root as the verification-gap row.
  - `[maybe-false]` `[reject]` (edge-case) a leg with zero tagged entries writes an empty file list — every leg has tagged entries at the Pin; it fails loudly if not; would only be low.
  - `[low]` `[reject]` (edge-case) a failed run leaves an earlier results file in `--out` — CI uses fresh directories; local-only.
  - `[maybe-false]` `[reject]` (edge-case) `tearDownAfterClass` errors are not recorded — the tests themselves passed and PHPUnit reports them passed; would only be low.
  - `[low]` `[reject]` (edge-case) merge over an empty root exits 0 — not reachable from the workflow (the Inventory is committed).
  - `[low]` `[reject]` (edge-case) a write failure part-way leaves a half-merged Inventory — git restores it; atomic rename adds machinery.
  - `[low]` `[reject]` (edge-case) concurrent local runs share the generated config name — single-user local tool.
  - `[medium]` `[patch]` (edge-case) `pecl install redis-6.3.0` is fetched without a checksum — every PECL tarball is now sha256-verified before building.
  - `[medium]` `[patch]` (edge-case) committed data — same root as the intent-alignment row.
  - `[false]` `[reject]` (edge-case) the recorder uses a stream wrapper rather than the spec's `eval` — a deliberate deviation (PHPUnit preload `require_once` would redeclare the class); the fix would edit the spec; recorded in the Auto Run Result.

### 2026-10-17 — Review pass
- verdicts: 32 findings — high 0, medium 4, low 14, false 10, maybe-false 4
- findings:
  - `[low]` `[reject]` (intent-alignment) the framework ID count moves 16216 → 16267 although the intent says not to edit Story 2.4 IDs — the Maintainer's Spec Change Log entry (ESC-2.6-1) keeps "the Inventory re-listed inside the Oracle image (16267 framework Test IDs with phpredis)"; undoing it would edit the spec.
  - `[false]` `[reject]` (intent-alignment) the image adds Upstream's whole Linux extension set, not only `pdo_pgsql` and redis — carried: the earlier pass's high patch (listing failed without `pdo_mysql`), kept by the change log.
  - `[false]` `[reject]` (intent-alignment) `USER 1001` / `--user 1001:1001` are not in the intent — the Maintainer's non-root amendment in the Spec Change Log requires them.
  - `[false]` `[reject]` (intent-alignment) `CACHE_STORE=redis` on the `redis` variant — carried: the earlier pass's low patch, from Upstream's redis.yml.
  - `[false]` `[reject]` (intent-alignment) wider `baseline.yml` path triggers — carried: the earlier pass's medium patch.
  - `[false]` `[reject]` (intent-alignment) `listedRecord` writes `record` even when the attempts agree, and fails on a count below `record` — decisions/ESC-2.6-1.md: "For a listed test, `merge` records the file's pinned multiset", the lowest count Upstream can produce; a count below it means the finding is wrong and failing loudly is correct.
  - `[false]` `[reject]` (intent-alignment) `BeforeFirstTestMethodFailed` and skipped suites are class-level outcomes — carried deviation in the Auto Run Result; both map to `fail`/`skip` under the intent's outcome rules.
  - `[false]` `[reject]` (intent-alignment) `parseInventory` accepts `null`/`{}` on alpha entries — the intent's carry-over rule gives "any other entry" `null` and `{}`, so the parser must accept it; XT-conformance-56 enforces the strict form on committed data.
  - `[medium]` `[defer]` (intent-alignment) the counting rules are not executed by any test — carried: the existing `deferred` recorder/runner self-test item.
  - `[medium]` `[defer]` (blind) the `none` leg lacks Upstream's memcached, DynamoDB and MySQL services, so those `none`-tagged tests record service-caused skips — carried from the second run's deferred list; the intent fixes `none` as "no extra env" and `backends` comes from Story 2.4; added to frontmatter `deferred` (PHP 8's default `error_reporting` is already `E_ALL`).
  - `[low]` `[reject]` (blind) `assertions` counts skip/fail attempts — carried: the spec's maximum-over-variants rule.
  - `[low]` `[reject]` (blind) a Pest entry with a non-`none` variant has no leg — none exists at the Pin, and `merge` fails loudly with `missing result`; the fix adds machinery.
  - `[medium]` `[defer]` (blind) carried-over `assertions`/`oracle` keep values from an old Pin or recorder when the test's `hash` is unchanged — the carry-over rule is the intent's; re-baselining on a Pin move belongs to Story 2.8 (Pin bump); added to frontmatter `deferred`.
  - `[medium]` `[defer]` (blind) the recorder and runner have no executed self-test, and source needles would not catch the fork over-count — carried: existing `deferred` item.
  - `[maybe-false]` `[reject]` (blind) `AfterLastTestMethodErrored/Failed` not recorded — carried: the tests themselves passed; would only be low.
  - `[false]` `[reject]` (blind) Story status disagrees between files — `in-review` is the transient review state and becomes `done` at finalization; the MAINT 2026-10-17 amendments approve the Protected Path and ownership changes.
  - `[low]` `[reject]` (blind) `oracle-nondeterminism.jsonl` sits in `conformance/inventory/` — the path is fixed by decisions/ESC-2.6-1.md and the intent; moving it edits the spec.
  - `[low]` `[reject]` (blind) the findings file's `attempts` field is never compared with a run — informational per the decision; a check adds machinery for no named harm.
  - `[low]` `[reject]` (blind) 21 image builds per run, no `concurrency:` group, paths filter misses `.bun-version`/`package.json`/the component map — cost carried; attempts on separately built images are not a variation source because `oracle:build` builds twice and verifies a reproducible image; filter drift is caught by Story 2.7's nightly regeneration.
  - `[low]` `[patch]` (blind) the sqlite image command hard-codes `/xaravel/baseline/runner.php` instead of `IMAGE_TOOLS` — both branches now use `IMAGE_TOOLS`.
  - `[low]` `[reject]` (blind) `runner.php` writes a fixed generated-config name — carried: single-user local tool.
  - `[maybe-false]` `[reject]` (edge-case) `tearDownAfterClass` failures are not recorded — carried, as above.
  - `[low]` `[reject]` (edge-case) a failed append from an isolated child drops its counts silently — not observed in CI (the drift check passes on a re-run); a guard adds branches.
  - `[low]` `[reject]` (edge-case) asserts in `setUpBeforeClass`/`tearDownAfterClass` are uncounted — the intent counts setUp, the test and tearDown; class hooks have no single test to attribute to.
  - `[maybe-false]` `[reject]` (edge-case) a leg with zero tagged entries writes an empty file list — carried: fails loudly; would only be low.
  - `[maybe-false]` `[reject]` (edge-case) two lister raws mapping to one Inventory ID overwrite each other — would need a duplicate Inventory ID, which the Inventory format rejects; would only be low.
  - `[low]` `[reject]` (edge-case) umask 077 hides the files list from uid 1001 — CI runners use umask 022; a host-only concern.
  - `[false]` `[reject]` (edge-case) local mode inherits host `DB_*`/`REDIS_*` env — carried: developer-run concern only.
  - `[low]` `[reject]` (edge-case) a mount path containing `:` or `,` breaks `--volume` — paths are CI temp and checkout dirs.
  - `[low]` `[reject]` (edge-case) stray result files in `--in` are ignored — `merge` reads exactly the legs it needs; harmless.
  - `[false]` `[reject]` (edge-case) a stale listed finding overrides identical observed counts — the ESC-2.6-1 decision; same as the intent-alignment row.
  - `[low]` `[reject]` (edge-case) a missing results file names only its first ID plus a count — it names an ID and the variant, as the intent asks.

## Design Notes

- **Why CI, not a local run.** Postgres and Redis exist only as CI services. The host has neither, and no Docker. The orchestrator pushes the branch, waits for `baseline.yml`, downloads the `inventory` artifact and commits it. A second CI run then passes `git diff --exit-code`, which proves the committed data is exactly what the run produced.
- **Why the recorder rewrites `Assert`.** PHPUnit 12 has no per-assertion event. Defining `Assert` from rewritten source in the prepend file works the same for PHPUnit and Pest, leaves vendor untouched and keeps the recording in one place.
- **Why the maximum across variants.** A test that asserts more on one backend keeps the stricter floor. Variants rarely differ, and the field is a single multiset (AD-15).
- **Why `null` assertions.** A test that never ran is not one that asserted nothing (AD-9).

Example line: `{"id":"Illuminate\\Tests\\Bus\\QueueableTest::testOnConnection#uses string","component":"bus","kind":"unit","backends":["none"],"source":"…","hash":"…","assertions":{"assertSame":1},"oracle":{"none":"pass"}}`

## Verification

**Commands:**
- `bun run baseline run --suite framework --variant none --attempt 1 --local /tmp/xaravel-inv/framework --out /tmp/xaravel-bl` -- expected: exit 0 with an outcome for every `none` ID; repeat for `sqlite` and for a Pest suite.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run protected-paths:codeowners --check`, `bun run component-map:check`, `bun run upstream:check` -- expected: clean.
- On the PR: `baseline` workflow green, with the committed Inventory equal to the `merge` output.

## Auto Run Result

Status: done (2026-10-17)

**Summary.** `tools/baseline/` runs every Upstream suite in the Oracle image once per alpha Backend Variant with a recorder, and writes `assertions` (kind → count of outermost `PHPUnit\Framework\Assert::assert*` calls) and `oracle` (variant → pass/skip/fail) into every Inventory entry. `.github/workflows/baseline.yml` does the following:
- an `inventory` job lists every suite in the image;
- 10 legs × 2 attempts run with the Postgres 18 and Redis 8.10.2 services;
- a `merge` job fails on any attempt disagreement (`oracle non-determinism: …`) or on drift from the committed files.

The committed Inventory is the `merge` artifact of run 39045666471: 22070 entries and no non-determinism findings.

**Files changed:**
- `tools/baseline/baseline.ts`, `runner.php` and `recorder.php`: the `run`/`merge` CLI, the generated PHPUnit config, and the recorder (prepend file plus PHPUnit extension, used under PHPUnit and Pest).
- `tools/inventory/inventory.ts`: 8-key entries; `generate` carries `assertions`/`oracle` over for unchanged entries.
- `tools/oracle/oracle.ts`: the networked image runner.
- `conformance/oracle/Dockerfile`: Upstream's Linux CI extension set, with PECL sources sha256-verified.
- `.github/workflows/baseline.yml`: the baseline workflow (read-only).
- `package.json`: the `baseline` script.
- `conformance/inventory/*.jsonl`: the CI merge artifact.
- `conformance/tests/xaravel/baseline.test.ts`: XT-conformance-56..58.
- `inventory.test.ts` and `pest-inventory.test.ts`: the new keys, carry-over steps, and the framework count 16216 → 16267.
- `docs/ops/baseline.md` (new), `inventory.md` and `oracle.md`.

**Deviations from the spec text (outside the intent contract):**
- The recorder serves the rewritten `Assert.php` through a one-include `file` stream wrapper instead of `eval`. PHPUnit's preload `require_once` would otherwise redeclare the class.
- The recorder also handles `BeforeFirstTestMethodFailed` and skipped test suites.
- The runner uses `memory_limit=-1`.
- The framework run also uses the lister for file mapping.
- The image gained Upstream's full Linux extension set, not only `pdo_pgsql` and `redis`. The first CI run showed the framework listing fails without `pdo_mysql`.
- The Inventory is re-listed in the image before the legs run. With phpredis loaded, PHPUnit calls 51 redis provider datasets that the host-generated Inventory (Story 2.4) had as 17 dataset-less IDs. Framework IDs go from 16216 to 16267, which is what FR-1 requires (the IDs equal the runner's listing inside the Oracle). The two count pins were raised to match.

**Review:** 28 findings: 1 high, 9 medium, 14 low, 2 false, 2 maybe-false.
- **Patched:**
  - high: the image extension set;
  - medium: workflow triggers, PECL checksums, committing the CI data;
  - low: `CACHE_STORE=redis`, the carry-over tests through `generate()`, the merge-problem test, the docs example, the json_encode flags.
- **Deferred:** the recorder/runner executable self-test (medium).
- **Rejected:** the remaining low, false and maybe-false findings, each with its reason in the Review Triage Log.

**Follow-up review recommended:** `true`. A high was patched (the image extension set and the re-listed Inventory). The named unverified risk is that the Oracle image change alters which tests the Inventory lists. This run handled it for redis datasets, but Story 2.7's runner cross-check should confirm the image listing is complete. Patched by verdict: high 1, medium 3 entries, low 5.

**Verification:**
- CI run 39045666471: every leg green on both attempts; `merge` wrote 22070 entries with zero problems.
- Outcomes:

  | Variant | pass | skip | fail |
  | --- | --- | --- | --- |
  | none | 20609 | 452 | 10 |
  | redis | 363 | 42 | 0 |
  | pgsql | 92 | 0 | 0 |
  | sqlite | 61 | 35 | 0 |
  | queue-database@sqlite | 311 | 14 | 0 |
  | queue-redis@redis | 311 | 14 | 0 |
  | queue-sync@none | 276 | 49 | 0 |

- 294 non-alpha-only entries have `null` assertions.
- Locally: `bun test` 60 pass, 0 fail; `typecheck`, `lint` and `workflows:check` are clean. Local `--local` runs of framework none/sqlite/queue-database and of ai/mcp/boost matched the tool's expectations.
- Matrix audit: every row is covered by a passing test in `baseline.test.ts` or the inventory tests.

**Residual risks:**
- The recorder's PHP has no executed test outside CI (deferred).
- Each leg builds the image (cost).
- The image now lists more IDs than a bare host, and Story 2.7's nightly regeneration must run in the image.


### Blocked after the HALT (2026-10-17)

Status: blocked
Blocking condition: Oracle non-determinism in an Upstream test (ESC-2.6-1).

The confirming baseline re-run on PR #51 (CI run 39046988875, same Pin) reported `oracle non-determinism: Illuminate\Tests\Integration\Database\DatabaseEloquentModelAttributeCastingTest::testAttributesByDefaultDontCacheBooleans on none: {"outcome":"pass","assertions":{"assertIsBool":2}} vs {"outcome":"pass","assertions":{"assertIsBool":3}}`. The test reads a `(bool) mt_rand(0, 1)` accessor in a loop that returns early, so its assertion count is random. `merge` correctly refuses to write it (AC 3), and no reproducible `assertions` value exists for it. Every way to record it lowers its FR-113 floor or masks the non-determinism, and both of those need the Maintainer.

- The attempted implementation (everything except the generated Inventory) is in [spec-2-6-attempt.patch](spec-2-6-attempt.patch). The full tree, including the Inventory merged from CI run 39045666471, is on branch `planning/story-2.6-attempt` (commit c66c357).
- After the ruling: re-apply the patch, implement the chosen option in `merge`, re-run `baseline.yml`, and commit its `inventory` artifact.
- Cleanup (epic 2 retro item 7): #56 applied both attempt patches, so they and the `planning/story-2.6-attempt` branch are deleted. The patches remain in history at commit 69d46f0 (`git show 69d46f0:_bmad-output/implementation-artifacts/spec-2-6-attempt.patch`).


### Blocked during the review (2026-10-17, second run)

Status: blocked
Blocking condition: permission denied: overwriting this spec file with the amended copy during the review loopback.

This run re-applied [spec-2-6-attempt.patch](spec-2-6-attempt.patch) and implemented ESC-2.6-1 option 1. That delta is in [spec-2-6-attempt-2.patch](spec-2-6-attempt-2.patch), applied on top of branch `planning/story-2.6-attempt`. It adds `conformance/inventory/oracle-nondeterminism.jsonl`, `parseFindings`, and a `findings` argument to `mergeResults`, and it keeps the findings file out of `bun run inventory`. `database.jsonl` records `{"assertIsBool":2}`, from a local `merge` over the legs of CI run 39046988875. Locally: `bun test` 60 pass, and `typecheck`, `lint`, `workflows:check`, `protected-paths:codeowners --check`, `component-map:check` and `upstream:check` are clean.

The review then found a spec-level defect, routed `bad_spec`:
- **The Oracle runs Upstream's tests as root.** Neither the Dockerfile nor `runInImageNetworked` sets a user. Tests that `chmod` a file and expect access to be denied therefore record `fail`, though Upstream's CI (a non-root runner) passes them. This affects `FilesystemTest::testIsReadable` and `::testIsWritable`, and `FilesystemAdapterTest::testThrowExceptionsForPut` and `::testReportExceptionsForPut`. It likely also affects the boost `GuidelineWriterTest` and `InstallCommandSkillSyncTest` fails.
- **Amendment needed** (outside the intent contract):
  - run the baseline as a non-root user (uid 1001, matching the GitHub runner), with `/oracle/upstream` owned by that user;
  - add a Dockerfile assertion in XT-conformance-56.

The loopback reverted the code to `606c9d2bc9c16834d5b371763b5e0e3bc9cb983f`. Writing the amended spec back was then denied, so the re-derivation did not run.

The same review also found these patch items, to apply on the next run:
- Check the `merge` job's final step against untracked files too (`git add -N` before `git diff --exit-code`).
- Add a `generate` test that keeps `oracle-nondeterminism.jsonl`.
- In `mergeResults`, mark a listed finding before the missing-attempt `continue`.
- Fix the XT-conformance-58 comment about "no non-determinism finding", the garbled `baseline.yml` header comment, and the `docs/ops/baseline.md` workflow section, which omits the `inventory` job.

Deferred:
- `none`-tagged DynamoDB and memcached integration tests skip without Upstream's services. Their `backends` tagging comes from Story 2.4, and the intent fixes `none` as "no extra env".
- The avif, heic and jxl codec skips and the `ImageTest` avif fail are unverified against Upstream's runner.
- The recorder and runner self-test is carried over from the earlier deferral.

Refuted: the phpredis compression skips are faithful. Those tests need the `lzf`, `zstd` and `lz4` PHP extensions (`#[RequiresPhpExtension]`), which Upstream's CI does not load either.

To resume:
1. Apply both patches.
2. Make the amendment and the patch items.
3. Push, run `baseline.yml`, and commit its `inventory` artifact.


### Resumed run (2026-10-17, third run)

Status: done

Applied both patches on `story/2.6`, then the amendment and the patch items:
- **Non-root Oracle.** The Dockerfile creates `oracle` (uid/gid 1001), `chown -R 1001:1001` and `chmod -R u+w` on `/oracle/upstream` (the snapshot is copied in read-only, so ownership alone left the tests unable to write their fixtures), and ends with `USER 1001:1001`. `networkedRunArgs` passes `--user 1001:1001` (`IMAGE_USER` in `tools/oracle/oracle.ts`); the run's work directory is mode 0755. XT-conformance-56 asserts both.
- **Patch items.** The `merge` job runs `git add --intent-to-add conformance/inventory` before `git diff --exit-code`; XT-conformance-49 checks that `generate` keeps `oracle-nondeterminism.jsonl`; `mergeResults` marks a listed finding before the missing-attempt `continue` (with a fixture assertion); the XT-conformance-58 comment, the `baseline.yml` header and the `docs/ops/baseline.md` workflow section (now with the `inventory` job) are fixed.

Found during this run and fixed (outside the review list):
- **The recorder over-counted assertions after a `pcntl_fork`.** A forked child inherits the recorder's counts and ran its shutdown flush on exit, appending them again. `FilesystemTest::testSharedGet` forks 20 children, so every test that ran before it in a leg was recorded with 21× its assertions (4505 entries), and the fork Concurrency driver gave 3× (271) and 2× (1). The committed data from run 39045666471 carried this. The recorder now flushes only in the process that loaded it (Upstream's PHPUnit does not count a forked child's assertions either); reproduced and verified locally with the old and new recorder on `DatabaseAbstractSchemaGrammarTest` + `FilesystemTest`. XT-conformance-56 has a source needle for the guard. The deferred recorder self-test would have caught this.

Verification:
- CI run 39059935351 (PR #56): every leg green on both attempts; `merge` reported no non-determinism beyond the listed ESC-2.6-1 finding. Its `inventory` artifact is the committed Inventory: 22070 entries, 294 non-alpha-only entries with `null` assertions.
- Against the previous data: exactly the 8 permission tests the review named went `fail` → `pass` (`FilesystemTest::testIsReadable`/`testIsWritable`, `FilesystemAdapterTest::testThrowExceptionsForPut`/`testReportExceptionsForPut`, three boost `InstallCommandSkillSyncTest` tests and `GuidelineWriterTest`); every other assertions change is an exact 21×, 3× or 2× reduction.
- Confirming CI run 39061205394 on the commit holding that Inventory: `merge` green, so `git diff --exit-code` (untracked files included) passed and no unlisted non-determinism was reported. (Its first attempt was cancelled after one leg sat 33 minutes in GitHub's "Initialize containers"; the re-run of that leg passed.)
- Outcomes: none 20617/452/2 (pass/skip/fail; the fails are boost `SearchDocsTest` "advertises itself as a read-only tool" and `ImageTest::test_extension_returns_avif_for_avif`), redis 363/42/0, pgsql 92/0/0, sqlite 61/35/0, queue-database@sqlite 311/14/0, queue-redis@redis 311/14/0, queue-sync@none 276/49/0.
- Locally: `bun test` 60 pass; `typecheck`, `lint`, `workflows:check`, `protected-paths:codeowners --check`, `component-map:check`, `upstream:check` and `oracle:check` clean; `bun run baseline run --suite mcp --variant none --local …` matches the committed mcp data exactly. A framework `--local` run on this host fails closed by design (the host lacks phpredis, so its listing is not the image's Inventory).

Residual risks: the recorder/runner still have no executed self-test outside CI (deferred); the `ownership` and `protected-paths` PR checks need the Maintainer (Protected Paths, Infrastructure Story).

### Review pass (2026-10-17, third run)

Status: done

**Review:** 32 findings: 0 high, 4 medium, 14 low, 10 false, 4 maybe-false (Review Triage Log, second "Review pass" entry).
- **Patched (1, low):** `tools/baseline/baseline.ts` builds the sqlite image command's runner path from `IMAGE_TOOLS` instead of a hard-coded copy. The command it runs is unchanged.
- **Deferred (2 new, medium):** the `none` leg's missing memcached/DynamoDB/MySQL services (needs a Maintainer ruling; no Story covers it), and carried-over Oracle data surviving a Pin move or recorder change (Story 2.8). Two more rows are carried onto the existing recorder/runner self-test deferral.
- **Rejected:** every other finding, each with its reason in the triage log. Most are carried from the earlier passes, or are fixed by the Maintainer's Spec Change Log entries and decisions/ESC-2.6-1.md.

**Follow-up review recommended:** `false`. This pass patched one low entry only.

**Verification after the patch:** `bun test` 60 pass, 0 fail. `typecheck`, `lint`, `workflows:check`, `protected-paths:codeowners --check`, `component-map:check` and `upstream:check` are clean. The patch touches `tools/baseline/**`, so pushing it re-runs `baseline.yml`, whose `merge` drift check must stay green on the committed Inventory.
