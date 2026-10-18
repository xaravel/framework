# @xaravel/assert

PHPUnit-style assertions for Xaravel's Ported Tests (grader). Part of Xaravel, a TypeScript port of Laravel.

It has no Upstream Laravel package of its own.

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

None at run time.

- `@xaravel/mockery` (workspace, devDependency): Xaravel Test XT-assert-13 checks `createMock` against the real Mockery port (ESC-4.4-1). `@xaravel/assert` never imports it.

## `TestCase`

`TestCase` is PHPUnit 13.4.3's `PHPUnit\Framework\TestCase`: every `Assert` method, plus the expectations Upstream tests use.

- `expectException(X)`: `X` is a class or an interface token. `expectExceptionCode(code)`, `expectExceptionMessage(message)` (the message contains it, or is empty for `''`), `expectExceptionMessageMatches(regexp)` (a JS `RegExp`, DIV-10) and `expectExceptionObject(error)` (its class, message and code).
- `expectOutputString(text)`: what the test writes through `process.stdout.write`.
- `expectNotToPerformAssertions()`: records the kind `expectNotToPerformAssertions`. A test that also records any other kind passes, with PHPUnit's risky warning on stderr.
- `createMock(X)`: Mockery's mock of `X`. It calls `globalThis[Symbol.for('xaravel.mockery.mock')]`, which `@xaravel/mockery` installs on load, and throws an error naming `@xaravel/mockery` when it is not loaded.

`Assert` also has `assertThat(value, constraint)`, the file, directory and JSON assertions, `fail()` and `markTestSkipped()`, and the constraint factories `logicalAnd`, `greaterThanOrEqual`, `lessThanOrEqual` and `isInstanceOf`.

## The lifecycle

A `portedTest` whose `case` extends `TestCase` runs PHPUnit's `runLifecycle` order:

1. The output buffer starts.
2. `setUp()` runs.
3. The body runs. If it throws, the exception expectation checks the error (an assertion failure or a skip propagates unless the expected class is a PHPUnit exception); each check records `assertThat`. If it returns, a set expectation fails: `Failed asserting that exception of type "X" is thrown.`
4. When nothing failed and an output expectation exists, the buffer stops and the output is asserted (`assertSame`).
5. `tearDown()` runs. The first error wins.
6. The buffer stops if it still runs.

A case that is not a `TestCase` keeps Story 4.2's `setUp`, body, `tearDown` order.

## Skips

`markTestSkipped(message)` throws `SkippedWithMessageException`. A test whose run ends with it as its error ends as skipped: a skip thrown from `setUp()` or the body, or from `tearDown()` when nothing failed before it (the first error wins). Bun cannot skip a test that has started, so bun records a pass. The zero-assertion rule does not apply, and the harness report has a fifth key, `skipped: <message>` (ESC-4.4-2 item 1). Every other report has exactly `type`, `id`, `consequence` and `assertions`.

## The output channel

Only `TestCase` tests buffer output. The buffer captures `process.stdout.write`; Bun's `console.log` does not go through it. Output that no expectation asks for is written to the real stream when the buffer stops, as PHPUnit prints unexpected output (ESC-4.4-2 item 2).

## Coverage

`bun run assert:coverage` (tools/assert-coverage/coverage.ts) checks every name in `conformance/scans/phpunit-assertions.jsonl` against `Assert` and `TestCase`. The 15 names Laravel's and Testbench's testing traits declare are listed as `pending testing` or `pending testbench` until their owner's file exists (ESC-4.4-1). The report runs in CI's `check` job.
