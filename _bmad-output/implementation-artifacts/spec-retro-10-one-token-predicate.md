---
title: 'One contract-token predicate on each side of the grader line, pinned equal; one brand descriptor and one token-name rule in both doubles (epic-10-retro-item-4)'
type: 'refactor'
created: '2026-10-24'
status: 'done'
baseline_revision: 'efce8fa7087415a1459aef8365bc408a9cfe0a35'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/decisions/MAINT-2026-10-24-epic-10-items.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-retro-2026-10-24.md'
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Five "is this a contract token" predicates disagree (retro L7): `contract()` (own FQCN + `hasInstance`), `canonical.ts` (frozen + own FQCN), assert's and Mockery's (any object with a function `hasInstance`), runtime's `tokenFqcn` (frozen, own non-writable string), and a copy in `aliases.test.ts`. A forged object is refused by `contract()` and accepted by `aliasResolver`. The two doubles also define brand getters differently (assert `configurable: false`, Mockery `true`, L8), and name a token with no FQCN differently (assert `class@anonymous`, Mockery its brand's description).

**Approach:** The Maintainer's route (`decisions/MAINT-2026-10-24-epic-10-items.md`, Item 4). The definition: a token is a frozen, non-function object whose own `Symbol.for('xaravel.class.fqcn')` property is a non-writable string data property. `packages/runtime` exports `isContractToken` beside `tokenFqcn`, and runtime and `packages/contracts` use it. `@xaravel/assert` keeps the one grader-side copy, and Mockery imports it. One XT test feeds both the same values and asserts they agree. Both doubles share one brand definer and one token-name rule from assert's `ContractParents.ts`.

## Boundaries & Constraints

**Always:** Change only `packages/runtime`, `packages/contracts`, `packages/assert` and `packages/mockery`, plus this item's records. Grader isolation (AD-15): assert and Mockery import nothing from `@xaravel/runtime` or `@xaravel/contracts`. Both predicates find the key through `Symbol.for`. A genuine `contract()` token stays a token everywhere, and every existing XT assertion keeps its strength. Test fixtures may be made genuine: frozen, with an own FQCN.

**Never:** Change `conformance/expectations/**`, `tools/**`, an item's `action`, or any Protected Path outside these packages. Never add a third predicate. A refusal check that throws on a malformed token is not a predicate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Genuine token | `contract("A\\B", {})`, any exported token | both predicates `true`; `fqcn` is the FQCN; both doubles accept it | none |
| Unfrozen forged | `{[FQCN]: "A\\B", [Symbol.hasInstance]: f}` | both `false`; `contract()` parent refused (TypeError); alias extra token refused | as today |
| Accessor or unfrozen FQCN | frozen object whose FQCN is a getter; a sealed (not frozen) object with a writable FQCN | both `false` | — |
| Non-string FQCN | frozen `{[FQCN]: 1}` | both `false` | — |
| Inherited FQCN | frozen `Object.create(token)` | both `false` | — |
| Function | frozen function carrying an own FQCN | both `false` (a class) | — |
| Primitives / null | `null`, `"A\\B"`, a symbol | both `false` | — |
| Empty FQCN | frozen `{[FQCN]: ""}` | both `true`; each double refuses it, as no name | assert TypeError, Mockery `InvalidDoubleTargetException` "carries no FQCN" |
| Brand-only object in Mockery | `{[Symbol.for("XtBranded")]: true, [Symbol.hasInstance]: f}` | not a token, so the brand-description name is gone; `Double.for` refuses it | `InvalidDoubleTargetException` (as the no-brand case already does) |
| Shared parent in an intersection | Mockery `Double.for(A, B)`, where A and B extend P | P's brand is defined once and the double is `instanceof` P | no redefine error |

</intent-contract>

## Code Map

