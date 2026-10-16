# Laravel framework anatomy (for Xaravel epic sequencing)

Researched 2026-10-15. Source: shallow clone of `laravel/framework` default branch `13.x` at commit `86864f3` ("Update CHANGELOG"), i.e. **v13.37.0** (`Application::VERSION = '13.37.0'`). Clone at `/Users/ea/.claude-personal/jobs/88982ab5/tmp/research/laravel-framework` (nothing from it was executed). Analysis scripts: `/Users/ea/.claude-personal/jobs/88982ab5/tmp/scripts/` (`anatomy.py`, `layers.py`, `table.py`, raw output `anatomy.json`).

## 1. Version and cadence

| Fact | Value | Source |
|---|---|---|
| Current major | **Laravel 13** (13.0.0 published 2026-03-17) | GitHub releases API |
| Latest release | **v13.37.0**, 2026-10-16 05:00 UTC (v13.36.0 on 2026-10-13) | GitHub releases API |
| Previous major still patched | 12.x (v12.70.0 on 2026-10-13). 12.0.0 published 2025-02-24. Bug fixes ended Aug 2026, security fixes to 2027-02-24 | GitHub API, laravel-news |
| L13 support | bug fixes to ~Q3 2027, security fixes to ~Q1 2028. Requires PHP ^8.3 | laravel-news, `composer.json` |
| Cadence | One major per year (~Q1). Minor/patch releases about weekly (13.x minors are tagged about every week, on Tuesdays). 18 months of bug fixes, 2 years of security fixes | laravel.com/docs/13.x/releases |
| Next major | **Laravel 14 expected ~Q1 2027** (estimate; no official date). The `master` branch already requires `php: ^8.4` (its `Application::VERSION` still says 13.33.0 and branch-alias is stale) | laravel-news, GitHub raw `master/composer.json` |

Implication: port against the 13.x branch and pin a tag, for example v13.37.0. Plan a re-sync epic for L14 around Mar 2027.

## 2. Counting method (read this before you use the numbers)

- **src LOC** = `\n` count over all `.php` files in `src/Illuminate/<C>` (includes comments and docblocks; Laravel is docblock-heavy, so real code is about 50-60% of this). **Exact line count; "code size" meaning is an estimate.**
- **Test methods** = regex `function test\w*\s*(` across all `.php` under the mapped test dirs. The suite has **0 `#[Test]` attributes and 0 real `@test` annotations** (13 `@test` hits are email strings such as `test@test.com`), so this regex is complete. **Exact method count**, but small over-count from `function test*` helpers inside fixtures (estimate < 1%).
- **Executed test cases > methods**: 613 `#[DataProvider]` attributes; for example `SupportCollectionTest` has 408 methods and 372 data providers, and most of these run each case for both `Collection` and `LazyCollection`. Real PHPUnit case count is probably **~16-18k (estimate)**.
- **Test dir mapping**: `tests/<C>` = unit, `tests/Integration/<C>` = integration. Remapped by hand:
  - Collections <- `tests/Support/SupportArrTest`, `SupportCollectionTest`, `SupportLazyCollectionTest`, `SupportLazyCollectionIsLazyTest`
  - Macroable <- `tests/Support/SupportMacroableTest`. Conditionable <- `tests/Conditionable` + `SupportConditionableTest`. Reflection <- `SupportReflectorTest`, `SupportReflectsClosuresTest`
  - Foundation <- also `tests/Integration/Generators` (36 files, 111 methods; these test the `make:*` commands in `Foundation/Console`)
  - Database <- also `tests/Integration/Migration` (12 methods)
  - Contracts has no tests (interfaces only). Concurrency has only integration tests.
- **Internal deps** = `illuminate/*` keys in `src/Illuminate/<C>/composer.json` `require`. Foundation has **no composer.json** (it ships only in `laravel/framework`), so its deps come from code imports.

## 3. Per-component table (ordered by topological layer)

