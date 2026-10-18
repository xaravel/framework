---
title: 'Story 4.5: Mockery core'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '1c5b5f5ab60a1e1d024ee4fc95b8b83f29e151b3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The grader does not yet read `Symbol.for('xaravel.contract.methods')` on contract tokens (ESC-4.5-1 item 3), so a mock of a token reports every method as "does not exist on this mock object".
    evidence: |-
      `Mock._mockery_declaresMethod` reads only the prototype chain, and a symbol target gets `class {}`; `Container.mock` rejects object targets. The ruling binds Epic 10 tokens to carry the protocol, but no token shape exists yet (a `Symbol.for` token cannot carry a property), so the reader cannot be written against a real shape until Epic 10 defines it. Owner: the Epic 10 Story that defines contract tokens, under ESC-4.5-1 item 3.
    location: >-
      packages/mockery/src/Mockery/Mock.ts (_mockery_declaresMethod), packages/mockery/src/Mockery/Container.ts (mock)
    severity: medium
  - summary: >-
      The run protocol ignores swallowed BadMethodCallExceptions; PHPUnit's Mockery integration marks such a test risky (`checkMockeryExceptions`).
    evidence: |-
      `mockery_thrownExceptions()` and `dismiss()`/`dismissed()` are ported, but `run()` in `src/Mockery.ts` never reads them. The harness has no risky outcome yet; Story 5.3 (harness runner and report) owns test outcomes and is where a risky mark would land.
    location: >-
      packages/mockery/src/Mockery.ts (run)
    severity: low
---

<intent-contract>

## Intent

**Problem:** `packages/mockery/src/index.ts` is `export {};`. Ported Tests cannot translate the 226 Upstream files that use Mockery, and Story 4.4's `createMock` (ESC-4.4-1) has nothing to delegate to (FR-100, Story 4.5 AC 1–3).

**Approach:** Port Mockery 1.6.15's core (the locked version in the Upstream install) to `@xaravel/mockery`. That covers `Mockery.mock`/`Mockery.close`, the container, the mock object, `Expectation`, `CompositeExpectation`, `ExpectationDirector`, the three count validators and the exceptions, with Mockery's names, dispatch rules and exact messages. The Oracle (real Mockery, through `php-expr` requests in `conformance/oracle-requests/4.5.jsonl`) supplies every expected outcome and message; the test never hand-writes them. A test-finish protocol makes `portedTest`/`xaravelTest` verify and count a test's expectations.

**The core API (AC 1):** `shouldReceive` (one or more names), `once`, `twice`, `times`, `never`, `atLeast`, `atMost`, `with`, `withArgs` (array or closure), `withAnyArgs`, `andReturn`, `andReturnValues`, `andThrow`, `ordered` (with groups). `close` and `mock` are needed to use them. Every other scanned name (`spy`, `makePartial`, `byDefault`, `andReturnUsing`, `allows`, `expects`, `globally`, matchers, …) is Story 4.6's (its AC 1 and AC 3).

## Boundaries & Constraints

**Always:**
- Follow Mockery 1.6.15 exactly where JS can express it: the dispatch order, counting, verify order and message text listed in Design Notes. Keep its class and method names (`Mockery`, `Container`, `Expectation`, `mockery_getName`, `mockery_verify`, `mockery_getExpectationCount`, …), AD-3 paths under `src/` that mirror `library/` (`src/Mockery.ts`, `src/Mockery/Expectation.ts`, `src/Mockery/CountValidator/Exact.ts`, `src/Mockery/Exception/InvalidCountException.ts`, …), one public class per file and named exports only.
- Import only `@xaravel/assert` (its public `index.ts`: `recordAssertion`, `phpLooseEquals`) and `node:` built-ins. No graded package (AD-2, AD-15).
- Return `null`, never `undefined`, from a mock call with no return value (AD-9).
- Install `globalThis[Symbol.for('xaravel.mockery.mock')]` (ESC-4.4-1) and `globalThis[Symbol.for('xaravel.mockery.run')]` on load, non-writable and non-configurable. If one is already defined, leave it.
- Freeze every export and its prototype on load, as `@xaravel/assert` does. Mutable state lives in module-private variables and an `AsyncLocalStorage`, never in class statics.

