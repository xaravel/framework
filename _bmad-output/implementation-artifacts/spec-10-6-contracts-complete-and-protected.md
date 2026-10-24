---
title: 'Story 10.6: Contracts complete and Protected'
type: 'feature'
created: '2026-10-24'
status: 'ready-for-dev'
review_loop_iteration: 0
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
