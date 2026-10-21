---
title: 'Story 9.6: PHP semantics helpers'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_revision: '6c94cc20449ddd931af4324b7ce5f2ec453dc376'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.6.md'
  - '{project-root}/PORTING.md'
warnings: [oversized]
deferred:
  - summary: >-
      The casts drop PHP's warnings and notices (Array to string conversion, could not be converted to int, NAN coerced) with no DIV clause.
    evidence: |-
      Unverified (maybe-false). It matters only if an Upstream test asserts one of these warnings through an error handler; the Story porting such a test raises an Escalation (FR-114), as DIV-9.7 does for PHPUnit's closure warning.
    location: >-
      packages/runtime/src/php/casts.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** PORTING.md (§ Idiom table, § Mechanical expression rule) already translates PHP's `==`, `<=>`, `is_numeric`, the four scalar casts and array value-copy into `looseEquals`, `spaceship`, `isNumeric`, `toInt`, `toFloat`, `toPhpString`, `toBool` and `valueCopy`, but none of these exist, so no port can reproduce PHP behaviour (AD-9, AD-19).

**Approach:** Add the eight helpers to `packages/runtime/src/php/`, exported from `@xaravel/runtime/php` and the package root, implementing PHP 8.5's `zend_compare`, `is_numeric_string`, cast and `precision = 14` float-to-string rules over the AD-9 value model. Check the truth tables against one signed Oracle fixture from `conformance/oracle-requests/9.6.jsonl` (XT-runtime-22), and value copy locally (XT-runtime-23).

## Boundaries & Constraints

