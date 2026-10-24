---
title: 'API surface: the export carries each declaration''s parents and the diff reports a dropped or extra parent (epic-10-retro-item-5, part 3)'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_revision: '2b77e2efc884d7bcf37b40d32c3b53ff685e128c'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/MAINT-2026-10-24-epic-10-items.md'
  - '{project-root}/docs/ops/api-surface.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: [oversized]
deferred:
  - summary: >-
      A contract token's runtime parents (contract()'s 3rd argument, which the doubles read as CONTRACT_PARENTS) are not compared with its `extends` or with the exported parents.
    evidence: |-
      heritageNames reads only `interface … extends` and `class … extends … implements`; a port that keeps `extends QueryBuilder`
      but drops `[QueryBuilder]` from contract(...) passes the gate while its doubles lack the parent brand. Outside this item's
      route (the ruling compares TS heritage with the export); listed as a limit in docs/ops/api-surface.md and under finding S6
      in the Epic 10 retrospective for the next retrospective to route.
    location: >-
      tools/api-surface/api-surface.ts heritageNames
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A dropped interface `extends` (or class parent / `implements`) is invisible to the API-surface gate: the Upstream export carries no parents, and the diff does not walk TS heritage (finding S6, `epic-10-retro-item-5`, part 3; parts 1-2 landed in #385).

**Approach:** The Maintainer's route (`decisions/MAINT-2026-10-24-epic-10-items.md`, "Item 5, part 3"): `tools/oracle/api-surface.php` exports a `parents` list on every declaration line, `schema.json` requires it, the real exporter regenerates every `conformance/api-surface/<component>.jsonl` adding only that field, and `tools/api-surface` compares the walked TS heritage of each registered declaration with the exported parents, reporting a dropped or extra parent.

## Boundaries & Constraints

**Always:**
- `parents` is transitive and sorted: the whole `getParentClass()` chain plus `getInterfaceNames()` (every interface implemented or extended, directly or inherited), PHP built-ins and stubs included, traits not. Both modes (repositories and PSR interfaces) emit it.
- Regenerate with the real exporter (`bun run oracle:api-surface --local /tmp/xaravel-psr-local`, locked installs of the committed locks); every changed row differs from `main` only by the added `parents` key. Any other changed row stops the item as an Escalation.
- The diff compares only parents that are declarations in the Upstream surface (any component): Upstream side = the record's `parents` ∩ known FQCNs; TS side = the transitive closure of the registration's heritage (`interface … extends`, `class … extends … implements`) read from the package sources and resolved to FQCNs, ∩ known FQCNs, minus the declaration itself.
- Heritage names resolve through: a registration in the same file, a named/default import from a relative module (`.ts`, `/index.ts`; following `export {…} from` and `export * from` re-exports), or from `@xaravel/<c>[/…]` (that package's registrations by local name, unique). An unresolved name contributes nothing.
- A difference is one `mismatch` on the declaration (`kind` its kind, `member` null), details `parents: drops <fqcn>, …; adds <fqcn>, …`, explained by an `exceptions.jsonl` line like any declaration mismatch. A declaration with that mismatch is not counted `matched`.
- `bun run api-surface:gate contracts` still passes with 0 unexplained, or an Escalation is raised for each real mismatch.

**Never:** change a Protected Path other than `tools/oracle/api-surface.php`, `conformance/api-surface/schema.json`, `conformance/api-surface/*.jsonl` (the ruling's three), `tools/api-surface/**` and the item's tests; the driver `tools/oracle/api-surface.ts` changes only its declaration key order (`KEYS`) and header, which the regeneration cannot happen without. Never edit `conformance/expectations/**`, `additions.jsonl`, `exceptions.jsonl`, any `packages/**`, or the item's `action`/`owner`/`epic`. No assertion removed or weakened.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Kept parent | Upstream `B extends A`; TS `interface B extends A` | no item; `B` matched | none |
| Dropped parent | Upstream `B extends A`; TS `interface B` | `mismatch interface B: parents: drops A` | explained by an exceptions line for `B` |
| Extra parent | Upstream `B` with no parents; TS `B extends A`, `A` in the surface | `mismatch … parents: adds A` | same |
| Transitive | Upstream `C` parents `[A, B]`; TS `C extends B`, `B extends A` | no item | none |
| Imported / re-exported / cross-package parent | `import { A } from "./A"`, via `index.ts` re-export, or `@xaravel/other` | resolved, no item | unresolved name ignored |
| Built-in parent | Upstream parents `[Countable, Stringable]` | ignored (not in the surface) | none |
| Record without `parents` | inline test record | not parent-checked | schema (XT-conformance-199) requires it in committed files |

</intent-contract>

## Code Map

- `tools/oracle/api-surface.php` -- `stubbedOf` (~227) is the model; add `parentsOf`; declaration line at ~387; header comment lines 13 and ~40.
- `tools/oracle/api-surface.ts:66-76` -- `KEYS`: `renderLine` keeps only listed keys, so the declaration kinds gain `"parents"`.
- `conformance/api-surface/schema.json#/$defs/declaration` -- add required `parents` (array of fqcn); the validator (`tools/oracle/request.ts` `schemaErrors`) throws on unsupported keywords, so no `uniqueItems`.
- `tools/api-surface/api-surface.ts` -- `UpstreamRecord` (115), `DiffInput` (150), `parsePackage` (623, source statements already parsed), `diffComponent` declaration loop (~1196), `readUpstream` (1417), `diffComponents` (1491, builds inputs per component; add known FQCNs across all component files and a loader for another package's sources via `packageSources`); header comment line 71-73 states the old blind spot.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- pure `diffComponent` cases over inline texts; next free XT id from `grep -o 'XT-conformance-[0-9]*' conformance/tests/xaravel/*.ts | sort -t- -k3 -n | tail -1`.
- `conformance/tests/xaravel/api-surface.test.ts` -- exporter tests whose expected declaration lines (143, 254-277, 311-318, 369, 673-676, 769-770) gain `parents`; XT-conformance-198 runs the real PHP on `php-fixtures/api-surface/` (fixture classes implement `Contracts\Shape`, extend `Base`).
- `docs/ops/oracle.md:336-348`, `docs/ops/api-surface.md` -- describe the field and the new check.

## Tasks & Acceptance

**Execution:**
- `tools/oracle/api-surface.php`, `tools/oracle/api-surface.ts`, `conformance/api-surface/schema.json` -- emit, order and require `parents`.
- `conformance/api-surface/*.jsonl` -- regenerate with the real exporter; verify only `parents` was added.
- `tools/api-surface/api-surface.ts` -- heritage resolution, closure, comparison and reporting as above; header comment.
- `conformance/tests/xaravel/api-surface.test.ts` -- update expected lines; assert the real PHP's `parents` for the fixture (transitive, built-ins kept, trait excluded) and that the schema refuses a declaration without it.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- one case per matrix row, plus the gate on a CLI fixture root.
- `docs/ops/oracle.md`, `docs/ops/api-surface.md` -- document.

**Acceptance Criteria:**
- Given the branch, when `bun run oracle:api-surface --check --local /tmp/xaravel-psr-local` runs, then it prints `API surface check OK`.
- Given the regenerated files, when compared with `main`, then every changed line differs only by the added `parents` key.
- Given the branch, when `bun run api-surface:gate contracts` runs, then it exits 0 with 0 unexplained.

## Verification

**Commands:**
- `bun run oracle:api-surface --check --local /tmp/xaravel-psr-local` -- expected: `API surface check OK`
- `bun run api-surface:gate contracts` -- expected: exit 0
- `bun test conformance/tests/xaravel/api-surface.test.ts conformance/tests/xaravel/api-surface-diff.test.ts` (with `XARAVEL_PHP_FIXTURES=require`) -- expected: pass
- `bun run typecheck` and `bun run lint` -- expected: clean

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 28 findings — high 0, medium 3, low 9, false 16, maybe-false 0
- findings:
  - `[medium]` `[defer]` (blind) A contract token's runtime `parents` argument is never compared — real; outside the ruling's route (TS heritage vs the export); deferred, listed as a limit in the docs and under S6.
  - `[low]` `[patch]` (blind) Dropped built-in parents are invisible and not listed as a limit — by design (built-ins are not in the surface); the limit is now documented in `docs/ops/api-surface.md` and the tool header.
  - `[medium]` `[patch]` (blind) `@xaravel/<c>/<sub>` ignores the subpath; `Factory` is registered 11 times in contracts — the specifier now resolves through the package `exports` map / `src/<sub>` and `resolveExport`, unique-local fallback last; tested with a duplicated name picked by subpath and an aliased re-export.
  - `[false]` `[reject]` (blind) Parents in an unported component have no lawful outcome — `exceptions.jsonl` accepts a `deferred:<item>` citation (schema `#/$defs/exception`), the same route an unported member takes.
  - `[low]` `[patch]` (blind) Traits in the compared set give false `adds` — trait declarations are now left out of `known`; one assertion.
  - `[false]` `[reject]` (blind) One exceptions line covers any later parents mismatch — the existing declaration-level citation semantics (`find` falls back to `member: null`) apply to every mismatch kind; not introduced here.
  - `[false]` `[reject]` (blind) No evidence other components' gates still pass — `bun run api-surface --all` on the branch: only `contracts` has registrations (765/765 matched); every other component is 0 matched, so no parent check runs there.
  - `[false]` `[reject]` (blind) AC 2 not reproducible — the intent-alignment layer independently stripped `parents` from all 41 files and found them identical to HEAD; `oracle:api-surface --check --local` proves they are the real exporter's bytes.
  - `[low]` `[reject]` (blind) Cycle memo can cache a partial closure — a heritage cycle is a `tsc` error (TS2310), and the gate builds declarations with `tsc -b` first, so the case cannot reach the walk.
  - `[low]` `[reject]` (blind) Unresolved heritage name gives no diagnostic — rare (qualified names, mixins); a diagnostic adds a new output channel; the limit is documented.
  - `[low]` `[reject]` (blind) A gate now reads every component file — the files are committed, schema-checked (XT-conformance-199) and generated; the error names the bad file's component.
  - `[false]` `[reject]` (blind) Test coverage gaps (one test, generic heritage, `import type`) — `extends Base<T>` is still an `Identifier` expression and `import type` still an `ImportSpecifier` in oxc's AST, so both take the tested paths; one test with per-row assertions is this file's convention.
  - `[false]` `[reject]` (blind) Record-without-parents escape hatch — fixed with the readUpstream check below (same root cause as edge #2).
  - `[low]` `[patch]` (edge) `parents: null` crashes — readUpstream now rejects a declaration whose `parents` is missing or not a string array; asserted.
  - `[medium]` `[patch]` (edge) Committed line without `parents` silently skips the check — same fix; the skip stays only for inline `diffComponent` input.
  - `[false]` `[reject]` (edge) A missing-declaration citation later explains a parents mismatch — pre-existing citation keying, unchanged by this item.
  - `[low]` `[reject]` (edge) A malformed unrelated component file fails the gate — as blind #11.
  - `[low]` `[reject]` (edge) Heritage cycle memoisation — as blind #9.
  - `[low]` `[patch]` (edge) `.js` relative specifier unresolved — mapped to its `.ts` source; one assertion.
  - `[false]` `[reject]` (edge) Aliased cross-package re-export unresolved — fixed by the subpath patch (blind #3), tested with `export { Factory as CacheFactory }`.
  - `[false]` `[reject]` (edge) Runtime parents argument — same claim as blind #1, deferred there.
  - `[false]` `[reject]` (edge) Traits give false `adds` — same claim as blind #5, patched there.
  - `[low]` `[patch]` (verification-gap) The real `diffComponents`/`sourcesOf` loader for `@xaravel/<c>` is never run — XT-conformance-266's CLI part now builds a two-package root; kept parent passes the gate, dropped parent fails with `drops Two\A`.
  - `[false]` `[reject]` (verification-gap, other) Runtime parents argument — as blind #1.
  - `[false]` `[reject]` (verification-gap, other) Every run reads every component file — as blind #11.
  - `[false]` `[reject]` (intent) `tools/oracle/api-surface.ts` changes beyond the ruling's three paths — its `KEYS` decides which keys `renderLine` writes, so the ruling's regeneration cannot carry the field without it; only `KEYS` and the header changed, stated in the spec and the PR.
  - `[false]` `[reject]` (intent) Transitive rather than direct parents — PHP's `getInterfaceNames()` has no declared-only form; comparing closures is exact for the ruling's goal (a dropped or extra parent of the type), stated in the schema and docs.
  - `[false]` `[reject]` (intent) Comparison limited to surface declarations — built-ins have no Xaravel FQCN to compare; documented as a limit.

## Auto Run Result

**Summary.** `tools/oracle/api-surface.php` writes a sorted, transitive `parents` list on every declaration line (the parent chain plus every interface, built-ins and stubs included, traits not). `schema.json` requires it, and the real exporter regenerated all 41 `conformance/api-surface/*.jsonl`: 2,445 declaration lines gained the key and nothing else changed. `tools/api-surface` walks each registration's TS heritage (same file, relative imports and re-exports, `@xaravel/<c>[/<sub>]` through the package `exports`) and reports `mismatch … parents: drops …; adds …` on the declaration, limited to non-trait Upstream declarations of any component.

**Files.**
- `tools/oracle/api-surface.php`: `parentsOf`, the `parents` key, header.
- `tools/oracle/api-surface.ts`: `KEYS` for the four declaration kinds, header (needed for the regeneration to keep the field).
- `conformance/api-surface/schema.json`: required `parents`.
- `conformance/api-surface/*.jsonl` (41): regenerated with `--local`.
- `tools/api-surface/api-surface.ts`: heritage walk, `parentsFailure`, readUpstream check, cross-component known set, header.
- `tools/api-surface/fixtures/demo.jsonl`: `parents: []`.
- `conformance/tests/xaravel/api-surface.test.ts`: expected lines, real-PHP `parents` assertions, schema refusal.
- `conformance/tests/xaravel/api-surface-diff.test.ts`: XT-conformance-266.
- `docs/ops/oracle.md`, `docs/ops/api-surface.md`: the field, the check and its limits.
- `_bmad-output/implementation-artifacts/story-manifests.md`: XT-conformance-266 recorded, next free 267.

**Review.** 28 findings: 8 patched (3 medium, 5 low), 1 deferred (runtime `parents` argument, medium), 19 rejected with the reasons in the triage log. Fidelity Review skipped: the item's `action` names no `packages/<component>`.

**Follow-up review recommended:** true. Two medium entries were patched (subpath resolution, readUpstream `parents` check); the risk is that the new `@xaravel` `exports`-map resolution, exercised only on fixtures, misses a real package layout when the first cross-package parent lands.

**Verification.**
- `bun run oracle:api-surface --check --local /tmp/xaravel-psr-local`: `API surface check OK: 21366 lines in 41 files are byte-identical`.
- `bun run api-surface:gate contracts`: 0 unexplained, exit 0; `bun run api-surface --all`: contracts 765/765 matched, other components unchanged.
- `XARAVEL_PHP_FIXTURES=require bun test` on api-surface, api-surface-diff, harness-select and `packages/contracts/tests`: 39 pass, 0 fail.
- `bun run typecheck`, `bun run lint`: clean.

**Residual risk.** Image mode is unverified here (no Docker); `oracle.yml`'s `oracle:api-surface --check` on the PR is the proof. The runtime `parents` argument is not compared (deferred).
