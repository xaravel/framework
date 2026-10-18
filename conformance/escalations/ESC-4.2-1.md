---
test_ids:
  - XT-assert-4
  - XT-assert-5
  - XT-assert-6
  - XT-assert-7
trigger: contract
proposed: >-
  Adopt the grader-side contracts (1)-(3) of Story 4.2 as written here, bind
  the Stories that consume or install them, and rule on the open questions
  (3a) and (4)-(10), each with the answer proposed below. (1) Reporter protocol, for Story
  5.3's harness reporter. When `globalThis[Symbol.for('xaravel.harness.report')]`
  is a function at test run time, `portedTest` and `xaravelTest` call it once
  per finished test, passing or failing, with a frozen object `{ type:
  'ported' | 'xaravel', id, consequence, assertions }`: `id` is the full Test
  ID (`<id>`, `<id>#<key>` or `<id>#<index>` for a Ported Test; the
  `XT-<c>-<n>` id for a Xaravel Test), `consequence` is `null` for a Ported
  Test and the declared FR consequence for a Xaravel Test, and `assertions`
  maps each assertion kind recorded through `recordAssertion` to its count,
  keys sorted. The reporter's return value is awaited; a reporter that throws
  or returns a rejected promise fails that test (a body or lifecycle error
  wins). Absent, nothing is sent. The bun:test label of a Ported Test is its
  full Test ID; a Xaravel Test's label is `<id>: <consequence>`. (2) Scope call
  shape, for Story 9.1. When `globalThis[Symbol.for('xaravel.scope.run')]` is
  a function, `portedTest` calls it as `run('test', inner)` and awaits its
  result; `inner` returns a promise and must run with the `test` frame active
  for its whole duration (case construction, `setUp`, body, `tearDown`),
  mirroring AD-5's `runInFrame(kind, fn)`. Story 9.1 installs a function of
  that shape; the grader never imports the scope module. (3) Case lifecycle,
  for Story 57. `portedTest` runs `new options.case()` with no arguments, then
  `setUp()` when it is a function, the body with `this` bound to the instance,
  and then always `tearDown()`, even after a failing `setUp` or body
  (PHPUnit's `runBare`); the first error wins. No other hook.
  `@xaravel/testing`'s TestCase (Story 57) runs AD-25's full order inside its
  own `setUp` / `tearDown`, inside the test frame. (3a) Open question: how
  does Story 57's TestCase learn its test name and dataset (PHPUnit's
  `name()`, `dataName()`, `providedData()`)? Proposed: a later `assert` Story
  extends the `case` construction contract to hand them over; until then the
  instance does not know them. (4) Open question: who stops code under test
  from replacing or silencing the two globals? Proposed: the installers
  (Story 5.3's preload, Story 9.1) define both globals non-writable and
  non-configurable (AD-15), but skip installing a global when the child run
  opts out (an environment switch), so the grader's own fixtures
  (`packages/assert/tests/xaravel/fixtures`) can still install fake globals.
  (5) Open question: may a Ported Test call
  `recordAssertion` directly? Proposed: no; it is public only so Stories
  4.3-4.6 and `@xaravel/mockery` can count, and Story 6.2's lint bans it under
  `tests/ported`. (6) Open question: how do Upstream tests marked
  `@doesNotPerformAssertions`, or calling `expectNotToPerformAssertions()`,
  pass FR-113's "zero assertions" rule? Proposed: the Maintainer decides;
  the proposed answer is an `expectNotToPerformAssertions` TestCase method in
  Story 4.4 that records an explicit kind, rather than a DIV clause. (7) Open
  question: should `xaravelTest` open a scope frame? Proposed: no; Story
  9.1's Xaravel Tests accept that or ask for a change. (8) Open question: how
  are declared tests rerun, given that a full Test ID declared twice in one
  process throws (FR-2) and `bun test --rerun-each` re-evaluates the file in
  the same process? Proposed: `--rerun-each` is unsupported for declared
  tests, and the harness (Stories 5.3, 5.8) reruns a test in a fresh process.
  (9) Open question: may the grader keep its own `AsyncLocalStorage` for
  assertion counting, against AD-5's "only framework `AsyncLocalStorage`"?
  Proposed: yes; the grader may not import `@xaravel/runtime/scope` (AD-15
  isolation), so AD-5's rule is read as covering graded packages only.
  (10) Open question: who guarantees the grader is loaded once per process?
  The duplicate Test ID set (and the counter's storage) is per module
  instance, so a second copy of `@xaravel/assert` (another resolved path or a
  cache-busting import) would miss duplicates across the copies. Proposed:
  the harness and Story 6.2's checks resolve `@xaravel/assert` to one path per
  process.
evidence: >-
  Story 4.2's spec
  (_bmad-output/implementation-artifacts/spec-4-2-portedtest-and-xaraveltest-declarations-with-assertion-counting.md,
  Design Notes) defines these shapes, and the grader may import neither
  `@xaravel/runtime` nor the harness (AD-2, epic 4 context: Grader
  isolation), so they meet only through `Symbol.for` globals that no
  consuming Story owns yet. XT-assert-4 pins the scope call shape and the
  `setUp` / `tearDown` order with a fake protocol; XT-assert-5 pins the
  zero-assertions failure that items (5) and (6) bear on; XT-assert-6 pins the
  report payload; XT-assert-7 pins the process-wide duplicate Test ID check
  that item (8) bears on. If Story 5.3 reads a different payload, Story 9.1 installs a
  different call shape (for example `run(fn)` or a sync callback), or Story
  57's TestCase expects the declaration to drive more hooks, assertion floors
  go unreported or Ported Tests run outside their frame without any failure.
---

# ESC-4.2-1: the reporter protocol, the scope call shape and the case lifecycle of `portedTest`

Story 4.2's declarations meet later Stories only through `globalThis` symbols and a class shape. Items (1)-(3) are contracts to adopt; (3a) and (4)-(10) are open questions, each with a proposed answer. The numbers match `proposed`.

1. **Reporter (Story 5.3).** `globalThis[Symbol.for('xaravel.harness.report')]`, when a function, receives one frozen `{ type, id, consequence, assertions }` per finished test, passing or failing. `assertions` is the multiset of kinds recorded through `recordAssertion`, keys sorted; this is what the FR-113 floor compares against the Inventory. Its result is awaited; a reporter that throws or rejects fails the test, unless the test already failed on its own. Proposed: adopt as written.
2. **Scope (Story 9.1).** `globalThis[Symbol.for('xaravel.scope.run')]`, when a function, is called as `run('test', inner)` and awaited; the `test` frame must stay active for all of `inner` (case construction, `setUp`, body, `tearDown`). Without it, the test runs unscoped and still passes. Proposed: adopt as written.
3. **Case (Story 57).** `portedTest` constructs `options.case` with no arguments and calls only `setUp` and `tearDown`, in PHPUnit's `runBare` order: `tearDown` always runs, even after a failing `setUp`, and the first error wins. AD-25's full lifecycle belongs to `@xaravel/testing`'s TestCase, which runs it inside those two methods. Proposed: adopt as written.

   3a. **Test name and data (Story 57).** The instance never learns its test name or dataset (PHPUnit's `name()`, `dataName()`, `providedData()`). How does Story 57's TestCase get them? Proposed: a later `assert` Story extends the `case` construction contract to pass them.
4. **Tamper resistance (Stories 5.3, 9.1).** The grader cannot own another package's global. Proposed: the installers define both globals non-writable and non-configurable, so code under test cannot replace or silence them (AD-15). They skip installing a global when the child run opts out through an environment switch, so the grader's own fixtures (`packages/assert/tests/xaravel/fixtures`) can still install fake globals.
5. **`recordAssertion` in Ported Tests (Story 6.2).** It is public only so Stories 4.3-4.6 and `@xaravel/mockery` can count. A Ported Test that calls it directly fakes an assertion. Proposed: Story 6.2's lint bans it under `tests/ported`.
6. **Tests that assert nothing on purpose.** Upstream tests marked `@doesNotPerformAssertions`, or calling `expectNotToPerformAssertions()`, fail FR-113's "zero assertions" rule as written. The Maintainer chooses between a DIV clause and a TestCase method. Proposed: an `expectNotToPerformAssertions` TestCase method in Story 4.4 that records an explicit kind, with no DIV clause.
7. **No frame for Xaravel Tests (Story 9.1).** `xaravelTest` opens no scope frame. Proposed: Story 9.1's Xaravel Tests accept that, or ask for a change through a follow-up `assert` Story.
8. **Reruns (Stories 5.3, 5.8).** Any second declaration of a full Test ID in one process throws (FR-2), whether it comes from a loop, a shared helper or another file. `bun test --rerun-each` re-evaluates a test file in the same process, so every rerun fails at load (probed: `1 fail 1 error`). Proposed: `--rerun-each` is unsupported for declared tests; the harness reruns a test in a fresh process.
9. **A second `AsyncLocalStorage` (AD-5).** The counter keeps per-test counts in its own `AsyncLocalStorage`, because the grader may not import `@xaravel/runtime/scope` (AD-15 isolation). AD-5 says the framework's scope storage is the only `AsyncLocalStorage`. Proposed: read that rule as covering graded packages only.
10. **One grader per process.** The duplicate Test ID set and the counter's storage are per module instance. A second copy of `@xaravel/assert` in one process (another resolved path, or a cache-busting import) would miss duplicates across the copies and count into a different storage. Proposed: the harness and Story 6.2's checks resolve `@xaravel/assert` to one path per process.

None of Stories 5.3, 6.2, 9.1 or 57 owns these shapes, and none of their PRs may edit `packages/assert/**`. Who fixes the contract?

The options:

1. **Adopt the shapes as `proposed` (proposed).** Stories 5.3, 9.1 and 57 build to them; a change goes through a follow-up `assert` Story or a Maintainer-approved Infrastructure Story.
2. **Move the protocols into a shared contract module that both sides import.** That breaks grader isolation (AD-2).
3. **Let each consuming Story define its side and amend the grader later.** Until then, a mismatch fails silently: no report, or a test body outside its frame.
