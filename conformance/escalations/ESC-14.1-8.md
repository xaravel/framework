---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testBehavesLikeAnArrayWithArrayAccess"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testConstructMethodFromWeakMap#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testConstructMethodFromWeakMap#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testOffsetAccess"
trigger: divergence
proposed: >-
  Option 1 (recommended): amend DIV-12.17 in two ways. (a) It covers every
  PHP `ArrayAccess` object, not only Collection. `$map[$object] = 3` on the
  runtime's `WeakMap` (or an `ArrayObject` / `ArrayIterator`) becomes
  `map.offsetSet(object, 3)`, by the same rule. (b) A test that uses index
  reads (DIV-12.6) together with writes, `isset` or `unset` (DIV-12.17)
  records DIV-12.17 on its Expectations line, because DIV-12.17 already
  includes the reads ("Beside DIV-12.6's index reads"). Each changed source
  line keeps the marker of its own clause. Option 2: the Expectations
  format's `adapted` becomes a list of clauses. That changes a Protected
  Path (`conformance/README.md`, `tools/divergence/`, `tools/expectations/`)
  and every reader of the field.
evidence: >-
  testConstructMethodFromWeakMap writes `$map[$object] = 3` on a PHP WeakMap
  (SupportCollectionTest.php:3321-3329). The runtime's WeakMap has
  `offsetSet` (packages/runtime/docs/php-builtins.md), but DIV-12.17 is
  titled and worded for "Collection index writes, `isset` and `unset`"
  (decisions/DIV-12.md:46), and DIV-12.6 for "Collection index access"
  (:35). testOffsetAccess reads `$c['name']`, writes `$c['name'] =
  'dayle'`, appends `$c[] = 'jason'`, and uses `isset` and `unset`
  (:783-794). testBehavesLikeAnArrayWithArrayAccess compares `isset($c[k])`
  and `$c[k]` (:804-823). Each needs DIV-12.6 and DIV-12.17 in one test.
  An Expectations line's `adapted` is one string naming one clause
  (conformance/README.md:9, tools/divergence/divergence.ts), and no
  Ported Test on main records two clauses for one Test ID.
---

# ESC-14.1-8: DIV-12.17 names only Collection, and an Expectations line can record only one of DIV-12.6 and DIV-12.17

The WeakMap test writes through index syntax on a PHP `WeakMap`, which DIV-12.17 does not name. Two other tests use both index reads (DIV-12.6) and writes or `isset` (DIV-12.17), but an Expectations line has room for one clause. Option 1 widens DIV-12.17 to every `ArrayAccess` object and records DIV-12.17 on a line that uses both. Option 2 makes `adapted` a list, which changes Protected tooling. Work on these four Test IDs stops here.