- `packages/runtime/src/registry/registry.ts:50,104-142` -- `CLASS_FQCN`; `fqcn()`; private `tokenFqcn` (frozen, own non-writable string). Add an exported `isContractToken(value: unknown): value is object` holding the definition. `tokenFqcn` uses it.
- `packages/runtime/src/registry/index.ts:18`, `packages/runtime/src/index.ts:108` -- export lists; add `isContractToken`.
- `packages/contracts/src/Contract.ts:79-102` -- private `isContractToken` (own FQCN + `hasInstance`), used by `copyParents`. Replace it with runtime's, keeping the `ContractToken<object>` narrowing through a typed wrapper or cast at the call. `contract()` tokens are frozen with a non-writable FQCN (`Contract.ts:169-187`).
- `packages/contracts/src/aliases/canonical.ts:116-119` -- private `isToken`. Replace it with runtime's. Its callers are in `canonical.ts` (≈`:125-215`).
- `packages/contracts/tests/xaravel/aliases.test.ts:76-83,100-104` -- the test's own predicate (and the display check `Object.hasOwn(value, CLASS_FQCN)`). Use runtime's `isContractToken`.
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts:25,50-53` -- the only grader `CONTRACT_PARENTS` declaration (Mockery has none). The loose `isContractToken` becomes the ruled definition. Add `contractTokenName(token): string | null` (own FQCN, `null` when empty) and `defineContractBrand(prototype, brand)`: an own getter returning `true`, `enumerable: false`, `configurable: false`, skipped when the prototype already owns the key.
- `packages/assert/src/index.ts:37,109` -- export `isContractToken`, `contractTokenName` and `defineContractBrand` for Mockery.
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts:265-283,493-498` -- the token branch and its `classNameOfClass` naming; the brand `defineProperty` calls. Use `contractTokenName` (refusing `null` with the existing "needs a class or a contract token" TypeError, plus a no-FQCN note) and `defineContractBrand`.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:40-69,170` -- the `ContractToken` interface, the loose `isContractToken`, and `tokenName` with its brand-description fallback. Use assert's predicate and `contractTokenName`. An object with an own function `Symbol.hasInstance` that is no token is refused with `InvalidDoubleTargetException` (a refusal, not a predicate).
- `packages/mockery/src/JMac/Testing/Double.ts:32,50` -- `isOptions` excludes tokens. Use assert's predicate, and do not read a malformed token as an options bag.
- `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts:159-164` -- brand getters with `configurable: true`, defined once per intersection target. Use `defineContractBrand`.
- `packages/mockery/tests/xaravel/mockery.test.ts:1014-1017` -- pins the brand-description fallback. Its assertion becomes: the brand-only object is refused with `InvalidDoubleTargetException`, as the next line's no-brand object is.
- Test fixtures that must be genuine to stay tokens: `packages/assert/tests/xaravel/{parent-brands,inherited-methods,typed-doubles}.test.ts`, `double-cells.ts`; `packages/mockery/tests/xaravel/{parent-brands,inherited-methods}.test.ts`, `double-scenarios.ts`. Check that each is frozen with an own data FQCN. Tokens in `operands.ts` and `expectation-cells.ts` feed only `instanceof` and naming, not the doubles: leave them.
- `packages/assert/src/comparison/PhpValues.ts:160-171` -- `classNameOfClass`: read only, unchanged.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/registry/registry.ts`, `registry/index.ts`, `src/index.ts` -- export `isContractToken` and route `tokenFqcn` through it -- runtime side's single predicate.
- `packages/contracts/src/Contract.ts`, `src/aliases/canonical.ts`, `tests/xaravel/aliases.test.ts` -- delete their predicates and import runtime's -- L7.
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts`, `src/index.ts`, `Generator/Generator.ts` -- the ruled grader copy, `contractTokenName`, `defineContractBrand`; Generator uses them -- L7, L8.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts`, `Double.ts`, `Engine/ClassGenerator.ts` -- use assert's three helpers, and drop the local predicate and the brand-description fallback -- L7, L8.
- Fixture files listed in the Code Map -- make each double-target fixture genuine where it is not; `mockery.test.ts:1014-1016` asserts the refusal -- the stricter definition.
- `packages/contracts/tests/xaravel/token-predicate.test.ts` (new, XT-contracts-20) -- every row of the matrix through both `@xaravel/runtime`'s and `@xaravel/assert`'s `isContractToken`, which must agree on each value; every exported token passes both -- the pin the ruling asks for.
- `packages/assert/tests/xaravel/` and `packages/mockery/tests/xaravel/` (one new XT each, XT-assert-100 and XT-mockery-15) -- the empty-FQCN refusal; the brand descriptor (`configurable: false`, non-enumerable getter, true) on own and parent brands; Mockery's shared-parent intersection.

**Acceptance Criteria:**
- Given the five old predicates, when `grep -rn "function isContractToken\|function isToken" packages/*/src packages/*/tests` runs, then it finds exactly two definitions: runtime's `registry.ts` and assert's `ContractParents.ts`.
- Given XT-contracts-20, when it runs, then both predicates agree on every matrix value and every exported token.
- Given a double of a contract token in assert and in Mockery, when its prototype's own and parent brand descriptors are read, then both are `{get, set: undefined, enumerable: false, configurable: false}`.
- Given the full `bun run harness`, `bun run typecheck` and `bun run lint`, when run, then there are no differences and no errors.

## Spec Change Log

## Review Triage Log

### 2026-10-24 — Review pass
- verdicts: 31 findings — high 0, medium 4, low 15, false 12, maybe-false 0
- Edge Case Hunter:
  - `[medium]` `patch` `refuseMalformedToken` reads only an own `Symbol.hasInstance`, so `Double.for(Object.freeze(Object.create(token)))` becomes a partial double of Object. Fixed: it now reads `Symbol.hasInstance` through [[Get]], and XT-mockery-15 has a row for it.
  - `[low]` `reject` A real instance with an own function `Symbol.hasInstance`, passed as the last `Double.for` argument, is refused. Not reachable in everyday use: an instance with an own `hasInstance` is not a realistic target.
  - `[low]` `reject` `contract()` accepts a frozen parent with an empty FQCN. Only a forged object can be that parent, and both doubles refuse it later with a clear error.
  - `[false]` `reject` `contract()` should keep a `Symbol.hasInstance` requirement on parents. The ruled definition has none (MAINT-2026-10-24 Item 4). `aliasResolver`'s `isDeepToken` adds `hasInstance` as a capability it calls, on top of the one predicate, not as another definition.
  - `[false]` `reject` Mockery's malformed-token refusal and assert's generic refusal classify differently. Each package throws its own exception type, as both did before. The predicate both use is the same one.
