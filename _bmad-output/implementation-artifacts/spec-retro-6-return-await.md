---
title: 'Retro 6 item 11: type-aware return-await (always) over framework packages and Ported Tests'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '65c4a7d0e08605710400eedd32b4133648b761f4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/ops/lint.md'
  - '{project-root}/decisions/MAINT-2026-10-19-epic-6-items.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-retro-2026-10-19.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `xaravel/no-async-thenable-return` is syntactic, so `async find() { return this.query(); }`, where `query()` returns a thenable `Builder`, passes lint although spine:183 makes a thenable returned from an `async` function a lint error (finding L1). The Maintainer ruled (item 6) that framework packages and Ported Tests turn on the type-aware `typescript/return-await: ["error", "always"]`, pinned in `lint:disables`, while the Skeleton keeps only the syntactic rule (action item 11).

**Approach:** Add a root `.oxlintrc.json` `overrides` entry `{ "files": ["packages/**"], "rules": { "typescript/return-await": ["error", "always"] } }`. Teach `tools/lint-rules/disables.ts` a second rule list, `PACKAGE_RULES`, whose rules must hold, with their required mode, for package probe paths: in the root config's effective setting for each probe (top-level `rules`, then each matching override in order), in every nested config inside `packages/`, and against every directive in a `packages/` file.

## Boundaries & Constraints

**Always:** Keep `xaravel/no-async-thenable-return` an error at the root's top level (it still covers the Skeleton). Use the existing violation shape `<path>:<line>:<col>: <message> (AD-16)`. A mode is checked as the setting's second array element (`["error", "always"]`). Match override `files` with `Bun.Glob`, relative to the config's directory. Document the scope and the Skeleton's remaining gap in `docs/ops/lint.md`.

