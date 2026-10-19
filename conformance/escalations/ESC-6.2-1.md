---
test_ids:
  - XT-conformance-132
trigger: open-question
proposed: >-
  Option 2 (recommended): scope `xaravel/no-identity-constructor-name` to
  code that can use `fqcn()`, exempting the grader's locations
  (`packages/assert/`, `packages/mockery/`, `conformance/`, `tools/`). AD-15
  grader isolation forbids those from importing a graded package, and the
  Class Registry and `fqcn()` live in graded `@xaravel/runtime` (AD-10), so a
  grader reads a class name for display only, never for identity. The rule
  stays an error over `packages/<p>/src` and `packages/<p>/tests` of every
  framework package, `installer/` and `skeleton/`. Option 1: keep the rule on
  every linted file and rewrite the two grader lines; any rewrite still reads
  the constructor's name by another route, which defeats the rule rather than
  meeting it.
evidence: >-
  Story 6.2 adds `xaravel/no-identity-constructor-name` as a top-level error
  over every linted file. Its spec states the tree is clean for all six rules
  ("the only `constructor.name` hits are identifiers named `constructor` in
  `packages/assert/tests/xaravel/*`"), but `bun --bun oxlint --type-aware`
  reports two real reads: `(value as { constructor?: { name?: string } }).constructor?.name`
  at packages/mockery/tests/xaravel/cells.ts:32:32 and
  `error.constructor.name` at
  packages/assert/tests/xaravel/fixtures/mock.fixture.ts:41:123. Both files
  are Protected Paths (`/packages/assert/`, `/packages/mockery/` in
  CODEOWNERS) owned by Epic 4's grader Stories, outside Story 6.2's allowed
  edits, and the spec forbids disable comments or ignore patterns that hide
  real `packages/` files. Until ruled, `bun run lint` exits 1 on exactly these
  two diagnostics; every other file is clean.
---

# ESC-6.2-1: two `constructor.name` reads in grader test helpers fail the new identity rule

Story 6.2 enables `xaravel/no-identity-constructor-name` (AD-10) for every linted file. Its spec expected the tree to be clean, but two grader-package test helpers read `<expr>.constructor.name` to label values in their output:

1. `packages/mockery/tests/xaravel/cells.ts:32` prints a non-plain object as `<object ${constructor.name}>`.
2. `packages/assert/tests/xaravel/fixtures/mock.fixture.ts:41` reports a thrown error's class as `error.constructor.name`.

The rule exists so framework code takes class identity from `fqcn()` (AD-10). The grader cannot: AD-15 grader isolation forbids `@xaravel/assert`, `@xaravel/mockery` and the harness from importing a graded package, and the Class Registry lives in `@xaravel/runtime`. Both reads label a value for display.

Options:

1. Keep the rule on every linted file and rewrite the two lines. Any replacement still reads the constructor's name by another route, which hides the read from the rule without changing what it does.
2. (Recommended) Exempt the grader's locations (`packages/assert/`, `packages/mockery/`, `conformance/`, `tools/`) from this one rule, as `xaravel/no-framework-json-stringify` already exempts the grader packages. Framework packages, `installer/` and `skeleton/` stay covered, and the failing fixture still fails in a framework placement.
