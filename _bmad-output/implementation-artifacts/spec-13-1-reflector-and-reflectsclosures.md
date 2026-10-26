---
title: 'Story 13.1: Reflector and ReflectsClosures'
type: 'feature'
created: '2026-10-25'
status: 'done'
baseline_revision: '38ee033f972d75b86d4128ac6b490d0776211f0b'
review_loop_iteration: 1
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
      Settled: decisions/MAINT-2026-10-25-story-13-1-second.md says these lines need no AC of their own; the global rule
      and the Phase sweep Stories re-verify them (decisions/MAINT-2026-10-25-epic-12-items.md item 4).
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
- `packages/assert/src/Framework/Assert.ts` / `Constraints.ts` -- since #442 (ESC-13.1-9), `assertInstanceOf(type, …)` takes a class-string and resolves it through `Symbol.for('xaravel.class.lookup')`, which `@xaravel/runtime` installs. testItReturnsTheFirstParameterType ports with no adaptation of the assertion.
- `packages/contracts/src/Contract.ts:211` -- `contract(fqcn, members, parents)` builds the token for a PHP interface and, since #442, records it with `registerContractToken` (ESC-13.1-7), so `new ReflectionClass('<token FQCN>')` and `isSubclassOf` resolve it. A class implements a token through a `[Token.brand]` getter that returns `true` (`packages/contracts/tests/xaravel/brand-compile.test.ts:39`). Use it for `ReflectsClosuresInterfaceOne` / `Two`, and for `IA` / `IB` (`contract('Illuminate\\Tests\\Support\\IB', {}, [IA])`). `@xaravel/contracts` is already a dependency.
- `packages/runtime/src/php/classExistence.ts` -- `interfaceExists(name)` and `enumExists(name)` (exported from `@xaravel/runtime/php` and `@xaravel/runtime`), PHP's `interface_exists` / `enum_exists`. `packages/runtime/src/php/ReflectionEnum.ts` -- `new ReflectionEnum(name)`, `isBacked()`, `getBackingType()` (a builtin `ReflectionNamedType` named `string` / `int`, or null). An AD-26 enum is a registered class whose static side has a `cases` function; a backed one declares `static backingType = 'string' | 'int'` (ESC-13.1-8).
- `tools/expectations/reasons.ts` -- since the Maintainer's PR, `blocked-by:collections` is valid for reflection: collections' first Epic (14) is after reflection's (13) (ESC-13.1-10 option 2).
- `packages/reflection/src/Reflector.ts:248-256` -- `isParameterSubclassOf` today calls a local `classExists` only; Upstream's `(class_exists || interface_exists)` becomes `classExists(name) || interfaceExists(name)`. `getClassAttributes` (line 161) already throws `BlockedByComponentError('collections')`.
- `conformance/expectations/reflection/framework/tests/Support/{SupportReflectorTest,SupportReflectsClosuresTest}.jsonl` -- the 24 lines. Each carries `escalation: ESC-13.1-<n>` today.

## Tasks & Acceptance

