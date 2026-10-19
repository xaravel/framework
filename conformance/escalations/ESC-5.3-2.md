---
test_ids:
  - XT-conformance-103
trigger: contract
proposed: >-
  A Divergence Record `decisions/DIV-<n>.md` (Story 8.1) declares which of its
  adaptation clauses allow a Ported Test to record fewer assertions than the
  Inventory with a YAML frontmatter list, `fewer_assertions: [<clause>, ...]`,
  whose items are the `<clause>` part of `adapted: DIV-<n>.<clause>`. Story
  5.3's harness waives the assertion floor for a line exactly when its
  `adapted` is `DIV-<n>.<clause>`, `decisions/DIV-<n>.md` exists, and its
  `fewer_assertions` list contains `<clause>`; without that, a below-floor pass
  is a `FLOOR` failure. Story 5.3 ships the waiver half of AC 3 conditional on
  this Escalation.
evidence: >-
  FR-113 says a Ported Test's assertion count is at least the Inventory's
  "unless a Divergence Record allows fewer", and Story 5.3's third AC says the
  floor fails "unless a DIV clause allows fewer". Story 8.1 owns the Divergence
  Records, and no contract gives them a machine-readable way to say a clause
  allows fewer assertions. The harness cannot read prose, so without a field it
  would have to either never waive the floor (breaking FR-113's exception) or
  waive it for any `adapted` value (letting any adaptation drop assertions,
  against SM-C1).
---

# ESC-5.3-2: a machine-readable "this DIV clause allows fewer assertions"

Story 5.3's harness checks the assertion floor (FR-113): a passing Ported Test whose kind multiset is smaller than the Inventory's fails, unless a DIV clause allows fewer. The Divergence Records are Story 8.1's, and nothing in their format says which clause allows fewer assertions.

The options:

1. **A `fewer_assertions` frontmatter list in the record (proposed).** `decisions/DIV-<n>.md` lists the clause identifiers whose adaptations may record fewer assertions, for example `fewer_assertions: [2]`. A line with `adapted: DIV-<n>.2` is waived; any other clause is not.
2. **Waive the floor for any `adapted` line.** Simple, but any adaptation could then silently drop assertions (SM-C1).
3. **Never waive.** FR-113's exception would be unusable.

Option 1 adds one field to a record Story 8.1 has not written yet, weakens no check, and keeps the waiver explicit per clause. The Story spec is `_bmad-output/implementation-artifacts/spec-5-3-harness-runner-and-greppable-report.md`.
