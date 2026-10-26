---
title: 'Runtime PHP array functions, by-reference array functions, min/max, string and object helpers, identical, Random\Randomizer and SortDirection (epic-14-item-5-runtime-array-functions)'
type: 'feature'
created: '2026-10-26'
status: 'done'
review_loop_iteration: 2
followup_review_recommended: true
baseline_revision: 'a81aa01db1e4d94020452c51ce3869c68925bbb0'
context:
  - '{project-root}/decisions/MAINT-2026-10-26-story-14-2.md'
  - '{project-root}/decisions/ESC-14.2-1.md'
  - '{project-root}/decisions/MAINT-2026-10-26-runtime-builtins.md'
  - '{project-root}/decisions/DIV-9.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-retro-14-runtime-type-tests-functions.md'
warnings: ['oversized']
deferred:
  - summary: >-
      min(...$a) / max(...$a) with exactly two values take PHP 8.5's frameless two-argument form, where PHP's spread or callable call takes the variadic form.
    evidence: |-
      PHP compiles a direct two-argument call to ZEND_FRAMELESS_FUNCTION(min, 2), which keeps lhs only when it is strictly less, so min(1, 1.0) is 1.0; a spread or array_reduce($a, 'min') runs the variadic loop and keeps lhs on a tie (1). A JS function cannot tell a spread call from a direct one. The runtime takes the direct-call form, which Collections' min($count, $collectionCount) uses, and the docs state it. A ported spread call with a tied int/float pair would get the other operand.
    location: >-
      packages/runtime/src/php/arrayFunctions.ts minMax
    severity: medium
  - summary: >-
      property_exists on a class or class-string is false for a plain TS instance field that PHP would declare, unless the class records it in its PHP property table.
    evidence: |-
      A JS class shows no instance field before construction, so only static properties, prototype accessors and the Symbol.for('xaravel.php.properties') table are visible on the class side. An instance answers through its own properties. The docs list the limit.
    location: >-
      packages/runtime/src/php/objectFunctions.ts classHasProperty
    severity: low
---

<intent-contract>

## Intent

**Problem:** Story 14.2 (Collections retrieval, search and mutation) builds on PHP functions and builtins `@xaravel/runtime` does not export (ESC-14.2-1). The monitor approved option 1 under the runtime-builtins standing rule (`decisions/ESC-14.2-1.md`, route in `decisions/MAINT-2026-10-26-story-14-2.md`). The runtime half lands first, as action item `epic-14-item-5-runtime-array-functions`.

**Scope:** `packages/runtime/**` only (`packages/contracts` would change only for a token, and none is needed). The route is amendment 2026-10-22 of `decisions/MAINT-2026-10-16-unattended-orchestrator.md`. This spec and sprint status may change too.

**Approach:** `@xaravel/runtime/php` and the package root export, under PHP's names, ports of PHP 8.5.11's C source (`ext/standard/array.c`, `string.c`, `math.c`, `Zend/zend_builtin_functions.c`, `ext/random/randomizer.c`) in coercive typing mode:
- array functions `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search`, `array_flip`, `array_slice`, `array_reverse`, `array_intersect_key`, `array_intersect_assoc`;
- by-reference functions over a `Ref` (AD-9, DIV-9.2): `array_shift`, `array_pop`, `array_unshift`, `array_splice`, `asort`, `arsort`, with the sort flag constants `SORT_LOCALE_STRING`, `SORT_NATURAL` and `SORT_FLAG_CASE` beside the existing three;
- `min`, `max`, `str_contains`, `strlen`, `lcfirst`, `property_exists`, `method_exists`;
- `identical(a, b)` (the existing internal `===` port), and `is_numeric` / `is_float` as the existing `isNumeric` / `isFloat` function objects;
- the class `Random\Randomizer` with `pickArrayKeys`, and the pure AD-26 enum `SortDirection` (`Ascending`, `Descending`) of PHP 8.6 / symfony/polyfill-php86 v1.43.0.

## Boundaries & Constraints

