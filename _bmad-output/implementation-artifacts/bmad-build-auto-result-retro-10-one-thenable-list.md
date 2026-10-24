---
status: blocked
---

# BMad Build Auto Result

Status: blocked
Blocking condition: intent gap: the item cannot be done within the scope its `action` names. Action item `epic-10-retro-item-9-one-thenable-list` names only `tools/lint-rules`, but removing the copy of `THENABLE_TYPES` from `tools/lint-rules/thenables.ts` breaks XT-contracts-13 in `packages/contracts/tests/xaravel/seams.test.ts`. That test reads the tool file as text (`toolThenables()`, lines 121-125), asserts it lists 26 thenables in the contracts order (lines 236-237), and asserts that `thenableTypes(REPO)` is not the tool's array (`tool: false`, line 259). Re-pinning XT-contracts-13 to read one source, as finding S4 proposes, changes `packages/contracts/**`. On a `planning/retro-10-*` branch that is a `planning scope:` violation for a component the action does not name, so `decisions/MAINT-2026-10-16-unattended-orchestrator.md` (amendment 2026-10-22, "Outside the scope") makes the item wait on the Maintainer. The async-surface fallback (`tools/async-surface/async-surface.ts:585-601`) and the tool tests in `conformance/tests/xaravel/async-surface.test.ts` and `lint-signatures.test.ts` also import the copy. They are in scope for a `tools/` item, but this run did not change them.

Options for the Maintainer: (a) widen the item's `action` to name `packages/contracts` (its XT-contracts-13 pin), so the plugin and async-surface fallback both read `@xaravel/contracts/async`, resolved from `<repo>/packages/contracts`, and the test pins the lint plugin's list to the contracts array rather than to a literal; or (b) move the item to a Story of the contracts component.

No code was changed.
