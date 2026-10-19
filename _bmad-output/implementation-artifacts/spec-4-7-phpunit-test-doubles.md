---
title: 'Story 4.7: PHPUnit test doubles'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '805c3f28c712619825a32667f2f4ab43ae01d1fd'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-exception-output-file-and-json-assertions-and-the-coverage-report.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A contract-token double assumes the token's brand is `Symbol.for(<FQCN>)`, and a token without an FQCN brands as `class@anonymous`, so `instanceof` could silently be false.
    evidence: |-
      Review pass 2026-10-18 (Blind Hunter, Edge Case Hunter E5). Maybe-false: Epic 10's contract tokens do not exist yet. To settle it, check Story 10.1's token shape (its `Symbol.hasInstance` brand and FQCN), against ESC-4.7-1 item 5.
    location: >-
      packages/assert/src/Framework/MockObject/Generator/Generator.ts readTarget
    severity: medium (unverified)
  - summary: >-
      Symbol-keyed methods (for example `[Symbol.iterator]`) and accessors stay real on a double, so iterating a mock may run the real iterator over uninitialized state.
    evidence: |-
      Review pass 2026-10-18 (Edge Case Hunter E8). Maybe-false: PHP has no symbol-keyed methods, so whether ports map `IteratorAggregate::getIterator` to `[Symbol.iterator]` is decided later. To settle it, check how the Collection or iteration port (Epic 14) and the Upstream tests that `createMock` an iterable class behave.
    location: >-
      packages/assert/src/Framework/MockObject/Generator/Generator.ts readTarget
    severity: medium (unverified)
  - summary: >-
      `assertArraySubset` records `assertThat` before its argument checks, so a call that throws `InvalidArgumentException` counts one `assertThat`, while the Inventory records none.
    evidence: |-
      Review pass 2026-10-18 (Blind Hunter). Laravel's `Illuminate\Testing\Assert::assertArraySubset` throws before calling `PHPUnit::assertThat`. Moving the record after the checks makes `tools/assert-coverage/coverage.ts`'s no-argument probe (`recordsAssertion`) see nothing, so `assert:coverage` exits 1 and XT-assert-14 fails. The fix needs an `OUTCOME_PROBES` entry or a real probe argument in `tools/assert-coverage/` (Protected). Target: a Maintainer-approved Infrastructure change, or the next `assert` follow-up Story.
    location: >-
      packages/assert/src/Framework/Assert.ts assertArraySubset; tools/assert-coverage/coverage.ts recordsAssertion
    severity: low
---

<intent-contract>

## Intent

**Problem:** `this.createMock(X)` delegates to Mockery (ESC-4.4-1), but Laravel's tests drive PHPUnit's own MockObject API: `expects($this->once())->method('m')->with(…)->willReturn(…)`, `getMockBuilder(X)->onlyMethods([…])->setConstructorArgs([…])->getMock()` and `createStub` (433 `expects($this->…)` lines, 290 `getMockBuilder`, 20 `createStub`). The Maintainer's ruling `decisions/ESC-4.4-2.md` item 6 hands this to Story 4.7. It also adds `addToAssertionCount`, `stringContains`, and the `assertThat` kind for `assertArraySubset` (`decisions/ESC-4.3-1.md` item 8).

**Approach:** Port PHPUnit 13.4.3's test doubles into `@xaravel/assert` under `src/Framework/MockObject/` (AD-3), keeping PHPUnit's class, method and message names. A double is an instance of a generated subclass of the target, so `instanceof` holds. Its doubled methods dispatch through an InvocationHandler. Mocks register with their TestCase and are verified after the body, before the output check and tearDown, as `runBare` does. Every outcome and message is compared against signed Oracle fixtures from real PHPUnit (`conformance/oracle-requests/4.7.jsonl`). Contracts this Story cannot settle alone go to ESC-4.7-1.

## Boundaries & Constraints

**Always:**
- PHPUnit 13.4.3 is the reference: `conformance/tests/xaravel/php-fixtures/phpunit/vendor/phpunit/phpunit/src/` (also `/tmp/xaravel-inv/framework/vendor/phpunit/phpunit/src/`). Follow it exactly where JS can express it.
- Code lives in `packages/assert/src/Framework/MockObject/**` (mirroring `Framework/MockObject/`) and `src/Framework/TestCase/MockObjectRegistry.ts`. One public class per file, named exports only, `static [Symbol.for("xaravel.class.fqcn")]` naming the PHPUnit FQCN.
- Import only relative files and `node:` built-ins (AD-2; XT-assert-3 checks this). Return `null`, never `undefined` (AD-9). Every new export and its prototype is frozen by `index.ts`'s loop. Mutable state lives in per-double and per-TestCase-state fields, never in module variables shared across tests.
- Use the shared PHP value layer: `exporter/Exporter.ts` (`shortenedExport`, `phpunitExport`), `comparison/PhpValues.ts` and `Constraints.ts` (`IsEqual`, `IsInstanceOf`, `StringContains`). Never fork a copy (Epic 4 lesson).
- All Story 4.3–4.6 behaviour, tests and messages stay as they are, except three changes:
  - `createMock` (superseded by ESC-4.4-2 item 6), with XT-assert-13 reworked to match;
  - `assertArraySubset`'s kind, with XT-assert-8's expected multiset following it;
  - `StringContains` gains `ignoreCase`. Its output with `ignoreCase = false` is unchanged.
