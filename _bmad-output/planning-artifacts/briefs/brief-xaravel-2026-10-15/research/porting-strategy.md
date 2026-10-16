# Xaravel porting strategy: test-suite-as-spec, PHP→TS semantic gaps, async, test infrastructure

Date: 2026-10-15. Target: laravel/framework `13.x` (latest tag v13.37.0). Runtime: Bun + Hono.
Sibling note: `laravel-anatomy.md` (per-component LOC and layering). This note covers *how* to port.

Confidence legend: **[V]** verified in this session (source fetched or measured); **[S]** secondary source only; **[M]** from my own knowledge, not re-verified (check before relying on it).

---

## 0. Measured facts about the conformance corpus [V]

Measured on a sparse shallow clone of `laravel/framework@13.x` `tests/` and `src/` (regex counts, so ±5%):

| Metric | Count | Note |
|---|---|---|
| `*Test.php` files | 1,004 | 397 under `tests/Integration` |
| `public function test*` methods | 13,544 | Laravel uses the `test` prefix, not `#[Test]` (0 uses) |
| Test LOC (incl. fixtures) | ~296k | 342 non-test PHP fixture files, 29 non-PHP fixtures |
| `src/Illuminate` PHP files / LOC | 1,742 / ~276k | Database 61k, Foundation 37k, Support 22k, Queue 15k, Validation 14k |
| `#[DataProvider]`/`@dataProvider` | 613 | plus 246 `#[TestWith]`. Real test-case count after expansion is higher than 13.5k |
| `assertSame(` / `assertEquals(` | 13,275 / 4,824 | strict vs loose equality must be modelled separately |
| `assertTrue/False(` | 7,481 | |
| `expectException(` | 430 | |
| Mockery `m::mock/spy` | 1,449 | 706 `shouldReceive(` chains. PHPUnit mocks: 379 |
| Facade `::fake(` | 431 | Event 70, Queue 39, Http 23, Mail 2 |
| `Carbon::setTestNow(` | 383 | time-freezing is pervasive |
| `#[Requires*]` attrs | 284 | extension, OS and PHP-version gates. These become skip reasons |
| Testbench attrs (`#[WithConfig]`, `#[DefineEnvironment]`, `#[WithMigration]`, ...) | 189 | 291 test files use `Orchestra\Testbench` |
| `SerializableClosure` refs in tests | 72 | |

Test methods by top-level dir: Integration 2,809 · Database 2,803 · Support 1,674 · Foundation 909 · Validation 644 · Http 562 · View 425 · Testing 402 · Queue 361 · Routing 358 · Cache 355 · Auth 265 · Container 209. Integration/Database alone has 888.

Dynamic-PHP usage in `src` (gives the size of the semantic-gap problem): `__call` 74, `__callStatic` 8, `__get` 23, `__set` 7, `__invoke` 27, `offsetGet` (ArrayAccess) 22, `static::` 1,602, `new static` 263, trait declarations 191, in-class trait `use` lines 305, `use Macroable` 40, `use Conditionable` 39, `use ForwardsCalls` 16, Reflection API refs 258, `class_uses_recursive` 31, `preg_*` calls 262, `mb_*` calls 123, by-ref params `&$x` 113, `serialize/unserialize` 151.

Laravel's own CI (`.github/workflows/databases.yml`) runs `tests/Integration/Database` against MySQL 5.7/8.4/9.7, MariaDB 10.11/11.8/12.3, Postgres 10/14/18, SQL Server 2017–2025, and SQLite. [V]

