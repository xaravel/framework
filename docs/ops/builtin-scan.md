# Runtime builtin scan

`bun run scan:builtins <component>` lists the PHP functions, language constructs, global constants and builtin classes that an Upstream Component's source, its tests and the vendor libraries it ports use by name, minus what `@xaravel/runtime/php` already exports, and the PCRE pattern literals the runtime's converter refuses. Epic 14 found these one blocked Story round at a time: 38 Escalations, 16 of its action items runtime builtins (Epic 14 retrospective, finding P1). Epic 15 found that functions-only, Upstream-only listings were not enough: Story 15.2 listed phpdotenv's and phpoption's builtins by hand, then blocked on PCRE forms, `DIRECTORY_SEPARATOR`, `array_reduce` and `EmptyIterator` (Epic 15 retrospective, P1 and L5; epic-15-retro-item-7). The scan lists them all up front.

It is an advisory report. Nothing is committed, the tool raises no Escalation, and it writes nothing except the vendor cache under `--sync`. A Story reads the listing and raises the Escalations.

## When to run it in the Story loop

Run it **before the first Story of an Upstream Component epic** (see the Story loop in `AGENTS.md`):

1. Run `bun run upstream:sync` if the snapshot is missing. If the Component ports vendor libraries, run `bun run scan:builtins <component> --sync` once (it needs the network). Then run `bun run scan:builtins <component>`.
2. In the epic's first Story, raise **every listed name in one round**: one `contract` Escalation (or one per runtime area) that names each missing function, construct helper, constant, class and refused PCRE form, before translating tests that need them. Do not wait for each test to block on one.
3. Run the scan again once the runtime work lands. An empty listing means the Component's Upstream and vendor code uses nothing the runtime lacks, within the limits below.

Later Stories of the epic can rerun it to check what is still missing.

## Command

```
bun run scan:builtins <component> [--root <dir>] [--sync [--remote <base>]]
```

`<component>` is a name from `tools/scaffold/packages.jsonl` with Upstream source or a vendor port: a framework Component (Upstream `illuminate/<name>`, scanned from `framework/src/Illuminate/<Dir>` with `kebab(Dir)` equal to the name), `ai`, `mcp` or `boost` (scanned from `<repo>/src`), or a vendor-only Component (below). `--root` scans another checkout.

- `--sync` fetches each vendor source of the Component that is missing from the cache or fails verification, then scans. It is the only network access the tool makes.
- `--remote <base>` (only with `--sync`) replaces the `https://github.com` prefix of each lock `source.url`, for a mirror or a local repository (`file:///path`).

Exit codes: 0 a listing (possibly empty), 1 a failure (missing snapshot, missing or modified vendor source without `--sync`, a failed fetch, a vendor package not in the lock, a malformed `vendor-ports.jsonl`, a lexer error; the message starts `scan:builtins: ` and names the file and line, or the package), 2 a usage error (no Component, an unknown Component or one with neither Upstream source nor a vendor package, such as `runtime`, a bad, repeated or valueless flag, `--remote` without `--sync`).

## Vendor ports

`tools/scans/vendor-ports.jsonl` records which vendor libraries each Component ports, one JSON row per line, sorted by `component` then `package`:

```
{"component":"config","package":"vlucas/phpdotenv","source":"epics.md Epic 15, AD-22"}
```

`component` is a row of `tools/scaffold/packages.jsonl`, `package` a composer name, `source` the citation that assigns the port: AD-22's table, an Epic's "Owns port(s) (AD-22)" line in `epics.md`, or a decision such as `decisions/ESC-15.2-4.md` (PhpOption and ResultType in `config`). Partial ports, such as the symfony/routing route compiler or the HttpKernel exceptions, are not listed. To add a row, cite its source, keep the file sorted, and check that the package is in the lock (XT-conformance-277 does).

A Component's vendor packages are its rows, plus its own `upstream` when its `kind` is `xaravel`, it has no Upstream source of its own (so not `boost`), and the lock names that package. Such a Component (`http-foundation`, `mime`, `finder`, `serializable-closure`) is **vendor-only**: the scan reads only its package's autoload files, no `conformance/upstream/` `src/` or test files.

