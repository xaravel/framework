# The Oracle image

The Oracle is real PHP Laravel at the Baseline Pin, in a container. Later Stories draw expected values from it (FR-6, OQ-9). It is built from `conformance/oracle/Dockerfile` and the committed locks in `conformance/oracle/locks/`. The tool is `tools/oracle/oracle.ts`. Contributors need neither Docker nor PHP: only `oracle:build`, `oracle:verify-image`, the Inventory's image mode (`bun run inventory`, through `runInImage`; see [inventory.md](inventory.md)), request extraction's image mode (`bun run oracle:extract`, through `runInImage`; see [Requests](#requests-bun-run-oracleextract)), fixture generation's image mode (`bun run oracle:fixtures`, through `runInImage`; see [Fixtures](#fixtures-bun-run-oraclefixtures)), per-Story generation's image mode (`bun run oracle:story generate`, through `runInImage`; see [Per-Story requests](#per-story-requests-bun-run-oraclestory)), the API-surface export's image mode (`bun run oracle:api-surface`, through `runInImage`; see [API surface](#api-surface-bun-run-oracleapi-surface)) and the baseline run's image mode (`bun run baseline run`, through `runInImageNetworked`; see [baseline.md](baseline.md)) call `docker`, and `bun test` never does. `runInImage` runs with `--network none`, read-only mounts and fixed resource limits: `--memory 4g --memory-swap 4g` (no swap beyond the memory cap), `--pids-limit 512` and `--cpus 2` (`IMAGE_RUN_LIMITS`). It runs Story-supplied PHP (per-Story Oracle requests) in a CI job that holds `ORACLE_SIGNING_KEY` and the App key, so the limits stop a request from exhausting the runner's memory, processes or CPU; they are a ceiling against abuse, not tuning, and a run that exits 137 (a SIGKILL) adds to its error that the memory limit is a possible cause. `runInImageNetworked` runs with `--network host` (to reach the CI's Postgres and Redis services), `--env` variables, read-only tool mounts and one read-write output mount.

## What the image holds

- PHP 8.5.11: `php:8.5.11-cli-trixie`, pinned by digest, plus the `gmp` extension (and `ftp` if the base lacks it), which the locks need. For the baseline run ([baseline.md](baseline.md)) it also has Upstream's Linux CI extension set (`conformance/upstream/framework/.github/workflows/tests.yml`), so no Upstream test records a skip the image caused:
  - `pdo_mysql`, `pdo_pgsql`, `intl`, `zip`, `pcntl` and `gd` (with freetype, jpeg and webp), built with `docker-php-ext-install`;
  - the PECL extensions igbinary 3.2.17RC1, msgpack 3.0.1, redis 6.3.0, memcached 3.4.0 and imagick 3.8.1. Each source is downloaded from `https://pecl.php.net/get/<name>-<version>.tgz` and checked against its pinned SHA-256 before it is built. igbinary and msgpack are built first, and redis is configured as Upstream's CI configures it: `--enable-redis-igbinary --enable-redis-msgpack --enable-redis-lzf --with-liblzf --enable-redis-zstd --with-libzstd --enable-redis-lz4 --with-liblz4`.

  The build fails unless `php -m` lists every extension.
- Composer 2.10.3, copied from the digest-pinned `composer:2.10.3` image.
- A non-root user, `oracle` (uid and gid 1001, the GitHub runner's user). It is the image's `USER` and owns `/oracle/upstream`, which is writable by it as a CI checkout is (the snapshot is copied in read-only), so Upstream's tests never run as root (the baseline run, [baseline.md](baseline.md)). Root is used only for the build steps.
- The Upstream snapshot at `/oracle/upstream/{framework,ai,mcp,boost}/`, copied unmodified from `conformance/upstream/`. Each directory has its dev dependencies installed into its own `vendor/` from its own lock: PHPUnit, Mockery and Orchestra Testbench Core for `laravel/framework`, and Pest, PHPUnit, Mockery and Orchestra Testbench for `laravel/ai`, `laravel/mcp` and `laravel/boost`.

There is one lock per snapshot because Composer installs dev dependencies only for a root package, and Pest is only in the ai, mcp and boost dev dependencies. The image build runs only `composer install`, never `composer update`, in two passes per snapshot:

1. The download pass runs `composer install --no-progress --prefer-dist --no-plugins --no-scripts`. It only downloads and extracts the locked packages, and no plugin or script code runs. It is the only step that can read the GitHub token ([Building locally](#building-locally)).
2. The token-less pass has no secret mount and no `COMPOSER_AUTH`. It runs `composer install --no-progress --prefer-dist` over the populated `vendor/`. Nothing is downloaded. The installed plugins activate (`pestphp/pest-plugin` writes `vendor/pest-plugins.json` in ai, mcp and boost), the autoloader is regenerated and the root `post-autoload-dump` scripts run, as in a single-pass install.

`Dockerfile.dockerignore` admits only `conformance/upstream/` and `conformance/oracle/locks/` into the build context.

## The tag

The image tag is `<framework Pin>-<imagehash>`, for example `v13.37.0-4f2b5b47300d`. `<imagehash>` is the first 12 hex characters of the SHA-256 of the four locks in pin order (framework, ai, mcp, boost), then `conformance/oracle/Dockerfile`, then `conformance/oracle/Dockerfile.dockerignore`, then the root-version list. Each file is hashed as `<repository-relative path>\0<byte length>\0<bytes>`, and the list as `build-arg XARAVEL_ROOT_VERSIONS\0<byte length>\0<value>`. So a change to a lock, the Dockerfile, the dockerignore or any snapshot's Pin tag gets a new tag. The Upstream snapshot itself is not hashed: `upstream:check` pins its contents to the Pin, and the Pin's tags reach the tag through the root-version list. `bun run oracle:tag` prints it, offline. CI publishes the image as `ghcr.io/<owner>/xaravel-oracle:<tag>`.

## The root-version list

The image installs each snapshot with `COMPOSER_ROOT_VERSION` set to its Pin tag without the `v`, as when its lock was resolved. The Dockerfile takes these versions from the build argument `XARAVEL_ROOT_VERSIONS`, declared as `ARG XARAVEL_ROOT_VERSIONS` with no default and read by the loop `for pair in $XARAVEL_ROOT_VERSIONS;`. The build fails when the argument is unset or empty. `oracle:build` derives the value from `conformance/baseline-pin`: `<name>:<tag without v>` for each snapshot, in pin order, space-separated (at the current Pin, `framework:13.37.0 ai:1.2.3 mcp:1.0.2 boost:2.10.3`). It passes the value to both builds as `--build-arg XARAVEL_ROOT_VERSIONS=<value>`. A Pin move therefore needs no Dockerfile edit. `oracle:check` prints the value, and fails on a literal `<name>:<version>` list in the loop.

## Commands

| Command | What it does |
| --- | --- |
| `bun run oracle:check` | Checks each lock against its snapshot, offline. The check fails if a lock is missing, if its `content-hash` is not Composer's hash of the snapshot's `composer.json`, or if it was not resolved for PHP 8.5.11. It also fails if another Upstream package in the lock is not at its own Pin tag and commit, or if a test tool is missing. It also checks the Dockerfile statically: both bases pinned by digest, no `composer update`, `ARG XARAVEL_ROOT_VERSIONS` with no default, the install loop `for pair in $XARAVEL_ROOT_VERSIONS;` (never a literal list), and the two install passes. A `RUN` that mounts any secret or mentions `COMPOSER_AUTH` bears the token, so every `composer` command in it (not only `composer install`) must have `--no-plugins` and `--no-scripts`. A `RUN` that bears no token must run `composer install` without either flag. It prints the build argument `oracle:build` passes and, on success, the tag. |
| `bun run oracle:tag` | Prints the image tag, offline. |
| `bun run oracle:lock` | Regenerates the four locks. Needs PHP, Composer and the network. |
| `bun run oracle:verify-image <image>` | Checks a built image. Each `/oracle/upstream/<name>/vendor/composer/installed.json` must hold exactly its lock's names, versions and references. Each `composer.json` must equal the snapshot's. Each snapshot whose lock holds `pestphp/pest-plugin` must hold `vendor/pest-plugins.json`, so a build where plugins never ran fails. `php --version` must report 8.5.11. Prints the sorted package set, or every difference. |
| `bun run oracle:build <image>` | Runs `oracle:check`, builds the image tagged `<image>`, then builds it again with `--no-cache`, both with `--build-arg XARAVEL_ROOT_VERSIONS=<the Pin's list>`. It verifies both builds and fails with the diff if their package sets differ. |

## Regenerating the locks

Regenerate the locks after an Upstream tag moves in `conformance/baseline-pin` (`oracle:check` then reports a content-hash or Pin mismatch), or to take newer dependency releases:

1. `bun run upstream:sync` and `bun run upstream:check`.
2. If a tag moved, nothing in `conformance/oracle/Dockerfile` changes: `oracle:build` derives the root-version list from the Pin ([The root-version list](#the-root-version-list)).
3. `bun run oracle:lock`. For each snapshot it copies `composer.json` into a temp directory. It sets the platform PHP to 8.5.11 in a temp `COMPOSER_HOME`, so `composer.json` stays byte-identical and the lock's `content-hash` stays valid. Then it runs `composer update --no-install --no-scripts --no-plugins --ignore-platform-req=ext-*`. `COMPOSER_ROOT_VERSION` is the snapshot's own tag without the `v`, and `--with <repo>:<tag>` is passed for each other Upstream package. Extension requirements are checked when the image installs. `--composer <bin>` picks another Composer binary. When it finishes, it runs the check and prints the new tag.
4. `bun run oracle:check`, `bun test`, then open a PR. The locks are a Protected Path. The PR's `oracle / build` job builds the image twice and verifies it.

## Building locally

With Docker (BuildKit) installed and the snapshot synced:

```sh
bun run oracle:build "xaravel-oracle:$(bun run --silent oracle:tag)"
```

A bare `docker build` of the Dockerfile fails: it needs `--build-arg XARAVEL_ROOT_VERSIONS=…`, which `oracle:build` passes.

If `GITHUB_TOKEN` is set, `oracle:build` passes it to the build as the BuildKit secret `github_token`, which raises GitHub's download rate limit for Composer. The token is readable only in the download pass, which runs `composer install --no-plugins --no-scripts` and so no package code. The pass that runs Composer plugins and scripts has no secret mount and no `COMPOSER_AUTH`. The token is never in a build argument, an `ENV` or a layer.

## Publishing (`.github/workflows/oracle.yml`)

- `build` runs on a pull request to `main` that touches `conformance/baseline-pin`, `conformance/oracle/**`, `conformance/api-surface/**`, `conformance/component-map`, `tools/component-map/**`, `tools/inventory/**`, `tools/scaffold/packages.jsonl`, `tools/scaffold/table.ts`, `tools/oracle/**`, `tools/upstream/**` or the workflow itself. It syncs and checks the snapshot, then runs `oracle:check` and `oracle:build`, then, in the image it built, `bun run oracle:api-surface --check` ([API surface](#api-surface-bun-run-oracleapi-surface)) and `bun run oracle:extract --check` ([Requests](#requests-bun-run-oracleextract)); drift in either fails it. It has no write scope and never logs in or pushes.
- `oracle` runs on a push to `main` that touches the same paths except the API-surface, component-map, scaffold and inventory ones, or on a manual `workflow_dispatch` from `main`. It syncs, checks and builds as `build` does but runs neither drift check, then logs in to GHCR with the job's token and pushes `ghcr.io/<owner>/xaravel-oracle:<tag>`. It is the only job that holds `packages: write` or pushes; `story` logs in to GHCR only to pull, with a read-only token. The workflow permissions check (`bun run workflows:check`) allows a write scope only in `oracle.yml#oracle`. After the push it runs the fixture batch in the pushed image (`bun run oracle:fixtures --image <ref>`, [Fixtures](#fixtures-bun-run-oraclefixtures)). It runs in the GitHub environment `oracle`, the only place the secret `ORACLE_SIGNING_KEY` exists (the `story` job, [The workflow](#the-workflow-oracleymlstory), is the only other job in that environment and so also reads the key), and, when the batch succeeds, uploads `conformance/fixtures/` as the artifact `oracle-fixtures`. Any `conformance/escalations/ESC-bot-*.md` it wrote is uploaded as the artifact `oracle-escalation`, even when the batch fails.
- `story` runs on a Story PR that touches `conformance/oracle-requests/**`, under `pull_request_target` ([Per-Story requests](#per-story-requests-bun-run-oraclestory)).
- `determinism` runs nightly (`schedule`). It syncs and checks the snapshot, builds and verifies the image and checks the API surface and the Oracle requests as `build` does, then runs `bun run oracle:fixtures --determinism` against the image `xaravel-oracle:<oracle tag>` that `oracle:build` built. It holds no write scope and no secret, and writes no fixtures. On a difference it fails and uploads the `ESC-bot-<n>.md` it wrote as the artifact `oracle-determinism`.

## Requests (`bun run oracle:extract`)

Differential Tests take their expected values from the Oracle (FR-6). What the Oracle evaluates is a set of requests, extracted mechanically from the Upstream snapshot (AD-15, `decisions/ESC-3.1-1.md`), never written by hand. They are committed in `conformance/oracle/requests/<component>.jsonl`, a Protected Path, so contributors need neither PHP nor Docker: Stories 3.2 and later read the committed files.

### Command and modes

| Command | What it does |
| --- | --- |
| `bun run oracle:extract` | Runs `tools/inventory/lister.php` (the Test IDs and their dataset rows) and `tools/oracle/extract/tokens.php` (PHP's own tokenizer over each Differential test file) in the Oracle image `xaravel-oracle:<oracle tag>`, through `runInImage`, both mounted read-only. `--image <ref>` picks another image. It then reads every Differential Test ID × dataset through its family module and writes `conformance/oracle/requests/<component>.jsonl`, deleting any other `.jsonl` there. It prints the requests per Component and per family. It fails, naming the file, when a listed Differential file (other than the test-less `AbstractBladeTestCase.php`) is missing from the snapshot or has no listed tests, or when a `tests/View/Blade/*Test.php` file is not in the Blade list. |
| `bun run oracle:extract --local <dir> [--php <bin>]` | The same without Docker: the lister runs against a locked install of the framework snapshot in `<dir>` (every test and source file must equal the snapshot's, as for `bun run inventory --local`), and tokens.php reads the snapshot itself, both with the local PHP 8.5.11 or `--php <bin>`. |
| `bun run oracle:extract --check …` | Builds the files in memory and compares them byte for byte with the committed ones. It writes nothing. Each drifted file is one `oracle requests drift: <file> …` line on stderr (it differs, with the first differing line; it is missing; or it is committed but not generated), and the command exits 1. |

Two runs on the same snapshot give identical bytes. Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error. Regenerate after a Pin bump, after `bun run inventory`, and whenever a family module changes; the PR is Maintainer-reviewed like every Protected Path.

### Request format

One JSON line per request, keys exactly in this order, validated by `conformance/oracle/schema.json` (JSON Schema 2020-12) and `tools/oracle/request.ts`:

```json
{"id":"<Test ID or XT-<component>-<n>>","kind":"<kind>","input":{…},"sha256":"<64 lowercase hex>"}
```

- `id` is a PHPUnit Test ID (`<FQCN>::<method>[#<dataset>]`), a Pest Test ID or an Xaravel Test ID. A Test ID can have several requests (one per segment, grammar or template); Story 3.2 keys fixtures by `sha256`.
- `sha256` is the SHA-256 of the UTF-8 canonical JSON of `{id, kind, input}`: object keys sorted by UTF-16 code unit at every depth (integer-like keys too), no whitespace, `/` and non-ASCII unescaped, strings escaped as JSON.stringify does. The serializer writes keys and strings itself, never through a JS object. The line itself keeps each input object's PHP key order.
- Files: one per Component (from the Inventory's component map), lines sorted by `id` then `sha256` in UTF-16 order, identical requests once, LF, trailing newline. Two different lines with one `sha256` fail the run. A reader (`parseRequests`) rejects any line that is not byte-identical to its rendering: compact, `/` unescaped, keys in order, no CR.

PHP source strings (`setup`, `exprs`, `bindings`, `now`) are Upstream's verbatim token text, whitespace and comments kept, trimmed at the ends. Class names (before `::`, after `new`, `instanceof`, `extends`, `implements`, in closure type hints and in `catch` clauses) are resolved to fully qualified `\Name`s against the file's namespace and `use` imports, as PHP's compiler resolves them, and so are names imported with `use function` or `use const`. Nothing else is rewritten.

### Evaluation contract per kind (Story 3.2)

| `kind` | `input`, in key order | The Oracle |
| --- | --- | --- |
| `php-expr` | `bindings` (parameter name → PHP literal source of the dataset value, or of a literal default the row omits), `setup`, `exprs` | Instantiates the Test ID's Upstream class and runs its `setUp()`. In a closure bound to that instance it assigns each binding to its variable, runs `setup` in order, then evaluates `exprs` in order, recording each value or the exception class and message. Then it runs `tearDown()`. |
| `sql-grammar` | `grammar` (`base`, `sqlite`, `pgsql`, `mysql`, `mariadb`, `sqlsrv`), `setup`, `exprs` | As `php-expr`, with no bindings. `grammar` records which grammar the setup's builder uses: the `$this->get<X>Builder[WithProcessor]()` helper (`getBuilder` is `base`) of DatabaseQueryBuilderTest, or the schema grammar test file's own. |
| `blade-render` | `template`, `data` | Renders `\Illuminate\Support\Facades\Blade::render($template, $data)` in an Orchestra Testbench application and records the HTML, or the exception class and message. This gives DIV-5's rendered-HTML assertions an expected value even where Upstream asserts compiled PHP. |
| `validation-message` | `lines`, `data`, `rules`, `messages`, `attributes`, `format` (string or null), `exprs` | Bound to the Test ID's instance between `setUp()` and `tearDown()`: `$trans = $this->getIlluminateArrayTranslator(); $trans->addLines($lines, 'en'); $v = new \Illuminate\Validation\Validator($trans, $data, $rules, $messages, $attributes);`, then `$v->messages()->setFormat($format)` when `format` is not null, then evaluates `exprs` (which use `$v`) in order. |
| `date-format` | `now` (string or null), `timezone`, `setup`, `exprs` | As `php-expr`, with no bindings, under `date.timezone` = `timezone` (phpunit.xml.dist's). `now` is the PHP source of the `setTestNow(…)` argument in the class's `setUp()`, which the run applies by running `setUp()`. A `setUp()` the extractor cannot read, or a phpunit.xml.dist without `date.timezone`, fails the run. |

An empty PHP array in an object-valued field (`data`, `lines`, `rules`, `messages`, `attributes`) is `{}`.

### The Differential set

The set is closed: the `files` list of each family module under `tools/oracle/extract/`. A Test ID × dataset from these files is Differential exactly when its module captures at least one input. Every other one stays an ordinary Ported Test, and a dataset the batch misses goes through Story 3.4's per-Story requests.

| Family (module) | `kind` | Files (under `framework/tests/`) |
| --- | --- | --- |
| Str (`str.ts`) | `php-expr` | `Support/SupportStrTest.php`, `Support/SupportStringableTest.php` |
| SQL grammars (`sql.ts`) | `sql-grammar` | `Database/DatabaseQueryBuilderTest.php` and `Database/Database{SQLite,MySql,MariaDb,Postgres,SqlServer}SchemaGrammarTest.php` |
| Blade (`blade.ts`) | `blade-render` | every `View/Blade/*.php` (listed by name), `Integration/View/BladeTest.php` |
| Validation messages (`validation.ts`) | `validation-message` | `Validation/ValidationValidatorTest.php` |
| Date formatting (`date.ts`) | `date-format` | `Support/SupportCarbonTest.php` |

### Readability rules

A body that cannot be read into its kind's input gives no request, never a guess. `tools/oracle/extract/php.ts` reads bodies statically from PHP's tokens:

- **Statements.** The body must be top-level expression statements. An `if`, `foreach`, `for`, `while`, `switch`, `try`, `return`, `throw`, `echo`, `unset`, a declaration or a label makes it unreadable.
- **Assertions.** A statement `$this->assert…(…)`, `static::assert…(…)` or `self::assert…(…)` is an assertion. Its actual argument (the value under test) comes from a table of PHPUnit assertions (`assertSame` 1, `assertTrue` 0, `assertCount` 1, …). An unknown assertion, a call chained on one, or an `assert…`/`expect…` call anywhere else makes the body unreadable. So does an assertion whose arguments look reversed: its actual argument is only a literal or a bare bindings variable while its expected (first) argument is neither, as in `assertSame(Str::isUuid($uuid), $passes)`.
- **Segments.** Every assertion is kept. Consecutive assertions form one segment, whose `exprs` are their actual arguments. Its `setup` replays everything before it, with earlier assertions reduced to their actual argument as an expression statement (`<actual>;`), so side effects happen as in Upstream. A body with no setup between its assertions is one request with `setup` the statements before them.
- **php-expr, sql-grammar and date-format bodies** are unreadable with:
  - a named argument, a magic constant (`__DIR__`, …), a variable variable, an anonymous class, `eval` or `include`;
  - Mockery (`\Mockery`, `shouldReceive`, `expects`, `allows`, …);
  - `self::`, `static::` or `parent::` outside an assertion head;
  - `$this->x` that the class does not declare as a property or method (outside `function` closure bodies);
  - a variable used before the body defines it. Only bindings, `$this`, superglobals and earlier top-level assignments count.
- **Dataset rows** come from lister.php's `export()`. A row is bound positionally or by parameter name. A row holding an object, enum case, closure, `hex(…)`, `resource(…)`, `*RECURSION*` or a `{root}` rewrite gives no request. So does a variadic parameter. `sql-grammar` and `date-format` have no bindings, so a body that uses a parameter is unreadable.
- **SQL grammar.** In DatabaseQueryBuilderTest, a segment takes the grammar of the builder helpers its own statements call. If it calls none, it takes the previous segment's; none at all gives no request. Two different helpers, or a builder built another way (`$this->getMockQueryBuilder()`, `new …Builder(`, `new …Grammar(`), give no request for that segment and stop later segments from inheriting a grammar.
- **Blade.** The body may hold only known assertions and `$var = <literal>;` assignments. Each `->compileString(<template>)` (with `data` `{}`) and `Blade::render(<template>[, <data>])` gives one request per distinct template and data. The template and data are literals, or variables assigned literals. A parameter, an interpolated string or a computed value gives no request for the body. A test class that declares its own `setUp()` (beyond AbstractBladeTestCase's) configures the compiler, so its templates give no request.
- **Validation.** The body must be, in order: `$trans = $this->getIlluminateArrayTranslator();`, any `$trans->addLines(<literal>, 'en');`, then one `$v = new Validator($trans, <data>[, <rules>[, <messages>[, <attributes>]]]);`. After that it may have at most one `$v->messages()->setFormat('<literal>');` before the first message assertion, any `$v->passes();` or `$v->fails();` before it (a `passes()` or `fails()` after it, bare or in an assertion, replaces the formatted MessageBag and gives no request), and known assertions. `exprs` are the actual arguments of the assertions on `$v->messages()` or `$v->errors()`, and use only `$v` and `$trans`. These give no request: a method with none of those assertions, another locale, a non-literal array, a second translator or validator, or any other statement.
- **Literals.** These decode as PHP evaluates them:
  - single- and double-quoted strings without interpolation;
  - heredoc and nowdoc without interpolation, with the closing indentation removed;
  - `.` concatenation of strings;
  - integers (decimal, hex, octal, binary);
  - non-integral floats (an integral float would read back as an int);
  - `true`, `false` and `null`;
  - arrays, as a JSON list when the keys are 0..n-1, or as an object when every key is a string. Other integer keys are unreadable.

  A string with a raw non-UTF-8 byte is unreadable.

### The drift check in CI

`oracle.yml#build` (on a PR touching the Oracle's inputs) and `oracle.yml#determinism` (nightly) run `bun run oracle:extract --check` in the image they just built. A committed request file that differs from the extracted requests, is missing or is not generated fails the job.

## Fixtures (`bun run oracle:fixtures`)

The Oracle evaluates each committed request (`conformance/oracle/requests/*.jsonl`) and signs its output. Differential Tests read the signed fixtures; CI verifies their signatures (Story 3.3). Fixtures are protected by signature, not by path: `conformance/fixtures/` is not a Protected Path and has no CODEOWNERS owner, while the verification key `conformance/oracle/oracle.pub` and the non-determinism listing are Protected (by `/conformance/`).

### Command and modes

| Command | What it does |
| --- | --- |
| `bun run oracle:fixtures` | Runs `tools/oracle/evaluate.php` twice over every committed request in the Oracle image `xaravel-oracle:<oracle tag>`, through `runInImage` (`--image <ref>` picks another), with the script and the request directory mounted read-only. It compares the two passes per request, signs each output with the key in env `ORACLE_SIGNING_KEY`, and writes `conformance/fixtures/<component>/<sha256>.json` (`--out <dir>` writes under `<dir>` instead). It replaces the `*.json` files of each Component it writes, deleting stray ones (never the fixture of an accepted [per-Story request](#per-story-requests-bun-run-oraclestory)), and never touches `conformance/fixtures/generators/` (generator reference files are never Oracle-generated). It prints the fixtures per Component. |
| `bun run oracle:fixtures --local <dir> [--php <bin>]` | The same without Docker: evaluate.php runs with the local PHP 8.5.11 (or `--php <bin>`) against a locked install of the framework snapshot in `<dir>`, whose test and source files must equal the snapshot's (as for `bun run inventory --local`). The framework directory in any output string is `{root}`, so a local run and an image run give the same bytes. |
| `bun run oracle:fixtures --determinism …` | The same two passes and comparison, without a key. It writes no fixtures. |
| `bun run oracle:fixtures fingerprint` | Prints the fingerprint of `conformance/oracle/oracle.pub`: the lowercase hex SHA-256 of its SPKI DER. |
| `bun run oracle:verify-fixtures` | Verifies every committed fixture against `conformance/oracle/oracle.pub` and its committed request, naming each bad file; CI's `check` job runs it ([Verification in CI](#verification-in-ci-bun-run-oracleverify-fixtures)). |

Exit codes: 0 pass, 1 any failure (fail closed), 2 usage error. A run fails, writing nothing, when `ORACLE_SIGNING_KEY` is unset or not an Ed25519 PKCS#8 PEM, when `conformance/oracle/oracle.pub` is missing, or when the key's public half is not `oracle.pub` (`signing key does not match conformance/oracle/oracle.pub`). The key is checked before anything is evaluated.

### Evaluation

`php tools/oracle/evaluate.php <framework-dir> <php-version> <requests-file>...` refuses any PHP other than the given version. It applies phpunit.xml.dist's `<php>` entries and loads the autoloader as `tools/inventory/lister.php` does, and initialises PHPUnit's configuration `Registry` from phpunit.xml.dist as `phpunit` does (Testbench's `tearDown()` reads it). Each request runs in its own `pcntl_fork` child, so no static state (macros, facades, test clocks) leaks between requests; a child that has not answered after 60 seconds is killed. Each kind follows [Evaluation contract per kind](#evaluation-contract-per-kind-story-32): `setUpBeforeClass()` and `setUp()` run, then `bindings`, `setup` and `exprs` run with `eval` in the Test ID's namespace, inside a closure bound to the test instance, then `tearDown()` and `tearDownAfterClass()`. `blade-render` renders in the Test ID's class when it is a Testbench TestCase, otherwise in a bare Testbench TestCase.

It prints one line per request, in input order: `{"sha256":…,"output":{"error":…,"results":[…]}}`.

- `error` is `null`, or `{"stage","class","message"}` when a stage fails: `bindings`, `setUp`, `setup`, `tearDown`, `fatal` (a PHP fatal error; `class` is null) or `timeout`. A failure before `exprs` leaves `results` empty; a `tearDown` failure keeps them.
- Each result is `{"value":<encoded>}`, or `{"throws":{"class","message"}}` when the expression throws; later expressions still run.

Values are encoded losslessly and in a fixed way:

| PHP value | Encoding |
| --- | --- |
| `null`, `true`, `false` | themselves |
| string | a JSON string; a string that is not valid UTF-8 is `{"bytes":<base64>}` |
| int | `{"int":"<decimal>"}` |
| float | `{"float":"<var_export>"}` (`1.0`, `0.1`, `-0.0`, `INF`, `NAN`) |
| array | `{"array":[[<key>,<value>],…]}` in PHP order; a key is an encoded int or a string |
| enum case | `{"enum":"<Class>::<Case>"}` |
| Mockery mock | `{"mock":"<mocked class>"}` (its non-Mockery parent class, else its first non-Mockery interface by name); its internals are Mockery's, not Laravel's |
| other object | `{"object":"<Class>","properties":[[<name>,<scope>,<value>],…]}` from the `(array)` cast, in its order; scope is `""` (public), `"*"` (protected) or the declaring class (private); no magic method runs |
| object already being encoded | `{"recursion":"<Class>"}` |
| resource | `{"resource":"<type>"}` |

Every string, key and message has the framework directory replaced by `{root}`.

### Fixture format and signature

A fixture is one compact line and LF, keys in this order:

```json
{"sha256":"<request sha256>","output":<output, canonical JSON>,"signature":"<base64>"}
```

`output` is written in the canonical JSON of `tools/oracle/request.ts` (`canonicalJson`: keys sorted by UTF-16 code unit, no whitespace). `signature` is the Ed25519 signature of the UTF-8 bytes of `xaravel-oracle-fixture-v1\n` followed by `canonicalJson({output, sha256})`. The domain prefix keeps a fixture signature from being valid for any other signed object. Ed25519 is deterministic, so two runs give identical files. `fixtureMessage` and `verifyFixture` in `tools/oracle/fixtures.ts` build and check this.

Signing happens in Bun (`node:crypto`), never in the PHP container. The private key exists only as the secret `ORACLE_SIGNING_KEY` of the GitHub environment `oracle` ([identities.md](identities.md)), is readable only by the two jobs that run in that environment, `oracle` (the batch) and `story` (per-Story requests, which checks out only the PR's base commit with `persist-credentials: false` and never runs PR code), is read only from that environment variable, and is never written to disk or committed. The verification key is `conformance/oracle/oracle.pub` (SPKI PEM).

Verification key fingerprint (SHA-256 of the SPKI DER): `f5c4d31c7020c5c42125c89c57ef5cc374afc38472bd3b0582477eb9ad4cb396`.

### Verification in CI (`bun run oracle:verify-fixtures`)

`bun run oracle:verify-fixtures` (`tools/oracle/verify.ts [--root <dir>]`) checks every committed fixture `conformance/fixtures/<component>/<sha256>.json`. It is pure Bun: no Docker, no PHP, no network, no private key (it reads only `oracle.pub`). CI's `check` job (`.github/workflows/ci.yml`, step `Verify the Oracle fixtures`, run first, right after the install) runs it on every pull request, merge-queue run and push to `main`. It reports every problem, one line each on stderr, starting with the file's repo-relative path. Any of these fails it:

- the fixture is not in the canonical [format](#fixture-format-and-signature), or its signature does not verify against `conformance/oracle/oracle.pub` (a hand-edited output, or a fixture signed with another key: `<path>: the signature does not verify`);
- the file name is not `<64 lowercase hex>.json`, or is not the fixture's `sha256`;
- the fixture's `sha256` is not a committed request in `conformance/oracle/requests/<component>.jsonl` (or an accepted [per-Story request](#verification-and-the-batch) of that Component), the request is in another Component's file, or the Component has no request file;
- a per-Story request file has a rejected line or no valid manifest ([Verification and the batch](#verification-and-the-batch));
- the request is listed in `conformance/oracle/nondeterminism.jsonl` (a listed request gets no fixture);
- any other file or directory under `conformance/fixtures/`, except `generators/` (generator reference files, never signed, are skipped).

It fails closed, naming the cause, when `oracle.pub` is missing or not an Ed25519 key, or a request file or the listing cannot be read. No `conformance/fixtures/` directory, or no fixtures, passes. Exit codes: 0 pass (`Oracle fixtures OK: <n> fixtures verify against conformance/oracle/oracle.pub.`), 1 any failure, 2 usage error. Fixtures are protected by this check, not by path: `/conformance/fixtures/` keeps no CODEOWNERS owner.

### Determinism

Both passes are compared per request, by the canonical JSON of `output`. Some Upstream code under test is random (UUIDs, ULIDs, random strings, an encryption IV), and nothing seeds or pins it (`decisions/ESC-3.2-1.md`). `conformance/oracle/nondeterminism.jsonl` lists those requests, one line each:

```json
{"sha256":"<request sha256>","id":"<the request's Test ID>","reason":"<the random or time source>"}
```

Keys in that order, compact, LF, sorted by `id` then `sha256`, no duplicates. A listed request gets no fixture; its Test ID stays an ordinary Ported Test with Upstream's own assertions.

- A difference in an unlisted request writes no fixture, writes `conformance/escalations/ESC-bot-<n>.md` (the next free `n`; `trigger: open-question`; `test_ids` the differing requests' ids; `evidence` each id, sha256 and both output digests), prints each differing id on stderr (`oracle nondeterminism: …`) and exits 1.
- A listed `sha256` that is not a committed request, whose `id` is not the request's, or whose two outputs are identical fails the run naming the line (exit 1, no fixtures, no Escalation), so the listing cannot go stale.

`--determinism` (the nightly job) applies the same rules without a key.

### Maintainer-run steps

These are never agent steps. Until `ORACLE_SIGNING_KEY` and `conformance/oracle/oracle.pub` both exist, the `oracle` job's batch step fails on every run, after the image has been pushed.

1. Generate the Ed25519 key pair on a Maintainer machine, never on the agent host: `openssl genpkey -algorithm ed25519 -out oracle.key` and `openssl pkey -in oracle.key -pubout -out conformance/oracle/oracle.pub`.
2. Store the private key as the secret `ORACLE_SIGNING_KEY` of the GitHub environment `oracle`, restricted to the `main` branch, then delete `oracle.key`.
3. Run `bun run oracle:fixtures fingerprint` and record the value in [Fixture format and signature](#fixture-format-and-signature). Commit `oracle.pub` and the fingerprint through a PR (both Protected).
4. Run `oracle.yml` from `main` (`workflow_dispatch`), download the `oracle-fixtures` artifact, and commit `conformance/fixtures/` through a PR.

Regenerate fixtures after a Pin bump or a change of the committed requests or of evaluate.php.

## Per-Story requests (`bun run oracle:story`)

The batch covers only the mechanically extracted Differential set. A Story that needs expected values for other inputs (an Xaravel Differential suite, a dataset the batch missed) commits `conformance/oracle-requests/<story-id>.jsonl` (FR-6, AD-15). It is one of the paths a Story may edit and is not Protected. Each line is a request in the [batch's format](#request-format), validated by the same schema; its `id` must be one of the Story's own `test_ids` or `xaravel_test_ids` (`stories/<story-id>.md`). Fidelity Review checks each request against Upstream: a request can make PHP compute anything, so the signature proves only that the Oracle computed it.

### Command and modes

| Command | What it does |
| --- | --- |
| `bun run oracle:story check <story-id>` | Judges every line of the request file against the schema and the manifest, without evaluating. It writes nothing. |
| `bun run oracle:story generate <story-id>` | The same judgement, then evaluates the accepted requests twice with evaluate.php, in the Oracle image `xaravel-oracle:<oracle tag>` (`--image <ref>` picks another) through `runInImage`, with the script and a directory holding only the accepted requests mounted read-only and the batch's command (`php /xaravel/evaluate.php /oracle/upstream/framework 8.5.11 /xaravel/requests/<story-id>.jsonl`). `--local <dir> [--php <bin>]` runs it against a locked local install, as for the batch. A request whose two outputs differ gets no fixture and is rejected (`differs between two evaluations`). Each other one is signed exactly as the batch signs ([Fixture format and signature](#fixture-format-and-signature)) with the key in env `ORACLE_SIGNING_KEY`, checked against `oracle.pub` before anything runs, and written to `conformance/fixtures/<component>/<sha256>.json`, where `<component>` is the manifest's (`--out <dir>` writes under `<dir>`). It writes nothing else. |

Both take `--root <dir>` (the manifest, schema, batch requests, listing and `oracle.pub` come from there), `--requests <file>` (default `<root>/conformance/oracle-requests/<story-id>.jsonl`; messages always name the repository path) and `--report <file>`, a markdown summary that the workflow posts as the PR comment: the fixtures written (or the requests accepted) and each rejection with its reason. Exit codes: 0 every request accepted (and signed), 1 any rejection or failure, 2 usage error. A missing or invalid manifest, a missing request file, a missing key or a key that is not `oracle.pub`'s private half fails closed, naming the cause, and writes no fixture.

A line is rejected, naming `<file>:<line>` and the reason, when it is malformed JSON, not `{id, kind, input, sha256}` in that order, fails the schema, has a wrong `sha256`, or is not byte-identical to its canonical rendering; when its `id` is not owned by the Story (`id <id> is not owned by Story <story-id>`); when its `sha256` repeats an earlier line; when it is a batch request (`conformance/oracle/requests/`, which the batch already signs); or when it is listed in `conformance/oracle/nondeterminism.jsonl`. The other lines still run. A file that does not end with LF has its last line judged as it is, plus one file-level problem.

An Xaravel Test ID (`XT-<component>-<n>`) has no Upstream class, so evaluate.php runs it bound to a bare `PHPUnit\Framework\TestCase` in the global namespace (`blade-render`: the bare Testbench TestCase). A PHPUnit Test ID runs as in the batch.

### The workflow (`oracle.yml#story`)

`story` runs on `pull_request_target` (types `opened`, `synchronize` and `reopened`, into `main`, touching `conformance/oracle-requests/**`), only for a `story/<story-id>` head branch of this repository (never a fork):

1. It checks out the PR's base commit with `persist-credentials: false`. `pull_request_target` runs main's copy of the workflow and of `tools/oracle/`, so a PR cannot change the code that holds the signing key. The job never checks out, installs or runs PR code. The manifest comes from that base checkout, and the PR's request file is read from the contents API at the head SHA, as data. A PR whose head has no request file (it deleted it) does nothing.
2. Its `GITHUB_TOKEN` is read-only (`contents: read`, `packages: read`, `pull-requests: read`). It logs in to GHCR with that token only to pull `ghcr.io/<owner>/xaravel-oracle:<tag>` (the tag from main's `oracle:tag`), then logs out.
3. In the environment `oracle` it runs `bun tools/oracle/story.ts generate <story-id> --image <ref> --requests <the PR's file> --out <temp dir> --report <temp file>`. Request PHP runs only inside the networkless container; the key stays on the host.
4. It takes a token of the `xaravel-oracle` GitHub App (`actions/create-github-app-token`, pinned by SHA, with `vars.XARAVEL_ORACLE_APP_ID` and `secrets.XARAVEL_ORACLE_APP_KEY`, scoped to contents and pull requests). With it, it commits only the new `conformance/fixtures/<component>/<sha256>.json` files to the head branch through the Git data API, as the App's bot user, on top of the exact head SHA it evaluated. Before the update it checks that the branch is still at that SHA, and the update is fast-forward only: when the branch has moved (even back to an ancestor), the step fails, and the push that moved it starts a new run. A run whose fixtures the branch already holds commits nothing.
5. It comments the report on the PR, as the App, when a request was rejected (or the run failed) or a commit was made, and then fails when any request was rejected.

The App's commit triggers the PR's checks again. `oracle:verify-fixtures` ([Verification in CI](#verification-in-ci-bun-run-oracleverify-fixtures)) then verifies the new fixtures, and the ownership check accepts them: a Story may commit `conformance/fixtures/<its component>/<64 hex>.json`, which are protected by signature, not by path. `story` itself runs again on that commit and, finding every fixture in place, commits nothing. The job only adds fixtures: when a Story edits or removes a request line, it deletes that request's old fixture file itself (it is within the Story's allowed paths), or `oracle:verify-fixtures` names it.

### Verification and the batch

`bun run oracle:verify-fixtures` also reads every `conformance/oracle-requests/*.jsonl` with its manifest (`stories/<story-id>.md` on the checked-out commit). Each rejection above, except the two-evaluation comparison, is a violation `<path>:<line>: …`, and so is a file without a valid manifest, a name other than `<story-id>.jsonl`, or a request already accepted in another per-Story file. An accepted request is a valid source for a fixture in its manifest's Component directory, and only there.

The batch (`bun run oracle:fixtures`) never deletes the fixture of an accepted per-Story request in its Component directory, and never re-signs it. Re-signing per-Story fixtures after a Pin bump, and a staleness check against the Pin, are deferred.

### Maintainer-run steps for per-Story requests

1. Create the GitHub App `xaravel-oracle` ([identities.md](identities.md#the-xaravel-oracle-github-app)) and install it on the repository.
2. Store its App ID as the repository variable `XARAVEL_ORACLE_APP_ID` and its private key as the secret `XARAVEL_ORACLE_APP_KEY` of the environment `oracle`.
3. The environment `oracle` is restricted to `main`; a `pull_request_target` run's ref is the base branch, so the restriction admits the `story` job. Confirm it with a first live run on a Story PR, which is not verified by the tests.

## API surface (`bun run oracle:api-surface`)

Story 6.5 diffs each package's `.d.ts` against Laravel's public API (AD-15, PRD §5.1). That API is committed data, exported from the Upstream snapshot by PHP Reflection in the Oracle image: `conformance/api-surface/<component>.jsonl`, under the Protected `/conformance/`. Contributors need neither PHP nor Docker; they read the committed files.

### Command and modes

| Command | What it does |
| --- | --- |
| `bun run oracle:api-surface` | For each Upstream repository (framework, ai, mcp, boost) it runs `tools/oracle/api-surface.php` twice in the Oracle image `xaravel-oracle:<oracle tag>` (`--image <ref>` picks another), through `runInImage`, with the script and the class lists mounted read-only: `php /xaravel/api-surface.php /oracle/upstream/<repo>/vendor/autoload.php /oracle/upstream/<repo>/src /xaravel/classes/<repo>.txt`. The class list is every FQCN tools/component-map's `declaredClasses` finds in that repository's `src/`. It writes `conformance/api-surface/<component>.jsonl`, deletes any other `*.jsonl` there except `additions.jsonl` and `exceptions.jsonl`, and prints the lines per Component. |
| `bun run oracle:api-surface --local <dir> [--php <bin>]` | The same with the local PHP 8.5.11 (or `--php <bin>`), against locked installs `<dir>/{framework,ai,mcp,boost}` whose `src/` and `tests/` equal the snapshot's. |
| `bun run oracle:api-surface --check …` | Builds the files in memory and compares them byte for byte with the committed ones, one `api surface drift: <file> …` line per file that differs (with the first differing line), is missing, or is committed but not generated. It also validates the citation files. It writes nothing and exits 1 on any problem. |

Each takes `--root <dir>`. Exit codes: 0 pass, 1 any failure (fail closed, nothing written), 2 usage error. Regenerate after a Pin bump or a component-map change; the pin-bump chain does not run it yet.

### Record format

`conformance/api-surface/schema.json#/$defs/surface` defines a line; the tool re-renders each line in this key order, compact, LF-terminated:

- a class, interface, trait or enum: `{"fqcn","kind","member":null,"stubbed":[…]}`;
- a public method declared by the class itself (trait-imported methods count, inherited ones do not): `{"fqcn","kind":"method","member","static","parameters","returns","nullable"}`;
- a public property, likewise: `{"fqcn","kind":"property","member","static","type","nullable"}`;
- a public constant or an enum case: `{"fqcn","kind":"constant"|"case","member","static":true}`;
- a user function declared under the repository's `src/`: `{"fqcn","kind":"function","member":null,"static":false,"parameters","returns","nullable"}`.

A parameter is `{"name","type","nullable","default","optional","variadic","byRef"}`. `type` and `returns` are PHP's type string, or null when untyped; `nullable` is `allowsNull()`, and untyped counts as nullable. `default` is null when there is none, else PHP source: a constant name (an unqualified global constant loses its namespace fallback prefix, so `PHP_INT_MAX`, not `Ns\PHP_INT_MAX`), `new …` as Reflection prints it, `Enum::Case` (the enum's FQCN without a leading backslash, however the default is written), or a compact literal (`null`, `true`, `0`, `'x'`, `[]`, `['*']`, `['a' => 1]`). Any other object in a default, or a `new` default Reflection does not print, fails the run instead of being guessed.

A class's Component is `componentForFqcn`. A function's is `kebab(<Dir>)` for `framework/src/Illuminate/<Dir>/…`, else the repository name. An FQCN no Component owns, or a Component missing from the map, fails the run. Lines are sorted by `fqcn`, then kind (declaration or function, case, constant, property, method), then `member`, by UTF-16 code unit. Inherited members are not repeated: each class lists only its own members, and Story 6.5 compares them with the TS class's own members (the port mirrors Upstream's hierarchy). Declaration lines keep member-less classes (exception subclasses, for example) visible.

### Stubs

A type that fails to autoload (`Class|Interface|Trait "X" not found`) is defined as an empty stub of that kind, the load is retried, and X is listed in the `stubbed` of every declaration that has it among its parent classes, interfaces or traits (sorted, whatever the load order). The stub's members are never reported, so no exported member changes, and the local install and the image give the same output. At the Pin this applies only to `Illuminate\Testing\ParallelRunner`, which implements ParaTest's `RunnerInterface`. Any other load failure, a class whose file is not under `src/`, any PHP warning or deprecation (an error handler turns it into a failure) or any other exception makes the script exit 1, naming the class or function it was processing.

### Determinism

The two passes of each repository must print identical bytes. If they differ, nothing is written, stderr gets `api surface not deterministic: <repo> (first difference at line <n>)`, and the command exits 1. Two runs on one Pin therefore give identical files.

### Citation files

`conformance/api-surface/additions.jsonl` (`#/$defs/addition`) lists members a package exports that Upstream lacks; `exceptions.jsonl` (`#/$defs/exception`) lists Upstream members a package does not export. Both are Protected, written by hand through Maintainer review, and committed empty. Each line is `{"component","fqcn","member","citation"}`, with `member` a string or null, in that key order. Every line needs a `citation` (spine AD-15): an addition cites `FR-<n>` or `DIV-<1..12>[.<clause>]`, an exception cites `DIV-…` or `deferred:<item>`. Lines are sorted by `component`, `fqcn`, `member`, with no duplicates. `checkCitations` (run by `--check`) reports every problem.

### The drift check in CI

`oracle.yml#build` (on a PR touching the Oracle's inputs) and `oracle.yml#determinism` (nightly) run `bun run oracle:api-surface --check` in the image they just built. A committed surface that no longer matches the snapshot and the image, or an invalid citation file, fails the job. The `.d.ts` diff, the `api-surface:gate` command and the PR summary are Story 6.5's.