Runtime deps that become porting surface (composer `require`) [V]: symfony/{console, error-handler, finder, http-foundation, http-kernel, mailer, mime, process, routing, uid, var-dumper}, nesbot/carbon ^3.8, laravel/serializable-closure ^2, guzzlehttp/*, league/{commonmark, flysystem, uri}, monolog, ramsey/uuid, brick/math, doctrine/inflector, dragonmantank/cron-expression, egulias/email-validator, vlucas/phpdotenv, voku/portable-ascii, laravel/prompts, nunomaduro/termwind. Dev: phpunit ^11.5 / ^12.5 / ^13.0, mockery ^1.6.10, orchestra/testbench-core ^11.6. **Many Laravel tests implicitly test Symfony and Carbon behaviour.** Each dependency needs a decision: use an npm equivalent, write a thin shim, or port it.

---

## 1. Prior art: porting by passing the original test suite

### 1.1 Runtimes and tools

**Bun ↔ Node test suite.** Bun says it runs "thousands of tests from Node.js' test suite before every release" and publishes *per-module* pass rates (e.g. `node:fs` 92%, `node:zlib` 98%, `node:events`/`os`/`path` 100%). It began running them on every change in Bun 1.2. Sources: https://bun.com/docs/runtime/nodejs-compat, https://bun.com/blog/bun-v1.2 [S]. Lesson: **per-module percentages are a good motivator, but the denominator is chosen by the project.** Deno's whole-suite viewer reportedly puts Bun 1.3.14 at 40.6% on the full Node suite, and Deno 2.8 at 76.4% (3,405/4,457). Sources: https://byteiota.com/deno-2-8-node-js-compat-hits-76-ahead-of-bun-now/ [S, secondary, numbers unverified]. *Publish both numbers: % of the full inventory and % of the enabled set.*

**Deno node_compat harness.** Deno copies Node test files verbatim from the Node tarball. The intent is to run them **unmodified**. `config.jsonc` lists the enabled tests, an `ignore` section keeps edited copies from being overwritten, and `${platform}Ignore` keys hold OS-specific skips. CI regenerates the enabled set from daily runs ("consistently passing over the last 10 days"), which works as a ratchet against flakiness. Results go to a dashboard: https://node-test-viewer.deno.dev/results/latest. Sources: https://code.fosterhangdaan.com/foster/denoland-deno/src/branch/main/tests/node_compat/runner/README.md (mirror of denoland/deno) [S].

**Deno WPT (WinterTC-style web conformance).** `expectation.json` mirrors the WPT directory tree. Each entry is `true` (file passes), `false` (file fails), or an array of failing subtest names. `wpt.ts update` rewrites the file from actual results. Source: https://docs.deno.com/runtime/contributing/web_platform_tests [S]. **This is the best model for the Xaravel skip list: a machine-maintained expectation file with test-case granularity, where CI fails on *unexpected* passes as well as unexpected failures.** Unexpected passes force the expectation file to stay current.

**uutils coreutils ↔ GNU test suite.** uutils runs the GNU coreutils test suite and tracks pass/fail/skip/error per release in a separate repo (https://github.com/uutils/coreutils-tracking). 0.10 (Aug 2026) reports 645/690 = 93.48%, up from about 84% in Oct 2025. Release notes always quote the delta. Sources: https://www.phoronix.com/news/Rust-Coreutils-0.10, https://linuxiac.com/rust-based-uutils-coreutils-0-10-reaches-93-5-gnu-compatibility/ [S]. Lessons: (a) the last ~7% is long-tail and takes years; (b) a version bump of the upstream suite changes the denominator, so pin the upstream version and re-baseline on purpose.

**Pyodide ↔ CPython test suite.** Pyodide runs the CPython suite under WASM with a skip file (`src/tests/python_tests.yaml`, later `.txt`) plus patches. Each entry is per module, with xfail/skip reasons such as "no threads" or "no subprocess". Source: https://pyodide.org/en/latest/development/testing.html [S]. Lesson: **skip *reasons* need a controlled vocabulary** (platform-impossible vs not-yet-implemented vs intentional divergence). Without one, "skipped" hides real work.

**TypeScript → Go (tsgo / TS 7).** The port relied mainly on the existing **baseline (golden-file) tests**. A `.diff` file is generated wherever Go output differs from the accepted TS baseline. The workflow is: run, accept baselines, then inspect `testdata/**/*.diff`, where fewer diff files means progress. Fourslash (language-service) tests were ported in batches, with diffing infrastructure added per feature. Sources: https://github.com/microsoft/typescript-go/pull/2130, https://github.com/microsoft/TypeScript/pull/62502 [S]. Lesson: **when outputs are textual (SQL strings, compiled Blade, rendered HTML, console output), compare snapshots of the original implementation's actual output instead of hand-translating assertions.** Laravel's SQL grammar tests (`DatabaseQueryBuilderTest` and others) are essentially golden SQL strings and port almost for free.

### 1.2 LLM/agent-driven large ports (2025–2026)

**Bun Zig → Rust (Jul 2026), the most relevant precedent.** https://bun.com/blog/bun-in-rust [V, fetched]. 535k lines of Zig, 1,448 files, done in 11 days with about 50 workflows and up to about 64 concurrent Claudes. The landed diff was +1.0M lines, and token spend was about $165k at API prices. Key mechanics:
- Before any code: about 3 hours of human+agent discussion produced **`PORTING.md`** (a mapping of Zig idioms to Rust idioms) and **`LIFETIMES.tsv`** (an analysis per struct field). Both went through adversarial review and a pilot on 3 files before fan-out. *Xaravel equivalent: a `PORTING.md` idiom table (section 3 below) and a per-class "dynamic surface" inventory (which classes use `__call`, traits, `static::`) before any epic starts.*
- Unit loop: **1 implementer → 2 adversarial reviewers (diff-only, told "assume it's wrong") → 1 fixer → commit.** The reviewers caught bugs that compiled cleanly.
- The **work queue was the error list** (16k compiler errors, split by crate). After that it was failing test files: about 100 random files per round, sharded by folder, with stack traces saved per test. The CI failure list went from 972 to 23 in about 2 days.
- **0 tests skipped or deleted**, checked by hand. Failure modes: agents **stubbing functions to "make it compile"**, and long comments justifying workarounds. A reviewer rule was added: "code that needs a paragraph to justify itself is wrong". Agents also ran git commands that broke each other's worktrees, so the fix was to allow only commits of specific files. Build contention: no `cargo` inside loops, one check per phase.
- 19 regressions, **all semantic not syntactic**. Examples: asserts with side effects that release builds erase, slice truncation behaviour, bounds checks, comptime format strings. *PHP→TS will have far more of these than Zig→Rust did.*

**Anthropic, 16 parallel Claudes build a C compiler (Feb 2026).** https://www.anthropic.com/engineering/building-c-compiler [V, fetched]. Lessons that apply directly:
- "The task verifier [must be] nearly perfect, otherwise Claude will solve the wrong problem." Add a regression test whenever a recurring agent failure mode appears.
- **Design harness output for agents:** print only a few lines, log details to files, put `ERROR <reason>` on one grep-able line, and precompute aggregate stats.
- **Agents cannot tell how much time has passed.** Use a default `--fast` mode that runs a deterministic random 1–10% sample per agent, so the fleet covers everything while each agent still gets fast regression signal.
- Lock-file task claiming (`current_tasks/`) coordinated through git, with no orchestrator.
- **Oracle trick for one big monolithic task:** compile most files with GCC (known-good) and only a random subset with the new compiler, so agents isolate different bugs. *Xaravel analog: run the PHP Laravel as an oracle for differential tests. For SQL, rendered views, validation messages and serialized output, the same input should produce the same output.*
- At about 100k LOC, new work kept breaking old work. Strict CI gating fixed it.

**Ladybird LibJS C++ → Rust (Feb 2026).** https://ladybird.org/posts/adopting-rust/, https://heise.de/-11187278 [S]. About 25k lines of Rust in about 2 weeks with Claude Code and Codex. It was "human-directed, not autonomous": hundreds of small prompts, then adversarial multi-model review. The acceptance bar was **byte-identical AST and bytecode versus C++**, plus 52,898 test262 tests and 12,461 regression tests, with zero regressions. The Rust deliberately stays in a "translated from C++" style until the C++ version is removed. *Lesson for Xaravel: port the internals in literal Laravel shape first and make them idiomatic later. Decide the **public** API idioms (async, typing) up front, because changing them later is expensive.*

**JustHTML Python → JS (Dec 2025).** https://simonwillison.net/2025/Dec/15/porting-justhtml/ [S]. 9,200 html5lib-tests passed in about 4.5 hours with a few prompts. It worked because the test suite is language-independent data. Related: Drew Breunig's "whenwords", a library shipped as spec + YAML conformance tests with no code (https://www.dbreunig.com/2026/01/08/a-software-library-with-no-code.html). *Lesson: wherever a Laravel test is really input→output data (Str, Arr, Pluralizer, SQL grammar, validation messages, Carbon formatting), extract it to a language-neutral fixture (JSON/YAML) and generate the TS test from it. Don't hand-translate.*

**Cursor, "scaling long-running autonomous coding" (Jan 2026).** https://cursor.com/blog/scaling-agents [S]. A planner/sub-planner/worker/judge hierarchy, hundreds of agents, about a week, more than 1M LOC for a browser. The result was legible but had visible defects. Lesson: without a strong verifier, scale produces volume, not conformance.

**Airbnb Enzyme → RTL test migration (2025).** https://www.infoq.com/news/2025/03/airbnb-llm-test-migration/ [S]. 3.5k test files in 6 weeks instead of an estimated 1.5 years. **A step-based pipeline** (refactor → fix jest → lint → tsc) with failure rates tracked per step. **Retry loops beat prompt tuning.** The last ~3% needed humans. *This is the direct template for the PHPUnit→bun:test translation pipeline (section 2).*

**Corca Rust → Python agent port (2026).** https://arxiv.org/abs/2601.21879 [S, summary only; check that the arXiv ID matches]. The finding: end-to-end benchmarks caught integration failures that unit tests missed, and the port scored slightly lower than the original. *Lesson: add a small set of Laravel-app end-to-end smoke apps (a skeleton app with auth, queues and Eloquent) as a second verification layer above the unit-level conformance suite.*

### 1.3 What worked (synthesis)

1. **Pin the upstream suite version** and treat it as read-only input. Generate translations and never edit by hand without recording why (Deno `ignore`, Pyodide patches).
2. **A test inventory with stable IDs** is the denominator. Report two numbers: % of full inventory and % of enabled set.
3. **A machine-maintained expectation file** (Deno WPT style) at test-case granularity. CI fails on unexpected pass *and* unexpected fail, which gives a ratchet.
4. **Skip reasons from a controlled vocabulary** (Pyodide lesson).
5. **Per-component dashboards** that release notes quote (uutils, Bun).
6. **Agent-oriented harness output** (concise output, logs to files, grep-able errors) and **sampled fast mode** (Carlini).
7. **Adversarial reviewers** and **anti-stub rules**, plus human verification that tests actually execute (Bun).
8. **Oracle/differential testing against the original** for anything with textual output (tsgo baselines, Ladybird byte-identical, Carlini's GCC).
9. **Decide idiom mappings in `PORTING.md` before fan-out** and pilot on a few files (Bun).

---

## 2. Mechanics: PHPUnit → bun:test at scale

### 2.1 Inventory extraction (the denominator)

Use **both** of the following and reconcile them:
- **Authoritative runtime list:** run the real suite once in PHP with `vendor/bin/phpunit --list-tests-xml inventory.xml`. This lists every test, *including expanded data-set names*. [M, check the flag on PHPUnit 12/13.] Also run the full suite with `--log-junit baseline.xml` in Laravel's CI DB matrix. Tests that are **skipped or failing in PHP itself** (missing extensions, `#[RequiresOperatingSystem]`) must be marked `upstream-skip` so they don't count against Xaravel.
- **Static AST inventory:** `nikic/php-parser` (https://github.com/nikic/PHP-Parser, which supports JSON serialization of the AST) gives, per test method: class FQCN, method, attributes (`#[DataProvider]`, `#[TestWith]`, `#[Requires*]`, Testbench `#[WithConfig]` and others), `setUp`/`tearDown` presence, facades and classes referenced, use of Mockery/fakes/`setTestNow`/DB, and LOC. This drives **component tagging, dependency ordering and difficulty scoring** for sprint planning. Regex is good enough for counts (as in section 0) but not for translation.

**Test ID scheme (stable, 1:1):**
```
<FQCN>::<method>[#<dataset>]
e.g. Illuminate\Tests\Support\SupportCollectionTest::testFirstWithCallback
     Illuminate\Tests\Support\SupportStrTest::testSlug#"with dashes"
```
That is PHPUnit's own naming, so the IDs join directly against PHPUnit JUnit output. Store it in `inventory.json` with fields `{id, component, file, line, upstream_sha, tags[], upstream_status, difficulty}`.

**In TS, put the ID in the test name** so bun's JUnit reporter (`--reporter=junit --reporter-outfile`, https://bun.com/docs/test/reporters [S]) emits it:
```ts
describe("Illuminate\\Tests\\Support\\SupportCollectionTest", () => {
  test("testFirstWithCallback", () => { ... });
  test.each(dataset(providerSlug))("testSlug#%s", (name, input, expected) => { ... });
});
```
Mirror the file layout (`tests/Support/SupportCollectionTest.php` → `tests/Support/SupportCollectionTest.test.ts`) and add a header comment with the upstream path and SHA. A dashboard job joins `inventory.json` × `expectations.json` × bun JUnit and outputs per-component pass/skip/fail/not-ported.

### 2.2 Expectation file (skip list)

`expectations.json`, nested by component → class → method, in Deno WPT style:
```json
{ "Support": { "SupportStrTest": { "testSlug": true,
    "testAscii": { "status": "fail", "reason": "not-implemented", "story": "E3-S7" } } } }
```
Statuses: `pass | fail | skip`. Reason vocabulary: `upstream-skip`, `platform-impossible` (for example `pcntl`, `ext-*` that has no JS meaning), `intentional-divergence` (link to an ADR, e.g. async API), `not-implemented`, `flaky`, `needs-infra` (MSSQL, Redis cluster). Runner rule: an unexpected pass fails CI until `expectations update` is run, which keeps the file accurate. Tests marked `fail` run as `test.failing` [M, check that bun:test has `test.failing`; otherwise wrap and invert in a helper] so a fix is detected automatically.

### 2.3 Assertion and construct mapping

Ship a **`@xaravel/phpunit-compat` shim**: a `TestCase` base plus `assert*` functions that throw. Translations then stay close to line-for-line, and agents don't have to re-derive semantics 13k times. Custom matchers are registered with `expect.extend`.

| PHPUnit / Laravel | bun:test translation | Notes / risk |
|---|---|---|
| `assertSame($a,$b)` scalars | `expect(b).toBe(a)` | PHP `===`. `1 !== 1.0` in PHP, but JS has one number type, so int/float distinctions are lost (see §3.6). |
| `assertSame` arrays | `expect(b).toPhpIdentical(a)` (custom) | PHP `===` on arrays requires the **same key order and types**. `toStrictEqual` doesn't check key order. |
| `assertSame` objects | `toBe` (identity) | |
| `assertEquals` | `toPhpEqual` (custom) | PHP loose `==`: `"1" == 1`, assoc arrays compared ignoring order, objects compared by property. **Don't map to `toEqual` blindly.** |
| `assertTrue/False/Null` | `toBe(true/false/null)` | PHP `null` vs JS `undefined`. The port must pick one canonical "absent" value: `null` for returned values, `undefined` only for missing keys. |
| `assertCount` | `toHaveLength` / `.count()` | Countable objects |
| `assertInstanceOf` | `toBeInstanceOf` | Interfaces are erased in TS, so interface checks need brand symbols or `implements` registries. |
| `assertStringContainsString`, `assertMatchesRegularExpression` | `toContain`, `toMatch` | PCRE→JS regex translation (§3.11) |
| `expectException(X)` + rest of body | `expect(() => {rest}).toThrow(X)`, or `await expect(p).rejects.toThrow(X)` | In PHPUnit the code after the throw doesn't run. The translator must wrap the *remainder* of the test. Also handle `expectExceptionMessage`. |
| `#[DataProvider('p')]` / `@dataProvider` | `test.each(entries(p()))("name#%s", ...)` | Keep the dataset keys as names for ID stability. Providers are static methods, so make them module-level functions. |
| `#[TestWith([...])]` | `test.each` inline | |
| `setUp/tearDown` | `beforeEach/afterEach` | `parent::setUp()` chains map to TestCase base class hooks. |
| `setUpBeforeClass` | `beforeAll` | |
| `markTestSkipped` / `#[Requires*]` | `test.skipIf(cond)` [M] or expectation entry | |
| Mockery `m::mock(X)->shouldReceive('f')->once()->with(..)->andReturn(..)` | **Port a mini-Mockery** (`@xaravel/mockery`): Proxy-based doubles, expectation chains, `m::close()` verification in `afterEach` | 1,449 sites. Mapping each one to `mock()`/`spyOn` idioms would be lossy and error-prone. A shim keeps the translation mechanical. bun's `mock()`/`spyOn()` (`bun:test`) are fine as the internal engine. |
| PHPUnit `createMock` | same shim | 379 sites |
| `Carbon::setTestNow()` | `Carbon.setTestNow()` in the port, plus bun's `setSystemTime` [M] for raw `Date` | 383 sites. The port's `now()` must read the Carbon test clock, not `Date.now()`. |
| `$this->app`, `$this->get('/x')->assertOk()` (Testbench/Foundation testing) | the Xaravel TestCase provides `this.app`, `await this.get('/x')` returns a `TestResponse` with the same assertion names | These are Laravel's own testing APIs (tests/Testing has 402 tests), so port them as product code. |

### 2.4 Translation pipeline (Airbnb-style staged, agent-driven)

Per test file, as an idempotent job: **translate → typecheck (`tsc --noEmit`, or tsgo) → lint (floating-promise rules) → run → classify**, with retry loops per stage and failure rate tracked per stage. Feed the agent the PHP test, the PHP source under test, `PORTING.md`, the already-ported TS API surface (`.d.ts`), and the stage's errors. **Translate tests before the implementation exists** (a TS API skeleton is enough to typecheck). Then failing tests become the implementation work queue, as in Bun's flow.

---

## 3. PHP → TS semantic gaps (Laravel-specific)

Risk = likelihood × blast radius on public API and test fidelity. H/M/L.

### 3.1 Magic methods `__get/__set/__call/__callStatic` → Proxy. **Risk: H (Eloquent), M (elsewhere)**
- `__get/__set` (23/7 in src; Eloquent attributes, Fluent, Request input, Collection higher-order proxies): return `new Proxy(this, handler)` from the constructor. Each trap checks real members (`Reflect.has(target, key)`) first and falls back to `getAttribute`.
- **Gotchas:**
  1. TS class fields with `useDefineForClassFields` (the default for ES2022+ targets) create **own properties that shadow the Proxy fallback**. Typed attribute declarations must be `declare name: string;`, which emits nothing. This is the main mistake to guard against in Eloquent models.
  2. ECMAScript `#private` fields throw brand-check errors when a method runs with `this` = proxy. Use TS `private`/symbols instead of `#x` on proxied classes.
  3. Performance: Proxy traps are slower than property access on JSC. Keep proxies on models and builders, never on Collection items in hot loops. Hydration should write plain properties where possible.
- `__call` (74 sites: Macroable dispatch, `ForwardsCalls` from Model→Builder→QueryBuilder, dynamic `where{Column}`, `Relation` forwarding): use a Proxy `get` trap that returns a bound function when the key is not a real member. Types: declare the forwarded surface explicitly with TS `interface` merging (`interface Model extends BuilderMethods {}`). This mirrors Laravel's own `@mixin`/`@method` docblocks, which Laravel already keeps generated (the `facades.yml` workflow) [V]. Dynamic finders such as `whereEmailAndName` can't be typed precisely, so port them untyped behind `.dynamicWhere()` and keep the test.
- `__callStatic` (8; Facade, Model static forwarding `User::where()`): see 3.2 and 3.4.

### 3.2 Facades and static proxies. **Risk: M**
- `export const Cache = facade<CacheManager & CacheRepository>("cache")` creates a Proxy whose `get` resolves `app().make("cache")[key]` on each call. Pass the type parameter from the contract interface for full typing. `Cache.fake()`/`swap()`/`shouldReceive()` are methods on the facade object.
- **Long-lived process problem:** PHP rebuilds the app per request, but a Bun server doesn't. Facade-resolved-instance caching and `app()` must be **request-scoped through `AsyncLocalStorage`** (supported in Bun, though promise hooks are incomplete: https://bun.com/reference/node/async_hooks/AsyncLocalStorage [S]). Laravel Octane already documents this class of state-leak bug (https://laravel.com/docs/13.x/octane, [M]). Its rules work as a checklist.
- Real-time facades (`Facades\App\Foo`) depend on namespace autoloading, so drop them or replace them with an explicit `realtime(Foo)`.

### 3.3 Traits (191 traits, 305 use-sites) → mixins. **Risk: M**
- Use TS class-expression mixins: `class User extends uses(Model, SoftDeletes, HasUuids) {}`. The `uses()` helper must:
  1. Record the trait list on a static symbol, so `class_uses_recursive()` works. Eloquent boots traits by **naming convention**: `boot{Trait}`, `initialize{Trait}`. Tests depend on this.
  2. Support trait static properties, abstract-method requirements (enforce through TS `abstract`), and `insteadof`/`as` conflict resolution (rare, so handle it manually).
  3. Merge types through intersection or interface merging.
- Small "behaviour" traits (Macroable, Conditionable, Tappable, ForwardsCalls, InteractsWithTime, Dumpable) can be plain functions applied to the prototype. Model-heavy traits (HasAttributes, HasRelationships, HasEvents, HasTimestamps, GuardsAttributes, HidesAttributes) stay as mixins in literal Laravel shape (Ladybird lesson).
- **Macroable** (40 classes): static `macro(name, fn)` stores into a per-class map, and the `__call` Proxy dispatches to it. TS typing works through module augmentation (`declare module "@xaravel/support" { interface Collection<T> { myMacro(): X } }`). That's the idiomatic counterpart of IDE-helper stubs. `mixin()` copies methods from an object.

### 3.4 Late static binding `static::` / `new static` (1,602 / 263). **Risk: L–M**
- In static methods, JS `this` *is* the called subclass when invoked as `User.query()`, so `static::` maps to `this` and `new static` maps to `new this()`. In instance methods, use `this.constructor as typeof Model`.
- Typing pattern: `static query<M extends Model>(this: ModelStatic<M>): Builder<M>`.
- Gotchas: detached static calls (`const q = User.query; q()`) lose `this`. Tests rarely do this, so lint for it. Static *properties* are inherited by reference in JS, while PHP re-declares them per class (e.g. `protected static $booted = []`, `$globalScopes`). Laravel keys these arrays by `static::class`, so port them as `Map<Constructor, ...>` keyed by the constructor.

### 3.5 Class-string identity (`Foo::class`, 1,473 uses). **Risk: H** (not on the brief's list, but it touches everything)
- Laravel treats FQCN strings as identifiers for container bindings, morph types **stored in the DB** (`commentable_type = 'App\Models\Post'`), serialized queue payloads, event names, policies, casts (`'array'`, `AsCollection::class`), validation rule classes, and route `[Controller::class, 'method']`.
- TS classes are values with no stable global name (minification, duplicate names across modules). Options:
  1. A **class registry**: `@register("App\\Models\\Post")`, or a generated manifest from file paths, mirroring PSR-4. Accept either the class or the string everywhere.
  2. Require `Relation.morphMap()` and `enforceMorphMap` (Laravel already recommends it).
- Recommendation: do both. Do it in Epic 1 because the Container, Queue and Eloquent morphs all depend on it.

### 3.6 PHP arrays → JS. **Risk: H** (Support/Collections: 1,674 tests; Arr/Collection used everywhere)
- PHP arrays are **ordered hash maps with int|string keys and value (copy-on-write) semantics**. The gaps:
  1. **Key order:** JS objects put integer-like keys first in ascending order (`{b:1, 2:x, a:3}` iterates `2,b,a`). PHP keeps insertion order. Plain objects are therefore wrong for any assoc array that has numeric keys.
  2. **Key coercion:** PHP turns `"1"` into int `1`, and `true`/`null`/float keys are coerced. `Map` treats `"1"` and `1` as different keys.
  3. **List vs assoc:** `array_is_list`. `filter()` preserves keys and `values()` re-indexes. JSON encoding gives `[]` for lists and `{}` for maps, and `Collection::toJson` output depends on that.
  4. **Value semantics:** passing an array copies it in PHP. Tests rely on mutation in one place not leaking. JS arrays are references.
  5. **By-reference params** (113 sites: `Arr::set(&$array)`, `preg_match(..., &$m)`, `array_walk`).
- Recommendation:
  - Collections: back `Collection<K,V>` with an **ordered entry store**, a `Map<PhpKey, V>` with PHP key normalization (`normalizeKey`: numeric strings to numbers). Expose it as a JS iterable. `all()` returns a JS array for lists, or a `PhpArray`/`Record`-like ordered view for assoc. `toJSON()` follows `array_is_list` rules.
  - `Arr` helpers: accept plain arrays/objects for ergonomics and convert at the boundary. Methods that mutate by reference in PHP **return the new value and mutate in place where JS users expect it**, with the choice documented per method. Tests that assert copy semantics become explicit `structuredClone` expectations or an `intentional-divergence` entry.
  - Numbers: int vs float (`1` vs `1.0`, `PHP_INT_MAX`, integer division, `intdiv`, `%` on negatives, int overflow to float) is lost. Use `bigint` only where Laravel needs 64-bit ints (snowflake/large IDs: DB drivers return bigint columns as string or bigint). `assertSame(1.0, $x)` cases become `intentional-divergence`.

### 3.7 Eloquent dynamic attributes, relationships and type safety. **Risk: H**
- Attributes: Proxy fallback (3.1) with `declare` typed fields. Generate them optionally from the DB schema or migrations (`xaravel model:typegen`, like Prisma/ide-helper) so users get types without hand-writing them. Casts, accessors and mutators (`Attribute::make(get:, set:)`) map directly. **Accessors must be synchronous** (see §4).
- Relationships: `user.posts()` returns a `HasMany<Post>` (a typed builder). Property access `user.posts` returns the **loaded** relation (§4), and the type comes from a declaration such as `declare posts: Collection<Post>`. Alternatively, derive it with a mapped type over relation-returning methods. That's possible but heavy on the TS type checker, so it's an M risk for tsc performance.
- Prior art with the same trade-offs: Sutando (Eloquent-style on Knex, async, `await user.related('posts')` / eager `with`) https://github.com/sutandojs/sutando, and its TS rewrite Arquebus https://github.com/h3ravel/arquebus [S]. AdonisJS Lucid (preload-based) [M]. Read both before designing. Neither has a conformance suite, so Xaravel's Laravel test corpus is a real advantage.

### 3.8 Service container autowiring (Reflection: 258 refs; Container tests 209 + broad use). **Risk: H**
- PHP reflects constructor parameter **types and names**. TS erases both. Options:
  - (a) **Legacy decorators + `emitDecoratorMetadata` + `reflect-metadata`.** Bun supports this since v1.0.3 (https://bun.sh/blog/bun-v1.0.3, https://bun.com/docs/runtime/typescript [S]). AdonisJS works this way (`@inject()`; https://docs.adonisjs.com/guides/concepts/dependency-injection [S]). Limits: interfaces and union types emit `Object`, circular imports give `undefined`, **no parameter names**, and it depends on *legacy* decorators. TC39 standard decorators (now native) have no parameter decorators and no type metadata (https://www.npmjs.com/reflect-metadata [S]). Betting the core on a legacy flag is a long-term risk.
  - (b) **Explicit tokens:** `static inject = [Filesystem, "config", optional(Logger)] as const`, plus `inject()` typed helpers. Works everywhere and survives bundling/minification. Verbose.
  - (c) **Codegen/transform:** a Bun plugin or build step uses the TS compiler API (or tsgo's API) to emit `static [INJECT] = [...]` from constructor signatures, *including parameter names*. Closest to Laravel's behaviour, but adds a build step and needs tooling upkeep.
- **Recommendation:** make (b) the canonical runtime contract. Provide `@inject()` (a) as optional sugar that writes (b) metadata. Explore (c) in a later epic for app code. Container tests whose fixtures rely on implicit autowiring get **mechanical fixture edits** that add `static inject`. Record these in expectations with reason `intentional-divergence: explicit-injection`. Parameter-name overrides (`make(Foo::class, ['name' => 'x'])`) and contextual binding by parameter name (`giveConfig`, `needs('$name')`) need names, so (b) should carry them: `static inject = { files: Filesystem, name: param.string() }`.

### 3.9 Serializable closures (queues, `dispatch(function(){})`, `Bus::chain`, cache locks). **Risk: H** for closures, **M** for job classes
- JS can't serialize a closure with its captured scope. `fn.toString()` loses closure variables and is unsafe to `eval` across versions.
- Recommendation:
  1. Queued closures: support only **explicitly captured** closures, `dispatch(closure(({ userId }) => ..., { userId }))`. This mirrors PHP's `use ($userId)`. The source is serialized with an HMAC signature, as Laravel signs closures, and run in a sandboxed `new Function` at the worker. Otherwise mark them `intentional-divergence`.
  2. Job classes: a registry (3.5). `SerializesModels` becomes `{class, id, relations, connection}` with re-fetch (async!) on unserialize.
  3. PHP `serialize()` payload compatibility with real Laravel queues is a non-goal. The JSON payload *shape* can match Laravel's (`displayName`, `job`, `data.commandName`, `data.command`) so Horizon-like tooling ideas still apply.

### 3.10 Global helpers (`collect`, `app`, `config`, `now`, `str`, `data_get`, `tap`, `value`, `retry`...). **Risk: L**
- Export named functions from `@xaravel/support/helpers` and `@xaravel/foundation/helpers`. Optionally add `import "@xaravel/globals"`, which installs them on `globalThis` with a `declare global` block, for Laravel-flavoured ergonomics. `app()`/`config()`/`request()` read the ALS-scoped container (3.2).

### 3.11 Carbon dates. **Risk: M–H**
- Carbon is big: mutable `Carbon` and `CarbonImmutable`, `setTestNow`, `diffForHumans` with about 280 locales, PHP `date()` format characters, period/interval types, and macros. 383 `setTestNow` sites.
- Temporal is the right foundation (timezone/DST correct). Node 26 ships it by default (https://infoq.com/news/2026/07/nodejs-26-temporal [S]), but **I found no evidence that Bun/JSC ships Temporal** (https://github.com/oven-sh/bun/issues/15853 [S]), so use `temporal-polyfill` / `@js-temporal/polyfill` [M].
- Recommendation: write a `@xaravel/carbon` port over Temporal with a Laravel-used API subset first. Drive it with Laravel's tests (Support/Date tests, casting tests, `now()`), and later with selected Carbon upstream tests. Port PHP `date()` format codes exactly; they show up in DB casts and serialization (`Y-m-d H:i:s`, `serializeDate` uses ISO-8601 with microseconds: JS `Date` has ms precision, while Temporal has ns).

### 3.12 Strings, encoding, regex. **Risk: M**
- PHP strings are **bytes**, JS strings are UTF-16. `strlen`/`substr` (byte offsets) vs `mb_*` (123 calls). `Str::length` uses mb, which matches JS code units only for the BMP: use `Array.from`/`Intl.Segmenter` for code points or graphemes as PHP does. Use `TextEncoder` and `Uint8Array` for byte-level helpers (`Str::random`, hashes, encryption, `bin2hex`).
- `preg_*` (262 calls in src): PCRE features with no JS equivalent are possessive quantifiers, atomic groups, recursion `(?R)`, `\A`/`\z`/`\Z`, `/x` extended mode, `/s` and `/u` differences, and named groups `(?P<n>)`. Plan an audit plus a small `pcre()` translator for the common subset. Blade's compiler and Symfony's route compiler are the heaviest users [M].
- Data-table ports: `voku/portable-ascii` (Str::ascii/slug transliteration) and `doctrine/inflector` (Str::plural/singular). Port the rule tables verbatim; npm `pluralize` and similar packages behave differently.
- Other: `sprintf`/`number_format`, `json_encode` flags (`JSON_PRETTY_PRINT` spacing, escaped slashes by default: PHP escapes `/` as `\/`!), `htmlspecialchars` (`e()`), `serialize`, `password_hash` (bcrypt `$2y$`; `Bun.password` supports bcrypt [M]), and `openssl_encrypt` AES-256-CBC with Laravel's payload format, done through `node:crypto` synchronously (Web Crypto is async).

### 3.13 Other gaps, briefly
- `__invoke` (27): JS class instances aren't callable. Use a `handle`/`__invoke` method and adapt at call sites (middleware, invokable controllers, rules). Risk L.
- `ArrayAccess` (22 `offsetGet`): `$model['name']` and `$collection[0]` need a numeric/string Proxy `get` (Collection) or `.get()`. Risk M (common in tests).
- `IteratorAggregate`/`Countable`/`JsonSerializable`/`Stringable`/`__toString` map to `[Symbol.iterator]`, `count()`, `toJSON()`, `toString()`. Implicit string conversion only happens in template literals and `+`. Risk L.
- Backed enums and `from/tryFrom` become TS classes with static instances (TS `enum` is too weak). Risk L.
- Named arguments: PHP calls like `foo(name: 'x')` become options objects. Risk L in tests, M for API design.
- Interfaces at runtime (`instanceof ShouldQueue`, `ShouldBroadcast`, `Arrayable`): TS interfaces are erased. Use **symbol brands** or abstract marker classes. Risk M, and needed early (Queue/Events/Broadcasting).
- Exceptions: preserve the class hierarchy and `getMessage()`/`getCode()`. `report`/`render` methods on exceptions map directly.

---

## 4. Async: the decision that shapes the public API

### 4.1 Where the problem lives
PHP runs one synchronous request per process. On Bun, network IO is Promise-only (Bun.SQL for Postgres/MySQL; https://bun.com/docs/runtime/sql, https://bun.com/blog/bun-v1.2.21 [S]). The exceptions are `bun:sqlite`, which is **synchronous**, and sync `fs`. Laravel's synchronous APIs that perform IO:
- Eloquent/Query Builder terminals (`get/first/find/save/delete/count/exists/paginate/chunk/cursor`), lazy relationship loading by property access (`$user->posts`), `refresh`, `push`, `touch`
- Model events and observers (`saving` returning `false` cancels), accessors that query, `Collection::each->save()` higher-order messages
- `DB::transaction(fn)`, `afterCommit`, locks, `Cache::remember`, `Cache::lock`, Redis, Session persistence, Queue push, Mail send, Http client, Storage (cloud), Broadcasting
- Validation rules `exists`/`unique` (DB inside `$validator->passes()`), Gates/Policies that query, route model binding, `FormRequest` authorization
- Blade templates that trigger lazy loads during rendering
- Laravel's tests themselves: about 2,800 Integration tests plus a large share of the Database unit tests

### 4.2 Options

**A. Async everywhere ("honest async").** Every IO-reaching method returns a Promise. Builders are **thenable** (`await User.where("active", true).get()`, or `await User.where(...)` directly, as in Knex/Drizzle [M]). Callbacks that may do IO become `async` (events, observers, policies, transaction closures, validation closures, `chunk` callbacks, `retry`).
- Pros: idiomatic TS. Works with Bun.SQL and Hono. Allows real concurrency. No hidden blocking.
- Cons: async spreads up through every caller ("function colouring"), into Collections (`map` with an async callback gives `Promise[]`), events, pipeline/middleware (already async in Hono, so that's fine), and Blade. A missing `await` is a silent bug. Every DB test gets edited.

**B. Sync API over async drivers, through a worker and `Atomics.wait`** (synckit-style: the main thread blocks on a `SharedArrayBuffer` while a Worker runs the async driver).
- Pros: preserves Laravel's API exactly, so tests port almost verbatim. SQLite is natively sync anyway.
- Cons: **blocks the event loop**, so the server must use a PHP-FPM-like model (one request per worker, worker pool). Per-query cross-thread overhead [M, unmeasured on Bun; benchmark before dismissing]. No streaming, no `Promise.all` concurrency. Deadlock and failure handling is complex. Unidiomatic for TS users and works against Hono's design.
- Verdict: **reject for the product.** It *might* be worth a 1-day spike as a test-fidelity oracle, but that's probably unnecessary.

**C. Generators/coroutines (`yield*`, Effect-style).** These colour functions just like async, with worse ergonomics and tooling. **Reject.**

**D. "Sync core, async edges" (A with a deliberate boundary).** *Recommended.*
1. **Everything in memory stays sync:** Collection/LazyCollection (sync iterables), Str, Arr, Config, Container resolution, Pipeline construction, route matching, SQL grammar compilation (`toSql()`), query *building*, model attribute get/set/casts/dirty tracking/serialization (`toArray`, `toJson`), Blade *compilation*, validation of pure rules, Carbon, Encryption/Hashing (through node:crypto / `Bun.password` sync variants), Events dispatch *mechanics*.
2. **Only IO terminals are async.** Builders are thenable plus explicit `get()`. `save()/delete()/refresh()/push()` return Promises. `cursor()`/`lazy()` return `AsyncIterable` (`for await`). `chunk(n, async cb)` runs sequentially.
3. **No implicit lazy loading.** Property access `user.posts` returns the loaded relation, or **throws `LazyLoadingViolationException`**. This is Laravel's own `Model::preventLazyLoading()` strict mode made the default, so there's an upstream precedent and upstream tests (`EloquentStrictLoadingTest`). Remedies: `with()`, `await user.load("posts")`, `await user.loadMissing(...)`, `Model.automaticallyEagerLoadRelationships()` (Laravel 12+ relation autoload, done at query time in batch), and `await user.posts().get()`. Optionally `await user.relation("posts")`, which loads if missing.
4. **Async-aware callback slots:** model events, observers, listeners, policies, transaction closures, `Cache.remember(key, ttl, async () => ...)`, closure validation rules. All of them are awaited **sequentially, in registration order**, because Laravel's tests assert query-log order and halting semantics (`until`, `saving → false`).
5. **Collections stay sync**, with explicit async companions: `await users.eachAsync(u => u.save())`, `mapAsync` (sequential by default, `{concurrency: n}` opt-in). Higher-order `users.each.save()` returns a Promise when the target method is async.
6. **Validation:** `await validator.validate()` / `passes()` (async because DB rules exist). `validator.validateSync()` throws if a rule needs IO.
7. **Views:** compile Blade to **async render functions** (`await` permitted inside compiled templates for components and `@inject`). Lazy relation access inside templates still throws, so data must be eager-loaded. That's better practice anyway.
8. **Connection state needs AsyncLocalStorage.** PHP keeps transaction level, query log, `DB::listen`, `afterCommit` callbacks and `setTestNow` per process, which is effectively per request. In Bun they must be **per async context**: `DB.transaction(async () => ...)` checks out a dedicated pool connection and binds it through ALS, so concurrent requests can't interleave inside one transaction. This is the hidden hard part of the async port. Risk H. Prototype it in the first DB epic.
9. **Guardrails:** typescript-eslint `no-floating-promises`, `await-thenable`, `no-misused-promises` (type-aware) in CI for the framework *and* the ported tests. Make builders thenable only through `then()` that resolves to **non-thenable** values (resolving a thenable with itself loops forever). Mark Promise-returning methods with a lint-visible return type.

### 4.3 Effect on test porting
- The translator adds `async`/`await` mechanically. Then the **type checker plus floating-promise lint act as the fixer oracle**: diagnostics like "Promise not awaited" or "await on non-thenable" are fed back to the agent in the retry loop (Airbnb pattern). Expect most Database/Integration test bodies to become `async` with about 3–10 awaits each.
- Tests that assert lazy-loading-by-property behaviour get rewritten to `await load()` style, with reason `intentional-divergence: async-relations` (one ADR). Track how many: it is the cost of the decision.
- Sync-only components (Support, Collections, Container, Config, Str, Pipeline, Routing matching, SQL grammars) port with **no async edits**. Sequence them first. That's roughly 4–5k test methods with no async exposure, which gives early pass-rate momentum and validates the pipeline.

---

## 5. Testing infrastructure the port needs

### 5.1 Testbench equivalent (`@xaravel/testbench`)
Orchestra Testbench boots a throwaway Laravel app for package/framework tests. Hooks are `getPackageProviders`, `getEnvironmentSetUp`/`defineEnvironment`, `defineDatabaseMigrations`, `defineRoutes`, and attributes `#[WithConfig]`, `#[WithEnv]`, `#[DefineEnvironment]`, `#[WithMigration]`, `#[RequiresDatabase]` (https://packages.tools/testbench/the-basic/environment [S]). 291 Laravel test files use it.
- Port it as a **product package**. App packages need it too.
- TS shape: `class TestCase extends TestbenchTestCase { protected packageProviders() {...}; protected defineEnvironment(app) {...} }`. Attributes become static decorators or per-test option objects: `test("x", withConfig({...}, async () => ...))`.
- Responsibilities: fresh app per test (`beforeEach`), facade root reset, fake clearing, Carbon test-now reset, ALS context per test, migration runner, `RefreshDatabase`/`DatabaseTransactions`/`DatabaseMigrations`/`LazilyRefreshDatabase` traits, HTTP kernel testing that calls Hono `app.fetch(new Request(...))` directly with no socket, console kernel testing (`artisan()` with expected output), and the `TestResponse` assertion API.
- The Testing component's own tests (402) and the Foundation testing traits make this self-verifying.

### 5.2 Databases on Bun
- Drivers: Bun.SQL covers Postgres, MySQL/MariaDB and SQLite (`adapter`), with a single tagged-template API [S]. SQLite also has sync `bun:sqlite`. **SQL Server is not in Bun.SQL**: use `tedious`/`mssql` from npm, or mark `needs-infra` and defer (Laravel's CI runs it, but it's lower priority).
- The connection layer must expose Laravel's semantics on top of Bun.SQL: PDO-like statement preparation with `?` bindings (Bun.SQL is tagged-template first; check its unsafe/parameterized raw-query API [M]), fetch modes, `lastInsertId`, affected rows, `SQLSTATE` error codes for `UniqueConstraintViolationException`/`LostConnection` detection, and pool checkout for transactions (§4.2.8).
- Containers: copy Laravel's CI matrix (`databases.yml`, §0) as **docker compose services in CI**, which is simpler and deterministic. Optionally use `testcontainers` for local dev [M: check that testcontainers-node runs under Bun]. Locally, default to **SQLite in-memory** (the bulk of `tests/Database` unit tests and Integration `Sqlite` run there), then Postgres and MySQL. Defer MariaDB versions and MSSQL.
- Per-test isolation: transaction rollback (`DatabaseTransactions`) for speed, `RefreshDatabase` for schema tests. Run test files in parallel with **one database/schema per worker** (`DB_DATABASE=xaravel_test_${workerId}`) to avoid cross-file interference. Check whether bun:test parallelism happens across files or processes [M].
- Redis/Memcached/DynamoDB for Cache, Queue and Session: Bun has a built-in Redis client (Bun 1.2.9+) [M]. Put these behind `needs-infra` tags and run them in separate CI jobs, as Laravel does (`redis.yml`, `queues.yml`) [V: workflow names].

### 5.3 Fakes (`Mail::fake`, `Queue::fake`, `Http::fake`, `Event::fake`, `Bus::fake`, `Notification::fake`, `Storage::fake`, `Process::fake`, `Exceptions::fake`)
- These are **product code** in Laravel (`Illuminate\Support\Testing\Fakes\*`). Port them with their tests, since 431 test sites call them. The mechanism is a container `instance()` swap through `Facade::swap`, plus recorded calls and `assertSent/assertPushed/assertDispatched` with closure predicates (may need to be async-aware).
- `Http::fake` lives in Laravel's Http client (a Guzzle wrapper). Build the Xaravel client on `fetch`, and fake it by swapping the client's transport, not by global `fetch` mocking. Put `preventStrayRequests()` in the test base class.
- Time: Carbon test-now plus `freezeTime/travel/travelTo` helpers (from the Foundation testing traits).
- Mockery shim (§2.3) for `Facade::shouldReceive`.

---

## 6. Recommended test-porting pipeline (summary)

1. **Pin and baseline.** Fix the upstream SHA. Run the real PHPUnit suite across Laravel's DB matrix to get `baseline.xml` (JUnit) and `--list-tests-xml`. Mark upstream skips and failures.
2. **Inventory.** A php-parser AST pass emits `inventory.json` (stable `FQCN::method#dataset` IDs, component, tags: db/async/mock/fake/time/regex/closure-serialization/needs-infra, difficulty score, dependencies on src classes).
3. **Decide idioms once.** `PORTING.md` holds the mapping table for §3 and §4 and the ADRs for async, injection, arrays and class registry. Build the `phpunit-compat`, `mockery`, `testbench` and custom-matcher shims first. Pilot the pipeline on 3–5 test files in Support.
4. **Fixture extraction.** Where tests are data (Str, Arr, Pluralizer, SQL grammars, validation messages, date formats), dump PHP-produced input→output fixtures with a small PHP script, and generate TS tests from them (golden or differential, in the tsgo/Ladybird style).
5. **Staged agent translation per file:** translate → `tsc` → floating-promise lint → `bun test` → classify into `expectations.json`. Retry per stage. Two adversarial reviewers check fidelity against the PHP test (no weakened assertions, no deleted cases), with anti-stub rules.
6. **Implement against red tests**, ordered by component topology, sync core first (Support/Collections/Container/Config/Pipeline/Events mechanics → Database grammar/query building → connections/Eloquent async → HTTP/Routing on Hono → Validation → View → Queue/Cache/Mail/...). Use concise agent-oriented harness output and a sampled `--fast` mode.
7. **Ratchet and report.** CI fails on unexpected pass or fail. The dashboard shows per-component % of full inventory and of the enabled set, by skip reason. Add a weekly differential run against PHP Laravel for textual outputs, and a few end-to-end skeleton apps as a second verification layer.

---

## 7. Open questions and uncertainty flags
- Bun features I didn't verify this session: `test.failing`, `test.skipIf`, `setSystemTime`, fake timers, `mock.module`, how test files run in parallel, the built-in Redis client, and the Bun.SQL raw parameterized query API. **Check them against current Bun docs before building the shims.**
- PHPUnit `--list-tests-xml` behaviour on PHPUnit 12/13 [M].
- The Bun vs Deno Node-compat percentages come from secondary coverage and measure different things.
- Temporal in Bun/JSC: no evidence it ships, so plan on a polyfill.
- The Atomics.wait sync-bridge overhead on Bun hasn't been measured. Option B is rejected on architectural grounds, not on benchmarks.
- Regex counts in §0 are approximate (±5%) and test-method counts exclude data-set expansion. Read the exact denominator from step 1.
