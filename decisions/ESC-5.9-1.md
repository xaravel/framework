---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "f92d3df5564f92174f47fd53b3d7f23ef7f8e64c442d9eb3b1d7b7584db7d587"
---

# ESC-5.9-1: approved, both parts as proposed

The Maintainer approved this in the Maintainer's session on 2026-10-19.

- **(1)** Each remaining Xaravel Component (htmx, boost, skeleton, installer, and any other whose epic has a coverage acceptance criterion) gets its row in `CONSEQUENCE_SOURCES` (`tools/xt-coverage/consequences.ts`) through a Maintainer-approved Infrastructure change made before that epic's coverage criterion. The row names the FR and AD bullets its epic owns, partial FR sets included; that is when the bullet-level decision is due.
- **(2)** Refining the existing Xaravel Tests' citations from `FR-n` / `AD-n` to the `FR-<n>.<k>` / `AD-<n>.<k>` bullets each one verifies is carried by Epic 5 action item 7, with the Fidelity Review checking each mapping. Until then `bun run xt:coverage conformance` fails, correctly.

Rationale: coverage that nobody has reviewed must not count, and each partial-FR decision is best made by the epic that owns it, when it is due.
