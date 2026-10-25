---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testGetClassName"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testEmptyClassName"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testStringTypeName"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testSelfClassName"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testParentClassName"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testParameterSubclassOfInterface"
  - "Illuminate\\Tests\\Support\\SupportReflectorTest::testUnionTypeName"
  - XT-reflection-1
trigger: contract
proposed: >-
  Option 1 (recommended): `@xaravel/runtime/php` gains PHP's reflection
  classes, limited to the members that `Reflector`, `ReflectsClosures` and
  their tests call. These are `ReflectionClass` (`getName`, `getMethod`,
  `getParentClass`, `isSubclassOf`), `ReflectionMethod` and
  `ReflectionFunction` (`getParameters`), `ReflectionParameter` (`getName`,
  `getType`, `getDeclaringClass`, `isVariadic`), `ReflectionNamedType`
  (`getName`, `isBuiltin`) and `ReflectionUnionType` (`getTypes`). Each is
  registered under its PHP name. They read parameters from `inject`
  metadata: a key is a parameter, and its Spec is the type. A class or token
  is a named non-builtin type named by `fqcn()`. `String`, `Number`,
  `Boolean` and `primitive` are builtin types. `oneOf(...)` is a union. The
  Spec markers `self` and `parent` stand for PHP's relative hints, and the
  runtime defines them beside `inject` (AD-4's Spec list gains them, under
  a new DIV-3 clause). As with ESC-12.1-2, an Infrastructure action item
  builds this before the Story resumes. The Ported Tests then keep
  `(new ReflectionClass(B)).getMethod('f').getParameters()[0]`, and the
  fixture method is declared `@inject({ x: parent })`, marked
  `adapted:DIV-3.1`. testGetClassName, testEmptyClassName,
  testStringTypeName and testSelfClassName become `blocked-by:mail`,
  `blocked-by:mail`, `blocked-by:bus` and `blocked-by:database`.
  testUnionTypeName becomes `blocked-by:database`, because its union names
  `Model`. Option 2: `@xaravel/reflection` defines its own parameter
  descriptor, and `Reflector`'s parameter methods take that descriptor.
  This adds members the api-surface gate reports, which need
  `additions.jsonl` entries (a Protected Path), and every later Component
  (Container, Routing, Events) would build descriptors by hand.
evidence: >-
  Upstream's `Reflector::getParameterClassName`, `getParameterClassNames`,
  `isParameterSubclassOf` and `isParameterBackedEnumWithStringBackingType`
  take a `\ReflectionParameter`
  (framework/src/Illuminate/Reflection/Reflector.php:99-202). Every one of
  these tests builds one through
  `(new ReflectionClass(X::class))->getMethod('m')->getParameters()[0]`
  (framework/tests/Support/SupportReflectorTest.php:16-63). Nothing in
  `packages/runtime/src` defines a PHP reflection class: `inject` and
  `readInjectMetadata` (packages/runtime/src/metadata/inject.ts) return
  only a frozen name-to-Spec map. PORTING.md § Imports says PHP's own
  classes come from `@xaravel/runtime`, and a Story may not edit
  `packages/runtime`. Upstream's `getTypeName` resolves `self` and `parent`
  hints against the declaring class (Reflector.php:146-161).
  testParentClassName checks exactly that (`f(parent $x)` gives `A`), and
  AD-4's Spec list (spine AD-4, DIV-3) has no value for a relative hint.
  Declaring `{ x: A }` instead would make the test pass without exercising
  the branch. `oneOf` and `primitive` are Container's (Epic 17) and do not
  exist yet. XT-reflection-1 (`getParameterClassName` over an
  `inject({ event: OrderShipped })` method) needs the same parameter object.
---

# ESC-13.1-1: `Reflector`'s parameter methods take a `ReflectionParameter`, which has no runtime analogue

Seven `SupportReflectorTest` tests and XT-reflection-1 pass a PHP `ReflectionParameter` to `Reflector`. Xaravel has no reflection classes, and the reflection package may not add PHP's own classes to `@xaravel/runtime`. PHP's `self` and `parent` hints have no `inject` Spec either. Option 1 adds the minimal reflection classes and the `self` / `parent` markers to the runtime, over `inject` metadata. Option 2 gives `Reflector` its own descriptor type. Work on these Test IDs stops here.