**Always:**
- **Values and messages.** Every value, kept key, key order, exception class and message is PHP 8.5.11's as the host's `php` gives it (a new probe). PHP's warnings are not reproduced; the function returns PHP's value.
- **Values in and out.** `undefined` reads as `null` (AD-9). Arrays come in through `arrayParameter` (its `TypeError` messages) and go out through `arrayFromEntries`. Scalars are parsed with `phpArguments.ts`'s coercive parsers. Everything is synchronous.
- **Callbacks.** `array_any`, `array_all` and `array_find_key` take a non-null `callable`, accepted as `array_filter`'s `callbackParameter` accepts one (a function or an invokable object; DIV-9.13's `TypeError` for a PHP callable string or array). `null` throws PHP's `TypeError` `<fn>(): Argument #2 ($callback) must be a valid callback, no array or string given`. The callback gets `(value, key)`; its result is read with `isTrue`. They stop at the first decisive entry.
- **Comparisons.** `array_search` loose mode is `in_array`'s `==` (enum rule included) and strict mode is `identical`. `min` / `max` compare with `zend_compare` as `arrayFunctions.ts`'s `zendCompare` does, keeping the first of equal values.
- **Keys.** `array_slice` and `array_reverse` keep string keys always, and int keys only with `preserve_keys`, else renumber them from 0. `array_flip` skips a value that is no int or string. `array_intersect_key` keeps the first array's entries whose key is in every other array; `array_intersect_assoc` also needs `(string) value === (string) other` (PHP's `string_compare_function`, so an array value reads as `"Array"`, and an object without a `__toString` port throws `toPhpString`'s `Error`).
- **By reference.** The first argument is a `Ref` whose `value` is an AD-9 array; a `Ref` holding anything else throws PHP's `TypeError` `<fn>(): Argument #1 ($array) must be of type array, <type> given`, and a non-`Ref` throws a JS `TypeError` naming DIV-9.2. The new array is written back to `ref.value` (PHP's copy-on-write: no other holder of the old JS value sees a change).
  - `array_shift`, `array_unshift`, `array_splice` renumber int keys from 0 and keep string keys, as PHP; the written-back array goes through `arrayFromEntries`. `array_shift` / `array_pop` return the removed value or `null` on an empty array (leaving `ref.value` unchanged). `array_unshift` returns the new count. `array_splice($array, $offset, $length = null, $replacement = [])` returns the removed entries (int keys renumbered, string keys kept), reads a non-array replacement as `(array)` does (`null` is `[]`), and inserts the replacement's values only.
  - `array_pop` and `asort` / `arsort` keep PHP's next free index: for a `PhpArray` input the written-back array is a `PhpArray` whose next free index is the input's, lowered by one when `array_pop` removed the int key just below it (PHP's `nNextFreeElement` rule); a JS-array or plain-object input goes through `arrayFromEntries`, whose next free index is already PHP's.
  - `asort` / `arsort($array, $flags = SORT_REGULAR)` return `true` and sort by value keeping keys, stably, as PHP 8's `php_get_data_compare_func` does over `zendSort`: `SORT_REGULAR` is `array_unique`'s regular comparator (`php_array_data_compare_unstable_i`), `SORT_NUMERIC` the float comparison, `SORT_STRING` byte comparison of the string casts, `| SORT_FLAG_CASE` ASCII case-folded, `SORT_NATURAL` a port of `strnatcmp_ex` (with `SORT_FLAG_CASE` folding), and `SORT_LOCALE_STRING` the C locale's `strcoll`, which is byte comparison. Ties keep their original order; `arsort` reverses the comparison, not the tie order.
- **Strings.** `str_contains` and `strlen` take PHP `string` parameters; `strlen` counts UTF-8 bytes; `lcfirst` lowers an ASCII `A`-`Z` first byte only. A lone surrogate throws `stringFunctions.ts`'s JS `TypeError`.
- **min / max.** One argument must be an array with at least one element: else PHP's `TypeError` `min(): Argument #1 ($value) must be of type array, <type> given` or `ValueError` `min(): Argument #1 ($value) must contain at least one element`. Two or more arguments compare the arguments. No argument throws PHP's `ArgumentCountError` `min() expects at least 1 argument, 0 given`.
- **property_exists / method_exists.** `$object_or_class` is an object, a class constructor, a contract token or a class-string resolved through the Registry (`lookUpName`); a string naming nothing gives `false`, and any other type throws PHP's `TypeError` `<fn>(): Argument #1 ($object_or_class) must be of type object|string, <type> given`. `$property` / `$method` are PHP `string` parameters.
  - `property_exists`: for an object, an own string-keyed property, or an accessor on its prototype chain below `Object.prototype`; for a class, a static own property on its class chain or an accessor on its prototype chain. A token has none. Case-sensitive, as PHP.
  - `method_exists`: `findMethod`'s rules (prototype chain, then static chain), matched exactly first and then case-insensitively, as PHP method names are; `__toString` is the AD-26 `toString()` port (`stringPort`), and a closure has PHP's `Closure` methods as `is_callable` lists them. For a token, its recorded methods and its parents'.
- **identical.** `identical(a, b)` is PHP's `===` over AD-9: same type and value, arrays by ordered keys and identical values, objects by identity. The existing module is exported unchanged.
- **Random\Randomizer.** Registered as `Random\Randomizer`. `new Randomizer()` uses a secure engine (`crypto.getRandomValues`). `pickArrayKeys($array, $num)` returns `num` distinct keys in the array's order, each subset equally likely; PHP's `ValueError`s `Random\Randomizer::pickArrayKeys(): Argument #1 ($array) must not be empty` and `… Argument #2 ($num) must be between 1 and the number of elements in argument #1 ($array)`. The PHP sequence for a given engine seed is not reproduced (no engine is ported).
- **SortDirection.** Registered as `SortDirection`: a frozen instance per case, `name` `Ascending` / `Descending`, `cases()` in that order, no `backingType`, so `enumExists('SortDirection')` and `x instanceof UnitEnum` hold.
- **Tests.** New XT cases use `xaravelTest` and `@xaravel/assert`. A PHP probe records every PHP-derived value; a recompute case checks every probe label with the runtime, as XT-runtime-67 does. A fresh-process case checks that the root and `@xaravel/runtime/php` export each new name as the same object and that `resolveClass('Random\\Randomizer')` and `resolveClass('SortDirection')` find the classes.

**Never:**
- Change any existing export or behaviour (`array_unique`'s unported flags stay unported; `isNumeric`, `isFloat` and `identical` are re-exported, not changed).
- Import `@xaravel/contracts` from the runtime (AD-2), or add a contract token.
- Touch `conformance/expectations/**`, `decisions/**`, PORTING.md, `AGENTS.md`, or any package other than runtime.
- Port the other `Randomizer` methods, its engines or its `engine` property, or a locale for `SORT_LOCALE_STRING`; each limit is in the docs. Passing an engine to `new Randomizer(...)` throws a JS `TypeError` naming the limit.
- Add a DIV clause, or change an existing assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| any / all / find_key | `[1,2,3]` with `v > 1`, `v > 0`, `v > 5`; `{a:1,b:2}` with a key test; `[]` | PHP's booleans (`array_all([])` true, `array_any([])` false); `array_find_key` the first matching key or `null`; the callback stops at the first decisive entry | `null` callback: PHP's `TypeError`; a callable string: DIV-9.13 `TypeError`; a non-array: `arrayParameter`'s `TypeError` |
| first / last | `[]`, `[1,2]`, `{x:1,y:2}`, a `PhpArray` `{5:'a', 'k':'b'}` | `null`, `1`/`2`, `1`/`2`, `'a'`/`'b'` | non-array: `TypeError` |
| search | `'1'` in `[0,1,'1']` loose and strict; `null` in `[0]`; missing value | `1`, `2`, `0`, `false` | non-bool strict coerces as PHP's `bool` parameter |
| flip | `['a','b',1, 1.5, true]` | `{a:0,b:1,1:2}` (float and bool skipped) | none |
| slice / reverse | `[1,2,3,4]` offset `1`/`-2`, length `2`/`-1`/`null`, `preserve_keys` both; mixed string/int keys | PHP's arrays and keys | non-int offset: `TypeError` |
| intersect | `array_intersect_key({a:1,b:2,c:3},{a:0,c:0})`; `array_intersect_assoc({a:'1',b:2},{a:1,b:'3'})`; one argument; an array value | `{a:1,c:3}`; `{a:'1'}`; the array itself; arrays compare as `"Array"` | non-array: `TypeError` naming the argument number |
| shift / pop / unshift | `Ref([1,2,3])`, `Ref({5:'a',x:'b',9:'c'})`, `Ref([])`; `array_unshift(Ref([3]), 1, 2)` | removed value and PHP's renumbered array; `null` on empty; `3` and `[1,2,3]`; pop then push on a `PhpArray` lands where PHP's lands | `Ref(1)`: PHP's `TypeError`; a non-`Ref`: JS `TypeError` |
| splice | offsets `1`, `-1`, lengths `null`/`0`/`-1`, replacement array, scalar, `null`; string keys in the input | PHP's removed entries and remaining array | non-int offset: `TypeError` |
| asort / arsort | mixed ints and numeric strings under `SORT_REGULAR`; `SORT_NUMERIC`; `SORT_STRING`; `SORT_STRING \| SORT_FLAG_CASE`; `SORT_NATURAL` (`img12`, `img10`, `IMG2`) with and without case; equal values (stability); enum cases | PHP's key order, `true` | non-int flags: `TypeError` |
| min / max | `min(2, '10', 3.5)`, `max([1, '5', 4])`, `min('apple', 'banana')`, `max([1,2],[1,3])`, equal values `min(0, '0')` (first kept), `max('abc', 0)` | PHP's results and types | `min()`: `ArgumentCountError` `min() expects at least 1 argument, 0 given`; `min(1)`: `TypeError`; `min([])`: `ValueError` |
| strings | `str_contains('abc','')`, `('abc','bc')`, `strlen('héllo')`, `strlen(12.5)`, `lcfirst('ABC')`, `lcfirst('Élan')` | `true`, `true`, `6`, `4`, `'aBC'`, unchanged | an array: `TypeError` |
| property / method exists | an object with an own field, a getter, a static; a class-string; an unknown class-string; a method in a parent; `'FOO'` for `foo`; `'__toString'` with and without a `toString` port; a token's method | PHP's booleans | `property_exists(1, 'x')`: `TypeError` |
| identical / aliases | `identical([1,2],[1,2])`, `identical({a:1,b:2},{b:2,a:1})`, `identical(1, float(1))`; `is_numeric`, `is_float` | `true`, `false`, `false`; `=== isNumeric`, `=== isFloat` | none |
| Randomizer | `pickArrayKeys({a:1,b:2,c:3}, 2)` many times; `num` equal to count; `pickArrayKeys([], 1)`; `num` `0` / `4` | 2 distinct keys in array order, every pair seen; all keys | PHP's `ValueError`s |
| SortDirection | `SortDirection.Ascending.name`, `cases()`, `enumExists('SortDirection')`, `instanceof UnitEnum` / `BackedEnum` | `'Ascending'`, both in order, `true`, `true` / `false` | none (the constructor is private and the cases frozen, as `Mode.ts` does) |

</intent-contract>

## Code Map

- `packages/runtime/src/php/arrayFunctions.ts`: the PHP-name array functions. `in_array` :54 and `zendEquals` :196 (loose search), `zendCompare` :186, `regularCompare` :205 and `numericCompare` :218 (the `SORT_REGULAR` / `SORT_NUMERIC` comparators), `SORT_FLAG_CASE` :40 (internal today), `callbackParameter` :91 (callback check), `arrayParameter` use throughout. New functions go here or in a new `arrayRefFunctions.ts` for the by-reference ones.
- `packages/runtime/src/php/zendSort.ts`: `zendSort` :203; `asort` sorts buckets `{key, value, index}` with the index as the stable tie-break.
- `packages/runtime/src/php/identical.ts`: `identical` :62, internal today; its header must stop saying it is not exported.
- `packages/runtime/src/php/PhpArray.ts`: `#nextFree` :105, `copy()` :165, `delete()` :142 (never lowers next free), `arrayFromEntries` :209. Add an internal (module-exported, not package-exported) way to build a `PhpArray` with a given next free index for `array_pop` / `asort`.
- `packages/runtime/src/php/Ref.ts`: the `Ref` box.
- `packages/runtime/src/php/stringFunctions.ts`: `wellFormed`, `utf8` from `mangle.ts`, `str_starts_with` :32 as the pattern for `str_contains`, `strlen`, `lcfirst`.
- `packages/runtime/src/php/scalarString.ts`: `stringPort` :12 for `__toString`.
- `packages/runtime/src/php/reflectionTargets.ts`: `findMethod` :82, `classChain`, `registeredName`.
- `packages/runtime/src/php/typeTests.ts`: `CLOSURE_METHODS` :174, `isClassConstructor` (via `Closure.ts`), class-string resolution for `is_a`.
- `packages/runtime/src/registry/registry.ts`: `lookUpName`, `isContractToken`, `registerClass`.
- `packages/runtime/src/php/phpInterface.ts`: `CONTRACT_METHODS` / `CONTRACT_PARENTS` symbols (`Symbol.for`), read for a token's methods.
- `packages/runtime/src/php/classExistence.ts`: `isEnumClass`, `isEnumCase`; `packages/mockery/src/JMac/Testing/Engine/Mode.ts` (read-only) is the AD-26 pure-enum pattern.
- `packages/runtime/src/php/PhpFloat.ts` `isFloat` :43, `isNumeric.ts` `isNumeric` :13: aliased, unchanged.
- `packages/runtime/src/php/phpArguments.ts`: `stringParameter`, `intParameter`, `nullableIntParameter`, `boolParameter`, `arrayParameter` :140, `argumentTypeError` :20.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: export lists. XT-runtime-37 (`tests/xaravel/docs.test.ts`) needs every exported name in backticks under `docs/`.
- `packages/runtime/tests/xaravel/php-type-tests.{test.ts,probe.php,probe.txt}`: the probe and recompute pattern to copy (XT-runtime-67).
- `conformance/upstream/framework/src/Illuminate/Collections/Arr.php` :997 (`pickArrayKeys`), `Collection.php` :1619 (`asort` / `arsort` with `SortDirection`): read-only callers.

## Tasks & Acceptance

**Execution:**
- `packages/runtime/src/php/arrayFunctions.ts`: `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search`, `array_flip`, `array_slice`, `array_reverse`, `array_intersect_key`, `array_intersect_assoc`, `min`, `max`, and exported `SORT_LOCALE_STRING`, `SORT_NATURAL`, `SORT_FLAG_CASE` (the existing internal bigint stays as it is used).
- `packages/runtime/src/php/arrayRefFunctions.ts` (new): `array_shift`, `array_pop`, `array_unshift`, `array_splice`, `asort`, `arsort`, and the `strnatcmp_ex` port.
- `packages/runtime/src/php/PhpArray.ts`: the internal next-free helper.
- `packages/runtime/src/php/stringFunctions.ts`: `str_contains`, `strlen`, `lcfirst`.
- `packages/runtime/src/php/objectFunctions.ts` (new): `property_exists`, `method_exists`.
- `packages/runtime/src/php/Randomizer.ts` (new): `Randomizer`, `registerClass('Random\\Randomizer', Randomizer)`.
- `packages/runtime/src/php/SortDirection.ts` (new): the enum, `registerClass('SortDirection', SortDirection)`.
- `packages/runtime/src/php/identical.ts`: header comment only.
- `packages/runtime/src/php/index.ts`, `src/index.ts`: export every new name, `identical`, and `isNumeric as is_numeric`, `isFloat as is_float`.
- `packages/runtime/docs/php-functions.md` (and `php-builtins.md` for the two classes): name every export and every limit listed under **Never** and in the boundaries.
- `packages/runtime/tests/xaravel/php-array-functions.probe.php` and `.txt`: the PHP evidence (`php -d error_reporting=0 php-array-functions.probe.php > php-array-functions.probe.txt`), declaring the polyfill's `SortDirection` stub for PHP 8.5.
- `packages/runtime/tests/xaravel/php-array-functions.test.ts`: XT-runtime-68 (array_any/all/find_key/first/last/search/flip), XT-runtime-69 (slice, reverse, intersect), XT-runtime-70 (by-reference functions and asort/arsort), XT-runtime-71 (min, max, strings, property/method_exists, identical and the aliases), XT-runtime-72 (Randomizer and SortDirection), XT-runtime-73 (probe recompute and fresh-process export check).

**Acceptance Criteria:**
- Given the matrix rows, when XT-runtime-68..73 run, then each row holds and every probe label matches PHP 8.5.11.
- Given a fresh process, when the root or `@xaravel/runtime/php` loads, then every new name is exported as the same object from both, and `resolveClass` finds `Random\Randomizer` and `SortDirection`.
- Given the change, when `bun run harness`, `bun run typecheck`, `bun run lint` and `bun run async-surface --check runtime` run, then there are no differences and no errors.
- Given the item, when `bun run fidelity:review status --item epic-14-item-5-runtime-array-functions --spec <this spec>` runs, then it prints `current`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 25 findings — high 0, medium 5, low 14, false 6, maybe-false 0
- findings:
  - `[low]` `reject` Blind: the Design Note says `arsort` swaps operands, the code negates — the code follows PHP's `php_array_reverse_*` (`* -1`) and the probe; the fix is to edit this spec.
  - `[low]` `reject` Blind: the Comparisons bullet and the `min(0, '0')` matrix row say the first equal value is kept — the code and probe follow PHP 8.5's frameless two-argument form (`'0'`), under the contract's "every value is PHP's" rule; the fix is to edit this spec. The deviation is recorded here and in the Auto Run Result.
  - `[low]` `reject` Blind: `SortDirection`'s constructor is public in TS — the runtime guard throws PHP's `Cannot instantiate enum SortDirection`; a `private` constructor needs a cast the registration scan rejects (XT-conformance-140..142).
  - `[medium]` `patch` Blind: `array_pop` / `asort` / `arsort` on a `PhpArray` always write back a `PhpArray`, not the AD-9 canonical form — patched: `arrayFromEntries` unless the kept next free index differs from the derived one.
  - `[low]` `reject` Blind: two sort-flag selectors (`compareFor`, `dataCompare`) — `array_unique`'s selector deliberately refuses unported flags and must not change (no other behaviour change); merging them adds branching for no observable gain.
  - `[false]` `reject` Blind: a function-valued static property counts as a method — this is DIV-9.14's rule ("a method exists when it is a function-valued member … on the constructor"), shared with `findMethod` and `is_callable`; `property_exists` true for a static property is PHP's answer.
  - `[low]` `reject` Blind: no test for a method found only on a parent contract token — the parent walk is a short loop over `CONTRACT_PARENTS`; the runtime's tokens have no parent-only method to test with, and building a fixture token registers global state for a cosmetic gap.
  - `[low]` `patch` Blind: the non-`Ref` message is asserted by prefix only — patched: full message with `(DIV-9.2)`.
  - `[low]` `patch` Blind: no NAN case pins `arsort`'s negation — patched: probe labels for NAN under `SORT_NUMERIC` / `SORT_REGULAR`, both directions.
  - `[low]` `reject` Blind: string comparators re-encode per comparison — PHP's comparators also cast per comparison (`zval_get_string`), and a cache would change how often a `__toString` port runs.
  - `[low]` `patch` Blind: misleading `invokable` test comment and name — patched: renamed and the comment split.
  - `[low]` `reject` Blind: `objectFunctions.ts` redeclares the contract symbols — they are `Symbol.for` keys, so the values are one; no caller can diverge.
  - `[false]` `reject` Blind: tracking state not updated — sprint status and this spec are updated at Finalize, after review.
  - `[medium]` `patch` Edge: a `PhpArray` input to `array_pop` / `asort` stays a `PhpArray` when the result is a list or all-string — same root cause as the Blind row above; same patch.
  - `[medium]` `patch` Edge: a lone surrogate in a sorted string becomes U+FFFD and compares equal — patched: the string functions' JS `TypeError`.
  - `[medium]` `defer` Edge: `min(...$a)` / `max(...$a)` with exactly two values take the frameless form, where PHP's spread call takes the variadic form (tie keeps `lhs`) — JS cannot tell a spread from a direct call; the docs state the two-argument rule. Recorded in `deferred`.
  - `[low]` `reject` Edge: `method_exists($o, '__construct')` is false for a class with a constructor — every JS class has a constructor, so the runtime cannot tell a declared one from the default; low confidence and no Collections caller.
  - `[medium]` `patch` Gap: `property_exists`'s PHP property table branch is untested — patched: a fixture class declaring a table-only property, as class-string, constructor and instance.
  - `[low]` `patch` Gap: `exactDouble` / mode switches in `min` / `max` unpinned — patched: probe labels with `9007199254740993` against NAN and a float, two and three arguments.
  - `[low]` `patch` Gap: `SORT_LOCALE_STRING`'s NUL truncation unpinned — patched: probe label with embedded NULs.
  - `[low]` `defer` Gap (other): `property_exists` on a class is false for a plain TS instance field PHP declares — inherent (a JS class shows no field before construction) and listed in the docs; recorded in `deferred`.
  - `[false]` `reject` Intent: by-reference calls on `$this->items` need a `Ref` that writes back to a property — the Story writes `const r = new Ref(this.items); …; this.items = r.value`; the item's scope is the runtime.
  - `[false]` `reject` Intent: `SortDirection` is not tested as a `match` operand — `identical(SortDirection.Ascending, SortDirection.Ascending)` is probed, which is what a ported `match` reads.
  - `[false]` `reject` Intent: seeded `Randomizer` sequences are not reproduced — the intent names `pickArrayKeys` only, and the limit is in the docs.
  - `[false]` `reject` Intent: the limits are in the docs, not a DIV record — each is a port limit of an unported part (engines, locales) the intent does not name, and no expected value or assertion changes.

### 2026-10-26 — Review pass (Fidelity Review re-run, loop 1)
- verdicts: 1 findings — high 0, medium 0, low 1, false 0, maybe-false 0
- findings:
  - `[low]` `patch` Fidelity reviewer 1 (F-7) at tree bfc1759f: XT-runtime-68 claims `array_find_key` stops at the first decisive entry, but only `array_any` / `array_all` record callback calls — patched: `any_all.stops` now also records `array_find_key([1, 2, 3], $record)`'s result and seen keys, probe re-recorded under PHP 8.5.11 (`1`, `[0,1]`).

## Design Notes

- **Write-back form.** PHP arrays are values, so a by-reference function builds a new AD-9 array and assigns `ref.value`, rather than mutating the JS object a caller may share. Only a `PhpArray` carries a next free index that can differ from "largest int key + 1", so only `array_pop` and the sorts, which PHP does not renumber, keep a `PhpArray` input as a `PhpArray` with PHP's index.
- **Stable sorts.** PHP 8's `asort` wraps the unstable comparator with `RETURN_STABLE_SORT` (ties by bucket order); `arsort` swaps the operands of the unstable comparator only.

## Verification

**Commands:**
- `bun test packages/runtime`: all pass.
- `cd packages/runtime/tests/xaravel && php -d error_reporting=0 php-array-functions.probe.php | diff - php-array-functions.probe.txt`: no output.
- `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime`: clean.
- `bun run harness`: `differ=0`.

## Fidelity Review

### Reviewer 1: pass at tree 178f1654bb47986afec80b799b8823314552b90d

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a81aa01db1e4d94020452c51ce3869c68925bbb0`, on 2026-10-26T18:52:47.347Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests, so no Upstream assertion mapping applies. |
| F-2: No expected value is weakened | pass | Compared the new test expectations with the supplied PHP probe results. Comparisons preserve exact JSON values, exception classes and messages; no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests or existing assertions are removed or changed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change adds no Expectations skip lines or Skip Reasons. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no assertion adaptation markers or Expectations adapted fields. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-68 through XT-runtime-73 with their bodies, helpers and PHP probes. They check the declared array, mutation, sorting, builtin, enum and export consequences with exact recorded results and additional runtime checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared all changed paths and implementations with the approved runtime scope. Changes remain in packages/runtime and introduce no implementation of another Component or contracts import. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the changed source declarations and retained tags with AD-6 and DIV-1. The added implementations are synchronous and require no async-root tags; no unsupported tag is retained. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no conformance/oracle-requests file. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"178f1654bb47986afec80b799b8823314552b90d","base":"a81aa01db1e4d94020452c51ce3869c68925bbb0","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T18:52:47.347Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests, so no Upstream assertion mapping applies.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new test expectations with the supplied PHP probe results. Comparisons preserve exact JSON values, exception classes and messages; no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests or existing assertions are removed or changed.","findings":[]},{"id":"F-4","result":"n/a","note":"The change adds no Expectations skip lines or Skip Reasons.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no assertion adaptation markers or Expectations adapted fields.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixtures relied upon by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-68 through XT-runtime-73 with their bodies, helpers and PHP probes. They check the declared array, mutation, sorting, builtin, enum and export consequences with exact recorded results and additional runtime checks.","findings":[]},{"id":"F-8","result":"pass","note":"Compared all changed paths and implementations with the approved runtime scope. Changes remain in packages/runtime and introduce no implementation of another Component or contracts import.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the changed source declarations and retained tags with AD-6 and DIV-1. The added implementations are synchronous and require no async-root tags; no unsupported tag is retained.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no conformance/oracle-requests file.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree 178f1654bb47986afec80b799b8823314552b90d

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a81aa01db1e4d94020452c51ce3869c68925bbb0`, on 2026-10-26T18:52:47.347Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests (XT-runtime-68..73) are added, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | n/a | No Ported Test is changed and the item lists no stale_tests. The new Xaravel Tests compare exactly (assertSame) against the recorded PHP 8.5.11 output in php-array-functions.probe.txt; no expected value is loosened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is changed and no stale_tests path is listed, so there are no assertions to count against Upstream. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | There is no // adapted:DIV marker and no Expectations adapted field. DIV-9.2 and DIV-9.13 are cited only in runtime docs and comments, as the existing Ref and callback rules. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) shows no assigned, changed or base Oracle fixture whose output is an error; the item relies on no Oracle fixture. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each consequence was compared with its test body. XT-68: assertProbed covers any_all, any_all.stops (stops at the first decisive entry, keys passed), find_key, callbacks.errors (null refused), first_last, search (loose and strict) and flip, plus checks for the unported callable forms. XT-69: slice, reverse, intersect_key, intersect_assoc and their error labels. XT-70: shift, pop, unshift, splice and refs.errors with append-after records (next free index), sorts under every listed flag in both directions with stable ties (STABLE, BIG), sorts.enum, a JS TypeError for a non-Ref argument, the write-back leaving the old value unchanged, and array_pop's PhpArray push landing at 7. XT-71: min_max (array, 2-arg and 3+-arg forms, NAN), min_max.errors (ArgumentCountError, TypeError, ValueError), strings, property_exists, method_exists, object.errors, identical, the is_numeric/is_float identity, and the class/token forms. XT-72: randomizer draws (every pair, all singles, array order), the error messages, the engine refused, and SortDirection's registration, cases, UnitEnum-not-BackedEnum and frozen instances. XT-73: every probe label recomputed, the label sets equal, and a fresh-process export identity check. Sample traces through the code (min/max NAN, array_pop next free index, stable arsort) agree with the recorded PHP output. No consequence cites an FR/AD.k token; XT-72's bare AD-26 mention matches the enum shape the test checks. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every code change is under packages/runtime, in the action item's scope (runtime, contracts only for a token). Randomizer with only pickArrayKeys and the SortDirection polyfill enum are the builtins ESC-14.2-1 approves, with the unported parts documented. The other edits are internal exports and refactors that keep existing behaviour: zendCompare, regularCompare, numericCompare and CLOSURE_METHODS now exported, the SORT_FLAG_CASE rename, callbackParameter's nullable flag defaulting to the old behaviour, and the PhpArray static block. No stub or fake of another Component; the runtime imports nothing from contracts. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tag in any touched file after the change, and every new export (array functions, by-reference functions, sorts, min/max, string and object functions, identical, Randomizer, SortDirection) is synchronous and does no IO. The callbacks taken by array_any, array_all and array_find_key go to sync APIs, which DIV-1 requires to be sync, so no tag is missing. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"178f1654bb47986afec80b799b8823314552b90d","base":"a81aa01db1e4d94020452c51ce3869c68925bbb0","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T18:52:47.347Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and changes no Ported Test; only Xaravel Tests (XT-runtime-68..73) are added, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test is changed and the item lists no stale_tests. The new Xaravel Tests compare exactly (assertSame) against the recorded PHP 8.5.11 output in php-array-functions.probe.txt; no expected value is loosened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is changed and no stale_tests path is listed, so there are no assertions to count against Upstream.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"There is no // adapted:DIV marker and no Expectations adapted field. DIV-9.2 and DIV-9.13 are cited only in runtime docs and comments, as the existing Ref and callback rules.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) shows no assigned, changed or base Oracle fixture whose output is an error; the item relies on no Oracle fixture.","findings":[]},{"id":"F-7","result":"pass","note":"Each consequence was compared with its test body. XT-68: assertProbed covers any_all, any_all.stops (stops at the first decisive entry, keys passed), find_key, callbacks.errors (null refused), first_last, search (loose and strict) and flip, plus checks for the unported callable forms. XT-69: slice, reverse, intersect_key, intersect_assoc and their error labels. XT-70: shift, pop, unshift, splice and refs.errors with append-after records (next free index), sorts under every listed flag in both directions with stable ties (STABLE, BIG), sorts.enum, a JS TypeError for a non-Ref argument, the write-back leaving the old value unchanged, and array_pop's PhpArray push landing at 7. XT-71: min_max (array, 2-arg and 3+-arg forms, NAN), min_max.errors (ArgumentCountError, TypeError, ValueError), strings, property_exists, method_exists, object.errors, identical, the is_numeric/is_float identity, and the class/token forms. XT-72: randomizer draws (every pair, all singles, array order), the error messages, the engine refused, and SortDirection's registration, cases, UnitEnum-not-BackedEnum and frozen instances. XT-73: every probe label recomputed, the label sets equal, and a fresh-process export identity check. Sample traces through the code (min/max NAN, array_pop next free index, stable arsort) agree with the recorded PHP output. No consequence cites an FR/AD.k token; XT-72's bare AD-26 mention matches the enum shape the test checks.","findings":[]},{"id":"F-8","result":"pass","note":"Every code change is under packages/runtime, in the action item's scope (runtime, contracts only for a token). Randomizer with only pickArrayKeys and the SortDirection polyfill enum are the builtins ESC-14.2-1 approves, with the unported parts documented. The other edits are internal exports and refactors that keep existing behaviour: zendCompare, regularCompare, numericCompare and CLOSURE_METHODS now exported, the SORT_FLAG_CASE rename, callbackParameter's nullable flag defaulting to the old behaviour, and the PhpArray static block. No stub or fake of another Component; the runtime imports nothing from contracts.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tag in any touched file after the change, and every new export (array functions, by-reference functions, sorts, min/max, string and object functions, identical, Randomizer, SortDirection) is synchronous and does no IO. The callbacks taken by array_any, array_all and array_find_key go to sync APIs, which DIV-1 requires to be sync, so no tag is missing.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: reject at tree bfc1759f8919c0c01c91ec7d52cb2d2491dca5d4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a81aa01db1e4d94020452c51ce3869c68925bbb0`, on 2026-10-26T19:03:29.804Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Tests, so there are no Upstream assertion sequences to compare. |
| F-2: No expected value is weakened | pass | Compared the new test expectations with the supplied PHP probe outputs; exact values and exception messages are retained, and no existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests or stale cross-component tests are changed, so no Upstream assertion is removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The diff contains no Expectations line set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change introduces no adapted assertion marker or Expectations adapted field. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory lists no Oracle error fixture relied upon by this action item. |
| F-7: Every Xaravel Test verifies the consequence it declares | fail | Compared XT-runtime-68 through XT-runtime-73 with their bodies and probe cases. XT-runtime-68 does not observe array_find_key's claimed callback short-circuiting. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the runtime/contracts action-item scope and ESC-14.2-1. All changes remain in runtime and add runtime-owned PHP behavior, with no implementation of another Component. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared the touched source declarations and tag inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous operations with no async Driver or permitted async-callback root requiring a tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No conformance/oracle-requests file changes, so no changed request inputs require comparison. |

Findings:

- **F-7** `packages/runtime/tests/xaravel/php-array-functions.test.ts`: XT-runtime-68 claims array_find_key stops at the first decisive entry, but find_key checks only returned keys; any_all.stops records calls only for array_any and array_all. Add an array_find_key callback-call trace or a callback that throws if invoked after the first match, and assert the trace/result.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"reject","tree":"bfc1759f8919c0c01c91ec7d52cb2d2491dca5d4","base":"a81aa01db1e4d94020452c51ce3869c68925bbb0","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T19:03:29.804Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Tests, so there are no Upstream assertion sequences to compare.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new test expectations with the supplied PHP probe outputs; exact values and exception messages are retained, and no existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests or stale cross-component tests are changed, so no Upstream assertion is removed.","findings":[]},{"id":"F-4","result":"n/a","note":"The diff contains no Expectations line set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change introduces no adapted assertion marker or Expectations adapted field.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory lists no Oracle error fixture relied upon by this action item.","findings":[]},{"id":"F-7","result":"fail","note":"Compared XT-runtime-68 through XT-runtime-73 with their bodies and probe cases. XT-runtime-68 does not observe array_find_key's claimed callback short-circuiting.","findings":[{"path":"packages/runtime/tests/xaravel/php-array-functions.test.ts","detail":"XT-runtime-68 claims array_find_key stops at the first decisive entry, but find_key checks only returned keys; any_all.stops records calls only for array_any and array_all. Add an array_find_key callback-call trace or a callback that throws if invoked after the first match, and assert the trace/result.","kind":"defect"}]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the runtime/contracts action-item scope and ESC-14.2-1. All changes remain in runtime and add runtime-owned PHP behavior, with no implementation of another Component.","findings":[]},{"id":"F-9","result":"pass","note":"Compared the touched source declarations and tag inventory with AD-6 and DIV-1. They retain no asyncRoot tags and introduce synchronous operations with no async Driver or permitted async-callback root requiring a tag.","findings":[]},{"id":"F-10","result":"n/a","note":"No conformance/oracle-requests file changes, so no changed request inputs require comparison.","findings":[]}],"prior":[]}
```

### Reviewer 2: pass at tree bfc1759f8919c0c01c91ec7d52cb2d2491dca5d4

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a81aa01db1e4d94020452c51ce3869c68925bbb0`, on 2026-10-26T19:03:29.804Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs, and the diff adds or changes no Ported Test. It only adds Xaravel Tests XT-runtime-68 to 73, so there are no Upstream assertions to compare. |
| F-2: No expected value is weakened | pass | There are no Ported Tests and no stale_tests files, so no existing expected value is weakened. The new tests compare each probe label with assertSame against its exact recorded PHP 8.5.11 JSON. I spot-checked these against PHP semantics and all agree: array_flip key placement, array_pop's nNextFreeElement handling, the two-argument min/max form, and the identical/is_float results. Partial-message checks (assertStringContainsString) appear only in Xaravel-only cases: the Ref requirement, lone surrogates and the engine refusal. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is added or changed, so there is no Upstream assertion count to compare. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | The change sets no Expectations line to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | The change adds no '// adapted:DIV-<n>.<k>' marker and no Expectations adapted field. DIV-9.2 and DIV-9.13 are cited only in docs, error messages and comments. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, assigned or changed. The tests use a PHP probe record, not Oracle fixtures. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Each test body covers its consequence string. XT-68: the probe labels any_all, any_all.stops (value and key passed, stop at the first decisive entry), find_key, callbacks.errors (non-null required), first_last, search (loose and strict) and flip. XT-69: slice, reverse with preserve_keys, intersect_key and intersect_assoc, and their messages. XT-70: shift, pop, unshift and splice through a Ref with write-back; pop's kept next free index (also checked directly with a later push landing on key 7); sorts under all six flags; stability (STABLE). XT-71: min_max in the array, two-argument and three-argument forms with the error classes; strings; property_exists and method_exists over objects, classes, class-strings and tokens; identical; the is_numeric/is_float identity. XT-72: the subset spread across 300 draws, order, messages, engine refusal, and SortDirection as a UnitEnum but not a BackedEnum. XT-73: every probe label recomputed and the label sets equal, plus the fresh-process export and resolution check. The only cited rule is AD-26 (no AD-<n>.<k> token). SortDirection is built as AD-26's enum row describes, with static instances and cases(); from/tryFrom are absent because it is a pure enum. |
| F-8: No stub, fake or partial implementation of another Component | pass | Every changed file is under packages/runtime, which is within the item's scope, and packages/contracts is untouched. The new code ports PHP builtins named in ESC-14.2-1. Randomizer ports only pickArrayKeys and refuses an engine, a limit documented as not ported. No stub, fake or hard-coded behaviour of another component was added. |
| F-9: Every `@asyncRoot` tag is true | n/a | Evidence (g) shows no @​asyncRoot tag in any changed source file after the change, and none is added. Every new export is synchronous and returns no Promise or thenable. The callback-taking functions (array_any, array_all, array_find_key) are sync array APIs whose callbacks DIV-1 requires to be sync, as Collection map's are, so they need no tag. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | The change touches no file under conformance/oracle-requests/. |

Findings:

None.

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"bfc1759f8919c0c01c91ec7d52cb2d2491dca5d4","base":"a81aa01db1e4d94020452c51ce3869c68925bbb0","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T19:03:29.804Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs, and the diff adds or changes no Ported Test. It only adds Xaravel Tests XT-runtime-68 to 73, so there are no Upstream assertions to compare.","findings":[]},{"id":"F-2","result":"pass","note":"There are no Ported Tests and no stale_tests files, so no existing expected value is weakened. The new tests compare each probe label with assertSame against its exact recorded PHP 8.5.11 JSON. I spot-checked these against PHP semantics and all agree: array_flip key placement, array_pop's nNextFreeElement handling, the two-argument min/max form, and the identical/is_float results. Partial-message checks (assertStringContainsString) appear only in Xaravel-only cases: the Ref requirement, lone surrogates and the engine refusal.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is added or changed, so there is no Upstream assertion count to compare.","findings":[]},{"id":"F-4","result":"n/a","note":"The change sets no Expectations line to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"The change adds no `// adapted:DIV-<n>.<k>` marker and no Expectations adapted field. DIV-9.2 and DIV-9.13 are cited only in docs, error messages and comments.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, assigned or changed. The tests use a PHP probe record, not Oracle fixtures.","findings":[]},{"id":"F-7","result":"pass","note":"Each test body covers its consequence string. XT-68: the probe labels any_all, any_all.stops (value and key passed, stop at the first decisive entry), find_key, callbacks.errors (non-null required), first_last, search (loose and strict) and flip. XT-69: slice, reverse with preserve_keys, intersect_key and intersect_assoc, and their messages. XT-70: shift, pop, unshift and splice through a Ref with write-back; pop's kept next free index (also checked directly with a later push landing on key 7); sorts under all six flags; stability (STABLE). XT-71: min_max in the array, two-argument and three-argument forms with the error classes; strings; property_exists and method_exists over objects, classes, class-strings and tokens; identical; the is_numeric/is_float identity. XT-72: the subset spread across 300 draws, order, messages, engine refusal, and SortDirection as a UnitEnum but not a BackedEnum. XT-73: every probe label recomputed and the label sets equal, plus the fresh-process export and resolution check. The only cited rule is AD-26 (no AD-<n>.<k> token). SortDirection is built as AD-26's enum row describes, with static instances and cases(); from/tryFrom are absent because it is a pure enum.","findings":[]},{"id":"F-8","result":"pass","note":"Every changed file is under packages/runtime, which is within the item's scope, and packages/contracts is untouched. The new code ports PHP builtins named in ESC-14.2-1. Randomizer ports only pickArrayKeys and refuses an engine, a limit documented as not ported. No stub, fake or hard-coded behaviour of another component was added.","findings":[]},{"id":"F-9","result":"n/a","note":"Evidence (g) shows no @asyncRoot tag in any changed source file after the change, and none is added. Every new export is synchronous and returns no Promise or thenable. The callback-taking functions (array_any, array_all, array_find_key) are sync array APIs whose callbacks DIV-1 requires to be sync, as Collection map's are, so they need no tag.","findings":[]},{"id":"F-10","result":"n/a","note":"The change touches no file under conformance/oracle-requests/.","findings":[]}],"prior":[]}
```

### Reviewer 1: pass at tree 98a5d11f5f879400ed8f7e9f54781bd29dff4ce4

Reviewed by `codex` (model `gpt-6.1-sol`) for a `claude` loop, against base `a81aa01db1e4d94020452c51ce3869c68925bbb0`, on 2026-10-26T19:07:37.878Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | No Ported Tests are assigned, added or changed. |
| F-2: No expected value is weakened | pass | Compared the new expectations with the supplied PHP probe outputs: values and exception class/message strings are compared exactly. No existing expectation is weakened. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Tests or existing assertions are removed. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip. |
| F-5: Every `adapted` marker matches its clause | n/a | No assertion adaptation marker or Expectations adapted field is added or changed. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | The supplied fixture inventory identifies no Oracle error fixture relied on by this item. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared XT-runtime-68 through XT-runtime-73 with their bodies, helpers and PHP probes. They verify the declared results, keys, errors, mutation behavior, sorting, enum shape and exports. The array_find_key call trace now verifies short-circuiting. |
| F-8: No stub, fake or partial implementation of another Component | pass | Compared changed paths and implementations with the action item's runtime scope and ESC-14.2-1. All changes remain in packages/runtime and implement its authorized builtins; no other Component is faked. |
| F-9: Every `@asyncRoot` tag is true | pass | Compared changed source declarations with AD-6 and DIV-1. No touched file carries an asyncRoot tag, and the added implementations are synchronous with no async-root IO or callback requiring one. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No Oracle request file changes. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-array-functions.test.ts`: XT-runtime-68 claims array_find_key stops at the first decisive entry, but find_key checks only returned keys; any_all.stops records calls only for array_any and array_all. Add an array_find_key callback-call trace or a callback that throws if invoked after the first match, and assert the trace/result. **fixed**: any_all.stops now resets seen, calls array_find_key([1, 2, 3], record), and compares both its result and trace against PHP's recorded 1 and [0, 1], proving no callback runs after the first match.

```json
{"kind":"fidelity-verdict","reviewer":1,"verdict":"pass","tree":"98a5d11f5f879400ed8f7e9f54781bd29dff4ce4","base":"a81aa01db1e4d94020452c51ce3869c68925bbb0","cli":"codex","model":"gpt-6.1-sol","loop_cli":"claude","fallback":null,"date":"2026-10-26T19:07:37.878Z","items":[{"id":"F-1","result":"n/a","note":"No Ported Tests are assigned, added or changed.","findings":[]},{"id":"F-2","result":"pass","note":"Compared the new expectations with the supplied PHP probe outputs: values and exception class/message strings are compared exactly. No existing expectation is weakened.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Tests or existing assertions are removed.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip.","findings":[]},{"id":"F-5","result":"n/a","note":"No assertion adaptation marker or Expectations adapted field is added or changed.","findings":[]},{"id":"F-6","result":"n/a","note":"The supplied fixture inventory identifies no Oracle error fixture relied on by this item.","findings":[]},{"id":"F-7","result":"pass","note":"Compared XT-runtime-68 through XT-runtime-73 with their bodies, helpers and PHP probes. They verify the declared results, keys, errors, mutation behavior, sorting, enum shape and exports. The array_find_key call trace now verifies short-circuiting.","findings":[]},{"id":"F-8","result":"pass","note":"Compared changed paths and implementations with the action item's runtime scope and ESC-14.2-1. All changes remain in packages/runtime and implement its authorized builtins; no other Component is faked.","findings":[]},{"id":"F-9","result":"pass","note":"Compared changed source declarations with AD-6 and DIV-1. No touched file carries an asyncRoot tag, and the added implementations are synchronous with no async-root IO or callback requiring one.","findings":[]},{"id":"F-10","result":"n/a","note":"No Oracle request file changes.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-array-functions.test.ts","detail":"XT-runtime-68 claims array_find_key stops at the first decisive entry, but find_key checks only returned keys; any_all.stops records calls only for array_any and array_all. Add an array_find_key callback-call trace or a callback that throws if invoked after the first match, and assert the trace/result.","fixed":true,"note":"any_all.stops now resets seen, calls array_find_key([1, 2, 3], record), and compares both its result and trace against PHP's recorded 1 and [0, 1], proving no callback runs after the first match."}]}
```

### Reviewer 2: pass at tree 98a5d11f5f879400ed8f7e9f54781bd29dff4ce4

Reviewed by `claude` (model `claude-opus-5-5`) for a `claude` loop, against base `a81aa01db1e4d94020452c51ce3869c68925bbb0`, on 2026-10-26T19:07:37.878Z.

| Item | Result | Note |
| --- | --- | --- |
| F-1: Assertions match Upstream | n/a | The action item assigns no Ported Test IDs and adds or changes no Ported Test; only Xaravel Tests (XT-runtime-68..73) are touched. |
| F-2: No expected value is weakened | n/a | No Ported Test with Upstream expected values is changed. The Xaravel Tests' expected values are PHP 8.5.11 probe outputs recorded in php-array-functions.probe.txt; nothing is weakened against an Upstream value, and there is no stale_tests path. |
| F-3: No assertion is removed without a DIV clause | n/a | No Ported Test is touched, so no Upstream assertion count applies. |
| F-4: Every new Skip Reason is justified and its precedence is right | n/a | No Expectations line is set to skip by this change. |
| F-5: Every `adapted` marker matches its clause | n/a | No // adapted:DIV marker or Expectations adapted field is added. DIV-9.2 and DIV-9.13 are cited only in comments and runtime messages, not as adaptation markers. |
| F-6: Every Oracle error fixture is the error Upstream's test expects | n/a | Evidence (c) lists no error fixture, either assigned or changed. |
| F-7: Every Xaravel Test verifies the consequence it declares | pass | Compared each consequence string with its body. XT-68: key-reading callbacks show the (value, key) call; any_all.stops traces the keys the callback sees for array_any, array_all and now array_find_key ([0,1] each); first_last, search (loose and strict, enum rule) and flip, with their messages, are checked against the PHP probe. XT-69: slice and reverse key handling with and without preserve_keys, and intersect_key/assoc, against the probe. XT-70: shift/pop/unshift/splice take a Ref and write back (Xaravel-only assertions); array_pop keeps a PhpArray's next free index (unset case in the pop probe, popRef.push gives 7); stable sorts (STABLE) under all six flags. XT-71: min/max with an array, two arguments and three or more, their errors, the string functions, property_exists/method_exists on objects, classes, class-strings and tokens, identical, and the aliases checked by assertSame. XT-72: pickArrayKeys returns distinct ordered keys and every pair turns up over 300 draws; engine refused; SortDirection registered, UnitEnum and not BackedEnum. XT-73: every probe label recomputed, label sets equal, fresh-process export identity and class resolution. No FR/AD-<n>.<k> token is cited; AD-26 is cited bare. |
| F-8: No stub, fake or partial implementation of another Component | pass | All changed source is in packages/runtime, the item's own scope; packages/contracts is untouched. No stub, fake or hard-coded behaviour of another Component is added. |
| F-9: Every `@asyncRoot` tag is true | pass | Evidence (g) lists no @​asyncRoot tag in any changed source file, and every new export (array functions, by-reference functions, sorts, min/max, string and object functions, Randomizer, SortDirection) is synchronous, does no Driver IO and takes no async callback. So no tag is missing and none is false. |
| F-10: Oracle requests match the Upstream test's inputs | n/a | No file under conformance/oracle-requests/ is changed. |

Findings:

None.

Findings of the latest reject, addressed (ESC-8.8-1):

- **P-1** (reviewer 1, F-7) `packages/runtime/tests/xaravel/php-array-functions.test.ts`: XT-runtime-68 claims array_find_key stops at the first decisive entry, but find_key checks only returned keys; any_all.stops records calls only for array_any and array_all. Add an array_find_key callback-call trace or a callback that throws if invoked after the first match, and assert the trace/result. **fixed**: PROBE_CASES['any_all.stops'] now resets seen and calls array_find_key([1,2,3], record) with the recording callback, then returns found and seen. The probe records [true,[0,1],false,[0,1],1,[0,1]]: array_find_key returns key 1 and the callback ran only for keys 0 and 1. XT-runtime-68 asserts this through assertProbed('any_all.stops').

```json
{"kind":"fidelity-verdict","reviewer":2,"verdict":"pass","tree":"98a5d11f5f879400ed8f7e9f54781bd29dff4ce4","base":"a81aa01db1e4d94020452c51ce3869c68925bbb0","cli":"claude","model":"claude-opus-5-5","loop_cli":"claude","fallback":null,"date":"2026-10-26T19:07:37.878Z","items":[{"id":"F-1","result":"n/a","note":"The action item assigns no Ported Test IDs and adds or changes no Ported Test; only Xaravel Tests (XT-runtime-68..73) are touched.","findings":[]},{"id":"F-2","result":"n/a","note":"No Ported Test with Upstream expected values is changed. The Xaravel Tests' expected values are PHP 8.5.11 probe outputs recorded in php-array-functions.probe.txt; nothing is weakened against an Upstream value, and there is no stale_tests path.","findings":[]},{"id":"F-3","result":"n/a","note":"No Ported Test is touched, so no Upstream assertion count applies.","findings":[]},{"id":"F-4","result":"n/a","note":"No Expectations line is set to skip by this change.","findings":[]},{"id":"F-5","result":"n/a","note":"No // adapted:DIV marker or Expectations adapted field is added. DIV-9.2 and DIV-9.13 are cited only in comments and runtime messages, not as adaptation markers.","findings":[]},{"id":"F-6","result":"n/a","note":"Evidence (c) lists no error fixture, either assigned or changed.","findings":[]},{"id":"F-7","result":"pass","note":"Compared each consequence string with its body. XT-68: key-reading callbacks show the (value, key) call; any_all.stops traces the keys the callback sees for array_any, array_all and now array_find_key ([0,1] each); first_last, search (loose and strict, enum rule) and flip, with their messages, are checked against the PHP probe. XT-69: slice and reverse key handling with and without preserve_keys, and intersect_key/assoc, against the probe. XT-70: shift/pop/unshift/splice take a Ref and write back (Xaravel-only assertions); array_pop keeps a PhpArray's next free index (unset case in the pop probe, popRef.push gives 7); stable sorts (STABLE) under all six flags. XT-71: min/max with an array, two arguments and three or more, their errors, the string functions, property_exists/method_exists on objects, classes, class-strings and tokens, identical, and the aliases checked by assertSame. XT-72: pickArrayKeys returns distinct ordered keys and every pair turns up over 300 draws; engine refused; SortDirection registered, UnitEnum and not BackedEnum. XT-73: every probe label recomputed, label sets equal, fresh-process export identity and class resolution. No FR/AD-<n>.<k> token is cited; AD-26 is cited bare.","findings":[]},{"id":"F-8","result":"pass","note":"All changed source is in packages/runtime, the item's own scope; packages/contracts is untouched. No stub, fake or hard-coded behaviour of another Component is added.","findings":[]},{"id":"F-9","result":"pass","note":"Evidence (g) lists no @asyncRoot tag in any changed source file, and every new export (array functions, by-reference functions, sorts, min/max, string and object functions, Randomizer, SortDirection) is synchronous, does no Driver IO and takes no async callback. So no tag is missing and none is false.","findings":[]},{"id":"F-10","result":"n/a","note":"No file under conformance/oracle-requests/ is changed.","findings":[]}],"prior":[{"id":"P-1","reviewer":1,"item":"F-7","path":"packages/runtime/tests/xaravel/php-array-functions.test.ts","detail":"XT-runtime-68 claims array_find_key stops at the first decisive entry, but find_key checks only returned keys; any_all.stops records calls only for array_any and array_all. Add an array_find_key callback-call trace or a callback that throws if invoked after the first match, and assert the trace/result.","fixed":true,"note":"PROBE_CASES['any_all.stops'] now resets seen and calls array_find_key([1,2,3], record) with the recording callback, then returns found and seen. The probe records [true,[0,1],false,[0,1],1,[0,1]]: array_find_key returns key 1 and the callback ran only for keys 0 and 1. XT-runtime-68 asserts this through assertProbed('any_all.stops')."}]}
```

## Auto Run Result

Status: done

**Summary.** `@xaravel/runtime` (the root and `/php`) gains, under PHP's names and with PHP 8.5.11's values and messages (ESC-14.2-1):
- `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search` (loose and strict), `array_flip`, `array_slice`, `array_reverse`, `array_intersect_key`, `array_intersect_assoc`, `min`, `max`;
- the by-reference `array_shift`, `array_pop`, `array_unshift`, `array_splice`, `asort` and `arsort` over a `Ref` (DIV-9.2), with `SORT_LOCALE_STRING`, `SORT_NATURAL` and `SORT_FLAG_CASE`;
- `str_contains`, `strlen`, `lcfirst`, `property_exists`, `method_exists`;
- `identical`, and `is_numeric` / `is_float` as the existing `isNumeric` / `isFloat`;
- `Random\Randomizer` with `pickArrayKeys`, and the pure AD-26 enum `SortDirection`.

**Files.**
- `packages/runtime/src/php/`: new `arrayRefFunctions.ts` (by-reference functions, `strnatcmp_ex` port), `objectFunctions.ts`, `Randomizer.ts`, `SortDirection.ts`; extended `arrayFunctions.ts`, `stringFunctions.ts`, `PhpArray.ts` (internal next-free helpers), `typeTests.ts` (shared `CLOSURE_METHODS`), `identical.ts` (header), `index.ts`.
- `packages/runtime/src/index.ts`: the exports.
- `packages/runtime/docs/php-functions.md`, `php-builtins.md`: every export and limit.
- `packages/runtime/tests/xaravel/php-array-functions.{test.ts,probe.php,probe.txt}`: XT-runtime-68..73 and the PHP 8.5.11 probe.

**Where the code follows PHP over this spec's wording.** `min` / `max` with two arguments take PHP 8.5's frameless form (`min(0, '0')` is `'0'`, as probed), and `arsort` negates the comparator as PHP's C source does (pinned by the NAN probe labels). Both are recorded in the triage log.

**Review.** Pass 1: 25 findings — 6 patch rows (medium 3 entries: write-back form, lone surrogates, property-table test; low 4), 2 deferred (recorded in `deferred`), 17 rejected with reasons in the triage log. Loop 1: one Fidelity F-7 finding patched (the `array_find_key` stop trace).

Fidelity Review: tree `178f1654`: both pass; tree `bfc1759f` (after patches): reviewer 1 reject (F-7), reviewer 2 pass; tree `98a5d11f`: both pass, status `current`.

**Follow-up review recommended: true.** Three medium entries were patched in pass 1. The unverified risk is the write-back form rule of `array_pop` / `asort` / `arsort` on a `PhpArray` (canonical form unless PHP's next free index differs): Story 14.2's `pop` / `shift` / `sortBy` tests will be its first real callers.

**Verification.**
- `bun test packages/runtime`: 73 pass.
- The probe re-runs byte for byte with the host's PHP 8.5.11.
- `bun run typecheck`, `bun run lint`, `bun run async-surface --check runtime`: clean.
- `bun run harness`: `SUMMARY variants=11 run=4 not-run=7 checked=21817 differ=0`.
- `bun run fidelity:review status --item epic-14-item-5-runtime-array-functions --spec <this spec>`: `current`.

**Residual risks.** The two deferred items (two-value spread `min` / `max`; `property_exists` on a class cannot see plain TS instance fields), and the documented limits: no Randomizer engines or other methods, C locale only for `SORT_LOCALE_STRING`, distinct enum cases under `SORT_REGULAR` ordered by first comparison.