| L | Component | src LOC | src .php files | unit test files | unit methods | integ test files | integ methods | total methods | @DataProvider | Illuminate deps (composer require) | external deps (require) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 0 | Conditionable | 181 | 2 | 2 | 8 | 0 | 0 | 8 | 0 |  | - |
| 0 | Contracts | 5,996 | 156 | 0 | 0 | 0 | 0 | 0 | 0 |  | psr/container, psr/simple-cache |
| 0 | Macroable | 134 | 1 | 1 | 16 | 0 | 0 | 16 | 0 |  | - |
| 1 | Collections | 8,535 | 11 | 4 | 657 | 0 | 0 | 657 | 0 | Conditionable, Contracts, Macroable | - |
| 1 | JsonSchema | 1,441 | 13 | 11 | 110 | 0 | 0 | 110 | 2 | Contracts | - |
| 2 | Config | 305 | 1 | 1 | 33 | 0 | 0 | 33 | 0 | Collections, Contracts | - |
| 2 | Reflection | 441 | 3 | 2 | 24 | 0 | 0 | 24 | 0 | Collections, Contracts | - |
| 3 | Container | 2,898 | 24 | 11 | 209 | 2 | 2 | 211 | 0 | Contracts, Reflection | psr/container |
| 3 | Support | 21,757 | 117 | 41 | 971 | 11 | 81 | 1052 | 388 | Collections, Conditionable, Contracts, Macroable, Reflection | doctrine/inflector, ext-ctype, ext-filter, ext-mbstring, nesbot/carbon, voku/portable-ascii |
| 4 | Cache | 10,289 | 66 | 25 | 355 | 17 | 150 | 505 | 12 | Collections, Contracts, Macroable, Support | - |
| 4 | Cookie | 620 | 5 | 3 | 30 | 1 | 2 | 32 | 0 | Collections, Contracts, Macroable, Support | ext-hash, symfony/http-foundation, symfony/http-kernel |
| 4 | Database | 60,830 | 254 | 133 | 2803 | 142 | 900 | 3703 | 62 | Collections, Conditionable, Container, Contracts, Macroable, Support | brick/math, ext-pdo, laravel/serializable-closure |
| 4 | Encryption | 519 | 3 | 1 | 27 | 1 | 2 | 29 | 1 | Contracts, Support | ext-hash, ext-mbstring, ext-openssl |
| 4 | Filesystem | 3,755 | 12 | 4 | 175 | 5 | 27 | 202 | 2 | Collections, Conditionable, Contracts, Macroable, Support | symfony/finder |
| 4 | Hashing | 673 | 6 | 1 | 13 | 0 | 0 | 13 | 0 | Contracts, Support | - |
| 4 | Log | 2,195 | 12 | 1 | 10 | 5 | 103 | 113 | 1 | Conditionable, Contracts, Support | monolog/monolog, psr/log |
| 4 | Mail | 6,633 | 40 | 14 | 149 | 13 | 62 | 211 | 9 | Collections, Conditionable, Container, Contracts, Macroable, Support | league/commonmark, psr/log, symfony/mailer, tijsverkoyen/css-to-inline-styles |
| 4 | Pagination | 3,020 | 18 | 11 | 50 | 0 | 0 | 50 | 0 | Collections, Contracts, Support | ext-filter |
| 4 | Pipeline | 464 | 3 | 2 | 22 | 1 | 3 | 25 | 1 | Conditionable, Contracts, Macroable, Support | - |
| 4 | Process | 2,625 | 15 | 1 | 76 | 0 | 0 | 76 | 0 | Collections, Conditionable, Contracts, Macroable, Support | symfony/process |
| 4 | Redis | 3,251 | 16 | 10 | 158 | 1 | 1 | 159 | 0 | Collections, Contracts, Macroable, Support | - |
| 4 | Testing | 6,855 | 30 | 16 | 402 | 3 | 29 | 431 | 4 | Collections, Conditionable, Contracts, Macroable, Support | ext-mbstring |
| 5 | Bus | 3,666 | 19 | 6 | 75 | 0 | 0 | 75 | 5 | Collections, Conditionable, Contracts, Pipeline, Support | - |
| 5 | Session | 3,085 | 16 | 7 | 102 | 3 | 7 | 109 | 0 | Collections, Contracts, Filesystem, Support | ext-ctype, ext-session, symfony/finder, symfony/http-foundation |
| 5 | Translation | 1,853 | 11 | 3 | 61 | 1 | 9 | 70 | 3 | Collections, Contracts, Filesystem, Macroable, Reflection, Support | - |
| 6 | Events | 1,625 | 7 | 4 | 80 | 5 | 34 | 114 | 0 | Bus, Collections, Container, Contracts, Macroable, Reflection, Support | - |
| 6 | Http | 11,614 | 69 | 17 | 562 | 15 | 189 | 751 | 15 | Collections, Conditionable, Macroable, Session, Support | ext-filter, fruitcake/php-cors, guzzlehttp/guzzle, guzzlehttp/promises, guzzlehttp/psr7, guzzlehttp/uri-template, psr/http-message, symfony/http-foundation, symfony/http-kernel, symfony/mime |
| 6 | Validation | 13,636 | 82 | 39 | 644 | 6 | 26 | 670 | 22 | Collections, Conditionable, Container, Contracts, Macroable, Support, Translation | brick/math, egulias/email-validator, ext-filter, ext-mbstring, symfony/http-foundation, symfony/mime |
| 7 | Image | 1,402 | 21 | 4 | 227 | 1 | 64 | 291 | 0 | Conditionable, Container, Contracts, Filesystem, Http, Macroable, Support | - |
| 7 | Routing | 11,558 | 64 | 13 | 358 | 22 | 198 | 556 | 4 | Collections, Conditionable, Container, Contracts, Http, Macroable, Pipeline, Reflection, Session, Support | ext-filter, ext-hash, symfony/http-foundation, symfony/http-kernel, symfony/routing |
| 7 | View | 8,857 | 53 | 74 | 425 | 5 | 29 | 454 | 7 | Collections, Conditionable, Container, Contracts, Events, Filesystem, Macroable, Reflection, Support | ext-tokenizer |
| 8 | Console | 9,638 | 89 | 21 | 183 | 27 | 213 | 396 | 17 | Collections, Contracts, Macroable, Reflection, Support, View | ext-mbstring, laravel/prompts, nunomaduro/termwind, symfony/console, symfony/process |
| 9 | Concurrency | 389 | 6 | 0 | 0 | 2 | 17 | 17 | 2 | Console, Contracts, Process, Support | laravel/serializable-closure |
| 9 | Queue | 15,465 | 130 | 31 | 361 | 33 | 287 | 648 | 35 | Collections, Console, Container, Contracts, Database, Filesystem, Pipeline, Reflection, Support | laravel/serializable-closure, ramsey/uuid, symfony/process |
| 10 | Auth | 6,246 | 49 | 17 | 265 | 8 | 48 | 313 | 2 | Collections, Contracts, Http, Macroable, Queue, Support | ext-hash |
| 10 | Broadcasting | 3,441 | 26 | 9 | 109 | 3 | 56 | 165 | 4 | Bus, Collections, Container, Contracts, Queue, Reflection, Support | psr/log |
| 11 | Notifications | 2,786 | 26 | 9 | 76 | 5 | 27 | 103 | 0 | Broadcasting, Bus, Collections, Conditionable, Container, Contracts, Filesystem, Mail, Queue, Support | - |
| 12 | Foundation | 36,938 | 266 | 58 | 909 | 59 | 243 | 1152 | 15 | (no composer.json; imports ~all components) | - |
| | **TOTAL** | **275,616** | 1742 | 607 | 10735 | 397 | 2809 | **13544** | | | |

