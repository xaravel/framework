# @xaravel/assert

PHPUnit-style assertions for Xaravel's Ported Tests (grader). Part of Xaravel, a TypeScript port of Laravel.

It has no Upstream Laravel package of its own.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

None at run time.

- `@xaravel/mockery` (workspace, devDependency): Xaravel Test XT-assert-13 checks that `createMock` makes a PHPUnit mock object whether or not the real Mockery port is loaded, and that `Mockery.mock()` still works beside it. `@xaravel/assert` never imports it.

## `TestCase`

`TestCase` is PHPUnit 13.4.3's `PHPUnit\Framework\TestCase`: every `Assert` method, plus the expectations Upstream tests use.

- `expectException(X)`: `X` is a class or an interface token. `expectExceptionCode(code)`, `expectExceptionMessage(message)` (the message contains it, or is empty for `''`), `expectExceptionMessageMatches(regexp)` (a JS `RegExp`, DIV-10) and `expectExceptionObject(error)` (its class, message and code).
- `expectOutputString(text)`: what the test writes through `process.stdout.write`.
- `expectNotToPerformAssertions()`: records the kind `expectNotToPerformAssertions`. A test that also records any other kind passes, with PHPUnit's risky warning on stderr.
- `addToAssertionCount(n)` and `numberOfAssertionsPerformed()`: assertions without a kind (see "Test doubles").
- PHPUnit's test doubles, below.

