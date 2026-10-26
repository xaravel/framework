---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEnsureForObjects#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testEnsureForObjects#1"
trigger: divergence
proposed: >-
  Option 1 (recommended): a new DIV-12 clause. In a test whose dataset row
  holds a class-name string (`[Collection::class]`), PORTING.md's
  data-provider rule passes the constructor. Where Upstream uses that
  parameter as a value rather than as a class (`new $collection`,
  `$collection::make`), the port writes `fqcn(collection)`, the class-name
  string PHP holds. testEnsureForObjects then puts `fqcn(collection)` into
  the items and expects `gettype(...)` to be `'string'`, as Upstream does.
  The test's `class_basename(new stdClass())` is `@xaravel/support`'s
  (Phase 2), so both rows stay `blocked-by:support` until that helper lands,
  and the clause decides how they port then. Option 2: the row keeps the
  constructor as the value, and the expected type becomes `'Closure'` /
  `'object'`. That changes an expected value, which only the Maintainer may
  approve.
evidence: >-
  SupportCollectionTest.php:6261-6269 builds
  `$collection::make([new stdClass, new stdClass, new stdClass,
  $collection])` and expects `UnexpectedValueException(sprintf('Collection
  should only include [%s] items, but \'%s\' found at position %d.',
  class_basename(new stdClass()), gettype($collection), 3))`. In PHP
  `$collection` is the string `'Illuminate\Support\Collection'`
  (collectionClassProvider, :6495), so the message says `'string'`.
  PORTING.md:76 says a row of class names holds the constructors, so in the
  port the fourth item is a function: `getDebugType` gives `'Closure'` and
  `gettype` gives `'object'`, and `ensure` reports a different type. No DIV
  clause covers a class-name dataset value used as a value. `class_basename`
  is a support helper (Collections/helpers.php does not define it), support
  is Phase 2 and collections Phase 1 (tools/scaffold/packages.jsonl), and
  conformance/tests/xaravel/graph.test.ts forbids the import.
---

# ESC-14.1-7: testEnsureForObjects uses the dataset's class-name string as an item, and the port's dataset holds a constructor

PHP's `collectionClassProvider` gives a class-name string, and testEnsureForObjects puts that string into the collection to check that `ensure` reports `'string'`. PORTING.md turns the row into a constructor, which reports a different type. Option 1 writes `fqcn(collection)` wherever Upstream uses the dataset value as a value, under a new DIV-12 clause. Option 2 changes the expected type. Either way, the test also needs support's `class_basename`, so both rows are `blocked-by:support` for now. Work on these two Test IDs stops here.
