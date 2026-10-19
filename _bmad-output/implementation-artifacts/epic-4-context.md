# Epic 4 Context: Grader packages, `@xaravel/assert` & `@xaravel/mockery`

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Ported Tests assert with PHPUnit's exact semantics and mock with Mockery's API, so a passing test in TypeScript means what it meant in PHP. This epic builds the grader. `@xaravel/assert` provides PHP comparison implemented inside the grader, the `portedTest` / `xaravelTest` declarations with assertion counting, every PHPUnit assertion used Upstream, and PHPUnit's own test doubles. `@xaravel/mockery` provides every Mockery API used Upstream plus a port of `JMac\Testing\Double`. Both are isolated from the packages they grade, so framework code under test cannot tamper with them. Every later Ported Test depends on these packages, and 226 Upstream files use Mockery.

## Stories

- Story 4.1: PHP comparison core
- Story 4.2: `portedTest` and `xaravelTest` declarations with assertion counting
- Story 4.3: Core PHPUnit assertions
- Story 4.4: Exception, output, file and JSON assertions, and the coverage report
- Story 4.5: Mockery core
- Story 4.6: Mockery advanced and API coverage
- Story 4.7: PHPUnit test doubles
- Story 4.8: `jasonmccreary/double` port

## Requirements & Constraints

- **Kind.** Xaravel Components (`component: assert` for 4.1–4.4 and 4.7; `component: mockery` for 4.5, 4.6 and 4.8). Every AC is verified by the `XT-` test allocated in `stories/4.*.md`, one per AC in order: `XT-assert-1..16` (4.7 owns 15–16) and `XT-mockery-1..7` (4.8 owns 7). Do not renumber. Each Xaravel Test declares the FR consequence it verifies.
- **Equality.** `assertSame` follows PHP `===`, including key order and types. `assertEquals` follows PHPUnit's comparator, which differs from PHP `==`. PHP truth tables come only from signed Oracle fixtures requested in `conformance/oracle-requests/<story-id>.jsonl`, never written by hand; fixture verification is a required merge check.
- **Coverage.** Every name in `conformance/scans/phpunit-assertions.jsonl` and `conformance/scans/mockery-api.jsonl` must be implemented or owner-mapped. Names declared by Laravel/Testbench traits are listed `pending <owner>` until the owner's file exists; `assert`-owned names must all exist. CI's `check` job runs the reports and is a required check. After 4.8, `bun run mockery:coverage` lists none of `returns`, `throws`, `resolves` as pending.
- **PHPUnit test doubles (4.7).** `createMock`, `createStub` and `getMockBuilder(...)->getMock()` return PHPUnit `MockObject`s driven by `expects()`, `method()`, `with()`, `willReturn*`, `willThrowException` and the invocation matchers (`once`, `never`, `any`, `exactly`, `atLeastOnce`), counting and failing with PHPUnit 13's messages. `createMock` no longer delegates to Mockery (this supersedes the earlier `xaravel.mockery.mock` global hook); Mockery stays reachable through `Mockery.mock()`. 4.7 also adds `addToAssertionCount`, `stringContains`, and makes `assertArraySubset` record the kind `assertThat`.
- **Double port (4.8).** `returns`, `throws` and `resolves` behave as the PHP library does for the ai, mcp and boost suites' uses.
- **Counting.** Zero assertions fails with "zero assertions". Each test reports its multiset of assertion kinds to the harness reporter API. An unmet Mockery expectation fails at test finish with Mockery's message and counts (`mockeryExpectation` kind). An unmatched call throws `BadMethodCallException` or `NoMatchingExpectationException`, as Mockery does.
- **Declarations.** `portedTest('<Test ID>', { case?, dataset? }, async function () {…})` binds `this` to a `case` instance; each dataset becomes one test labelled with its full Test ID. `xaravelTest` throws at declaration on an empty consequence and opens no scope frame. Ported Tests never use `expect` from `bun:test`.
- **Protection.** `packages/assert` and `packages/mockery` are Protected Paths. Reporter, scope and case contract shapes, and the grader globals, change only via a follow-up `assert` Story or a Maintainer-approved Infrastructure Story.

## Technical Decisions

- **Grader isolation.** The grader imports no graded package, not even `@xaravel/runtime`. A grader package may depend on other grader packages only (`@xaravel/mockery` → `@xaravel/assert` is allowed). `@xaravel/assert` freezes its exports and prototypes on load. One `@xaravel/assert` copy per process. Grader globals are non-writable and non-configurable.
- **Protocols, read by brand, never reimplemented.** `PhpArray`: `Symbol.for('xaravel.php.array')`, read only through its iterator of normalised `[key, value]` pairs. Object props: `[Symbol.for('xaravel.php.props')]()`, else own enumerable keys. JS built-ins are `==` only to themselves. Until Story 9.5's float marker lands, `===` treats int and float as one type. Contract tokens are `Symbol.for('<Upstream FQCN>')`, with methods at `Symbol.for('xaravel.contract.methods')`. Test finish for Mockery uses `Symbol.for('xaravel.mockery.run')`. Class-name strings resolve through `globalThis[Symbol.for('xaravel.class.lookup')]` (Story 9.4); `andThrow('<FQCN>')` resolves only the grader's own exception classes.
- **Frames.** If `globalThis[Symbol.for('xaravel.scope.run')]` exists, `portedTest` runs the body in a `test` frame opened through it; the grader keeps its own storage otherwise.
- **Mockery specifics.** The mock Proxy leaves symbol keys alone, and `then` unless it has an expectation. With `shouldIgnoreMissing` and no default, a missing call returns null; with `recursive`, a new ignore-missing mock. With several class targets only the first is in the prototype chain. `Mockery.capture` writes `ref.value`. On a mocked Eloquent model (instances carry `MODEL_STATE`), define members through the `MODEL_STATE` escape, never the Proxy's `defineProperty` trap.
- **PHP-only gaps (DIV-6, recorded by Story 8.1).** Mockery `alias:`/`overload:` and run-time method visibility guards. Closure equality, JS `Error` through `ExceptionComparator`, and message-only differences are also Story 8.1 DIV clauses.
- **Conventions.** Keep PHPUnit, Mockery and Double method names and messages. Named exports, one public class per file. `bun test` under the Protected root `bunfig.toml`; no package-level `bunfig.toml`. `assertMatchesRegularExpression` takes a JS `RegExp` (DIV-10).

## Cross-Story Dependencies

- **Within the epic.** 4.3 uses 4.1's comparison core. 4.2's counting underlies 4.3–4.8. 4.5 was built before 4.4. 4.6 extends 4.5. 4.7 replaces 4.4's `createMock` delegation and amends 4.3's `assertArraySubset` kind. 4.8 extends `@xaravel/mockery` and its coverage report.
- **Other epics.** Epic 3 supplies the usage scans and the Oracle signing path. Story 5.3's harness consumes the reporter API, the kind multisets, `skipped` and risky flags. Story 6.2 lints `expect` and `recordAssertion` under `tests/ported`. Story 8.1 holds the DIV records and 8.2 the PCRE rule. Stories 9.4 (class registry), 9.5 (`PhpArray`, `Ref<T>`, float marker), 9.10 (SPL and `\Error`/`\Exception` classes) and 9.11 (grader reads them; failure-message rewrite) build to the grader's protocols. Epic 10 supplies contract tokens. Story 36.1 binds `MODEL_STATE`. Epic 57 owns the testing TestCase traits and `partialMock()`; Epic 59 the Testbench traits.
