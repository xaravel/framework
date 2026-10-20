---
title: 'Retro 6 item 12: async-surface thenable lines, @asyncRoot only on Promises, thenables matched by qualified name'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: 'b491b684bd8fe39e32323fb46044f313f304f4eb'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/async-surface.md'
  - '{project-root}/docs/ops/lint.md'
  - '{project-root}/decisions/MAINT-2026-10-19-epic-6-items.md'
warnings: []
deferred:
  - summary: >-
      Thenable resolution is proven only on fixtures; no real package registers a thenable yet, and the Skeleton's
      only enforcement (no-async-thenable-return) now depends on bare-specifier resolution to a registering source file.
    evidence: |-
      packages/** has no registerClass call (registration: ok, 0 registrations) and packages/assert/async-surface.json
      has no thenable line. A published package shipping compiled output, or a barrel using export * as, would
      resolve to nothing silently. Re-check when the first thenables land: Story 9.4 (first real registerClass
      calls) and Story 10.6 (first Component gate), per MAINT-2026-10-19 item 9 V1.
    location: >-
      tools/lint-rules/thenables.ts registeredFqcn
    severity: medium
---

<intent-contract>

## Intent

**Problem:** `async-surface` treats a method returning a thenable short name as async and demands `@asyncRoot` on it, so a sync builder method (`DB.table(): Builder`) gets a false tag, and short-name matching takes `Schema\Builder` for `Query\Builder` (finding S1). The Maintainer ruled (item 7, AD-6 Enforcement): a sync thenable-returning method gets a tagless `thenable` line; the tag is required only on Promise-returning methods; a thenable is matched by qualified name resolved through its import, never by short name. `xaravel/no-async-thenable-return` shares the short-name list and has the same flaw.

**Approach:** Resolve a type name to an Upstream FQCN by following its import (or its own file) to the source module that calls `registerClass('<FQCN>', X)` for it (AD-10), through re-exports. One resolver in `tools/lint-rules/thenables.ts`, used by both tools; the `registerClass` recogniser moves to `tools/registration/recognise.ts` so the resolver, the registration scan and `api-surface` share one recogniser without an import cycle.

## Boundaries & Constraints

**Always:** Compare FQCNs without a leading `\`, case-insensitively, and print the list's canonical spelling. A name that does not resolve to a registered FQCN is not a thenable. Promise / `PromiseLike` stay recognised by name (they are globals). Keep the lint rule's structural thenables (a same-file class that declares `then` or implements `PromiseLike` / `Thenable`). Document the format, the resolution and the remaining limits in `docs/ops/async-surface.md` and `docs/ops/lint.md`.

**Never:** Touch `AGENTS.md`, `conformance/expectations/**`, `packages/**`, the PRD, spine, SPEC or `epics.md`. Remove an assertion except one over a removed export, and then replace it with an equivalent assertion; expected values change only where the ruling changes the output.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sync thenable | untagged `where(): Builder`, `Builder` imported from a file registering `Illuminate\Database\Query\Builder` | line `{"method":"Repository.where","file":"src/Repository.ts","thenable":"Illuminate\\Database\\Query\\Builder"}` | none |
| Tagged thenable | same, tagged `@asyncRoot callback` | — | error `Repository.where returns a thenable but no Promise, so it carries no @asyncRoot tag (AD-6)`; exit 1 |
| Same short name, other FQCN | `getSchemaBuilder(): Builder` from a file registering `Illuminate\Database\Schema\Builder`; an unregistered local `Builder` | not listed | none |
| Promise untagged | `put(): Promise<void>` | — | error `… returns a Promise but has no @asyncRoot tag …` |
| Promise or thenable | `m(): Promise<X> \| Builder` | async line, tag required | as Promise |
| Resolution paths | named / renamed / `import type` / `import * as ns` + `ns.Builder` / `import("./B").Builder` / same-file class / `export { X as Y } from` / `export *` chain | resolved to the registering file's FQCN | unresolvable → not thenable |
| Lint, resolved | `async f() { return new QB(); }`, `QB` re-exported from support's registered `Query\Builder` | `no-async-thenable-return` | — |
| Lint, other FQCN | same with `Schema\Builder`, or a local unregistered `interface PendingRequest` | clean | — |

</intent-contract>

## Code Map

- `tools/async-surface/async-surface.ts` -- `isAsyncType` (tail-name match incl. thenables), `memberSignatures`/`fileSignatures` (build signatures; d.ts imports must be collected here), `surfaceOf` (grouping/error messages), `render`, `shortNames` (to remove), `main` (wires `thenableTypes`).
- `tools/lint-rules/thenables.ts` -- `THENABLE_TYPES` (keep), `THENABLE_NAMES` (remove); home of the new resolver `registeredFqcn(fromFile, specifier|null, name)` and `isThenableFqcn`.
- `tools/registration/registration.ts:108-195` -- `FQCN`, `isFqcn`, `normaliseFqcn`, `recogniseRegistration`, `conforming`, interfaces: move to `tools/registration/recognise.ts`, re-export from here (api-surface imports them from registration.ts:52). registration.ts imports `node`/`nodes` from async-surface, so the new module must not import async-surface.
- `tools/lint-rules/plugin.ts:1141-1250` -- `noAsyncThenableReturn`: replace `THENABLE_NAMES` with per-file import resolution in its `Program` handler; handle `ns.X` in `isThenableType`/`isThenableNew` (`entityName` returns only the right side).
- `tools/async-surface/fixtures/` -- `demo/src/Builder.ts` gains `registerClass` stand-in + registrations (`Illuminate\Database\Query\Builder`, `X\Lazy`); add `demo/src/Schema/Builder.ts`; `demo/src/Repository.ts` `where()` loses its tag and gains `getSchemaBuilder()`; `contracts/Thenables.ts` `lazy()` loses its tag; new `failing/tagged-thenable.ts`. Fixture tsconfig has `types: []`, so no framework imports.
- `tools/lint-rules/fixtures/signatures-state/support.ts` -- register `Builder` as `Illuminate\Database\Query\Builder`.
- `conformance/tests/xaravel/async-surface.test.ts` -- XT-conformance-134/135/136: `EXPECTED`, `FALLBACK`/`shortNames`, contracts case, `matrixEdgeCases` (inline d.ts need imports + a stub resolver).
- `conformance/tests/xaravel/lint-signatures.test.ts:139-147,254-265` -- `THENABLE_NAMES` assertion; `then/*` edge cases (`As.ts` uses a local interface).
- `docs/ops/async-surface.md`, `docs/ops/lint.md:54,66` -- format, thenables, limits.

## Tasks & Acceptance

**Execution:**
- `tools/registration/recognise.ts` (new) + `tools/registration/registration.ts` -- move the recogniser, re-export -- one recogniser, no cycle.
- `tools/lint-rules/thenables.ts` -- drop `THENABLE_NAMES`; add `registeredFqcn` (relative specifiers: `.js`→`.ts`, `.ts`, `/index.ts`; bare: `Bun.resolveSync` from the file's directory; follows local `export {}`, imported-then-exported bindings, `export {} from`, `export *`; visited set; cache by path+mtime) and `importBindings(statements)` shared by both tools.
- `tools/async-surface/async-surface.ts` -- split Promise vs thenable detection; `SurfaceEntry = AsyncEntry | ThenableEntry`; `surfaceOf(files, thenables: readonly string[], resolve = () => null)`; new messages; `main` passes a resolver over `packages/<pkg>/<file>`; remove `shortNames`; update header comment.
- `tools/lint-rules/plugin.ts` -- resolve imports and same-file registrations; qualified names via namespace imports.
- fixtures, both test files, both docs -- as in the Code Map; add probes for every I/O matrix row.

**Acceptance Criteria:**
- Given the fixture package, when `bun run async-surface demo` runs, then `where` is a `thenable` line, `getSchemaBuilder` is absent, and every other line is unchanged.
- Given the contracts list `X\Lazy`, when it runs, then `lazy` is a `thenable` line with `X\\Lazy` and `where` is absent.
- Given the real repository, when `bun run async-surface --all --check`, `bun run lint`, `bun run typecheck` and the two test files run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 25 findings — high 0, medium 3, low 20, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: `const compare` sits between `surfaceOf`'s doc comment and the function — moved above the comment.
  - `[low]` `[patch]` blind: moved FQCN regex holds raw U+FFFF instead of the `￿` escape (verified: 4 raw `EF BF BF` sequences, none at baseline) — escapes restored.
  - `[low]` `[patch]` blind: limits say `.js` / `.d.ts` modules are not followed, but `resolveSpecifier` follows them — docs and header corrected.
  - `[low]` `[patch]` blind: `export { X as default }` is followed though the docs say default exports are not — docs and header corrected.
  - `[medium]` `[patch]` blind: lint `thenableName` follows an import before same-file registrations while `localFqcn` checks registrations first, so the two tools disagree on an imported-and-registered class — lint checks registrations first.
  - `[medium]` `[defer]` blind: the Skeleton relies only on `no-async-thenable-return`, now dependent on bare-specifier resolution to a source file that registers the class; untestable until real `@xaravel/*` packages register thenables — deferred, with the existing V1 re-check targets (Stories 9.4, 10.6).
  - `[low]` `[reject]` blind: module cache keyed on mtime only — lint and the tool are one-shot processes; same-ms rewrites of an imported module mid-run are not met in everyday use, and the fix adds key state.
  - `[low]` `[reject]` blind: repeated lookups not memoised per file — a performance nicety with no observed cost (lint passes over the repo); adds caching complexity.
  - `[low]` `[patch]` blind: untested Node `createRequire` fallback, against the Bun-only toolchain — deleted.
  - `[false]` `[reject]` blind: lint `TSQualifiedName` branch untested — `then/Qualified.ts` declares `Promise<db.Builder>`, a `TSQualifiedName`, and is expected to report.
  - `[low]` `[patch]` blind: a type parameter named like an import resolves through the import (both tools) — documented as a limit (no scope tracking).
  - `[low]` `[patch]` blind: test `resolved` array never cleared, so its `toContain` passes from any call — cleared before the checked call.
  - `[low]` `[reject]` blind: `FALLBACK` is a bare alias of `THENABLE_TYPES` — cosmetic.
  - `[low]` `[reject]` blind: no `surfaceOf` test of a `.js`-suffixed `.d.ts` import — the CLI resolver's `.js` → `.ts` mapping is covered by `resolverCases`; the stub resolver would not test it anyway.
  - `[low]` `[reject]` blind: spec Code Map line ranges drift — the fix edits this build's spec.
  - `[low]` `[patch]` edge: inner-scope binding shadowing an import in lint — same root cause as the type-parameter row; documented as a limit.
  - `[low]` `[patch]` edge: method type parameter named like an import in async-surface — same root cause; documented.
  - `[low]` `[reject]` edge: `.tsx` / `.mts` / `.cts` candidates not tried — packages are `.ts` by AD-3; unlikely and adds branches.
  - `[low]` `[reject]` edge: a target module with parse errors yields a partial program — such a file already fails `tsc` and lint, so the run fails loudly elsewhere.
  - `[low]` `[reject]` edge: mtime granularity cache — same as the blind cache row.
  - `[false]` `[reject]` edge: `import("…")` specifiers relative to outDir differ from src — tsconfig `rootDir: "."` makes `outDir/src/<p>.d.ts` mirror `src/<p>.ts`, so relative specifiers resolve identically; bare specifiers do not depend on location.
  - `[low]` `[patch]` edge: default-export claim — same root cause as the blind default-export row; docs corrected.
  - `[low]` `[patch]` verification-gap: no test checks the message text, which now names the FQCN — asserted for `AsResolved.ts`, `SameFile.ts` and `Let.ts`.
  - `[low]` `[patch]` verification-gap other: raw U+FFFF — same as the blind row.
  - `[medium]` `[defer]` intent-alignment: the thenable path runs only on fixtures; no real package registers a thenable yet — grouped with the Skeleton deferral (same root cause: no real thenable code exists).

## Design Notes

Thenable line format: `{"method":…,"file":…,"thenable":"<FQCN>"}` (distinct FQCNs sorted and joined by `|` if a union or overloads return several). Async lines keep `root`. A method that returns a Promise on any signature is async, even if it also returns a thenable.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/async-surface.test.ts conformance/tests/xaravel/lint-signatures.test.ts conformance/tests/xaravel/lint.test.ts conformance/tests/xaravel/registration.test.ts` -- expected: pass
- `bun run async-surface --all --check && bun run typecheck && bun run lint && bun run registration:check` -- expected: exit 0
- `bun run harness --xaravel` -- expected: SUMMARY with no differences

## Auto Run Result

Status: done

**Change.** `async-surface` writes a tagless `{"method","file","thenable":"<FQCN>"}` line for each sync method that returns a thenable, and requires `@asyncRoot` only on Promise-returning methods. A tag on a thenable-only method is an error. Both `async-surface` and `xaravel/no-async-thenable-return` match thenables by the FQCN that the name's import (or its own file) registers with `registerClass`, never by short name. One resolver (`registeredFqcn` in `tools/lint-rules/thenables.ts`) serves both, and the `registerClass` recogniser moved to `tools/registration/recognise.ts` to avoid an import cycle (MAINT-2026-10-19 item 7, finding S1).

**Files.**
- `tools/registration/recognise.ts` (new), `tools/registration/registration.ts`: the recogniser moved here and is re-exported from `registration.ts`.
- `tools/lint-rules/thenables.ts`: `THENABLE_NAMES` removed; added the resolver, `importBindings`, `moduleInfoOf` and `isThenableFqcn`.
- `tools/async-surface/async-surface.ts`: Promise detection and thenable detection are now separate, with thenable lines, the new messages and the CLI resolver.
- `tools/lint-rules/plugin.ts`: the rule resolves names through imports and same-file registrations; structural thenables are kept.
- Fixtures: `demo/src/Builder.ts` gains registrations; new `demo/src/Schema/Builder.ts`; `Repository.ts` and `contracts/Thenables.ts` lose their tags; new `failing/tagged-thenable.ts`; lint `support.ts` registers its Builder.
- Tests: `async-surface.test.ts` and `lint-signatures.test.ts`. Expected values changed only where the ruling changes the output, and the `THENABLE_NAMES` assertion was replaced by the same list derived from `THENABLE_TYPES`.
- Docs: `docs/ops/async-surface.md`, `docs/ops/lint.md` and `docs/ops/registration.md`.

**Review.**
- 25 findings: 14 patched (1 medium, 13 low), 2 deferred into one entry (fixture-only proof and the Skeleton's dependence on bare-specifier resolution), 9 rejected (2 false; 7 low, either unlikely or adding complexity, reasons in the triage log).
- Follow-up review: `false`, since only one medium and no high was patched.

**Verification.**
- The six covering test files: 21 pass.
- `bun run async-surface --all --check`: ok for 51 packages.
- `bun run typecheck`, `bun run lint` (including `lint:disables`) and `bun run registration:check`: ok.
- `bun run harness --xaravel`: 265 of 265 pass, `differ=0`.

**Residual risks.** No real package registers a thenable yet, so the resolver has only run on fixtures. Re-check it at Stories 9.4 and 10.6. Scope is not tracked: a type parameter that shadows an imported name resolves through the import (documented).
