# @xaravel/mockery

A Mockery-compatible mocking API for Xaravel tests (grader). Part of Xaravel, a TypeScript port of Laravel.

It has no Upstream Laravel package of its own.

The package also ports the subset of `jasonmccreary/double` v1.0.1 that the Upstream ai, mcp and boost suites use (`Double`, `OverriddenDouble` and `Argument`, under `src/JMac/Testing/`). Double is MIT-licensed, © Jason McCreary; its notice is kept in `src/JMac/Testing/LICENSE`. Auto-verification is wired into the Mockery run protocol (`Symbol.for('xaravel.mockery.run')`): `Double.enableAutoVerify()` in a test stands for VerifiesDoubles' `#[Before]`, and when it was called the run then performs its `#[After]`, after Mockery's close: `Double.verifyAll()` when the test body resolved and Mockery's close passed, otherwise only the ambiguity check (ESC-4.8-1).

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## PHP's SPL classes

Mockery's exceptions extend grader-internal copies of PHP's `\Exception` and the seven SPL classes Mockery 1.6.15 reaches (`\RuntimeException`, `\LogicException`, `\InvalidArgumentException`, `\BadFunctionCallException`, `\BadMethodCallException`, `\OutOfBoundsException`, `\UnexpectedValueException`, under `src/php/`). They are not exported and stay frozen. Each copy sits on an internal parent (`src/php/SplParent.ts`, Story 9.12, ESC-4.5-1 item 2). When `@xaravel/runtime` has published `globalThis[Symbol.for('xaravel.php.classes')]`, the eight parents are re-parented together onto the runtime classes of the same PHP names. From then on every Mockery exception is `instanceof` the runtime's SPL classes along PHP's chain and its `\Exception`, never its `\Error`, so `expectException(\BadMethodCallException::class)` matches a Mockery failure as in PHP. `instanceof` a copy then delegates to the runtime class of its name, and construction runs the runtime constructor with its PHP argument coercion. Unlinked, construction keeps the raw values as passed, so a non-int code throws the runtime's `TypeError` only once linked. Once linked, `instanceof <copy>` also matches any runtime or framework instance of that PHP class (a runtime `\RuntimeException` is `instanceof` Mockery's `RuntimeException` copy). `getMessage()`, `getCode()`, `getPrevious()`, `message`, `name` and the own properties are the same with and without the map. The grader never imports the runtime (AD-2): it reads the map by its symbol only.

The link applies at this package's load when the map is already published, else on the first construction of any Mockery exception, an `instanceof` on a copy, or an `andThrow('<class name>')` lookup after the map appears. It is one-way. Late-load limit: an exception built before the runtime loaded reads as the runtime's classes only once one of those happens; until then, `e instanceof <runtime class>` is false. With no runtime loaded, the chain is the copies' own, ending at the JS `Error`.

## Dependencies

- `@xaravel/assert` (workspace): grader packages may depend on grader packages (AD-2).
