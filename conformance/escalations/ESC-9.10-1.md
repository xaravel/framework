---
test_ids:
  - XT-runtime-35
  - XT-runtime-36
  - XT-runtime-37
trigger: protected-path
proposed: >-
  Option 1 (recommended): change `tools/fidelity-review/fidelity-review.ts`
  (Protected) so the prompt supplies three existing pieces of repository
  evidence in more cases, with tests in
  `conformance/tests/xaravel/fidelity-review.test.ts` for each new case and
  the matching wording in the evidence notes of
  `conformance/review/fidelity.md` (above the checklist items, never in a
  Check) and in `docs/ops/fidelity-review.md`. (1) `usesName` counts a name
  after a spread (`...inherited()`) as a use: today its `(?<![\w$.])`
  lookbehind reads the spread's last `.` as member access, so
  `usedDeclarations` drops the helper. (2) Evidence (e) also shows, in full
  with its `path:lines`, a declaration an included Xaravel Test uses (to the
  same fixed point) when the test's file binds that name from a repository
  test module, statically (`import { X } from "./m"`) or through the
  dynamic-import idiom the runtime's tests use (`const { X } = (await
  import(PATH)) as …`, where `PATH` is a `join(REPO, …)` of string
  literals); a name the tool cannot resolve stays unlisted. (3) Evidence (f)
  also carries each decision record cited in a doc comment that evidence (g)
  lists for a changed `packages/*/src/` file (a declaration's or tag's
  docblock), not only on added lines. This only supplies existing
  repository evidence in more cases, which the 2026-10-21 amendment to
  `decisions/MAINT-2026-10-16-unattended-orchestrator.md` lets the
  orchestrator rule on. Story 9.10 then re-runs its Fidelity Review on the
  changed tree. Option 2: cite `decisions/ESC-9.4-1.md` on a touched line of
  `registry.ts` and inline the two helpers into the tests; that answers this
  Story only and restructures passing tests to fit the prompt.
evidence: >-
  Two Fidelity Reviews of Story 9.10 reject on the same three items. At tree
  731e2f1e1b46da1e19449b048a3d39ce405d6701 reviewer 1 (codex, gpt-6.1-sol)
  rejects F-7 "Provide the full BrandedArray declaration used by
  XT-runtime-22" and "Provide the inherited() helper called transitively
  through child() by XT-runtime-1", and F-9 "Supply decisions/ESC-9.4-1.md,
  cited by the retained resolveClassAsync docblock as authorization for
  @asyncRoot Registry.resolveClassAsync". At tree
  a1d55531d1fc5231be8fe9552dfdd282519def95 (with the signed fixtures; every
  other finding fixed) both reviewers (codex, gpt-6.1-sol; claude,
  claude-opus-5-5) reject only these items: P-4 (BrandedArray), P-5
  (inherited) and P-6 (ESC-9.4-1). All three exist in the repository:
  `BrandedArray` in `packages/assert/tests/xaravel/oracle-values.ts`, bound
  in `packages/runtime/tests/xaravel/semantics.test.ts:37` by `const {
  BrandedArray, … } = (await import(ORACLE_VALUES))`; `inherited()` at
  `packages/runtime/tests/xaravel/scope.test.ts:38`, called as
  `...inherited()` inside `child()` at line 32; and `decisions/ESC-9.4-1.md`,
  cited by the unchanged docblock of `resolveClassAsync` in
  `packages/runtime/src/registry/registry.ts`, a file this Story changes.
  The Story's spec forbids editing `tools/**`. `bun test packages/runtime`
  37/37, `harness --xaravel --id 'XT-runtime-*'` 37/37,
  `oracle:verify-fixtures`, `tsc -b`, lint, `graph:check`,
  `registration:check`, `async-surface --all --check` and `oracle:story
  check 9.10` are clean.
---

# ESC-9.10-1: the Fidelity Review misses a spread-called helper, an imported test helper, and a decision cited in an unchanged docblock

Story 9.10 changes `scope.test.ts`, `semantics.test.ts` and `registry.ts`, so the Fidelity Review shows XT-runtime-1 and XT-runtime-22 and the declarations of `registry.ts`. Three pieces of evidence the reviewers ask for never reach the prompt:

- `child()` calls `...inherited()`. `usesName` will not match a name preceded by `.`, so the spread hides the helper.
- `BrandedArray` comes from the grader's `oracle-values.ts` through a dynamic import. Evidence (e) lists only declarations in the test's own file.
- `resolveClassAsync`'s docblock cites `decisions/ESC-9.4-1.md` for its `@asyncRoot` tag. Evidence (f) reads decision records only from added lines.

Both reviewers now reject on these alone. Option 1 has the tool show all three, which the 2026-10-21 amendment allows. Work on the Story's Test IDs stops here, because every XT-runtime test sits in one reviewed tree.
