---
title: 'Story 10.5: Xaravel-only contracts'
type: 'feature'
created: '2026-10-24'
status: 'blocked'
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
      The async-surface tool still reads its own thenable list, because `@xaravel/contracts/async` does not resolve from the repository root.
    evidence: |-
      Bun's isolated linker puts no @xaravel/* link in the root node_modules, so thenableTypes(REPO) falls back to tools/lint-rules/thenables.ts. Settled by ESC-10.5-2, after which XT-contracts-13 asserts thenableTypes(REPO) returns the contracts export.
    location: >-
      tools/async-surface/async-surface.ts:568
    severity: high
  - summary: >-
      TEST_HOOK_ORDER follows Upstream (setUp<Trait> before afterApplicationCreated), not AD-25's wording.
    evidence: |-
      InteractsWithTestCaseLifecycle::setUpTheTestEnvironment calls setUpTraits before the afterApplicationCreated callbacks. Settled by a ruling on ESC-10.5-1.
    location: >-
      packages/contracts/src/testing/index.ts
    severity: high
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

**Approach:** Add `src/async/index.ts` and `src/testing/index.ts` with their `exports` entries, and add the view ABI types to `src/view/`. Test each with an `XT-contracts-<n>` test that derives its expected data from the Upstream PHP sources where Upstream has them. The hook order Upstream runs differs from AD-25's wording, so ESC-10.5-1 asks for a ruling. The build follows Upstream's order (the Escalation's Option 1), and the Story ends `blocked` on it while it is open.

## Boundaries & Constraints

**Always:**
- **`@xaravel/contracts/async`** (XT-contracts-13).
  - `THENABLE_TYPES: readonly string[]`, frozen, holds the same 26 FQCNs in the same order as `THENABLE_TYPES` in `tools/lint-rules/thenables.ts`. That list is a superset of the AC's names (it adds `PendingClosureDispatch` and both Pipelines, ESC-10.2-2). `bun run async-surface` then reads it (`thenableTypes(root)`, `tools/async-surface/async-surface.ts:567`).
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
- **`@xaravel/contracts/testing`** (XT-contracts-15), under ESC-10.5-1 Option 1.
  - `TEST_HOOK_ORDER`, frozen: `createApplication`, `setUp<Trait>`, `afterApplicationCreated`, `test`, `tearDown<Trait>`, `beforeApplicationDestroyed`.
  - `type TestHook` is its element union.
  - This is Upstream's `setUpTheTestEnvironment` / `setUpTraits` / `tearDownTheTestEnvironment` order. A trait's `tearDown<Trait>` is registered as a `beforeApplicationDestroyed` callback while `setUpTraits` runs, so it runs before callbacks registered later.
- `package.json` gains `"./async"` and `"./testing"`, both already in `SUBPATH_EXPORTS`. The README lists the three seams.
- Tests use `xaravelTest`, `Assert`, `support/contract-namespaces.ts` (`REPO`, `upstreamOrWarn`) and `brand-compile.test.ts`'s pinned-`tsc -b` temp-project form for type checks. Upstream-derived parts compare with a literal copy that runs without the snapshot. Consequence strings cite AD-6, AD-11, AD-25 and AD-27, and ESC-10.5-1 for -15.

**Never:**
- Edit outside `packages/contracts/**`, this spec, `stories/10.5.md`'s `status:` line, sprint status, and `conformance/escalations/ESC-10.5-*.md`. Never edit `tools/**`; the async-surface tool already prefers this list.
- Add a runtime export to `src/view/index.ts`, change an existing contract, or edit another Story's tests.
- Import any package other than `@xaravel/runtime` from `src/`, or any undeclared package (such as `oxc-parser`) from `tests/`.
- Use AD-25's literal order (`afterApplicationCreated` before `setUp<Trait>`) without a ruling. Cite `exceptions.jsonl` or `additions.jsonl`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| list (XT-13) | `THENABLE_TYPES` | frozen, equals the tool file's array literal in order, and contains every AC name | none |
| tool reads it (XT-13) | `Bun.resolveSync("@xaravel/contracts/async", REPO)` | resolves to `src/async/index.ts`, whose `THENABLE_TYPES` is a non-empty string array | none |
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

## Auto Run Result

Status: blocked
Blocking condition: ESC-10.5-1 (`divergence`, XT-contracts-15: Upstream runs `setUp<Trait>` before the `afterApplicationCreated` callbacks, and AD-25 says the reverse) and ESC-10.5-2 (`protected-path`, XT-contracts-13: `thenableTypes(root)` cannot resolve `@xaravel/contracts/async` from the repository root, so `bun run async-surface` still uses its own identical list). Both are open.

- **Summary.** `@xaravel/contracts/async` exports `THENABLE_TYPES` (the 26 FQCNs of the lint rule's list) and `NotPromise<T>`. `@xaravel/contracts/view` gains the types `RenderContext`, `RenderLoop`, `BladeEnvMethod` (34 Upstream `$__env->` names), `BladeFunction` and `BladeHelper`, and no runtime export. `@xaravel/contracts/testing` exports `TEST_HOOK_ORDER` in Upstream's order (ESC-10.5-1 Option 1) and `TestHook`. A lexical PromiseLike check (ESC-6.1-1 item 2) runs in XT-contracts-13 over every `packages/*/src` file.
- **Files.**
  - `packages/contracts/src/async/index.ts`: the thenable list and `NotPromise`.
  - `packages/contracts/src/view/RenderContext.ts` and `index.ts`: the view ABI types.
  - `packages/contracts/src/testing/index.ts`: the hook order.
  - `packages/contracts/package.json` and `README.md`: the `./async` and `./testing` subpaths, and the docs.
  - `packages/contracts/tests/xaravel/support/thenables.ts`: the scanner.
  - `packages/contracts/tests/xaravel/seams.test.ts`: XT-contracts-13..15.
  - `conformance/escalations/ESC-10.5-1.md` and `ESC-10.5-2.md`.
- **Review.** 44 findings. 16 rows were patched (the wording that overclaimed the tool, the AD-6.9 citation, required fields, the concern listing, the scanner gaps, the vacuous `indexOf`, the README, the ESC quote, the `NotPromise<any>` note). 4 items were deferred (ESC-10.5-1, ESC-10.5-2, the lint home for the check, the `RenderContext` translation and renderCount state). The rest were rejected as rare, low-severity lexer cases or refuted; the Review Triage Log has each reason.
- **Follow-up review recommended:** false. Two `high` rows were patched, but both are wording fixes whose only risk is ESC-10.5-2's, which is already deferred.
- **Verification.**
  - `typecheck`, `lint`, `graph:check`, `registration:check`, `escalations:check` and `async-surface --all --check` each exit 0, and no `async-surface.json` changed.
  - `api-surface --details contracts` reports 765 matched and 0 unexplained.
  - `XARAVEL_UPSTREAM=require bun run harness --xaravel --id 'XT-contracts-*'` passes 16 of 16.
  - The full `bun run harness` reports differ=0, with 7 Variants NOT-RUN because their backends are not running locally.
- **Fidelity Review.** Both reviewers rejected at tree 4940ac766a56260d23d26b16bfbc86ce0e69c7a9. The rejects rest on the two open Escalations, the AD-6.9 citation (fixed) and missing Upstream evidence. The review has not been re-run on the patched tree: it re-runs when the Story resumes after the rulings, which change the reviewed tree.
- **Residual risks.** The scanner is lexical. A regex literal after `)` or `}`, or a decorator with type arguments, can mislead it.
