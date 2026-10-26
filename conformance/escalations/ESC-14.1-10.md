---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetArrayableItems#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGetArrayableItems#1"
trigger: contract
proposed: >-
  Option 1 (recommended): the runtime's `ReflectionMethod`
  (`packages/runtime/src/php/ReflectionMethod.ts`) gains PHP's `invoke($object,
  ...$args)` and `invokeArgs($object, $args)`, plus `setAccessible()` as the
  no-op it is since PHP 8.1. Both call the method on the object (or the class,
  for a static method) whatever its visibility, as PHP 8.1+ does, and keep
  PHP's `ReflectionException` when the object is not an instance of the
  declaring class. It goes in the same Maintainer-approved runtime item as
  ESC-14.1-9, with XT-runtime cases. The test then ports with no adaptation.
  Option 2: a new DIV clause lets a Ported Test call a protected method
  directly (`data.getArrayableItems(items)`), since TypeScript's `protected`
  is erased at run time (DIV-9.14 already says so for `isCallable`). It needs
  no runtime change, but it is a divergence outside DIV-1..12's current
  clauses and every later Upstream test that reflects on a non-public method
  would need the same adaptation.
evidence: >-
  testGetArrayableItems (SupportCollectionTest.php:680-710) does
  `$method = (new ReflectionClass($collection))->getMethod('getArrayableItems')`
  and then `$method->invokeArgs($data, [$items])` seven times to call the
  protected `getArrayableItems` (EnumeratesValues.php:1123). The runtime's
  `ReflectionMethod` (ReflectionMethod.ts:16-67) has `getName`,
  `getDeclaringClass`, `getParameters`, `getReturnType` and `isPublic`, and no
  `invoke`, `invokeArgs` or `setAccessible`. No DIV clause or PORTING.md row
  covers calling a non-public method another way. The Story may edit only
  packages/collections/**. The test also constructs collections, so it waits
  on ESC-14.1-9 as well.
---

# ESC-14.1-10: testGetArrayableItems calls `ReflectionMethod::invokeArgs`, which the runtime does not have

Upstream's testGetArrayableItems reaches the protected `getArrayableItems` through `ReflectionMethod::invokeArgs`. The runtime's `ReflectionMethod` has no `invoke` or `invokeArgs`, and no clause lets a Ported Test call the protected method directly. Option 1 adds `invoke`, `invokeArgs` and the no-op `setAccessible` to the runtime, beside ESC-14.1-9's exports. Option 2 adds a DIV clause for calling it directly. It stops only these two Test IDs.
