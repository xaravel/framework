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

Tests, `tools/` and anything outside `packages/*/src` are never scanned. Each source's whole AST is walked: only a top-level statement can be a registration, but a `registerClass` call or alias anywhere else is a violation.

## Rules

**Registration shape.** A registration is a top-level expression statement whose expression is a direct call of the identifier `registerClass` (not optional, not wrapped). A conforming one is `registerClass('<FQCN>', X)`: exactly two arguments, a string literal shaped as a PHP FQCN (identifier segments `[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*` joined by single `\`, with an optional leading `\`) and an identifier. Any other top-level `registerClass` call (a variable or template literal FQCN, an empty or malformed FQCN such as `'A/Foo'` or `'A\\\\Foo'`, a missing or extra argument, a spread, an expression as the class) fails with `registerClass must be called as registerClass('<FQCN>', X) with a string literal FQCN`, and is not a registration.

**Nested and wrapped calls.** Any other call of `registerClass` fails at the call with `registerClass must be called only as a top-level statement registerClass('<FQCN>', X), not nested in a block, function or namespace or wrapped in another expression`, and is not a registration (so it is neither counted, nor a duplicate, nor the file's trailing registration). That covers a call inside an `if` or other block, a function or arrow body, or a namespace, and a top-level call wrapped in another expression: `void registerClass(…)`, `(registerClass(…))`, `(registerClass)(…)`, `registerClass?.(…)`, `registerClass!(…)`, `x, registerClass(…)`, a sequence callee `(0, registerClass)(…)`, `registerClass.call(…)` and `registerClass.apply(…)` at any level, `new registerClass(…)`, and a tagged template ``registerClass`…` ``.

**Aliases.** Aliasing `registerClass` fails with `registerClass must not be aliased; call it by its own name as registerClass('<FQCN>', X)`, at the renaming import specifier (`import { registerClass as r }`), the renaming export specifier (`export { registerClass as r }`, with or without `from`), the declarator (`const r = registerClass`, also through `as`, `!` or parentheses), the renaming destructure property (`const { registerClass: r } = …`) or the assignment (`r = registerClass`).

Shape, nested and alias violations apply to every package, graders included.

The scan's recogniser, `recogniseRegistration` in `tools/registration/recognise.ts` (re-exported by `registration.ts`), is also the API-surface diff's ([api-surface.md](api-surface.md)) and the thenable resolver's ([async-surface.md](async-surface.md#how-it-works)): it returns a conforming registration's FQCN without its leading `\` (`normaliseFqcn`, case kept), the literal as written, and the class identifier.

**Duplicate FQCNs (AD-22).** Over every package, graders included, an FQCN registered at more than one site fails. FQCNs are compared as PHP compares class names: case-insensitively and without a leading `\` (`\A\Foo`, `a\foo` and `A\Foo` are one class); the message names each site's literal FQCN. The first site is the lowest by path, then line; each later site gets `<fqcn> is already registered in <first path>:<line> (package <p1>); registered again here (package <p2>)`. Two registrations in one package, or one file, count too.

**Framework class files (AD-10).** In each framework file, every exported class must be the second argument of a conforming `registerClass` in the file's trailing run of top-level statements, and that run must hold only conforming `registerClass` calls (comments and empty statements `;` do not count). A registration followed by any other statement does not count. A miss fails at the class declaration: `exports class <X> but does not end with registerClass('<FQCN>', <X>)`. An exported class is:

- `export class X`, `export abstract class X`, `export default class X`;
- an exported top-level `const`, `let` or `var` declarator whose initializer is a class expression, possibly parenthesised or under `as`, `satisfies` or `!` (`export const X = class {}`, `export const X = class Y {}`); the check uses the binding `X`, and a miss is reported at the declarator;
- a top-level `class X`, or a top-level `const`/`let`/`var X = class …`, named in a local `export { X }`, `export { X as Y }` or `export default X` (the check uses the local name `X`).

An anonymous `export default class {}`, and any default-exported class expression (`export default (class {})`; a class expression's own name is not in scope at the top level), always fails: `exports an anonymous default class, which cannot be registered; name it and end the file with registerClass('<FQCN>', <Name>)`.

`declare` classes, type-only exports (`export type { X }`), interfaces, type aliases, enums and functions are not classes for this rule.

**Same file (AD-10).** In every package, graders included, the class a conforming `registerClass('<FQCN>', X)` names must be declared in that file at the top level: a non-`declare` `class X` (exported or not, `export default class X` included) or a `const`, `let` or `var X = class …` (exported or not, wrappers as above). Registering an imported class, a namespace import, or any other binding fails at the call: `registers <X>, which is not a class declared in this file; a class is registered only in the file that declares it` (Epic 6 retro R3, ESC-9.4-1). The registration still counts, so a duplicate FQCN is reported too.

**`sideEffects` (AD-10).** A `packages/<p>/package.json` whose top-level `sideEffects` is `false` fails with `sets "sideEffects": false, which lets bundlers drop registerClass side effects`; a list fails with `sets "sideEffects" to a list, which marks every other file side-effect-free`. Both are reported at the key. Absent or `true` passes. A file that is not valid JSON, or not a JSON object, fails at 1:1.

**Parse errors.** A source that does not parse cleanly fails at the first error's position (`does not parse: <parser message>`) and is not checked further: a partial AST would hide classes and registrations.

## The grader exemption

A package whose row in `tools/scaffold/packages.jsonl` has `kind: "grader"` (`assert`, `mockery`; `boost-framework` lives under `tools/`, so it is never scanned) is exempt from the framework-file rule, though not from the shape and duplicate rules. Graders are Conformance System code: AD-15 isolates them from the framework they grade, so they cannot import `@xaravel/runtime/registry`, and the spine already exempts them from framework-only lint rules (`GRADER_PACKAGES` in `tools/lint-rules/plugin.ts`, ESC-6.2-1). A package the table lacks, or a root with no table, counts as framework.

## Limits

The scan is syntactic, with no type information:

- Any top-level statement calling an identifier named `registerClass` counts as a registration; the import it comes from is not checked. A call anywhere else is a violation, never a registration.
- Only a direct call to the identifier `registerClass` counts. A member call (`registry.registerClass(...)`), including through a namespace import (`import * as registry …; registry.registerClass(...)`), is not seen at all: neither a registration nor a violation. AD-10 fixes the call form, so write it as `registerClass('<FQCN>', X)`.
- Aliasing is caught only in the forms listed under Aliases. `registerClass` passed as a value elsewhere (`f(registerClass)`, `[registerClass]`, `{ r: registerClass }`, a default parameter) and then called under another name is not seen, nor are `registerClass.bind(…)`, `Reflect.apply(registerClass, …)`, a conditional or logical expression (`const r = c ? registerClass : f`, `r = f || registerClass`), or a member read (`const r = registry.registerClass`).
- A class re-exported from another file (`export { X } from "./X"`, `export * from "./X"`) is checked only in the file that declares it.
- `export = X` (CommonJS-style export assignment) and classes declared inside a namespace (`namespace N { export class X {} }`) are not exported classes for this rule. A namespace class cannot be registered at all: a `registerClass` inside the namespace is a nested call, and `registerClass('<FQCN>', N.X)` fails the shape rule.
- A class expression bound some other way (a destructuring declarator, a class expression assigned later, one returned from a function or mixin) is not an exported class for this rule.
- The scan sees only classes passed to `registerClass`. It checks that each FQCN is registered once, not that the package AD-22 names as its owner is the one registering it.
- The FQCN's shape is checked on the decoded string value, so a source literal with single backslashes (`'Illuminate\Support\Collection'`, which decodes to `IlluminateSupportCollection`) is one valid segment and cannot be told apart from a deliberate one.
- The FQCN is not compared with the class's Upstream name: Xaravel-only classes have none, and the API-surface diff ([api-surface.md](api-surface.md)) reports a registration with no Upstream match as `extra`.

## Proofs

`conformance/tests/xaravel/registration.test.ts` runs the real CLI over temp git roots and over the real repository (which passes), and the I/O matrix through the pure `scanRegistrations`: XT-conformance-140 (duplicates across packages and within one), XT-conformance-141 (missing, not-last, local-export, two-class, grader, bad-call, nested, wrapped, alias, class-expression, interface, `.d.ts`/tests, parse and same-file cases, with exact stderr lines) and XT-conformance-142 (the `sideEffects` cases, the `registration:check` script and the `ci.yml` step).
