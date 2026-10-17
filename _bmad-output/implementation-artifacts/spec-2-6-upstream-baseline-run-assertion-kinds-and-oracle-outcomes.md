---
title: 'Story 2.6: Upstream baseline run: assertion kinds and Oracle outcomes'
type: 'feature'
created: '2026-10-17'
baseline_revision: '31c23e164a8298099c89c7a97d37fe9d16ff1955'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.6.md'
  - '{project-root}/docs/ops/inventory.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred: []
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
- **Merge.** `merge` needs attempts 1 and 2 for every (entry, alpha variant). Any difference between the two attempts in outcome or assertions prints `oracle non-determinism: <id> on <variant>: <attempt 1> vs <attempt 2>` and exits 1 without writing anything. A missing result also exits 1, naming the ID and variant.
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
- Given two attempts on the same Pin, when merged, then identical attempts write the Inventory, and any difference is reported as `oracle non-determinism: …` with exit 1. The CI run behind the committed files reported none (XT-conformance-58).

## Spec Change Log

## Review Triage Log

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
