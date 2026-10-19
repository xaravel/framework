---
test_ids:
  - XT-conformance-134
trigger: open-question
proposed: >-
  Option 1 (recommended): keep "public method" as every exported declaration
  of a package's `src/` (the per-file reading Story 6.3's
  `no-maybe-promise-return` uses), tag the two grader helpers
  `@asyncRoot callback` (each runs a caller's callback that may be async, the
  callback clause of AD-6) and commit `packages/assert/async-surface.json`
  with their two lines. Option 2: exempt the grader packages from the tool.
  Option 3: count only what a package's entry point exports as public.
evidence: >-
  Story 6.4's spec assumed every package's async surface is empty today and
  forbade edits to `packages/**`. On the real repository
  `bun run async-surface --all --check` exits 1: two exported functions in
  `packages/assert/src` return a Promise with no `@asyncRoot` tag,
  `runCounted` in `src/declarations/AssertionCounter.ts:107` and
  `runWithMockery` in `src/declarations/portedTest.ts:197`. Neither is
  re-exported from `packages/assert/src/index.ts`; they are cross-module
  helpers of the declarations (`Declarations.ts:91`, `xaravelTest.ts:28`).
  With the new step in CI's `check` job, that required check fails until
  this is ruled.
---

# ESC-6.4-1: two untagged Promise-returning helpers in `@xaravel/assert` fail the new async-surface check

Story 6.4 adds `bun run async-surface`, which lists every exported Promise- or thenable-returning method in a package's emitted `.d.ts` and fails on one with no `@asyncRoot` tag (AD-6). Its spec expected every package to be empty today, but `@xaravel/assert` has two:

1. `runCounted(fn, id)` in `packages/assert/src/declarations/AssertionCounter.ts:107` runs a test body and counts its assertions.
2. `runWithMockery(fn)` in `packages/assert/src/declarations/portedTest.ts:197` runs a test body inside Mockery's container.

Both await a caller-supplied callback that may be async, so they are async under AD-6's callback clause. Neither is exported from the package's entry point.

Options:

1. (Recommended) Keep the per-file definition of "public", tag both helpers `@asyncRoot callback`, and commit `packages/assert/async-surface.json`. The tags are documentation; no assertion, expected value or behaviour changes. The definition matches Story 6.3's lint rule, and AD-6's purpose (a shared seam's async-ness is declared, not chosen ad hoc) applies to cross-module seams inside a package too.
2. Exempt `packages/assert` and `packages/mockery` from the tool. The grader would then have no async-surface record, and a later grader helper could drift unseen.
3. Count only entry-point exports as public. This needs re-export resolution in the `.d.ts` walk, and it diverges from Story 6.3's per-file rule.