(The TOTAL row for "src .php files" etc. sums the components. Unit = 607 `*Test.php` files and 10,735 methods. Integration = 397 files and 2,809 methods. The polyfill-php84/85/86 packages are left out of the external column.)

### Big-component breakdown (LOC, exact)
- **Database 60,830**: Eloquent 26,641 · Query 10,344 · Schema 10,076 · Console 3,281 · Migrations 1,540 · Concerns 1,410 · Connectors 1,397 · Events 511 · Capsule 201 (+ the per-driver Connection classes at root). This is the biggest epic, so split it (Query/Grammar -> Schema -> Eloquent -> Migrations/Console).
- **Foundation 36,938**: Console 10,538 (62 `.stub` files in `Console/stubs`) · Testing 4,248 · Cloud 2,806 · Exceptions 2,669 (+ `resources/exceptions` renderer views) · Http 2,511 · Configuration 1,657 · Providers 1,354 · Bootstrap 875 · Bus 721.
- **Support 21,757**: includes 47 Facades and `Support/Testing/Fakes` (Bus/Event/Mail/Notification/Queue fakes; their tests are the 176 methods in `tests/Support/SupportTesting*FakeTest`).

## 4. Topological layering (from composer `require`)

The graph from composer `require` is acyclic. Layer = 1 + max(layer of deps).

