---
title: 'Macroable moves to its AD-3 Upstream file path (epic-11-retro-item-8-macroable-ad3-path)'
type: 'refactor'
created: '2026-10-25'
status: 'done'
baseline_revision: 'b02b935266084c42a7c9dbae3778d96d27f19a7e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/decisions/MAINT-2026-10-24-epic-11-items.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-retro-2026-10-24.md'
warnings: []
deferred:
  - summary: >-
      ARCHITECTURE-SPINE.md AD-3 still reads src/<Upstream sub-path>/<Class>.ts without the item 6 clarification.
    evidence: |-
      The ruling lives only in decisions/MAINT-2026-10-24-epic-11-items.md item 6; the spine is a Protected Path outside this item's scope. Epic 12 authors read the spine first.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md:607
    severity: low
  - summary: >-
      Item 5's planning note names the trait's old path.
    evidence: |-
      bmad-build-auto-result-retro-11-builtin-names.md:10 says its work is all in packages/macroable/src/Support/Traits/Macroable.ts; it is item 5's record, not this item's.
    location: >-
      _bmad-output/implementation-artifacts/bmad-build-auto-result-retro-11-builtin-names.md:10
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 11.1 put the trait at `packages/macroable/src/Support/Traits/Macroable.ts`, its PHP namespace path (retro finding L4). The Maintainer ruled (`decisions/MAINT-2026-10-24-epic-11-items.md`, item 6) that AD-3's `src/<Upstream sub-path>/` is the Upstream file path under the Component's folder: Upstream `src/Illuminate/Macroable/Traits/Macroable.php` becomes `packages/macroable/src/Traits/Macroable.ts`.

**Approach:** `git mv` the file to `src/Traits/Macroable.ts` and point the barrel at it. Everything else (the FQCN `Illuminate\Support\Traits\Macroable`, `registerClass`, exports, behaviour) stays as it is.

## Boundaries & Constraints

**Always:** Edit only `packages/macroable/**` and this item's records under `_bmad-output/implementation-artifacts/`. Keep the file's contents byte-for-byte, so the move is a pure rename in git. Keep the package's public entry (`@xaravel/macroable`, `exports["."]`) and every export name unchanged. Leave no file under `src/Support/`.

