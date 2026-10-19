---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "1f8e1b9875851fdb57aa238bccfe9974fa894d029c2501a55bad57ef2a5905a6"
---

# ESC-5.3-2: approved, option 1

The Maintainer approved this in the Maintainer's session on 2026-10-19. With this ruling, the waiver half of Story 5.3's AC 3 is met.

A Divergence Record `decisions/DIV-<n>.md` (Story 8.1) lists the clauses whose adaptations may record fewer assertions than the Inventory in a frontmatter list, `fewer_assertions: [<k>, ...]`, whose items are the `<k>` of `adapted: DIV-<n>.<k>`. The harness waives the assertion floor for an Expectations line exactly when its `adapted` is `DIV-<n>.<k>`, `decisions/DIV-<n>.md` exists, and its `fewer_assertions` list contains `<k>`. Otherwise a below-floor pass is a `FLOOR` failure. `epics.md` Story 8.1 now carries that criterion.

Rationale: FR-113 allows fewer assertions only where a Divergence Record says so, and the harness cannot read prose. Option 2 would let any adaptation drop assertions silently (SM-C1), and option 3 would make FR-113's exception unusable. Option 1 keeps every waiver explicit, per clause, in a record the Maintainer approves, and weakens no check.