- Blind Hunter:
  - `[medium]` `patch` Loose `Symbol.hasInstance` token checks remain in `Signature.ts:106` `lookupClass` and Mockery `classes.ts:97` `lookupContract`. Fixed: both use the grader's `isContractToken`, with lookup rows in XT-assert-100 and XT-mockery-15. `Constraints.ts:295` (`classOrInterface`) is rejected: it is `assertInstanceOf`'s check for an `instanceof` right-hand side, and it calls `Symbol.hasInstance`. It is the ESC-4.3-1 interface-token protocol, not a contract-token definition, and changing it would change the grader's `assertInstanceOf`.
  - `[low]` `patch` Stale comments in `classes.ts:15`, `TypeMatcher.ts:10` and `Assert.ts:77`. Reworded.
  - `[low]` `reject` Mockery has no refusal for frozen non-tokens that lack `hasInstance` (accessor or numeric FQCN). They have no token shape, so a double of them as an instance is the existing behaviour for any plain object.
  - `[low]` `patch` (with the verification gap below) `contract()` accepting a hasInstance-less parent is not pinned. A row was added to XT-contracts-20.
  - `[low]` `reject` A parent that fails the stricter predicate raises `parentsClosure`'s raw TypeError in Mockery. That is pre-existing behaviour for a non-token parent.
  - `[low]` `reject` The empty-FQCN message does not name the child token. Cosmetic.
  - `[low]` `patch` The refusal message is not asserted. Assertions that the message contains "no contract token" were added.
  - `[low]` `reject` Mockery's `ContractToken` type was widened to `object`. It is a type-level nicety. A structural type would need a new public type export.
  - `[low]` `patch` `contractTokenName` reads the FQCN through [[Get]]. It now reads the own data descriptor.
  - `[low]` `reject` `contracts` narrows runtime's predicate two ways (a cast and a typed alias). Cosmetic: both call the one function.
  - `[low]` `reject` A revoked Proxy throws in `Object.isFrozen`. Not met in everyday use.
  - `[low]` `reject` The two new XT files duplicate helpers. Test-only duplication across package boundaries, where a test may not import the other package's tests.
- Verification Gap:
  - `[medium]` `patch` Mockery's lookup path: covered by the lookup patch above, with an XT-mockery-15 row.
  - `[medium]` `patch` PHPUnit's lookup path: covered by the lookup patch above, with an XT-assert-100 row.
  - `[low]` `patch` A hasInstance-less token is not exercised past the predicate. Rows were added: a `contract()` parent in XT-contracts-20, and a Mockery double by name in XT-mockery-15.
  - `[low]` `patch` (same root cause as the first Edge Case finding) `Object.create(token)` in Mockery.
- Intent Alignment:
  - `[false]` `reject` (a) Other recognisers remain. The lookup ones were patched. `classOrInterface` and `isDeepToken` are rejected as above.
  - `[false]` `reject` (b) `contract()` and `aliasResolver` differ on a hasInstance-less token. `aliasResolver` requires the capability it calls, as above.
  - `[false]` `reject` (c) The nameless display differs in exception class. The same rule refuses it in both doubles, each with its own package's exception, as the ruling's "same display" asks: neither names it.
  - `[false]` `reject` (d) The descriptor equality is indirect. Both doubles call the one `defineContractBrand`.
  - `[false]` `reject` (e) Two Mockery expectations changed. The ruling's predicate forces both (the brand-description fallback is gone; one descriptor), neither assertion is loosened, and they are Xaravel Tests, not Ported Tests, so no DIV clause applies.
  - `[false]` `reject` (f) `Symbol.for` lookup of the predicates. The ruling's "found by their `Symbol.for` keys" means the keys the predicates read. Mockery already imports assert.
  - `[false]` `reject` (g) The old blocked note is not deleted yet. It is deleted at finalize.
- Fidelity Review (tree b3155495e5da82ad8d2d742fd776bc001b51a915): reviewer 2 pass. Reviewer 1 rejected on three missing-evidence findings only (F-7 ×2, F-9), which count as a pass under decisions/MAINT-2026-10-24-evidence-gaps.md:
  - `[false]` `reject` F-7 `packages/mockery/tests/xaravel/fixtures/double.fixture.ts` evidence gap, noted.
  - `[false]` `reject` F-7 `packages/contracts/package.json` evidence gap, noted.
  - `[false]` `reject` F-9 `registry.ts` `resolveClassAsync` body evidence gap, noted.
  - The tree changes with the patches, so the layer runs again at finalize.

### 2026-10-24 — Review pass (Finalize re-check, Fidelity Review on the patched tree)
- verdicts: 6 findings — high 0, medium 0, low 0, false 6, maybe-false 0
- Fidelity Review (tree c63139cdf17eb4afbdac5d557483cef970b54279): both reviewers rejected, each on missing-evidence findings only (F-7, F-9). `status` prints `current` (decisions/MAINT-2026-10-24-evidence-gaps.md):
  - `[false]` `reject` reviewer 1 F-7 `packages/mockery/tests/xaravel/fixtures/double.fixture.ts`: evidence gap, noted.
  - `[false]` `reject` reviewer 1 F-7 `packages/contracts/package.json`: evidence gap, noted.
  - `[false]` `reject` reviewer 1 F-9 `packages/runtime/src/registry/registry.ts` (`resolveClassAsync` body): evidence gap, noted. The function is unchanged by this item.
  - `[false]` `reject` reviewer 2 F-7 `double.fixture.ts`: the same gap, noted.
  - `[false]` `reject` reviewer 2 F-7 `packages/contracts/package.json`: the same gap, noted.
  - `[false]` `reject` reviewer 2 F-9 `registry.ts`: the same gap, noted.

## Design Notes

The ruling defines the predicate without `Symbol.hasInstance`, so it matches what `fqcn()` already reads (ESC-10.1-3). The definition drops Mockery's ESC-4.5-1 item 3 fallback, which named a token without an FQCN by its brand's description: such an object is no longer a token. The Maintainer's later ruling ("every predicate besides these two goes") supersedes that fallback. The only nameless token left is an empty FQCN, and both doubles refuse it. A frozen object can have no new brand defined on it, so `configurable: false` plus skip-if-owned is safe for intersections.

