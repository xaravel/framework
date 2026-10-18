---
title: 'Story 4.3: Core PHPUnit assertions'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_revision: '7d497600d22da8e8db565001e0b5ff0e171b5dc7'
review_loop_iteration: 2
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/ops/oracle.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `@xaravel/assert` has PHP `==`/`===` and test declarations, but no PHPUnit assertions. Ported Tests cannot yet translate `$this->assertSame(…)` and the other core assertions one to one (FR-116, AC 1–3 of Story 4.3).

**Approach:** Port the 50 core assertions below from PHPUnit 13.4.3 (with sebastian/comparator 8.4.0 and sebastian/exporter 8.2.1, the versions in the locked Upstream install) into an `Assert` class. Each assertion records its own kind through `recordAssertion` and throws `ExpectationFailedException` with PHPUnit's exact `getMessage()` text when it fails. The Oracle (PHPUnit itself, through `php-expr` requests in `conformance/oracle-requests/4.3.jsonl`) supplies every expected pass/fail and message. The test never hand-writes those.

**The 50 assertions (scan names, by AC 1 family):**
- equality and identity: `assertSame`, `assertNotSame`, `assertEquals`, `assertNotEquals`, `assertEqualsCanonicalizing`, `assertEqualsIgnoringCase`, `assertEqualsWithDelta`;
- booleans and null: `assertTrue`, `assertFalse`, `assertNotTrue`, `assertNotFalse`, `assertNull`, `assertNotNull`;
- types and `instanceOf`: `assertInstanceOf`, `assertNotInstanceOf`, `assertIsArray`, `assertIsNotArray`, `assertIsBool`, `assertIsCallable`, `assertIsFloat`, `assertIsInt`, `assertIsNumeric`, `assertIsObject`, `assertIsResource`, `assertIsString`, `assertIsList`;
- counts and emptiness: `assertCount`, `assertSameSize`, `assertEmpty`, `assertNotEmpty`;
- containment: `assertContains`, `assertNotContains`, `assertContainsOnly`, `assertContainsOnlyBool`, `assertContainsOnlyInstancesOf`;
- array keys and subsets: `assertArrayHasKey`, `assertArrayNotHasKey`, `assertArraySubset` (Laravel's `Illuminate\Testing\Assert`), `assertObjectHasProperty`;
- strings: `assertStringStartsWith`, `assertStringEndsWith`, `assertStringContainsString`, `assertStringNotContainsString`, `assertMatchesRegularExpression`, `assertDoesNotMatchRegularExpression`, `assertStringEqualsStringIgnoringLineEndings`;
- numeric: `assertGreaterThan`, `assertGreaterThanOrEqual`, `assertLessThan`, `assertLessThanOrEqual`, `assertNan`.

The other 32 scan names (exceptions, output, files, JSON, `assertThat`, `fail`, `markTestSkipped`, database and auth assertions) belong to Story 4.4.

## Boundaries & Constraints

**Always:**
- Pass or fail as PHPUnit 13.4.3 does. `assertEquals` and the other equality assertions follow sebastian/comparator, not raw PHP `==`. For example, `assertEquals('1', '01')` fails and `assertEquals([], false)` fails, while `==` is true for both (probed with the evaluator, 2026-10-18). Where comparator rules reduce to PHP `==` or `===`, reuse `PhpComparison.ts`'s internals rather than re-deriving them.
- The failure `message` is PHPUnit's `getMessage()`, including the custom `$message` prefix (`"<message>\n"`). When PHPUnit attaches a `ComparisonFailure`, the exception exposes `getComparisonFailure()` with `getExpectedAsString()` / `getActualAsString()` (Exporter output, as PHPUnit's). The message then ends with `"\n--- Expected\n" + expectedAsString + "\n+++ Actual\n" + actualAsString`, so both values are named.
- The assertion records `recordAssertion('<its own name>')` once per call, before it evaluates, as PHPUnit counts in `assertThat`.
- AD-9 value model as 4.1 reads it: a list is an `Array`, a plain object is a string-keyed PHP array, a `Symbol.for('xaravel.php.array')`-branded value is any other PHP array, and other objects are PHP objects. An integral `number` is a PHP int (DIV-9: `1.0` cannot be told from `1`), and a `bigint` is an int beyond the safe range.
- The grader imports only relative, `node:` and `bun:` modules (XT-assert-3). Every new export goes through `index.ts`'s freeze loop. XT-assert-3's exact export list grows by exactly the new names.
- Everything is sync. The assertions return `void`.

**Never:**
- Change `phpLooseEquals`/`phpStrictEquals` results, or XT-assert-1..7.
- Hand-write an expected pass/fail or message in a test. Every one comes from a signed Oracle fixture.
- Implement Story 4.4's assertions, `TestCase`, `expectException` or `createMock`. Never write a PCRE-to-`RegExp` converter: the rule is DIV-10's (`PORTING.md`), so `assertMatchesRegularExpression` takes only a `RegExp`.
- Port the comparators whose value model belongs to later Stories: DateTime, DateInterval, DOMNode, SplObjectStorage, Enumeration, MockObject and Number. ESC-4.3-1 item 4 gives them an owner.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Identity on key order | `assertSame({a:1,b:2}, {b:2,a:1})` | throws; message `Failed asserting that two arrays are identical.` + expected/actual block | AC 2 |
| Equality on key order | `assertEquals({a:1,b:2}, {b:2,a:1})` | passes | AC 2 |
| Scalar failure | `assertSame(1, 2)` | `Failed asserting that 2 is identical to 1.`; no ComparisonFailure | — |
| Comparator type failure | `assertEquals(null, [])` | `[] does not match expected type "NULL".` | — |
| Custom message | `assertTrue(false, 'ctx')` | `ctx\nFailed asserting that false is true.` | — |
| Regex | `assertMatchesRegularExpression(/x/, 'abc')` | `Failed asserting that 'abc' matches PCRE pattern "/x/".` | non-`RegExp` pattern → `TypeError` |
| Bad argument | `assertCount(1, 5)`, `assertArrayHasKey(1.5, [])` | throws PHPUnit's argument error class and message where the Oracle has one (`throws` result), else `TypeError` | — |
| Counting | any assertion inside a declared test, passing or failing | the test's report counts its kind once | — |

