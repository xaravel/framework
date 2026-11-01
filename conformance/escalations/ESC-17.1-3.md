---
test_ids:
  - "Illuminate\\Tests\\Container\\ContainerTest::testScopedDoesNotRegisterDuplicateScopedInstances"
  - "Illuminate\\Tests\\Container\\ContainerTest::testScopedIfDoesNotRegisterDuplicateScopedInstancesWhenRebound"
  - "Illuminate\\Tests\\Container\\UtilTest::testGetParameterClassName"
  - "Illuminate\\Tests\\Container\\ContainerTest::testResolutionOfDefaultParameters"
  - "Illuminate\\Tests\\Container\\ContainerTest::testResolutionOfClassWithDefaultParameters"
  - "Illuminate\\Tests\\Container\\ContainerTest::testResolutionOfClassWithDefaultParametersAndContextualBindings"
  - "Illuminate\\Tests\\Container\\ContainerResolveNonInstantiableTest::testResolvingNonInstantiableWithDefaultRemovesWiths"
trigger: contract
proposed: >-
  Option 1 (recommended): a monitor- or Maintainer-approved Infrastructure item in packages/runtime supplies the PHP reflection surface Container and its tests need: ReflectionParameter PHP callable/index constructor forms while retaining its existing internal construction, default availability/value, optionality, hasType, allowsNull and parameter attribute readers using the declaration chosen in ESC-17.1-2; ReflectionClass getConstructor and isInstantiable; ReflectionProperty with getValue for the properties the port represents. Each keeps PHP names/behaviour and has XT-runtime cases against PHP 8.5.11. Preserve existing exports and readers. The same item may add missing PHP call_user_func and spl_object_id used by Container.php, with shared callable/object-identity implementations and PHP probes. Option 2: a narrower ruling explicitly identifies existing approved conversions that remove particular surface requirements; never reimplement PHP reflection inside Container or replace reflective assertions.
evidence: >-
  UtilTest.php:47-53 constructs ReflectionParameter(closure, 0); runtime ReflectionParameter.ts instead requires (name, spec, declaringClass). ContainerTest.php:204 and :220 assert via new ReflectionProperty(container, scopedInstances).getValue(container); no runtime ReflectionProperty exists. Container.php:1159,1170 calls ReflectionClass isInstantiable/getConstructor, absent from runtime ReflectionClass.ts; :1329,1358 reads missing parameter defaults. bun run scan:builtins container also reports call_user_func (Container.php:464,1793) and spl_object_id (:1141) missing from runtime exports. Source-only calls can reuse existing approved idioms where semantically complete, but replacing the direct test reflection with a different assertion is not authorized. AD-19 places shared PHP semantics in runtime, outside this Story component. The runtime-builtins standing rule and 2026-10-30 amendment require a second key.
---

# ESC-17.1-3: Container requires missing runtime reflection contracts

UtilTest.php:47-53 constructs ReflectionParameter(closure, 0); runtime ReflectionParameter.ts instead requires (name, spec, declaringClass). ContainerTest.php:204 and :220 assert via new ReflectionProperty(container, scopedInstances).getValue(container); no runtime ReflectionProperty exists. Container.php:1159,1170 calls ReflectionClass isInstantiable/getConstructor, absent from runtime ReflectionClass.ts; :1329,1358 reads missing parameter defaults. bun run scan:builtins container also reports call_user_func (Container.php:464,1793) and spl_object_id (:1141) missing from runtime exports. Source-only calls can reuse existing approved idioms where semantically complete, but replacing the direct test reflection with a different assertion is not authorized. AD-19 places shared PHP semantics in runtime, outside this Story component. The runtime-builtins standing rule and 2026-10-30 amendment require a second key.