**Execution (resume after the second rulings, `decisions/MAINT-2026-10-25-story-13-1-second.md`):** the items below up to the first-attempt list are the remaining work; the first-attempt list is already built on this branch (merged from `story/13.1-impl`).
- `packages/reflection/src/Reflector.ts` -- (a) `isParameterSubclassOf`: `classExists(paramClassName) || interfaceExists(paramClassName)`, line for line with Upstream; update its docblock and the file header's ESC-13.1-7 note. (b) Add `static isParameterBackedEnumWithStringBackingType(parameter: ReflectionParameter): boolean`, line for line: `getType()` not a `ReflectionNamedType` → false; `getName()` null → false; `enumExists(name)` → `new ReflectionEnum(name)`, `isBacked() && getBackingType()?.getName() === 'string'`; else false. Update the header's ESC-13.1-8 note. Import `interfaceExists`, `enumExists`, `ReflectionEnum` from `@xaravel/runtime/php`.
- `SupportReflectorTest.test.ts` -- declare `IA = contract('Illuminate\\Tests\\Support\\IA')`, `IB = contract('Illuminate\\Tests\\Support\\IB', {}, [IA])` and `TestClassWithInterfaceSubclassParameter` with `@inject({ x: IB }) f(x)` (registered in `setUp`); port testParameterSubclassOfInterface into `SupportReflectorTest` (pass, DIV-3.2 marker on the hint line). Port testGetClassAttributes' body unchanged into a case class whose `setUp` throws `BlockedByComponentError('collections')`. Remove the header notes on ESC-13.1-7 / -10.
- `SupportReflectsClosuresTest.test.ts` -- port testItReturnsTheFirstParameterType: `inject({ a: ExampleParameter }, (a) => {})` (DIV-3.3 marker), then `assertInstanceOf(type, new ExampleParameter())` unchanged. Remove the header note on ESC-13.1-9.
- `packages/reflection/tests/xaravel/reflection.test.ts` -- extend XT-reflection-1 with: `isParameterSubclassOf` on a token-typed parameter against its parent token (true), the same token (false) and an unrelated token (false); `isParameterBackedEnumWithStringBackingType` true for a string-backed AD-26 enum, false for an int-backed one, a pure enum, a non-enum class, a union and an untyped parameter. Add XT-reflection-3: read both reflection Expectations shards and assert each of the 24 manifest Test IDs has one line, none is `not-ported-yet` or carries an `escalation`, each `pass` line's `adapted` is null or a DIV-3 / DIV-9 / DIV-12 clause that exists in `decisions/`, and each `skip` is `blocked-by:<c>`. Add XT-reflection-4: `bun run api-surface:gate reflection` reports `0 unexplained (AD-15)`; `docs/reflection.md` documents every Reflector static and the trait's 4 methods, has a Divergences section whose DIV clauses and ESC ids exist (conditionable's XT-3 checks), and the README links it.
- `packages/reflection/docs/reflection.md`, `README.md` -- document `isParameterBackedEnumWithStringBackingType` and interface support; drop the open-items list for ESC-13.1-7..10 and cite their rulings instead.
- Expectations -- testParameterSubclassOfInterface and testItReturnsTheFirstParameterType `pass` with their clause; testGetClassAttributes `skip` / `blocked-by:collections`; `escalation: null` on all; testClosureReturnTypesReturnsEmptyArrayWhenNoReturnType `adapted: null` if its body changes no line.
- `stories/13.1.md` status and sprint status -- orchestrator bookkeeping only.

**First attempt (built):**
- `conformance/escalations/ESC-13.1-7.md`, `-8.md`, `-9.md`, `-10.md` -- written and now ruled. Do not edit them.
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
- Given `bun run harness --story 13.1`, when it runs, then no line differs. The 18 `pass` lines pass, the 6 `blocked-by` lines (mail ×2, bus, database ×2, collections) report `BlockedByComponentError(<c>)`, and no line is `not-ported-yet`.
- Given a parameter typed by contract token `IB` whose parent is `IA`, when `isParameterSubclassOf(p, IA)` runs, then it is true (testParameterSubclassOfInterface, XT-reflection-1).
- Given a parameter typed by a string-backed AD-26 enum, when `isParameterBackedEnumWithStringBackingType` runs, then it is true, and false for an int-backed, pure or non-enum type (XT-reflection-1).
- Given the Expectations shards, when XT-reflection-3 reads them, then every Test ID is `pass` under an existing DIV clause or `skip` with `blocked-by:<c>`.
- Given the package, when XT-reflection-4 runs, then `api-surface:gate reflection` reports 0 unexplained and the docs are written.
- Given `getParameterClassName` / `firstClosureParameterType` on a declared `inject({ event: OrderShipped })`, when it runs, then it gives `fqcn(OrderShipped)` (XT-reflection-1).
- Given a closure with no `inject`, when its parameter types are requested, then the `RuntimeException` names the `inject` form (XT-reflection-2).
- Given the diff, when `git diff --stat` is read, then only the Boundaries' paths change.

## Spec Change Log

- 2026-10-25 — Re-plan after the Maintainer's rulings on ESC-13.1-1..6 (`decisions/MAINT-2026-10-25-story-13-1.md`) and the runtime item (#435). It replaces the first attempt's "escalate everything" plan; the six gaps it listed are closed by DIV-3.2-3.4, DIV-9.14, DIV-12.14 and DIV-12.15. Planning against the landed runtime found three new gaps (ESC-13.1-7..9, Design Notes), which stop only their own items. KEEP: the line-for-line port and the edit scope. Never define reflection stand-ins in the package.
- 2026-10-25 — Resume after the second rulings (`decisions/MAINT-2026-10-25-story-13-1-second.md`: ESC-13.1-7..9 option 1, ESC-13.1-10 option 2) and #442 (token table, `ReflectionEnum` / `enumExists` / `interfaceExists`, class-string `assertInstanceOf`). The first attempt's implementation is merged from `story/13.1-impl`. Adds the four held items, XT-reflection-3 and XT-reflection-4; AC counts are now 18 `pass` and 6 `blocked-by`. The intent contract's "never port the escalated items before their ruling" is now met: all four are ruled. KEEP: the first attempt's code and its `differ=0` result.

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 27 findings — high 0, medium 3, low 10, false 12, maybe-false 2
- findings:
  - `[false]` `[reject]` (blind) `stories/13.1.md` status and sprint status not updated — orchestrator bookkeeping done at finalization, outside the reviewed tree (spec Execution list).
  - `[low]` `[reject]` (blind) settled item still under `deferred:` — fix edits this build's spec.
  - `[low]` `[reject]` (blind) Code Map's "today" sentence on `isParameterSubclassOf` is stale — fix edits this build's spec.
  - `[false]` `[reject]` (blind) `'Class::method'` string for an instance method is callable, unlike PHP 8 — DIV-9.14 says a non-array string is callable when it is a `'Class::method'` string "the rules above" (the array rules) resolve; the array rules check only existence and visibility, as Upstream's array branch does.
  - `[maybe-false]` `[reject]` (blind) `[closure, '__invoke']` is rejected — DIV-9.14 makes a function in first position a class; whether PHP's `method_exists('Closure', '__invoke')` path returns true would settle it; if true only `low`, and the fix would add a branch contradicting DIV-9.14's constructor rule.
  - `[false]` `[reject]` (blind) plain arrays for `Collection` cite no DIV — Upstream's `ReflectsClosures` returns `->all()` arrays, so the return values are Upstream's; no divergence exists (Fidelity reviewer 2, F-8 note, agrees).
  - `[low]` `[reject]` (blind) `Collection` type imported from `@xaravel/contracts/bus` — type-only import of the structural type; no runtime or user-facing harm, and `@xaravel/contracts/support` does not export it.
  - `[false]` `[reject]` (blind) header cites DIV-3.1 while markers cite DIV-3.2 — DIV-3.1 is the `inject` declaration rule the header describes, DIV-3.2 the reflection over it the markers adapt; Fidelity F-5 passed both reviewers.
  - `[low]` `[reject]` (blind) blocked testUnionTypeName's fixture `C` is not declared — `C` is typed `A|Model`, and declaring it needs Database's `Model`, which would be a stand-in (F-8); the database Story declares it when it unblocks the line.
  - `[low]` `[reject]` (blind) XT-reflection-3 does not pin each line's exact clause — the harness and Fidelity F-4/F-5 grade each line; the XT's consequence claims only the classes of reason, which its body checks; pinning adds a second copy of the table.
  - `[low]` `[patch]` (blind) class-typed parameter against an implemented token (and its FQCN) untested in `isParameterSubclassOf` — two assertions added to XT-reflection-1.
  - `[low]` `[reject]` (blind) enum edge cases (variadic, token, non-function `cases`) untested — the runtime's own tests cover `enumExists` / `ReflectionEnum` boundaries; the Reflector method is a line-for-line delegate.
  - `[false]` `[reject]` (blind) XT-reflection-4 runs the API-surface gate per Variant — Xaravel Tests run once under `harness --xaravel`, not per Variant; conditionable's and macroable's XT-3 use the same form.
  - `[low]` `[reject]` (blind) XT-reflection-3's manifest parser is format-fragile — a format change fails loudly ("expected 24"), not silently passing.
  - `[low]` `[reject]` (blind) README / docs samples are not self-contained — illustrative snippets, as in the sibling packages' docs.
  - `[medium]` `[patch]` (edge) `isCallable([Ctor, 'm'], true)` returns false for a registered constructor — Upstream returns true for a class-string under `syntaxOnly`; DIV-9.14 maps class-string to constructor. Guard widened with `typeof first === "function"`; XT case added.
  - `[medium]` `[patch]` (edge) same guard for an unregistered constructor under `syntaxOnly` — same root cause and fix.
  - `[false]` `[reject]` (intent) enum method graded only by an Xaravel Test — Upstream has no Test ID for it; ESC-13.1-8 held the method and XT-reflection-4, which this diff covers.
  - `[false]` `[reject]` (intent) testGetClassAttributes ported but never runs — `blocked-by:collections` is the ruling (ESC-13.1-10 option 2).
  - `[false]` `[reject]` (intent) `adapted: null` change on testClosureReturnTypesReturnsEmptyArrayWhenNoReturnType outside the four items — listed in the resume tasks; the line changes no code.
  - `[false]` `[reject]` (intent) `isCallable` parameter renamed `varValue` — required by `api-surface:gate reflection` (Upstream's `$var`, a reserved word); no behaviour change.
  - `[false]` `[reject]` (intent) review / Fidelity Review not in the diff — they are this step.
  - `[false]` `[reject]` (intent) no harness result in the diff — `bun run harness --story 13.1` ran: `checked=24 differ=0`.
  - `[false]` `[reject]` (intent) manifest status still `blocked` — bookkeeping at finalization.
  - `[medium]` `[patch]` (fidelity R1, F-7) XT-reflection-1's "variadics give null" overstates: `getParameterClassName` gives the element FQCN — consequence qualified.
  - `[low]` `[patch]` (fidelity R1, F-7) XT-reflection-4 claims each cited ESC has a ruling but checks only existence — body now reads each decision's `decision:` line.
  - `[maybe-false]` `[reject]` (fidelity R2, F-7, missing evidence) FR-26 has no consequence line in the prompt — a `missing-evidence`-only finding outside F-2, F-3 and F-8 counts as a pass (`decisions/MAINT-2026-10-24-evidence-gaps.md`): evidence gap noted, copied to INBOX.

### 2026-10-25 — Review pass (Fidelity Review re-run after patches)
- verdicts: 2 findings — high 0, medium 0, low 0, false 0, maybe-false 2
- findings:
  - `[maybe-false]` `[reject]` (fidelity R1, F-7, missing evidence) FR-26's consequence text is not in the prompt — missing-evidence only, outside F-2, F-3 and F-8: counts as a pass, evidence gap noted (`decisions/MAINT-2026-10-24-evidence-gaps.md`); `fidelity:review status` prints `current` for tree 146eeab8a22cb212d290fbd658c2be14ce16bec8.
  - `[maybe-false]` `[reject]` (fidelity R2, F-7, missing evidence) same gap, reviewer 2 — same disposition.

## Design Notes

**New Escalations** (raised during planning, each stopping only its items):

| ESC | Trigger | Gap | Stops |
| --- | --- | --- | --- |
| ESC-13.1-7 | contract | `isParameterSubclassOf` passes a class *name* to `class_exists` / `interface_exists` and `new ReflectionClass(...)`. A contract token's FQCN is not in the Registry, so an interface hint can never resolve. The runtime item deferred this to the Story. | testParameterSubclassOfInterface |
| ESC-13.1-8 | contract | `isParameterBackedEnumWithStringBackingType` needs `enum_exists` and `ReflectionEnum`. No AD defines a ported enum model (ESC-9.7-1), and the runtime ports no `ReflectionEnum`. | `isParameterBackedEnumWithStringBackingType`, XT-reflection-4 (close gate) |
| ESC-13.1-9 | contract | `assertInstanceOf($type, …)` takes the class-string that `firstClosureParameterType` returns. `@xaravel/assert` rejects every string ("no global class table"), though the Class Registry now exists. | testItReturnsTheFirstParameterType |
| ESC-13.1-10 | contract | Raised during implementation. `bun run expectations:reasons` accepts `blocked-by:<c>` only when `<c>` is in a later Phase (`tools/expectations/reasons.ts:17`). Collections and reflection are both Phase 1, so the ruling's `blocked-by:collections` for testGetClassAttributes cannot be recorded. | testGetClassAttributes |

All four are ruled (`decisions/MAINT-2026-10-25-story-13-1-second.md`) and their infrastructure is on `main`; the Story now builds them.

**Classification** (one clause per line):

| Test ID | Status | Reason / adapted |
| --- | --- | --- |
| testGetClassName, testEmptyClassName | skip | `blocked-by:mail` |
| testStringTypeName | skip | `blocked-by:bus` |
| testSelfClassName, testUnionTypeName | skip | `blocked-by:database` |
| testGetClassAttributes | skip | `blocked-by:collections` (valid since ESC-13.1-10's ruling) |
| testGetClassAttribute | pass | DIV-12.15 (`@attribute(X, ...args)` fixtures) |
| testParentClassName | pass | DIV-3.2 (`@inject({ x: parent })`) |
| testIsCallable | pass | DIV-9.14 (a class-string becomes the constructor; visibility is erased) |
| testParameterSubclassOfInterface | pass | DIV-3.2 (`@inject({ x: IB })`; `IA` / `IB` are contract tokens, ESC-13.1-7's ruling) |
| testReflectsClosures, testItThrowsWhenNoParameters, testItThrowsWhenNoFirstParameterType, testItWorksWithUnionTypes, testItWorksWithUnionTypesWithNoTypeHints, testItWorksWithUnionTypesWithNoArguments, testItThrowsWhenFirstParameterHasNoTypeHintEvenIfLaterParameterDoes | pass | DIV-3.3 (`inject({}, fn)`, `primitive`, `variadic`; unions through `oneOf`) |
| testClosureReturnTypes* (6) | pass | DIV-3.4 (`returns(...)`) |
| testItReturnsTheFirstParameterType | pass | DIV-3.3 (`inject({ a: ExampleParameter }, fn)`; the class-string `assertInstanceOf` is unchanged, ESC-13.1-9's ruling) |

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

## Fidelity Review

### Reviewer 1: reject at tree 4bc06d2f25d6ef55c50a8d0e0aea3636ddc6a5df

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `38ee033f972d75b86d4128ac6b490d0776211f0b`, on 2026-10-26T00:57:46.869Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 24 Ported Tests with the supplied Upstream bodies. Assertions preserve their subjects, expected values and order, including assertions retained in blocked tests. |
| F-2: No expected value is weakened | pass | Exact comparisons, exception classes and checked messages remain unchanged. Metadata and attribute adaptations follow the supplied DIV clauses. |
| F-3: No assertion is removed without a DIV clause | pass | Every Upstream assertion has a counterpart, including the six helper assertions and exception expectations. No assertion waiver is needed. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | The six blocked-by lines match the dependencies and explicit Maintainer rulings. They retain denominator-counting reasons, with no higher-precedence applicable reason shown. |
| F-5: Every `adapted` marker matches its clause | pass | Compared adapted markers and Expectations fields with DIV-3.2–3.4, DIV-9.14 and DIV-12.15. The declared metadata, callable and decorator adaptations match those clauses. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared all four Xaravel Test bodies with their consequence strings. XT-reflection-1 overstates its variadic behavior, and XT-reflection-4 checks file existence rather than the claimed ruling. |
| F-8: No stub, fake or partial implementation of another Component | pass | Implementation changes stay within reflection. Later Components remain blocked; the Collection boundary throws the explicitly approved blocker rather than implementing Collections behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared all changed framework declarations with AD-6 and DIV-1. They synchronously inspect metadata without executing supplied closures or performing IO, so no asyncRoot tag is required. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/reflection/tests/xaravel/reflection.test.ts`: Qualify XT-reflection-1's 'variadics give null' claim as applying to closureParameterTypes. Its body explicitly expects Reflector.getParameterClassName to return the variadic element's FQCN.
- **F-7** `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-4 claims every cited ESC has a ruling, but only checks whether its file exists. Inspect the decision's approval/ruling content, or narrow the consequence to file existence.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"4bc06d2f25d6ef55c50a8d0e0aea3636ddc6a5df","base":"38ee033f972d75b86d4128ac6b490d0776211f0b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T00:57:46.869Z","items":[{"id":"F-1","result":"pass","note":"Compared all 24 Ported Tests with the supplied Upstream bodies. Assertions preserve their subjects, expected values and order, including assertions retained in blocked tests.","findings":[]},{"id":"F-2","result":"pass","note":"Exact comparisons, exception classes and checked messages remain unchanged. Metadata and attribute adaptations follow the supplied DIV clauses.","findings":[]},{"id":"F-3","result":"pass","note":"Every Upstream assertion has a counterpart, including the six helper assertions and exception expectations. No assertion waiver is needed.","findings":[]},{"id":"F-4","result":"pass","note":"The six blocked-by lines match the dependencies and explicit Maintainer rulings. They retain denominator-counting reasons, with no higher-precedence applicable reason shown.","findings":[]},{"id":"F-5","result":"pass","note":"Compared adapted markers and Expectations fields with DIV-3.2–3.4, DIV-9.14 and DIV-12.15. The declared metadata, callable and decorator adaptations match those clauses.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"Compared all four Xaravel Test bodies with their consequence strings. XT-reflection-1 overstates its variadic behavior, and XT-reflection-4 checks file existence rather than the claimed ruling.","findings":[{"path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"Qualify XT-reflection-1's 'variadics give null' claim as applying to closureParameterTypes. Its body explicitly expects Reflector.getParameterClassName to return the variadic element's FQCN.","kind":"defect"},{"path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-4 claims every cited ESC has a ruling, but only checks whether its file exists. Inspect the decision's approval/ruling content, or narrow the consequence to file existence.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Implementation changes stay within reflection. Later Components remain blocked; the Collection boundary throws the explicitly approved blocker rather than implementing Collections behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared all changed framework declarations with AD-6 and DIV-1. They synchronously inspect metadata without executing supplied closures or performing IO, so no asyncRoot tag is required.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 4bc06d2f25d6ef55c50a8d0e0aea3636ddc6a5df

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `38ee033f972d75b86d4128ac6b490d0776211f0b`, on 2026-10-26T00:57:46.869Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 24 Ported Tests with the Upstream lines in their Inventory sources. In SupportReflectorTest, the six blocked tests keep Upstream's bodies, with each 'X::class' written as fqcn(X). testIsCallable has the same 9 assertions in the same order, with class-strings turned into constructors. testGetClassAttributes keeps all 11 (9 assertSame and 2 assertContainsOnlyInstancesOf) with the same expected values and order. testGetClassAttribute keeps its 9. In SupportReflectsClosuresTest, testReflectsClosures keeps its 6 assertParameterTypes calls with the same expected lists: '?X' with a default of null becomes X, 'string' becomes String, and the variadic becomes variadic(X). The exception tests keep expectException and expectExceptionObject with the same class and message. testItWorksWithUnionTypes keeps both assertEquals calls. Each return-type test keeps its assertSame calls with the same expected arrays. The fixture attribute values (quick/brown/fox/7 and lazy/dog/2/3) agree with the expected sums 7, 12 and 5. |
| F-2: No expected value is weakened | pass | Every expected value is Upstream's, except that 'X::class' is written fqcn(X), the mechanical AD-10 form. Every assertSame stays assertSame and both assertEquals stay assertEquals. No exception class or message is generalised: expectExceptionObject keeps Upstream's exact message. |
| F-3: No assertion is removed without a DIV clause | pass | Assertion counts per test match the Inventory: testGetClassAttribute 9, testGetClassAttributes 11, testIsCallable 9, each single-assertion test 1, testReflectsClosures 6, testItWorksWithUnionTypes 2, and testClosureReturnTypesKeepsOnlyClassTypesFromUnionReturnType and testClosureReturnTypesExcludesSelfAndStaticReturnTypes 2 each. No assertion is dropped. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | Six lines are set to skip. testGetClassName and testEmptyClassName reflect PendingMailFake and MailFake (blocked-by:mail). testStringTypeName reflects BusFake (blocked-by:bus). testSelfClassName reflects Model, and testUnionTypeName's fixture C is typed A\|Model (both blocked-by:database). testGetClassAttributes reads the Collection that getClassAttributes returns (blocked-by:collections, which ESC-13.1-10 allows). These reasons are the ones the two MAINT-2026-10-25 rulings name. No upstream-skip applies (the Oracle gives pass), and blocked-by is the highest denominator-keeping reason that fits, so the precedence is right. |
| F-5: Every `adapted` marker matches its clause | pass | Each marker was read against its clause. DIV-3.2 covers '@​inject({x: parent})', the contract-token hint IB and the fqcn-named class result. DIV-3.3 covers 'primitive', 'variadic', 'inject({}, fn)' and the oneOf union in the closures and in UnionTypesClosure. DIV-3.4 covers 'returns(...)' with String, oneOf, allOf, self and static. DIV-9.14 covers constructors in place of class-strings in isCallable arrays. DIV-12.15 covers '@​attribute(X, ...args)' in the fixtures and the attribute assertions. Each Expectations 'adapted' field names one of these existing clauses, and no adaptation goes beyond its clause. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The Story relies on no Oracle fixture whose output is an error: no base or changed fixture is listed as an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared each XT body with its consequence string. XT-reflection-1 checks every listed claim: getParameterClassName and firstClosureParameterType, builtins and unions giving null, getParameterClassNames, self and parent resolution including the orphan 'parent', variadics, return types, contract-token subclassing, the seven-parameter backed-enum case, the isCallable edges, getClassAttribute building every match first, and getClassAttributes throwing. XT-reflection-2 checks all three readers. XT-reflection-3 checks the 24 IDs, escalation null, the DIV clauses and blocked-by. XT-reflection-4 checks the gate, the docs, the DIV and ESC citations and the README link. The cited ESC rulings, AD-26 and AD-15 are in the prompt. FR-26, cited by XT-reflection-1, -2 and -3, is not: no consequence line has it. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are confined to packages/reflection and its Expectations shards. getClassAttributes throws BlockedByComponentError("collections") rather than faking a Collection, as ESC-13.1-10 rules. ReflectsClosures returns plain arrays and objects, matching Upstream's '->all()' output; it does not implement Collections. In the tests, AttributeCollection and CollectionReflector are type-only views. The blocked cases throw BlockedByComponentError in setUp instead of stubbing Mail, Bus, Database or Collections. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in Reflector.ts, ReflectsClosures.ts or index.ts. Every exported method is synchronous and returns no Promise or thenable, and none reaches an IO root or accepts a callback DIV-1 allows to be async. So no tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests/ file. |

Findings:

- **F-7** `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-1, -2 and -3 cite FR-26 ('FR-26 (Reflection)'), but conformance/xaravel-consequences/*.jsonl has no FR-26 line and the prompt does not carry its text. So it cannot be confirmed that FR-26 names what these tests verify. Supply the FR-26 consequence entry, or cite an existing FR/AD consequence id. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"4bc06d2f25d6ef55c50a8d0e0aea3636ddc6a5df","base":"38ee033f972d75b86d4128ac6b490d0776211f0b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T00:57:46.869Z","items":[{"id":"F-1","result":"pass","note":"Compared all 24 Ported Tests with the Upstream lines in their Inventory sources. In SupportReflectorTest, the six blocked tests keep Upstream's bodies, with each `X::class` written as fqcn(X). testIsCallable has the same 9 assertions in the same order, with class-strings turned into constructors. testGetClassAttributes keeps all 11 (9 assertSame and 2 assertContainsOnlyInstancesOf) with the same expected values and order. testGetClassAttribute keeps its 9. In SupportReflectsClosuresTest, testReflectsClosures keeps its 6 assertParameterTypes calls with the same expected lists: `?X` with a default of null becomes X, `string` becomes String, and the variadic becomes variadic(X). The exception tests keep expectException and expectExceptionObject with the same class and message. testItWorksWithUnionTypes keeps both assertEquals calls. Each return-type test keeps its assertSame calls with the same expected arrays. The fixture attribute values (quick/brown/fox/7 and lazy/dog/2/3) agree with the expected sums 7, 12 and 5.","findings":[]},{"id":"F-2","result":"pass","note":"Every expected value is Upstream's, except that `X::class` is written fqcn(X), the mechanical AD-10 form. Every assertSame stays assertSame and both assertEquals stay assertEquals. No exception class or message is generalised: expectExceptionObject keeps Upstream's exact message.","findings":[]},{"id":"F-3","result":"pass","note":"Assertion counts per test match the Inventory: testGetClassAttribute 9, testGetClassAttributes 11, testIsCallable 9, each single-assertion test 1, testReflectsClosures 6, testItWorksWithUnionTypes 2, and testClosureReturnTypesKeepsOnlyClassTypesFromUnionReturnType and testClosureReturnTypesExcludesSelfAndStaticReturnTypes 2 each. No assertion is dropped.","findings":[]},{"id":"F-4","result":"pass","note":"Six lines are set to skip. testGetClassName and testEmptyClassName reflect PendingMailFake and MailFake (blocked-by:mail). testStringTypeName reflects BusFake (blocked-by:bus). testSelfClassName reflects Model, and testUnionTypeName's fixture C is typed A|Model (both blocked-by:database). testGetClassAttributes reads the Collection that getClassAttributes returns (blocked-by:collections, which ESC-13.1-10 allows). These reasons are the ones the two MAINT-2026-10-25 rulings name. No upstream-skip applies (the Oracle gives pass), and blocked-by is the highest denominator-keeping reason that fits, so the precedence is right.","findings":[]},{"id":"F-5","result":"pass","note":"Each marker was read against its clause. DIV-3.2 covers `@inject({x: parent})`, the contract-token hint IB and the fqcn-named class result. DIV-3.3 covers `primitive`, `variadic`, `inject({}, fn)` and the oneOf union in the closures and in UnionTypesClosure. DIV-3.4 covers `returns(...)` with String, oneOf, allOf, self and static. DIV-9.14 covers constructors in place of class-strings in isCallable arrays. DIV-12.15 covers `@attribute(X, ...args)` in the fixtures and the attribute assertions. Each Expectations `adapted` field names one of these existing clauses, and no adaptation goes beyond its clause.","findings":[]},{"id":"F-6","result":"n/a","note":"The Story relies on no Oracle fixture whose output is an error: no base or changed fixture is listed as an error.","findings":[]},{"id":"F-7","result":"fail","note":"I compared each XT body with its consequence string. XT-reflection-1 checks every listed claim: getParameterClassName and firstClosureParameterType, builtins and unions giving null, getParameterClassNames, self and parent resolution including the orphan 'parent', variadics, return types, contract-token subclassing, the seven-parameter backed-enum case, the isCallable edges, getClassAttribute building every match first, and getClassAttributes throwing. XT-reflection-2 checks all three readers. XT-reflection-3 checks the 24 IDs, escalation null, the DIV clauses and blocked-by. XT-reflection-4 checks the gate, the docs, the DIV and ESC citations and the README link. The cited ESC rulings, AD-26 and AD-15 are in the prompt. FR-26, cited by XT-reflection-1, -2 and -3, is not: no consequence line has it.","findings":[{"path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-1, -2 and -3 cite FR-26 ('FR-26 (Reflection)'), but conformance/xaravel-consequences/*.jsonl has no FR-26 line and the prompt does not carry its text. So it cannot be confirmed that FR-26 names what these tests verify. Supply the FR-26 consequence entry, or cite an existing FR/AD consequence id.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Code changes are confined to packages/reflection and its Expectations shards. getClassAttributes throws BlockedByComponentError(\"collections\") rather than faking a Collection, as ESC-13.1-10 rules. ReflectsClosures returns plain arrays and objects, matching Upstream's `->all()` output; it does not implement Collections. In the tests, AttributeCollection and CollectionReflector are type-only views. The blocked cases throw BlockedByComponentError in setUp instead of stubbing Mail, Bus, Database or Collections.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in Reflector.ts, ReflectsClosures.ts or index.ts. Every exported method is synchronous and returns no Promise or thenable, and none reaches an IO root or accepts a callback DIV-1 allows to be async. So no tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests/ file.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree 146eeab8a22cb212d290fbd658c2be14ce16bec8

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `38ee033f972d75b86d4128ac6b490d0776211f0b`, on 2026-10-26T01:08:53.724Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared all 24 Ported Test bodies with the supplied Upstream tests; assertion subjects, expected values and order are preserved under the recorded adaptations. |
| F-2: No expected value is weakened | pass | Compared expected values, comparison kinds and exception expectations with Upstream; none is weakened. |
| F-3: No assertion is removed without a DIV clause | pass | Compared assertion counts, including the six assertParameterTypes helper calls and exception expectations; every Upstream assertion has a counterpart. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | Compared the six blocked-by lines with their dependencies and Maintainer rulings; mail, bus, database and collections are explicitly approved blockers and retain denominator precedence. |
| F-5: Every `adapted` marker matches its clause | pass | Compared adapted markers and Expectations fields with DIV-3.2–3.4, DIV-9.14 and DIV-12.15; they preserve assertions while adapting metadata, callable classes and attributes as permitted. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no relied-on Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared all four Xaravel Test consequences with their bodies. P-1 and P-2 are fixed, but the FR-26 citation remains unverifiable as identified by P-3. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the change with reflection's scope and the Maintainer rulings; it implements reflection and uses existing runtime contracts, while unavailable Collections behavior throws the approved blocker rather than supplying a partial Collection. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared every changed source declaration with AD-6 and DIV-1; reflection reads metadata synchronously, invokes no supplied closures and needs no async-root tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change modifies no Oracle request file. |

Findings:

- **F-7** `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-1, XT-reflection-2 and XT-reflection-3 still cite FR-26, whose consequence text is explicitly unavailable in the prompt. Supply the FR-26 consequence entry or replace the citations with existing applicable FR/AD consequence IDs and provide their text. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/reflection/tests/xaravel/reflection.test.ts`: Qualify XT-reflection-1's 'variadics give null' claim as applying to closureParameterTypes. Its body explicitly expects Reflector.getParameterClassName to return the variadic element's FQCN. **fixed**: XT-reflection-1 now limits the variadic-null claim to closureParameterTypes and explicitly states Reflector.getParameterClassName returns the element class's FQCN.
- **P-2** (reviewer 1, F-7) `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-4 claims every cited ESC has a ruling, but only checks whether its file exists. Inspect the decision's approval/ruling content, or narrow the consequence to file existence. **fixed**: XT-reflection-4 now reads each cited ESC decision's front matter and checks for decision: approved or rejected, matching its clarified consequence.
- **P-3** (reviewer 2, F-7) `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-1, -2 and -3 cite FR-26 ('FR-26 (Reflection)'), but conformance/xaravel-consequences/*.jsonl has no FR-26 line and the prompt does not carry its text. So it cannot be confirmed that FR-26 names what these tests verify. Supply the FR-26 consequence entry, or cite an existing FR/AD consequence id. **not fixed**: XT-reflection-1, -2 and -3 still cite FR-26; the evidence still reports that its consequence entry and text are unavailable.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"146eeab8a22cb212d290fbd658c2be14ce16bec8","base":"38ee033f972d75b86d4128ac6b490d0776211f0b","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T01:08:53.724Z","items":[{"id":"F-1","result":"pass","note":"Compared all 24 Ported Test bodies with the supplied Upstream tests; assertion subjects, expected values and order are preserved under the recorded adaptations.","findings":[]},{"id":"F-2","result":"pass","note":"Compared expected values, comparison kinds and exception expectations with Upstream; none is weakened.","findings":[]},{"id":"F-3","result":"pass","note":"Compared assertion counts, including the six assertParameterTypes helper calls and exception expectations; every Upstream assertion has a counterpart.","findings":[]},{"id":"F-4","result":"pass","note":"Compared the six blocked-by lines with their dependencies and Maintainer rulings; mail, bus, database and collections are explicitly approved blockers and retain denominator precedence.","findings":[]},{"id":"F-5","result":"pass","note":"Compared adapted markers and Expectations fields with DIV-3.2–3.4, DIV-9.14 and DIV-12.15; they preserve assertions while adapting metadata, callable classes and attributes as permitted.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no relied-on Oracle error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"Compared all four Xaravel Test consequences with their bodies. P-1 and P-2 are fixed, but the FR-26 citation remains unverifiable as identified by P-3.","findings":[{"path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-1, XT-reflection-2 and XT-reflection-3 still cite FR-26, whose consequence text is explicitly unavailable in the prompt. Supply the FR-26 consequence entry or replace the citations with existing applicable FR/AD consequence IDs and provide their text.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Compared the change with reflection's scope and the Maintainer rulings; it implements reflection and uses existing runtime contracts, while unavailable Collections behavior throws the approved blocker rather than supplying a partial Collection.","findings":[]},{"id":"F-9","result":"pass","note":"Compared every changed source declaration with AD-6 and DIV-1; reflection reads metadata synchronously, invokes no supplied closures and needs no async-root tags.","findings":[]},{"id":"F-10","result":"n/a","note":"The change modifies no Oracle request file.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"Qualify XT-reflection-1's 'variadics give null' claim as applying to closureParameterTypes. Its body explicitly expects Reflector.getParameterClassName to return the variadic element's FQCN.","fixed":true,"note":"XT-reflection-1 now limits the variadic-null claim to closureParameterTypes and explicitly states Reflector.getParameterClassName returns the element class's FQCN."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-4 claims every cited ESC has a ruling, but only checks whether its file exists. Inspect the decision's approval/ruling content, or narrow the consequence to file existence.","fixed":true,"note":"XT-reflection-4 now reads each cited ESC decision's front matter and checks for decision: approved or rejected, matching its clarified consequence."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-1, -2 and -3 cite FR-26 ('FR-26 (Reflection)'), but conformance/xaravel-consequences/*.jsonl has no FR-26 line and the prompt does not carry its text. So it cannot be confirmed that FR-26 names what these tests verify. Supply the FR-26 consequence entry, or cite an existing FR/AD consequence id.","fixed":false,"note":"XT-reflection-1, -2 and -3 still cite FR-26; the evidence still reports that its consequence entry and text are unavailable."}]}
```

### Reviewer 2: reject at tree 146eeab8a22cb212d290fbd658c2be14ce16bec8

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `38ee033f972d75b86d4128ac6b490d0776211f0b`, on 2026-10-26T01:08:53.724Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | pass | Compared each of the 24 Ported Tests with the Upstream lines in its Inventory 'source'. Every assertion has a counterpart, in the same order, with the same subject and expected value. 'X::class' becomes 'fqcn(X)' or the class itself, as the header and AD-10 say. Hints are declared through inject/returns markers under DIV-3.2/3.3/3.4. The blocked tests (mail, bus, database, collections) keep Upstream's bodies. testReflectsClosures keeps all 6 assertParameterTypes calls. testIsCallable keeps all 9 assertions. |
| F-2: No expected value is weakened | pass | Every expected value matches Upstream's. assertSame stays assertSame and assertEquals stays assertEquals. expectExceptionObject keeps the exact message. expectException(RuntimeException) is unchanged. No comparison is loosened. |
| F-3: No assertion is removed without a DIV clause | pass | For every test, the assertion count by kind matches the Inventory's 'assertions' map. No assertion is dropped, so no fewer_assertions clause is needed. |
| F-4: Every new Skip Reason is justified and its precedence is right | pass | Each skip reason matches the Maintainer's rulings and applies to its test. testGetClassName and testEmptyClassName are blocked-by:mail. testStringTypeName is blocked-by:bus. testSelfClassName and testUnionTypeName are blocked-by:database (fixture C needs Model). testGetClassAttributes is blocked-by:collections (ESC-13.1-10, which allows a same-Phase blocker built in a later Epic). blocked-by keeps each test in the SM-1 denominator, which is the right precedence. |
| F-5: Every `adapted` marker matches its clause | pass | Read each cited clause in decisions/. DIV-3.2 covers the parent/self markers and inject-based hints for the IB token. DIV-3.3 covers primitive, variadic and inject({}, fn) on closures. DIV-3.4 covers returns(...) with oneOf, allOf, self and static. DIV-9.14 covers class constructors in isCallable arrays. DIV-12.15 covers @​attribute fixtures and the attribute tests. Each Expectations 'adapted' field names a clause that exists and matches the test's adaptations. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The Story relies on no Oracle error fixture. Evidence (c) lists none. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | P-1 and P-2 are fixed. XT-reflection-1's consequence now limits 'gives null' to closureParameterTypes, and it notes that getParameterClassName gives the element's FQCN. XT-reflection-4 now checks each cited ESC record's front matter for 'decision: approved\|rejected'. P-3 is not fixed: XT-reflection-1, -2 and -3 still cite 'FR-26 (Reflection)', and evidence (e) still reports it as an unknown consequence id with no line in conformance/xaravel-consequences/*.jsonl. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes are only in packages/reflection. getClassAttributes throws BlockedByComponentError('collections') instead of faking a Collection. CollectionReflector in the test is a type-only view on a test that is blocked. ReflectsClosures returns the plain arrays Upstream's all() would give. No stub of another Component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tags in Reflector.ts, ReflectsClosures.ts or index.ts. Every method is sync, reaches no IO root and accepts no async callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-1, XT-reflection-2 and XT-reflection-3 cite FR-26, but no consequence entry exists for it in conformance/xaravel-consequences/*.jsonl and its text is not available. So it cannot be confirmed that the cited requirement is what these tests verify. Add the FR-26 consequence entry, or cite an existing FR/AD consequence id that names what each test checks. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/reflection/tests/xaravel/reflection.test.ts`: Qualify XT-reflection-1's 'variadics give null' claim as applying to closureParameterTypes. Its body explicitly expects Reflector.getParameterClassName to return the variadic element's FQCN. **fixed**: XT-reflection-1's consequence now says a variadic parameter gives null in closureParameterTypes, while getParameterClassName gives its element class's FQCN as PHP does. That matches the body's assertions.
- **P-2** (reviewer 1, F-7) `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-4 claims every cited ESC has a ruling, but only checks whether its file exists. Inspect the decision's approval/ruling content, or narrow the consequence to file existence. **fixed**: XT-reflection-4 now reads each cited ESC decision record and asserts that its front matter has 'decision: approved|rejected'. Its consequence string says the same.
- **P-3** (reviewer 2, F-7) `packages/reflection/tests/xaravel/reflection.test.ts`: XT-reflection-1, -2 and -3 cite FR-26 ('FR-26 (Reflection)'), but conformance/xaravel-consequences/*.jsonl has no FR-26 line and the prompt does not carry its text. So it cannot be confirmed that FR-26 names what these tests verify. Supply the FR-26 consequence entry, or cite an existing FR/AD consequence id. **not fixed**: FR-26 is still cited by XT-reflection-1, -2 and -3. Evidence (e) still reports it as an unknown consequence id with no line in conformance/xaravel-consequences/*.jsonl, and no FR-26 text is supplied.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"146eeab8a22cb212d290fbd658c2be14ce16bec8","base":"38ee033f972d75b86d4128ac6b490d0776211f0b","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T01:08:53.724Z","items":[{"id":"F-1","result":"pass","note":"Compared each of the 24 Ported Tests with the Upstream lines in its Inventory `source`. Every assertion has a counterpart, in the same order, with the same subject and expected value. `X::class` becomes `fqcn(X)` or the class itself, as the header and AD-10 say. Hints are declared through inject/returns markers under DIV-3.2/3.3/3.4. The blocked tests (mail, bus, database, collections) keep Upstream's bodies. testReflectsClosures keeps all 6 assertParameterTypes calls. testIsCallable keeps all 9 assertions.","findings":[]},{"id":"F-2","result":"pass","note":"Every expected value matches Upstream's. assertSame stays assertSame and assertEquals stays assertEquals. expectExceptionObject keeps the exact message. expectException(RuntimeException) is unchanged. No comparison is loosened.","findings":[]},{"id":"F-3","result":"pass","note":"For every test, the assertion count by kind matches the Inventory's `assertions` map. No assertion is dropped, so no fewer_assertions clause is needed.","findings":[]},{"id":"F-4","result":"pass","note":"Each skip reason matches the Maintainer's rulings and applies to its test. testGetClassName and testEmptyClassName are blocked-by:mail. testStringTypeName is blocked-by:bus. testSelfClassName and testUnionTypeName are blocked-by:database (fixture C needs Model). testGetClassAttributes is blocked-by:collections (ESC-13.1-10, which allows a same-Phase blocker built in a later Epic). blocked-by keeps each test in the SM-1 denominator, which is the right precedence.","findings":[]},{"id":"F-5","result":"pass","note":"Read each cited clause in decisions/. DIV-3.2 covers the parent/self markers and inject-based hints for the IB token. DIV-3.3 covers primitive, variadic and inject({}, fn) on closures. DIV-3.4 covers returns(...) with oneOf, allOf, self and static. DIV-9.14 covers class constructors in isCallable arrays. DIV-12.15 covers @attribute fixtures and the attribute tests. Each Expectations `adapted` field names a clause that exists and matches the test's adaptations.","findings":[]},{"id":"F-6","result":"n/a","note":"The Story relies on no Oracle error fixture. Evidence (c) lists none.","findings":[]},{"id":"F-7","result":"fail","note":"P-1 and P-2 are fixed. XT-reflection-1's consequence now limits 'gives null' to closureParameterTypes, and it notes that getParameterClassName gives the element's FQCN. XT-reflection-4 now checks each cited ESC record's front matter for `decision: approved|rejected`. P-3 is not fixed: XT-reflection-1, -2 and -3 still cite 'FR-26 (Reflection)', and evidence (e) still reports it as an unknown consequence id with no line in conformance/xaravel-consequences/*.jsonl.","findings":[{"path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-1, XT-reflection-2 and XT-reflection-3 cite FR-26, but no consequence entry exists for it in conformance/xaravel-consequences/*.jsonl and its text is not available. So it cannot be confirmed that the cited requirement is what these tests verify. Add the FR-26 consequence entry, or cite an existing FR/AD consequence id that names what each test checks.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Code changes are only in packages/reflection. getClassAttributes throws BlockedByComponentError('collections') instead of faking a Collection. CollectionReflector in the test is a type-only view on a test that is blocked. ReflectsClosures returns the plain arrays Upstream's all() would give. No stub of another Component's behaviour.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tags in Reflector.ts, ReflectsClosures.ts or index.ts. Every method is sync, reaches no IO root and accepts no async callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"Qualify XT-reflection-1's 'variadics give null' claim as applying to closureParameterTypes. Its body explicitly expects Reflector.getParameterClassName to return the variadic element's FQCN.","fixed":true,"note":"XT-reflection-1's consequence now says a variadic parameter gives null in closureParameterTypes, while getParameterClassName gives its element class's FQCN as PHP does. That matches the body's assertions."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-4 claims every cited ESC has a ruling, but only checks whether its file exists. Inspect the decision's approval/ruling content, or narrow the consequence to file existence.","fixed":true,"note":"XT-reflection-4 now reads each cited ESC decision record and asserts that its front matter has `decision: approved|rejected`. Its consequence string says the same."},{"id":"P-3","reviewer":2,"item":"F-7","path":"packages/reflection/tests/xaravel/reflection.test.ts","detail":"XT-reflection-1, -2 and -3 cite FR-26 ('FR-26 (Reflection)'), but conformance/xaravel-consequences/*.jsonl has no FR-26 line and the prompt does not carry its text. So it cannot be confirmed that FR-26 names what these tests verify. Supply the FR-26 consequence entry, or cite an existing FR/AD consequence id.","fixed":false,"note":"FR-26 is still cited by XT-reflection-1, -2 and -3. Evidence (e) still reports it as an unknown consequence id with no line in conformance/xaravel-consequences/*.jsonl, and no FR-26 text is supplied."}]}
```

## Auto Run Result (2026-10-25, resume after the second rulings)

Status: done

**Summary.** `@xaravel/reflection` ports `Reflector` and `ReflectsClosures` over `@xaravel/runtime`'s reflection. This pass added the four items ESC-13.1-7..10 held: `isParameterSubclassOf` resolves interface names through the token table (`interfaceExists`), `isParameterBackedEnumWithStringBackingType` over `enumExists` / `ReflectionEnum`, testItReturnsTheFirstParameterType with the class-string `assertInstanceOf`, and testGetClassAttributes as `blocked-by:collections`. XT-reflection-3 and XT-reflection-4 are new.

**Files.**
- `packages/reflection/src/Reflector.ts` -- the 8 statics, line for line (DIV-9.14 for `isCallable`); `isCallable`'s parameter is `varValue` for the API-surface gate.
- `packages/reflection/src/Traits/ReflectsClosures.ts`, `src/index.ts` -- the trait and the barrel.
- `packages/reflection/tests/ported/framework/tests/Support/*` -- 24 Ported Tests and their fixtures.
- `packages/reflection/tests/xaravel/reflection.test.ts` -- XT-reflection-1..4.
- `packages/reflection/docs/reflection.md`, `README.md` -- API docs and Divergences.
- `conformance/expectations/reflection/**` -- 18 `pass`, 6 `blocked-by`.

**Review.** 29 findings over two passes. Patched: 5 (medium 3: the `syntaxOnly` constructor guard ×2 and XT-reflection-1's variadic claim; low 2: XT-reflection-4's ruling check, the brand-implemented token case). Deferred: none new. Rejected: 24, each with its reason in the Review Triage Log; three are Fidelity F-7 evidence gaps (FR-26 has no consequence line), noted and non-blocking.

**Follow-up review recommended:** false. No `high` was patched; the two `medium` patches are covered by new XT cases that ran and passed.

**Verification.** Full `bun run harness`: `checked=21817 differ=0` (7 Variants NOT-RUN without a local backend), XARAVEL 390 passed, 0 failed. `bun run harness --story 13.1`: `checked=24 differ=0`. `typecheck`, `lint`, `registration:check`, `async-surface --all --check`, `divergence:check`, `expectations:check`, `expectations:reasons`, `escalations:check`, `graph:check`, `scaffold:check` and `api-surface:gate reflection` (0 unexplained) pass. `fidelity:review status`: `current`.

**Residual risks.** testGetClassAttributes reads a `Collection` shape (`.map.string`, `.sum.number`) through a type-only view that Epic 14 must confirm when it unblocks the line. XT-reflection-3 parses the manifest's `test_ids` with a line pattern.

