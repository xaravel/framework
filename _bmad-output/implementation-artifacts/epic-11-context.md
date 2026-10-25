# Epic 11 Context: Macroable

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel's `Illuminate\Support\Traits\Macroable` as `@xaravel/macroable`, so App Developers can `macro()` any class Laravel marks Macroable and extend framework classes the way Laravel allows. Macroable is the first Upstream Component in Phase 1, after `@xaravel/runtime` and `@xaravel/contracts`. Most later packages depend on it, including collections, pipeline, cache, database, events, filesystem, http, routing and foundation. Its behaviour under Scope Frames also sets the pattern for every later base-only write.

## Stories

- Story 11.1: Macroable trait

## Requirements & Constraints

- **Upstream Component.** The test scope is `tests/Support/SupportMacroableTest.php::*`, which resolves to 16 Test IDs. Under the harness, every one passes on every Variant or carries a valid Skip Reason other than `not-ported-yet`. Ported Tests use only `portedTest(...)` and `@xaravel/assert`, and every changed assertion is marked `// adapted:DIV-<n>.<clause>`.
- **Xaravel Tests.** `XT-macroable-1..3` cover the non-Upstream criteria:
  - XT-macroable-1: the runtime trait form.
  - XT-macroable-2: sealed-Application behaviour.
  - XT-macroable-3: the close gate (API surface and docs).
- **Surface.** Provide `macro(name, fn)`, `mixin(obj, replace = true)`, `hasMacro(name)` and `flushMacros()`, keeping Laravel's names. Calling an undefined macro throws Laravel's exception class with Laravel's message.
- **Call forms.** A registered macro is callable on instances, through the prototype, and statically. `this` inside a macro is bound as in Upstream: the instance for an instance call, the class for a static call. Static and non-static closures follow the four Upstream combinations. Class-based mixins honour the no-replace flag, and a macro that conflicts with an existing method does not throw.
- **Scope Frames.**
  - Macro registration is a base-only write. Before the Application is `sealed`, it goes to that Application's base.
  - After `sealed`, inside a request, job or command frame, it throws `ScopeFrameException`.
  - Inside a test frame, it goes to that test's overlay and is discarded when the test ends. A Ported Test that registers macros in its own body keeps doing so; they apply to that test only.
  - With no active frame, a write throws.
  - Macro storage must never be a module variable or a plain static field that leaks across frames.
- **Close gate.**
  - `bun run api-surface:gate macroable` passes with 0 unexplained members.
  - `packages/macroable/docs/` mirrors Laravel 13's doc page and has a "Divergences" section that cites DIV IDs.
  - Every public API has a docblock. `LICENSE` keeps Laravel's MIT notice beside Xaravel's.
- **Edit scope.** The Story edits only `packages/macroable/**`, its own Expectations lines, `conformance/oracle-requests/11.1.jsonl` and its own Escalations. The package depends only on `@xaravel/runtime` and `@xaravel/contracts`.

## Technical Decisions

- **Trait form.** Traits are runtime mixins: `class X extends mixin(Base, Macroable)`. `mixin()` and `classUsesRecursive()` come from `@xaravel/runtime`, and nothing re-implements them. The trait is registered under its Upstream FQCN `Illuminate\Support\Traits\Macroable`, so `classUsesRecursive()` reports it. Known `mixin` limits:
  - A trait method that uses a JS `#private` member throws at call time.
  - Trait constructors run at `mixin` time.
- **Installation.** `macro()` installs on the prototype or on the static side. There is no `__call` / `__callStatic` Proxy; Proxies are allowed only on `Model`. Callers type their macros through TypeScript module augmentation.
- **Closures in tests.** A closure that Upstream rebinds, such as a macro body or a `Closure::bind` / `bindTo` / `call` target, is ported as a `function` expression, never an arrow function, so `this` can be rebound. Other closures that use `$this` stay arrow functions.
- **Per-frame state.** Use the runtime Scope Frame primitives (`currentFrame()`, `frameSlot`, `frameStatic`) so that registrations after `sealed` resolve per Application and per test overlay.
- **Identity.** Use `fqcn()` and never `constructor.name`. Each class file ends with `registerClass('<Upstream FQCN>', X)`.
- **Values.** `null` is the only absent value; never return `undefined`. An options object is accepted wherever there is more than one optional parameter. Encode framework values only with the runtime codecs.
- **Code conventions.**
  - Files are `src/<Upstream sub-path>/<ClassName>.ts`, one public class per file, named exports only.
  - Everything stays sync: Macroable has no IO, and nothing returns `T | Promise<T>`.
  - Decorators are TC39.
  - Exceptions are `Error` subclasses with Laravel's names and messages, registered under their FQCN.

## Cross-Story Dependencies

- **Upstream of this Epic.** It needs Epic 9 (`@xaravel/runtime`: `mixin`, registry, Scope Frames, `ScopeFrameException`) and Epic 10 (`@xaravel/contracts`), and uses them as they are. If a needed runtime or contract seam is missing or differs, raise a `contract` Escalation; never patch those packages.
- **Downstream.** Conditionable, Collections, Pipeline, and later Support, Http, Routing, Cache, Database and Foundation all import `@xaravel/macroable`, so its public shape and its frame semantics are relied on widely. Later Epics build on the same seam: `Collection::macro`, the Http client macros, and the htmx Integration's `Route` / `FormRequest` macros and `Request` / `Response` mixins (installed with `mixinStrict`).
