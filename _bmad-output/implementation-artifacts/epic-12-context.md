# Epic 12 Context: Conditionable

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel's `illuminate/conditionable` component (the `Illuminate\Support\Traits\Conditionable` trait and `Illuminate\Support\HigherOrderWhenProxy`) as `@xaravel/conditionable`, so App Developers can call `when()` / `unless()` wherever Laravel provides them, and fluent chains branch as they do in Laravel. It is the second trait package in Phase 1 after Macroable, so it sets the precedent for trait file layout. It is also the first package to ship an AD-6 dual helper, which returns `T` for a sync callback and `Promise<T>` for an async one. Builders, collections, requests and many later classes mix it in.

## Stories

- Story 12.1: Conditionable trait

## Requirements & Constraints

- **Upstream Component.** The test scope is `tests/Conditionable/**` plus `tests/Support/SupportConditionableTest.php::*`, which resolves to 8 Test IDs (`ConditionableTest::testWhen/testUnless` and the six `SupportConditionableTest` condition-callback, default-callback and proxy tests). Under the harness, each one passes on every Variant or carries a valid Skip Reason other than `not-ported-yet`. Ported Tests use only `portedTest(...)` and `@xaravel/assert`, and every changed assertion is marked `// adapted:DIV-<n>.<clause>`.
- **Xaravel Tests.** `XT-conditionable-1..3` cover the criteria Upstream tests do not:
  - XT-conditionable-1: a closure `value` decides the branch through its result, and a call with no callback returns Upstream's higher-order proxy.
  - XT-conditionable-2: the async callback behaviour (dual helper).
  - XT-conditionable-3: the close gate.
- **Surface.** `when(value, callback, default)` and `unless(...)` keep Laravel's names, argument order and semantics. When there is more than one optional parameter, an options object keyed by the camelCase PHP names is also accepted.
- **Async (dual helper).**
  - A sync callback returns `T`, and an async callback makes the method return a Promise.
  - A `T | Promise<T>` declared return type is never allowed; use overloads instead.
  - A Promise must never be treated as a truthy condition.
- **Close gate.**
  - `bun run api-surface:gate conditionable` passes with 0 unexplained members.
  - `async-surface.json` is committed (generated with `bun run async-surface`).
  - `packages/conditionable/docs/` mirrors Laravel 13's doc coverage and has a "Divergences" section that cites DIV IDs.
  - Every public API has a docblock. `LICENSE` keeps Laravel's MIT notice beside Xaravel's.
- **Edit scope.** The Story edits only `packages/conditionable/**`, its own Expectations lines, `conformance/oracle-requests/12.1.jsonl` and its own Escalations. The package depends only on `@xaravel/runtime` and `@xaravel/contracts`, not on Macroable.

## Technical Decisions

- **File layout.** Files sit at the Upstream file path under the Component folder, not at the namespace path (Maintainer ruling after Epic 11). So the files are `src/Traits/Conditionable.ts` and `src/HigherOrderWhenProxy.ts`, with one public class per file and named exports only. Each file ends with `registerClass('<Upstream FQCN>', X)`, using the `Illuminate\Support\...` FQCNs. Use `fqcn()` for identity, never `constructor.name`.
- **Trait form.**
  - Write `class X extends mixin(Base, Conditionable)`, using `mixin()` and `classUsesRecursive()` from `@xaravel/runtime`. Never re-implement them.
  - Register the trait under its FQCN so that `classUsesRecursive()` reports it.
  - In static methods, `static::` / `new static` become `this` / `new this()`.
- **Higher-order proxy.**
  - There is no JS `Proxy` outside `Model`, and no `__get` / `__set` / `__call` emulation. Forwarding has to use explicit methods.
  - Under the DIV-12 pair list, `HigherOrderWhenProxy`'s `condition` and `negateConditionOnCapture` keep their method names, and their state moves behind Upstream's getters.
  - No DIV clause covers how the proxy forwards an arbitrary method call or property read on the target. If a proxy test seems to need dynamic forwarding, raise an Escalation (`divergence`); do not decide it locally.
- **Closures in tests.**
  - A closure that Upstream rebinds is ported as a `function` expression.
  - Any other closure that uses `$this` becomes an arrow function, so the test case stays `this`.
- **Async enforcement.**
  - An async public method carries the `@asyncRoot callback` docblock tag, and the committed `async-surface.json` is generated from the emitted `.d.ts`. CI fails on drift or a missing tag.
  - Lint runs `no-floating-promises`, `await-thenable` and `no-misused-promises` (`checksConditionals`).
  - No package has shipped a dual helper before. If the tooling cannot express one, raise a `contract` or `protected-path` Escalation; never edit `tools/`.
- **Values.** `null` is the only absent value; never return `undefined`. Upstream runs in PHP's coercive mode, so truthiness follows PHP where a test depends on it. Encode framework values only with the runtime codecs.
- **State.** The package has no per-request state. If any state is ever needed, put it in Scope Frame slots, never in module variables or static fields.
- **Conventions.** No IO. Decorators are TC39. Exceptions, if any, are `Error` subclasses with Laravel's names and messages.

## Cross-Story Dependencies

- **Upstream of this Epic.** It needs Epic 9 (`@xaravel/runtime`: `mixin`, the registry, PHP value helpers) and Epic 10 (`@xaravel/contracts`), and uses them as they are. If a needed seam is missing or differs, raise a `contract` Escalation; never patch those packages.
- **Epic 11 follow-up.** The Macroable move to `src/Traits/Macroable.ts` (retro item 8) lands before this Epic, and Conditionable must match that layout.
- **Downstream.** Collections, Support, query builders, Http, and other later classes mix in Conditionable. Its trait shape, proxy behaviour and dual-helper typing are relied on widely.
