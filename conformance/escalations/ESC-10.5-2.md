---
test_ids:
  - XT-contracts-13
trigger: protected-path
proposed: >-
  Option 1 (recommended): an Infrastructure change to
  `tools/async-surface/async-surface.ts` makes `thenableTypes(root)` resolve
  `@xaravel/contracts/async` from `<root>/packages/contracts` (the package
  resolves its own subpath through its `exports`) before it tries `root`,
  and keeps the tool's own list as the fallback for temp roots with no
  contracts package. XT-contracts-13 then also checks that `thenableTypes`
  returns the contracts list, not the tool's. Option 2: add
  `"@xaravel/contracts": "workspace:*"` to the root `package.json`
  `devDependencies` (and `bun.lock`), so `Bun.resolveSync` from the
  repository root finds the package, as the Story spec's matrix assumes.
evidence: >-
  Story 10.5's first AC says the `async-surface` tool "now reads its
  thenable list from here". `thenableTypes(root)`
  (`tools/async-surface/async-surface.ts:568`) calls
  `Bun.resolveSync("@xaravel/contracts/async", root)` with `root`, which
  defaults to the repository root. The repository installs workspaces with
  Bun's isolated linker (`bun.lock` `configVersion: 1`), so the root
  `node_modules` holds only the root `devDependencies` (`@types`,
  `oxc-parser`, `oxlint`, `oxlint-tsgolint`, `typescript`) and no
  `@xaravel/*` link. The call throws, and the tool falls back to its own
  `THENABLE_TYPES`: `await thenableTypes(process.cwd())` returns the
  `tools/lint-rules/thenables.ts` array itself. The subpath does resolve
  from `packages/contracts` and from any package that depends on it
  (`packages/support`). Both lists hold the same 26 FQCNs in the same order,
  so `async-surface.json` does not change today, but a later change to the
  contracts list would not reach the tool. Either fix edits a Protected
  Path (`/tools/`, or `/package.json` and `/bun.lock`), which a Story may
  not change.
---

# ESC-10.5-2: `async-surface` does not find `@xaravel/contracts/async` from the repository root

`@xaravel/contracts/async` exports `THENABLE_TYPES`, the same 26 FQCNs in the same order as the tool's list. `thenableTypes(root)` would use it, but it resolves the subpath from the repository root, where Bun's isolated linker puts no `@xaravel/*` package, so the tool falls back to its own list. Making the tool read the contracts list changes `tools/**` or the root `package.json` and `bun.lock`, which are all Protected Paths.

The Story builds everything inside `packages/contracts/**`. XT-contracts-13 checks that the subpath resolves to `src/async/index.ts` from the contracts package and from a dependent package, and that its export is the non-empty string array `thenableTypes` accepts. It does not check resolution from the repository root, which fails today. This blocks the "tool reads it" part of XT-contracts-13 only. XT-contracts-14 and XT-contracts-15 do not depend on it.
