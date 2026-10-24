---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "05695d4d99e8e19dc7b7780f8718e75cc4d3cacb148ef2d1b994e20cca1e5119"
---

# ESC-10.2-10: approved, option 3 (a waiver covers both reviewers' rejects)

Option 3 is approved. Options 1 and 2, raising `WHOLE_FILE_CAP` or widening `dataFileExcerpt`, are not taken: the Maintainer chose to waive F-7 for Story 10.2 (ESC-10.2-9), not to enlarge the prompt.

## Why

The ESC-10.2-9 waiver as first written counted a waived reject only beside the other reviewer's `pass`. A reject's findings are carried into the next review, and a carried finding that is not fixed must fail its item (ESC-8.8-1 item 3). So once one reviewer failed the waived F-7, the other had to fail it too. Story 10.2's fifth review, on tree 5cb66834, shows exactly this: both reviewers reject, each failing only F-7. Every other item passes with both.

## The change

`decisions/MAINT-2026-10-23-fidelity-waivers.md` item 3 now says that a reject that fails only waived items counts as a pass, in one slot or both. A fail on any item not waived still blocks, the cross-model rule still applies, and both reviewers still run. `fidelityVerdicts` and the `review` exit rule in `tools/fidelity-review/fidelity-review.ts` apply it.

## The route

Story 10.2 runs its Fidelity Review again on its current tree. A result whose rejects fail only F-7 counts under ESC-10.2-9's waiver, and `story:check`'s `approvals` clause passes, naming that decision. The Story then clears its block and continues.
