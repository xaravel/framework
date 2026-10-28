---
decision: approved
decided_by: monitor
date: 2026-10-28
scope: Story 14.6 (Arr helpers), ESC-14.6-8
---

# Ruling: Story 14.6, fourth run

Story 14.6's fourth run (#512) released the five typed accessors and raised one `contract` Escalation for `testPush`, the last Test ID it holds.

| Escalation | Decided by | Ruling |
|---|---|---|
| ESC-14.6-8 (`testPush`) | monitor, under `decisions/MAINT-2026-10-26-runtime-builtins.md` (construct amendment) | approved: `offsetAssign(ref, key, value)`, PHP's offset assignment on any value, with its PORTING.md idiom row |
| DIV-9.17 amendment | Maintainer | widened: the false-to-array deprecation is not raised either, until the runtime has PHP error reporting |

## The route

1. Action item `epic-14-item-15-runtime-offset-assign` builds ESC-14.6-8, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime`. The PORTING.md row is in this ruling.
   - **Tests:** XT-runtime cases against PHP: arrays, `null` and `false`, scalars, strings, `ArrayAccess`, nested writes through `offsetReference`, and the Escalation's pinned case.
   - **Limits:** existing exports stay; no other behaviour changes; the `valueCopy` depth limit is out of scope.
2. Story 14.6 then resumes. It ports `push` and its Test ID, with the `Arr.set` repair and the review repairs the Escalation lists, and re-runs its Fidelity Review.
