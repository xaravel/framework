---
title: 'Story 6.6: Duplicate-FQCN and registration scan'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'ce25ded0c0fee4cf58872c2f9ef13029364fcdcd'
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

**Problem:** AD-10 says every framework class file ends with `registerClass('<Upstream FQCN>', X)` and no package sets `"sideEffects": false`, and AD-22 says each foreign FQCN has one owning package "enforced by a CI duplicate-FQCN scan". Nothing checks any of this. ESC-6.1-1 (approved) also requires `no-misused-promises` to pin `checksConditionals: true`, which the config and `lint:disables` do not do yet.

**Approach:** Add a static scan, `tools/registration/registration.ts` (`bun run registration:check`), that reads every `packages/*/src/**/*.ts` with `oxc-parser` and every `packages/*/package.json`. Wire it into CI's `check` job. Pin `checksConditionals: true` in `.oxlintrc.json` and in `SPINE_RULE_OPTIONS`, and add a fixture with a Promise used as a condition.

## Boundaries & Constraints

**Always:**
- CLI: `bun --no-env-file tools/registration/registration.ts [--root <dir>]`. Exit 0 prints `registration: ok (<f> files, <r> registrations)`. Exit 1 prints one stderr line per violation, `<path>:<line>:<col>: <message> (AD-10)` (`AD-22` for duplicates), sorted by path, then line, then col. Exit 2 is a usage error. A parse error is a violation at that file (exit 1), not a crash.
- Files: `git ls-files -co --exclude-standard` under the root (reuse `gitFiles` from `tools/lint-rules/disables.ts`). Take `packages/<p>/src/**/*.{ts,tsx,mts,cts}`, excluding `.d.ts`, and `packages/<p>/package.json`. Paths are root-relative with `/`.
- Registration: a top-level `ExpressionStatement` whose expression is a `CallExpression` with callee Identifier `registerClass`. A conforming call has exactly two arguments, a string `Literal` (non-empty) and an `Identifier`. A top-level `registerClass` call with any other shape is a violation: ``registerClass must be called as registerClass('<FQCN>', X) with a string literal FQCN``.
- Duplicates (every package, graders included): an FQCN registered at more than one site (file:line) fails. Report one violation at each site after the first: `<fqcn> is already registered in <first path>:<line> (package <p1>); registered again here (package <p2>)`. The first site is the lowest by path, then line.
- Framework files: every `src` file of a package whose scaffold row (`<root>/tools/scaffold/packages.jsonl`, `TABLE_PATH` in `tools/scaffold/scaffold.ts`, read with `readTable`) has `kind` other than `"grader"`. A package missing from the table, or a root with no table, counts as framework. An exported class is a top-level `export class X`, `export abstract class X`, `export default class X`, or `class X {}` named in a local `export { X }` / `export { X as Y }` (not `export … from`). Classes declared with `declare` are skipped. For each exported class `X`:
  - The file's trailing run of top-level statements must consist only of conforming `registerClass` calls, and one of them must have `X` as its second argument. If none does: `exports class <X> but does not end with registerClass('<FQCN>', <X>)`, at the class declaration.
  - A conforming `registerClass` statement followed by any other top-level statement does not count.
- `sideEffects`: a `packages/<p>/package.json` whose `sideEffects` is `false` fails: `sets "sideEffects": false, which lets bundlers drop registerClass side effects`. An array also fails: `sets "sideEffects" to a list, which marks every other file side-effect-free`. Absent or `true` passes. Report it at the key's line and col. Invalid JSON is a violation.
- The real repository passes (every package `src` is an `index.ts` stub today).
- `checksConditionals`: `.oxlintrc.json` sets `"typescript/no-misused-promises": ["error", { "checksVoidReturn": true, "checksConditionals": true }]`. `SPINE_RULE_OPTIONS["no-misused-promises"]` holds both, so a config that sets `checksConditionals: false` fails `lint:disables` with `sets no-misused-promises without checksConditionals: true`. A new fixture, `tools/lint-rules/fixtures/async-safety/misused-conditional.ts`, uses a Promise as an `if` condition. It fails lint with `no-misused-promises` only.

