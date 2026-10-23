---
test_ids:
  - XT-contracts-5
trigger: contract
proposed: >-
  Option 1 (recommended): PHPUnit's `Generator` and Mockery's `DoubleTarget`
  (`packages/assert/`, `packages/mockery/`, both Protected) take a double's
  methods from the target token and from every token in its parents
  closure (`Symbol.for('xaravel.contract.parents')`), each once, so a double
  of a child contract can configure an inherited method as a PHP mock can.
  A contract whose PHP parent is a built-in interface (`Countable`,
  `ArrayAccess`, `IteratorAggregate`, `Stringable`) also records those
  methods: `contract()` takes them in an optional `builtins` list
  (`count`, `offsetExists/offsetGet/offsetSet/offsetUnset`,
  `Symbol.iterator`, `toString`), which the doubles add the same way. Tokens
  keep their declared methods in `Symbol.for('xaravel.contract.methods')`,
  matching the API-surface rows. Option 2: tokens list their inherited
  methods too, so the doubles need no change, and the token metadata no
  longer matches the rows.
evidence: >-
  A token's `Symbol.for('xaravel.contract.methods')` lists only the methods
  its contract declares, as the committed API-surface rows do (Story 10.1's
  PSR tokens, Story 10.2's tokens). Mockery's `DoubleTarget`
  (`packages/mockery/src/JMac/Testing/Engine/DoubleTarget.ts`, header and
  around line 160) and PHPUnit's `Generator`
  (`packages/assert/src/Framework/MockObject/Generator/Generator.ts`, around
  line 256) say "Only brands are added: the doubled methods stay the target
  token's own list" (ESC-10.1-6). Story 10.2 adds the first child contracts
  whose parents declare methods: `Foundation\Application extends
  Container\Container`, `Cache\Repository extends
  Psr\SimpleCache\CacheInterface`, `Filesystem\Cloud extends
  Filesystem\Filesystem`, `Bus\QueueingDispatcher extends Bus\Dispatcher`,
  `Validation\Validator extends Support\MessageProvider`, and contracts with
  built-in parents: `Support\MessageBag` (`Countable`),
  `Support\ValidatedData` (`ArrayAccess`, `IteratorAggregate`),
  `Validation\ParameterizedRule` (`Stringable`). A double of any of them
  cannot configure `count()`, `offsetGet()`, `toString()` or a parent
  contract's method, which a PHP mock can. Story 10.1 deferred this to Story
  10.2; raised again by a Story 10.2 code reviewer.
---

# ESC-10.2-4: a double of a child contract cannot configure inherited methods

A PHP mock of an interface has every method of the interfaces it extends. A Xaravel double takes its methods from the target token only. Since ESC-10.1-6 it carries its parents' brands, but not their methods, and built-in PHP parents (`Countable`, `ArrayAccess`, `IteratorAggregate`, `Stringable`) record nothing at all. So a double of `Foundation\Application` cannot configure `make()`, and a double of `Support\MessageBag` cannot configure `count()`.

The recommended fix, Option 1, has both doubles add the methods of the whole parents chain, plus the built-in parents' methods a token records. It changes the two Protected grader packages and `contract()`, so it needs a ruling. This stops XT-contracts-5, whose double rows depend on it.
