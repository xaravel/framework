---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testArrayAccessOffsetUnset"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testBehavesLikeAnArrayWithArrayAccess"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testOffsetAccess"
  - "XT-collections-2"
trigger: divergence
proposed: >-
  Option 1 (recommended): DIV-12.6 (or a new DIV-12 clause beside it) covers
  the other three ArrayAccess forms with the method PHP itself calls:
  `$c[k] = v` becomes `c.offsetSet(k, v)`, `$c[] = v` becomes
  `c.offsetSet(null, v)`, `isset($c[k])` becomes `c.offsetExists(k)`, and
  `unset($c[k])` becomes `c.offsetUnset(k)`. Each changed line carries the
  clause's marker. Option 2: only reads are rewritten (DIV-12.6), and a test
  that assigns, isset-checks or unsets through index syntax is skipped,
  which removes assertions.
evidence: >-
  DIV-12.6 reads in full: "Collection index access. `$collection[0]` becomes
  `collection.get(0)`." (decisions/DIV-12.md:35), and PORTING.md:87 applies it
  to `a[k]` reads only. testOffsetAccess assigns `$c['name'] = 'dayle'`,
  appends `$c[] = 'jason'`, and asserts `isset($c['name'])` before and after
  `unset($c['name'])` (SupportCollectionTest.php:783-794);
  testBehavesLikeAnArrayWithArrayAccess compares `isset($input[k])` with
  `isset($c[k])` for six keys (:804-822); testArrayAccessOffsetUnset asserts
  `assertFalse(isset($c[1]))` (:838-843). Index syntax works only on Model,
  through its Proxy (PORTING.md:20, AD-7). A marker must cite a clause that
  says what changed (F-5).
---

# ESC-14.1-4: `$collection[k] = v`, `isset($collection[k])` and `unset($collection[k])` have no DIV clause

DIV-12.6 covers reading a collection by index. Three tests also assign, append, `isset` and `unset` through index syntax, which a JS class cannot intercept. Option 1 extends the rule to the `offsetSet` / `offsetExists` / `offsetUnset` calls PHP makes for those forms. Option 2 leaves them unported. Work on these Test IDs stops here.