**Never:**
- No runtime registry, no `@xaravel/runtime` code, and no edits to `packages/**` (Epic 9 owns the Registry). No `oxlint-disable`, and no new devDependency.
- Do not weaken any existing assertion. XT-conformance-129's config assertion becomes stricter (`checksConditionals: true` is added), and its consequence text names the option.
- No type-aware resolution: aliased or member-expression `registerClass` calls, and classes re-exported from another file, are outside the scan (AD-10 fixes the call form). Document this in § Limits.
- No check that the FQCN equals the class's Upstream name. Xaravel-only classes have no Upstream FQCN, and Story 6.5's `api-surface` reports unmatched registrations as `extra`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| clean | `packages/a/src/Foo.ts`: `export class Foo {}` + `registerClass('A\\Foo', Foo);` | ok, 1 registration | exit 0 |
| duplicate | `A\\Foo` registered in `packages/a` and `packages/b` | violation at b naming `packages/a/src/Foo.ts:<l>` and both packages | exit 1 |
| same package twice | two files of `packages/a` register `A\\Foo` | violation at the second | exit 1 |
| missing registration | `export class Bar {}` with no `registerClass` | names file:line and `Bar` | exit 1 |
| not last | `registerClass('A\\Bar', Bar); export const x = 1;` | `Bar` violation | exit 1 |
| two classes | `export class A`, `export class B`, trailing `registerClass` for both | ok | exit 0 |
| local export list | `class C {}` + `export { C }` with no registration | `C` violation | exit 1 |
| grader package | `packages/assert/src/X.ts` exports an unregistered class | ok; duplicate registrations still checked | exit 0 |
| bad call | `registerClass(name, Foo)` | shape violation; `Foo` also unregistered | exit 1 |
| interface / type only | `export interface I {}` | ok | exit 0 |
| `.d.ts` / tests | `src/x.d.ts`, `tests/X.ts` | not scanned | exit 0 |
| sideEffects false | `"sideEffects": false` | violation at the key | exit 1 |
| sideEffects list | `"sideEffects": ["./src/a.ts"]` | violation | exit 1 |
| sideEffects true | `"sideEffects": true` | ok | exit 0 |
| parse error | `export class {` | violation at the file | exit 1 |
| usage | `--nope` | usage text | exit 2 |
| conditional | `if (promise)` in the fixture | `no-misused-promises` | lint exit 1 |
| config weakened | `checksConditionals: false` | `lint:disables` names it | exit 1 |

</intent-contract>

## Code Map

- `tools/lint-rules/disables.ts` -- `SPINE_RULE_OPTIONS` (:68-71): add `checksConditionals: true` under `no-misused-promises`. `ruleShortfall` (:381) reports the first missing option in key order, so the existing `checksVoidReturn: false` expectation in XT-conformance-131 (lint.test.ts:271) still holds. Export `gitFiles` (:300, already exported) and reuse it.
- `.oxlintrc.json` :10 -- the `no-misused-promises` options.
- `tools/lint-rules/fixtures/async-safety/` -- `builder.ts` supplies `q()`; follow the one-line header style of `misused-void-callback.ts`. The directory is in the root `ignorePatterns`. Only XT-129 and XT-130 copy its fixtures, through the explicit `FAILING` map, so a new file does not change their counts. Do not add the new fixture to `FAILING`.
- `conformance/tests/xaravel/lint.test.ts` -- helpers `tempDir`, `placeFixtures`, `oxlint(config, paths)`, `gitRoot`, `runDisables`. XT-129 (:101) asserts `no-misused-promises` toEqual at :111, so update it to include `checksConditionals: true`, and add `(checksVoidReturn, checksConditionals)` to its consequence text. Add XT-conformance-254 after XT-131.
- `tools/scaffold/table.ts` -- `Kind` (:15), `PackageRow` (:17), `readTable(path)` (:269); `TABLE_PATH = "tools/scaffold/packages.jsonl"` (`scaffold.ts:16`). Graders are `assert`, `mockery` and `boost-framework` (`tools/boost-framework`, outside `packages/`). `tools/lint-rules/plugin.ts:117` `GRADER_PACKAGES` is the same list for lint.
- `tools/async-surface/async-surface.ts` -- oxc helpers `node`, `nodes`, `nameOf` (:80-104). oxc-parser 0.155.0 shapes: `ExportNamedDeclaration{declaration, specifiers[{local, exported}], source}`, `ExportDefaultDeclaration{declaration}`, `ClassDeclaration{id, declare, abstract}`, `ExpressionStatement{expression: CallExpression{callee, arguments}}`, `Literal{value}`. Use `parseSync(path, text, { lang: "ts" })`, check `errors`, and compute line and col from `start`.
- `conformance/tests/xaravel/async-surface.test.ts` -- the pattern for temp roots: `mkdtempSync` + `realpathSync`, `git init`, and the CLI via `Bun.spawnSync([process.execPath, "--no-env-file", TOOL, "--root", dir])`. Use `xaravelTest` from `../../../packages/assert/src/index`.
- `.github/workflows/ci.yml` :137-138 -- add step `Check class registration` / `bun run registration:check` after `Check the scaffold`. `conformance/tests/xaravel/ci-pipeline.test.ts:145` checks that commands are included, not an exact list.
- `package.json` scripts -- add `"registration:check": "bun --no-env-file tools/registration/registration.ts"`. `tsconfig.json` include -- add `tools/registration/*.ts`.
- `docs/ops/lint.md` :17 (the options table row and the fixture sentence) and `docs/ops/ci.md` (the step table). New `docs/ops/registration.md`, modelled on `docs/ops/async-surface.md`.
- `stories/6.6.md` -- add `XT-conformance-254` to `xaravel_test_ids` and a table row for the fourth AC. Set `status: done` at the end. `_bmad-output/implementation-artifacts/story-manifests.md` :18 -- add "Story 6.6 takes `XT-conformance-254` …" and change the next free ID to `XT-conformance-255`.

