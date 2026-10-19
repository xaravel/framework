---
status: blocked
---

# BMad Build Auto Result

Status: blocked
Blocking condition: intent gap

Intent: Epic 5 retrospective action item `epic-5-retro-item-9-story-check-fixtures-gaps` (finding S6, `_bmad-output/implementation-artifacts/epic-5-retro-2026-10-19.md`). Planning halted before a spec was written; no code changed.

## Unanswered questions

1. **Which assigned Test ID counts as a Differential Test with no Oracle request?** The ruling `decisions/ESC-3.1-1.md` and `docs/ops/oracle.md` ("The Differential set") define the set as closed: a Test ID × dataset is Differential *exactly when* its family extractor, or a Story 3.4 per-Story request, captures an input. Under that definition no Differential Test lacks a request, which is why the Story 5.9 review rejected this finding as false (`spec-5-9` Review Triage Log). Making the clause fail would need a new definition. One choice is "every Test ID whose Inventory `source` is in a family module's `files` list". But ESC-3.1-1 keeps unreadable bodies in those files as ordinary Ported Tests, so every Story porting one would then fail the done check. The two readings give different done verdicts, and choosing between them overrides an existing ruling.
2. **What is "the error Upstream records"?** The only Upstream outcome recorded per Test ID is the Inventory `oracle` map (alpha Variant → `pass` | `fail`, `tools/inventory/inventory.ts` `InventoryEntry`). No artifact records Upstream's error class, message or stage, and the fixture's `output.error` has nothing to be compared against. Comparing them would first need a new recorded datum, for example an Inventory or baseline field for the failure. That changes the Inventory format and the committed grader data under `conformance/inventory/`, which a retrospective action item may not decide.

## Evidence

- `tools/story-check/story-check.ts:252-288` (`fixturesClause`): `due` is the committed requests the assignment covers, and the error exemption is "every Inventory outcome is `fail`".
- `tools/oracle/verify.ts:79-112` (`committedRequests`): the batch and per-Story requests, the only source of Differential ids.
- `decisions/ESC-3.1-1.md` (the closed Differential set), `docs/ops/oracle.md:109-111`.
- `tools/inventory/inventory.ts:118-129`: an Inventory entry records no error detail.

Route: waiting on the Maintainer (orchestrator step D).
