---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testGetClassAttributes"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testGetClassAttribute"
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/runtime/php` gains PHP's `Attribute`
  class (`TARGET_CLASS`, `IS_REPEATABLE` and the other flags, registered as
  `Attribute`), and one class-decorator writer, `attribute(AttrClass,
  ...args)`. The writer appends `{ class, args }` to the decorated class's
  own attribute list in `Symbol.metadata`, in source order. A reader gives
  `getAttributes(target, filter)` for that class's own list, filtered by
  `instanceof` on the attribute class, and `newInstance()` constructs each
  one lazily, as PHP does. Under a new DIV clause (PORTING.md's AD-26 row
  for `#[X]`), a user-declared attribute is written
  `@attribute(StrAttr, 'quick')`. A class cannot be called without `new`,
  so `@StrAttr('quick')` cannot both decorate and stay the class that
  `assertInstanceOf` checks. Framework attributes may still export a
  same-named decorator that calls `attribute(...)`. Then
  `Reflector.getClassAttribute(s)` ports line for line. testGetClassAttribute
  passes, because `flatten()->first()` becomes array code inside the
  method. testGetClassAttributes is `blocked-by:collections` until Epic 14:
  it returns a `Collection` and asserts through `map->string`, `sum`,
  `flatten` and `keys`. Option 2: the attribute class itself is declared
  with a decorator, `@Attribute(flags)`, that returns a replacement
  constructor callable without `new`. That needs a function standing in
  for the class, which breaks `fqcn()` identity and `instanceof` without a
  Proxy (AD-7).
evidence: >-
  `getClassAttributes` reads `ReflectionClass::getAttributes($attribute)`
  and calls `newInstance()` on each, for the class and, with
  `$includeParents`, each parent
  (framework/src/Illuminate/Reflection/Reflector.php:64-97). The fixtures
  declare `#[Attribute(TARGET_CLASS | IS_REPEATABLE)]` classes and put
  several on `ParentClass` and `ChildClass`
  (framework/tests/Support/Fixtures/ClassesWithAttributes.php). The tests
  check order, repeats, parent walk and `instanceof`
  (SupportReflectorTest.php:77-131). PORTING.md's Construct mapping says
  `#[X]` becomes `@X(...)` with the same name, and spine AD-7 shows it only
  for framework-defined decorators (`@ObservedBy`). Nothing defines where a
  decorator records an attribute instance, or how a user-declared
  attribute class becomes a decorator and stays the class tests check with
  `instanceof`. `packages/runtime/src` has no attribute storage, and the
  Story may not add one there. Collections (Epic 14) has no code yet.
---

# ESC-13.1-4: PHP class attributes have no recorded decorator form for reflection

`Reflector::getClassAttribute(s)` reads PHP attributes and constructs them. A class decorator could stand for one, but nothing says where it records the attribute, or how a user-declared attribute class can be both the decorator and the class `instanceof` checks. Option 1 adds `Attribute` and an `attribute(Class, ...args)` writer to the runtime under a new DIV clause. Option 2 wraps attribute classes in callable constructors. Work on these Test IDs stops here.
