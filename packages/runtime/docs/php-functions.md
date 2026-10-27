# PHP generators and functions

The runtime ports PHP's `Generator`, the keyed yield a JS generator cannot write, and the PHP functions the Collections
core calls (ESC-14.1-5, ESC-14.1-6, action item `epic-14-item-2-runtime-generators-functions`), and PHP's type tests,
`instanceof` targets and the rest of the functions Collections calls (ESC-14.1-9, action item
`epic-14-item-3-runtime-type-tests-functions`), and the array, by-reference, sort, string and object functions Story
14.2 calls (ESC-14.2-1, action item `epic-14-item-5-runtime-array-functions`), and `is_null`, `uasort` and the string
comparisons `Collection::sortBy` calls (ESC-14.2-4, action item `epic-14-item-6-runtime-sort-string-functions`), and
the set, merge and replace functions, `array_pad`, `is_int`, `arrayUnion` and the PHP function-name resolver Story
14.4 calls (ESC-14.4-1, ESC-14.4-2, action item `epic-14-item-9-runtime-set-functions-callable-names`).
Everything here is exported from `@xaravel/runtime/php` and from the package root, under its PHP name, and is
synchronous. Each function ports PHP 8.5.11's C source (`ext/standard/array.c`, `ext/standard/string.c`,
`ext/spl/spl_iterators.c`, `Zend/zend_generators.c`, `Zend/zend_sort.c`, `ext/standard/formatted_print.c`,
`ext/standard/math.c`, `ext/standard/type.c`, `ext/standard/strnatcmp.c`, `Zend/zend_builtin_functions.c`,
`Zend/zend_API.c`, `Zend/zend_operators.c`) in coercive typing mode, PHP's mode for a file without `strict_types`, as
Laravel's are.

Common rules:

- **Values and messages** are PHP's, every exception class and message included. PHP's warnings and deprecations are
  not reproduced, and the function still returns PHP's value, as the casts do.
- **Arguments** are coerced as PHP's parameters are (`"1"` for an `int` is 1, `1.5` is 1, `true` for a `string` is
  `"1"`, an object with a `__toString` port is its string), and what PHP rejects throws PHP's `TypeError`
  `<fn>(): Argument #<n> ($<name>) must be of type <type>, <type> given`. `undefined` reads as `null` (AD-9),
  except as an optional argument: an `undefined` optional argument is an omitted one, and takes PHP's default
  (`range(1, 2, undefined)` steps by 1, `iterator_to_array(it, undefined)` preserves keys).
- **Arrays** come in as `arrayEntries` reads them and go out through `arrayFromEntries` (the AD-9 form: a list is an
  `Array`, all string keys a plain object, anything else a `PhpArray`). `toPhpArray` alone returns a `PhpArray`.

## Generators (DIV-12.18)

A PHP generator yields a key with each value; a JS generator yields only values. Under DIV-12.18 a ported generator
function keeps `yield $v` as `yield v`, writes `yield $k => $v` as `yield keyed(k, v)` and `yield from $iterable` as
`yield* yieldFrom(iterable)`, and is wrapped in `Generator`:

```ts
function* pairs() { yield "a"; yield keyed("k", 2); const r = yield* yieldFrom(inner()); return r; }
const g = new Generator(pairs());
g.current(); // "a", key 0
[...new Generator(pairs()).entries()]; // [[0, "a"], ["k", 2], …inner's own keys]
iterator_to_array(pairs()); // a bare JS generator object is wrapped
```

- `keyed(key, value)` returns a frozen `KeyedYield` marker (`key`, `value`; `undefined` reads as `null`).
- `new Generator(generator)` wraps a JS generator object, which is what a ported generator function returns. Any
  other argument throws PHP's `Error` `The "Generator" class is reserved for internal use and cannot be manually
  instantiated`. It is registered as `Generator`, carries the `Iterator` and `Traversable` brands, and is not in the
  `Symbol.for('xaravel.php.classes')` map.
- **Keys.** A `yield v` gets PHP's automatic key: `largest_used_integer_key` starts at -1, a keyed int greater than it
  raises it, and it wraps from `PHP_INT_MAX` to `PHP_INT_MIN`. A keyed float or string (`'7'` included) stays as it is
  and leaves the counter alone. A key from `yieldFrom` is the source's own and never moves the counter.
- **Methods.** `current()`, `key()`, `valid()`, `next()`, `send(value)`, `rewind()` and `getReturn()` behave as PHP's:
  each first runs a fresh generator to its first yield; `next()` resumes it with `null` and `send(v)` with `v` (a
  fresh one runs to its first yield first, as JS ignores the first `next` argument, which is PHP's rule) and returns
  the new current value; a closed generator's `current()` and `key()` are `null` and its `send()` is `null`.
  `rewind()` throws PHP's `Exception` `Cannot rewind a generator that was already run` once the generator is past its
  first yield; `getReturn()` throws `Cannot get return value of a generator that hasn't returned` until it has
  returned (also after it threw). Resuming a generator from inside itself throws PHP's `Error`
  `Cannot resume an already running generator`. An exception the generator throws reaches the caller and closes it.
- **Iteration.** `[Symbol.iterator]()` yields the values, `entries()` the `[key, value]` pairs and `keys()` the keys,
  by PHP's `foreach` protocol (so a second traversal of a started generator is refused by `rewind()`); each throws
  PHP's `Exception` `Cannot traverse an already closed generator` when called on a closed one.
- `phpSerialize` and `phpUnserialize` refuse it with PHP's `Exception` `Serialization of 'Generator' is not allowed` /
  `Unserialization of 'Generator' is not allowed`. `jsonEncode` gives `{}` and `toPhpArray` `[]`, as PHP does.
- `yieldFrom(source)` delegates to an array (its entries), a Traversable (an `Iterator` by its five methods, an
  `IteratorAggregate` through `getIterator()`, repeated while it returns another aggregate) or a `Generator` (a bare
  JS generator object is wrapped). `send` and `next` on the outer generator reach a delegated `Generator`, a started
  one continues from its current entry, and `yield*` gives its return value (`null` for an array or a Traversable).
  Any other source throws PHP's `Error` `Can use "yield from" only with arrays and Traversables`; a closed generator
  `Generator passed to yield from was aborted without proper return and is unable to continue`; a generator being run
  `Impossible to yield from the Generator being currently run`.

## The value model of the type tests

`is_array`, `is_object`, `is_string`, `is_iterable`, `is_callable` and `is_a` read a JS value as AD-9 and DIV-12.19
map it:

- `is_array(v)` is `phpType(v) === "array"` and `is_object(v)` is `phpType(v) === "object"`, except that a contract
  token is its class-string (AD-9): `is_string(token)` is true, `is_array(token)` and `is_object(token)` false.
- A class constructor (a function whose source is a `class`, or that carries its own Registry FQCN key) stands for
  its class-string where a class is named, as Reflector treats a registered class: it is no `Closure`,
  `is_a(ctor, name)` needs `$allowString`, and `is_callable(ctor)` is the string rule. `is_object(ctor)` stays true,
  as `phpType` gives it, and `is_string(ctor)` false.
- Any other function is a PHP `Closure`: a plain, arrow, bound, async or generator function. A native JS constructor
  such as `Map` reads as a function, so it is a Closure too.
- `gettype`, `getDebugType` and `phpType` keep their results (a token is still `array` to `gettype`).

## Type tests

- `is_array(value)`, `is_object(value)`, `is_string(value)`: as above.
- `is_bool(value)`: `true` for `true` and `false`, `false` for anything else (`0`, `"true"`, `null`).
- `is_int(value)`: `true` for a PHP int (`phpType` `"int"`: a number that is a safe integer, not `-0` and not marked
  `float()`, or a bigint), `false` for anything else (`float(1)`, `"1"`, `true`, `null`, `2 ** 53`).
- `is_null(value)`: `true` for `null` and for `undefined`, which reads as null (AD-9), `false` for anything else (a
  contract token is a string, a `PhpFloat` NaN a float).
- `is_iterable(value)`: an array, or a Traversable object (a bare JS generator object included).
- `is_a(object_or_class, class, allow_string = false)`: whether `object_or_class` is an object of `class` (its
  `instanceof`), or, with `allow_string`, a class-string (a string, a contract token or a class constructor) naming
  `class`, a subclass of it, or a class or token implementing it. `class` is matched case-insensitively, a leading `\`
  ignored, and resolved by the class lookup (a registered class, else a recorded token). A name nothing holds, and any
  value that is neither an object nor (with `allow_string`) a class-string, give `false`; it never throws for an
  unknown name. For an interface target it reads the token's `instanceof` (the brand, or the enum test below) on an
  object, and the brand on a class's prototype (`hasBrand`), or, for `UnitEnum` / `BackedEnum`, the enum-class test,
  on a class-string. A token answers its own name and its parents'. `Countable` and every other PHP interface the
  runtime records no token for are misses, so `is_a(x, 'Countable')` is `false` until a ruling records one.
- `is_callable(value, syntax_only = false, callable_name = null)` ports `zend_is_callable_ex` under DIV-9.13 and
  DIV-9.14, with the rules Reflector's `isCallable` uses for a non-array value:
  - a Closure, and an object whose `__invoke` is a function, are callable;
  - a callable array `[object, method]` is callable when the method is found on the object's class (its prototype
    chain or its static side), or the class has `__call`;
  - `[class-string, method]` (a string, a contract token or a class constructor) and a `'Class::method'` string are
    callable when the method is static, or missing with a `__callStatic`;
  - a string with no `::` is callable when it names a PHP global function the runtime exports, in any case and after
    one leading `\` (`'strlen'`, `'\StrLen'`; see [Callables](#callables-php-function-names), DIV-9.14 as
    ESC-14.4-2 amends it);
  - any other string, a PHP function the runtime does not export included, is not; under `syntax_only`, any
    string, and any two-entry array (keys 0 and 1) of a class-string or an object and a string, is;
  - `callable_name`, a `Ref`, receives PHP's name: `<FQCN>::method`, `<FQCN>::__invoke`, the string itself, `Array`
    for a malformed array, or the `(string)` of a scalar. A Closure's name is `Closure::__invoke`; PHP 8.5 names a
    closure `{closure:<file>:<line>}`, which the runtime cannot give.

## `instanceof` targets

- `Closure` is PHP's class: `x instanceof Closure` is true exactly for a function that is not a class constructor,
  and `new Closure()` throws PHP's `Error` `Instantiation of class Closure is not allowed`. It is registered as
  `Closure` (so `resolveClass('Closure')` finds it), and is not in `Symbol.for('xaravel.php.classes')`.
- `UnitEnum` and `BackedEnum` are tokens. An AD-26 enum case carries no brand, so `x instanceof UnitEnum` is true for
  an object whose class has a static `cases` function, and `x instanceof BackedEnum` for such a case whose class
  declares `backingType` `'string'` or `'int'`; `hasBrand(case, UnitEnum)` stays `false`. `BackedEnum`'s parent is
  `UnitEnum`. Their members are PHP's: `cases`, and `from` and `tryFrom`.
- `ArrayAccess` is a token over the `Symbol.for("ArrayAccess")` brand `ArrayObject`, `ArrayIterator` and `WeakMap`
  carry, with PHP's members `offsetExists`, `offsetGet`, `offsetSet` and `offsetUnset`.
- The three tokens are recorded, so `interfaceExists('ArrayAccess')`, `interfaceExists('UnitEnum')` and
  `interfaceExists('BackedEnum')` are true, as in PHP, and `is_a` resolves their names.
- `x instanceof Generator` is also true for a bare JS generator object, as PHP sees one. `Traversable` and `Iterator`
  do not answer a bare JS generator object.

## Array functions

- `is_scalar(value)`: true for an int, a float, a string or a bool.
- `in_array(needle, haystack, strict = false)`: loose comparison is `looseEquals`, with PHP's enum handler applied to
  the compared values themselves: an enum case (AD-26) compares as a bool with a bool or null, else equals only
  itself. Objects compare as `looseEquals`
  compares them (AD-9.6: through their props protocol, else by identity). Strict
  comparison is PHP's `===`: same type and value, an int never a float, an array the same keys in the same order.
- `array_combine(keys, values)`: an int key as it is, any other as its string (`[]` is `"Array"`); a count mismatch
  throws PHP's `ValueError`, a key object without `__toString` PHP's `Error`.
- `array_filter(array, callback = null, mode = 0)` with `ARRAY_FILTER_USE_KEY` (2) and `ARRAY_FILTER_USE_BOTH` (1):
  the callback gets exactly one argument (the key under `ARRAY_FILTER_USE_KEY`, else the value, also for any other
  non-zero mode, as PHP's argument setup gives it) or, under `ARRAY_FILTER_USE_BOTH`, `(value, key)`. Without a
  callback, the entries that are true by `zend_is_true`.
- `array_unique(array, flags = SORT_STRING)` with `SORT_STRING` (2), `SORT_REGULAR` (0) and `SORT_NUMERIC` (1):
  `SORT_STRING` keeps the first value of each string form. The others sort a copy with a line-for-line port of
  `zend_sort` and PHP's unstable comparator (`php_array_data_compare_unstable_i`, including its rule that groups enum
  cases and moves them to the end), then delete duplicates in PHP's order, so the kept keys are PHP's even where `==`
  is not transitive. A flag PHP reads as `SORT_REGULAR` (any value but 1, 2, 5, 6 and their `SORT_FLAG_CASE` forms)
  is `SORT_REGULAR`; `SORT_FLAG_CASE` with `SORT_REGULAR` or `SORT_NUMERIC` is ignored, as PHP ignores it.
- `iterator_to_array(iterator, preserve_keys = true)` and `iterator_count(iterator)` take an array or a Traversable
  (a bare JS generator object is wrapped in `Generator`) and walk it by PHP's protocol: `rewind`, then `valid` /
  `current` / `key` / `next` (`iterator_count` reads no key or value). A key is normalised as PHP's
  `array_set_zval_key` does (`null` is `""`, `true` 1, `1.7` 1), a later key overwriting an earlier one; an array key
  throws PHP's `TypeError` `Cannot access offset of type array on array`, an object key
  `Cannot access offset of type <class> on array`. An `IteratorAggregate` whose
  `getIterator()` returns no Traversable or itself (or, in a longer cycle, an aggregate already passed, which PHP runs
  into a stack overflow) throws PHP's `Exception`
  `Objects returned by <class>::getIterator() must be traversable or implement interface Iterator`.
- `toPhpArray(value)` is PHP's `(array) $value`, as a `PhpArray`: `null` gives `[]`; a scalar or a closure
  `[value]`; an array a copy (nested arrays copied); an object its properties as `phpSerialize` reads them
  (`objectProps`: protected `"\0*\0name"` and private `"\0Class\0name"` names mangled, an `ArrayObject` its storage),
  a numeric property name becoming an int key.

- `array_map(callback, array, ...arrays)`: with one array, `callback(value)` for each entry, keys kept (string and
  int), or a copy of the array without a callback; with several, a list as long as the longest array, each element
  `callback(v1, v2, …)` (a shorter array gives `null`), or without a callback the list of those value lists. The
  callback is taken as `array_filter` takes it. A non-array throws PHP's `TypeError`
  `array_map(): Argument #2 ($array) must be of type array, int given` (`Argument #3 must be …` and on, unnamed).
