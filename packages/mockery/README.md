# @xaravel/mockery

A Mockery-compatible mocking API for Xaravel tests (grader). Part of Xaravel, a TypeScript port of Laravel.

It has no Upstream Laravel package of its own.

The package also ports the subset of `jasonmccreary/double` v1.0.1 that the Upstream ai, mcp and boost suites use (`Double`, `OverriddenDouble` and `Argument`, under `src/JMac/Testing/`). Double is MIT-licensed, © Jason McCreary; its notice is kept in `src/JMac/Testing/LICENSE`. Auto-verification is wired into the Mockery run protocol (`Symbol.for('xaravel.mockery.run')`): `Double.enableAutoVerify()` in a test stands for VerifiesDoubles' `#[Before]`, and when it was called the run then performs its `#[After]`, after Mockery's close: `Double.verifyAll()` when the test body resolved and Mockery's close passed, otherwise only the ambiguity check (ESC-4.8-1).

Xaravel is an independent open-source project. It is not affiliated with, sponsored by or endorsed by Laravel Holdings Inc.

## Dependencies

- `@xaravel/assert` (workspace): grader packages may depend on grader packages (AD-2).
