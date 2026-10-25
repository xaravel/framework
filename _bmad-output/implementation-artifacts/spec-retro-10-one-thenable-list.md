---
title: 'Epic 10 item 9: one thenable list, read by the lint plugin from @xaravel/contracts/async'
type: 'refactor'
created: '2026-10-24'
status: 'in-review'
baseline_revision: '6a3c33afe0aa905a35f699925801f78d1d44ac99'
review_loop_iteration: 1
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

- 2026-10-24, resumed after #395: `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`, "Item 9's second stop", approves one change in `conformance/**`: `conformance/tests/xaravel/async-surface.test.ts:162` becomes `expect(repoList).toBe(THENABLE_TYPES)`. Added it to Boundaries, the Code Map and Tasks; status back to `ready-for-dev`, baseline moved to this branch's resume commit 6a3c33afe0aa905a35f699925801f78d1d44ac99 (`main` at e3a8265d3f417f01abede9e40e0b240a5be2321e plus this spec edit). The earlier blocked run's result stays below for the record.

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 24 findings — high 0, medium 4, low 8, false 12, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) XT-contracts-13 no longer pins 16 of the 26 FQCNs by name or order; identity with itself proves nothing about content — confirmed: a wrong `Relations\HasMany` namespace passes every test; patched with an exact ordered 26-entry expected literal in XT-contracts-13.
  - `[low]` `[reject]` (blind) comments at `conformance/tests/xaravel/async-surface.test.ts:158,164` now read as two lists — real, but the intent's Never (and the Maintainer's exception, "nothing else in `conformance/tests/**`") excludes them; noted in the PR body for the Maintainer.
  - `[low]` `[reject]` (blind) `packages/contracts` src/README/docs name only async-surface as a reader — the intent's Never excludes every `packages/contracts` file but `seams.test.ts`.
  - `[low]` `[patch]` (blind) `docs/ops/async-surface.md:44` "the fallback list stops applying" implies a separate list — patched that sentence; the `tools/async-surface/**` comments half is excluded by the Never.
  - `[false]` `[reject]` (blind) the spec's Auto Run Result and Verification show no results yet — the review runs before Finalize writes them; not a defect of the change.
  - `[low]` `[reject]` (blind) no negative test that XT-contracts-13 fails on another array — `===` on a different object is false by definition; a stand-in module adds machinery for no new evidence.
  - `[false]` `[reject]` (blind) the relative re-export bypasses the `exports` map, and an import added to `src/async/index.ts` could break oxlint — either fails loudly: XT-conformance-133 runs oxlint end to end with the plugin, so a broken load fails the harness.
  - `[low]` `[patch]` (blind) XT-contracts-13's title lost "in its order" and the header comment no longer reads as a sentence — patched with the title and header rewrite below.
  - `[medium]` `[patch]` (intent) identity is proven at module import, not at the plugin as oxlint loads it — grouped with the Fidelity F-7 row; patched by narrowing the wording to what is tested; the plugin's load is covered by XT-conformance-133.
  - `[false]` `[reject]` (intent) the lint row has no run evidence — the five-file `bun test` (15 pass), `bun run lint` and the harness all ran in step 3.
  - `[false]` `[reject]` (intent) `thenableTypes(REPO)` vs the lint export only by transitivity — `===` is transitive; `list === contracts` and `lint === contracts` imply `list === lint`.
  - `[low]` `[reject]` (intent) the fallback tests can no longer tell the fallback branch from the contracts branch for REPO — real, but both return the same object, so no caller sees a difference; resolution itself stays pinned by the temp-root fixtures with their own lists (`async-surface.test.ts:146-155`); a direct check needs `tools/async-surface/**`, which the Never excludes.
  - `[false]` `[reject]` (intent) wording outside the edited files still describes two lists — duplicate of the blind comments row; same reason.
  - `[false]` `[reject]` (intent) XT-contracts-13 assertions were replaced — approved by the ruling's re-pin; the content check is restored by the patch above.
  - `[false]` `[reject]` (intent) a historical change-log entry was rewritten — the edited entry is this run's own, written before review.
  - `[medium]` `[patch]` (verification-gap) exact ordered FQCNs unpinned (HasMany demonstration) — same root cause as the first blind row; same patch.
  - `[false]` `[reject]` (verification-gap other) removing an assertion from XT-contracts-13 needs an approval — `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md`, "Epic 10 item 9", approves the re-pin; with the patch no content check is lost.
  - `[low]` `[reject]` (edge) `contractsAsyncPath(REPO)` regressing to null would go unseen — same as the intent fallback row.
  - `[false]` `[reject]` (edge) a missing contracts file crashes the plugin and async-surface — loud failure in a repo that always has the file; the fallback was for roots without the package, which still works (the static import resolves from the tool's own path).
  - `[false]` `[reject]` (edge) stale comment at `async-surface.test.ts:157-158` — duplicate of the blind comments row.
  - `[false]` `[reject]` (edge) exact 26 FQCNs no longer pinned — duplicate of the first blind row, patched there.
  - `[false]` `[reject]` (edge) spec claim "same FQCNs in the same order (identity implies it)" — duplicate of the first blind row; the patch makes the claim true.
  - `[low]` `[reject]` (edge) `contracts:true` holds on either path — same as the intent fallback row.
  - `[medium]` `[patch]` (fidelity F-7, reviewer 2) XT-contracts-13 calls the array "the lint plugin's list" but checks only `tools/lint-rules/thenables.ts` — patched: the title, header and helper JSDoc now say what is tested, that `tools/lint-rules/thenables.ts` re-exports the same array.

## Verification

**Commands:**
- `bun test packages/contracts/tests/xaravel/seams.test.ts conformance/tests/xaravel/async-surface.test.ts conformance/tests/xaravel/lint-signatures.test.ts conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/lint.test.ts` -- expected: pass
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run harness` -- expected: SUMMARY with no differences

## Auto Run Result

Status: blocked
Blocking condition: XT-conformance-134 (`conformance/tests/xaravel/async-surface.test.ts:162`) asserts `expect(repoList).not.toBe(THENABLE_TYPES)`, where `THENABLE_TYPES` is the lint module's export. With one list that export is the contracts array, so the assertion cannot hold. The file is a Protected Path under `conformance/**`, outside `decisions/MAINT-2026-10-24-stale-cross-scope-tests.md` (its `--stale-test` refuses it), and changing the assertion needs a Maintainer ruling. Recommended: re-pin line 162 to `expect(repoList).toBe(THENABLE_TYPES)`.

The implementation as specified was built and checked, then reverted (nothing merged): with it, XT-contracts-13 and the lint-signatures, lint-rules and lint tests passed, `bun run typecheck` and `bun run lint` exited 0, and only XT-conformance-134 failed. Redo it from this spec once the ruling lands.

## Fidelity Review

### Reviewer 1: pass at tree 56872e6824fe82a9da436adf76e72f0fc76f10c3

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6a3c33afe0aa905a35f699925801f78d1d44ac99`, on 2026-10-25T01:39:41.587Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed; the changed test is XT-contracts-13. |
| F-2: No expected value is weakened | pass | Compared the old and new assertions: exact length 26 remains, and shared-array identity replaces comparison against the removed duplicate list without loosening equality. |
| F-3: No assertion is removed without a DIV clause | pass | The stale test retains the count and list-equivalence checks through exact length and shared-array identity. No Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or Expectations adapted field is changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-contracts-13's consequence with its body and helpers: it checks shared array identity, freezing, count, AC membership, resolution, NotPromise compilation and PromiseLike scanning. AD-6.8 and AD-27.2 match those checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | The shown change updates the explicitly allowed stale test to check the single list; it adds no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework source file or @​asyncRoot tag is changed or retained in a touched source file. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"56872e6824fe82a9da436adf76e72f0fc76f10c3","base":"6a3c33afe0aa905a35f699925801f78d1d44ac99","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T01:39:41.587Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed; the changed test is XT-contracts-13.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the old and new assertions: exact length 26 remains, and shared-array identity replaces comparison against the removed duplicate list without loosening equality.","findings":[]},{"id":"F-3","result":"pass","note":"The stale test retains the count and list-equivalence checks through exact length and shared-array identity. No Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or Expectations adapted field is changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-contracts-13's consequence with its body and helpers: it checks shared array identity, freezing, count, AC membership, resolution, NotPromise compilation and PromiseLike scanning. AD-6.8 and AD-27.2 match those checks.","findings":[]},{"id":"F-8","result":"pass","note":"The shown change updates the explicitly allowed stale test to check the single list; it adds no implementation of another Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework source file or @asyncRoot tag is changed or retained in a touched source file.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 56872e6824fe82a9da436adf76e72f0fc76f10c3

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6a3c33afe0aa905a35f699925801f78d1d44ac99`, on 2026-10-25T01:39:41.587Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test. Only the Xaravel Test XT-contracts-13 changes. |
| F-2: No expected value is weakened | pass | I compared the old and new assertions in XT-contracts-13, the only test in the stale_tests file. Old: the parsed thenables.ts literal had length 26 and its JSON equalled THENABLE_TYPES, and the child bun printed {contracts:true, tool:false}. New: THENABLE_TYPES.length is 26, and lint.THENABLE_TYPES === contracts.THENABLE_TYPES (object identity), printed as {contracts:true, lint:true, length:26}. Identity implies equal content and order, so it is stricter than the old JSON comparison. The flip from tool:false to lint:true follows from the item's intent: the async-surface list was the contracts array before, and the lint list is now the same array. This is the single-source pointing that MAINT-2026-10-24 allows. No exact comparison becomes looser. |
| F-3: No assertion is removed without a DIV clause | pass | Each removed assertion has a counterpart: the 26-entry length check now runs on THENABLE_TYPES itself, the JSON order equality is replaced by the identity check run in the child bun, and the contracts:true check stays. Removing the toolThenables() text parser removes no check, because the identity check covers it. No assertion is dropped without a counterpart. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a) says no added line carries an adapted:DIV marker, and no Expectations adapted field changes. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned Oracle fixture, base or changed, whose output is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | I compared XT-contracts-13's new consequence string with its body. The body checks: the list is frozen, has 26 entries and holds every AC name; the subpath resolves to src/async/index.ts; thenableTypes(REPO) returns the contracts array; lint/thenables.ts THENABLE_TYPES is the same array object; NotPromise compiles and rejects an async callback; and the PromiseLike scanner gives the expected results on its fixtures and on packages/*/src. The cited AD-27.2 (the async thenable list contract) and AD-6.8 (NotPromise sync callbacks) match what the test verifies. However, the string now calls the array 'the lint plugin's list', and the body only checks that tools/lint-rules/thenables.ts exports that array. It never checks that the lint plugin uses that export, so the body checks less than the string claims. |
| F-8: No stub, fake or partial implementation of another Component | pass | The only shown change is to a test file in the declared stale_tests path. It adds no stub, fake, hard-coded return or partial implementation of any Component's behaviour. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (d) and (g): the change touches no packages/*/src file and adds no @​asyncRoot tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13's consequence says the contracts array is 'the lint plugin's list', but the test only checks 'lint.THENABLE_TYPES === contracts.THENABLE_TYPES' for tools/lint-rules/thenables.ts. Nothing checks that the plugin (tools/lint-rules/plugin.ts) reads its list from that module rather than keeping its own copy. Either add a check, for example in the child bun, that the list the plugin uses is the same array, or narrow the consequence wording to what is tested: that tools/lint-rules/thenables.ts re-exports the array.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"56872e6824fe82a9da436adf76e72f0fc76f10c3","base":"6a3c33afe0aa905a35f699925801f78d1d44ac99","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T01:39:41.587Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test. Only the Xaravel Test XT-contracts-13 changes.","findings":[]},{"id":"F-2","result":"pass","note":"I compared the old and new assertions in XT-contracts-13, the only test in the stale_tests file. Old: the parsed thenables.ts literal had length 26 and its JSON equalled THENABLE_TYPES, and the child bun printed {contracts:true, tool:false}. New: THENABLE_TYPES.length is 26, and lint.THENABLE_TYPES === contracts.THENABLE_TYPES (object identity), printed as {contracts:true, lint:true, length:26}. Identity implies equal content and order, so it is stricter than the old JSON comparison. The flip from tool:false to lint:true follows from the item's intent: the async-surface list was the contracts array before, and the lint list is now the same array. This is the single-source pointing that MAINT-2026-10-24 allows. No exact comparison becomes looser.","findings":[]},{"id":"F-3","result":"pass","note":"Each removed assertion has a counterpart: the 26-entry length check now runs on THENABLE_TYPES itself, the JSON order equality is replaced by the identity check run in the child bun, and the contracts:true check stays. Removing the toolThenables() text parser removes no check, because the identity check covers it. No assertion is dropped without a counterpart.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a) says no added line carries an adapted:DIV marker, and no Expectations adapted field changes.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned Oracle fixture, base or changed, whose output is an error.","findings":[]},{"id":"F-7","result":"fail","note":"I compared XT-contracts-13's new consequence string with its body. The body checks: the list is frozen, has 26 entries and holds every AC name; the subpath resolves to src/async/index.ts; thenableTypes(REPO) returns the contracts array; lint/thenables.ts THENABLE_TYPES is the same array object; NotPromise compiles and rejects an async callback; and the PromiseLike scanner gives the expected results on its fixtures and on packages/*/src. The cited AD-27.2 (the async thenable list contract) and AD-6.8 (NotPromise sync callbacks) match what the test verifies. However, the string now calls the array 'the lint plugin's list', and the body only checks that tools/lint-rules/thenables.ts exports that array. It never checks that the lint plugin uses that export, so the body checks less than the string claims.","findings":[{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13's consequence says the contracts array is 'the lint plugin's list', but the test only checks `lint.THENABLE_TYPES === contracts.THENABLE_TYPES` for tools/lint-rules/thenables.ts. Nothing checks that the plugin (tools/lint-rules/plugin.ts) reads its list from that module rather than keeping its own copy. Either add a check, for example in the child bun, that the list the plugin uses is the same array, or narrow the consequence wording to what is tested: that tools/lint-rules/thenables.ts re-exports the array.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"The only shown change is to a test file in the declared stale_tests path. It adds no stub, fake, hard-coded return or partial implementation of any Component's behaviour.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (d) and (g): the change touches no packages/*/src file and adds no @asyncRoot tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```
