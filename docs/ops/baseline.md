# The baseline run

The baseline run gives every Inventory entry its `assertions` and `oracle` fields ([inventory.md](inventory.md#the-record-framework)). It runs each Upstream suite at the Baseline Pin inside the Oracle image ([oracle.md](oracle.md)), once per alpha Backend Variant, records each test's outcome and the PHPUnit assertions it made, and writes the result into `conformance/inventory/*.jsonl`. The FR-113 assertion floor reads `assertions`, and the FR-3 `upstream-skip` check (Story 5.2) reads `oracle`. The tool is `tools/baseline/baseline.ts`, with the PHP pieces `tools/baseline/runner.php` and `tools/baseline/recorder.php`.

The committed values are exactly the `inventory` artifact of the `baseline` workflow's `merge` job. Never edit them by hand.

## Commands

```sh
bun run baseline run --suite <framework|ai|mcp|boost> --variant <variant> --attempt <1|2> --out <dir> [--image <ref> | --local <dir> [--php <bin>]]
bun run baseline merge --in <dir>
```

Both take `--root <dir>` (default: the repository). They exit 0 on success, 1 on any failure (fail closed) and 2 on a usage error: an unknown suite or variant, a missing flag, `--attempt` other than 1 or 2, a Pest suite on a variant other than `none`, `--image` with `--local`, or `--php` without `--local`.

### `run`

`run` runs one leg once and writes `<out>/<suite>.<variant>.<attempt>.jsonl`, with one `{"id","outcome","assertions"}` line per Inventory entry of that suite tagged with that variant, sorted by `id`:

```
{"id":"Illuminate\\Tests\\Bus\\QueueableTest::testOnConnection#uses string","outcome":"pass","assertions":{"assertSame":1}}
```

1. It reads the suite's Inventory entries and runs the Inventory lister (`tools/inventory/lister.php`, see [inventory.md](inventory.md)) on the suite. The lister maps each PHPUnit test ID to its Inventory ID and its test file. For the framework they are the same ID; for a Pest suite the Inventory ID comes from `inventory.ts`'s Pest ID logic. The run fails when a listed test is not in the Inventory, or a tagged entry is not listed. Regenerate the Inventory first.
2. It runs `runner.php` on the test files that hold tagged entries, or on the whole suite when that is every file. For `sqlite` and `queue-database@sqlite` it first runs `vendor/bin/testbench package:create-sqlite-db`.
3. It collects the recorder's lines. A test's outcome is the worst it emitted, and its counts are summed over its lines. It records only the tagged IDs. It fails when a tagged ID got no outcome, or when an outcome or assertion arrives for a test (or class) the lister does not list.

Upstream failures are data. A non-zero PHPUnit or Pest exit does not fail the run, and the runner's output goes to stderr.

In image mode (the default) the lister runs through `runInImage` (no network, fixed resource limits; see [oracle.md](oracle.md)), and the runner through tools/oracle's `runInImageNetworked`: `docker run --rm --network host --user 1001:1001` with the leg's environment (see [Variants and legs](#variants-and-legs)) as `--env`, `tools/baseline` mounted read-only at `/xaravel/baseline`, and a temp work directory (holding the files list, mode 0755) mounted read-write at `/xaravel/work`. Postgres and Redis are reached on `127.0.0.1`, and on the service legs MySQL on `127.0.0.1:3306`, memcached on `127.0.0.1:11211` and DynamoDB Local on `localhost:8888`.

Upstream's tests never run as root. They run as uid and gid 1001, the GitHub runner's user, which owns `/oracle/upstream` in the image and can write to it (the Dockerfile's `USER`; root is used only for the build steps). Upstream's CI runs them as a non-root user too, and tests that `chmod` a file and expect access to be denied (for example `FilesystemTest::testIsReadable`) pass only then. On a Linux host whose user is not uid 1001, the container may be unable to write a host directory you mount; the baseline mounts only its read-only tools and the world-readable work directory.

In local mode (`--local <dir>`) the lister and runner run with a local PHP 8.5.11 against a locked install of the suite's snapshot, which must equal the snapshot (as for `bun run inventory --local`). The leg's environment is added to ours. Upstream tests write cache files under `tests/` (for example `tests/Routing/Fixtures/bootstrap/cache/*.php`), so delete them, or re-copy the install, before the next local run. Homebrew PHP has no `redis` extension, and the host has no Postgres or Redis, so only `none`, `sqlite`, `queue-sync@none`, `queue-database@sqlite` and the Pest suites run locally. The framework `none` and `queue-sync@none` legs also expect Upstream's services (MySQL on port 3306, memcached on 11211, DynamoDB Local on 8888); without them, the tests that need one are skipped or fail locally, so a local run of those legs is not the Oracle.

### `merge`

`merge` reads `<in>/<suite>.<variant>.<attempt>.jsonl` for both attempts of every leg. For each Inventory entry and each of its alpha variants, it needs a result from attempt 1 and from attempt 2.

- When the two attempts differ in outcome or in assertions, it prints `oracle non-determinism: <id> on <variant>: <attempt 1> vs <attempt 2>`, each attempt as `{"outcome":…,"assertions":{…}}`.
- A missing result prints `missing result: <id> on <variant> (attempt <n>, <file>)`, or, for a missing file, `missing result: <first id> on <variant> (no <file>; <n> results missing)`.
- A result for an ID the Inventory does not tag with that variant is also a problem.

On any problem it exits 1 and writes nothing. Otherwise it sets each entry's `oracle` to attempt 1's outcome on each alpha variant, and its `assertions` to each kind's maximum count over those variants (`null` when the entry has no alpha variant). Then it rewrites the Inventory files.

### Known non-determinism (`conformance/inventory/oracle-nondeterminism.jsonl`)

Some Upstream tests are random by design, so their assertion counts differ between runs (`decisions/ESC-2.6-1.md`). Each such (test, variant) pair is listed in `conformance/inventory/oracle-nondeterminism.jsonl`, one JSON object per line, sorted by `id` and then `variant`:

```
{"id":"Illuminate\\Tests\\Integration\\Database\\DatabaseEloquentModelAttributeCastingTest::testAttributesByDefaultDontCacheBooleans","variant":"none","attempts":[{"assertIsBool":2},{"assertIsBool":3}],"record":{"assertIsBool":2}}
```

- `attempts` holds the two assertion multisets observed when the finding was made.
- `record` is the multiset `merge` writes: the lowest count Upstream can produce. Its kinds are the attempts' kinds, and none of its counts is above either attempt's. The test above reads a `(bool) mt_rand(0, 1)` accessor in a loop that returns as soon as two reads differ, so it makes at least 2 `assertIsBool` calls when it passes.

For a listed pair, `merge` writes `record` whenever both attempts have the same outcome, `record`'s kinds and no count below `record`'s, even when the two attempts agree. Anything else on a listed pair (an outcome difference, another kind, a lower count) is still `oracle non-determinism: … (listed in conformance/inventory/oracle-nondeterminism.jsonl, but the attempts do not fit its record …)`, and a difference on an unlisted pair fails as before. A listed pair that is not one of an Inventory entry's alpha variants is a problem too, so a finding cannot outlive its test. `merge` fails on a malformed findings file, naming the line.

The file is not a Component's Inventory file: `bun run inventory` never reads, rewrites or deletes it. Add a finding only with a Maintainer-approved Escalation.

## Variants and legs

The alpha variants are `none`, `sqlite`, `pgsql`, `redis`, `queue-sync@none`, `queue-database@sqlite` and `queue-redis@redis`. An entry's `oracle` keys are its `backends` intersected with them. `mysql`, `mariadb`, `sqlsrv` and `queue-beanstalkd@beanstalkd` are not run, so an entry tagged only with those gets `"assertions":null,"oracle":{}`.

| Variant | Environment (beyond `phpunit.xml.dist`) |
| --- | --- |
| `none` | none (the framework leg adds the service env below) |
| `sqlite` | `DB_CONNECTION=sqlite`, after `vendor/bin/testbench package:create-sqlite-db` |
| `pgsql` | `DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT=5432 DB_DATABASE=laravel DB_USERNAME=forge DB_PASSWORD=password` |
| `redis` | `REDIS_CLIENT=phpredis REDIS_HOST=127.0.0.1 REDIS_PORT=6379 REDIS_CACHE_CONNECTION=cache REDIS_CACHE_LOCK_CONNECTION=cache CACHE_STORE=redis` (Upstream's redis workflow runs the Cache suite with `CACHE_STORE=redis`) |
| `queue-<driver>@<backend>` | the backend's environment plus `QUEUE_CONNECTION=<driver>`; `queue-redis@redis` uses the `redis` environment without `CACHE_STORE` (the framework `queue-sync@none` leg adds the service env below) |

The recipes follow Upstream's `databases.yml`, `queues.yml` and `redis.yml` workflows. `phpunit.xml.dist` sets `DB_CONNECTION=testing` without `force`, so the variant's value wins. The legs are the framework on each alpha variant (7) and ai, mcp and boost on `none` (3). The Pest suites have only `none` entries.

The framework `none` and `queue-sync@none` legs (`SERVICE_LEGS`) are the service legs. They run where Upstream's `linux_tests` job runs its PHPUnit suite, so they start that job's memcached `1.6-alpine`, MySQL `9.7` and DynamoDB Local `2.0.0` services (for that job's `redis:7.0` they use the baseline's existing `redis:8.10.2`, beside Postgres 18), and add its env (`SERVICE_ENV`, from `tests.yml:79-86`) to the variant's: `DB_PORT=3306 DB_USERNAME=root DYNAMODB_CACHE_TABLE=laravel_dynamodb_test DYNAMODB_ENDPOINT=http://localhost:8888 AWS_ACCESS_KEY_ID=randomKey AWS_SECRET_ACCESS_KEY=randomSecret`. Upstream maps MySQL to a random host port; the baseline fixes it at 3306 so `DB_PORT` is deterministic. Story 2.6 first ran `none` with no extra env; `decisions/ESC-2.6-2.md` amended that, so a test Upstream runs against one of these services gets Upstream's own outcome rather than a service-caused `skip`. At the Pin this changed the four `Cache\DynamoDbStoreTest` IDs on `none`, the seven `Queue\DynamoBatchTest` IDs on `queue-sync@none` (they stay `skip` on `queue-database@sqlite` and `queue-redis@redis`, whose legs have no DynamoDB), and `Auth\ApiAuthenticationWithEloquentTest::testAuthenticationViaApiWithEloquentUsingWrongDatabaseCredentialsShouldNotCauseInfiniteLoop` on `none` (it needs MySQL). `legEnv(suite, variant)` gives a leg's environment in both image and local mode. The Pest suites' `none` legs and every other framework leg keep only the variant's environment.

## The runner and the recorder

`php runner.php <suite-dir> <php-version> <phpunit|pest> <files-list|->`:

1. It refuses any PHP other than `<php-version>`.
2. It writes `<suite-dir>/phpunit.xaravel-baseline.xml`, which is `phpunit.xml.dist` with these changes:
   - the test suites are reduced to the listed files (or kept whole for `-`);
   - `Xaravel\Baseline\Extension` is added to the existing extensions (the framework's `Illuminate\Tests\AfterEachTestExtension` stays);
   - `cacheResult="false"` is set.
3. It runs `PHP_BINARY -d memory_limit=-1 -d auto_prepend_file=recorder.php vendor/bin/<runner> --configuration <generated> --colors=never --do-not-cache-result` in the suite directory.
   - `memory_limit=-1` matches Upstream's CI, where setup-php sets it. Pest suites exhaust the image's default 128M. A `<php>` `<ini>` in the configuration (the framework's 2048M) still applies.
   - `XARAVEL_BASELINE_OUT` names the recorder's output file, and `XARAVEL_BASELINE_ROOT` names the suite directory.
4. It fails when the recorder never loaded (no `<output>.loaded`). Otherwise it copies the recorder's lines to stdout. It removes the generated configuration and its temp files.

`recorder.php` does nothing unless `XARAVEL_BASELINE_OUT` is set and it is PHP's `auto_prepend_file`. Then, before Composer loads anything:

- **The assertion kinds.** It tokenizer-rewrites the suite's `vendor/phpunit/phpunit/src/Framework/Assert.php`. Every `public static function assert*` body starts with a call that records the method name. It includes the rewritten source under the file's own path through a `file` stream wrapper that is registered only for that include, so PHPUnit's preload `require_once` of the original is a no-op. Vendor stays untouched. This works the same under PHPUnit (13 for the framework) and Pest (on PHPUnit 12).
- **What counts.**
  - Only outermost calls count: those whose caller frame's class is not exactly `PHPUnit\Framework\Assert`. `assertJsonStringEqualsJsonString` counts once, without the `assertJson` it calls.
  - Calls from `setUp`, the test and `tearDown` count, between PHPUnit's `PreparationStarted` and `Finished` events. So do calls made through Laravel helpers (`Illuminate\Testing\Assert`, `TestResponse`) and Pest `expect()`.
  - Mockery expectations and `expectException*` are not kinds.
- **The outcome.**
  - PHPUnit `Passed` (risky included) is `pass`; `Skipped` and `MarkedIncomplete` (Pest's `todo`) are `skip`; `Failed` and `Errored` are `fail`.
  - A class's `BeforeFirstTestMethodErrored` or `BeforeFirstTestMethodFailed` fails all its tests, and a skipped test suite skips its tests.
  - When a test emits several outcomes, the worst wins: fail > skip > pass.
- **Separate processes.** A test run in a separate process (`#[RunInSeparateProcess]`) records its assertions in the child process, which inherits the `-d auto_prepend_file` and finds the running test on its call stack. The parent records its outcome.
- **Forked children.** A child forked with `pcntl_fork` inside a test (`FilesystemTest::testSharedGet` forks 20, and the `fork` Concurrency driver forks too) inherits every count recorded so far. It never flushes, so its exit cannot repeat those counts, and its own assertions are not counted, as Upstream's PHPUnit does not count them.
- **Output.** At shutdown each process appends `{"test","class","outcome","assertions"}` lines to the output file. The extension creates `<output>.loaded` when it bootstraps.

## The workflow (`.github/workflows/baseline.yml`)

The workflow runs on a pull request to `main` that touches `tools/baseline/**`, `tools/oracle/**`, `tools/inventory/**`, `tools/upstream/**`, `conformance/oracle/**`, `conformance/inventory/**`, `conformance/baseline-pin` or the workflow itself, and on `workflow_dispatch`. Its permissions are `contents: read` and no job holds a write scope.

- **`inventory`.** It runs first. It builds and verifies the Oracle image, then runs `bun run inventory` in it and uploads `conformance/inventory/` as the artifact `inventory-listing`. The image carries Upstream's extension set, so PHPUnit calls providers (and lists datasets) that a bare host skips. The listing keeps the committed `assertions` and `oracle` of unchanged entries, and `oracle-nondeterminism.jsonl` is left as committed. Every `leg` plans from this listing, and `merge` writes into it.
- **`leg`.** A matrix of the 10 legs × attempt {1, 2}, with the services `postgres:18` (database `laravel`, user `forge`, password `password`) and `redis:8.10.2` on their default ports. The two service legs set `services: true` in the matrix, which also starts `memcached:1.6-alpine` (11211), `mysql:9.7` (`MYSQL_ALLOW_EMPTY_PASSWORD`, database `forge`, host port 3306, a `mysqladmin ping` health check) and `amazon/dynamodb-local:2.0.0` (host 8888 to 8000). On every other leg those three services' `image` is empty, and GitHub does not start them. Each job replaces `conformance/inventory/` with the `inventory-listing` artifact, builds and verifies the Oracle image with `bun run oracle:build "xaravel-oracle:<tag>"`, then runs `bun run baseline run --suite <s> --variant <v> --attempt <n> --out baseline-results`, and uploads the result as the artifact `baseline-<suite>.<variant>.<attempt>`.
- **`merge`.** It replaces `conformance/inventory/` with the `inventory-listing` artifact, downloads every `baseline-*` artifact into one directory, then runs `bun run baseline merge --in baseline-results`. It uploads `conformance/inventory/` as the `inventory` artifact, and fails when the committed Inventory differs from it, new untracked files included (`git add --intent-to-add conformance/inventory`, then `git diff --exit-code conformance/inventory`).

## Regenerating

After a Pin bump, a lock or image change, a change to `tools/baseline/`, or `bun run inventory` resetting entries to `null`/`{}`:

1. Push the branch. The `baseline` workflow runs.
2. If `merge` reports `oracle non-determinism: …`, the Upstream test is not repeatable at the Pin. Investigate it before going further. Do not commit around it: a pinned value in `oracle-nondeterminism.jsonl` needs an approved Escalation, as ESC-2.6-1 was.
3. Download the run's `inventory` artifact, replace `conformance/inventory/` with it, and commit.
4. Push again. The second run's `merge` job must pass `git diff --exit-code`, which shows that the committed data is exactly what the run produced.

`bun run inventory` carries `assertions` and `oracle` over for each entry whose `id`, `hash` and `backends` are all unchanged ([inventory.md](inventory.md#the-record-framework)). A changed or new entry gets `null` and `{}` until the next baseline run.
