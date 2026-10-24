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

- **Xaravel Component.** Every acceptance criterion is verified by an `XT-contracts-<n>` Xaravel Test; there are no Ported Tests. XT ids are allocated per Story manifest (10.1: 1..4 and 18; 10.2: 5..7; 10.3: 8..9; 10.4: 10..12; 10.5: 13..15; 10.6: 16..17). A new one takes the next free number after 18; never reuse one.
- **API surface.** The API-surface diff compares the interfaces with Upstream `Illuminate\Contracts\*` and the PSR interfaces, and must show zero unexplained members. `exceptions.jsonl` and `additions.jsonl` are Protected and change only through Maintainer review.
- **Dependencies.** `@xaravel/contracts` depends only on `@xaravel/runtime` (XT-conformance-8 asserts exactly `{ "@xaravel/runtime": "workspace:*" }`). It never imports an implementation package, and every other package may depend on it.
- **Container behaviour.** Autowiring uses declared injection tokens, never type hints. Abstracts are `string | token | class` as Upstream, including string aliases. `app('cache')`, `app(CacheManager)` and `app(Cache\Factory)` resolve to one instance.
- **Protection.** `conformance/protected-paths` lists `/packages/contracts/ after-phase:1`. Once `decisions/PHASE-1-EXIT.md` merges, `packages/contracts/**` is Protected, and any later Story PR that touches it fails CI.
- **Story 10.6 closing gate.**
  - `api-surface:gate contracts` passes, `docs/` lists every contract with its Upstream FQCN, and `async-surface.json` is committed.
  - This is the first Component gate on real code, so the API-surface mappings are re-checked against the gate's matched and extra members: camelCase, options objects, DIV-12 renames, defaults and nullability.
  - A mapping that misreads real code raises an Escalation. It never gets an `additions.jsonl` or `exceptions.jsonl` line.

## Technical Decisions

- **Token and brand.**
  - Each contract exports an `interface` and a runtime token under the same Upstream name.
  - `Token.brand` is `Symbol.for('<Upstream FQCN>')`, typed as the contract's own `unique symbol`. The interface requires `readonly [Token.brand]: true`, so `implements` without the brand fails to compile.
  - `Symbol.hasInstance` reads the brand through the prototype chain.
  - Every brand, markers included, is a generated prototype getter `get [Token.brand]() { return true as const }`.
  - `hasBrand(classOrInstance, Token)` checks a brand without instantiating. Marker contracts (`ShouldQueue`, `ShouldBroadcast`) are brand-only tokens (DIV-9).
- **Token metadata.** All of it comes from the committed API surface, never written by hand.
  - Method names are at `Symbol.for('xaravel.contract.methods')`.
  - Parameter names are at `Symbol.for('xaravel.contract.parameters')`, as frozen per-method lists.
  - Upstream parent tokens are a frozen array at `Symbol.for('xaravel.contract.parents')`, so test doubles of a child carry every brand in the chain.
  - `statics` holds Upstream constants as frozen own properties. A static interface method gets an extra `interface <X>Static`.
  - `builtins` lists PHP built-in parent methods (`count`, `offset*`, `getIterator`, `__toString`) at `Symbol.for('xaravel.contract.builtins')`.
  - The grader reads parameters from `Symbol.for('xaravel.api.signature')`.
- **Identity.**
  - `fqcn(token)` reads the token's own frozen `Symbol.for('xaravel.class.fqcn')`.
  - `resolveClass` never resolves a token name as a class.
  - App contracts use `contract<T>('<FQCN>')`.
  - Importing a contract with `import type` for injection is a lint error.
- **Subpaths.**
  - Each contract lives at the kebab-case subpath of its Upstream namespace, mapped to `./src/<sub>/index.ts`.
  - `SUBPATH_EXPORTS` approves the 33 top-level namespaces, the nested `auth/access`, `auth/middleware`, `database/{eloquent,events,query}` and `session/middleware`, and `psr`, `aliases`, `async`, `view`, `testing`.
  - Any other subpath needs Maintainer approval.
  - `psr` holds `Psr\Container`, `Psr\SimpleCache` and `Psr\Log`, gated like every contract. IO contracts are async (`CacheInterface` is async).
