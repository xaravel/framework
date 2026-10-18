# Upstream scans: facades, singletons and boot-only state

Two static scans turn Upstream source into committed data that later work reads (Story 3.6):

- the facade generator (Story 28.x) reads `conformance/scans/facades.jsonl`;
- the singleton lint (Story 6.3) reads `tools/lint-rules/singletons.json`;
- AD-5's sealed-write guard reads `conformance/boot-only-state`.

The scans are TypeScript. They read only the snapshot in `conformance/upstream/` (see [upstream.md](upstream.md)), run no PHP and start no container, and never fetch anything. Both share a small PHP lexer in `tools/scans/php.ts`.

## Commands

| Command | What it does |
| --- | --- |
| `bun run scan:facades` | Writes `conformance/scans/facades.jsonl`. |
| `bun run scan:singletons` | Writes `tools/lint-rules/singletons.json` and `conformance/boot-only-state`. |
| `bun run scan:facades --check` | Builds the file in memory and compares it byte for byte with the committed one. Prints `facades drift: <file> …` for a differing or missing file and exits 1. Writes nothing. |
| `bun run scan:singletons --check` | The same for both singleton outputs, with `singletons drift: <file> …` lines. |

Both take `--root <dir>` to scan another checkout. Exit codes: 0 pass, 1 any failure, 2 usage error. If a scan fails, it writes nothing, and the message names the file and line, or the facade.

`scan:singletons` (with or without `--check`) also prints one line per binding whose `class` is null, for review:

```
singletons: class null, for review: <provider> <abstract> (<file>:<line>)
```

Without a synced snapshot both fail and tell you to run `bun run upstream:sync`.

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

The file is `{"comment","bindings","classes"}`, in that key order and indented by 2 spaces, with one binding object per line:

- bindings are deduplicated and sorted by provider, then abstract, then class (null first);
- `classes` lists the non-null `class` values, unique and sorted.

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
- **Boot-reachable methods.** A method of C is boot-reachable when either holds:
  - its name is called as `->name(` or `::name(` at a boot entry point;
  - it has at least one caller among C's analysed methods (`$this->name(`, `static::name(`, `self::name(`) other than itself, and every such caller other than itself is boot-reachable or construction. This is computed to a fixed point.

  Method names compare case-insensitively, as in PHP.
- **Boot-only.** P is boot-only when it has at least one non-construction write and every method that writes it is boot-reachable. A runtime write makes P not boot-only.

For example, at the Pin `UrlGenerator::$request` is not listed: `RoutingServiceProvider::requestRebinder` calls `setRequest` inside the rebinding closure, which runs per request, so AD-5 keeps it in frame state. `Router::$groupStack` is listed, because `group()`, which pushes it and `array_pop`s it, is called at a boot entry point (`Route::group(...)` in `McpServiceProvider::registerRoutes`, reached from `boot()`); AD-5 makes route registration boot-only after `sealed`.

The rule matches methods by name, so a common name that some provider calls can pull in too much. Treat the file as a reviewed seed. When Xaravel needs its own entries, extend the generator rather than hand-editing the file: `--check` flags any hand edit.

## CI

The `upstream` job in `.github/workflows/ci.yml` runs these steps in order:

1. `bun run upstream:sync`
2. `bun run upstream:check`
3. `bun run scan:facades --check`
4. `bun run scan:singletons --check`
5. `bun test conformance/tests/xaravel/scans.test.ts`

The snapshot is gitignored and exists only after the sync, so the scan checks must come after it. If a committed scan output no longer matches the snapshot, the job fails. Step 5 runs the Xaravel Tests' real-snapshot assertions (the committed outputs against the scan, and the expected classes and entries at the Pin), which skip in the `check` job because it has no snapshot (ESC-3.6-1).

## After a Pin move

1. Run `bun run pin:bump <tag>` and `bun run upstream:sync` as usual (see [upstream.md](upstream.md)).
2. Run `bun run scan:facades` and `bun run scan:singletons`.
3. If a scan fails on a new Upstream shape, extend the rule in `tools/scans/` and its Xaravel Test in `conformance/tests/xaravel/scans.test.ts`. Do not edit the outputs by hand.
4. Review the diff of the three outputs, and the null bindings the singleton scan prints, and commit them with the Pin change.

All three outputs and `tools/scans/` are Protected Paths (under `/conformance/` and `/tools/`), so they land only through Maintainer review.
