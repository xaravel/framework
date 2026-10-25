---
title: 'Story 13.1: Reflector and ReflectsClosures'
type: 'feature'
created: '2026-10-25'
status: 'blocked'
baseline_revision: '04d44e566dc76d6d360f23f72fc5250731fad5ff'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/PORTING.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context.md'
  - '{project-root}/decisions/MAINT-2026-10-25-story-13-1.md'
  - '{project-root}/decisions/DIV-3.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/packages/runtime/docs/reflection.md'
  - '{project-root}/conformance/review/fidelity.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Six new blocked-by lines (mail x2, bus, database x2, collections) rely on epics.md's global re-verification
      rule; no Story in the Mail, Bus, Database or Collections epics names them with `component: reflection`.
    evidence: |-
      Epic 12 lesson in lessons.md: a new blocked-by line needs a named re-verification AC in the blocking epic.
      epics.md has none for SupportReflectorTest. Adding one edits epics.md, which waits on the Maintainer.
    location: '_bmad-output/planning-artifacts/epics.md (Epics 14, Mail, Bus, Database)'
    severity: low
---

<intent-contract>

## Intent

**Problem:** `@xaravel/reflection` is an empty scaffold, so all 24 Test IDs are `not-ported-yet`. The Maintainer has now ruled on ESC-13.1-1..6 (`decisions/MAINT-2026-10-25-story-13-1.md`, all option 1), and #435 has landed the runtime half: PHP reflection classes, the Spec values, `returns` and `attribute`.

**Approach:** Port `Reflector` and `ReflectsClosures` line for line over `@xaravel/runtime`'s reflection classes. Port the tests under DIV-3.2-3.4, DIV-9.14 and DIV-12.15, with the Skip Reasons the ruling names. Re-planning against the runtime found three gaps that no ruling covers. Each is raised as a new Escalation and stops only its own items: ESC-13.1-7, ESC-13.1-8 and ESC-13.1-9. Everything else is built now.

## Boundaries & Constraints

**Always:**
- Edit only `packages/reflection/**`, the 24 lines in `conformance/expectations/reflection/**` and `conformance/escalations/ESC-13.1-<n>.md`. The only other changes are orchestrator bookkeeping: this spec, sprint status, and the `stories/13.1.md` status.
- Files go at `src/Reflector.ts` and `src/Traits/ReflectsClosures.ts`, one class per file, named exports. Each file ends with `registerClass('Illuminate\\Support\\Reflector' | 'Illuminate\\Support\\Traits\\ReflectsClosures', X)`. The trait is a runtime trait used as `mixin(Base, ReflectsClosures)`. Its methods are `protected`, as Upstream declares them.
- Types are read only through `ReflectionFunction`, `ReflectionMethod`, `ReflectionClass`, `ReflectionParameter` and their type classes from `@xaravel/runtime`. Messages are Upstream's exactly. Everything is sync, and `null` is the only absent value.
- Upstream builds its results with `Collection`, which does not exist yet (Epic 14). The internal code uses plain arrays. `closureParameterTypes` returns a plain object keyed by parameter name, the form PHP's all-string-keyed array takes. The list results are JS arrays.
- Ported Tests keep every assertion. Each changed line carries `// adapted:DIV-<n>.<k>`, and each Expectations line carries one clause.

