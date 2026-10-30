# Upstream scans

Five static scans turn Upstream source into committed data that later work reads (Stories 3.6 and 3.7):

- the facade generator (Story 28.x) reads `conformance/scans/facades.jsonl`;
- the singleton lints (Story 6.3) read `tools/lint-rules/singletons.json`;
- AD-5's sealed-write guard reads `conformance/boot-only-state`;
- the closure codec (AD-14) reads `conformance/scans/allowed-identifiers.json`;
- `PORTING.md` (AD-7, AD-26, Epic 8) reads `conformance/scans/div12-pairs.jsonl`;
- the grader coverage reports (Stories 4.4 and 4.6, FR-116, FR-100) read `conformance/scans/phpunit-assertions.jsonl` and `conformance/scans/mockery-api.jsonl`.

The scans are TypeScript. They read only the snapshot in `conformance/upstream/` (see [upstream.md](upstream.md)), run no PHP and start no container, and never fetch anything. `scan:test-api` also reads the committed Inventory, and `scan:singletons` the committed `conformance/scans/facades.jsonl` (so regenerate facades first when both change). These five share a small PHP lexer in `tools/scans/php.ts` and one CLI (`runScan` in `tools/scans/facades.ts`).

A sixth, separate scan is report-only: `bun run scan:builtins <component>` uses the same lexer but commits no output, does not use `runScan` and has no `--check`. It prints the PHP functions and constructs an Upstream Component calls that `@xaravel/runtime/php` does not export yet, to run before an Upstream Component epic's first Story. See [builtin-scan.md](builtin-scan.md).

## Commands

| Command | What it does |
| --- | --- |
| `bun run scan:facades` | Writes `conformance/scans/facades.jsonl`. |
| `bun run scan:singletons` | Writes `tools/lint-rules/singletons.json` and `conformance/boot-only-state`. |
| `bun run scan:facades --check` | Builds the file in memory and compares it byte for byte with the committed one. Prints `facades drift: <file> …` for a differing or missing file and exits 1. Writes nothing. |
| `bun run scan:singletons --check` | The same for both singleton outputs, with `singletons drift: <file> …` lines. |
| `bun run scan:closures` | Writes `conformance/scans/allowed-identifiers.json`. |
| `bun run scan:div12` | Writes `conformance/scans/div12-pairs.jsonl`. |
| `bun run scan:test-api` | Writes `conformance/scans/phpunit-assertions.jsonl` and `conformance/scans/mockery-api.jsonl`. |
| `bun run scan:builtins <component>` | Prints the PHP builtins the Component's Upstream code calls that the runtime lacks; writes nothing and has no `--check` ([builtin-scan.md](builtin-scan.md)). |
| `bun run scan:<name> --check` | The same check for each of them, with `closures drift:`, `div12 drift:` or `test-api drift:` lines. |

All take `--root <dir>` to scan another checkout. Exit codes: 0 pass, 1 any failure, 2 usage error. If a scan fails, it writes nothing, and the message names the file and line, or the facade.

`scan:singletons` (with or without `--check`) also prints one line per binding whose `class` is null, for review:

```
singletons: class null, for review: <provider> <abstract> (<file>:<line>)
```

Without a synced snapshot every scan fails and tells you to run `bun run upstream:sync`.

## The lexer and index (`tools/scans/php.ts`)

The lexer produces these tokens, each with its line:

