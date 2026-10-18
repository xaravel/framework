---
title: 'Story 4.4: Exception, output, file and JSON assertions, and the coverage report'
type: 'feature'
created: '2026-10-18'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-core-phpunit-assertions.md'
  - '{project-root}/docs/ops/oracle.md'
  - '{project-root}/docs/ops/scans.md'
warnings: []
deferred: []
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

## Tasks & Acceptance

**Execution:** none until ESC-4.4-1 is ruled on.

**Acceptance Criteria:** Story 4.4's four ACs in `epics.md:2093-2116`, verified in order by XT-assert-11..14.

## Spec Change Log

## Review Triage Log

## Auto Run Result

Status: blocked
Blocking condition: ESC-4.4-1, raised during planning, before any code was built.
- (1) AC 3's `createMock` needs Story 4.5's Mockery. A test that passes now needs a fake Mockery, which AGENTS.md forbids. 4.5 comes after 4.4, so the epic would deadlock. Proposed: build 4.5 first.
- (2) 15 of the 31 remaining scan names are Laravel's Foundation testing helpers (Epic 57) or Testbench's (Epic 59), not PHPUnit's. All have `executions: 0`, and ESC-3.7-1's ruling allows excluding such a name from the coverage report only through an approved Escalation. Proposed: owner-mapped coverage.

Resume: after the ruling, set this spec back to `draft`. Then rebuild from the Intent and Code Map above, amended by the ruling.