</intent-contract>

## Code Map

- `packages/assert/src/comparison/PhpComparison.ts` -- 4.1 core. Reuse its helpers (`isPhpArray`, `arrayEntries`, `objectProps`, `isBuiltIn`, `numericValue`, `describe`, the `Comparison` class). Export only what the new modules need, as internal (non-`index.ts`) exports, without changing behaviour.
- `packages/assert/src/declarations/AssertionCounter.ts:23` -- `recordAssertion(kind)`, the counting entry point.
- `packages/assert/src/index.ts` -- named exports plus the freeze loop. Add `Assert`, `ExpectationFailedException` and `ComparisonFailure`.
- `packages/assert/tests/xaravel/comparison.test.ts:207-260` -- XT-assert-3: the exact export list and the import scan.
- `packages/assert/tests/xaravel/oracle-values.ts` -- `readRequests`, `readSignedFixture(path, sha, pem)` (fails, never skips, on a missing fixture), and `decode` (DecodedObject classes named after the PHP class; `BrandedArray`). Reuse and extend it. Do not fork it.
- `tools/oracle/request.ts:157,172` -- `makeRequest`, `renderRequests`. Generate `4.3.jsonl` with these from a throwaway script outside the repo, never by hand. The test dir cannot import `tools/` (TS6059).
- `tools/oracle/evaluate.php` -- an `XT-…` id runs bound to a bare PHPUnit `TestCase`, so `$this->assertX(…)` works in `exprs`. A thrown exception records `{"throws":{class,message}}`. Local dev cross-check: `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 conformance/oracle-requests/4.3.jsonl` (unsigned, never committed). It initialises PHPUnit's config `Registry`; a bare script without it fails in `Exporter`.
- Reference sources (read-only), under `/tmp/xaravel-inv/framework/vendor/`: `phpunit/phpunit/src/Framework/Assert.php` and `Constraint/**` (messages: `failureDescription`, `toString`, `additionalFailureDescription`); `sebastian/comparator/src/{Factory,TypeComparator,ScalarComparator,NumericComparator,ArrayComparator,ObjectComparator,ExceptionComparator,ClosureComparator,ResourceComparator,ComparisonFailure}.php`; `sebastian/exporter/src/Exporter.php` (`export`, `shortenedExport`); `laravel/framework/src/Illuminate/Testing/{Assert.php,Constraints/ArraySubset.php}`.
- `conformance/escalations/ESC-4.1-1.md`, `ESC-4.2-1.md` -- format and style for ESC-4.3-1. `bun run escalations:check` validates.
- `stories/4.3.md` -- XT-assert-8..10, component `assert`.

## Tasks & Acceptance

