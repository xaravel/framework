---
title: 'Story 10.5: Xaravel-only contracts'
type: 'feature'
created: '2026-10-24'
status: 'in-review'
baseline_revision: '2482c9a75b477055687b8717c45cf90440562e7d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/AGENTS.md'
warnings:
  - oversized
deferred:
  - summary: >-
      The PromiseLike check runs only as a contracts Xaravel Test, not as a lint rule in the offending package's checks.
    evidence: |-
      A lint rule needs tools/lint-rules (Protected); ESC-6.1-1 is open with the Maintainer and offered either home.
    location: >-
      packages/contracts/tests/xaravel/support/thenables.ts
    severity: medium
  - summary: >-
      RenderContext leaves out ManagesTranslations::$translationReplacements and Factory::$renderCount, and keys pushes/prepends by string.
    evidence: |-
      AD-11's list does not name them. Whether nested renders need them per render is the View Epic's to settle, by an Escalation if it changes this contract.
    location: >-
      packages/contracts/src/view/RenderContext.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** `@xaravel/contracts` has no `async` or `testing` subpath, and `view` has only the Upstream contracts. AD-27 puts the three Xaravel-only seams in contracts in Phase 1: the thenable list and `NotPromise<T>` (AD-6), the compiled-view `RenderContext` and the `Blade.directive` helper names (AD-11), and the test hook order (AD-25).

**Approach:** Add `src/async/index.ts` and `src/testing/index.ts` with their `exports` entries, and add the view ABI types to `src/view/`. Test each with an `XT-contracts-<n>` test that derives its expected data from the Upstream PHP sources where Upstream has them. The hook order Upstream runs differed from AD-25's first wording, so ESC-10.5-1 asked for a ruling. The build follows Upstream's order, which the Maintainer approved (`decisions/ESC-10.5-1.md`, Option 1), and AD-25's **Hook order** line now states it.

**Resume (2026-10-24, second pass):** the first pass merged in #376, blocked on ESC-10.5-1 and ESC-10.5-2. Both are ruled (#377, #378): AD-25 now gives Upstream's order, and `thenableTypes(root)` resolves `@xaravel/contracts/async` from `<root>/packages/contracts`. This pass makes XT-contracts-13 assert the tool's actual return value from the repository root, makes XT-contracts-15 cite the corrected AD-25 and the ruling, re-runs the Fidelity Review on the changed tree, and clears the block.

## Boundaries & Constraints

**Always:**
- **`@xaravel/contracts/async`** (XT-contracts-13).
  - `THENABLE_TYPES: readonly string[]`, frozen, holds the same 26 FQCNs in the same order as `THENABLE_TYPES` in `tools/lint-rules/thenables.ts`. That list is a superset of the AC's names (it adds `PendingClosureDispatch` and both Pipelines, ESC-10.2-2). `bun run async-surface` then reads it (`thenableTypes(root)`, `tools/async-surface/async-surface.ts:588`). XT-contracts-13 asserts this from the repository root (ESC-10.5-2): a `bun` child process run with `cwd` `REPO` imports the tool and `@xaravel/contracts/async` by path, and reports that `await thenableTypes(REPO)` is the contracts module's own `THENABLE_TYPES` array (the same object) and not the tool's. The test never imports the tool or `oxc-parser` itself.
  - `type NotPromise<T> = T extends PromiseLike<unknown> ? never : T`. It is distributive, so `NotPromise<number | Promise<number>>` is `number`.
- **The PromiseLike check** (AC 1, ESC-6.1-1 item 2). `tests/xaravel/support/thenables.ts` exports `thenableProblems(source, file): string[]`, a lexical scanner with no package imports. It reports `<file>: class <Name> declares then but does not implement PromiseLike` for each class, declaration or expression, that has an instance member named `then` and no `PromiseLike` in its own `implements` list. Comments, strings, template literals and regex literals are skipped.
  - Members that count: a method (also `async`, generic, `get`), a field (also with an initializer or a type), and a quoted or computed-string name (`"then"`, `["then"]`).
  - Members that do not count: a `static` member, the `then` property of an object literal, and a `.then(` call.
  - Classes nested in a body, and classes in a function that `mixin` traits return, are found.
  - XT-contracts-13 runs it on fixtures for each case above and on every `packages/*/src/**/*.ts` file, which must report nothing.
- **`@xaravel/contracts/view`** (XT-contracts-14) gains types only, so XT-contracts-8's exact runtime exports still hold.
  - `interface RenderContext`. Its fields are `data`, `factory` (the `View\Factory` contract), each per-render state property of Upstream's View `Factory` and its `Manages*` concerns for sections, stacks, `@once`, components, loops and fragments (Design Notes), and `fragmentCapture`.
  - `interface RenderLoop`, the shape of Upstream's `addLoop` entry.
  - `type BladeEnvMethod`: the union of every `$__env-><method>` name in `Illuminate/View/Compilers/**` at the Pin (34). `type BladeFunction = "e"`: the default echo format's function (`BladeCompiler::DEFAULT_ECHO_FORMAT`). `type BladeHelper = BladeEnvMethod | BladeFunction`.
- **`@xaravel/contracts/testing`** (XT-contracts-15), in AD-25's corrected order (`decisions/ESC-10.5-1.md`).
  - `TEST_HOOK_ORDER`, frozen: `createApplication`, `setUp<Trait>`, `afterApplicationCreated`, `test`, `tearDown<Trait>`, `beforeApplicationDestroyed`.
  - `type TestHook` is its element union.
  - This is Upstream's `setUpTheTestEnvironment` / `setUpTraits` / `tearDownTheTestEnvironment` order. A trait's `tearDown<Trait>` is registered as a `beforeApplicationDestroyed` callback while `setUpTraits` runs, so it runs before callbacks registered later.