- `array_keys(array, filter_value, strict = false)`: the keys as a list, or, when `filter_value` is passed (decided by
  argument count, so an explicit `null` or `undefined` searches for `null`), the keys whose value is `==` it (`in_array`'s comparison) or `===` it.
- `array_values(array)`: the values as a list.
- `array_key_exists(key, array)`: the key as PHP's array offset reads it (a numeric string is its int, `null` is `""`,
  a float truncates, a bool is 0 or 1). An array or object key throws PHP's `TypeError`
  `Cannot access offset of type array on array` (`… of type <class> on array`).
- `array_key_first(array)` and `array_key_last(array)`: the first or last key, `null` for an empty array.
- `array_merge(...arrays)`: string keys overwrite in place, int keys are renumbered from 0; `[]` with no arguments. A
  non-array throws `array_merge(): Argument #<n> must be of type array, <type> given`.
- `count(value, mode = COUNT_NORMAL)` with `COUNT_NORMAL` (0) and `COUNT_RECURSIVE` (1): an array's entries (nested
  arrays' too when recursive; an array already being counted counts 0, as PHP's recursion guard gives it), or, for
  an object carrying the `Symbol.for("Countable")` brand, its `count()` as an int. Any other mode throws PHP's
  `ValueError`, any other value PHP's `TypeError` `count(): Argument #1 ($value) must be of type Countable|array, int
  given`. A contract token is a string there.

- `array_any(array, callback)`, `array_all(array, callback)` and `array_find_key(array, callback)`: the callback gets
  `(value, key)` and its result is read by `zend_is_true`; each stops at the first decisive entry (`array_any([])` is
  `false`, `array_all([])` `true`, `array_find_key` gives the first matching key or `null`). The callback is taken as
  `array_filter` takes one (DIV-9.13) but must not be `null`: `null` throws PHP's `TypeError`
  `array_any(): Argument #2 ($callback) must be a valid callback, no array or string given`.
- `array_first(array)` and `array_last(array)`: the first or last value, `null` for an empty array.
- `array_search(needle, haystack, strict = false)`: the first key whose value is `==` `needle` (`in_array`'s
  comparison, the enum rule included) or `===` it (`identical`), else `false`.
- `array_flip(array)`: each value becomes a key (a numeric string its int, as PHP's symbol table normalises it) whose
  value is its key; a repeated value keeps its first place and its last key; a value that is no int or string is
  skipped, as PHP skips it with a warning.
- `array_slice(array, offset, length = null, preserve_keys = false)` and `array_reverse(array, preserve_keys = false)`:
  PHP's clamping of `offset` and `length`; a string key is always kept, an int key only with `preserve_keys`, else
  renumbered from 0.
- `array_intersect_key(array, ...arrays)`: the entries of `array`, keys kept, whose key every other array has (`"1"`
  and `1` are one key); `array_intersect_assoc(array, ...arrays)` also needs `(string) value === (string) other`
  (PHP's `string_compare_function`: an array reads as `"Array"`, an object without a `__toString` port throws PHP's
  `Error`). With one argument each gives `array` itself. A non-array throws `Argument #1 ($array) must be of type
  array, …` and, for the rest, `Argument #<n> must be of type array, …`.
- `array_diff(array, ...arrays)`, `array_diff_assoc(array, ...arrays)`, `array_diff_key(array, ...arrays)` and
  `array_intersect(array, ...arrays)`: the entries of `array`, keys kept and in its order, whose value's string is
  the string of no value (`array_diff`) or of a value of every other array (`array_intersect`); whose key no other
  array has (`array_diff_key`, `"1"` and `1` one key); or that no other array has under the same key with the same
  string (`array_diff_assoc`). Values compare as PHP's `string_compare_function` compares them (`1`, `"1"`,
  `1.0` and `true` are one; an array reads as `"Array"`; an object without a `__toString` port throws PHP's
  `Error`). `array_diff` ports `PHP_FUNCTION(array_diff)`'s three paths (an empty, a one-element and a longer
  `array`); `array_intersect` ports `php_array_intersect`, which sorts each array with `zend_sort` and walks them
  in step. With no argument each throws PHP's `ArgumentCountError`; a non-array throws `Argument #1 ($array) must be
  of type array, …` and, for the rest, `Argument #<n> must be of type array, …`.
