---
title: 'Epic 10 item 9: one thenable list, read by the lint plugin from @xaravel/contracts/async'
type: 'refactor'
created: '2026-10-24'
status: 'ready-for-dev'
baseline_revision: 'e3a8265d3f417f01abede9e40e0b240a5be2321e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

# Epic 10 item 9: one thenable list, read by the lint plugin from @xaravel/contracts/async

Action item `epic-10-retro-item-9-one-thenable-list` (finding S4, `_bmad-output/implementation-artifacts/epic-10-retro-2026-10-24.md`). Resumed under `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`, which lets the item re-pin XT-contracts-13 (`packages/contracts/tests/xaravel/seams.test.ts`) as a stale test.

<intent-contract>

## Intent

**Problem:** The thenable list lives twice: `@xaravel/contracts/async` exports `THENABLE_TYPES` (Story 10.5, the list "it replaces"), and `tools/lint-rules/thenables.ts:50` keeps its own 26-entry copy, which the lint plugin (`plugin.ts:34`) and the async-surface fallback read. XT-contracts-13 only pins the two equal by parsing the tool file as text.

**Approach:** Delete the array literal in `tools/lint-rules/thenables.ts` and re-export `THENABLE_TYPES` from the contracts module (`../../packages/contracts/src/async/index`, the relative form root files use for packages, since Bun's isolated linker puts no `@xaravel/*` in the root `node_modules`). The plugin, the async-surface fallback and the conformance tests keep importing it from `./thenables`, now the same frozen array object. Re-pin XT-contracts-13 to assert that identity instead of parsing a second list.

## Boundaries & Constraints

**Always:** One array object: `thenables.THENABLE_TYPES === contracts.THENABLE_TYPES`. XT-contracts-13 still asserts 26 entries, the same FQCNs in the same order (identity implies it), every AC thenable, frozen, and that async-surface's `thenableTypes(REPO)` returns the contracts module's own array. Update the header comments of `thenables.ts`, `plugin.ts` (where it describes the list) and the docs that name where the list lives (`docs/ops/lint.md`, `docs/ops/async-surface.md`). Remove the blocked-attempt note `bmad-build-auto-result-retro-10-one-thenable-list.md`.

**Never:** Change any `packages/contracts` file other than `tests/xaravel/seams.test.ts`; change `tools/async-surface/**`, `conformance/**` (except the one approved line below) or any other component; remove or weaken any assertion; edit the item's `action`, `owner` or `epic`. No new Test IDs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plugin list | import `THENABLE_TYPES` from `tools/lint-rules/thenables.ts` | `=== ` contracts' array, 26 frozen entries | — |
| async-surface from REPO | `thenableTypes(REPO)` | contracts' array (and so also the lint export) | — |
| async-surface fallback | temp root without `packages/contracts` | the lint export, i.e. contracts' array (XT-conformance async-surface test `toBe(THENABLE_TYPES)` unchanged) | — |
| Lint on a thenable | `async function f(): Promise<Builder>` fixtures | `xaravel/no-async-thenable-return` still reports | — |

</intent-contract>

## Code Map

- `tools/lint-rules/thenables.ts:1-12` header comment ("uses this list as its fixture list until `@xaravel/contracts/async`… supplies it") and `:49-77` the `THENABLE_TYPES` literal -- replace with `export { THENABLE_TYPES } from "../../packages/contracts/src/async/index";` and a one-line note. Nothing else in the file changes.
- `tools/lint-rules/plugin.ts:34` -- imports `THENABLE_TYPES` from `./thenables`; unchanged code, comment at `:1152` may name the source.
- `packages/contracts/src/async/index.ts` -- read-only: `export const THENABLE_TYPES = Object.freeze([...26])`, imports nothing, so it loads in oxlint's JS plugin host.
- `packages/contracts/tests/xaravel/seams.test.ts:121-126` `toolThenables()` (text parse, to delete), `:218-231` `toolThenableSource()` child script printing `{contracts, tool, length}`, `:233-261` XT-contracts-13 body and its title string (mentions "tools/lint-rules/thenables.ts's list" and "not the tool's").
- `tools/async-surface/async-surface.ts:584-601` -- read-only; fallback returns lint's `THENABLE_TYPES`, which becomes the same object.
- `conformance/tests/xaravel/async-surface.test.ts:16,22,133` and `lint-signatures.test.ts:19,140-147` -- read-only consumers; must pass unchanged.
- `conformance/tests/xaravel/async-surface.test.ts:162` (XT-conformance-134) -- the one approved change in `conformance/**` (`decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`, "Item 9's second stop"): `expect(repoList).not.toBe(THENABLE_TYPES)` becomes `expect(repoList).toBe(THENABLE_TYPES)`. Nothing else in the file changes, comments included.
- `docs/ops/lint.md:54`, `docs/ops/async-surface.md:42` -- where the list lives.

## Tasks & Acceptance

**Execution:**
- `tools/lint-rules/thenables.ts` -- drop the literal; re-export from contracts; update header -- removes the copy (S4).
- `packages/contracts/tests/xaravel/seams.test.ts` -- remove `toolThenables()`; in XT-contracts-13 assert `THENABLE_TYPES.length === 26`; child script prints `{ contracts: list === contracts.THENABLE_TYPES, lint: lint.THENABLE_TYPES === contracts.THENABLE_TYPES, length: list.length }`, expected `{"contracts":true,"lint":true,"length":26}`; title names the lint plugin's list as the contracts array -- stale test re-pinned to the one source.
- `docs/ops/lint.md`, `docs/ops/async-surface.md` -- say the list is `@xaravel/contracts/async`'s, re-exported by `tools/lint-rules/thenables.ts`.
- `conformance/tests/xaravel/async-surface.test.ts:162` -- `not.toBe(THENABLE_TYPES)` becomes `toBe(THENABLE_TYPES)`, the one line the Maintainer approved -- XT-conformance-134 pins the repository, contracts and lint lists as one array.
- `_bmad-output/implementation-artifacts/bmad-build-auto-result-retro-10-one-thenable-list.md` -- delete.

**Acceptance Criteria:**
- Given the change, when `grep -c '"Illuminate' tools/lint-rules/thenables.ts` runs, then it prints 0 (no copy).
- Given the repo, when XT-contracts-13 runs, then it passes and fails if `thenables.ts` exported any other array.
- Given the repo, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then all pass with no differences.

## Spec Change Log

- 2026-10-24, resumed after #395: `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`, "Item 9's second stop", approves one change in `conformance/**`: `conformance/tests/xaravel/async-surface.test.ts:162` becomes `expect(repoList).toBe(THENABLE_TYPES)`. Added it to Boundaries, the Code Map and Tasks; status back to `ready-for-dev`, baseline moved to `main` at e3a8265d3f417f01abede9e40e0b240a5be2321e. The earlier blocked run's result stays below for the record.

## Review Triage Log

## Verification

**Commands:**
- `bun test packages/contracts/tests/xaravel/seams.test.ts conformance/tests/xaravel/async-surface.test.ts conformance/tests/xaravel/lint-signatures.test.ts conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/lint.test.ts` -- expected: pass
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run harness` -- expected: SUMMARY with no differences

## Auto Run Result

Status: blocked
Blocking condition: XT-conformance-134 (`conformance/tests/xaravel/async-surface.test.ts:162`) asserts `expect(repoList).not.toBe(THENABLE_TYPES)`, where `THENABLE_TYPES` is the lint module's export. With one list that export is the contracts array, so the assertion cannot hold. The file is a Protected Path under `conformance/**`, outside `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md` (its `--stale-test` refuses it), and changing the assertion needs a Maintainer ruling. Recommended: re-pin line 162 to `expect(repoList).toBe(THENABLE_TYPES)`.

The implementation as specified was built and checked, then reverted (nothing merged): with it, XT-contracts-13 and the lint-signatures, lint-rules and lint tests passed, `bun run typecheck` and `bun run lint` exited 0, and only XT-conformance-134 failed. Redo it from this spec once the ruling lands.
