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

- **Xaravel Component.** Every acceptance criterion is verified by an `XT-contracts-<n>` Xaravel Test; there are no Ported Tests. XT ids are allocated per Story manifest (10.1: XT-contracts-1..4 and -18; 10.2: 5..7; 10.3: 8..9; 10.4: 10..12; 10.5: 13..15; 10.6: 16..17), so a new one takes the next free number after 18; never reuse one.
- **API surface.** The API-surface diff compares the interfaces with Upstream `Illuminate\Contracts\*` and the PSR interfaces, and must show zero unexplained members.
- **Dependencies.** `@xaravel/contracts` depends only on `@xaravel/runtime` (XT-conformance-8 asserts exactly `{ "@xaravel/runtime": "workspace:*" }`). It never imports an implementation package; every other package may depend on it.
- **Container behaviour.** Autowiring uses declared injection tokens, never type hints. Abstracts are `string | token | class` as Upstream, including string aliases. `app('cache')`, `app(CacheManager)` and `app(Cache\Factory)` resolve to one instance. Facades and helpers resolve through these tokens and aliases.
- **Protection.** Once `decisions/PHASE-1-EXIT.md` merges, the `after-phase:1` marker in `conformance/protected-paths` makes `packages/contracts/**` Protected; any later Story PR touching it fails CI.
- **Story 10.6 closing gate.** `api-surface:gate contracts` passes, `docs/` lists every contract with its Upstream FQCN, and `async-surface.json` is committed. The API-surface mappings (camelCase, options objects, DIV-12 renames, defaults, nullability) are re-checked against real code; a misreading mapping raises an Escalation, never an `additions.jsonl` or `exceptions.jsonl` line.

## Technical Decisions

- **Token and brand (AD-1, AD-9, ESC-10.1-1).**
  - Each contract exports an `interface` and a runtime token (object or function) under the same Upstream name.
  - `Token.brand` is `Symbol.for('<Upstream FQCN>')`, typed as the contract's own `unique symbol`. The interface requires `readonly [Token.brand]: true`, so `implements` without the brand fails to compile.
  - `Symbol.hasInstance` reads the brand through the prototype chain; `Symbol.toPrimitive` returns the brand key, so `get [Token]()` and `get [Token.brand]()` are the same property.
  - Every brand, including markers, is a prototype getter `get [Token.brand]() { return true as const }`, emitted by generators. `hasBrand(classOrInstance, Token)` checks without instantiating; marker contracts (`ShouldQueue`, `ShouldBroadcast`) are brand-only tokens (DIV-9).
- **Token metadata (ESC-4.5-1 item 3, ESC-4.7-1 item 5, ESC-10.1-1, ESC-10.1-6).**
  - Method names at `Symbol.for('xaravel.contract.methods')`; parameter names at `Symbol.for('xaravel.contract.parameters')` as a frozen `{ <method>: [<param>, …] }` record (each list frozen too). Both come from the committed API surface, not hand-written.
  - `contract<T, B>(fqcn, members, parents?)`: tokens pass their Upstream parent tokens, kept as a frozen array at `Symbol.for('xaravel.contract.parents')`. Every token Stories 10.2/10.3 generate must pass its Upstream parents, so PHPUnit and Mockery doubles of a child contract carry every brand in the chain.
  - The grader still reads parameters from `Symbol.for('xaravel.api.signature')`.
