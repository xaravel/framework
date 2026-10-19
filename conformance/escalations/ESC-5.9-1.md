---
test_ids:
  - XT-conformance-126
trigger: open-question
proposed: >-
  (1) Each remaining Xaravel Component (htmx, boost, skeleton, installer, and
  the others whose Epics have a coverage acceptance criterion) gets its row in
  the consequence generator's map (`CONSEQUENCE_SOURCES` in
  tools/xt-coverage/consequences.ts) through a Maintainer-approved
  Infrastructure change made before that Epic's coverage AC, with the FR and AD
  set its Epic names, partial sets included. (2) The Epic 5 retrospective files
  an action item to refine the existing Xaravel Tests' FR-level citations
  (`(FR-3, AD-15)`) to the `FR-<n>.<k>` / `AD-<n>.<k>` bullets each one
  verifies, with the Fidelity Review checking each mapping. Until then
  `bun run xt:coverage conformance` fails, correctly.
evidence: >-
  Story 5.9 writes only conformance/xaravel-consequences/conformance.jsonl
  (FR-1..9, FR-111..116, AD-15, 16, 17, 21 and 28, the spine's Capability Map
  row for the Conformance System). The other Xaravel Components' epics name
  partial FR sets: htmx only FR-96 of the App testing toolkit's FR-96..102, and
  the Skeleton and Installer only the non-auth parts of FR-15..17. Which
  bullets of a partly-claimed FR a Component owns is a planning decision, not
  a mechanical one. The converted Xaravel Tests (every one in
  conformance/tests/xaravel and packages/{assert,mockery}/tests/xaravel, 231
  at merge) cite FRs and ADs at the requirement level, so they declare no `FR-<n>.<k>` token and cover
  nothing; mapping each to the bullets it verifies is judgment the Fidelity
  Review must check (FR-115), so Story 5.9 cites nothing new.
---

# ESC-5.9-1: consequence files for the other Xaravel Components, and who refines the existing citations

Story 5.9 delivers the coverage check (`bun run xt:coverage <component>`, [docs/ops/done-check.md](../../docs/ops/done-check.md)) and one consequence file, `conformance/xaravel-consequences/conformance.jsonl`. Two questions remain for the Maintainer.

1. **Consequence files for htmx, boost, skeleton and installer.** Their epics name partial FR sets: FR-96 alone for htmx, and the non-auth parts of FR-15..17 for the Skeleton and the Installer. A consequence file holds whole FRs' bullets, so a partial claim needs a decision on which bullets the Component owns. Proposed: each Component's row is added to the generator map in an Infrastructure change before its epic's coverage AC, which is when that decision is due.
2. **Who refines the existing tests' citations.** The converted Xaravel Tests (every Xaravel Test in `conformance/tests/xaravel` and `packages/{assert,mockery}/tests/xaravel` (231 at merge)) cite `FR-n` and `AD-n`, which declare nothing under the whole-token rule, so `bun run xt:coverage conformance` lists nearly every consequence as uncovered. That result is correct: coverage that nobody has reviewed must not count. Proposed: the Epic 5 retrospective files an action item to refine each test's citation to the bullets it verifies, with the Fidelity Review checking each one.
