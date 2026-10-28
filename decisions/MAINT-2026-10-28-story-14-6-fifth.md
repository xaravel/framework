---
decision: approved
decided_by: monitor
date: 2026-10-28
scope: Story 14.6 (Arr helpers), ESC-14.6-9
---

# Ruling: Story 14.6, fifth run

Story 14.6's fifth run (#515) raised one `contract` Escalation for `testPush`, its last held Test ID: reference acquisition from a receiver that is not an `ArrayAccess` object, such as a string.

| Escalation | Decided by | Ruling |
|---|---|---|
| ESC-14.6-9 (`testPush`) | monitor, under `decisions/MAINT-2026-10-26-runtime-builtins.md` (construct amendment) | approved, scoped to the whole matrix: `referenceAt(ref, key)`, PHP's `&$x[$k]` on any value, with its PORTING.md idiom row |

This is the fourth `push` Escalation in a row (ESC-14.6-5, -7, -8, -9), each for one more receiver kind. The action item therefore covers every receiver kind PHP distinguishes, so a later probe should not need a fifth.

## The route

1. Action item `epic-14-item-16-runtime-reference-at` builds ESC-14.6-9, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime`. The PORTING.md row is in this ruling.
   - **Tests:** XT-runtime cases against PHP for each receiver kind (array forms, `null`, `false`, `true`, int, float, string with numeric and non-numeric offsets, builtin and userland `ArrayAccess`), chained with `offsetAssign`, and the Escalation's four pinned keys.
   - **Limits:** existing exports stay; no other behaviour changes.
2. Story 14.6 then resumes, ports `push` with its `Arr.set` repair through `referenceAt` and `offsetAssign`, and re-runs its Fidelity Review. If a receiver kind is still missing, the Escalation names every remaining kind at once.