**Never:**
- Never edit `packages/runtime`, `packages/assert`, `packages/contracts`, `conformance/api-surface/**` or any other package (F-8). Never add a stand-in for Collection, Mail, Bus, Model or a token lookup.
- Never use a JS `Proxy`, or read `Function.prototype.toString()`.
- Never port `lazy` / `proxy`: DIV-12.14 and `exceptions.jsonl` already cover them.
- Never port the escalated items before their ruling: `isParameterBackedEnumWithStringBackingType`, testParameterSubclassOfInterface, testItReturnsTheFirstParameterType, XT-reflection-3 and XT-reflection-4.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Class hint | `@inject({ x: A })` method, or `inject({ event: OrderShipped }, fn)` | `getParameterClassName` / `firstClosureParameterType` give `fqcn(A)` | — |
| Builtin / untyped / union | `String`, `primitive`, `oneOf(A, B)` | `getParameterClassName` gives `null`; `getParameterClassNames` gives `[fqcn(A), fqcn(B)]`, builtins dropped | — |
| Relative | `parent` marker on `B extends A`; `self` marker | `fqcn(A)`; the declaring class's FQCN | `parent` with no registered parent gives `'parent'`, as PHP does |
| Variadic | `variadic(A)` | `null` in `closureParameterTypes` and `firstClosureParameterTypes` | — |
| No params / no first type | `inject({}, fn)`; first key `primitive` | — | `RuntimeException` `The given Closure has no parameters.` / `The first parameter of the given Closure is missing a type hint.` |
| Undeclared closure | a function with no `inject` | — | the runtime's `RuntimeException` naming `inject({ <param>: <Spec> }, fn)`, unchanged (XT-reflection-2) |
| Return types | `returns(A | oneOf(A, String) | String | self | static | allOf(I, J), fn)`, none | `[fqcn(A)]`, `[fqcn(A)]`, `[]`, `[]`, `[]`, `[]`, `[]` | — |
| isCallable | the testIsCallable cases, plus `'Class::method'`, a `#private` method, an object with `__invoke`, an unknown string | as Upstream, with DIV-9.14's edges | never throws |
| Class attribute | `getClassAttribute(C, StrAttr, ascend)` | first instance from C's own list, then from each parent when `ascend` is true; else `null` | every instance on the walked classes is built first (`newInstance()`), as Upstream does |
| Attribute collection | `getClassAttributes(...)` | — | throws `BlockedByComponentError('collections')`, as its `Collection` return does not exist yet |

</intent-contract>

## Code Map

- `conformance/upstream/framework/src/Illuminate/Reflection/Reflector.php` -- 7 public statics plus protected `getTypeName` (resolves `self` / `parent`). Port each line for line. `static::` becomes `this`. PHP's falsy `return;` becomes `return null`. `array_filter` drops falsy values.
- `conformance/upstream/framework/src/Illuminate/Reflection/Traits/ReflectsClosures.php` -- 4 protected methods. `new ReflectionFunction($closure)`, `getParameters()`, `isVariadic()`, `getName()`, `getReturnType()`. `instanceof ReflectionUnionType` / `ReflectionIntersectionType`. `isBuiltin()`. Return names `'static'` and `'self'` are rejected.
- `conformance/upstream/framework/tests/Support/SupportReflectorTest.php`, `SupportReflectsClosuresTest.php`, `Fixtures/ClassesWithAttributes.php`, `Fixtures/UnionTypesClosure.php` -- the Upstream tests and fixtures, all read-only.
- `packages/runtime/docs/reflection.md` -- the reflection API to build on: Spec → type table, `getParentClass()` gives `false`, the `ReflectionClass` input forms, `getAttributes(filter)`, and `newInstance()`'s PHP errors. Imports: `ReflectionClass`, `ReflectionMethod`, `ReflectionFunction`, `ReflectionNamedType`, `ReflectionUnionType`, `ReflectionIntersectionType` and `ReflectionException` from `@xaravel/runtime/php`. `inject`, `returns`, `primitive`, `self`, `parent`, `static`, `variadic`, `oneOf`, `allOf`, `mixin`, `registerClass`, `registerTestClass`, `resolveClass`, `fqcn`, `BlockedByComponentError` and `RuntimeException` come from `@xaravel/runtime`.
- `packages/runtime/src/registry/registry.ts` -- `resolveClass(name)` throws PHP `Error` when the name is missing. It stands in for `class_exists`. `registerTestClass` must run inside a test frame, so call it in `setUp`.
- `packages/conditionable/` -- the template from the last Story: the `mixin(null, Trait)` trait shape and the per-file header comment. Ported tests go under `tests/ported/framework/tests/Support/*.test.ts`. The local `class X extends TestCase` takes a `setUp` that registers fixtures or throws `BlockedByComponentError("<c>")` (`ConditionableTest.test.ts`). Also there: `tests/xaravel/*.test.ts` with `xaravelTest(...)`, `docs/conditionable.md` with a Divergences section, `README.md` and `async-surface.json`.
- `packages/assert/src/Framework/Constraints.ts:300` -- `classOrInterface` rejects a string with `UnknownClassOrInterfaceException`. That is why testItReturnsTheFirstParameterType waits (ESC-13.1-9).
- `packages/contracts/src/Contract.ts:208` -- `contract(fqcn, members, parents)` builds the token for a PHP interface. A class implements a token through a `[Token.brand]` getter that returns `true` (`packages/contracts/tests/xaravel/brand-compile.test.ts:39`). Use it for `ReflectsClosuresInterfaceOne` / `Two`. `@xaravel/contracts` is already a dependency.
- `conformance/expectations/reflection/framework/tests/Support/{SupportReflectorTest,SupportReflectsClosuresTest}.jsonl` -- the 24 lines. Each carries `escalation: ESC-13.1-<n>` today.