- comments, with a docblock kept as its own token;
- `#[…]` attributes, each kept as one token;
- single- and double-quoted strings, heredoc and nowdoc. A string token keeps its literal value, or null when it interpolates;
- variables, names (with `\`), numbers and punctuation, including `->`, `?->`, `::`, `=>` and the compound assignments.

On top of the tokens, the parser reads the namespace and the `use` imports, including aliases and groups. It skips `use function` and `use const`. It resolves class names the way PHP does.

The index covers every class, interface, trait and enum in the `src/` of `framework`, `ai`, `mcp` and `boost`. It reads `.php` files only, skipping `.blade.php`, and walks the files in sorted order. For each declaration it records:

- the FQCN, the kind and whether it is abstract;
- the resolved `extends` and the traits it uses;
- the file;
- the methods and properties, with their token ranges.

## `conformance/scans/facades.jsonl`

The scan writes one line for every class in `framework/src/Illuminate/Support/Facades/*.php` that extends `Illuminate\Support\Facades\Facade`. The base `Facade` itself gets no line. Lines are sorted by `facade` (UTF-16 code units), written as compact JSON with LF endings. Each line has these keys, in this order:

```
{"facade","accessor","root","methods"}
```

- **`accessor`** is what `getFacadeAccessor()` returns: the string for `'key'`, or the resolved FQCN, without a leading `\`, for `X::class`. Any other return shape fails the run.
- **`root`** is the accessor itself when the accessor is a non-abstract class in the index. Otherwise it is the first `@see \X` in the class docblock where X is in the index as a class and is outside `Illuminate\Support\Testing\Fakes\`. URLs are skipped. If neither rule gives a root, the run fails. Laravel's facade documenter writes the `@see` tags from the resolved facade root, so this is Upstream's own record of the root.
- **`methods`** lists every `@method` line in docblock order. Each entry is `{"name","static","returns","parameters","signature"}`:
  - `signature` is the text after `@method `, trimmed;
  - `returns` is the return type text, or null when there is none;
  - `parameters` is the raw text inside the outer parentheses.

  A `@method` line that does not parse fails the run, naming the file and line.

## `tools/lint-rules/singletons.json`

A **provider** is an indexed class whose `extends` chain reaches `Illuminate\Support\ServiceProvider`. A **binding** comes from either of these places in a provider:

- a `->singleton(` or `->singletonIf(` call anywhere in its methods, closures included;
- an entry of its `$singletons` property array.

Each binding is `{"provider","abstract","class"}`.

- **`abstract`** is the first argument: a string literal, or the resolved FQCN of `X::class`. A `$singletons` key works the same way.
- **`class`** is the class the binding builds. The first rule that applies gives it:
  1. the second argument's FQCN when that argument is `X::class` (or a keyed `$singletons` value is `X::class`);
  2. the abstract, when there is no second argument (or the `$singletons` entry has no key), the abstract is a FQCN, and it is a non-abstract class in the index. An interface, an abstract class or an unindexed FQCN gives null;
  3. for a closure, its declared return type, when that is a single class name;
  4. for a closure, X, when every `return` (or the `fn` body) at the closure's own depth builds the same X in one of these shapes (ESC-3.6-1):
     - `new X(...)`;
     - `(new X(...))` followed by a `->m(...)` chain, where each m is declared in X's indexed hierarchy and its body ends `return $this;` (for example `(new CookieJar)->setDefaultPathAndDomain(...)`);
     - `tap(new X(...), ...)` (for example the queue manager);
     - `$v`, when the closure's only assignment to `$v` at its own depth is `new X(...)` (for example `$trans = new Translator(...); ...; return $trans;`).

     Nested closures and anonymous classes are not looked into;
  5. otherwise null. For example, `fn ($app) => $app->make(X::class)` gives null, and so does a closure that returns what a provider helper method builds (`view`). Null bindings stay in `bindings`, and the run prints each one for review.

A closure's `new X` or return type may name a class outside the index (a vendor class such as Symfony's `Psr16Adapter`); the scan keeps it.

A variable as the first argument is resolved only by the **foreach rule**:

- the variable is the value variable of an enclosing `foreach ($param as … => $var)`, and `$param` is a parameter of the enclosing method M;
- every `$this->M(` call in the class passes `$this->prop` or `array_merge($this->p1, …)`;
- the values of each such property's array are all `X::class`.

Each X then gives a binding with abstract = class = X, and every X must be in the index. At the Pin this covers `ArtisanServiceProvider::registerCommands`.

Any other argument shape, or a variable abstract the rule does not resolve, fails the run and names the file and line.

The file is `{"comment","bindings","classes","bootOnly"}`, in that key order and indented by 2 spaces, with one binding object per line:

- bindings are deduplicated and sorted by provider, then abstract, then class (null first);
- `classes` lists the non-null `class` values, unique and sorted;
- `bootOnly` has one `{"property","writers"}` object per line for each entry of `conformance/boot-only-state` (below), sorted by property. `property` is the same `<FQCN>::$<property>` text; `writers` lists the lower-case names of the non-construction methods that write it, sorted, all boot-reachable. They are the class's register/boot path for that property: Story 6.3's `xaravel/no-boot-only-write` lint allows writes to the property only there and in the constructor ([lint.md](lint.md)). Publishing them here keeps `conformance/boot-only-state`'s line format, which AD-5's runtime guard reads, unchanged.

## `conformance/boot-only-state`

The file has a `#` comment header that names the generator, then one `<FQCN>::$<property>` line per entry, sorted and unique. The entries come from each class C in `classes`:

- **Analysed methods.** C's own methods, plus those of its indexed ancestors and of the traits they use, transitively.
- **Targets.** `$this->P`, or `static::$P`, `self::$P`, `parent::$P` or `ClassName::$P` for a ClassName among C's analysed declarations, followed by any `[…]` / `->x` chain. The property name must be literal.
- **Writes.** A write to P is one of:
  - a target followed by `=`, a compound assignment, `++` or `--`, or preceded by `++` / `--`;
  - an `unset(` of a target;
  - a target inside a `list(…)` or `[…]` destructuring on the left of `=`;
  - `&` directly before a target (a reference);
  - a target as the first argument of `array_pop`, `array_push`, `array_shift`, `array_unshift`, `array_splice`, `sort`, `rsort`, `usort`, `uasort`, `uksort`, `ksort`, `krsort`, `asort`, `arsort`, `natsort`, `natcasesort` or `shuffle`.

  A write belongs to the method whose own depth holds it. A write inside a closure, an arrow function or an anonymous class nested in a method is a **runtime write**: it runs later, not as part of that method. The same holds for a `$this->name(` call inside a nested closure: it is a runtime caller.
- **Construction.** `__construct` is construction, and so is a method whose every caller among C's analysed methods (other than itself) is construction, with at least one such caller. Writes in construction methods are ignored.
- **Boot entry points.** The calls at the top level (outside any closure) of every provider's `register()` and `boot()`, plus the top-level calls of the provider methods reached from those by a top-level `$this->m(`, transitively (inherited provider methods included). A call inside a closure is not a boot entry point (ESC-3.6-1). That covers rebinding, resolving and listener callbacks, which run later, and also `booted` callbacks, even though `Application::boot()` fires them at the end of boot (`RouteServiceProvider::register` loads routes in `$this->booted(...)`). State written only from a `booted` callback is therefore under-listed: it stays unsealed, which is the safe direction. A first-class callable (`->m(...)`) is not a call.
- **Receivers (Story 6.3).** A boot entry call `->m(` or `::m(` seeds method m of class C only when its receiver resolves to C. The receiver shapes are:
  - `F::m(`, where F (resolved through `use`) is a facade whose accessor is bound to C or is C. The facades are the lines of `conformance/scans/facades.jsonl`, plus any other non-abstract indexed class whose `extends` chain reaches `Illuminate\Support\Facades\Facade` and whose `getFacadeAccessor()` returns a string literal or `X::class` (the package facades outside `Support/Facades`, such as `Laravel\Mcp\Facades\Mcp`);
  - `X::m(`, where X resolves to C;
  - `$this->app->make(K)->m(`, `$this->app[K]->m(`, `app(K)->m(` or `resolve(K)->m(`, where K is a string literal or `Y::class` and is bound to C (some binding has abstract K and class C) or is C.

  Any other receiver seeds nothing: a variable, `$app->make(…)`, `static::` / `self::` / `parent::`, an abstract bound to no class. Before Story 6.3 any receiver seeded the name on every class (ESC-3.6-1's reading), which listed 21 false entries such as `QueueManager::$connectors` and `Gate::$afterCallbacks` because some provider called an unrelated `->addConnector(` or `->after(` (Epic 3 retro S5). Dropping the `*Manager::$customCreators` entries is safe: AD-5 makes `extend` base-only after `sealed` independently of this file.
- **Boot-reachable methods.** A method of C is boot-reachable when either holds:
  - it is seeded by a boot entry call whose receiver resolves to C;
  - it has at least one caller among C's analysed methods (`$this->name(`, `static::name(`, `self::name(`) other than itself, and every such caller other than itself is boot-reachable or construction. This is computed to a fixed point.

  Method names compare case-insensitively, as in PHP.
- **Boot-only.** P is boot-only when it has at least one non-construction write and every method that writes it is boot-reachable. A runtime write makes P not boot-only.

At the Pin the file lists 5 properties: `Router::$groupStack` (writers `group`, `updategroupstack`), the three `ParallelTesting` callback lists (`setupprocess`, `setuptestcase`, `teardownprocess`), and `Laravel\Mcp\Server\Registrar::$localServers` (`local`, from `Mcp::local(...)` in `BoostServiceProvider::boot`).

Story 6.3 dropped 21 entries the any-receiver rule listed. Each came from a boot call of the same method name on a receiver that does not resolve to the class (paths under `framework/src/Illuminate/`, lines at the Pin):

| Dropped entries | Writer | Boot call that seeded it | Why the receiver does not resolve to the class |
| --- | --- | --- | --- |
| `$customCreators` of `AuthManager`, `BroadcastManager`, `CacheManager`, `ConcurrencyManager`, `FilesystemManager`, `MaintenanceModeManager`, `HashManager`, `LogManager`, `MailManager`, `Notifications\ChannelManager`, `RedisManager`, `SessionManager`, `Laravel\Ai\AiManager`; `Validation\Factory::$extensions`; `View\Compilers\BladeCompiler::$extensions` | `extend` | `$this->app->extend(` (`Routing/RoutingServiceProvider.php:70`) | the receiver is the container (`$this->app`), not a resolved manager |
| `Queue\QueueManager::$connectors` | `addconnector` (reached from `QueueManager::extend`) | `$this->app->extend(` (`Routing/RoutingServiceProvider.php:70`) | the container again; `QueueServiceProvider` calls `addConnector` only inside closures |
| `Auth\Access\Gate::$afterCallbacks` | `after` | `Str::after(` (`Encryption/EncryptionServiceProvider.php:65`) | `Str` is not bound to `Gate` and is not a facade for it |
| `Queue\QueueRoutes::$routes` | `set` | `$config->set(` (`Support/ServiceProvider.php:168`, `mergeConfigFrom`) | a local variable |
| `Routing\Router::$binders` | `bind` | `$this->app->bind(` (`Auth/AuthServiceProvider.php:49` and 13 more) | the container, not the router |
| `Translation\Translator::$handleMissingTranslationKeys` | `has`, `handlemissingtranslationkey` (reached from `has()` through `get()`) | `$this->app->has(` (`Foundation/Providers/FoundationServiceProvider.php:74`) | the container, not the translator |
| `View\Engines\EngineResolver::$resolvers` | `register` | `$this->app->register(` (`Support/AggregateServiceProvider.php:31`), `parent::register(` (`Foundation/Providers/FoundationServiceProvider.php:88`), `HtmlDumper::register(` / `CliDumper::register(` (lines 133 and 134) and 3 more | the container, the parent provider, or unrelated classes |

App-level `extend`, `bind`, provider registration and `Blade.directive` writes do not need this file: AD-5's base-only API guard makes them throw `ScopeFrameException` after `sealed` (outside a test frame) whatever the receiver.

For example, at the Pin `UrlGenerator::$request` is not listed: `RoutingServiceProvider::requestRebinder` calls `setRequest` inside the rebinding closure, which runs per request, so AD-5 keeps it in frame state. `Router::$groupStack` is listed, because `group()`, which pushes it and `array_pop`s it, is called at a boot entry point (`Route::group(...)` in `McpServiceProvider::registerRoutes`, reached from `boot()`); AD-5 makes route registration boot-only after `sealed`.

The rule matches methods by name, so a common name that some provider calls can pull in too much. Treat the file as a reviewed seed. When Xaravel needs its own entries, extend the generator rather than hand-editing the file: `--check` flags any hand edit.

## `conformance/scans/allowed-identifiers.json`

The closure codec (AD-14) allows only these free identifiers, besides parameters and ECMAScript built-ins. The file is `{"comment","facades","helpers"}`, in that key order, indented by 2 spaces with one name per line, LF-terminated. Both lists are sorted by UTF-16 code unit.

- **`facades`** is the short name (the last `\` segment) of every non-abstract indexed class whose `extends` chain reaches `Illuminate\Support\Facades\Facade`, `Facade` itself excluded. That includes facades outside `Support/Facades` (`Laravel\Ai\Ai`, `Laravel\Boost\Boost`, `Laravel\Mcp\Facades\Mcp` at the Pin). Two facades with the same short name fail the run, naming both FQCNs. Non-facade aliases such as `Str` and `Arr` are not listed.
- **`helpers`** is every global helper function name: each `function <name>(` (or `function &<name>(`) in a `src/` file that has no `namespace` statement, outside any class, interface, trait or enum body, anonymous classes included. Closures, arrow functions and methods are not helpers. The names are deduplicated. At the Pin they come from `Foundation`, `Support`, `Collections` and `Reflection` `helpers.php`.

## `conformance/scans/div12-pairs.jsonl`

One line per indexed class, trait or enum D (interfaces are skipped) and name N that is both a property and a method of D (case-sensitive). Lines are `{"class","name","classification","property","method"}`, sorted by `class`, then `name`, compact JSON with LF endings.

- **Member set.** D's own methods and properties, those of the traits it uses, and those of its indexed ancestors and their traits, transitively. Promoted constructor properties (a parameter with `public`, `protected`, `private` or `readonly`) are properties.
- **`property`, `method`.** Each is `{"declaredIn","static"}`. `declaredIn` is the nearest declaration that declares the member, in the order D, D's traits, then each ancestor followed by its traits.
- **`classification`**, first match wins (ESC-3.7-1):
  - **Model hierarchy.** D is `Illuminate\Database\Eloquent\Model`, a class whose chain reaches it, or a trait in Model's transitive trait set (its own and its ancestors'). Then `casts` is `option-pair` (AD-7) and every other name is `model-config`.
  - `option-pair`: N is an option name and D is an option holder.
    - An **option name** is one of AD-26's named option pairs (`casts`, `middleware`, `backoff`, `tries`, `timeout`, `uniqueId`, `uniqueFor`, `retryUntil`, `attachments`, `envelope`, `content`, `via`, `broadcastOn`), or a name some method body in the `src/` trees reads as `method_exists($v, 'N')` together with a property read `$v->N` (not followed by `(` or an assignment operator) on the same plain, non-`$this` variable. That is AD-26's "call if function, else value" read.
    - An **option holder** is a class or trait whose hierarchy (D, its indexed ancestors and the traits they use, transitively) implements `Illuminate\Contracts\Queue\ShouldQueue` or `Illuminate\Contracts\Broadcasting\ShouldBroadcast` (directly, or through an indexed interface that extends one), uses `Illuminate\Bus\Queueable`, or whose `extends` chain reaches `Illuminate\Mail\Mailable` or `Illuminate\Notifications\Notification`.
  - `method-plus-state`: otherwise.

At the Pin the spine's anchors hold: `Model`/`casts` is `option-pair` and `Query\Builder`/`timeout` is `method-plus-state`. `Model` declares `$connection` but no `connection()` method at the Pin, so it has no `connection` pair; the rule would classify one as `model-config`.

## `conformance/scans/phpunit-assertions.jsonl`

One `{"name","calls","executions"}` line per assertion name, sorted by name.

- **Names.** N matches `assert[A-Z]…` or `expect[A-Z]…`, is `fail`, `markTestSkipped` or `markTestIncomplete`, or matches an Inventory kind case-insensitively (which is how a lower-case `assertequals(` is recognised). Names are grouped case-insensitively, as PHP calls them, and a name is written in the case of the Inventory kind that matches it (so `$this->assertequals(` counts under `assertEquals`), otherwise in the case of its first call site.
- **`calls`** counts the PHPUnit call sites in the suites: every `.php` file (not `.blade.php`) under each repository's `tests/`, walked in sorted order (ESC-3.7-1). A call site is either:
  - `$this->N(`, `self::N(`, `static::N(` or `parent::N(` inside a suite class C, unless C's own indexed hierarchy declares N as a method, case-insensitively. The hierarchy is C, its ancestors and the traits they use, transitively, among the declarations of the four repositories' `src/` and `tests/`. Those are Laravel's or the suite's own helpers (`assertDatabaseHas` in a class using `InteractsWithDatabase`, say). A declaration in an unrelated class does not exclude a name, so `assertCount` is counted even though a `src/` class declares one. Calls outside any class (Pest closures) are not call sites.
  - `X::N(` where X resolves to `PHPUnit\Framework\Assert`, `PHPUnit\Framework\TestCase`, or an indexed class whose `extends` chain reaches `PHPUnit\Framework\Assert` (for example `Illuminate\Testing\Assert`).
- **`executions`** is the sum of each line's `assertions[N]` over every `conformance/inventory/<component>.jsonl` except `oracle-nondeterminism.jsonl`. A null `assertions` (a test the baseline did not run) adds nothing. These are the PHPUnit `Assert` kinds the Story 2.6 baseline recorded (FR-1). They count every `Assert` call PHPUnit saw, including indirect ones (a Laravel `TestResponse` helper calling `assertThat`, say), so `calls` and `executions` measure different things: `assertThat` has 1 call site but over 3000 executions, and `assertSameSize` runs only through helpers.

A name is listed when either count is above 0. A name with calls but no executions stays listed with `executions: 0`, and the scan prints it for review. Story 4.4's coverage report may exclude such a name only through an approved Escalation.

```
test-api: never executed at the baseline, for review: <name> (<n> calls)
```

## `conformance/scans/mockery-api.jsonl`

One `{"name","static","count"}` line per Mockery method, sorted by name with `false` before `true`. Names are grouped case-insensitively, as PHP calls them, and written in the case of their first call site in walk order (so `->andreturn(` counts under `andReturn`). `count` is the number of call sites in the suites:

- **Static.** `X::N(` where X resolves to `Mockery` (so `use Mockery as m; m::mock(` counts, and an `m` alias of another class does not). It gives `static: true`.
- **Chain starters** are `shouldReceive`, `shouldNotReceive`, `shouldHaveReceived`, `shouldNotHaveReceived`, `shouldHaveBeenCalled`, `shouldNotHaveBeenCalled`, `shouldIgnoreMissing`, `shouldAllowMockingProtectedMethods`, `shouldAllowMockingMethod`, `shouldDeferMissing`, `makePartial`, `allows` and `expects`.
- **Chain.** A chain starts at `->E(` for a chain starter E, or at a facade's `X::E(`, where X resolves to an indexed class whose chain reaches `Illuminate\Support\Facades\Facade` (`File::shouldReceive(`, ESC-3.7-1). `allows` and `expects` with arguments start a chain only when their first argument token is a string literal or `[`, so PHPUnit's `->expects($this->once())` does not count. E itself counts, and so does every following `->M(` in the chain, as `static: false`. Argument lists are skipped, and the chain ends at the first token after a `)` that is not `->`. Chains and static calls inside an argument list (a closure passed to `with`, say) are counted on their own.
- **Mocked methods.** After an argument-less `shouldReceive()`, `shouldHaveReceived()`, `shouldNotHaveReceived()`, `allows()` or `expects()`, the next `->M(` is the mocked method (`$spy->shouldHaveReceived()->foo()->once()`). It is not counted, and the chain continues after its `)`.
- **After a static call.** After a static Mockery call's `)`, only a `->E(` with E a chain starter starts a chain. Any other `->M(` is the mocked class's method and is not counted (`Mockery::mock(X::class)->foo()`).

## CI

The `upstream` job in `.github/workflows/ci.yml` runs these steps in order:

1. `bun run upstream:sync`
2. `bun run upstream:check`
3. `bun run scan:facades --check`
4. `bun run scan:singletons --check`
5. `bun run scan:closures --check`
6. `bun run scan:div12 --check`
7. `bun run scan:test-api --check`
8. `bun install --frozen-lockfile --ignore-scripts` (porting.test.ts imports `oxc-parser`)
9. `bun test conformance/tests/xaravel/scans.test.ts conformance/tests/xaravel/usage-scans.test.ts conformance/tests/xaravel/porting.test.ts`

The snapshot is gitignored and exists only after the sync, so the scan checks must come after it. If a committed scan output no longer matches the snapshot, the job fails. Step 9 runs the Xaravel Tests' real-snapshot assertions (the committed outputs against the scan, the expected classes and entries at the Pin, and the Upstream-sourced `PORTING.md` fixture entries, [porting.md](porting.md)), which skip in the `check` job because it has no snapshot (ESC-3.6-1).

## After a Pin move

1. Run `bun run pin:bump <tag>` and `bun run upstream:sync` as usual (see [upstream.md](upstream.md)).
2. Run `bun run scan:facades`, `scan:singletons`, `scan:closures`, `scan:div12` and `scan:test-api`. Run `scan:test-api` after any Inventory regeneration too, since its `executions` come from the Inventory.
3. If a scan fails on a new Upstream shape, extend the rule in `tools/scans/` and its Xaravel Test in `conformance/tests/xaravel/scans.test.ts` or `usage-scans.test.ts`. Do not edit the outputs by hand.
4. Review the diff of the outputs, the null bindings the singleton scan prints and the unexecuted assertions the test-API scan prints, and commit them with the Pin change.

All the outputs and `tools/scans/` are Protected Paths (under `/conformance/` and `/tools/`), so they land only through Maintainer review.
