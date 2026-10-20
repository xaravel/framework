# Registration scan (`bun run registration:check`)

AD-10 makes class identity `fqcn()`, backed by the Class Registry: every framework class file ends with `registerClass('<Upstream FQCN>', X)`, and no package sets `"sideEffects": false`, which would let a bundler drop those calls. AD-22 gives each foreign FQCN (Symfony, Carbon and so on) exactly one owning package. The scan checks these statically, over source text; it never loads a module (Story 6.6; AD-10, AD-22).

```sh
bun run registration:check                                              # the repository
bun --no-env-file tools/registration/registration.ts --root <dir>       # a temp root (tests)
```

On success it prints `registration: ok (<f> files, <r> registrations)`: the sources and `package.json` files scanned, and the conforming `registerClass` calls found. Otherwise it prints one line per violation on stderr, sorted by path, line and column:

```
<path>:<line>:<col>: <message> (AD-10)
<path>:<line>:<col>: <message> (AD-22)        # duplicates
```

Exit codes: 0 ok, 1 any violation (or a failure such as a root that is not a git work tree), 2 usage error. CI's required `ci.yml#check` job runs it after `scaffold:check` ([ci.md](ci.md)).

## What it reads

`git ls-files -co --exclude-standard` under the root (tracked and untracked, not ignored), keeping:

- every `packages/<p>/src/**/*.{ts,tsx,mts,cts}` except declaration files (`.d.ts`, `.d.mts`, `.d.cts`), parsed with `oxc-parser` (`lang: "ts"`, or `"tsx"` for `.tsx`);
- every `packages/<p>/package.json`.

Tests, `tools/` and anything outside `packages/*/src` are never scanned. Only top-level statements count.

## Rules

**Registration shape.** A registration is a top-level expression statement calling the identifier `registerClass`. A conforming one is `registerClass('<FQCN>', X)`: exactly two arguments, a string literal shaped as a PHP FQCN (identifier segments `[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*` joined by single `\`, with an optional leading `\`) and an identifier. Any other top-level `registerClass` call (a variable or template literal FQCN, an empty or malformed FQCN such as `'A/Foo'` or `'A\\\\Foo'`, a missing or extra argument, a spread, an expression as the class) fails with `registerClass must be called as registerClass('<FQCN>', X) with a string literal FQCN`, and is not a registration.

**Duplicate FQCNs (AD-22).** Over every package, graders included, an FQCN registered at more than one site fails. FQCNs are compared as PHP compares class names: case-insensitively and without a leading `\` (`\A\Foo`, `a\foo` and `A\Foo` are one class); the message names each site's literal FQCN. The first site is the lowest by path, then line; each later site gets `<fqcn> is already registered in <first path>:<line> (package <p1>); registered again here (package <p2>)`. Two registrations in one package, or one file, count too.

**Framework class files (AD-10).** In each framework file, every exported class must be the second argument of a conforming `registerClass` in the file's trailing run of top-level statements, and that run must hold only conforming `registerClass` calls (comments and empty statements `;` do not count). A registration followed by any other statement does not count. A miss fails at the class declaration: `exports class <X> but does not end with registerClass('<FQCN>', <X>)`. An exported class is:

- `export class X`, `export abstract class X`, `export default class X`;
- a top-level `class X` named in a local `export { X }`, `export { X as Y }` or `export default X` (the check uses the local name `X`).

An anonymous `export default class {}` always fails: `exports an anonymous default class, which cannot be registered; name it and end the file with registerClass('<FQCN>', <Name>)`.

`declare` classes, type-only exports (`export type { X }`), interfaces, type aliases, enums and functions are not classes for this rule.

**`sideEffects` (AD-10).** A `packages/<p>/package.json` whose top-level `sideEffects` is `false` fails with `sets "sideEffects": false, which lets bundlers drop registerClass side effects`; a list fails with `sets "sideEffects" to a list, which marks every other file side-effect-free`. Both are reported at the key. Absent or `true` passes. A file that is not valid JSON, or not a JSON object, fails at 1:1.

**Parse errors.** A source that does not parse cleanly fails at the first error's position (`does not parse: <parser message>`) and is not checked further: a partial AST would hide classes and registrations.

## The grader exemption

A package whose row in `tools/scaffold/packages.jsonl` has `kind: "grader"` (`assert`, `mockery`; `boost-framework` lives under `tools/`, so it is never scanned) is exempt from the framework-file rule, though not from the shape and duplicate rules. Graders are Conformance System code: AD-15 isolates them from the framework they grade, so they cannot import `@xaravel/runtime/registry`, and the spine already exempts them from framework-only lint rules (`GRADER_PACKAGES` in `tools/lint-rules/plugin.ts`, ESC-6.2-1). A package the table lacks, or a root with no table, counts as framework.

## Limits

The scan is syntactic, with no type information:

- Any call to an identifier named `registerClass` counts; the import it comes from is not checked.
- Only a direct call to the identifier `registerClass` counts. An aliased import (`import { registerClass as r }`) or a member call (`registry.registerClass(...)`) is not seen as a registration; AD-10 fixes the call form, so write it as `registerClass('<FQCN>', X)`.
- A class re-exported from another file (`export { X } from "./X"`, `export * from "./X"`) is checked only in the file that declares it.
- Class expressions (`export const X = class {}`) and classes inside namespaces are not exported classes for this rule.
- The scan sees only classes passed to `registerClass`. It checks that each FQCN is registered once, not that the package AD-22 names as its owner is the one registering it.
- The FQCN's shape is checked on the decoded string value, so a source literal with single backslashes (`'Illuminate\Support\Collection'`, which decodes to `IlluminateSupportCollection`) is one valid segment and cannot be told apart from a deliberate one.
- The FQCN is not compared with the class's Upstream name: Xaravel-only classes have none, and the API-surface diff ([api-surface.md](api-surface.md)) reports a registration with no Upstream match as `extra`.

## Proofs

`conformance/tests/xaravel/registration.test.ts` runs the real CLI over temp git roots and over the real repository (which passes), and the I/O matrix through the pure `scanRegistrations`: XT-conformance-140 (duplicates across packages and within one), XT-conformance-141 (missing, not-last, local-export, two-class, grader, bad-call, interface, `.d.ts`/tests and parse cases, with exact stderr lines) and XT-conformance-142 (the `sideEffects` cases, the `registration:check` script and the `ci.yml` step).
