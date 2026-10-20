---
title: 'Story 6.4: `async-surface.json` generator and drift check'
type: 'feature'
created: '2026-10-19'
baseline_revision: '9e2558d9e11a55bddd2ca291ce5da4b3f5ece0e7'
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

**Problem:** AD-6 makes async-ness a rule, not a per-agent choice: every async public method carries `@asyncRoot <Contract.method>` or `@asyncRoot callback`, and each package commits a generated `async-surface.json` that CI checks for a missing tag or drift. No generator or check exists yet, so nothing enforces the tag or catches two parallel PRs disagreeing about a seam's async-ness.

**Approach:** Add `tools/async-surface/async-surface.ts` (`bun run async-surface <pkg>…`). It emits the package's declarations with the repo's `tsc -b`, walks `src/**/*.d.ts` with `oxc-parser`, and lists every public Promise- or thenable-returning method with its tag's root. `--check` compares with the committed file and prints the diff. CI's `check` job (PR and merge queue) runs `bun run async-surface --all --check`. XT-conformance-134..136 prove it.

## Boundaries & Constraints

**Always:**
- CLI: `bun run async-surface [--check] [--root <dir>] (<pkg>… | --all)`. `<pkg>` is a directory name under `packages/` or `@xaravel/<name>`; `--all` is every `packages/*` with a `package.json`. Unknown package → exit 2 naming it. `--root` defaults to the repo root (for tests).
- Build: one `bun --bun <repo>/node_modules/typescript/bin/tsc -b <root>/packages/<pkg>…` (tsc resolved from the tool's own location, not `--root`); exit non-zero with tsc's output on failure. Declarations are read from `<package tsconfig outDir>/src/**/*.d.ts` (resolve `outDir` relative to the package dir); tests are ignored.
- Public method (all in `.d.ts` order, by `oxc-parser` `parseSync(file, text, { lang: "dts" })`): of a class or interface exported from the file (`export declare class`/`export interface`, or a local one named in `export { X }` / `export { X as Y }`, listed under its exported name): a `MethodDefinition` (`kind` method or get) or `PropertyDefinition` with a `TSFunctionType` annotation that is not `private`/`protected`/`#`; an interface `TSMethodSignature` or `TSPropertySignature` with a `TSFunctionType`; an exported `TSDeclareFunction`; an exported `const` whose annotation is a `TSFunctionType`. Name: `Class.method`, `Class.static method` for statics, or the bare function name.
- Async: the return type (through parentheses, unions, intersections and type-operator wrappers) has a `TSTypeReference` whose last name segment is `Promise`, `PromiseLike` or a thenable short name. Thenables: the `THENABLE_TYPES` export of `@xaravel/contracts/async`, resolved with `Bun.resolveSync` from `<root>` and used when it resolves and exports a non-empty `string[]`; otherwise `THENABLE_TYPES` from `tools/lint-rules/thenables.ts`. Short name = last `\` segment.
- Tag: the nearest `/** … */` comment ending before the member's start with only whitespace between; `@asyncRoot <value>` where value is `callback` or `Name(\Name)*.method`. Overloads of one name form one method: async if any signature is; the tag may sit on any; two different tag values is an error.
- Errors (all reported, then exit 1, nothing written): an async method with no tag, a malformed tag value, conflicting overload tags, or a tag on a non-async method. Each names `packages/<pkg>/src/<path>.ts`, the method name and `(AD-6)`.
- Output `packages/<pkg>/async-surface.json`: a JSON array, one object per line, `{"method":…,"file":"src/<path>.ts","root":…}` with keys in that order, sorted by file then method, each entry serialised with `JSON.stringify` (tool data, not a framework value, so AD-23 does not apply), ending in a newline; `[]\n` when empty.
- `--check`: never writes. Each package whose committed file differs prints `async-surface: packages/<pkg>/async-surface.json is out of date (AD-6); run bun run async-surface <pkg>` and the line diff (`-` committed-only lines, `+` regenerated-only lines); exit 1. A package with no committed file counts as `[]`.
- Dependency: `oxc-parser` pinned exactly `0.155.0` as a root devDependency, in `bun.lock`.
- CI `check` job: `bun run async-surface --all --check` after `bun run typecheck`. `check` runs on `pull_request` and `merge_group` and is a required check.

**Never:**
- No edits to `packages/**` except, per `decisions/ESC-6.4-1.md`, an `@asyncRoot callback` JSDoc tag on `runCounted` (`packages/assert/src/declarations/AssertionCounter.ts`) and `runWithMockery` (`packages/assert/src/declarations/portedTest.ts`) and the generated `packages/assert/async-surface.json`; no edits to `conformance/expectations/**`, `.oxlintrc.json`, other Stories' tools; no `oxlint-disable`; no writes into tracked paths while testing (tests use temp roots).
- No other committed `async-surface.json` files (every other package is empty today; a missing file equals `[]`); Component Epics commit theirs.
- No type-aware resolution of aliases or inherited members (syntactic walk, documented as a limit).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| tagged | `/** @asyncRoot Cache\Store.get */ get(): Promise<T>` on exported `Repository` | `{"method":"Repository.get","file":"src/Repository.ts","root":"Cache\\Store.get"}` | exit 0 |
| thenable | `where(): Builder` tagged `callback` | listed | exit 0 |
| untagged | `put(): Promise<void>` no tag | none written | exit 1, names `Repository.put` |
| sync | `getPrefix(): string` untagged | not listed | exit 0 |
| private/protected | `protected p(): Promise<void>` untagged | not listed | exit 0 |
| stray tag | tag on `getPrefix(): string` | none written | exit 1 |
| overloads | two signatures, one `Promise`, tag on first | one entry | exit 0 |
| contracts list | temp root with `@xaravel/contracts/async` exporting `["X\\Lazy"]` | `Lazy`-returning method listed, `Builder` not | exit 0 |
| drift | committed file missing an entry | diff printed with `+` line | exit 1 |
| no package | `bun run async-surface nope` | names `nope` | exit 2 |

</intent-contract>

## Code Map

- `packages/<pkg>/tsconfig.json` -- composite, `emitDeclarationOnly`, `outDir: ../../.cache/tsc/<pkg>`, includes `src` and `tests`; `bun run typecheck` (`tsc -b`) emits `.cache/tsc/<pkg>/src/**/*.d.ts` (runtime: `index.d.ts`, `export {}`). tsc 7 keeps JSDoc and emits `#private;`, `private x;` (no type), arrow fields as `run: () => Promise<void>` (probed).
- `oxc-parser@0.155.0` (not installed yet; probed in /tmp): `parseSync(name, text, {lang:"dts"})` → `{program, comments[{type:"Block", value, start, end}], errors}`; nodes carry `start`/`end`. Shapes: `ExportNamedDeclaration{declaration|specifiers[{local, exported}]}`, `ClassDeclaration.body.body[]` of `MethodDefinition{key, kind, static, accessibility, value: TSEmptyBodyFunctionExpression{returnType}}` / `PropertyDefinition{key: PrivateIdentifier|Identifier, accessibility, typeAnnotation}`, `TSInterfaceDeclaration.body.body[]` of `TSMethodSignature{returnType}` / `TSPropertySignature{typeAnnotation: TSFunctionType{returnType}}`, `TSDeclareFunction{id, returnType}`, `VariableDeclaration.declarations[].id.typeAnnotation`, `TSTypeReference{typeName: Identifier|TSQualifiedName}`.
- `tools/lint-rules/thenables.ts` -- `THENABLE_TYPES` (FQCNs), `THENABLE_NAMES`; comment already says 6.4 uses it as its fixture list. Reuse, do not copy.
- `packages/contracts/package.json` -- `exports` has only `.`; Story 10.5 adds `./async` exporting `THENABLE_TYPES: readonly string[]` (FQCNs) — record this contract in the docs.
- `.github/workflows/ci.yml` -- header comment lines 1-50; `check` job ~105-138 (`bun run typecheck` at ~128). Triggers include `merge_group`.
- `package.json` -- `scripts`; add `"async-surface": "bun --no-env-file tools/async-surface/async-surface.ts"`; devDependencies pinned exactly.
- `tsconfig.json` -- `include` list of tools; add `tools/async-surface/*.ts` (not the fixtures).
- `.oxlintrc.json` ignorePatterns covers only `tools/lint-rules/fixtures/**`; fixtures here are `.ts` package sources, lint-clean by construction (no unions with Promise, no default exports).
- `conformance/tests/xaravel/lint-signatures.test.ts` -- pattern for XT files: header comment, `xaravelTest` from `packages/assert/src/index`, `expect` from `bun:test`, temp dirs cleaned in `afterAll`.
- `docs/ops/lint.md`, `docs/ops/ci.md` -- add an `async-surface` section/page; `stories/6.4.md` -- set `status: done` at the end.

## Tasks & Acceptance

**Execution:**
- `package.json`, `bun.lock` -- `bun add -d --exact oxc-parser@0.155.0`; add the script.
- `tools/async-surface/async-surface.ts` -- exported `surfaceOf(files, thenableNames)` (pure: `.d.ts` texts → entries and errors), `thenableTypes(root)`, `render(entries)`, `diff(committed, regenerated)`, and the CLI.
- `tools/async-surface/fixtures/` -- a fixture package (`package.json`, standalone `tsconfig.json` with `composite`/`emitDeclarationOnly`/`outDir`, `src/*.ts`): a passing source covering every listed and unlisted matrix shape, and one failing source per error kind.
- `tsconfig.json` -- include the tool.
- `.github/workflows/ci.yml` -- the step and a header sentence.
- `conformance/tests/xaravel/async-surface.test.ts` -- XT-conformance-134 (generate over the copied fixture package in a temp root through the real CLI and tsc; exact file text; contracts list preferred when a temp `node_modules/@xaravel/contracts` with `./async` exists, fallback otherwise), XT-conformance-135 (each failing source exits 1 naming its method, writes nothing), XT-conformance-136 (`--check` on a drifted committed file exits 1 printing the diff, on a matching or absent-and-empty one exits 0; `ci.yml`'s `check` job runs `bun run async-surface --all --check` with no `if:` and the workflow triggers on `merge_group`), plus the matrix edge cases through `surfaceOf`.
- `docs/ops/async-surface.md` (new), `docs/ops/ci.md`, `docs/ops/lint.md` -- usage, format, rules, limits, the Story 10.5 contract.

**Acceptance Criteria:**
- Given a package's emitted `.d.ts` and its `@asyncRoot` tags, when `bun run async-surface <pkg>` runs, then it writes `async-surface.json` with one line per Promise- or thenable-returning public method and its tag's root, using the contracts thenable list when installed and the tool's list otherwise (XT-conformance-134).
- Given a Promise-returning public method with no `@asyncRoot` tag, when the tool runs, then it exits 1 naming the method (XT-conformance-135).
- Given a committed `async-surface.json` that differs from the regenerated one, when the merge queue's `check` job runs `--all --check`, then it fails printing the diff (XT-conformance-136).
- Given the real repository, when `bun run async-surface --all --check` runs, then it exits 0.

## Spec Change Log

### 2026-10-19 — ESC-6.4-1 ruling
- Trigger: verification found `bun run async-surface --all --check` exits 1 on the real repository: two exported, untagged, Promise-returning grader helpers (`runCounted` at `packages/assert/src/declarations/AssertionCounter.ts:107`, `runWithMockery` at `packages/assert/src/declarations/portedTest.ts:197`). The planning probe checked only `packages/runtime`'s emitted `index.d.ts`, so the Code Map's "every package is empty" claim was wrong. ESC-6.4-1 was raised.
- Amended: the two Never bullets (intent contract, per the approved orchestrator ruling `decisions/ESC-6.4-1.md`, option 1): the two tags and `packages/assert/async-surface.json` are allowed.
- KEEP: the tool, fixtures, XT-134..136, the CI step, the docs and the two extended pins (XT-1 devDependencies, XT-33 `check` steps), as implemented.

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 29 findings — high 0, medium 11, low 15, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) stale `.d.ts` of a deleted/renamed source stays in the incremental outDir and is listed — only `.d.ts` files whose `src/<path>.ts` exists are read; test added.
  - `[medium]` `[patch]` (blind) inferred cross-module returns emit as `import("./X").X` (`TSImportType`), not recognised — handled by the qualifier's last segment; edge case added.
  - `[low]` `[patch]` (blind) every `TSTypeOperator` unwrapped (`keyof Promise<T>` counts) — only `readonly` is unwrapped; conditional/`Awaited`/indexed/call-signature shapes documented as limits.
  - `[low]` `[reject]` (blind) default exports, namespaces, exported `let`/`var` skipped — default exports are forbidden by `xaravel/no-package-default-export`; the others are unlikely shapes for a public method; documented as limits.
  - `[medium]` `[patch]` (blind) `--all` write mode writes `[]` into every package, contradicting "no file needed" — an empty surface with no existing file writes nothing.
  - `[low]` `[patch]` (blind) "`--check` never writes" is inaccurate (`tsc -b` writes `.cache`) — docs and header say it never writes `async-surface.json`.
  - `[low]` `[reject]` (blind) tag value stops at `@` (`{@link}`), prose mentions parse as tags — both fail loudly as malformed, never silently; unlikely spelling.
  - `[low]` `[reject]` (blind) `removeComments` in a package tsconfig would strip every tag — no package sets it (`tsconfig.base.json`, scaffolded tsconfigs) and the failure is loud (every async method reported).
  - `[false]` `[reject]` (blind) the contracts list replaces the fallback without a superset check — the AC says the list "comes from `@xaravel/contracts/async` when installed"; Story 10.5 owns its contents.
  - `[low]` `[reject]` (blind) `tagsBefore` is O(members × comments) — milliseconds on today's tree; optimise when a large package shows up.
  - `[false]` `[reject]` (blind) `epic-6-context.md` edits are unrelated scope — it is the build workflow's regenerated epic cache under `_bmad-output/implementation-artifacts/`, which every Story may edit; it is not a planning document.
  - `[low]` `[reject]` (blind) ESC-6.4-1 cites XT-134, not XT-136 — the escalation is about which methods count as the public surface (XT-134's AC); re-binding would change the ruled text for no gain.
  - `[medium]` `[patch]` (blind) no Xaravel Test runs the tool over the real repository — XT-136 now runs `--all --check` on the real root and expects exit 0.
  - `[medium]` `[patch]` (verification-gap) abstract members untested — edge case for an abstract class (untagged abstract method and getter reported, protected ignored, tagged listed) added.
  - `[medium]` `[patch]` (verification-gap, other) `(() => Promise<void>) | null` fields are never listed — function members of a union are used; edge case added.
  - `[medium]` `[patch]` (edge) stale `.d.ts` — same as the blind row.
  - `[medium]` `[patch]` (edge) `TSImportType` returns missed — same as the blind row.
  - `[low]` `[reject]` (edge) default-exported classes skipped — forbidden by `xaravel/no-package-default-export`; documented.
  - `[low]` `[reject]` (edge) interface call signatures and symbol-keyed methods skipped — rare shapes; documented as limits.
  - `[low]` `[reject]` (edge) object-type-literal consts (`export declare const api: { get(): Promise<void> }`) skipped — facades are classes (AD-10); documented as a limit.
  - `[medium]` `[patch]` (edge) nullable function-typed fields — same as the verification-gap row.
  - `[medium]` `[patch]` (edge) oxc-parser `errors` ignored, partial AST passes — a parse error is reported naming the file.
  - `[low]` `[patch]` (edge) a missing `<outDir>/src` gives an empty surface and a silent pass — fails naming the package and directory.
  - `[low]` `[reject]` (edge) `outDir` only in an `extends` base or JSONC tsconfig — every package tsconfig is scaffolded with `outDir` and plain JSON (`scaffold:check`); the failure is loud.
  - `[low]` `[reject]` (edge) `.mts`/`.cts`/`.tsx` sources — AD-3 files are `src/<path>/<ClassName>.ts`; none exist.
  - `[low]` `[reject]` (edge) tags on skipped members (private, non-exported, class) are not reported as stray — adds branches for an unlikely mistake; a misplaced tag lists nothing and the method it was meant for still fails.
  - `[low]` `[reject]` (edge) `--root --all` takes `--all` as a directory — the error is loud (no packages under it); unlikely invocation.
  - `[medium]` `[patch]` (edge, claim) the docs read as a complete backstop — § Limits now lists every shape the walk does not see.
  - `[false]` `[reject]` (intent) the readings diverge on surface: per-file "public" (ESC-6.4-1), a synthetic fixture package, a simulated contracts module, the queue checked by workflow text, a missing file equal to `[]` — descriptive; the per-file reading is the ruled one, Story 10.5 supplies the real contracts module, the queue path is reported as verified by text only (Design Notes), and XT-136 now runs the real repository.

## Design Notes

The drift check runs in the `check` job, which runs on every PR as well as in the merge queue. AD-28 asks for it in the queue; running it on PRs too is cheap (tsc is incremental, the walk is ms) and catches drift before queueing. The queue run is what catches two PRs that are each green but conflict; that path is verified only by the workflow text until a real queued merge, so report it that way.

A missing committed file counts as `[]` so 51 empty scaffolded packages need no file; a package that gains an async method without committing one still fails, with every line shown as `+`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/async-surface.test.ts` -- expected: all pass
- `bun run async-surface --all --check` -- expected: exit 0
- `bun run lint`, `bun run typecheck`, `bun run test`, `bun run harness --xaravel` -- expected: exit 0, no new failures
- `bun audit --audit-level=high`, `bun install --frozen-lockfile --ignore-scripts` -- expected: exit 0
- `bun run ownership:check`, `bun run escalations:check`, `bun run workflows:check`, `bun run story:check 6.4` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** `bun run async-surface [--check] [--root <dir>] (<pkg>… | --all)` (`tools/async-surface/async-surface.ts`) builds each package's declarations with the repo's `tsc -b`, walks `<outDir>/src/**/*.d.ts` with `oxc-parser` 0.155.0, and lists every exported Promise- or thenable-returning public method with the root from its `@asyncRoot` tag. It writes `packages/<pkg>/async-surface.json` (one entry per line, sorted). Thenables come from `@xaravel/contracts/async`'s `THENABLE_TYPES` when that resolves, and from `tools/lint-rules/thenables.ts` otherwise. Four kinds of mistake fail the run, naming the file, the method and AD-6: an untagged async method, a malformed tag, conflicting overload tags, and a stray tag on a sync method. A file that does not parse also fails. `--check` prints the line diff against the committed file; a missing file counts as `[]`. CI's required `check` job runs `--all --check` after the typecheck, on PRs and in the merge queue.

ESC-6.4-1: two exported grader helpers in `@xaravel/assert` (`runCounted`, `runWithMockery`) were untagged async functions. The orchestrator approved option 1 (`decisions/ESC-6.4-1.md`): both are tagged `@asyncRoot callback`, and `packages/assert/async-surface.json` is committed.

**Files changed.**
- `tools/async-surface/async-surface.ts` (new): the tool. `tools/async-surface/fixtures/` (new): the demo package, the contracts stand-in, and the failing sources.
- `conformance/tests/xaravel/async-surface.test.ts` (new): XT-conformance-134, 135 and 136, plus the matrix edge cases.
- `package.json`, `bun.lock`: `oxc-parser` 0.155.0 (exact) and the script. `tsconfig.json`: includes the tool.
- `.github/workflows/ci.yml`: the step and a header sentence.
- `conformance/tests/xaravel/root-baseline.test.ts` (XT-1) and `repository-policy.test.ts` (XT-33): exact-list pins extended with the new dependency and step. Nothing was removed.
- `packages/assert/src/declarations/AssertionCounter.ts` and `portedTest.ts`: one JSDoc tag each. `packages/assert/async-surface.json` (new).
- `conformance/escalations/ESC-6.4-1.md` and `decisions/ESC-6.4-1.md` (new).
- `docs/ops/async-surface.md` (new); `docs/ops/ci.md` and `docs/ops/lint.md` updated.
- `epic-6-context.md`: regenerated by the build workflow. `stories/6.4.md`: set to `status: done`.

**Review.** 29 findings: 11 medium, 15 low, 3 false.
- Patched, all 11 medium: stale `.d.ts` files, `import()` return types, nullable callback fields, parse errors, the write mode creating `[]` files everywhere, the abstract-member test, the real-repository run in XT-136, and the § Limits section (listed under 8 entries, some with sibling rows).
- Patched low: only `readonly` type operators are unwrapped, the `--check` wording, and a missing output directory now fails.
- Rejected low, each with its reason in the Triage Log: default exports (lint forbids them), call signatures, symbol keys, type-literal consts, namespaces, `let`, tag-parsing spellings, `removeComments`, the quadratic comment scan, JSONC/`extends` tsconfigs, `.mts`/`.tsx`, stray tags on skipped members, `--root --all`, and the ESC's test id.
- Rejected false: the contracts list replacing the fallback (the AC requires it), the epic-context cache (not a planning document), and the intent audit's descriptive divergences.
- Nothing was deferred.

**Follow-up review recommended: true.** Eleven medium entries were patched in one pass. The unverified risk: the syntactic walk has run only on fixtures and on `@xaravel/assert`. No framework package has async methods yet, so the first Component Epic (Epic 9 runtime) is the first real test of its coverage. The merge-queue path is verified by the workflow text and by this PR's `check` job, not by a queued pair of conflicting PRs.

**Verification.**
- `bun test conformance/tests/xaravel/async-surface.test.ts`: 3 pass.
- `bun run test`: 245 pass, 0 fail. `bun run harness --xaravel`: 245 passed, differ=0.
- These all exit 0: `bun run typecheck`, `bun run lint`, `bun run async-surface --all --check` (51 packages), `bun audit --audit-level=high`, `bun install --frozen-lockfile --ignore-scripts`, `ownership:check`, `escalations:check`, `workflows:check`, `scaffold:check`, `graph:check`.
- `bun run story:check 6.4`: manifest, xaravel-tests, fixtures and escalations pass. approvals and full-run need `GH_TOKEN` and a PR, and run in CI.

**Residual risks.**
- The walk is syntactic. Aliases, inherited members, and the shapes in § Limits are not seen, and thenables are matched by short name.
- Story 10.5 must export `THENABLE_TYPES: readonly string[]` (FQCNs) from `@xaravel/contracts/async`. This contract is recorded only in `docs/ops/async-surface.md`.
- ESC-6.4-1 was ruled by the orchestrator, and the Maintainer may overrule it.
