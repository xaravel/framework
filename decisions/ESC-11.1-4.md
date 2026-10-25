---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "51c7c9914b4d8ff9e79b2d2e01287abc12889a0ecda563ac075ce8b24925ff5e"
---

# ESC-11.1-4: approved, the test devDependencies land once for every graded package

The Maintainer gave this ruling on 2026-10-24 in the Maintainer's session. Each later Component's first tests would raise the same Escalation, so this ruling goes beyond option 1, a one-off for macroable, and option 2, a standing rule that lets each Story edit its own `bun.lock` entry. It makes the change once, for every graded package, in this Maintainer-approved Infrastructure PR.

## The change

- Every graded package's `package.json` lists `@xaravel/assert` and `@xaravel/mockery` in `devDependencies`, unless it already declares them in `dependencies`, `peerDependencies` or `devDependencies`.
  - 47 packages gain both.
  - `@xaravel/runtime` keeps `@xaravel/assert` only. Its tests use no Mockery, and XT-runtime-4 checks runtime's graph in a temp root that has only the runtime, support and assert rows.
  - `@xaravel/contracts` already had both.
- `bun.lock` is regenerated with `bun install`. The diff only adds the `devDependencies` blocks of those workspace entries, with no resolution or version change. `bun install --frozen-lockfile` passes on it.
- `graph:check` passes (53 packages): AD-2 allows grader packages as devDependencies of any graded package.

A Story therefore never needs to touch `bun.lock` to import the grader in its tests. A Story that needs any other new dependency still raises an Escalation.

## The route

Story 11.1 resumes once this ruling is on `main`. `packages/macroable/package.json` already has the two devDependencies its implementation branch added (`story/11.1-impl`), and `bun.lock` already lists them, so the Story's own `package.json` diff becomes empty. ESC-11.1-1 is ruled in `decisions/ESC-11.1-1.md`. ESC-11.1-2 and ESC-11.1-3 (`contract`) are for the orchestrator to rule.
