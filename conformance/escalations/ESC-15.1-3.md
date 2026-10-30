---
test_ids:
  - XT-config-1
  - XT-config-2
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change adds
  `config: { frs: [20], ads: [2, 6] }` to `CONSEQUENCE_SOURCES` in
  tools/xt-coverage/consequences.ts, by the rule of
  decisions/MAINT-2026-10-22-consequence-rows.md (Epic 15's Covers line is
  "FR-20, through the Repository and the env parser", and FR-20 has a
  Consequences list; plus AD-2 and AD-6), generates
  conformance/xaravel-consequences/config.jsonl with
  `bun run xt:consequences`, and extends XT-conformance-126 to derive the row
  from Epic 15's Covers line, as #446 did for collections. XT-config-1 and
  XT-config-2 then cite the ids that file holds (AD-5.5 and AD-10.7 are
  runtime's, so the ruling should also say whether an XT may cite another
  Component's consequence ids). Option 2: no row until a later Story of
  Epic 15 adds its first FR-20 Xaravel Test.
evidence: >-
  tools/xt-coverage/consequences.ts CONSEQUENCE_SOURCES (line 52) has rows
  for conformance, runtime, contracts, macroable, conditionable, reflection
  and collections only; conformance/xaravel-consequences/ has no
  config.jsonl, so `bun run xt:coverage config` cannot run. Its docblock and
  decisions/MAINT-2026-10-22-consequence-rows.md ("Later Components get
  their rows the same way, each in an Infrastructure change before the
  Component's first Story with Xaravel Tests") require the row before Story
  15.1, which is config's first Story with Xaravel Tests (XT-config-1, -2).
  lessons.md (epic 13): a non-blocking F-7 gap from a missing row still
  needs its cause fixed. `tools/` and `/conformance/` are Protected Paths.
---

# ESC-15.1-3: no consequence row for `config`

The consequence-rows ruling requires each Component's `CONSEQUENCE_SOURCES` row in an Infrastructure change before its first Story with Xaravel Tests. Story 15.1 is that Story for `config`, and the row does not exist. Option 1 adds `config: { frs: [20], ads: [2, 6] }` and its generated file, as #446 did for collections.
