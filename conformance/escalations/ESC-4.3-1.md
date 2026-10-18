---
test_ids:
  - XT-assert-8
  - XT-assert-10
trigger: contract
proposed: >-
  Adopt the grader-side protocols (1)-(3) of Story 4.3 as written here, give
  the comparators of item (4) and the PCRE rule of item (5) an owner, read
  FR-116 and the scan list as items (6) and (7) say, and settle the counting
  conflict (8), the two comparator divergences (9) and (10), and the
  exception, export, class-value and placement questions (11)-(15). (1) Class names. Story
  9.4's `registerClass` and Epic 10's contract tokens set
  `[Symbol.for('xaravel.class.fqcn')]` (a string) on the class or token; the
  grader reads it (on the value, then on its constructor) to print PHP class
  names in failure messages, and falls back to the constructor's `name` for
  display only (AD-10). An `Object`-class object is `stdClass`; a function is
  a `Closure`. A class argument (`assertInstanceOf`,
  `assertContainsOnlyInstancesOf`) is a class, or an interface token (an
  object with `Symbol.hasInstance` and the FQCN brand); a class name given as
  a string names no class (the grader has no class table) and throws
  PHPUnit's UnknownClassOrInterfaceException. (2) Value brands. A Countable is
  branded `Symbol.for('Countable')` and has `count()`; a Traversable is an
  object (not a PHP array) with `[Symbol.iterator]`, iterating its values; an
  ArrayAccess is branded `Symbol.for('ArrayAccess')` and has `offsetExists()`;
  a resource is branded `Symbol.for('xaravel.php.resource')`, whose value is
  its type (`'stream'`), and its id in messages is the grader's own counter
  (tests compare it as `resource(<n>)`, like object handles as `Object
  #<n>`). A Stringable is an object whose own `toString()` (spine § naming:
  `__toString`) returns a string. (3) Callables. A callable is a function, or
  `[object|class, methodName]` naming a method; a PHP function-name string is
  not callable (no global function table). (4) The comparators not ported
  here: DateTime and DateInterval (Epic 19), Enumeration (Story 9.x's enum
  model), SplObjectStorage, DOMNode, MockObject (Story 4.5) and Number. Until
  then a JS built-in (`Date`, `Map`, …) is `assertEquals`-equal only to
  itself. Proposed: a follow-up `assert` Story, or the owning Story through a
  Maintainer-approved Infrastructure Story, adds each comparator once its
  value model exists. (5) DIV-10: no Story's ACs own the mechanical
  PCRE-to-`RegExp` rule that `PORTING.md` must hold. Proposed: Story 8.1 or
  8.2. Story 4.3 tests only patterns whose PCRE and JS behaviour agree.
  (6) FR-116 says `assertEquals` follows PHP `==`. PHPUnit's comparator is
  stricter (`assertEquals('1', '01')` and `assertEquals([], false)` fail,
  where `==` is true), so Story 4.3 follows PHPUnit. Proposed: read FR-116 as
  "PHPUnit's `assertEquals`". (7) The scan list holds `assertContainsOnly`
  (one Upstream call, `DatabaseEloquentCollectionTest::testLoadExistsShouldCastBool`,
  on its PHPUnit-below-11.5 branch), which PHPUnit 12 removed, so the Oracle
  cannot call it. Story 4.3 implements PHPUnit 11.5's signature
  (`$type, $haystack, $isNativeType = null, $message = ''`) through the
  PHPUnit 13 constraint it became (`TraversableContainsOnly::forNativeType` or
  `::forClassOrInterface`), and its requests call that constraint through a
  shim. PHPUnit 11.5's type aliases `integer`, `boolean`, `double` and
  `real` read as `int`, `bool`, `float` and `float`. Proposed: accept that
  reading, or drop the name from the scan list. (8) `assertArraySubset`
  records its own kind, as Story 4.3's intent says, while the Inventory
  records Laravel's call as `assertThat` (Laravel's
  `Illuminate\Testing\Assert::assertArraySubset` calls `PHPUnit::assertThat`,
  and the recorder counts only `PHPUnit\Framework\Assert::assert*` calls), so
  the FR-113 floor would see a kind the Inventory never recorded. Proposed:
  record `assertThat` as the Inventory does, or have the harness floor map
  `assertArraySubset` to `assertThat`. (9) Closure equality is identity in
  JS: two distinct functions are never equal. Comparator 8.4.0 compares
  closures by declaration (name, file, start and end line), binding and
  captured state, and its failure message names the PHP file and line; and
  whenever the ClosureComparator runs, PHPUnit 13.4.3 emits the test warning
  "Comparing closures for equality is problematic because there is no
  reliable way to determine whether two closures are equal", which the port
  drops. Proposed: accept both as a DIV clause, or name an owner for a
  declaration protocol and the warning. (10) `ExceptionComparator` accepts every JS `Error`, while PHP's
  `\Error` family (not `\Exception`) goes through `ObjectComparator`, which
  compares and exports `file` and `line` too. Proposed: accept as a DIV
  clause (a JS `Error` has no PHP file or line), or name an owner for an
  `\Error`/`\Exception` brand. (11) `getMessage()` returns text fixed when
  the exception is built, while Laravel's
  `TestResponseAssert::appendMessageToException` rewrites a caught
  exception's message through reflection, and the Testing component cannot
  edit `packages/assert`. Proposed: a later `assert` Story adds a supported
  way to amend the message (or the Testing Story asks for one through an
  Escalation); owner: that `assert` Story. (12) `ComparisonFailure::getDiff()`
  and `toString()` (sebastian/diff's unified diff;
  `tests/Testing/TestResponseTest.php:3032` uses it), and PHPUnit's fuller
  exception API (`previous`, `getCode()`, `getPrevious()`, `toString()`, the
  `PHPUnit\Framework\Exception` base; ArtisanCommandTest's
  `expectExceptionObject(new AssertionFailedError('…'))`) are not in Story
  4.3. Proposed owner: Story 4.4. (13) A full export of an exception (two
  exceptions of different classes go through ObjectComparator, whose message
  exports the actual value) lacks PHP's `string`, `file`, `line` and `trace`.
  Proposed: a DIV clause, or accept it as a message-only difference.
  (14) PHP's built-in classes and interfaces (`Closure`, `Stringable`,
  `ArrayObject`, `ArrayIterator`, `ArrayAccess`, `DateTimeInterface`,
  `Countable`, `Traversable`) need class values or tokens that a Ported Test
  can pass to `assertInstanceOf`. Proposed owner: the Epic 9 runtime and
  Epic 10 contracts, using item (1)'s brand. (15) Laravel's
  `Illuminate\Testing\Assert::assertArraySubset` sits on the port of
  `PHPUnit\Framework\Assert` (PHPUnit has no such method) because the grader
  cannot import the Testing component. Proposed: keep it there and have the
  Testing component's `Illuminate\Testing\Assert` delegate to it, or move it
  once the Testing component exists; owner: the Testing component's Story.
