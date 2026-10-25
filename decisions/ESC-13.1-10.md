---
decision: approved
decided_by: Maintainer
date: 2026-10-25
escalation_sha256: "a75accd40d1f0f728a9507beb54d6c1c13f56c9a4998645f6ad8def931f795d4"
---

# ESC-13.1-10: approved, option 2, a `blocked-by` blocker may be a same-Phase Component built in a later Epic

The Maintainer gave this ruling on 2026-10-25 in the Maintainer's session. Story 13.1's ESC-13.1-7 to ESC-13.1-10 were ruled together. The shared route is in `decisions/MAINT-2026-10-25-story-13-1-second.md`.

This departs from the orchestrator's recommendation (option 1). The PRD (§3 and the Skip Reason rules) and `tools/expectations/reasons.ts` now accept `blocked-by:<c>` when `<c>` is in a later Phase, or in the same Phase and built in a later Epic than the line's Component. A Component's Epic is the Epic of its first Story. The global rule already makes the Epic that delivers `<c>` re-verify its `blocked-by` lines, so nothing goes unchecked. It is a standing fix, so the next Phase 1 Component that needs a later Phase 1 Component needs no ruling. The harness still matches the line only on `BlockedByComponentError(<c>)`. testGetClassAttributes then becomes `skip` / `blocked-by:collections`, with its case's `setUp` throwing `BlockedByComponentError("collections")`.