Each package is looked up in the Oracle's committed lock, in `packages` and `packages-dev`: `conformance/oracle/locks/<repo>/composer.lock`, `<repo>` being `ai`, `mcp` or `boost` for those Components and `framework` for every other. A package the lock does not name fails the run.

### The vendor cache

A vendor source lives in `.cache/vendor/<package>@<commit>/` (git-ignored, never committed), `<commit>` being the lock's `source.reference`. `--sync` fetches it into a temporary sibling with `git init`, `git fetch --depth 1 <url> <commit>` and a checkout of `FETCH_HEAD` (`core.autocrlf=false`, `core.eol=lf`), checks that `git rev-parse HEAD` equals the lock's commit, records `HEAD^{tree}`, drops `.git`, checks that the checkout's tree hash (computed in TypeScript, as `upstream:check` does) equals it, clears the write bits and renames it into place. The tree hash is written to `.cache/vendor/<package>@<commit>.tree`. A failed fetch leaves nothing behind.

Every scan re-checks each vendor source: the `.tree` file must be present and equal the directory's tree hash. Without `--sync`, a missing source fails the run naming the package and telling the operator to run `bun run scan:builtins <component> --sync`, and a source edited since it was fetched fails it naming the package as modified. With `bun run scan:builtins <component> --sync`, either is fetched again; a fetch that fails leaves the existing cache as it was. The fetch runs git with no templates (`git init --template=`) and no hooks (`core.hooksPath=/dev/null`), and the `.tree` file is made read-only like the source. Nothing is ever written into `conformance/upstream/`.

## What it reads

- The `.php` files (not `.blade.php`) under the Component's Upstream `src/` directory.
- The test files `conformance/component-map` gives the Component, among those each repository's `phpunit.xml.dist` selects (`testFiles` and `componentForTest`).
- Every `.php` file under every repository's `src/` and `tests/`, only to learn which functions Upstream declares (helpers, Pest helpers in `tests/Pest.php`) and which names it calls.
- The vendor packages' autoload files in the cache: every `.php` file under each `psr-4`, `psr-0` and `classmap` directory (`""` is the package root), plus each `files` entry, minus any path holding an `exclude-from-classmap` segment (`/Tests/`). They are scanned as part of the Component: calls, strings, constants, classes, patterns, and their declarations.
- The runtime export names of `packages/runtime/src/php/index.ts`, and its PCRE converter `compilePattern` (`packages/runtime/src/php/pcre.ts`), both imported read-only.

It runs no PHP, and only `--sync` fetches.

## Output

One line per name, in groups: functions, constructs, constants, classes, then patterns, each group sorted by name (patterns by the literal's value). A site is `<file>:<line>`, `<file>` relative to `conformance/upstream/` or `vendor:<package>/<path in the package>`. `first` is the first site in walk order (the `src/` files sorted, then the test files sorted, then each vendor package's autoload files, packages by name), or the first string site for a `calls=0` line.

```
function <name> calls=<n> strings=<m> first=<site>
construct <name> calls=<n> first=<site> helper=<export or none>
constant <NAME> uses=<n> first=<site>
class <Name> uses=<n> first=<site>
pattern <JSON string of the literal's value> uses=<n> first=<site> refused=<JSON string of the thrown message>
builtins: <component>: <f> function(s), <k> construct(s), <n> constant(s) and <l> class(es) not in @xaravel/runtime/php; <p> refused pattern(s); <files> file(s) scanned.
```

`<files>` counts the vendor files too. Two runs print the same bytes.

## Rules