- **Identity of tokens (ESC-10.1-3).** `fqcn(token)` returns a frozen non-function token's own non-writable `Symbol.for('xaravel.class.fqcn')` string, which `contract<T>()` sets. `resolveClass` never resolves a token name as a class. App/package contracts use `contract<T>('<FQCN>')` and behave like framework tokens. Abstract classes are tokens as they are. Importing a contract with `import type` for injection is a lint error.
- **Subpaths (AD-1, AD-3, ESC-10.1-2).** Each contract lives at the kebab-case subpath of its Upstream namespace (`Illuminate\Contracts\Mail\Mailer` → `@xaravel/contracts/mail`), mapped to `./src/<sub>/index.ts`. `SUBPATH_EXPORTS` already approves: the 33 top-level namespaces at the Pin (including `log`, `image`, `json-schema`, `concurrency`), the nested `auth/access`, `auth/middleware`, `database/eloquent`, `database/events`, `database/query`, `session/middleware`, and `psr`, `aliases`, `async`, `view`, `testing`. Each Story adds the `exports` entry for the subpaths it builds; any other subpath still needs a Maintainer-approved change.
- **PSR (AD-22, ESC-10.1-4).** `@xaravel/contracts/psr` holds `Psr\Container`, `Psr\SimpleCache`, `Psr\Log`. Their rows are in `conformance/api-surface/contracts.jsonl` and are gated like every contract. IO contracts are async per AD-6 (`CacheInterface` is async).
- **Concrete types inside contracts.** Where Upstream names a concrete class (`Request`, `Response`, `Collection`), declare a structural interface inside contracts; never import the implementation.
- **Alias table (AD-1).** `@xaravel/contracts/aliases` holds `registerCoreContainerAliases` and each provider's string bindings verbatim as data (alias string → FQCN string). The canonical token is the most specific contract a service is aliased to (`CacheManager` → `Cache\Factory`); providers bind only it. `canonicalToken(abstract)` returns it, and validation fails naming any alias without a canonical contract.
- **Names and signatures (AD-3, AD-26).** Keep Upstream interface, method and parameter names, methods camelCase; named exports, one public class per file. More than one optional parameter → also accept a single options object keyed by camelCase PHP parameter names. `__toString` → `toString()` + `[Symbol.toPrimitive]`; `ArrayAccess` → `offsetGet/Set/Exists/Unset`; `IteratorAggregate`/`Countable` → `[Symbol.iterator]`/`count()`; `__invoke` stays `__invoke`; enums are classes with static instances, never TS `enum`.
- **Values and identity (AD-9, AD-10).** `null` is the only absent value; never declare `undefined` returns. Accept PHP arrays in all three forms; by-reference parameters take `Ref<T>`. Use `fqcn()`, never `constructor.name`; framework class files end with `registerClass(...)`; never `sideEffects: false`.
- **Injection (DIV-3).** `inject({ <paramName>: <Spec>, … })` as a TC39 decorator or closure wrapper; specs are tokens/classes, `String`/`Number`/`Boolean`, `primitive`, contextual descriptors, `oneOf(...)`; metadata on `Symbol.metadata`.
- **Xaravel-only contracts (AD-27).** The only cross-package seams contracts may define; a new seam needs an Escalation.
  - `async`: thenable type list and `NotPromise<T>`; the `async-surface` tool reads its list from here; every framework class with `then` declares `implements PromiseLike<…>` (ESC-6.1-1).
  - `view`: `RenderContext` and the `Blade.directive` emitted-helper ABI.
  - `testing`: hook order `createApplication` → `afterApplicationCreated` → `setUp<Trait>` → test → `tearDown<Trait>` → `beforeApplicationDestroyed`.

## Cross-Story Dependencies

- Done: Epic 9 runtime (including Story 9.14, token `fqcn()`), Story 10.1 (token, brand, metadata, parents, `contract<T>()`, `hasBrand`, PSR), action items `epic-10-item-1-psr-api-surface` and `epic-10-item-2-double-parent-brands`, and the `contracts` consequence row.
- Stories 10.2–10.5 build on 10.1's mechanism. Story 10.4 needs 10.2 and 10.3's contracts to resolve canonical tokens. Story 10.5 changes Story 6.4's async-surface tool to read the thenable list from contracts. Story 10.6 closes the epic last.
- Downstream: Container (Epic 17) resolves through the alias table; Mockery and PHPUnit doubles read the token metadata and parents; all Phase 1–8 packages depend on these interfaces.
