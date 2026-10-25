---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportMacroableTest::testCallingUndefinedMacroThrowsException"
trigger: divergence
proposed: >-
  Option 1 (recommended): add a DIV-12 clause, "Calls to a macro name that
  was never registered. PHP resolves every missing method through
  `__call` / `__callStatic`; Xaravel has no Proxy outside `Model` (AD-7,
  AD-26), and `macro(name)` makes `name` a member only once it is
  registered. An Upstream call to a method that was never registered on a
  Macroable class, `$obj::missing()` or `$obj->missing()`, becomes
  `__callStatic('missing', [])` or `__call('missing', [])`, and its
  exception expectation is unchanged." The Ported Test then reads
  `classOf(this.macroable).__callStatic('nonExistentMacro', [])` with
  `// adapted:DIV-12.<k>`, keeps
  `this.expectException(BadMethodCallException)`, and its Expectations line
  becomes `pass` with `adapted: "DIV-12.<k>"`. Option 2: skip the test as
  `intentional-divergence:DIV-12`, since the behaviour it tests (an
  arbitrary undefined static call reaching `__callStatic`) does not exist
  in Xaravel.
evidence: >-
  Upstream's test (framework/tests/Support/SupportMacroableTest.php:142-147)
  calls `$this->macroable::nonExistentMacro()` on a class that never
  registered `nonExistentMacro` and expects `BadMethodCallException`. In
  PHP the call reaches `Macroable::__callStatic`, which throws it. The port
  (packages/macroable/src/Support/Traits/Macroable.ts) follows the decided
  AD-26 form, "`macro()` installs on the prototype or the static side", with
  no Proxy (PORTING.md Construct mapping, Macroable and `__call` rows): a
  dispatcher exists only for a name `macro()` has registered. The Ported
  Test, kept as Upstream wrote it, fails with `TypeError:
  classOf(this.macroable).nonExistentMacro is not a function`, which
  `expectException(BadMethodCallException)` rejects. The other 15 Test IDs,
  testFlushMacros and testFlushMacrosStatic included (a flushed macro keeps
  its dispatcher, so it still throws `BadMethodCallException`), pass. No
  DIV-12 clause covers rewriting the call, so the test cannot be adapted
  without a new clause. Its Expectations line is `fail-known` with this
  Escalation until it is ruled.
---

# ESC-11.1-1: a call to a macro name that was never registered is a TypeError

Without a Proxy, `Macroable` can only answer calls to names `macro()` has installed. `testCallingUndefinedMacroThrowsException` calls a name that was never registered, so JavaScript throws `TypeError` before any Xaravel code runs, where PHP reaches `__callStatic` and throws `BadMethodCallException`. Option 1 adds a DIV-12 clause that routes such a call through `__callStatic` in the Ported Test and keeps the exception expectation; Option 2 skips the test under DIV-12. Work on this Test ID stops here; the Ported Test stays as Upstream wrote it.