- Every compared cell comes from a signed fixture. A missing, unsigned or errored fixture fails the test, never skips it.
- XT-conformance-182's verbatim anchors stay byte-identical: `TestCase.ts:78` (the `CLASS_FQCN` line), `TestCase.ts:87-88` (the `classOrInterface(exception);` / `state(this).exception.expectClass(exception);` pair), and Assert.ts's `recordAssertion("assertTrue")` pair (`conformance/tests/xaravel/coverage-reports.test.ts:63-68`).

**Never:**
- Edit `packages/mockery/**`, `tools/**`, `conformance/tests/**`, `conformance/scans/**` or `conformance/expectations/**`. The now-unused `xaravel.mockery.mock` global stays installed by Mockery; it goes to ESC-4.7-1 item 4.
- Port APIs with zero Upstream uses: `createConfiguredMock`/`Stub`, intersection doubles, `atLeast`/`atMost`, `withAnyParameters`, `withParameterSets*`, `willReturnArgument`, `willReturnReference`, `willReturnStrictMap`, `seal`, `id`/`after`, `doubleProperties`, `setMockClassName`, auto-return-value toggles, and the `callback`/`anything`/`identicalTo` factories. Each is absent and fails loudly as a missing method (`TypeError`).
- Emit PHPUnit notices and deprecations: the "No expectations were configured" notice, the `any()` deprecation, and `with()` without `expects()`. They change no outcome (ESC-4.7-1 item 3).
- Hand-write an Oracle expected value, weaken or drop a compared cell, or add a skip.

## I/O & Edge-Case Matrix

The PHP twin is `class XtDouble` with untyped methods `bar($x = null, $y = null)` (real body returns `'real'`), `baz()` and `chain()`, a constructor recording its arguments, and `interface XtDoubleIface { function find($key); }`. The TS twins carry the same FQCNs. Every message is the Oracle's; the strings below are PHPUnit 13.4.3's templates.

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Met once | `m = createMock(XtDouble)`; `expects(once()).method('bar').with(1).willReturn(2)`; `m.bar(1)` | returns `2`; verify passes; kind-less count 2 (1 per mock + 1 per constrained arg) | none |
| Unmet once | the same, no call | verify throws | `ExpectationFailedException`: `XtDouble::bar() was expected to be invoked once but was never invoked.` |
| Over-count | `expects(once())…`; `m.bar(1)` twice | the 2nd call throws at once | `ExpectationFailedException`: `XtDouble::bar(1) was not expected to be called more than once, actually called 2 times.` (exact text from the Oracle) |
| never | `expects(never()).method('bar')`; `m.bar()` | throws at the call | `…was not expected to be called…` |
| exactly / atLeastOnce / any | `exactly(2)`, `atLeastOnce()`, `any()` with 0, 1, 2 calls | pass or fail as PHPUnit | Matcher::verify's message |
| Param mismatch | `with(1)`; `m.bar(2)` | throws at the call; verify re-throws it | `Expectation for XtDouble::bar() failed.\nParameter $x for invocation XtDouble::bar(2) does not match expected value.\nFailed asserting that 2 matches expected 1.` |
| Too few args | `with(1, 2)`; `m.bar(1)` | throws | `Parameter count for invocation XtDouble::bar(1) is too low.` |
| isInstanceOf | `with(this.isInstanceOf(XtDouble))` | matches by `instanceof` | IsInstanceOf's message |
| willReturn n | `willReturn(1, 2)` | 1, then 2, then throws | `Only 2 return values have been configured for XtDouble::bar()` |
| consecutive | `willReturnOnConsecutiveCalls(1, this.throwException(e))` | 1, then throws `e` | — |
| callback / self / map | `willReturnCallback((a, b) => a + b)`; `willReturnSelf()`; `willReturnMap([[1, 'a'], [2, 'b']])` | args spread; the double; strict-`===` row match on `count(args) === row.length - 1`, else `null` | — |
| throws | `willThrowException(new E('x'))` | the call throws `e` | — |
| Unconfigured call | `createMock(XtDouble).baz()` | `null` (ESC-4.7-1 item 2) | — |
| Unknown method | `method('nope')` | throws | `Trying to configure method "nope" which cannot be configured because it does not exist, has not been specified, is final, or is static` |
| method twice / with twice | a second `method()` or `with()` | throws | `Method name is already configured` / `Method parameters already configured` |
| Stub | `createStub(XtDouble)`; `method('bar').willReturn(3)` | `3`; not registered, never verified; no `expects` member | calling `expects` is a `TypeError` |
| Builder | `getMockBuilder(XtDouble).onlyMethods(['bar']).setConstructorArgs([1]).getMock()` | the real constructor ran with `[1]`; `baz` is real; `bar` is doubled; registered | `onlyMethods(['nope'])`: `Trying to configure method "nope" with onlyMethods(), but it does not exist in class "XtDouble"` |
| Builder, no ctor | `disableOriginalConstructor()` | the constructor never ran | — |
| Interface | `createMock(XtDoubleIface)` (TS: its contract token) | doubles `find`; unconfigured call returns `null` | — |
| addToAssertionCount | `this.addToAssertionCount(3)` only | the test passes; report `assertions: {}` | — |
| stringContains | `Assert.stringContains('A')` and `this.stringContains('A', false)` | `ignoreCase` defaults to **true** (PHPUnit passes `$case` as `ignoreCase`); `toString`/failure as the Oracle | — |
| assertArraySubset | a passing call | records kind `assertThat` once | — |