- **A call** is a name followed by `(` whose previous code token is not `->`, `?->`, `::`, `function`, `fn`, `new` or `const` (nor `&` right after `function` or `fn`; `$a & foo(` and `= &foo(` are calls), and which is not a PHP keyword (`if`, `foreach`, `catch`, `fn`, `use`, `static`, …). A leading `\` is dropped (`\ucfirst(` is `ucfirst`). A qualified name (`Foo\bar(`, `namespace\bar(`) is never a builtin. Comments, docblocks, attributes and strings are not code. Names compare lowercased, as PHP does.
- **Upstream-declared names are not listed.** A name is declared when a file under any repository's `src/` or `tests/`, or a scanned vendor file, has `function <name>(` outside a class-like body (including inside `if (! function_exists(...)) { }`), or imports it with a namespace-qualified `use function` (plain, aliased or grouped, `use function Foo\bar`, `use function Foo\{bar}`). A global import such as `use function tap;` declares nothing. A named `function` inside a class, interface, trait or enum body, anonymous classes included (`new class`, `new readonly class`), is a method and declares nothing.
- **Vendor globals are not listed.** This fixed list, from the test tools Upstream depends on, is never reported: Pest `test`, `it`, `describe`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, `dataset`, `uses`, `covers`, `arch`, `pest`, `todo`; Mockery `mock`, `spy`, `namedMock`, `anyArgs`, `andAnyOthers`, `andAnyOtherArgs`; symfony/var-dumper `dump`, `dd`.
- **`strings=`** counts the scanned files' literal strings passed as a whole call argument (`f('ucfirst', …)`: the string sits directly in the parentheses of a call, a `(` after a name that is not a keyword or construct, so `array('x')`, `isset('x')`, `if ('x')` and `match ('x')` never count, between `(` or `,` and `,` or `)`) whose value is a function name that some scanned, `src/` or `tests/` file calls by name, such as `array_map('ucfirst', $x)`. Array keys and values never count. A name used only as such a string can be listed with `calls=0`. A string argument that is not a callable but happens to name a called function (`$rules->add('date')`) is still counted, so check a `calls=0` line before raising it.
- **Coverage.** A function is not listed when some runtime export `e` has `norm(e) === norm(name)` or `norm(e) === "php" + norm(name)`, where `norm` lowercases and drops `_`. So `count`, `json_encode` (`jsonEncode`), `serialize` (`phpSerialize`) and `is_numeric` (`isNumeric`) are covered.
- **Constructs.** `array(`, `empty(`, `eval(`, `isset(`, `list(`, `match (`, `unset(` (each followed by `(`), and `clone`, `exit`, `die`, `print`, `include`, `include_once`, `require`, `require_once` and `yield from`. Those without `(` are skipped where they are a name: after `new`, `class`, `instanceof`, `case`, `goto`, `enum`, `interface`, `trait`, `extends` or `implements`, or before `::` or a named argument's `:` (`Exit::X`, `f(print: 1)`). Each has a fixed helper: `match` → `unhandledMatch`, `yield from` → `yieldFrom`, `empty` → `toBool`, the rest none. A construct whose helper is exported is not listed. A construct with `helper=none` is still listed, so the Story knows to translate it (for example `isset` and `unset` on a `PhpArray`).
- **Constants.** A constant is a code `name` token matching `^\\?[A-Z][A-Z0-9_]*$` (`PHP_EOL`, `\E_ALL`, `case FOO:` in a `switch`), listed without its `\`, that is
  - not `true`, `false` or `null` in any case, nor a keyword or construct;
  - not followed by `(`, `::` or `\` (`BAR::x()`, `Foo::BAR` and `Foo\BAR` are not constants; magic constants such as `__DIR__` never match);
  - not after `->`, `?->`, `::`, `new`, `function`, `fn`, `const`, `class`, `interface`, `trait`, `enum`, `extends`, `implements`, `instanceof`, `goto`, `namespace` or `use`;
  - not a type before a parameter or property (the next token a variable, `&`, `...` or `|`);
  - not an enum `case BAR` directly in an enum body (a `switch`'s `case BAR:` inside an enum method is listed), not a named argument `f(BAR: 1)`, not a declared name of a `const` statement (`const BAR = 1`, typed `const int BAR = 1`, multi `const A = 1, B = 2`), not inside a `use` statement, and not inside a trait `use` in a class body or an `extends` / `implements` list.

  A constant is declared, and not listed, when a top-level `const` (outside any class-like body) declares it, `define('BAR', …)` or `\define('BAR', …)` names it with a literal, or a namespace-qualified `use const Ns\BAR` imports it, in any file under any repository's `src/` or `tests/` or a scanned vendor file. Constants compare case-sensitively with the runtime exports (PHP constants are case-sensitive): `DIRECTORY_SEPARATOR` is covered only by an export of that exact name.
- **Classes.** A class position is a name after `new`, after `instanceof`, each name of an `extends` or `implements` list, each name inside `catch (…)` (a `|` union included), or a name before `::` that does not follow `->` or `?->` (`$this->model::query()` names no class). The name is listed when it resolves to a global class: `\X`; an unqualified `X` imported by a single-segment `use X;` or `use X as Y;` (written `Y`, listed as `X`); or an unqualified name in a file with no `namespace` declaration. Not listed: `self`, `static`, `parent`; an anonymous `new class` or `new readonly class`; a qualified name or an unimported unqualified name in a namespaced file (it names a namespaced class); a name imported from a namespace (`use Foo\Bar;`); `Mockery`; a class, interface, trait or enum Upstream or a scanned vendor file declares in a file with no `namespace` declaration; and a runtime export, compared case-insensitively (`\arrayiterator` is covered by `ArrayIterator`). A class prints with its first-seen spelling and groups case-insensitively.
- **Patterns.** Every literal string (single-quoted, nowdoc, or double-quoted and heredoc without interpolation) in a scanned file is given to the runtime's `compilePattern("preg_match", value)`, once per distinct value. It is listed only when `compilePattern` throws, which it does for a pattern PHP can compile but PORTING.md § PCRE conversion does not cover (DIV-10.1's `TypeError`); `refused=` is the thrown message. A string `compilePattern` returns `null` for (PHP cannot compile it: `'/path/to'`, `'+1 day'`, `'/(unclosed/'`) and a pattern it converts are not listed. An interpolated string is skipped. The throw is caught: a refused pattern never fails the scan.

## Limits

- The scan is lexical. It does not resolve dynamic calls (`$fn(...)`, `call_user_func($name)` with a computed name), and it does not know whether a listed function is reached by the Ported Tests.
- A runtime export with a matching name is taken as covering the function, whatever its signature or flags support.
- Test files outside the component map's entries (fixtures, stubs the tests `require`) are not scanned, and functions they declare are not known to be Upstream's.
- Declared names and `use function` imports are matched by short name across all files, whatever their namespace: a function declared or imported anywhere in Upstream hides a builtin of the same name everywhere. Declared constants (a top-level `const`, a literal `define('NAME', …)`, a `use const` import) are matched the same way: a constant declared anywhere in Upstream or a scanned vendor file hides a builtin constant of the same name everywhere.
- A lexer error in any `.php` file under any repository's `src/` or `tests/` fails the run (exit 1), even one the Component does not use.
- A non-builtin global from a vendor package not in the list above shows up as a missing builtin. Drop it when raising the Escalations. A global class alias Upstream relies on (`use DB;` in a test) shows up as a class the same way.
- Classes are read only at the positions above. Type positions (parameter, property and return types) are not read for classes, so a builtin class used only as a type is not listed.
- An uppercase class name in a return type after `):` (or `fn (): X =>`) reads as a constant. The left operand of `|` or `&` (`E_ALL | E_STRICT`) reads as a union or intersection type and is not listed from that site; the right one is. A `goto` label written in uppercase reads as a constant.
- A file with any `namespace` declaration, including a `namespace { }` block, is treated as namespaced throughout: its unqualified class names are not taken as global, and the classes it declares are not taken as global declarations.
- Patterns built at runtime (concatenations, `sprintf`, phpdotenv's `Lexer` joining its `PATTERNS`) are not seen, only whole literals. Every literal is tried, so a non-pattern string that happens to be a valid delimited pattern (a `sprintf` format such as `'%s\Http\%s%s'`) can be listed as refused. Check a `pattern` line's site before raising it.
- Partial ports (the symfony/routing route compiler, the HttpKernel exceptions) have no `vendor-ports.jsonl` row, so their source is not scanned. Composer `exclude-from-classmap` patterns are matched as path segments; wildcards are not expanded.
- `vendor-ports.jsonl` missing from a `--root` checkout means no vendor ports.

The tool (`tools/scans/builtins.ts`, `tools/scans/vendor.ts`, `tools/scans/vendor-ports.jsonl`) and its Xaravel Tests in `conformance/tests/xaravel/builtin-scan.test.ts` are Protected Paths under `/tools/` and `/conformance/`: XT-conformance-269 (functions and constructs on a mini snapshot), 270 (the real snapshot, skipped when not synced), 274 (constants and classes), 275 (refused patterns), 276 (vendor source: `--sync` from local repositories, missing, modified, wrong-commit and unlocked sources, a vendor-only Component) and 277 (the real `vendor-ports.jsonl` against the packages table and the framework lock).
