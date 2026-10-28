---
decision: approved
decided_by: monitor
date: 2026-10-27
scope: Story 14.6 (Arr helpers), ESC-14.6-5
---

# Ruling: Story 14.6, second run

Story 14.6's second run (#503) released the Arr helpers that did not need the binder, and raised one `contract` Escalation for the six it holds.

| Escalation | Decided by | Ruling |
|---|---|---|
| ESC-14.6-5 (6 Test IDs) | monitor, under `decisions/MAINT-2026-10-26-runtime-builtins.md` | approved: `bindPhpArguments` accepts `ArrayAccess\|array` declarations with PHP's behaviour and `TypeError` text |

## The route

1. Action item `epic-14-item-12-runtime-binder-arrayaccess-union` builds ESC-14.6-5, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime`.
   - **Tests:** XT-runtime cases against PHP: branded `ArrayAccess` instances, PHP array forms, invalid inputs and unused invalid defaults.
   - **Limits:** existing exports and binder behaviour stay; no other behaviour changes.
2. Story 14.6 then resumes. It ports the six Test IDs this releases (`testItGetsAString`, `testItGetsAnInteger`, `testItGetsAFloat`, `testItGetsABoolean`, `testItGetsAnArray` and `testPush`) and re-runs its Fidelity Review.
