---
title: 'Story 4.4: Exception, output, file and JSON assertions, and the coverage report'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '88778696ce542c31cd7e88944027815be70d875b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-core-phpunit-assertions.md'
  - '{project-root}/docs/ops/oracle.md'
  - '{project-root}/docs/ops/scans.md'
  - '{project-root}/decisions/ESC-4.4-1.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Story 4.4 builds on contracts in ESC-4.4-2, which is raised but not ruled on.
    evidence: |-
      Items 1-7 (skip report key, stdout output channel, JS trace in the wrong-class message, advisory check job, foundation path for the testing owner, PHPUnit test doubles, RuntimeException base) await the Maintainer. Story 4.3 shipped beside the open ESC-4.3-1 the same way. A ruling settles whether any item must change the code.
    location: >-
      conformance/escalations/ESC-4.4-2.md
    severity: medium (unverified)
  - summary: >-
      The risky-test warning text is hand-written runner output, not Oracle-sourced, and is not in the report.
    evidence: |-
      PHPUnit's runner prints it; the Oracle evaluator has no runner. ESC-4.4-2 item 1 records that it is visible only on stderr. Story 5.3's harness design settles whether it needs a report key.
    location: >-
      packages/assert/src/declarations/Declarations.ts
    severity: low (unverified)
  - summary: >-
      @xaravel/assert now has a devDependency on @xaravel/mockery, which depends on @xaravel/assert.
    evidence: |-
      graph:check passes and ESC-4.4-1 asks for this devDependency. Whether the lockstep release tooling (Story 1.8) tolerates a devDependency cycle is untested; a release dry run settles it.
    location: >-
      packages/assert/package.json
    severity: medium (unverified)
  - summary: >-
      A TestCase test's tearDown errors and skips do not take precedence the way PHPUnit 13.4.3's `tearDownTest` gives them.
    evidence: |-
      Follow-up pass (2026-10-18). `runLifecycle` keeps the first error (`first ??=`, portedTest.ts), and Declarations.ts ends any test whose final error is a `SkippedTest` as skipped. PHPUnit's `tearDownTest` (TestCase.php:1402-1436) returns a tearDown `AssertionFailedError` over any earlier error, and `SkippedWithMessageException` is one. It returns any other tearDown throwable when nothing failed before it or the earlier error was a skip, and `TestStatus::failure` is set for an assertion failure from tearDown. So four cases differ. (a) A skip from tearDown after a passing body: PHPUnit fails the test, and the port skips it. (b) A body failure, then a tearDown assertion failure or skip: PHPUnit reports tearDown's, and the port reports the body's. (c) A body skip, then a tearDown error: PHPUnit reports the error, and the port skips. (d) A body failure, then a tearDown error that is not an assertion failure: the two agree, and XT-assert-12 now pins it. ESC-4.4-2 item 1 proposes the port's rule as the contract ("or from tearDown when nothing failed before it"), and the Story's Design Notes call it "first error wins". Changing the code would contradict the open Escalation, so the Maintainer's ruling on item 1 must take PHPUnit's rule into account. Target: ESC-4.4-2 item 1 (retro epic-4 item 7).
    location: >-
      packages/assert/src/declarations/portedTest.ts (runLifecycle), packages/assert/src/declarations/Declarations.ts
    severity: medium
  - summary: >-
      The wrong-class message's JS trace keeps grader and bun frames, and a message line that starts with "    at " is read as a frame.
    evidence: |-
      Follow-up pass (2026-10-18). `stackTraceOf` (Throwable.ts:35-45) keeps every `    at` line of `error.stack`. Those lines include the message's own lines, and it filters no frames, where PHPUnit's `Filter::stackTraceFromThrowableAsString` drops its own frames. The Xaravel Tests compare the message only up to `" at\n"`. ESC-4.4-2 item 3 proposes the whole trace as a message-only difference. Target: ESC-4.4-2 item 3 (retro epic-4 item 7).
    location: >-
      packages/assert/src/Framework/Throwable.ts:35
    severity: low
  - summary: >-
      `TestReport.skipped` is an optional key, which is an absent-value form that AD-9 does not name (null is the only absent value).
    evidence: |-
      Follow-up pass (2026-10-18). Declarations.ts declares `readonly skipped?: string` and leaves the key out of every report that is not a skip, so that XT-assert-6's four-key shape holds. ESC-4.4-2 item 1 proposes the fifth key but does not mention AD-9. `skipped: null` on every report would break XT-assert-6 (Story 4.2's contract), so the shape needs a ruling, not an agent patch. Target: ESC-4.4-2 item 1 (retro epic-4 item 7). Story 5.3 reads the key.
    location: >-
      packages/assert/src/declarations/Declarations.ts:37
    severity: low
---

<intent-contract>

## Intent

**Problem:** Ported Tests still lack the other PHPUnit names the Upstream suites use: `expectException*`, `fail`, `markTestSkipped`, `assertThat` and the file, directory, JSON and output assertions. There is also no CI report that shows which scanned assertion is still unimplemented (FR-116, Story 4.4 AC 1–4).

**Approach:** Port the 16 PHPUnit 13.4.3 names that `conformance/scans/phpunit-assertions.jsonl` lists and Story 4.3 did not cover. 10 are on `Assert`, and 6 are `TestCase` expectations that `portedTest` checks after the body, in PHPUnit's `runTest` order. Add `expectExceptionCode` and the exception API that ESC-4.3-1 item 12 assigns to 4.4. Make `createMock` delegate to `@xaravel/mockery`, and add a coverage report over the scan. ESC-4.4-1 governs AC 3's ordering and the report's handling of the 15 names that are not PHPUnit's.

**The 16 PHPUnit names:**
- `Assert`: `assertDirectoryExists`, `assertDirectoryDoesNotExist`, `assertFileExists`, `assertFileDoesNotExist`, `assertStringEqualsFile`, `assertJson`, `assertJsonStringEqualsJsonString`, `assertThat`, `fail` and `markTestSkipped`.
- `TestCase`: `expectException`, `expectExceptionMessage`, `expectExceptionMessageMatches`, `expectExceptionObject`, `expectNotToPerformAssertions` and `expectOutputString`.

## Boundaries & Constraints

**Always:**
- Pass, fail and report messages exactly as PHPUnit 13.4.3 does. Every expected message comes from a signed Oracle fixture (`conformance/oracle-requests/4.4.jsonl`), never from a hand-written string.
  - The evaluator does not run `runBare`. Expectation outcomes therefore come from exprs that call the same PHPUnit pieces `runTest` calls: `Assert::assertThat` with `Constraint\Exception\*`, and the `assertWasRaised` messages.
  - The exception code is returned as a value.
- Count as the Inventory recorder does: a kind is recorded at the entry of an outermost `Assert::assert*` call. `fail` counts as one assertion (`Assert::$count++`). The expectation checks count through `assertThat`. `markTestSkipped` counts nothing.
- `expectNotToPerformAssertions` records an explicit kind, as ESC-4.2-1 item 6 proposes. The test is then risky if it performs any assertion.
- The grader stays isolated. It imports only relative, `node:` and `bun:` modules, and its exports are frozen. XT-assert-3's export list grows by exactly the new names.

