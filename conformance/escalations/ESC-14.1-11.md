---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#1"
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/mockery`'s `Mockery.mock(X)` accepts the
  contract token object PORTING.md § Test-adaptation rules / Mockery names as
  a target (an `@xaravel/contracts` token such as `Arrayable`, and a runtime
  PHP-interface token such as `JsonSerializable`), and the mock it builds
  carries the token's brand and its parents' brands, as the JMac double
  generator already does (`ClassGenerator.ts:159-164`, `defineContractBrand`
  over `contractParentBrands`), so `mock instanceof Arrayable` is true as
  PHP's `Mockery::mock(Arrayable::class) instanceof Arrayable` is. It is a
  Maintainer-approved change to `packages/mockery`, with XT-mockery cases.
  The four tests then port as Upstream wrote them, with no adaptation.
  Option 2: PORTING.md's Mockery rule names the bare brand symbol
  (`Mockery.mock(Arrayable.brand)`) as the target, and Mockery's symbol
  target defines that brand on the generated class. It needs the same
  Mockery change, plus a PORTING.md edit, and leaves the runtime's
  PHP-interface tokens, which are not symbols, without a form.
evidence: >-
  testToArrayCallsToArrayOnEachItemInCollection
  (SupportCollectionTest.php:714-725) mocks `Arrayable::class` twice, and
  testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection
  (:739-751) mocks `JsonSerializable::class` and `Arrayable::class`. The
  ported `toArray()` and `jsonSerialize()` (EnumeratesValues.php:1009-1030)
  branch on `$value instanceof Arrayable` / `JsonSerializable`. PORTING.md:79
  ports `Mockery::mock(X::class)` as `Mockery.mock(X)` with `X` the contract
  token or the runtime's PHP-interface class. But `Container.parseArguments`
  (packages/mockery/src/Mockery/Container.ts:177-214) takes a class, a
  string, a symbol, a PHP array or an object; a frozen token object reads
  as a PHP array (quick definitions), so the mock is a bare `Mockery_<n>`.
  And `generatedFor` (packages/mockery/src/Mockery/Mock.ts:101-136) defines
  no brand for a symbol target either. Run under the harness, both mocks of
  `Arrayable` are not `instanceof Arrayable`, so `toArray()` returns the
  mocks themselves and the assertion fails; `Mockery.mock(Arrayable.brand)`
  and `Mockery.mock(JsonSerializable)` are not `instanceof` their tokens
  either. The Story may edit only packages/collections/**, and changing the
  tests to hand-written doubles would replace Upstream's Mockery
  expectations (one `toArray()` call per item), which no DIV clause allows.
  `blocked-by:mockery` is not available: `bun run expectations:check`
  accepts a `blocked-by` Component only of a later Phase
  (tools/expectations/reasons.ts:282), and mockery is Phase 0 while
  collections is Phase 1, so these stay `not-ported-yet` with `ESC-14.1-11`.
---

# ESC-14.1-11: `Mockery.mock(<contract token>)` builds a mock that is not `instanceof` the token

PORTING.md ports `Mockery::mock(Arrayable::class)` as `Mockery.mock(Arrayable)`, but `@xaravel/mockery`'s `Mockery.mock` does not take a contract token object as a target, and the mock it builds carries no brand, so it is not `instanceof Arrayable` or `JsonSerializable`. Collections' `toArray()` and `jsonSerialize()` test exactly that, so the two Upstream tests that mock those interfaces fail. Option 1 has Mockery accept the token and define its brands, as the JMac doubles already do. Option 2 uses the brand symbol instead and edits PORTING.md. It stops only these four Test IDs; the rest of Story 14.1 is unaffected.