**Always:**
- Edit only: `packages/runtime/**`, this spec, the Story's status lines (`sprint-status.yaml`, `stories/9.6.md`), `conformance/oracle-requests/9.6.jsonl`, and the `conformance/fixtures/runtime/*.json` the `xaravel-oracle` bot signs for it.
- Everything sync (AD-6); never return `undefined` (AD-9.1); `undefined` input is read as `null`.
- AD-9 value model: an int is a safe-integer `number` (not `-0`) or a `bigint`; a float is any other `number` or a marked `PhpFloat`; a PHP array is an `Array`, a plain object (prototype `Object.prototype` or `null`) or a value branded `Symbol.for('xaravel.php.array')` read through its `[key, value]` iterator (the grader's `BrandedArray` included); any other object or a function is a PHP object.
- One implementation of float→int: move `PhpArray.ts`'s `floatKey`/`intKey` into an internal module both use (lessons, epic 4).
- Error messages are PHP's (`Object of class <FQCN> could not be converted to string`, `Nesting level too deep - recursive dependency?`).

**Never:**
- `phpSerialize`, `jsonEncode` floats or flags (Stories 9.7, 9.8); `packages/assert/**` (grader isolation, Story 9.11).
- A new package subpath (`scaffold.test.ts` allows only `scope`, `registry`, `php`); `JSON.stringify` or `constructor.name` in `src/`; a hand-written fixture.
- PHP warnings or notices (`Array to string conversion`, `could not be converted to int`) — PHP still returns the value, so the helpers return it silently.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Truth tables (AC 1) | `$w` of the request: null, bools, ints incl. `PHP_INT_MAX`/`MIN` (`bigint`), floats incl. `1.0`/`-0.0` (marked), `INF`, `NAN`, numeric strings, leading/trailing-whitespace strings, `"1e3"`, overflowing `"9223372036854775808"`, non-numeric strings, `"INF"`, arrays (list, map, `PhpArray`-shaped), stdClass objects | `looseEquals` and `spaceship` over every ordered pair, and `isNumeric`, `toInt`, `toFloat`, `toBool` over each value, equal the Oracle's `==`, `<=>`, `is_numeric`, `(int)`, `(float)`, `(bool)` | No error expected |
| String casts | `(string)` over `$w` without objects, plus floats `0.1+0.2`, `1e14`, `1e15`, `999999999999999.0`, `1.2345678901234568E+17`, `1e-5`, `0.0001`, `10000000000000.5`, `-0.0`, `INF`, `NAN` | Byte-equal to the Oracle: precision-14 `%G` with half-even rounding (`"0.3"`, `"1.0E+14"`, `"1.0E-5"`, `"10000000000000"`, `"-0"`, `"NAN"`), `"Array"` for an array, `"1"`/`""` for bools, `""` for null | No error expected |
| Objects | `toPhpString(obj)` with a `toString()` port; without one; `looseEquals(obj, "a")`, `(obj, 1)`, `(obj, null)`, same-class objects with and without `Symbol.for('xaravel.php.props')`, different classes | Calls the port; PHP's object rules: string compares the port's result or the object is greater; int/float compare as `1`; null/array: object greater; same class compares the props arrays, different classes uncomparable (`spaceship` 1 both ways), no protocol → identity | Without a port, `toPhpString` throws `Error` `Object of class <FQCN, else "object"> could not be converted to string` |
| Recursion | an array containing itself | — | `Error` `Nesting level too deep - recursive dependency?` from `looseEquals`/`spaceship`; `valueCopy` throws the same |
| valueCopy (AC 2) | nested `Array` / plain object / `PhpArray` holding arrays, a class instance and a `Ref` | A deep copy of every array level, same kinds and key order, `PhpArray`'s next free index kept (`[5=>1]`, unset 5, copy, push → key 6); objects (and `Ref`s) shared by handle; mutating the copy leaves the original unchanged; a scalar returned as is | — |

</intent-contract>

## Code Map

- `packages/runtime/src/php/PhpArray.ts:28-48` -- `intKey`/`floatKey` (truncate, non-finite → 0, wrap mod 2^64): move to `src/php/phpInt.ts` and import back. Add `copy()`: a new `PhpArray` with the same entries and `#nextFree` (`$b = $a`), which `valueCopy` uses before replacing values with `set` (a rewrite keeps position and never lowers the next free index).
- `packages/runtime/src/php/PhpFloat.ts` -- `isFloat` gives the int/float split for `number`; the marked value unwraps with `Number(v)`.
- `packages/runtime/src/php/normalizeNull.ts`, `hasBrand.ts` -- one-function-per-file style; `src/php/index.ts` and `src/index.ts` -- add the exports.
- `packages/runtime/src/registry/registry.ts` -- `fqcn()` for the object-to-string error (fall back to `object` when unregistered, as `PhpArray.offsetType` does).
- PHP sources mirrored (8.5, `Zend/zend_operators.c`): `zend_compare` (type pairs, `ZEND_THREEWAY_COMPARE` → NaN gives 1 both ways, `(DOUBLE,STRING)` NaN → 1), `compare_longs_to_string` / `compare_doubles_to_string` (non-numeric string → compare the number's string form), `zendi_smart_strcmp` (both numeric → numeric, same-side overflow with equal doubles → string compare), `zend_binary_strcmp` (UTF-8 byte order = code-point order), `zend_hash_compare(ordered=0)` (count first, missing key → 1), `zend_std_compare_objects` (cast path), `_is_numeric_string_ex` (whitespace ` \t\n\r\v\f` both ends, int overflow → double with `oflow`, ≥ 20 integer digits → `oflow`), `zval_get_long` (string: numeric prefix, double → `zend_dval_to_lval_cap`: non-finite 0, saturate), `zend_dval_to_lval` (float: modular), `zend_double_to_str` (`precision` 14).
- `packages/runtime/tests/xaravel/values.test.ts:1-80` -- the test idiom to copy: header with the F-10 recorded reason, dynamic `import()` of `packages/assert/tests/xaravel/oracle-values.ts` (`decode`, `readRequests`, `readSignedFixture`), `oracle(id)`, `rawResult`, `thrownBy`, `assertThrows`.
- `packages/assert/tests/xaravel/oracle-values.ts:166-215` (read-only) -- `LOOSE_EXPR` and the raw encoding (`{"float":…}` marks a float, keys `{"int":…}`), which the test decodes with floats marked by `float()`.
- `conformance/oracle-requests/9.5.jsonl` -- the request line format; validate with `bun run oracle:story check 9.6`.
- `conformance/xaravel-consequences/runtime.jsonl` -- consequence ids AD-9.1..9.6 to cite.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/phpInt.ts` -- internal `intKey(bigint)` and `floatToInt(number)` moved from `PhpArray.ts`, plus `capFloatToInt(number)` for strings -- one implementation.
- `packages/runtime/src/php/isNumeric.ts` -- internal `parseNumeric(s, allowErrors)` returning `{ int: bigint | null, float: number, overflow: -1 | 0 | 1 }` or null, and exported `isNumeric(v)` -- AD-9.
- `packages/runtime/src/php/casts.ts` -- `toInt`, `toFloat` (returns a plain `number`), `toPhpString`, `toBool`, and internal `phpType`/`isTrue`/`formatFloat` -- AD-9.
- `packages/runtime/src/php/looseEquals.ts` -- `spaceship(a, b): -1 | 0 | 1` and `looseEquals(a, b)` (`spaceship(a, b) === 0`, as PHP's `==` is `zend_compare() == 0`) -- AD-9.6.
- `packages/runtime/src/php/valueCopy.ts` -- `valueCopy(x)` -- AD-9.2.
- `packages/runtime/src/php/PhpArray.ts`, `src/php/index.ts`, `src/index.ts` -- the shared int module, `copy()`, exports.
- `conformance/oracle-requests/9.6.jsonl` -- one `php-expr` request `XT-runtime-22`: setup `$v` (scalars, strings, arrays), `$o` (four stdClass objects), `$w = array_merge($v, $o)`, `$f` (the float-format list); exprs `$w`, the `==` matrix (`LOOSE_EXPR` over `$w`), the `<=>` matrix, `is_numeric`/`(int)`/`(float)`/`(bool)` maps over `$w`, `(string)` over `$v`, `(string)` over `$f`, `$f`.
- `packages/runtime/tests/xaravel/semantics.test.ts` -- XT-runtime-22 (fixture comparison per value and per pair, reporting every mismatch, plus the object-port, recursion, `bigint`, `undefined` and error cases of the matrix) and XT-runtime-23 (valueCopy rows).
- `packages/runtime/async-surface.json` -- `bun run async-surface runtime` (no async methods).

**Acceptance Criteria:**
- The two ACs of Story 9.6 (`epics.md` line 3114), each verified by its XT row in `stories/9.6.md`.
- Given the PR is pushed, when `oracle.yml#story` runs, then the bot commits the fixture and `bun run oracle:verify-fixtures` passes.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 31 findings — high 0, medium 0, low 19, false 11, maybe-false 1
- findings:
  - `[low]` `[reject]` Blind: two property-less objects of one class are not `==` (identity fallback without the props protocol), while PHP's `new Foo == new Foo` is true — AD-9.6 puts the obligation on ported classes ("Objects that take part in PHP `==` expose `[Symbol.for('xaravel.php.props')]()`"); guessing props from own fields would miss `#private` fields and add branches, and a property-less class compared by `==` is rare.
  - `[low]` `[patch]` Blind: the `looseEquals.ts` header calls the props protocol "public properties", but PHP compares every property — header now says protected and private ones are included.
  - `[false]` `[reject]` Blind: "same class" by prototype identity breaks AD-10 — AD-10.5 forbids two classes under one FQCN and one class under two, so prototype identity is class identity; AD-10.2 governs naming (`X::class`), which this does not read.
  - `[low]` `[patch]` Blind: `valueCopy` of a plain object with an own `"__proto__"` key runs the prototype setter — keys are now written with `Object.defineProperty`.
  - `[low]` `[patch]` Blind: the `valueCopy` docstring credits the recursion throw to PHP — reworded as a Xaravel guard using PHP's comparison message.
  - `[low]` `[patch]` Blind: `isNumeric` accepts an out-of-int64 `bigint` and a symbol silently while the other helpers throw — both now go through `phpType`.
  - `[low]` `[reject]` Blind: no Oracle row for `(int)` of a finite float beyond int64 — the same `floatToInt` is Oracle-checked by XT-runtime-16's keys `1e20`, `-1e20` and `2^63` (9.5 fixture), local PHP 8.5.11 gives the same wrap for `(int) 1e20`, and changing the request would orphan the signed fixture.
  - `[low]` `[patch]` Blind: results 3–7 have no length assertion — added.
  - `[low]` `[patch]` Blind / Verification gap: the non-string `__toString` port error is untested — assertion added; `formatFloat` subnormal, three-digit exponents and the rounding carry are already Oracle rows (`$f` has `5e-324`, `1e100`, `1.7976931348623157E+308`, `99999999999999.5`).
  - `[false]` `[reject]` Blind: `Object.keys` lists integer-like keys first — AD-9.2 makes a plain object a map whose keys are all non-integer-like strings; any other key set is a `PhpArray`, so the order is PHP's for every plain object the model admits.
  - `[low]` `[reject]` Blind: a `PhpArray` subclass copies to the base class, and holey `Array`s — no code subclasses `PhpArray` and AD-9.2 lists are dense (`jsonEncode` rejects holes); handling either adds branches for no caller.
  - `[false]` `[reject]` Blind: Story bookkeeping incomplete — the manifest and sprint status are set at finalize; `async-surface` was regenerated and is unchanged (no async method); `epics.md` line 3114 is the Story's current line.
  - `[maybe-false]` `[defer]` Blind: PHP's warnings and notices are dropped with no DIV clause — whether any Upstream test asserts one of them (through an error handler) settles it; if one does, it is medium, and the Story porting that test raises an Escalation (FR-114), as DIV-9.7 does for PHPUnit's closure warning.
  - `[low]` `[patch]` Edge: `__proto__` key in `valueCopy` — same as the Blind row.
  - `[false]` `[reject]` Edge: integer-like plain-object keys out of order — see the Blind `Object.keys` row.
  - `[false]` `[reject]` Edge: a branded array yielding un-normalised keys (`"5"`, `5n`) — the branded protocol (decisions/ESC-4.1-1.md) yields normalised keys only: a safe int as a `number`, a `bigint` only beyond it.
  - `[low]` `[reject]` Edge: `URL`, `URLSearchParams` and `Buffer` count as `__toString` ports — none is a PHP value in the AD-9 model, so no port passes one; listing every host class adds upkeep for no caller.
  - `[low]` `[patch]` Edge: a port returning an object is named `object` — now `className(result)`; a symbol result is no PHP value and keeps `phpType`'s `TypeError`.
  - `[low]` `[reject]` Edge: `PhpArray` subclass copy — see the Blind row.
  - `[false]` `[reject]` Edge: `arrayEntries` "in PHP order" claim — see the Blind `Object.keys` row.
  - `[low]` `[patch]` Verification gap: brand-only arrays (`BrandedArray`) never reach the helpers — rows added to XT-runtime-22 and 23.
  - `[low]` `[patch]` Verification gap: recursion through object props untested — row added.
  - `[low]` `[patch]` Verification gap: non-string port error untested — same fix as the Blind row.
  - `[false]` `[reject]` Intent: the diff writes the truth-table request itself — descriptive; per-Story requests are how Xaravel Tests get Oracle values (docs/ops/oracle.md § Per-Story requests).
  - `[false]` `[reject]` Intent: object, bigint and `undefined` rows are hand-asserted — descriptive; PHP cannot `(string)` a stdClass without aborting the map expr, and bigint/`undefined` have no PHP spelling.
  - `[low]` `[reject]` Intent: `toFloat` returns a plain number, so `toPhpString(toFloat("1e15"))` is `"1000000000000000"` where PHP gives `"1.0E+15"` — affects only integral floats with |x| in [1e14, 2^53); AD-9.4 leaves marking to the port where Upstream depends on it, and returning `PhpFloat` would break `===` for every caller (Design Notes); listed as a residual risk.
  - `[false]` `[reject]` Intent: Oracle tables lack `(string)` of objects and mixed port objects — descriptive; see above.
  - `[false]` `[reject]` Intent: no ported caller — descriptive; the manifest has no `test_ids`.
  - `[false]` `[reject]` Intent: files named but untouched — see the Blind bookkeeping row; XT IDs have no Expectations lines (9.5 added none).
  - `[low]` `[reject]` Intent: `valueCopy` turns a foreign branded array into a `PhpArray` — the grader's `BrandedArray` is test-only, and `PhpArray` is the runtime's kind for the same PHP array.
  - `[low]` `[patch]` Fidelity Review reviewer 1, F-7 `semantics.test.ts`: XT-runtime-23 never checks the innermost `[2, 3]` — identity and mutation assertions added. This changes the reviewed tree; the layer re-runs.

## Design Notes

- **`toFloat` returns a plain `number`.** AD-9.4 makes both int and float a JS `number` and uses the marker only where Upstream depends on the distinction; a plain number keeps `===` and arithmetic working. `toPhpString(toFloat("1"))` is `"1"`, as PHP's `(string) 1.0`.
- **`toInt` returns `number | bigint`.** AD-9.3: an int beyond ±(2^53−1) is a `bigint`, so `(int) "9223372036854775807"` matches the Oracle exactly. A `bigint` outside int64 is no PHP int and throws `TypeError`.
- **Float strings.** `(string)` uses `precision` (14), not `serialize_precision`: digits come from the exact binary value (BigInt) rounded half-even to 14 significant digits; exponent `< -4` or `>= 14` gives `d.dddE±x` (`.0` when one digit). JS `toPrecision` rounds ties up (`10000000000000.5` → …01; PHP gives …00), so it is not used.

## Verification

**Commands:**
- `bun run oracle:story check 9.6` -- expected: the request accepted
- `bun run harness --xaravel --id 'XT-runtime-*'` -- expected: all pass (22 only once the fixture is pulled)
- `bun --bun tsc -b`, `bun run lint`, `bun run graph:check`, `bun run registration:check`, `bun run async-surface --all --check`, `bun run oracle:verify-fixtures` -- expected: clean
- Before pushing: evaluate the request's exprs with local PHP 8.5.11 and compare with the helpers (a scratch script outside the repo) -- expected: no mismatch
- `bun run story:check 9.6` -- expected: pass, after the Fidelity Review of the final tree

## Fidelity Review

### Reviewer 1: reject at tree d21e5ea208f9ffc4322e25c869329b7f26def67f

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `6c94cc20449ddd931af4324b7ce5f2ec453dc376`, on 2026-10-21T23:42:00.249Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests. |
| F-2: No expected value is weakened | pass | The new differential assertions compare exact Oracle values, including signed zero and NaN via Object.is; no existing expected value is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test or Upstream assertion is changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change contains no adapted markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture has output.error null, and the evidence identifies no relied-on error fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared both test bodies with their consequence strings. XT-runtime-23 does not verify its claim that every nested array level is copied. |
| F-8: No stub, fake or partial implementation of another Component | pass | Framework changes stay within runtime and implement its PHP semantics helpers; no other Component is stubbed or partially implemented. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the source diff and declaration evidence with AD-6 and DIV-1. The new helpers are synchronous and perform no async-root IO or permitted async callback handling; no tags require justification. |
| F-10: Oracle requests match the Upstream test's inputs | pass | The request names a Xaravel differential test, and the test file records why no Upstream inputs exist. Its setup and expressions exercise the PHP constructs declared by that test and the Story criterion. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/semantics.test.ts`: XT-runtime-23 never checks or mutates the innermost [2, 3] array under php.get("list"). An implementation that shares that array can pass despite the declared consequence. Assert distinct identities and mutate that inner copy, then verify the original contents remain unchanged.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"d21e5ea208f9ffc4322e25c869329b7f26def67f","base":"6c94cc20449ddd931af4324b7ce5f2ec453dc376","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-21T23:42:00.249Z","items":[{"id":"F-1","result":"n/a","note":"The manifest assigns no Ported Tests, and the diff adds only Xaravel Tests.","findings":[]},{"id":"F-2","result":"pass","note":"The new differential assertions compare exact Oracle values, including signed zero and NaN via Object.is; no existing expected value is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test or Upstream assertion is changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change contains no adapted markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture has output.error null, and the evidence identifies no relied-on error fixture.","findings":[]},{"id":"F-7","result":"fail","note":"Compared both test bodies with their consequence strings. XT-runtime-23 does not verify its claim that every nested array level is copied.","findings":[{"path":"packages/runtime/tests/xaravel/semantics.test.ts","detail":"XT-runtime-23 never checks or mutates the innermost [2, 3] array under php.get(\"list\"). An implementation that shares that array can pass despite the declared consequence. Assert distinct identities and mutate that inner copy, then verify the original contents remain unchanged."}]},{"id":"F-8","result":"pass","note":"Framework changes stay within runtime and implement its PHP semantics helpers; no other Component is stubbed or partially implemented.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the source diff and declaration evidence with AD-6 and DIV-1. The new helpers are synchronous and perform no async-root IO or permitted async callback handling; no tags require justification.","findings":[]},{"id":"F-10","result":"pass","note":"The request names a Xaravel differential test, and the test file records why no Upstream inputs exist. Its setup and expressions exercise the PHP constructs declared by that test and the Story criterion.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree d21e5ea208f9ffc4322e25c869329b7f26def67f

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `6c94cc20449ddd931af4324b7ce5f2ec453dc376`, on 2026-10-21T23:42:00.249Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The manifest's test_ids is empty and the diff adds or changes no Ported Test. The only tests are the Xaravel Tests XT-runtime-22 and XT-runtime-23, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is added or changed. In XT-runtime-22 the expected values come straight from the signed Oracle fixture and are compared strictly (!== for bool and int, Object.is for float, exact string match), so nothing is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test, so there is no Upstream assertion count to compare. No adapted:DIV marker is added (evidence (a)). |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an // adapted:DIV-<n>.<k> marker and no Expectations adapted field changes (evidence (a)). |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The one added fixture (1ff7702e….json) has output.error null. Evidence (c) lists no error fixture, base or changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | XT-runtime-22 compares looseEquals, spaceship, isNumeric, toInt, toFloat and toBool with the Oracle's ==, <=>, is_numeric and casts over all 73 values in $w (scalars, numeric and whitespace strings, "1e3", INF, NAN, arrays, stdClass objects). It checks toPhpString against the Oracle over $v and the float-format list $f. It also checks objects by hand: a toString() port, no port (Error with the FQCN, 'object' or 'Closure'), same-class comparison through props, different classes giving 1, identity, and casts. It covers recursion errors, bigint handling and undefined read as null. AD-9.6 (the props protocol for ==) is exercised by XtSemanticsPoint and XtSemanticsOther; AD-9 is a whole-section reference. XT-runtime-23 checks what AD-9.2 value-copy claims: each level is a new array of the same kind (Array, plain or null-prototype object, PhpArray), key order and the next free index survive, objects and Refs are shared, and mutating the copy leaves the original unchanged. Both bodies check what their consequence strings declare. |
| F-8: No stub, fake or partial implementation of another Component | pass | All source changes are in packages/runtime/src/php: new files casts.ts, isNumeric.ts, looseEquals.ts, phpInt.ts and valueCopy.ts; PhpArray.ts moves its int helpers into phpInt.ts and gains copy(); the index files add exports. Story 9.6's component is runtime. The test loads the grader's existing oracle-values.ts at run time and does not reimplement it. No stub, fake or hard-coded return of another Component was added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed runtime source file, and every new export (toInt, toFloat, toPhpString, toBool, isNumeric, looseEquals, spaceship, valueCopy, PhpArray.copy, the phpInt helpers) is synchronous. None performs IO behind a Driver contract or takes a callback, so none should be tagged and none is. |
| F-10: Oracle requests match the Upstream test's inputs | pass | The request in conformance/oracle-requests/9.6.jsonl is keyed to the Xaravel Test XT-runtime-22. No Upstream test exists for it, which the test file's header records as the reason, citing docs/ops/oracle.md. Its setup and exprs evaluate only the PHP built-ins the acceptance criterion names (==, <=>, is_numeric and the (int), (float), (string) and (bool) casts) over literal values and stdClass objects. It contains no Laravel code, so the signed values are PHP's own behaviour rather than arbitrary PHP signed as an expected value. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"d21e5ea208f9ffc4322e25c869329b7f26def67f","base":"6c94cc20449ddd931af4324b7ce5f2ec453dc376","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-21T23:42:00.249Z","items":[{"id":"F-1","result":"n/a","note":"The manifest's test_ids is empty and the diff adds or changes no Ported Test. The only tests are the Xaravel Tests XT-runtime-22 and XT-runtime-23, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is added or changed. In XT-runtime-22 the expected values come straight from the signed Oracle fixture and are compared strictly (!== for bool and int, Object.is for float, exact string match), so nothing is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test, so there is no Upstream assertion count to compare. No adapted:DIV marker is added (evidence (a)).","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an // adapted:DIV-<n>.<k> marker and no Expectations adapted field changes (evidence (a)).","findings":[]},{"id":"F-6","result":"n/a","note":"The one added fixture (1ff7702e….json) has output.error null. Evidence (c) lists no error fixture, base or changed.","findings":[]},{"id":"F-7","result":"pass","note":"XT-runtime-22 compares looseEquals, spaceship, isNumeric, toInt, toFloat and toBool with the Oracle's ==, <=>, is_numeric and casts over all 73 values in $w (scalars, numeric and whitespace strings, \"1e3\", INF, NAN, arrays, stdClass objects). It checks toPhpString against the Oracle over $v and the float-format list $f. It also checks objects by hand: a toString() port, no port (Error with the FQCN, 'object' or 'Closure'), same-class comparison through props, different classes giving 1, identity, and casts. It covers recursion errors, bigint handling and undefined read as null. AD-9.6 (the props protocol for ==) is exercised by XtSemanticsPoint and XtSemanticsOther; AD-9 is a whole-section reference. XT-runtime-23 checks what AD-9.2 value-copy claims: each level is a new array of the same kind (Array, plain or null-prototype object, PhpArray), key order and the next free index survive, objects and Refs are shared, and mutating the copy leaves the original unchanged. Both bodies check what their consequence strings declare.","findings":[]},{"id":"F-8","result":"pass","note":"All source changes are in packages/runtime/src/php: new files casts.ts, isNumeric.ts, looseEquals.ts, phpInt.ts and valueCopy.ts; PhpArray.ts moves its int helpers into phpInt.ts and gains copy(); the index files add exports. Story 9.6's component is runtime. The test loads the grader's existing oracle-values.ts at run time and does not reimplement it. No stub, fake or hard-coded return of another Component was added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed runtime source file, and every new export (toInt, toFloat, toPhpString, toBool, isNumeric, looseEquals, spaceship, valueCopy, PhpArray.copy, the phpInt helpers) is synchronous. None performs IO behind a Driver contract or takes a callback, so none should be tagged and none is.","findings":[]},{"id":"F-10","result":"pass","note":"The request in conformance/oracle-requests/9.6.jsonl is keyed to the Xaravel Test XT-runtime-22. No Upstream test exists for it, which the test file's header records as the reason, citing docs/ops/oracle.md. Its setup and exprs evaluate only the PHP built-ins the acceptance criterion names (==, <=>, is_numeric and the (int), (float), (string) and (bool) casts) over literal values and stdClass objects. It contains no Laravel code, so the signed values are PHP's own behaviour rather than arbitrary PHP signed as an expected value.","findings":[]}],"prior":[]}
```
