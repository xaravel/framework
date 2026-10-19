---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "becb92c8eee27e17051294e28915123186fc453dec7248d7601d20714eae9a1f"
---

# ESC-5.3-4: approved, both parts as proposed

The Maintainer approved this in the Maintainer's session on 2026-10-19.

- **(1) Variant membership.** `portedTest` does not declare a test on a Variant outside its Inventory `backends`, and the harness passes `bun test` only the files that have a Test ID for that Variant. A stray report is an `UNKNOWN` difference.
- **(2) SQLite state.** The harness resets `.cache/sqlite/` before every Variant whose backend is `sqlite`, not once per backend.

Epic 5 action item 14 (orchestrator) builds both, before the first Phase 1 Ported Tests land.

Rationale: grading does not change, because results on non-member Variants are already dropped. A run gets cheaper, hangs and errors on non-member Variants stop being hidden, and no Variant starts from state another one left behind.