**Never:** Apply `return-await` to `skeleton/`, `tools/` or `conformance/`. Remove or weaken an existing assertion or check (XT-conformance-129's `overrides` assertion becomes an exact-equality pin of the one override). Touch `AGENTS.md`, `conformance/expectations/**`, the PRD, spine, SPEC or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Call-result thenable in a package | `packages/demo/src/find.ts`: `async find(): Promise<readonly string[]> { return this.query(); }` | oxlint fails with exactly `return-await` | — |
| Same in a Ported Test | `packages/demo/tests/ported/find.ts` | exactly `return-await` | — |
| Same in the Skeleton | `skeleton/app/find.ts` | no diagnostic (documented syntactic-rule limit) | — |
| Override removed | root config without the override | `.oxlintrc.json: does not set return-await (a spine rule must be "error") for packages/demo/src/Demo.ts` | exit 1 |
| Wrong mode | `["error", "in-try-catch"]` | `… sets return-await without "always" for …` | exit 1 |
| Later override lowers it | `{ files: ["packages/demo/**"], rules: { "typescript/return-await": "off" } }` | violation naming the probe | exit 1 |
| Nested package config | `packages/demo/.oxlintrc.json` without the rule | `packages/demo/.oxlintrc.json: does not set return-await …` | exit 1 |
| Directive in a package | `// oxlint-disable-next-line typescript/return-await` in `packages/demo/src/A.ts` | `` `oxlint-disable-next-line` disables return-await `` | exit 1 |
| Directive outside packages | same line in `tools/a.ts` | no violation | — |
| Real repository | after this change | `lint disables: ok`, `bun run lint` green | — |

</intent-contract>

## Code Map

- `.oxlintrc.json` -- root config; add the `overrides` entry. Override globs resolve relative to the config file (probed: a temp config with the override flagged only `packages/demo/src/find.ts`, not `skeleton/` or `tools/`).
- `tools/lint-rules/disables.ts:59` `SPINE_RULES`, `:79` `SPINE_RULE_OPTIONS` -- add `PACKAGE_RULES` (`["return-await"]`), `RULE_MODES` (`{ "return-await": "always" }`) and `PACKAGE_PROBES` (`packages/demo/src/Demo.ts`, `packages/demo/tests/ported/DemoTest.ts`).
- `tools/lint-rules/disables.ts:310` `scanSource(path, source)` -- also report `PACKAGE_RULES` directives when `path` starts with `packages/<p>/`.
- `tools/lint-rules/disables.ts:409` `ruleShortfall` -- add the mode check.
- `tools/lint-rules/disables.ts:557` `checkConfig` -- root: effective setting per `PACKAGE_PROBES`; nested config whose directory is under `packages/`: effective `rules` must carry each `PACKAGE_RULES` entry; any config's overrides may not weaken a `PACKAGE_RULES` entry.
- `tools/lint-rules/disables.ts:1-47` -- header comment.
- `conformance/tests/xaravel/lint.test.ts:101` XT-conformance-129 -- `expect(config.overrides).toBeUndefined()` becomes an exact pin.
- `conformance/tests/xaravel/lint.test.ts` helpers `tempDir`, `write`, `oxlint`, `gitRoot`, `runDisables` -- reuse for the new XT-conformance-255 (next free ID per `_bmad-output/implementation-artifacts/story-manifests.md`).
- `tools/lint-rules/fixtures/async-safety/builder.ts` -- the thenable `Builder` and `q()` the new fixture imports.
- `docs/ops/lint.md` -- oxlint table, "no overrides" sentence, limits bullet, Configs bullet, "Adding a spine rule".

## Tasks & Acceptance

**Execution:**
- `.oxlintrc.json` -- add the override.
- `tools/lint-rules/disables.ts` -- the constants, mode check, root probe check, nested-package check, overrides check and directive scope above; update the header.
- `tools/lint-rules/fixtures/async-safety/return-call-result.ts` -- new fixture: a `Repository` whose sync `query(): Builder` returns `q()` and whose `async find(): Promise<readonly string[]>` returns `this.query()`.
- `conformance/tests/xaravel/lint.test.ts` -- pin the override in XT-conformance-129; add XT-conformance-255 covering every matrix row (oxlint rows with a temp copy of the real config whose `jsPlugins` are absolute; config rows with `findDisables`/`runDisables` on temp git roots).
- `docs/ops/lint.md` -- document the rule, scope, pin and remaining Skeleton limit.
- `_bmad-output/implementation-artifacts/story-manifests.md` -- record XT-conformance-255 as this retro item's ID; next free becomes 256.

**Acceptance Criteria:**
- Given the repository after this change, when `bun run lint` runs, then it passes and prints `lint disables: ok`.
- Given the real `.oxlintrc.json`, when `checkConfig` runs, then it returns no violations and the root's top-level rules still hold `xaravel/no-async-thenable-return` as `"error"`.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 23 findings — high 0, medium 2, low 15, false 5, maybe-false 1
- findings:
  - `[medium]` `[patch]` blind: `PACKAGE_PROBES` are both `packages/demo/*.ts`, so a root override narrowed to `packages/demo/**` or `packages/**/*.ts` passes — the root check now also walks the listed package files and reports the first that falls short; XT-conformance-255 cases for both globs.
  - `[low]` `[reject]` blind: the overrides check rejects a `skeleton/` or `tools/` override that lowers `return-await`, unlike directives there — strict side only; scoping it needs a per-override reach check, and nobody needs to lower a rule that is not on there.
  - `[low]` `[reject]` blind: the message says "a spine rule must be "error"" for a package rule — cosmetic; the fix adds a parameter to the shared `ruleShortfall`.
  - `[low]` `[reject]` blind: one bad override gives a line per probe plus an `overrides[i]` line — cosmetic, on a run that already fails.
  - `[false]` `[reject]` blind: sprint status still `open` — the orchestrator sets the item `done` with SPS in the same PR after this build.
  - `[low]` `[patch]` blind: no fixed-form case — the fixture gains `return await this.query()`, which XT-conformance-255 shows lints clean under `packages/`.
  - `[low]` `[reject]` blind: the nested-`extends`-drops-overrides premise is not run through oxlint in a test — strict side: if oxlint changes, the check only asks for a redundant rule.
  - `[low]` `[patch]` blind: the override pin is in four tests but the docs name one — the docs now name all four.
  - `[low]` `[patch]` blind: `installer/` is outside `packages/**` unstated — documented as not a framework package.
  - `[false]` `[reject]` blind: spec ACs and matrix wording — the fix edits this build's spec.
  - `[low]` `[patch]` blind: header says "It checks these things." — now gives the count.
  - `[medium]` `[patch]` edge: narrowed root override leaves other packages unchecked — same root cause as the first row.
  - `[low]` `[patch]` edge: `isPackagePath` misses a file directly under `packages/` — now `^packages/`, with a `scanSource` case.
  - `[low]` `[reject]` edge: overrides check fails a Skeleton/tools override — same as the second row.
  - `[maybe-false]` `[reject]` edge: `Bun.Glob` may match a slash-less or `/`-led `files` glob differently from oxlint — would settle by probing oxlint with `*.ts`; if true it is low (no such glob exists, and the new real-file walk narrows the gap).
  - `[low]` `[reject]` edge: a nested package config that sets the rule only in its own overrides is rejected — strict side; the docs say a nested package config carries it in `rules`.
  - `[low]` `[reject]` verification-gap other: same as the previous row.
  - `[low]` `[reject]` intent: the firing proof lints a temp copy of the real config, not a real `packages/` file — the copy is the real config byte-for-byte except absolute `jsPlugins`, and XT-conformance-129 pins the real override; writing into the real tree is forbidden.
  - `[low]` `[patch]` intent: only the annotated `find()` is exercised — the fixture gains the unannotated form, which also fails `return-await`.
  - `[low]` `[patch]` intent: the probes are synthetic, not real files — same root cause as the first row.
  - `[false]` `[reject]` intent: `packages/*/tests/xaravel` is covered too — the ruling scopes framework packages, and `packages/**` is the package.
  - `[false]` `[reject]` intent: directives are allowed in `tools/` and `conformance/` too — matches the ruling's package scope.
  - `[false]` `[reject]` intent: three existing `overrides` assertions changed — each is now an exact pin, stricter than `toBeUndefined()`.

## Verification

**Commands:**
- `bun test conformance/tests/xaravel/lint.test.ts` -- expected: all pass
- `bun run lint` -- expected: exit 0, `lint disables: ok`
- `bun run typecheck` -- expected: no errors
- `bun run harness --xaravel` -- expected: exit 0

## Auto Run Result

Status: done

**Summary.** Framework packages and Ported Tests now run the type-aware `typescript/return-await: ["error", "always"]`, through one root `overrides` entry for `packages/**`. It catches `async find() { return this.query(); }`, annotated or not, which the syntactic `xaravel/no-async-thenable-return` misses. That rule stays a top-level error, so the Skeleton keeps it and does not get `return-await`. `lint:disables` pins the new rule through `PACKAGE_RULES` and `RULE_MODES`. It fails a root config whose effective setting falls short for a `PACKAGE_PROBES` path or for any protected package path, a nested config under `packages/` that does not set the rule, any override that weakens it, and a `return-await` disable directive in a `packages/` file.

**Files changed.**
- `.oxlintrc.json`: the `packages/**` override.
- `tools/lint-rules/disables.ts`: `PACKAGE_RULES`, `RULE_MODES`, `PACKAGE_PROBES`, `isPackagePath`, the mode check in `ruleShortfall`, the package-rule checks in `checkConfig`, the directive scope in `scanSource`, and the header.
- `tools/lint-rules/fixtures/async-safety/return-call-result.ts`: the annotated and unannotated call-result returns, and the fixed form.
- `conformance/tests/xaravel/lint.test.ts`: new XT-conformance-255; XT-conformance-129 pins the override; XT-conformance-131 inputs adapted with no expected value changed.
- `conformance/tests/xaravel/lint-rules.test.ts`, `conformance/tests/xaravel/lint-signatures.test.ts`: `overrides` assertions changed from `toBeUndefined()` to the exact pin (XT-conformance-132, -133).
- `docs/ops/lint.md`: the rule, its scope (excluding `skeleton/`, `installer/`, `tools/` and `conformance/`), the pins, and the Skeleton's remaining limit.
- `_bmad-output/implementation-artifacts/story-manifests.md`: XT-conformance-255 allocated to this item; the next free ID is 256.

**Review.** 4 patch groups applied: narrowed-override walk (medium), `isPackagePath` at `packages/` root, fixture fixed and unannotated forms, docs and header (all low). 0 deferred. 12 rejected; the reasons are in the triage log. Follow-up review recommended: false (patched: high 0, medium 1 entry, low 3).

**Verification.**
- `bun test` on `lint.test.ts`, `lint-rules.test.ts` and `lint-signatures.test.ts`: 7 pass, 0 fail.
- `bun run lint`: `lint disables: ok (399 files)`. After the patches it first failed on `unicorn/prefer-string-starts-ends-with` in `isPackagePath`; that line now uses `startsWith`.
- `bun run typecheck`: clean.
- `bun run harness --xaravel`: 265/265 passed, differ=0.

**Residual risks.** `Bun.Glob` stands in for oxlint's matcher for `overrides[].files`; a slash-less glob could match differently from oxlint. The rule that a nested config drops the root's overrides was probed on oxlint 1.88.0 but is not re-run in a test; if oxlint changes, the check only becomes stricter.
