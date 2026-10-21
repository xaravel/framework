---
decision: approved
decided_by: Maintainer
date: 2026-10-21
escalation_sha256: "70d353127774c55620a1f6b9e36de926624f5e66daaef0c957c02e45ad80c631"
---

# ESC-9.1-3: approved, `runtime` gets a consequence file, and every Phase 1 Component gets one the same way

Option 1. This ruling's PR adds a `runtime` row to `CONSEQUENCE_SOURCES` in `tools/xt-coverage/consequences.ts` and generates `conformance/xaravel-consequences/runtime.jsonl` with `bun run xt:consequences`. The row takes the ADs the spine gives `packages/runtime` — AD-2 (dependencies), AD-5 (Scope Frames), AD-6 (async surface), AD-9 (PHP values), AD-10 (Class Registry) and AD-23 (codecs) — and no FR bullets. AD-26 is left out because its Rule is a table, not a bullet list, so it has no `AD-26.<k>` ids. Story 9.1 cites the exact bullet each XT-runtime test verifies, for example `AD-5.1` for the primitive and `AD-2.2` for XT-runtime-4.

So that no later Component stops on the same gap, the same rule covers every Component: a Component's row takes the FRs and ADs of every Capability Map row whose "Lives in" names it, plus any AD whose Rule names its package, keeping only ADs that have a Rule bullet list. This ruling approves the orchestrator making that Infrastructure change, in `tools/xt-coverage/consequences.ts` and the generated files only, for every Phase 1 Component, as action item `epic-9-item-1-consequence-rows`, before that Component's first Story with Xaravel Tests. Each such PR still waits for the Maintainer's approving review on `protected-paths`.
