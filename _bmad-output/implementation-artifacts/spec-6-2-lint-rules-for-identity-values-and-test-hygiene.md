---
title: 'Story 6.2: Lint rules for identity, values and test hygiene'
type: 'feature'
created: '2026-10-19'
baseline_revision: '0ceda3ade8bbd5b43644f38a8aa692bc474469ce'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false  # follow-up review: _bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md (P5)
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/AGENTS.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** The spine names six identity, value and test-hygiene conventions as lint errors (AD-1, AD-3, AD-7, AD-10, AD-15, AD-23), but stock oxlint has none of them, so Components built in parallel can drift on them unnoticed.

**Approach:** Add an oxlint JS plugin `tools/lint-rules/plugin.ts` (plugin name `xaravel`) with one rule per convention, enable all six as errors in the root `.oxlintrc.json`, and append their names to `SPINE_RULES` so Story 6.1's disable/config check also protects them. Prove the AC with XT-conformance-132 over committed fail/pass fixtures linted by the real oxlint with the real config.

## Boundaries & Constraints

**Always:**
- Rules (all `"error"`, keyed `xaravel/<name>` in the top-level `rules`):
  - `no-identity-constructor-name` -- any read of `<expr>.constructor.name` (dot, optional or computed string-literal access, and `const { name } = <expr>.constructor`), in every linted file outside the grader's locations (`packages/assert/`, `packages/mockery/`, `conformance/`, `tools/`), which cannot use `fqcn()` (AD-15 grader isolation; ruling `decisions/ESC-6.2-1.md`). A bare identifier called `constructor` is not matched.
  - `no-framework-json-stringify` -- any reference to `JSON.stringify` (call or alias, `JSON.stringify` / `JSON["stringify"]` / `globalThis.JSON.stringify`) in a file under `packages/<p>/src/` where `<p>` is not a grader package (`assert`, `mockery`; spine Dependency-direction table).
  - `no-ported-bun-expect` -- in a file under a `tests/ported/` directory: a value import or re-export of `expect` (any alias) from `bun:test`, a namespace import of `bun:test`, or `import("bun:test")` / `require("bun:test")`. Type-only imports are not matched.
  - `no-type-import-injection` -- an identifier bound by a type-only import (`import type {X}` or `import {type X}`, from any module) that is referenced in value position inside the arguments of an `inject(...)` call or `@inject(...)` decorator (callee `inject` or `<obj>.inject`). Type positions (type arguments, annotations) are not references.
  - `no-model-private` -- any `#private` name (field, method, accessor, `#x in o`) in `packages/database/src/Eloquent/Model.ts` or under `packages/database/src/Eloquent/Concerns/`.
  - `no-package-default-export` -- `export default`, `export { x as default }` or `export { default } from` in a file under `packages/<p>/src/` or `installer/src/`. Skeleton app convention files are therefore exempt.
- Path tests use the file's path relative to `process.cwd()` when inside it, else its absolute path, matched by segment (`(^|/)packages/[^/]+/src/`), so the rules work on the real tree and on test temp roots.
- Each report message names the AD it enforces, e.g. `` `constructor.name` used for identity; use fqcn() (AD-10) ``.
- `SPINE_RULES` in `tools/lint-rules/disables.ts` gains the six names, so a disable directive for them, or a config dropping them below `error`, fails `bun run lint:disables`.
- Fixtures live in `tools/lint-rules/fixtures/identity-values/` (already ignored by `tools/lint-rules/fixtures/**`): one failing fixture per rule and passing fixtures that exercise the near-misses (named exports, `jsonEncode`-style call, `fqcn(x)`, `import { expect }` outside `tests/ported`, a value-imported token in `inject`, a `MODEL_STATE` symbol slot, `constructor` identifier). Tests copy them into temp roots at the placement each rule needs and run `bun --bun oxlint --type-aware -c <repo>/.oxlintrc.json --format unix` from the repo root.

