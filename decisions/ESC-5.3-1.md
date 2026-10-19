---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "c66571b4c01605cf534b93f2e048911f034d83149d78a18910fe897ceb584d44"
---

# ESC-5.3-1: approved, option 1

The Maintainer approved this in the Maintainer's session on 2026-10-19. With this ruling, Story 5.3's AC 4 is met.

Story 17.2, the first Story that raises `BlockedByComponentError`, defines it in `@xaravel/runtime`, registered as a framework class, with `name` `BlockedByComponentError` and a message that starts `BlockedByComponentError(<c>)`, where `<c>` is the owning Component's package name from the component map. `epics.md` Story 17.2 now carries that criterion. Under a `skip` / `blocked-by:<c>` Expectations line, the harness matches a test whose junit failure has `type="BlockedByComponentError"` and a message starting `BlockedByComponentError(<c>)`; any other failure is a mismatch.

Rationale: the harness may not import a graded package (AD-15), so it can match only what bun's junit report records, and the form must be fixed before the raising Story picks one. Option 2 would put a framework class in the grader, and option 3 would let any `Error` with a matching message satisfy a `blocked-by` line. Option 1 keeps the match strict and changes no graded code.
