---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-19
escalation_sha256: "34b859b420c6af8c13fb8360c2b6e10235f0d07059775afd2fbd22990d802022"
---

# ESC-6.4-1: approved, option 1 (tag the two grader helpers and commit their surface)

`runCounted` and `runWithMockery` in `packages/assert/src/declarations/` each gain an `@asyncRoot callback` JSDoc tag, and Story 6.4 commits the generated `packages/assert/async-surface.json` with their two lines. "Public method" stays every exported declaration in a package's `src/` (per file), as Story 6.4's spec and Story 6.3's `no-maybe-promise-return` define it.

Rationale:

- **The tags are true.** Both functions await a callback the caller supplies, and that callback may be async, which is AD-6's callback clause.
- **AD-6 covers cross-module seams.** The rule exists so that no agent decides a seam's async-ness ad hoc. A helper shared between modules is such a seam, whether or not the package entry point re-exports it.
- **One definition of "public" across the static checks.** Option 3 would make the async-surface tool disagree with Story 6.3's lint rule, and it needs re-export resolution. Option 2 would leave the grader with no record.
- **The grader is not weakened.** Only JSDoc comments are added: no assertion, expected value, skip, `adapted:` marker or behaviour changes. Story 6.4 is a Phase 0 Infrastructure Story, so its edit to `packages/assert/` (a Protected Path) falls under the MAINT ruling's second amendment.
- **No planning document changes, and no run-time cost.**

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun. The Maintainer may overrule it; the status issue reports it.
