# Epic 9 Context: `@xaravel/runtime`: Scope Frames, Class Registry, PHP values & codecs

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build `@xaravel/runtime`, the zero-dependency L0 package every later Component builds on. It provides one per-unit state sandbox (Scope Frames), one class identity (the Class Registry with `fqcn()`), one PHP value model (`PhpArray`, `Ref`, the float marker, null normalisation, PHP semantics helpers), one PHP serializer and one JSON encoder, trait composition and `inject` metadata, and PHP's exception hierarchy. Concurrent units must never leak state, and payloads must interoperate byte for byte with PHP Laravel. This is the first Epic of Phase 1. The Phase 1 gate is open because `decisions/PHASE-0-EXIT.md` is signed.

## Stories

- Story 9.1: Scope Frame primitive and `interleave`
- Story 9.2: Frame kinds, defer list and context propagation
- Story 9.3: Per-Application overlays and `frameStatic`
- Story 9.4: Class Registry and `fqcn()`
- Story 9.5: `PhpArray`, `Ref`, float marker and null normalisation
- Story 9.6: PHP semantics helpers
- Story 9.7: `phpSerialize` / `phpUnserialize` codec
- Story 9.8: `jsonEncode` / `jsonDecode` with PHP flag semantics
- Story 9.9: `mixin`, traits and `inject` metadata
- Story 9.10: PHP exception hierarchy
- Story 9.11: Grader follow-ups to the runtime value model
- Story 9.12: Mockery exceptions on the runtime's SPL classes
- Story 9.13: Oracle rows for the runtime's PHP-mirroring checks
- Story 9.14: `fqcn()` of a contract token

## Requirements & Constraints

- **Kind.** This is a Xaravel Component, so there are no Ported Test IDs. Each acceptance criterion is verified by an `XT-runtime-<n>` Xaravel Test. Behaviour that mirrors PHP (key normalisation, loose comparison and casts, `serialize`, `json_encode`) is verified by Oracle Differential Xaravel Tests, using per-Story requests in `conformance/oracle-requests/<story-id>.jsonl`.
- **Zero dependencies.** The graph check must show none. Nothing else in the repo may re-implement these primitives.
- **Class Registry.** Resolving an unregistered class name throws an error that names the missing class. Classes register when their module loads.
- **Isolation.** Under concurrent load, no request, session, auth, transaction, Context or scoped-container state crosses units. `interleave(units)` is the dev-only helper every later concurrency test uses. It runs units in lockstep and switches deterministically at every `await`.
- **Codecs.** `phpSerialize` must be byte-identical to PHP. It uses UTF-8 byte-length prefixes, `d:` floats at `serialize_precision = -1` (including `0.1`, `1e100`, `-0.0`), objects by Registry FQCN, and `allowedClasses`, which rebuilds a class outside the list as `__PHP_Incomplete_Class`. `jsonEncode` must be byte-identical across PHP flag combinations. It honours the `JsonSerializable` / `Arrayable` / `Jsonable` hooks, detected by the `Symbol.for(<FQCN>)` brand without importing contracts, and writes a `bigint` as exact digits.
- **Epic close.** `docs/` describes every runtime primitive, and the package commits `async-surface.json` (empty if no method is async).

## Technical Decisions

- **Scope primitive.** The only framework `AsyncLocalStorage` lives in `@xaravel/runtime/scope`, which exports `currentFrame()`, `runInFrame(kind, fn)` and `frameSlot(key, init)`. On load it installs `globalThis[Symbol.for('xaravel.scope.run')]`, which the grader calls without importing the runtime. Writing with no active frame throws `ScopeFrameException`.
- **Frame kinds.**
  - A unit frame owns an overlay.
  - A narrow frame (`DB.transaction`, a Concurrency task, `Context.scope`) overrides only the slots it declares; every other read and write passes through to the enclosing unit.
  - A child unit reads fall through to its parent. Under a `test` frame it holds only request, route and CSP nonce, and every other write lands in the test frame. Under a non-test frame it keeps its own writes.
  - A unit ends only after its `defer` list drains.
