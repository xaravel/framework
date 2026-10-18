---
test_ids:
  - XT-assert-11
  - XT-assert-12
  - XT-assert-14
trigger: contract
proposed: >-
  Adopt the contracts Story 4.4 builds to, as written here, and name owners
  for items (6) and (7). (1) Skips.
  A test whose run ends with PHPUnit's `SkippedTest` (`markTestSkipped`,
  thrown from setUp or the body, or from tearDown when nothing failed before
  it) ends as skipped. Bun 1.4.3 has no run-time skip, so bun
  records a pass, the zero-assertion rule does not apply, and the test's
  harness report gets a fifth key, `skipped: <message>`. Every other report
  keeps exactly its four keys. Story 5.3's harness reads that key and
  reports the test as skipped. A risky test (`expectNotToPerformAssertions`
  and then an assertion) passes with PHPUnit's warning on stderr only; its
  report does not show it. Proposed: Story 5.3 decides whether the report
  carries it. (2) The output channel. `expectOutputString`
  compares what a TestCase test writes through `process.stdout.write`
  (Bun's `console.log` bypasses it). Output written there with no
  expectation is written through to the real stream when the test ends, as
  PHPUnit prints unexpected output. Whoever ports PHP's output (`echo`,
  `print`, `printf`, output buffering) writes through `process.stdout.write`.
  (3) The wrong-class message of `expectException` ends with PHPUnit's
  filtered PHP stack trace; the port ends it with the JS stack's frame
  locations, one per line. Accept this as a message-only difference, like
  ESC-4.3-1 item 13; the Xaravel Tests compare such a message up to and
  including `" at\n"`. (4) The coverage report (`bun run assert:coverage`)
  runs in CI's `check` job, which is not a required check. A missing name
  fails that job but does not block a merge until the Maintainer makes
  `check` required, or moves the step into a required job. (5) The `testing`
  owner of ESC-4.4-1 is the `foundation` package path: the component map
  gives `Illuminate\Foundation\` to `foundation`, so the report looks for
  `Illuminate\Foundation\Testing\Concerns\<Trait>` at
  `packages/foundation/src/Testing/Concerns/<Trait>.ts` (AD-3), not at
  ESC-4.4-1's example `packages/testing/src/Foundation/Testing/Concerns/…`.
  Epic 57's Stories port those traits there. (6) PHPUnit's own test doubles.
  Upstream's `createMock(` calls (61 lines under the suites' `tests/`) use
  PHPUnit's MockObject API (`method()->willReturn()`,
  `expects($this->once())`, `willThrowException()`), and the suites also
  call `getMockBuilder` (290 lines), `createStub` (20),
  `addToAssertionCount` (3) and `stringContains` (1). Delegating
  `createMock` to Mockery (ESC-4.4-1) does not serve that API, and no Story
  owns a port of PHPUnit's MockObject. Proposed owner: a follow-up `assert`
  Story that ports PHPUnit's MockObject, MockBuilder and stubs (or Story 4.6
  through an amendment), with `addToAssertionCount` and `stringContains`.
  (7) PHPUnit's `Exception` extends PHP's `\RuntimeException`. The grader
  cannot import the runtime's SPL classes (AD-2, AD-15), so its
  `PHPUnit\Framework\Exception` extends only the JS `Error`, and a Ported
  Test's `catch (RuntimeException $e)` (12 Upstream lines) around a PHPUnit
  failure behaves differently. Proposed: the Epic 9 runtime owns the SPL
  classes and exposes them through a `Symbol.for` protocol the grader reads
  for `instanceof`, joining ESC-4.3-1 item 14 and ESC-4.5-1 item 2.
evidence: >-
  (1) Probed 2026-10-18: Bun 1.4.3's `test()` callback has no way to mark the
  running test skipped once it has started (`test.skip` and `test.skipIf`
  apply only at declaration). PHPUnit's `runLifecycle` ends the test with
  `TestStatus::skipped($t->getMessage())` for any `SkippedTest`
  (vendor/phpunit/phpunit/src/Framework/TestCase.php, handleThrowableFromTest).
  XT-assert-6 checks the four-key report shape, so the skip needs a key
  only skipped tests carry. (2) Probed 2026-10-18: in `bun test`,
  `console.log` does not call `process.stdout.write`, so replacing
  `process.stdout.write` is the only capture that sees exactly what a test
  writes through it. PHPUnit's OutputBuffer captures PHP's output buffer
  (TestCase/OutputBuffer.php), which `echo` writes to; no Xaravel package
  decides yet how PHP's output is ported. (3) `Constraint\Exception`
  appends `Filter::stackTraceFromThrowableAsString($other)`
  (Constraint/Exception/Exception.php), PHP `file:line` frames with
  PHPUnit's own frames filtered out; a JS error has no PHP frames. (4)
  `.github/rulesets/main.json` and `REQUIRED_CHECKS` in
  tools/ruleset/ruleset.ts do not list `check`. (5) conformance/component-map
  line 42 maps `Illuminate\Foundation\` to `foundation`; it has no `testing`
  row for that namespace, and `packages/testing` holds Laravel's
  `Illuminate\Testing\` classes. (6) Counted with `grep -rF` over
  `conformance/upstream/*/tests` on 2026-10-18; PHPUnit's
  `TestCase::createMock` returns a `MockObject`
  (vendor/phpunit/phpunit/src/Framework/TestCase.php:1044), not a Mockery
  mock. (7) `class Exception extends RuntimeException`
  (vendor/phpunit/phpunit/src/Framework/Exception/Exception.php).
---

# ESC-4.4-2: skips, the output channel, the wrong-class trace, the coverage report's job, the `testing` owner's path, PHPUnit's test doubles and `RuntimeException`

Story 4.4 builds to five contracts that other Stories or the Maintainer own, and found two gaps that need an owner. None blocks the Story. The item numbers match `proposed`.

1. **The `skipped` report key (Story 5.3).** `markTestSkipped` throws `SkippedWithMessageException`. A test whose run ends with it (from setUp or the body, or from tearDown when nothing failed before) is skipped. Bun cannot skip a test that has started, so a skipped test passes in bun and its report carries `skipped: <message>`. A risky test (`expectNotToPerformAssertions`, then an assertion) shows only as a warning on stderr, not in its report. Proposed: Story 5.3's harness reads the `skipped` key and reports the test as skipped, and decides whether a report carries the risky flag; no other report gains a key.
2. **The output channel (whoever ports PHP's output).** `expectOutputString` compares what the test writes through `process.stdout.write`; `console.log` is not captured. Unexpected output is written through when the test ends. Proposed: the Story that ports `echo` and output buffering writes through `process.stdout.write`.
3. **The wrong-class message's trace.** PHPUnit ends `Failed asserting that exception of type "B" matches expected exception "A". Message was: "…" at` with PHP's filtered trace; the port ends it with the JS stack's frame locations. Proposed: accept as a message-only difference (like ESC-4.3-1 item 13).
4. **Where the coverage report runs.** `bun run assert:coverage` runs in the `check` job, which is not a required check. A missing name fails the job but does not block a merge. Proposed: the Maintainer makes `check` required, or moves the step into a required job.
5. **The `testing` owner's path.** ESC-4.4-1 names `testing` as the owner of `Illuminate\Foundation\Testing\Concerns\*`. The component map gives `Illuminate\Foundation\` to `foundation`, so the report reads `packages/foundation/src/Testing/Concerns/<Trait>.ts`. Proposed: Epic 57's Stories port the traits there.
6. **PHPUnit's own test doubles.** Upstream's `createMock(` calls (61 lines) use PHPUnit's MockObject API (`method()->willReturn()`, `expects($this->once())`, `willThrowException()`); `getMockBuilder` (290), `createStub` (20), `addToAssertionCount` (3) and `stringContains` (1) are used too. Delegating `createMock` to Mockery does not serve them, and no Story owns a PHPUnit MockObject port. Proposed owner: a follow-up `assert` Story (or Story 4.6 through an amendment).
7. **`RuntimeException`.** PHPUnit's `Exception` extends PHP's `\RuntimeException`, which the grader cannot import, so a Ported Test's `catch (RuntimeException $e)` around a PHPUnit failure behaves differently. Proposed: the Epic 9 runtime owns the SPL classes behind a `Symbol.for` protocol the grader reads (with ESC-4.3-1 item 14 and ESC-4.5-1 item 2).

The options:

1. **Adopt the contracts and the owners as `proposed` (proposed).** Each owner builds to them; a change goes through a follow-up `assert` Story or a Maintainer-approved Infrastructure Story.
2. **Have Story 4.4 decide the harness key, the output channel and the CI job itself.** Those belong to Story 5.3, the owner of PHP's output, and the Maintainer (Protected Paths and the ruleset).
3. **Fail skipped tests until Story 5.3, and capture no output.** A skipped Ported Test would fail every run, and `expectOutputString` would have nothing to compare.
