---
title: 'Story 10.6: Contracts complete and Protected'
type: 'feature'
created: '2026-10-24'
status: 'in-review'
baseline_revision: '79600b6b0dcda998ca162804f46111cb4e173029'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/AGENTS.md'
warnings:
  - oversized
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 10 closes with this Story. `@xaravel/contracts` must pass its API-surface gate as a finished Component, document every contract with its Upstream FQCN in the package's `docs/` (which holds only `.gitkeep`), and keep its `async-surface.json` committed and current. It is the first Component gate on real code, so the gate's mappings, proven so far only on fixtures (Epic 6 retro V1), must be re-checked on real contracts. Once the Maintainer signs `decisions/PHASE-1-EXIT.md`, `packages/contracts/**` must be Protected.

**Approach:** Write `packages/contracts/docs/contracts.md`, the package's mirror of Laravel's Contracts page: what a contract is in Xaravel, how to type and inject one, a reference table of every contract, the Xaravel-only seams, and a Divergences section. Add two Xaravel Tests in `packages/contracts/tests/xaravel/complete.test.ts`. XT-contracts-16 runs the gate, re-checks each mapping by mutating a temporary copy of real contract files and asserting the gate's exact finding, checks the docs table against the Upstream rows and the package's real exports, and checks `async-surface.json`. XT-contracts-17 runs the committed protected-paths CLI against a fake GitHub API: a signed `PHASE-1-EXIT.md` makes a Story PR that touches contracts fail, and no exit file, or an unsigned one, leaves contracts unprotected. The `/packages/contracts/ after-phase:1` marker and the tool already exist, so no tool or list changes.

## Boundaries & Constraints

**Always:**
- **XT-contracts-16** (AC 1 and the re-check):
  - `bun run api-surface:gate contracts` exits 0 and prints `api-surface:gate contracts: 0 unexplained (AD-15)`.
  - **Mapping re-check.** A temp root (`mkdtemp`, outside the repo) holds copies of `conformance/api-surface/`, `conformance/scans/div12-pairs.jsonl`, `tsconfig.base.json` and `packages/{contracts,runtime,assert,mockery}`, with symlinks copied as symlinks, plus a symlink to the repo's `node_modules`. The unmutated copy passes the gate. Then each mutation below is applied to the copy alone, the gate runs with `--root`, and the test asserts it exits 1 with the named finding. The copy is restored before the next mutation. Each mutation first asserts that its search text occurs exactly once.
    - AD-26 options form: drop `ResponseFactory.json`'s options overload → a `mismatch` on `Illuminate\Contracts\Routing\ResponseFactory::json` naming the options overload.
    - Nullability: `ModelIdentifier.useCollectionClass(collectionClass: string | null)` loses `| null` → a `mismatch` for `::useCollectionClass` with `is not nullable`.
    - Defaults: `static useMorphMap(useMorphMap = true)` becomes `= false` → a `mismatch` for `::useMorphMap` with `default false, Upstream true`.
    - Names: `Store.forget` becomes `Forget` → `renamed` `Illuminate\Contracts\Cache\Store::forget -> Forget`. `constructor` maps to `__construct`: an extra required parameter on `ModelIdentifier`'s constructor gives a `mismatch` for `::__construct`.
    - DIV-12: the rows are checked as data. No contracts row is a DIV-12 rename source (`fillable`, `touches`), every `div12-pairs.jsonl` pair on a contracts class names a member the rows do not list, and the real summary reports `0 div12`.
  - **Docs.** For each `kind` `interface` or `class` row in `contracts.jsonl` (the PSR rows included), the reference table has exactly one row with that FQCN in backticks, an import subpath listed in `package.json` `exports`, and an export name that the subpath's module really exports at runtime (dynamic import). The table has no other rows. The page has a `## Divergences` section that cites DIV IDs which exist in `decisions/`.
  - **`async-surface.json`.** `git ls-files --error-unmatch packages/contracts/async-surface.json` succeeds, and `bun run async-surface --check contracts` exits 0.
