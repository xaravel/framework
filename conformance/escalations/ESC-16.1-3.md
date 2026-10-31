---
test_ids:
  - XT-json-schema-1
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change adds
  `'json-schema': { frs: [], ads: [2, 6] }` to `CONSEQUENCE_SOURCES` in
  tools/xt-coverage/consequences.ts, by the rule of
  decisions/MAINT-2026-10-22-consequence-rows.md (Epic 16's Covers line is
  FR-84, which has no `**Consequences (testable):**` list in the PRD, so the
  row is AD-2 and AD-6 only), generates
  conformance/xaravel-consequences/json-schema.jsonl with
  `bun run xt:consequences`, and extends XT-conformance-126 to derive the row
  from Epic 16's Covers line, as #550 did for config (ESC-15.1-3). XT-json-schema-1
  then cites the AD-2 and AD-6 ids it tests. Option 2: no row; XT-json-schema-1
  cites no consequence of its own Component, leaving the same F-7 gap
  Epic 13's retrospective recorded.
evidence: >-
  tools/xt-coverage/consequences.ts CONSEQUENCE_SOURCES (lines 53-66) has rows
  for conformance, runtime, contracts, macroable, conditionable, reflection,
  collections and config only; conformance/xaravel-consequences/ has no
  json-schema.jsonl, so `bun run xt:coverage json-schema` cannot run.
  decisions/MAINT-2026-10-22-consequence-rows.md requires the row in an
  Infrastructure change before the Component's first Story with Xaravel
  Tests, and Story 16.1 is that Story (stories/16.1.md lists
  XT-json-schema-1). PRD prd-xaravel-2026-10-15/prd.md:984, FR-84 "Image and
  JSON Schema", has no Consequences list. `tools/` and `/conformance/` are
  Protected Paths.
---

# ESC-16.1-3: no consequence row for `json-schema`

The consequence-rows ruling requires each Component's `CONSEQUENCE_SOURCES` row before its first Story with Xaravel Tests. Story 16.1 is that Story for `json-schema`, and the row does not exist. Option 1 adds `'json-schema': { frs: [], ads: [2, 6] }` and its generated file, as ESC-15.1-3 did for config.
