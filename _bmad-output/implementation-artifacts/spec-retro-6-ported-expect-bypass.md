---
title: 'Retro 6 item 4: close the no-ported-bun-expect re-export and global bypasses'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: 'd18d39d78f88a741276d35479f24fd4b060c984f'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/ops/lint.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `xaravel/no-ported-bun-expect` inspects only imports inside files under `tests/ported/` (finding L3). A support file `packages/demo/tests/support/e.ts` with `export { expect } from "bun:test"`, imported by a Ported Test, gives no diagnostic; a `/// <reference types="bun-types/test-globals" />` (or Bun's runtime test globals) gives a Ported Test a global `expect` with no import at all.

**Approach:** Keep the rule's name and message, and widen it on two axes: (1) in any file under `packages/<p>/` (tests, support and src alike), report every way of *exporting* `bun:test`'s `expect` or the `bun:test` namespace; (2) in a Ported Test, also report a `test-globals` triple-slash reference and any global reference to `expect` (bare or via `globalThis`).

## Boundaries & Constraints

**Always:** the rule stays syntactic (oxlint JS plugins get no types) and uses only `context.sourceCode` APIs oxlint documents (`getAllComments`, `isGlobalReference`); every existing diagnostic and inline case keeps passing; a plain `import { expect } from "bun:test"` in a non-ported package file (Xaravel Tests) still lints clean; type-only imports/exports are never reported; remaining limits are listed in `docs/ops/lint.md`.

**Never:** weaken or remove an existing assertion or case; touch `AGENTS.md`, `conformance/expectations/**`, `.oxlintrc.json` rule levels, `SPINE_RULES`, or any Protected Path tooling; add a new rule name.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Support re-export | `packages/demo/tests/support/E.ts`: `export { expect } from "bun:test";` | 1 × `no-ported-bun-expect` | — |
| Aliased re-export / export-all | same dir: `export { expect as e } from "bun:test";`, `export * from "bun:test";`, `export * as b from "bun:test";` | 1 each | — |
| Import then export | `import { expect as e } from "bun:test"; export { e };` / `export { e as check };` / `export default e;` / `export const c = e;` | 1 each | — |
| Namespace then export | `import * as b from "bun:test"; export { b };` / `export const c = b.expect;` | 1 each | — |
| src route | `packages/demo/src/E.ts`: `export { expect } from "bun:test";` | 1 | — |
| Xaravel Test (clean) | `packages/demo/tests/xaravel/X.test.ts`: `import { expect, test } from "bun:test"; test("x", () => { expect(1).toBe(1); });` | none | — |
| Type re-export (clean) | `export type { expect } from "bun:test";` under package tests | none | — |
| test-globals reference | Ported Test with `/// <reference types="bun-types/test-globals" />` | 1 | — |
| Global expect | Ported Test calling `expect(1)` with no binding; `globalThis.expect(1)`; `globalThis["expect"]` | 1 each | — |
| Local binding (clean) | Ported Test: `import { expect } from "./support"` used as `expect(x)` | none (not global; the support file is checked by the export axis) | — |
| Outside packages | `conformance/tests/x/E.ts`: `export { expect } from "bun:test";` | none (grader, not a package) | — |

</intent-contract>

## Code Map

- `tools/lint-rules/plugin.ts:344-392` -- `BUN_TEST`, `noPortedBunExpect`: currently returns `NONE` unless `isPortedTest(path)`. Restructure: compute `ported = isPortedTest(path)` and `pkg = isPackageFile(path)`; return `NONE` only if neither. Ported-only visitors keep their current bodies; export visitors run when `pkg || ported`.
- `tools/lint-rules/plugin.ts:140-180` -- path regexes (`PORTED_TESTS`, `PACKAGE_SRC`) and exported predicates; add `PACKAGE_FILES = /(^|\/)packages\/[^/]+\//` and exported `isPackageFile`.
- `tools/lint-rules/plugin.ts:86-89` -- `Context` interface; add optional `sourceCode` with `getAllComments(): readonly {type: string; value: string}[]` and `isGlobalReference(node: Node): boolean`.
- `tools/lint-rules/plugin.ts:10` and `MESSAGES.portedExpect` -- header comment updates; message unchanged.
- Helpers to reuse: `staticString`, `specifierName`, `unwrap`, `memberName`, `keyName` in `plugin.ts`.
- `conformance/tests/xaravel/lint-rules.test.ts:226-234` -- `cases` map inside XT-conformance-132's edge-case test; add the matrix rows here (temp-root paths, real oxlint).
- `docs/ops/lint.md:32` -- the rule's table row; and the "Limits" list near `:55`.

## Tasks & Acceptance

**Execution:**
- `tools/lint-rules/plugin.ts` -- add `isPackageFile`; in `noPortedBunExpect` track local names bound by value imports of `expect` and namespace imports from `bun:test` (collect in `ImportDeclaration`; check exports at `Program:exit` so hoisting order does not matter); report `ExportNamedDeclaration` with source `bun:test` exporting `expect`, `ExportAllDeclaration` from `bun:test`, source-less export specifiers whose local is a tracked name, `ExportDefaultDeclaration` / `TSExportAssignment` of a tracked name, and `export const|let|var x = <tracked>` or `= <tracked ns>.expect` (after `unwrap`); in Ported Tests also report `test-globals` triple-slash references (Line comments matching `/^\/\s*<reference\s+types\s*=\s*["'][^"']*test-globals/`) and `Identifier` `expect` where `sourceCode.isGlobalReference` is true, plus `globalThis.expect` / `globalThis["expect"]`. Each construct reported exactly once.
- `conformance/tests/xaravel/lint-rules.test.ts` -- add every I/O-matrix row to `cases` with its expected diagnostic list.
- `docs/ops/lint.md` -- update the rule row (scope and reports) and add a limits bullet: an `expect` passed through an object, function, array or reassignment, or re-exported from a file outside `packages/<p>/`, is not seen.

**Acceptance Criteria:**
- Given the matrix files in a temp root, when XT-conformance-132 runs oxlint with the real config, then each file reports exactly the listed diagnostics.
- Given the repository, when `bun run lint`, `bun run lint:disables`, `bun run typecheck` and `bun test conformance/tests/xaravel/lint-rules.test.ts` run, then all pass.

## Spec Change Log

- Implementation: oxlint's `sourceCode.isGlobalReference` is true only for globals configured in `globals` / `env`, so a bare unconfigured `expect` was not caught (probed). The rule also treats an `expect` whose reference, from `sourceCode.getScope(node).references`, resolves to nothing (or to a definition-less variable) as global. `getScope` is another `context.sourceCode` API; the rule stays syntactic.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 0, medium 8, low 6, false 5, maybe-false 4
- findings:
  - `[medium]` `[patch]` (verification-gap) `export = e` is implemented and documented but has no case — added a `.cts` case to XT-conformance-132.
  - `[false]` `[reject]` (intent) the export axis covers all of `packages/<p>/`, wider than "a package's tests/" — the spec chose this superset on purpose (a Ported Test can import a helper from `src/`); `bun run lint` passes on the real tree, where assert and mockery import but never export `bun:test`.
  - `[false]` `[reject]` (intent) the importing Ported Test stays clean in L3's two-file scenario — lint is per file, so flagging the helper fails the pair; the single-file support case proves it.
  - `[low]` `[reject]` (intent) helpers outside `packages/` are not checked — the intent scopes the check to a package's files, and the gap is listed in the docs' limits.
  - `[medium]` `[patch]` (intent, blind) a test-globals reference outside a Ported Test is not checked — the scan now runs in every package file (a support `.d.ts` is covered); the docs list tsconfig `types` as a limit.
  - `[medium]` `[patch]` (blind) `const { expect } = globalThis` and `global` / `self` / `window` evade the check — they are now treated like `globalThis` and destructuring is reported; `Reflect.get` and aliasing are listed as limits.
  - `[medium]` `[patch]` (blind) a local `declare` of `expect` hides Bun's runtime global — ambient declarations of `expect` in a Ported Test are reported.
  - `[medium]` `[patch]` (blind) `import x = require("bun:test")` is not handled — reported in Ported Tests and tracked as a namespace (including `export import`) in package files.
  - `[low]` `[patch]` (blind) untested forms (`export default b.expect`, `b["expect"]`, `e as unknown`) — cases added.
  - `[false]` `[reject]` (blind) a Ported Test that imports and exports gets two reports — after the patch, `Program:exit` runs only in non-ported files, so each Ported Test construct is reported once.
  - `[false]` `[reject]` (blind) the spec's Boundaries name only two `sourceCode` APIs — the fix would edit this build's spec; the Change Log records `getScope`.
  - `[low]` `[patch]` (blind) the rule passes silently when `sourceCode` is missing — it now throws an Error naming the rule and file.
  - `[false]` `[reject]` (blind) grader packages are in scope without a decision — they are in scope on purpose, since Ported Tests import `@xaravel/assert`, which must not hand out Bun's `expect`; the docs now say so.
  - `[low]` `[patch]` (blind) the limits bullet reads as exhaustive — it now says it is not exhaustive and lists the remaining routes.
  - `[low]` `[patch]` (blind, edge) the unanchored `isPackageFile` matches a nested `conformance/.../packages/<p>/` — it is now anchored like `isGraderLocation`, with path cases and a clean conformance case.
  - `[medium]` `[patch]` (edge) a support file can export the global `expect` (`globalThis.expect`, unbound `export { expect }`) — Program:exit now tracks these.
  - `[medium]` `[patch]` (edge) a support file can export `require("bun:test").expect`, a destructured `require`, or `(await import(...)).expect` — these are now tracked and reported.
  - `[maybe-false]` `[patch]` (edge) `export import b = require("bun:test")` — handled together with the import-equals finding above, and covered by a case.
  - `[maybe-false]` `[patch]` (edge) the ambient `declare` bypass — same root cause as the blind finding; patched there.
  - `[maybe-false]` `[patch]` (edge) destructuring and global aliases — same root cause as the blind finding; patched there.
  - `[maybe-false]` `[patch]` (edge) `getScope` may not own a nested reference — the lookup now walks `scope.upper`, and the nested bare-`expect` case passes.
  - `[low]` `[patch]` (edge) the `/// <reference path="…test-globals…" />` form is missed — the regex now accepts `path=`, with a case.
  - `[low]` `[reject]` (edge) a nested `packages/` segment in a relative path — the same defect as the anchoring finding above, patched there.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/lint.test.ts` -- expected: all pass
- `bun run lint && bun run lint:disables && bun run typecheck` -- expected: exit 0
- `bun run harness` -- expected: SUMMARY with differ=0 (NOT-RUN variants allowed)

## Auto Run Result

Status: done

- **Change:** `xaravel/no-ported-bun-expect` now covers every export of `bun:test`'s `expect` or namespace from any `packages/<p>/` file, including `export … from`, `export *`, import-then-export, `import =`, `require`/`import()` results and the global `expect`. In a Ported Test it also reports a test-globals reference (`types=`/`path=`), any global `expect` (bare, `globalThis`/`global`/`self`/`window` member or destructuring) and an ambient `declare` of `expect` (retro 6 finding L3).
- **Files:**
  - `tools/lint-rules/plugin.ts`: the rule's new axes, `isPackageFile` (anchored), and a loud failure when `sourceCode` is missing.
  - `conformance/tests/xaravel/lint-rules.test.ts`: new XT-conformance-132 edge cases and path cases. No existing case was removed. The exact built-in list gains `triple-slash-reference`, which the `path=` case causes.
  - `docs/ops/lint.md`: the rule's row and a non-exhaustive limits bullet.
- **Review:** 23 findings, with 17 patched (8 medium, 5 low, 4 maybe-false) and 6 rejected (5 false, 1 low out of intent scope; reasons are in the triage log). Nothing was deferred.
- **Follow-up review recommended:** true. Eight medium entries were patched in one pass. The open risk is that the global-`expect` detection depends on oxlint's scope manager (`getScope`, ambient definitions); it is proven only on single-file fixtures.
- **Verification:**
  - `bun test conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/lint.test.ts`: 5 pass.
  - `bun run lint`, `bun run lint:disables` and `bun run typecheck`: exit 0.
  - `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, Xaravel Tests 252/252.
- **Residual risks:** These are listed in the limits in `docs/ops/lint.md`: pass-through via objects, functions or reassignment; `Reflect.get`; an aliased global object; exports nested in a namespace; a tsconfig `types` entry; helpers outside `packages/`.
