# The Test Inventory

`conformance/inventory/<component>.jsonl` lists every test case in `laravel/framework`'s PHPUnit suite and in the Pest suites of `laravel/ai`, `laravel/mcp` and `laravel/boost` at the Baseline Pin, one entry per case (FR-1). It is the conformance denominator. Expectations, the Ratchet and Story selectors key on its Test IDs, and FR-7 uses its `hash` to find changed tests. The tool is `tools/inventory/inventory.ts`, and it runs the PHP lister `tools/inventory/lister.php`. The framework writes one file per framework Component; each Pest suite writes only `ai.jsonl`, `mcp.jsonl` or `boost.jsonl` (see [The Pest suites](#the-pest-suites)). The baseline run (Story 2.6, [baseline.md](baseline.md)) fills each entry's `assertions` and `oracle`.

## The two modes

```sh
bun run upstream:sync
bun run inventory [--suite <s>]                # in the Oracle image
bun run inventory [--suite <s>] --image <ref>  # in another image
bun run inventory [--suite <s>] --local <dir> [--php <bin>]
```

`--suite` is `framework`, `ai`, `mcp`, `boost` or `all`.

- **Image mode** (the default) runs the lister in `xaravel-oracle:<oracle tag>` (see `bun run oracle:tag` and [oracle.md](oracle.md)), or in `--image <ref>`. It goes through `runInImage` in `tools/oracle/oracle.ts`, which runs `docker run --rm --network none` with the lister mounted read-only at `/xaravel/lister.php`, against `/oracle/upstream/<suite>`: `php /xaravel/lister.php /oracle/upstream/framework 8.5.11` for the framework, and `php /xaravel/lister.php /oracle/upstream/<suite> 8.5.11 pest` for a Pest suite. The default suite is `all`: the framework, then ai, mcp and boost. Every suite is listed and validated before any file is written.
- **Local mode** runs the lister with a local PHP 8.5.11 (`php`, or `--php <bin>`) against `<dir>`, a locked install of one suite's snapshot: a copy of `conformance/upstream/<suite>` with `composer install` run from `conformance/oracle/locks/<suite>/composer.lock`. The suite defaults to `framework`, and `--suite all` is a usage error. Before anything runs, every file under `tests/` and `src/`, plus `phpunit.xml.dist`, must equal the snapshot's copy. A file that differs, is missing or is extra fails the run, and the error names the file.

Both modes read Upstream only from the snapshot and never fetch. `bun test` needs neither PHP nor Docker: the generator tests use a fake `--php` and a stand-in image runner.

## What the lister does (framework)

1. It refuses any PHP other than 8.5.11.
2. It runs `vendor/bin/phpunit --list-tests-xml` in the framework directory. PHPUnit's own listing is the authoritative set of Test IDs, including datasets that providers compute at runtime. Any output other than PHPUnit's banner and its `Wrote list of tests …` line fails the run (a warning, a deprecation or a provider error, for example).
3. It applies `phpunit.xml.dist`'s `<php>` entries (`<ini>`, `<env>`, `<const>`), loads `vendor/autoload.php` and every listed test file, and joins each listed dataset to its provider data through `PHPUnit\Metadata\Api\DataProvider`. A dataset name that matches no provider label fails the run. When PHPUnit lists a test without datasets because it did not call the provider (for example `#[RequiresOperatingSystem('Windows')]`), the test is one entry with no dataset.
4. It writes one raw JSON line per listed test: `id`, `class`, `method`, `dataset`, `file`, `source`, `tokens`, `data`, `requiresDatabase` and `redis`. Paths are relative to the framework directory.

Before each provider call, the lister seeds PHP's Mersenne Twister (which Faker draws from) from the test's name, and routes `Str`'s UUIDs, ULIDs and random strings through counters that reset for each provider. Without this, providers that call `fake()` or `Str::uuid()` would change the dataset export, and with it the hash, on every run. The values the hash sees are not the ones a real test run draws. The hash only has to notice a change to the provider.

## The record (framework)

```
{"id":"Illuminate\\Tests\\Bus\\QueueableTest::testOnConnection#uses string","component":"bus","kind":"unit","backends":["none"],"source":"framework/tests/Bus/QueueableTest.php:20-27","hash":"…","assertions":{"assertSame":1},"oracle":{"none":"pass"}}
```

