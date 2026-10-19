---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-19
escalation_sha256: "62d4596fa42ee375ce0889e3fb74b7dab1834cc27082edb67259e165e84038a6"
---

# ESC-6.2-1: approved, option 2 (the identity rule does not apply to the grader)

`xaravel/no-identity-constructor-name` reports `<expr>.constructor.name` in every linted file except the grader's locations: `packages/assert/`, `packages/mockery/`, `conformance/` and `tools/`. Framework packages (their `src/` and `tests/`), `installer/` and `skeleton/` stay covered. The two grader test helpers that label values with a class name stay as they are.

Rationale:

- **The rule is about identity, and the grader has no identity source.** AD-10 makes `fqcn()` the only class identity. AD-15's grader isolation forbids `@xaravel/assert`, `@xaravel/mockery` and the harness from importing a graded package, and the Class Registry lives in graded `@xaravel/runtime`. The grader cannot call `fqcn()`, so its class-name reads are for display.
- **Option 1 would hide the read without changing it.** Any rewrite of those two lines still reads the constructor's name, by a route the rule does not match.
- **It matches the sibling rule.** `xaravel/no-framework-json-stringify` already exempts the grader packages, following the spine's Dependency-direction table.
- **The grader is not weakened.** No assertion, expected value, skip or `adapted:` marker changes. XT-conformance-132 still fails the identity fixture in a framework placement, and it shows that a grader placement is exempt.
- **No planning document changes and no run-time cost.** The rule runs at lint time only.

This ruling falls within the orchestrator's authority under `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. It does not weaken the grader, add a divergence outside DIV-1..12, or make Xaravel slower or less faithful to Laravel on Bun. The Maintainer may overrule it; the status issue reports it.