## Tasks & Acceptance

**Execution:**
- `conformance/escalations/ESC-13.1-7.md`, `-8.md`, `-9.md` -- already written by the orchestrator during planning. Do not edit them.
- `packages/reflection/src/Reflector.ts` -- port all statics except `isParameterBackedEnumWithStringBackingType`, which waits on ESC-13.1-8: leave it undeclared.
  - `isCallable`: DIV-9.14. A class is a constructor, or an FQCN string resolved with `resolveClass`. For `method_exists`, try `new ReflectionMethod(class, m)` and treat `ReflectionException` as false. A non-array argument is callable when it is a function, an object with a function `__invoke`, or a `'Class::method'` string that the array rules accept as `[Class, method]` with no object. Under `syntaxOnly`, any string is callable. Everything else is false.
  - `getParameterClassName(s)` / `getTypeName` / `isParameterSubclassOf`: line for line. For `class_exists || interface_exists`, use "`resolveClass` succeeds". ESC-13.1-7 records the token gap; do not work around it.
  - `getClassAttribute`: under ESC-13.1-4's ruling, the array form of `getClassAttributes(...)->flatten()->first()`. A private static helper builds the same per-class instance lists. `getClassAttributes` throws `new BlockedByComponentError("collections", …)`. Its return type is `@xaravel/contracts`' structural `Collection` type, if one fits; otherwise `unknown`.
- `packages/reflection/src/Traits/ReflectsClosures.ts` -- the trait's 4 protected methods, ported line for line, with plain arrays and objects in place of `Collection`.
- `packages/reflection/src/index.ts` -- named exports `Reflector` and `ReflectsClosures`.
- `packages/reflection/tests/ported/framework/tests/Support/SupportReflectorTest.test.ts` and `SupportReflectsClosuresTest.test.ts`, plus fixture modules under `.../Support/Fixtures/` for `ClassesWithAttributes` and `UnionTypesClosure` -- port every Test ID. Upstream's local classes register under `Illuminate\Tests\Support\…` / `…\Fixtures\…` in `setUp`. A `require` becomes an import, or a dynamic import inside the body when the fixture imports from the test module.
  - Blocked tests keep Upstream's body. They get a per-group case class whose `setUp` throws `BlockedByComponentError` (`mail`, `bus`, `database`, `collections`) and reach the missing classes through `resolveClass(<FQCN>)`.
  - The two escalated tests (testParameterSubclassOfInterface, testItReturnsTheFirstParameterType) are not declared, so their lines stay `not-ported-yet`.
- `packages/reflection/tests/xaravel/reflection.test.ts` -- XT-reflection-1: `getParameterClassName` on a method declared `@inject({ event: OrderShipped })`, and `firstClosureParameterType` on `inject({ event: OrderShipped }, fn)`, give `fqcn(OrderShipped)`. Cover the matrix rows too: `self`, `getParameterClassNames` on a union, every `isCallable` edge, `getClassAttribute`'s eager build and `null`, and `getClassAttributes`' throw. XT-reflection-2: a closure with no `inject` throws `RuntimeException` naming `inject({ <param>: <Spec> }, fn)`, through each of `closureParameterTypes`, `firstClosureParameterType` and `firstClosureParameterTypes`. Cite FR-26 bullets in the consequence strings, as conditionable does.
- `packages/reflection/docs/reflection.md` and `README.md` -- describe the API with docblocks. The Divergences section cites DIV-3.2, DIV-3.3, DIV-3.4, DIV-9.14, DIV-12.14 and DIV-12.15. Also list the open items (ESC-13.1-7..9) and `getClassAttributes`' block. Do not touch `LICENSE`.
- `packages/reflection/async-surface.json` -- generate it as conditionable's was, if `async-surface --all --check` asks for it.
- The Expectations shards -- set each line as Design Notes § Classification says. The escalated lines keep `skip` / `not-ported-yet` and take their new ESC id.