**Never:** Change behaviour, the registered FQCN, a test, or an assertion. Never edit `conformance/**` (Story 11.1's Escalations name the old path as history), `tools/**`, `PORTING.md`, another package, earlier specs' verdict records, or the item's `action`/`owner`/`epic`. Never add a re-export shim at the old path.

</intent-contract>

## Code Map

- `packages/macroable/src/Support/Traits/Macroable.ts` -- the trait; imports only `@xaravel/runtime` and `@xaravel/runtime/scope` (no relative imports), so the move needs no edit inside it. Ends with `registerClass('Illuminate\\Support\\Traits\\Macroable', Macroable)` (AD-10), which stays.
- `packages/macroable/src/index.ts:1` -- the only importer: `export { Macroable } from "./Support/Traits/Macroable";`.
- `packages/macroable/tests/**` -- both test files import `@xaravel/macroable`, never the file path; XT-macroable-3 reads only `docs/macroable.md` and `README.md`. No change.
- `packages/macroable/docs/macroable.md`, `README.md` -- name the FQCN, not the file path. No change.
- `packages/macroable/tsconfig.json` -- includes `src/**/*.ts`, so the new folder is covered. No change.
- Read-only: `tools/api-surface`, `tools/registration` scan `src/**` by content, not by path; `conformance/tests/xaravel/api-surface.test.ts:79` is a fixture of its own.

## Tasks & Acceptance

**Execution:**
- `packages/macroable/src/Support/Traits/Macroable.ts` -- `git mv` to `packages/macroable/src/Traits/Macroable.ts`, removing the empty `src/Support/` -- AD-3 as ruled in item 6.
- `packages/macroable/src/index.ts` -- import from `./Traits/Macroable` -- the barrel follows.

**Acceptance Criteria:**
- Given the change, when `git diff --stat -M` is read against the baseline, then it shows the trait as a 100% rename and a one-line barrel change, and nothing else under `packages/`.
- Given the moved file, when `bun run harness` runs in full, then it reports no difference from the Expectations File (Story 11.1's 16 Test IDs still pass).
- Given the moved file, when `bun test packages/macroable` runs, then XT-macroable-1..3 pass unchanged.
- Given the moved file, when `bun run typecheck`, `bun run lint`, `bun run api-surface:gate macroable` and `bun run registration:check` run, then each succeeds as it does on the baseline.
- Given the tree, when `packages/macroable/src` is listed, then it holds only `index.ts` and `Traits/Macroable.ts`.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 11 findings — high 0, medium 0, low 3, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) Verification's `git diff --stat -M HEAD` lists the spec too and shows nothing after commit — the fix is to edit this build's spec; the reviewed diff against `baseline_revision` (`/tmp` diff, `-- packages`) shows exactly the rename at 100% and the barrel line.
  - `[false]` `[reject]` (blind) Stale `.cache/tsc/macroable/src/Support/` output left by `tsc -b` — `.cache` is git-ignored build output; `@xaravel/macroable` resolves through `src/index.ts`, whose emitted `.d.ts` now points at `./Traits/Macroable`, so nothing reads the stale files; typecheck exits 0.
  - `[false]` `[reject]` (blind) No AC greps for the old path outside history — the fix is a spec edit; the grep was run in planning and verification: no code, doc or test under `packages/`, `tools/` or `conformance/tests/` names the port's old path.
  - `[false]` `[reject]` (blind) The spec does not say whether the item's sprint-status entry moves — the fix is a spec edit; the orchestrator sets the item `done` with SPS after merge preparation (iteration step D).
  - `[low]` `[defer]` (blind) `ARCHITECTURE-SPINE.md:607` still reads `src/<Upstream sub-path>/<Class>.ts` without the item 6 clarification — pre-existing, and the spine is a Protected Path outside the intent's scope (`packages/macroable` only); `packages/conditionable` is still only Story 1.x's scaffold (`src/index.ts`), so the ordering holds.
  - `[false]` `[reject]` (blind) `conformance/tests/xaravel/api-surface.test.ts:79` keys a non-existent Upstream path — it is a self-contained in-memory fixture for the api-surface tool, not a statement about Upstream; no consumer reads it as a path, and it is Protected and outside the intent.
  - `[false]` `[reject]` (blind) Frontmatter `context` omits the spine and Story 11.1's spec — the fix is a spec edit; the implementer needed neither (the move is byte-identical).
  - `[low]` `[reject]` (verification-gap, other) `decisions/ESC-11.1-5.md:17` and `decisions/ESC-11.1-6.md:14` name the old path in the present tense — the intent keeps the change within `packages/macroable` and its own records; decision records are history, and the path in them is findable through `git log --follow`.
  - `[low]` `[defer]` (intent-alignment) `bmad-build-auto-result-retro-11-builtin-names.md:10` (item 5's planning note) names the old path — item 5's own record, outside this item's records; item 5's build re-plans from the tree.
  - `[false]` `[reject]` (intent-alignment) No automated check pins the AD-3 file path — the intent asks for the move with no behaviour change, not a new grader; the move is verified by the reviewed diff and the directory listing (`src/index.ts`, `src/Traits/Macroable.ts`).
  - `[false]` `[reject]` (intent-alignment) The Fidelity Review gate was outstanding at audit time — it has since run: reviewer 1 and 2 `pass` at tree `5b3646e613d689a96154fbb30a70c95aca644120`.

## Verification

**Commands:**
- `bun run typecheck` -- expected: exit 0
- `bun run lint` -- expected: exit 0
- `bun test packages/macroable` -- expected: all pass
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run api-surface:gate macroable` and `bun run registration:check` -- expected: exit 0, as on the baseline
- `git diff --stat -M HEAD` -- expected: rename at 100% plus `src/index.ts`

## Fidelity Review

### Reviewer 1: pass at tree 5b3646e613d689a96154fbb30a70c95aca644120

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `b02b935266084c42a7c9dbae3778d96d27f19a7e`, on 2026-10-25T07:23:58.395Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The diff adds or changes no Ported Test, so no Upstream assertions require comparison. |
| F-2: No expected value is weakened | n/a | The relocation and barrel update change no tests, expected values or exception expectations. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or assertion is removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change contains no Expectations lines or new skip reasons. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied on by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | n/a | The evidence states that no Xaravel Test, helper, fixture or test setup is touched. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the diff with the macroable component scope: the implementation moves unchanged within that component and its barrel follows. No other component behaviour is implemented or faked. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the complete relocated source and declaration inventory with AD-6 and DIV-1: no asyncRoot tags are retained or added, and the synchronous macro registration and dispatch methods introduce no IO root or callback API requiring async derivation. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"5b3646e613d689a96154fbb30a70c95aca644120","base":"b02b935266084c42a7c9dbae3778d96d27f19a7e","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-25T07:23:58.395Z","items":[{"id":"F-1","result":"n/a","note":"The diff adds or changes no Ported Test, so no Upstream assertions require comparison.","findings":[]},{"id":"F-2","result":"n/a","note":"The relocation and barrel update change no tests, expected values or exception expectations.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or assertion is removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change contains no Expectations lines or new skip reasons.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied on by this action item.","findings":[]},{"id":"F-7","result":"n/a","note":"The evidence states that no Xaravel Test, helper, fixture or test setup is touched.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the diff with the macroable component scope: the implementation moves unchanged within that component and its barrel follows. No other component behaviour is implemented or faked.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the complete relocated source and declaration inventory with AD-6 and DIV-1: no asyncRoot tags are retained or added, and the synchronous macro registration and dispatch methods introduce no IO root or callback API requiring async derivation.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 5b3646e613d689a96154fbb30a70c95aca644120

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `b02b935266084c42a7c9dbae3778d96d27f19a7e`, on 2026-10-25T07:23:58.395Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; it only moves packages/macroable/src/Support/Traits/Macroable.ts to src/Traits/Macroable.ts and updates the barrel. |
| F-2: No expected value is weakened | n/a | No Ported Test, Xaravel Test or stale_tests file is touched (evidence (e) says none), so no expected value exists to compare against Upstream. |
| F-3: No assertion is removed without a DIV clause | n/a | No test file is changed, so no assertion is removed; the change is a byte-identical file move plus an index.ts import path update. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field. The DIV-11.2 and DIV-12.10 citations in the moved file's header are unchanged prose, not adapted markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and the item relies on none. |
| F-7: Every Xaravel Test verifies the consequence it declares | n/a | Evidence (e): no Xaravel Test is touched, so there is no xaravelTest consequence to verify. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/macroable files change: the trait file moves to its Upstream path under the Component (AD-3) with identical content, and index.ts re-exports from the new path. Nothing is added to another Component, and there is no stub, fake or hard-coded return. This matches the action's 'no behaviour change'. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in either changed file. Every declaration (macro, mixin, hasMacro, flushMacros, __callStatic, __call and the helpers) is sync, does no IO behind an async-root contract and has no Promise return type, so no tag is missing and none is false. Compared against AD-6.2 and AD-6.13, DIV-1 and ESC-6.4-1. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"5b3646e613d689a96154fbb30a70c95aca644120","base":"b02b935266084c42a7c9dbae3778d96d27f19a7e","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-25T07:23:58.395Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; it only moves packages/macroable/src/Support/Traits/Macroable.ts to src/Traits/Macroable.ts and updates the barrel.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test, Xaravel Test or stale_tests file is touched (evidence (e) says none), so no expected value exists to compare against Upstream.","findings":[]},{"id":"F-3","result":"n/a","note":"No test file is changed, so no assertion is removed; the change is a byte-identical file move plus an index.ts import path update.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field. The DIV-11.2 and DIV-12.10 citations in the moved file's header are unchanged prose, not adapted markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and the item relies on none.","findings":[]},{"id":"F-7","result":"n/a","note":"Evidence (e): no Xaravel Test is touched, so there is no xaravelTest consequence to verify.","findings":[]},{"id":"F-8","result":"pass","note":"Only packages/macroable files change: the trait file moves to its Upstream path under the Component (AD-3) with identical content, and index.ts re-exports from the new path. Nothing is added to another Component, and there is no stub, fake or hard-coded return. This matches the action's 'no behaviour change'.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in either changed file. Every declaration (macro, mixin, hasMacro, flushMacros, __callStatic, __call and the helpers) is sync, does no IO behind an async-root contract and has no Promise return type, so no tag is missing and none is false. Compared against AD-6.2 and AD-6.13, DIV-1 and ESC-6.4-1.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

- **Summary:** Macroable moves from `packages/macroable/src/Support/Traits/Macroable.ts` to `packages/macroable/src/Traits/Macroable.ts`, the Upstream file path under the Component (AD-3, MAINT-2026-10-24 item 6). The FQCN, exports and behaviour are unchanged.
- **Files changed:**
  - `packages/macroable/src/Traits/Macroable.ts` -- the trait, a 100% rename (`git mv`).
  - `packages/macroable/src/index.ts` -- the barrel imports `./Traits/Macroable`.
- **Review findings:** 11 findings; 0 patched; 2 deferred (spine AD-3 wording, item 5's planning note, both low); 9 rejected, each with its reason in the Review Triage Log (four asked for spec edits, three were history or fixtures outside the intent's scope, two were already settled).
- **Fidelity Review:** reviewer 1 (codex) and reviewer 2 (claude) `pass` at tree `5b3646e613d689a96154fbb30a70c95aca644120`; `status --item` prints `current`.
- **Follow-up review recommendation:** false (no patches: high 0, medium 0, low 0).
- **Verification:** `bun run typecheck` exit 0; `bun run lint` exit 0; `bun test packages/macroable` 19 pass; `bun run api-surface:gate macroable` 0 unexplained; `bun run registration:check` ok (631 files, 40 registrations); `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0` (database, queue and redis Variants NOT-RUN, no local backend).
- **Residual risks:** none in code. Decision and Escalation records from Story 11.1 still name the old path as history.
