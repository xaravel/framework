---
title: 'Runtime keyed generators, PHP Generator and the PHP functions Collections calls (epic-14-item-2-runtime-generators-functions)'
type: 'feature'
created: '2026-10-25'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: true
warnings: ['oversized']
deferred:
  - summary: >-
      looseEquals and spaceship do not apply PHP's enum compare handler.
    evidence: |-
      PHP makes an enum case uncomparable with anything but itself, except with a bool or null, which compare as bools. The runtime's == treats a case as a castable object, so looseEquals(Suit::Hearts, 1) is true where PHP gives false. in_array and array_unique apply PHP's rule to the values they compare (zendEquals / zendCompare in arrayFunctions.ts), but a case nested in an array or a property still goes through looseEquals / spaceship. The item's ruling forbids other runtime behaviour changes, so the fix needs its own runtime item; Collections' == on nested enums depends on it.
    location: >-
      packages/runtime/src/php/looseEquals.ts
    severity: medium
  - summary: >-
      The I/O matrix's array_filter row says a mode other than 0, 1 and 2 passes the key alone; PHP 8.5.11 passes the value.
    evidence: |-
      ext/standard/array.c sets the key into the only argument, then the value over it unless the mode is ARRAY_FILTER_USE_KEY. The probe records it, and the code follows PHP under the contract's "every value is PHP's" rule. The matrix row was drafted from a misread probe; the intent contract is read-only after planning.
    location: >-
      _bmad-output/implementation-artifacts/spec-retro-14-runtime-generators-functions.md (I/O & Edge-Case Matrix, array_filter row)
    severity: low
  - summary: >-
      An IteratorAggregate cycle (A to B to A) throws the self-return Exception, where PHP 8.5.11 overflows its stack.
    evidence: |-
      PHP gives Error "Maximum call stack size of ... reached. Infinite recursion?" with a size the runtime cannot reproduce. The runtime refuses the cycle loudly instead of hanging; XT-runtime-60 records it as Xaravel-only.
    location: >-
      packages/runtime/src/php/traverse.ts iteratorOf
    severity: low
baseline_revision: '84ed0d59838667c5abfab7a1acd533c7ef9e4e3d'
context:
  - '{project-root}/decisions/MAINT-2026-10-25-story-14-1-second.md'
  - '{project-root}/conformance/escalations/ESC-14.1-5.md'
  - '{project-root}/conformance/escalations/ESC-14.1-6.md'
  - '{project-root}/decisions/DIV-12.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-14-runtime-php-types.md'
---

<intent-contract>

## Intent

**Problem:** Story 14.1 (Collections) needs keyed generators and PHP's `Generator` (ESC-14.1-5, DIV-12.18) and the PHP functions and `(array)` cast its core calls (ESC-14.1-6). The runtime has none of them. The Maintainer ruled option 1 on both (`decisions/MAINT-2026-10-25-story-14-1-second.md`): the runtime half lands first, as action item `epic-14-item-2-runtime-generators-functions`.

**Scope:** `packages/runtime/**` and `packages/contracts/**` (the item's `action`; amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`), plus this spec and sprint status.

**Approach:** `@xaravel/runtime/php` (and the package root) export `keyed`, `yieldFrom` and a `Generator` class that wraps a JS generator object with PHP's generator semantics. They also export, under their PHP names, `is_scalar`, `in_array`, `array_combine`, `array_filter`, `array_unique`, `range`, `iterator_to_array`, `iterator_count`, `str_starts_with` and `substr`, the constants these take, and `toPhpArray` (PHP's `(array)`). Each ports PHP 8.5.11's C source (`ext/standard/array.c`, `string.c`, `Zend/zend_generators.c`, `zend_sort.c`) in coercive typing mode, PHP's mode for a file without `strict_types`, as Laravel's are.

## Boundaries & Constraints

**Always:** These follow PHP 8.5.11 as the host's `php` gives it (probes below):
- **Values and messages.** Every value and every exception class and message is PHP's. PHP's warnings and deprecations are not reproduced, and the function still returns PHP's value, as the casts already do.
- **Values in and out.** `undefined` reads as `null` (AD-9). A PHP array comes in as `arrayEntries` reads it and goes out through `arrayFromEntries` (the AD-9 form). `toPhpArray` alone returns a `PhpArray`, as the ruling says.
- **Sync.** Everything is synchronous.
- **Generator protocol.**
  - Auto keys follow `largest_used_integer_key`: it starts at -1, a keyed int greater than it raises it, and it wraps past `PHP_INT_MAX`.
  - A key from `yieldFrom` keeps the source's key and never moves the counter.
  - `send` and `next` resume with `null` (`next` passes `null`, `send(v)` passes `v`), and a `yieldFrom` over a `Generator` delegates them to it.
  - `rewind` throws once the generator is past its first yield. A closed generator refuses traversal, and `getReturn` refuses until the generator returns.
- **Generator class.** `Generator` carries the `Iterator` and `Traversable` brands. Its `[Symbol.iterator]()`, `entries()` and `keys()` run PHP's `foreach` protocol (`foreachValues` / `foreachIterator` / `foreachKeys`) and refuse a closed generator when called. It is registered as `registerClass('Generator', Generator)`.
- **Traversal.** `iterator_to_array`, `iterator_count` and `yieldFrom` walk a Traversable with PHP's protocol: an `Iterator` by its five methods, an `IteratorAggregate` through `getIterator()` (repeated while it returns another aggregate). They take a bare JS generator object (what a ported generator function returns) by wrapping it in `Generator`.
- **Sorting.** `array_unique` (other than with `SORT_STRING`) sorts with a line-for-line port of `zend_sort` and PHP's unstable comparator, including the enum rule of `php_array_data_compare_unstable_i`, and then deletes duplicates in PHP's order. So the kept keys match PHP's even where `==` is not transitive.
- **Bytes.** `substr` counts UTF-8 bytes, as PHP's string is its bytes. A result or input JS cannot hold (it splits a UTF-8 sequence, or holds a lone surrogate) throws a JS `TypeError` naming the limit, as the codecs do (`docs/codecs.md`). `range`'s character form does the same for a byte ≥ 0x80.
- **Tests.** New XT cases use `xaravelTest` and `@xaravel/assert`. A PHP probe records every PHP-derived value, and XT-runtime-61 recomputes each one with the runtime, as XT-runtime-56 does.