**Never:**
- Fake or stub Mockery (AGENTS.md). Implement Laravel's or Testbench's helpers in the grader. Change XT-assert-1..10 or the ASSERTIONS list of 51.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Expected throw | `expectException(X)`, then the body throws `X` | passes; statements after the throw do not run | — |
| Nothing thrown | `expectException(X)`, then the body returns | fails: `Failed asserting that exception of type "X" is thrown.` | — |
| Message only | `expectExceptionMessage('m')`, then nothing is thrown | fails: `Failed asserting that exception with message containing "m" is thrown` (no period) | — |
| Wrong class | `expectException(A)`, then the body throws `B` | fails: Oracle message from `Constraint\Exception\Exception` | — |
| Object | `expectExceptionObject(new X('m', 3))` | checks class, message (contains) and code | — |

</intent-contract>

## Code Map

- `packages/assert/src/Framework/Assert.ts:71-74` -- the private `assertThat`. Expose it as a public static that records `assertThat`. Statics whose names start with `assert` are mirrored onto the prototype at :576-584. `fail`, `markTestSkipped` and `expect*` need explicit instance methods. Instance signatures are at :464-516. `ASSERTIONS` (:518-574, 51 names) stays unchanged; add a separate 4.4 list.
- `packages/assert/src/Framework/Constraint.ts` -- the `Constraint` base, `LogicalNot` and `LogicalOr`. Add `DirectoryExists`, `FileExists`, `IsJson`, `JsonMatches`, `Constraint\Exception\{Exception,ExceptionCode,ExceptionMessageIsOrContains,ExceptionMessageMatchesRegularExpression}`, and `logicalAnd`/`greaterThanOrEqual`/`lessThanOrEqual`/`isInstanceOf` factories. These four are the only constraint factories Upstream tests call (`Support/DateFacadeTest.php:24`).
- `packages/assert/src/declarations/portedTest.ts:63-85` -- `inner` runs `setUp`, then the body, then `tearDown`. The expectation and output checks need a post-body step there, before `tearDown`, as PHPUnit's `runTest`/`runBare` does. `markTestSkipped` needs a skip outcome in `Declarations.ts:41-74`.
- `packages/assert/src/declarations/AssertionCounter.ts:22` -- `recordAssertion`.
- `packages/assert/src/Framework/{AssertionFailedError,ExpectationFailedException,ComparisonFailure}.ts` -- ESC-4.3-1 item 12: `getCode()`, `getPrevious()`, `toString()`, the `PHPUnit\Framework\Exception` base and `ComparisonFailure::getDiff()`.
- `packages/assert/tests/xaravel/{assertions.test.ts,operands.ts,assertion-cells.ts,oracle-values.ts}` -- the 4.3 Oracle test pattern to reuse. `comparison.test.ts:234` holds XT-assert-3's export list.
- `tools/oracle/request.ts:157,172` -- `makeRequest` and `renderRequests`, for generating `4.4.jsonl` from a throwaway script.
- `tools/scans/test-api.ts`, `docs/ops/scans.md:161-171` -- the scan's name and `executions` rules.
- `.github/workflows/ci.yml:97-118` -- the `check` job, where the coverage report runs.
- Upstream reference: `/tmp/xaravel-inv/framework/vendor/phpunit/phpunit/src/Framework/{Assert.php:1384-1625,2774-2796,3277-3299,TestCase.php:916-976,1250,1460,TestCase/ExceptionExpectation.php,TestCase/OutputBuffer.php}`.

