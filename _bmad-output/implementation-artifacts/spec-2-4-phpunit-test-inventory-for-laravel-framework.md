---
title: 'Story 2.4: PHPUnit Test Inventory for `laravel/framework`'
type: 'feature'
created: '2026-10-17'
baseline_revision: '4a67783af49778fce1946b6cef607ee50ce3924a'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.4.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** No Inventory of `laravel/framework`'s test cases exists, so nothing defines the conformance denominator, the Test IDs that Expectations, the Ratchet and Story selectors key on, or the `hash` that FR-7 uses to detect changed tests (FR-1).

**Approach:** `bun run inventory` runs a PHP lister inside the Oracle image (or, with `--local`, against a locked install with the local PHP 8.5.11). The lister takes PHPUnit's own `--list-tests-xml` listing as the authoritative set of Test IDs, including datasets computed at runtime. It joins each test to its provider data through PHPUnit's `DataProvider` API, and emits one raw JSON line per test. `tools/inventory/inventory.ts` turns those raw lines into `conformance/inventory/<component>.jsonl` entries.

## Boundaries & Constraints

**Always:**
- Entry: `{"id","component","kind","backends","source","hash"}`, keys in that order. Each line is written with `JSON.stringify`, which is fine here because these are tool data, not framework values (the Story 2.3 precedent). One file per framework Component that has tests. Lines are sorted by `id`, compared by UTF-16 code units. The files are UTF-8 with LF line endings and a trailing newline. A framework Component's file that is no longer generated is deleted. Files for `ai`, `mcp` and `boost` are never touched.
- `id` is PHPUnit's `testMethod@id` verbatim: `<FQCN>::<method>` or `<FQCN>::<method>#<dataset>`. An unnamed dataset is its numeric index. For an inherited test, the FQCN is the concrete class.
- `component` is `componentForTest(map, "framework/" + <test class file>)`; an unmapped file fails. `kind` is `integration` under `framework/tests/Integration/`, otherwise `unit`.
- `source` is `framework/<declaring file>:<start>-<end>`: the method's declaring file (a parent class or trait when the method is inherited) and its line range. It must lie inside the snapshot's `tests/`.
- `backends`: a sorted, de-duplicated array. Each source below is a set:
  - `#[RequiresDatabase]` (Testbench's attribute, repeatable, on the class hierarchy and the method): the intersection of every attribute's drivers;
  - `framework/tests/Integration/Database/<Engine>/`: MySql → `mysql`, MariaDb → `mariadb`, Postgres → `pgsql`, SqlServer → `sqlsrv`, Sqlite → `sqlite`.

  When both database sources are present, they intersect, and an empty intersection fails. The union then adds:
  - `redis` when the class hierarchy uses `InteractsWithRedis`, directly or through a trait;
  - `queue-beanstalkd@beanstalkd`, `queue-database@sqlite`, `queue-redis@redis` and `queue-sync@none` under `framework/tests/Integration/Queue/`, the suite that Upstream's queues and redis workflows run once per `QUEUE_CONNECTION`.

  If nothing applies, the value is `["none"]`.
- `hash`: lowercase hex SHA-256 over two parts:
  - the code tokens of the method (from `function` to its closing brace) as PHP's tokenizer lexes them, with whitespace and comment tokens dropped;
  - the dataset's export: deterministic, with the snapshot root path replaced by `{root}`, and closures exported by location plus code tokens.

  Whitespace and comment edits leave it unchanged.
- The lister fails closed in each of these cases: any PHPUnit output other than its banner and the "Wrote list" line; a dataset name with no matching provider label; a PHP version other than 8.5.11.
- `--local <dir>` also fails when a test file or source file in `<dir>` differs from the snapshot's copy.
- Image mode runs `docker run --rm --network none` with `tools/inventory/lister.php` mounted read-only. The default image is `xaravel-oracle:<oracle tag>`.

**Never:**
- Fetch anything, or edit the snapshot, the component map, `ci.yml`, `conformance/protected-paths`, `tools/protected-paths/`, `tools/ownership/` or any existing test's expected values.
- Make `bun test` need PHP, Docker or vendor files. Generator tests use a fake `--php`.
- Write `assertions` or `oracle` (Story 2.6). Inventory ai, mcp or boost (Story 2.5). Add a CI workflow or the runner cross-check (Story 2.7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Generate | real snapshot, locked install | per-Component files; prints counts; exit 0 | — |
| Dataset | provider with `'uses string'` and list keys | `…#uses string`, `…#0`, `…#1` as separate entries | — |
| Unmapped | raw test file that no map entry matches | exit 1 `unmapped test file: <path>` | — |
| DB conflict | `Postgres/` dir + `#[RequiresDatabase('mysql')]` | exit 1 naming the id | — |
| Bad raw line | malformed JSON or missing field from the lister | exit 1 with line number | — |
| Lister fails | non-zero exit / stray PHPUnit output | exit 1 with its stderr | — |
| Stale local copy | `--local` file differs from snapshot | exit 1 naming the file | — |
| No snapshot | `conformance/upstream/framework` absent | exit 1 `run bun run upstream:sync` | no fetch |

</intent-contract>

## Code Map

- `tools/upstream/upstream.ts:381` -- `upstreamPath` throws the sync hint; CLI style (`UsageError`, `USAGE`, `parseOptions`, `main`, exit 0/1/2) at :410-479.
- `tools/component-map/component-map.ts:215,273` -- `readMap`, `componentForTest` (path starts `framework/tests/…`).
- `tools/oracle/oracle.ts:46-59` -- `PHP_VERSION`, `IMAGE_NAME`, `IMAGE_UPSTREAM_DIR` (`/oracle/upstream`); `tag` command derives the image tag (find its exported function).
- Prototype verified against vendor PHPUnit 13.4.3 (`/tmp/xaravel-inv/framework`, composer install from `conformance/oracle/locks/framework/composer.lock`): `phpunit --list-tests-xml <file>` yields 16216 `testMethod` ids under `tests/testClass[@name,@file]` (namespace `https://xml.phpunit.de/testSuite`; the `groups` section repeats ids — ignore it). Test files must be `require_once`d before `new PHPUnit\Metadata\Api\DataProvider(PHPUnit\Event\Facade::emitter())->providedData($class,$method)`, which returns `array<label, ProvidedData>` (`->value()`) or null; every dataset id joined with 0 misses.
- `framework/phpunit.xml.dist` `<php>` -- ini `date.timezone=UTC`, `intl.default_locale`, `memory_limit`, env `DB_CONNECTION=testing`; the lister applies `<ini>`, `<env>`, `<const>` before calling providers.
- `vendor/orchestra/testbench-core/src/Attributes/RequiresDatabase.php` -- `Orchestra\Testbench\Attributes\RequiresDatabase(array|string $driver, …)`, repeatable.
- `conformance/tests/xaravel/component-map.test.ts` -- test conventions: `XT-conformance-<n>:` titles, temp fixture roots, `Bun.spawn` of the CLI with `--root`, real-snapshot parts guarded by `existsSync`.

## Tasks & Acceptance

**Execution:**
- `tools/inventory/lister.php` -- new. `php lister.php <framework-dir> <php-version>`: version guard, applies `<php>` config, runs the listing, then emits one raw JSON line per test to stdout: `{"id","class","method","dataset","file","source":{"file","start","end"},"tokens":["c…"|"w…"|"#…"],"data":string|null,"requiresDatabase":string[]|null,"redis":bool}`. Paths are relative to `<framework-dir>`; tokens carry a kind prefix (code, whitespace, comment) so that normalising stays in TS.
- `tools/inventory/inventory.ts` -- new. Exports `INVENTORY_DIR`, the types, `parseRaw`, `normaliseTokens`, `testHash`, `backendsFor`, `kindFor`, `buildEntries`, `renderInventory`, `parseInventory` and `generate`, plus the CLI `generate [--root] [--image <ref> | --local <dir> [--php <bin>]]`.
- `package.json` -- add `"inventory": "bun tools/inventory/inventory.ts generate"`. `tsconfig.json` -- include `tools/inventory/**/*.ts`.
- `conformance/inventory/*.jsonl` -- generated with `--local`.
- `conformance/tests/xaravel/inventory.test.ts` -- new. XT-conformance-49..52 and the matrix, using fixture roots and a fake `--php` script, plus checks on the committed Inventory (and the snapshot, when present).
- `docs/ops/inventory.md` -- new operator note: the two modes, the record, the backend rules, the hash, the failure messages and how to regenerate.

**Acceptance Criteria:**
- Given the Oracle image (or a locked local install) and the snapshot, when `bun run inventory` runs, then it writes `conformance/inventory/<component>.jsonl`, with one line per runner-listed test case carrying `id`, `component`, `kind`, `backends`, `source` and `hash`. The committed files hold exactly 16216 unique ids, sorted and well-formed, each `source` resolving inside the snapshot (XT-conformance-49).
- Given a test with `#[DataProvider]` or `#[TestWith]`, when it is inventoried, then each dataset is its own entry, including datasets computed at runtime, and an unnamed dataset uses its numeric index. For example, `Illuminate\Tests\Bus\QueueableTest::testOnConnection#uses string` and `Illuminate\Tests\Auth\AuthAccessGateTest::testHasAbilities#0` are present (XT-conformance-50).
- Given the backend tags, when they are derived, then the rules above hold. In the committed Inventory, `UniqueConstraintViolationTest` methods carry their single driver, `Integration/Database/Postgres/*` carry `pgsql`, a Redis cache test carries `redis`, `Integration/Queue/*` carry the four queue variants, and a `tests/Support` test is `["none"]` (XT-conformance-51).
- Given an entry's `hash`, when it is computed, then it covers the method's code tokens and the dataset export. Whitespace or comment-only token changes keep it, and a code-token or dataset change alters it. Two generations of the same input are byte-identical (XT-conformance-52).

## Spec Change Log

## Review Triage Log

## Design Notes

The IDs come from PHPUnit's runtime listing because providers are computed (research G-26). Story 2.7 then cross-checks them independently, for determinism and against the JUnit output. Tests directly under `Integration/Database/` that have no attribute are `none`, as the AC literally says. Upstream also runs them on every engine in its databases workflow; Epic 5's Variant work can widen that through an Escalation. `mysql`, `mariadb`, `sqlsrv` and `beanstalkd` are recorded faithfully (PRD §FR-1 line 208). They are post-alpha backends, and `conformance/variants` (Epic 5) decides whether they become Variants.

## Verification

**Commands:**
- `bun run inventory --local /tmp/xaravel-inv/framework` -- expected: exit 0, 16216 entries; run twice, `git diff --stat conformance/inventory` empty the second time
- `bun test` -- expected: all pass, including XT-49..52
- `bun run typecheck`, `bun run lint`, `bun run workflows:check`, `bun run protected-paths:codeowners --check`, `bun run component-map:check`, `bun run upstream:check` -- expected: clean

## Auto Run Result

Status: blocked
Blocking condition: intent gap. The intent contract says an empty `RequiresDatabase` × engine-directory intersection fails the run. At the Pin, 8 Test IDs hit this rule, so `bun run inventory` exits 1, which contradicts this spec's Verification (exit 0, 16216 entries). The 8 IDs are the inherited `testForeignKeys`, `testComment`, `testAutoIncrementStartingValue` and `testHasTable` × 2 datasets on `Illuminate\Tests\Integration\Database\Sqlite\SchemaBuilderSchemaNameTest`; Upstream skips them on every engine. Raised as `conformance/escalations/ESC-2.4-1.md`. Every other ID derived cleanly.

**Attempted implementation:** saved as `_bmad-output/implementation-artifacts/spec-2-4-attempt.patch`; it applies to the baseline with `git apply`. The code was reverted. Once the Escalation is ruled on, apply the patch, change the empty-intersection branch of `backendsFor` in `tools/inventory/inventory.ts`, regenerate twice with `--local`, and commit `conformance/inventory/*.jsonl`.

**Contents of the patch:**
- `tools/inventory/lister.php` and `tools/inventory/inventory.ts`.
- `conformance/tests/xaravel/inventory.test.ts` (XT-49..52 and the matrix).
- `docs/ops/inventory.md`.
- Edits to `package.json` and `tsconfig.json`.

With a provisional inventory, `bun test` passed 54/54, and `typecheck` and `lint` were clean.

**Notes for the resumed run, to be reviewed then:**
- Story 2.2's XT-conformance-44 allows only `tools/oracle` to call docker. The patch therefore adds an exported `runInImage(image, mounts, command)` to `tools/oracle/oracle.ts` (`docker run --rm --network none`, read-only mounts) and updates one sentence of `docs/ops/oracle.md`. `runInImage` has no test of its own.
- Some providers draw random values (`fake()`, `Str::uuid()`), for example `ScheduleGroupTest` and `QueueDatabaseQueueUnitTest`. The lister seeds `mt_srand`/`srand` from the test name and routes `Str` UUIDs, ULIDs and random strings through counters, so the hash is deterministic. The hashed values differ from the values a real run draws.
- When a provider is not called (for example a Windows-only test), PHPUnit lists the test without datasets. It becomes one entry with `data: null`.
- Image mode has not been run against a real Oracle image, because there is no Docker on the orchestrator host.