| Layer | Components |
|---|---|
| 0 | Conditionable, Contracts, Macroable |
| 1 | Collections, JsonSchema |
| 2 | Config, Reflection |
| 3 | Container, Support |
| 4 | Cache, Cookie, Database, Encryption, Filesystem, Hashing, Log, Mail, Pagination, Pipeline, Process, Redis, Testing |
| 5 | Bus, Session, Translation |
| 6 | Events, Http, Validation |
| 7 | Image, Routing, View |
| 8 | Console |
| 9 | Concurrency, Queue |
| 10 | Auth, Broadcasting |
| 11 | Notifications |
| 12 | Foundation |

**Caveat: the composer graph shows the minimum. The code graph is cyclic.** The code has "soft" references (`use`/FQCN/docblock to `Illuminate\X`) that composer does not declare. Most are optional features (`suggest`), `instanceof` checks, or docblocks. Some are real runtime couplings that tests use:

| Component | composer `suggest` (illuminate) | code refs to components NOT in `require` | external `suggest` |
|---|---|---|---|
| Conditionable | - | Support | - |
| Contracts | - | Auth, Broadcasting, Bus, Database, Foundation, Http, Image, JsonSchema, Mail, Pagination, Process, Redis, Routing, Support, Translation, Validation | - |
| Macroable | - | Support | - |
| Collections | Http | Database, Http, Support | symfony/var-dumper |
| JsonSchema | - | - | - |
| Config | - | Support | - |
| Reflection | - | Support | - |
| Container | Auth, Cache, Config, Database, Filesystem, Log | Database, Log, Support | - |
| Support | Filesystem | Auth, Broadcasting, Bus, Cache, Concurrency, Config, Console, Container, Cookie, Database, Encryption, Events, Filesystem, Foundation, Hashing, Http, Image, Log, Mail, Notifications, Pagination, Pipeline, Process, Queue, Redis, Routing, Session, Testing, Translation, Validation, View | laravel/serializable-closure, league/commonmark, league/uri, ramsey/uuid, symfony/process, symfony/uid, symfony/var-dumper, vlucas/phpdotenv |
| Cache | Database, Filesystem, Redis | Console, Database, Filesystem, Redis | ext-apcu, ext-filter, ext-memcached, symfony/cache |
| Cookie | - | Http | - |
| Database | Console, Events, Filesystem, Http, Pagination | Broadcasting, Console, Events, Filesystem, Http, Pagination, Queue | ext-filter, fakerphp/faker, symfony/finder |
| Encryption | - | - | - |
| Filesystem | Http, Image | Container, Http, Image | ext-fileinfo, ext-ftp, ext-hash, league/flysystem, league/flysystem-aws-s3-v3, league/flysystem-ftp, league/flysystem-sftp-v3, psr/http-message, symfony/filesystem, symfony/mime |
| Hashing | - | - | - |
| Log | - | Container, Database, Queue | - |
| Mail | Http | Bus, Config, Http, Log, Notifications, Queue, Testing | aws/aws-sdk-php, resend/resend-php, symfony/http-client, symfony/mailgun-mailer, symfony/postmark-mailer |
| Pagination | - | Database, Http | - |
| Pipeline | Database | - | - |
| Process | - | - | - |
| Redis | - | - | ext-redis, predis/predis |
| Testing | Console, Database, Http | Console, Cookie, Database, Foundation, Http, Session, View | brianium/paratest, mockery/mockery, phpunit/phpunit |
| Bus | Queue | Container, Database, Foundation, Queue | - |
| Session | Console | Auth, Console, Database, Http, Routing | - |
| Translation | - | - | - |
| Events | - | Database, Queue | - |
| Http | Image | Container, Contracts, Database, Image, Pagination, Routing | ext-gd |
| Validation | Database | Database, Foundation, Http | ramsey/uuid |
| Image | - | - | ext-fileinfo, intervention/image |
| Routing | Console | Auth, Cache, Console, Database, Redis | php-http/discovery, symfony/psr-http-message-bridge |
| View | - | Database, Foundation, Http | - |
| Console | Bus, Container, Filesystem, Queue | Bus, Cache, Container, Filesystem, Log, Queue, Validation | dragonmantank/cron-expression, ext-pcntl, guzzlehttp/guzzle |
| Concurrency | - | - | spatie/fork |
| Queue | Redis | Bus, Cache, Events, Foundation, Log, Redis | aws/aws-sdk-php, ext-filter, ext-mbstring, ext-pcntl, ext-pdo, ext-posix, pda/pheanstalk |
| Auth | Console, Queue, Session | Cache, Console, Database, Notifications | - |
| Broadcasting | - | Cookie, Foundation, Http, Redis, Routing | ably/ably-php, ext-hash, pusher/pusher-php-server, symfony/http-client, symfony/mercure, web-token/jwt-library |
| Notifications | Database | Config, Console, Database | - |

