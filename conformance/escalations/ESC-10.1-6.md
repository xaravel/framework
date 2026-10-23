---
test_ids:
  - XT-contracts-4
trigger: contract
proposed: >-
  Option 1 (recommended): a contract token records its parent contracts.
  `contract<T, B>(fqcn, members, parents?)` takes an optional list of
  parent tokens and keeps a frozen array of them at
  `Symbol.for('xaravel.contract.parents')`. Mockery's `DoubleTarget` and
  PHPUnit's `Generator` (`packages/mockery/`, `packages/assert/`, both
  Protected) then define the brand of every contract in the parents'
  closure on the double's prototype, besides the target's own, so a
  double of `NotFoundExceptionInterface` is `instanceof
  ContainerExceptionInterface`, as a PHP mock of a child interface is
  `instanceof` its parents. The PSR tokens and Story 10.2's generated
  tokens pass their Upstream parents. This needs an Infrastructure change
  to the two grader packages, with Xaravel Tests for a double of a child
  contract. Option 2: leave doubles with the target's own brand, and
  record in `conformance/review/fidelity.md` and the README that a double
  of a child contract is not `instanceof` its parents.
evidence: >-
  `packages/assert/src/Framework/MockObject/Generator/Generator.ts`
  (around line 452) defines only `target.brand` on a double's prototype,
  and Mockery's double does the same with its target. A token made by
  `contract()` (`packages/contracts/src/Contract.ts`) has no record of the
  interfaces its contract extends. Story 10.1's second pass adds the
  first contracts with parents:
  `Psr\Container\NotFoundExceptionInterface extends
  ContainerExceptionInterface`, and `Psr\SimpleCache\InvalidArgumentException
  extends CacheException`. Every interface Story 10.2 ports that extends
  another has the same gap, for example
  `Illuminate\Contracts\Container\Container extends
  Psr\Container\ContainerInterface`. Code that catches `instanceof
  ContainerExceptionInterface` would miss a thrown double of
  `NotFoundExceptionInterface`, which PHP catches. Found by the Story
  10.1 edge-case review, second pass.
---

# ESC-10.1-6: a test double of a child contract is not `instanceof` its parent contracts

In PHP, a mock of an interface is an instance of every interface it extends. In Xaravel, `instanceof` on a contract token reads that contract's brand. A double defines only its target's own brand, and a token does not record its parents. So a double of `NotFoundExceptionInterface` fails `instanceof ContainerExceptionInterface`.

The recommended fix, Option 1, records the parent tokens on each token and makes both doubles define the whole chain of brands. It changes the token mechanism and the two grader packages, so it needs a ruling. This stops XT-contracts-4 only.