- `id` is PHPUnit's `testMethod@id`, verbatim: `<FQCN>::<method>`, or `<FQCN>::<method>#<dataset>`. An unnamed dataset is its numeric index. For an inherited test, the FQCN is the concrete class.
- `component` is the component map's Component for `framework/<test class file>` ([component-map.md](component-map.md)).
- `kind` is `integration` under `framework/tests/Integration/`, and `unit` otherwise.
- `backends` is described in the next section.
- `source` is `framework/<declaring file>:<start>-<end>`. The declaring file is the parent class or trait when the method is inherited. It always lies inside the snapshot's `tests/`.
- `hash` is described below.
- `assertions` maps each PHPUnit assertion kind the test made to a positive count, with keys sorted by UTF-16 code units. A kind is a `public static function assert*` method of `PHPUnit\Framework\Assert`, counted once per outermost call (a call that does not come from `Assert` itself), from `setUp`, the test and `tearDown`. When the test ran on several alpha variants, each count is the maximum over them. The value is `{}` when the test ran but asserted nothing, and `null` when it has not run on an alpha variant.
- `oracle` maps each alpha variant the entry is tagged with to `pass`, `skip` or `fail`, with keys sorted. The keys are exactly `backends` intersected with `none`, `sqlite`, `pgsql`, `redis`, `queue-sync@none`, `queue-database@sqlite` and `queue-redis@redis`. The value is `{}` when that intersection is empty (`mysql`, `mariadb`, `sqlsrv` and `beanstalkd` only).

`assertions` and `oracle` come only from the baseline run's `merge` ([baseline.md](baseline.md)). `assertions` is `null` exactly when `oracle` is `{}`.

**Preservation.** `bun run inventory` carries `assertions` and `oracle` over from the existing files for each entry whose `id`, `hash` and `backends` are all unchanged, byte for byte. Any other entry, new or changed, gets `"assertions":null,"oracle":{}` until the next baseline run. An existing file that does not parse carries nothing over.

Keys are always in this order. Each file covers one Component, and its lines are sorted by `id`, compared by UTF-16 code units. Files are UTF-8, with LF line endings and a trailing newline. The lines are written with `JSON.stringify`, because they are tool data, not framework values. When a framework Component no longer has tests, its file is deleted.

## Backends (framework)

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

## The Pest suites

`laravel/ai`, `laravel/mcp` and `laravel/boost` are tested with Pest 4 (on PHPUnit 12). Each suite is one Component of the same name, so its entries go to `ai.jsonl`, `mcp.jsonl` or `boost.jsonl`, and every entry's `component` is `componentForTest(map, "<suite>/<test file>")`, which must equal the suite. A file the map gives to another Component fails the run. The record, its key order (with `assertions` and `oracle`), the sorting, the file format and the hash formula are the framework's.

```
{"id":"mcp/tests/Feature/CompletionTest.php::from() - Basic Completions > it filters by prefix and returns all when empty","component":"mcp","kind":"unit","backends":["none"],"source":"mcp/tests/Feature/CompletionTest.php:250-260","hash":"…","assertions":{"assertSame":2},"oracle":{"none":"pass"}}
```

### What the lister does in Pest mode

`php lister.php <suite-dir> 8.5.11 pest`:

1. refuses any PHP other than 8.5.11;
2. runs the suite's own `vendor/bin/pest --colors=never --do-not-cache-result --list-tests-xml <list>`, with the lister itself as PHP's `auto_prepend_file` and `XARAVEL_INVENTORY_PEST` naming an output file. Pest's listing is the authoritative set of tests, including datasets computed at runtime. Any Pest output other than its one `INFO  Wrote list of tests …` line, or a non-zero exit, fails the run;
3. inside Pest's process, at shutdown, reads the listing and Pest's test repository (`Pest\TestSuite::getInstance()->tests`): each listed method's describe blocks, description, closure and datasets. The generated `P\Tests\…` class's static `$__filename` names the test file;
4. writes one raw JSON line per listed test: `id`, `class`, `method` and `dataset` (PHPUnit's), `file`, `describe`, `name`, `source`, `tokens`, `data`, `requiresDatabase` and `redis`. Paths are relative to the suite directory.

It fails closed when a listed method matches no Pest test, when a description does not start with its describe prefix, when a dataset matches no provider label, and when a test without a closure is not exactly one `arch('<literal>')` statement. Randomness in datasets is pinned as for the framework.

### Test IDs

`id` is `<suite>/<test file>::<describe> > … > <test name>`, plus `#<dataset>` for a dataset:

- `<test file>` is relative to the suite directory (`tests/…`), so the suite prefix matches `source` and the component map, and keeps IDs unique across repositories.
- `<describe>` values are Pest's `describe()` descriptions, outermost first, joined with ` > `.
- `<test name>` is Pest's description without its describe prefix. `it('…')` keeps its `it ` prefix; `test('…')` and `arch('…')` have none.
- `<dataset>` is the dataset label Pest's runner lists, verbatim: `dataset "tools/list"` for a named dataset, `('Mcp-Name')` for an unnamed value. Each dataset is its own entry.

boost holds one plain PHPUnit test class that Pest runs, `tests/Feature/BrowserLogsRouteRegistrationTest.php`. Its test name is the method name, and its source and hash are the method's, as for the framework.

### Source and hash

- `source` is `<suite>/<file>:<start>-<end>`, the lines of the test closure, which lie inside `<suite>/tests/`. A closure-less `arch('<name>')` test (7 in mcp, 5 in boost) has no closure of its own; its source is the `arch(…)` statement's lines, through its `;`.
- `hash` uses the framework's formula. The code tokens are the closure's, from `function` or `fn` to its end (a `function`'s closing brace, an `fn`'s expression end), or the `arch(…)` statement's tokens through its `;`. `data` is the dataset export. Hooks (`beforeEach`, `afterEach`), `uses()`, helpers and `describe` bodies outside the test closure are not covered.

### Kind and backends

- `kind` is `integration` under `<suite>/tests/Integration/` (only `laravel/ai` has that directory, and its `Pest.php` groups it as `integration`), and `unit` otherwise.
- `backends` is the `#[RequiresDatabase]` drivers on the test class hierarchy, plus `redis` when it uses `InteractsWithRedis`; otherwise `["none"]`. The framework's engine-directory and queue rules do not apply. The suites run on in-memory SQLite through their `phpunit.xml.dist` env, as framework tests outside engine directories do, so at the Pin every entry is `["none"]`.

## Failures

The command exits 0 on success and prints the count of each Component, plus any removed file. It exits 1 on any failure (fail closed) and 2 on a usage error. Every validation runs before any file is written, so a validation failure writes nothing; files are then written one by one.

| Message | Meaning and fix |
| --- | --- |
| `conformance/upstream/<suite> is missing; run bun run upstream:sync` | There is no snapshot. Sync it. |
| `conformance/upstream/<suite>/tests is missing; run bun run upstream:sync` | The snapshot directory exists but has no `tests/`. Sync it again. |
| `unmapped test file: <suite>/tests/…` | No component-map entry matches a listed test file. Fix the map (Story 2.3's check reports it as well). |
| `<suite>/tests/… maps to <c>, not <suite>` | The map gives a Pest test file to a Component other than its suite. |
| `raw line <n>: …` | The lister wrote a malformed line or one with a missing field. |
| `the lister failed (exit <n>): <stderr>` | The lister failed, for example with `lister: expected PHP 8.5.11, …`, `lister: unexpected phpunit output: …`, `lister: <id>: dataset "…" matches no provider label`, or `lister: <test>: the data provider failed: …`. In Pest mode, `lister: unexpected pest output: …` and `lister: pest listed no tests` come directly from the lister. A failure inside Pest's process (the shutdown dump exits 1) surfaces wrapped, as `the lister failed (exit 1): lister: pest --list-tests-xml exited 1:` followed by Pest's output and the inner `lister: …` line, for example `lister: <id>: the listed method matches no Pest test in <file>`, `lister: <id>: the description "…" does not start with its describe prefix "…"`, `lister: <id>: dataset "…" matches no provider label`, `lister: <test>: the dataset failed: …`, or `lister: <id>: a closure-less test that is not exactly one arch('<literal>') statement (<n> found in <file>)`. Image mode reports it as `the lister failed: <command> in <image> failed (exit <n>): <stderr>`. |
| `--local <dir> is not a copy of the snapshot: …` | A test or source file in `<dir>` differs from the snapshot, or is missing or extra. Re-copy it from `conformance/upstream/<suite>`. |
| `<id>: source <suite>/… is not in conformance/upstream/<suite>/tests/` | A method or test closure is declared outside the snapshot's `tests/`. |
| `duplicate test id: <id>` | PHPUnit listed an id twice. |

## Regenerating

Regenerate after a Pin bump (Story 2.8), a lock change, or a change to the lister or the backend rules:

1. `bun run upstream:sync`, then `bun run upstream:check`.
2. `bun run inventory`. If Docker is unavailable, prepare a local install of each suite instead: `cp -R conformance/upstream/<suite> /tmp/xaravel-inv/<suite>`, make it writable, copy in `conformance/oracle/locks/<suite>/composer.lock`, run `COMPOSER_ROOT_VERSION=<version> composer install` there, where `<version>` is the suite's tag in `conformance/baseline-pin` without the `v` (at the current Pin, for example, `13.37.0` for framework and `1.0.2` for mcp), and then run `bun run inventory --local /tmp/xaravel-inv/framework` and `bun run inventory --suite <suite> --local /tmp/xaravel-inv/<suite>` for ai, mcp and boost.
3. Run the command a second time. `git diff --stat conformance/inventory` must be empty.
4. If any entry was added or changed (its `assertions` and `oracle` are now `null` and `{}`), rerun the baseline ([baseline.md](baseline.md#regenerating)) and commit its `inventory` artifact.
5. `bun test`, then open a PR. `conformance/inventory/` is a Protected Path.
