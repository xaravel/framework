---
test_ids:
  - XT-contracts-5
  - XT-contracts-7
trigger: contract
proposed: >-
  Option 1 (recommended): a contract token carries its Upstream constants as
  frozen own properties, and the API-surface tool reads a contract's static
  side from a same-file declaration. `contract<T, B>(fqcn, members, parents,
  statics?)` takes an optional record of constant values, so
  `Filesystem.VISIBILITY_PUBLIC === 'public'` as PHP's
  `Filesystem::VISIBILITY_PUBLIC` is. For a static interface method
  (`ShouldBeDiscovered::shouldBeDiscovered`), the contract file also exports
  `interface <X>Static { shouldBeDiscovered(): boolean }`, the constructor
  side an implementing class satisfies (`class L { static
  shouldBeDiscovered() {…} }` checked with `L satisfies ShouldBeDiscoveredStatic`).
  `tools/api-surface/api-surface.ts` (Protected) then counts the members of
  the token's declared constant record and of `<X>Static` as the static
  members of that FQCN. This changes the tool and the token mechanism, so it
  needs an Infrastructure change with tests. Option 2: cite the three rows
  in `conformance/api-surface/exceptions.jsonl` under a new DIV clause
  recording that a TypeScript interface cannot declare static members.
evidence: >-
  `conformance/api-surface/contracts.jsonl` has three `static: true` rows in
  Story 10.2's namespaces: `Illuminate\Contracts\Events\ShouldBeDiscovered`
  method `shouldBeDiscovered`, and `Illuminate\Contracts\Filesystem\Filesystem`
  constants `VISIBILITY_PUBLIC` and `VISIBILITY_PRIVATE`. A TypeScript
  interface cannot declare a static member, and a contract's runtime side is
  a frozen token object (Story 10.1, ESC-10.1-1), not a class.
  `tools/api-surface/api-surface.ts` reads members only from a `class` or
  `interface` named after the token in the same `.d.ts` (`classMembers`,
  around line 600), and `staticFailures` (around line 789) reports a member
  whose `static` differs from Upstream's. So each of the three rows is
  `missing` or `mismatch` whatever the port declares, and XT-contracts-7
  (zero unexplained members for these namespaces) cannot pass without a
  tool change or a citation. Story 10.3 meets the same gap for
  `Illuminate\Contracts\Auth\PasswordBroker`'s five constants. Found while
  planning Story 10.2.
---

# ESC-10.2-1: a contract cannot declare Upstream's static members

PHP interfaces can declare constants and static methods. Three rows in Story 10.2's namespaces do: `Filesystem::VISIBILITY_PUBLIC`, `Filesystem::VISIBILITY_PRIVATE` and `ShouldBeDiscovered::shouldBeDiscovered()`. A Xaravel contract is a TypeScript interface plus a frozen token object, and neither can carry a member the API-surface tool counts as static. So the API-surface diff for these namespaces keeps three unexplained items, whatever the port does.

The recommended fix, Option 1, puts the constants on the token (as PHP reads them from the interface) and has the API-surface tool read a contract's static side. It changes `tools/api-surface/` (Protected) and `contract()`, so it needs a ruling. It stops XT-contracts-7, and XT-contracts-5 too: that test checks each token's methods against the committed rows, and without a ruling it has no ruled way to treat the three static rows (the Story 10.2 Fidelity Review rejected leaving them out on the strength of this open Escalation). The contracts themselves are ported, with the three members left out until the ruling, and XT-contracts-6 goes ahead.

