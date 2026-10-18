---
title: 'Story 4.6: Mockery advanced and API coverage'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: 'ae0e26cc5f87777029303a1acd005e92533a321b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5-mockery-core.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/mockery` has only Mockery's core (Story 4.5). Upstream tests also use spies, partial mocks, `byDefault`, `shouldIgnoreMissing`, the `andReturn*` family, the static matchers and `shouldHaveReceived`, and nothing reports which scanned Mockery APIs are still missing (FR-100, Story 4.6 AC 1–3). ESC-4.5-1 item 6 also hands 4.6 the `Container::mock` forms 4.5 rejects, `because()`, the `times()` deprecation after `never()` and `andThrow()` with a class-name string.

**Approach:** Extend the 4.5 port with the rest of Mockery 1.6.15's used API, keeping its names, dispatch and messages. The Oracle (real Mockery, through `php-expr` requests in `conformance/oracle-requests/4.6.jsonl`) supplies every expected outcome and message. Mocked Eloquent models keep the mock's members off the model Proxy's `defineProperty` trap (AD-7). A `mockery:coverage` report, mirroring Story 4.4's `assert:coverage`, lists every scanned name with no implementation and fails on any. Contracts this Story cannot settle alone go to ESC-4.6-1.

## Boundaries & Constraints

**Always:**
- Follow Mockery 1.6.15 (`/tmp/xaravel-inv/framework/vendor/mockery/mockery/library/`) exactly where JS can express it. Keep its class, method and message names; AD-3 paths under `packages/mockery/src/` mirroring `library/` (`src/Mockery/HigherOrderMessage.ts`, `src/Mockery/VerificationDirector.ts`, `src/Mockery/Matcher/Closure.ts`, …), one public class per file, named exports only.
- Import only `@xaravel/assert`'s public `index.ts` and `node:` built-ins (AD-2). Return `null`, never `undefined` (AD-9). Freeze every new export and its prototype on load, as 4.5 does; mutable state stays in module-private variables, the `AsyncLocalStorage` container and per-`Mock` fields.
- Every 4.5 behaviour, test and message stays as it is, except the rejections this Story replaces with the real form (Container forms, `shouldReceive()` with no arguments, `andThrow('Class')`).
- Every compared cell comes from a signed fixture; a missing, unsigned or errored fixture fails, never skips.

