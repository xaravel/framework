---
decision: approved
decided_by: Maintainer
date: 2026-10-23
scope: Fidelity Review, Maintainer waivers of checklist items
---

# Maintainer ruling: the Maintainer may waive a Fidelity Review item

The Maintainer gave this ruling on 2026-10-23, in the Maintainer's session, when ruling on ESC-10.2-9.

## Why

The Fidelity Review needs both reviewers to pass. Sometimes one reviewer rejects only because the prompt cannot show it everything it wants to check, while the other reviewer, the harness and the Story's tests all pass. Story 10.2 hit this four times in one evening (ESC-10.2-7, -8 and -9). Raising a cap each time keeps the loop waiting on the Maintainer. A waiver lets the Maintainer accept such a reject knowingly, on the record, and move on.

## The rule

1. **Who.** Only the Maintainer waives. A waiver lives in a decision on an Escalation, `decisions/ESC-<id>.md`, with `decided_by: Maintainer`, `decision: approved` and a current `escalation_sha256`. The orchestrator never writes one, and never recommends one as an Escalation's option (`tools/orchestrator/iteration.md`, step G).
2. **What.** The decision's frontmatter holds:

   ```yaml
   fidelity_waiver:
     subject: "<story id or action item id>"
     items: [F-7]
   ```

   `items` names the checklist items whose `fail` the Maintainer accepts for that Story or action item.
3. **How it counts.** A reviewer's `reject` counts as a pass when every item it fails is waived, in one slot or both. The cross-model rule (ESC-8.5-1) still applies.
   - A reject that also fails an unwaived item still fails.
   - Both slots may be waived rejects. A reject's findings are carried into the next review, and a carried finding that is not fixed must fail its item (ESC-8.8-1 item 3). So once one reviewer fails a waived item, the other must fail it too. Every item not waived must still pass with both reviewers.
   - `fidelityWaivers` and `waivedReject` in `tools/fidelity-review/fidelity-review.ts` apply this rule. The tool's `review` and `status` use it, and so does `story:check`'s `approvals` clause.
4. **Not bound to a tree.** A waiver holds for the subject's later reviews too. A merge to `main`, the waiver itself included, changes the reviewed tree, so a waiver bound to one tree would void itself. Each review still runs both reviewers. A new kind of failure, on an item not waived, still blocks.
5. **Nothing else changes.** The checklist, the verdict schema, the standing-reject rule (ESC-8.8-1) and how reviewers are chosen are unchanged. A waiver is recorded in the spec's verdict line and on `story:check`'s `approvals` line, so it is visible wherever the result is read.

## Amendment (2026-10-24, MAINT-2026-10-24-epic-10-items)

- **Rule 2.** `subject` is a quoted YAML string. An unquoted `subject: 9.10` is the number 9.1, so it grants nothing. `escalations:check` reports it as an invalid decision.
- **Rule 4.** "Each review still runs both reviewers" means each review of a new tree. When both reviewers already have records for the unchanged reviewed tree, and those records count under rule 3, `review` reports `current` and runs no reviewer. Re-running on the same tree is what the standing-reject rule (ESC-8.8-1) forbids. XT-conformance-162 pins this.
