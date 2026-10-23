# Async surface (`bun run async-surface`)

AD-6 makes async-ness a rule, not a per-agent choice. Every public method that returns a Promise carries `@asyncRoot <Contract.method>` (the Driver-contract method it reaches) or `@asyncRoot callback` (it accepts a callback that may be async), and each package commits a generated `async-surface.json` listing them. A sync method that returns a thenable (`DB.table(): Builder`) is not async, so it carries no tag, but the file records it on a `thenable` line, because awaiting a thenable runs IO (Maintainer ruling, [MAINT-2026-10-19 item 7](../../decisions/MAINT-2026-10-19-epic-6-items.md)). CI fails on a missing or misplaced tag or on drift between the committed file and the regenerated one (Story 6.4, Retro 6 item 12; AD-6, AD-28).

```sh
bun run async-surface <pkg>…            # regenerate packages/<pkg>/async-surface.json
bun run async-surface --all             # every packages/* with a package.json
bun run async-surface --all --check     # CI: never writes async-surface.json; fails on errors or drift
bun --no-env-file tools/async-surface/async-surface.ts --root <dir> …   # a temp root (tests)
```

`<pkg>` is a directory name under `packages/` or `@xaravel/<name>`. An unknown package exits 2 naming it. Exit codes: 0 ok, 1 an AD-6 error, a tsc failure or drift, 2 usage error.

## How it works

1. **Build.** One `tsc -b <root>/packages/<pkg>…` with the repository's own TypeScript (`node_modules/typescript/bin/tsc`, resolved from the tool, never from `--root`), run under `bun --bun`. A failure exits non-zero with tsc's output. Builds are incremental, so after `bun run typecheck` this costs little.
2. **Read.** `<package tsconfig outDir>/src/**/*.d.ts` (`outDir` resolved relative to the package directory; for the scaffolded packages, `.cache/tsc/<pkg>/src`), but only a `.d.ts` whose `src/<path>.ts` still exists: the incremental build leaves a deleted or renamed source's declaration behind. A missing `<outDir>/src` after the build fails, naming the package and the directory. Tests are ignored.
3. **Walk.** Each file is parsed with `oxc-parser` (`parseSync(file, text, { lang: "dts" })`, pinned at `0.155.0`).

**Public methods**, in `.d.ts` order, of a class or interface the file exports (`export declare class`, `export interface`, or a local one named in `export { X }` / `export { X as Y }`, listed under its exported name):

- a method or getter that is not `private`, `protected` or `#private`;
- a field whose type annotation is a function type (`run: () => Promise<void>`), or a union with function members (`run: (() => Promise<void>) | null`, the AD-9 nullable callback), async if any member is;
- an interface method signature, or a property signature typed as a function;

plus an exported `declare function` and an exported `const` typed as a function. Names are `Class.method`, `Class.static method` for statics, or the bare function name. Constructors and setters are not methods.

**Async**: the return type, through parentheses, unions, intersections and the `readonly` operator, references `Promise` or `PromiseLike`. They are globals, so they match by name, a qualified name by its last segment (`ns.Promise<T>`, `import("./x").ns.Promise<T>`). Other type operators (`keyof Promise<T>`, `unique symbol`) are not unwrapped, and a Promise inside a type argument (`Array<Promise<T>>`) or a callback parameter does not count.

**Thenable**: in the same positions, a type name that resolves to a registered FQCN in the thenable list. A method that returns a Promise on any signature or union member is async, even if it also returns a thenable (`m(): Promise<X> | Builder` needs a tag and gets an async line); otherwise a method that returns a thenable is a thenable method.

**Resolution.** A thenable is matched by its qualified name, never by its short name, so `Schema\Builder` is not taken for `Query\Builder`. A type name is resolved from the `.d.ts`'s own imports, starting at the source file the declaration came from (`packages/<pkg>/src/<path>.ts`):