**Execution:**
- `packages/assert/src/exporter/Exporter.ts` -- port `export` (with `Array &n`, `Object #n` handles, recursion, the `'…\n` line form, float forms such as `0.30000000000000004`, `1.0E+100`, `-0.0`, `INF`, `NAN`) and `shortenedExport`. Object handles come from a per-process `WeakMap` counter. The class name is `classNameOf(x)` per Design Notes.
- `packages/assert/src/comparator/*.ts` -- the comparator chain in Factory order: Closure (JS function), Exception (JS `Error`), Object, Resource, Array, Numeric, Scalar, Type. Each has `accepts` and `assertEquals(expected, actual, delta, canonicalize, ignoreCase)` and throws `ComparisonFailure` with comparator 8.4.0's messages and export strings. Canonicalize sorts as PHP 8 `sort()` does (stable, `<=>`).
- `packages/assert/src/Framework/ComparisonFailure.ts`, `AssertionFailedError.ts`, `ExpectationFailedException.ts` -- PHPUnit's classes, same names and hierarchy (`ExpectationFailedException extends AssertionFailedError extends Error`; `name` is the class name): `getComparisonFailure()`, `getExpectedAsString()`, `getActualAsString()`, and `getMessage()` (amendment 1), which returns PHPUnit's `getMessage()` text exactly, without the Expected/Actual block. The JS `message` property keeps the block, so bun's failure output names both values; a port of `$e->getMessage()` calls `e.getMessage()`. Upstream compares `getMessage()` exactly (`FoundationInteractsWithDatabaseTest.php:498`, `MailMailableTest.php:54`) and catches `AssertionFailedError` (20 test files).
- `packages/assert/src/Framework/Assert.ts` -- the 50 static methods, with PHPUnit's parameter order and the optional trailing `message`. Each is mirrored onto `Assert.prototype`, so a subclass instance can call `this.assertSame(…)` and `self::`/`static::` ports call `Assert.assertSame(…)`. The instance signatures come from interface merging.
- `packages/assert/src/index.ts` -- export and freeze the four classes (`Assert`, `AssertionFailedError`, `ComparisonFailure`, `ExpectationFailedException`).
- Amendment 1 fixes, each checked by Oracle cells (amended by amendment 2): `NumericComparator` subtracts exactly in `bigint` when both sides are ints; the Exporter and VarExport print `undefined` as `undefined`, never as `null`/`NULL` (AD-9 forbids the value, so a message must not disguise it); a fixture-free check in XT-assert-8 pins `Assert.assertNull(undefined)`'s message.
- Amendment 2, counting as the Inventory counts (`tools/baseline/recorder.php`: the kind is recorded at the entry of an outermost `PHPUnit\Framework\Assert::assert*` call, before any argument check; a nested `assert*` call made by Assert itself is not recorded): each assertion records its kind first thing, before argument checks; an assertion that calls another (`assertNotSame` on two booleans calls `assertNotEquals`, as `Assert.php:1842` does) records only the outer kind. `assertArraySubset` records `assertArraySubset` as the intent says, although the Inventory records Laravel's call as `assertThat` (it calls `PHPUnit::assertThat`; e.g. `AboutCommandTest::testItCanDisplayAboutCommandAsJson` → `{"assertThat":3}`): ESC-4.3-1 item 8 raises that conflict. The counting fixture asserts these kinds, including an argument-error call (`assertStringStartsWith('', 'x')` counts) and bool/bool `assertNotSame` (counts `assertNotSame` only).
- Amendment 2, `assertContainsOnly` accepts PHPUnit 11.5's native aliases `integer`, `boolean`, `double`, `real` (mapped to `int`, `bool`, `float`, `float`).
- `conformance/oracle-requests/4.3.jsonl` -- `php-expr` requests, id `XT-assert-8` (families), `XT-assert-9` (key order) and `XT-assert-10` (regex), per Design Notes "Requests". Run `bun run oracle:story check 4.3`.
- `packages/assert/tests/xaravel/assertions.test.ts` -- XT-assert-8..10, plain `bun:test` titled `XT-assert-<n>: …`, one per AC in order, per Design Notes "Test".
- `packages/assert/tests/xaravel/operands.ts` -- the shared operand table `[phpSource, tsValue]` and the PHP/TS class pairs, which the throwaway generator and the test both import.
- `packages/assert/tests/xaravel/comparison.test.ts` -- XT-assert-3's export list adds `Assert`, `AssertionFailedError`, `ComparisonFailure` and `ExpectationFailedException`.
- `conformance/escalations/ESC-4.3-1.md` -- `trigger: contract`, `test_ids: [XT-assert-8, XT-assert-10]`, with these items (and (8): `assertArraySubset`'s kind conflict above, proposed answer: record `assertThat` as the Inventory does, or have the harness floor map the name; (9): closure equality is identity in JS (two distinct functions are never equal), while comparator 8.4.0 compares closures by declaration, binding and captured state, proposed answer: accept as a DIV clause or name an owner; (10): `ExceptionComparator` accepts every JS `Error`, while PHP's `\Error` family goes through `ObjectComparator` with `file`/`line`; and (7): `assertContainsOnly`, removed in PHPUnit 12 but in the scan, is implemented with PHPUnit 11.5's signature over the PHPUnit 13 constraint, and its requests call it through a PHP shim). (1) The class-name protocol: Story 9.4's `registerClass` and Epic 10's tokens set `[Symbol.for('xaravel.class.fqcn')]` (a string) on the class or token, and the grader reads it for messages. (2) The `Countable`/`Traversable` brands (`Symbol.for('Countable')` with `count()`, `Symbol.iterator`) and the resource brand `Symbol.for('xaravel.php.resource')`. (3) Callables: a function, or `[object|class, methodName]`; PHP function-name strings are not callable (no global function table). (4) The comparators not ported here (DateTime/DateInterval → Epic 19, Enumeration → Story 9.x enum model, SplObjectStorage, DOMNode, MockObject → 4.5, Number): proposed, a follow-up `assert` Story (or the owning Story through a Maintainer-approved Infrastructure Story) adds each once its value model exists. (5) DIV-10: no Story's ACs own the "mechanical PCRE→`RegExp` rule" in `PORTING.md`. Proposed: Story 8.1/8.2. 4.3 tests only patterns whose syntax is the same in both. (6) FR-116 says `assertEquals` "follows PHP `==`". PHPUnit's comparator is stricter (`'1'` vs `'01'`, `[]` vs `false`), so 4.3 follows PHPUnit (AC 1). Proposed: read FR-116 as "PHPUnit's `assertEquals`".
- `stories/4.3.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status.

**Acceptance Criteria:**
- Given the signed fixtures for `4.3.jsonl`, when XT-assert-8 runs each of the 50 assertions over its operand matrix, then each cell's outcome matches the Oracle exactly. A pass is a pass. A failure has an equal `getMessage()` prefix, an equal comparison-failure presence and equal `expectedAsString`/`actualAsString`, after replacing `Object #<digits>` with `Object #<n>` on both sides. A `throws` cell throws the same class short name, and the same message unless the class is PHP's engine `TypeError` (its text names PHP call sites). Each decodable PHP operand is `phpStrictEquals` to its TS twin (pairing guard). A missing, unsigned or errored fixture fails, never skips. Every one of the 50 names runs at least once, and each declared test's report counts each kind it ran.
- Given an array and the same entries in another key order (list, plain object and branded forms), when XT-assert-9 runs `assertSame` and `assertEquals`, then `assertSame` fails and `assertEquals` passes, with the Oracle's messages.
- Given Upstream patterns whose PCRE and JS syntax agree (`/^[a-zA-Z0-9]{40}\.jpg$/` from ImageTest, `/^To: nuno@laravel.com/m` from MailMailerTest, `/artisan.*inspire$/` from ScheduleTest, `/&lt;br\s*\/?&gt;/` from RenderBladeFilesTest) and matching and non-matching subjects, when XT-assert-10 runs both regex assertions with the `RegExp`, then outcomes and messages match the Oracle (`String(regexp)` prints the PCRE literal). A string pattern throws `TypeError`.

## Spec Change Log

### 2026-10-18 — Amendment 2 (review pass 2, bad_spec)
- **Trigger:** amendment 1 told bool/bool `assertNotSame` to record `assertNotEquals` too, but the Inventory recorder skips nested calls from `PHPUnit\Framework\Assert`, so the FR-113 multiset would differ; it also records at method entry, before argument checks, while attempt 2 recorded after them (blind layer, verified in `tools/baseline/recorder.php:11-18,64-66`). Laravel's `assertArraySubset` is recorded as `assertThat`, which conflicts with the intent's "its own name" (escalated, not decided). Grouped with the verified test gaps: distinct resources and closures, the custom-message prefix in overriding constraints, the `undefined` export, non-ASCII strings, the ArrayAccess brand, and `ran` counting matrix labels.
- **Amended:** Tasks (counting rule, `undefined` in VarExport, `assertContainsOnly` aliases, ESC items 8–10); Design Notes (operands).
- **Known-bad state avoided:** assertion multisets that disagree with the Inventory for bool `assertNotSame` and for argument-error calls; untested comparator and protocol branches.
- **KEEP:** everything in attempt 2 (`/tmp/xt43-attempt-2.patch`; apply it, then change only what amendment 2 lists): the `AssertionFailedError` / `ExpectationFailedException` hierarchy and `getMessage()`; the exact `bigint` NumericComparator; the separate exception request; the cyclic `XtA`, `bigint`, `'it is'` and `"don't"` operands; the `phpHidden` decoding; the pairing guard; the counting check running first; everything amendment 1's KEEP lists.

### 2026-10-18 — Amendment 1 (review pass 1, bad_spec)
- **Trigger:** the spec made the exception's message end with the Expected/Actual block and gave it no `getMessage()` and no `AssertionFailedError` base, so a port of the many Upstream tests that `assertSame('…', $e->getMessage())` or `catch (AssertionFailedError $e)` cannot pass (blind layer, verified at `tests/Foundation/FoundationInteractsWithDatabaseTest.php:498`, `tests/Mail/MailMailableTest.php:54`; 20 files reference `AssertionFailedError`). Grouped with the gaps the same pass verified: bool/bool `assertNotSame` counts one kind where PHPUnit counts two; `bigint` ints compare through lossy `Number` (`assertEquals(2n**60n, 2n**60n + 1n)` passed); no exception, cyclic or `bigint` operand; the counting check ran only after the matrix check.
- **Amended:** Tasks (exception classes and `getMessage()`, the four exports, amendment-1 fixes, ESC item 7); Design Notes (operands, count, test order).
- **Known-bad state avoided:** ported tests that compare PHPUnit messages or catch `AssertionFailedError` failing on a correct framework; wrong `assertEquals` results for int64 values; wrong assertion multisets for bool `assertNotSame`.
- **KEEP:** everything in attempt 1 (`/tmp/xt43-attempt-1.patch`; reuse its code and tests) except the changes above: the comparator chain, Exporter and VarExport ports, `PhpOrder`, `PhpValues`, the constraints, `Assert`'s static-plus-prototype methods and PHP-style parameter checks, the 7-request design, `operands.ts` / `assertion-cells.ts` with the pairing guard and the `Object #<n>` / `resource(<n>)` normalisation, the counting fixture, `oracle-values.ts`' resource and closure decoding, ESC-4.3-1 items 1–7, and the local cross-check (21,876 cells, 0 mismatches) with a throwaway signing key that is never committed.

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 33 findings — high 0, medium 10, low 22, false 0, maybe-false 1 (the intent-alignment layer filed a descriptive report; its four divergences are rows below)
- findings:
  - `[medium]` `[bad_spec]` (blind) the message carries the Expected/Actual block and there is no `getMessage()` — verified: Upstream asserts `$e->getMessage()` exactly; amendment 1 adds `getMessage()` returning PHPUnit's text.
  - `[medium]` `[bad_spec]` (blind) no `AssertionFailedError` base — verified: 20 Upstream files catch or expect it; amendment 1 adds the hierarchy.
  - `[low]` `[bad_spec]` (blind) `undefined` exported as `null` gives "null is null" — real for a framework bug returning `undefined`; a direct correction, folded into amendment 1.
  - `[medium]` `[bad_spec]` (blind) bool/bool `assertNotSame` counts one kind, PHPUnit two (`Assert.php:1842`) — the FR-113 multiset would differ; amendment 1.
  - `[low]` `[reject]` (blind) no `GeneratorNotSupportedException` for generators — a passing Upstream test never counts a generator; the fix is a new guard.
  - `[low]` `[reject]` (blind) ScalarComparator cuts overlong prefixes in UTF-16 units, not bytes — affects only the shortened failure text of long non-ASCII strings; the fix reworks the cut on byte offsets.
  - `[medium]` `[bad_spec]` (blind) operand gaps: no exception, `bigint`, cyclic operand — verified (see verification-gap rows); amendment 1 adds them. Its sub-claims of no ArrayAccess or built-in operands and ordering on resources: rejected, as resource ordering and built-ins in ordering assertions are not met in Upstream use.
  - `[low]` `[reject]` (blind) `assertArraySubset` coerces `checkForIdentity`, casts non-iterable ArrayAccess, drops Traversable keys — the scan records 0 executions Upstream; each fix adds a guard or branch.
  - `[maybe-false]` `[reject]` (blind) `assertContainsOnly` type aliases differ from PHPUnit 11.5 — settle by reading 11.5's `assertContainsOnly`; if true only `low` (one Upstream call).
  - `[low]` `[reject]` (blind) delta text uses `toFixed(6)` not `%F` — differs only for deltas ≥ 1e21 or non-finite; no Upstream use.
  - `[low]` `[reject]` (blind) spec says 50 and 32, code 51 and 31 — the fix edits this build's spec (amendment 1 records the count anyway).
  - `[low]` `[reject]` (blind) `regExp()` TypeError text and JS-only flags — a test code bug fails loudly; flags are DIV-10's, owned by ESC-4.3-1 item 5.
  - `[low]` `[bad_spec]` (blind) `LogicalNot` quoted-segment rewrite untested — a cheap operand addition, folded into amendment 1 (`'it is'`, `"don't"`).
  - `[medium]` `[bad_spec]` (verification-gap) no `bigint` operand; `NumericComparator` loses precision (`assertEquals(2n**60n, 2n**60n + 1n)` passes) — pre-verified; amendment 1.
  - `[medium]` `[bad_spec]` (verification-gap) no exception operand; ExceptionComparator and the exporter's `Error` branch untested — pre-verified; amendment 1.
  - `[low]` `[bad_spec]` (verification-gap) no cyclic object operand — pre-verified; amendment 1.
  - `[medium]` `[bad_spec]` (verification-gap, other) `bigint` wrong results in `assertEquals`/`assertNotEquals` — same root cause as the `bigint` row.
  - `[low]` `[bad_spec]` (verification-gap, other) the counting check runs only after the matrix check passes — verified at `assertions.test.ts`; amendment 1 runs it first.
  - `[medium]` `[bad_spec]` (edge-case) bool `assertNotSame` counting — same entry as the blind row.
  - `[low]` `[reject]` (edge-case) generators consumed by `assertCount`/`assertSameSize` — same as the blind generator row.
  - `[low]` `[reject]` (edge-case) single-pass Traversable reports "actual size 0" — only a generator-backed object; not met in Upstream use; the fix caches state.
  - `[medium]` `[bad_spec]` (edge-case) `bigint` precision — same entry as the verification-gap row.
  - `[low]` `[reject]` (edge-case) ScalarComparator byte offsets — same as the blind row.
  - `[low]` `[reject]` (edge-case) ArraySubset `toArray` on non-iterable ArrayAccess — same as the blind ArraySubset row.
  - `[low]` `[reject]` (edge-case) `checkForIdentity` coerced by `Boolean()` — same as the blind ArraySubset row.
  - `[low]` `[reject]` (edge-case) `isNativeType: true` with a non-native type — one Upstream call, which passes `null`; a new guard.
  - `[low]` `[reject]` (edge-case) an arrow function as the expected class throws a raw TypeError — fails loudly on a test-code bug.
  - `[low]` `[reject]` (edge-case, claim) `-0` exports as `0` though the spec lists `-0.0` — DIV-9 treats integral floats as ints; the float marker is ESC-4.1-1 item 3's.
  - `[medium]` `[bad_spec]` (edge-case, claim) bool `assertNotSame` count parity — same entry as the blind row.
  - `[low]` `[reject]` (intent-alignment) AC 2 follows PHPUnit's comparator, not literal PHP `==` — AC 1 says "exactly as PHPUnit does"; ESC-4.3-1 item 6 asks the Maintainer to confirm the FR-116 reading.
  - `[low]` `[reject]` (intent-alignment) tests exercise the `Assert` API, not translated Upstream tests — Ported Tests come with each Component's Stories; the counting fixture runs the assertions through `portedTest`.
  - `[low]` `[reject]` (intent-alignment) regex patterns are hand-paired, no conversion rule — DIV-10's rule has no owning Story; ESC-4.3-1 item 5.
  - `[low]` `[reject]` (intent-alignment) parity unproven until fixtures land — by design, as in 4.1: the live `oracle.yml#story` run on the PR is the gate.

### 2026-10-18 — Review pass
- verdicts: 38 findings — high 0, medium 5, low 32, false 1, maybe-false 0 (the intent-alignment layer filed a descriptive report; its seven divergences are rows below)
- findings:
  - `[medium]` `[bad_spec]` (blind) `assertArraySubset` records its own name, the Inventory records `assertThat` — verified in `recorder.php` and the cited Inventory line; conflicts with the intent's counting rule, so amendment 2 raises ESC-4.3-1 item 8 and keeps the intent's rule.
  - `[medium]` `[bad_spec]` (blind) amendment 1's bool `assertNotSame` double count contradicts the recorder — verified (`recorder.php:64-66` skips callers in `PHPUnit\Framework\Assert`); amendment 2 records the outer kind only.
  - `[medium]` `[bad_spec]` (blind) kinds recorded after argument checks, the recorder records at entry — verified; amendment 2 records first thing.
  - `[low]` `[reject]` (blind) a JS class value is treated as a Closure by `isCallable`/`isObject` — a port passes `Foo::class` as a class argument, never to `assertIsCallable`; the fix adds a class-detection branch.
  - `[low]` `[bad_spec]` (blind) `ExceptionComparator` accepts every JS `Error`, PHP sends `\Error` to ObjectComparator — real but needs PHP's file/line model; raised as ESC-4.3-1 item 10 in amendment 2.
  - `[medium]` `[bad_spec]` (blind) no non-ASCII or control-character operands — `assertEqualsIgnoringCase` runs 176 times Upstream; amendment 2 adds operands, and the Oracle decides.
  - `[low]` `[reject]` (blind) `intParam`/`floatParam` coercion untested; `assertCount(1e25, …)` — no Upstream call passes such counts; a range guard.
  - `[low]` `[bad_spec]` (blind) the ArrayAccess brand has no Oracle cell though ESC says it does — verified (0 matches); amendment 2 adds an ArrayAccess twin.
  - `[low]` `[reject]` (blind) `ObjectHasProperty` uses the props view, not declared properties — one Upstream call, on public properties; the fix needs a declared-property protocol.
  - `[low]` `[reject]` (blind) spec says 50/32 and three exported classes — the fix edits this build's spec (amendment 2 leaves the Design Notes count as the record).
  - `[low]` `[reject]` (blind) internal exception classes unbranded and unexported — no Story 4.3 assertion requires catching them; exporting adds public surface for Story 4.4 to decide.
  - `[low]` `[reject]` (blind) JS-only regex flags printed in the PCRE message — carried: same claim as pass 1's `regExp()` row.
  - `[medium]` `[bad_spec]` (verification-gap) ResourceComparator and ClosureComparator failure branches never exercised — pre-verified; amendment 2 adds distinct pairs (closure divergence to ESC item 9).
  - `[low]` `[bad_spec]` (verification-gap) custom-message prefix untested in `TraversableContainsOnly`/`ArraySubset` — pre-verified; amendment 2 adds cells.
  - `[low]` `[bad_spec]` (verification-gap) the `undefined` export fix has no test — pre-verified; amendment 2 adds the fixture-free check.
  - `[low]` `[bad_spec]` (verification-gap, other) closure equality diverges from comparator 8.4.0 and is undocumented — verified; ESC-4.3-1 item 9.
  - `[low]` `[bad_spec]` (verification-gap, other) `VarExport` still prints `undefined` as `NULL` — verified; amendment 2.
  - `[low]` `[bad_spec]` (verification-gap, other) `ran` is filled from matrix labels before any cell runs — verified; amendment 2.
  - `[low]` `[bad_spec]` (edge-case) `assertContainsOnly` rejects 11.5's `integer`/`boolean`/`double`/`real` aliases — settles pass 1's maybe-false row; amendment 2 maps them.
  - `[low]` `[reject]` (edge-case) `isNativeType: true` with a non-native type — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case) generators in `assertCount`/`assertSameSize` — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case) one-shot iterator counted twice — carried: same as pass 1's single-pass row.
  - `[low]` `[reject]` (edge-case) ArraySubset `toArray` drops Traversable keys — same claim as pass 1's ArraySubset row (0 Upstream executions).
  - `[low]` `[reject]` (edge-case) ArraySubset on non-iterable ArrayAccess — same as pass 1's row.
  - `[low]` `[reject]` (edge-case) `checkForIdentity` `'0'` coerced to true — same location as pass 1's row; 0 Upstream executions.
  - `[false]` `[reject]` (edge-case) `assertArrayHasKey(null|bool|float, …)` key mapping — `KEYS` holds `null` and `1.5` and every such cell matched the local Oracle run.
  - `[low]` `[reject]` (edge-case) `serialize` recursion on cyclic graphs during canonicalize — needs an array of cyclic unequal objects under `assertEqualsCanonicalizing`; fails loudly; the fix adds reference tracking.
  - `[low]` `[reject]` (edge-case) arrow function as class — same as pass 1's row.
  - `[low]` `[reject]` (edge-case) delta text for ≥ 1e21 or non-finite — same as pass 1's `toFixed` row.
  - `[low]` `[reject]` (edge-case) `expectedCount` beyond int64 — same claim as the blind `intParam` row.
  - `[low]` `[reject]` (edge-case, claim) spec 50/32 vs code 51/31 — fix edits this build's spec.
  - `[low]` `[reject]` (intent-alignment) AC 2 follows PHPUnit's comparator — same as pass 1's row (ESC item 6).
  - `[low]` `[reject]` (intent-alignment) AC 3 has no conversion rule — same as pass 1's row (ESC item 5).
  - `[low]` `[reject]` (intent-alignment) tests exercise the `Assert` API, not ported Upstream tests — same as pass 1's row.
  - `[low]` `[reject]` (intent-alignment) parity rests on grader-side protocols other Stories have not adopted — ESC-4.3-1 items 1–4 hand them to their owners.
  - `[low]` `[reject]` (intent-alignment) no fixture exists yet — same as pass 1's row; the PR's `oracle.yml#story` run is the gate.
  - `[low]` `[reject]` (intent-alignment) count 50 vs 51 — fix edits this build's spec.
  - `[low]` `[reject]` (intent-alignment) scalar failures name values only in PHPUnit's sentence — that sentence names both values, which meets AC 1.

