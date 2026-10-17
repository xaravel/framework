# The framework Test Inventory

`conformance/inventory/<component>.jsonl` lists every test case in `laravel/framework`'s PHPUnit suite at the Baseline Pin, one entry per case (FR-1). It is the conformance denominator. Expectations, the Ratchet and Story selectors key on its Test IDs, and FR-7 uses its `hash` to find changed tests. The tool is `tools/inventory/inventory.ts`, and it runs the PHP lister `tools/inventory/lister.php`. Story 2.5 adds `ai.jsonl`, `mcp.jsonl` and `boost.jsonl`, and this tool never touches those files. Story 2.6 adds `assertions` and `oracle`.

## The two modes

```sh
bun run upstream:sync
bun run inventory                      # in the Oracle image
bun run inventory --image <ref>        # in another image
bun run inventory --local <dir> [--php <bin>]
```

- **Image mode** (the default) runs the lister in `xaravel-oracle:<oracle tag>` (see `bun run oracle:tag` and [oracle.md](oracle.md)), or in `--image <ref>`. It goes through `runInImage` in `tools/oracle/oracle.ts`, which runs `docker run --rm --network none` with the lister mounted read-only at `/xaravel/lister.php`, against `/oracle/upstream/framework`.
- **Local mode** runs the lister with a local PHP 8.5.11 (`php`, or `--php <bin>`) against `<dir>`, a locked install of the snapshot: a copy of `conformance/upstream/framework` with `composer install` run from `conformance/oracle/locks/framework/composer.lock`. Before anything runs, every file under `tests/` and `src/`, plus `phpunit.xml.dist`, must equal the snapshot's copy. A file that differs, is missing or is extra fails the run, and the error names the file.

Both modes read Upstream only from the snapshot and never fetch. `bun test` needs neither PHP nor Docker: the generator tests use a fake `--php` and a stand-in image runner.

## What the lister does

1. It refuses any PHP other than 8.5.11.
2. It runs `vendor/bin/phpunit --list-tests-xml` in the framework directory. PHPUnit's own listing is the authoritative set of Test IDs, including datasets that providers compute at runtime. Any output other than PHPUnit's banner and its `Wrote list of tests …` line fails the run (a warning, a deprecation or a provider error, for example).
3. It applies `phpunit.xml.dist`'s `<php>` entries (`<ini>`, `<env>`, `<const>`), loads `vendor/autoload.php` and every listed test file, and joins each listed dataset to its provider data through `PHPUnit\Metadata\Api\DataProvider`. A dataset name that matches no provider label fails the run. When PHPUnit lists a test without datasets because it did not call the provider (for example `#[RequiresOperatingSystem('Windows')]`), the test is one entry with no dataset.
4. It writes one raw JSON line per listed test: `id`, `class`, `method`, `dataset`, `file`, `source`, `tokens`, `data`, `requiresDatabase` and `redis`. Paths are relative to the framework directory.

Before each provider call, the lister seeds PHP's Mersenne Twister (which Faker draws from) from the test's name, and routes `Str`'s UUIDs, ULIDs and random strings through counters that reset for each provider. Without this, providers that call `fake()` or `Str::uuid()` would change the dataset export, and with it the hash, on every run. The values the hash sees are not the ones a real test run draws. The hash only has to notice a change to the provider.

## The record

```
{"id":"Illuminate\\Tests\\Bus\\QueueableTest::testOnConnection#uses string","component":"bus","kind":"unit","backends":["none"],"source":"framework/tests/Bus/QueueableTest.php:20-27","hash":"…"}
```

- `id` is PHPUnit's `testMethod@id`, verbatim: `<FQCN>::<method>`, or `<FQCN>::<method>#<dataset>`. An unnamed dataset is its numeric index. For an inherited test, the FQCN is the concrete class.
- `component` is the component map's Component for `framework/<test class file>` ([component-map.md](component-map.md)).
- `kind` is `integration` under `framework/tests/Integration/`, and `unit` otherwise.
- `backends` is described in the next section.
- `source` is `framework/<declaring file>:<start>-<end>`. The declaring file is the parent class or trait when the method is inherited. It always lies inside the snapshot's `tests/`.
- `hash` is described below.

Keys are always in this order. Each file covers one Component, and its lines are sorted by `id`, compared by UTF-16 code units. Files are UTF-8, with LF line endings and a trailing newline. The lines are written with `JSON.stringify`, because they are tool data, not framework values. When a framework Component no longer has tests, its file is deleted.

## Backends

`backends` is a sorted, de-duplicated array. The database drivers come from two sources:

- `#[RequiresDatabase]` (`Orchestra\Testbench\Attributes\RequiresDatabase`, repeatable) on the method and on the class and its parents. The drivers are the intersection of every attribute's drivers.
- The directory `framework/tests/Integration/Database/<Engine>/`: `MySql` gives `mysql`, `MariaDb` gives `mariadb`, `Postgres` gives `pgsql`, `SqlServer` gives `sqlsrv` and `Sqlite` gives `sqlite`.

When both sources are present, they intersect. When the intersection is empty (including attributes with no driver in common), the test keeps the directory's engine, or no database backend when there is no engine directory. Upstream skips such a test on every engine, and Story 2.6's Oracle run records that `skip` (`decisions/ESC-2.4-1.md`). At the Pin this affects 8 inherited Test IDs on `Illuminate\Tests\Integration\Database\Sqlite\SchemaBuilderSchemaNameTest`. The union then adds:

- `redis`, when the class or a parent uses `Illuminate\Foundation\Testing\Concerns\InteractsWithRedis`, directly or through a trait;
- `queue-beanstalkd@beanstalkd`, `queue-database@sqlite`, `queue-redis@redis` and `queue-sync@none`, under `framework/tests/Integration/Queue/`. Upstream's queues and redis workflows run that suite once per `QUEUE_CONNECTION`.

When none of these applies, `backends` is `["none"]`. Tests directly under `Integration/Database/` with no attribute get `["none"]`. The `mysql`, `mariadb`, `sqlsrv` and `beanstalkd` tags are recorded as they are, and `conformance/variants` (Epic 5) decides which of them become Variants.

## The hash

`hash` is the lowercase hex SHA-256 of `JSON.stringify([codeTokens, data])`:

- `codeTokens` are the method's tokens from `function` to its closing brace, as PHP's tokenizer lexes them, with whitespace and comment tokens dropped. Attributes and the docblock come before `function`, so they are not covered, and a dataset change shows up through `data` instead.
- `data` is the dataset's export, or `null` for a test with no dataset. The export is deterministic: arrays with their keys, enums as `Class::Case`, objects as their class and mangled properties, and closures by location (`{root}/<file>:<start>-<end>`) plus the code tokens of those lines. The framework directory is replaced by `{root}`, and strings that are not valid UTF-8 are exported as hex.

Only the method itself and its dataset are covered. `setUp`/`tearDown`, helper methods, class properties and traits are not, so an edit to them leaves the hash unchanged.

A whitespace-only or comment-only edit leaves the hash unchanged. A code-token or dataset change alters it. Generating twice from the same input gives byte-identical files.

## Failures

The command exits 0 on success and prints the count of each Component, plus any removed file. It exits 1 on any failure (fail closed) and 2 on a usage error. Every validation runs before any file is written, so a validation failure writes nothing; files are then written one by one.

| Message | Meaning and fix |
| --- | --- |
| `conformance/upstream/framework is missing; run bun run upstream:sync` | There is no snapshot. Sync it. |
| `unmapped test file: framework/tests/…` | No component-map entry matches a listed test file. Fix the map (Story 2.3's check reports it as well). |
| `raw line <n>: …` | The lister wrote a malformed line or one with a missing field. |
| `the lister failed (exit <n>): <stderr>` | The lister failed, for example with `lister: expected PHP 8.5.11, …`, `lister: unexpected phpunit output: …`, `lister: <id>: dataset "…" matches no provider label`, or `lister: <test>: the data provider failed: …`. Image mode reports it as `the lister failed: <command> in <image> failed (exit <n>): <stderr>`. |
| `--local <dir> is not a copy of the snapshot: …` | A test or source file in `<dir>` differs from the snapshot, or is missing or extra. Re-copy it from `conformance/upstream/framework`. |
| `<id>: source framework/… is not in conformance/upstream/framework/tests/` | A method is declared outside the snapshot's `tests/`. |
| `duplicate test id: <id>` | PHPUnit listed an id twice. |

## Regenerating

Regenerate after a Pin bump (Story 2.8), a lock change, or a change to the lister or the backend rules:

1. `bun run upstream:sync`, then `bun run upstream:check`.
2. `bun run inventory`. If Docker is unavailable, prepare a local install instead: `cp -R conformance/upstream/framework /tmp/xaravel-inv/framework`, make it writable, copy in `conformance/oracle/locks/framework/composer.lock`, run `COMPOSER_ROOT_VERSION=13.37.0 composer install` there, and then run `bun run inventory --local /tmp/xaravel-inv/framework`.
3. Run the command a second time. `git diff --stat conformance/inventory` must be empty.
4. `bun test`, then open a PR. `conformance/inventory/` is a Protected Path.