- **XT-contracts-17** (AC 2). Hermetic roots in temp dirs hold the real committed `conformance/protected-paths`, and `.github/CODEOWNERS` rendered by the CLI's own `codeowners --root`. The test drives `bun tools/protected-paths/protected-paths.ts pr` against a `Bun.serve` fake GitHub API on port 0, in the shape of XT-conformance-19:
  - With a Maintainer-signed `decisions/PHASE-1-EXIT.md` in the base and the head, a `story/10.7` PR touching `packages/contracts/src/cache/Store.ts` with no review exits 1 with `protected path: packages/contracts/src/cache/Store.ts needs @edanisko's approving review on the head commit`.
  - The same PR with the Maintainer's `APPROVED` review on the head commit exits 0.
  - With no exit file, or an unsigned one, the PR exits 0, so contracts stays editable during Phase 1.
  - The committed list has the line `/packages/contracts/ after-phase:1`, which is read from the file.
- Tests use `xaravelTest` and `Assert` and spawn tools as child processes, never importing `tools/**`. Consequence strings cite AD-15, AD-16, AD-26, DIV-12, FR-112 and FR-114.
- The docs page is written in Xaravel's own words, so no `laravel/docs` notice is needed. The Divergences section cites DIV-1, DIV-3, DIV-9 and DIV-12, where each shapes contracts.

**Never:**
- Edit outside `packages/contracts/**`, this spec, `stories/10.6.md`'s `status:` line and sprint status.
- Add any `exceptions.jsonl` or `additions.jsonl` line. A mapping that misreads real code raises an Escalation (`conformance/escalations/ESC-10.6-<n>.md`).
- Write `decisions/PHASE-1-EXIT.md`. Only the Maintainer signs it.
- Mutate a tracked file, even temporarily. Mutations touch only the temp copy.
- Change a contract's source or its runtime exports.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| gate | the repo | exit 0, `0 unexplained` | output in the failure message |
| baseline copy | the unmutated temp root | gate exit 0 | proves the recipe before mutating |
| mutation | each one in Always | gate exit 1 and the named finding line | a search text that does not occur exactly once fails the test |
| docs | `contracts.md` table vs the rows | one row per declaration, no extras, real export | lists missing, extra and unresolved rows |
| protected after exit | signed exit file, contracts file, no review | exit 1, `protected path: …` | none |
| approved | signed exit file plus a Maintainer approval on the head commit | exit 0 | none |
| Phase 1 open | no exit file, or an unsigned one | exit 0 | none |

</intent-contract>

## Code Map