## Tasks & Acceptance

**Execution:**
- `tools/registration/registration.ts` -- export a pure `scanRegistrations(files: {path, text}[], graders: ReadonlySet<string>)` that returns violations and counts, `formatViolation`, and `main(argv)`. Write the header comment in the style of `disables.ts`.
- `.oxlintrc.json`, `tools/lint-rules/disables.ts` -- the `checksConditionals` pin.
- `tools/lint-rules/fixtures/async-safety/misused-conditional.ts` -- the new fixture.
- `package.json`, `tsconfig.json`, `.github/workflows/ci.yml` -- the script, the include and the CI step.
- `conformance/tests/xaravel/registration.test.ts` -- three tests, each also running the real CLI on the real repository (exit 0):
  - XT-conformance-140: duplicate rows of the matrix, across packages and within one;
  - XT-conformance-141: missing, not-last, local-export, two-classes, grader, bad-call, interface, `.d.ts`/tests and parse rows, with exact stderr lines;
  - XT-conformance-142: the `sideEffects` rows, the package.json script, and the ci.yml step.
  Cover the matrix's edge cases through `scanRegistrations` as well.
- `conformance/tests/xaravel/lint.test.ts` -- the XT-129 update, and XT-conformance-254. In XT-254, the real config pins the option; `misused-conditional.ts` fails with exactly `no-misused-promises`; a config with `checksConditionals: false` lets the fixture pass oxlint and fails `lint:disables` with the message; and `bun run lint:disables` passes on the real repository.
- `docs/ops/registration.md` (new), `docs/ops/lint.md`, `docs/ops/ci.md` -- usage, rules, the grader exemption, limits.
- `stories/6.6.md`, `story-manifests.md` -- the XT-254 bookkeeping.