- `X` imported by name (`import { X }`, `import { Y as X }`, `import type { X }`, `import { type X }`): the export `Y` of the imported module;
- `ns.X` with `import * as ns`: the export `X` of that module; a deeper qualifier (`a.b.X`) or the namespace itself is no thenable;
- `import("./B").X` (tsc's inferred cross-module form): the export `X` of `./B`;
- an `X` that is not imported: the binding `X` of the source file itself;
- `this`, in a class or interface: that declaration itself, resolved as the binding of its local name in its own source file, so only a listed owner yields a line (the Pipeline contract's `send(): this` is a thenable method; a `Repository`'s `tap(): this` is not listed); outside a class or interface it is no thenable.

`registeredFqcn` in `tools/lint-rules/thenables.ts` then follows the name to the source module that registers it with a conforming top-level `registerClass('<FQCN>', X)` (AD-10; Story 6.6's own recogniser, `tools/registration/recognise.ts`), or declares it as a contract token (ESC-10.1-3, ESC-10.2-2): a top-level `const X = contract("<FQCN>", …)`, exported or not, whose callee is the identifier `contract` bound by a named import `contract` (from any specifier) and whose first argument is a string literal shaped as an FQCN, after unwrapping parentheses, `as`, `<T>` assertions, `satisfies` and `!` around the call (type arguments such as `contract<P, B>(…)` are fine). A `registerClass` of the same local wins over a token. A relative specifier tries `.js` → `.ts`, the path itself if it ends in `.ts` / `.tsx`, `<path>.ts`, then `<path>/index.ts`; a bare one (`@xaravel/database`) is resolved with `Bun.resolveSync` from the importing file's directory. In the target module an export is followed through an exported declaration or a local `export { L as X }` to the binding `L`, which is registered there or imported (and followed again), through `export { Y as X } from`, and through each `export *` in order. A visited set stops cycles, and parsed modules are cached by path and mtime. A name that does not resolve to a registered FQCN (an unregistered local class, a missing module, a cycle) is not a thenable.

**Thenables** are FQCNs, compared without a leading `\` and case-insensitively; a line prints the list's spelling. The list is `THENABLE_TYPES` exported by `@xaravel/contracts/async`, resolved with `Bun.resolveSync` from the root, when it resolves and exports a non-empty `string[]`; otherwise `THENABLE_TYPES` in `tools/lint-rules/thenables.ts` (the Query and Eloquent `Builder`, the Relations, the `Pending*` builders, and `Illuminate\Contracts\Pipeline\Pipeline` and `Illuminate\Pipeline\Pipeline`, declared thenables by ESC-10.2-2), which Story 6.3's lint rules share. ESC-10.2-6 does not change the tool: it does not check a tag's reason, so `@asyncRoot callback` is accepted on any async method.

**The Story 10.5 contract.** `@xaravel/contracts` gains an `exports` entry `"./async"` whose module exports `THENABLE_TYPES: readonly string[]`, the Upstream FQCNs of the thenable types. Once it does, the tool uses it and the fallback list stops applying. That list must include `Illuminate\Contracts\Pipeline\Pipeline` and `Illuminate\Pipeline\Pipeline` (ESC-10.2-2); otherwise `--check` shows the three `Pipeline.send` / `through` / `via` thenable lines in `packages/contracts/async-surface.json` as drift.

**Tags.** The tag is read from the nearest `/** … */` comment that ends before the member with only whitespace between (tsc keeps JSDoc in declarations). `@asyncRoot <value>` takes the rest of its line; the value is `callback` or `Name(\Name)*.method` (`Cache\Store.get`, `Illuminate\Contracts\Cache\Store.get`). Overloads of one name are one method: async if any signature returns a Promise, else a thenable method if any returns a thenable; the tag may sit on any signature. Only an async method carries a tag.

## Errors

All are printed, one line each, then the run exits 1 and writes nothing (for any package):

```
async-surface: packages/<pkg>/src/<path>.ts: <method> <what is wrong> (AD-6)
```

- an async method with no tag (`<method> returns a Promise but has no @asyncRoot tag (…) (AD-6)`);
- a malformed tag value;
- overloads carrying two different tag values;
- a tag on a thenable method (`<method> returns a thenable but no Promise, so it carries no @asyncRoot tag (AD-6)`);
- a tag on a method that returns neither a Promise nor a thenable;
- a declaration file that does not parse cleanly (`<file>: does not parse: <parser message> (AD-6)`): a partial AST would silently drop methods.

## Format

`packages/<pkg>/async-surface.json` is a JSON array with one object per line, sorted by file then method (code-unit order), each entry serialised with `JSON.stringify` (tool data, not a framework value, so AD-23 does not apply), ending in a newline. An empty surface is `[]\n`. A line is one of two kinds, with the keys in this order:

- an async method: `{"method":…,"file":"src/<path>.ts","root":…}`, `root` its `@asyncRoot` value;
- a thenable method (no tag): `{"method":…,"file":"src/<path>.ts","thenable":…}`, `thenable` the FQCN it returns as the list spells it; when a union or its overloads return several, the distinct FQCNs sorted (code-unit order) and joined by `|`.

```json
[
{"method":"Repository.get","file":"src/Repository.ts","root":"Cache\\Store.get"},
{"method":"Repository.where","file":"src/Repository.ts","thenable":"Illuminate\\Database\\Query\\Builder"}
]
```

Without `--check`, a package with an empty surface and no existing file gets no file (the run says so); an existing file is always rewritten, so a package whose last async method went away gets `[]\n`. Never edit the file by hand; regenerate it and commit the result with the change that moved it.

## The drift check (`--check`)

`--check` never writes `async-surface.json` (tsc still writes its incremental output under `.cache/tsc`, which is gitignored). A package with no committed file counts as `[]`, so a package with no async method needs no file, and one that gains an async method without committing its file fails with every line shown as `+`. Each package whose committed file differs prints:

```
async-surface: packages/<pkg>/async-surface.json is out of date (AD-6); run bun run async-surface <pkg>
-<committed-only line>
+<regenerated-only line>
```

The diff compares entry lines (without brackets or trailing commas). If the entries are equal and only formatting differs, both files are printed in full. CI's required `ci.yml#check` job runs `bun run async-surface --all --check` after the typecheck on `pull_request` and `merge_group`, so in the merge queue two PRs that are each green but disagree about a seam's async-ness fail ([ci.md](ci.md)).

## Limits

The walk is syntactic:

- Type aliases are not resolved: a method returning `type Deferred<T> = Promise<T>` as `Deferred<T>` is not seen as async.
- Inherited members are not listed: only the members a class or interface declares itself. A subclass that overrides an async method lists it under its own name.
- A thenable resolves only through what is written. Not followed, so such a name is not a thenable: `export default class X` / `export default X` (which `xaravel/no-package-default-export` forbids in packages; `export { X as default }` is followed like any export), `export * as ns from`, a `registerClass` the recogniser does not accept (nested, aliased or a member call, which the registration scan rejects anyway), a `contract(…)` call that is not a token (a `let`, a nested or optional call, a non-literal first argument, a `contract` not imported by that name), a type alias of a thenable, and a relative specifier with no `.ts` file behind it (`./x.js` with only `x.js` on disk, or `./x` with only `x.d.ts`). A relative specifier naming a `.ts` / `.d.ts` / `.tsx` file directly is followed, and a bare specifier resolves as Bun does from the importing file, to whatever file that is (`.js` included), so it needs the package installed or linked in the workspace.
- Scope is not tracked: a type parameter or an inner-scope binding that shadows an imported name (`f<Builder>(): Builder`) resolves through the import.
- Only `src/**/*.d.ts` is read; tests are never part of the surface.
- Shapes not walked: conditional, `Awaited<…>` and indexed-access return types (`T extends X ? Promise<A> : B`, `Awaited<P>`, `M["get"]`); call signatures (`interface F { (): Promise<void> }`) and consts typed by a type literal or interface rather than a function type; symbol-keyed and other computed members (`[Symbol.asyncIterator]()`); members of namespaces; exported `let` and `var`; and default exports (which `xaravel/no-package-default-export` forbids in packages anyway).

## Proofs

`tools/async-surface/fixtures/` holds a fixture package (`demo/`: `package.json`, a standalone `tsconfig.json`, and `src/Repository.ts` covering every listed and unlisted shape), a source for the contracts-list case (`contracts/Thenables.ts` with `contracts/async.ts`), and one failing source per error kind (`failing/untagged.ts`, `malformed.ts`, `conflicting.ts`, `stray.ts`, `tagged-thenable.ts`). `demo/src/Builder.ts` registers `Illuminate\Database\Query\Builder` and `X\Lazy` with a local `registerClass` stand-in (the fixture tsconfig has `types: []`), and `demo/src/Schema/Builder.ts` registers `Illuminate\Database\Schema\Builder`, so `Repository.where()` is a thenable line and `Repository.getSchemaBuilder()` is not listed. `conformance/tests/xaravel/async-surface.test.ts` copies them into temp roots and runs the real CLI and tsc: XT-conformance-134 (exact output, contracts list preferred, fallback otherwise, the I/O matrix through `surfaceOf` with a stub resolver, and `registeredFqcn` over temp source files for every resolution path), XT-conformance-135 (each error exits 1 naming the method and writes nothing), XT-conformance-136 (`--check` drift and pass cases, and the `ci.yml` wiring) and XT-conformance-263 (contract tokens through `registeredFqcn` over temp sources, `this` in listed and unlisted owners through `surfaceOf`, the CLI over a temp package holding a Pipeline token, and `packages/contracts` listing exactly `Pipeline.send`, `through` and `via` as thenable lines; Epic 10 retro item 4).
