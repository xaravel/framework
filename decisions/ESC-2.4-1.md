---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-17
escalation_sha256: d660aa0c310b029c2e36168ffe22ac59c55b9cb325d449a370a91572bf404a88
---

# ESC-2.4-1: approved, option 1 (directory engine, or `none`)

When a test's `#[RequiresDatabase]` drivers (class hierarchy and method, intersected) and its `framework/tests/Integration/Database/<Engine>/` directory leave no backend, the Inventory records the directory's engine, or `["none"]` when the test has no engine directory, instead of failing. Story 2.4's spec changes its backend rule and its "DB conflict" matrix row to match.

Rationale:

- **Faithful to Upstream.** Testbench applies class and method attributes together, so Upstream skips these tests on every engine. Story 2.6's Oracle run under the recorded Variant records `skip`, and the `upstream-skip` check carries that skip through. Xaravel adds no skip, assertion change or `adapted:` marker, so the grader is not weakened.
- **No new divergence, and no new vocabulary.** Every entry keeps at least one backend. Consumers of `backends` (Variants, the Ratchet, the `upstream-skip` check) need no empty-set case, and option 3's marker would add a term that `conformance/variants` (Epic 5) would have to absorb.
- **No performance cost.** The 8 Test IDs run once under one Variant, where Upstream skips them.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or move Xaravel away from a faithful port.
