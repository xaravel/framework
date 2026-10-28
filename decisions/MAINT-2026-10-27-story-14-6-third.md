---
decision: approved
decided_by: Maintainer
date: 2026-10-27
scope: Story 14.6 (Arr helpers), ESC-14.6-6 and ESC-14.6-7
---

# Ruling: Story 14.6, third run

Story 14.6's third run (#506) raised two `contract` Escalations for the six Test IDs it still holds.

| Escalation | Decided by | Ruling |
|---|---|---|
| ESC-14.6-6 (5 Test IDs) | monitor, under `decisions/MAINT-2026-10-26-runtime-builtins.md` | approved: contract tokens stay PHP class-name strings through `valueCopy`, the binder and the shared type classification |
| ESC-14.6-7 (1 Test ID, `testPush`) | Maintainer | approved: a runtime offset-reference seam with PHP's write-through results; PHP's indirect-modification notice is not raised (DIV-9.17), since the runtime has no PHP error reporting |

## The route

1. Action item `epic-14-item-13-runtime-class-string-tokens` builds ESC-14.6-6, as one Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime`.
   - **Tests:** XT-runtime cases against PHP: direct, selected, nested and default tokens.
   - **Limits:** existing exports stay; no other behaviour changes; `packages/assert` and class constructors are out of scope.
2. Action item `epic-14-item-14-runtime-arrayaccess-offset-reference` builds ESC-14.6-7, as a second Maintainer-approved Infrastructure change.
   - **Scope:** `packages/runtime`. DIV-9.17, added by this ruling, already covers the missing notice.
   - **Tests:** XT-runtime cases against the pinned PHP probe in the Escalation: a builtin `ArrayObject` root, a subclass overriding `offsetGet`, a root leaf and the null-key cases.
   - **Limits:** existing exports stay; no other behaviour changes; no notice is raised.
3. Story 14.6 then resumes. It ports the five typed accessors and `push` and their Test IDs (`testItGetsAString`, `testItGetsAnInteger`, `testItGetsAFloat`, `testItGetsABoolean`, `testItGetsAnArray` and `testPush`), makes `Arr.set` keep an `ArrayAccess` root's handle through the seam, and re-runs its Fidelity Review.
