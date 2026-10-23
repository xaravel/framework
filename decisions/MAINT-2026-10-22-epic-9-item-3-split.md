---
decision: approved
decided_by: Maintainer
date: 2026-10-22
scope: action item epic-9-retro-item-3-scope-registry-gaps (its Oracle rows, finding S2), and new Story 9.13
---

# Maintainer ruling: Epic 9 retro item 3 is split, and its Oracle rows become Story 9.13

The Maintainer gave this ruling on 2026-10-22, in the Maintainer's session.

## Why

Action item `epic-9-retro-item-3-scope-registry-gaps` combined two kinds of work:
- runtime fixes, findings L1–L5, L15 and L16;
- Oracle rows for XT-runtime-12..14, 18, 20 and 23 (finding S2).

#324 stopped the item: the Oracle rows cannot be signed on the retro-item route (MAINT-2026-10-16, amendment 2026-10-22).
- `oracle.yml`'s `story` job signs fixtures only for a `story/<epic>.<story>` head branch.
- That job reads `conformance/oracle-requests/<story-id>.jsonl`, and the Oracle tools reject any other file name.

The Fidelity Review reads an item's scope and intent from its whole `action`. So the fixes could not go ahead alone either.

## The ruling

- **Item 3 is narrowed to the runtime fixes.** Its `action` now names findings L1–L5, L15 and L16 only, and says where S2 went. It is `open` again and leaves `waiting_on_maintainer`. The loop does it on the retro-item route, starting from the investigation notes in `bmad-build-auto-result-epic-9-retro-item-3-scope-registry-gaps.md`.
- **The Oracle rows become Story 9.13** (component `runtime`), on `story/9.13`:
  - It assigns XT-runtime-12, 13, 14, 18, 20 and 23. Their Stories (9.4, 9.5, 9.6) are `done`, so the manifests do not conflict.
  - It writes `conformance/oracle-requests/9.13.jsonl`, and the Oracle signs that file through the existing `story` job.
  - Each test then compares Xaravel's result with the signed fixture.
  - A runtime difference a fixture shows is fixed in `packages/runtime`, as in any Story.
  - No assertion is removed or weakened.
- **Not taken:**
  - Teaching `oracle.yml` and `tools/oracle/` action-item ids. That changes the Protected signing path for one case.
  - Reopening the branches of done Stories 9.4–9.6.

## Order

- Epic 9 is `in-progress` again until Story 9.13 is `done`. Step F runs epics strictly in order, and items 3–5 already hold Epic 10 until they are done.
- The loop therefore does items 3–5, then Story 9.13, then resumes Story 10.1.
- Epic 9's retrospective stays `done`: it does not run again when Story 9.13 closes the epic.

## Changes in this ruling's PR

- **`epics.md`:** adds Story 9.13 with four criteria.
- **Manifest:** `stories/9.13.md` is created, `backlog`.
- **Sprint status:**
  - Story 9.13 is `backlog`, and Epic 9 is `in-progress`.
  - Item 3's `action` is narrowed, and it is `open`.
- **`retro-gates.yaml`:** item 3 leaves Epic 9's `waiting_on_maintainer`.
- **Retro and build notes:** finding S2 in the retrospective and the item's build-result note record the split.
