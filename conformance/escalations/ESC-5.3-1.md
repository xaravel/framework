---
test_ids:
  - XT-conformance-104
trigger: contract
proposed: >-
  The Story that first raises `BlockedByComponentError` (Story 17.2) defines it
  in `@xaravel/runtime`, registered as a framework class, with `name` set to
  `BlockedByComponentError` and a message that starts
  `BlockedByComponentError(<c>)`, where `<c>` is the owning Component's package
  name from the component map (for example `BlockedByComponentError(database):
  ...`). That is the form Story 5.3's harness matches: under a
  `skip` / `blocked-by:<c>` Expectations line, a test whose junit failure has
  `type="BlockedByComponentError"` and a message that starts
  `BlockedByComponentError(<c>)` matches, and any other failure is a mismatch.
  Story 5.3 ships AC 4 conditional on this Escalation and defines no error class
  in a graded package.
evidence: >-
  Story 5.3's fourth AC (epics.md, Story 5.3) and AD-15 say `blocked-by:<c>` is
  valid only when the harness run fails with `BlockedByComponentError(<c>)`,
  raised when a token, alias or FQCN owned by `<c>` is resolved and `<c>` is not
  installed. No Story's contract defines the class, its `name` or its message
  format, and the harness may import no graded package (AD-15 grader isolation),
  so it can only match what bun's junit report records: the error's `name` as
  `type` and its message as `message` (checked on Bun 1.4.3). Without a fixed
  name and message prefix, the Story that adds the error could pick a form the
  harness never recognises, and every `blocked-by` line would mismatch.
---

# ESC-5.3-1: who defines `BlockedByComponentError`, and in what form

Story 5.3's harness matches a `skip` / `blocked-by:<c>` Expectations line only when the test fails with `BlockedByComponentError(<c>)` (AC 4, AD-15). No Story owns that error class yet, and the harness cannot import it (grader isolation), so it reads the failure from bun's junit report: `type` is the error's `name`, and `message` is its message.

The options:

1. **Fix the form in the raising Story's contract (proposed).** Story 17.2, which first resolves Component-owned tokens, defines `BlockedByComponentError` in `@xaravel/runtime` with `name` `BlockedByComponentError` and a message starting `BlockedByComponentError(<c>)`. The harness already matches that form.
2. **Have Story 5.3 define the class.** That puts a framework class in the grader or the harness, against AD-15's grader isolation, and pre-empts Story 17.2's design.
3. **Match on the message alone.** Any `Error` whose message happens to start `BlockedByComponentError(` would then satisfy a `blocked-by` skip, which weakens the rule.

Option 1 changes no code in a graded package and keeps the match strict. The Story spec is `_bmad-output/implementation-artifacts/spec-5-3-harness-runner-and-greppable-report.md`.