### 2026-10-18 — Review pass
- verdicts: 27 findings — high 0, medium 3, low 24, false 0, maybe-false 0 (the intent-alignment layer filed a descriptive report; its six divergences are rows below)
- findings:
  - `[medium]` `[patch]` (verification-gap) canonicalizing sort of lists of arrays and objects, and `serialize`, never reached by an Oracle cell — pre-verified (coverage run); Upstream uses the shape (`SupportTestingQueueFakeTest.php:815`); patched: a dedicated canonicalizing request.
  - `[low]` `[patch]` (verification-gap) ScalarComparator's common-suffix shortening never runs — pre-verified; patched: a long shared-suffix pair (ASCII and non-ASCII) in the equality operands.
  - `[low]` `[patch]` (blind) ESC item 9 gives the wrong cause, and the port drops PHPUnit's closure-comparison warning — verified against PHPUnit's `Constraint::assertEqualsUsingComparator`; patched: item 9 corrected.
  - `[medium]` `[patch]` (blind) `getMessage()` cannot follow Laravel's `appendMessageToException` rewrite — real for the Testing component, which may not edit `packages/assert`; patched: ESC-4.3-1 item 11 names the owner question.
  - `[low]` `[patch]` (blind) `ComparisonFailure` lacks `getDiff()`/`toString()` — one Upstream use (`TestResponseTest.php:3032`); patched: ESC item 12 (Story 4.4).
  - `[low]` `[patch]` (blind) exception classes lack `previous`, `getCode()`, `toString()` and the `PHPUnit\Framework\Exception` base — needed by `expectExceptionObject` (Story 4.4); patched: ESC item 12.
  - `[medium]` `[patch]` (blind) an `Error` subclass that sets `this.name` leaks `'name'` into exports and comparisons — verified (`objectProps` uses `Object.keys`); patched: `name` excluded on `Error` instances.
  - `[low]` `[patch]` (blind) full export of exceptions of different classes lacks `string`/`file`/`line`/`trace` — inherent to JS errors; patched: ESC item 13.
  - `[low]` `[patch]` (blind) PHP built-in classes and interfaces have no class value or token — Ported Tests need them (`Closure::class` 13 uses); patched: ESC item 14.
  - `[low]` `[patch]` (blind) `TypeError` cells compare only the class, so a grader crash would match — verified in `sameCell`; patched: the port's message must have the argument-error shape.
  - `[low]` `[patch]` (blind) `assertArraySubset` mounted on `PHPUnit\Framework\Assert` — ownership unsettled; patched: ESC item 15.
  - `[low]` `[patch]` (blind) `ASSERTIONS` derived from the class's own names breaks when Story 4.4 adds methods — verified; patched: an explicit frozen list.
  - `[low]` `[patch]` (blind) the `this.assertX(…)` form is barely tested — verified (one call); patched: the counting fixture calls all 51 through `this`.
  - `[low]` `[reject]` (edge-case) generators in counting assertions — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case) arrow function as class — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case) `isNativeType: true` with a non-native type — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case) int parameter beyond int64 — carried: same as pass 2's row.
  - `[low]` `[reject]` (edge-case) `checkForIdentity` coercion — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case, claim) `-0` exports as `0` — carried: same as pass 1's row.
  - `[low]` `[reject]` (edge-case, claim) spec 50 vs 51 — carried: fix edits this build's spec.
  - `[low]` `[reject]` (edge-case, claim) spec says canonicalize sorts as `sort()`, code follows comparator 8.4.0's `usort`/`ksort` — the code is right by Upstream; the fix edits this build's spec.
  - `[low]` `[reject]` (intent-alignment) tests exercise the `Assert` API, not ported Upstream tests — carried.
  - `[low]` `[reject]` (intent-alignment) parity waits on the fixture commit — carried.
  - `[low]` `[reject]` (intent-alignment) AC 2 follows PHPUnit's comparator — carried (ESC item 6).
  - `[low]` `[reject]` (intent-alignment) AC 3 has no conversion rule — carried (ESC item 5).
  - `[low]` `[reject]` (intent-alignment) scalar failures name values in PHPUnit's sentence — carried.
  - `[low]` `[reject]` (intent-alignment) `assertArraySubset`/`assertContainsOnly` rest on Laravel code and a PHPUnit 11.5 shim — escalated (ESC items 7, 8, 15).

