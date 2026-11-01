---
test_ids:
  - "Illuminate\\Tests\\Container\\ContainerTest::testResolutionOfDefaultParameters"
  - "Illuminate\\Tests\\Container\\ContainerTest::testResolutionOfClassWithDefaultParameters"
  - "Illuminate\\Tests\\Container\\ContainerTest::testResolutionOfClassWithDefaultParametersAndContextualBindings"
  - "Illuminate\\Tests\\Container\\ContainerResolveNonInstantiableTest::testResolvingNonInstantiableWithDefaultRemovesWiths"
trigger: divergence
proposed: >-
  Option 1 (recommended): the Maintainer extends DIV-3 with an explicit named-map Spec form for default values and nullable hints, implemented once in packages/runtime metadata and reflection. Settle its public spelling, default-value versus nullable-without-default semantics, and default evaluation timing; preserve inject as the sole parameter declaration, existing maps, and every Upstream assertion. A runtime Infrastructure item supplies the metadata and reflection before Story 17.1 resumes. Option 2: choose another explicit representation in the same inject map through a recorded ruling. No Function.toString parsing, fixture-only defaults table, undefined absent-value protocol, skipped assertions or private Container metadata.
evidence: >-
  ContainerTest.php:381-409 and fixtures:1181-1202 distinguish an untyped default taylor, a required nullable class, and a nullable class default null. In testResolutionOfClassWithDefaultParameters the unbound optional class stays null, but after bind the same argument resolves an instance. ContainerResolveNonInstantiableTest.php:10-15,49 declares ?TestInterface $testObject = null and int $i = 0. Container.php:1329-1338 and :1358-1361 inspect default availability and nullability before resolving. packages/runtime/src/metadata/{inject,specs}.ts and decisions/DIV-3.md define no default/optional/nullable parameter representation; ReflectionParameter.ts has no such readers. Passing undefined to a JS constructor cannot decide whether an optional class should resolve. The spec cannot meet the sufficient/coherent ready-for-development standard until the declaration is decided.
---

# ESC-17.1-2: Injection metadata cannot express constructor defaults and nullable hints

ContainerTest.php:381-409 and fixtures:1181-1202 distinguish an untyped default taylor, a required nullable class, and a nullable class default null. In testResolutionOfClassWithDefaultParameters the unbound optional class stays null, but after bind the same argument resolves an instance. ContainerResolveNonInstantiableTest.php:10-15,49 declares ?TestInterface $testObject = null and int $i = 0. Container.php:1329-1338 and :1358-1361 inspect default availability and nullability before resolving. packages/runtime/src/metadata/{inject,specs}.ts and decisions/DIV-3.md define no default/optional/nullable parameter representation; ReflectionParameter.ts has no such readers. Passing undefined to a JS constructor cannot decide whether an optional class should resolve. The spec cannot meet the sufficient/coherent ready-for-development standard until the declaration is decided.
