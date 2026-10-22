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

## PHP values: ints and floats

The grader reads PHP values by brand and protocol only and never imports `@xaravel/runtime` (AD-2). A number's PHP type is:

- int: a `bigint`, or a safe-integer `number` other than `-0`;
- float: any other `number` (a fraction, `-0`, `INF`, `NAN`, or beyond ±(2^53 − 1)), and any value carrying the runtime's float marker: a non-null object whose `[Symbol.for('xaravel.php.float')]` is `true` (`float(n)`, Story 9.5, DIV-9.4), whose value is `Number(v)`.

`assertSame`, `IsIdentical` and `willReturnMap` rows use PHP `===`: two numbers are identical only when both are ints with equal values, or both floats with equal values (`NAN` never; `0.0 === -0.0`). So `assertSame(1, float(1))` fails with `Failed asserting that 1.0 is identical to 1.`, and two separate `float(1)` values are identical. `==`, ordering, `assertEquals`, `assertIsFloat` / `assertIsInt`, `gettype` and the exporters read a marked float as the plain number with PHP type float, so an integral float exports as `1.0`, as PHPUnit's exporter and `var_export` do. A plain `-0` still prints `0` through `phpToString` and `phpVarExport` (the forms `@xaravel/mockery` prints); PHPUnit's exporter prints it `-0.0`. The `===`/`==` matrix of integral floats is checked against the Oracle (XT-assert-17, `conformance/oracle-requests/9.11.jsonl`).

## Rewriting a caught failure's message

Laravel's `TestResponseAssert::appendMessageToException` rewrites a caught `ExpectationFailedException`'s message through reflection. A port calls the `Symbol.for('xaravel.assert.setMessage')` method instead, which every PHPUnit exception has (on `PHPUnit\Framework\Exception`'s prototype, non-enumerable), without importing the grader:

```ts
const setMessage = Symbol.for("xaravel.assert.setMessage");
if (typeof e[setMessage] === "function") {
  e[setMessage](`${e.getMessage()}\n\n${message}\n`);
}
```

Called with a string, it makes that string what `getMessage()` returns, and sets the JS `message` to it followed by the suffix the class adds (`ExpectationFailedException`'s `--- Expected` / `+++ Actual` lines). Code, previous, cause and the comparison failure are unchanged, and it returns `null`. A non-string argument throws a JS `TypeError` naming the protocol (ESC-4.3-1 item 11, XT-assert-19).

## Test doubles

`TestCase` has PHPUnit 13.4.3's test doubles (Story 4.7, `decisions/ESC-4.4-2.md` item 6). PHPUnit does not delegate to Mockery; Mockery stays reachable through `Mockery.mock()`.

- `this.createMock(X)`: a mock object of `X`, a class or a contract token. Every method is doubled and no constructor runs. It is registered with the test case and verified after the body.
- `this.createPartialMock(X, ['m'])`: only `m` is doubled; the other methods are `X`'s.
- `this.getMockBuilder(X)` (a `MockBuilder`): `onlyMethods([...])`, `setConstructorArgs([...])`, `disableOriginalConstructor()`, `enableOriginalConstructor()`, then `getMock()`. The real constructor runs unless it is disabled.
- `TestCase.createStub(X)` or `this.createStub(X)`: a test stub. It has `method()` but no `expects()`, and it is never verified.
- On a double: `expects(this.once() | this.never() | this.exactly(n) | this.atLeastOnce() | this.any())`, then `method('m')`, `with(...)` (mock objects only) and `willReturn`, `willReturnOnConsecutiveCalls`, `willReturnCallback`, `willReturnMap`, `willReturnSelf` or `willThrowException`. `this.throwException(e)` is a stub value. `method('m')` without `expects()` is `expects(this.any())`.

A double is an instance of a generated subclass of `X`, so `instanceof X` holds. A contract token's double carries the token's brand; its methods are the names at `token[Symbol.for('xaravel.contract.methods')]`. Every internal is symbol-keyed. Messages name the target by its `Symbol.for("xaravel.class.fqcn")`, else its JS `name`.

There are no PHP types or reflection (ESC-4.7-1 item 2). An unconfigured call returns `null`. Parameter names (`$x`) come from the method's source text (`x` and `x = default` are `$x`; a trailing `...rest` is not a declared parameter); a destructured parameter makes the index name every parameter. An omitted declared argument is `null`. A double made without the constructor (`createMock`, `createStub`, `createPartialMock`, `disableOriginalConstructor()`) runs no field initializer: a declared field reads `undefined` where PHP has its declared default, a real method of a partial mock that touches a `#private` field throws, and the double of a built-in subclass lacks its internal slots. The APIs Upstream never calls (`createConfiguredMock`, `atLeast`, `withAnyParameters`, `willReturnArgument`, `seal`, …) are absent. PHPUnit's notices and deprecations for doubles are not emitted (ESC-4.7-1 item 3).

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