</intent-contract>

## Code Map

- **PHPUnit reference** (under `.../phpunit/src/Framework/`):
  - `TestCase.php`: `getMockBuilder` 1006, `createMock` 1044, `createPartialMock` 1100, `createStub` 1563 (static), `registerMockObject` 609, `addToAssertionCount` 619, `numberOfAssertionsPerformed` 631, matchers 829-904 (`any` 833, `throwException`), `runBare` 391-420, `verifyTest` 1235-1240.
  - `TestCase/MockObjectRegistry.php` 62-125: 1 per mock that has a non-`any` count rule, then `__phpunit_verify`; `handleExceptionFromInvokedCountRule`.
  - `TestCase/TestDoubleFactory.php`.
  - `MockObject/`:
    - `MockBuilder.php`, `TestDoubleBuilder.php` (defaults 38-41; `onlyMethods` 66, `setConstructorArgs` 163, `disable/enableOriginalConstructor` 175/187, `disableOriginalClone` 199).
    - `Runtime/AbstractInvocationImplementation.php` (`method` 73-92, `willReturn` 117-128, the map/callback/self/throw methods).
    - `Runtime/InvocationMockerImplementation.php` (`with` 30).
    - `Runtime/InvocationHandler.php` (`invoke` ~215-262, `verify` 267).
    - `Runtime/Matcher.php` (141 parameter rewrap; verify 208-245).
    - `Runtime/Rule/{InvokedCount,InvokedAtLeastOnce,AnyInvokedCount,Parameters,MethodName}.php` (InvokedCount 80-92; Parameters 55, 116, 128-227).
    - `Runtime/Invocation.php` (toString 120).
    - `Runtime/Stub/{ReturnStub,ConsecutiveCalls,ReturnCallback,ReturnSelf,ReturnValueMap,Exception}.php`.
    - `Runtime/Api/{Method,MockObjectApi,StubApi}.php`.
    - `Exception/*`.
  - `Assert.php:3237` (`stringContains`). `Constraint/String/StringContains.php`.
- `packages/assert/src/Framework/TestCase.ts`:
  - Header :1-15 (rewrite the delegation paragraph). `MOCKERY_MOCK` :25 (remove). `TestCaseState` :28-36 (add the MockObjectRegistry and nothing else). `createMock` :128-139 (replace).
  - Add `createStub` (static and instance), `getMockBuilder`, `createPartialMock`, `once`/`never`/`any`/`exactly`/`atLeastOnce`, `throwException`, `addToAssertionCount`, `numberOfAssertionsPerformed`.
  - Keep the anchors named in Always.
- `packages/assert/src/declarations/portedTest.ts:124-174` `runLifecycle`: call `state.mockObjects.verify()` inside the try, right after the `assertWasRaised` block (:144-146) and only when the body did not throw, as `verifyTest` does. Output and tearDown follow unchanged.
- `packages/assert/src/declarations/AssertionCounter.ts`:
  - Add an exported internal `addToAssertionCount(n)` that increments a kind-less count in the current context. A no-op outside one; it throws `TypeError` on a non-integer or negative `n`.
  - `runCounted` adds it to `total` only, leaving `assertions` unchanged.
  - `Declarations.ts:88-93` (zero-assertions and `expectNotToPerformAssertions`) already reads `total`.
