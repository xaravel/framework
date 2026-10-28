---
decision: approved
decided_by: Maintainer
date: 2026-10-28
scope: Story 14.6 (Arr helpers), ESC-14.6-10
---

# Ruling: Story 14.6, sixth run

Story 14.6's sixth run (#518) raised ESC-14.6-10 for `testPush`, its last held Test ID: `referenceAt`'s cells outlive `Arr::set`'s traversal, so a later copy shares levels that PHP's copy does not.

| Escalation | Decided by | Ruling |
|---|---|---|
| ESC-14.6-10 (`testPush`) | Maintainer, on the monitor's recommendation | rejected: no runtime reference-lifetime protocol. A traversal reference that never outlives its function is ported by value (new rule in PORTING.md § By-reference parameters) |

## The route

1. No runtime action item. `offsetAssign`, `offsetReference` and `referenceAt` stay as they are.
2. Story 14.6 resumes. It ports `Arr.set`'s repair and `Arr.push` under the new PORTING rule: walk by value, write each level through `offsetAssign` / `offsetReference` as PHP initializes it, and leave no `Ref` cell shared after return. It adds the Escalation's copy-isolation matrix (lists, maps, `PhpArray`, a selected array, a returned root, a returned parent, repeated nested push, builtin and inherited `ArrayObject`, a held caller reference, a userland `offsetGet`) as XT-collections cases against the pinned PHP results, keeps ESC-14.6-9's receiver and error matrix, and re-runs its Fidelity Review.