- `package.json` gains `"./async"` and `"./testing"`, both already in `SUBPATH_EXPORTS`. The README lists the three seams.
- Tests use `xaravelTest`, `Assert`, `support/contract-namespaces.ts` (`REPO`, `upstreamOrWarn`) and `brand-compile.test.ts`'s pinned-`tsc -b` temp-project form for type checks. Upstream-derived parts compare with a literal copy that runs without the snapshot. Consequence strings cite AD-6, AD-11, AD-25 and AD-27, ESC-10.5-1 (approved) for -15, and ESC-10.5-2 (approved) for -13's tool row.

**Never:**
- Edit outside `packages/contracts/**`, this spec, `stories/10.5.md`'s `status:` line, sprint status, and `conformance/escalations/ESC-10.5-*.md`. Never edit `tools/**`; the async-surface tool already prefers this list.
- Add a runtime export to `src/view/index.ts`, change an existing contract, or edit another Story's tests.
- Import any package other than `@xaravel/runtime` from `src/`, or any undeclared package (such as `oxc-parser`) from `tests/`.
- Use the retired order (`afterApplicationCreated` before `setUp<Trait>`). Cite `exceptions.jsonl` or `additions.jsonl`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| list (XT-13) | `THENABLE_TYPES` | frozen, equals the tool file's array literal in order, and contains every AC name | none |
| tool reads it (XT-13) | `await thenableTypes(REPO)`, in a `bun` child run from `REPO` | is the contracts module's `THENABLE_TYPES` (same object), not the tool's own array; `@xaravel/contracts/async` resolves from `packages/contracts` to `src/async/index.ts` | the child's non-zero exit fails the test with its output |
| NotPromise (XT-13) | a fixture compiled with `tsc -b` | `NotPromise<number>` is `number`, `Promise`/`PromiseLike` give `never`, and `map(async () => 1)` against `(fn: () => NotPromise<U>)` fails while `map(() => 1)` compiles | the error fixture exits non-zero |
| check (XT-13) | the fixtures; `packages/*/src` | each bad fixture gives one problem naming its class; each good one gives none; the tree gives none | none |
| view (XT-14) | a compiled fixture | an object with every `RenderContext` field compiles, one missing a field fails; `Record<BladeHelper, true>` over the parsed names compiles with no missing or extra key | Upstream names come from the compiler sources |
| testing (XT-15) | `TEST_HOOK_ORDER` | frozen, and equals the literal and the order parsed from `InteractsWithTestCaseLifecycle.php` | none |

</intent-contract>

## Code Map

- `tools/lint-rules/thenables.ts:50` `THENABLE_TYPES`: the list to copy and compare with (read as text). Read-only.
- `tools/async-surface/async-surface.ts:567` `thenableTypes(root)`: prefers `@xaravel/contracts/async`'s non-empty string array. Read-only.
- `packages/contracts/src/view/index.ts`, `Factory.ts`: add `export type` lines only.
- `packages/contracts/tests/xaravel/web.test.ts:228` (XT-contracts-8): pins `view`'s runtime exports to the Upstream declarations.
- `packages/contracts/tests/xaravel/brand-compile.test.ts:64` `tscBuild`, `:96`: the temp-project compile pattern (symlinked `@xaravel/contracts`, copied `tsconfig.base.json`).
- `packages/contracts/tests/xaravel/support/contract-namespaces.ts:16,24`: `REPO`, `upstreamOrWarn`.
- `conformance/upstream/framework/src/Illuminate/View/Compilers/**`: the `$__env->` names. `BladeCompiler.php` holds `DEFAULT_ECHO_FORMAT`. `View/Factory.php:91` `$renderedOnce`; `View/Concerns/Manages{Layouts,Stacks,Components,Loops,Fragments}.php` hold the state properties, and `ManagesLoops::addLoop` the loop entry.
- `conformance/upstream/framework/src/Illuminate/Foundation/Testing/Concerns/InteractsWithTestCaseLifecycle.php`: `setUpTheTestEnvironment`, `setUpTraits:232`, `tearDownTheTestEnvironment`.
- `conformance/tests/xaravel/scaffold.test.ts:228` `SUBPATH_EXPORTS`: already lists `async` and `testing`. Read-only.
- `tools/graph/graph.ts:295`: the undeclared-import rule over `tests/**`.

## Tasks & Acceptance