Takeaways for sequencing:
- **Support refers to every component** (Facades, Fakes, ServiceProvider, helpers). Port Support core (Str, Arr-helpers, Fluent, Stringable, Carbon wrapper, MessageBag, Traits) early. Defer `Support/Facades/*` and `Support/Testing/Fakes/*` until each target component exists.
- **Contracts** refers to many components only through docblocks. Port Contracts per component as TS interfaces, not as one big block.
- **Database -> Events/Pagination/Console/Queue/Broadcasting** are suggest-level. Eloquent model events need Events, so in practice put Events (and Bus) **before** Eloquent, even though composer puts Database at L4 and Events at L6.
- **Testing (L4 by composer)** really needs Foundation, Http, View, Console, Session (TestResponse, assertions). Treat it as a late epic. Its 402 unit methods mostly test `TestResponse`.
- **Console** requires View (Termwind/Blade-based output components).
- **Queue** requires Database and Console. Console's scheduler needs Queue/Cache (suggest).

Suggested practical epic order (my adjustment of the layering; numbers are total methods, unit+integ):
1. Macroable 16, Conditionable 8, Contracts (0, interfaces), Collections 657, Reflection 24, Config 33, JsonSchema 110
2. Container 211, Support-core ~1,052 (minus facades/fakes)
3. Pipeline 25, Encryption 29, Hashing 13, Filesystem 202, Process 76, Log 113, Translation 70, Bus 75, Events 114
4. Database: Query/Schema grammars (unit, no DB), then Eloquent, then Migrations (3,703 total)
5. Pagination 50, Cache 505, Redis 159, Validation 670
6. Http 751, Cookie 32, Session 109, Routing 556 (the Hono layer)
7. View/Blade 454, Console 396, Mail 211
8. Queue 648, Concurrency 17, Broadcasting 165, Auth 313, Notifications 103, Image 291
9. Foundation 1,152 (incl. Generators), Testing 431, plus the Testbench equivalent

## 5. Totals

