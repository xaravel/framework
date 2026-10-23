---
title: 'Retro item epic-10-item-2: a double of a child contract carries every parent brand'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '972ade3e94c93bf011046acbaef414a445084522'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      The parents walk is duplicated in @xaravel/assert and @xaravel/mockery, against the Epic 4 lesson on one shared implementation.
    evidence: |-
      parentBrandsOf exists in Generator.ts and DoubleTarget.ts; mockery src already imports @xaravel/assert. Sharing it adds assert public surface the spec does not settle. Settle it when this item resumes, before it merges.
    location: >-
      packages/assert/src/Framework/MockObject/Generator/Generator.ts, packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** A PHPUnit or JMac Double test double of a contract token defines only the target's own brand on its prototype, so a double of a child contract (`Psr\Container\NotFoundExceptionInterface`) fails `instanceof` its parent (`ContainerExceptionInterface`), where a PHP mock of a child interface is an instance of every interface it extends (ESC-10.1-6, approved option 1; action item `epic-10-item-2-double-parent-brands`).

**Approach:** When a target is a contract token object, both readers (`readTarget` in `@xaravel/assert`, `DoubleTarget.of` in `@xaravel/mockery`) also read `token[Symbol.for('xaravel.contract.parents')]` and walk its closure (parents of parents, depth-first, each contract once, cycle-safe), collecting each parent's brand by the same rule the package already uses for a target's own brand. The double class's prototype then gets a `true` getter for every collected brand, besides the target's own, exactly as it gets the own brand today.

## Boundaries & Constraints

**Always:** Change only `packages/assert/**`, `packages/mockery/**` and this item's records under `_bmad-output/implementation-artifacts/` (MAINT-2026-10-16, amendment 2026-10-22). Absent (`undefined`) or `null` parents means none: behaviour stays exactly as today. A parent entry is a contract as each package already takes one as a target: a token object (has `Symbol.hasInstance`) or a bare symbol (its brand is itself). Parent brands are defined with the same descriptor the package uses for the own brand (assert: `configurable: false`; mockery: `configurable: true`), non-enumerable. A target's own brand reached again through a cycle is not redefined; a contract reached twice (diamond) is collected once. Only brands are added: the double's doubled methods stay the target token's own `Symbol.for('xaravel.contract.methods')` list. Every existing assertion stays; the new tests use stand-in tokens (the graders import no graded package, AD-2).