## Design Notes

**Requests.** Each request's `setup` declares the PHP twin classes (`XtA`, `XtB extends XtA`, `XtI`, `XtC implements XtI`, a `Countable` and an `IteratorAggregate` class) and `$v = [ …operands… ];`. Each expr is one assertion's matrix. Binary assertions map over `$v × $v`, and unary ones over `$v`, with argument cells (class names, counts, keys, deltas, needles) from a small literal list. Every cell is wrapped as
`(function () use (…) { try { <call>; return null; } catch (\PHPUnit\Framework\ExpectationFailedException $e) { $c = $e->getComparisonFailure(); return [$e->getMessage(), $c?->getExpectedAsString(), $c?->getActualAsString()]; } })()`.
Any other exception propagates per cell (catch `\Throwable` into `['throws', short class, message]`). Probed 2026-10-18: messages such as `Failed asserting that 'xab' starts with "ab".`, `[...] does not match expected type "integer".`, and `Array (\n    'a' => 3\n …)` (comparator's sorted shortened form).

**Operands.** Amendment 1 adds: ints beyond 2^53 (`2**60`, `2**60 + 1`, `PHP_INT_MAX`, twins as `bigint`); exceptions (`new \Exception('a')`, `('b')`, one with a code, one with a `previous`), paired with JS `Error` twins whose class name reads `Exception` (pairing compares message, code and previous only; `file`, `line` and `trace` have no JS counterpart); a self-referencing `XtA` instance and an equal and an unequal one; strings `'it is'` and `"don't"` in the negated matrices (`LogicalNot`'s quoted-segment rewrite); and a bool/bool `assertNotSame` call in the counting fixture. Use scalars (ints, non-integral floats, `INF`, `NAN`, numeric and non-numeric strings, multi-line strings, `''`, `true`/`false`/`null`), lists, maps, mixed-key arrays (branded), nested arrays, `stdClass` objects and twin-class instances. Leave out integral floats (DIV-9, ESC-4.1-1 item 3), binary strings, and PHP function-name strings (ESC item 3). The resource operand is `fopen('php://memory','r')`, whose twin is an object branded `Symbol.for('xaravel.php.resource')`. Closures are paired with JS functions.

**Class names.** `classNameOf(x)`: `x[Symbol.for('xaravel.class.fqcn')]` when it is a string (ESC item 1), else the constructor's `name` (display only, never identity, per AD-10). A plain `Object`-class PHP object is printed as `stdClass`. The decoded fixture classes already carry the PHP name.

**Operands (amendment 2).** Also add: two distinct resources (`fopen('php://memory','r')` twice) and two distinct closures in the equality matrices (the closure cell will differ from PHP unless the Oracle agrees; where it cannot, drop the pair and rely on ESC item 9, never weaken a compared cell); a custom-message cell for `assertContainsOnlyBool` and for `assertArraySubset`; non-ASCII and control-character strings (`'Ünïcödé'`, `'ünïcödé'`, `"a\tb"`, a string over 40 characters sharing a long non-ASCII prefix with another) in `$v`; and an `ArrayAccess` twin (`XtArrayAccess implements ArrayAccess`, TS twin branded `Symbol.for('ArrayAccess')`) in the `assertArrayHasKey`/`assertArrayNotHasKey` matrices. Exceptions stay in their own request, as attempt 2 built it (PHP's full export of an exception has `string`, `file` and `line`, which a JS `Error` lacks). `requestMismatches` adds an assertion to `ran` only when one of its cells ran.

**Count.** The Story's list holds 51 assertions (the Intent's "50" and "32" are miscounts: 51 here, 31 for Story 4.4); the test checks 51.

**Test.** XT-assert-8 runs the fixture-free counting check first, so it runs and reports even while fixtures are missing or a cell mismatches; then it rebuilds each matrix in TS with the same operand table and asserts cell by cell. Each matrix is reported as one aggregated mismatch list, so a failure shows every divergent cell. XT-assert-9 and XT-assert-10 do the same for their requests. A small fixture-free check runs `Assert.assertTrue` inside `portedTest` in a child `bun test`. That proves the counting, reusing 4.2's fixture runner pattern in a new `assertions.fixture.ts`.

## Verification

**Commands:**
- `bun run oracle:story check 4.3` -- expected: every request accepted.
- `php tools/oracle/evaluate.php /tmp/xaravel-inv/framework 8.5.11 conformance/oracle-requests/4.3.jsonl` -- dev cross-check. Write it to `/tmp`, decode it with the test's comparator, and expect 0 mismatches.
- `bun test packages/assert` -- expected: XT-assert-2..7 pass. XT-assert-1 passes (its fixtures are on `main`); XT-assert-8..10 pass once `oracle.yml#story` commits the signed fixtures, and fail with "missing signed fixture" before.
- `bun run typecheck`, `bun run lint`, `bun run graph:check`, `bun run escalations:check`, `bun run ownership:check`, `bun run oracle:verify-fixtures` -- expected: clean.

## Auto Run Result

Status: done

**Summary.** `@xaravel/assert` now has PHPUnit 13.4.3's 51 core assertions, as the static and instance methods of `Assert`.
- They are built on ports of sebastian/comparator 8.4.0 (Closure, Exception, Object, Resource, Array, Numeric, Scalar, Type) and sebastian/exporter 8.2.1, plus PHP's `<=>` ordering.
- Failures throw `ExpectationFailedException`, which extends `AssertionFailedError`.
  - `getMessage()` returns PHPUnit's text exactly.
  - The JS `message` adds an Expected/Actual block when a ComparisonFailure is attached.
- Each assertion records its kind at entry, as the Inventory recorder does. Nested Assert calls are not recorded.
- Pass/fail and messages are checked cell by cell against PHPUnit itself, through 11 `php-expr` Oracle requests in `conformance/oracle-requests/4.3.jsonl`.
- ESC-4.3-1 (items 1–15) hands the grader-side protocols and the open divergences to their owners.

**Files.**
- `packages/assert/src/Framework/{Assert,AssertionFailedError,ExpectationFailedException,ComparisonFailure,Constraint,Constraints}.ts` and `Exception/*`: the assertions, constraints and PHPUnit exception classes.
- `packages/assert/src/comparator/*`: the comparator chain and its Factory.
- `packages/assert/src/exporter/{Exporter,VarExport}.ts`: Exporter `export`/`shortenedExport`, `var_export` and `serialize`.
- `packages/assert/src/comparison/{PhpOrder,PhpValues}.ts`: PHP ordering and value helpers. `PhpComparison.ts` gains internal exports only, with no behaviour change.
- `packages/assert/src/index.ts`: exports and freezes `Assert`, `AssertionFailedError`, `ComparisonFailure` and `ExpectationFailedException`.
- `packages/assert/tests/xaravel/{assertions.test.ts,operands.ts,assertion-cells.ts,fixtures/assertions.fixture.ts}`: XT-assert-8..10, the operand twins and the counting fixture.
- `packages/assert/tests/xaravel/oracle-values.ts`: decodes resources, closures and hidden properties.
- `packages/assert/tests/xaravel/comparison.test.ts`: XT-assert-3's export list.
- `conformance/oracle-requests/4.3.jsonl`, `conformance/escalations/ESC-4.3-1.md`, `stories/4.3.md`, `sprint-status.yaml`.

**Review.** There were three passes and two bad_spec loopbacks.
- **Pass 1 (33 findings):** `getMessage()` and `AssertionFailedError` were missing, and `bigint`, exception and cyclic operands were absent. Amendment 1 fixed these.
- **Pass 2 (38 findings):** amendment 1's counting contradicted the Inventory recorder, and several comparator and protocol branches were untested. Amendment 2 fixed these.
- **Pass 3 (27 findings):** 13 patches applied, at medium 3 and low 10.
  - Tests: a canonicalizing request, a shared-suffix pair, a stricter TypeError cell rule, an explicit `ASSERTIONS` list, and all 51 assertions called through `this`.
  - Code: Error `name`/`cause`/`stack` are filtered out of exports.
  - ESC-4.3-1: item 9 corrected; items 11–15 added.
- Nothing was deferred. Every rejected finding and its reason is in the Review Triage Log.

**Follow-up review recommended: true.** Pass 3 patched three medium entries. These patches were not re-reviewed:
- the Error own-property filter in `Exporter.ts`;
- the TypeError `Argument #` rule in `assertion-cells.ts`;
- the new canonicalizing request.

**Verification.**
- `oracle:story check 4.3`: 11 accepted.
- Local unsigned `evaluate.php` cross-check: 46,926 cells, 0 mismatches.
- With throwaway signed fixtures, XT-assert-8..10 pass. The temporary key and fixtures were removed afterwards.
- `bun test`: 135 pass, 3 fail. The 3 failures are XT-assert-8..10, which report "missing signed fixture" until `oracle.yml#story` commits the fixtures.
- `typecheck`, `lint`, `graph:check`, `escalations:check`, `ownership:check` and `oracle:verify-fixtures`: clean.

**Residual risks.**
- XT-assert-8..10 stay red until the PR's `oracle.yml#story` run signs and commits about 9 MB of fixtures. That live run is the merge gate.
- ESC-4.3-1 is open. Item 8 (`assertArraySubset`'s kind against the Inventory's `assertThat`) and item 6 (FR-116's "PHP `==`" wording) need Maintainer rulings.
- The comparators for DateTime, Enumeration, SplObjectStorage, DOMNode, MockObject and Number are not ported (ESC item 4).
