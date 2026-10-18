---
decision: approved
decided_by: Maintainer
date: 2026-10-18
escalation_sha256: "925240fc05baa001ee69a146069897c5b1be54200d4ada2ad438a23ebd0a10c5"
---

# ESC-4.5-1: approved, items 1-6 as proposed, item 7 narrowed

The Maintainer approved this in the Maintainer's session on 2026-10-18.

- **Items 1-6 are approved exactly as the Escalation's `proposed` text states:**
  1. the `Symbol.for('xaravel.mockery.run')` test-finish protocol and the `mockeryExpectation` count. Story 5.3's floor accepts that count kind, and Epic 57's TestCase adds no count of its own.
  2. one shared owner for the SPL classes, the Epic 9 runtime, read through a `Symbol.for` protocol. It joins ESC-4.3-1 item 14, and the grader's copies stay internal until then.
  3. `Symbol.for('xaravel.contract.methods')` on Epic 10 contract tokens.
  4. AC 3 read as Mockery behaves: `BadMethodCallException`, or `NoMatchingExpectationException`.
  5. the mock Proxy leaves symbol keys alone, and `then` too unless `then` has an expectation.
  6. Story 4.6 owns the deferred `Container::mock` forms, the `times()` deprecation after `never()`, `because()` and `andThrow()` with a class-name string. `alias:` and `overload:` go through 4.6's PHP-only exclusion Escalation.
- **Item 7 is approved, narrowed.** XT-conformance-8 (`conformance/tests/xaravel/scaffold.test.ts`) is amended in this ruling's PR so that a grader package may list **other grader packages only** in `dependencies`. It still may not list a graded `@xaravel/*` package. Distribution packages and `runtime` keep the empty-dependencies rule. This allows `@xaravel/mockery` -> `@xaravel/assert`. It matches AD-2 ("the grader depends on nothing graded") and `tools/graph/graph.ts`, which already allow grader-to-grader edges.

Rationale: item 7 changes a Protected test's expected value, so only the Maintainer may rule on it. Narrowing it keeps the test strict: the grader still cannot import anything it grades. Items 1-6 bind later Stories to Mockery's real behaviour. None of them removes an assertion, weakens an expected value or adds a divergence outside DIV-1..12.

Story 4.5 returns to `ready-for-dev`. It resumes from `_bmad-output/implementation-artifacts/xt45-attempt-1.patch`.
