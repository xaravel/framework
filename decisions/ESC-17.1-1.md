---
decision: approved
decided_by: monitor
date: 2026-10-31
escalation_sha256: "9562dccd406e97c8b3d2be59e5edf40afed2bd34fa21e20d4269889345814823"
---

# ESC-17.1-1: approved, option 1 (`container` gets its consequence row before Story 17.1)

The monitor approved option 1 on 2026-10-31 as the second key, under the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It applies the Maintainer's standing rule `decisions/MAINT-2026-10-22-consequence-rows.md` exactly, as ESC-15.1-3 and ESC-16.1-3 did. The Maintainer was told in the Maintainer's session.

Built in this ruling's PR: `CONSEQUENCE_SOURCES` gains `container: { frs: [19], ads: [1, 2, 4, 5, 6] }` (Epic 17 covers FR-19 and implements AD-1, AD-4, AD-5 and AD-6, plus AD-2 for every package), `bun run xt:consequences` generates `conformance/xaravel-consequences/container.jsonl`, and XT-conformance-126 derives the row from Epic 17's Covers line.