**Never:**
- No async-signature, frame-state or declaration rules (Story 6.3), no `async-surface.json` (6.4).
- No `oxlint-disable` comments and no ignore patterns that hide real `packages/`, `installer/` or `skeleton/` files.
- Never write into tracked paths while testing; temp roots only.
- Change Story 6.1's tests only where they pin `SPINE_RULES` or build configs that must now carry the six rules; never remove an assertion.
- No JSONC comments in `.oxlintrc.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| identity | `this.constructor.name` in `packages/demo/src/` | `xaravel(no-identity-constructor-name)` | exit 1 |
| identity grader | same in `packages/mockery/tests/` or `conformance/` | clean | exit 0 |
| stringify | `JSON.stringify(v)` in `packages/demo/src/` | `xaravel(no-framework-json-stringify)` | exit 1 |
| stringify grader | same in `packages/assert/src/` or `packages/demo/tests/` | clean | exit 0 |
| ported expect | `import { expect as e } from "bun:test"` in `packages/demo/tests/ported/` | `xaravel(no-ported-bun-expect)` | exit 1 |
| expect elsewhere | same in `packages/demo/tests/xaravel/` | clean | exit 0 |
| type import | `import type { Mailer }` then `@inject({ mailer: Mailer })` | `xaravel(no-type-import-injection)` | exit 1 |
| private | `#state` in `packages/database/src/Eloquent/Concerns/HasAttributes.ts` | `xaravel(no-model-private)` | exit 1 |
| default | `export default class X {}` in `packages/demo/src/` | `xaravel(no-package-default-export)` | exit 1 |
| default app | same in `skeleton/config/app.ts` | clean | exit 0 |
| disable | `// oxlint-disable-next-line xaravel/no-model-private` | `lint:disables` violation | exit 1 |

</intent-contract>

## Code Map