- `tools/api-surface/api-surface.ts`: the gate. `--root <dir>` reads `packages/<c>`, `conformance/api-surface/`, `conformance/scans/div12-pairs.jsonl` and `tsconfig.base.json` under the root, and uses the repo's own tsc. Read-only.
- `docs/ops/api-surface.md`: the mapping rules and the finding text formats. Read-only.
- `packages/contracts/tests/xaravel/api-surface.test.ts:26`: the spawn form for `bun run api-surface` (`REPO`, `NO_COLOR`).
- `packages/contracts/src/routing/ResponseFactory.ts:39-40`: `json` with its positional and options overloads.
- `packages/contracts/src/database/ModelIdentifier.ts:52,68`: `useCollectionClass(collectionClass: string | null)` and `static useMorphMap(useMorphMap = true)`, the only real class, and the only default the tool compares in contracts. Its constructor sits above line 45.
- `packages/contracts/src/cache/Store.ts:63`: `forget(key: string)`.
- `conformance/api-surface/contracts.jsonl`: 765 rows: 153 interfaces, 11 classes, 589 methods, 7 constants and 5 properties. Read-only.
- `conformance/scans/div12-pairs.jsonl:128`: `ModelIdentifier::useMorphMap` `method-plus-state`, the only pair on a contracts class.
- `packages/contracts/tests/xaravel/support/contract-namespaces.ts`: `REPO`, `allRows()`.
- `packages/contracts/package.json` `exports`: the subpaths that the docs table's imports must use.
- `tools/protected-paths/protected-paths.ts:3-14,508`: the CLI's `codeowners [--root]` and `pr --repo --pr [--root]` (`GITHUB_API_URL`, `GH_TOKEN`). Read-only.
- `conformance/tests/xaravel/protected-paths.test.ts:95-180,383-405`: the fake API (`runPr`), the `SIGNED_EXIT` shape and the contracts case to mirror. Read-only. Its fixtures are copied in shape, not imported (graph rule, `tools/graph/graph.ts:295`).
- `conformance/protected-paths:36`: `/packages/contracts/ after-phase:1`.
- `packages/runtime/docs/*.md`: the docs style to follow.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/docs/contracts.md`: the Contracts page, with the reference table generated once from `contracts.jsonl` and `package.json` exports and checked by hand, the Xaravel-only seams, and Divergences. Remove `docs/.gitkeep`.
- `packages/contracts/README.md`: link to the docs page.
- `packages/contracts/tests/xaravel/complete.test.ts`: XT-contracts-16 and XT-contracts-17, covering every matrix row.
- `stories/10.6.md`: only `status:` changes, set to `done` at the end.

**Acceptance Criteria:**
- Given the package, when `bun run harness --xaravel --id 'XT-contracts-*'` runs, then XT-contracts-1..18 pass.
- Given the change, when `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run escalations:check` and `bun run async-surface --all --check` run, then each exits 0. When the full `bun run harness` runs, it reports no differences, and `bun run story:check 10.6` passes, including its `api-surface` clause.

## Spec Change Log

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 20 findings — high 0, medium 3, low 7, false 9, maybe-false 0 (one finding, the docs export identity, was reported by two layers and is logged under each)
- findings:
  - `[low]` `reject` Edge: `protectedRoot` leaks its temp dir when the `codeowners` render fails before the caller records the root. — It happens only on a failing run, and the fix adds a try/catch guard; a stray `tmpdir` entry on a red test is negligible.
  - `[low]` `reject` Edge: `gateRoot` leaks a partly copied temp root when `cpSync` or `symlinkSync` throws. — Same reasoning: only on a broken checkout, and the fix adds a guard.
  - `[medium]` `patch` VG: the docs table check accepts a row whose export exists but is another contract (`Store` → `Repository`). — Patched: each resolved export must have `fqcn()` equal to the row's FQCN, and Kind must equal the row's kind.
  - `[low]` `patch` Blind: nothing asserts that `additions.jsonl` and `exceptions.jsonl` hold no contracts line, which the AC's "Escalation instead of a citation" rule implies. — Patched: XT-contracts-16 asserts zero `component: contracts` lines in both files.
  - `[medium]` `patch` Blind: no mutation adds or removes a whole member, though the AC names the gate's "extra members"; camelCase is exercised only as a case change. — Patched: an added method (`extra`) and a deleted method (`missing`) on `Store`. Real contracts have no snake_case or `__toString` member to mutate (Design Notes), so camelCase stays a case-sensitivity probe.
  - `[false]` `reject` Blind: the DIV-12 data check hardcodes `fillable`/`touches`, so a `model-config` pair on a contracts class would be missed. — The loop over every `div12-pairs.jsonl` pair on a contracts class asserts its classification is `method-plus-state`, so a `model-config` or `option-pair` pair there fails. `fillable`/`touches` is exactly the tool's `DIV12_RENAMES`.
  - `[medium]` `patch` Blind: the docs table never checks which export a row names, or its Kind. — Same root cause as the VG finding; patched with it.
  - `[low]` `patch` Blind: the seams section is untested and omits `RenderLoop`. — Patched: `RenderLoop` added. The seam names are types with no runtime value, so a runtime check cannot cover them; XT-contracts-14 already pins those types.
  - `[low]` `patch` Blind: the docs leave out the root exports (`contract`, the symbol constants, `ContractToken`) and the aliases helpers, and do not say where `hasBrand` and `Ref` come from. — Patched: a short paragraph names them with their import paths.
  - `[low]` `patch` Blind: inaccurate docs wording: "every name is an interface and a token" (wrong for the 11 classes), `app(Cache\Factory)` in PHP notation, and seams "with no Upstream interface" on `view`. — Patched the wording.
  - `[low]` `patch` Blind: XT-contracts-17 never shows that the block is specific to contracts once Phase 1 exits. — Patched: a signed-root PR touching only `packages/support/src/Str.ts` exits 0. The other negative cases (another user's approval, `CHANGES_REQUESTED`) are the tool's own behaviour, covered by XT-conformance-19/-20, so they are rejected here as low. The hard-coded Maintainer login equals the tool's `MAINTAINER`, and a change there fails loudly.
  - `[false]` `reject` Blind: the manifest, spec and sprint status disagree, and the manifest is `done` before review. — Finalize sets the spec to `done`, and the orchestrator sets sprint status in the same PR. The PR merges only after review, so no merged state disagrees.
  - `[false]` `reject` Blind: nine sequential child runs risk the 600 s budget. — Each gate run takes about 0.1–0.3 s (tsc 7 is native, and builds are incremental); the whole test ran in seconds. The leak half is the Edge rows above.
  - `[false]` `reject` Intent: the mapping re-check tests detection only and never audits today's matched verdicts (R2a). — The audit ran at planning over all 765 rows, and the spec's Design Notes record it per mapping with counts. The test then locks in detection (R2c). No misread was found, so no Escalation.
  - `[false]` `reject` Intent: XT-contracts-17 lets a Maintainer-approved PR pass, though the AC says such a PR "fails". — AD-16: a Protected Path changes only with Maintainer Code Owner approval, which is the Escalation route the Story's "so that" names. Failing approved PRs would make contracts unchangeable.
  - `[false]` `reject` Intent: "every contract" may include the Xaravel-only seams (R1b). — The seams have no Upstream FQCN, so a list "with its Upstream FQCN" cannot hold them. The page documents them in their own section.
  - `[false]` `reject` Intent: AC 2 is exercised on a simulated root, not live CI. — Only the Maintainer may write `PHASE-1-EXIT.md`. The test runs the committed CLI over the committed list, which is the live check's code path.
  - `[false]` `reject` Fidelity R1 F-7 `docs/contracts.md`: the diff and the whole file give different reference tables (missing-evidence). — The finding text is garbled (it names the same identifier as its own "counterpart"), and the table is one file at one tree. Recorded as an evidence gap (MAINT-2026-10-24); the re-review runs on the patched tree.
  - `[false]` `reject` Fidelity R1 F-7 `complete.test.ts`: the inputs the test reads are absent from the prompt (missing-evidence). — The test is correct as written. This is an evidence gap noted under MAINT-2026-10-24, not a defect.
  - `[medium]` `patch` Fidelity R2 F-7 `complete.test.ts`: both consequence strings cite FR-114, which neither test checks (defect). — Patched: FR-114 dropped. XT-contracts-16 cites AD-6 (Enforcement) for `async-surface.json`.

## Design Notes

**Mapping re-check, run at planning time on real code** (a temp-root probe, no tracked file changed):
- camelCase: no contracts member or parameter name changes under `camel()`. The 7 constants keep their names through the statics record. There are 21 reserved-word parameters (`arguments`, `class`, `default`), which take any name by the documented rule. The magic members are `__construct` ×2 and `__invoke` ×1.
- AD-26: 54 methods need both forms, and all have both. Removing an overload, making a key or the options parameter required, or adding a key each fails the gate. The check reads key names and `?` only, not key types, and it accepts a union member. Both are documented behaviour (`docs/ops/api-surface.md`, Options form), not misreads.
- DIV-12: no rename source. One `method-plus-state` pair whose property is protected and not exported, so it has no effect.
- Defaults: of 274 Upstream literal defaults, the tool can compare only `ModelIdentifier::useMorphMap`, because interfaces have no initializers. That one is read correctly.
- Nullability: 26 typed-nullable params and 2 nullable returns are checked. 12 pass through `unknown` for PHP `mixed`, which is the correct mapping. `Promise<…>` unwrapping works on real async returns.
- Not a mapping: dropping `extends` from an interface is invisible, because inherited members are not walked (a documented Limit).

No mapping misreads real code, so no Escalation is raised. The limits above are reported in the Auto Run Result for the Epic 10 retrospective.

## Verification

**Commands:**
- `XARAVEL_UPSTREAM=require bun run harness --xaravel --id 'XT-contracts-*'` -- expected: 18 of 18 pass.
- `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check`, `bun run api-surface:gate contracts` -- expected: each exits 0.
- `bun run harness` -- expected: no differences.
- `bun run fidelity:review review --story 10.6` -- expected: two `pass` verdicts.
- `bun run story:check 10.6` -- expected: pass.

## Fidelity Review

### Reviewer 1: reject at tree 41d3c782647d52a97a9dde882d9a54754df50e55

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `79600b6b0dcda998ca162804f46111cb4e173029`, on 2026-10-24T19:29:15.146Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds none; no Upstream assertion sequence applies. |
| F-2: No expected value is weakened | pass | The change adds Xaravel Tests without replacing existing expected values or weakening any Ported Test comparison. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff changes no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no assertion adaptation marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Both test bodies broadly exercise their declared gate and protection behavior, but omitted inputs and conflicting documentation prevent confirming XT-contracts-16's complete-reference claim. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation changes are confined to contracts documentation and tests. The fake GitHub API supplies test inputs to the real CLI; it does not implement another framework Component. |
| F-9: Every `@asyncRoot` tag is true | n/a | No framework src file is touched; the added async functions are private test helpers, outside the public source declarations covered by this check. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

- **F-7** `packages/contracts/docs/contracts.md`: The diff and whole-file evidence give different reference tables. For example, the diff lists ShouldBroadcastNow and ShouldRescue, whereas the whole file lists ShouldBroadcastNow and ShouldRescue nowhere and instead includes ShouldBroadcastNow's apparent counterpart ShouldBroadcastNow only as ShouldBroadcastNow is absent; supply one authoritative tree-bound version and reconcile all differing names, including LengthAwarePaginator versus LengthAwarePaginator's diff spelling LengthAwarePaginator shown as LengthAwarePaginator is instead LengthAwarePaginator's alternative LengthAwarePaginator. More directly, the diff uses ShouldBroadcastNow as ShouldBroadcastNow is actually shown as ShouldBroadcastNow's alternative ShouldBroadcastNow; reconcile the unequivocal differences DeviatesCastableAttributes versus DeviatesCastableAttributes's diff spelling DeviatesCastableAttributes shown as DeviatesCastableAttributes is different: the diff says DeviatesCastableAttributes as DeviatesCastableAttributes's counterpart DeviatesCastableAttributes. Supply consistent evidence. _(missing evidence)_
- **F-7** `packages/contracts/tests/xaravel/complete.test.ts`: Supply the contracts.jsonl declaration rows, relevant div12-pairs.jsonl entries, package.json exports, mutation-target sources, and DIV-12 record. These inputs are read or copied by XT-contracts-16 but are absent from the prompt, preventing confirmation of its completeness and DIV-12 claims. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"41d3c782647d52a97a9dde882d9a54754df50e55","base":"79600b6b0dcda998ca162804f46111cb4e173029","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T19:29:15.146Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds none; no Upstream assertion sequence applies.","findings":[]},{"id":"F-2","result":"pass","note":"The change adds Xaravel Tests without replacing existing expected values or weakening any Ported Test comparison.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff changes no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no assertion adaptation marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"Both test bodies broadly exercise their declared gate and protection behavior, but omitted inputs and conflicting documentation prevent confirming XT-contracts-16's complete-reference claim.","findings":[{"path":"packages/contracts/docs/contracts.md","detail":"The diff and whole-file evidence give different reference tables. For example, the diff lists ShouldBroadcastNow and ShouldRescue, whereas the whole file lists ShouldBroadcastNow and ShouldRescue nowhere and instead includes ShouldBroadcastNow's apparent counterpart ShouldBroadcastNow only as ShouldBroadcastNow is absent; supply one authoritative tree-bound version and reconcile all differing names, including LengthAwarePaginator versus LengthAwarePaginator's diff spelling LengthAwarePaginator shown as LengthAwarePaginator is instead LengthAwarePaginator's alternative LengthAwarePaginator. More directly, the diff uses ShouldBroadcastNow as ShouldBroadcastNow is actually shown as ShouldBroadcastNow's alternative ShouldBroadcastNow; reconcile the unequivocal differences DeviatesCastableAttributes versus DeviatesCastableAttributes's diff spelling DeviatesCastableAttributes shown as DeviatesCastableAttributes is different: the diff says DeviatesCastableAttributes as DeviatesCastableAttributes's counterpart DeviatesCastableAttributes. Supply consistent evidence.","kind":"missing-evidence"},{"path":"packages/contracts/tests/xaravel/complete.test.ts","detail":"Supply the contracts.jsonl declaration rows, relevant div12-pairs.jsonl entries, package.json exports, mutation-target sources, and DIV-12 record. These inputs are read or copied by XT-contracts-16 but are absent from the prompt, preventing confirmation of its completeness and DIV-12 claims.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The implementation changes are confined to contracts documentation and tests. The fake GitHub API supplies test inputs to the real CLI; it does not implement another framework Component.","findings":[]},{"id":"F-9","result":"n/a","note":"No framework src file is touched; the added async functions are private test helpers, outside the public source declarations covered by this check.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 41d3c782647d52a97a9dde882d9a54754df50e55

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `79600b6b0dcda998ca162804f46111cb4e173029`, on 2026-10-24T19:29:15.146Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | Manifest test_ids is empty; the change adds or changes no Ported Test, only Xaravel Tests in complete.test.ts. |
| F-2: No expected value is weakened | pass | No Ported Test changes. The Xaravel Tests' exact checks (gate 0/1 unexplained, exit codes, the exact protected-paths OK line) are not changed to match what Xaravel produces, and no Upstream expected value is involved. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion to count against. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is touched; no skip reason is set. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker and no Expectations adapted field is added. The docs cite DIV-1.5 only as prose, and that clause exists in decisions/DIV-1.md. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c): no assigned or changed Oracle fixture is an error, and the Story relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared each consequence string with its test body and its cited tokens. XT-contracts-16 checks the real gate (0 unexplained), the baseline and the five mutations on a temp root (each with its finding line and 1 unexplained), the DIV-12 pairs on contracts classes (all method-plus-state, no state row listed), the docs reference table against the rows, package.json exports and runtime exports, the Divergences section citing DIV-1/3/9/12 (each record exists), and async-surface.json tracked and passing --check. XT-contracts-17 checks the list line, the CODEOWNERS render, blocked/stale/approved PRs with a signed exit file, and editable with no exit file or an unsigned one. Those match AD-15(.5), AD-16(.1/.2) and FR-112. Both strings, though, cite FR-114, whose bullets are all about Escalations, and neither body tests that. |
| F-8: No stub, fake or partial implementation of another Component | pass | Only packages/contracts files change (README, docs/contracts.md, the test file) plus the Story's own manifest status. No stub, fake or hard-coded behaviour of another Component is added. The fake GitHub API and the temp roots are test fixtures driving the committed tools as child processes. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (g): the change adds or modifies no packages/*/src/ file, so no @​asyncRoot tag is added, kept on a touched file, or missing on a new export. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests/ file. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/complete.test.ts`: XT-contracts-16 cites FR-114 for 'async-surface.json is committed and current', and XT-contracts-17 cites FR-114 as well. FR-114's bullets (FR-114.1-4) are about recording Escalations, the agent going on with other Test IDs, Epic acceptance with open Escalations, and the Maintainer's decision. Neither test checks any of these. Remove FR-114 or replace it with the FR/AD bullet the assertions verify (for async-surface.json, AD-6's Enforcement bullet, AD-6.13).

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"41d3c782647d52a97a9dde882d9a54754df50e55","base":"79600b6b0dcda998ca162804f46111cb4e173029","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T19:29:15.146Z","items":[{"id":"F-1","result":"n/a","note":"Manifest test_ids is empty; the change adds or changes no Ported Test, only Xaravel Tests in complete.test.ts.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test changes. The Xaravel Tests' exact checks (gate 0/1 unexplained, exit codes, the exact protected-paths OK line) are not changed to match what Xaravel produces, and no Upstream expected value is involved.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion to count against.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is touched; no skip reason is set.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker and no Expectations adapted field is added. The docs cite DIV-1.5 only as prose, and that clause exists in decisions/DIV-1.md.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c): no assigned or changed Oracle fixture is an error, and the Story relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"fail","note":"Compared each consequence string with its test body and its cited tokens. XT-contracts-16 checks the real gate (0 unexplained), the baseline and the five mutations on a temp root (each with its finding line and 1 unexplained), the DIV-12 pairs on contracts classes (all method-plus-state, no state row listed), the docs reference table against the rows, package.json exports and runtime exports, the Divergences section citing DIV-1/3/9/12 (each record exists), and async-surface.json tracked and passing --check. XT-contracts-17 checks the list line, the CODEOWNERS render, blocked/stale/approved PRs with a signed exit file, and editable with no exit file or an unsigned one. Those match AD-15(.5), AD-16(.1/.2) and FR-112. Both strings, though, cite FR-114, whose bullets are all about Escalations, and neither body tests that.","findings":[{"path":"packages/contracts/tests/xaravel/complete.test.ts","detail":"XT-contracts-16 cites FR-114 for 'async-surface.json is committed and current', and XT-contracts-17 cites FR-114 as well. FR-114's bullets (FR-114.1-4) are about recording Escalations, the agent going on with other Test IDs, Epic acceptance with open Escalations, and the Maintainer's decision. Neither test checks any of these. Remove FR-114 or replace it with the FR/AD bullet the assertions verify (for async-surface.json, AD-6's Enforcement bullet, AD-6.13).","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Only packages/contracts files change (README, docs/contracts.md, the test file) plus the Story's own manifest status. No stub, fake or hard-coded behaviour of another Component is added. The fake GitHub API and the temp roots are test fixtures driving the committed tools as child processes.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (g): the change adds or modifies no packages/*/src/ file, so no @asyncRoot tag is added, kept on a touched file, or missing on a new export.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests/ file.","findings":[]}],"prior":[]}
```
