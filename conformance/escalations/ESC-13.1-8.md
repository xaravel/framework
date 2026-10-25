---
test_ids:
  - XT-reflection-4
trigger: contract
proposed: >-
  Option 1 (recommended): define how reflection recognises a ported
  backed enum. An AD-26 enum is a registered class with static instances,
  `cases()`, `from()` and `tryFrom()`. A backed enum also records its
  backing type as a static marker (for example `static backingType =
  'string' | 'int'`) that generators emit from Upstream. The runtime then
  gains `ReflectionEnum` (`isBacked()`, `getBackingType()` as a
  `ReflectionNamedType`), and `enum_exists` reads the marker. With those,
  `isParameterBackedEnumWithStringBackingType` ports line for line. This
  is a runtime change and an enum-model decision (spine AD-26), so it
  needs the Maintainer. Option 2: list the method in
  `conformance/api-surface/exceptions.jsonl` as `deferred:` until the enum
  model exists. The Story then ships without it, and routing (which calls
  it for implicit enum binding) adds it later.
evidence: >-
  `isParameterBackedEnumWithStringBackingType` calls `enum_exists`, `new
  ReflectionEnum(...)`, `isBacked()` and `getBackingType()->getName()`
  (framework/src/Illuminate/Reflection/Reflector.php:191-211). ESC-9.7-1
  records that "No AD defines a ported enum model yet". AD-26's row says
  only "A class with static instances, cases(), from(), tryFrom()", with
  no backing type. packages/runtime/docs/reflection.md lists
  `ReflectionEnum` under "Not ported". The method is in the api-surface
  export (conformance/api-surface/reflection.jsonl), so XT-reflection-4's
  close gate (`api-surface:gate reflection`, 0 unexplained) cannot pass
  without it or a Protected `exceptions.jsonl` line. No Upstream test in
  the Story's scope calls it.
---

# ESC-13.1-8: `isParameterBackedEnumWithStringBackingType` needs an enum model

The method asks whether a parameter's class is a string-backed enum. Xaravel has no rule for what a ported enum is or what its backing type is, and the runtime ports no `ReflectionEnum`. Option 1 defines the model and adds `ReflectionEnum`. Option 2 defers the method in `exceptions.jsonl`. Work on the method, and so on XT-reflection-4's close gate, stops here.