- `packages/mockery/src/Mockery.ts:137` -- already installs `globalThis[Symbol.for('xaravel.mockery.mock')]` on load (ESC-4.4-1); `createMock` calls it. `packages/mockery/src/php/Exception.ts` -- the `getMessage()`/`getCode()`/`getPrevious()` protocol the expectation checks read.
- `packages/assert/tests/xaravel/declarations.test.ts` + `fixtures/` -- 4.2's child-`bun test` runner pattern; reuse it to run declared `TestCase` tests and read their failure messages and reports.
- `tools/baseline/recorder.php:10-30,64-74` -- counting rule: a kind is recorded only at an outermost `Assert::assert*` call. `fail`/`markTestSkipped`/`expect*` are never recorded by it; the scan's `executions: 0` for them is that, not dead code.
- `conformance/component-map:42` -- `Illuminate\Foundation\` maps to `foundation`; Testbench has no row. `conformance/api-surface/foundation.jsonl` confirms the declaring traits.
- Upstream reference (read-only): `/tmp/xaravel-inv/framework/vendor/phpunit/phpunit/src/Framework/{TestCase.php:381-440 (runLifecycle order),1250-1395,1460-1484 (runTest),TestCase/ExceptionExpectation.php,TestCase/OutputBuffer.php,Constraint/Exception/*,Constraint/Filesystem/*,Constraint/String/IsJson.php,Constraint/JsonMatches.php,Exception/{Exception,AssertionFailedError,ExpectationFailedException,Skipped/*}.php}`, `phpunit/src/Util/Json.php`, `TestRunner/TestRunner.php:160-290`; `sebastian/comparator/src/ComparisonFailure.php:73-97`; `sebastian/diff` 9.0.1 `src/{Differ,MyersDiff,Output/StrictUnifiedDiffOutputBuilder}.php`; `laravel/framework/src/Illuminate/Foundation/Testing/Concerns/{InteractsWithDatabase,InteractsWithAuthentication,InteractsWithExceptionHandling}.php`; `orchestra/testbench-core/src/Concerns/InteractsWithPublishedFiles.php`.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/Framework/Exception/Exception.ts` (new), `AssertionFailedError.ts`, `ExpectationFailedException.ts` -- `PHPUnit\Framework\Exception` (message, `code` int|string as PHP: a string code is appended as ` (exception code: <c>)` and becomes 0, `previous`), with `getMessage()`, `getCode()`, `getPrevious()`. `AssertionFailedError extends Exception` and adds `toString()` (= `getMessage()`). `ExpectationFailedException(message, comparisonFailure, previous)`. Existing `getMessage()`/JS `message` behaviour unchanged.
- `packages/assert/src/Framework/Exception/SkippedWithMessageException.ts` (new) -- extends AssertionFailedError, branded as a `SkippedTest`.
- `packages/assert/src/diff/{Differ,MyersDiff,StrictUnifiedDiffOutputBuilder}.ts` (new) + `ComparisonFailure.ts` -- port sebastian/diff 9.0.1 as far as `getDiff()` needs; add `getDiff()` and `toString()` with comparator's options (header `"\n--- Expected\n+++ Actual\n"`, 3 context lines).
- `packages/assert/src/util/Json.ts` (new) -- PHP `json_decode`/`json_validate` grammar and error kinds (depth 512, control character, syntax, UTF-8; int vs float kept), `canonicalize` (objects `ksort` SORT_STRING, recursive) and `prettify` (`JSON_PRETTY_PRINT|UNESCAPED_SLASHES|UNESCAPED_UNICODE`), with PHP's `json_encode` scalar forms (`serialize_precision=-1`, integral float as `1.0`, `\/` and `\uXXXX` escapes by default).
- `packages/assert/src/Framework/Constraints.ts` or new `Constraint/*.ts` -- `DirectoryExists`, `FileExists`, `IsJson`, `JsonMatches`, `LogicalAnd`, and `Exception`, `ExceptionCode`, `ExceptionMessageIsOrContains`, `ExceptionMessageMatchesRegularExpression` (RegExp per DIV-10), each with PHPUnit's wording.
- `packages/assert/src/Framework/Assert.ts` -- public static `assertThat(value, constraint, message='')` (records `assertThat`); the 9 other Assert names per Design Notes "Counting"; constraint factories `logicalAnd`, `greaterThanOrEqual`, `lessThanOrEqual`, `isInstanceOf`; `fail` and `markTestSkipped` mirrored to the prototype explicitly; a frozen `ASSERTIONS_4_4` list of the 16 names. `ASSERTIONS` unchanged.
- `packages/assert/src/Framework/TestCase.ts` (new) -- `PHPUnit\Framework\TestCase extends Assert` with `expectException`, `expectExceptionCode`, `expectExceptionMessage`, `expectExceptionMessageMatches`, `expectExceptionObject`, `expectNotToPerformAssertions`, `expectOutputString` and `createMock`. Per-instance state in a module `WeakMap`, read by `portedTest` through an internal accessor.
- `packages/assert/src/declarations/{portedTest,Declarations,xaravelTest}.ts` -- for a `TestCase` instance, run PHPUnit's lifecycle order (Design Notes "Lifecycle"); a `SkippedTest` from any phase ends the test as skipped; the risky-test warning; header comments updated.
- `packages/assert/src/index.ts` -- export and freeze `TestCase`, `Constraint`, `Exception`, `SkippedWithMessageException`. XT-assert-3's list in `tests/xaravel/comparison.test.ts` grows by exactly these four.
- `packages/assert/package.json` -- `devDependencies: {"@xaravel/mockery": "workspace:*"}` (ESC-4.4-1); `dependencies` stays absent. Run `bun install` and check `bun run graph:check`.
- `tools/assert-coverage/coverage.ts` (new), root `package.json` script `assert:coverage`, root `tsconfig.json` include, `.github/workflows/ci.yml` `check` job step `Report assertion coverage` -- the report per Design Notes "Coverage report".
- `conformance/oracle-requests/4.4.jsonl` -- `php-expr` requests for XT-assert-11 and XT-assert-12, generated by a throwaway script with `makeRequest`/`renderRequests`. `bun run oracle:story check 4.4`.
- `packages/assert/tests/xaravel/expectations.test.ts` (new) + `fixtures/expectations.fixture.ts` -- XT-assert-11..14, one per AC in order.
- `conformance/escalations/ESC-4.4-2.md` -- `trigger: contract`, `test_ids: [XT-assert-11, XT-assert-12, XT-assert-14]`, items per Design Notes "Escalation". `bun run escalations:check`.
- `packages/assert/README.md` or `docs/` -- document `TestCase`, the lifecycle, the skip report key and the output channel.
- `stories/4.4.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status `done` when finished.

**Acceptance Criteria:**
- Given declared `TestCase` tests run in a child `bun test`, when XT-assert-11 runs `expectException(X)` with a body that throws `X` (and a subclass of `X`), throws nothing, or throws another class, and an `AssertionFailedError` thrown under `expectException(RuntimeException-like)`, then the first passes and no statement after the throw runs, and each other outcome and message equals the Oracle's (`ExceptionExpectation` driven in the request). A wrong-class message is compared up to and including `" at\n"`. Each passing test's report counts `assertThat` once.
- Given the signed fixtures for `4.4.jsonl`, when XT-assert-12 runs `expectExceptionMessage`, `expectExceptionMessageMatches`, `expectExceptionCode`, `expectExceptionObject`, `expectOutputString` (matching, different, empty), `expectNotToPerformAssertions`, `fail`, `markTestSkipped`, `assertThat` with `logicalAnd(greaterThanOrEqual, lessThanOrEqual)`, and the file, directory, `assertStringEqualsFile`, `assertJson` and `assertJsonStringEqualsJsonString` matrices (including `getDiff()` and `toString()` of the JSON comparison failure), then every outcome, message and exported string equals the Oracle's. A missing, unsigned or errored fixture fails, never skips. A skipped test's report carries `skipped: <message>`; a test with only `expectNotToPerformAssertions` passes.
- Given `@xaravel/mockery` loaded, when XT-assert-13 calls `this.createMock(X)` in a `TestCase`, then it returns Mockery's mock of `X` (`shouldReceive` works, and an unmet expectation fails the test with Mockery's message); and in a child process without Mockery loaded it throws an error naming `@xaravel/mockery`.
- Given `phpunit-assertions.jsonl`, when XT-assert-14 runs `bun run assert:coverage` on the repository, then it exits 0, lists no missing `assert` name and lists the 15 non-PHPUnit names as `pending testing` / `pending testbench`; against a temp root (a symlink to the real `packages/assert`) whose scan adds a name the grader lacks, or which holds an owner file without its method, it exits 1 naming each missing name.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 46 findings — high 0, medium 2, low 22, false 18, maybe-false 4
- findings:
  - `[low]` `[patch]` (blind) Story marked done while XT-assert-11/12 fail and records disagree — by design the fixtures are signed on the PR by `oracle.yml#story`; spec status is set at finalize. Recorded as false-in-substance; no change beyond finalize. (verdict low: records briefly disagree mid-run)
  - `[maybe-false]` `[defer]` (blind) Story ships on contracts of an unruled ESC-4.4-2 — 4.3 shipped beside open ESC-4.3-1 the same way; whether any item needs a ruling first is the Maintainer's call. Deferred.
  - `[medium]` `[patch]` (blind) `createMock` does not serve Upstream's PHPUnit MockObject API (`method()`, `expects()`, `getMockBuilder`, `createStub`) — the intent fixes delegation to Mockery; gap recorded as ESC-4.4-2 item 6 with a proposed owner.
  - `[low]` `[patch]` (blind) risky outcome only on stderr — noted in ESC-4.4-2 item 1.
  - `[low]` `[patch]` (blind) stdout capture survives a timed-out test — OutputBuffer now restores to the real write captured at module load.
  - `[low]` `[patch]` (blind) PHPUnit `Exception` lacks a `\RuntimeException` base — the grader cannot import one (AD-15); ESC-4.4-2 item 7.
  - `[false]` `[reject]` (blind) `getDiff()` empty check should treat `"0"` as empty — comparator 8.4.0 `ComparisonFailure.php:75` uses `=== ''` on both strings.
  - `[low]` `[reject]` (blind) `assertStringEqualsFile` decodes files as UTF-8 — actual values are JS strings (DIV-9), non-UTF-8 fixture files are rare, and byte-faithful comparison needs a binary string model.
  - `[low]` `[reject]` (blind) coverage `declaresMember` regex matches non-declarations — owner files do not exist yet and their Stories' own tests will exercise them; names are plain identifiers.
  - `[false]` `[reject]` (blind) `sameCell` accepts any argument TypeError — the same rule as 4.3's accepted XT-assert-8 contract (engine `TypeError` text names PHP call sites).
  - `[low]` `[patch]` (blind) `intOrString` names wrong PHP types and loses bigint precision — fixed to PHP type names and exact bigint digits.
  - `[low]` `[patch]` (blind) SkippedTest brand is module-local — now `Symbol.for`.
  - `[medium]` `[patch]` (blind) missing Oracle cells (skip under expectException, output with failing body, StringEqualsFile on a directory, interface token, flagged RegExp, tearDown skip) — cells added for the first four; flagged RegExp prints as `String(regexp)` like 4.3; tearDown skip documented as implemented.
  - `[false]` `[reject]` (blind) new classes lack `registerClass` — the grader may not import the runtime (AD-15 isolation); 4.3/4.5 classes follow the same `Symbol.for('xaravel.class.fqcn')` pattern.
  - `[low]` `[patch]` (gap) `expectExceptionMessageMatches` string → TypeError untested — check added to XT-assert-12.
  - `[low]` `[patch]` (gap) expected output leaking to stdout untested — marker assertion added.
  - `[low]` `[patch]` (gap) PHPUnit `Exception` protocol untested — direct assertions added.
  - `[false]` `[reject]` (gap) XT-assert-11/12 cannot pass yet — intended; the fixtures are signed on the PR before merge.
  - `[false]` `[reject]` (edge) canonicalize must turn numeric-key objects into lists — PHPUnit `Util/Json.php` casts to array, `ksort(SORT_STRING)`, then casts back to object, so objects stay objects.
  - `[false]` `[reject]` (edge) JsonMatches should compare loosely — PHPUnit 13.4.3 `JsonMatches::matches` uses `===`.
  - `[false]` `[reject]` (edge) `1e400` should match — PHPUnit's canonicalize returns an error when `json_encode` fails, so it does not match either.
  - `[low]` `[reject]` (edge) non-Error thrown value under expectException gives a misleading message — PHP can throw only Throwables; ported code throws Errors.
  - `[low]` `[reject]` (edge) non-Error value with message/code expectation — same as above.
  - `[low]` `[reject]` (edge) OutputBuffer decodes Uint8Array chunks per write — split multibyte writes are rare; fix needs a streaming decoder.
  - `[low]` `[reject]` (edge) concurrent TestCase buffers — bun runs a file's tests serially unless `test.concurrent`, which ports do not use.
  - `[low]` `[reject]` (edge) expectExceptionObject with a null code names the wrong argument — no ported exception returns null from `getCode()`.
  - `[low]` `[patch]` (edge) bigint code loses precision — fixed with the `intOrString` patch above.
  - `[low]` `[reject]` (edge) non-integral number code is appended to the message — PHP coerces with a deprecation; rare, guard adds complexity.
  - `[low]` `[reject]` (edge) coverage regex misses `export function` declarations — same heuristic as above; owner files do not exist.
  - `[low]` `[reject]` (edge) scan parse error line number after blank lines — cosmetic.
  - `[false]` `[reject]` (edge) inherited names such as `toString` count as implemented — scan names are `assert*`/`expect*`/`fail`/`markTest*` only.
  - `[false]` `[reject]` (edge) claim: integral float encodes as `1.0` — PHP 8.5.11 probe: `json_encode(1.0)` is `"1"`; the code is right and the spec's Json task wording was wrong.
  - `[false]` `[reject]` (edge) claim: canonicalize uses SORT_REGULAR — PHPUnit source uses `ksort($json, SORT_STRING)`.
  - `[low]` `[reject]` (intent) `expectExceptionObject` checked against a hand-composed decomposition — the request composes exactly `TestCase.php:969-974`.
  - `[maybe-false]` `[defer]` (intent) risky warning text is hand-written, not Oracle-sourced — it is runner output, not an assertion message; whether it counts as a "report message" is open.
  - `[false]` `[reject]` (intent) skip outcome tested against hand-written expectations — a test outcome has no Oracle analogue; the exception class and message are Oracle-checked.
  - `[false]` `[reject]` (intent) output checks record `assertSame`, not `assertThat` — that is the recorder rule the intent names first (OutputBuffer calls `Assert::assertSame`).
  - `[false]` `[reject]` (intent) TypeError relaxation — duplicate of the `sameCell` row above.
  - `[low]` `[reject]` (intent) counts are not compared to the Inventory — the Inventory never ran these names (`executions: 0`); counts follow the recorder rule.
  - `[medium→low]` `[patch]` (intent) "the exception code is returned as a value" — cells now return `getCode()`.
  - `[false]` `[reject]` (intent) createMock / advisory CI step — duplicates of ESC-4.4-2 items 4 and 6.
  - `[false]` `[reject]` (intent) grader isolation — confirmed clean.
  - `[maybe-false]` `[defer]` (blind) dev-dependency cycle assert↔mockery — `graph:check` passes; whether the release tooling tolerates devDependency cycles is unverified.
  - `[maybe-false]` `[defer]` (intent) risky not in the report — duplicate concern of ESC item 1; deferred with it.
  - `[low]` `[reject]` (edge) OutputBuffer string chunk written with a non-utf8 encoding argument — not used by ported code.
  - `[low]` `[reject]` (blind) `declaresMember` builds an unescaped regex — names are identifiers.

### 2026-10-18 — Follow-up review pass
This pass covers the Story's squash commit (`328471d`, without `_bmad-output/` and `conformance/fixtures/`). It ran because `followup_review_recommended` was `true` (retro epic-4 item 6, finding S5). Findings were checked against `main` at `9cced98` plus the local 4.1/4.3 follow-up commit `e8a9382`. That tree includes retro items 1–5 (#126, #134, #135, #136, #132). The four layers ran as parallel subagents. PHPUnit source was read at `/tmp/xaravel-inv/framework/vendor/phpunit/phpunit`.
- verdicts: 42 findings — high 0, medium 3, low 20, false 16, maybe-false 3
- findings:
  - Blind Hunter
    - `[false]` `[reject]` The coverage report checks only that names exist. — Retro item 5 (#132) fixed this. `coverage.ts` now calls each `Assert`/`TestCase.prototype` method inside `runCounted` and requires a recorded assertion. It runs outcome probes in a child `bun test` for the six names that record nothing. The `declaresMember` half is carried (the two `declaresMember` rows): the names come from a fixed table of identifiers.
    - `[medium]` `[patch]` `createMock` sends PHPUnit's MockObject API to Mockery. — carried (first-pass createMock row): recorded as ESC-4.4-2 item 6 with a proposed owner. Not patched again.
    - `[low]` `[reject]` `OutputBuffer.stop()` restores the write saved at module load, so it removes a wrapper installed later. — True. But restoring the write found at `start()` would let an abandoned capture (a timeout) stay in place for the rest of the process, which is what the first-pass patch removed. No code in the repo wraps `process.stdout.write` around a TestCase test (the conformance tests that wrap it run no TestCase). The trade-off is now written in the comment.
    - `[low]` `[patch]` A timed-out TestCase test leaves its capture in place until another TestCase test stops a buffer, and the comment says otherwise. — Verified: bun abandons the lifecycle, so `finally` never runs. Output from non-TestCase tests in between is lost, though the timed-out test has already failed. Patched the `OutputBuffer.ts` comment to state the real window. A behavior fix needs a guard on every test.
    - `[low]` `[patch]` Skip and lifecycle paths are untested (skip from tearDown, failure then tearDown, skip with an unmet Mockery expectation, skip with an output expectation). — Grouped with the Verification Gap row. The Mockery part is false: on a rejection, `run` (Mockery.ts:187-193) calls `mockery_close`, which tears down without verifying, so a skip stays a skip. A skip with an output expectation follows PHPUnit (`$e === null` guard). The tearDown skip cases differ from PHPUnit; see the Edge Case Hunter claim row.
    - `[false]` `[reject]` JSON canonicalization edge cases (`{"0":"a","1":"b"}` against `["a","b"]`, mixed key order) are not checked by the Oracle. — A probe shows `canonicalize` keeps `{"0":"a","1":"b"}` an object and `["a","b"]` a list. It sorts `{"10":1,"2":2,"1":3}` as `{"1":3,"10":1,"2":2}` (SORT_STRING). Both match `Util/Json.php::recursiveSort`, which casts back to an object. The request already covers numeric-string keys and reordered keys.
    - `[low]` `[reject]` `assertStringEqualsFile` reads the file as UTF-8. — carried (first-pass UTF-8 row). Reading from a directory is an existing cell.
    - `[low]` `[patch]` File cells use fixed shared temp names, so concurrent runs race. — Verified: the parent writes `tmpdir()/xt-assert-12-<n>.txt` in `beforeAll` and deletes it in `afterAll`. A second checkout running `bun test` at the same time (the orchestrator runs concurrent agents) can delete another run's files. Patched `expectation-cells.ts` so the TS paths carry `process.pid`. No path reaches a message, so the PHP setup and the signed request are unchanged.
    - `[low]` `[defer]` The wrong-class trace keeps grader and bun frames, and parses `error.stack`, so a message line that starts with `    at ` becomes a frame. — Verified in `Throwable.ts:35-45`. This is the trace ESC-4.4-2 item 3 proposes as a message-only difference. Recorded in `deferred` (ESC-4.4-2 item 3, retro epic-4 item 7).
    - `[low]` `[defer]` `TestReport.skipped?: string` is an absent-value form that AD-9 does not name. — Verified at Declarations.ts:37. `skipped: null` on every report would break XT-assert-6's four keys. The key's shape is ESC-4.4-2 item 1. Recorded in `deferred` (ESC-4.4-2 item 1, retro epic-4 item 7).
    - `[false]` `[reject]` `stories/4.4.md` is done with `test_ids: []`. — `test_ids` holds Upstream Test IDs, of which this Story has none. `xaravel_test_ids` lists XT-assert-11..14.
    - `[low]` `[reject]` A non-Error thrown value is reported as nothing thrown. — carried (first-pass non-Error row).
    - `[false]` `[reject]` The TypeError of `expectExceptionObject` says Throwable, but PHPUnit 13 declares `\Exception`. — `TestCase.php:969` declares `expectExceptionObject(Throwable $exception)`.
    - `[false]` `[reject]` `getDiff()` checks `=== ""` where comparator uses PHP falsiness. — carried (first-pass `getDiff` row). The vendored `ComparisonFailure.php:93` uses `=== ''`.
    - `[false]` `[reject]` `ASSERTIONS_4_4` leaves out `expectExceptionCode`, `createMock` and the factories. — By the Tasks, the list is the intent's 16 scan names. `expectExceptionCode` (5 cells), the four factories (THAT_CELLS) and `createMock` (XT-assert-13) are each tested.
    - `[low]` `[reject]` A non-integer number code (1.5, NaN) is appended as a string code. — carried (first-pass non-integral code row).
  - Edge Case Hunter
    - `[false]` `[reject]` `'0'` and `'-0.0'` are equal under PHP's `==`. — `JsonMatches::matches` compares the re-encoded strings with `===`. PHP encodes them as `0` and `-0`, and the port's `canonicalize` gives `"0"` and `"-0"`, so both fail.
    - `[false]` `[reject]` For equal non-empty strings, `getDiff()` returns `''` where PHP returns the header. — `StrictUnifiedDiffOutputBuilder::getDiff` returns `''` when nothing changed. A probe of the port with `"a\nb"`/`"a\nb"` gives `""`.
    - `[false]` `[reject]` `'0'` should be empty in `getDiff()`. — carried (first-pass `getDiff` row).
    - `[low]` `[reject]` An object with integer-like keys reorders in `getExpected()`/`getActual()`. — Only the decoded values that `toPhpValue` builds are affected. The prettified strings, which reach messages and diffs, keep PHP's order (probe above). A JS plain object cannot keep integer-like keys in insertion order (the AD-9 form), so a fix needs a new object representation.
    - `[low]` `[reject]` A decoded `1.0` is reported as int `1`. — This is the interim DIV-9 `1 === 1.0` state (`decisions/ESC-4.1-1.md`). Retro finding S4 is its owner, and item 8 takes it.
    - `[low]` `[patch]` A sticky (`y`) RegExp is anchored at 0 by `search()`, so a later match is missed, and the comment says `y` is ignored. — Verified: `"a boom".search(/boom/y)` is `-1`. Story 4.3's `Constraint\RegularExpression` strips `g`/`y`, so the two layers disagreed. Patched `ExceptionMessageMatchesRegularExpression.ts` to test a fresh RegExp without `g`/`y`, as 4.3 does. Added an XT-assert-12 check with `/boom/y` and a `g` pattern whose `lastIndex` is past the match.
    - `[false]` `[reject]` `ExceptionCode` rejects a null or non-integral code that PHP's string cast would match. — `ExceptionCode::matches` has the same `!is_int && !is_string` pre-check.
    - `[low]` `[patch]` After a bun timeout, later non-TestCase output is captured and lost. — Grouped with the Blind Hunter timeout row (comment patched).
    - `[low]` `[reject]` `write(chunk, 'hex')` captures the encoded text. — carried (first-pass encoding-argument row).
    - `[low]` `[reject]` A non-UTF-8 file is decoded lossily. — carried (first-pass UTF-8 row).
    - `[low]` `[reject]` `expectExceptionCode(NaN)`/`Infinity` is a TypeError where PHP's coercive `int|string` takes a string. — No test passes a NaN code, and accepting it needs a coercion branch.
    - `[low]` `[reject]` A subclass with a `code = 5` field throws, because `code` is non-configurable. — Upstream tests do not subclass `PHPUnit\Framework\Exception` with a code field. Making `code` configurable would let `code` and `getCode()` disagree.
    - `[false]` `[reject]` A thrown object with the shared skip brand but no `getMessage` gives a TypeError. — Every copy of `SkippedWithMessageException` inherits `getMessage()` from `Exception`. Only a hand-made object has the brand without it.
    - `[false]` `[reject]` (claim) json_encode writes an integral float as `1.0`. — carried (first-pass `1.0` row): PHP prints `1`.
    - `[medium]` `[defer]` (claim) A skip from tearDown after an earlier failure is dropped, and a body skip passes under `expectException(AssertionFailedError)`. — The second half matches PHPUnit: `shouldExceptionExpectationsBeVerified` is true when the expected class is a `PHPUnit\Framework\Exception` subclass. The first half is real and wider than claimed. PHPUnit's `tearDownTest` (TestCase.php:1402-1436) lets a tearDown `AssertionFailedError` (a skip is one) replace any earlier error and marks it a failure. It lets a tearDown error replace an earlier skip. The port keeps the first error and ends a tearDown skip as skipped. ESC-4.4-2 item 1 proposes the port's rule as the contract, so a code change would contradict the open Escalation. Recorded in `deferred` (ESC-4.4-2 item 1, retro epic-4 item 7). The cases where the two agree are now pinned (Verification Gap row).
    - `[false]` `[reject]` (claim) The diff builder diverges when there is no hunk. — The port returns `''` for no entries and for no change, as `StrictUnifiedDiffOutputBuilder::getDiff` does (probes above).
  - Verification Gap
    - `[low]` `[patch]` On the TestCase path, `runLifecycle`'s tearDown handling has no test: a `first =` mutation and a dropped tearDown call pass. — Added `ProbeTearDown` and `ThrowInTearDown` TestCase fixtures (testTearDownRuns, testTearDownRunsAfterFailure, testTearDownThrows, testBodyFailsThenTearDownThrows). XT-assert-12 asserts their probes, junit results and final errors. These cover only the cases where PHPUnit's `tearDownTest` agrees with the port: tearDown runs after a pass and after a failure, its error fails a passing test, and a body assertion failure beats a tearDown `Error`. The tearDown skip cases differ from PHPUnit and are deferred, not pinned. The `first =` mutation now fails XT-assert-12; checked, then reverted.
  - Intent Alignment
    - `[medium]` `[defer]` The Oracle tests ExceptionExpectation pieces, not `TestCase`'s lifecycle, so `expectExceptionObject`'s mapping, setUp-before-body, output-before-tearDown, tearDown precedence and setUp skips have no Oracle witness. — The intent itself accepts that the evaluator does not run `runBare`. Reading `runLifecycle`/`tearDownTest` against the port shows the tearDown precedence is wrong. That is grouped with the tearDown claim row, in the same `deferred` item. The `expectExceptionObject` mapping is `TestCase.php:969-974`, carried (first-pass `expectExceptionObject` row).
    - `[low]` `[reject]` Assertion counts are hand-written literals. — carried (first-pass counts row).
    - `[low]` `[patch]` Messages are compared loosely: the wrong-class message only up to `" at\n"`, and TypeErrors by class and `"Argument #"`. — The TypeError half is verified: Story 4.3's comparison was tightened in `e8a9382`, but `expectations.test.ts` still had the loose rule. Patched `sameCell` to drop PHP's `", called in …"` tail and compare the rest exactly. The signed 4.4 fixtures' two TypeError cells (`assertJson(null)`, …) still match. The wrong-class half is ESC-4.4-2 item 3, in the trace `deferred` item.
    - `[maybe-false]` `[defer]` The risky warning text and the skip report shape do not come from the Oracle. — carried (first-pass risky row, and the skip-outcome row). Not deferred again.
    - `[maybe-false]` `[defer]` The `expectNotToPerformAssertions` cell witnesses only that it does not throw; risky is tested against hand-written stderr. — carried (first-pass risky row).
    - `[maybe-false]` `[defer]` The Story builds on the unapproved ESC-4.4-2. — carried (first-pass ESC-4.4-2 row): the existing `deferred` item, waiting on the Maintainer (retro epic-4 item 7).
    - `[false]` `[reject]` The coverage report checks presence. — Fixed by retro item 5 (#132), as in the first Blind Hunter row.
    - `[false]` `[reject]` The diff edits files outside `packages/assert/**`. — Story 4.4 is a Phase 0 Story. `decisions/MAINT-2026-10-16-unattended-orchestrator.md` amendment 2 approves its out-of-scope paths.
    - `[false]` `[reject]` It adds more than the 16 names. — The intent's Approach asks for `expectExceptionCode`, the ESC-4.3-1 item 12 exception API and `createMock`. The Code Map names the four factories (`Support/DateFacadeTest.php:24`), and the Tasks name `ASSERTIONS_4_4`.

## Design Notes

**Lifecycle** (PHPUnit 13.4.3 `runLifecycle`, for a body whose `this` is a `TestCase`): start the output buffer → `setUp` → body (`runTest`: on a throw, `shouldBeVerifiedFor` — false for any `PHPUnit\Framework\Exception`, so assertion failures and skips propagate unless the expected class is one — then `verify`; else `assertWasRaised`) → if no error and an output expectation exists, stop the buffer and `assertSame(expected, output)` per expected string → `tearDown` (first error wins) → stop the buffer if still running. Mockery's run protocol (ESC-4.5-1) still wraps all of it. A non-`TestCase` `this` keeps 4.2's path unchanged.

**Output channel.** `expectOutputString` compares what the test wrote through `process.stdout.write` (Bun's `console.log` bypasses it; probed 2026-10-18). Only `TestCase` tests buffer. Output captured with no expectation is written through to the real stream when the buffer stops, as PHPUnit prints unexpected output. ESC-4.4-2 item 2 names this as the contract for whoever ports PHP's output (`echo`).

**Exception protocol.** A thrown value's message is `getMessage()` when it is a function, else `message`; its code is `getCode()` when a function, else `0`. Its class name is `classNameOf` (4.3). `expectException(X)` takes a class or interface token (`classOrInterface`), matched with `instanceof`. The wrong-class message ends with PHP's filtered trace; the port appends the JS stack's frame locations, one per line, and tests compare up to `" at\n"` (ESC-4.4-2 item 3).

**Counting** (Inventory rule; nested calls made by Assert itself are not recorded): `assertThat` and each file/dir/JSON assertion record their own name; `assertStringEqualsFile`'s inner `assertFileExists` and `assertJsonStringEqualsJsonString`'s inner `assertJson` do not. Expectation checks record `assertThat` (ExceptionExpectation) or `assertSame` (OutputBuffer), as their PHP callers are not Assert. `fail` records `fail` (intent). `markTestSkipped` and `assertWasRaised`'s `addToAssertionCount` paths record nothing. `expectNotToPerformAssertions` records `expectNotToPerformAssertions` (ESC-4.2-1 item 6's proposal, adopted by the intent); when the test also recorded any other kind, a risky warning `This test is not expected to perform assertions but performed <n> assertion(s)` goes to stderr and the test still passes (Laravel's phpunit.xml.dist does not fail risky tests).

**Skip.** Bun 1.4.3 has no runtime skip (probed). A `SkippedTest` thrown from `setUp` or the body ends the test: bun records a pass, FR-113's zero-assertion rule does not apply, and the report gets a fifth key `skipped: <message>`; every other report keeps exactly its four keys (XT-assert-6 stays green). ESC-4.4-2 item 1 hands the key to Story 5.3.

**Coverage report** (`bun run assert:coverage [--root <dir>]`). Reads `<root>/conformance/scans/phpunit-assertions.jsonl`; imports `<root>/packages/assert/src/index.ts`. A fixed table in the tool maps the 15 non-PHPUnit names to their declaring FQCN (ESC-4.4-1): `Illuminate\Foundation\Testing\Concerns\{InteractsWithDatabase,InteractsWithAuthentication,InteractsWithExceptionHandling}` → owner label `testing` (Epic 57), AD-3 file `packages/foundation/src/Testing/Concerns/<Trait>.ts` (component map: `Illuminate\Foundation\` → `foundation`); `Orchestra\Testbench\Concerns\InteractsWithPublishedFiles` → `testbench` (Epic 59), `packages/testbench/src/Concerns/InteractsWithPublishedFiles.ts`. Every other scan name is `assert`-owned: implemented when `Assert` or `TestCase.prototype` has a function of that name. A non-`assert` name is implemented when its owner file declares a member of that name; while the file is absent it prints `pending <owner>: <name> (<FQCN>)`. Output: one line per unimplemented name grouped by owner, then a summary; exit 1 when an `assert` name is missing, an owner file exists without the name, or a scan name is in neither class; 2 on usage error.

**Requests.** `XT-assert-11` and `XT-assert-12` `php-expr` requests drive PHPUnit's own pieces, as the evaluator does not run `runBare`: `new \PHPUnit\Framework\TestCase\ExceptionExpectation` (`expectClass`/`expectMessageIsOrContains`/`expectMessageMatches`/`expectCode`, then `shouldBeVerifiedFor`/`verify` or `assertWasRaised($this)`), `new \PHPUnit\Framework\TestCase\OutputBuffer` (`expectString`, `start`, `echo`, `stop`, `performAssertions`), and direct `Assert` calls. Cells are wrapped as in 4.3 (`xt_cell`) and also capture `getDiff()`/`toString()` where a ComparisonFailure exists. File cells use paths that exist in both environments (`/`, `/tmp`, `/etc/hosts`), fixed non-existent paths (`/xaravel-nonexistent/…`), and files the setup writes under `sys_get_temp_dir()` with fixed contents (only contents reach messages). JSON cells cover objects with reordered keys, numeric-string keys, nesting, `1` vs `1.0`, big ints, unicode and `/`, `""`, whitespace-only, control characters, depth 513, trailing commas and non-strings.

**Escalation ESC-4.4-2** (contract, raised with the Story, not blocking): (1) the `skipped` report key for Story 5.3; (2) `process.stdout.write` as the output channel, for the owner of PHP output; (3) the wrong-class message's trace is JS's (message-only difference, like ESC-4.3-1 item 13); (4) the coverage report runs in the advisory `check` job, which is not a required check, so a missing name fails CI but does not block a merge until the Maintainer makes `check` required; (5) the `testing` owner label maps to the `foundation` package path for `Illuminate\Foundation\Testing\Concerns\*`.

## Verification

**Commands:**
- `bun run oracle:story check 4.4`, `bun run escalations:check`, `bun run graph:check`, `bun run scaffold:check`, `bun run ownership:check`, `bun run typecheck`, `bun run lint` -- expected: pass.
- `bun run assert:coverage` -- expected: exit 0, 15 pending lines, no missing `assert` name.
- `bun test` -- expected: all pass except XT-assert-11/12's fixture-reading cells, which name their missing signed fixtures until `oracle.yml#story` commits them on the PR.
- Local cross-check: copy the requests outside the repo, `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 <copy>`, sign with a throwaway key into a temp root, run the tests against it -- expected: 0 mismatches (never committed).

## Auto Run Result

Status: done (2026-10-18, rebuilt after ESC-4.4-1 was approved).

**Summary.** `@xaravel/assert` gains PHPUnit 13.4.3's remaining 16 scan names: the file, directory and JSON assertions, a public `assertThat` with the `logicalAnd`/`greaterThanOrEqual`/`lessThanOrEqual`/`isInstanceOf` factories, `fail`, `markTestSkipped`, and a `TestCase` with the six `expect*` names plus `expectExceptionCode` and `createMock`. It also gains the exception API from ESC-4.3-1 item 12: PHPUnit's `Exception` base, `getCode`, `getPrevious`, `toString`, and `ComparisonFailure::getDiff()`/`toString()` through a sebastian/diff 9.0.1 port. `portedTest` runs PHPUnit's `runLifecycle` order for `TestCase` instances. A skip ends a test with a fifth report key, `skipped`. The coverage report is `bun run assert:coverage`, which runs in CI's `check` job.

**Files.**
- `packages/assert/src/Framework/{Exception/Exception,Exception/SkippedWithMessageException,AssertionFailedError,ExpectationFailedException,ComparisonFailure}.ts`: the exception API.
- `packages/assert/src/diff/*`: the sebastian/diff port.
- `packages/assert/src/util/Json.ts`: PHP JSON decode, validate and encode, plus `canonicalize` and `prettify`.
- `packages/assert/src/Framework/Constraint/**`, `Constraint.ts`: the file, JSON, exception and `LogicalAnd` constraints.
- `packages/assert/src/Framework/{Assert,TestCase,TestCase/ExceptionExpectation,TestCase/OutputBuffer,Throwable}.ts`: the assertions, the expectations and the output buffer.
- `packages/assert/src/declarations/{portedTest,Declarations,xaravelTest}.ts`: the lifecycle, skips and the risky warning.
- `packages/assert/src/index.ts`: the exports, now including `TestCase`, `Constraint`, `Exception` and `SkippedWithMessageException`.
- `packages/assert/package.json`, `bun.lock`: the mockery devDependency.
- `packages/assert/README.md`: docs.
- `packages/assert/tests/xaravel/{expectations.test.ts,expectation-cells.ts,fixtures/expectations.fixture.ts,fixtures/mock.fixture.ts,comparison.test.ts}`: XT-assert-11..14, plus XT-assert-3's export list.
- `conformance/oracle-requests/4.4.jsonl`: 5 requests.
- `conformance/escalations/ESC-4.4-2.md`: 7 contract items.
- `tools/assert-coverage/coverage.ts`, root `package.json` and `tsconfig.json`, `.github/workflows/ci.yml`, `conformance/tests/xaravel/repository-policy.test.ts`: the coverage report and its CI step. XT-conformance-33 pins the `check` job's steps and gains one line.
- `stories/4.4.md`, `sprint-status.yaml`: status.

**Review.** 46 findings: 0 high, 2 medium, 22 low, 18 false, 4 maybe-false.
- Patched (2 medium, 11 low):
  - an `OutputBuffer` restore that is safe on timeout;
  - PHP type names and exact bigints in `intOrString`;
  - a shared skip brand;
  - Oracle cells for a skip under `expectException`, output with a failing body, `assertStringEqualsFile` on a directory, and interface tokens;
  - the exception code in every cell;
  - tests for the DIV-10 string pattern, expected output kept off stdout, and the `Exception` protocol;
  - docs for skips;
  - ESC-4.4-2 items 6 (PHPUnit test doubles) and 7 (the `\RuntimeException` base), and item 1 (risky).
- Deferred (3): ESC-4.4-2 awaits a ruling; the risky text is not Oracle-sourced; the devDependency cycle.
- Rejected: each row in the Review Triage Log, with its reason.
- One spec error: the Json task's "integral float as `1.0`" is wrong. PHP 8.5.11 prints `1`, and the code follows PHP.

**Follow-up review recommended: true.** Two medium entries were patched. The named unverified risk: the new Oracle cells (file paths in the image, `/etc/hosts`, `sys_get_temp_dir()`, the PHP notice from `@`) are verified only against a local PHP 8.5.11, not the Oracle image. The PR's signed fixtures settle it.

**Verification.**
- Pass: `oracle:story check 4.4` (5 accepted), `escalations:check`, `graph:check`, `scaffold:check`, `ownership:check`, `typecheck`, `lint`, `oracle:verify-fixtures` and `workflows:check`.
- `assert:coverage` exits 0 with 82 names: 67 implemented, 15 pending, 0 missing.
- `bun test` gives 145 pass and 2 fail. The 2 are XT-assert-11/12, and they fail only on missing signed fixtures.
- A local unsigned cross-check with a throwaway key passed XT-assert-11..14.

**Residual risks.**
- The coverage report's CI job, `check`, is not a required check (ESC-4.4-2 item 4).
- `createMock` returns a Mockery mock, while Upstream calls PHPUnit's MockObject API on it (ESC-4.4-2 item 6).

Previous attempt (before ESC-4.4-1 was ruled):

Status: blocked
Blocking condition: ESC-4.4-1, raised during planning, before any code was built.
- (1) AC 3's `createMock` needs Story 4.5's Mockery. A test that passes now needs a fake Mockery, which AGENTS.md forbids. 4.5 comes after 4.4, so the epic would deadlock. Proposed: build 4.5 first.
- (2) 15 of the 31 remaining scan names are Laravel's Foundation testing helpers (Epic 57) or Testbench's (Epic 59), not PHPUnit's. All have `executions: 0`, and ESC-3.7-1's ruling allows excluding such a name from the coverage report only through an approved Escalation. Proposed: owner-mapped coverage.

Resume: after the ruling, set this spec back to `draft`. Then rebuild from the Intent and Code Map above, amended by the ruling.

### Follow-up review (2026-10-18)

This pass ran for retro epic-4 item 6 (finding S5). It covered `328471d` and was checked against `main` at `9cced98` plus `e8a9382`. There were 42 findings: 3 medium, 20 low, 16 false and 3 maybe-false.
- **Patched (5 entries, all low).** No change to the requests, the fixtures or any expected value:
  - `packages/assert/src/Framework/Constraint/Exception/ExceptionMessageMatchesRegularExpression.ts`: it matches with a fresh RegExp without `g`/`y`, as Story 4.3's `RegularExpression` does. Before, a sticky pattern was anchored at 0. XT-assert-12 has a new check for it.
  - `packages/assert/src/Framework/TestCase/OutputBuffer.ts`: the comment now gives the real window in which a timed-out test's capture stays installed, and says that a later wrapper is replaced (comment only).
  - `packages/assert/tests/xaravel/expectations.test.ts`: `sameCell` compares a TypeError's message exactly, without PHP's `", called in …"` tail, as 4.3's follow-up does.
  - `packages/assert/tests/xaravel/fixtures/expectations.fixture.ts` and `expectations.test.ts`: four TestCase tearDown tests, for the cases where PHPUnit's `tearDownTest` agrees with the port.
  - `packages/assert/tests/xaravel/expectation-cells.ts`: the file cells' TS temp paths carry the process id, so concurrent runs do not delete each other's files.
- **Deferred (3 new entries, in `deferred`).** Each needs a Maintainer ruling on ESC-4.4-2 (retro epic-4 item 7):
  - The tearDown precedence differs from PHPUnit's `tearDownTest` (medium). A skip from tearDown fails in PHPUnit. A tearDown assertion failure or skip replaces an earlier error, and a tearDown error replaces an earlier skip. ESC-4.4-2 item 1 proposes the port's rule, so the ruling needs this evidence. Target: ESC-4.4-2 item 1.
  - The wrong-class trace is unfiltered, and message lines can be read as frames (low). Target: ESC-4.4-2 item 3.
  - The optional `skipped` report key is an absent-value form that AD-9 does not name (low). Target: ESC-4.4-2 item 1.
- **Carried.** The first pass's rows keep their routes: createMock is ESC-4.4-2 item 6, and the risky text and ESC-4.4-2 are deferred.
- **Rejected.** The rest, with reasons in the Review Triage Log. Retro item 5 (#132) closed the presence-only coverage finding. The other false rows were refuted from PHPUnit 13.4.3's and sebastian's source, or by probes.
- **Follow-up review recommendation: false.** No high was patched (patched: high 0, medium 0, low 5), so the work has converged.
- **Verification.**
  - `bun test packages/assert`: 14 pass, 0 fail.
  - `bun test` (whole repo): 154 pass, 0 fail.
  - `bun run typecheck` and `bun run lint` exit 0.
  - `bun run assert:coverage` exits 0 (82 scan names: 67 implemented, 15 pending, 0 missing).
  - A `first =` mutation in `runLifecycle`'s tearDown catch failed XT-assert-12; it was checked, then reverted.
- **Residual risks.**
  - Until ESC-4.4-2 item 1 is ruled, a TestCase test that skips or fails in tearDown can get a different outcome than in PHPUnit.
  - After a bun timeout of a TestCase test, output written through `process.stdout.write` by later non-TestCase tests is lost until the next TestCase test ends.