Two consequences came up during the build:
- `contract()` now imports `@xaravel/runtime/registry`. So XT-contracts-2's temp project (`brand-compile.test.ts`) type-checks with `types: ["bun"]`, as every package does (XT-conformance-9), and no longer with `types: []`. Its assertion still requires that every error be TS2420. A dependency-free runtime subpath would have changed XT-conformance-7's pinned subpath list, a Protected Path, so it was not used.
- `contract()` now accepts a genuine token without `Symbol.hasInstance` as a parent, since the ruled definition does not require one.

## Verification

**Commands:**
- `bun test packages/runtime packages/contracts packages/assert packages/mockery` -- expected: all pass
- `bun run typecheck` and `bun run lint` -- expected: exit 0
- `bun run harness` -- expected: `SUMMARY` with no differences
- `bun run harness --xaravel` -- expected: no differences

## Fidelity Review

### Reviewer 1: reject at tree b3155495e5da82ad8d2d742fd776bc001b51a915

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `efce8fa7087415a1459aef8365bc408a9cfe0a35`, on 2026-10-24T22:23:41.464Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared changed expectations with their previous values and the Maintainer's Item 4 ruling. Export-list additions, malformed-token refusal and non-configurable brands implement that ruling; the signed Oracle comparisons remain unchanged. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are added, changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff changes no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence reports no relied-on fixture with a non-null output.error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | The new predicate and double tests check their listed cases, but omitted inputs prevent confirming all touched tests' declared consequences. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and behavior with the action item's four-component scope and Item 4 ruling. Changes remain within runtime, contracts, assert and mockery; the grader uses its own predicate without importing runtime, and no other component is stubbed. |
| F-9: Every `@asyncRoot` tag is true | fail | New helpers are synchronous and need no tags. The retained Registry.resolveClassAsync tag is authorized by ESC-9.4-1, but its omitted implementation prevents confirming that it still performs the required module-loading IO. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/mockery/tests/xaravel/fixtures/double.fixture.ts`: Supply the child fixture executed by XT-mockery-7. Its source is needed to confirm that the asserted child reports verify auto-verification after the body and the declared error ordering. _(missing evidence)_
- **F-7** `packages/contracts/package.json`: Supply the exports map read by XT-contracts-20 and XT-contracts-11 so their claimed enumeration of every contracts subpath can be checked. _(missing evidence)_
- **F-9** `packages/runtime/src/registry/registry.ts`: Supply resolveClassAsync's implementation, including the module-import path it reaches. Section (g) provides only its signature and docblock, while section (h) omits the body; the retained @​asyncRoot tag cannot be verified from that evidence. _(missing evidence)_

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"b3155495e5da82ad8d2d742fd776bc001b51a915","base":"efce8fa7087415a1459aef8365bc408a9cfe0a35","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T22:23:41.464Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations with their previous values and the Maintainer's Item 4 ruling. Export-list additions, malformed-token refusal and non-configurable brands implement that ruling; the signed Oracle comparisons remain unchanged.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are added, changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff changes no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence reports no relied-on fixture with a non-null output.error.","findings":[]},{"id":"F-7","result":"fail","note":"The new predicate and double tests check their listed cases, but omitted inputs prevent confirming all touched tests' declared consequences.","findings":[{"path":"packages/mockery/tests/xaravel/fixtures/double.fixture.ts","detail":"Supply the child fixture executed by XT-mockery-7. Its source is needed to confirm that the asserted child reports verify auto-verification after the body and the declared error ordering.","kind":"missing-evidence"},{"path":"packages/contracts/package.json","detail":"Supply the exports map read by XT-contracts-20 and XT-contracts-11 so their claimed enumeration of every contracts subpath can be checked.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Compared changed paths and behavior with the action item's four-component scope and Item 4 ruling. Changes remain within runtime, contracts, assert and mockery; the grader uses its own predicate without importing runtime, and no other component is stubbed.","findings":[]},{"id":"F-9","result":"fail","note":"New helpers are synchronous and need no tags. The retained Registry.resolveClassAsync tag is authorized by ESC-9.4-1, but its omitted implementation prevents confirming that it still performs the required module-loading IO.","findings":[{"path":"packages/runtime/src/registry/registry.ts","detail":"Supply resolveClassAsync's implementation, including the module-import path it reaches. Section (g) provides only its signature and docblock, while section (h) omits the body; the retained @asyncRoot tag cannot be verified from that evidence.","kind":"missing-evidence"}]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree b3155495e5da82ad8d2d742fd776bc001b51a915

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `efce8fa7087415a1459aef8365bc408a9cfe0a35`, on 2026-10-24T22:23:41.464Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; only Xaravel Tests are touched, so there is no Upstream source to compare assertions against. |
| F-2: No expected value is weakened | pass | There are no Ported Tests. I compared each changed Xaravel Test expectation against the Maintainer's Item 4 ruling. XT-assert-3's export list only gains the three new exports. XT-mockery-7 now checks that a brand-only object is refused with InvalidDoubleTargetException instead of being named by its brand: the ruling makes a frozen own FQCN the only token test, and the exception class is still checked. XT-mockery-13's parent-brand descriptor goes from configurable true to false, as the ruling's single brand descriptor for both doubles requires. No exact comparison is loosened and no assertion is dropped. |
| F-3: No assertion is removed without a DIV clause | n/a | There are no Ported Tests in scope, so there are no Upstream assertions to count. In the touched Xaravel Tests every replaced line keeps an assertion. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is added or changed, and no skip reason is set. |
| F-5: Every `adapted` marker matches its clause | n/a | No '// adapted:DIV-<n>.<k>' marker or Expectations 'adapted' field is added (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The only fixture any touched test relies on is XT-mockery-7's, which verifies and is not an error ('error' is null). No error fixture is assigned, added or changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each body checks what its consequence string claims. XT-assert-100: own and parent brand descriptors (non-enumerable, non-configurable, getter returning true) for both mock and stub; defineContractBrand's descriptor, and that a second call is skipped (no throw, descriptor unchanged, no enumerable keys); contractTokenName giving the own FQCN, or null for an empty one; the needs-a-class-or-a-contract-token TypeError for an empty FQCN, for a nameless parent, and for a forged or brand-only object. XT-contracts-20: every edge-case row and every subpath export goes through both predicates with assertSame, the runtime predicate is the same function from both entries, and contract() and aliasResolver refuse a forged token. XT-mockery-15: shared brand descriptors, the intersection with a shared parent (instanceof and descriptor), empty-FQCN refusal as a target and as a parent, and forged or brand-only refusal as a target and as the trailing options. XT-assert-3, XT-contracts-2, XT-contracts-11, XT-mockery-7 and XT-mockery-13 still check what their consequences state. The cited AD-15.9, AD-1.1, AD-1.3, AD-1.4 and AD-10 bullets match what those tests verify. |
| F-8: No stub, fake or partial implementation of another Component | pass | The code changes are only in packages/runtime, packages/contracts, packages/assert and packages/mockery, the four components the item lists. The grader keeps its own copy of the predicate rather than importing runtime, as the ruling and AD-15 require. Mockery imports @​xaravel/assert, a grader-to-grader edge the rules allow. The grader tests use stand-in tokens, as ESC-10.1-6 allows. There is no stub, fake or hard-coded return for another component. |
| F-9: Every `@asyncRoot` tag is true | pass | No @​asyncRoot tag is added. The new exports (runtime and assert isContractToken, contractTokenName, defineContractBrand, refuseMalformedToken) are all synchronous and do no IO, so they need no tag. The one kept tag, '@​asyncRoot Registry.resolveClassAsync' (registry.ts line 175), is true under ESC-9.4-1 option 1a. Evidence (g) lists no other tags in the changed files. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"b3155495e5da82ad8d2d742fd776bc001b51a915","base":"efce8fa7087415a1459aef8365bc408a9cfe0a35","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T22:23:41.464Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and the diff adds or changes no Ported Test; only Xaravel Tests are touched, so there is no Upstream source to compare assertions against.","findings":[]},{"id":"F-2","result":"pass","note":"There are no Ported Tests. I compared each changed Xaravel Test expectation against the Maintainer's Item 4 ruling. XT-assert-3's export list only gains the three new exports. XT-mockery-7 now checks that a brand-only object is refused with InvalidDoubleTargetException instead of being named by its brand: the ruling makes a frozen own FQCN the only token test, and the exception class is still checked. XT-mockery-13's parent-brand descriptor goes from configurable true to false, as the ruling's single brand descriptor for both doubles requires. No exact comparison is loosened and no assertion is dropped.","findings":[]},{"id":"F-3","result":"n/a","note":"There are no Ported Tests in scope, so there are no Upstream assertions to count. In the touched Xaravel Tests every replaced line keeps an assertion.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is added or changed, and no skip reason is set.","findings":[]},{"id":"F-5","result":"n/a","note":"No `// adapted:DIV-<n>.<k>` marker or Expectations `adapted` field is added (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"The only fixture any touched test relies on is XT-mockery-7's, which verifies and is not an error (`error` is null). No error fixture is assigned, added or changed.","findings":[]},{"id":"F-7","result":"pass","note":"Each body checks what its consequence string claims. XT-assert-100: own and parent brand descriptors (non-enumerable, non-configurable, getter returning true) for both mock and stub; defineContractBrand's descriptor, and that a second call is skipped (no throw, descriptor unchanged, no enumerable keys); contractTokenName giving the own FQCN, or null for an empty one; the needs-a-class-or-a-contract-token TypeError for an empty FQCN, for a nameless parent, and for a forged or brand-only object. XT-contracts-20: every edge-case row and every subpath export goes through both predicates with assertSame, the runtime predicate is the same function from both entries, and contract() and aliasResolver refuse a forged token. XT-mockery-15: shared brand descriptors, the intersection with a shared parent (instanceof and descriptor), empty-FQCN refusal as a target and as a parent, and forged or brand-only refusal as a target and as the trailing options. XT-assert-3, XT-contracts-2, XT-contracts-11, XT-mockery-7 and XT-mockery-13 still check what their consequences state. The cited AD-15.9, AD-1.1, AD-1.3, AD-1.4 and AD-10 bullets match what those tests verify.","findings":[]},{"id":"F-8","result":"pass","note":"The code changes are only in packages/runtime, packages/contracts, packages/assert and packages/mockery, the four components the item lists. The grader keeps its own copy of the predicate rather than importing runtime, as the ruling and AD-15 require. Mockery imports @xaravel/assert, a grader-to-grader edge the rules allow. The grader tests use stand-in tokens, as ESC-10.1-6 allows. There is no stub, fake or hard-coded return for another component.","findings":[]},{"id":"F-9","result":"pass","note":"No @asyncRoot tag is added. The new exports (runtime and assert isContractToken, contractTokenName, defineContractBrand, refuseMalformedToken) are all synchronous and do no IO, so they need no tag. The one kept tag, `@asyncRoot Registry.resolveClassAsync` (registry.ts line 175), is true under ESC-9.4-1 option 1a. Evidence (g) lists no other tags in the changed files.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree c63139cdf17eb4afbdac5d557483cef970b54279

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `efce8fa7087415a1459aef8365bc408a9cfe0a35`, on 2026-10-24T22:31:27.561Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test. |
| F-2: No expected value is weakened | pass | Compared changed expectations with the supplied Oracle output and Item 4 ruling. Oracle comparisons remain intact; token refusals, export additions and the shared brand descriptor follow the ruling without loosening comparisons. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no relied-on fixture with a non-null output.error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared touched Xaravel Test bodies and helpers with their consequences. The new token cases cover their stated checks, but P-1 and P-2 remain unresolved because their required inputs are absent. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and behavior with the four authorized components and Item 4 ruling. The refactor stays within that scope and introduces no implementation of another component. |
| F-9: Every `@asyncRoot` tag is true | fail | Compared new synchronous helpers and retained tags with AD-6, DIV-1 and ESC-9.4-1. The new helpers need no tag, but the retained registry root's implementation is still omitted. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

