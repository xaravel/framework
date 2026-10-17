---
title: 'Story 2.8: Baseline Pin bump tool'
type: 'feature'
created: '2026-10-17'
status: 'blocked'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/stories/2.8.md'
  - '{project-root}/conformance/escalations/ESC-2.8-1.md'
---

# Story 2.8: Baseline Pin bump tool

## Intent

`bun run pin:bump <tag>` moves the Baseline Pin at a freeze point. It reports the added, changed (same ID, different `hash`) and removed Test IDs, resets changed IDs' Expectations to `skip` / `not-ported-yet`, carries a rename (same hash, new ID) over, retires removed IDs, writes added and changed IDs as backlog Story stubs grouped by Component, and refuses while any Epic is in progress (FR-7, UJ-7; `epics.md:1832-1863`). XT-conformance-62..67 verify the ACs in order (`stories/2.8.md`).

## Planning findings

- **Inventory:** `tools/inventory/inventory.ts` exports `readSuiteInventory(root, suite)` (:615), `parseInventory` (:475), `renderInventory` (:447), `carryOver` (:637), `compareUnits` (:166) and `SUITES`. A regenerated Inventory at a new Pin has `assertions: null` / `oracle: {}` for every new or changed entry until `baseline merge` runs (`tools/baseline/baseline.ts:528`).
- **Pin:** `tools/upstream/upstream.ts` exports `parsePin` (:61), `readPin` (:104), `frameworkTag` (:113) and `sync(root)` (:302). `sync` syncs only to the commit and tree already recorded in `conformance/baseline-pin` and has no resolve-a-new-tag API. `docs/ops/upstream.md:35-37` documents resolving a tag by hand and says the framework line moves only through this tool.
- **Image:** image-mode Inventory lists from the snapshot baked into the Oracle image, tagged `<frameworkTag>-<lockHash>` (`tools/oracle/oracle.ts:494`). So a new Pin needs new locks and a new image before the Inventory can be regenerated.
- **Sprint status:** `tools/ownership/ownership.ts:46` names `SPRINT_STATUS` and parses it with `Bun.YAML.parse` (:226-237). It is the only machine record of Epic status.
- **Expectations:** AD-15 (`ARCHITECTURE-SPINE.md:340`) fixes the shard path `conformance/expectations/<component>/<ported test file path>.jsonl` and the fields `id`, `variant`, `status`, `reason`, `adapted` and `escalation`. Story 5.1 owns it. `conformance/expectations/` does not exist yet.

## Auto Run Result

Status: blocked
Blocking condition: intent gap. Escalation `conformance/escalations/ESC-2.8-1.md` is open.

The ACs require on-disk forms that no planning document defines:
- what a retired Expectations entry is;
- where the "link to the previous Ported Test file" and the rename "history" live, given AD-15's six fixed fields;
- where backlog Story stubs are written, and in what format;
- how "an Epic is in progress" is detected;
- whether `<tag>` moves only the framework line of `conformance/baseline-pin`;
- how the tool gets the new Pin's Inventory, which needs a new snapshot, Oracle locks, an image and a regeneration.

Each reading gives observably different files, so step 2 halted instead of picking one. ESC-2.8-1 proposes option 1, which uses only existing formats. Once a decision file approves it, re-run Story 2.8: plan from the ruling and fill in this spec's intent contract, Code Map and tasks.

Unanswered questions:
1. Is a retired entry deleted from its shard and recorded elsewhere, or kept with a new field?
2. Is the shard path, which mirrors the Ported Test path under AD-15, enough as the "link to the previous Ported Test file"?
3. What does "history" carry across a rename, and where is it stored?
4. Where do Story stubs go: `stories/`, sprint status, or an implementation-artifacts list?
5. Is sprint-status.yaml's `epic-<N>: in-progress` the "in progress" test?
6. Does `pin:bump <tag>` also move ai, mcp and boost?
7. Does the tool run the regeneration chain (sync, locks, image, Inventory), or diff against an Inventory the Maintainer has already regenerated?