**Acceptance Criteria:**
- Given `bun run harness --story 13.1`, when it runs, then no line differs. The 14 `pass` lines pass, and the 6 `blocked-by` lines report `BlockedByComponentError(<c>)`.
- Given `getParameterClassName` / `firstClosureParameterType` on a declared `inject({ event: OrderShipped })`, when it runs, then it gives `fqcn(OrderShipped)` (XT-reflection-1).
- Given a closure with no `inject`, when its parameter types are requested, then the `RuntimeException` names the `inject` form (XT-reflection-2).
- Given the diff, when `git diff --stat` is read, then only the Boundaries' paths change.

## Spec Change Log

- 2026-10-25 — Re-plan after the Maintainer's rulings on ESC-13.1-1..6 (`decisions/MAINT-2026-10-25-story-13-1.md`) and the runtime item (#435). It replaces the first attempt's "escalate everything" plan; the six gaps it listed are closed by DIV-3.2-3.4, DIV-9.14, DIV-12.14 and DIV-12.15. Planning against the landed runtime found three new gaps (ESC-13.1-7..9, Design Notes), which stop only their own items. KEEP: the line-for-line port and the edit scope. Never define reflection stand-ins in the package.

## Review Triage Log

## Design Notes

**New Escalations** (raised during planning, each stopping only its items):

| ESC | Trigger | Gap | Stops |
| --- | --- | --- | --- |
| ESC-13.1-7 | contract | `isParameterSubclassOf` passes a class *name* to `class_exists` / `interface_exists` and `new ReflectionClass(...)`. A contract token's FQCN is not in the Registry, so an interface hint can never resolve. The runtime item deferred this to the Story. | testParameterSubclassOfInterface |
| ESC-13.1-8 | contract | `isParameterBackedEnumWithStringBackingType` needs `enum_exists` and `ReflectionEnum`. No AD defines a ported enum model (ESC-9.7-1), and the runtime ports no `ReflectionEnum`. | `isParameterBackedEnumWithStringBackingType`, XT-reflection-4 (close gate) |
| ESC-13.1-9 | contract | `assertInstanceOf($type, …)` takes the class-string that `firstClosureParameterType` returns. `@xaravel/assert` rejects every string ("no global class table"), though the Class Registry now exists. | testItReturnsTheFirstParameterType |
| ESC-13.1-10 | contract | Raised during implementation. `bun run expectations:reasons` accepts `blocked-by:<c>` only when `<c>` is in a later Phase (`tools/expectations/reasons.ts:17`). Collections and reflection are both Phase 1, so the ruling's `blocked-by:collections` for testGetClassAttributes cannot be recorded. | testGetClassAttributes |

XT-reflection-3 (classification of every Test ID) is written once ESC-13.1-7..9 are ruled.

**Classification** (one clause per line):

| Test ID | Status | Reason / adapted |
| --- | --- | --- |
| testGetClassName, testEmptyClassName | skip | `blocked-by:mail` |
| testStringTypeName | skip | `blocked-by:bus` |
| testSelfClassName, testUnionTypeName | skip | `blocked-by:database` |
| testGetClassAttributes | skip | `blocked-by:collections` |
| testGetClassAttribute | pass | DIV-12.15 (`@attribute(X, ...args)` fixtures) |
| testParentClassName | pass | DIV-3.2 (`@inject({ x: parent })`) |
| testIsCallable | pass | DIV-9.14 (a class-string becomes the constructor; visibility is erased) |
| testParameterSubclassOfInterface | skip | `not-ported-yet`, ESC-13.1-7 |
| testReflectsClosures, testItThrowsWhenNoParameters, testItThrowsWhenNoFirstParameterType, testItWorksWithUnionTypes, testItWorksWithUnionTypesWithNoTypeHints, testItWorksWithUnionTypesWithNoArguments, testItThrowsWhenFirstParameterHasNoTypeHintEvenIfLaterParameterDoes | pass | DIV-3.3 (`inject({}, fn)`, `primitive`, `variadic`; unions through `oneOf`) |
| testClosureReturnTypes* (6) | pass | DIV-3.4 (`returns(...)`) |
| testItReturnsTheFirstParameterType | skip | `not-ported-yet`, ESC-13.1-9 |