| Metric | Value | Exact/est |
|---|---|---|
| src PHP LOC (37 dirs; 36 components + Foundation) | 275,616 | exact (lines) |
| src non-PHP assets (excluding composer/README/LICENSE/.gitattributes/yml) | 88 `.stub` (Foundation 63, Routing 13, Database 5, Queue 3, Auth/Cache/Notifications/Session 1 each) + 3 css + 3 js (exception renderer) + 2 json | exact |
| tests PHP LOC | 296,465 | exact (lines) |
| `*Test.php` files | 1,004 (unit 607 / integration 397) | exact |
| test methods | **13,544** (unit **10,735** / integration **2,809**) | exact (regex) |
| `#[DataProvider]` uses | 613 | exact |
| executed cases including data sets | ~16-18k | estimate |
| Mockery usage | 226 files, ~2,034 `m::mock`/`Mockery::mock`/`->shouldReceive` hits | exact (grep) |
| Fixture dirs | 40 `Fixtures/` dirs; 51 `.blade.php` fixtures; json/png/svg/pdf/sqlite/sql/gz assets | exact |

Largest test suites (methods): Database 3,703 · Foundation 1,152 · Support 1,052 · Http 751 · Validation 670 · Collections 657 · Queue 648 · Routing 556 · Cache 505 · View 454 · Testing 431.

## 6. Which tests need real backends

| Need | Where | How the test selects/skips it |
|---|---|---|
| **SQLite (in-memory)**: default for everything | 49 unit files in `tests/Database` use `Capsule` with `':memory:'`. All `tests/Integration/Database` uses Testbench's `testing` connection (`phpunit.xml.dist` sets `DB_CONNECTION=testing` = sqlite `:memory:`) | always runs. Use `bun:sqlite` |
| **MySQL / MariaDB / Postgres / SQL Server** | `tests/Integration/Database/{MySql,MariaDb,Postgres,SqlServer,Sqlite}` subdirs (31+32+36+20+42 = 161 methods). Plus 73 `#[RequiresDatabase(...)]` uses on classes/methods across Integration/Database & Queue | Orchestra `#[RequiresDatabase('mysql')]` skips unless the default connection driver matches. CI (`.github/workflows/databases.yml`) runs **only `tests/Integration/Database`** once per engine with `DB_CONNECTION=mysql|mariadb|pgsql|sqlsrv`: MySQL 5.7/8.4/9.7, MariaDB 10.11/11.8/12.3, Postgres 10/14/18, MSSQL 2017/2019(+), and a separate sqlite-file job (`testbench package:create-sqlite-db` then `tests/Integration/Database/Sqlite`) |
| **Redis** (phpredis / predis, single + cluster) | 18 files use `InteractsWithRedis`: `tests/Redis/*`, `Integration/Cache/*Redis*`, `Integration/Queue/RedisQueueTest` etc., `Integration/Http/ThrottleRequestsWithRedisTest` | `REDIS_HOST`/`REDIS_PORT`/`REDIS_CLIENT`/`REDIS_CLUSTER_HOSTS_AND_PORTS`. **Auto-skips** if the ext is missing or 127.0.0.1:6379 is unreachable. CI `redis.yml` runs `tests/Redis`, `tests/Integration/Cache`, `tests/Integration/Queue` |
| **Queue drivers** | `tests/Integration/Queue` (287 methods) | `QUEUE_CONNECTION=sync|database|redis|beanstalkd` per CI job (`queues.yml`). Base `QueueTestCase` reads `queue.default` and tests branch/skip on driver |
| Memcached, DynamoDB | 7 files mention Memcached, 3 DynamoDB (Cache) | main `tests.yml` starts memcached 1.6, mysql 9.7, redis 7, amazon/dynamodb-local 2.0 as services for the full run. Tests skip if env/ext is missing |
| SQS, Pusher, Ably | 3 / 5 / 3 files | mocked SDK clients (no network) |
| OS / extension | 37 files `RequiresOperatingSystem`, 55 `RequiresPhpExtension`, 31 `markTestSkipped`, 5 use `pcntl_*` | PHP-specific; many of these map to N/A in Bun |

## 7. Structural observations for porting

