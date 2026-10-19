# Async surface (`bun run async-surface`)

AD-6 makes async-ness a rule, not a per-agent choice. Every async public method carries `@asyncRoot <Contract.method>` (the Driver-contract method it reaches) or `@asyncRoot callback` (it accepts a callback that may be async), and each package commits a generated `async-surface.json` listing them. CI fails on a missing tag or on drift between the committed file and the regenerated one (Story 6.4; AD-6, AD-28).

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

**Async**: the return type, through parentheses, unions, intersections and the `readonly` operator, references `Promise`, `PromiseLike` or a thenable short name. tsc's inferred cross-module form `import("./Builder").Builder` counts by its qualifier's last segment. Other type operators (`keyof Promise<T>`, `unique symbol`) are not unwrapped, and a Promise inside a type argument (`Array<Promise<T>>`) or a callback parameter does not count.

**Thenables** are FQCNs; a type matches by short name (the last `\` segment), and a qualified type name by its last segment. The list is `THENABLE_TYPES` exported by `@xaravel/contracts/async`, resolved with `Bun.resolveSync` from the root, when it resolves and exports a non-empty `string[]`; otherwise `THENABLE_TYPES` in `tools/lint-rules/thenables.ts` (the Query and Eloquent `Builder`, the Relations and the `Pending*` builders), which Story 6.3's lint rules share.

**The Story 10.5 contract.** `@xaravel/contracts` gains an `exports` entry `"./async"` whose module exports `THENABLE_TYPES: readonly string[]`, the Upstream FQCNs of the thenable types. Once it does, the tool uses it and the fallback list stops applying.

**Tags.** The tag is read from the nearest `/** … */` comment that ends before the member with only whitespace between (tsc keeps JSDoc in declarations). `@asyncRoot <value>` takes the rest of its line; the value is `callback` or `Name(\Name)*.method` (`Cache\Store.get`, `Illuminate\Contracts\Cache\Store.get`). Overloads of one name are one method: async if any signature is, and the tag may sit on any signature.

## Errors

All are printed, one line each, then the run exits 1 and writes nothing (for any package):

```
async-surface: packages/<pkg>/src/<path>.ts: <method> <what is wrong> (AD-6)
```

- an async method with no tag;
- a malformed tag value;
- overloads carrying two different tag values;
- a tag on a method that returns neither a Promise nor a thenable;
- a declaration file that does not parse cleanly (`<file>: does not parse: <parser message> (AD-6)`): a partial AST would silently drop methods.

## Format

`packages/<pkg>/async-surface.json` is a JSON array with one object per line, `{"method":…,"file":"src/<path>.ts","root":…}` with the keys in that order, sorted by file then method (code-unit order), each entry serialised with `JSON.stringify` (tool data, not a framework value, so AD-23 does not apply), ending in a newline. An empty surface is `[]\n`.

```json
[
{"method":"Repository.get","file":"src/Repository.ts","root":"Cache\\Store.get"},
{"method":"Repository.where","file":"src/Repository.ts","root":"callback"}
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
- A thenable is matched by short name, so an unrelated class with a thenable's short name counts as one.
- Only `src/**/*.d.ts` is read; tests are never part of the surface.
- Shapes not walked: conditional, `Awaited<…>` and indexed-access return types (`T extends X ? Promise<A> : B`, `Awaited<P>`, `M["get"]`); call signatures (`interface F { (): Promise<void> }`) and consts typed by a type literal or interface rather than a function type; symbol-keyed and other computed members (`[Symbol.asyncIterator]()`); members of namespaces; exported `let` and `var`; and default exports (which `xaravel/no-package-default-export` forbids in packages anyway).

## Proofs

`tools/async-surface/fixtures/` holds a fixture package (`demo/`: `package.json`, a standalone `tsconfig.json`, and `src/Repository.ts` covering every listed and unlisted shape), a source for the contracts-list case (`contracts/Thenables.ts` with `contracts/async.ts`), and one failing source per error kind (`failing/untagged.ts`, `malformed.ts`, `conflicting.ts`, `stray.ts`). `conformance/tests/xaravel/async-surface.test.ts` copies them into temp roots and runs the real CLI and tsc: XT-conformance-134 (exact output, contracts list preferred, fallback otherwise, and the I/O matrix through `surfaceOf`), XT-conformance-135 (each error exits 1 naming the method and writes nothing) and XT-conformance-136 (`--check` drift and pass cases, and the `ci.yml` wiring).