- The callback forms `array_udiff(array, ...arrays, value_compare_func)`, `array_uintersect(…, value_compare_func)`,
  `array_diff_ukey(…, key_compare_func)`, `array_diff_uassoc(…, key_compare_func)` and
  `array_intersect_uassoc(…, key_compare_func)` take the callback last, as a `callable` taken as `array_any` takes
  one, a PHP function name such as `'strcasecmp'` included ([Callables](#callables-php-function-names)). The
  `u…` forms compare values with it, the `…ukey` / `…uassoc` forms keys (an int key as an int), and the
  `…uassoc` forms the values as strings. Each ports `php_array_diff` / `php_array_intersect` as written: every array
  sorted by `zend_sort` with the callback, then walked as PHP walks it, so the callback gets the same operands in the
  same order as PHP gives it, and an inconsistent callback (one returning a constant, or `$a > $b`) gives PHP's
  result. Its result is read as `uasort` reads it (`(int)`, then its sign; `false` retried swapped); after it
  throws it is not called again and the thrown value propagates. Fewer than two arguments throw PHP's
  `ArgumentCountError` `array_udiff() expects at least 2 arguments, 1 given`; a callback PHP refuses throws
  `array_udiff(): Argument #3 must be a valid callback, no array or string given`, checked before the arrays.
- `array_merge_recursive(...arrays)`: `array_merge` (int keys renumbered, `[]` with no argument), except that a
  string key two arrays share holds both values: merged recursively when both are arrays (an object read as its
  properties), else gathered into a list (`null` gives `[null]`, so `['a' => null]` twice gives `['a' => [null,
  null]]`). A non-array throws `array_merge_recursive(): Argument #<n> must be of type array, …`.
- `array_replace(array, ...replacements)` and `array_replace_recursive(array, ...replacements)`: each later array's
  entries set over `array` in turn, keys kept (a key `array` has keeps its place); the recursive form replaces an
  array value under an array value recursively. With no argument each throws PHP's `ArgumentCountError`.
- `array_merge_recursive` and `array_replace_recursive` throw PHP's `Error` `Recursion detected` for a
  self-referencing array (a JS cycle) they would merge or replace into itself, where PHP's recursion guards
  (`GC_PROTECT_RECURSION` on the merged-into array, on the replacing array) detect it. A nested array is copied,
  never changed in place.
- `array_pad(array, length, value)`: `array` padded with `value` to `|length|` entries, on the right for a positive
  `length` and on the left for a negative one, int keys renumbered and string keys kept; `array` itself when it
  has `|length|` entries or more. A `|length|` above 2^30 (`HT_MAX_SIZE`) throws PHP's `ValueError`
  `array_pad(): Argument #2 ($length) must not exceed the maximum allowed array size`.
- `arrayUnion(a, b)` is PHP's `$a + $b` for arrays (`add_function_array`): `a`'s entries, then each entry of `b`
  whose key `a` lacks (`"1"` and `1` one key). It has no PHP function name: a port writes it for `+` on arrays
  (ESC-14.4-1). It is the array form of `+` only: when either operand is no array it throws PHP's `TypeError`
  `Unsupported operand types: array + int` (`bool` for a bool, an object's class), two non-arrays included
  (`arrayUnion(1, 2)` throws `int + int`, where PHP's `+` gives 3).
- Where PHP returns a copy of the first array (`zend_array_dup`, `ZVAL_COPY`: `array_intersect`, the callback forms,
  `array_diff`'s copy paths, `array_replace`, `array_replace_recursive`, `array_pad` with no padding, `arrayUnion`),
  the result keeps that array's next free index, as the by-reference functions keep it: `array_intersect(['a', 'b'],
  ['a'])` is a `PhpArray` whose next `push` lands at key 2, as PHP's `$r[] = 'z'` does.
- `SORT_LOCALE_STRING` (5), `SORT_NATURAL` (6) and `SORT_FLAG_CASE` (8), beside `SORT_REGULAR`, `SORT_NUMERIC` and
  `SORT_STRING`, for `asort` / `arsort`.

## By-reference array functions

`array_shift`, `array_pop`, `array_unshift`, `array_splice`, `asort`, `arsort` and `uasort` take PHP's `&$array` as a
`Ref` (AD-9, DIV-9.2) whose `value` is an AD-9 array. A PHP array is a value, so each builds a new array and writes it
to `ref.value`; the JS value the `Ref` held before is not changed, as PHP's copy-on-write leaves another holder's copy.
A `Ref` holding anything else throws PHP's `TypeError` `array_shift(): Argument #1 ($array) must be of type array, int
given`; an argument that is no `Ref` throws a JS `TypeError` naming DIV-9.2.

- `array_shift(ref)` removes and returns the first value; `array_pop(ref)` the last. Each gives `null` for an empty
  array, which it leaves as it is.
- `array_unshift(ref, ...values)` prepends `values` and returns the new count.
- `array_splice(ref, offset, length = null, replacement = [])` removes `length` entries from position `offset`
  (clamped as PHP clamps them) and puts the values of `replacement` in their place, its keys dropped; a replacement
  that is no array reads as PHP's `(array)` cast reads it (`null` is `[]`, a scalar `[scalar]`). It returns the
  removed entries, int keys renumbered and string keys kept.
- `array_shift`, `array_unshift` and `array_splice` renumber the int keys from 0 and keep the string keys, as PHP
  does; the written-back array goes out through `arrayFromEntries`.
- `array_pop` and the sorts keep the keys, and keep PHP's next free index (`nNextFreeElement`): a `PhpArray` input's,
  lowered by one when `array_pop` removed the int key just below it. The written-back array goes out through
  `arrayFromEntries`, unless that index differs from the one its keys give (the largest int key plus 1): then it is a
  `PhpArray` carrying PHP's index, so a later `push` lands where PHP's `$a[] = …` lands (`[0 => 'a', 7 => 'c']` popped,
  then appended, gives key 7). A JS array or plain object input's next free index is the one its keys give already.
- `reset(ref)` and `end(ref)` return the first and the last value, or `false` for an empty array (`reset` of
  `[null]` is `null`). The runtime's arrays carry no internal pointer, so `ref.value` is left as it is, the same JS
  value. A `Ref` holding an object that is no array (PHP 8.1 deprecated `reset` / `end` on an object) throws a JS
  `TypeError` naming the unported form; a scalar or null throws PHP's `TypeError` `reset(): Argument #1 ($array) must
  be of type array, int given`.

## Sorting: `asort` and `arsort`

`asort(ref, flags = SORT_REGULAR)` sorts by value, ascending, keys kept, and returns `true`; `arsort` sorts descending.
Both port PHP 8's `php_get_data_compare_func` over `zend_sort` with PHP's stable fallback (`RETURN_STABLE_SORT`):
equal values keep their order, for `arsort` too, which negates the comparison, not the tie order.

- `SORT_REGULAR` (and any flag PHP reads as it, `SORT_FLAG_CASE` ignored) compares by `zend_compare`, with
  `array_unique`'s rule that moves enum cases after the other values.
- `SORT_NUMERIC` compares the values as floats.
- `SORT_STRING` compares the bytes of their strings (`toPhpString`); `SORT_STRING | SORT_FLAG_CASE` folds ASCII case.
- `SORT_NATURAL` is a port of `strnatcmp_ex` (leading zeros and whitespace skipped, digit runs by value, a run after
  a `0` as a fraction); `SORT_NATURAL | SORT_FLAG_CASE` folds ASCII case.
- `SORT_LOCALE_STRING` is `strcoll` in the C locale, PHP's default: byte order, up to a NUL byte. No other locale is
  ported (`setlocale` is not).
- A value without a string form under a string comparison throws PHP's `Error`, a string holding a lone surrogate a
  JS `TypeError` naming the function, and a `flags` that is no int PHP's `TypeError`.

## Sorting with a callback: `uasort`

`uasort(ref, callback)` sorts by value with `callback(a, b)`, keys kept, and returns `true`. It ports `php_usort` over
`zend_sort` with PHP's stable fallback, so values the callback calls equal keep their order, and the callback is
called with the same operands, in the same order, as PHP calls it.

- `callback` is a `callable`, taken as `array_any` takes one: a function, an object whose `__invoke` is a function, or
  a PHP function name the runtime exports (`'strnatcasecmp'`). `null` (and any other value) throws PHP's `TypeError`
  `uasort(): Argument #2 ($callback) must be a valid callback, no array or string given`; any other PHP callable
  string or array throws the DIV-9.13 `TypeError`. `ref` is checked first, as
  `asort` checks it.
- The callback's result is read as `php_array_user_compare_unstable` reads it: PHP's `(int)` (`toInt`: `0.5` is 0,
  `"1"` 1, `null` 0, a non-empty array 1), then its sign. A `false` result calls the callback again with the operands
  swapped and negates that result's sign; `true` is 1. PHP's deprecation for a bool result is not reproduced.
- An empty array is left as it is (the same JS value), and the callback is not called. A `PhpArray` input keeps its
  next free index, as `asort`'s does.
- When the callback throws, it is not called again: PHP's `zend_call_function` returns at once while an exception is
  pending, so each later comparison is 0 and the stable fallback orders the rest. The partly sorted array is written
  back, as PHP writes it, and the thrown value propagates.

## Math functions

- `abs(num)`: an int or a float (a numeric string its number, `null` and `false` 0, `true` 1). An int stays an int,
  except `PHP_INT_MIN`, whose absolute value is a float; a float result is a `number`, marked `float()` when
  integral (`abs(-0.0)` is `float(0)`). Anything else throws PHP's `TypeError`
  `abs(): Argument #1 ($num) must be of type int|float, string given`.
- `min(value, ...values)` and `max(value, ...values)`. With one argument, the least or greatest value of that array
  (`zend_hash_minmax`: the first is kept unless a later one compares less, or greater). With two, PHP 8.5's direct-call
  form (`ZEND_FRAMELESS_FUNCTION`): `min` keeps the first when it is less, else the second (`min(0, '0')` is `'0'`);
  `max` keeps the first when it is greater or equal (`max(0, '0')` is `0`). With more, the first argument, replaced by
  each later one that compares less (or greater), so the first of equal values is kept (`min(0, '0', 0)` is `0`).
  Values compare by `zend_compare` (`spaceship`, with PHP's enum rule); two numbers compare directly, as PHP's fast
  paths do, so a NAN wins or loses exactly as in PHP (`max(1.0, NAN)` is `NAN`, `max(NAN, 1.0)` is `1.0`). The value
  returned is the argument itself, its int or float kind kept. No argument throws PHP's `ArgumentCountError`
  `min() expects at least 1 argument, 0 given`; one argument that is no array throws PHP's `TypeError`
  `min(): Argument #1 ($value) must be of type array, int given`, an empty array PHP's `ValueError`
  `min(): Argument #1 ($value) must contain at least one element`.

- `round(num, precision = 0, mode = PHP_ROUND_HALF_UP)` ports PHP 8.5's `_php_math_round`. `num` is an int or a
  float (a numeric string its number, `null` and `false` 0, `true` 1); `precision` an int, clamped to C's `int`, so
  a negative one rounds to tens, hundreds, …; `mode` a `RoundingMode` case or an int (`PHP_ROUND_HALF_UP` 1,
  `PHP_ROUND_HALF_DOWN` 2, `PHP_ROUND_HALF_EVEN` 3, `PHP_ROUND_HALF_ODD` 4, and PHP's internal ceiling 5, floor 6,
  toward-zero 7 and away-from-zero 8, which PHP 8.5.11 accepts too). The result is always a float: a `number`,
  marked `float()` when integral (`round(75.0, 2)` and `round(5, 2)` are `float(75)` and `float(5)`, `round(-0.4)`
  `float(-0)`); `INF`, `-INF` and `NAN` are returned as they are. An int with a `precision` of 0 or more is its
  float; otherwise PHP's pre-rounding check (`round(0.285, 2)` is `0.29`), its `1e16` cut-off and, for a
  `|precision|` of 23 or more, its `"%15fe%d"` text read back, are reproduced (`round(-1.5, -30)` is `0.0`, as PHP's
  `snprintf` writes no sign for -0). Throws PHP's `TypeError` `round(): Argument #3 ($mode) must be of type
  RoundingMode|int, string given` (and the `int|float` / `int` ones for `num` / `precision`), and PHP's `ValueError`
  `round(): Argument #3 ($mode) must be a valid rounding mode (RoundingMode::*)` for an int outside 1 to 8, `null`
  included.

## Callables: PHP function names

A PHP callable string that names a global function, such as `'strcasecmp'`, is called as the runtime's export of that
name (ESC-14.4-2; DIV-9.13 and DIV-9.14 as it amends them). `phpFunction(name)` is the resolver: it gives the resolved
callback, or `null` when the runtime exports no PHP function of that name.

- The registry lists every PHP global function the runtime exports under its PHP name, and only those: never a helper
  (`arrayEntries`, `arrayUnion`, `identical`, `phpFunction`), a camelCase name (`'getDebugType'` does not resolve,
  `'get_debug_type'` does), a class or a constant. It is frozen, and records PHP 8.5.11's `ReflectionFunction` counts,
  variadic flag and by-reference positions for each.
- A name resolves case-insensitively (ASCII, as PHP lower-cases it), after one leading `\` (`'\strlen'`; a name with
  two leading backslashes does not), and only with no `::` in it: `'Class::method'` strings, callable arrays, class
  constructors and contract tokens keep their DIV-9.13 handling, except that a class constructor or contract token
  whose class-string names an exported function in any case (a class named `Count`) is called as that function, as
  PHP calls the function a callable string names, and `is_callable` is `true` for it.
- The resolved callback checks the argument count as PHP checks an internal function's, and throws PHP's
  `ArgumentCountError` `strtoupper() expects exactly 1 argument, 2 given` (`at least`, `at most`; PHP's canonical
  name). So `array_filter($a, 'strlen')` works and `array_any($a, 'is_string')`, which passes `(value, key)`, throws
  as in PHP.
- A by-reference parameter (`reset`, `end`, `array_shift`, the sorts, `is_callable`'s `callable_name`) given a
  value that is no `Ref` gets a fresh `Ref`, so `array_map('reset', $lists)` gives each list's first value; PHP's
  warning that the argument should be passed by reference is not reproduced. A `Ref` is passed as it is.
- `callbackParameter`, which every runtime function that takes a callback uses (`array_filter`, `array_map`,
  `array_any`, `array_all`, `array_find_key`, `uasort`, the callback set functions), calls a resolved name; a name
  the registry lacks keeps the DIV-9.13 `TypeError` naming the callable form. `is_callable` gives `true` for a
  resolved name; `callable_name` stays the string as given.

## PHP names beside camelCase exports

`get_debug_type` is `getDebugType` and `json_last_error` is `jsonLastError`, the same function objects under PHP's
names (ESC-14.1-1, PORTING.md's bare-name rule), and so are `is_numeric` (`isNumeric`) and `is_float` (`isFloat`)
(ESC-14.2-1).

## `identical`

`identical(a, b)` is PHP's `===` (`zend_is_identical`) over AD-9, for a ported `===` whose operand can be a PHP array
(ESC-14.2-1): the same PHP type and value, so an int is never identical to a float (`identical(1, float(1))` is
`false`); two arrays with the same keys in the same order and identical values (`identical({a: 1, b: 2}, {b: 2, a:
1})` is `false`); an object only itself. An array that contains itself throws PHP's `Error`
`Nesting level too deep - recursive dependency?`. `in_array`, `array_keys` and `array_search` use it in strict mode.

## `property_exists` and `method_exists`

`property_exists(object_or_class, property)` and `method_exists(object_or_class, method)` take an object, a class
constructor or a contract token (a class-string, AD-9), or a class-string the Registry resolves (`lookUpName`, case-
and leading-`\`-insensitive); a string naming nothing gives `false`. Any other value throws PHP's `TypeError`
`property_exists(): Argument #1 ($object_or_class) must be of type object|string, int given`, and a name that is no
string `… Argument #2 ($property) must be of type string, array given`.

- `property_exists` is case-sensitive. An object has an own string-keyed property (a field, or one set later, PHP's
  dynamic property). An object or a class has a static property on its class chain (an enumerable own data property
  of the class or a parent, or a static accessor), a property its PHP property table declares
  (`Symbol.for('xaravel.php.properties')`, ESC-9.7-1), and an accessor on its prototype chain (PHP 8.4's hooked
  property). A Closure and a contract token have none.
- `method_exists` matches PHP's case-insensitive method names: a method `findMethod` finds (a function on the
  prototype chain below `Object.prototype`, then on the static chain, never `constructor`), exactly and then in any
  case; `__toString` for a class with a `toString()` port (AD-26); PHP's `Closure` methods (`__invoke`, `bind`,
  `bindTo`, `call`, `fromCallable`) for a Closure and for the class-string `Closure`; and for a contract token its
  recorded methods, its built-in parents' (`getIterator` for `IteratorAggregate`) and its parents'. `__call` and
  `__callStatic` do not make a missing method exist, as in PHP.

## `callMethod`

`callMethod(object, name, ...args)` is PHP's dynamic method call `$object->$name(...$args)` (ESC-14.2-7), for a port
of Upstream code that names the method in a variable. It checks in PHP's order:

1. A `name` that is no JS string, a `__toString` object included, throws PHP's `Error` `Method name must be a string`.
2. An `object` that is no PHP object throws PHP's `Error` `Call to a member function foo() on null`, the type being
   `null`, `true`, `false`, `int`, `float`, `string` or `array`. A class constructor or a contract token is a
   class-string, so it reads `string`. A symbol or a `bigint` outside int64, which is no PHP value, throws the
   runtime's JS `TypeError`, as `phpType` does.
3. A Closure takes `__invoke` in any case, and is called with `args`.
4. Otherwise the method is found as `method_exists` finds it, by the same resolver: each holder of the prototype
   chain, nearest first, then each of the static chain, matched exactly and then in any case on that holder (so a
   subclass's `FOO` overrides a parent's `foo`, as in PHP); then `__toString` as the `toString()` port. A prototype
   method is called with `this` the object, a static one with `this` the object's class (PHP's `static::`).
5. Failing that, the class's instance `__call`, found the same way, is called as `__call(name, args)`, `name` in the
   caller's case and `args` a JS array. A static `__call` and `__callStatic` take no part, as in PHP.
6. Failing that, it throws PHP's `Error` `Call to undefined method A::nope()`, the class named by `get_debug_type`
   (`A@anonymous` for an unregistered subclass, `Closure::nope()` for a Closure).

The call's result is returned, with `undefined` (a JS function with no `return`) read as `null` (AD-9).

PHP's visibility checks are not ported, since a JS method has none: no "Call to private method" error is thrown.
Closure's `bind`, `bindTo`, `call`, `fromCallable` and `getCurrent` are not ported through `callMethod`; each throws
a JS `TypeError` naming the method.

## `range`

`range(start, end, step = 1)` follows PHP 8.3's rules: two ints give ints; a float bound or a fractional step gives
floats (a `number`, marked `float()` when it is integral, AD-9.4); a numeric string is its number; two strings give
the single-byte characters between their first bytes (two single digits too, `range("1", "3")` is `["1", "2", "3"]`);
a string mixed with a number reads as 0, a single digit as its value; `""`, `null` and `false` read as 0 and `true`
as 1. A negative step is its absolute value, and refused for an increasing range. PHP's `ValueError` messages are
given for a zero, `PHP_INT_MIN`, non-finite or too large step, a non-finite bound, and a range beyond PHP's maximum
array size (`HT_MAX_SIZE`, 2^30), with both of PHP's size messages; PHP's `TypeError` for an argument of another type.

## String functions

- `str_starts_with(haystack, needle)`: whether `haystack` begins with `needle` (`""` always).
- `str_contains(haystack, needle)`: whether `needle` occurs in `haystack` (`""` always).
- `strlen(string)`: the number of UTF-8 bytes (`strlen("héllo")` is 6, `strlen(12.5)` is 4).
- `lcfirst(string)`: the first byte lowered when it is an ASCII `A`-`Z`; a multi-byte first character is unchanged
  (`lcfirst("Élan")` is `"Élan"`).
- `strcmp(string1, string2)` (`zend_binary_strcmp`) compares the UTF-8 bytes and gives PHP's int, not only its sign:
  the difference of the first differing bytes (`strcmp("a", "c")` is -2, `strcmp("é", "e")` 94), else -1, 0 or 1 by
  length. `strcasecmp` (`zend_binary_strcasecmp`) does the same after ASCII lower-casing (`strcasecmp("A", "c")` is
  -2); a byte of 0x80 or more is not folded.
- `strnatcmp(string1, string2)` and `strnatcasecmp` (ASCII case folded) port `strnatcmp_ex`, as `SORT_NATURAL` does,
  and give -1, 0 or 1.
- `strcoll(string1, string2)` is the C locale's `strcoll`, PHP's default, which is C's `strcmp`: it stops at a NUL
  byte and gives the difference of the first differing bytes, the terminating NUL included (`strcoll("ab", "a")` is
  98). `asort`'s `SORT_LOCALE_STRING` calls the same comparator.
- The magnitudes of `strcmp`, `strcasecmp` and `strcoll` are those PHP 8.5.11 gives on a C library whose `memcmp` /
  `strcmp` return the byte difference, as the probe records; only their sign is portable across C libraries.
- Their arguments are PHP `string` parameters: an int, float, bool or null is its string, an object its `__toString`
  port, and anything else throws PHP's `TypeError` `strcmp(): Argument #1 ($string1) must be of type string, array
  given`.
- `strtoupper(string)` raises each ASCII `a`-`z`; every other byte is unchanged, so a non-ASCII character is too
  (`strtoupper("é ß")` is `"é ß"`).
- `trim(string, characters = " \n\r\t\v\0")` removes the leading and trailing bytes in `characters`, over UTF-8
  bytes: PHP's default list, or a byte list with `php_charmask`'s `x..y` ranges (`trim(s, "a..e")`). A malformed `..`
  (`"..a"`, `"a.."`, `"z..a"`, `"a..b..e"`) is read as PHP reads it: its first `.` is skipped and the rest taken as
  bytes; PHP's warning is not reproduced. A non-ASCII character in `characters` stands for its bytes, so it can trim
  part of another character, and such a result throws a JS `TypeError`. An omitted or `undefined` list is the
  default; an explicit `null` is `""`, which trims nothing.
- `chunk_split(string, length = 76, separator = "\r\n")` puts `separator` after every `length` bytes of `string` and
  after the rest (`chunk_split("abcdefg", 3)` is `"abc\r\ndef\r\ng\r\n"`); a `length` above the byte length gives
  `string` and `separator` (so `""` gives `separator`). A `length` below 1 throws PHP's `ValueError`
  `chunk_split(): Argument #2 ($length) must be greater than 0`. A result that splits a UTF-8 sequence throws a JS
  `TypeError` (`chunk_split("é", 1, "|")`); one that rejoins it does not (`chunk_split("é", 1, "")` is `"é"`).
- `substr(string, offset, length = null)` counts UTF-8 bytes, as PHP's string is its bytes: a negative offset counts
  from the end, a negative length stops that many bytes before it, and `null` runs to the end.

- `implode(separator, array)` and `implode(array)`, as PHP 8.5 compiles a direct call: each value as PHP's `(string)`
  gives it (`[1, 1.5, true, false, null]` is `"1,1.5,1,,"`, an array `"Array"`, an object its `__toString` port, an
  object without one PHP's `Error`), joined by `separator`. Only a call with one argument is the one-argument form,
  whose argument must be an array; an explicit `null` (or `undefined`) second argument, as in PHP, throws `implode(): If argument #1
  ($separator) is of type string, argument #2 ($array) must be of type array, null given`; an array separator with
  an array throws `implode(): Argument #1 ($separator) must be of type string, array given`.
- `explode(separator, string, limit = PHP_INT_MAX)`: a positive `limit` keeps at most that many parts, the last
  holding the rest; a negative one drops that many from the end (none when the separator is not found); 0 is 1. An
  empty `string` gives `[""]` (`[]` for a negative `limit`). An empty separator throws PHP's `ValueError`
  `explode(): Argument #1 ($separator) must not be empty`.

## `sprintf`

`sprintf(format, ...values)` ports `php_formatted_print`: `%%`, and `%[argnum$][flags][width][.precision]specifier`
with the flags `-`, `+`, ` `, `0` and `'<char>`, a `*` width or precision taken from an int argument (PHP 8's form,
`%*d`, `%.*f`, `%2$*1$d`), the length modifier `l` (ignored), and the specifiers `b c d e E f F g G h H o s u x X`.

- `%d`, `%u`, `%c`, `%o`, `%x`, `%X` and `%b` read a value as `(int)`; `%u` and the bases print it as an unsigned
  64-bit int (`%u` of -1 is `18446744073709551615`); a `0` flag with `-` pads an int with spaces, as PHP does; an
  explicit precision on `%x`, `%o` or `%b` prints no digits, as PHP's does.
- `%e`, `%E`, `%f`, `%F`, `%g`, `%G`, `%h` and `%H` read a value as `(float)`. The digits are exact: the double's
  decimal value rounded half to even, as `zend_dtoa` does (`%.2f` of 0.125 is `0.12`, `%.0f` of 2.5 is `2`). `%e` writes
  the exponent without padding (`1.5e+3`); `%g` uses `zend_gcvt` (`1.0e+6`, `-0` for -0.0); a precision above 53 is
  53; infinities are `INF` / `-INF` and NaN `NaN`, the width ignored. The decimal point is always `.`: PHP's default
  C locale; `setlocale` is not ported, and `%f` / `%g` are C-locale.
- `%s` reads a value as `(string)` (`true` is `"1"`, `null` `""`, an array `"Array"`); its precision truncates.
- A width, a precision and `%s`'s truncation count UTF-8 bytes, as PHP's string is its bytes.
- Too few values throw PHP's `ArgumentCountError` `N arguments are required, M given`; PHP's `ValueError`s are thrown
  for `Unknown format specifier "y"`, `Missing format specifier at end of string`, `Argument number specifier must be
  greater than zero and less than 2147483647`, `Missing padding character`, `Width must be an integer`, `Width must
  be between 0 and 2147483647`, `Precision must be between 0 and 2147483647` (a literal precision such as
  `%.9999999999f`), `Precision must be an integer`, `Precision must be between -1 and 2147483647` and
  `Precision -1 is only supported for %g, %G, %h and %H`.

## Values JS cannot hold

A PHP string is bytes; a JS string is UTF-16. A result or input JS cannot hold throws a JS `TypeError` that names the
limit, as the codecs do ([codecs](codecs.md)): a `substr`, `trim` or `chunk_split` result that splits a UTF-8
sequence (`substr("héllo", 1, 1)`, `trim("ê", "é")`, `chunk_split("é", 1, "|")`), a `range` character of 0x80 or
more, a `sprintf` result that is no valid UTF-8 (a precision that splits a sequence, `%.1s` of `"é"`, or a `%c`
byte of 0x80 or more on its own), and a string holding a lone surrogate passed to `substr`, `str_starts_with`,
`str_contains`, `strlen`, `lcfirst`, `range`, `explode`, `sprintf`, `strcmp`, `strcasecmp`, `strnatcmp`,
`strnatcasecmp`, `strcoll`, `unhandledMatch`, `strtoupper`, `trim` or `chunk_split`.

## Not ported

- `Generator::throw()`.
- An unfinished `Generator` that is dropped never runs its JS generator's `finally` blocks; PHP runs them when it
  destroys the generator.
- A JS generator object advanced before it is wrapped in `Generator`: its earlier yields are not seen, and a wrapped
  one must only be driven through its `Generator`.
- `array_unique`'s `SORT_LOCALE_STRING`, `SORT_NATURAL` and `SORT_STRING | SORT_FLAG_CASE` comparators (and the
  `SORT_FLAG_CASE` forms of the first two): each throws a `ValueError` naming the flag in full. PHP compares no value of an array of one element, so no flag is refused there.
- PHP callable strings naming a function the runtime does not export (`'strtolower'`), `'Class::method'` strings and
  callable arrays (`[Str::class, 'upper']`) as callbacks (DIV-9.13): each throws a `TypeError` naming the callable
  form; pass a function, or an object with an `__invoke` method. `is_callable` gives `false` for such a function name
  (DIV-9.14). `Reflector::isCallable` (`packages/reflection`) and Collections' `callCallable` do not read the resolver
  yet; `phpFunction` is exported for their Stories.
- `sprintf`'s locale handling (`setlocale`, a locale decimal point for `%f` / `%g`): the point is always `.`.
- `Traversable` and `Iterator` answering a bare JS generator object: it answers `instanceof Generator` and
  `is_a(gen, 'Generator')`, but not `instanceof Traversable` / `Iterator`, nor `is_a(gen, 'Traversable')` /
  `is_a(gen, 'Iterator')`.
- A token for `Countable` or any other PHP interface not listed above: `Countable` is no recorded token, so
  `is_a(x, 'Countable')` is `false` (`count` reads the `Symbol.for("Countable")` brand directly).
- A contract token passed to `sprintf`, `implode`, `explode` or `array_key_exists` is not read as its class-string:
  those go through the existing string and key casts, which read a token as an array.
- A Closure's PHP callable name (`{closure:<file>:<line>}`): `is_callable` gives `Closure::__invoke`.
- `reset` and `end` on an object (PHP 8.1 deprecated them), and the internal array pointer itself (`next`, `prev`,
  `current`, `key`): `reset` / `end` read the array and move nothing.
- PHP's `php_charmask` warnings for a malformed `..` range in `trim`'s `characters`.
- `is_callable` for a method name in another case: JS names are case-sensitive, so `[obj, 'M']` misses `m`.
- `callMethod`'s visibility checks, and Closure's `bind`, `bindTo`, `call`, `fromCallable` and `getCurrent` through it
  (see [`callMethod`](#callmethod)).
- `callMethod(object, "toString")` finds the `__toString` port under its JS name, where PHP has no `toString` method:
  the JS name `toString` is the `__toString` port, as for `method_exists`.
- An `UnitEnum` or `BackedEnum` brand: an enum case answers `instanceof`, but `hasBrand(case, UnitEnum)` is `false`.
- `toPhpArray` does not act on `ArrayObject`'s `STD_PROP_LIST` flag: an `ArrayObject` always gives its storage.
- `array_unique`'s enum rule orders different cases by a runtime counter where PHP compares object addresses; it only
  groups equal cases, as PHP's comment says, and the kept keys are the same.
- `in_array` and `array_unique` apply PHP's enum rule above to the values they compare, not to values nested inside
  them, which `looseEquals` and `spaceship` compare; those do not apply PHP's enum handler yet.
- A locale for `SORT_LOCALE_STRING` and `strcoll`, and `setlocale`: each is the C locale's byte order, as PHP's
  default locale gives it.
- `usort` and `uksort`; `uasort` is ported.
- `ReflectionFunction` over a PHP function name: it does not read the `phpFunctions.ts` registry, so
  `new ReflectionFunction('strlen')` still throws `ReflectionException` `Function strlen() does not exist`.
- `array_intersect_ukey`, `array_udiff_assoc`, `array_udiff_uassoc`, `array_uintersect_assoc` and
  `array_uintersect_uassoc`; the other set functions are ported.
- `array_merge_recursive`'s `Error` `The total number of elements must be lower than …` for 2^30 elements or more.
- The order PHP gives two distinct enum cases under `SORT_REGULAR` (`asort`, `arsort`, `array_unique`) is by object
  address; the runtime orders them by first comparison, so only the grouping of equal cases and their place after
  other values are PHP's.
- `property_exists` on a class-string or a class reads only the static side, the PHP property table and accessors: an
  instance field a class does not list in its property table is seen only on an object. A static field stands for a
  static property, so a class constant ported as a static field reads as one.
- `method_exists` counts a JS method named `toString` (the `__toString` port) under that name too.
- `min` and `max` with two arguments always take PHP 8.5's direct-call form; PHP's variadic form, which a call through
  a callable or with a spread takes, keeps the first of two equal values for `min` too.
