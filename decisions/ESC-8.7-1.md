---
decision: approved
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "6050d575800277a047ef4caddbf6241166c494f9a18ab2dd7abebb8fec1f9726"
---

# ESC-8.7-1: approved, the recommended Phase 0 reading of the pilot's three checks

The Maintainer accepts options 1(a) and 2(a) and the stratified sample. Option 3 is replaced by the in-loop Fidelity Review that ESC-8.5-1's ruling sets up.

1. **Type-check against declarations.** The pilot translations type-check against declaration-only `.d.ts` files for `Collection`, `LazyCollection`, `Arr`, `Str` and `Stringable`, generated from `conformance/api-surface/{collections,support}.jsonl` and kept only on the unmerged `pilot/porting` branch. This is not a stub under AGENTS.md or F-8: no graded test runs against them, nothing implements behaviour, and none of it reaches `main`.
2. **Static assertion floor.** For every sampled Test ID, each assertion kind the Inventory records appears at least as often among the translation's assertion call sites, with an `adapted:DIV-<n>.<k>` marker on any shortfall. The pilot report lists every case where loops or data-provider rows make the static count approximate. The executed floor is checked when Epics 14 and 18 port these tests for real.
3. **Fidelity Review in the loop.** The pilot's translations pass the Fidelity Review as ESC-8.5-1's ruling redefines it: two reviewer agents in the Story's review step, one on the other model when available. The verdicts go in the pilot report and the Story's spec. No GitHub Apps and no review-only PR are needed. Story 8.7 resumes once Epic 8 action item 1 (the review rebuild) is done. This is the first supervised run: the Maintainer reads both verdicts before any Story relies on them.

**Sample.** All 4 Mockery rows, then `sampleIds` from `conformance/harness/select.ts` per file and data-provider stratum, at least 60 IDs in all.

Rationale: options 1(c) and 2(b) would wait for Epics 14 and 18, but Story 8.8 needs the pilot report to close Phase 0, so they would reorder the plan. The in-loop review is the real reviewer for every Story from now on, so the pilot exercises it instead of a stand-in.