**Never:**
- Build any Story 4.6 API (spies, partials, `byDefault`, `shouldIgnoreMissing`, argument matchers, `shouldHaveReceived`, the coverage report), static-method mocking, demeter chains (`'a->b'`), or `Container::mock` argument forms other than a class, a class name string or nothing (raised in ESC-4.5-1).
- Import Mockery internals from `@xaravel/assert` or anything outside its public `index.ts`. Fake a graded Component. Hand-write an Oracle expected value. Weaken or skip a compared cell.
- Touch Story 4.4's spec or `createMock` (4.4 reads the global itself).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Met expectation | `m.shouldReceive('bar').once().with(1).andReturn(2)`; `m.bar(1)` | returns `2`; close passes and records 1 `mockeryExpectation` | none |
| Loose arg match | `with(1)`; `m.bar('1')` | matches (PHP `==`) | none |
| Object arg | `with(objA)`; `m.bar(equalButDistinctObj)` | no match | `NoMatchingExpectationException` |
| Return sequence | `andReturn(1, 2)`; three calls | `1`, `2`, `2` | none |
| Exhausted fallthrough | two `with(1)->once()` expectations; three calls | calls 1, 2 hit each; call 3 hits the first | close throws `InvalidCountException` |
| Unmet count | `once()`; no call; test ends | test fails with `Method bar(<Any Arguments>) from Mockery_<n>_XtFoo should be called\n exactly 1 times but called 0 times.` | the count is still recorded first |
| Out of order | `ordered()` `a` then `b`; call `b`, `a` | call `a` throws `InvalidOrderException` | at call time |
| No expectation | declared method `baz` with no `shouldReceive` | `BadMethodCallException`: `Received Mockery_<n>_XtFoo::baz(), but no expectations were specified` | Mockery's subclass of PHP's `BadMethodCallException` |
| Undeclared method | `m.nope()` | `BadMethodCallException`: `Method Mockery_<n>_XtFoo::nope() does not exist on this mock object` | same |
| Args match none | `with(1)`; `m.bar(2)` | `NoMatchingExpectationException` with Mockery's message, `Objects: (…)` part included | as Mockery does |
| Bad `times` | `times('x')` | `InvalidArgumentException('The passed Times limit should be an integer value')` | thrown at setup |

</intent-contract>

## Code Map