`Assert` also has `assertThat(value, constraint)`, the file, directory and JSON assertions, `fail()` and `markTestSkipped()`, and the constraint factories `logicalAnd`, `greaterThanOrEqual`, `lessThanOrEqual`, `isInstanceOf` and `stringContains(string, case = true)` (PHPUnit passes `case` as the constraint's `ignoreCase`). Laravel's `assertArraySubset` records the kind `assertThat`, the PHPUnit assertion it calls (`decisions/ESC-4.3-1.md` item 8).

`assertInstanceOf(expected, actual)` and `assertNotInstanceOf` take a class, a contract token, or a class-string, as PHPUnit's do (ESC-13.1-9). The grader imports no runtime, so it resolves a string through `globalThis[Symbol.for('xaravel.class.lookup')]`, which a loaded `@xaravel/runtime` publishes: a registered class (a test class first) or a recorded contract token. A string that names neither, or any string when no runtime is loaded, throws `UnknownClassOrInterfaceException` `Class or interface "<name>" does not exist`. `expectException` and `assertContainsOnlyInstancesOf` still take no string.

## PHP values: ints and floats

The grader reads PHP values by brand and protocol only and never imports `@xaravel/runtime` (AD-2). A number's PHP type is:

- int: a `bigint`, or a safe-integer `number`, an unmarked `-0` included;
- float: any other `number` (a fraction, `INF`, `NAN`, or beyond ±(2^53 − 1)), and any value carrying the runtime's float marker: a non-null object whose `[Symbol.for('xaravel.php.float')]` is `true` (`float(n)`, Story 9.5), whose value is `Number(v)`, whatever it is.

Only the marker makes an integral number a float (`decisions/ESC-9.11-2.md`). An unmarked `-0` is therefore the int `0` for every reader and printer here (`===`, `gettype`, `IsType`, PHPUnit's exporter, `phpToString`, `phpVarExport`, `serialize`), unlike the runtime's `isFloat(-0)`, which is true. A JS port of a PHP int expression can yield `-0`, and PHP has no negative-zero int. A Ported Test whose assertion depends on a float, integral or negative zero, carries it with the marker (`float(1)`, `float(-0)`), marked `// adapted:DIV-9.4`.

`assertSame`, `IsIdentical` and `willReturnMap` rows use PHP `===`: two numbers are identical only when both are ints with equal values, or both floats with equal values (`NAN` never; `0.0 === -0.0`). So `assertSame(1, float(1))` fails with `Failed asserting that 1.0 is identical to 1.`, and two separate `float(1)` values are identical. `==`, ordering, `assertEquals`, `assertIsFloat` / `assertIsInt`, `gettype` and the exporters read a marked float as the plain number with PHP type float, so an integral float exports as `1.0`, as PHPUnit's exporter and `var_export` do, and `float(-0)` exports as `-0.0`. An integral marked float is the int key it stands for in `assertArrayHasKey`, and an int argument (`exactly()`, `assertCount`) or code. The `===`/`==` matrix of integral floats is checked against the Oracle (XT-assert-17, `conformance/oracle-requests/9.11.jsonl`).

## Rewriting a caught failure's message

Laravel's `TestResponseAssert::appendMessageToException` rewrites a caught `ExpectationFailedException`'s message through reflection. A port calls the `Symbol.for('xaravel.assert.setMessage')` method instead, which every `PHPUnit\Framework\Exception` has (on its prototype, non-enumerable; so every assertion failure, skip and test-double configuration error, but not `MockObject\RuntimeException`, `NeverReturningMethodException`, `ComparisonFailure` or `InvalidJsonException`), without importing the grader:

```ts
const setMessage = Symbol.for("xaravel.assert.setMessage");
if (typeof e[setMessage] === "function") {
  e[setMessage](`${e.getMessage()}\n\n${message}\n`);
}
```

Called with a string, it makes that string what `getMessage()` returns, and sets the JS `message` to it followed by the suffix the class adds (`ExpectationFailedException`'s `--- Expected` / `+++ Actual` lines). Code, previous, cause and the comparison failure are unchanged, and it returns `null`. A non-string argument throws a JS `TypeError` naming the protocol (ESC-4.3-1 item 11, XT-assert-19).

## Exceptions and the runtime's SPL classes

PHPUnit's `Exception` (so every assertion failure, skip and test-double configuration error, `EmptyStringException`, `UnknownClassOrInterfaceException` and Laravel's `Illuminate\Testing\Exceptions\InvalidArgumentException`) extends PHP's `\RuntimeException`, and so do the grader's other exceptions (`ComparisonFailure`, `InvalidJsonException`, `MockObject\RuntimeException`, `NeverReturningMethodException`). The grader cannot import the runtime (AD-2), and it freezes its exported classes, so it links them lazily (ESC-9.11-1, XT-assert-18): each extends an internal, unexported base, which extends the JS `Error`. When `@xaravel/runtime` has published `globalThis[Symbol.for('xaravel.php.classes')]` (one of its package entries has loaded), that base is re-parented onto the runtime's `RuntimeException`, at the grader's load when the map is already there, else at the first construction after it appears. From then on a grader exception is `instanceof` the runtime's `RuntimeException` and `Exception`, never its `Error`; its `getMessage()`, `getCode()`, `getPrevious()`, JS `message` and `name` are the same as without the map. Without the map, the chain is the class, the base, the JS `Error`.

With the map, `ExceptionComparator` takes only two instances of the runtime's `Exception`; a PHP `\Error` or a plain JS `Error` goes to `ObjectComparator`, as PHP sends `\Error` there. Without it, any two JS `Error`s are taken, as before (DIV-9.8). `expectException(RuntimeException)` (the runtime's) accepts the class, and its `Constraint\Exception` matches a PHPUnit failure. As in PHPUnit, an assertion failure under that expectation still fails the test: `ExceptionExpectation::shouldBeVerifiedFor` checks a PHPUnit exception only when a PHPUnit exception class is expected.

## Late failures

An assertion that fails after its test's counts have ended (a timer or an un-awaited promise the body left behind) does not throw into whichever test is running then (ESC-5.3-3, XT-assert-21). Every `assert*`, `assertThat` and `fail`, static or called on a test case, and the invocation rules of a PHPUnit double (`expects(never())`, `with(...)`), make sure the failure was reported to `globalThis[Symbol.for('xaravel.harness.late')]` as `{ id, kind }` (`kind` null for a double's rule; the harness fails the owning test) and return `null`. `markTestSkipped` and argument `TypeError`s still throw. Inside a running test, or outside any counted test, a failure throws as before.