- **F-7** `packages/mockery/tests/xaravel/fixtures/double.fixture.ts`: Supply the child fixture executed by XT-mockery-7 so its auto-verification timing, reports and error ordering can be confirmed. Its source remains absent from this prompt. _(missing evidence)_
- **F-7** `packages/contracts/package.json`: Supply the exports map consumed by XT-contracts-20 and XT-contracts-11 so enumeration of every contracts subpath can be checked. This manifest remains absent from the prompt. _(missing evidence)_
- **F-9** `packages/runtime/src/registry/registry.ts`: Supply resolveClassAsync's implementation and the module-import path it reaches. Its signature, docblock and authorizing ruling alone do not verify the retained @​asyncRoot Registry.resolveClassAsync tag; P-3 remains unresolved. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/fixtures/double.fixture.ts`: Supply the child fixture executed by XT-mockery-7. Its source is needed to confirm that the asserted child reports verify auto-verification after the body and the declared error ordering. **not fixed**: The child fixture source is not supplied; the calling helper and expected child reports do not establish its behavior.
- **P-2** (reviewer 1, F-7) `packages/contracts/package.json`: Supply the exports map read by XT-contracts-20 and XT-contracts-11 so their claimed enumeration of every contracts subpath can be checked. **not fixed**: The contracts package exports map is not supplied; the enumeration helpers still read an unseen manifest.
- **P-3** (reviewer 1, F-9) `packages/runtime/src/registry/registry.ts`: Supply resolveClassAsync's implementation, including the module-import path it reaches. Section (g) provides only its signature and docblock, while section (h) omits the body; the retained @​asyncRoot tag cannot be verified from that evidence. **not fixed**: resolveClassAsync still appears only as a signature and docblock; its implementation and import path remain omitted.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"c63139cdf17eb4afbdac5d557483cef970b54279","base":"efce8fa7087415a1459aef8365bc408a9cfe0a35","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-24T22:31:27.561Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test.","findings":[]},{"id":"F-2","result":"pass","note":"Compared changed expectations with the supplied Oracle output and Item 4 ruling. Oracle comparisons remain intact; token refusals, export additions and the shared brand descriptor follow the ruling without loosening comparisons.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no relied-on fixture with a non-null output.error.","findings":[]},{"id":"F-7","result":"fail","note":"Compared touched Xaravel Test bodies and helpers with their consequences. The new token cases cover their stated checks, but P-1 and P-2 remain unresolved because their required inputs are absent.","findings":[{"path":"packages/mockery/tests/xaravel/fixtures/double.fixture.ts","detail":"Supply the child fixture executed by XT-mockery-7 so its auto-verification timing, reports and error ordering can be confirmed. Its source remains absent from this prompt.","kind":"missing-evidence"},{"path":"packages/contracts/package.json","detail":"Supply the exports map consumed by XT-contracts-20 and XT-contracts-11 so enumeration of every contracts subpath can be checked. This manifest remains absent from the prompt.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Compared changed paths and behavior with the four authorized components and Item 4 ruling. The refactor stays within that scope and introduces no implementation of another component.","findings":[]},{"id":"F-9","result":"fail","note":"Compared new synchronous helpers and retained tags with AD-6, DIV-1 and ESC-9.4-1. The new helpers need no tag, but the retained registry root's implementation is still omitted.","findings":[{"path":"packages/runtime/src/registry/registry.ts","detail":"Supply resolveClassAsync's implementation and the module-import path it reaches. Its signature, docblock and authorizing ruling alone do not verify the retained @asyncRoot Registry.resolveClassAsync tag; P-3 remains unresolved.","kind":"missing-evidence"}]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/fixtures/double.fixture.ts","detail":"Supply the child fixture executed by XT-mockery-7. Its source is needed to confirm that the asserted child reports verify auto-verification after the body and the declared error ordering.","fixed":false,"note":"The child fixture source is not supplied; the calling helper and expected child reports do not establish its behavior."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/package.json","detail":"Supply the exports map read by XT-contracts-20 and XT-contracts-11 so their claimed enumeration of every contracts subpath can be checked.","fixed":false,"note":"The contracts package exports map is not supplied; the enumeration helpers still read an unseen manifest."},{"id":"P-3","reviewer":1,"item":"F-9","path":"packages/runtime/src/registry/registry.ts","detail":"Supply resolveClassAsync's implementation, including the module-import path it reaches. Section (g) provides only its signature and docblock, while section (h) omits the body; the retained @asyncRoot tag cannot be verified from that evidence.","fixed":false,"note":"resolveClassAsync still appears only as a signature and docblock; its implementation and import path remain omitted."}]}
```

### Reviewer 2: reject at tree c63139cdf17eb4afbdac5d557483cef970b54279

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `efce8fa7087415a1459aef8365bc408a9cfe0a35`, on 2026-10-24T22:31:27.561Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests and framework/grader source change. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so there are no Upstream expected values to compare. Two Xaravel Test expectations change. XT-mockery-13's descriptor goes from configurable true to false, now pinned with an exact value. XT-mockery-7's brand-only object is now refused with InvalidDoubleTargetException. Both follow the Item 4 ruling: one brand descriptor for both doubles, and a token is a frozen object with an own non-writable string FQCN. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed, so no Upstream assertion count applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is changed and no skip is added. |
| F-5: Every `adapted` marker matches its clause | n/a | Evidence (a): no added adapted:DIV marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | pass | The only fixture relied on is XT-mockery-7's. It is present, verified and error:null. No changed fixture is an error. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | P-1 and P-2 are still unfixed. The double.fixture.ts source that XT-mockery-7 runs is still missing, and so is the packages/contracts/package.json exports map that XT-contracts-20 and XT-contracts-11 enumerate. The bodies of XT-assert-100, XT-mockery-15, XT-mockery-13 and XT-assert-3 do check what their consequence strings claim. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every edit is in packages/runtime, contracts, assert or mockery, the item's listed components. The grader keeps its own predicate copy, as the ruling requires under AD-15. No stub, fake or hard-coded return of another component. |
| F-9: Every `@asyncRoot` tag is true | fail | Section (g) shows only the signature and docblock of resolveClassAsync, and section (h) omits registry.ts for size, so the kept @​asyncRoot Registry.resolveClassAsync tag at line 175 cannot be verified (P-3). The new exports (isContractToken, contractTokenName, defineContractBrand, refuseMalformedToken) are sync and correctly untagged. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ changes. |

Findings:

- **F-7** `packages/mockery/tests/xaravel/fixtures/double.fixture.ts`: P-1 not addressed: the source of the child fixture XT-mockery-7 runs is still not in the prompt. It is needed to confirm the asserted reports, auto-verification after the body and the error order. _(missing evidence)_
- **F-7** `packages/contracts/package.json`: P-2 not addressed: the exports map XT-contracts-20 and XT-contracts-11 read is not in the prompt, so their 'every subpath' enumeration cannot be checked. _(missing evidence)_
- **F-9** `packages/runtime/src/registry/registry.ts`: P-3 not addressed: resolveClassAsync's implementation, including the import path it reaches, is still not in the prompt, so its kept @​asyncRoot tag cannot be checked against AD-6 and ESC-9.4-1. _(missing evidence)_

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/fixtures/double.fixture.ts`: Supply the child fixture executed by XT-mockery-7. Its source is needed to confirm that the asserted child reports verify auto-verification after the body and the declared error ordering. **not fixed**: double.fixture.ts appears only as a path constant (DOUBLE_FIXTURE). Its source is in neither the diff nor section (h).
- **P-2** (reviewer 1, F-7) `packages/contracts/package.json`: Supply the exports map read by XT-contracts-20 and XT-contracts-11 so their claimed enumeration of every contracts subpath can be checked. **not fixed**: packages/contracts/package.json is not shown anywhere in the prompt. Section (h) shows the assert and mockery package.json files only.
- **P-3** (reviewer 1, F-9) `packages/runtime/src/registry/registry.ts`: Supply resolveClassAsync's implementation, including the module-import path it reaches. Section (g) provides only its signature and docblock, while section (h) omits the body; the retained @​asyncRoot tag cannot be verified from that evidence. **not fixed**: registry.ts is omitted for size in (h), and (g) has only the docblock and signature of resolveClassAsync, so its body is still missing.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"reject","tree":"c63139cdf17eb4afbdac5d557483cef970b54279","base":"efce8fa7087415a1459aef8365bc408a9cfe0a35","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-24T22:31:27.561Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests and framework/grader source change.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so there are no Upstream expected values to compare. Two Xaravel Test expectations change. XT-mockery-13's descriptor goes from configurable true to false, now pinned with an exact value. XT-mockery-7's brand-only object is now refused with InvalidDoubleTargetException. Both follow the Item 4 ruling: one brand descriptor for both doubles, and a token is a frozen object with an own non-writable string FQCN.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed, so no Upstream assertion count applies.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is changed and no skip is added.","findings":[]},{"id":"F-5","result":"n/a","note":"Evidence (a): no added adapted:DIV marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"pass","note":"The only fixture relied on is XT-mockery-7's. It is present, verified and error:null. No changed fixture is an error.","findings":[]},{"id":"F-7","result":"fail","note":"P-1 and P-2 are still unfixed. The double.fixture.ts source that XT-mockery-7 runs is still missing, and so is the packages/contracts/package.json exports map that XT-contracts-20 and XT-contracts-11 enumerate. The bodies of XT-assert-100, XT-mockery-15, XT-mockery-13 and XT-assert-3 do check what their consequence strings claim.","findings":[{"path":"packages/mockery/tests/xaravel/fixtures/double.fixture.ts","detail":"P-1 not addressed: the source of the child fixture XT-mockery-7 runs is still not in the prompt. It is needed to confirm the asserted reports, auto-verification after the body and the error order.","kind":"missing-evidence"},{"path":"packages/contracts/package.json","detail":"P-2 not addressed: the exports map XT-contracts-20 and XT-contracts-11 read is not in the prompt, so their 'every subpath' enumeration cannot be checked.","kind":"missing-evidence"}]},{"id":"F-8","result":"pass","note":"Every edit is in packages/runtime, contracts, assert or mockery, the item's listed components. The grader keeps its own predicate copy, as the ruling requires under AD-15. No stub, fake or hard-coded return of another component.","findings":[]},{"id":"F-9","result":"fail","note":"Section (g) shows only the signature and docblock of resolveClassAsync, and section (h) omits registry.ts for size, so the kept @asyncRoot Registry.resolveClassAsync tag at line 175 cannot be verified (P-3). The new exports (isContractToken, contractTokenName, defineContractBrand, refuseMalformedToken) are sync and correctly untagged.","findings":[{"path":"packages/runtime/src/registry/registry.ts","detail":"P-3 not addressed: resolveClassAsync's implementation, including the import path it reaches, is still not in the prompt, so its kept @asyncRoot tag cannot be checked against AD-6 and ESC-9.4-1.","kind":"missing-evidence"}]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/fixtures/double.fixture.ts","detail":"Supply the child fixture executed by XT-mockery-7. Its source is needed to confirm that the asserted child reports verify auto-verification after the body and the declared error ordering.","fixed":false,"note":"double.fixture.ts appears only as a path constant (DOUBLE_FIXTURE). Its source is in neither the diff nor section (h)."},{"id":"P-2","reviewer":1,"item":"F-7","path":"packages/contracts/package.json","detail":"Supply the exports map read by XT-contracts-20 and XT-contracts-11 so their claimed enumeration of every contracts subpath can be checked.","fixed":false,"note":"packages/contracts/package.json is not shown anywhere in the prompt. Section (h) shows the assert and mockery package.json files only."},{"id":"P-3","reviewer":1,"item":"F-9","path":"packages/runtime/src/registry/registry.ts","detail":"Supply resolveClassAsync's implementation, including the module-import path it reaches. Section (g) provides only its signature and docblock, while section (h) omits the body; the retained @asyncRoot tag cannot be verified from that evidence.","fixed":false,"note":"registry.ts is omitted for size in (h), and (g) has only the docblock and signature of resolveClassAsync, so its body is still missing."}]}
```

## Auto Run Result

Status: done

**Summary.** The Maintainer's Item 4 route is in. `@xaravel/runtime` exports `isContractToken` (a frozen, non-function object whose own `Symbol.for('xaravel.class.fqcn')` is a non-writable string data property). The Registry and `@xaravel/contracts` (`contract()`, `canonical.ts`, `aliases.test.ts`) use it. `@xaravel/assert` keeps the grader's copy, which PHPUnit's Generator, its class lookup and every part of Mockery (`DoubleTarget`, `Double`, `lookupContract`) use. XT-contracts-20 pins the two copies equal. Both doubles share assert's `contractTokenName`, which refuses an empty FQCN, and `defineContractBrand`: a non-enumerable, non-configurable getter, defined once per prototype. Mockery's brand-description fallback is gone, and a malformed token is refused with `InvalidDoubleTargetException`.

**Files.**
- `packages/runtime/src/registry/registry.ts`, `registry/index.ts`, `src/index.ts`, `docs/class-registry.md`: the runtime predicate and its export and docs.
- `packages/contracts/src/Contract.ts`, `src/aliases/canonical.ts`: use runtime's predicate.
- `packages/contracts/tests/xaravel/aliases.test.ts`: uses runtime's predicate. `brand-compile.test.ts`: the temp project uses `types: ["bun"]` (see Design Notes).
- `packages/contracts/tests/xaravel/token-predicate.test.ts`: new, XT-contracts-20.
- `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts`: the grader predicate, `contractTokenName` and `defineContractBrand`.
- `Generator.ts`, `Signature.ts`, `src/index.ts`, `Assert.ts` (comment): use them.
- `packages/assert/tests/xaravel/token-doubles.test.ts`: new, XT-assert-100. `comparison.test.ts`: the export list.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts`, `ClassGenerator.ts`, `Double.ts`, `support/classes.ts`, `Matching/TypeMatcher.ts` (comment): use assert's helpers.
- `packages/mockery/tests/xaravel/token-doubles.test.ts`: new, XT-mockery-15.
- `mockery.test.ts`, `parent-brands.test.ts`: the brand-only refusal and the descriptor.
- `_bmad-output/implementation-artifacts/bmad-build-auto-result-retro-10-one-token-predicate.md`: deleted, the old blocked note.