- Mockery 1.6.15 reference (read-only): `/tmp/xaravel-inv/framework/vendor/mockery/mockery/library/` (`Mockery.php`: `close` 159-178, `formatArgs` 237-249, `formatObjects` 256-283, `formatArgument` 866-910, `objectToArray` 991-1013; `Mockery/Expectation.php`: `matchArgs` 573-604, `_matchArg` 949-980, `times` 685-715, `verifyCall` 768-785, `_getReturnValue` 917-940, `andThrow` 368-377, `ordered`/`_defineOrdered` 632-643/893-909; `ExpectationDirector.php`: `call` 85-107, `findExpectation`/`_findExpectationIn` 114-127/221-242, `getExpectationCount` 144-161, `verify` 200-213; `Container.php`: `mock` 220-271, `mockery_teardown`/`mockery_verify`/`mockery_close` 362-371/429-434/288-295, global order 401-422; `Mock.php`: `shouldReceive` 218-261, `mockery_getExpectationCount` 607-615, per-mock order 581-599, `_mockery_handleMethodCall` 1007-1114, `__toString` 1084-1089; `Generator/MockNameBuilder.php` 21-50; `CountValidator/*`; `Exception/*`).
- `packages/assert/src/declarations/portedTest.ts:84-110` -- `inner` and `run`. Wrap `inner` in the mockery-run protocol inside the scope frame (Design Notes "Test finish"). Update the header comment's step list.
- `packages/assert/src/declarations/xaravelTest.ts` -- the same wrap around its body.
- `packages/assert/src/index.ts` -- public `recordAssertion`, `phpLooseEquals` (the only imports Mockery may use).
- `packages/assert/src/exporter/VarExport.ts`, `src/Framework/Exception/InvalidArgumentException.ts` -- patterns only (internal; do not import). Grader-internal exception classes extend `Error` and set `name` to the PHP short class name.
- `packages/assert/tests/xaravel/oracle-values.ts` -- `readRequests`, `readSignedFixture`, `decode`. Import it from the mockery test by relative path (`../../../assert/tests/xaravel/oracle-values`); do not fork it.
- `packages/assert/tests/xaravel/declarations.test.ts` + `fixtures/` -- 4.2's child-`bun test` fixture runner pattern for XT-mockery-2.
- `packages/assert/tests/xaravel/comparison.test.ts:207-260` -- XT-assert-3's export list and import scan; must stay green.
- `tools/oracle/request.ts:157,172` -- `makeRequest`, `renderRequests`: generate `4.5.jsonl` from a throwaway script outside the repo. `tools/oracle/evaluate.php`: an `XT-…` id runs bound to a bare PHPUnit `TestCase`; local cross-check `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 conformance/oracle-requests/4.5.jsonl` (unsigned, never committed).
- `tools/scaffold/scaffold.ts` -- after adding `"@xaravel/assert": "workspace:*"` to `packages/mockery/package.json` `dependencies`, run `bun run scaffold` to regenerate `packages/mockery/tsconfig.json` references; `bun run scaffold:check` and `bun run graph:check` must pass (grader→grader is allowed).
- `stories/4.5.md` -- XT-mockery-1..3, component `mockery`. `conformance/escalations/ESC-4.4-1.md`, `ESC-4.3-1.md` -- format for ESC-4.5-1; `bun run escalations:check`.

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/Mockery/Exception/*.ts`, `src/Mockery/Exception.ts`, `src/Mockery/CountValidator/Exception.ts` -- Mockery's exceptions with their hierarchy and getters (`getMock`, `getMockName`, `getMethodName`, `getExpectedCount`, `getActualCount`, `getExpectedCountComparative`, `getActualArguments`, `getExpectedOrder`, `getActualOrder`, `dismiss`/`dismissed`) plus `getMessage()`, `getCode()`, `getPrevious()`. The PHP SPL parents (`UnexpectedValueException`, `OutOfBoundsException`, `BadMethodCallException`, `InvalidArgumentException`) are grader-internal, unexported classes in `src/php/` (ESC-4.5-1 item 2). Each class sets `name` and a static `[Symbol.for('xaravel.class.fqcn')]` with its PHP FQCN.
- `packages/mockery/src/Mockery/CountValidator/{CountValidatorAbstract,Exact,AtLeast,AtMost}.ts` -- `isEligible` and `validate` with the verbatim messages.
- `packages/mockery/src/Mockery/Expectation.ts`, `CompositeExpectation.ts`, `ExpectationDirector.ts` -- the AC 1 API, `matchArgs`/`_matchArg`, `verifyCall`, return queue, `andThrow`, `ordered`, `verify`, `isEligible`, `isCallCountConstrained`, `toString()` = `Mockery.formatArgs(name, expectedArgs)`. Internal matchers `AnyArgs`, `NoArgs`, `MultiArgumentClosure` live in `src/Mockery/Matcher/` (unexported; 4.6 exports matchers).
- `packages/mockery/src/Mockery/Container.ts` -- `mock(...args)`, `mockery_verify`, `mockery_teardown`, `mockery_close`, `mockery_getExpectationCount`, global ordering.
- `packages/mockery/src/Mockery/Mock.ts` -- builds a mock (Design Notes "Mock object"), `shouldReceive`, `mockery_getName`, `mockery_verify`, `mockery_getExpectationCount`, per-mock ordering, `_mockery_handleMethodCall`, `toString()`.
- `packages/mockery/src/Mockery.ts` -- static `mock`, `close`, `getContainer`, `formatArgs`, `formatObjects`; the two globals; the `AsyncLocalStorage` container (Design Notes "Test finish").
- `packages/mockery/src/index.ts` -- export and freeze `Mockery`, `Container`, `Expectation`, `CompositeExpectation`, `ExpectationDirector`, the count validators and the Mockery exception classes (not the internal SPL parents or matchers).
- `packages/mockery/package.json`, `tsconfig.json`, `README.md` -- the `@xaravel/assert` dependency (scaffold regenerates tsconfig; add the README dependency line in the scaffold's wording: "grader packages may depend on grader packages (AD-2)").
- `packages/assert/src/declarations/portedTest.ts`, `xaravelTest.ts` -- the mockery-run wrap.
- `conformance/oracle-requests/4.5.jsonl` -- `php-expr` requests with ids `XT-mockery-1`, `-2`, `-3`, generated from the scenario table (Design Notes "Requests"). `bun run oracle:story check 4.5` passes.
- `packages/mockery/tests/xaravel/scenarios.ts` -- the shared scenario table `{ id, label, php, run(Mockery, twins) }` and the twin classes, imported by the throwaway generator and the test.
- `packages/mockery/tests/xaravel/mockery.test.ts` -- XT-mockery-1..3, plain `bun:test` titled `XT-mockery-<n>: …`, one per AC in order (Design Notes "Test"); plus fixture-free checks of the globals, the frozen exports and the import scan (only `@xaravel/assert`, relative and `node:` imports under `src/`).
- `packages/mockery/tests/xaravel/fixtures/mockery.fixture.ts` -- child-run Ported Tests for XT-mockery-2.
- `conformance/escalations/ESC-4.5-1.md` -- `trigger: contract`, `test_ids: [XT-mockery-2, XT-mockery-3]`, items: (1) the run protocol `Symbol.for('xaravel.mockery.run')` and the count kind `mockeryExpectation`, which `Mockery.close()` records (Story 5.3's floor must accept a kind the Inventory never records; Epic 57's TestCase calls `Mockery.close()` in `tearDown` and must not add the count again); (2) the SPL parent classes are grader-internal, so `expectException(\BadMethodCallException::class)` in a Ported Test cannot match Mockery's exception until an owner supplies shared SPL classes (joins ESC-4.3-1 item 14; proposed owner Epic 9 runtime, read by the grader through a `Symbol.for` protocol); (3) mocking a contract token or an unresolvable class-name string: a token carries no method list, so a declared method without expectations reports "does not exist" instead of "Received …", and `instanceof` against a token is not set (proposed: Epic 10 tokens carry `Symbol.for('xaravel.contract.methods')`; the grader reads it); (4) AC 3 reads "a call that matches no expectation throws `BadMethodCallException`, as Mockery does"; Mockery throws `BadMethodCallException` when the method has no expectation, and `NoMatchingExpectationException` (a `Mockery\Exception`, an `UnexpectedValueException`) when it has expectations but none match its arguments; 4.5 follows Mockery (proposed: read AC 3 so); (5) the proxy does not intercept symbol keys or `then` (a promise-resolution probe, not a method call) unless `then` has an expectation; (6) `Container::mock` forms not in 4.5 (quick-definition arrays, constructor args, trailing closure, `Foo[m]` partials, `'A, B'` interfaces, `alias:`/`overload:`), `times()`'s E_USER_DEPRECATED after `never()` (no PHP error channel) and `because()`: proposed owner Story 4.6 (its AC 3 coverage report), with `alias:`/`overload:` through its PHP-only exclusion Escalation.
- `stories/4.5.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status.

**Acceptance Criteria:**
- Given the signed fixtures for `4.5.jsonl`, when XT-mockery-1 runs every scenario that uses `shouldReceive`, `once`, `twice`, `times`, `never`, `atLeast`, `atMost`, `with`, `withArgs` (array and closure), `withAnyArgs`, `andReturn`, `andReturnValues`, `andThrow` and `ordered` (plain and grouped), then each scenario's recorded values, exception short class and message match the Oracle after normalising `Mockery_<digits>` to `Mockery_<n>` and `#<32 hex>` identities to `#<id>`. Each of the 14 names runs in at least one scenario. A missing, unsigned or errored fixture fails, never skips.
- Given a Ported Test whose body leaves a `once()` expectation unmet, when it finishes, then it fails with the Oracle's `InvalidCountException` message and its report counts `mockeryExpectation: 1`. A Ported Test whose only assertions are met expectations passes and reports them. A `tearDown` that calls `Mockery.close()` counts each expectation once. A failing body's error wins, and the container is purged without verifying.
- Given a call that matches no expectation, when it happens, then a declared method without expectations and an undeclared method throw Mockery's `BadMethodCallException` (an instance of the internal `BadMethodCallException` parent) with the Oracle's message, and a method whose expectations match none of its arguments throws `NoMatchingExpectationException` with the Oracle's message, including `Objects: (…)` for an object argument.

## Spec Change Log

- 2026-10-18, resumption: the Maintainer approved ESC-4.5-1 (`decisions/ESC-4.5-1.md`): items 1-6 as proposed, item 7 narrowed (a grader package may depend on other grader packages only), and XT-conformance-8 was amended in #118. That clears the blocking condition, so the spec returns to `in-progress` and implementation resumes from `xt45-attempt-1.patch`. Item 6 binds: `andThrow()` with a class-name string is Story 4.6's, so 4.5's `andThrow` takes a Throwable instance or a class value only. The intent and ACs are unchanged.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 33 findings — high 0, medium 3, low 9, false 21, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Property reads on a mock return a dispatcher, because class-field initialisers never run on the `Object.create` instance — JS fields live in the constructor, which the spec's Instantiator rule never runs; reading a mock's public property is rare in Laravel tests and a fix means running constructors.
  - `[medium]` `[patch]` (blind) `with(SomeClass)` did not match the class-name string, while PHP's `with(Foo::class)` matches `'Foo'` by `==` — `_matchArg` now also matches a string equal to `classNameOf(expected)`; a fixture-free check covers instance, matching string and non-matching string.
  - `[false]` `[reject]` (blind) `matchArgs` treats an argument-list matcher at any position as the whole list — Mockery 1.6.15 `Expectation.php` 573-583 loops over every `_expectedArgs` entry the same way.
  - `[medium]` `[defer]` (blind) ESC-4.5-1 item 3 (`xaravel.contract.methods`) is approved but not read — deferred to the Epic 10 Story that defines token shape (see `deferred`).
  - `[false]` `[reject]` (blind) `andThrow` sets `_throw` before rejecting a bad argument — Mockery's `andThrow` (368-377) sets `_throw = true` first too; the port is faithful.
  - `[low]` `[reject]` (blind) `andReturnValues`' TypeError prints JS type names — TS types prevent the call in practice, and mapping to PHP names adds a helper for an unlikely path.
  - `[false]` `[reject]` (blind) process-wide module variables break AD-5 — AD-5 governs per-request framework state; the spec puts grader state in module variables, and `mockCounter` mirrors Mockery's static `MockNameBuilder::$mockCounter`.
  - `[low]` `[defer]` (blind) the run protocol never checks swallowed `BadMethodCallException`s (PHPUnit marks risky) — deferred to Story 5.3, which owns outcomes.
  - `[false]` `[reject]` (blind) verifying after `tearDown` rather than at `assertPostConditions` — the spec's Design Notes and approved ESC-4.5-1 item 1 define the protocol around `inner`; the test still fails either way, and a `tearDown` `Mockery.close()` counts once (fixture-tested).
  - `[false]` `[reject]` (blind) the mockery tests import assert's private test helpers by relative path — the spec's Code Map requires exactly that and forbids forking them.
  - `[low]` `[patch]` (blind) shipped rejection paths had no test — fixture-free checks added for `andThrow('XtErr')` (ESC-4.5-1 item 6) and `Container.mock`'s second-argument, `'A, B'`, `'Foo[m]'` and `'alias:'` forms.
  - `[false]` `[reject]` (blind) status records contradict each other — the change-log entry records the resumption state at the time; the frontmatter and Auto Run Result are finalised here, and `test_ids: []` with XT ids under `xaravel_test_ids` matches Stories 4.1-4.3.
  - `[low]` `[reject]` (blind) `runWithMockery` lives in `portedTest.ts` instead of `Declarations.ts` — cosmetic, no named harm; it is not re-exported from `@xaravel/assert`'s index.
  - `[low]` `[reject]` (edge) a getter or instance field on the mocked class runs on a constructor-less instance — same root as the property-read row; PHP mocks have no accessors, and the case is unlikely in ported tests.
  - `[low]` `[reject]` (edge) duck-type probes (`toJSON`, `asymmetricMatch`) on a mock dispatch and throw — Ported Tests use `@xaravel/assert`, not `expect`, and PHP never probes; a probe list adds guards for an unlikely path.
  - `[false]` `[reject]` (edge) `shouldReceive('shouldReceive')` shadows the API — no Laravel test expects a Mockery API name; the spec fixes this dispatch order (Design Notes "Mock object").
  - `[low]` `[reject]` (edge) `withArgs(SomeClass)` fails at match time with a TypeError — unlikely misuse that fails loudly.
  - `[false]` `[reject]` (edge) mocks outside the run protocol are never verified — Mockery behaves the same without `Mockery::close()`.
  - `[false]` `[reject]` (edge) leading-backslash, empty or undescribed-symbol names diverge from MockNameBuilder — the leading-`\` difference is recorded in ESC-4.5-1's evidence, which the Maintainer approved.
  - `[false]` `[reject]` (edge) `Mockery.mock(undefined)` throws — AD-9 makes `null` the only absent value; the call fails loudly.
  - `[false]` `[reject]` (edge) an empty key in the object form of `shouldReceive` is not rejected — Mockery's `"" == $method` check also does not fire for an array argument.
  - `[false]` `[reject]` (edge) a second module copy keeps its own container — Bun resolves the workspace package once; nothing shown loads two copies.
  - `[medium]` `[patch]` (verification-gap) no test ran a Ported Test with both `xaravel.scope.run` and Mockery loaded — the fixture now runs a second time with a fake scope runtime; XT-mockery-2 asserts identical results, `mockeryExpectation: 1` for a new unmet test, and that close ran inside the `test` frame.
  - `[false]` `[reject]` (verification-gap, other) nothing in-repo protects the Story until fixtures are signed — the tests fail rather than skip; the PR merges only after `oracle.yml#story` commits the fixtures.
  - `[false]` `[reject]` (intent A) the Upstream consumer surface is not tested — the intent's ACs are XT-mockery-1..3; Upstream Ported Tests are later Stories.
  - `[false]` `[reject]` (intent B) the Oracle evidence is unsigned — same as the row above; signing happens on the PR.
  - `[false]` `[reject]` (intent C) hand-written counts in XT-mockery-2 — `mockeryExpectation` counts are a Xaravel protocol fact with no PHP expression; every Mockery outcome and message comes from the Oracle.
  - `[false]` `[reject]` (intent D) short-name class comparison hides SPL-vs-Mockery mixups — Mockery's `times()` throws PHP's root `\InvalidArgumentException` (`use InvalidArgumentException;`), which the port throws; XT-mockery-3 compares full names for the BadMethodCall rows.
  - `[false]` `[reject]` (intent E) `Foo::class` maps to a class value — the spec's matching rules define it; the string half is now patched (row 2).
  - `[low]` `[reject]` (intent F) symbol targets and the object form of `shouldReceive` go beyond the listed inputs — the symbol form serves ESC-4.5-1 item 3 and the map is Mockery's array form; neither is a 4.6 API.
  - `[false]` `[reject]` (intent G) files outside `packages/mockery` — ESC-4.5-1 item 1 puts the wrap in `portedTest`/`xaravelTest`, and the MAINT ownership amendment covers Epic 1-8 Stories.
  - `[false]` `[reject]` (intent H) XT tests use `bun:test` rather than `xaravelTest` — the grader does not test itself with itself, as in Stories 4.1-4.3.
  - `[false]` `[reject]` (intent I) internals are frozen beyond the exports — consistent with the intent's freeze rule, no harm.

## Design Notes

**Mock object.** `Container.mock(target?)`. A target is a JS class, a class-name string or nothing. The mock class name is `Mockery_<n>[_<part>]`, where the part is the target's `[Symbol.for('xaravel.class.fqcn')]` (else its `name`; display only, AD-10) with `\` replaced by `_`, or the string itself. `n` comes from a process-wide counter that increments only when a new target is seen: a second `mock(XtFoo)` reuses `Mockery_0_XtFoo`, and `close` never resets it. For a class, the generated class extends it (`instanceof` holds); the instance is `Object.create(Generated.prototype)`, so the real constructor never runs, as with Mockery's Instantiator. The returned mock is a `Proxy` whose `get` resolves a string key in this order: (1) a method with an `ExpectationDirector` (exact name, then case-insensitive) → a dispatcher; (2) a Mockery API member (`shouldReceive`, `mockery_*`, `toString`) → itself; (3) a function declared on the target's prototype chain above `Object.prototype` → a dispatcher; (4) any other property present on the object, and `then` → `Reflect.get` (`then` is absent → `undefined`); (5) any other string → a dispatcher. Symbol keys always use `Reflect.get`. The dispatcher runs `_mockery_handleMethodCall(name, args)`: a director → `director.call(args)`; none → `BadMethodCallException` with "Received …, but no expectations were specified" for case (3), "does not exist on this mock object" for case (5).

**Matching.** `_matchArg(expected, actual)`: `===`; then an internal matcher's `match`; then, when `expected` is an object (including a JS function that is not a class), **false**; a class value (a function with an object `prototype`) matches an object `actual` that is `instanceof` it; a string matches an object whose class chain has that `[Symbol.for('xaravel.class.fqcn')]`; else `phpLooseEquals(expected, actual)`. `withArgs(closure)` matches only when the closure returns exactly `true`. `with()` with no arguments is `withNoArgs`. Arity must match.

**Formatting.** `formatArgument`: an internal matcher prints its tag (`<Any Arguments>`, `<No Arguments>`, `<MultiArgumentClosure===true>`); an object or JS function prints `object(<class>)` (a function is `Closure`; a plain object is `stdClass`); a number prints as PHP does (`1`, `1.5`, `1.0E+25`, `INF`, `NAN`); a `bigint` as its digits; a string `'s'` unescaped; `true`/`false`; `null` as `NULL`; `undefined` as `undefined` (AD-9: never disguised); arrays (list, plain object, branded) as `[0 => 1, 'a' => 'x']`, `[...]` at depth 1, cut at 1000 characters with `...]`. `formatObjects` ports `objectToArray` and PHP's `var_export` for the shapes it produces; the identity is `#` + md5 of `<class>_<per-object id>`.

**Test finish.** `Mockery.getContainer()` returns the container of the current `AsyncLocalStorage` store, else a process-level container. `globalThis[Symbol.for('xaravel.mockery.run')](fn)` runs `fn` with a fresh container in the store. When `fn` rejects, it closes the container without verifying and rethrows. When `fn` resolves, it calls `Mockery.close()` for the store's container. `Mockery.close()` records `mockeryExpectation` once per `mockery_getExpectationCount()` (via `recordAssertion`), detaches the container, then runs `mockery_teardown()`: each mock in insertion order, each director in insertion order, each expectation in order, first exception thrown. The next `mock()` then gets a fresh container. `portedTest` runs `inner` (setUp, body, tearDown) through the protocol when the global is a function, inside the scope frame. `xaravelTest` does the same around its body.

**Requests.** Each request's `setup` declares the PHP twins (`class XtFoo { public function bar($x = null) {} public function baz() {} public function qux() {} }`, `class XtBar extends XtFoo {}`, `class XtErr extends \Exception {}`). Each expr is one scenario wrapped as `(function () { try { <scenario>; \Mockery::close(); return ['ok', <recorded values>]; } catch (\Throwable $e) { try { \Mockery::close(); } catch (\Throwable $ignored) {} return ['throws', (new \ReflectionClass($e))->getShortName(), $e->getMessage()]; } })()`. A scenario that expects a verify error ends with `\Mockery::close()` in its own `try`. TS runs the twin of each scenario with the same wrapping. Scenarios include: once/twice/times(3)/never met and unmet; `atLeast()->times(2)` and `atMost()->times(1)` met and unmet; `with(1)` vs `'1'`, `with(null)` vs `false`, `with([1, 2])`, `with('XtFoo')` vs an `XtBar` instance, an object vs an equal distinct object; `withArgs([1])`, a closure returning `true` and `1`; `withAnyArgs`; `with()` vs a call with one argument; `andReturn(1, 2)` over three calls; `andReturnValues([3, 4])`; `andThrow(new XtErr('e'))` and `andThrow(XtErr::class, 'm', 7)` (code recorded); `ordered()` in and out of order, two groups; exhausted fallthrough; several names in one `shouldReceive`; no return value → `null`.

**Test.** XT-mockery-1 and XT-mockery-3 rebuild each scenario in TS and compare cell by cell, one aggregated mismatch list per request. XT-mockery-2 has Oracle cells for the three verify messages, plus a child `bun test` of `mockery.fixture.ts` that checks pass/fail, the failure text and each report's `assertions`, reusing 4.2's runner pattern. The fixture-free checks run before any fixture is read.

## Verification

**Commands:**
- `bun test packages/mockery packages/assert` -- expected: all pass once fixtures are signed; before that only the fixture-reading cells fail, naming the missing fixture.
- `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 conformance/oracle-requests/4.5.jsonl` with a throwaway key, then the test against those unsigned results -- expected: 0 mismatches (local cross-check, never committed).
- `bun run oracle:story check 4.5`, `bun run escalations:check`, `bun run scaffold:check`, `bun run graph:check`, `bun run ownership:check` -- expected: pass.
- `bun run typecheck`, `bun run lint`, `bun test` -- expected: no new failures.

## Auto Run Result

Status: done

- **Change:** Mockery 1.6.15's core in `@xaravel/mockery` (mock, container, expectations, director, count validators, exceptions) with the `xaravel.mockery.mock` and `xaravel.mockery.run` globals; `portedTest`/`xaravelTest` run each test through the run protocol (ESC-4.5-1 item 1). Resumed from `xt45-attempt-1.patch` after the ESC-4.5-1 ruling; the patch file is deleted in this PR.
- **Files:** `packages/mockery/src/**` (the port), `packages/mockery/{package.json,README.md,tsconfig.json}` (the `@xaravel/assert` dependency), `packages/assert/src/declarations/{portedTest,xaravelTest}.ts` (the run wrap), `conformance/oracle-requests/4.5.jsonl` (3 requests, 50 cells), `packages/mockery/tests/xaravel/**` (XT-mockery-1..3, scenario table, child-run fixture), `bun.lock`, `stories/4.5.md`, `sprint-status.yaml`.
- **Review:** 33 findings, 3 patched (2 medium: class-value `with()` matching the class-name string; scope-frame + Mockery fixture branch; 1 low: rejection-path tests), 2 deferred (ESC-4.5-1 item 3 reader → Epic 10; swallowed-exception risky check → Story 5.3), 28 rejected with reasons in the triage log.
- **Follow-up review recommended:** yes — two medium patches (0 high, 2 medium, 1 low patched). The unverified risk: the scope-frame branch is checked only against a fake `xaravel.scope.run`; the real Epic 9 scope runtime may interleave the frame and the AsyncLocalStorage store differently.
- **Verification:** a local unsigned Oracle run (throwaway key, in a copy outside the repo) matched the port and `bun test packages/mockery` passed 5/5 against it. In the repo: `oracle:story check 4.5`, `escalations:check`, `scaffold:check`, `graph:check`, `ownership:check`, `typecheck` and `lint` pass; `bun test` has 140 pass and 3 fail, the three XT-mockery tests naming their missing signed fixtures, which `oracle.yml#story` signs on the PR. XT-conformance-8 passes.
- **Residual risks:** the in-repo Oracle comparison is unproven until the fixtures are signed; mock property reads return dispatchers (class fields never initialise); this run's implementation subagent first tried to swap `oracle.pub` inside the repo for the local cross-check; the permission check refused it, and the subagent then ran the cross-check in a throwaway copy outside the repo. No repo file was changed, and the merge gate is the CI-signed fixtures, not that local run.