**Never:**
- **Other runtime behaviour.** Change any existing runtime behaviour or export. The camelCase helpers (`interfaceExists`, `isFloat`) stay as they are.
- **Imports.** Import `@xaravel/contracts` from the runtime (AD-2).
- **Other paths.** Touch `conformance/expectations/**`, `decisions/**`, PORTING.md, `packages/collections/**` or any package other than runtime and contracts.
- **The classes map.** Add `Generator` to `Symbol.for('xaravel.php.classes')`. It stays at the 24 entries XT-runtime-35 pins.
- **Unruled additions.** Port `Generator::throw`, `SORT_LOCALE_STRING`, `SORT_NATURAL`, `SORT_FLAG_CASE`, or PHP callable strings and arrays as `array_filter` callbacks. Each throws a named error, and the docs list it.
- **Existing tests.** Change an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Auto keys | `yield 'a'; yield keyed(5,'b'); yield 'c'; yield keyed('x','d'); yield 'e'; yield keyed(-9,'f'); yield 'g'` | entries `[0,a],[5,b],[6,c],[x,d],[7,e],[-9,f],[8,g]`; `keyed(-5,a)` then `b` gives `-5, 0`; `keyed(PHP_INT_MAX)` then a value gives `PHP_INT_MIN`; a float or a `'7'` key stays as it is, and the next auto key is 0 | none |
| yieldFrom | `yield 1; yield* yieldFrom([5=>'x','y']); yield 2`; a `Generator` source that returns `'R'`; an `ArrayIterator`; a started generator | `[0,1],[5,x],[6,y],[1,2]`; `yield*` gives `'R'` (an array or a Traversable gives `null`); a started source continues from its current entry; `send` reaches the inner generator | a non-iterable: PHP `Error` `Can use "yield from" only with arrays and Traversables`; a closed generator: `Error` `Generator passed to yield from was aborted without proper return and is unable to continue`; a running one: `Error` `Impossible to yield from the Generator being currently run` |
| Generator methods | `$x = yield 1; $y = yield 2; return 3`, then `send('S')`, `current`, `getReturn`, `next`, the state | `x` is `'S'`, `send` returns 2; `getReturn` throws until done; then `[false,null,null,3]`; a fresh `next()` skips the first yield; a fresh `send` runs to the first yield first; a bare `yield` gives `[null, 0]` | `Exception`: `Cannot get return value of a generator that hasn't returned`, `Cannot rewind a generator that was already run`, `Cannot traverse an already closed generator`; `Error` `Cannot resume an already running generator`; `phpSerialize`: `Exception` `Serialization of 'Generator' is not allowed`; no JS generator object: `Error` `The "Generator" class is reserved for internal use and cannot be manually instantiated` |
| Closed by return or throw | `return 7` before any yield; a generator that throws `LogicException` after `yield 1` | `getReturn` 7, `rewind` fine, the first traversal `[]`, the second refused; the throw reaches the caller, then `valid` false, `current` null, and `getReturn` refused | as above |
| iterator_to_array / iterator_count | keyed yields `a=>1, a=>2, 1.7=>3, null=>4, true=>5`; `preserve_keys` false; an array; an `ArrayObject` | `{"a":2,"1":5,"":4}`; a list of the values; the array (preserve) or its values; `{"k":1,"0":2}`; counts 2 and 3 | key `[]` / `stdClass`: `TypeError` `Cannot access offset of type array on array` / `… stdClass on array`; `5`: `TypeError` `iterator_to_array(): Argument #1 ($iterator) must be of type Traversable|array, int given` (`iterator_count` likewise) |
| is_scalar / in_array | `1, 1.5, 's', false, null, [], stdClass`; `'1e1'` in `['10']`, `'abc'` in `[0]`, `null` in `['']` loose and strict, `1` / `'1'`, `float(1)` / `1`, `[1]` / `[[1]]`, `{a,b}` / `{b,a}` strict and loose | `T T T T F F F`; `[true,false,true,false,false,false,true,false,true]` | `in_array(1,'x')`: `TypeError` `in_array(): Argument #2 ($haystack) must be of type array, string given`; `strict` `[]`: `… Argument #3 ($strict) must be of type bool, array given` |
| array_combine | keys `['a',1,1.5,true,null,'07','7',float(2)]` and 8 values; `['a','a']` | `{"a":1,"1":4,"1.5":3,"":5,"07":6,"7":7,"2":8}`; `{"a":2}`; `[[]]` keys give `{"Array":1}` | count mismatch: `ValueError` `array_combine(): Argument #1 ($keys) and argument #2 ($values) must have the same number of elements`; a `stdClass` key: `Error` `Object of class stdClass could not be converted to string`; a string: `TypeError` `… Argument #1 ($keys) must be of type array, string given` |
| array_filter | no callback over `[1,0,2,null,'','a','0',[],[0]]`; `ARRAY_FILTER_USE_KEY`; `USE_BOTH`; mode 7 | `{"0":1,"2":2,"5":"a","8":[0]}`; keys kept; `(value, key)` for BOTH, the key alone for any other non-zero mode, exactly that many arguments | `5`: `TypeError` `array_filter(): Argument #2 ($callback) must be a valid callback or null, no array or string given`; a string or an array callable: `TypeError` naming the unported callable form; a string mode: `… Argument #3 ($mode) must be of type int, string given` |
| array_unique | `[3,"3",1,"a",1.0,true,"1"]` with `SORT_STRING` / `SORT_REGULAR`; `["10","1e1",10.0,"a","b","a"]` `SORT_NUMERIC`; `[[1],[1],"Array"]` | keys `0,2,3` / `0,2,3,6` (PHP's non-transitive result); `{"0":"10","3":"a"}`; `[[1]]` | an unported flag: `ValueError` naming it; an object without `__toString` under `SORT_STRING`: PHP's `Error` |
| range | each case of the `range` probe: ints, descending, negative step, floats (marked `float()` when integral), numeric and digit strings, characters, mixed, `''`, `null`, `true`, the size limits | PHP's array | PHP's `ValueError` and `TypeError` messages as probed, the two size messages included |
| str_starts_with / substr | `('hello','he')`, `''`, `(123, 1)`, `('1', true)`, `('x', null)`; `substr` offsets and lengths `1,3 / -3 / 9 / -9,2 / 1,-1 / 3,-5 / 0,null`, `'1'`, `1.5`, `true`, `null`, `12345`, `1.5` as the string, `'héllo',1,2` | PHP's results (`"é"` for the byte pair) | `[]`: `TypeError` `… Argument #1 ($haystack) must be of type string, array given`; `'x'`, `'1x'`, `NAN`, `1e30` offsets: `… Argument #2 ($offset) must be of type int, string|float given`; length `'x'`: `… Argument #3 ($length) must be of type ?int, string given`; `substr('héllo',1,1)`: JS `TypeError` (splits a UTF-8 sequence) |
| toPhpArray | `null, 1, 1.5, 'a', true, [3=>1]`; `stdClass` with props `5` and `x`; a class with a protected and a private property; a closure; an `ArrayObject`; a `Generator` | a `PhpArray`: `[]`, `[v]`; `{5:"five", x:"y"}` with int key 5; mangled keys `"\0*\0b"` and `"\0P\0c"`; `[closure]`; its storage; `[]` | none |

</intent-contract>

## Code Map

- `packages/runtime/src/php/index.ts`, `src/index.ts` -- export lists; `tests/xaravel/docs.test.ts` (XT-runtime-37) reads only `export { … } from` lists and needs every export named in backticks under `docs/`.
- `packages/runtime/src/php/casts.ts` -- `arrayEntries` (array input), `arrayCount`, `isTrue`, `toInt`, `toFloat`, `toPhpString` (string coercion, `__toString`, PHP's `Error` for an object without one), `phpType`, `formatFloat`.
- `packages/runtime/src/php/PhpArray.ts` -- `normalizeKey` (its `TypeError` message is PHP's for `iterator_to_array`'s illegal keys), `arrayFromEntries` (the AD-9 output form), `PhpArray.copy()`.
- `packages/runtime/src/php/phpType.ts` -- `phpTypeName` gives the `… given` type names; `className`.
- `packages/runtime/src/php/looseEquals.ts` -- `looseEquals` (`in_array` loose) and `spaceship` (`zend_compare`; returns 1 for uncomparable, which is `ZEND_UNCOMPARABLE`).
- `packages/runtime/src/php/numericString.ts` `parseNumeric(s, false)` -- `is_numeric_str_function`, for the int, number and `range` coercions.
- `packages/runtime/src/php/phpInt.ts` -- `INT_MAX`, `INT_MIN`, `intKey`, `floatToInt`; `PhpFloat.ts` `float()` / `isFloat`.
- `packages/runtime/src/php/mangle.ts:148` `objectProps` -- PHP's `(array)` property list (mangled names, the props protocol); `LONE_SURROGATE`, `utf8`.
- `packages/runtime/src/php/liveCursor.ts:131-175` -- `IteratorMethods`, `foreachIterator`, `foreachValues`, `foreachKeys`.
- `packages/runtime/src/php/InternalIterator.ts` -- the brand-getter, `__serialize` refusal and iteration pattern `Generator` follows.
- `packages/runtime/src/php/Iterator.ts`, `IteratorAggregate.ts`, `Traversable.ts` -- tokens whose `instanceof` reads the brand.
- `packages/runtime/src/php/classExistence.ts` `isEnumClass` -- the AD-26 enum test for `array_unique`'s enum rule.
- `packages/runtime/src/php/Error.ts`, `Exception.ts`, `TypeError.ts`, `ValueError.ts` -- what is thrown.
- `packages/runtime/tests/xaravel/php-builtins.test.ts:1231-1250` and `php-builtins.probe.php` -- the probe-and-recompute pattern. The next free ids are XT-runtime-57 and XT-contracts-23.
- PHP 8.5.11 sources consulted, read-only: `ext/standard/array.c` (`PHP_FUNCTION(array_unique)` :5015, `range` with `php_range_process_input`, `array_combine` :7165, `array_filter`, `php_search_array` :1732), `Zend/zend_sort.c` (`zend_sort`, `zend_insert_sort`, `zend_sort_2..5`), `ext/standard/string.c` (`_zend_substr` :2230, `str_starts_with` :1848), `Zend/zend_generators.c`, and `Zend/zend_API.c` (`zend_parse_arg_long_weak` :567, `zend_parse_arg_number_slow` :698, `zend_parse_arg_number_or_str_slow` :732). `HT_MAX_SIZE` is `0x40000000`.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/keyed.ts` -- the frozen `KeyedYield` marker class (`key`, `value`), `keyed(k, v)`, and an internal delegated variant that `yieldFrom` yields.
- `packages/runtime/src/php/Generator.ts` -- `Generator` (state: started, at-first-yield, running, finished, current, key, the return value, the largest int key), and `yieldFrom(source)` (a JS generator that yields delegated markers and returns the inner generator's return value, or `null`).
- `packages/runtime/src/php/traverse.ts` (internal) -- PHP's traversal of an array, a Traversable or a bare JS generator as `[key, value]` pairs, plus a count, with PHP's `getIterator` errors.
- `packages/runtime/src/php/phpArguments.ts` (internal) -- coercive parameters: string, int, nullable int, bool, number, number-or-string and array, each with PHP's `TypeError` message.
- `packages/runtime/src/php/identical.ts` (internal) -- `zend_is_identical`.
- `packages/runtime/src/php/zendSort.ts` (internal) -- the `zend_sort` port over a JS array with a comparator.
- `packages/runtime/src/php/arrayFunctions.ts` -- `is_scalar`, `in_array`, `array_combine`, `array_filter`, `array_unique`, `iterator_to_array`, `iterator_count`, `toPhpArray`, and the constants `ARRAY_FILTER_USE_BOTH`, `ARRAY_FILTER_USE_KEY`, `SORT_REGULAR`, `SORT_NUMERIC` and `SORT_STRING`.
- `packages/runtime/src/php/range.ts` -- `range`.
- `packages/runtime/src/php/stringFunctions.ts` -- `str_starts_with`, `substr`.
- `packages/runtime/src/php/index.ts`, `src/index.ts` -- export them all.
- `packages/runtime/docs/php-functions.md` (new, linked from the README) -- name every new export. Say what DIV-12.18 rewrites and what is not ported (`Generator::throw`, the other sort flags, callable strings, a JS generator already advanced before it is wrapped). Say that `ArrayObject`'s `STD_PROP_LIST` is still not acted on by `toPhpArray`, and that a value whose byte form JS cannot hold throws.
- `packages/runtime/tests/xaravel/php-functions.test.ts` -- XT-runtime-57 (`keyed`, `yieldFrom`, `Generator`), XT-runtime-58 (`is_scalar`, `in_array`, `array_combine`, `array_filter`, `array_unique`, the constants), XT-runtime-59 (`range`), XT-runtime-60 (`iterator_to_array`, `iterator_count`, `str_starts_with`, `substr`, `toPhpArray`), and XT-runtime-61, which recomputes every label of `php-functions.probe.txt`. Each matrix row is covered, plus a fresh-process check that the root and `@xaravel/runtime/php` export each name and that `resolveClass('Generator')` finds the class.
- `packages/runtime/tests/xaravel/php-functions.probe.php` / `.txt` -- the PHP evidence (`php -d error_reporting=0 php-functions.probe.php > php-functions.probe.txt`).
- `packages/runtime/async-surface.json` -- regenerate only if the generator changes it.

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-57..61 run, then each row holds and every probe label matches PHP 8.5.11.
- Given a fresh process, when the package root or `@xaravel/runtime/php` loads, then every new name is exported and `Symbol.for('xaravel.php.classes')` still has 24 entries.
- Given the change, when `bun run harness`, `bun run typecheck` and `bun run lint` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-2-runtime-generators-functions --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 36 findings — high 0, medium 4, low 21, false 5, maybe-false 0 (6 intent-alignment observations, descriptive, counted as low or false below)
- Pre-review correction (step 03 verify, before the layers ran): the implementation had replaced the matrix's `{a,b}` / `{b,a}` PHP-array case with `stdClass` objects and added a local rule comparing objects without a props hook by their properties. AD-9.6 forbids that rule (objects compare through the props protocol, else by identity), and it copied shared PHP comparison semantics into a second place (Epic 4 / Epic 9 lessons). Removed: the case is PHP arrays again, and `in_array` / `array_unique` compare with `looseEquals` / `spaceship`, plus PHP's enum handler only.
- Fidelity Review layer: reviewer 1 `pass` (codex/gpt-6.1-sol), reviewer 2 `pass` (claude/claude-opus-5-5) at tree `11bc1e61452f60a820f6e931c35ab11e6ab91fad`; 0 findings. The patches below change the tree, so the Finalize re-check re-runs it.
- findings (edge-case-hunter):
  - `[low]` `[patch]` `array_filter` with an in-range bigint mode `1n` misses `ARRAY_FILTER_USE_BOTH` — the mode is compared as `Number(mode)`.
  - `[low]` `[patch]` An `IteratorAggregate` cycle A→B→A loops forever in `iteratorOf` — the visited aggregates are tracked and a repeat throws PHP's `getIterator()` `Exception`.
  - `[false]` `[reject]` A Traversable-branded object without `entries()` throws a raw JS `TypeError` — `Traversable`'s TS interface requires `entries()`, and every runtime Traversable defines it; such an object breaks the interface, and a loud failure is correct.
  - `[low]` `[patch]` `yieldFrom` refuses a function-typed Traversable that `iterator_to_array` accepts — `yieldFrom` now tests `isTraversable` without the `typeof object` gate.
  - `[low]` `[patch]` `keyed(5n, v)` keeps the key `5n` where AD-9.3 holds a safe int as a `number` — the int key is normalised with `intKey`.
  - `[low]` `[patch]` `iterator_to_array(2n ** 70n)` says `int given` where PHP says `float given` — `iterableArgument` applies `phpValueOf`, as `argumentTypeError` does.
  - `[low]` `[patch]` The `SORT_STRING | SORT_FLAG_CASE` error names only `SORT_FLAG_CASE`, unlike the docs (also blind-hunter) — every refused flag is named in full.
- findings (blind-hunter):
  - `[medium]` `[patch]` The docs say `undefined` reads as null, but an `undefined` optional argument takes PHP's default (`array_unique(x, undefined)` is `SORT_STRING`) — the docs now say an `undefined` optional argument is omitted, the JS convention; `null` passed explicitly is PHP's `null`.
  - `[low]` `[patch]` Inconsistent `SORT_FLAG_CASE` naming — grouped with the edge-case row above.
  - `[low]` `[patch]` An aggregate cycle hangs — grouped with the edge-case row above.
  - `[low]` `[patch]` `array_filter` refuses an object with `__invoke`, which PHP accepts — accepted, called with the same exact arguments.
  - `[medium]` `[patch]` A dropped unfinished `Generator` never runs the JS generator's `finally`, where PHP runs it on destruction, and the docs do not say so — listed under "Not ported" (JS has no destructor; the runtime cannot observe the drop).
  - `[low]` `[patch]` The docs give `Cannot access offset of type array on array` for an object key — corrected to the class name.
  - `[medium]` `[patch]` `in_array`'s enum rule has no PHP evidence or test — probe rows added (see the verification-gap enum row, same root cause).
  - `[low]` `[reject]` Nested arrays in `array_filter` / `array_unique` / `array_combine` results alias the input's — AD-9 arrays are JS references, and ports copy with `valueCopy` where PHP's copy-on-write matters (`PhpArray.copy`'s contract); the runtime's codecs and helpers do not deep-copy either. Making these four copy would add work no consumer has shown it needs.
  - `[low]` `[reject]` `array_unique`'s enum order is a process-wide counter, not declaration order — it is no per-request state (AD-5): an identity order that only groups equal cases, as PHP's address comparison does, and PHP's addresses are no declaration order either; the probe's kept keys match.
  - `[low]` `[patch]` `Generator.ts` and `traverse.ts` import each other with no load-safety note — a header note in each says every cross-use is at call time.
  - `[low]` `[patch]` Probe gaps: a user `Iterator` class, an aggregate returning a `Generator`, a two-level `yield from` with `send`, `toPhpArray` of an `ArrayIterator` — each added with PHP evidence.
  - `[low]` `[patch]` `iterableArgument` type name without `phpValueOf` — grouped with the edge-case row above.
- findings (verification-gap):
  - `[low]` `[patch]` `range`'s float element count rounding is not pinned (`Math.floor(size + 0.5)` → `Math.floor(size)` survives) — `range(0, 4.3, 0.1)` and `range(0, 8.1, 0.1)` counts added.
  - `[low]` `[patch]` The self-returning aggregate guard is untested — `SelfAggregate` added, with PHP evidence.
  - `[low]` `[patch]` `zend_sort`'s median-of-5 branch (1024+ elements) is untested — an LCG list of about 1100 mixed values added to the probe.
  - `[low]` `[patch]` Strict `in_array` never checks key equality — `in_array(['a'=>1], [['b'=>1]], true)` added.
  - `[low]` `[patch]` `toPhpArray` copying an object property's nested array is not asserted — a `stdClass` case added.
  - `[low]` `[patch]` `Iterator::valid()` read through `zend_is_true` is not exercised (filed as defer) — cheap to close: a user Iterator whose `valid()` returns `1` added with the probe gap row above.
  - `[medium]` `[patch]` An enum case compared loosely with a bool or null gives the wrong answer (`Suit::Hearts == true` is true in PHP; `array_unique([Hearts, true])` keeps `[0]`; `[true, Hearts, false, null]` keeps `[0,2]`) — the enum rule applies only when neither operand is a bool or null; those go to `looseEquals` / `spaceship`. Probe rows added, docblocks and docs corrected.
- findings (intent-alignment):
  - `[low]` `[patch]` No test is shaped like a consumer call (`iterator_to_array` of a `WeakMap`, as `Arr::from` makes it) — added; the LazyCollection-shaped chains are covered by the two-level `yield from` row.
  - `[false]` `[reject]` `range` is checked against PHP 8.5.11, not documented 8.3 behaviour — the item says "PHP 8.3's rules", which 8.3's rewrite introduced and 8.5.11 keeps; the Oracle runs 8.5.11, and the probe is 8.5.11's output.
  - `[false]` `[reject]` `packages/contracts` is untouched — the item allows it in scope but needs nothing there: `Generator` is a class carrying existing runtime tokens' brands, not a new token, so no contracts-side token equivalence applies (unlike item 1's interfaces).
  - `[false]` `[reject]` The `toPhpArray` `STD_PROP_LIST` gap and the unported callable forms are consumer-surface limits — both are documented, pre-existing (`STD_PROP_LIST` is item 1's) or outside the ruling, and Laravel's call sites pass closures.
  - `[false]` `[reject]` Additions beyond the list (`keys()`, constants, `KeyedYield` type, named errors, bare-generator wrapping) — each is what the listed exports need (the constants are their arguments, `keys()` is the Traversable rule of the 2026-10-25 amendment), and none contradicts the intent.
  - `[low]` `[reject]` Process items (harness, typecheck, lint, fidelity `current`) are not visible in a diff — they are run by the loop and recorded under Auto Run Result.

### 2026-10-26 — Review pass (Finalize re-check, loop 1)
- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- Fidelity Review layer: the patches above changed the tree, so `status --item` printed `missing` for tree `83d7f885fee3fff250f6b7ef14788ef148759bcc` and the layer ran again: reviewer 1 `pass` (codex/gpt-6.1-sol), reviewer 2 `pass` (claude/claude-opus-5-5); `status --item` prints `current`.
- Patches applied in the first pass: each `[patch]` row above, by the implementation subagent, as listed there. Re-verified on the patched tree: `bun test packages/runtime` 61 pass, `bun test packages/contracts` 22 pass, the probe re-runs byte for byte (55 labels), `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime` clean, `bun run harness` `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.

## Design Notes

A ported generator under DIV-12.18:

```ts
function* pairs() { yield "a"; yield keyed("k", 2); const r = yield* yieldFrom(inner()); return r; }
const g = new Generator(pairs());
g.current(); // "a", key 0
[...new Generator(pairs()).entries()]; // [[0,"a"],["k",2], …inner's own keys]
iterator_to_array(pairs()); // a bare JS generator object is wrapped
```

`next()` resumes the JS generator with `null` and `send(v)` with `v`. The first resume only starts it, as JS ignores the first `next` argument, which is PHP's "run to the first yield". `yieldFrom` re-yields each inner pair as a delegated marker and passes what it receives to the inner `Generator`'s `send`.

## Verification

**Commands:**
- `bun test packages/runtime packages/contracts` -- expected: all pass.
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-functions.probe.php | diff - php-functions.probe.txt` -- expected: no output.
- `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime` -- expected: clean.
- `bun run harness` -- expected: `differ=0`.

## Fidelity Review

### Reviewer 1: pass at tree 11bc1e61452f60a820f6e931c35ab11e6ab91fad

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `84ed0d59838667c5abfab7a1acd533c7ef9e4e3d`, on 2026-10-26T06:56:05.080Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the new tests' expected values and exception checks with the supplied PHP probes and recorded output; comparisons remain exact and no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests or existing assertions are removed or modified. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied evidence identifies no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-57 through XT-runtime-61 with their bodies, helpers and PHP probes. They check the declared generator, function, cast and export consequences; XT-runtime-61 compares every recorded probe case, including exception classes and messages. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared the changed paths and implementations with the approved runtime/contracts scope. All changes belong to runtime, implement its approved PHP primitives and introduce no substitute implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the touched source declarations with AD-6 and DIV-1. The added functions and generator methods are synchronous, perform no IO and require no async-root tags; the touched files retain no such tags. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"11bc1e61452f60a820f6e931c35ab11e6ab91fad","base":"84ed0d59838667c5abfab7a1acd533c7ef9e4e3d","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T06:56:05.080Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new tests' expected values and exception checks with the supplied PHP probes and recorded output; comparisons remain exact and no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests or existing assertions are removed or modified.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied evidence identifies no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-57 through XT-runtime-61 with their bodies, helpers and PHP probes. They check the declared generator, function, cast and export consequences; XT-runtime-61 compares every recorded probe case, including exception classes and messages.","findings":[]},{"id":"F-8","result":"pass","note":"Compared the changed paths and implementations with the approved runtime/contracts scope. All changes belong to runtime, implement its approved PHP primitives and introduce no substitute implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the touched source declarations with AD-6 and DIV-1. The added functions and generator methods are synchronous, perform no IO and require no async-root tags; the touched files retain no such tags.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 11bc1e61452f60a820f6e931c35ab11e6ab91fad

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `84ed0d59838667c5abfab7a1acd533c7ef9e4e3d`, on 2026-10-26T06:56:05.080Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | This action item assigns no Ported Test IDs and has no Inventory rows. Every added test is a Xaravel Test (XT-runtime-57..61) in packages/runtime/tests/xaravel/php-functions.test.ts. There is no Ported Test to compare with Upstream assertions. |
| F-2: No expected value is weakened | pass | No Ported Test or stale_tests file is changed. The new Xaravel Tests compare exactly, with assertSame against JSON strings, to the values recorded from PHP 8.5.11 in php-functions.probe.txt. XT-runtime-61 checks every recorded label and that the set of labels matches PROBE_CASES. Only the assertions marked Xaravel-only (JS TypeError limits) use assertStringContainsString, and they have no PHP counterpart. No expected value was loosened or rewritten to match Xaravel's output. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so no Upstream assertion count applies. There are no adapted markers or DIV fewer_assertions to check. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-<n>.<k>' marker and no Expectations adapted field. DIV-12.18 is cited only in docs and docblocks. The runtime implements what that clause describes: keyed, yieldFrom, and Generator with current/key/next/valid/send/rewind/getReturn, Iterator/Traversable brands, [Symbol.iterator] values and entries() pairs. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no assigned or changed Oracle fixture whose output is an error. The change relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each consequence string was compared with its test body. - XT-57 asserts these: automatic keys (gen.auto_keys, negative_then_auto); the INT_MAX→INT_MIN wrap; delegated keys leaving the counter alone (yieldFrom.array gives [1,2] after keys 5,6); yield from over an array, ArrayIterator, nested Aggregate and generator, with the return value, send and a started delegate; method behaviour and errors (methods, fresh_next, fresh_send, rewind, getReturn); the closed and running refusals; the serialize refusal; new Generator refused; the Iterator/Traversable brands and not IteratorAggregate. - XT-58 covers is_scalar, loose and strict in_array, array_combine values and errors, array_filter with no callback and the argument rule for modes 0/2/1/7/-1, and array_unique with SORT_STRING/REGULAR/NUMERIC keys, the enum rule, and the unported-flag and callable errors. - XT-59 covers each range case its string names, both size messages and the JS TypeError for bytes of 0x80 or more. - XT-60 covers iterator_to_array and iterator_count, str_starts_with and substr with their messages, toPhpArray with mangled names, and the fresh-process check 'all true 24'. - XT-61 compares every probe label. No string cites an FR/AD bullet token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime, within the item's scope (runtime and contracts). The runtime does not import @​xaravel/contracts: phpInterface tokens and the registry are runtime-local. No stub, fake or hard-coded return of another Component's behaviour is added. The functions port PHP's own semantics, as ESC-14.1-5 and ESC-14.1-6 direct. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file. Every new export is synchronous and returns no Promise or thenable type: Generator and its methods, keyed, yieldFrom (a sync generator function), the array, range and string functions, toPhpArray and the constants. None reaches a Driver-contract IO root or accepts a callback DIV-1 allows to be async. array_filter's callback is a sync PHP callback, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"11bc1e61452f60a820f6e931c35ab11e6ab91fad","base":"84ed0d59838667c5abfab7a1acd533c7ef9e4e3d","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T06:56:05.080Z","items":[{"id":"F-1","result":"n/a","note":"This action item assigns no Ported Test IDs and has no Inventory rows. Every added test is a Xaravel Test (XT-runtime-57..61) in packages/runtime/tests/xaravel/php-functions.test.ts. There is no Ported Test to compare with Upstream assertions.","findings":[]},{"id":"F-2","result":"pass","note":"No Ported Test or stale_tests file is changed. The new Xaravel Tests compare exactly, with assertSame against JSON strings, to the values recorded from PHP 8.5.11 in php-functions.probe.txt. XT-runtime-61 checks every recorded label and that the set of labels matches PROBE_CASES. Only the assertions marked Xaravel-only (JS TypeError limits) use assertStringContainsString, and they have no PHP counterpart. No expected value was loosened or rewritten to match Xaravel's output.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so no Upstream assertion count applies. There are no adapted markers or DIV fewer_assertions to check.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-<n>.<k>` marker and no Expectations adapted field. DIV-12.18 is cited only in docs and docblocks. The runtime implements what that clause describes: keyed, yieldFrom, and Generator with current/key/next/valid/send/rewind/getReturn, Iterator/Traversable brands, [Symbol.iterator] values and entries() pairs.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no assigned or changed Oracle fixture whose output is an error. The change relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Each consequence string was compared with its test body.\n- XT-57 asserts these: automatic keys (gen.auto_keys, negative_then_auto); the INT_MAX→INT_MIN wrap; delegated keys leaving the counter alone (yieldFrom.array gives [1,2] after keys 5,6); yield from over an array, ArrayIterator, nested Aggregate and generator, with the return value, send and a started delegate; method behaviour and errors (methods, fresh_next, fresh_send, rewind, getReturn); the closed and running refusals; the serialize refusal; new Generator refused; the Iterator/Traversable brands and not IteratorAggregate.\n- XT-58 covers is_scalar, loose and strict in_array, array_combine values and errors, array_filter with no callback and the argument rule for modes 0/2/1/7/-1, and array_unique with SORT_STRING/REGULAR/NUMERIC keys, the enum rule, and the unported-flag and callable errors.\n- XT-59 covers each range case its string names, both size messages and the JS TypeError for bytes of 0x80 or more.\n- XT-60 covers iterator_to_array and iterator_count, str_starts_with and substr with their messages, toPhpArray with mangled names, and the fresh-process check 'all true 24'.\n- XT-61 compares every probe label.\nNo string cites an FR/AD bullet token.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime, within the item's scope (runtime and contracts). The runtime does not import @xaravel/contracts: phpInterface tokens and the registry are runtime-local. No stub, fake or hard-coded return of another Component's behaviour is added. The functions port PHP's own semantics, as ESC-14.1-5 and ESC-14.1-6 direct.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file. Every new export is synchronous and returns no Promise or thenable type: Generator and its methods, keyed, yieldFrom (a sync generator function), the array, range and string functions, toPhpArray and the constants. None reaches a Driver-contract IO root or accepts a callback DIV-1 allows to be async. array_filter's callback is a sync PHP callback, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 83d7f885fee3fff250f6b7ef14788ef148759bcc

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `84ed0d59838667c5abfab7a1acd533c7ef9e4e3d`, on 2026-10-26T07:08:46.206Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item adds no Ported Tests and assigns no Ported Test IDs. |
| F-2: No expected value is weakened | pass | Compared the new PHP-derived expectations with the supplied PHP probe and recorded output. Values and exception messages retain exact comparisons; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test assertions are changed or removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines or Skip Reasons. |
| F-5: Every `adapted` marker matches its clause | n/a | There are no assertion adaptation markers or Expectations adapted fields to check. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture evidence identifies no Oracle error fixtures relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-57 through XT-runtime-61 with their bodies, helpers and PHP probe cases. Assertions cover the declared generator, function, cast and export consequences; XT-runtime-61 compares every recorded label exactly and checks label completeness. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the approved runtime/contracts scope. All changes belong to runtime, implement the authorized PHP primitives, and introduce no implementation of another Component or contracts import. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations with AD-6 and DIV-1. The new implementations are synchronous, perform no IO and require no async-root tags; the exposed coercion helpers remain synchronous. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"83d7f885fee3fff250f6b7ef14788ef148759bcc","base":"84ed0d59838667c5abfab7a1acd533c7ef9e4e3d","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T07:08:46.206Z","items":[{"id":"F-1","result":"n/a","note":"The action item adds no Ported Tests and assigns no Ported Test IDs.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new PHP-derived expectations with the supplied PHP probe and recorded output. Values and exception messages retain exact comparisons; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test assertions are changed or removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines or Skip Reasons.","findings":[]},{"id":"F-5","result":"n/a","note":"There are no assertion adaptation markers or Expectations adapted fields to check.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture evidence identifies no Oracle error fixtures relied upon by this action item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-57 through XT-runtime-61 with their bodies, helpers and PHP probe cases. Assertions cover the declared generator, function, cast and export consequences; XT-runtime-61 compares every recorded label exactly and checks label completeness.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the approved runtime/contracts scope. All changes belong to runtime, implement the authorized PHP primitives, and introduce no implementation of another Component or contracts import.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations with AD-6 and DIV-1. The new implementations are synchronous, perform no IO and require no async-root tags; the exposed coercion helpers remain synchronous.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 83d7f885fee3fff250f6b7ef14788ef148759bcc

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `84ed0d59838667c5abfab7a1acd533c7ef9e4e3d`, on 2026-10-26T07:08:46.206Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item has no Ported Test IDs, no Inventory rows and no stale_tests. The change adds only Xaravel Tests (XT-runtime-57..61), so no Ported Test exists to compare with Upstream source lines. |
| F-2: No expected value is weakened | n/a | No Ported Test or stale_tests file is added or changed, so there is no Upstream expected value to compare. The Xaravel Tests use assertSame on exact JSON and exact messages taken from the PHP 8.5.11 probe record. assertStringContainsString appears only in Xaravel-only JS TypeError checks, which have no PHP counterpart. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test exists, so there is no Upstream assertion count to compare and no assertion was removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip and touches no conformance expectations file. |
| F-5: Every `adapted` marker matches its clause | n/a | No added line carries an // adapted:DIV-<n>.<k> marker and no Expectations adapted field is set. DIV-12.18 is cited only in docs and docblocks as the rule the runtime implements: keyed(k, v) and yield* yieldFrom(...), with Generator providing current, key, next, valid, send, rewind and getReturn. That matches the clause text. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no assigned Oracle request and no added, changed or base error fixture. The tests rely on the committed PHP probe record, not on Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each consequence string with its test body. XT-runtime-57 checks: automatic keys (gen.auto_keys, negative_then_auto); the PHP_INT_MAX wrap; that a key from yieldFrom never moves the counter (yieldFrom.array gives [1,2] after keys 5 and 6); yield from over arrays, ArrayIterator, nested Aggregates and Generators, with send and the inner return value; each method's PHP errors; the closed and running refusals; the serialize refusal; the Iterator and Traversable brands. XT-runtime-58 covers: is_scalar; in_array loose, strict and errors; array_combine; array_filter with no callback, USE_KEY, USE_BOTH and the other-mode argument rule (modes 7 and -1); array_unique under SORT_STRING, SORT_REGULAR and SORT_NUMERIC with kept keys and the enum rule; the unported callable and flag errors. XT-runtime-59 covers range for ints, descending and negative steps, marked floats, digit strings, characters, mixed inputs, '' / null / true, the ValueError and TypeError messages, both size-limit messages and the JS TypeError for bytes of 0x80 or more. XT-runtime-60 covers iterator_to_array with and without preserve_keys (keys normalised from null, true and 1.7) and its errors; iterator_count; str_starts_with; substr; toPhpArray with mangled names; a fresh-process check of all exports, resolveClass('Generator') and the 24-entry classes map. XT-runtime-61 compares every probe.txt label with the runtime's JSON and checks that the label sets are equal. No consequence string cites an FR or AD token. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime: src/php/*, src/index.ts, the docs and tests/xaravel. Nothing imports @​xaravel/contracts (AD-2), and no stub, fake or hard-coded return stands in for another Component. The unported SORT_* flags and PHP callable strings throw named errors and are documented as limits of the runtime's own functions. The test fixtures (Suit, Aggregate and others) are test-only classes that mirror the probe's PHP classes. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) shows no @​asyncRoot tag in any changed source file. Every new export is synchronous: Generator and its methods; keyed and yieldFrom (a sync generator function); the array, range and string functions; toPhpArray. None returns a Promise or awaits a callback. array_filter takes a callback but is a sync API, and DIV-1 requires such callbacks to be sync. So no tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"83d7f885fee3fff250f6b7ef14788ef148759bcc","base":"84ed0d59838667c5abfab7a1acd533c7ef9e4e3d","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T07:08:46.206Z","items":[{"id":"F-1","result":"n/a","note":"The action item has no Ported Test IDs, no Inventory rows and no stale_tests. The change adds only Xaravel Tests (XT-runtime-57..61), so no Ported Test exists to compare with Upstream source lines.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test or stale_tests file is added or changed, so there is no Upstream expected value to compare. The Xaravel Tests use assertSame on exact JSON and exact messages taken from the PHP 8.5.11 probe record. assertStringContainsString appears only in Xaravel-only JS TypeError checks, which have no PHP counterpart.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test exists, so there is no Upstream assertion count to compare and no assertion was removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip and touches no conformance expectations file.","findings":[]},{"id":"F-5","result":"n/a","note":"No added line carries an // adapted:DIV-<n>.<k> marker and no Expectations adapted field is set. DIV-12.18 is cited only in docs and docblocks as the rule the runtime implements: keyed(k, v) and yield* yieldFrom(...), with Generator providing current, key, next, valid, send, rewind and getReturn. That matches the clause text.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no assigned Oracle request and no added, changed or base error fixture. The tests rely on the committed PHP probe record, not on Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each consequence string with its test body. XT-runtime-57 checks: automatic keys (gen.auto_keys, negative_then_auto); the PHP_INT_MAX wrap; that a key from yieldFrom never moves the counter (yieldFrom.array gives [1,2] after keys 5 and 6); yield from over arrays, ArrayIterator, nested Aggregates and Generators, with send and the inner return value; each method's PHP errors; the closed and running refusals; the serialize refusal; the Iterator and Traversable brands. XT-runtime-58 covers: is_scalar; in_array loose, strict and errors; array_combine; array_filter with no callback, USE_KEY, USE_BOTH and the other-mode argument rule (modes 7 and -1); array_unique under SORT_STRING, SORT_REGULAR and SORT_NUMERIC with kept keys and the enum rule; the unported callable and flag errors. XT-runtime-59 covers range for ints, descending and negative steps, marked floats, digit strings, characters, mixed inputs, '' / null / true, the ValueError and TypeError messages, both size-limit messages and the JS TypeError for bytes of 0x80 or more. XT-runtime-60 covers iterator_to_array with and without preserve_keys (keys normalised from null, true and 1.7) and its errors; iterator_count; str_starts_with; substr; toPhpArray with mangled names; a fresh-process check of all exports, resolveClass('Generator') and the 24-entry classes map. XT-runtime-61 compares every probe.txt label with the runtime's JSON and checks that the label sets are equal. No consequence string cites an FR or AD token.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime: src/php/*, src/index.ts, the docs and tests/xaravel. Nothing imports @xaravel/contracts (AD-2), and no stub, fake or hard-coded return stands in for another Component. The unported SORT_* flags and PHP callable strings throw named errors and are documented as limits of the runtime's own functions. The test fixtures (Suit, Aggregate and others) are test-only classes that mirror the probe's PHP classes.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) shows no @asyncRoot tag in any changed source file. Every new export is synchronous: Generator and its methods; keyed and yieldFrom (a sync generator function); the array, range and string functions; toPhpArray. None returns a Promise or awaits a callback. array_filter takes a callback but is a sync API, and DIV-1 requires such callbacks to be sync. So no tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime/php` and the package root export `keyed`, `yieldFrom`, `Generator` and `KeyedYield` (DIV-12.18, ESC-14.1-5). Under their PHP names they also export `is_scalar`, `in_array`, `array_combine`, `array_filter`, `array_unique`, `range`, `iterator_to_array`, `iterator_count`, `str_starts_with`, `substr`, the `ARRAY_FILTER_*` and `SORT_*` constants, and `toPhpArray` (ESC-14.1-6). Each is a port of PHP 8.5.11's C source in coercive mode, checked against a PHP probe.

**Files.**
- `packages/runtime/src/php/keyed.ts`: the `KeyedYield` marker, `keyed`, and the delegated marker.
- `packages/runtime/src/php/Generator.ts`: `Generator` (PHP's generator protocol) and `yieldFrom`.
- `packages/runtime/src/php/traverse.ts`: PHP's traversal of a Traversable, with the `getIterator()` errors and the cycle refusal.
- `packages/runtime/src/php/phpArguments.ts`: coercive parameters and their `TypeError` messages.
- `packages/runtime/src/php/identical.ts`: `===`.
- `packages/runtime/src/php/zendSort.ts`: the `zend_sort` port.
- `packages/runtime/src/php/arrayFunctions.ts`, `range.ts`, `stringFunctions.ts`: the functions.
- `packages/runtime/src/php/throwableArguments.ts`: three internal coercions exported for `phpArguments.ts`. No behaviour change.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: the exports.
- `packages/runtime/docs/php-functions.md` (new) and `README.md`: the page and its link.
- `packages/runtime/tests/xaravel/php-functions.test.ts`, `php-functions.probe.php` and `php-functions.probe.txt`: XT-runtime-57..61, with the PHP 8.5.11 evidence.

**Review.** 36 findings. 25 were patched: 4 medium, 21 low. 3 were deferred, listed in frontmatter `deferred`: the `looseEquals` / `spaceship` enum gap, the matrix's `array_filter` row wording, and the aggregate-cycle message. These were rejected:
- the entries-less Traversable (it breaks the interface, so failing loudly is correct);
- nested-array aliasing (AD-9 arrays are references, and ports copy with `valueCopy`);
- the enum order counter (an identity order, not per-request state);
- 8.3 versus 8.5.11 (8.5.11 keeps 8.3's `range` rules, and the Oracle runs 8.5.11);
- contracts untouched (no new token);
- the additions beyond the list (each serves a listed export);
- process items not visible in the diff (run and recorded here).

Before review, a `stdClass` property-comparison rule that contradicted AD-9.6 was removed.

**Follow-up review: recommended (true).** The first pass patched 4 medium entries. The unverified risk is how Collections' `==` and `<=>` behave on enum cases nested in arrays, which go through `looseEquals` / `spaceship` without PHP's enum handler (deferred).

**Verification.**
- `bun test packages/runtime`: 61 pass. `bun test packages/contracts`: 22 pass.
- `php -d error_reporting=0 php-functions.probe.php | diff - php-functions.probe.txt`: no output.
- `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime`: clean.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`. It also prints `[none] bun test exited 1 over 5 file(s)` with no difference, as the expected-failure lines allow.
- `bun run fidelity:review status --item epic-14-item-2-runtime-generators-functions --spec <this spec>`: `current`, 2 pass verdicts for tree `83d7f885fee3fff250f6b7ef14788ef148759bcc`.

**Residual risks.**
- `substr` and character `range` throw a JS `TypeError` where PHP would return bytes that JS cannot hold.
- `Generator::throw` and the other sort flags are not ported, and neither are callable strings or arrays.
- A dropped generator never runs its `finally`.
- The PHP 8.5.11 C sources were read from GitHub tag `php-8.5.11`, for reference only.