- **Overlays.** Overlays are keyed by Application and frame. Lookups use `currentFrame()?.app`, falling back to the process's default Application. `frameStatic(Class, key)` holds Upstream static setters (`Model.unguard`, `Carbon.setTestNow`) per unit and discards them when the unit ends.
- **Bun 1.4.3 ALS gaps (OQ-11 probes, Story 8.3).**
  - Supported: `als.await`, `als.timers`, `als.stream-body` and `als.concurrent-requests`.
  - Unsupported: `als.async-generator`, `als.direct-stream` and `als.serve-callbacks`.
  - ESC-8.3-1 (approved): wrap async-generator bodies with `AsyncLocalStorage.snapshot()` around each `next`/`return`/`throw`, and bind the `pull` of a `type: "direct"` stream. AD-5 also requires wrapping stream bodies and timers created in a frame.
  - ESC-8.3-2 (approved): the HTTP kernel renders exceptions inside the frame. An error that escapes carries the frame's `snapshot()`, and the `Bun.serve` `error` callback runs inside it.
  - The unsupported probes stay recorded as unsupported. `probes:check` fails if a Bun bump fixes them or if a workaround stops restoring the frame.
- **Registry (AD-10).**
  - It lives in `@xaravel/runtime/registry` and is keyed by PHP FQCN.
  - `fqcn(classOrInstance)` throws for an unregistered class. Never use `constructor.name` for identity.
  - Every framework class file ends with `registerClass('<FQCN>', X)`, and no package sets `sideEffects: false`. Registering a different class under an existing key throws. Registering the same class under a second FQCN throws and names both FQCNs.
  - `registration:check` fails a `registerClass` call whose class is not declared in the same file. Story 9.4 re-checks the recogniser against the first real calls and raises an Escalation on any mismatch. The Maintainer approved Story 9.4's edits under `tools/registration/` as Infrastructure work.
  - `registerTestClass` writes to the test frame's overlay only.
  - The PSR-4 map comes from `package.json` `xaravel.autoload.psr-4`. An async miss uses `await import()`. `writeClassmap` / `loadClassmap` handle `bootstrap/cache/classes.json`.
  - `registerClass` also sets the grader's class-name brand (ESC-4.3-1 item 1).
  - Contract tokens (ESC-10.1-3). A `contract<T>()` token is a frozen, non-function object, because both test doubles treat every function as a class. It carries its FQCN as an own, non-writable `Symbol.for('xaravel.class.fqcn')` string data property. `fqcn(token)` returns that string; for every other value `fqcn()` behaves as before (registered class or instance gives its FQCN, test frames first; anything else throws). `resolveClass` never resolves a token's name as a class, and tokens are never passed to `registerClass`.
- **Value model (AD-9, DIV-9).**
  - `null` is the only absent value, and `undefined` is never returned.
  - A list is an `Array`, and an all-non-integer-string-keyed map is a plain object. Anything else is a `PhpArray` branded `Symbol.for('xaravel.php.array')`. Its `[Symbol.iterator]()` yields normalised `[key, value]` pairs in insertion order, which is the protocol the grader reads (ESC-4.1-1). Its JSON form follows the list rule.
  - Objects compared with PHP `==` expose `[Symbol.for('xaravel.php.props')]()`.
  - `Ref<T>` is used for by-reference parameters.
  - int and float are both `number`. The float marker carries the distinction where Upstream depends on it, and `isFloat(v)` reads it.
  - Brands sit on the prototype as getters. `hasBrand` checks one without instantiating.
  - Scalar parameters follow PHP's coercive mode, which is how Upstream and the Oracle run. Where Upstream's behaviour or a test depends on it, a ported parameter typed `int`, `float`, `string` or `bool` accepts what coercive mode accepts and converts it as PHP does. Anything else throws PHP's `TypeError` with PHP's message. `PORTING.md` § Scalar coercion lists the conversions, and the Oracle settles any doubt. Skipping a coercion that Upstream relies on needs a DIV clause first, so raise an Escalation rather than deciding it in the Story (ESC-9.10-2).
