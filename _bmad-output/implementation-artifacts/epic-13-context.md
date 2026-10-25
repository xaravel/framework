# Epic 13 Context: Reflection

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Port Laravel's `illuminate/reflection` component (`Illuminate\Support\Reflector`, the `Illuminate\Support\Traits\ReflectsClosures` trait and the `lazy` / `proxy` helpers) as `@xaravel/reflection`. Framework code can then inspect closures and callables as Laravel's Reflector does. TypeScript erases types, so a callable's declared parameters are read from its `inject` metadata (DIV-3) and not from runtime type hints. Events (listener discovery), Container and Routing rely on this to read a callable's declared parameter classes (DIV-3, DIV-7).

## Stories

- Story 13.1: Reflector and ReflectsClosures

## Requirements & Constraints

- **Upstream Component.** The test scope is `tests/Support/SupportReflectorTest.php::*` and `tests/Support/SupportReflectsClosuresTest.php::*`, which resolve to 24 Test IDs: 10 Reflector tests and 14 ReflectsClosures tests. Under the harness, each one passes, or carries a valid Skip Reason other than `not-ported-yet`. Ported Tests use only `portedTest(...)` and `@xaravel/assert`, and every changed assertion is marked `// adapted:DIV-<n>.<k>`.
- **Xaravel Tests.** `XT-reflection-1..4` cover the criteria Upstream tests do not:
  - XT-reflection-1: for a closure or method declared with `inject({ event: OrderShipped })`, `firstClosureParameterType` / `getParameterClassName` return the declared class from the metadata.
  - XT-reflection-2: a closure with no `inject` declaration throws Upstream's exception type (`RuntimeException`), with a message that names the `inject` form.
  - XT-reflection-3: classifying tests that need PHP-runtime reflection with no TypeScript analogue.
  - XT-reflection-4: the close gate (api-surface, docs).
- **Classification rule.** A test that depends on PHP-only reflection is adapted when a DIV-3 clause covers it. DIV-3.1 is the only clause today: an Upstream parameter type hint becomes `inject({...})` with the same names and order, and the assertions stay unchanged. Without a covering clause, the test is `intentional-divergence:DIV-3` only if the behaviour does not exist in Xaravel at all. If neither fits, raise an Escalation. Never invent a clause.
- **Known gaps to classify, not to decide locally.** No DIV clause yet covers these:
  - closure return types (the six `testClosureReturnTypes*` tests): `inject` records parameters only;
  - an untyped parameter between typed ones (`[null, X]`): `inject` rejects `null` / `undefined` values;
  - `ReflectionParameter` / `ReflectionClass` arguments to `Reflector` methods;
  - PHP callable arrays and `__call` / `__callStatic` in `testIsCallable`: DIV-9.13 covers only `when` / `unless`;
  - PHP lazy objects behind `lazy()` / `proxy()`.

  Each one needs an existing clause, a Skip Reason that really applies, or an Escalation (`divergence` / `contract`).
- **Close gate.**
  - `bun run api-surface:gate reflection` passes with 0 unexplained members. The `reflection.jsonl` export lists `Reflector`'s 7 public statics, the `ReflectsClosures` trait, and the `lazy` / `proxy` functions.
  - `additions.jsonl` and `exceptions.jsonl` are Protected, so an entry there needs an Escalation.
  - `packages/reflection/docs/` has a "Divergences" section that cites DIV IDs. Every public API has a docblock. `LICENSE` keeps Laravel's MIT notice.
- **Edit scope.** The Story edits only `packages/reflection/**`, its own Expectations lines (`conformance/expectations/reflection/...`), `conformance/oracle-requests/13.1.jsonl` and its own Escalations.

## Technical Decisions

- **Package state.** `packages/reflection` is scaffolded but holds no code: `src/index.ts` is `export {}`, and `tests/ported` and `tests/xaravel` are empty. `package.json` already depends on `@xaravel/collections`, `@xaravel/contracts` and `@xaravel/runtime`, with `@xaravel/assert` and `@xaravel/mockery` as dev dependencies.
- **The metadata source.**
  - `inject(map)` / `inject(map, fn)` and `readInjectMetadata(target)` live in `packages/runtime/src/metadata/inject.ts` and are exported from `@xaravel/runtime`.
  - `readInjectMetadata` returns a frozen map in parameter order, or `null`. A method's map is per function (an override without `inject` has none). A class's map is inherited through the metadata chain.
  - Use these helpers as they are. If they cannot express what you need, raise a `contract` Escalation; never edit `packages/runtime`.
- **Spec values.** A Spec is a class or token, `String` / `Number` / `Boolean`, `primitive`, a contextual descriptor, or `oneOf(A, B)` for unions.
  - Only a class or a token is a "class name" result.
  - `oneOf`, `primitive` and the descriptors belong to Container (Epic 17) and do not exist yet. Do not define them in reflection, because that is F-8.
  - Union tests that need them get `blocked-by:container` only if the harness really fails with `BlockedByComponentError(container)`. Otherwise, escalate.
- **File layout.** Files sit at the Upstream file path under the Component folder (Maintainer ruling after Epic 11):
  - `src/Reflector.ts` and `src/Traits/ReflectsClosures.ts`, with the helpers in `@xaravel/reflection/helpers`;
  - one public class per file, named exports only;
  - each file ends with `registerClass('Illuminate\\Support\\...', X)`;
  - identity uses `fqcn()`, never `constructor.name`.
- **Trait form.** `class X extends mixin(Base, ReflectsClosures)`, using `mixin()` / `classUsesRecursive()` from `@xaravel/runtime`. Its methods are `protected` in Upstream. `static::` becomes `this`.
- **PHP constructs.**
  - PHP attributes (`getClassAttribute(s)`) are TC39 decorators with the same name and arguments.
  - `RuntimeException` and other PHP exceptions come from `@xaravel/runtime`, with Upstream's messages exactly (for example `The given Closure has no parameters.`).
  - `null` is the only absent value; never return `undefined`.
  - Everything is sync (no IO, no `@asyncRoot` tags). Decorators are TC39, never `experimentalDecorators`.
  - There is no per-request state.
- **Later-Phase dependencies in tests.** `SupportReflectorTest` reflects `PendingMailFake`, `MailFake`, `BusFake` and `Model`. Each test that needs one is `blocked-by:<component>` (mail, bus, support, database), never faked.
- **Collections.** Upstream builds results with `Collection`, and `getClassAttributes` returns one, but Collections is Epic 14 and has no code yet. Do not stub it.
  - Internal helpers may use plain arrays.
  - A public return that must be a `Collection` is `blocked-by:collections` (under the harness rule above), or goes to an Escalation.
- **Fidelity Review.** F-1..F-10 apply. The key ones here:
  - F-3/F-5: every `adapted:DIV-3.1` marker must be exactly the inject declaration, with the assertions unchanged.
  - F-4: Skip Reason precedence is `intentional-divergence`, then `blocked-by`, then `not-ported-yet`.
  - F-8: no stand-ins for Container or Collections.

## Cross-Story Dependencies

- **Upstream of this Epic.** Runtime (Epic 9: `inject`, the registry, `mixin`, PHP exceptions) and Contracts (Epic 10), used as they are.
- **Later Epics.**
  - Collections (Epic 14) and Container (Epic 17, which owns `oneOf` / `primitive` / descriptors) are not built yet. Tests that need them wait through `blocked-by`, which their re-verification Stories clear.
  - Events listener discovery (DIV-7.1: first `inject` key of `handle` / `__invoke`, and `oneOf` registering for each class) and Routing / Container method injection consume this package's parameter-reading API.
