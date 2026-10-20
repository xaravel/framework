---
title: 'Retro 6 item 1: registration scan sees every registerClass call and exported class'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: '3242a9991d0091c9ed021a906ffa211edc5a5967'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/docs/ops/registration.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md'
warnings: []
deferred:
  - summary: >-
      The runtime Class Registry module may itself trip the nested or alias rules when it lands.
    evidence: |-
      maybe-false: no packages/runtime registry source exists yet (0 registrations in the repo). `export function registerClass`
      is not flagged, but an internal wrapper, bulk helper or renamed re-export would be. Settle by running
      `bun run registration:check` on the first Story that adds `@xaravel/runtime/registry`.
    location: >-
      tools/registration/registration.ts strayUses
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The registration scan (`tools/registration/registration.ts`) only inspects top-level `ExpressionStatement`s, so `void registerClass(…)`, `(registerClass(…))`, `registerClass?.(…)`, a call inside `if`/a function/a namespace, or an aliased `registerClass` is neither counted nor flagged, and a duplicate FQCN can pass CI (finding R1). `export const X = class {}` escapes the "file ends with `registerClass`" rule (R2). The scan normalises a leading `\` while `tools/api-surface` keys the literal as written, so `registerClass('\\A\\Foo', Foo)` passes the scan but mismatches Upstream `A\Foo` in the diff (R4).

**Approach:** Walk the whole AST and report every `registerClass` call that is not a conforming top-level statement, and every aliasing of `registerClass`, as an AD-10 shape violation; treat exported class expressions as exported classes; export one registration recogniser from `tools/registration/registration.ts` that returns the FQCN without its leading `\`, and use it in `tools/api-surface`; document `export =` and namespace classes (and the remaining syntactic limits) in `docs/ops/registration.md` § Limits.

## Boundaries & Constraints

**Always:** Keep every existing violation message, position and exit code unchanged; the duplicate message still names each site's literal FQCN; duplicates still compare case-insensitively. Report new violations at the offending node's start, sorted with the rest. Graders stay subject to the shape rules. Probe the evasions in the matrix in tests.

**Never:** No edits to `AGENTS.md`, `conformance/expectations/**`, `packages/**`, the protected-paths or ownership tools. No removed assertions; the one existing assertion whose expected value changes (a `registerClass` inside a function body, previously `[]`) becomes stricter, never looser. Do not flag member calls (`registry.registerClass(…)`) — they remain a documented limit. Do not lowercase FQCNs in the API-surface diff.

## I/O & Edge-Case Matrix

| Scenario | Input (in `packages/a/src/F.ts`) | Expected |
|----------|-----------------------------------|----------|
| Conforming | `export class Foo {}` + `registerClass('A\\Foo', Foo);` | no violation, 1 registration |
| Nested | `if (x) { registerClass('A\\Foo', Foo); }`, inside a function, a namespace, an arrow | `NESTED_MESSAGE` at the call; not a registration |
| Wrapped top-level | `void registerClass(…)`, `(registerClass(…));`, `registerClass?.(…)`, `registerClass!(…)`, `x, registerClass(…)` | `NESTED_MESSAGE` at the call; not a registration |
| Aliased | `import { registerClass as r } from '…'`, `const r = registerClass;`, `r = registerClass;` | `ALIAS_MESSAGE` at the specifier / declarator / assignment |
| Class expression | `export const X = class {}` (also `class Y {}`, parenthesised, `as` / `satisfies`), or `const X = class {}; export { X }` | MISSING for `X` unless trailing `registerClass('…', X)` |
| Anonymous default expr | `export default (class {})` | anonymous-default violation |
| Leading `\` in diff | `registerClass('\\X\\A', A)`, Upstream `X\A` | matched, no `extra`/`missing` |

</intent-contract>

## Code Map

- `tools/registration/registration.ts` -- `registerCall` (top-level only, ~l.121), `conforming` (~l.135, returns literal FQCN), `exportedClasses` (~l.154, `ClassDeclaration` only), `scanSource` (~l.209), duplicate keying in `scanRegistrations` (~l.320, strips `\` + lowercases). Header comment documents the rules.
- `tools/api-surface/api-surface.ts` -- `parsePackage` (~l.480-520) has its own `registerClass` recogniser keyed on the literal; `contractFqcn` (~l.410). Imports from `../async-surface/async-surface` (`node`, `nodes`, `nameOf`).
- `tools/async-surface/async-surface.ts:83-103` -- `node`, `nodes`, `nameOf` helpers to reuse.
- `conformance/tests/xaravel/registration.test.ts` -- XT-conformance-140/141 matrices via `scan()`/`at()`; l.188 asserts a call inside a function passes (to become `NESTED_MESSAGE`).
- `conformance/tests/xaravel/api-surface-diff.test.ts:229-246` -- registration recognition cases for the diff.
- `docs/ops/registration.md` (Rules, Limits) and `docs/ops/api-surface.md:21` (Registrations) -- docs to update.

## Tasks & Acceptance

**Execution:**
- `tools/registration/registration.ts` -- export `recogniseRegistration(statement)` (top-level `registerClass` call → `{ call, registration: { fqcn (no leading \), literal, name } | null }` or null) and `normaliseFqcn`; add a full-AST walk reporting nested/wrapped calls (`NESTED_MESSAGE`) and aliases (`ALIAS_MESSAGE`); extend `exportedClasses` to class expressions in exported or locally-exported `const`/`let`/`var` declarators and anonymous default class expressions; update the header comment.
- `tools/api-surface/api-surface.ts` -- replace its inline recogniser with `recogniseRegistration`, keying on the normalised FQCN; normalise contract FQCNs the same way; update the header comment.
- `conformance/tests/xaravel/registration.test.ts` -- add the matrix rows; change the in-function assertion to expect `NESTED_MESSAGE`.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- add the leading-`\` case.
- `docs/ops/registration.md`, `docs/ops/api-surface.md` -- describe the new rules; Limits list `export =`, namespace classes, member calls, `registerClass` passed as a value elsewhere, namespace-import member calls.

**Acceptance Criteria:**
- Given the real repository, when `bun run registration:check` runs, then it prints `registration: ok (…)` and exits 0.
- Given any matrix input, when the scan or diff runs, then the output is exactly the Expected column, and every pre-existing XT-conformance-140/141/142 assertion other than the in-function one holds unchanged.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/registration.test.ts conformance/tests/xaravel/api-surface-diff.test.ts` -- expected: all pass
- `bun run registration:check` -- expected: ok, exit 0
- `bun run typecheck` and `bun run lint` -- expected: clean

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 27 findings — high 0, medium 7, low 12, false 4, maybe-false 4
- findings:
  - `[medium]` `[patch]` (verification-gap) No diffComponent case pins that a call the scan rejects (malformed literal, `?.`) does not register in the diff — added `registerClass("X/A", A)` / `registerClass?.(…)` case asserting missing `X\A`, matched 0.
  - `[low]` `[reject]` (intent) "Shape violation" reported with a new `NESTED_MESSAGE` rather than `SHAPE_MESSAGE` — still an AD-10 shape violation; a clearer message is not a defect.
  - `[false]` `[reject]` (intent) D2: diff keys keep case while the duplicate scan lowercases — the diff compares with Upstream names, where a wrongly cased FQCN must show as a mismatch (`fqcn()` returns the literal); PHP-equality is the duplicate rule's concern only.
  - `[medium]` `[patch]` (intent) `(0, registerClass)(…)`, `.call`, `export { registerClass as r }` escape — grouped with the edge-case rows below; patched.
  - `[low]` `[patch]` (intent) Namespace classes cannot be registered at all, but docs only say "not exported classes" — documented in Limits.
  - `[low]` `[reject]` (intent) New tests run through pure functions, not the CLI — the CLI wiring (`findRegistrations` → `scanRegistrations`) is unchanged and covered by existing temp-root CLI tests; the real repo has no registrations yet (retro V1, a named re-check).
  - `[low]` `[reject]` (intent) Extras not named in the intent (`export default (class {})`, contract-token normalisation) — both follow from the intent (class expressions; one normaliser) and are tested.
  - `[medium]` `[patch]` (edge) `registerClass.call/.apply` evade — flagged with `NESTED_MESSAGE`.
  - `[medium]` `[patch]` (edge) Sequence callee `(0, registerClass)(…)` evades — `isRegisterClass` unwraps a sequence's last expression.
  - `[low]` `[patch]` (edge) `new registerClass(…)` evades — `NewExpression` flagged.
  - `[medium]` `[patch]` (edge) `export { registerClass as r }` re-export rename evades — flagged with `ALIAS_MESSAGE`.
  - `[low]` `[patch]` (edge) `.bind`, `registry.registerClass`, conditional/logical aliases not caught — listed in Limits (catching them needs data flow).
  - `[low]` `[reject]` (edge) `const { name } = registerClass` falsely reported as an alias — nobody destructures a function's properties in framework code; a guard adds a branch for no real case.
  - `[low]` `[reject]` (edge) Type-only renaming import falsely flagged — `registerClass` is a value export; a type-only rename of it is not met in practice.
  - `[low]` `[reject]` (edge) Unbounded recursion on deep ASTs — same recursion as existing `contractFqcn`; Bun's stack handles far deeper nesting than real sources.
  - `[medium]` `[patch]` (edge, claim) R1 not fully closed by A1-only flagging — closed for the patched forms; the remaining data-flow forms are documented Limits.
  - `[medium]` `[patch]` (blind) Re-export rename not caught — same root cause as the edge row; patched.
  - `[medium]` `[patch]` (blind) `.call/.apply/.bind/Reflect.apply` — `.call/.apply` patched; `.bind`/`Reflect.apply` documented.
  - `[low]` `[patch]` (blind) `new registerClass` — same as edge row; patched.
  - `[medium]` `[patch]` (blind) `export default (X)` escapes the MISSING rule — Identifier branch now uses the unwrapped expression; tests added.
  - `[maybe-false]` `[defer]` (blind) The future runtime registry module may itself trip the nested/alias rules — would need the registry's source (Epic 7+); `export function registerClass` is not flagged.
  - `[maybe-false]` `[reject]` (blind) Diff drops malformed-literal registrations without a test — duplicate of the verification-gap row; patched there.
  - `[low]` `[patch]` (blind) `Registration.fqcn` holds the literal while `RecognisedRegistration.fqcn` is normalised — renamed to `literal`.
  - `[maybe-false]` `[reject]` (blind) Declarator alias check flags destructuring — duplicate of the edge row; rejected there.
  - `[low]` `[reject]` (blind) Spec matrix does not list every tested form — its fix edits this build's spec.
  - `[low]` `[patch]` (blind) Garbled test comment, stale first Limits bullet, loose `strayUses` docstring — reworded.
  - `[maybe-false]` `[reject]` (intent) Alias probes check only the alias site, not an aliased call producing a duplicate — the alias itself fails CI, so the aliased call cannot merge; no separate outcome to check.

## Auto Run Result

Status: done

**Summary.** The registration scan now walks the whole AST: every `registerClass` call that is not a conforming top-level statement (nested in a block, function, arrow or namespace; wrapped in `void`, parentheses, `?.`, `!`, a sequence, a tagged template; `(0, registerClass)(…)`, `.call`/`.apply`, `new`) fails with `NESTED_MESSAGE`, and aliasing it (renaming import or export specifier, declarator, destructure, assignment) fails with `ALIAS_MESSAGE`. Class expressions bound by exported or locally exported `const`/`let`/`var` are exported classes; a default-exported class expression fails as anonymous; `export default (X)` is unwrapped. One recogniser, `recogniseRegistration` (with `normaliseFqcn`), is shared with `tools/api-surface`, which now keys registrations and contract tokens without the leading `\`.

**Files.**
- `tools/registration/registration.ts` -- shared recogniser, whole-AST walk, class-expression exports.
- `tools/api-surface/api-surface.ts` -- uses the shared recogniser; normalised keys.
- `conformance/tests/xaravel/registration.test.ts` -- nested, wrapped, alias, class-expression rows; one assertion made stricter.
- `conformance/tests/xaravel/api-surface-diff.test.ts` -- leading-`\`, case-kept and rejected-shape cases.
- `docs/ops/registration.md`, `docs/ops/api-surface.md` -- rules and Limits (`export =`, namespace classes, member calls, data-flow aliases).

**Review.** 27 findings: 15 patched (7 medium, 8 low; several share a root cause), 1 deferred (registry module, maybe-false), 11 rejected with reasons in the triage log.

**Follow-up review recommended:** true -- two or more medium entries were patched (patched counts: high 0, medium 7, low 8). The unverified risk: the patched forms (`.call`/`.apply`, sequence callee, export rename, `export default (X)`) are proven only by unit fixtures, never by a second review or by real registrations (retro V1).

**Verification.** `bun test` on both test files: 6 pass, 0 fail (462 expects). `bun run registration:check`: ok (287 files, 0 registrations). `bun run typecheck`, `bun run lint`: clean. `bun run harness --xaravel`: 252/252 pass.

**Residual risks.** No `registerClass` exists under `packages/` yet, so the rules have only run on fixtures. Data-flow aliases (`.bind`, `Reflect.apply`, conditionals, `registry.registerClass`) remain documented limits.