**Acceptance Criteria:**
- Given all `packages/*/src`, when the scan runs, then an FQCN passed to `registerClass` in two packages fails and names both (XT-conformance-140).
- Given a framework file that exports a public class but doesn't end with `registerClass('<FQCN>', X)`, when the scan runs, then it fails and names the file (XT-conformance-141).
- Given a package `package.json` with `"sideEffects": false`, when the scan runs, then it fails (XT-conformance-142).
- Given the type-aware lint config, when `lint:disables` runs and a fixture uses a Promise as a condition, then `no-misused-promises` is pinned with `checksConditionals: true` beside `checksVoidReturn: true`, a config that turns it off fails `lint:disables`, and the fixture fails lint (XT-conformance-254; ESC-6.1-1).

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 26 findings — high 0, medium 4, low 19, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification) no test pins the anonymous `export default class {}` case — test row added with the new message (grouped with the anonymous-class message rows).
  - `[low]` `[patch]` (verification) the `tsconfig.json` include for the tool is not asserted — XT-conformance-142 asserts it, as `api-surface-diff.test.ts:499` does.
  - `[low]` `[patch]` (verification) the anonymous default class gets the advice `registerClass('<FQCN>', default)`, which cannot be written — it now gets its own message telling the author to name the class.
  - `[low]` `[reject]` (verification) registration parsing is duplicated in `api-surface.ts` — the two tools ask different questions (first registration wins for the diff, every site for this scan); no divergence was shown, and sharing the code is a refactor outside this Story.
  - `[low]` `[patch]` (edge) a trailing `;;` (`EmptyStatement`) breaks the trailing run and reports a registered class — the trailing loop skips `EmptyStatement`; tested.
  - `[medium]` `[patch]` (edge) `class C {}` + `export default C;` is never checked, so an unregistered class passes — handled as an exported local class; tested and documented.
  - `[low]` `[patch]` (edge) anonymous default class message — grouped with the verification row above.
  - `[false]` `[reject]` (edge) a scaffold row `dir` written as `./packages/assert` or with a trailing slash — `packages.jsonl` is generated (`scaffold:table`) with the canonical `packages/<name>` form, and `scaffold:check` keeps it so.
  - `[low]` `[reject]` (edge) a UTF-8 BOM in a `package.json` fails as invalid JSON — scaffolded package.json files carry no BOM; the failure is loud, not a false pass.
  - `[low]` `[reject]` (edge) the real-repo test crashes with EISDIR if git lists no package.json — the repository always has 51 packages; it would fail loudly.
  - `[medium]` `[patch]` (blind) duplicates that differ in case or a leading `\` pass, though PHP class names are case-insensitive — sites are grouped by a normalised key (leading `\` stripped, lower-cased); tested.
  - `[medium]` `[patch]` (blind) a malformed FQCN literal (`'A/Foo'`, `'A\\\\Foo'`, a space) is accepted — a conforming call now needs a PHP-FQCN-shaped literal; tested. A single-backslash source string that decodes to one segment cannot be detected; listed in § Limits.
  - `[medium]` `[patch]` (blind) `export default C;` not checked — grouped with the edge row above.
  - `[low]` `[patch]` (blind) anonymous default class message — grouped with the verification row above.
  - `[low]` `[patch]` (blind) any identifier named `registerClass` counts, whatever it is imported from — documented in § Limits.
  - `[low]` `[reject]` (blind) a type-only statement after the registrations breaks the trailing run — the spec fixes "the trailing run consists only of conforming `registerClass` calls" (AD-10 "ends with"); the message names the fix, and moving the registrations last costs nothing.
  - `[low]` `[reject]` (blind) failing on a `sideEffects` list goes beyond AD-10 — a list marks every unlisted file side-effect-free, which drops exactly the `registerClass` side effects AD-10 protects; no package sets one, and the spec records the rule.
  - `[false]` `[reject]` (blind) the status markers disagree (`stories/6.6.md` done, spec in-review, sprint status in-progress) — the orchestrator sets the spec and sprint status to done at finalize, in the same PR, as for 6.4 and 6.5.
  - `[low]` `[patch]` (blind) no passing control case for `checksConditionals` — `passing.ts` gains a condition on an awaited Promise, which XT-conformance-130's clean run covers.
  - `[low]` `[patch]` (blind) the grader list lives in the scaffold table and in `GRADER_PACKAGES`, unchecked — XT-conformance-141 asserts the real repository's `graderPackages(root)` equals `GRADER_PACKAGES`.
  - `[low]` `[patch]` (blind) the docs overstate AD-22 coverage (owner not checked, classes only) — § Limits states it.
  - `[low]` `[reject]` (blind) CLI failure paths (non-git root, missing root, repeated `--root`) untested — each fails loudly with exit 1 or 2; unlikely in CI, which always runs on the checkout.
  - `[low]` `[reject]` (blind) two tests pin oxc-parser's error text — oxc-parser is pinned; a bump that rewords it fails loudly and is a one-line update in the same pin-bump PR.
  - `[low]` `[reject]` (blind) `position()` and `topLevelKey` are quadratic — source files and package.json files are small; the real run takes well under a second.
  - `[low]` `[reject]` (blind) the tool imports helpers from two other tools' CLIs — the same reuse Story 6.5 made of `async-surface.ts`; both exports are covered by their own tests.
  - `[false]` `[reject]` (intent) the readings diverge on surface: synthetic roots, a vacuous real-repo pass, stricter duplicates and `sideEffects` lists, the grader exemption, the temp-copy fixture — descriptive. The real repository has no framework classes yet (Epic 9 builds the Registry), the stricter readings and the exemption are recorded in Design Notes and the intent contract, and the fixture follows Story 6.1's pattern because the root config ignores the fixtures directory.

## Design Notes

Grader packages (`kind: "grader"`: `assert`, `mockery`) are exempt from the "ends with `registerClass`" rule, though not from the duplicate scan. They are Conformance System code. AD-15 keeps them isolated from the framework they grade, they cannot import `@xaravel/runtime/registry`, and the spine already exempts them from framework-only lint rules (`GRADER_PACKAGES`, ESC-6.2-1). AD-10's rule is for "framework class files". Without the exemption, the real repository would fail on about 190 grader files today, and fixing it would need a Registry that Epic 9 has not built.

XT-conformance-254 is the next free ID (`story-manifests.md`). It follows the precedent of Stories 5.3 to 5.9, each of which took a new ID for an AC its manifest table lacked. Unlike those Stories, 6.6 also lists the ID in its manifest, so `story:check 6.6` verifies it.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/registration.test.ts conformance/tests/xaravel/lint.test.ts` -- expected: all pass
- `bun run registration:check` -- expected: exit 0
- `bun run lint`, `bun run typecheck`, `bun run test`, `bun run harness --xaravel`, `bun run async-surface --all --check`, `bun run scaffold:check` -- expected: exit 0
- `bun run ownership:check`, `bun run escalations:check`, `bun run workflows:check`, `bun run story:check 6.6` -- expected: exit 0 (the approvals and full-run clauses need CI)