**Execution:**
- `conformance/escalations/ESC-10.5-1.md`: raise `divergence` for XT-contracts-15 before building. The Upstream order differs from AD-25's wording. Option 1 (recommended): follow Upstream, and the Maintainer corrects AD-25's line. Option 2: keep AD-25 under a new DIV clause.
- `packages/contracts/src/async/index.ts`: `THENABLE_TYPES` and `NotPromise` (AD-6).
- `packages/contracts/src/view/RenderContext.ts` and `index.ts`: `RenderContext`, `RenderLoop`, `BladeEnvMethod`, `BladeFunction` and `BladeHelper`, exported as types (AD-11).
- `packages/contracts/src/testing/index.ts`: `TEST_HOOK_ORDER` and `TestHook` (AD-25).
- `packages/contracts/package.json`, `README.md`: the `./async` and `./testing` subpaths and the view ABI.
- `packages/contracts/tests/xaravel/support/thenables.ts`: `thenableProblems`.
- `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13, -14 and -15, covering every matrix row.

**Acceptance Criteria:**
- Given the package, when `bun run harness --xaravel --id 'XT-contracts-*'` runs, then XT-contracts-1..15 and -18 pass.
- Given the change, when `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run escalations:check` and `bun run async-surface --all --check` run, then each exits 0 and no `async-surface.json` changes. When `bun run api-surface --details contracts` runs, it reports 0 unexplained. When the full `bun run harness` runs, it reports no differences.

## Spec Change Log

- 2026-10-24, build: the matrix row "tool reads it" assumed `Bun.resolveSync("@xaravel/contracts/async", REPO)` resolves. It does not: Bun's isolated linker puts no `@xaravel/*` link in the root `node_modules`, so `thenableTypes(root)` falls back to the tool's own (identical) list. Fixing it edits a Protected Path, so ESC-10.5-2 (`protected-path`) asks for the change. XT-contracts-13 checks resolution from `packages/contracts` and from a dependent package (`packages/support`) instead. The view compile fixture uses the package's own `types: ["bun"]` (a symlinked `@types/bun`), because `@xaravel/contracts/view` reaches runtime sources that use Bun's globals.

- 2026-10-24, second pass build: XT-contracts-13 now runs `await thenableTypes(REPO)` in a child `bun` from `REPO` and asserts it is the contracts module's `THENABLE_TYPES` and not the lint rule's (26 entries); XT-contracts-15, the header comments of `seams.test.ts`, `src/async/index.ts`, `src/testing/index.ts` and the README cite the corrected AD-25 and the two approved rulings. The `deferred` entries for ESC-10.5-1 and ESC-10.5-2 are removed, as both are ruled and built.

- 2026-10-24, second pass plan: ESC-10.5-1 (Maintainer, #377) and ESC-10.5-2 (orchestrator, #378) are ruled. The Approach gains a Resume note; the async bullet and the "tool reads it" matrix row now assert `thenableTypes(REPO)`'s return value from a child process; the testing bullet and its Never line cite the corrected AD-25. This pass starts at `4410d0f1f8fea794c6c5d04f42e85afab78e35a5`; `baseline_revision` stays the Story's base.

## Review Triage Log

### 2026-10-24 — Review pass

- verdicts: 44 findings — high 4, medium 12, low 18, false 6, maybe-false 4
- findings:
  - Blind Hunter:
    - `[high]` `[defer]` XT-contracts-15 ships the contested hook order before ESC-10.5-1 is ruled on. This is Option 1, built as Story 10.4 built its Option 1. The Story ends `blocked` on ESC-10.5-1, and the Maintainer's ruling settles it.
    - `[low]` `[patch]` ESC-10.5-1 left out AD-25's final "→ test frame ends" step. The Escalation now quotes the step and notes the frame end belongs to the harness, not a hook.
    - `[high]` `[patch]` The header, the README and XT-contracts-13 claimed async-surface reads the list. The wording now says the tool prefers the list when it resolves, and that root resolution waits on ESC-10.5-2. The integration itself is deferred to ESC-10.5-2.
    - `[medium]` `[patch]` XT-contracts-13 cited AD-6.9 for the scanner. It now cites ESC-6.1-1 item 2.
    - `[low]` `[patch]` `stories/10.5.md` status disagreed with sprint status. Both are set to `blocked` at HALT.
    - `[low]` `[reject]` A garbled Never bullet in the spec. The fix would edit this build's spec.
    - `[low]` `[reject]` `BladeHelper` lacks the thenable-guard helpers. AD-11 has the compiler wrap every directive condition and iterable, so handlers never emit the guard.
    - `[maybe-false]` `[defer]` `RenderContext` leaves out `translationReplacements` and `renderCount`, and the `pushes`/`prepends` inner key is a string. Whether per-render nesting needs them is the View Epic's design (AD-11's list leaves them out). Recorded in `deferred`.
    - `[low]` `[patch]` XT-contracts-14 did not prove the concern list complete. It now asserts the `View/Concerns/*.php` listing equals the files it reads plus an explicit excluded list.
    - `[medium]` `[patch]` Only `fragmentCapture` was proven required. Added `Equals<RenderContext, Required<RenderContext>>`.
    - `[medium]` `[patch]` The scanner missed constructor parameter properties, and `set`/optional fields had no fixtures. Both are detected now, with fixtures.
    - `[low]` `[reject]` A regex literal after `)` or `}` is read as division. This is rare in framework code, and the fix adds lexer branches. The whole-tree scan passes.
    - `[medium]` `[defer]` The check lives in a contracts test, not lint. A lint rule needs `tools/lint-rules` (Protected), and ESC-6.1-1 is open with the Maintainer. Recorded in `deferred`.
    - `[low]` `[reject]` `THENABLE_TYPES` is `readonly string[]`, not `as const`. No consumer needs the literal union, and the tool accepts a string array.
    - `[low]` `[patch]` `NotPromise<any>` is an escape hatch. The JSDoc now documents the limit.
    - `[low]` `[patch]` The README omitted `RenderLoop`. Added. (The stale Code Map line about `Factory.ts` is a spec edit, rejected.)
  - Edge Case Hunter:
    - `[medium]` `[patch]` An anonymous generic class expression `class<T>` was skipped. Now detected, with a fixture.
    - `[medium]` `[patch]` A constructor parameter property declaring `then` was missed. Same fix as the Blind Hunter row.
    - `[low]` `[reject]` A decorator with type arguments before `then`. Rare, and the fix adds parsing branches.
    - `[low]` `[reject]` A regex after `)` or `}`. Same as the Blind Hunter row.
    - `[low]` `[reject]` Element access on a field initializer (`{then:1}["then"]`) gives a false report. It would fail loudly, and the whole tree is clean.
    - `[low]` `[reject]` A CRLF line continuation in a string. Sources are LF (`.gitattributes`).
    - `[low]` `[reject]` A typed class-expression binding names the type in the message. Cosmetic.
    - `[low]` `[patch]` `NotPromise<any>`. Same as the Blind Hunter row (documented).
    - `[low]` `[reject]` A non-`PromiseLike` `then` passes `NotPromise`. The scanner requires framework thenables to implement `PromiseLike`.
    - `[low]` `[patch]` The vacuous `indexOf` -1 comparison in XT-contracts-15. It now asserts each index is found.
    - `[false]` `[reject]` `phpMethodBody` with no `{`. A missing body fails the later assertions loudly, and the Pin's file has one.
    - `[low]` `[reject]` Typed PHP properties would be skipped. The Pin's concerns declare untyped properties, and the Pin is fixed.
    - `[high]` `[patch]` The thenableTypes claim. Same as the Blind Hunter row.
    - `[high]` `[patch]` The async header and README claim. Same as the Blind Hunter row.
    - `[low]` `[reject]` The spec's claim that regex literals are skipped is partial. This is the regex row again, rejected.
    - `[medium]` `[patch]` The spec's claim that every class is reported. Fixed by the `class<T>` and parameter-property patches.
  - Verification Gap:
    - `[medium]` `[defer]` No assertion that `thenableTypes(REPO)` returns the contracts export. It needs ESC-10.5-2's Protected change. The assertion lands with it.
    - `[medium]` `[patch]` Required fields. Same as the Blind Hunter row.
  - Intent Alignment:
    - `[maybe-false]` `[defer]` The tool-reads surface is checked by a substitute. This is ESC-10.5-2.
    - `[maybe-false]` `[defer]` The check is a test, not lint. Same as the Blind Hunter defer row (ESC-6.1-1).
    - `[false]` `[reject]` The thenable list is a superset of the AC's. ESC-10.2-2 ruled the Pipelines in, and the list equals the lint rule's.
    - `[false]` `[reject]` The view reading is broader. It is Upstream-derived per AD-3 and adds no runtime export.
    - `[maybe-false]` `[defer]` The hook order follows Upstream, not AD-25. This is ESC-10.5-1.
  - Fidelity Review (standing rejects at tree 4940ac766a56260d23d26b16bfbc86ce0e69c7a9):
    - `[false]` `[defer]` R1 F-7 on the thenableTypes integration. This is ESC-10.5-2, and the wording is patched.
    - `[false]` `[patch]` R1 F-7 on the AD-6.9 citation. It now cites ESC-6.1-1.
    - `[medium]` `[defer]` R1 F-7 on Upstream lifecycle and view sources missing from the prompt, and on no ESC-10.5-1 ruling. This is a missing-evidence finding outside F-2/F-3/F-8, an evidence gap noted (MAINT-2026-10-24). The ruling part is ESC-10.5-1.
    - `[high]` `[defer]` R2 F-7: the hook order contradicts AD-25 with no ruling. This is ESC-10.5-1.
    - `[false]` `[defer]` R2 F-7 on the thenableTypes integration. This is ESC-10.5-2.

## Design Notes

**`RenderContext` fields** (Upstream property → field, all mutable per-render state except `data` and `factory`):

| Upstream | Field | Type |
|---|---|---|
| — | `data` | `Readonly<Record<string, unknown>>` (names without `$`) |
| — | `factory` | `Factory` |
| `ManagesLayouts::$sections`, `$sectionStack` | `sections`, `sectionStack` | `Record<string, string>`, `string[]` |
| `ManagesStacks::$pushes`, `$prepends`, `$pushStack` | same names | `Record<string, Record<string, string>>` ×2, `string[]` |
| `Factory::$renderedOnce` | `renderedOnce` | `Set<string>` |
| `ManagesComponents::$componentStack`, `$componentData`, `$currentComponentData`, `$slots`, `$slotStack` | same names | `unknown[]`, `Record<number, Record<string, unknown>>`, `Record<number, Record<string, unknown>>`, `Record<number, Record<string, unknown>>`, `Record<number, unknown[]>` |
| `ManagesLoops::$loopsStack` | `loopsStack` | `RenderLoop[]` |
| `ManagesFragments::$fragments`, `$fragmentStack` | same names | `Record<string, string>`, `string[]` |
| — | `fragmentCapture` | `Set<string> \| null`, the fragment names a `fragment()` render captures (AD-11) |

`ManagesTranslations::$translationReplacements` and `Factory::$renderCount` are left out: AD-11's list does not name them. The View Epic raises an Escalation if it needs them.

`RenderLoop`: `iteration`, `index` (number); `remaining`, `count` (number | null); `first`, `odd`, `even` (boolean); `last` (boolean | null); `depth` (number); `parent` (`RenderLoop | null`), as `addLoop` builds them.

**Hook order.** Upstream's `setUpTheTestEnvironment` calls `refreshApplication` (`createApplication`), then `setUpTraits`, then the `afterApplicationCreated` callbacks. AD-25 says `afterApplicationCreated` → `setUp<Trait>`. XT-contracts-15 parses that order from the PHP file, by the offsets of `refreshApplication()`, `setUpTraits()` and `afterApplicationCreatedCallbacks as`, and the `beforeApplicationDestroyed(fn () => $this->{$method}())` registration inside `setUpTraits`.

## Verification

**Commands:**
- `bun run harness --xaravel --id 'XT-contracts-*'` -- expected: 16 of 16 pass.
- `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run escalations:check`, `bun run async-surface --all --check` -- expected: each exits 0.
- `bun run api-surface --details contracts` -- expected: 0 unexplained.
- `bun run harness` -- expected: no differences.
- `bun run fidelity:review review --story 10.5` -- expected: two `pass` verdicts, or rejects routed to Escalations.

## Fidelity Review

### Reviewer 1: reject at tree 4940ac766a56260d23d26b16bfbc86ce0e69c7a9

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2482c9a75b477055687b8717c45cf90440562e7d`, on 2026-10-24T10:28:10.188Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds or changes none. |
| F-2: No expected value is weakened | pass | Reviewed the new Xaravel Tests' expected values and comparisons; no existing expected value or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test changes or Upstream assertion removals are present. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this Story. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared XT-contracts-13 through XT-contracts-15 with their bodies, cited consequences and supplied source evidence; XT-contracts-13 overclaims tool integration and cites the wrong enforcement bullet, while key Upstream evidence is absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the source changes with the contracts component scope and AD-27.2; they define contract data and types without implementing another component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared every changed source declaration with AD-6 and DIV-1; the additions are constants, interfaces, type aliases and re-exports, with no async method requiring a tag and no retained tag in the touched files. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes, so there are no setup or exprs inputs to compare. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 claims async-surface's thenableTypes() reads the contracts export, but its body only resolves and imports the subpath from packages. ESC-10.5-2 explicitly reports that the actual repository-root call falls back to the tool's list. Complete the integration through the approved infrastructure route and assert that thenableTypes(REPO) returns the contracts export.
- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 cites AD-6.9 for its PromiseLike declaration scanner, but that bullet specifies terminal awaiting and lint enforcement of async thenable returns. The scanner verifies neither. Cite ESC-6.1-1 for this check and add a corresponding check if retaining the AD-6.9 token.
- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: Supply the Upstream lifecycle source used by XT-contracts-15 and the View state concerns, Factory and compiler sources used by XT-contracts-14. Except for ManagesLoops, these inputs are not shown, so the declared hook order, state coverage and exhaustive helper names cannot be independently confirmed. Also supply the approved ESC-10.5-1 ruling if relying on it to replace AD-25's stated order; the prompt contains only the unresolved escalation. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"4940ac766a56260d23d26b16bfbc86ce0e69c7a9","base":"2482c9a75b477055687b8717c45cf90440562e7d","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T10:28:10.188Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds or changes none.","findings":[]},{"id":"F-2","result":"pass","note":"Reviewed the new Xaravel Tests' expected values and comparisons; no existing expected value or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test changes or Upstream assertion removals are present.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this Story.","findings":[]},{"id":"F-7","result":"fail","note":"Compared XT-contracts-13 through XT-contracts-15 with their bodies, cited consequences and supplied source evidence; XT-contracts-13 overclaims tool integration and cites the wrong enforcement bullet, while key Upstream evidence is absent.","findings":[{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13 claims async-surface's thenableTypes() reads the contracts export, but its body only resolves and imports the subpath from packages. ESC-10.5-2 explicitly reports that the actual repository-root call falls back to the tool's list. Complete the integration through the approved infrastructure route and assert that thenableTypes(REPO) returns the contracts export.","kind":"defect"},{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13 cites AD-6.9 for its PromiseLike declaration scanner, but that bullet specifies terminal awaiting and lint enforcement of async thenable returns. The scanner verifies neither. Cite ESC-6.1-1 for this check and add a corresponding check if retaining the AD-6.9 token.","kind":"defect"},{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"Supply the Upstream lifecycle source used by XT-contracts-15 and the View state concerns, Factory and compiler sources used by XT-contracts-14. Except for ManagesLoops, these inputs are not shown, so the declared hook order, state coverage and exhaustive helper names cannot be independently confirmed. Also supply the approved ESC-10.5-1 ruling if relying on it to replace AD-25's stated order; the prompt contains only the unresolved escalation.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Compared the source changes with the contracts component scope and AD-27.2; they define contract data and types without implementing another component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"Compared every changed source declaration with AD-6 and DIV-1; the additions are constants, interfaces, type aliases and re-exports, with no async method requiring a tag and no retained tag in the touched files.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes, so there are no setup or exprs inputs to compare.","findings":[]}],"prior":[]}
```

### Reviewer 2: reject at tree 4940ac766a56260d23d26b16bfbc86ce0e69c7a9

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `2482c9a75b477055687b8717c45cf90440562e7d`, on 2026-10-24T10:28:10.188Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests changed; manifest test_ids empty. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values; only Xaravel Tests added. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests; no assertions compared to Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations lines set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers added. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures relied on. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared each test body to its consequence string and cited bullets. XT-contracts-15 cites AD-27.2 but its consequence says it replaces AD-25's wording; AD-25.1 literally says afterApplicationCreated precedes setUp<Trait>, which the test contradicts (pending ESC-10.5-1). Decision record ESC-10.5-1 is also unavailable (decisions/ does not exist), so the ruling is not recorded evidence. Also XT-contracts-13 claims async-surface's thenableTypes() reads the list but does not test it (ESC-10.5-2 admits root resolution fails). |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes confined to packages/contracts; types and constants only, no stub of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags added or kept in changed source files; none are async methods; NotPromise is a type, not an async method. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-15 verifies Upstream's order, not AD-25.1's bullet, and ESC-10.5-1 has no approved decision record; the declared hook order contradicts the spine until the Maintainer rules. _(missing evidence)_
- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13's consequence claims async-surface's thenableTypes() reads the list, but the body checks only resolution from package dirs, not from the tool's root or its actual return value.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"4940ac766a56260d23d26b16bfbc86ce0e69c7a9","base":"2482c9a75b477055687b8717c45cf90440562e7d","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T10:28:10.188Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests changed; manifest test_ids empty.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values; only Xaravel Tests added.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests; no assertions compared to Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations lines set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers added.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures relied on.","findings":[]},{"id":"F-7","result":"fail","note":"Compared each test body to its consequence string and cited bullets. XT-contracts-15 cites AD-27.2 but its consequence says it replaces AD-25's wording; AD-25.1 literally says afterApplicationCreated precedes setUp<Trait>, which the test contradicts (pending ESC-10.5-1). Decision record ESC-10.5-1 is also unavailable (decisions/ does not exist), so the ruling is not recorded evidence. Also XT-contracts-13 claims async-surface's thenableTypes() reads the list but does not test it (ESC-10.5-2 admits root resolution fails).","findings":[{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-15 verifies Upstream's order, not AD-25.1's bullet, and ESC-10.5-1 has no approved decision record; the declared hook order contradicts the spine until the Maintainer rules.","kind":"missing-evidence"},{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13's consequence claims async-surface's thenableTypes() reads the list, but the body checks only resolution from package dirs, not from the tool's root or its actual return value.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Changes confined to packages/contracts; types and constants only, no stub of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags added or kept in changed source files; none are async methods; NotPromise is a type, not an async method.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree b81fbdf25dd40b13ca5fcbf3d21c9770b57dfa2e

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `2482c9a75b477055687b8717c45cf90440562e7d`, on 2026-10-24T18:47:56.148Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and none are changed. |
| F-2: No expected value is weakened | pass | The added tests use exact list, order and diagnostic comparisons; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The Story relies on no Oracle error fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The test bodies cover the declared seams, and the integration assertion and corrected citations address prior defects. However, P-3's required Upstream inputs remain absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | The Story adds contracts-owned types and frozen seam data, with no implementation of another Component's behavior. |
| F-9: Every `@asyncRoot` tag is true | pass | The changed framework files contain data, types and re-exports, with no async methods or callbacks requiring an asyncRoot tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: Supply InteractsWithTestCaseLifecycle.php and the View state concerns, Factory.php and compiler sources read by XT-contracts-14 and XT-contracts-15. Only ManagesLoops.php is supplied among these inputs, so exhaustive state/helper coverage and the lifecycle parser cannot be independently confirmed. The approved ESC-10.5-1 ruling is now supplied, resolving that portion of P-3. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 claims async-surface's thenableTypes() reads the contracts export, but its body only resolves and imports the subpath from packages. ESC-10.5-2 explicitly reports that the actual repository-root call falls back to the tool's list. Complete the integration through the approved infrastructure route and assert that thenableTypes(REPO) returns the contracts export. **fixed**: ESC-10.5-2 records the approved integration fix; XT-contracts-13 now calls thenableTypes from the repository root and asserts contracts-array identity.
- **P-2** (reviewer 1, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 cites AD-6.9 for its PromiseLike declaration scanner, but that bullet specifies terminal awaiting and lint enforcement of async thenable returns. The scanner verifies neither. Cite ESC-6.1-1 for this check and add a corresponding check if retaining the AD-6.9 token. **fixed**: The scanner consequence now cites ESC-6.1-1 item 2 and no longer cites AD-6.9.
- **P-3** (reviewer 1, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: Supply the Upstream lifecycle source used by XT-contracts-15 and the View state concerns, Factory and compiler sources used by XT-contracts-14. Except for ManagesLoops, these inputs are not shown, so the declared hook order, state coverage and exhaustive helper names cannot be independently confirmed. Also supply the approved ESC-10.5-1 ruling if relying on it to replace AD-25's stated order; the prompt contains only the unresolved escalation. **not fixed**: The approved ESC-10.5-1 ruling is supplied, but the requested lifecycle and View sources other than ManagesLoops remain absent.
- **P-4** (reviewer 2, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-15 verifies Upstream's order, not AD-25.1's bullet, and ESC-10.5-1 has no approved decision record; the declared hook order contradicts the spine until the Maintainer rules. **fixed**: The approved Maintainer ruling and corrected AD-25.1 now agree with TEST_HOOK_ORDER and XT-contracts-15.
- **P-5** (reviewer 2, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13's consequence claims async-surface's thenableTypes() reads the list, but the body checks only resolution from package dirs, not from the tool's root or its actual return value. **fixed**: XT-contracts-13 now checks the actual repository-root tool return value, including identity with the contracts export and exclusion of the fallback array.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"b81fbdf25dd40b13ca5fcbf3d21c9770b57dfa2e","base":"2482c9a75b477055687b8717c45cf90440562e7d","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T18:47:56.148Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and none are changed.","findings":[]},{"id":"F-2","result":"pass","note":"The added tests use exact list, order and diagnostic comparisons; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The Story relies on no Oracle error fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"The test bodies cover the declared seams, and the integration assertion and corrected citations address prior defects. However, P-3's required Upstream inputs remain absent.","findings":[{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"Supply InteractsWithTestCaseLifecycle.php and the View state concerns, Factory.php and compiler sources read by XT-contracts-14 and XT-contracts-15. Only ManagesLoops.php is supplied among these inputs, so exhaustive state/helper coverage and the lifecycle parser cannot be independently confirmed. The approved ESC-10.5-1 ruling is now supplied, resolving that portion of P-3.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"The Story adds contracts-owned types and frozen seam data, with no implementation of another Component's behavior.","findings":[]},{"id":"F-9","result":"pass","note":"The changed framework files contain data, types and re-exports, with no async methods or callbacks requiring an asyncRoot tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13 claims async-surface's thenableTypes() reads the contracts export, but its body only resolves and imports the subpath from packages. ESC-10.5-2 explicitly reports that the actual repository-root call falls back to the tool's list. Complete the integration through the approved infrastructure route and assert that thenableTypes(REPO) returns the contracts export.","fixed":true,"note":"ESC-10.5-2 records the approved integration fix; XT-contracts-13 now calls thenableTypes from the repository root and asserts contracts-array identity."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13 cites AD-6.9 for its PromiseLike declaration scanner, but that bullet specifies terminal awaiting and lint enforcement of async thenable returns. The scanner verifies neither. Cite ESC-6.1-1 for this check and add a corresponding check if retaining the AD-6.9 token.","fixed":true,"note":"The scanner consequence now cites ESC-6.1-1 item 2 and no longer cites AD-6.9."},{"id":"P-3","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"Supply the Upstream lifecycle source used by XT-contracts-15 and the View state concerns, Factory and compiler sources used by XT-contracts-14. Except for ManagesLoops, these inputs are not shown, so the declared hook order, state coverage and exhaustive helper names cannot be independently confirmed. Also supply the approved ESC-10.5-1 ruling if relying on it to replace AD-25's stated order; the prompt contains only the unresolved escalation.","fixed":false,"note":"The approved ESC-10.5-1 ruling is supplied, but the requested lifecycle and View sources other than ManagesLoops remain absent."},{"id":"P-4","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-15 verifies Upstream's order, not AD-25.1's bullet, and ESC-10.5-1 has no approved decision record; the declared hook order contradicts the spine until the Maintainer rules.","fixed":true,"note":"The approved Maintainer ruling and corrected AD-25.1 now agree with TEST_HOOK_ORDER and XT-contracts-15."},{"id":"P-5","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13's consequence claims async-surface's thenableTypes() reads the list, but the body checks only resolution from package dirs, not from the tool's root or its actual return value.","fixed":true,"note":"XT-contracts-13 now checks the actual repository-root tool return value, including identity with the contracts export and exclusion of the fallback array."}]}
```

### Reviewer 2: reject at tree b81fbdf25dd40b13ca5fcbf3d21c9770b57dfa2e

Reviewed by `claude` (model `claude-sonnet-5-5`) for a `claude` loop, against base `2482c9a75b477055687b8717c45cf90440562e7d`, on 2026-10-24T18:47:56.148Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests changed. |
| F-2: No expected value is weakened | n/a | No Ported Test expected values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | No Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Most claims are verified and the earlier consequence mismatches are fixed (AD-6.8 and ESC-6.1-1 cited, thenableTypes(REPO) asserted, ESC-10.5-1 approved and AD-25.1 matches). However, the Upstream sources XT-contracts-14 and XT-contracts-15 read are not in the prompt. |
| F-8: No stub, fake or partial implementation of another Component | pass | Changes stay in packages/contracts (types and constant lists); no stub of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tags in changed files; new exports are a constant list and types, doing no IO and taking no callback, so none need tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request files changed. |

Findings:

- **F-7** `packages/contracts/tests/xaravel/seams.test.ts`: The prompt lacks Upstream InteractsWithTestCaseLifecycle.php (XT-contracts-15), View/Concerns/ManagesLayouts, ManagesStacks, ManagesComponents and ManagesFragments, View/Factory.php, and the View/Compilers sources including BladeCompiler.php (XT-contracts-14). Only ManagesLoops is shown. The hook order, state-property coverage and the 34 $__env helper names cannot be confirmed. Supply these sources. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 claims async-surface's thenableTypes() reads the contracts export, but its body only resolves and imports the subpath from packages. ESC-10.5-2 explicitly reports that the actual repository-root call falls back to the tool's list. Complete the integration through the approved infrastructure route and assert that thenableTypes(REPO) returns the contracts export. **fixed**: XT-contracts-13 now runs thenableTypes(REPO) in a child bun and asserts it returns the contracts array; the tool change is covered by approved ESC-10.5-2 (tool files are outside this Story's shown scope).
- **P-2** (reviewer 1, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 cites AD-6.9 for its PromiseLike declaration scanner, but that bullet specifies terminal awaiting and lint enforcement of async thenable returns. The scanner verifies neither. Cite ESC-6.1-1 for this check and add a corresponding check if retaining the AD-6.9 token. **fixed**: The consequence now cites AD-6.8 (NotPromise) and ESC-6.1-1 item 2 (PromiseLike scanner), not AD-6.9.
- **P-3** (reviewer 1, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: Supply the Upstream lifecycle source used by XT-contracts-15 and the View state concerns, Factory and compiler sources used by XT-contracts-14. Except for ManagesLoops, these inputs are not shown, so the declared hook order, state coverage and exhaustive helper names cannot be independently confirmed. Also supply the approved ESC-10.5-1 ruling if relying on it to replace AD-25's stated order; the prompt contains only the unresolved escalation. **not fixed**: ESC-10.5-1 approved decision is now shown, but the Upstream lifecycle, View concern, Factory and compiler sources are still not in the prompt.
- **P-4** (reviewer 2, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-15 verifies Upstream's order, not AD-25.1's bullet, and ESC-10.5-1 has no approved decision record; the declared hook order contradicts the spine until the Maintainer rules. **fixed**: ESC-10.5-1 is approved, AD-25.1 now states Upstream's order, and TEST_HOOK_ORDER and the test match it.
- **P-5** (reviewer 2, F-7) `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13's consequence claims async-surface's thenableTypes() reads the list, but the body checks only resolution from package dirs, not from the tool's root or its actual return value. **fixed**: The body now checks the tool's actual return value from REPO, matching the consequence.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"b81fbdf25dd40b13ca5fcbf3d21c9770b57dfa2e","base":"2482c9a75b477055687b8717c45cf90440562e7d","cli":"claude","model":"claude-sonnet-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T18:47:56.148Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests changed.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test expected values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted markers.","findings":[]},{"id":"F-6","result":"n/a","note":"No Oracle fixtures.","findings":[]},{"id":"F-7","result":"fail","note":"Most claims are verified and the earlier consequence mismatches are fixed (AD-6.8 and ESC-6.1-1 cited, thenableTypes(REPO) asserted, ESC-10.5-1 approved and AD-25.1 matches). However, the Upstream sources XT-contracts-14 and XT-contracts-15 read are not in the prompt.","findings":[{"path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"The prompt lacks Upstream InteractsWithTestCaseLifecycle.php (XT-contracts-15), View/Concerns/ManagesLayouts, ManagesStacks, ManagesComponents and ManagesFragments, View/Factory.php, and the View/Compilers sources including BladeCompiler.php (XT-contracts-14). Only ManagesLoops is shown. The hook order, state-property coverage and the 34 $__env helper names cannot be confirmed. Supply these sources.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Changes stay in packages/contracts (types and constant lists); no stub of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tags in changed files; new exports are a constant list and types, doing no IO and taking no callback, so none need tags.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request files changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13 claims async-surface's thenableTypes() reads the contracts export, but its body only resolves and imports the subpath from packages. ESC-10.5-2 explicitly reports that the actual repository-root call falls back to the tool's list. Complete the integration through the approved infrastructure route and assert that thenableTypes(REPO) returns the contracts export.","fixed":true,"note":"XT-contracts-13 now runs thenableTypes(REPO) in a child bun and asserts it returns the contracts array; the tool change is covered by approved ESC-10.5-2 (tool files are outside this Story's shown scope)."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13 cites AD-6.9 for its PromiseLike declaration scanner, but that bullet specifies terminal awaiting and lint enforcement of async thenable returns. The scanner verifies neither. Cite ESC-6.1-1 for this check and add a corresponding check if retaining the AD-6.9 token.","fixed":true,"note":"The consequence now cites AD-6.8 (NotPromise) and ESC-6.1-1 item 2 (PromiseLike scanner), not AD-6.9."},{"id":"P-3","reviewer":1,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"Supply the Upstream lifecycle source used by XT-contracts-15 and the View state concerns, Factory and compiler sources used by XT-contracts-14. Except for ManagesLoops, these inputs are not shown, so the declared hook order, state coverage and exhaustive helper names cannot be independently confirmed. Also supply the approved ESC-10.5-1 ruling if relying on it to replace AD-25's stated order; the prompt contains only the unresolved escalation.","fixed":false,"note":"ESC-10.5-1 approved decision is now shown, but the Upstream lifecycle, View concern, Factory and compiler sources are still not in the prompt."},{"id":"P-4","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-15 verifies Upstream's order, not AD-25.1's bullet, and ESC-10.5-1 has no approved decision record; the declared hook order contradicts the spine until the Maintainer rules.","fixed":true,"note":"ESC-10.5-1 is approved, AD-25.1 now states Upstream's order, and TEST_HOOK_ORDER and the test match it."},{"id":"P-5","reviewer":2,"item":"F-7","path":"packages/contracts/tests/xaravel/seams.test.ts","detail":"XT-contracts-13's consequence claims async-surface's thenableTypes() reads the list, but the body checks only resolution from package dirs, not from the tool's root or its actual return value.","fixed":true,"note":"The body now checks the tool's actual return value from REPO, matching the consequence."}]}
```

## Auto Run Result

Status: done

- **Summary.** Second pass after ESC-10.5-1 (Maintainer, Option 1: AD-25 corrected to Upstream's hook order) and ESC-10.5-2 (orchestrator, Option 1: `thenableTypes(root)` resolves `@xaravel/contracts/async` from `packages/contracts`). The first pass's build stands; this pass only changes tests and comments.
- **Files.**
  - `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13 asserts the tool's return value from the repository root through a child `bun` (`toolThenableSource`), so the test never imports the tool or `oxc-parser`; XT-contracts-15's consequence and the header cite the corrected AD-25 and the approved ESC-10.5-1.
  - `packages/contracts/src/async/index.ts`, `src/testing/index.ts`, `README.md`: comments that said root resolution waits on ESC-10.5-2, or that the order is under ESC-10.5-1 Option 1, now state the rulings.
- **Verification.**
  - `XARAVEL_UPSTREAM=require bun run harness --xaravel --id 'XT-contracts-*'`: 16 of 16 pass.
  - `typecheck`, `lint`, `graph:check`, `registration:check`, `escalations:check` and `async-surface --all --check` each exit 0; no `async-surface.json` changed.
  - `api-surface --details contracts`: 765 matched, 0 unexplained.
  - `bun run harness`: XARAVEL 361 tests (356 passed, 5 skipped); 11 Variants (4 run, 7 NOT-RUN); differ=0.
- **Fidelity Review.** Both reviewers reject at tree b81fbdf25dd40b13ca5fcbf3d21c9770b57dfa2e on F-7 missing evidence only (the prompt does not show the Upstream lifecycle, View concern, `Factory` and compiler sources XT-contracts-14 and -15 read through the test's `ILLUMINATE` path). Every earlier defect finding (P-1, P-2, P-4, P-5) is marked fixed by both. `fidelity:review status` reports the verdicts `current` as evidence-gap rejects (MAINT-2026-10-24), which count as passes.
- **Residual risks.** The scanner is lexical (a regex literal after `)` or `}`, or a decorator with type arguments, can mislead it). The prompt's evidence gap for XT-contracts-14/-15 is a Fidelity Review tool limitation, like ESC-10.4-2's; a tool change would show those sources.
