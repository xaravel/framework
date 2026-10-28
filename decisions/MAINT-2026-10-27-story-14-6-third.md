---
decision: approved
decided_by: monitor
date: 2026-10-27
scope: Story 14.6 (Arr helpers), ESC-14.6-6
---

# Ruling: Story 14.6, third run

Story 14.6's third run (#506) raised two `contract` Escalations for the six Test IDs it still holds. This file rules on one of them.

| Escalation | Decided by | Ruling |
|---|---|---|
| ESC-14.6-6 (5 Test IDs) | monitor, under `decisions/MAINT-2026-10-26-runtime-builtins.md` | approved: contract tokens stay PHP class-name strings through `valueCopy`, the binder and the shared type classification |
| ESC-14.6-7 (1 Test ID, `testPush`) | Maintainer | pending: PHP's offset-reference behaviour for a userland `offsetGet` raises a notice, and the runtime has no notice channel, so it is outside the standing rule |

## The route

1. Action item `epic-14-item-13-runtime-class-string-tokens` builds ESC-14.6-6, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime`.
   - **Tests:** XT-runtime cases against PHP: direct, selected, nested and default tokens.
   - **Limits:** existing exports stay; no other behaviour changes; `packages/assert` and class constructors are out of scope.
2. Story 14.6 then resumes. It ports the five typed accessors and their Test IDs (`testItGetsAString`, `testItGetsAnInteger`, `testItGetsAFloat`, `testItGetsABoolean` and `testItGetsAnArray`) and re-runs its Fidelity Review. `testPush` stays held on ESC-14.6-7.