- **Concrete types.** Where Upstream names a concrete class, `src/structural/<Name>.ts` declares a structural interface. Its first line is `// <FQCN> …`, which the shared thenable resolver uses to treat the type as that FQCN. A structural file's own methods get no `thenable` line.
- **Async shape (AD-6, DIV-1).**
  - Every async method carries `@asyncRoot <Contract.method>`. `@asyncRoot callback` covers DIV-1 async callbacks such as rules, listeners, pipes and job handlers.
  - `Application::register()` and `registerConfiguredProviders()` are async. `registerDeferredProvider()` and `loadDeferredProviders()` stay sync.
  - `Pipeline::then` keeps a `PromiseLike` overload.
  - `MessageProvider::getMessageBag()` stays sync.
  - `View\Factory::make()` and `file()` stay sync. `render()` awaits the creator dispatch that `make()` started (DIV-1.5).
- **Alias table and canonical tokens (AD-1).**
  - `@xaravel/contracts/aliases` holds `registerCoreContainerAliases` and the provider string bindings verbatim, as data.
  - `canonicalToken(abstract)` returns the contract alias that no other contract alias of the same service extends. If several unrelated ones remain, the first in Upstream's order wins (`'mailer'` → `Mail\Mailer`).
  - A service with no contract alias keeps its Upstream string key as canonical (`'db'`, `'files'`, `'migrator'`).
  - `validateAliasTable` fails, naming the alias, on any of these:
    - an alias listed under two services;
    - an alias of itself;
    - an alias in a ported namespace that has no token;
    - an alias of a service with neither a contract nor a string key.
- **Names and values (AD-3, AD-9, AD-26).**
  - Keep Upstream names, with methods in camelCase.
  - A method with more than one optional parameter also accepts an options object.
  - PHP built-ins map as follows: `__toString` → `toString()` + `[Symbol.toPrimitive]`, `ArrayAccess` → `offset*`, `IteratorAggregate`/`Countable` → `[Symbol.iterator]`/`count()`. `__invoke` stays.
  - Enums are classes, never TS `enum`.
  - `null` is the only absent value. By-reference parameters take `Ref<T>`.
- **Xaravel-only contracts (AD-27).** These are the only cross-package seams contracts may define, and a new one needs an Escalation.
  - `async` holds the thenable list (26 FQCNs) and `NotPromise<T>`. `async-surface` reads the list from `packages/contracts` first. Every framework class with `then` declares `implements PromiseLike<…>`.
  - `view` holds `RenderContext` and the `Blade.directive` emitted-helper ABI.
  - `testing` holds `TEST_HOOK_ORDER`, which follows Laravel:
    1. `createApplication` runs.
    2. Each `setUp<Trait>` runs and registers its `tearDown<Trait>` as a `beforeApplicationDestroyed` callback.
    3. `afterApplicationCreated` runs.
    4. The test runs.
    5. The `beforeApplicationDestroyed` callbacks run in registration order.

## Cross-Story Dependencies

- Done: Epic 9 runtime, Stories 10.1 to 10.5, and action items `epic-10-item-1..6`. Only Story 10.6 remains. It closes the Epic and depends on all of the earlier work.
- XT-contracts tests that read `conformance/upstream/` fail rather than skip under `XARAVEL_UPSTREAM=require`, which CI sets after `bun run upstream:sync`.
- Fidelity Review waivers are set per Story, in an Escalation decision's `fidelity_waiver` frontmatter. Stories 10.2 and 10.3 had F-7 waived. A waiver never carries over to another Story.
- Gaps deferred downstream:
  - The `Eloquent\Builder` thenable is answered by `@xaravel/database`.
  - Classes bound by provider bindings resolve to their key, which the Container (Epic 17) handles.
- Downstream users: the Container resolves through the alias table, Mockery and PHPUnit doubles read the token metadata, and every Phase 1–8 package depends on these interfaces.