**Review.** 7 entries were patched:
- medium: lookup paths; `Object.create(token)` refusal.
- low: stale comments; refusal message assertions; `contractTokenName` read; a hasInstance-less token pinned; one row shared with the `Object.create` entry.

Nothing was deferred. Rejected findings and their reasons are in the Review Triage Log. The main ones:
- `Constraints.ts` `classOrInterface` is `assertInstanceOf`'s ESC-4.3-1 `instanceof` check, not a token definition.
- `canonical.ts` `isDeepToken` requires the `Symbol.hasInstance` it calls, on top of the one predicate.

The Fidelity Review counts: `current` at tree c63139cdf17eb4afbdac5d557483cef970b54279, with evidence gaps noted (F-7 ×2, F-9).

**Follow-up review: recommended.** Two medium entries were patched. The unverified risk: whether the ruling's "every predicate besides these two goes" also reaches `Constraints.ts`'s `classOrInterface`, which still accepts any object with a function `Symbol.hasInstance` as an interface token for `assertInstanceOf`.

**Verification.**
- `bun run typecheck` 0 and `bun run lint` 0.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`, XARAVEL 368 tests, 363 passed, 5 skipped.
- `bun test` over the four packages: all pass.

**Residual risks.**
- XT-contracts-2 no longer proves that contracts' root type-checks without Bun types.
- Two Mockery XT expectations changed to the stricter ruled behaviour (XT-mockery-7 brand-only refusal, XT-mockery-13 `configurable: false`).
