---
title: 'Story 9.11: Grader follow-ups to the runtime value model'
type: 'feature'
created: '2026-10-22'
baseline_revision: 'f6108a175d3a9476875796b356a7ed7c209e9e1e'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.11.md'
  - '{project-root}/PORTING.md'
  - '{project-root}/decisions/ESC-4.1-1.md'
  - '{project-root}/decisions/ESC-4.3-1.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/conformance/escalations/ESC-9.11-1.md'
  - '{project-root}/decisions/ESC-9.11-1.md'
  - '{project-root}/decisions/ESC-9.11-2.md'
  - '{project-root}/decisions/ESC-4.7-1.md'
  - '{project-root}/decisions/ESC-4.8-1.md'
  - '{project-root}/decisions/ESC-5.3-3.md'
  - '{project-root}/decisions/DIV-6.md'
  - '{project-root}/packages/runtime/docs/php-values.md'
  - '{project-root}/packages/runtime/docs/exceptions.md'
warnings: [multiple-goals, oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 9.5 gave the runtime a float marker, but `@xaravel/assert` still treats every integral number as a PHP int, so `phpStrictEquals(1, float(1))` is false only by accident (the marker is an object), `float(1) === float(1)` is false, and `float(1) == 1` is false where PHP says true (ESC-4.1-1). And Laravel's `TestResponseAssert::appendMessageToException` rewrites a caught `ExpectationFailedException`'s message through reflection, which the grader's fixed `#message` does not allow (ESC-4.3-1 item 11). The grader's exceptions extend JS `Error`, not the runtime's SPL classes, and `ExceptionComparator` takes every JS `Error` (ESC-4.3-1 item 10, DIV-9.8). PHPUnit test doubles ignore the declared signature (ESC-4.7-1 item 2). And an assertion that fails after its test has ended throws into whichever test runs then (ESC-5.3-3).

**Approach:** Five parts, all inside `packages/assert/**`, all through `Symbol.for` globals (no runtime import):
1. **AC1, XT-assert-17.** Read the float marker by its `Symbol.for('xaravel.php.float')` brand wherever the grader branches on numbers (ESC-9.11-2: only the marker makes an integral number a float). Re-apply `spec-9-11-attempt-1.patch` without its `-0` changes. Verify against a signed Oracle `===`/`==` matrix.
2. **AC2, XT-assert-18.** Re-parent the grader's exceptions lazily onto the runtime's SPL classes from `Symbol.for('xaravel.php.classes')`, and make `ExceptionComparator` read the `\Exception` split.
3. **AC3, XT-assert-19.** Add a protocol method that rewrites a PHPUnit exception's message (in the patch).
4. **AC4, XT-assert-20.** Take the declared return type, parameter names and defaults from `Symbol.for('xaravel.api.signature')` rows.
5. **AC5, XT-assert-21.** Report an assertion that fails after its counts have ended to `Symbol.for('xaravel.harness.late')` instead of throwing.

## Boundaries & Constraints

**Always:**
- Edit only `packages/assert/**`, this spec, the Story's status lines (`sprint-status.yaml`, `stories/9.11.md` `status:`), `conformance/oracle-requests/9.11.jsonl` (plus the fixtures the `xaravel-oracle` bot signs for it) and the Story's own Escalations.
- Grader isolation (AD-2, XT-assert-3): nothing in `packages/assert/src` or `packages/assert/tests` imports `@xaravel/runtime` or any graded package. The marker is read by brand only: a value is a *marked float* when it is a non-null object whose `[Symbol.for('xaravel.php.float')]` is `true`; its value is `Number(v)`.
- **PHP types of numbers** (one shared helper, used everywhere; ESC-9.11-2): a `bigint` is an int; an unmarked `number` is an int when `Number.isSafeInteger(v)` (so an unmarked `-0` is an int, as since Story 4.1), else a float; a marked float is a float whatever its value. Every reader and printer (`===`, `gettype`, `IsType`, PHPUnit's exporter, `phpToString`, `var_export`, `serialize`) reads an unmarked `-0` as the int `0`, so none of the attempt's `-0` changes survive, and XT-mockery-10 stays green unchanged. A marked `float(-0)` is the float `-0.0` everywhere.
- **`===`** (`phpStrictEquals`, so `assertSame`, `IsIdentical`, `willReturnMap` rows): two numeric values are identical only when both are ints with equal values, or both floats with `a === b` on their numeric values (`NAN` never; `0.0 === -0.0` true, as PHP). So `1 === float(1)` is false, `float(1) === float(1)` (two instances) is true, `float(0) === float(-0)` is true, `float(0) === 0` and `-0 === float(0)` are false. A marked float is never identical to a non-number.
- **`==`, ordering, and every other number reader** in `packages/assert/src` treat a marked float exactly as the plain `number` `Number(v)` with PHP type float: `phpLooseEquals`, `PhpOrder`, `gettype` (`"double"`), `isFloat`/`isInt`/`isScalar`/`isNumeric`/`toNumber` in `PhpValues.ts`, `IsType` `float`/`int`, `ScalarComparator`, `NumericComparator`, `ArrayComparator`, the exporter and `VarExport` (an integral float exports as `1.0`, as PHPUnit's exporter and `var_export` do). Every `typeof … === "number"` branch in `packages/assert/src` is checked against this rule.
- **Message rewrite protocol (AC3).** `PHPUnit\Framework\Exception.prototype` (so every PHPUnit exception) gets a non-enumerable method under `Symbol.for('xaravel.assert.setMessage')`. Called with a string, it sets what `getMessage()` returns to that string, and sets the JS `message` to that string followed by whatever suffix the class adds (`ExpectationFailedException`'s `\n--- Expected\n…\n+++ Actual\n…`); code, previous, cause and the comparison failure are unchanged; it returns `null`. A non-string argument throws a JS `TypeError` naming the protocol. The exported classes and prototypes stay frozen (the method is defined before freezing).
- **Carried review rows (attempt 1):** a marked float is read as a number by `TestCase::exactly()`, `Exception`'s `code`, `ExceptionCode` and `arrayKey` (`float(1)` key is int key `1`, as PHP); `loose()` and `Ordering.compare()` pass the PHP type through to the number-to-string comparison, so `float(1e15)` stringifies as PHP's float (`1.0E+15`) against a non-numeric string; `shortenedExport` keeps the float form (`1.0`) in ArrayComparator diffs.
- **SPL parents (AC2).** The runtime publishes `globalThis[Symbol.for('xaravel.php.classes')]` (a frozen map from PHP name to class: `Exception`, `Error`, `RuntimeException`, `LogicException`, `InvalidArgumentException`, … `stdClass`) when one of its package entries loads. When the map is published, every grader exception class whose PHP parent chain reaches an SPL class has that runtime class in its JS prototype chain: PHPUnit's `Exception` (so `AssertionFailedError`, `ExpectationFailedException`, `SkippedWithMessageException` and the MockObject exceptions) under `RuntimeException`, as `PHPUnit\Framework\Exception extends \RuntimeException`; each other grader exception (`EmptyStringException`, Laravel's `InvalidArgumentException`, `UnknownClassOrInterfaceException`, `ComparisonFailure`, the `util/Json` errors) under the SPL class its PHP source extends, each cited in a comment. The link is lazy: an unexported, unfrozen base class sits between each such class and `Error`, and on first construction (and at module load when the map is already there) its constructor and prototype are re-parented onto the runtime class. Construction then runs the runtime constructor, so arguments passed up must be ones it accepts (string message, int code, `Error | null` previous). `getMessage()`, `getCode()`, `getPrevious()`, the JS `message` and `name`, the frozen exports and XT-assert-12's behaviour are the same with and without the map. With no map, the chain is today's.
- **`ExceptionComparator` (AC2):** with the map, `accepts` is `expected instanceof map.Exception && actual instanceof map.Exception`, so a runtime `\Error` or a plain JS `Error` goes to the next comparator, as PHP sends `\Error` to `ObjectComparator`. With no map, today's `instanceof Error` stays (XT-assert-8's `XtException` operands).
- **`expectException` (AC2), as PHPUnit does it:** with the map, `classOrInterface(map.RuntimeException)` is accepted. The expectation's class check (`Constraint\Exception`, `assertInstanceOf`) matches a PHPUnit failure, because a failure *is* a `\RuntimeException`. A test that calls `expectException(map.RuntimeException)` and then fails an assertion still fails with that assertion failure, because `ExceptionExpectation::shouldBeVerifiedFor` lets a `PHPUnit\Framework\Exception` through unless a PHPUnit exception class is expected (PHPUnit's `TestCase/ExceptionExpectation.php`). That behaviour stays as it is.
- **Declared signatures for PHPUnit doubles (AC4, ESC-4.7-1 item 2, DIV-6.4).** `globalThis[Symbol.for('xaravel.api.signature')]`, when it is a function, is `(fqcn, member) => row | null`. The row has the `conformance/api-surface/*.jsonl` method shape (`parameters[{name, type, nullable, default, optional, variadic, byRef}]`, `returns`, `nullable`). A row exists only for a method's declaring class, so the lookup is asked for the class in the target's prototype chain (or the contract token) that declares the method, by its `Symbol.for('xaravel.class.fqcn')`. Read the global at call time, never cache it, and follow Mockery's `SafeDefaultResolver.signatureOf`. With a row:
  - **Names:** parameter names are the row's names.
  - **Invocation class:** `Invocation`'s class name is the declaring class, as `DoubledMethod.php:108`.
  - **Return type:** `Invocation` carries the row's return type as PHPUnit's `Invocation` constructor gets it from sebastian/type. `self` and `parent` resolve to the declaring class's FQCN and its parent's; `static` stays as it is; a leading `?` is stripped and the call is marked nullable. `toString()` appends `: <type>` when the type is non-empty.
  - **Generated value:** an unconfigured call returns PHPUnit's value, following `Invocation::generateReturnValue` and `ReturnValueGenerator::generate` (PHPUnit 13.4.3) in their order:
    - `never` throws `NeverReturningMethodException`;
    - nullable, `''`, `null`, `mixed` or `void` gives `null`;
    - `true` gives `true`; `false` or `bool` gives `false`;
    - `float` gives `0`, then `int` gives `0` (see the float note below);
    - `string` gives `''`; `array` gives `[]`;
    - `static` gives a new double of the same class that shares the configurable methods;
    - `object` gives `new map.stdClass()`;
    - `callable` or `Closure` gives an empty function returning `null`;
    - `Traversable`, `Generator` or `iterable` gives an empty generator;
    - a single class name gives `createStub` of the class that `globalThis[Symbol.for('xaravel.class.lookup')]` resolves (Mockery's `support/classes.ts` protocol). The declaring class itself, and the target, resolve without the lookup.
    - Anything else (a union of names, an intersection, an unresolvable name, `object` with no class map) throws `PHPUnit\Framework\MockObject\RuntimeException` with PHPUnit's message: `Return value for C::m() cannot be generated[ because the declared return type is a union| … an intersection], please configure a return value for this method`. For a single class name that cannot be built, the message is `Return value for C::m() cannot be generated: <reason>`, and the reason names the missing protocol. No surface row declares an intersection (0 of all rows), so intersection doubles are not built.
  - **Defaults:** an omitted argument whose parameter has a row `default` is padded with that value, and so is a short `willReturnMap` row (only indices that have a default, as PHPUnit's `normalizeValueMap`). A parameter with no default is not padded, as PHPUnit's generated method. A default's PHP source text is evaluated as follows:
    - literals: `null`, `true`, `false`, ints (outside the safe range as `bigint`), floats as plain numbers, single-quoted strings, double-quoted strings without `$` or escapes other than PHP's simple ones, and list arrays of these (`[]`, `['*']`, `[2, 100]`);
    - the PHP constants the surface uses: `INF`, `PHP_EOL`, `PHP_INT_MAX`, `SORT_REGULAR`, `MB_CASE_FOLD`, each with its PHP value.
    - Anything else (a keyed array, a class constant, an enum case, `new …`) is evaluated only when that argument is actually omitted, and then throws `PHPUnit\Framework\MockObject\RuntimeException`: `Default value <text> of parameter $<name> of C::m() cannot be evaluated by @xaravel/assert; pass the argument`. It is never padded with `null`.
  - **No row, or no lookup:** today's behaviour stays: `null` return, names from the JS source, `null` defaults, no suffix. XT-assert-15 and XT-assert-16 stay green unchanged.
  - **`willReturn` is not type-checked against the row.** This is the Story's decision for ESC-4.7-1 item 2's open question. AC4 does not ask for it, and type-checking a class type needs run-time class resolution the grader has only through optional protocols. The README records the decision.
- **Floats the grader makes:** the grader cannot create the runtime's marker (AD-2), so a generated `float` return and a float default are plain numbers. An integral one therefore reads as an int. Under DIV-9.4, a Ported Test whose assertion depends on that value being a float configures it with the marker (`willReturn(float(0))`, or passes the argument). The README says so.
- **Late failures (AC5, ESC-5.3-3).** `AssertionCounter` gains an internal query for whether the current async context's counts have ended. When they have:
  - an `Assert` method (static or instance, every `assert*`, `assertThat`, `fail`) that would throw an `AssertionFailedError` (or a subclass) does not throw. The failure has already been reported to `xaravel.harness.late` by `recordAssertion`; the method makes sure a report was sent (the harness ignores duplicates) and returns `null`;
  - an `ExpectationFailedException` that a PHPUnit double's invocation rules raise behaves the same: it is reported with kind `null` and not thrown, and the doubled call returns `null`.
  - `markTestSkipped`, `markTestIncomplete` and argument `TypeError`s still throw.
  - Outside a counted context, or before the counts end, nothing changes.
  - Update the comments that describe the old gap (`AssertionCounter.ts:23-24`, `declarations/Declarations.ts:20-28`).
- Docs: `packages/assert/README.md` (or its docs page, wherever the grader documents its protocols) states:
  - the float rule, including that an unmarked `-0` is an int, unlike the runtime's `isFloat(-0)`, and the DIV-9.4 note;
  - the `xaravel.assert.setMessage` protocol, with the Laravel call it serves;
  - the SPL re-parenting and when it applies;
  - the signature-driven double behaviour, the default-evaluation rule and the `willReturn` decision;
  - the late-failure rule.
- Xaravel Test conventions of `packages/assert/tests/xaravel/*.test.ts`: plain `bun:test`, header naming the Story, the F-10 note (no Upstream test inputs: each test is the follow-up of the Escalation it cites, ESC-4.1-1, ESC-4.3-1, ESC-4.7-1, ESC-5.3-3), signed fixtures only, a missing or unsigned fixture fails, never skips, subprocesses with a `timeout`, fixture-free rows before fixture-dependent ones. A test that needs the runtime loads it only in a child `bun` process (XT-assert-3), and a test that needs a global protocol installs a fake with a configurable define and restores it (as `packages/mockery/tests/xaravel/double-scenarios.ts:24-38`).

**Never:**
- Edit `packages/mockery/**`, `conformance/oracle-requests/4.1.jsonl`, XT-assert-1's expected request count, `decisions/**`, `PORTING.md`, `stories/**` beyond the status line, `tools/**` or another package.
- Change Mockery's exceptions or anything in `packages/mockery/**` (Story 9.12), `docs/**`, `conformance/harness/**` or `conformance/tests/**`; import `conformance/harness/signatures.ts` or any runtime file from `src/`.
- Add a named export to `@xaravel/assert`'s index for the protocol (graded code cannot import the grader); add `undefined` returns; use `JSON.stringify` on PHP values in `src/`.
- Create a marker of its own in `src/`: the grader only reads the runtime's brand.
- Make an unmarked `-0` a float anywhere, or pad an omitted argument with `null` when its row has a default.
- Edit an existing test's expected value; XT-assert-1..16 and the mockery suite pass unchanged.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Oracle matrix (XT-assert-17) | request `XT-assert-17` in `9.11.jsonl`: `$v` of ints, integral and non-integral floats (`0`, `1`, `-1`, `100`, `0.0`, `-0.0`, `1.0`, `-1.0`, `100.0`, `9007199254740992.0`, `0.5`, `INF`, `NAN`), numeric strings (`"1"`, `"1.0"`), `true`, `null`; exprs `$v`, the `===` matrix, the `==` matrix | decoded with every PHP float as a test-local branded float object (the brand only, as `BrandedArray` simulates the array brand), each cell of `phpStrictEquals`/`phpLooseEquals` equals the Oracle's | missing/unsigned fixture fails |
| Real marker (XT-assert-17) | fresh `bun` subprocess from the repo root importing `float` from `packages/runtime/src/index.ts` and the grader from `packages/assert/src/index.ts` | `phpStrictEquals(1, float(1))` false; `float(1)`/`float(1)` true; `phpLooseEquals(float(1), 1)` true; `assertSame(1, float(1))` throws `ExpectationFailedException` with PHPUnit's message (`Failed asserting that 1.0 is identical to 1.` form, values exported as PHPUnit does); `assertSame(float(1), float(1))` passes; `assertEquals(1, float(1))` passes; `gettype` `double` | — |
| Unmarked -0 (XT-assert-17) | in-process, no runtime | `phpStrictEquals(0, -0)` true; `gettype(-0)` `integer`; PHPUnit export of `-0` is `0`; `assertSame(0, -0)` passes; `phpStrictEquals(-0, branded(-0))` false | — |
| SPL chain with map (XT-assert-18) | subprocess importing the runtime, then the grader; and a second one importing the grader first, then the runtime, then constructing | for every grader exception class in the table: an instance is `instanceof` its runtime SPL parent, `map.Exception`, `Error`, and not `map.Error`; `getMessage`/`getCode`/`getPrevious`/`message`/`name` as without the map; exports still frozen | — |
| SPL chain without map (XT-assert-18) | in-process, no runtime | `Object.getPrototypeOf(Exception.prototype)` reaches `Error.prototype` through the internal base only; XT-assert-12 unchanged | — |
| ExceptionComparator (XT-assert-18) | with map: two `map.RuntimeException`s; two `map.Error`s (`map.TypeError`); a `map.Exception` vs a plain JS `Error`; without map: two plain `Error`s | `accepts` true; false (falls to ObjectComparator); false; true | — |
| expectException (XT-assert-18) | with map: `new Constraint\Exception(map.RuntimeException)` on a caught `assertTrue(false)` failure; `assertInstanceOf(map.RuntimeException, failure)`; a TestCase body with `expectException(map.RuntimeException)` that fails `assertTrue(false)` | match; passes; the test fails with the `ExpectationFailedException`, as PHPUnit | — |
| Typed double, Oracle (XT-assert-20) | request `XT-assert-20` in `9.11.jsonl`: a PHP twin `XtTyped` whose methods declare `int`, `string`, `bool`, `?string`, `array`, `void`, `mixed`, `static`, `self`, `object`, `callable`, `iterable`, `true`, `int\|string` return types and parameters with literal defaults (`$a`, `$b = 2`, `$c = 'x'`, `$d = []`, `$e = null`); cells as `double-cells.ts`: unconfigured call results (shape and `gettype`), `with(…)` failure messages naming parameters and the `toString` suffix, `willReturnMap` with short rows, omitted arguments seen by `willReturnCallback` | TS twin with a fake signature lookup serving rows equal to `tools/oracle/api-surface.php`'s form of the twin; every cell equals the Oracle's | missing/unsigned fixture fails |
| Typed double, fixture-free (XT-assert-20) | `float` return; a non-literal default omitted vs passed; a class-typed return with and without `xaravel.class.lookup`; `never`; no lookup installed; a target with no row | `0` (`integer`, DIV-9.4 note); omitted throws the `MockObject\RuntimeException` default message, passed works; a stub of the looked-up class / `Return value for … cannot be generated: …`; `NeverReturningMethodException`; today's null behaviour; today's null behaviour | — |
| Late failure (XT-assert-21) | child `bun test` on a fixture with a fake `xaravel.harness.late` hook and fake report hook: test A leaves a timer that runs `assertTrue(false)` and `fail('x')` and a double call that breaks an `expects(never())` rule while test B awaits it | B passes (junit); the hook received `{id: A's id, kind}` for each; nothing is thrown out of the timer; a failing assertion inside a running test still throws | — |
| Rewrite (XT-assert-19) | caught failure of `assertSame("a", "b")` (an `ExpectationFailedException` with a comparison failure); `e[Symbol.for('xaravel.assert.setMessage')](e.getMessage() + "\n\n" + extra + "\n")`, Laravel's `appendMessageToException` text | `getMessage()` is the new text; JS `message` is the new text + the Expected/Actual suffix; `getComparisonFailure()`, `getCode()`, `getPrevious()` unchanged; returns `null`; works on a plain `AssertionFailedError` too (no suffix); class and prototype still frozen | non-string argument: JS `TypeError` |

</intent-contract>

## Code Map

- `packages/assert/src/comparison/PhpValues.ts:23-96` -- `isInt`/`isFloat` (`Number.isSafeInteger`), `gettype` (`:64`), `isScalar`, `isNumeric`, `toNumber`: the shared number helpers; put the marker reader and the PHP number type here.
- `packages/assert/src/comparison/PhpComparison.ts:278` (`numbersIdentical`), `:463` (`strict`), `:437` and `:93` (`isBuiltIn`: a marked float's chain reaches `Number.prototype`, so today it is "== only to itself"), `:507` (`phpStrictEquals`) -- the `===` and `==` paths.
- `packages/assert/src/comparison/PhpOrder.ts` -- PHP ordering; unwrap the marker.
- `packages/assert/src/Framework/Constraints.ts:46` (`IsIdentical`), `:250-256` (`IsType` float/int); `Framework/Assert.ts:90-110` (`assertThat`, `assertSame`).
- `packages/assert/src/comparator/{ScalarComparator,NumericComparator,ArrayComparator}.ts` -- `accepts`/`assertEquals` number branches (`ScalarComparator.ts:70`, `NumericComparator.ts:10-48`, `ArrayComparator.ts:25`).
- `packages/assert/src/exporter/Exporter.ts:117-118`, `exporter/VarExport.ts:37,90` -- number export (`isSafeInteger ? String : exportFloat`).
- `packages/assert/src/Framework/Exception/Exception.ts:11-47` -- `#message` (readonly), constructor; `Framework/ExpectationFailedException.ts` -- the JS `message` suffix; `Framework/AssertionFailedError.ts`.
- `packages/assert/src/index.ts:67-69` -- freezing of exported classes and prototypes.
- `packages/runtime/src/php/PhpFloat.ts` (read-only) -- the brand: a prototype getter `[Symbol.for("xaravel.php.float")]` returning `true` on a frozen `Number` subclass.
- `packages/assert/tests/xaravel/comparison.test.ts:18-37` (XT-assert-1 idiom), `:205-241` (XT-assert-3 isolation and frozen exports) -- keep both passing.
- `packages/assert/tests/xaravel/oracle-values.ts:72-150` -- `decodeFloat`, `decode`, `readRequests`, `readSignedFixture`, `matrixMismatches`, `LOOSE_EXPR`/`STRICT_EXPR`; add an option to decode floats as branded objects without changing XT-assert-1's decoding.
- `packages/assert/tests/xaravel/expectations.test.ts:452-480` -- the subprocess idiom (`Bun.spawnSync([process.execPath, …], { cwd: root })`).
- `_bmad-output/implementation-artifacts/spec-9-11-attempt-1.patch` -- attempt 1 (AC1, AC3): applies cleanly to `main`; apply it with `git apply`, then remove its `-0` changes (`PhpValues.ts` number type, and the `phpToString`/`VarExport`/serialize carve-outs that existed only to undo them) and fix the carried rows. Delete the patch file in this Story's PR (LESSONS, epic 2).
- `packages/runtime/src/php/phpClasses.ts:40-84` (read-only) -- the class map: frozen null-prototype object, 24 keys, installed by `installGlobal()` when `src/index.ts`, `php/index.ts`, `scope/index.ts` or `registry/index.ts` loads; skipped under `XARAVEL_NO_SCOPE_GLOBAL=1`. `php/Exception.ts:14`, `RuntimeException.ts:5`, `throwableArguments.ts:134,146-167` (constructor coercion: int code, `Error | null` previous; own `name` and writable `code`). `runtime/tests/xaravel/exceptions.test.ts:89-93,217-221` -- child-process helper and the model reader.
- `packages/assert/src/Framework/Exception/Exception.ts:11` (`extends Error`; `code` non-writable), `AssertionFailedError.ts:13`, `Framework/MockObject/Exception/*`, `EmptyStringException`, `InvalidArgumentException`, `UnknownClassOrInterfaceException`, `ComparisonFailure`, `util/Json.ts` -- the classes to re-parent. `src/index.ts:42-71` freezes exports (a frozen class cannot be re-parented, hence the internal base).
- `packages/assert/src/comparator/ExceptionComparator.ts:9-11`, `comparator/Factory.ts:28`; `Framework/Throwable.ts:12` (`isThrowable`, leave as is).
- `packages/assert/src/Framework/TestCase.ts:101-104`, `Framework/Constraints.ts:283-298` (`classOrInterface`), `Framework/TestCase/ExceptionExpectation.ts` (`shouldBeVerifiedFor`).
- `packages/assert/tests/xaravel/operands.ts:96-105` (`XtException`), `expectations.test.ts:347-356` (XT-assert-12) -- must stay green without the map.
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts:115-160` (`parameterInfo`, JS-source names), `:175-215` (`readTarget`: keep the declaring class per method), `:245-262` (`doubledMethod`: pads `args[i] ?? null`, builds `Invocation(target.name, …)`); `ConfigurableMethod.ts:37,41`; `Runtime/Invocation.ts:48` (`generateReturnValue` → null), `:53` (`toString`); `Runtime/InvocationHandler.ts:89-92`; `Runtime/AbstractInvocationImplementation.ts:66` (`willReturn`), `:126-146` (`#normalizeValueMap`); `Runtime/Stub/ReturnValueMap.ts:19-32`; `Runtime/Rule/Parameters.ts:65-70`. Update the JSDoc that states the old null rule (`Invocation.ts:4-8`, `InvocationHandler.ts:7-8`, `ConfigurableMethod.ts:4-6`, `AbstractInvocationImplementation.ts:5-9`, `Generator.ts:15-20`).
- `packages/mockery/src/JMac/Testing/Engine/SafeDefaultResolver.ts:36-110`, `DoubleTarget.ts:255-270` (`declaringClassName`), `packages/mockery/src/support/classes.ts:1-60` (read-only) -- the reference reader of `xaravel.api.signature` and `xaravel.class.lookup`.
- `conformance/harness/signatures.ts:24-45` (read-only) -- `SignatureRow`/`SignatureParameter`; `conformance/harness/preload.ts:15-20,46,60-78` (read-only) -- the installers of the signature lookup and the late hook (`(late) => void`, keeps `{id, kind}`). `tools/oracle/api-surface.php:11-25,331-341` (read-only) -- how rows are derived (declared public methods only; `default` is PHP source text or null; untyped return is `null`, `nullable: true`).
- PHPUnit 13.4.3 under `conformance/tests/xaravel/php-fixtures/phpunit/vendor/phpunit/phpunit/src/Framework/MockObject/` (read-only, gitignored): `Runtime/ReturnValueGenerator.php:41-260`, `Invocation.php` (constructor, `generateReturnValue`, `toString`), `Exception/RuntimeException.php` (`extends \RuntimeException`), `Exception/NeverReturningMethodException.php`, `Generator/DoubledMethod.php:108`, `Runtime/Api/…normalizeValueMap`.
- `packages/assert/tests/xaravel/double-cells.ts:1-60,384-396,448`, `doubles.test.ts:162,228,272` -- the XT-assert-15/16 cell idiom and request `4.7.jsonl` (setup with PHP twin classes, `xt_case47`, `xt_cell47`); the XT-assert-20 cells follow it in `9.11.jsonl` with their own twin and helper names.
- `packages/assert/src/declarations/AssertionCounter.ts:34-126` (`Counts{ended}`, `recordAssertion`, `addToAssertionCount`, `reportLate`, `runCounted`), `Declarations.ts:20-28,91`; `Framework/Assert.ts:90-110,554-557,760-767` (the static→prototype mirror loop: a natural single wrap point); `Framework/MockObject/…/MockObjectRegistry.ts:38-50`, `TestCase.ts:135,149,187`.
- `packages/assert/tests/xaravel/declarations.test.ts:64-118`, `fixtures/declarations.fixture.ts:28,70` -- the child-`bun test` + fake-hook idiom for XT-assert-21. `conformance/tests/xaravel/harness.test.ts:615-760` (read-only, XT-conformance-185) must stay green.
- `conformance/oracle-requests/4.1.jsonl` (read-only) -- request shape (`id`, `kind: "php-expr"`, `input.setup`, `input.exprs`, `sha256`); `bun run oracle:story` writes and checks a Story's request file.
- `conformance/upstream/framework/src/Illuminate/Testing/TestResponseAssert.php:168-178` (read-only) -- `appendMessageToException`.
- `conformance/tests/xaravel/php-fixtures/phpunit/vendor/phpunit/phpunit/src/` (read-only, gitignored) -- PHPUnit 13.4.3 source, for the exporter's float form and messages.
- Local PHP 8.5.11 at `/opt/homebrew/bin/php`; `tools/oracle/evaluate.php` to check the request before pushing (as Story 9.10's Verification).

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/comparison/PhpValues.ts` -- marker reader and PHP number type; route every number predicate through them.
- `packages/assert/src/comparison/{PhpComparison,PhpOrder}.ts`, `src/Framework/Constraints.ts`, `src/comparator/*.ts`, `src/exporter/{Exporter,VarExport}.ts` -- apply the float rule; update comments citing "until Story 9.11"/ESC-4.1-1's interim rule.
- `packages/assert/src/Framework/Exception/Exception.ts`, `src/Framework/ExpectationFailedException.ts` -- the `xaravel.assert.setMessage` protocol (subclass suffix kept by a protected hook, not by re-parsing the message).
- `packages/assert/README.md` (or the grader's docs page) -- the float rule and the protocol.
- `conformance/oracle-requests/9.11.jsonl` -- the XT-assert-17 request; check it with local `evaluate.php` and `bun run oracle:story check 9.11`.
- `packages/assert/tests/xaravel/runtime-values.test.ts` (new) -- XT-assert-17 (matrix rows and the real-marker subprocess) and XT-assert-19 (rewrite rows), with the header conventions above.
- `packages/assert/tests/xaravel/oracle-values.ts` -- branded-float decoding option.
- First: `git apply _bmad-output/implementation-artifacts/spec-9-11-attempt-1.patch`, then `git rm` the patch file; drop the `-0` changes and fix the carried rows (Always).
- `packages/assert/src/Framework/Exception/` (internal base module, not exported from `src/index.ts`) and each re-parented exception class -- AC2's lazy SPL link; `src/comparator/ExceptionComparator.ts` -- the `\Exception` split.
- `packages/assert/src/Framework/MockObject/Exception/{RuntimeException,NeverReturningMethodException}.ts` (new, PHPUnit's FQCNs and messages, exported like the sibling MockObject exceptions) and `Framework/MockObject/{Generator/Generator.ts,ConfigurableMethod.ts,Runtime/*}` -- AC4: the signature reader, a `ReturnValueGenerator` port, a PHP default-literal evaluator, declaring-class lookup, `toString` suffix, default padding.
- `packages/assert/src/declarations/AssertionCounter.ts`, `src/Framework/Assert.ts`, the MockObject invocation path -- AC5.
- `conformance/oracle-requests/9.11.jsonl` -- add the XT-assert-20 request after XT-assert-17's, generated from the cell table as `double-cells.ts` documents; check both with local `evaluate.php` and `bun run oracle:story check 9.11`.
- `packages/assert/tests/xaravel/exceptions-spl.test.ts` (new, XT-assert-18), `typed-doubles.test.ts` + `typed-double-cells.ts` (new, XT-assert-20), `late-failures.test.ts` + `fixtures/late-failures.fixture.ts` (new, XT-assert-21); extend `runtime-values.test.ts` with the unmarked `-0` rows.
- `stories/9.11.md` -- `status:` line only (`in-progress` now, `done` at the end).

**Acceptance Criteria:**
- Given Story 9.5's float marker, when `phpStrictEquals(1, 1.0)` and `assertSame(1, 1.0)` run, then they are false and fail, as in PHP, and an unmarked `-0` stays an int (XT-assert-17).
- Given the runtime's class map, when the grader throws or compares exceptions, then its exceptions are `instanceof` their runtime SPL parents, a PHPUnit failure matches `\RuntimeException` in `Constraint\Exception`, and `ExceptionComparator` takes only `\Exception`s; without the map, today's behaviour is unchanged (XT-assert-18).
- Given a caught assertion failure, when Laravel's `TestResponseAssert` appends to its message, then the supported `xaravel.assert.setMessage` protocol rewrites it (XT-assert-19).
- Given a signature lookup with a row for a doubled method, when it is called unconfigured or with omitted arguments, then it returns PHPUnit's generated value, pads declared defaults (also in `willReturnMap` rows), names parameters as declared and `toString` carries `: <type>`, matching the Oracle; with no row, today's null behaviour holds (XT-assert-20).
- Given an assertion that fails after its test's counts ended, when it fails, then nothing is thrown into the running test and the late hook gets the owning test's id (XT-assert-21).
- Given the whole grader suite, when it runs, then XT-assert-1..16, the mockery suite and XT-conformance-185 still pass.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the XT-assert-17 and XT-assert-20 fixtures and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

- 2026-10-22 (review fixes, attempt 2): the internal SPL base keeps the `code` passed to it as an own non-enumerable property; `phpClass()` links first, so exceptions built before the runtime loaded read as its classes; Laravel's `InvalidArgumentException`, `UnknownClassOrInterfaceException` and `EmptyStringException` extend the grader's PHPUnit `Exception` (PHPUnit's abstract `InvalidArgumentException` is not ported) and every grader exception carries its real FQCN brand; `setMessage` is documented as `PHPUnit\Framework\Exception`'s only; `exactly()` and `addToAssertionCount()` name the PHP type in their `TypeError`; `arrayKey` and `brandedKey` read a marked float key as its number; the default evaluator reads PHP's octal, hex, binary and `_` int literals; `parent` with no named parent throws `cannot be generated: the declaring class … has no named parent`, and the declaring class's parent resolves without the class lookup (as the declaring class and target do: a superset of the intent's rule, recorded here); a call reads the signature row once and builds its `ReturnValueGenerator` only when a value is generated. Tests: XT-assert-20's Oracle cells run in a child that loads the runtime first (no faked class map), with fixture-free rows for `self`, `?self`, `parent`, `?Foo`, an intersection, a DNF type, a contract token and `undefined` arguments; XT-assert-18 compares `Reflect.ownKeys`, the literal code and previous, the late runtime load, and runs an `expectException(\RuntimeException)` body as `runLifecycle`'s runTest does.

- 2026-10-22 (implementation, all five ACs): the attempt-1 patch is re-applied without its `-0` changes and deleted; XT-assert-17..21 are built. Points the implementation settled, for the review:
  - **Constants:** the surface also uses `E_DEPRECATED` once as a default (`8192`), so the evaluator takes it beside the five the intent names; it is a PHP constant the surface uses, which is the rule the bullet states.
  - **Return-type strings:** PHPUnit gets the type from sebastian/type, whose `UnionType` and `IntersectionType` sort their members, so `int|string` (PHP's `(string)` gives `string|int`) is what `toString()` prints; a nullable named type keeps its `?`, `mixed` and `null` never get one. PHP 8.5's reflection already prints `self` as the class name except in traits, so the surface's few `self` rows are the trait ones; both forms resolve.
  - **Parameter names:** PHPUnit's `Parameters` rule names a position by reflecting the declaring class, variadic included, so a row's variadic name is used for its position; the collected arguments still skip the variadic, as PHPUnit's generated method does.
  - **An `undefined` argument** counts as omitted (padded with its default), as a JS default parameter treats it; a parameter with no default and no argument ends the padding.
  - **The internal SPL base** also gives `getMessage()`, `getCode()` and `getPrevious()` to the grader exceptions that had none (`EmptyStringException`, …), and a static class-name brand getter that returns the subclass's JS name, so a class without its own brand never shows the runtime parent's `RuntimeException` as its name. The runtime's own `name` and `code` properties are removed after its constructor runs, so own keys stay as without the map.
  - **The util/Json errors:** only `InvalidJsonException` is PHPUnit's (`extends \RuntimeException`); `JsonError` and `EncodeError` are the module's internal signals, caught there, with no PHP class, so they stay on the JS `Error`.
  - **XT-assert-17's matrix** gained the carried values (`9007199254740993`, `"-0"`, `"0.0"`, `"1e0"`, `[1]`, `[1.0]`, `[-0.0]`): 24 values, 1,152 cells.
  - **XT-assert-20's request** also reflects the PHP twin's rows (`xt_rows20`, api-surface.php's form), and the test checks the fake lookup serves exactly those rows.
  - **Local check:** no locked Laravel install with `vendor/` exists on this machine, so both requests were evaluated with a throwaway runner around evaluate.php's `Encoder` and the PHPUnit 13.4.3 vendor under `conformance/tests/xaravel/php-fixtures/phpunit` (PHP 8.5.11, PHPUnit's configuration registry initialised from the framework's `phpunit.xml.dist`): all 1,152 matrix cells, both row sets and all 19 double cells agree with the grader. The bot's signed fixtures are authoritative.
  - **Not in this Story's paths:** `docs/ops/harness.md:200-207` still says a late failing assertion throws (as recorded above); DIV-9.8's closing line waits for Story 9.12 and the planning change (ESC-9.11-1).

- 2026-10-22 (re-plan after the rulings): the intent contract now covers all five ACs.
  - **The number rule follows ESC-9.11-2:** an unmarked `-0` is an int everywhere, so the earlier printer carve-out is gone.
  - **Decisions taken under the MAINT ruling's "recommended option", for the Maintainer to see:**
    - **`expectException`:** it "matches a PHPUnit failure" at the class-check level, and the PHPUnit flow, where an assertion failure under `expectException(\RuntimeException)` still fails the test, is kept as PHPUnit's `shouldBeVerifiedFor` does it. Making that test pass would move away from PHPUnit.
    - **`willReturn`:** it is not type-checked. This is ESC-4.7-1 item 2's open question.
    - **Generated `float` values and float defaults:** they are plain numbers, carried under DIV-9.4 when it matters, because the grader cannot make the runtime's marker (AD-2).
    - **Defaults the grader cannot evaluate:** a class constant, an enum case, `new …` or a keyed array throws a `MockObject\RuntimeException` only when the argument is omitted. It never pads `null`.
    - **Intersection return types:** no doubles are built for them. No surface row declares one.
  - **Gap with no target in this Story:** `docs/ops/harness.md:200-207` still says a late failing assertion throws. `docs/` is outside `story/9.11`'s allowed paths, so the Epic 9 retrospective takes it as an action item. It is noted in the PR.
- 2026-10-22: `decisions/ESC-9.11-1.md` (Maintainer) rules option 1: the Story keeps every acceptance criterion inside `packages/assert/**` (AC1, AC3, AC4, AC5 and the grader half of AC2), its manifest gains XT-assert-20 (AC4) and XT-assert-21 (AC5), and Mockery's half of AC2 is the new Story 9.12. `decisions/ESC-9.11-2.md` (orchestrator) ruled the `-0` rule: the grader reads only the float marker. Re-apply `spec-9-11-attempt-1.patch` under that rule, build XT-assert-18 (grader half), XT-assert-20 and XT-assert-21, then run the review step with the Fidelity Review. The integral-float `===` matrix stays in `conformance/oracle-requests/9.11.jsonl` under XT-assert-17, as the Escalation records.
- 2026-10-22: planning found that the manifest maps Xaravel Tests to only the first three of the five ACs now in `epics.md`, and that AC2's Mockery half needs `packages/mockery/**`, outside `story/9.11`'s allowed paths (Epic 9 is strict). Raised `conformance/escalations/ESC-9.11-1.md` (`protected-path`, XT-assert-18). The Story carries on with XT-assert-17 and XT-assert-19. ESC-4.1-1 names `4.1.jsonl` for the `===` matrix, which `story/9.11` cannot write; under the MAINT ruling ("choose the recommended or best-case option") the matrix goes in `9.11.jsonl` under XT-assert-17, recorded in ESC-9.11-1 for the Maintainer.
- 2026-10-22: implementation found that the number-type rule (`-0` is a float) conflicts, for a plain `-0`, with XT-mockery-10 (`packages/mockery/tests/xaravel/mockery.test.ts:445-451`), which pins that `phpToString(-0)` prints `0` and `phpVarExport` prints `0` ("-0 is an integral float, which reads as an int (DIV-9)"), and which this Story may neither edit nor break (AC "the mockery suite still pass"). So `phpToString`, `var_export` and `serialize` keep printing a plain `-0` as `0` / `i:0;` as before; every other reader (`===`, `gettype`, `IsType`, the comparators, PHPUnit's exporter, which prints `-0.0`) follows the rule. A marked `float(-0)` prints `-0` / `-0.0` everywhere. Recorded for the Maintainer; aligning the two needs a change to `packages/mockery/**`.

## Review Triage Log

### 2026-10-22 — Review pass

Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment. Fidelity Review skipped this pass: the Story halts on ESC-9.11-1 with XT-assert-18, AC4 and AC5 unbuilt and XT-assert-17's fixture unsigned, so it runs when the Story resumes with its full scope. Intent gap: the attempt is saved in [spec-9-11-attempt-1.patch](spec-9-11-attempt-1.patch) and the code reverted; `conformance/escalations/ESC-9.11-2.md` asks the Maintainer which `-0` rule the grader keeps.

- verdicts: 25 findings — high 0, medium 15, low 4, false 4, maybe-false 0 (2 intent-alignment observations logged as descriptive rows)
- findings:
  - `[false]` `[reject]` Blind: XT-assert-17's signed fixture is missing while the spec is in review — the per-Story Oracle flow signs it on push (`oracle.yml#story`), as the spec's Verification says; nothing is owed locally.
  - `[medium]` `[intent_gap]` Blind: the `-0` carve-out in `phpToString`/`var_export`/`serialize` is a divergence decided locally — the intent contract's number rule ("used everywhere") conflicts with XT-mockery-10, which pins the int forms; root cause inside the intent contract; ESC-9.11-2.
  - `[low]` `[intent_gap]` Blind: `serialize` keeps `i:0;` for `-0` with no stated reason — same root cause as above.
  - `[medium]` `[intent_gap]` Blind: an unmarked `-0` as a float makes `assertSame(0, -0)` fail where a JS port of a PHP int expression yields `-0` — same root cause; ESC-9.11-2 option 1 avoids it.
  - `[medium]` `[patch]` Blind: `TestCase::exactly()`, `Exception`'s `code` and `ExceptionCode` still reject or misread a marked float — moot (intent gap); carry into the re-run.
  - `[medium]` `[patch]` Blind: `arrayKey` does not unmark a marked float key (`assertArrayHasKey(float(1), [1 => 'x'])` fails) — moot; carry.
  - `[medium]` `[patch]` Blind: `loose()`/`Ordering.compare()` unmark before `compareNumberToString`, so `float(1e15)` stringifies as an int against a non-numeric string — moot; carry (pass the PHP type through).
  - `[medium]` `[patch]` Blind: the Oracle matrix lacks int/float pairs beyond 2^53, nested arrays and `"-0"`/`"0.0"`/`"1e0"` strings — moot; carry.
  - `[medium]` `[patch]` Blind: no tests for marked NAN/INF readers, parameter coercion, exporter/var_export/serialize forms, `isScalar`/`isNumeric`/`isPhpObject`, the canonicalizing sort, `willReturnMap` — moot; carry.
  - `[low]` `[patch]` Blind: the subprocess has no `timeout` (siblings use `SPAWN_TIMEOUT`) — moot; carry.
  - `[low]` `[patch]` Blind: no test of `setMessage` on an `ExpectationFailedException` without a comparison failure — moot; carry.
  - `[false]` `[reject]` Blind: spec `in-review` vs manifest `in-progress` disagree — the manifest tracks the Story, the spec its own run; both are as the process sets them.
  - `[medium]` `[patch]` Edge: `shortenedExport` unmarks first, so ArrayComparator diffs print `1` for `float(1)` — moot; carry.
  - `[medium]` `[patch]` Edge: `float(1e15)` against a non-numeric string in ordering — same as the Blind row; moot; carry.
  - `[medium]` `[patch]` Edge: `arrayKey` with a marked float key — same as the Blind row; moot; carry.
  - `[low]` `[reject]` Edge: a branded object without a numeric `valueOf` gives NaN or throws — the protocol's only producer is the runtime's frozen `Number` subclass; guarding a forged brand adds branches for a case no caller reaches.
  - `[medium]` `[patch]` Edge: `exactly()`/`ExceptionCode` number readers not routed — same as the Blind row; moot; carry.
  - `[medium]` `[patch]` Verification: `assertSame(float(1), float(1))` is checked only in the subprocess, after the fixture assertion, so it never runs before CI signs the fixture — moot; carry (fixture-free row, subprocess before the matrix).
  - `[medium]` `[patch]` Verification: marked NAN/INF readers (`IsNan`, `NumericComparator`) untested — moot; carry.
  - `[medium]` `[patch]` Verification: marked floats as `int`/`float`/`int|string` parameters untested — moot; carry.
  - `[medium]` `[intent_gap]` Verification: the new `-0` outputs are unpinned — same root cause as the `-0` rows; ESC-9.11-2.
  - `[medium]` `[patch]` Verification (other): `arrayKey` with a marked float — same as the Blind row; moot; carry.
  - `[false]` `[reject]` Verification (other): the fixture is not committed — by design of the per-Story Oracle flow.
  - `[low]` `[reject]` Intent: AC2, AC4, AC5 and the Mockery half are not implemented — held by ESC-9.11-1, which the spec records; descriptive.
  - `[false]` `[reject]` Intent: AC1's matrix runs on a simulated marker — the subprocess row covers the runtime's real `float()`, and the grader's tests simulate brands by design (AD-2, `BrandedArray`); the Verification row above fixes when it runs.

### 2026-10-22 — Review pass (re-run after the rulings)

Layers: Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment, Fidelity Review (both reviewers reject at tree `5f865dc`). Before this pass, the first Fidelity attempt stopped over its prompt cap. Section (e) pulled in XT-assert-1, 8–12, 15 and 16 because `oracle-values.ts`'s `decode` had changed. The branded-float decoding moved to the new `branded-floats.ts`, and `oracle-values.ts` is back at baseline.

- verdicts: 40 findings — high 0, medium 24, low 12, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: `RuntimeExceptionParent` loses `code` with and without the map (`MockObject\RuntimeException("m", 5).getCode()` is 0) — the code is now stored after `super`; XT-assert-18 asserts the literal.
  - `[medium]` `[patch]` Blind: Laravel's `InvalidArgumentException` and `UnknownClassOrInterfaceException` skip PHPUnit's `Exception` in their chain — they now extend the grader's `Exception`, as their PHP sources do.
  - `[medium]` `[patch]` Blind: classes without their own brand report a bare JS name as their FQCN — each gets its real FQCN brand.
  - `[medium]` `[patch]` Blind: linking happens only on construction or load, so a runtime loaded later is not seen by the comparator or `instanceof` until a new exception is built — `phpClass()` now links first; XT-assert-18 has the row.
  - `[low]` `[patch]` Blind: README and the `Exception.ts` header say every PHPUnit exception has `setMessage`, but only `PHPUnit\Framework\Exception` subclasses do — the wording is narrowed.
  - `[low]` `[patch]` Blind: `exactly(float(1.5))` says `object given` — it now names the PHP type.
  - `[medium]` `[patch]` Blind: marked float keys are handled inconsistently by `arrayKey` and `brandedKey` — both now read a marked float as its number.
  - `[low]` `[reject]` Blind: a nested late failure (`assertThat` inside another `assert*`) returns null to the outer assertion, which keeps going — the failure is already reported to the late hook and the outer call returns after its `assertThat`. Only a re-entrancy counter would fix it, which adds state for an unlikely path.
  - `[medium]` `[patch]` Blind: a doubled call reads the signature lookup several times and rebuilds the generator every call — the row is now read once per call, and the generator is built only when a value is generated.
  - `[medium]` `[patch]` Blind: `parent` resolution, intersection, DNF and `?Foo` are untested — fixture-free rows added (grouped with the Verification Gap `self`/`parent` row).
  - `[medium]` `[patch]` Blind: XT-assert-18 compares own properties with `Object.keys` and never checks `getCode()` against a literal — it now uses `Reflect.ownKeys` and literal code and previous.
  - `[medium]` `[patch]` Blind: XT-assert-20 installs a fake `xaravel.php.classes` that can collide with a real runtime load — the fake is removed and the `object` cell runs in a child process with the runtime (grouped with Fidelity F-8).
  - `[medium]` `[patch]` Edge: `code` lost — same root as the Blind row.
  - `[medium]` `[patch]` Edge: link only on construction — same root as the Blind row.
  - `[low]` `[reject]` Edge: a late call whose stub is configured to throw an `ExpectationFailedException`, or where an earlier matcher threw a non-EFE, is swallowed — a test that stubs a PHPUnit failure on a call landing after its counts end is not an everyday case, and telling stub throws from rule throws needs new tracking state.
  - `[false]` `[reject]` Edge: a throwing signature lookup surfaces a raw error — failing loudly on a broken installer is the correct behaviour; the harness installer never throws.
  - `[medium]` `[patch]` Edge: one call reads the lookup several times, so rows can mix — same root as the Blind row.
  - `[medium]` `[patch]` Edge: octal defaults such as `0755` were evaluated as decimal — PHP int literal forms (octal, hex, binary, `_`) are now parsed, with evaluator rows.
  - `[medium]` `[patch]` Edge: fractional or unsafe marked float key in `arrayKey` — same root as the Blind row.
  - `[low]` `[patch]` Edge: `exactly(float(1.5))` message — same root as the Blind row.
  - `[low]` `[patch]` Edge: `parent` with no named parent sends the literal `parent` to the lookup — it now throws `cannot be generated` with that reason.
  - `[low]` `[reject]` Edge: a non-`Error` `previous` is no longer exposed as `cause` — `previous` is typed `Error | null` across the grader, and PHP's `$previous` is a `Throwable`; no caller passes anything else.
  - `[low]` `[patch]` Edge: README `setMessage` claim — same root as the Blind row.
  - `[medium]` `[patch]` Verification Gap: `self`/`?self`/`parent` return rows are never exercised (244 surface rows declare `self`) — fixture-free rows added.
  - `[medium]` `[patch]` Verification Gap: a contract-token double with a row is never tested — fixture-free row added.
  - `[low]` `[patch]` Verification Gap: an explicit `undefined` argument counting as omitted is untested — fixture-free row added (default, and `null` for a parameter with no default).
  - `[low]` `[reject]` Intent: the diff implements the grader-local reading; real surface rows, the real harness hook and a real `appendMessageToException` caller are outside `packages/assert/**` — descriptive. The signed fixtures arrive with the push.
  - `[false]` `[reject]` Intent: an unconfigured `int|string` return generates `0` rather than throwing — PHPUnit's `ReturnValueGenerator` checks builtin members of a union first (`int` gives 0) and throws only for a union with no builtin it knows. The intent's "a union of names" means class names; the Oracle cell decides.
  - `[medium]` `[patch]` Intent: the `expectException` row checks only `shouldBeVerifiedFor`, never a TestCase body — the body is now run as the double cells drive a TestCase, and its outcome is asserted.
  - `[low]` `[reject]` Intent: `E_DEPRECATED` is evaluated beyond the five constants listed — it is a constant the surface uses, which the bullet's own rule ("the PHP constants the surface uses") covers; recorded in the change log.
  - `[low]` `[reject]` Intent: grader exceptions without getters gain `getMessage`/`getCode`/`getPrevious` in both modes — additive PHP methods that every PHP `\Exception` has; no existing behaviour changes.
  - `[medium]` `[patch]` Fidelity F-6 (reviewer 1): the XT-assert-17 fixture `4b247f84…` is missing — only `oracle.yml#story` signs fixtures, after the push. The branch is pushed and the Fidelity Review re-runs on the tree that holds them, as Stories 9.7, 9.8 and 9.10 did.
  - `[medium]` `[patch]` Fidelity F-6 (reviewer 1): the XT-assert-20 fixture `809c09d9…` is missing — same root and action.
  - `[medium]` `[patch]` Fidelity F-7 (reviewer 1): XT-assert-17's matrix cannot run without its fixture — same root.
  - `[medium]` `[patch]` Fidelity F-7 (reviewer 1): XT-assert-20's cells cannot run without their fixture — same root.
  - `[medium]` `[patch]` Fidelity F-6 (reviewer 2): XT-assert-17 fixture missing — same root.
  - `[medium]` `[patch]` Fidelity F-6 (reviewer 2): XT-assert-20 fixture missing — same root.
  - `[medium]` `[patch]` Fidelity F-8 (reviewer 2): `FakeStdClass` fakes the runtime's stdClass — removed; the cell runs in a child process with the real runtime.
  - `[false]` `[reject]` Intent: XT-assert-20's default evaluator is tested on hand-picked strings, not the surface's defaults — the evaluator rows now cover every literal form in the surface's distinct default list (octal added). A surface-wide pass would read `conformance/api-surface/`, which is evidence data, not a grader input.
  - `[false]` `[reject]` Intent: AC5 tests use a fake late hook — the real hook lives in `conformance/harness/preload.ts`, and XT-conformance-185 still passes. A fake hook is the grader-side contract test, as `declarations.test.ts` does.

## Design Notes

- **Brand, not import.** The marker is a frozen `Number` subclass instance, so `typeof` is `"object"`; reading `v[Symbol.for('xaravel.php.float')] === true` on a non-null object is enough and cannot throw (the runtime's getter is a plain prototype getter).
- **Why a protocol method for AC3.** Graded packages may take the grader only as a devDependency (`tools/graph/graph.ts`), so the Testing port of `appendMessageToException` cannot import a setter; it calls the method when the caught exception has it. A writable `message` read by `getMessage()` was rejected: `ExpectationFailedException`'s JS `message` carries the diff suffix, so reading and writing it would not round-trip.

## Verification

**Commands:**
- `bun run oracle:story check 9.11` -- expected: the request is accepted.
- `php tools/oracle/evaluate.php <Laravel at the Pin outside the repo> 8.5.11 <now> conformance/oracle-requests/9.11.jsonl` -- expected: results match the JS side.
- `bun test packages/assert packages/mockery` and `bun run harness --xaravel --id 'XT-assert-*'` -- expected: pass once the fixtures are pulled (XT-assert-17 and XT-assert-20 fail only for their missing fixtures before then; every fixture-free row passes).
- `bun test conformance/tests/xaravel/harness.test.ts` -- expected: XT-conformance-185 passes.
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run escalations:check`, `bun run ownership:check` (if present) -- expected: clean.

## Auto Run Result

Status: in-review

- **Attempt 2:** all five ACs built inside `packages/assert/**` and `conformance/oracle-requests/9.11.jsonl` (XT-assert-17 and XT-assert-20 requests). Verification: `bun --bun tsc -b`, `bun run lint`, `graph:check`, `registration:check`, `escalations:check`, `ownership:check`, `porting:check`, `async-surface --check assert`, `oracle:story check 9.11` clean; `bun test packages` 67/69 and `bun run harness --xaravel --id 'XT-assert-*'` 19/21, the two failures being XT-assert-17's and XT-assert-20's unsigned fixtures (every fixture-free row passes); the full `bun run harness` differs only on those two (21,817 lines checked over 4 local Variants, 7 NOT-RUN); `bun test conformance/tests/xaravel/harness.test.ts` (XT-conformance-185) passes. The review step (with the Fidelity Review) is next.

### Previous run (attempt 1)

Status: blocked

Blocking condition: intent gap, and Escalations waiting on rulings. `conformance/escalations/ESC-9.11-1.md` (`protected-path`, XT-assert-18): the manifest maps Xaravel Tests to only three of the five ACs, and AC2's Mockery half needs `packages/mockery/**`. `conformance/escalations/ESC-9.11-2.md` (`contract`, XT-assert-17): which rule the grader keeps for an unmarked `-0`, the runtime's `isFloat` or the Epic 4 rule XT-mockery-10 pins.

- **Attempt 1:** implemented XT-assert-17 (the grader reads the float marker by brand in `===`, `==`, ordering, the comparators, the constraints and the exporters; a signed-Oracle matrix request in `conformance/oracle-requests/9.11.jsonl`) and XT-assert-19 (`Symbol.for('xaravel.assert.setMessage')` on PHPUnit's `Exception`). Verification: `tsc`, lint, `graph:check`, `ownership:check`, `oracle:story check 9.11` clean; `bun test packages/assert packages/mockery` 28/29, the one failure being XT-assert-17's unsigned fixture; local PHP 8.5.11 agreed with the grader on all 578 matrix cells.
- **Review:** 25 findings (15 medium, 4 low, 4 false, 2 descriptive). The `-0` rows trace to the intent contract's number rule, so the attempt is saved in [spec-9-11-attempt-1.patch](spec-9-11-attempt-1.patch) and the code reverted. The patch-class rows (marked floats in `exactly()`/`ExceptionCode`/`arrayKey`, `shortenedExport`, the 1e15 string form, the missing tests, the subprocess timeout and order) are carried into the re-run.
- **Resume:** once ESC-9.11-1 and ESC-9.11-2 are ruled, update the intent contract to the rulings, re-apply the patch, fix the carried rows, then run the full review, including the Fidelity Review.

## Fidelity Review

### Reviewer 1: reject at tree 5f865dc906047190f2fe067d482dfeabec399f68

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `f6108a175d3a9476875796b356a7ed7c209e9e1e`, on 2026-10-22T22:51:26.961Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are added or changed. |
| F-2: No expected value is weakened | pass | Compared the added test expectations and cited decisions; no existing expected value is loosened or replaced. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added; the README's marker example agrees with DIV-9.4. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | fail | Both relied-on Oracle fixtures are explicitly unavailable, so their error status and expected failures cannot be confirmed. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The test bodies cover their declared scenarios, but XT-assert-17 and XT-assert-20 cannot verify their declared Oracle comparisons with the fixtures absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths with the assert Component and ESC-9.11-1: production changes stay within assert; test-local brands and lookup fixtures exercise protocols without implementing another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the declaration inventory and diff with AD-6, DIV-1 and ESC-6.4-1. The retained runCounted callback tag is justified by awaiting its supplied callback; the new declarations are synchronous. |
| F-10: Oracle requests match the Upstream test's inputs | pass | Compared both requests with the test-side PHP scenarios and recorded reasons. These are custom grader probes without Upstream test inputs, explicitly documented as escalation follow-ups; ESC-9.11-1 authorizes the float matrix in 9.11.jsonl. |

Findings:

- **F-6** `conformance/fixtures/assert/4b247f8481e2ea9f2d7239f8eb0181837b5f806800d4ece3ced20cec1d19da2e.json`: Supply the signed XT-assert-17 fixture and verification evidence, including its output.error status.
- **F-6** `conformance/fixtures/assert/809c09d98f53cd98a92efe9a69bd3cdce8f1d9866228b98d847fea265e1a03cb.json`: Supply the signed XT-assert-20 fixture and verification evidence, including its output.error status.
- **F-7** `packages/assert/tests/xaravel/runtime-values.test.ts`: Provide XT-assert-17's signed fixture so its declared complete comparison matrix can execute and be reviewed.
- **F-7** `packages/assert/tests/xaravel/typed-doubles.test.ts`: Provide XT-assert-20's signed fixture so the declared generated values, defaults, messages and counts can be compared with the Oracle.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"5f865dc906047190f2fe067d482dfeabec399f68","base":"f6108a175d3a9476875796b356a7ed7c209e9e1e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-22T22:51:26.961Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the added test expectations and cited decisions; no existing expected value is loosened or replaced.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added; the README's marker example agrees with DIV-9.4.","findings":[]},{"id":"F-6","result":"fail","note":"Both relied-on Oracle fixtures are explicitly unavailable, so their error status and expected failures cannot be confirmed.","findings":[{"path":"conformance/fixtures/assert/4b247f8481e2ea9f2d7239f8eb0181837b5f806800d4ece3ced20cec1d19da2e.json","detail":"Supply the signed XT-assert-17 fixture and verification evidence, including its output.error status."},{"path":"conformance/fixtures/assert/809c09d98f53cd98a92efe9a69bd3cdce8f1d9866228b98d847fea265e1a03cb.json","detail":"Supply the signed XT-assert-20 fixture and verification evidence, including its output.error status."}]},{"id":"F-7","result":"fail","note":"The test bodies cover their declared scenarios, but XT-assert-17 and XT-assert-20 cannot verify their declared Oracle comparisons with the fixtures absent.","findings":[{"path":"packages/assert/tests/xaravel/runtime-values.test.ts","detail":"Provide XT-assert-17's signed fixture so its declared complete comparison matrix can execute and be reviewed."},{"path":"packages/assert/tests/xaravel/typed-doubles.test.ts","detail":"Provide XT-assert-20's signed fixture so the declared generated values, defaults, messages and counts can be compared with the Oracle."}]},{"id":"F-8","result":"pass","note":"Compared the changed paths with the assert Component and ESC-9.11-1: production changes stay within assert; test-local brands and lookup fixtures exercise protocols without implementing another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the declaration inventory and diff with AD-6, DIV-1 and ESC-6.4-1. The retained runCounted callback tag is justified by awaiting its supplied callback; the new declarations are synchronous.","findings":[]},{"id":"F-10","result":"pass","note":"Compared both requests with the test-side PHP scenarios and recorded reasons. These are custom grader probes without Upstream test inputs, explicitly documented as escalation follow-ups; ESC-9.11-1 authorizes the float matrix in 9.11.jsonl.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 5f865dc906047190f2fe067d482dfeabec399f68

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `f6108a175d3a9476875796b356a7ed7c209e9e1e`, on 2026-10-22T22:51:26.961Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the change adds or changes no Ported Test, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed, so there is no Upstream expected value that could be weakened. The changed tests are Xaravel Tests with no Upstream source. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there are no assertions to count against Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The diff adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. The README's mention of DIV-9.4 is guidance for future Ported Tests, not a marker on an assertion. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | fail | The Story relies on two signed fixtures, one per request in 9.11.jsonl. Evidence (c) reports both as unavailable: neither file exists. I can't confirm whether either one is an error fixture or what it holds. As written, XT-assert-17 and XT-assert-20 would also fail on the missing fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | I compared each consequence string with its test body. XT-assert-17 checks marked floats against === and ==, an unmarked -0, the printers, the real runtime marker in a child process, and the Oracle matrix. XT-assert-18 checks the SPL instanceof chain with and without the class map, ExceptionComparator, and Constraint\Exception. XT-assert-19 checks the setMessage protocol and that the cleared fields stay unchanged. XT-assert-20 checks generated returns, defaults, $names, the ': <type>' suffix, and the no-row path. XT-assert-21 checks that nothing is thrown into the running test and that the late hook gets the owning test's id. No consequence cites an FR-<n>.<k> or AD-<n>.<k> bullet. |
| F-8: No stub, fake or partial implementation of another Component | fail | All source changes are inside packages/assert. XT-assert-20, however, uses a test-local fake of the runtime's class map whenever the runtime has not published it. The Oracle-compared 'object' cell expects 'stdClass', so it can pass on that fake rather than the runtime's real stdClass. Whether it runs on the real map or the fake depends on what else the process has loaded. XT-assert-18 and XT-assert-17 already exercise the real runtime in a child bun process. |
| F-9: Every `@asyncRoot` tag is true | pass | The only @​asyncRoot tag in the changed source files is the kept '@​asyncRoot callback' on runCounted (AssertionCounter.ts:136). It is true: runCounted awaits a caller callback that may be async (ESC-6.4-1). The new exports (countsEnded, lateReports, reportLateFailure, signatureOf, evaluateDefault, returnTypeString, ReturnValueGenerator, RuntimeExceptionParent, phpClass, isMarkedFloat and the others) are all synchronous and do no IO, so none needs a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The requests in 9.11.jsonl (ids XT-assert-17 and XT-assert-20) belong to Xaravel Tests, not to Upstream tests, so there are no Upstream inputs to compare. Each test file records why (the 'F-10:' header comments citing ESC-4.1-1, ESC-9.11-1, ESC-9.11-2 and ESC-4.7-1 item 2). The exprs are evaluated by PHP and PHPUnit; no expected value is written as PHP and signed. typed-doubles.test.ts also rebuilds the XT-assert-20 setup and exprs from the cell table and checks them against the committed line. |

Findings:

- **F-6** `conformance/fixtures/assert/4b247f8481e2ea9f2d7239f8eb0181837b5f806800d4ece3ced20cec1d19da2e.json`: This is the signed fixture for request XT-assert-17 in conformance/oracle-requests/9.11.jsonl, and it is missing. Run the Oracle on the request, commit the fixture signed against oracle.pub, and make sure its output.error is null.
- **F-6** `conformance/fixtures/assert/809c09d98f53cd98a92efe9a69bd3cdce8f1d9866228b98d847fea265e1a03cb.json`: This is the signed fixture for request XT-assert-20 in conformance/oracle-requests/9.11.jsonl, and it is missing. Run the Oracle on the request, commit the fixture signed against oracle.pub, and make sure its output.error is null.
- **F-8** `packages/assert/tests/xaravel/typed-doubles.test.ts`: 'typedGlobals()' installs 'Object.freeze({ stdClass: FakeStdClass })' as 'Symbol.for('xaravel.php.classes')' when the runtime has not published its map, which fakes the runtime Component's stdClass so the 'object' cell can pass. Run that cell, or the whole Oracle cell table, in a child bun process that loads packages/runtime/src/index.ts first (as exceptions-spl.test.ts does), and remove FakeStdClass.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"5f865dc906047190f2fe067d482dfeabec399f68","base":"f6108a175d3a9476875796b356a7ed7c209e9e1e","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-22T22:51:26.961Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the change adds or changes no Ported Test, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream expected value that could be weakened. The changed tests are Xaravel Tests with no Upstream source.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there are no assertions to count against Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The diff adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. The README's mention of DIV-9.4 is guidance for future Ported Tests, not a marker on an assertion.","findings":[]},{"id":"F-6","result":"fail","note":"The Story relies on two signed fixtures, one per request in 9.11.jsonl. Evidence (c) reports both as unavailable: neither file exists. I can't confirm whether either one is an error fixture or what it holds. As written, XT-assert-17 and XT-assert-20 would also fail on the missing fixture.","findings":[{"path":"conformance/fixtures/assert/4b247f8481e2ea9f2d7239f8eb0181837b5f806800d4ece3ced20cec1d19da2e.json","detail":"This is the signed fixture for request XT-assert-17 in conformance/oracle-requests/9.11.jsonl, and it is missing. Run the Oracle on the request, commit the fixture signed against oracle.pub, and make sure its output.error is null."},{"path":"conformance/fixtures/assert/809c09d98f53cd98a92efe9a69bd3cdce8f1d9866228b98d847fea265e1a03cb.json","detail":"This is the signed fixture for request XT-assert-20 in conformance/oracle-requests/9.11.jsonl, and it is missing. Run the Oracle on the request, commit the fixture signed against oracle.pub, and make sure its output.error is null."}]},{"id":"F-7","result":"pass","note":"I compared each consequence string with its test body. XT-assert-17 checks marked floats against === and ==, an unmarked -0, the printers, the real runtime marker in a child process, and the Oracle matrix. XT-assert-18 checks the SPL instanceof chain with and without the class map, ExceptionComparator, and Constraint\\Exception. XT-assert-19 checks the setMessage protocol and that the cleared fields stay unchanged. XT-assert-20 checks generated returns, defaults, $names, the ': <type>' suffix, and the no-row path. XT-assert-21 checks that nothing is thrown into the running test and that the late hook gets the owning test's id. No consequence cites an FR-<n>.<k> or AD-<n>.<k> bullet.","findings":[]},{"id":"F-8","result":"fail","note":"All source changes are inside packages/assert. XT-assert-20, however, uses a test-local fake of the runtime's class map whenever the runtime has not published it. The Oracle-compared 'object' cell expects 'stdClass', so it can pass on that fake rather than the runtime's real stdClass. Whether it runs on the real map or the fake depends on what else the process has loaded. XT-assert-18 and XT-assert-17 already exercise the real runtime in a child bun process.","findings":[{"path":"packages/assert/tests/xaravel/typed-doubles.test.ts","detail":"`typedGlobals()` installs `Object.freeze({ stdClass: FakeStdClass })` as `Symbol.for('xaravel.php.classes')` when the runtime has not published its map, which fakes the runtime Component's stdClass so the 'object' cell can pass. Run that cell, or the whole Oracle cell table, in a child bun process that loads packages/runtime/src/index.ts first (as exceptions-spl.test.ts does), and remove FakeStdClass."}]},{"id":"F-9","result":"pass","note":"The only @asyncRoot tag in the changed source files is the kept `@asyncRoot callback` on runCounted (AssertionCounter.ts:136). It is true: runCounted awaits a caller callback that may be async (ESC-6.4-1). The new exports (countsEnded, lateReports, reportLateFailure, signatureOf, evaluateDefault, returnTypeString, ReturnValueGenerator, RuntimeExceptionParent, phpClass, isMarkedFloat and the others) are all synchronous and do no IO, so none needs a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The requests in 9.11.jsonl (ids XT-assert-17 and XT-assert-20) belong to Xaravel Tests, not to Upstream tests, so there are no Upstream inputs to compare. Each test file records why (the 'F-10:' header comments citing ESC-4.1-1, ESC-9.11-1, ESC-9.11-2 and ESC-4.7-1 item 2). The exprs are evaluated by PHP and PHPUnit; no expected value is written as PHP and signed. typed-doubles.test.ts also rebuilds the XT-assert-20 setup and exprs from the cell table and checks them against the committed line.","findings":[]}],"prior":[]}
```
