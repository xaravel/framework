---
test_ids:
  - "XT-container-1"
  - "XT-container-2"
  - "XT-container-3"
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change adds container: { frs: [19], ads: [1, 2, 4, 5, 6] } to CONSEQUENCE_SOURCES in tools/xt-coverage/consequences.ts, generates conformance/xaravel-consequences/container.jsonl with bun run xt:consequences, and extends XT-conformance-126 to derive this row from Epic 17. This follows decisions/MAINT-2026-10-22-consequence-rows.md. Option 2: defer the first Container Xaravel Tests until a separate approved Infrastructure change supplies the row; do not invent consequence ids or edit Protected Paths on this Story.
evidence: >-
  Epic 17 Covers FR-19 and Implements AD-1, AD-4, AD-5, AD-6 (epics.md:3873); all have bullet-list consequences/rules, and the standing rule adds AD-2. tools/xt-coverage/consequences.ts:53-72 ends with json-schema and has no container row; conformance/xaravel-consequences/container.jsonl is absent. stories/17.1.md requires XT-container-1..3, the Component first Xaravel Tests. Both tools/ and conformance/ are Protected. The 2026-10-30 second-key amendment requires a monitor or Maintainer decision.
---

# ESC-17.1-1: Container has no required consequence row

Epic 17 Covers FR-19 and Implements AD-1, AD-4, AD-5, AD-6 (epics.md:3873); all have bullet-list consequences/rules, and the standing rule adds AD-2. tools/xt-coverage/consequences.ts:53-72 ends with json-schema and has no container row; conformance/xaravel-consequences/container.jsonl is absent. stories/17.1.md requires XT-container-1..3, the Component first Xaravel Tests. Both tools/ and conformance/ are Protected. The 2026-10-30 second-key amendment requires a monitor or Maintainer decision.
