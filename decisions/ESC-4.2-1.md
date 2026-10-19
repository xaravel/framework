---
decision: approved
decided_by: Maintainer
date: 2026-10-18
escalation_sha256: "540fd6f1a7300cbb613ad94e1ce3cd23cc7858a7176501d14c687847f75b3891"
---

# ESC-4.2-1: approved, option 1 (adopt the shapes as proposed)

The Maintainer approved this in the Maintainer's session on 2026-10-18. Every item is approved exactly as the Escalation's `proposed` text states:

- **(1)-(3)** The reporter, scope and case contracts are adopted. Stories 5.3, 9.1 and 57 build to them.
- **(3a)** A later `assert` Story extends the `case` construction contract to pass the test's name and dataset.
- **(4)** Both globals are non-writable and non-configurable. The fixtures' environment switch is the only opt-out.
- **(5)** Story 6.2's lint bans `recordAssertion` under `tests/ported`.
- **(6)** `expectNotToPerformAssertions` is a TestCase method that records an explicit kind, with no DIV clause.
- **(7)** `xaravelTest` opens no scope frame.
- **(8)** `--rerun-each` is unsupported for declared tests. The harness reruns a test in a fresh process.
- **(9)** AD-5's single-`AsyncLocalStorage` rule covers graded packages only. The grader keeps its own storage, because AD-15 forbids it to import `@xaravel/runtime`.
- **(10)** One `@xaravel/assert` copy per process, enforced by the harness and Story 6.2.

A change to any of these shapes goes through a follow-up `assert` Story or a Maintainer-approved Infrastructure Story.

Rationale: option 2 breaks grader isolation (AD-2). Option 3 lets mismatches fail silently, for example a missing report or a test body outside its frame. None of these items weakens the grader or adds a divergence.