## Test doubles

`TestCase` has PHPUnit 13.4.3's test doubles (Story 4.7, `decisions/ESC-4.4-2.md` item 6). PHPUnit does not delegate to Mockery; Mockery stays reachable through `Mockery.mock()`.

- `this.createMock(X)`: a mock object of `X`, a class or a contract token. Every method is doubled and no constructor runs. It is registered with the test case and verified after the body.
- `this.createPartialMock(X, ['m'])`: only `m` is doubled; the other methods are `X`'s.
- `this.getMockBuilder(X)` (a `MockBuilder`): `onlyMethods([...])`, `setConstructorArgs([...])`, `disableOriginalConstructor()`, `enableOriginalConstructor()`, then `getMock()`. The real constructor runs unless it is disabled.
- `TestCase.createStub(X)` or `this.createStub(X)`: a test stub. It has `method()` but no `expects()`, and it is never verified.
- On a double: `expects(this.once() | this.never() | this.exactly(n) | this.atLeastOnce() | this.any())`, then `method('m')`, `with(...)` (mock objects only) and `willReturn`, `willReturnOnConsecutiveCalls`, `willReturnCallback`, `willReturnMap`, `willReturnSelf` or `willThrowException`. `this.throwException(e)` is a stub value. `method('m')` without `expects()` is `expects(this.any())`.

A double is an instance of a generated subclass of `X`, so `instanceof X` holds. A contract token's double carries the token's brand; its methods are the names at `token[Symbol.for('xaravel.contract.methods')]`. Every internal is symbol-keyed. Messages name the target by its `Symbol.for("xaravel.class.fqcn")`, else its JS `name`.

**Declared signatures** (ESC-4.7-1 item 2, DIV-6.4, XT-assert-20). JS has no PHP types, so at each call a doubled method asks `globalThis[Symbol.for('xaravel.api.signature')]`, when it is a function, for the row of the class that declares it (its own `Symbol.for("xaravel.class.fqcn")` brand, else its JS name; the token's name for a contract token). The lookup is read at each call, never cached; the harness preload installs it from `conformance/api-surface/`. With a row:

- the parameters are named `$<name>` as the row declares them, and `Invocation`'s class is the declaring class, as PHPUnit's generated method names it;
- `toString()` ends in `: <type>`, the declared return type as sebastian/type writes it (`self` and `parent` resolved, a leading `?` dropped, union members sorted);
- an unconfigured call returns PHPUnit's generated value (`ReturnValueGenerator`, in its order): `never` throws `NeverReturningMethodException`; a nullable type, `void`, `mixed` or `null` is `null`; `true`; `false` or `bool` is `false`; `float` and `int` are `0`; `string` is `''`; `array` is `[]`; `static` is a new double of the same class; `object` is the runtime's `stdClass` (from its class map); `callable` and `Closure` an empty function; `Traversable`, `Generator` and `iterable` an empty generator; a class name is a stub of the class `globalThis[Symbol.for('xaravel.class.lookup')]` resolves (the target, the declaring class and its parent resolve without it). Anything else (a union of class names, an intersection, a class nothing resolves, `parent` of a class with no named parent, `object` with no class map) throws PHPUnit's `MockObject\RuntimeException` (`Return value for C::m() cannot be generated…`);
- an omitted argument (or an `undefined` one) is the parameter's declared default, and so is each missing position of a short `willReturnMap` row that has one, as PHPUnit's `normalizeValueMap` does. A parameter without a default is not padded. The grader evaluates the default forms the surface uses: `null`, `true`, `false`, ints and floats, quoted strings, list arrays of these, and `INF`, `PHP_EOL`, `PHP_INT_MAX`, `SORT_REGULAR`, `MB_CASE_FOLD` and `E_DEPRECATED`. Any other default (a keyed array, a class constant, an enum case, `new …`) throws `MockObject\RuntimeException` (`Default value <text> of parameter $<name> of C::m() cannot be evaluated by @xaravel/assert; pass the argument`) when it is needed, and is never replaced by `null`.

A float the grader generates (a `float` return, a float default) is a plain number, since only the runtime can make its float marker: an integral one reads as an int. A Ported Test whose assertion depends on it being a float configures it with the marker (`willReturn(float(0))`) or passes the argument, under DIV-9.4. `willReturn` is not type-checked against the declared return type, as PHPUnit's `IncompatibleReturnValueException` check would: checking a class type needs run-time class resolution the grader has only through optional protocols (the Story 9.11 decision for ESC-4.7-1 item 2's open question).