evidence: >-
  The grader may import neither `@xaravel/runtime` nor any contract package
  (AD-2, epic 4 context: Grader isolation), so it detects classes, resources,
  Countables and callables only by `Symbol.for` brands and shapes that no
  owning Story has adopted yet (`registerClass` is Story 9.4's, tokens are
  Epic 10's, resources and `PhpArray` are Story 9.5's). If those Stories pick
  other brands, failure messages name the wrong class, `assertInstanceOf`
  against an interface token fails, and `assertIsResource` or `assertCount`
  misread their argument without any error. XT-assert-8 pins each protocol
  against the signed Oracle through twin values (operands.ts). PHPUnit 13.4.3
  has no `assertContainsOnly` (vendor/phpunit/phpunit/src/Framework/Assert.php),
  while `conformance/scans/phpunit-assertions.jsonl` lists it. Probed with
  evaluate.php on 2026-10-18: `assertMatchesRegularExpression('/^a$/m',
  "a\r\nb")` fails in PHP (PCRE's `$` sees only `\n`) and passes in JS, so a
  PCRE pattern cannot be reused verbatim even when it parses in both.
  Counting: tools/baseline/recorder.php records a kind first thing in each
  rewritten `PHPUnit\Framework\Assert::assert*` body and skips calls whose
  caller is `PHPUnit\Framework\Assert`; the Inventory records
  `AboutCommandTest::testItCanDisplayAboutCommandAsJson` as `{"assertThat":3}`
  for its three `assertArraySubset` calls. Closures: whenever the
  ClosureComparator runs, `Constraint::isEqual`
  (vendor/phpunit/phpunit/src/Framework/Constraint/Constraint.php:366-370)
  emits a test warning through `TestMethodBuilder::fromCallStack()`, which
  reads the running test's metadata; on the evaluator's bare TestCase that
  ends in the metadata parser's `assert(method_exists($className,
  $methodName))` (probed with evaluate.php on 2026-10-18: `assertEquals($f1,
  $f2)` on two closures throws that AssertionError). So no closure-equality
  cell can come from the Oracle, and Story 4.3's requests run two distinct
  closures only through `assertSame` and `assertNotSame`.
---

# ESC-4.3-1: the grader's class, value and callable protocols, the unported comparators, DIV-10 and two readings

Story 4.3's assertions print and compare values the grader cannot import a model for. Items (1)-(3) are contracts to adopt; (4) and (5) need an owner; (6) and (7) are readings to confirm; (8) is a counting conflict between the Story's intent and the Inventory; (9) and (10) are comparator divergences the JS value model cannot close; (11)-(15) are gaps and placements that need an owner. The numbers match `proposed`.

1. **Class names (Story 9.4, Epic 10).** Messages print PHP class names (`Failed asserting that XtA Object #3 (…) is not instance of expected class "XtB".`, `… is an instance of interface XtI`). The grader reads `[Symbol.for('xaravel.class.fqcn')]` on the value, then on its constructor, else uses the constructor's `name` for display only (AD-10). A class argument is a class or an interface token with `Symbol.hasInstance`; a string names no class and throws `UnknownClassOrInterfaceException`. Proposed: `registerClass` and the token generator set that brand.
2. **Value brands (Story 9.5 and the Contracts).** Countable (`Symbol.for('Countable')` with `count()`), Traversable (`[Symbol.iterator]`, values only), ArrayAccess (`Symbol.for('ArrayAccess')` with `offsetExists()`), resource (`Symbol.for('xaravel.php.resource')`, value = type) and Stringable (own `toString()`). A resource id and an object handle come from the grader's counter, never PHP's. Proposed: adopt as written.
3. **Callables.** A function, or `[object|class, methodName]`. A PHP function-name string is never callable here. Proposed: adopt as written.
4. **Unported comparators.** DateTime, DateInterval, Enumeration, SplObjectStorage, DOMNode, MockObject and Number need value models that later Stories build. Until then a JS built-in equals only itself. Proposed: each is added by a follow-up `assert` Story, or by its owning Story through a Maintainer-approved Infrastructure Story.
5. **DIV-10's PCRE rule.** `assertMatchesRegularExpression` takes only a `RegExp`; a string is a `TypeError`. No Story owns the mechanical conversion rule in `PORTING.md`, and the semantics differ even for shared syntax (`$` under `/m` before `\r\n`). Proposed: Story 8.1 or 8.2 owns it.
6. **FR-116's "`assertEquals` follows PHP `==`".** The Oracle shows PHPUnit's comparator differs from `==` (`'1'` vs `'01'`, `[]` vs `false`). Story 4.3 follows PHPUnit. Proposed: read FR-116 as "PHPUnit's `assertEquals`".
7. **`assertContainsOnly`.** Removed in PHPUnit 12, listed by the scan. Story 4.3 implements PHPUnit 11.5's signature through the PHPUnit 13 constraint, with 11.5's aliases `integer`, `boolean`, `double` and `real`. Proposed: accept, or drop the name from the scan.
8. **`assertArraySubset`'s kind.** Story 4.3 records `assertArraySubset`; the Inventory records Laravel's call as `assertThat`, so the FR-113 multisets differ for every test that calls it. Proposed: record `assertThat` as the Inventory does, or have the harness floor (Epic 5) map the name.
9. **Closure equality.** Two distinct JS functions are never `assertEquals`-equal. Comparator 8.4.0 calls two closures equal when their declaration, binding and captured state are, and its failure message names the PHP file and line, which a JS function has no counterpart for. PHPUnit also emits a "Comparing closures for equality is problematic…" warning whenever the ClosureComparator runs; the port drops it. The Oracle cannot evaluate closure equality at all: the warning's `TestMethodBuilder::fromCallStack()` fails an `assert(method_exists(…))` on the evaluator's bare TestCase. Proposed: accept both differences as a DIV clause, or name an owner.
10. **PHP's `\Error` family.** The grader's `ExceptionComparator` accepts every JS `Error`. PHP sends only `\Exception` there; an `\Error` goes through `ObjectComparator` with its `file` and `line`. Proposed: accept as a DIV clause, or name an owner for a brand that tells the two apart.
11. **Rewriting a caught failure's message.** `getMessage()` returns the text fixed at construction. Laravel's `TestResponseAssert::appendMessageToException` rewrites a caught exception's message through reflection, and the Testing component cannot edit `packages/assert`. Proposed: a later `assert` Story adds a supported way (or the Testing Story asks for one).
12. **`getDiff()`, `toString()` and the fuller exception API.** sebastian/diff's unified diff (`ComparisonFailure::getDiff()`/`toString()`, used at `tests/Testing/TestResponseTest.php:3032`), and `previous`, `getCode()`, `getPrevious()`, `toString()` and the `PHPUnit\Framework\Exception` base (`expectExceptionObject(new AssertionFailedError('…'))` in ArtisanCommandTest) are not in Story 4.3. Proposed owner: Story 4.4.
13. **Full export of an exception.** Two exceptions of different classes go through ObjectComparator, whose message exports the actual exception without PHP's `string`, `file`, `line` and `trace`. Proposed: a DIV clause, or accept it as a message-only difference.
14. **Built-in classes and interfaces.** `Closure`, `Stringable`, `ArrayObject`, `ArrayIterator`, `ArrayAccess`, `DateTimeInterface`, `Countable` and `Traversable` need class values or tokens a Ported Test can pass to `assertInstanceOf`. Proposed owner: the Epic 9 runtime and Epic 10 contracts, with item 1's brand.
15. **Where `assertArraySubset` lives.** Laravel's `Illuminate\Testing\Assert::assertArraySubset` is on the port of `PHPUnit\Framework\Assert`, which has no such method, because the grader cannot import the Testing component. Proposed: keep it there and have the Testing component's `Illuminate\Testing\Assert` delegate, or move it once that component exists.

None of Stories 4.5, 8.1, 9.4, 9.5 or Epic 10 owns these shapes, and none of their PRs may edit `packages/assert/**`. Who fixes the contract?

The options:

1. **Adopt the shapes as `proposed` (proposed).** The owning Stories build to them; a change goes through a follow-up `assert` Story or a Maintainer-approved Infrastructure Story.
2. **Move the protocols into a shared contract module that both sides import.** That breaks grader isolation (AD-2).
3. **Let each owning Story define its side and amend the grader later.** Until then, a mismatch fails silently: wrong class names in messages, or an assertion that misreads its argument.
