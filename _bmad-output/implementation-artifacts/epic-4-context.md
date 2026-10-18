# Epic 4 Context: Grader packages, `@xaravel/assert` & `@xaravel/mockery`

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Ported Tests assert with PHPUnit's exact semantics and mock with Mockery's API, so a passing test in TypeScript means what it meant in PHP. This epic builds the grader. `@xaravel/assert` provides PHP `==` / `===` implemented inside the grader, the `portedTest` / `xaravelTest` declarations with assertion counting, and every PHPUnit assertion used Upstream. `@xaravel/mockery` provides every Mockery API used Upstream. Both are isolated from the packages they grade, so framework code under test cannot tamper with them. Every later Ported Test depends on these packages, and 226 Upstream files use Mockery.

## Stories

- Story 4.1: PHP comparison core
- Story 4.2: `portedTest` and `xaravelTest` declarations with assertion counting
- Story 4.3: Core PHPUnit assertions
- Story 4.4: Exception, output, file and JSON assertions, and the coverage report
- Story 4.5: Mockery core
- Story 4.6: Mockery advanced and API coverage

## Requirements & Constraints

- **Kind.** These are Xaravel Components (`component: assert` / `component: mockery`).
  - Every AC is verified by the `XT-assert-<n>` or `XT-mockery-<n>` test already allocated in `stories/4.*.md`, one per AC in order: `XT-assert-1..14` (4.1: 1–3, 4.2: 4–7, 4.3: 8–10, 4.4: 11–14) and `XT-mockery-1..6` (4.5: 1–3, 4.6: 4–6). Do not renumber them.
  - Each Xaravel Test declares the FR consequence it verifies.
- **Equality semantics.**
  - `assertSame` follows PHP `===`, including key order and types. `assertEquals` follows PHP `==`.
  - The PHP 8.5 truth table comes only from signed Oracle fixtures requested in `conformance/oracle-requests/<story-id>.jsonl`. It is never written by hand.
  - Fixture verification (`oracle:verify-fixtures`) is a required merge check, so an unsigned or forged fixture cannot merge.
- **Coverage.** Every assertion in `conformance/scans/phpunit-assertions.jsonl` (82 names) and every API in `conformance/scans/mockery-api.jsonl` (45 names) must be implemented. A CI coverage report lists anything missing and fails. Excluding a PHP-only Mockery API (for example `overload:` class aliasing) needs an approved Escalation.
- **PHPUnit behaviour.**
  - Failure messages name the expected and actual values.
  - `expectException` ends the test at the throw, and the test fails if nothing throws.
  - `createMock` delegates to `@xaravel/mockery`.
  - `assertMatchesRegularExpression` takes a JS `RegExp`. PCRE patterns are converted by the mechanical rule in `PORTING.md` (DIV-10).
- **Assertion counting.**
  - A Ported Test with zero assertions fails with "zero assertions".
  - Every test reports the multiset of assertion kinds it ran to the harness reporter API. The assertion floor compares that multiset against the Inventory.
  - An unmet Mockery expectation fails the test when it finishes, with Mockery's message, and counts as an assertion.
  - A call that matches no expectation throws `BadMethodCallException`.
- **Declarations.**
  - `portedTest('<Test ID>', { case?, dataset? }, async function () {…})` binds `this` to an instance of `case`. Each dataset becomes one test labelled with its full Test ID.
  - `xaravelTest('XT-<c>-<n>', '<FR consequence>', fn)` throws when declared if the consequence is empty.
  - Ported Tests use only `@xaravel/assert`, never `expect` from `bun:test`.
- **Protection.** `packages/assert` and `packages/mockery` are Protected Paths, so changes to them land only through Maintainer review.

## Technical Decisions

- **Grader isolation.**
  - `@xaravel/assert` and `@xaravel/mockery` import no graded package, not even `@xaravel/runtime`.
  - Contract tokens are branded `Symbol.for('<Upstream FQCN>')`, so the grader can detect them without importing contracts.
  - `@xaravel/assert` freezes its exports and prototypes on load, so assigning to one throws.
  - The graph check must show no edge to any graded package. Only two runtime edges are allowed: `@xaravel/testing` → `@xaravel/mockery`, and `@xaravel/support`'s optional peer dependency on mockery. Every other graded package takes the grader only as a devDependency.
- **PHP value model.**
  - `null` is the only absent value.
  - A PHP list is a JS `Array`. A map whose keys are all non-integer-like strings is a plain object. Any other PHP array is a branded `PhpArray` (an ordered map). Comparisons handle all three forms.
  - int and float are both JS `number`.
- **Grader-side protocols (built in 4.1, open in ESC-4.1-1).** Reuse the comparison core. Do not reimplement these protocols.
  - A `PhpArray` is detected by `Symbol.for('xaravel.php.array')` and read only through its iterator of normalised `[key, value]` pairs.
  - An object's properties come from `[Symbol.for('xaravel.php.props')]()`. Without that method, they come from its own enumerable keys.
  - JS built-ins (`Date`, `Map` and the like) are `==` only to themselves.
  - Until the Escalation is resolved, `===` treats int and float as one type (DIV-9).
- **Frames.**
  - If `globalThis[Symbol.for('xaravel.scope.run')]` exists, `portedTest` opens a `test` frame through it and runs the body inside that frame. The grader never imports the scope module.
  - The harness opens the test frame first. The TestCase's `createApplication` then runs inside it.
- **Mockery and Eloquent.** On a mocked model (its instances carry the `MODEL_STATE` symbol), define members through the `MODEL_STATE` escape, never through the model Proxy's `defineProperty` trap.
- **Conventions.**
  - Keep the PHPUnit and Mockery method names and messages.
  - Use named exports only, one public class per file.
  - Run `bun test` under the Protected root `bunfig.toml`. A package-level `bunfig.toml` is forbidden.
  - The stack is Bun 1.4.3, TS 7.0.2 `--strict` and oxlint 1.88.0.

## Cross-Story Dependencies

- **Within the epic.**
  - 4.3's equality assertions use 4.1's comparison core.
  - 4.2 supplies the counting that 4.3–4.6 report into.
  - 4.4's `createMock` needs 4.5.
  - 4.6 extends 4.5.
- **From Epic 3.**
  - Epic 4 uses the usage scans (`phpunit-assertions.jsonl`, `mockery-api.jsonl`) and the per-Story Oracle requests.
  - The `xaravel-oracle` App is set up. `oracle.yml#story` has signed 4.1's fixtures on its PR, so later Stories that need Oracle facts follow the same path.
- **Later epics.**
  - Epic 5's harness consumes the reporter API and the assertion-kind multisets (FR-113 floor).
  - Epic 6 lint enforces the ban on `expect` under `tests/ported`.
  - Epic 8's `PORTING.md` holds the PCRE→`RegExp` rule (DIV-10).
  - `@xaravel/runtime` (Epic 9; `PhpArray` and the float marker are in Story 9.5) installs the scope protocol and `PhpArray`. The grader must work without them, and ESC-4.1-1 asks that 9.5 match the grader's protocols.