1. **Orchestra Testbench is a hard prerequisite for every integration test.** `orchestra/testbench-core ^11.6` is a require-dev. 272 test files import `Orchestra\Testbench\*` directly (267 of them in Integration, plus 27 unit files in `tests/Foundation`, `tests/Testing`, `tests/Console`, `tests/Filesystem`, `tests/Database`). Nearly every other Integration file extends a local base (`DatabaseTestCase`, `QueueTestCase`, `Generators/TestCase`) that extends `Orchestra\Testbench\TestCase`. APIs in use: `TestCase` (226), attributes `#[WithMigration]` (37), `#[WithConfig]` (33), `#[RequiresDatabase]` (24), `#[WithEnv]`, `#[RequiresEnv]`, `Factories\UserFactory` (19), `Concerns\InteractsWithPublishedFiles` (8), `CreatesApplication`, `ApplicationTestingHooks`, and its skeleton app (`Testbench\Foundation\Application`, default config, `users` migration). **Xaravel needs its own "testbench" (a skeleton app + attribute hooks) before any of the 2,809 integration methods can run.** So 10,735 unit methods can come first, and integration tests unlock only after Foundation + Testbench exist. Alternative: port each component's integration tests at the end of the Foundation epic.
2. **The suite is mock-heavy and PHP-idiom-heavy.** Mockery is in 226 files (~2k mock/expectation calls), so you need a Mockery-compatible TS shim (`shouldReceive()->once()->with()->andReturn()`) or tests rewritten to `bun:test` `mock`/`spyOn`. The global `AfterEachTestSubscriber` resets Mockery, Carbon `setTestNow`, `Date`, `Str` factories, `Sleep::fake`, `Once`, `Lottery` after every test. Reproduce it as a `bun test --preload` `afterEach`. 613 DataProviders map to `test.each`.
3. **Database tests are mostly backend-free.** The 2,803 unit DB methods are mostly grammar/SQL-string assertions with mocked connections, plus 49 files on SQLite `:memory:` via Capsule. Only 161 integration methods are engine-specific. Driver choice: one env var (`DB_CONNECTION`) switches Testbench's default connection, `#[RequiresDatabase]` gates tests per engine, and CI runs `tests/Integration/Database` once per engine. So: SQLite (`bun:sqlite`) first, then pg/mysql via `Bun.sql` later. Port all four Grammars, because grammar unit tests cover mysql/pgsql/sqlite/sqlsrv without servers.
4. **Some external dependencies need a TS replacement before an epic starts.** Support needs nesbot/carbon (pervasive, with `Carbon::setTestNow` in tests) and doctrine/inflector (pluralizer). Http/Routing/Cookie/Session are built on **symfony/http-foundation + http-kernel** (Request/Response/Cookie/File classes), so this is where Hono's `Request`/`Response` must be adapted, and test assertions on Symfony objects need equivalents. Routing uses symfony/routing (route compiler/regex). Console uses symfony/console + laravel/prompts + termwind. Mail uses symfony/mailer + commonmark + css-inliner. Log uses monolog. Http client uses Guzzle. Filesystem uses league/flysystem (suggest). Queue/Concurrency/Database need laravel/serializable-closure, and **JS cannot serialize closures**, so queued closures and `Concurrency` process driver need a design decision. Validation needs egulias/email-validator and brick/math.
5. **Generated code and runtime PHP introspection.** Blade (View, 454 tests, 74 unit test files, most are `BladeCompiler*Test` string-to-PHP assertions) compiles templates **to PHP source**. Xaravel must pick a JS-emitting compiler, and those compiler tests change from "exact PHP output" to behavior tests, so plan a test-adaptation policy. 88 `.stub` files (make:* generators: 111 Generators methods assert on generated PHP class files) and Facades (`__callStatic`), Macroable (`__call`), Eloquent attribute magic (`__get/__set`, `ArrayAccess`), `Reflection` (closure param types, used by the Container autowiring with 209 tests) all rely on PHP runtime reflection. In TS, Container autowiring needs decorators/explicit tokens because type info is erased. This choice affects Container, Events (listener type-hint discovery), Routing (implicit model binding) and Eloquent casts.
