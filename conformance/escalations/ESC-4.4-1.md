---
test_ids:
  - XT-assert-13
  - XT-assert-14
trigger: open-question
proposed: >-
  (1) Build Story 4.5 before Story 4.4. Move the
  `4-5-mockery-core` key above `4-4-…` in sprint-status.yaml and record 4.5 as
  4.4's prerequisite. Set Story 4.4 back to `backlog` and its spec back to
  `draft`. When 4.4 is built, `createMock` reaches Mockery through
  `globalThis[Symbol.for('xaravel.mockery.mock')]`, which `@xaravel/mockery`
  installs on load. XT-assert-13 imports the real `@xaravel/mockery` as a
  devDependency of `@xaravel/assert`. (2) The coverage report gives each of
  the 82 scan names an owner, taken from the Upstream class that declares it:
  `assert` for `PHPUnit\Framework\Assert` and `PHPUnit\Framework\TestCase`;
  `testing` for `Illuminate\Foundation\Testing\Concerns\*` (Epic 57, FR-96 and
  FR-98); `testbench` for `Orchestra\Testbench\Concerns\InteractsWithPublishedFiles`
  (Epic 59, FR-101). The report lists every name with no implementation,
  grouped by owner. It fails when an `assert`-owned name is missing. It also
  fails when a non-`assert` name is missing from its owner's port of the
  declaring trait once that file exists at its AD-3 path (for example
  `packages/testing/src/Foundation/Testing/Concerns/InteractsWithDatabase.ts`).
  Until then the name is listed as `pending <owner>`. Bind Epic 57's and Epic
  59's Stories to implement every name the report assigns them.
evidence: >-
  (1) The epic 4 context records that 4.4's `createMock` needs 4.5, but
  epics.md orders 4.4 first, and the orchestrator does not start a Story until
  the earlier Stories of its epic are done. `packages/mockery/src/index.ts` is
  `export {};`. XT-assert-13 can pass only against a fake Mockery, which
  AGENTS.md forbids, so 4.4 would be `blocked-by:mockery`. 4.5 could then
  never start, and the epic would deadlock. A static import of Mockery from
  `@xaravel/assert` would form a `dependencies` cycle once 4.5's expectations
  count through `recordAssertion` (tools/graph/graph.ts:12, 218), and it would
  break XT-assert-3's empty-dependencies check (comparison.test.ts:209-214).
  (2) 15 of the 31 names left for Story 4.4 are not PHPUnit's. They are
  `assertDatabaseHas`, `assertDatabaseMissing`, `assertDatabaseCount`,
  `assertModelMissing`, `assertAuthenticated`, `assertGuest` and
  `assertThrows`, from Laravel's Foundation testing concerns
  (InteractsWithDatabase.php:26,66,108,262, InteractsWithAuthentication.php:62,75,
  InteractsWithExceptionHandling.php:179). The other 8 are the
  `assertFile*Contains`, `assertFilename*` and `assertMigrationFile*` helpers of
  Orchestra Testbench's InteractsWithPublishedFiles.php. The test-api scan
  includes them only because the suites extend `Orchestra\Testbench\TestCase`,
  which lives in `vendor/`, and the scan does not index `vendor/`
  (docs/ops/scans.md, ESC-3.7-1). Each one has `executions: 0`, so ESC-3.7-1's
  ruling says the report may exclude it only through an approved Escalation.
  The database and auth helpers need graded packages, which the grader may not
  import (AD-2). A report that fails on all 82 names would stay red until
  Epics 57 and 59, in a CI job every PR runs.
---

# ESC-4.4-1: `createMock` needs Story 4.5, and 15 scan names are not PHPUnit's

Two of Story 4.4's acceptance criteria cannot be met as written at this point in the plan. This Escalation was raised during planning, before any code was built. The item numbers match `proposed`.

1. **`createMock` delegates to a Mockery that does not exist yet (XT-assert-13).** AC 3 says `this.createMock(X)` delegates to `@xaravel/mockery`. Mockery's `mock()` is Story 4.5's work, and 4.5 comes after 4.4 in `epics.md`. The epic 4 context already says "4.4's `createMock` needs 4.5". A test that passes before 4.5 lands needs a fake Mockery, and AGENTS.md forbids that, so 4.4 would be `blocked-by:mockery`. The orchestrator starts a Story only after the earlier Stories of its epic are done, so 4.5 could then never start.
   - Proposed: build 4.5 first. 4.5 needs only 4.2's counting, which is done. The sprint-status file order changes and `epics.md` does not.
   - Wiring: once 4.5 counts its expectations through `recordAssertion`, Mockery depends on `@xaravel/assert`. A static import back from `@xaravel/assert` would then form a runtime cycle. So `createMock` reads the `Symbol.for('xaravel.mockery.mock')` global that `@xaravel/mockery` installs on load. XT-assert-13 imports the real package as a devDependency. `createMock` throws a clear error when Mockery is not loaded.
2. **15 scan names belong to Laravel and Testbench, not to the grader (XT-assert-14).**
   - Laravel's Foundation testing concerns (Epic 57) declare `assertDatabaseHas`, `assertDatabaseMissing`, `assertDatabaseCount`, `assertModelMissing`, `assertAuthenticated`, `assertGuest` and `assertThrows`.
   - Testbench's `InteractsWithPublishedFiles` (Epic 59) declares `assertFileContains`, `assertFileDoesNotContains`, `assertFileNotContains`, `assertFilenameExists`, `assertFilenameDoesNotExists`, `assertFilenameNotExists`, `assertMigrationFileContains` and `assertMigrationFileExists`.
   - The scan picks them up only because the suites' `Orchestra\Testbench\TestCase` is in `vendor/`, which the scan does not index. The database and auth helpers need graded packages, which the grader may not import (AD-2).
   - Under ESC-3.7-1's ruling, the report may exclude a never-run name only through an approved Escalation. The proposal does not exclude them. It assigns each one to its owner and checks it there as soon as the owner's port of the declaring trait exists.

The options:

1. **Reorder 4.5 before 4.4, and have the report check each name against the package of its owner (proposed).** No assertion is removed and no name is dropped. Every name stays listed until it is implemented. The 16 PHPUnit names must be implemented in 4.4.
2. **Keep the order, and land 4.4 without AC 3; a re-verification Story clears it after 4.5.** This leaves an acceptance criterion `blocked-by:mockery` in a done Story. It needs an `epics.md` change, which only the Maintainer makes.
3. **Make the report fail on every missing name, whatever its owner.** CI's `check` job then stays red on every PR until Epics 57 and 59 are done.
