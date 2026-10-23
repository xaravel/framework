# Epic 10 Context: `@xaravel/contracts`: tokens, aliases & Xaravel-only contracts

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port every `Illuminate\Contracts\*` interface, plus the Xaravel-only seams, into one package, `@xaravel/contracts`. Packages built in parallel can then agree on every interface and container key without importing each other's half-built code. Each contract is a TypeScript interface plus a branded runtime token with the same name, so `instanceof` and container injection behave as they do in PHP. A verbatim alias table gives every service exactly one canonical token, so there is never a second instance. The package is completed in Phase 1, right after `@xaravel/runtime`, and becomes Protected once Phase 1 is accepted. After that, changing a shared interface needs an Escalation.

## Stories

- Story 10.1: Token, brand and `contract<T>()` mechanism
- Story 10.2: Port the contracts for the core and service namespaces
- Story 10.3: Port the contracts for the web and application namespaces
- Story 10.4: Container alias table and canonical tokens
- Story 10.5: Xaravel-only contracts
- Story 10.6: Contracts complete and Protected

## Requirements & Constraints

- **Xaravel Component.** Every acceptance criterion is verified by an `XT-contracts-<n>` Xaravel Test. There are no Ported Tests. The API-surface check compares the interfaces with Upstream `Illuminate\Contracts\*` and must show zero unexplained members.
- **Dependencies.** `@xaravel/contracts` depends only on `@xaravel/runtime`; XT-conformance-8 asserts exactly `{ "@xaravel/runtime": "workspace:*" }`. It never imports an implementation package. Every other package may depend on contracts.
- **Container behaviour.** Autowiring uses declared injection tokens, never type hints. The container accepts `string | token | class` abstracts as Upstream does, including string aliases such as `app('cache')`. `app('cache')`, `app(CacheManager)` and `app(Cache\Factory)` must resolve to one instance.
- **Facades.** Facades and helpers resolve through these tokens and aliases.
- **Protection.** Once `decisions/PHASE-1-EXIT.md` merges, the `after-phase:1` marker in `conformance/protected-paths` makes `packages/contracts/**` a Protected Path. Any later Story PR that touches it fails CI.
- **Story 10.6 closing gate.** `api-surface:gate contracts` passes. `docs/` lists every contract with its Upstream FQCN. `async-surface.json` is committed.
- **Re-checking the API-surface mappings.** Story 10.6 re-checks the mappings against real code: camelCase names, options objects, DIV-12 renames, defaults and nullability. If a mapping misreads the code, raise an Escalation. Never paper over it with an `additions.jsonl` or `exceptions.jsonl` line.

## Technical Decisions

- **Token and brand (AD-1, AD-9).**
  - Each contract exports an `interface` and a runtime token under the same Upstream name.
  - The brand key is `Symbol.for('<Upstream FQCN>')`, so runtime and the grader can detect it without importing contracts.
  - The interface requires `readonly [Token]: true`, so a class that `implements` the contract without the brand fails to compile.
  - The token's `Symbol.hasInstance` reads the brand through the prototype chain.
  - Every brand, including marker interfaces, sits on the prototype as `get [Token]() { return true as const }`, which generators emit.
  - `hasBrand(classOrInstance, Token)` checks a brand without instantiating. Marker contracts such as `ShouldQueue` and `ShouldBroadcast` are brand-only tokens.
- **App and package interfaces.** Their tokens are made with `contract<T>('<FQCN>')`. They behave like framework tokens and resolve through `fqcn()`. Abstract classes are tokens as they are. Importing a contract with `import type` for injection is a lint error.
- **Test-double metadata (ESC-4.5-1 item 3, ESC-4.7-1 item 5).**
  - Every token carries its method names at `Symbol.for('xaravel.contract.methods')`, plus each method's parameter names.
  - The committed API surface records the methods of every Upstream interface, so the token generator reads both from it.
  - A bare symbol target still has no method list.
  - Mockery and the PHPUnit doubles read this metadata. Their proxies leave symbol keys alone.
