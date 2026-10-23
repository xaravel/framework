---
title: 'Retro item epic-10-item-2: a double of a child contract carries every parent brand'
type: 'feature'
created: '2026-10-23'
status: 'blocked'
baseline_revision: '972ade3e94c93bf011046acbaef414a445084522'
review_loop_iteration: 0
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

## Verification

**Commands:**
- `bun test packages/assert/tests/xaravel/parent-brands.test.ts packages/mockery/tests/xaravel/parent-brands.test.ts` -- all pass
- `bun run harness` -- no differences (SUMMARY differ=0)
- `bun run harness --xaravel` -- no failures
- `bun run typecheck` and `bun run lint` -- clean

## Auto Run Result

Status: blocked
Blocking condition: Fidelity Review cannot run for this item. `bun run fidelity:review review --item epic-10-item-2-double-parent-brands` exits 2: `RETRO_ITEM_ID` accepts only `epic-<N>-retro-item-<k>-<slug>`, and XT-conformance's fidelity-review test asserts that an `epic-<N>-item-<k>-<slug>` id (the form of items added by a Maintainer ruling) is rejected. Neither widening that Protected rule nor renaming an item a Maintainer ruling named is within the orchestrator's rulings, so the item waits on the Maintainer.

- Change: both test doubles (assert `Generator`, mockery `DoubleTarget`/`ClassGenerator`) define the brand of every contract in a token's `Symbol.for('xaravel.contract.parents')` closure; new XT-assert-22 and XT-mockery-13.
- Files: `packages/assert/src/Framework/MockObject/Generator/Generator.ts` (parents walk, brands on the double); `packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts` (parents walk, `tokenName`); `packages/mockery/src/JMac/Testing/Engine/ClassGenerator.ts` (defines parent brands); the two `parent-brands.test.ts` files.
- Review: 3 low patches (comments), 1 medium deferred (shared walk), 10 rejected (reasons in the triage log). Follow-up review recommended: false.
- Verification: new tests fail on baseline 972ade3e and pass after; `bun run harness` SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0 (before the comment-only patches); `bun run harness --xaravel` 345 tests, 0 failed; `bun run typecheck` and `bun run lint` clean after the patches.
- Residual risk: the two packages keep their own walk (deferred item); no Fidelity Review has run.
