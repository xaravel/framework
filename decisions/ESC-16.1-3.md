---
decision: approved
decided_by: monitor
date: 2026-10-30
escalation_sha256: "83a7926b7118dc945db4345d42e6fe29614db16a0e9e13059e51593d9366f534"
---

# ESC-16.1-3: approved, option 1 (`json-schema` gets its consequence row before Story 16.1)

The monitor approved option 1 on 2026-10-30 as the second key, as the 2026-10-30 amendment to `decisions/MAINT-2026-10-16-unattended-orchestrator.md` requires for a `protected-path` Escalation. It applies the Maintainer's standing rule `decisions/MAINT-2026-10-22-consequence-rows.md` exactly ("Later Components get their rows the same way, each in an Infrastructure change before the Component's first Story with Xaravel Tests"), as ESC-15.1-3 did for `config`. The Maintainer was told in the Maintainer's session.

Built in this ruling's PR: `CONSEQUENCE_SOURCES` in `tools/xt-coverage/consequences.ts` gains `"json-schema": { frs: [], ads: [2, 6] }` (Epic 16 covers FR-84, which has no consequence list), `bun run xt:consequences` generates `conformance/xaravel-consequences/json-schema.jsonl`, and XT-conformance-126 derives the row from Epic 16's Covers line. XT-json-schema-1 then cites the AD-2 and AD-6 ids it tests.
