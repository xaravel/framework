# Epic 4 Context: Grader packages, `@xaravel/assert` & `@xaravel/mockery`

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Ported Tests assert with PHPUnit's exact semantics and mock with Mockery's API, so a passing test in TypeScript means what it meant in PHP. This epic builds the grader: `@xaravel/assert` (PHP `==` / `===` implemented inside the grader, the `portedTest` / `xaravelTest` declarations with assertion counting, and every PHPUnit assertion used Upstream) and `@xaravel/mockery` (every Mockery API used Upstream). Both are isolated from the packages they grade, so framework code under test cannot tamper with them. Every later Ported Test depends on these packages, and Mockery is used by 226 Upstream files.

## Stories

- Story 4.1: PHP comparison core
- Story 4.2: `portedTest` and `xaravelTest` declarations with assertion counting
- Story 4.3: Core PHPUnit assertions
- Story 4.4: Exception, output, file and JSON assertions, and the coverage report
- Story 4.5: Mockery core
- Story 4.6: Mockery advanced and API coverage

## Requirements & Constraints

- **Kind.** These are Xaravel Components (`component: assert` / `component: mockery`). Every AC is verified by the `XT-assert-<n>` or `XT-mockery-<n>` test already allocated in `stories/4.*.md`, one per AC in order. They are `XT-assert-1..14` (4.1: 1–3, 4.2: 4–7, 4.3: 8–10, 4.4: 11–14) and `XT-mockery-1..6` (4.5: 1–3, 4.6: 4–6). Do not renumber them. Each Xaravel Test declares the FR consequence it verifies.
- **Equality semantics.** `assertSame` follows PHP `===`, including key order and types. `assertEquals` follows PHP `==`. The truth table for PHP 8.5 `==` / `===` (scalars, null, numeric strings, lists and maps in different key orders, objects) comes from the Oracle through per-Story requests (`conformance/oracle-requests/<story-id>.jsonl`). It is never written by hand.
- **Coverage.** Every assertion in `conformance/scans/phpunit-assertions.jsonl` (82 names) and every API in `conformance/scans/mockery-api.jsonl` (45 names) must be implemented. A CI coverage report lists anything missing and fails. Excluding a PHP-only Mockery API (for example `overload:` class aliasing) needs an approved Escalation.
- **PHPUnit behaviour.** Failure messages name the expected and actual values. `expectException` ends the test at the throw, and the test fails if nothing throws. `createMock` delegates to `@xaravel/mockery`. `assertMatchesRegularExpression` takes a JS `RegExp`. PCRE patterns are converted by the mechanical rule in `PORTING.md` (DIV-10).
- **Assertion counting.** A Ported Test with zero assertions fails with "zero assertions". Every test reports the multiset of assertion kinds it ran to the harness reporter API, which the assertion floor compares against the Inventory. An unmet Mockery expectation fails the test when it finishes, with Mockery's message, and counts as an assertion. A call that matches no expectation throws `BadMethodCallException`.
- **Declarations.** `portedTest('<Test ID>', { case?, dataset? }, async function () {…})` binds `this` to an instance of `case`. Each dataset becomes one test labelled with its full Test ID. `xaravelTest('XT-<c>-<n>', '<FR consequence>', fn)` throws when declared if the consequence is empty. Ported Tests use only `@xaravel/assert`, never `expect` from `bun:test`.
- **Protection.** `packages/assert` and `packages/mockery` are Protected Paths, so changes to them land only through Maintainer review.

## Technical Decisions

- **Grader isolation.**
  - `@xaravel/assert` and `@xaravel/mockery` import no graded package, not even `@xaravel/runtime`.
  - They detect a PHP array by the brand `Symbol.for('xaravel.php.array')`. They detect PHP-comparable objects by `[Symbol.for('xaravel.php.props')]()`.
  - Contract tokens are branded `Symbol.for('<Upstream FQCN>')`, so the grader can detect them without importing contracts.
  - `@xaravel/assert` freezes its exports and prototypes on load, so assigning to one throws.
  - The graph check must show no edge to any graded package. The only runtime exceptions allowed are `@xaravel/testing` → `@xaravel/mockery` and `@xaravel/support`'s optional peer on mockery. Every other graded package takes the grader only as a devDependency.
- **Frames.** If `globalThis[Symbol.for('xaravel.scope.run')]` exists, `portedTest` runs the body inside a `test` frame opened through it. The grader never imports the scope module. The harness opens the test frame first, and the TestCase's `createApplication` then runs inside it.
- **PHP value model.** `null` is the only absent value. A PHP list is a JS `Array`. A map whose keys are all non-integer-like strings is a plain object. Any other PHP array is a branded `PhpArray` (an ordered map). Comparisons must handle all three forms. int and float are both JS `number`.
- **Mockery and Eloquent.** On a mocked model (instances carry the `MODEL_STATE` symbol), members are defined through the `MODEL_STATE` escape and never through the model Proxy's `defineProperty` trap.
- **Conventions.**
  - Keep the PHPUnit and Mockery method names and messages.
  - Use named exports only, one public class per file.
  - Use `bun test` under the Protected root `bunfig.toml`. A package-level `bunfig.toml` is forbidden.
  - The stack is Bun 1.4.3, TS 7.0.2 `--strict` and oxlint 1.88.0.

## Cross-Story Dependencies

- 4.1 → 4.3: the equality assertions use the comparison core. 4.2 supplies the counting that 4.3–4.6 report into. 4.4's `createMock` needs 4.5. 4.6 extends 4.5.
- **Needs from Epic 3:** the usage scans (`phpunit-assertions.jsonl`, `mockery-api.jsonl`). It also needs per-Story Oracle requests (Story 3.4) for 4.1's truth table. The live path of Story 3.4 has never run, and the `xaravel-oracle` GitHub App is not set up yet. That is a Maintainer step, so plan for it before 4.1 needs signed fixtures.
- **Later epics.** Epic 5's harness consumes the reporter API and the assertion-kind multisets (FR-113 floor). Epic 6 lint enforces the ban on `expect` under `tests/ported`. Epic 8's `PORTING.md` holds the PCRE→`RegExp` rule (DIV-10). `@xaravel/runtime` (Epic 9) installs the scope protocol and `PhpArray`. The grader must work without them.