- `.oxlintrc.json` -- root config (Protected). Add `"jsPlugins": ["./tools/lint-rules/plugin.ts"]` and the six `xaravel/*` rules. Probe: a TS plugin loads under `bun --bun oxlint --type-aware` and reports `[Error/xaravel(<rule>)]` in `--format unix`.
- `tools/lint-rules/disables.ts:48` -- `SPINE_RULES`; append the six names. `ruleName()` keys by last `/` segment, so the names must not collide with oxlint built-ins (hence `no-package-default-export`, not `no-default-export`).
- `conformance/tests/xaravel/lint.test.ts` -- Story 6.1's tests: `oxlint()` helper (line ~66) to reuse; line 170 pins `SPINE_RULES` to three names (update to nine); temp configs built with only the async rules must now include the six (derive from the real config instead).
- `tsconfig.json` -- already includes `tools/lint-rules/**/*.ts`; the plugin and fixtures must typecheck under `--strict` (declare a local minimal `Node` type; oxlint ships no plugin-authoring types in `oxlint` 1.88.0's `index.d.ts`).
- Current tree is clean for all six rules: the only `constructor.name` hits are identifiers named `constructor` in `packages/assert/tests/xaravel/*`; `JSON.stringify` in `packages/*/src` is only in `assert`/`mockery`; no default exports, no `tests/ported` `bun:test` imports, no `packages/database/src/Eloquent/`.
- `conformance/tests/xaravel/devcontainer.test.ts` -- style reference for a Xaravel Test file.
- `docs/ops/lint.md` -- Story 6.1's lint doc; add the six rules, their scopes and exemptions.
- `stories/6.2.md` -- manifest; set `status: done` at the end.

## Tasks & Acceptance

**Execution:**
- `tools/lint-rules/plugin.ts` -- the `xaravel` plugin, six rules, exported rule-name list.
- `.oxlintrc.json` -- `jsPlugins` and the six rules.
- `tools/lint-rules/disables.ts` -- append to `SPINE_RULES`; header note.
- `tools/lint-rules/fixtures/identity-values/` -- failing fixture per rule, passing fixtures.
- `conformance/tests/xaravel/lint-rules.test.ts` -- XT-conformance-132 and the matrix edge cases.
- `conformance/tests/xaravel/lint.test.ts` -- update the `SPINE_RULES` pin and any temp config that must carry the full rule set.
- `docs/ops/lint.md` -- document the rules.

**Acceptance Criteria:**
- Given the committed fixtures for each rule placed at their scoped paths, when `bun --bun oxlint --type-aware -c .oxlintrc.json --format unix` runs from the repo root, then each failing fixture fails naming exactly its rule (`xaravel(<rule>)`) and each passing fixture passes; and the root config holds all six rules as errors with the plugin loaded (XT-conformance-132).
- Given the real repository, when `bun run lint` runs, then it exits 0, and `bun run lint:disables` rejects a disable of any of the six rules.

## Spec Change Log

### 2026-10-19 — ESC-6.2-1 ruling
- Trigger: verification found two pre-existing `.constructor.name` display reads in grader test helpers (`packages/mockery/tests/xaravel/cells.ts:32`, `packages/assert/tests/xaravel/fixtures/mock.fixture.ts:41`), so `bun run lint` exited 1; the implementer raised ESC-6.2-1.
- Amended: the `no-identity-constructor-name` scope (intent contract, per the approved orchestrator ruling `decisions/ESC-6.2-1.md`, option 2) and a matrix row for the grader exemption; the Code Map claim that the tree was clean was wrong.
- Avoids: rewriting grader lines to read the constructor name by a route the rule misses.
- KEEP: the plugin, its other five rules, fixtures, XT-conformance-132 structure, the `SPINE_RULES` and lint.test.ts updates, docs.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 28 findings — high 0, medium 8, low 13, false 3, maybe-false 0 (plus 4 intent-alignment observations logged as one row)
- findings:
  - `[low]` `[patch]` (blind) identity rule misses nested `const { constructor: { name } } = v` and aliases (`const C = v.constructor; C.name`) — alias tracking needs dataflow and is rejected; the related `(v?.constructor).name` and assignment forms were patched under the edge rows below.
  - `[medium]` `[patch]` (blind) `const { stringify } = JSON` bypasses no-framework-json-stringify despite "call or alias" — fixed: ObjectPattern binding `stringify` from `JSON`/`globalThis.JSON` reported (declarator and assignment); edge cases added.
  - `[low]` `[reject]` (blind) path scope depends on `process.cwd()`; running oxlint from a subdirectory turns path-scoped rules off — CI and `bun run lint` run from the root; root discovery adds branches for an editor-only case.
  - `[low]` `[patch]` (blind) type-only import placed after its `inject(...)` use is not reported — fixed: type-only imports collected from `Program.body` before traversal; edge case added.
  - `[low]` `[reject]` (blind) shadowing a type-import name inside `inject(...)` gives a false positive — needs a nested binding with the module-scope import's name; unlikely, and scope analysis adds complexity.
  - `[medium]` `[patch]` (blind) documented spellings untested (`export * from "bun:test"`, `export * as default`, assignment destructure, template keys, `@obj.inject`) — fixed: edge cases added for each.
  - `[low]` `[reject]` (blind) no-model-private misses Model subclasses (Pivot, app models) — AD-7 bans `#private` in "Model and its concerns"; the spec's path reading follows that wording.
  - `[low]` `[reject]` (blind) Skeleton/generated-app lint config cannot load the plugin — the Skeleton's lint config is not part of Story 6.2's AC (fixtures for each rule under `tools/lint-rules`).
  - `[false]` `[reject]` (blind) spec status `in-review` vs manifest `done`, stale Code Map line — status is mid-run by design; the Code Map line is corrected by the Spec Change Log entry, and a fix would edit this spec.
  - `[medium]` `[patch]` (blind) lint:disables does not check that `jsPlugins` still loads the plugin — fixed: the root config must list `./tools/lint-rules/plugin.ts` (string or `{specifier}`); disable cases added.
  - `[low]` `[reject]` (blind) `expect` re-exported by a helper outside `tests/ported` escapes, and `TypeOnly` approves importing `test` — the spine bans importing `expect` under `tests/ported`; following re-exports across files needs module resolution.
  - `[medium]` `[patch]` (blind) edge cases compare counts, not rule names — fixed: each case asserts its exact `xaravel(<rule>)` list; built-in hits pinned separately.
  - `[medium]` `[patch]` (edge) GRADER_LOCATIONS matches nested `tools/`/`conformance/` dirs in framework code — fixed: anchored at the root-relative start; absolute paths judged by their first root-level marker; path cases added.
  - `[low]` `[reject]` (edge) symlinked checkout makes cwd differ from realpath — fails only off the CI path; same reasoning as the cwd row.
  - `[low]` `[patch]` (edge) `(v?.constructor).name` / `(globalThis?.JSON).stringify` missed — fixed: `unwrap()` skips `ChainExpression`.
  - `[low]` `[reject]` (edge) nested/parameter destructure of `constructor` — unlikely spelling; adds recursive pattern branches.
  - `[medium]` `[patch]` (edge) destructured `stringify` alias — same root cause and fix as the blind row.
  - `[low]` `[patch]` (edge) `import.meta.require("bun:test")` — fixed: a member callee named `require` is matched.
  - `[low]` `[reject]` (edge) shadowing false positive — duplicate of the blind row.
  - `[low]` `[patch]` (edge) type import after use — same fix as the blind row.
  - `[low]` `[reject]` (edge) `#private` in Pivot / Relations concerns — same reasoning as the blind Model-subclass row.
  - `[false]` `[reject]` (edge) `export = Foo` passes the default-export rule — TS rejects `export =` in ES modules (TS1203), so tsc already fails it.
  - `[medium]` `[patch]` (edge) a config with `other/no-model-private` or a repointed `jsPlugins` passes lint:disables — the `jsPlugins` part is fixed as in the blind row; the rule-key collision needs a contrived plugin prefix in the Protected root config and is rejected.
  - `[medium]` `[patch]` (edge, claim) the grader exemption claim covers nested dirs — same fix as the anchoring row.
  - `[medium]` `[patch]` (edge, claim) "any reference (call or alias)" claim — same fix as the stringify row.
  - `[medium]` `[patch]` (verification-gap) `export * from "bun:test"` untested — edge cases added.
  - `[medium]` `[patch]` (verification-gap) `export * as default from` untested — edge case added.
  - `[medium]` `[patch]` (verification-gap) assignment destructure untested — edge case added.
  - `[false]` `[reject]` (intent) the readings diverge on surface (oxlint with the root config vs a standalone `tools/lint-rules` command), on scope narrowing (grader exemptions per ESC-6.2-1 and the spine table) and on the AD-6-style unasserted `bun run lint` — descriptive; the oxlint-plugin surface is how `bun run lint` runs the rules, and the narrowing is recorded in the ruling and Design Notes.

## Design Notes

The plugin needs no type information, so it runs in oxlint's JS plugin host alongside the type-aware rules. "On a framework value" (AD-23) cannot be decided without types; the rule bans every `JSON.stringify` reference in framework `src/`, since `jsonEncode` covers any legitimate need. If Story 9.8's codec needs `JSON.stringify` internally, that Story raises an Escalation.

"A contract imported with `import type` for injection" (AD-1): tsc already reports TS1361 for a type-only name in an `inject` map; the rule reports the same misuse under a lint rule name, for any module, because app contracts made with `contract<T>()` live outside `@xaravel/contracts`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/lint-rules.test.ts conformance/tests/xaravel/lint.test.ts` -- expected: all pass
- `bun run lint` -- expected: exit 0
- `bun run typecheck` -- expected: exit 0
- `bun run test` and `bun run harness --xaravel` -- expected: no new failures
- `bun run ownership:check`, `bun run escalations:check` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** `tools/lint-rules/plugin.ts` is an oxlint JS plugin, `xaravel`, with six rules: `no-identity-constructor-name` (AD-10), `no-framework-json-stringify` (AD-23), `no-ported-bun-expect` (AD-15), `no-type-import-injection` (AD-1), `no-model-private` (AD-7) and `no-package-default-export` (AD-3). The root `.oxlintrc.json` loads the plugin and sets each rule to `error`, so `bun run lint` (CI's `check` job) enforces them. The six names are spine rules in `SPINE_RULES`, so `lint:disables` rejects a disable directive, a weakened config, or a root config that stops loading the plugin. XT-conformance-132 proves the AC with committed fixtures, placed at each rule's scoped paths and linted by the real oxlint with the real config. ESC-6.2-1 (orchestrator ruling, option 2) exempts the grader's locations from the identity rule, because the grader cannot call `fqcn()` (AD-15).

**Files changed.**
- `tools/lint-rules/plugin.ts` (new): the plugin and its path-scope helpers.
- `.oxlintrc.json`: `jsPlugins` plus the six rules.
- `tools/lint-rules/disables.ts`: `SPINE_RULES` gains six names, and the root config must load the plugin.
- `tools/lint-rules/fixtures/identity-values/` (new): six failing fixtures, three passing fixtures and `support.ts`.
- `conformance/tests/xaravel/lint-rules.test.ts` (new): XT-conformance-132 with its edge, path and disable cases.
- `conformance/tests/xaravel/lint.test.ts`: the `SPINE_RULES` pin now lists nine names, and the XT-129 weak config loads the plugin. No assertion removed.
- `docs/ops/lint.md`: the rules, scopes, exemptions and fixtures.
- `conformance/escalations/ESC-6.2-1.md` and `decisions/ESC-6.2-1.md`: the grader exemption and its ruling.
- `stories/6.2.md`: `status: done`.

**Review.**
- 28 findings (+1 intent row): 8 medium, 13 low, 3 false.
- Patched (medium): the anchored grader exemption, the destructured `stringify` alias, the `jsPlugins` check, and exact-rule edge cases for every documented spelling.
- Patched (low): `ChainExpression`, member `require`, and type imports placed after their use.
- Deferred: none.
- Rejected: the rest, each with its reason in the Review Triage Log.

**Follow-up review recommended: true.** Four medium entries were patched. The unverified risk is path scoping: it depends on oxlint's cwd. Relative paths are trusted, and absolute paths are judged by their first root-level marker. Only the repo-root run (CI, `bun run lint`) and the temp-root tests exercise it.

**Verification.**
- `bun run lint`: exit 0 (`lint disables: ok (364 files)`).
- `bun run typecheck`: exit 0.
- `bun run test`: 241 pass, 0 fail.
- `bun run harness --xaravel`: 241 passed, differ=0.
- `ownership:check` and `escalations:check`: exit 0.

**Residual risks.**
- oxlint JS plugins are alpha and not under semver; this relies on the pin to 1.88.0.
- `no-type-import-injection` overlaps tsc's TS1361 and does no scope analysis.
- `no-model-private` covers `Model.ts` and `Concerns/` only (the AD-7 wording), not Model subclasses.
- ESC-6.2-1 was ruled by the orchestrator; the Maintainer may overrule it.

