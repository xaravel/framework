---
title: 'Story 9.6: PHP semantics helpers'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_revision: '6c94cc20449ddd931af4324b7ce5f2ec453dc376'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/stories/9.6.md'
  - '{project-root}/PORTING.md'
warnings: [oversized]
deferred: []
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
