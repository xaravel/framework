---
decision: approved
decided_by: Maintainer
date: 2026-10-24
escalation_sha256: "32a1c9f4818aa765e201c8bf3bd66feea2cd7b0cdc9cfe401c87ce435df8051e"
---

# ESC-10.5-2: approved (the async-surface tool reads `@xaravel/contracts/async` from the package)

The fix is approved, and this ruling's PR makes it.

- **Before:** `thenableTypes(root)` in `tools/async-surface/async-surface.ts` resolved `@xaravel/contracts/async` only from the repository root. Bun's isolated linker puts no `@xaravel/*` package there, so the tool always fell back to its own list.
- **After:** the tool also tries `packages/contracts`, where the package resolves its own subpath through its `exports`.

## What it does not change

- **The list:** the contracts list and the tool's fallback hold the same 26 FQCNs in the same order (ESC-10.5-2's evidence), so no committed `async-surface.json` changes.
- **The fallback:** the tool still falls back to its own list when neither place resolves the subpath, or when the module's `THENABLE_TYPES` is not a non-empty string array.
- **Neither file changes:** the root `package.json` and `bun.lock` stay as they are.

## Checks

- **New test case:** in `conformance/tests/xaravel/async-surface.test.ts`, a workspace with no root install, whose `packages/contracts` exports `./async`, gets that module's list.
- **Existing cases still pass:** the root-install case, the fallback and the malformed-module cases.

## The route

Story 10.5 resumes the "tool reads it" part of XT-contracts-13. With this change, `thenableTypes` of the repository root returns `@xaravel/contracts/async`'s `THENABLE_TYPES` once Story 10.5's `./async` export is on `main`.
