---
test_ids:
  - XT-conformance-100
trigger: contract
proposed: >-
  Story 8.5's reviewers' checklist, `conformance/review/fidelity.md`, cites the
  "Precedence" section of `conformance/README.md` in its "every new Skip
  Reason is justified, and its precedence is right" item. Story 5.2 documents
  the FR-3 precedence order there now and ships AC 9 conditional on this
  Escalation; it does not create `conformance/review/` (Story 8.5 owns it).
evidence: >-
  Story 5.2's ninth AC (epics.md:2257-2259) says "the documentation lists the
  order, and the reviewers' checklist (Epic 8) references it". The checklist
  is Story 8.5's `conformance/review/fidelity.md`, which does not exist yet;
  8.5's AC (epics.md:2834) only says "every new Skip Reason is justified, and
  its precedence is right", with no reference to `conformance/README.md`. Story
  5.2 cannot satisfy the "references it" half without writing another Story's
  file, and Story 8.5's contract does not yet require the reference.
---

# ESC-5.2-1: the Epic 8 checklist should cite the precedence section

Story 5.2 documents the FR-3 Skip Reason precedence order in `conformance/README.md` ("Precedence"). Its AC also asks that the reviewers' checklist (Epic 8) reference it, but that checklist is Story 8.5's `conformance/review/fidelity.md`, which does not exist yet, and 8.5's AC does not mention the reference.

The options:

1. **Add the reference to Story 8.5's contract (proposed).** When 8.5 writes `conformance/review/fidelity.md`, its precedence item links to `conformance/README.md#precedence`. Story 5.2 ships the documentation now, and AC 9 is complete when 8.5 lands.
2. **Have Story 5.2 create a stub checklist.** That edits a file another Story owns and pre-empts its design.
3. **Drop the "references it" half.** That changes Story 5.2's AC.

Option 1 changes no code, weakens no check, and keeps each Story within its own files. The Story spec is `_bmad-output/implementation-artifacts/spec-5-2-skip-reason-rule-checks.md`.
