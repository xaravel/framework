---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-18
escalation_sha256: "c5409b6e50ba78c8e86e156b9452ed24936acb29d01c8dc412eb9af3fdbb3241"
---

# ESC-4.4-1: approved, option 1 (build 4.5 first; owner-mapped coverage report)

Both items are approved exactly as the Escalation's `proposed` text states:

- **Order.** Story 4.5 (Mockery core) is built before Story 4.4 and is 4.4's prerequisite. The `4-5-mockery-core` key moves above `4-4-…` in `sprint-status.yaml`. Story 4.4 goes back to `backlog` and its spec to `draft`. `epics.md` does not change. When 4.4 is built, `createMock` reaches Mockery through `globalThis[Symbol.for('xaravel.mockery.mock')]`, which `@xaravel/mockery` installs on load, and throws a clear error when Mockery is not loaded. XT-assert-13 imports the real `@xaravel/mockery` as a devDependency of `@xaravel/assert`. Nothing fakes Mockery.
- **Coverage report.** Each of the 82 scan names gets an owner, taken from the Upstream class that declares it: `assert` for `PHPUnit\Framework\Assert` and `PHPUnit\Framework\TestCase`; `testing` for `Illuminate\Foundation\Testing\Concerns\*` (Epic 57); `testbench` for `Orchestra\Testbench\Concerns\InteractsWithPublishedFiles` (Epic 59). The report lists every name with no implementation, grouped by owner. It fails when an `assert`-owned name is missing. It also fails when a non-`assert` name is missing from its owner's port of the declaring trait once that file exists at its AD-3 path. Until then the name is listed as `pending <owner>`. This is the approved Escalation that ESC-3.7-1's ruling requires before the report may treat a never-run name differently.

Story 4.4's spec (Boundaries and the AC 3 / AC 4 tasks) is amended in place to these rules when the Story is rebuilt.

Rationale:

- **It removes a deadlock without faking a Component.** With 4.4 first, AC 3 could pass only against a fake Mockery, which AGENTS.md forbids, and 4.5 could never start behind a blocked 4.4. 4.5 needs only Story 4.2's counting, which is done. The global hook avoids a runtime `dependencies` cycle between `@xaravel/assert` and `@xaravel/mockery` (tools/graph) and keeps XT-assert-3's empty-dependencies check true.
- **The grader is not weakened.** No Upstream assertion is removed, no expected value weakened, no skip added and no `adapted:` marker introduced. No scan name is dropped. Every one stays listed until it is implemented, and each fails the report as soon as its owner's file exists. The 16 PHPUnit names must all be implemented in 4.4. The 15 others are declared by Laravel and Testbench, not by PHPUnit, and the database and auth helpers need graded packages that the grader may not import (AD-2). Option 3 would keep CI's `check` job red on every PR until Epics 57 and 59.
- **No planning document changes.** Option 2 leaves an acceptance criterion `blocked-by:mockery` in a done Story and needs an `epics.md` change. Option 1 changes only the build order in the sprint-status file. The spine, the SPEC and `epics.md` stay as they are.
- **No run-time cost and no divergence.** The report runs in CI only. `createMock` keeps PHPUnit's delegation to Mockery. No divergence outside DIV-1..12 is added.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun.
