---
status: draft
---

# Story 8.7: `PORTING.md` pilot on Support and Collections

## Auto Run Result

Status: blocked
Blocking condition: intent gap, raised as `conformance/escalations/ESC-8.7-1.md` (open-question). The first criterion asks that the pilot translations type-check, meet the assertion floor against the Inventory, and pass a Fidelity Review. In Phase 0 none of these can be met as written:

- `@xaravel/collections` and `@xaravel/support` are empty scaffolds, so type-checking needs declarations for another Component, which the no-stub rule forbids.
- The assertion floor is measured only at run time.
- The Fidelity Review needs a `story/<id>` head and the manifest's `test_ids`, and posts nothing until ESC-8.5-1 is ruled.

Each check has more than one defensible reading. The Escalation proposes one for each, recommends a stratified seeded sample that includes all 4 Mockery rows, and lists the two `PORTING.md` gaps found so far: no data-provider rule and no Mockery rule. No spec was planned past this point. Planning resumes from the ruling.