- **Async (AD-6).** IO is async only behind async-root Driver contracts. The runtime has none, so keep it sync and never return `T | Promise<T>`.
- **Codecs (AD-23).** `@xaravel/runtime/php` holds the only codecs and PHP builtins. `JSON.stringify` on framework values is a lint error.
- **Decorators (AD-4).**
  - Decorators are TC39; never set `experimentalDecorators`.
  - The runtime installs the polyfill `Symbol.metadata ??= Symbol.for('Symbol.metadata')`.
  - `inject({...})` works as a class or method decorator, and `inject(map, fn)` wraps a function. Map key order is parameter order. `readInjectMetadata` returns the map with its order preserved.
- **Traits (AD-26).** `mixin(Base, ...Traits)` composes traits, which are registered under their Upstream FQCNs. `classUsesRecursive` returns them in Upstream order, including traits used by traits. `bootTraits` runs once per class and `initializeTraits` once per instance.
- **Layout (AD-3).** Use `src/<Upstream sub-path>/<ClassName>.ts`, one public class per file, named exports only, and Laravel's names and messages.
- **Exceptions.** Port PHP's base, `Error` and SPL classes as JS `Error` subclasses with PHP's parent chain, each registered under its PHP name. They expose `getMessage`, `getCode` and `getPrevious`. They are published through a `Symbol.for` protocol the grader reads without importing the runtime (ESC-4.3-1 items 10 and 14, ESC-4.4-2 item 7, ESC-4.5-1 item 2).

## Cross-Story Dependencies

- Stories 9.2 and 9.3 build on 9.1. Story 9.4's `registerTestClass` needs 9.3's overlays.
- Stories 9.7 and 9.8 need 9.4 (objects by FQCN) and 9.5 (`PhpArray`, float marker). Story 9.10 needs 9.4.
- Story 9.11 is component `assert` (`@xaravel/assert` only) and needs 9.5 and 9.10. It must keep grader isolation: it reads brands and protocols only and never imports `@xaravel/runtime`. It closes these items:
  - the int/float `===` gap, plus a `===` matrix in `oracle-requests/4.1.jsonl` (ESC-4.1-1);
  - the grader's half of DIV-9.8 (its exceptions extend the runtime's SPL classes; `ExceptionComparator` takes only `\Exception`s) and the message-rewrite API (ESC-4.3-1 items 10 and 11);
  - PHPUnit double return types and defaults from surface rows (ESC-4.7-1 item 2);
  - late assertions reported to `xaravel.harness.late` (ESC-5.3-3).
- Story 9.12 is component `mockery` (split out of 9.11 by ESC-9.11-1) and needs 9.10 and 9.11. Mockery's exceptions (its copies in `packages/mockery/src/php/`) extend the runtime's SPL classes when the runtime's class map is published, and keep today's chain when it is absent (ESC-4.5-1 item 2).
- Story 9.13 is component `runtime` (split out of the Epic 9 retro by a Maintainer ruling) and needs 9.4, 9.5 and 9.6. It adds Oracle rows in `conformance/oracle-requests/9.13.jsonl` for existing runtime checks that mirror PHP but have none: class-name lookups (case-insensitive names, leading `\`; XT-runtime-12..14), by-reference writes through `Ref<T>` versus PHP `&` (XT-runtime-18), `normalizeNull` (XT-runtime-20) and `valueCopy` copy-on-write of nested arrays and `PhpArray` (XT-runtime-23). Any difference a signed fixture shows is fixed in `packages/runtime`, never by removing or weakening an assertion.
- Story 9.14 is component `runtime` and needs 9.4. It is the runtime half of ESC-10.1-3: one branch in the registry's `fqcn()`, verified by XT-runtime-40. It unblocks Story 10.1's XT-contracts-3 (a token's FQCN resolvable through `fqcn()`) and feeds the container and Story 10.4's `canonicalToken`. No new key is added; the token key already exists for the test doubles.
- DIV-9.8 closes only after both 9.11 and 9.12 land: a planning change then records the closure in `decisions/DIV-9.md`, naming both Stories, and updates the `PORTING.md` line that cites it.
- Epic 10 (`@xaravel/contracts`) depends on the runtime and supplies the interface tokens whose brands 9.5 and 9.8 detect.
- Every later Component depends on the runtime.
