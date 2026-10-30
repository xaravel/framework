# Runtime builtin scan

`bun run scan:builtins <component>` lists the PHP functions and language constructs that an Upstream Component's source and tests call by name, minus what `@xaravel/runtime/php` already exports. Epic 14 found these one blocked Story round at a time: 38 Escalations, 16 of its action items runtime builtins (Epic 14 retrospective, finding P1). The scan lists them up front.

It is an advisory report. Nothing is committed, nothing is written, and the tool raises no Escalation. A Story reads the listing and raises the Escalations.

## When to run it in the Story loop

Run it **before the first Story of an Upstream Component epic** (see the Story loop in `AGENTS.md`):

1. Run `bun run upstream:sync` if the snapshot is missing, then `bun run scan:builtins <component>`.
2. In the epic's first Story, raise **every listed name in one round**: one `contract` Escalation (or one per runtime area) that names each missing function or construct helper, before translating tests that need them. Do not wait for each test to block on one.
3. Run the scan again once the runtime work lands. An empty listing means the Component's Upstream code calls nothing the runtime lacks, within the limits below.

Later Stories of the epic can rerun it to check what is still missing.

## Command

```
bun run scan:builtins <component> [--root <dir>]
```

`<component>` is a name from `tools/scaffold/packages.jsonl` with Upstream source: a framework Component (Upstream `illuminate/<name>`, scanned from `framework/src/Illuminate/<Dir>` with `kebab(Dir)` equal to the name), or `ai`, `mcp` or `boost` (scanned from `<repo>/src`). `--root` scans another checkout.

Exit codes: 0 a listing (possibly empty), 1 a failure (missing snapshot, lexer error; the message starts `scan:builtins: ` and names the file and line), 2 a usage error (no Component, an unknown or non-Upstream Component, a bad flag).

## What it reads

- The `.php` files (not `.blade.php`) under the Component's Upstream `src/` directory.
- The test files `conformance/component-map` gives the Component, among those each repository's `phpunit.xml.dist` selects (`testFiles` and `componentForTest`).
- Every `.php` file under every repository's `src/` and `tests/`, only to learn which functions Upstream declares (helpers, Pest helpers in `tests/Pest.php`) and which names it calls.
- The runtime export names of `packages/runtime/src/php/index.ts` (imported, read-only).

It runs no PHP and fetches nothing.

## Output

One line per name, sorted: functions first, then constructs, each by name. Files are relative to `conformance/upstream/`, and `first` is the first call site in walk order (the `src/` files sorted, then the test files sorted), or the first string site for a `calls=0` line.

```
function <name> calls=<n> strings=<m> first=<file>:<line>
construct <name> calls=<n> first=<file>:<line> helper=<export or none>
builtins: <component>: <f> function(s) and <c> construct(s) not in @xaravel/runtime/php; <n> file(s) scanned.
```

## Rules

- **A call** is a name followed by `(` whose previous code token is not `->`, `?->`, `::`, `function`, `fn`, `new` or `const` (nor `&` right after `function` or `fn`; `$a & foo(` and `= &foo(` are calls), and which is not a PHP keyword (`if`, `foreach`, `catch`, `fn`, `use`, `static`, …). A leading `\` is dropped (`\ucfirst(` is `ucfirst`). A qualified name (`Foo\bar(`, `namespace\bar(`) is never a builtin. Comments, docblocks, attributes and strings are not code. Names compare lowercased, as PHP does.
- **Upstream-declared names are not listed.** A name is declared when a file under any repository's `src/` or `tests/` has `function <name>(` outside a class-like body (including inside `if (! function_exists(...)) { }`), or imports it with a namespace-qualified `use function` (plain, aliased or grouped, `use function Foo\bar`, `use function Foo\{bar}`). A global import such as `use function tap;` declares nothing. A named `function` inside a class, interface, trait or enum body, anonymous classes included (`new class`, `new readonly class`), is a method and declares nothing.
- **Vendor globals are not listed.** This fixed list, from the test tools Upstream depends on, is never reported: Pest `test`, `it`, `describe`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, `dataset`, `uses`, `covers`, `arch`, `pest`, `todo`; Mockery `mock`, `spy`, `namedMock`, `anyArgs`, `andAnyOthers`, `andAnyOtherArgs`; symfony/var-dumper `dump`, `dd`.
- **`strings=`** counts the scanned files' literal strings passed as a whole call argument (`f('ucfirst', …)`: the string sits directly in the parentheses of a call, a `(` after a name that is not a keyword or construct, so `array('x')`, `isset('x')`, `if ('x')` and `match ('x')` never count, between `(` or `,` and `,` or `)`) whose value is a function name that some scanned, `src/` or `tests/` file calls by name, such as `array_map('ucfirst', $x)`. Array keys and values never count. A name used only as such a string can be listed with `calls=0`. A string argument that is not a callable but happens to name a called function (`$rules->add('date')`) is still counted, so check a `calls=0` line before raising it.
- **Coverage.** A function is not listed when some runtime export `e` has `norm(e) === norm(name)` or `norm(e) === "php" + norm(name)`, where `norm` lowercases and drops `_`. So `count`, `json_encode` (`jsonEncode`), `serialize` (`phpSerialize`) and `is_numeric` (`isNumeric`) are covered.
- **Constructs.** `array(`, `empty(`, `eval(`, `isset(`, `list(`, `match (`, `unset(` (each followed by `(`), and `clone`, `exit`, `die`, `print`, `include`, `include_once`, `require`, `require_once` and `yield from`. Those without `(` are skipped where they are a name: after `new`, `class`, `instanceof`, `case`, `goto`, `enum`, `interface`, `trait`, `extends` or `implements`, or before `::` or a named argument's `:` (`Exit::X`, `f(print: 1)`). Each has a fixed helper: `match` → `unhandledMatch`, `yield from` → `yieldFrom`, `empty` → `toBool`, the rest none. A construct whose helper is exported is not listed. A construct with `helper=none` is still listed, so the Story knows to translate it (for example `isset` and `unset` on a `PhpArray`).

## Limits

- The scan is lexical. It does not resolve dynamic calls (`$fn(...)`, `call_user_func($name)` with a computed name), and it does not know whether a listed function is reached by the Ported Tests.
- A runtime export with a matching name is taken as covering the function, whatever its signature or flags support.
- Test files outside the component map's entries (fixtures, stubs the tests `require`) are not scanned, and functions they declare are not known to be Upstream's.
- Declared names and `use function` imports are matched by short name across all files, whatever their namespace: a function declared or imported anywhere in Upstream hides a builtin of the same name everywhere.
- A lexer error in any `.php` file under any repository's `src/` or `tests/` fails the run (exit 1), even one the Component does not use.
- A non-builtin global from a vendor package not in the list above shows up as a missing builtin. Drop it when raising the Escalations.

The tool and its Xaravel Tests (XT-conformance-269 and 270 in `conformance/tests/xaravel/builtin-scan.test.ts`) are Protected Paths under `/tools/` and `/conformance/`.