## Auto Run Result

Status: done

**Summary.** `bun run registration:check` (`tools/registration/registration.ts`) statically scans every `packages/*/src` source and package `package.json`, and CI's `check` job now runs it. It fails in these cases:
- An FQCN is registered at more than one site, in any package. The comparison ignores case and a leading `\`, and the violation names the first site and both packages (AD-22).
- A framework file (any non-grader package) exports a class that is not registered in the file's trailing run of `registerClass('<FQCN>', X)` calls (AD-10).
- A malformed `registerClass` call, including an FQCN literal that is not PHP-FQCN-shaped.
- A package `package.json` sets `"sideEffects"` to `false` or to a list.

Separately, `no-misused-promises` now pins `checksConditionals: true` beside `checksVoidReturn: true` in `.oxlintrc.json` and `SPINE_RULE_OPTIONS`, so `lint:disables` rejects a config that turns it off. A new fixture uses a Promise as a condition and fails lint (ESC-6.1-1).

**Files changed.**
- `tools/registration/registration.ts` (new): the scan and its CLI.
- `.oxlintrc.json`, `tools/lint-rules/disables.ts`: the `checksConditionals` pin.
- `tools/lint-rules/fixtures/async-safety/misused-conditional.ts` (new): the failing fixture. `passing.ts` gains the awaited condition.
- `package.json`, `tsconfig.json`, `.github/workflows/ci.yml`: the script, the include and the CI step.
- `conformance/tests/xaravel/registration.test.ts` (new): XT-conformance-140, 141 and 142.
- `conformance/tests/xaravel/lint.test.ts`: XT-conformance-129 is stricter, and XT-conformance-254 is new.
- `conformance/tests/xaravel/repository-policy.test.ts`: XT-conformance-33's command list gains the new step. Only an addition; nothing removed.
- `docs/ops/registration.md` (new), `docs/ops/lint.md`, `docs/ops/ci.md`.
- `stories/6.6.md`: XT-conformance-254 added and the status set to done. `story-manifests.md`: the ID allocation, with the next free ID now 255.

**Review.** 26 findings: 4 medium, 19 low and 3 false.
- Patched, 3 medium entries: `export default C` was not checked; case and leading-`\` duplicates were missed; malformed FQCN literals were accepted.
- Patched, 9 low: trailing empty statements, the anonymous default class message and its test, the tsconfig include assertion, the grader-list agreement assertion, a passing control for `checksConditionals`, and two § Limits entries (the `registerClass` identity, and the AD-22 owner).
- Rejected low, each with its reason in the Triage Log: the duplicated registration parser, a BOM in `package.json`, the empty-list test crash, type-only statements after registrations, `sideEffects` lists, CLI failure paths, the pinned oxc error text, quadratic positions, and cross-tool imports.
- Rejected false: scaffold `dir` forms, the status markers, and the intent audit's descriptive divergences.
- Nothing was deferred.

**Follow-up review recommended: true.** Three medium entries were patched in one pass. The FQCN shape regex and the case-insensitive duplicate key have been exercised only on synthetic roots: no package registers a class until the Class Registry (Story 9.4) and the first ported classes land. Check them against the first real `registerClass` calls (Epic 9 and Epic 14).

**Verification.**
- These all exit 0: `bun run registration:check` (287 files, 0 registrations), `lint`, `typecheck`, `async-surface --all --check`, `scaffold:check`, `ownership:check`, `escalations:check` and `workflows:check`.
- `bun run test`: 252 pass, 0 fail.
- `bun run harness --xaravel`: 252 passed, differ=0.
- `bun run story:check 6.6`: manifest, tests, xaravel-tests (4 pass), fixtures and escalations pass. approvals and full-run need `GH_TOKEN` and run in CI.

**Residual risks.**
- On the real repository the scan passes vacuously today, because every package `src` is an `index.ts` stub.
- The scan is syntactic: aliased `registerClass` calls, the import source, AD-22 owner assignment, and single-backslash source literals that decode to one segment are outside it (§ Limits).
- `stories/6.6.md` is a Protected Path. That is allowed for Phase 0 Stories under the MAINT ruling.