**Never:**
- Demeter chains (`'a->b'`), static-method mocking, `andYield`, `andSet`/`set`, `between`, `withAndOthers`, Hamcrest matchers, PHPUnit-constraint matchers and the other Mockery matchers (`pattern`, `subset`, `ducktype`, …): none is a scanned name; they keep failing loudly as in 4.5.
- `alias:` and `overload:` mocks. They keep throwing, with a message naming ESC-4.6-1 (PHP class aliasing has no JS analogue; DIV-6 entry proposed there).
- Port `jasonmccreary/double` (`returns`, `throws`, `resolves` are its methods, not Mockery's); the report lists them as pending ESC-4.6-1.
- Hand-write an Oracle expected value; weaken, skip or drop a compared cell; touch 4.4's `assert:coverage` or Story 4.4/4.5 specs; import or fake a graded package (Model included: XT-mockery-5 uses a local test double).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Spy | `s = Mockery.spy(XtFoo)`; `s.bar(1)`; `s.shouldHaveReceived('bar').with(1).once()` | `s.bar(1)` returns `null`; verification passes and counts | none |
| Spy unmet | `s.shouldHaveReceived('baz')` with no call | throws at the call | `InvalidCountException`, Oracle message |
| Not received | `s.shouldNotHaveReceived('bar')` after `s.bar()` | throws at the call | `InvalidCountException` |
| Partial `[m]` | `mock('XtFoo[bar]')`; `qux()` real, `bar` expected | real `qux` runs; `bar` uses its expectation; real ctor ran with no args | none |
| makePartial | `mock(XtFoo).makePartial()`; no expectation on `qux` | the real `qux` runs | none |
| Ignore missing | `mock(XtFoo).shouldIgnoreMissing(5)`; `m.nope()` | `5` | none |
| byDefault | `shouldReceive('bar').andReturn(1).byDefault()`, then `shouldReceive('bar').andReturn(2)` | `2` | turning a non-last expectation default → `Mockery\Exception('Cannot turn a previously defined expectation into a default')` |
| Matchers | `with(Mockery.on(f), Mockery.type('string'), Mockery.any())` | matches as Mockery does; message prints `<Closure===true>`, `<String>`, `<Any>` | none |
| capture | `with(Mockery.capture(ref))` | after the call `ref.value` is the argument (AD-9 `Ref` box, ESC-4.6-1) | none |
| self | `andReturn(Mockery.self())` | returns the last mock created | no mock yet → `LogicException('You have not declared any mocks yet')` |
| andReturnArg | `andReturnArg(1)`; call with one argument | throws | `OutOfBoundsException('Cannot return an argument value. No argument exists for the index 1')` |
| alias/overload | `mock('alias:X')` | throws | `InvalidArgumentException` naming ESC-4.6-1 |
| Model mock | a class whose instances carry `MODEL_STATE`; mock, partial, spy, `Object.defineProperty(mock, 'm', …)` | the model's `defineProperty` trap is never called with a string key | none |

</intent-contract>

## Code Map

- Mockery 1.6.15 reference (read-only), under `library/`: `Mockery.php` (`any` 108, `capture` 140, `on` 513, `self` 586, `spy` 630, `type` 657); `Mockery/Expectation.php` (`andReturnArg` 239, `andReturnFalse/Null/Self/True` 265/275/285/293, `andReturnUsing` 316, `andReturns` 341, `andThrow` 368 with a string, `andThrowExceptions` 385, `andThrows` 406, `because` 460, `byDefault` 484, `globally` 535, `ordered` 632-643, `passthru` 651, `times` 685-715 (the `@trigger_error` is suppressed: no observable effect), `withNoArgs` 850, `withSomeOfArgs` 863, `zeroOrMoreTimes` 881, `_getReturnValue` 917-940, `_matchArg` 949-980); `ExpectationDirector.php` (`makeExpectationDefault` 180-191); `Mock.php` (`allows` 269, `expects` 293, `shouldNotReceive` 311, `shouldIgnoreMissing` 349, `shouldAllowMockingProtectedMethods` 371, `shouldDeferMissing`/`makePartial` 397/411, `byDefault` 425, `mockery_callSubjectMethod` 733, `shouldHaveReceived` 873-900, `shouldNotHaveReceived` 914-943, `_mockery_handleMethodCall` 1007-1114); `HigherOrderMessage.php`, `ExpectsHigherOrderMessage.php`, `VerificationDirector.php`, `VerificationExpectation.php`, `ReceivedMethodCalls.php`, `MethodCall.php`; `Container.php` (`mock` 220-271, `self` 466-478, `handleClosure` 585, `parseArguments` 627-661, `parseArrayArgument` 663+, partial parsing 680+); `Matcher/{Any,Closure,Type}.php`.
- `packages/mockery/src/Mockery/Mock.ts` -- Proxy `get` order at :286-307 (API set built at :295); `generatedFor` :45-66 (`Object.create` instance, real ctor never runs); `_mockery_handleMethodCall` :240-251; `shouldReceive()` no-arg rejection :108-111; demeter rejection :254-256. Add the `_mockery_*` flags, the received-call list and the new API members; the Proxy gains `set` and `defineProperty` traps for the AD-7 rule.
- `packages/mockery/src/Mockery/Container.ts:21-34` -- the 4.5 rejections; replace with `parseArguments` and add `self()`.
- `packages/mockery/src/Mockery/Expectation.ts` -- already has `_closureQueue`, `_because`, `_globally`, `getMock`; `andThrow` :76-85 rejects a string today.
- `packages/mockery/src/Mockery/CompositeExpectation.ts` -- explicit forwarders: add one per new Expectation method, plus `shouldNotReceive`.
- `packages/mockery/src/Mockery/ExpectationDirector.ts` -- `_defaults` already read by `findExpectation`/`verify`/`getExpectationCount`.
- `packages/mockery/src/Mockery/Matcher/` -- internal `MatcherAbstract`, `AnyArgs`, `NoArgs`, `MultiArgumentClosure`; `src/support/values.ts` -- `FQCN`, `isClass`, `classNameOf`, `instanceOfName`, `formatArgument`.
- `packages/mockery/src/Mockery.ts` -- statics and the two globals; `src/index.ts` -- exports and the freeze (comment :9-10 says 4.6 exports matchers).
- `packages/mockery/tests/xaravel/{mockery.test.ts,scenarios.ts,cells.ts,fixtures/}` -- 4.5's harness: `oracleOutput(id)` :45, `checkScenarios(id)` :59, `REQUEST_FILE`/`FIXTURES` :24-30; `Scenario.id` union at scenarios.ts:111 must widen to `XT-mockery-4`; `SETUP` :77 holds the PHP twins and `xt_try`; `scenarioMismatches` in cells.ts. Reuse; do not fork.
- `packages/assert/tests/xaravel/oracle-values.ts` -- `readRequests`, `readSignedFixture`, `decode` (relative import).
- `tools/assert-coverage/coverage.ts` -- the pattern for the new report (`readScanNames`, `--root`, owner table for non-owned names, output and exit codes 0/1/2); its test is XT-assert-14 in `packages/assert/tests/xaravel/expectations.test.ts:479` (temp root with a symlinked package).
- `package.json:52` (`assert:coverage` script), `.github/workflows/ci.yml:119-120` (the `check` job step), `conformance/tests/xaravel/repository-policy.test.ts` (XT-conformance-33 pins the `check` job's steps; extend its expected list for the new step), root `tsconfig.json` include (4.4 added `tools/assert-coverage`).
- `tools/oracle/request.ts:157,172` -- `makeRequest`, `renderRequests`; generate `4.6.jsonl` from a throwaway script outside the repo. Local cross-check: `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 conformance/oracle-requests/4.6.jsonl` in a throwaway copy outside the repo (never swap `oracle.pub` in the repo).
- `conformance/escalations/ESC-4.5-1.md`, `ESC-4.4-2.md` -- format for ESC-4.6-1; `bun run escalations:check`.
- Upstream usage, for scenario choice: `Mockery::self` (tests/Database/DatabaseQueryBuilderTest.php:5095), `on` (DatabaseEloquentBuilderTest.php:2324), `type(Closure::class)` (DatabaseMigrationResetCommandTest.php:29), `any` (SeedCommandTest.php:44), `shouldHaveReceived('call')->once()->with(...)` (DatabaseSeederTest.php:74), `shouldHaveReceived()->getQueueableId()->once()` (DatabaseEloquentCollectionQueueableTest.php:21), `spy(A, B)` (FoundationCacheBasedMaintenanceModeTest.php:40), `Model::class.'[getConnectionName]'` (DatabaseEloquentPivotTest.php:19), `passthru` (DatabaseEloquentBelongsToManyWithCastedAttributesTest.php:21), `globally()->ordered()` (CacheRedisTaggedCacheTest.php:22), `andThrowExceptions` (AuthenticateSessionTest.php:345), `withSomeOfArgs` (BusBatchTest.php:747), trailing closure (SupportTestingMailFakeTest.php:34).

## Tasks & Acceptance

**Execution:**
- `packages/mockery/src/Mockery/Expectation.ts`, `CompositeExpectation.ts`, `ExpectationDirector.ts` -- add `andReturnArg`, `andReturnFalse`, `andReturnNull`, `andReturnTrue`, `andReturnSelf`, `andReturnUsing`, `andReturns`, `andThrows`, `andThrowExceptions`, `andThrow` with a class-name string (resolved by FQCN among the exception classes the grader defines: its SPL parents, `Exception` and Mockery's exceptions; any other name throws an `Error` with PHP's `Class "<name>" not found` at setup; ESC-4.6-1 item 9), `because`, `byDefault` + `makeExpectationDefault`, `globally`, `passthru`, `withNoArgs`, `withSomeOfArgs` (strict `===` membership), `zeroOrMoreTimes`; `_getReturnValue` closure precedence; `times()` after `never()` stays silent (the PHP deprecation is `@`-suppressed).
- `packages/mockery/src/Mockery/Matcher/{Any,Closure,Type}.ts` -- `<Any>`, `<Closure===true>`, `<Type>` printing (`'<' + ucfirst + '>'`); `Type` maps PHP `is_*` names (`int`, `integer`, `float`, `real`, `double`, `string`, `bool`, `boolean`, `array`, `object`, `callable`, `numeric`, `scalar`, `iterable`, `countable`, `null`) to the PHP value model (DIV-9; int vs float by `Number.isInteger` as DIV-9 allows), `'Closure'`/`'callable'` to a non-class function, and any other name or class value to `instanceOfName`/`instanceof`.
- `packages/mockery/src/Mockery.ts` -- statics `spy`, `on`, `type`, `any`, `capture` (writes `ref.value`), `self`.
- `packages/mockery/src/Mockery/{HigherOrderMessage,ExpectsHigherOrderMessage,VerificationDirector,VerificationExpectation,ReceivedMethodCalls,MethodCall}.ts` -- as in Mockery; a HigherOrderMessage is a Proxy whose string `get` returns `(...args) => …`.
- `packages/mockery/src/Mockery/Mock.ts` -- `allows`, `expects`, `shouldReceive()` with no arguments, `shouldNotReceive`, `shouldIgnoreMissing(returnValue, recursive)`, `shouldAllowMockingProtectedMethods`, `makePartial`/`shouldDeferMissing`, `byDefault`, `shouldHaveReceived`, `shouldNotHaveReceived`, `shouldHaveBeenCalled`/`shouldNotHaveBeenCalled`; `_mockery_handleMethodCall` in Mockery's order (record the call, director with the ignore/defer fallthrough on `NoMatchingExpectationException`, proxied partial, defer to the parent prototype method, `__toString`, ignore-missing default, `BadMethodCallException`); `mockery_callSubjectMethod` for `passthru`; AD-7 traps (Design Notes).
- `packages/mockery/src/Mockery/Container.ts` -- `parseArguments`: a trailing function (with two or more arguments), a class, a class-name string, `'A, B'` and `'A|B'` and several class arguments (the first class is the parent, so `instanceof` holds for it only; the mock name joins every part as Mockery's `MockNameBuilder` does; ESC-4.6-1 item 8), `'Foo[m1,!m2]'` partials (real ctor, no args), an object target (proxied partial), a list (constructor args: real ctor), a string-keyed map (quick definitions → `shouldReceive(map)` + `byDefault`), `alias:`/`overload:` → `InvalidArgumentException` naming ESC-4.6-1; anything else → `Mockery\Exception('Unable to parse arguments sent to Mockery\Container::mock()')`; `self()`.
- `packages/mockery/src/index.ts` -- export and freeze the new public classes (matchers `Any`, `Closure`, `Type`; `HigherOrderMessage`, `VerificationDirector`, …); XT-assert-3 stays green.
- `tools/mockery-coverage/coverage.ts` + root `package.json` script `mockery:coverage` + root `tsconfig.json` include + `.github/workflows/ci.yml` `check` job step "Report Mockery API coverage" + XT-conformance-33's expected step list -- reads `conformance/scans/mockery-api.jsonl`; a `static: true` name is implemented when `typeof Mockery[name] === 'function'`; an instance name when it is a function on a probe mock (`Mockery.mock()` inside a fresh run, closed afterwards), on `Expectation.prototype` or on `CompositeExpectation.prototype`; `returns`, `throws`, `resolves` print `pending ESC-4.6-1: <name> (JMac\Testing\Double)`; output and exit codes as `assert:coverage`.
- `conformance/oracle-requests/4.6.jsonl` -- `php-expr` requests `XT-mockery-4` (every AC 1 name and the I/O matrix's PHP-expressible rows, plus the 4.6 Container forms, `andReturn*`, `globally`, `passthru`, `andThrowExceptions`, `withSomeOfArgs`, `zeroOrMoreTimes`, `because`, `andThrow` with a class string) (one request; XT-mockery-5 and XT-mockery-6 check Xaravel-only behaviour and have none); `bun run oracle:story check 4.6` passes.
- `packages/mockery/tests/xaravel/scenarios.ts`, `mockery.test.ts` (or a new `advanced.test.ts` beside it) -- XT-mockery-4 compares every 4.6 scenario against the Oracle cell by cell; XT-mockery-5 runs a local model double (Design Notes); XT-mockery-6 runs the report on the real repo (exit 0, only the three pending lines) and on temp roots that add an unknown name or remove an API (exit 1, naming it). Fixture-free checks (globals, freeze, import scan) stay first.
- `conformance/escalations/ESC-4.6-1.md` -- `trigger: contract`, `test_ids: [XT-mockery-4, XT-mockery-5, XT-mockery-6]`, items in Design Notes "Escalation".
- `stories/4.6.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status.

**Acceptance Criteria:**
- Given the signed fixtures for `4.6.jsonl`, when XT-mockery-4 runs, then every scenario using `spy`, `makePartial`, `Foo[m]` partials, `shouldIgnoreMissing`, `byDefault`, `andReturnUsing`, `andReturnSelf`, `Mockery.on`, `Mockery.type`, `Mockery.any`, `shouldHaveReceived`, `shouldNotHaveReceived`, `allows`, `expects`, `shouldNotReceive`, `andReturnArg/False/Null/True`, `andThrowExceptions`, `andThrow('Class')`, `passthru`, `globally`, `withNoArgs`, `withSomeOfArgs`, `zeroOrMoreTimes`, `because`, `Mockery.capture`, `Mockery.self` and the Container forms matches the Oracle's recorded values, exception short class and message after the 4.5 normalisation. Each name runs in at least one scenario.
- Given a model double whose instances carry `Symbol.for('xaravel.model.state')` and whose constructor returns a Proxy with a `defineProperty` trap that throws on string keys, when it is mocked plainly, as a `[m]` partial, with `makePartial`, as a spy and with constructor args, and a member is defined on each mock, then expectations, real-method deferral and verification work, the trap is never hit with a string key, and the member is readable through the mock from the escape slot.
- Given `mockery-api.jsonl`, when `bun run mockery:coverage` runs on the repo, then it exits 0, listing every scanned name as implemented except `returns`, `throws`, `resolves` (pending ESC-4.6-1); a scan name with no implementation makes it exit 1 and names it.

## Spec Change Log

- 2026-10-18, implementation: (a) 4.6's real-bodied twin is a new class `XtReal` (ctor records its arguments; `qux()` returns `'real'`, `baz()` calls `$this->bar()`), plus `interface XtIface`, declared in `SETUP_ADVANCED` after 4.5's `SETUP`, instead of changing `XtFoo`: changing `XtFoo`'s PHP declaration would change 4.5's request bytes and invalidate its signed fixtures, against "Every 4.5 behaviour, test and message stays". (b) `Container::mock` resolves class-name strings and `'Foo[m]'` partials through `globalThis[Symbol.for('xaravel.class.lookup')]` (added to ESC-4.6-1 item 9); the test module installs a stand-in for its twins until Story 9.4's registry exists. (c) The coverage report tells a probe mock's API member from a call dispatcher by its bound name (`bound <name>`), because the mock Proxy answers every string key with a function. (d) A non-configurable string-keyed `defineProperty` on a mocked model is refused (a Proxy invariant), recorded in ESC-4.6-1 item 1.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 37 findings — high 0, medium 4, low 16, false 15, maybe-false 0, plus 2 reported but not counted as defects (VG: fixture pending, coverage step hidden until then; both rejected below)
- findings:
  - `[medium]` `[patch]` (blind) a `function` expression counts as a class, so a trailing `function (m) {}` closure never runs and `type('Closure')` rejects it — internal `isClosure` (FQCN brand or `class` source) used for the trailing closure and `Type`; fixture-free checks added.
  - `[low]` `[patch]` (blind) AvoidMethodClashPass not ported: a class declaring `allows`/`expects` (Gate) got the API member — the Proxy now dispatches the declared method; fixture-free check with a `Gate` class.
  - `[low]` `[reject]` (blind) `spy(closure)` / `shouldHaveBeenCalled` cannot work without ClosureWrapper — 0 Upstream `spy(<closure>)` uses (grep of tests/), `shouldHaveBeenCalled` is not scanned, and the fix adds a callable-mock surface.
  - `[low]` `[reject]` (blind) model mock lacks `has`/`ownKeys`/`deleteProperty`/`getOwnPropertyDescriptor` traps — unlikely on a mocked model in ported tests; the fix adds four traps.
  - `[medium]` `[patch]` (blind) the `set` trap is untested and, on a constructed model, a fresh key reaches the model's `defineProperty` unless the Model handles `set` — XT-mockery-5 now assigns on plain, `[m]` and ctor-args model mocks against a double with a logging `set` trap; ESC-4.6-1 item 1 now requires Story 36.1's Proxy to handle string-keyed `set` and asks it to rule on the bare-instance path.
  - `[low]` `[reject]` (blind) `andThrow('RangeException')` etc. say `Class "X" not found` — 0 Upstream string-literal `andThrow` uses; ESC-4.6-1 item 9 covers the lookup.
  - `[low]` `[patch]` (blind) `partialMock()` from the Story AC has no owner — ESC-4.6-1 item 10 names it Laravel's `InteractsWithContainer::partialMock`, owner the Epic 57 TestCase.
  - `[low]` `[reject]` (blind) the spec's matrix/Design Notes still say `XtFoo` while Change Log (a) moved to `XtReal` — the fix edits this build's spec; the Change Log records the reason.
  - `[low]` `[patch]` (blind) ESC-4.6-1 proposes DIV-6 entries without wording — clause text added to items 3 and 4.
  - `[low]` `[reject]` (blind) the coverage report counts inherited `Object.prototype` members — no scan name is one (`mockery-api.jsonl`); the fix adds a chain walk for an unlikely path.
  - `[low]` `[patch]` (blind) `MockSpec` exported as public type — export removed; nothing outside `src` used it.
  - `[low]` `[patch]` (blind) escape-slot descriptor with no value reads `undefined` (AD-9) — `readDescriptor` returns `null`.
  - `[low]` `[patch]` (blind) empty `if` block in `times()` — removed, comment kept.
  - `[low]` `[reject]` (blind) XT-mockery-6's removed-API case deletes exact source text — test-only brittleness that fails loudly on reformatting.
  - `[medium]` `[patch]` (edge) a proxied partial's method ran with `this` undefined — now `.apply(partial, args)`; fixture-free check with a `this`-reading method.
  - `[false]` `[reject]` (edge) the closure and quick definitions run before the mock is remembered, so `self()` in the closure sees the previous mock — Container.php 250-270 does the same (`rememberMock` last).
  - `[false]` `[reject]` (edge) `mock(Foo, [])` runs the ctor where Mockery skips it — Mockery 1.6.15 reads `[]` as constructor args (`[] !== $argument && …` guard), and the Oracle cell for `Mockery::mock(XtReal::class, [])` records the ctor call.
  - `[low]` `[patch]` (edge) the generated-class cache key ignores the parent when a token is present — keyed by parent, then token, then configuration.
  - `[low]` `[patch]` (edge) `allows(null)` threw TypeError; PHP `empty(null)` gives a HigherOrderMessage — null now behaves as the empty default.
  - `[low]` `[reject]` (edge) stringifying a HigherOrderMessage registers `shouldReceive('toString')` — PHP's HOM `__call` takes any name too; stringifying one is not a use seen Upstream.
  - `[low]` `[reject]` (edge) `spy(closure)` — same as the blind row above.
  - `[low]` `[reject]` (edge) a partial descriptor (configurable omitted) is refused on a model mock — a Proxy invariant, recorded in ESC-4.6-1 item 1; class-field defines are configurable.
  - `[low]` `[reject]` (edge) `in`/delete on escape-slot members — same as the blind traps row.
  - `[low]` `[patch]` (edge) setter-only descriptor reads `undefined` — same fix as the `readDescriptor` row.
  - `[low]` `[reject]` (edge) coverage counts inherited names — same as the blind row.
  - `[low]` `[reject]` (edge) scan error line numbers off with blank lines mid-file — the scan is generated without blank lines; cosmetic.
  - `[false]` `[reject]` (edge) `shouldNotReceive('a','b')` returns only the last expectation — Mock.php 311-327 returns the last `$expectation` too.
  - `[false]` `[reject]` (edge) `passthru` of a missing method throws `Call to undefined method` instead of Mockery's BadMethodCallException — `mockery_callSubjectMethod` calls `parent::$name`, which raises PHP's `Call to undefined method` Error.
  - `[low]` `[patch]` (edge) a fresh string key set on a constructor-less model mock lands on the bare instance — documented in ESC-4.6-1 item 1 for Story 36.1 to rule on, and pinned by XT-mockery-5 (grouped with the set-trap row).
  - `[medium]` `[patch]` (verification-gap) the `set` trap has no test — grouped with the blind set-trap row; fixed there.
  - `[false]` `[reject]` (verification-gap, other) XT-mockery-4 checks nothing until signed — fails rather than skips; `oracle.yml#story` signs on the PR, as for 4.5.
  - `[false]` `[reject]` (verification-gap, other) the failing Test step hides the coverage step in CI — transient until the fixture is signed; `bun run mockery:coverage` exits 0 locally.
  - `[low]` `[patch]` (verification-gap, other) ESC-4.6-1 should say the Model must handle `set` — grouped with the set-trap row.
  - `[false]` `[reject]` (intent 1) no ported Upstream test exercises the API — the ACs are XT-mockery-4..6; Upstream Ported Tests are later Stories.
  - `[false]` `[reject]` (intent 2) class-name strings rely on a test-side lookup — JS cannot resolve names; the protocol is ESC-4.6-1 item 9 for Story 9.4.
  - `[false]` `[reject]` (intent 3) AC 2 runs a local double, not the real Model — Model is Story 36.1's and the grader may not import it (AD-2).
  - `[false]` `[reject]` (intent 4/5) coverage is existence, and advisory in CI — AC 3 asks which APIs have "no implementation"; behaviour is XT-mockery-4's; advisory as for `assert:coverage` (ESC-4.4-2 item 4, ESC-4.6-1 item 7).
  - `[low]` `[reject]` (intent 6) the pending names and `alias:`/`overload:` rest on a proposed, not approved, Escalation — settled by the ruling on ESC-4.6-1, not by code; `overload:` is not a scan name.
  - `[false]` `[reject]` (intent 7) `stories/4.6.md` has `test_ids: []` — XT ids live under `xaravel_test_ids`, as in Stories 4.1-4.5.

## Design Notes

**Dispatch.** `_mockery_handleMethodCall(method, args)`: push `MethodCall(method, args)` to the received calls; a director → `call(args)`, catching `NoMatchingExpectationException` only when ignore-missing or defer-missing is set (then fall through); a proxied-partial object → call its method; defer-missing and a function on the parent prototype chain → call it with `this` = the mock Proxy; `__toString`/`toString` per Mockery; ignore-missing → the given default (JS has no return types, so `mockery_returnValueForMethod` yields `null`, or a recursive ignore-missing mock when `recursive` is set; ESC-4.6-1); else 4.5's `BadMethodCallException`. Protected methods: TS visibility does not exist at run time, so every method is mockable and `shouldAllowMockingProtectedMethods()` only sets its flag and returns the mock (ESC-4.6-1). Spies count `shouldHaveReceived` once per call as Mockery does (`++_mockery_expectations_count`).

**AD-7 model mocks.** `MODEL_STATE` is `Symbol.for('xaravel.model.state')` (proposed in ESC-4.6-1; Story 36.1 binds to it). A model instance is one where `MODEL_STATE in instance`. When the generated instance comes from `Object.create` (no ctor ran) and the target's prototype chain declares `MODEL_STATE`, Mockery defines an own `MODEL_STATE` slot (`{}`) on it by symbol key. The mock Proxy gains: `defineProperty(key)` — symbol keys and non-model targets → `Reflect.defineProperty`; a string key on a model → stored in the escape slot `instance[MODEL_STATE][Symbol.for('xaravel.mockery.members')]` (a null-prototype record); `get` reads that record before step (4); `set` with a string key on a model → `Reflect.set` on the target (the model's own `set` path, as PHP's `__set`). Mockery itself never defines a string-keyed property on a mock instance. The test double: `class XtModel { constructor() { return new Proxy(this, { defineProperty(t, k, d) { if (typeof k === 'string') throw new Error(k); return Reflect.defineProperty(t, k, d); } }) } }` with `XtModel.prototype[MODEL_STATE]` declared and a call log on the trap.

**Scenarios.** Extend 4.5's twins (`XtFoo` with real bodies where a partial or passthru needs them: `qux()` returns `'real'`; add a ctor that records its arguments into a static list so partials and ctor-arg forms are observable). Upstream patterns from the Code Map make the scenario list; PHP `capture` writes to a local, TS to `{ value }`. A spy's received call with no expectation returns `null` in both.

**Escalation (ESC-4.6-1).** (1) `MODEL_STATE` = `Symbol.for('xaravel.model.state')`, declared on `Model.prototype`, with the escape slot and trap rules above (binds Story 36.1). (2) `Mockery.capture(ref)` writes `ref.value`; Story 9.5's `Ref<T>` keeps a writable `value` (AD-9 by-reference rule). (3) `alias:`/`overload:` are `php-only` (DIV-6: PHP class aliasing and autoload interception); 1 Upstream use (FoundationDevCommandsTest.php:377), skipped as `php-only` when ported. (4) No run-time visibility: protected/private guards and `shouldAllowMockingProtectedMethods` are no-ops beyond the flag (DIV-6, PHP-runtime reflection). (5) `shouldIgnoreMissing` without a default returns `null` (no return types); recursive mode returns an ignore-missing mock for every missing call. (6) `returns`, `throws`, `resolves` are `jasonmccreary/double`'s (ai, mcp, boost suites); proposed owner: the Maintainer names an Infrastructure Story that ports Double into the grader; until then the report lists them as pending. (7) The `mockery:coverage` step is advisory like `assert:coverage` (ESC-4.4-2 item 4). (8) `'A, B'` extra JS class targets cannot all be in the prototype chain; only the first class is `instanceof`; interface names are display-only. (9) `andThrow('<FQCN>')` resolves only the exception classes the grader defines; proposed: Story 9.4's class registry exposes a `Symbol.for` lookup the grader may read for the rest (0 Upstream string-literal uses; `X::class` is a class value in TS).

## Verification

**Commands:**
- `bun test packages/mockery packages/assert` -- expected: all pass once fixtures are signed; before that only the fixture-reading cells fail, naming the missing fixture.
- A local unsigned Oracle run in a throwaway copy outside the repo, then the tests against it -- expected: 0 mismatches.
- `bun run mockery:coverage` -- expected: exit 0, three pending lines.
- `bun run oracle:story check 4.6`, `bun run escalations:check`, `bun run scaffold:check`, `bun run graph:check`, `bun run ownership:check`, `bun run assert:coverage` -- expected: pass.
- `bun run typecheck`, `bun run lint`, `bun test` -- expected: no new failures.

## Auto Run Result

Status: done

- **Change:** the rest of Mockery 1.6.15's scanned API in `@xaravel/mockery`: spies, `makePartial`/`Foo[m]` partials, `shouldIgnoreMissing`, `byDefault`, the `andReturn*`/`andThrow*` families, `Mockery.on/type/any/capture/self/spy`, `shouldHaveReceived`/`shouldNotHaveReceived` (VerificationDirector), `allows`/`expects`/`shouldNotReceive` and HigherOrderMessages, `passthru`, `globally`, `withNoArgs`, `withSomeOfArgs`, `zeroOrMoreTimes`, `because`, and `Container::mock`'s argument forms; the AD-7 escape for mocked models; the `mockery:coverage` report; ESC-4.6-1 (10 contract items).
- **Files:** `packages/mockery/src/**` (the port: Mock, Container, Expectation, CompositeExpectation, ExpectationDirector, matchers Any/Closure/Type, HigherOrderMessage, ExpectsHigherOrderMessage, VerificationDirector/Expectation, ReceivedMethodCalls, MethodCall, support/classes, index), `packages/mockery/tests/xaravel/{mockery.test.ts,scenarios.ts}` (XT-mockery-4..6), `conformance/oracle-requests/4.6.jsonl` (1 request), `conformance/escalations/ESC-4.6-1.md`, `tools/mockery-coverage/coverage.ts`, root `package.json`/`tsconfig.json`, `.github/workflows/ci.yml` (advisory `check` step), `conformance/tests/xaravel/repository-policy.test.ts` (XT-conformance-33 step list), `stories/4.6.md`, `sprint-status.yaml`.
- **Review:** 39 rows: 15 patched (4 medium: closure detection, proxied-partial `this`, the model `set` trap and its tests (two grouped rows); 11 low), 0 deferred, the rest rejected with reasons in the triage log.
- **Follow-up review recommended:** yes — three medium entries patched on a first pass. The unverified risk: the AD-7 escape and `set` path are proven only against a local model double; Story 36.1's real Model Proxy, and the bare-instance set on constructor-less model mocks, are unsettled until ESC-4.6-1 is ruled on.
- **Verification:** `oracle:story check 4.6`, `escalations:check`, `scaffold:check`, `graph:check`, `ownership:check`, `assert:coverage`, `mockery:coverage` (45 names: 42 implemented, 3 pending), `typecheck` and `lint` pass. `bun test`: 149 pass, 1 fail (XT-mockery-4, naming its missing signed fixture, which `oracle.yml#story` signs on the PR). The implementer's throwaway copy with a locally signed fixture matched all 40 XT-mockery-4 cells against real Mockery 1.6.15 (never committed; `oracle.pub` untouched).
- **Residual risks:** ESC-4.6-1 is unruled (the class-lookup protocol, `MODEL_STATE` name, `capture` box, DIV-6 entries and the Double owner all depend on it); the in-repo Oracle comparison is unproven until the fixture is signed; the coverage report's probe relies on bound-function names.