- **Concrete types inside contracts.** Where Upstream names a concrete class (`Request`, `Response`, `Collection`), declare a structural interface inside contracts. Never import the implementation.
- **Alias table (AD-1).**
  - `@xaravel/contracts/aliases` holds Upstream's `registerCoreContainerAliases` and each provider's string bindings verbatim, as data: alias string → FQCN string.
  - The canonical token is the most specific contract a service is aliased to, for example `CacheManager` → `Cache\Factory`. Providers bind only that token. Concrete classes, other contracts, FQCN strings and short aliases are all aliases of it.
  - `canonicalToken(abstract)` returns it. The table's validation fails, naming the alias, when an alias has no canonical contract.
- **Layout and names (AD-3, Consistency Conventions).**
  - Subpaths follow the Upstream namespace in kebab-case: `Illuminate\Contracts\Mail\Mailer` → `@xaravel/contracts/mail`.
  - Keep Upstream interface, method and parameter names, with methods in camelCase. Named exports only, one public class per file, no default exports.
  - The `exports` map defaults to the root entry only. Each new subpath (`<namespace>`, `aliases`, `psr`, `async`, `view`, `testing`) needs its `SUBPATH_EXPORTS` entry in `conformance/tests/xaravel/scaffold.test.ts` through a Maintainer-approved change (ESC-9.1-1). Today that entry lists only runtime.
- **Signatures (AD-26).**
  - A function with more than one optional parameter also accepts a single options object keyed by the camelCase PHP parameter names.
  - `__toString` → `toString()` plus `[Symbol.toPrimitive]`.
  - `ArrayAccess` → `offsetGet`, `offsetSet`, `offsetExists`, `offsetUnset`.
  - `IteratorAggregate` / `Countable` → `[Symbol.iterator]` / `count()`.
  - `__invoke` stays a method named `__invoke`.
  - Enums become classes with static instances. There are no TS `enum`s.
- **Values (AD-9).** `null` is the only absent value; never declare `undefined` returns. Accept PHP arrays in all three forms (Array, plain object, `PhpArray`). By-reference parameters take `Ref<T>`.
- **Identity (AD-10).** Use `fqcn()`, never `constructor.name`. Every framework class file ends with `registerClass('<Upstream FQCN>', X)`. Packages never set `sideEffects: false`.
- **Injection (DIV-3).**
  - Autowiring is declared as `inject({ <paramName>: <Spec>, … })`, a TC39 decorator, or a wrapper for closures.
  - Specs are tokens or classes; `String`, `Number` or `Boolean` (coercing as PHP does); `primitive`; contextual descriptors; and `oneOf(...)`.
  - Metadata goes on `Symbol.metadata`. Never set `experimentalDecorators`.
- **Xaravel-only contracts (AD-27).** These are the only cross-package seams contracts may define. A new seam needs an Escalation.
  - `async`: the thenable type list and `NotPromise<T>`. The `async-surface` tool reads its list from here. Every framework class with a `then` method must declare `implements PromiseLike<…>` (ESC-6.1-1).
  - `view`: `RenderContext` and the `Blade.directive` emitted-helper ABI.
  - `testing`: the hook order `createApplication` → `afterApplicationCreated` → `setUp<Trait>` → test → `tearDown<Trait>` → `beforeApplicationDestroyed`.
  - `psr`: the PSR container, simple-cache and log interfaces, with tokens.

## Cross-Story Dependencies

- Epic 9 (`@xaravel/runtime`) must be done first. It supplies `registerClass`/`fqcn` (`/registry`), the `PhpArray` and `Ref` values (`/php`), and the brand conventions.
- Story 10.1's mechanism (token, brand, method metadata, `contract<T>()`, `hasBrand`) is needed by Stories 10.2–10.5. Story 10.4 needs the contracts from Stories 10.2 and 10.3 to resolve canonical tokens. Story 10.6 closes the epic after all the others.
- Story 10.5 changes the async-surface tool from Story 6.4 so it reads the thenable list from contracts.
- Downstream: Container (Epic 17) resolves through the alias table. Mockery and the PHPUnit doubles (Epic 4, Story 9.11) read the method metadata. All Phase 1–8 packages depend on these interfaces.
- Open as of the Epic 9 retro: the Xaravel-consequence rows for `contracts` (`epic-9-item-1-consequence-rows`; there is no `contracts` row in `tools/xt-coverage/consequences.ts`) were due before Epic 10's first Story with Xaravel Tests, and were waiting on the Maintainer.