**Never:** Import `@xaravel/contracts` or `@xaravel/runtime` from a grader package. Touch `packages/contracts` (Story 10.1's half), `conformance/expectations/**`, any other component, Protected tooling, or the item's `action`/`owner`/`epic`. Add parent methods to the double. Change `Mockery.mock`'s bare-symbol token path (a bare symbol carries no parents).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Child | token `Child` with parents `[Parent]`, `Parent` with parents `[Root]` | double of `Child` is `instanceof` Child, Parent and Root; not `instanceof` an unrelated token | none |
| No key | token without the parents key, or `null` | as today: only the own brand | none |
| Diamond / cycle | `A` parents `[B, C]`, `B` and `C` parents `[D]`; `D` parents `[A]` | instanceof A, B, C, D; terminates | none |
| Symbol parent | parents `[Symbol.for("X\\Base")]` | `double[Symbol.for("X\\Base")] === true` | none |
| Not iterable | parents `42` | `TypeError`: `<name>: [Symbol.for('xaravel.contract.parents')] must be an iterable of contract tokens` | thrown when the target is read |
| Bad entry | parents `[SomeClass]` or `["X"]` | `TypeError`: `<name>: [Symbol.for('xaravel.contract.parents')] must hold contract tokens, got <function/string>` | thrown when the target is read |
| Intersection (mockery) | `Double.for([TokA, TokB])`, each with parents | instanceof every parent of both | none |

</intent-contract>

## Code Map

- `packages/assert/src/Framework/MockObject/Generator/Generator.ts:59` -- `CONTRACT_METHODS`; add `CONTRACT_PARENTS`. `:78` `TargetType` -- add `parentBrands: readonly symbol[]` (empty for a class and a bare symbol). `:218` `readTarget` -- the token branch (`:239`) computes the own name via `classNameOfClass` and brand `Symbol.for(name)`; add the closure walk there. `:452` -- brand define site in `testDouble`; define each parent brand after it. Header comment (`:1-46`, "Targets") documents it.
- `packages/assert/src/Framework/MockObject/TestDoubleBuilder.ts:23,35` -- only callers of `readTarget`; unaffected.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts:30` -- add `CONTRACT_PARENTS`; `:100-170` class `DoubleTarget` (private ctor, `of` with caches) -- add `readonly parentBrands: readonly symbol[]`, computed in the token branch (`:133`) by walking parents, each read through `DoubleTarget.of(parent)` for its brand (that rule already handles FQCN/registered-symbol brands and throws InvalidDoubleTargetException for none). Guard the recursion with a visited set (a cycle must not recurse into an unfinished `of`). Header comment documents it.
- `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts:132` -- brand define site per target; define parent brands too. Header (`:3-5`) mentions brands.
- `packages/assert/tests/xaravel/typed-doubles.test.ts:165` -- stand-in token pattern (`CLASS_FQCN`, methods, `hasInstance` on brand).
- `packages/mockery/tests/xaravel/exceptions-spl.test.ts` -- latest XT file layout (`xaravelTest` from `@xaravel/assert`, header comment with F-10 note).
- `conformance/tests/xaravel/done-check.test.ts:819` -- XT-conformance-128: XT ids unique, every test in an XT file is `xaravelTest`. Next free ids: `XT-assert-22`, `XT-mockery-13`.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/Framework/MockObject/Generator/Generator.ts` -- read the parents closure into `parentBrands`; define them on the double prototype; update header -- ESC-10.1-6 doubles half for PHPUnit.
- `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts` -- read the parents closure into `parentBrands`; update header -- same for JMac Double.
- `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts` -- define every target's parent brands; update header.
- `packages/assert/tests/xaravel/parent-brands.test.ts` -- new `XT-assert-22`: matrix rows via `createMock`/`createStub` on stand-in tokens (child, no key, null, diamond+cycle, symbol parent, both TypeErrors, unrelated token false, doubled methods still the child's own list).
- `packages/mockery/tests/xaravel/parent-brands.test.ts` -- new `XT-mockery-13`: same rows via `Double.for(token)` plus the intersection row.

**Acceptance Criteria:**
- Given the baseline, when XT-assert-22 and XT-mockery-13 run, then their child rows fail; after the change every row passes and all other Xaravel Tests and Ported Tests still pass.
- Given a token with no parents key, when a double is made, then its own enumerable/own-symbol brands are the same set as on the baseline.

## Spec Change Log

### 2026-10-23 — Resumed; the shared walk settled
- Trigger: the Fidelity Review `--item` block is cleared on main (#344, ruling-added item ids accepted), and the deferred medium finding (the parents walk duplicated in assert and mockery) had to be settled before merge.
- Amended: outside `<intent-contract>` only. The walk is one implementation, `contractParentBrands(token, ownBrand, nameOf)` in `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts`, exported from the `@xaravel/assert` index (mockery already imports its `php*` helpers from there; XT-conformance-7 allows no subpath export). PHPUnit's `Generator` passes `classNameOfClass`, Mockery's `DoubleTarget` its own `tokenName`, so each package keeps its own target-name rule. XT-assert-3's exact export list gains `contractParentBrands`; every assertion stays.
- Known-bad state avoided: two copies of one protocol walk drifting apart (Epic 4 lesson).
- KEEP: the matrix behaviour, both error messages, the brand descriptors (assert `configurable: false`, mockery `configurable: true`), XT-assert-22 and XT-mockery-13 unchanged.

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 9, false 6, maybe-false 0; plus 1 Fidelity Review no-verdict finding (blocking)
- findings:
  - `[low]` `[reject]` (edge) assert reads a parent token without `xaravel.class.fqcn` as `class@anonymous` — real for hand-built tokens only; `contract()` always sets the FQCN and assert's own-target rule is the same pre-existing rule; the fix adds a guard branch.
  - `[low]` `[reject]` (edge) mockery's InvalidDoubleTargetException for a nameless parent does not name the child — hand-built tokens only; fix is a wrap-and-rethrow.
  - `[low]` `[patch]` (edge) DoubleTarget caches per token, so parents are read once — header of `DoubleTarget.ts` now says the parents are read once, when the target is first read.
  - `[false]` `[reject]` (edge) intersection cache reuses a class for distinct tokens with the same FQCNs — two tokens sharing one FQCN share one brand by design (`Symbol.for(fqcn)`); pre-existing cache key.
  - `[false]` `[reject]` (edge) SafeDefaultResolver now throws on malformed parents — loud failure on malformed contract data is the matrix's required behaviour.
  - `[false]` `[reject]` (edge, claim) parent methods list not validated — the intent adds only brands; a parent's methods are never read.
  - `[low]` `[reject]` (blind) the two packages name a FQCN-less parent differently — same root as the first row; each package keeps its own pre-existing target-name rule.
  - `[low]` `[reject]` (blind) mockery's parent-error families differ — same as the second row.
  - `[low]` `[patch]` (blind) test headers say "plain bun:test" while using xaravelTest — both headers reworded.
  - `[false]` `[reject]` (blind) Code Map / change log out of date — the fix edits this spec.
  - `[low]` `[reject]` (blind) a string parents value fails per character with "got string" — the message still names the key; the fix adds a branch.
  - `[low]` `[reject]` (blind) getMockBuilder and SafeDefaultResolver paths untested — the verification-gap layer traced both to the same `readTarget`/`DoubleTarget.of` code the tests cover.
  - `[low]` `[reject]` (blind) error rows for `null`/plain-object entries and deeper bad lists untested — same code branch as the tested `string`/`function` rows.
  - `[medium]` `[defer]` (blind) the parents walk is duplicated in assert and mockery (mockery already imports `@xaravel/assert`), against the Epic 4 lesson on one shared implementation — sharing it adds public surface to assert, which the spec does not settle; to be settled when this item resumes, before it merges.
  - `[low]` `[patch]` (blind) stale-parents caching undocumented — same patch as the third row.
  - `[low]` `[reject]` (intent) `Mockery.mock` facade not covered — it takes only bare symbols, which carry no parents; the action names `DoubleTarget`.
  - `[false]` `[reject]` (intent) tests use stand-in tokens, not `contract()` — AD-2 and the action require stand-ins.
  - `[false]` `[reject]` (intent) extra behaviours (null, iterables, symbols, TypeErrors) beyond the action — they come from the spec matrix and are tested.
  - `[low]` `[reject]` (verification-gap other) FQCN-less parent disagreement — same as the first row.
  - `[low]` `[patch]` (verification-gap other) assert test header contradiction — same patch as above.
  - **Fidelity Review produced no verdict:** `--item must be a retrospective action item id, epic-<N>-retro-item-<k>-<slug>, got "epic-10-item-2-double-parent-brands"` (exit 2). `RETRO_ITEM_ID` in `tools/fidelity-review/fidelity-review.ts:152` rejects ids of items a Maintainer ruling adds (`epic-<N>-item-<k>-<slug>`), and `conformance/tests/xaravel/fidelity-review.test.ts:1498` asserts that rejection. The item cannot reach `status … current`, so it cannot merge.

### 2026-10-23 — Review pass (resumed, shared walk)
- verdicts: 24 findings — high 0, medium 1, low 15, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` (edge) a well-known symbol (`Symbol.toPrimitive`) as a bare-symbol parent gets a `true` getter — hand-built tokens only (`contract()` passes tokens); the fix adds a guard branch.
  - `[low]` `[reject]` (blind) the frontmatter still defers the duplicated walk — the fix edits this spec; the deferred list is append-only, and the Spec Change Log records it settled.
  - `[low]` `[reject]` (blind) Auto Run Result stale — the fix edits this spec; Finalize rewrites it.
  - `[false]` `[reject]` (blind) no verification after the refactor — `bun run harness` (differ=0), `harness --xaravel` (340 passed, 0 failed), typecheck and lint were run after the refactor and again after this pass's patches.
  - `[low]` `[patch]` (blind) `isContractToken` copied in `Generator.ts` and `ContractParents.ts` — `ContractParents.ts` exports it and `Generator.ts` imports it; mockery's exported one predates this item.
  - `[low]` `[reject]` (blind) Change Log / Code Map out of date — the fix edits this spec.
  - `[low]` `[reject]` (blind) `contractParentBrands` has no direct test — both packages' tests drive every branch through it, and `tsc -b` pins its signature for mockery.
  - `[low]` `[reject]` (blind) a nested bad parents list's error naming is untested — malformed hand-built tokens only; the message names the contract holding the list by construction.
  - `[low]` `[patch]` (blind) assert reads parents on every double, mockery once — the Generator header now says so.
  - `carried` `[low]` `[reject]` (blind) a FQCN-less parent is `class@anonymous` in assert — same as the earlier pass's first row; `contract()` always sets the FQCN.
  - `[medium]` `[patch]` (blind) the intersection row checks only `instanceof` — grouped with Fidelity F-7 below.
  - `[low]` `[reject]` (blind) no-parents path for class and bare-symbol targets untested — both branches return a literal `[]`, and the existing typed-doubles tests still pin their brands.
  - `carried` `[low]` `[reject]` (verification-gap) a brand-only or nameless parent token in mockery untested — same root as the earlier pass's second row; hand-built tokens only.
  - `[low]` `[patch]` (verification-gap other) `isContractToken` duplicated — same patch as above.
  - `[false]` `[reject]` (intent) the real PSR tokens do not record parents yet — that half is Story 10.1's by the ruling; this item is the consumer side, tested with stand-ins as AD-2 requires.
  - `[false]` `[reject]` (intent) XT-assert-3's expected export list widened — the assertion is still an exact match of the full list; a new export must appear in it, which is stricter, not weaker.
  - `[false]` `[reject]` (intent) the new public export was not asked for — settling the deferred duplication was; the export is the shared implementation the Epic 4 lesson asks for.
  - `carried` `[false]` `[reject]` (intent) `getMockBuilder`, string-FQCN and `SafeDefaultResolver` paths untested — they reach the same `readTarget`/`DoubleTarget.of`.
  - `[false]` `[reject]` (intent) `<name>` reading for nested errors — the matrix names the contract whose list is read; the top-level rows test it.
  - `[low]` `[reject]` (intent) mockery throws InvalidDoubleTargetException for a nameless parent, assert names it `class@anonymous` — each package keeps its own target-name rule, as the intent says.
  - `[false]` `[reject]` (intent) the records disagree — the fix edits this spec; Finalize rewrites Auto Run Result.
  - `[false]` `[reject]` (intent) intersection syntax — `Double.for` is variadic, and the test calls it that way.
  - `[low]` `[patch]` (fidelity, reviewer 1 reject at tree 64c1265f) F-7: XT-mockery-13's intersection case does not check the doubled methods — BaseA/BaseB now declare `ba`/`bb`; the row asserts the four brands and that the prototype has `fa`, `fb` and not `ba`, `bb`.
  - `[low]` `[patch]` (fidelity) F-7 grouped with the blind intersection row: same patch.

### 2026-10-23 — Review pass (Finalize re-check: Fidelity Review on the patched tree)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Both reviewers pass at tree 3b4c63ea7b32532cf1b9199192cd24771a5a1256; `fidelity:review status --item` prints `current`.

## Verification

**Commands:**
- `bun test packages/assert/tests/xaravel/parent-brands.test.ts packages/mockery/tests/xaravel/parent-brands.test.ts` -- all pass
- `bun run harness` -- no differences (SUMMARY differ=0)
- `bun run harness --xaravel` -- no failures
- `bun run typecheck` and `bun run lint` -- clean

## Auto Run Result

Status: done (resumed 2026-10-23; the earlier block, `--item` rejecting a ruling-added item id, was cleared by #344)

- Change: both test doubles (assert `Generator`, mockery `DoubleTarget`/`ClassGenerator`) define the brand of every contract in a token's `Symbol.for('xaravel.contract.parents')` closure. The walk is one implementation, `contractParentBrands` (with `isContractToken`) in assert's `ContractParents.ts`, exported from `@xaravel/assert` and used by mockery with its own `tokenName`. New XT-assert-22 and XT-mockery-13.
- Files: `packages/assert/src/Framework/MockObject/Generator/ContractParents.ts` (shared walk, new); `.../Generator/Generator.ts` (parent brands on the double); `packages/assert/src/index.ts` (exports `contractParentBrands`); `packages/assert/tests/xaravel/comparison.test.ts` (XT-assert-3's exact export list gains it); `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts` (`tokenName`, uses the shared walk); `.../ClassGenerator.ts` (defines parent brands); the two `parent-brands.test.ts` files.
- Review (resumed pass): 24 findings; patched 1 medium (intersection row, with Fidelity F-7) and 4 low (`isContractToken` shared, Generator header on when parents are read); 0 deferred; the rest rejected with reasons in the triage log. The earlier pass's deferred finding (duplicated walk) is settled by the shared walk.
- Follow-up review recommended: false (patched: high 0, medium 1, low 4).
- Verification: `bun run harness` SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0; `bun run harness --xaravel` 345 tests, 340 passed, 0 failed, 5 skipped; `bun run typecheck` and `bun run lint` clean; Fidelity Review `current` at tree 3b4c63ea (both pass), after a reviewer-1 reject at tree 64c1265f (F-7) was fixed.
- Residual risk: the real PSR tokens record no parents until Story 10.1 resumes XT-contracts-4; hand-built tokens with no FQCN are named differently by the two packages, as each package's own target-name rule already did.

## Fidelity Review

### Reviewer 1: reject at tree 64c1265fef5435f427e88b297df98fa9e6eb0972

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `972ade3e94c93bf011046acbaef414a445084522`, on 2026-10-23T19:01:53.809Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Test is added or changed, and no Ported Test IDs are assigned. |
| F-2: No expected value is weakened | pass | The changed export-list expectation remains exact and adds contractParentBrands; existing assertions retain their comparisons and expected values. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No adapted marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared all three touched Xaravel Tests with their consequence strings. The intersection case verifies parent membership but does not verify its declared method restriction. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and implementation with the action item's assert/mockery scope and ESC-10.1-6. The shared brand traversal implements those components' doubles without implementing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the touched source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous traversal and brand-definition functions requiring none. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

- **F-7** `packages/mockery/tests/xaravel/parent-brands.test.ts`: XT-mockery-13 claims that intersection doubles retain only the target tokens' own doubled methods, but the intersection case checks only instanceof results. Give BaseA and BaseB distinct methods and assert that both's prototype doubles fa and fb while excluding those parent methods.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"64c1265fef5435f427e88b297df98fa9e6eb0972","base":"972ade3e94c93bf011046acbaef414a445084522","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T19:01:53.809Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Test is added or changed, and no Ported Test IDs are assigned.","findings":[]},{"id":"F-2","result":"pass","note":"The changed export-list expectation remains exact and adds contractParentBrands; existing assertions retain their comparisons and expected values.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No adapted marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"fail","note":"Compared all three touched Xaravel Tests with their consequence strings. The intersection case verifies parent membership but does not verify its declared method restriction.","findings":[{"path":"packages/mockery/tests/xaravel/parent-brands.test.ts","detail":"XT-mockery-13 claims that intersection doubles retain only the target tokens' own doubled methods, but the intersection case checks only instanceof results. Give BaseA and BaseB distinct methods and assert that both's prototype doubles fa and fb while excluding those parent methods."}]},{"id":"F-8","result":"pass","note":"Compared the changed paths and implementation with the action item's assert/mockery scope and ESC-10.1-6. The shared brand traversal implements those components' doubles without implementing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the touched source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous traversal and brand-definition functions requiring none.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 64c1265fef5435f427e88b297df98fa9e6eb0972

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `972ade3e94c93bf011046acbaef414a445084522`, on 2026-10-23T19:01:53.809Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and the change adds or changes no portedTest. It touches only Xaravel Tests (XT-assert-3, XT-assert-22, XT-mockery-13), so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | No Ported Test is touched. The only changed expected value is in XT-assert-3: its exact export list (still compared with toEqual) gains 'contractParentBrands', the new export that index.ts adds and freezes. That is not a looser comparison, and no exception class or message was generalised. The new tests use exact toEqual/toBe comparisons, with full TypeError messages. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no assertion is removed. XT-assert-3 keeps every assertion, with one list value extended. No adapted:DIV marker is added (evidence (a)). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip and touches no Expectations file. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an adapted:DIV-<n>.<k> marker or an Expectations adapted field (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The item relies on no Oracle fixture. Evidence (c) lists no error fixture, base or changed, and the new tests say no fixture is needed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-assert-22, both createMock and createStub of Child->Parent->Root: instanceof is true for Child, Parent and Root and false for Unrelated, and brandsOf is exactly the closure. Only 'child' is an own method of the prototype. It also checks the absent and null parents keys, a diamond with a cycle, a bare symbol parent and the TypeError messages, which matches its consequence. XT-mockery-13 checks the same through Double.for and adds an intersection: both bases are true and Unrelated is false. Its method-list check covers only the single-token case; in the intersection case the bases declare no methods, so the check would not catch a regression there. It passes because both cases build the prototype through the same per-target instanceMethods() path in ClassGenerator. Neither string cites an FR-<n>.<k> or AD-<n>.<k> bullet. XT-assert-3 (AD-15.9, grader isolation and frozen exports) still verifies that every export, including the new contractParentBrands, is frozen, and that src/ imports stay relative or point to grader packages. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is in packages/assert or packages/mockery, the two components the item lists. The shared walk sits in @​xaravel/assert and @​xaravel/mockery imports it, which is a grader-to-grader edge that ESC-4.5-1 item 7 allows. The tests use stand-in tokens, as ESC-10.1-6 directs, because graders may not import @​xaravel/contracts (AD-2). There is no stub or fake of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file. The new export contractParentBrands and every modified method (readTarget, testDouble, DoubleTarget.of, ClassGenerator.#build, tokenName) are synchronous: they do no IO and take no callback that DIV-1 allows to be async. So no tag is missing or false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"64c1265fef5435f427e88b297df98fa9e6eb0972","base":"972ade3e94c93bf011046acbaef414a445084522","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T19:01:53.809Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and the change adds or changes no portedTest. It touches only Xaravel Tests (XT-assert-3, XT-assert-22, XT-mockery-13), so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test is touched. The only changed expected value is in XT-assert-3: its exact export list (still compared with toEqual) gains 'contractParentBrands', the new export that index.ts adds and freezes. That is not a looser comparison, and no exception class or message was generalised. The new tests use exact toEqual/toBe comparisons, with full TypeError messages.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no assertion is removed. XT-assert-3 keeps every assertion, with one list value extended. No adapted:DIV marker is added (evidence (a)).","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip and touches no Expectations file.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an adapted:DIV-<n>.<k> marker or an Expectations adapted field (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"The item relies on no Oracle fixture. Evidence (c) lists no error fixture, base or changed, and the new tests say no fixture is needed.","findings":[]},{"id":"F-7","result":"pass","note":"XT-assert-22, both createMock and createStub of Child->Parent->Root: instanceof is true for Child, Parent and Root and false for Unrelated, and brandsOf is exactly the closure. Only 'child' is an own method of the prototype. It also checks the absent and null parents keys, a diamond with a cycle, a bare symbol parent and the TypeError messages, which matches its consequence. XT-mockery-13 checks the same through Double.for and adds an intersection: both bases are true and Unrelated is false. Its method-list check covers only the single-token case; in the intersection case the bases declare no methods, so the check would not catch a regression there. It passes because both cases build the prototype through the same per-target instanceMethods() path in ClassGenerator. Neither string cites an FR-<n>.<k> or AD-<n>.<k> bullet. XT-assert-3 (AD-15.9, grader isolation and frozen exports) still verifies that every export, including the new contractParentBrands, is frozen, and that src/ imports stay relative or point to grader packages.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is in packages/assert or packages/mockery, the two components the item lists. The shared walk sits in @xaravel/assert and @xaravel/mockery imports it, which is a grader-to-grader edge that ESC-4.5-1 item 7 allows. The tests use stand-in tokens, as ESC-10.1-6 directs, because graders may not import @xaravel/contracts (AD-2). There is no stub or fake of another component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file. The new export contractParentBrands and every modified method (readTarget, testDouble, DoubleTarget.of, ClassGenerator.#build, tokenName) are synchronous: they do no IO and take no callback that DIV-1 allows to be async. So no tag is missing or false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 3b4c63ea7b32532cf1b9199192cd24771a5a1256

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `972ade3e94c93bf011046acbaef414a445084522`, on 2026-10-23T19:09:19.591Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds or changes no Ported Test. |
| F-2: No expected value is weakened | pass | The changed export expectation remains exact and adds the new shared helper; no existing comparison or exception expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertion is changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The action item relies on no Oracle error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared all three touched Xaravel Tests with their consequences. They check export isolation and freezing, parent closure brands, unrelated-contract exclusion, and unchanged target method lists. The intersection now explicitly checks fa and fb while excluding ba and bb, resolving P-1. |
| F-8: No stub, fake or partial implementation of another Component | pass | The implementation stays within the authorized assert and mockery components. Its shared protocol walk and stand-in test tokens follow ESC-10.1-6 without implementing another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the touched source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags; the new exports and parent traversal are synchronous and require none. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no Oracle request file. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/parent-brands.test.ts`: XT-mockery-13 claims that intersection doubles retain only the target tokens' own doubled methods, but the intersection case checks only instanceof results. Give BaseA and BaseB distinct methods and assert that both's prototype doubles fa and fb while excluding those parent methods. **fixed**: BaseA and BaseB now declare ba and bb, and the intersection prototype assertion requires fa and fb to exist while ba and bb are absent.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"3b4c63ea7b32532cf1b9199192cd24771a5a1256","base":"972ade3e94c93bf011046acbaef414a445084522","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-23T19:09:19.591Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds or changes no Ported Test.","findings":[]},{"id":"F-2","result":"pass","note":"The changed export expectation remains exact and adds the new shared helper; no existing comparison or exception expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertion is changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The action item relies on no Oracle error fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Compared all three touched Xaravel Tests with their consequences. They check export isolation and freezing, parent closure brands, unrelated-contract exclusion, and unchanged target method lists. The intersection now explicitly checks fa and fb while excluding ba and bb, resolving P-1.","findings":[]},{"id":"F-8","result":"pass","note":"The implementation stays within the authorized assert and mockery components. Its shared protocol walk and stand-in test tokens follow ESC-10.1-6 without implementing another component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the touched source files and declaration inventory with AD-6 and DIV-1. They retain no asyncRoot tags; the new exports and parent traversal are synchronous and require none.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no Oracle request file.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/parent-brands.test.ts","detail":"XT-mockery-13 claims that intersection doubles retain only the target tokens' own doubled methods, but the intersection case checks only instanceof results. Give BaseA and BaseB distinct methods and assert that both's prototype doubles fa and fb while excluding those parent methods.","fixed":true,"note":"BaseA and BaseB now declare ba and bb, and the intersection prototype assertion requires fa and fb to exist while ba and bb are absent."}]}
```

### Reviewer 2: pass at tree 3b4c63ea7b32532cf1b9199192cd24771a5a1256

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `972ade3e94c93bf011046acbaef414a445084522`, on 2026-10-23T19:09:19.591Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and the diff adds or changes no Ported Test. There are no Upstream assertions to compare against. |
| F-2: No expected value is weakened | n/a | There is no Ported Test, so no Upstream expected value can be weakened. The only change to an existing test is XT-assert-3's export list. It gains 'contractParentBrands', an export this change adds; the exact 'toEqual' and the frozen-export checks are unchanged. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched, and evidence (a) shows no added 'adapted:DIV' marker or DIV clause citation. No Upstream assertion is involved. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to 'skip'. |
| F-5: Every `adapted` marker matches its clause | n/a | There is no '// adapted:DIV-<n>.<k>' marker and no Expectations 'adapted' field in the change (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned or changed Oracle fixture that is an error. The new tests cite ESC-10.1-6 and rely on no fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-assert-22 checks what its consequence claims, for both createMock and createStub: - The double is instanceof Child, Parent and Root but not Unrelated. - brandsOf gives exactly the three brands, so the double carries nothing else. - Only the child's own method 'child' is on the prototype, not 'parent' or 'root'. - It also covers no parents key, a null key, the diamond and cycle case, a bare symbol parent and the TypeError messages.  XT-mockery-13 checks the same for a JMac Double. Its intersection case now gives BaseA and BaseB their own methods ('ba', 'bb') and asserts the prototype has 'fa' and 'fb' but not 'ba' or 'bb'.  XT-assert-3's consequence (AD-15.9, frozen exports) still holds: the new export is a frozen function. Neither new consequence cites an FR or AD bullet; both cite ESC-10.1-6, which the bodies implement. |
| F-8: No stub, fake or partial implementation of another Component | pass | Code changes stay in packages/assert (ContractParents.ts, Generator.ts, index.ts) and packages/mockery (DoubleTarget.ts, ClassGenerator.ts). Both are components this item lists.  The import of @​xaravel/mockery from @​xaravel/assert is a grader-to-grader edge, which ESC-4.5-1 item 7 and AD-2 allow. Nothing imports @​xaravel/contracts: the tests use stand-in tokens, as ESC-10.1-6 directs. There is no stub, fake or hard-coded return of another component. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tags in any changed source file. Every new or changed function is synchronous: contractParentBrands, isContractToken, tokenName, readTarget, testDouble, DoubleTarget.of and ClassGenerator.#build. None does IO behind an async-root contract or takes a callback DIV-1 allows to be async. No tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/mockery/tests/xaravel/parent-brands.test.ts`: XT-mockery-13 claims that intersection doubles retain only the target tokens' own doubled methods, but the intersection case checks only instanceof results. Give BaseA and BaseB distinct methods and assert that both's prototype doubles fa and fb while excluding those parent methods. **fixed**: In packages/mockery/tests/xaravel/parent-brands.test.ts, BaseA and BaseB now declare their own methods ('ba' and 'bb'). The test asserts '["fa","fb","ba","bb"].map(m => Object.hasOwn(bothProto, m))' equals '[true,true,false,false]'. So the intersection double's prototype has the target tokens' own methods and not the parents' methods, as the finding asked.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"3b4c63ea7b32532cf1b9199192cd24771a5a1256","base":"972ade3e94c93bf011046acbaef414a445084522","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-23T19:09:19.591Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and the diff adds or changes no Ported Test. There are no Upstream assertions to compare against.","findings":[]},{"id":"F-2","result":"n/a","note":"There is no Ported Test, so no Upstream expected value can be weakened. The only change to an existing test is XT-assert-3's export list. It gains `contractParentBrands`, an export this change adds; the exact `toEqual` and the frozen-export checks are unchanged.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched, and evidence (a) shows no added `adapted:DIV` marker or DIV clause citation. No Upstream assertion is involved.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to `skip`.","findings":[]},{"id":"F-5","result":"n/a","note":"There is no `// adapted:DIV-<n>.<k>` marker and no Expectations `adapted` field in the change (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned or changed Oracle fixture that is an error. The new tests cite ESC-10.1-6 and rely on no fixture.","findings":[]},{"id":"F-7","result":"pass","note":"XT-assert-22 checks what its consequence claims, for both createMock and createStub:\n- The double is instanceof Child, Parent and Root but not Unrelated.\n- brandsOf gives exactly the three brands, so the double carries nothing else.\n- Only the child's own method `child` is on the prototype, not `parent` or `root`.\n- It also covers no parents key, a null key, the diamond and cycle case, a bare symbol parent and the TypeError messages.\n\nXT-mockery-13 checks the same for a JMac Double. Its intersection case now gives BaseA and BaseB their own methods (`ba`, `bb`) and asserts the prototype has `fa` and `fb` but not `ba` or `bb`.\n\nXT-assert-3's consequence (AD-15.9, frozen exports) still holds: the new export is a frozen function. Neither new consequence cites an FR or AD bullet; both cite ESC-10.1-6, which the bodies implement.","findings":[]},{"id":"F-8","result":"pass","note":"Code changes stay in packages/assert (ContractParents.ts, Generator.ts, index.ts) and packages/mockery (DoubleTarget.ts, ClassGenerator.ts). Both are components this item lists.\n\nThe import of @xaravel/mockery from @xaravel/assert is a grader-to-grader edge, which ESC-4.5-1 item 7 and AD-2 allow. Nothing imports @xaravel/contracts: the tests use stand-in tokens, as ESC-10.1-6 directs. There is no stub, fake or hard-coded return of another component.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tags in any changed source file. Every new or changed function is synchronous: contractParentBrands, isContractToken, tokenName, readTarget, testDouble, DoubleTarget.of and ClassGenerator.#build. None does IO behind an async-root contract or takes a callback DIV-1 allows to be async. No tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/mockery/tests/xaravel/parent-brands.test.ts","detail":"XT-mockery-13 claims that intersection doubles retain only the target tokens' own doubled methods, but the intersection case checks only instanceof results. Give BaseA and BaseB distinct methods and assert that both's prototype doubles fa and fb while excluding those parent methods.","fixed":true,"note":"In packages/mockery/tests/xaravel/parent-brands.test.ts, BaseA and BaseB now declare their own methods (`ba` and `bb`). The test asserts `[\"fa\",\"fb\",\"ba\",\"bb\"].map(m => Object.hasOwn(bothProto, m))` equals `[true,true,false,false]`. So the intersection double's prototype has the target tokens' own methods and not the parents' methods, as the finding asked."}]}
```
