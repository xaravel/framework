---
decision: approved
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-24
escalation_sha256: "32a1c9f4818aa765e201c8bf3bd66feea2cd7b0cdc9cfe401c87ce435df8051e"
---

# ESC-10.5-2: approved, option 1 (`async-surface` resolves `@xaravel/contracts/async` from `packages/contracts` first)

`thenableTypes(root)` in `tools/async-surface/async-surface.ts` now resolves `@xaravel/contracts/async` from `<root>/packages/contracts` when that directory holds a `package.json`, so the package resolves its own subpath through its `exports`, and only then from `root`. When neither resolves, or the module does not export a non-empty `string[]`, the tool keeps its own `THENABLE_TYPES` as before, so temp roots with no contracts package behave as they did. In the repository, `await thenableTypes(process.cwd())` now returns the contracts package's array, not the tool's.

`conformance/tests/xaravel/async-surface.test.ts` (XT-conformance-134) now also asserts that a temp root with `packages/contracts` and no root link reads that package's list, that the package wins over a root link, and that the repository's own root reads `@xaravel/contracts/async`'s array and not the tool's. `docs/ops/async-surface.md` says where the list resolves from.

Rationale:

- **It is within the orchestrator's ruling power.** No assertion, expected value, skip or `adapted:` marker is removed or weakened; assertions are added. No divergence is added, and nothing becomes slower: one more `Bun.resolveSync` per tool run. It makes the tool do what Story 10.5's first AC and AD-6 say: read its thenable list from the contracts package. The precedent is ESC-9.9-1, a Protected Path change in the harness that the orchestrator ruled on and built in its planning PR.
- **Option 1 over option 2.** Option 2 adds `@xaravel/contracts` to the root `devDependencies` and `bun.lock`, which makes the root workspace depend on a framework package only to serve one tool, and changes the install for every contributor. Option 1 stays inside the tool and leaves the fallback for temp roots in place.
- **`async-surface.json` does not change.** Both lists hold the same 26 FQCNs in the same order today, so `bun run async-surface --all --check` passes unchanged.

This ruling clears ESC-10.5-2 for XT-contracts-13: when Story 10.5 resumes, XT-contracts-13 may also check that `thenableTypes` returns the contracts list, as the Escalation proposes. Story 10.5 stays blocked on ESC-10.5-1 (divergence, an AD-25 correction), which waits on the Maintainer.