**Port forms.**
- A closure with `$this`-free bodies is an arrow function wrapped `inject({ one: ExampleParameter }, (one: ExampleParameter) => { throw new RuntimeException(); })`. A nullable `?X` hint is `X`, because PHP's named type for `?X` is `X`.
- Upstream's `X::class` compared against a returned name is `fqcn(X)` (AD-10 idiom, no marker).
- `closureWithSelfReturnType()` returns `returns(self, () => new this())`, or the class, as the static method allows. PHP interfaces are `contract('Illuminate\\Tests\\Support\\<Name>')` tokens.
- Mark each line that wraps a closure or declares a fixture hint, and each assertion it feeds. Use the clause of the table row.

**getClassAttribute.** `getClassAttributes` cannot return a `Collection` before Epic 14 (epic context: "A public return that must be a `Collection` is `blocked-by:collections`"). ESC-13.1-4's ruling says `getClassAttribute`'s `flatten()->first()` "becomes array code inside the method". So `getClassAttributes` throws `BlockedByComponentError('collections')`, which the runtime documents for framework code whose Component is missing. Epic 14 replaces the throw.

**Lessons applied.** From epic 12: check the plan against F-1..F-10 first. Here that covers no stand-ins (F-8), one marker per changed line (F-5), and unchanged assertions (F-1/F-2). From epic 11: a silent PHP difference gets a clause or an Escalation, which is why ESC-13.1-7..9 exist. From epic 4: the Story does not claim done beside its open Escalations.

## Verification

**Commands:**
- `bun run harness --story 13.1` -- expected: `differ=0`.
- `bun run harness` -- expected: no difference (NOT-RUN Variants aside).
- `bun run typecheck`, `bun run lint`, `bun run registration:check`, `bun run async-surface --all --check`, `bun run divergence:check`, `bun run expectations:check`, `bun run expectations:reasons`, `bun run escalations:check`, `bun run graph:check`, `bun run scaffold:check` -- expected: each passes.
- `bun test packages/reflection` -- expected: all pass.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. ESC-13.1-1 (parameter reflection objects and `self` / `parent` Specs, contract), ESC-13.1-2 (untyped and variadic closure parameters, and the no-`inject` rule, divergence), ESC-13.1-3 (closure return types, divergence), ESC-13.1-4 (class attribute decorators, contract), ESC-13.1-5 (`lazy` / `proxy` lazy objects, divergence) and ESC-13.1-6 (`isCallable` visibility and function-name strings, divergence) wait on the Maintainer. Every Test ID and XT-reflection-1, -2 and -4 depend on one of them, so no implementation was started.

## Auto Run Result (2026-10-25, resume after the rulings)

Status: blocked
Blocking condition: ESC-13.1-7 (token FQCN lookup, testParameterSubclassOfInterface), ESC-13.1-8 (enum model, `isParameterBackedEnumWithStringBackingType` and XT-reflection-4), ESC-13.1-9 (`assertInstanceOf` class-strings, testItReturnsTheFirstParameterType) and ESC-13.1-10 (same-Phase `blocked-by:collections`, testGetClassAttributes) wait on rulings. Each changes a Protected Path, the runtime, or an AD-level model, which the Story may not edit.

The rest is implemented and saved on branch `story/13.1-impl`, following the Story 11.1 precedent. It was not merged, because the review layers and the Fidelity Review are bound to the tree, and the tree changes once the four items land. On that branch:
- `bun run harness --story 13.1` gives `differ=0`: 16 `pass` (DIV-3.2, DIV-3.3, DIV-3.4, DIV-9.14, DIV-12.15), 5 `blocked-by` (mail ×2, bus, database ×2) and 3 `not-ported-yet` under ESC-13.1-7, -9 and -10.
- Full `bun run harness` gives `differ=0` (Variants without a backend NOT-RUN).
- `typecheck`, `lint`, `registration:check`, `async-surface --all --check`, `divergence:check`, `expectations:check`, `expectations:reasons`, `escalations:check`, `graph:check` and `scaffold:check` pass.
- XT-reflection-1 and XT-reflection-2 pass.

Not yet done: XT-reflection-3 and XT-reflection-4, the review layers, the Fidelity Review and `story:check`. Note for the resume: the spec's "14 pass lines" AC should read 16. `testClosureReturnTypesReturnsEmptyArrayWhenNoReturnType` changes no line, so its `adapted: DIV-3.4` should be `null`.