With no lookup, or no row (a test-local class), there are no PHP types or reflection (DIV-6.4). An unconfigured call returns `null`. Parameter names (`$x`) come from the method's source text (`x` and `x = default` are `$x`; a trailing `...rest` is not a declared parameter); a destructured parameter makes the index name every parameter. An omitted declared argument is `null`. A double made without the constructor (`createMock`, `createStub`, `createPartialMock`, `disableOriginalConstructor()`) runs no field initializer: a declared field reads `undefined` where PHP has its declared default, a real method of a partial mock that touches a `#private` field throws, and the double of a built-in subclass lacks its internal slots. The APIs Upstream never calls (`createConfiguredMock`, `atLeast`, `withAnyParameters`, `willReturnArgument`, `seal`, …) are absent. PHPUnit's notices and deprecations for doubles are not emitted (ESC-4.7-1 item 3).

**Counting.** Mock objects count without an assertion kind, as PHPUnit's `addToAssertionCount` does. That is one count per verified mock object with an invocation count rule, one per constrained argument of a matched call, and one per over-count failure the test ends with. These counts satisfy the zero-assertion rule and make an `expectNotToPerformAssertions` test risky. They never appear in the report's `assertions`, as the Inventory records only `Assert::assert*` kinds (ESC-4.7-1 item 1). A mock object without an expectation counts nothing.

## The lifecycle

A `portedTest` whose `case` extends `TestCase` runs PHPUnit's `runLifecycle` order:

1. The output buffer starts.
2. `setUp()` runs.
3. The body runs. If it throws, the exception expectation checks the error (an assertion failure or a skip propagates unless the expected class is a PHPUnit exception); each check records `assertThat`. If it returns, a set expectation fails: `Failed asserting that exception of type "X" is thrown.`
4. When the body did not fail, the mock objects are verified (`verifyTest`), in the order they were made. The first unmet expectation fails the test.
5. When nothing failed and an output expectation exists, the buffer stops and the output is asserted (`assertSame`).
6. `tearDown()` runs. The first error wins.
7. The buffer stops if it still runs.

A case that is not a `TestCase` keeps Story 4.2's `setUp`, body, `tearDown` order.

## Skips

`markTestSkipped(message)` throws `SkippedWithMessageException`. A test whose run ends with it as its error ends as skipped: a skip thrown from `setUp()` or the body, or from `tearDown()` when nothing failed before it (the first error wins). Bun cannot skip a test that has started, so bun records a pass. The zero-assertion rule does not apply, and the harness report has a fifth key, `skipped: <message>` (ESC-4.4-2 item 1). Every other report has exactly `type`, `id`, `consequence` and `assertions`.

## The output channel

Only `TestCase` tests buffer output. The buffer captures `process.stdout.write`; Bun's `console.log` does not go through it. Output that no expectation asks for is written to the real stream when the buffer stops, as PHPUnit prints unexpected output (ESC-4.4-2 item 2).

## Coverage

`bun run assert:coverage` (tools/assert-coverage/coverage.ts) checks every name in `conformance/scans/phpunit-assertions.jsonl` against `Assert` and `TestCase`. The 15 names Laravel's and Testbench's testing traits declare are listed as `pending testing` or `pending testbench` until their owner's file exists (ESC-4.4-1). The report runs in CI's `check` job.