- `packages/assert/src/Framework/Constraints.ts:619` `StringContains`: add `(needle, ignoreCase = false, ignoreLineEndings = false)` as in PHPUnit (lowercased needle, `Encoding ignored`).
- `packages/assert/src/Framework/Assert.ts`:
  - :344-345 records `"assertThat"` instead of `"assertArraySubset"`. Keep the method on Assert (ESC-4.3-1 item 15).
  - Add `static stringContains(string, case = true)` next to the factories at :471-485, and add it to `MIRRORED` (:738-748).
  - `ASSERTIONS` (:657-709) stays as it is.
- `packages/assert/src/index.ts:38-98`: export `MockBuilder` plus the `MockObject`, `Stub`, `InvocationMocker` and `InvocationStubber` types. Extend XT-assert-3's sorted list (`tests/xaravel/comparison.test.ts:240`).
- **Contract tokens:** read the doubled methods of a symbol target the way Mockery does (`packages/mockery/src/Mockery/Container.ts:194-198`, `Mock.ts:67-134`, `Symbol.for('xaravel.contract.methods')`; ESC-4.5-1 item 3). Re-implement that reading in assert. Do not import mockery.
- **Class names in messages:** the target's `Symbol.for("xaravel.class.fqcn")` static, else its JS `name`; for a token, its `description`.
- **Tests (template: 4.4's harness):**
  - `packages/assert/tests/xaravel/expectations.test.ts`: `runFixture` :213-250, `oracleOutputs`, `lifecycleMismatches` :253-278, XT-assert-11 :280-298.
  - XT-assert-13 :443-468, with `fixtures/mock.fixture.ts`.
  - `expectation-cells.ts`: `REQUESTS` :519-524, PHP helpers `xt_cell44`/`xt_expect` :80-84, cell shape :18-19.
  - `oracle-values.ts`: `readRequests` :153, `readSignedFixture` :173, `decode` :107.
  - `assertions.test.ts:101-104` and `fixtures/assertions.fixture.ts:30-57` (XT-assert-8).
- **Oracle:**
  - `tools/oracle/evaluate.php`: an `XT-` id is bound to `BareTestCase` (:291, :451); `withTestCase` is at :307-339. No `runBare` runs, so a cell verifies itself. Never return a double as a value (encoder :211).
  - `tools/oracle/request.ts:157,172` `makeRequest`/`renderRequests`: generate `4.7.jsonl` with a throwaway script outside the repo.
  - Local cross-check: `php tools/oracle/evaluate.php …` in a throwaway copy outside the repo. Never touch `oracle.pub`.
- `conformance/escalations/ESC-4.6-1.md`, `ESC-4.4-2.md`: the format for ESC-4.7-1. Check it with `bun run escalations:check`.
- `packages/assert/README.md:13,22`: the delegation text. `packages/assert/package.json:18-19`: the mockery devDependency, which XT-assert-13 keeps using.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/Framework/MockObject/**`: port the runtime. That is:
  - Generator: a `class extends Target`. Each doubled method is an own member of the generated prototype that calls the handler. Internals are symbol-keyed only. `expects` exists on mocks only.
  - `MockBuilder`, `Invocation`, `InvocationHandler`, `Matcher`.
  - Rules: `InvokedCount`, `InvokedAtLeastOnce`, `AnyInvokedCount`, `Parameters`, `MethodName`.
  - Stubs: `ReturnStub`, `ConsecutiveCalls`, `ReturnCallback`, `ReturnSelf`, `ReturnValueMap`, `Exception`.
  - `InvocationStubber`/`InvocationMocker`, and the `Exception/*` classes the ported paths throw.
  - Rule details:
    - Name matching is case-insensitive.
    - Every matching matcher is invoked in order; the first return value wins; the last exception is rethrown and the first `AssertionFailedError` is kept for verify.
    - Parameter names come from the method's JS source when every parameter is a plain identifier (`$name`), else the index.
    - An unconfigured call returns `null`.
    - Constructor modes: `createMock`/`createStub`/`createPartialMock` never run the constructor; a builder runs the real constructor (with `setConstructorArgs`) unless `disableOriginalConstructor()` is called.
- `packages/assert/src/Framework/TestCase/MockObjectRegistry.ts` + `TestCase.ts` + `portedTest.ts` + `AssertionCounter.ts`: registration, verification and the kind-less counts, as the Code Map says. The kind-less counts are: 1 per verified mock with a count rule, 1 per constrained argument per matching invocation, and 1 per over-count failure thrown.
- `Constraints.ts`, `Assert.ts`, `index.ts`: `ignoreCase`, `stringContains`, the `assertThat` kind, and the exports.
- `conformance/oracle-requests/4.7.jsonl`: `php-expr` requests `XT-assert-15` (every double scenario in the matrix) and `XT-assert-16` (the matchers' `toString` and verify messages, `addToAssertionCount`, `stringContains`, `assertArraySubset`'s `Assert::getCount()` delta).
  - Each scenario runs on a fresh `new BareTestCase('xt')` through a setup helper `xt_case47(Closure)`. The helper catches the body's throwable as a 4.4-shaped cell, verifies through the bound `mockObjectRegistry`, and returns `[result, thrown cell, verify cell, numberOfAssertionsPerformed()]`.
  - `bun run oracle:story check 4.7` passes.
- `packages/assert/tests/xaravel/doubles.test.ts` + `double-cells.ts` (+ `fixtures/doubles.fixture.ts`):
  - XT-assert-15 compares every matrix scenario cell by cell against the Oracle. It also runs a child `bun test` fixture: a met `expects(once())` test passes with `assertions: {}`, an unmet one fails with PHPUnit's message, and a test whose only check is a mock with no expectation fails "zero assertions".
  - XT-assert-16 covers the matcher, `addToAssertionCount` (a child test with only it passes, `{}`), `stringContains` and `assertArraySubset` cells.
  - Fixture-free checks run first.
- `packages/assert/tests/xaravel/expectations.test.ts` + `fixtures/mock.fixture.ts`: rework XT-assert-13 to the superseding ruling (cite `decisions/ESC-4.4-2.md` item 6). With and without `@xaravel/mockery` loaded, `createMock(X)` returns a PHPUnit double that is `instanceof X` and has no `shouldReceive`. An unmet `expects(once())` fails with PHPUnit's message.
- `packages/assert/tests/xaravel/assertions.test.ts` / `fixtures/assertions.fixture.ts`: XT-assert-8 expects `assertThat` for `assertArraySubset`, citing `decisions/ESC-4.3-1.md` item 8.
- `packages/assert/README.md`: replace the delegation text.
- `conformance/escalations/ESC-4.7-1.md`: `trigger: contract`, `test_ids: [XT-assert-15, XT-assert-16]`, with the items in Design Notes.
- `stories/4.7.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`: status.

**Acceptance Criteria:**
- **AC 1 (XT-assert-15).**
  - Given the signed fixtures for `4.7.jsonl` and doubles made by `this.createMock(X)`, `this.createStub(X)` and `this.getMockBuilder(X)…getMock()`, when XT-assert-15 drives them with `expects`, `method`, `with`, `willReturn`, `willReturnCallback`, `willReturnMap`, `willReturnSelf` and `willThrowException`, then every return value, thrown exception (short class and message), verify outcome and kind-less count matches the Oracle's.
  - `createMock` never reads `globalThis[Symbol.for('xaravel.mockery.mock')]`.
- **AC 2 (XT-assert-16).**
  - Given `addToAssertionCount(n)`, `stringContains`, `assertArraySubset` and `once()`, `never()`, `any()`, `exactly(n)`, `atLeastOnce()`, when they are used, then each matches the Oracle.
  - `assertArraySubset` records `assertThat`.
  - A Ported Test whose only count is kind-less passes with an empty kind multiset, as the Inventory records it.
- Both ACs are met conditionally on ESC-4.7-1's ruling (Epic 4 lesson).

## Spec Change Log

- 2026-10-18, implementation. Local unsigned Oracle runs (PHP 8.5.11 against `/tmp/xaravel-inv/framework`) settled six points the spec left open or got wrong. No compared cell was weakened.
  - **The cell helper's TestCase.** `xt_case47` runs on `new XtCase47('testDouble')`, a `TestCase` subclass the setup declares, not on `new BareTestCase('xt')`. `BareTestCase` is final, and with a test method that does not exist, PHPUnit's metadata parser fails `assert(method_exists($className, $methodName))` in `MockObjectRegistry::verify` and in `any()`.
  - **Omitted arguments.** PHPUnit's generated method passes every declared parameter, so `bar(1)` on `bar($x = null, $y = null)` is `XtDouble::bar(1, null)`. The matrix's "Too few args" row is therefore `Parameter $y … Failed asserting that null matches expected 2.`, and "Parameter count … is too low" comes from `baz()` with `with(1)`. The port passes an omitted declared argument as `null`.
  - **`willReturnMap` rows.** The local Oracle run shows PHP pads `[[1, 'a']]` to `bar`'s two parameters, so `bar(1)` returns `'a'`. The port normalizes rows as `normalizeValueMap` does, with `null` as each default, instead of leaving them unpadded. ESC-4.7-1 item 2 records this.
  - **Over-count counting.** `handleExceptionFromInvokedCountRule` counts any `ExpectationFailedException` whose first frame is `InvokedCount`, including a direct `exactly(n)->verify()`. The port marks every exception `InvokedCount` throws.
  - **PHPUnit 13 rules the matrix does not list.** These are ported because the local Oracle run shows them: `MethodParametersAlreadyConfiguredForAnotherMatcherException` (`with()` on two matchers of one method), and `MethodNameNotConfiguredException` from `willReturn()` before `method()` and from verify.
  - **Contract tokens.** ESC-4.7-1 gains item 5. A token double reads its method names from `token[Symbol.for('xaravel.contract.methods')]`, but it has no parameter names, and a bare symbol has no method list.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 37 findings — high 0, medium 9, low 18, false 7, maybe-false 3
- findings:
  - Blind Hunter
    - `[low]` `defer` assertArraySubset records `assertThat` before its argument checks, though Laravel throws before calling assertThat. The move was tried and reverted: `tools/assert-coverage/coverage.ts` (`recordsAssertion`) probes each assertion with no arguments and needs a recorded kind, so the report showed `missing assert: assertArraySubset` and XT-assert-14 failed. The fix needs an `OUTCOME_PROBES` entry in `tools/**` (Protected, outside this Story). It is recorded in `deferred`.
    - `[medium]` `patch` Doubles made without a constructor run no field initializers (fields read `undefined`), and twins mask it with `?? null` — documented in ESC-4.7-1 item 2 and the README; each `?? null` cites it. Grouped with E3, E4, E7.
    - `[medium]` `patch` A partial mock's real method that reads `#private` fields throws — same root cause and fix as the row above.
    - `[low]` `patch` ESC-4.7-1 item 2 calls unsigned local Oracle runs "signed" — wording corrected. The `review` status while fixtures are unsigned is the established flow (Story 4.6); CI signs them on the PR.
    - `[false]` `reject` The code adopts ESC-4.7-1's proposals before a ruling — the AGENTS.md rule was followed: the Escalation is raised, DIV-6 is within DIV-1..12, and the ACs are recorded as conditional (Epic 4 lesson).
    - `[medium]` `patch` `parameterInfo` drops whole lists to `fn.length` for `x = null`, `...rest` and trailing commas — top-level parsing added, plus a default-parameter twin check. Grouped with E1, E2, V1.
    - `[low]` `patch` `StringContains.ignoreLineEndings` has no caller and is untested — removed. Grouped with V-other1.
    - `[low]` `patch` The `method` guard is case-sensitive — now lowercased. The `expects` collision part is rejected: it would need a new guard, and it is unlikely (no Upstream class has an `expects` method).
    - `[low]` `reject` Unused `clear()`, the stored `type`, `hasParametersRule` and the no-op `disableOriginalClone` — no caller diverges. They are PHPUnit-shaped surface for the notice port, and `disableOriginalClone` is called by `createPartialMock`.
    - `[low]` `reject` The request file can't be regenerated from the repo — same convention as Stories 4.4 and 4.6. The test detects drift between cells and the committed line.
    - `[low]` `patch` XT-assert-13's comment says XT-assert-15 pins the `XtService::run` message — comment corrected. XT-assert-13's subject is the absence of delegation; the message template is pinned by XT-assert-15 on XtDouble.
    - `[low]` `patch` A vacuous `toThrow(TypeError)` on calling `undefined` — deleted.
    - `[maybe-false]` `defer` A token double assumes the token's brand symbol — Epic 10 tokens don't exist yet. Settle it when Story 10.1 defines the brand (ESC-4.7-1 item 5). Grouped with E5.
    - `[low]` `patch` `willReturnMap` throws an invented TypeError for a Constraint method name — now returns the map unnormalized, as PHPUnit does.
    - `[low]` `reject` Extra counts after a non-PHPUnit error in `Parameters` — only reachable when a constraint throws a non-assertion error. The fix adds branches.
    - `[low]` `reject` `readTarget` runs three times per builder — a performance nit on test setup, with no behaviour change.
  - Edge Case Hunter
    - `[medium]` `patch` E1: default parameters make `parameterInfo` fall back to `fn.length` — grouped with B6.
    - `[medium]` `patch` E2: `willReturnMap` truncates full-arity rows when the count is too low — grouped with B6. It is fixed by the parameter parsing.
    - `[medium]` `patch` E3: field initializers are skipped without a constructor — grouped with B2.
    - `[medium]` `patch` E4: `#private` access crashes in partial mocks — grouped with B2.
    - `[maybe-false]` `defer` E5: a token without an FQCN brands as `class@anonymous` — grouped with B13.
    - `[false]` `reject` E6: a target function without a prototype gives a raw TypeError — that is a loud failure on invalid input, which is correct behaviour.
    - `[low]` `patch` E7: built-in subclasses lose internal slots on `Object.create` — documented with B2. It needs no code change.
    - `[maybe-false]` `defer` E8: symbol-keyed methods (`[Symbol.iterator]`) stay real on doubles — this depends on how later Stories port `IteratorAggregate`. If true, the severity is medium; settle it with Story 14.x's `Collection` iteration port.
    - `[low]` `reject` E9: a constructor that freezes `this` or returns another object — unlikely, and it fails loudly in `defineProperty`.
    - `[low]` `patch` E10: the case-insensitive `method` guard — grouped with B8.
    - `[low]` `patch` E11: `addToAssertionCount` rejects negatives that PHPUnit accepts — it now accepts any safe integer.
    - `[false]` `reject` E12: the spec names `BareTestCase` but the code uses `XtCase47` — the Spec Change Log already records why.
    - `[false]` `reject` E13: the orphaned `xaravel.mockery.mock` hook — it is already routed to Story 4.8 by ESC-4.7-1 item 4, since this Story may not edit `packages/mockery/**`.
  - Verification Gap
    - `[medium]` `patch` V1: no test covers the `parameterInfo` fallback — grouped with B6. A default-parameter twin was added.
    - `[medium]` `patch` V2: mock verification after a matched expected exception is unpinned — a declared fixture test was added, and XT-assert-15 asserts its failure message.
    - `[low]` `patch` V-other1: `ignoreLineEndings` is dead code — grouped with B7.
    - `[low]` `patch` V-other2: the lifecycle failure checks run only after the fixture comparison — moved before it.
  - Intent Alignment
    - `[low]` `reject` I1: the tests use synthetic twins, not Upstream call sites — the Story is a grader Story (`test_ids: []`). Ported Upstream tests belong to their Components' Stories.
    - `[false]` `reject` I2: the ACs hold only conditionally on ESC-4.7-1 — this is by design and recorded in the ACs (Epic 4 lesson).
    - `[false]` `reject` I3: the fixtures are unsigned — `oracle.yml#story` signs them on the PR (the Story 4.6 precedent). A missing fixture fails rather than skips.
    - `[false]` `reject` I4: the kind-less count reaches Story 5.3's report reading — the report shape is unchanged (four keys), and it is raised as ESC-4.7-1 item 1.

## Design Notes

**Counting.** PHPUnit's `numberOfAssertionsPerformed` adds `addToAssertionCount` to `Assert::getCount()`. Mock verification counts only through `addToAssertionCount`. The Inventory records kinds only for outermost `Assert::assert*` calls (`tools/baseline/recorder.php:11-17`), so a mock-only or `addToAssertionCount`-only test has `"assertions":{}`. 425 such Inventory entries pass. A kind-less count reproduces that exactly: it counts toward FR-113's zero-assertions rule and toward `expectNotToPerformAssertions`, but it never appears in the report's `assertions`. The report keeps its four keys.

**Dispatch.**

```ts
const m = this.createMock(XtDouble);            // Object.create(Double.prototype): no ctor
m.expects(this.once()).method("bar").with(1).willReturn(2);
m.bar(1);                                       // handler.invoke(new Invocation("XtDouble", "bar", [1], m))
// after the body: registry.verify() → addToAssertionCount(1); matcher.verify()
```

**Escalation (ESC-4.7-1).**
1. **The kind-less count contract.** It is defined as in Counting above; Story 5.3 reads reports unchanged.
2. **Proposed DIV-6 clause (no PHP run-time types or reflection).**
   - With no declared return types, an unconfigured call returns `null` instead of a generated value (`''`, `0`, a stub of the return type, …). `willReturn` is not type-checked, and `Invocation::toString` has no `: <type>` suffix.
   - `willReturnMap` rows are not padded with default parameter values.
   - Parameter names come from JS source text.
   - "final or static" never applies.
   - Ported Tests that rely on generated return values configure them, as an `adapted:DIV-6` change.
3. **Notices and deprecations are not emitted.** This covers the no-expectations notice, which the `#[AllowMockObjectsWithoutExpectations]` attribute (102 Upstream lines) silences, the `any()` deprecation, and `with()` without `expects()`. Proposed: accept this as an outcome-neutral, message-only difference, like ESC-4.4-2 item 3.
4. **Two leftovers outside this Story's paths.**
   - `packages/mockery/src/Mockery.ts:200-227` still installs `xaravel.mockery.mock`, and `packages/mockery/tests/xaravel/mockery.test.ts:141-180` pins it. Proposed owner: Story 4.8 (`component: mockery`) removes both.
   - `epics.md:2110-2112` (Story 4.4's AC "delegates to `@xaravel/mockery`") contradicts the ruling. Proposed: the Maintainer reconciles it with `epics.md:114`.

## Verification

**Commands:**
- `bun test packages/assert` -- expected: all pass once the fixtures are signed. Before that, only the fixture-reading cells of XT-assert-15/16 fail, naming the missing fixture.
- A local unsigned Oracle run in a throwaway copy outside the repo, then the tests against it -- expected: 0 mismatches.
- `bun run oracle:story check 4.7`, `bun run escalations:check`, `bun run assert:coverage`, `bun run mockery:coverage`, `bun run ownership:check`, `bun run graph:check`, `bun run scaffold:check` -- expected: pass.
- `bun run typecheck`, `bun run lint`, `bun test` -- expected: no new failures.

## Auto Run Result

Status: done

- **Change:** PHPUnit 13.4.3's test doubles are ported into `@xaravel/assert`.
  - `createMock`, `createPartialMock` and `createStub` (static and instance) are covered, as is `getMockBuilder(…)` with `onlyMethods`, `setConstructorArgs` and `disable/enableOriginalConstructor`, ending in `getMock()`.
  - The double's API is `expects`, `method`, `with` and the `will*` family (`willReturn`, `willReturnOnConsecutiveCalls`, `willReturnCallback`, `willReturnMap`, `willReturnSelf`, `willThrowException`, plus `throwException`).
  - The matchers are `once`, `never`, `any`, `exactly` and `atLeastOnce`.
  - Verification runs in `portedTest`'s lifecycle (`verifyTest`).
  - A kind-less assertion count is added (`addToAssertionCount`, `numberOfAssertionsPerformed`).
  - `stringContains` is added, with PHPUnit's `$case`→`ignoreCase` quirk.
  - `assertArraySubset` now records `assertThat`.
  - `createMock` no longer reads Mockery's global (`decisions/ESC-4.4-2.md` item 6).
  - ESC-4.7-1 records five contract items.
- **Files:**
  - `packages/assert/src/Framework/MockObject/**`: the port, which includes Generator, MockBuilder/TestDoubleBuilder, ConfigurableMethod, Invocation, InvocationHandler, Matcher, the rules, the stubs, the interfaces and 8 exceptions.
  - `src/Framework/TestCase/MockObjectRegistry.ts`: registration and verification.
  - `src/Framework/TestCase.ts`: the double API, matchers and counting.
  - `src/declarations/{AssertionCounter,portedTest}.ts`: the kind-less count and the verify step.
  - `src/Framework/{Assert,Constraints}.ts`: `stringContains`, `ignoreCase`, and the `assertThat` kind.
  - `src/index.ts`: the `MockBuilder` export and the types.
  - `tests/xaravel/{doubles.test.ts,double-cells.ts,fixtures/doubles.fixture.ts}`: XT-assert-15 and XT-assert-16.
  - `tests/xaravel/{expectations.test.ts,fixtures/mock.fixture.ts}`: XT-assert-13 reworked to the ruling.
  - `tests/xaravel/{assertions,comparison}.test.ts`: the XT-assert-8 kind and the XT-assert-3 export list.
  - `packages/assert/README.md`.
  - `conformance/oracle-requests/4.7.jsonl`: 3 requests.
  - `conformance/escalations/ESC-4.7-1.md`.
  - `stories/4.7.md` and `sprint-status.yaml`.
- **Review:** 37 findings.
  - Patched: 3 medium entries and 9 low.
    - Medium: parameter parsing with defaults and variadics, plus a default-parameter twin; the verify-after-expected-exception fixture test; documentation of constructor-less doubles in ESC-4.7-1 item 2.
    - Low: wording, the case-insensitive `method` guard, `willReturnMap` with a Constraint name, negative `addToAssertionCount`, removal of `ignoreLineEndings`, the XT-assert-13 comment, the vacuous check, and lifecycle checks moved before the fixture comparison.
  - Deferred: 3.
    - Token brand and symbol-keyed methods (both maybe-false, medium if true).
    - `assertArraySubset`'s record position, which needs a `tools/assert-coverage` probe change.
  - Rejected: the rest, with reasons in the Review Triage Log.
- **Follow-up review recommended:** true, since 3 medium entries were patched on a first pass. The unverified risk is the new top-level `parameterInfo` parser (comments, templates, destructuring). It is checked against XtDouble's results and direct cases only, never against real Upstream-shaped TS ports.
- **Verification:**
  - These pass: `typecheck`, `lint`, `oracle:story check 4.7` (3 accepted), `escalations:check`, `assert:coverage` (0 missing), `mockery:coverage`, `ownership:check`, `graph:check` and `scaffold:check`.
  - `bun test`: 155 pass and 2 fail. The 2 are XT-assert-15 and XT-assert-16, and their only problems are the 3 missing signed fixtures, which `oracle.yml#story` signs on the PR.
  - The implementer's throwaway copy, with locally signed fixtures, matched every cell against real PHPUnit 13.4.3 on PHP 8.5.11. That copy was never committed, and `oracle.pub` was untouched.
- **Residual risks:**
  - ESC-4.7-1 is unruled, so both ACs are conditional on it: the kind-less count, the DIV-6 clause, the notices, the mockery leftover with the `epics.md:2110` reconciliation, and the token protocol.
  - In-repo Oracle fidelity is unproven until the fixtures are signed.
  - Constructor-less doubles skip JS field initializers.
