---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "62d4596fa42ee375ce0889e3fb74b7dab1834cc27082edb67259e165e84038a6"
---

# ESC-6.2-1: approved, option 2

The Maintainer approved this in the Maintainer's session on 2026-10-19.

`xaravel/no-identity-constructor-name` is an error over every framework package's `src/` and `tests/`, `installer/` and `skeleton/`, and does not apply in the grader's locations: `packages/assert/`, `packages/mockery/`, `conformance/` and `tools/`. Story 6.2 already ships it this way (`docs/ops/lint.md`).

Rationale: AD-15's grader isolation forbids those locations from importing `fqcn()`, which lives in graded `@xaravel/runtime` (AD-10), so their class-name reads are for display only, never for identity. Option 1 would read the constructor's name by another route, which defeats the rule rather than meeting it.
