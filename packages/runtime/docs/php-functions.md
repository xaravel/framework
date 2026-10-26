# PHP generators and functions

The runtime ports PHP's `Generator`, the keyed yield a JS generator cannot write, and the PHP functions the Collections
core calls (ESC-14.1-5, ESC-14.1-6, action item `epic-14-item-2-runtime-generators-functions`). Everything here is
exported from `@xaravel/runtime/php` and from the package root, under its PHP name, and is synchronous. Each function
ports PHP 8.5.11's C source (`ext/standard/array.c`, `ext/standard/string.c`, `ext/spl/spl_iterators.c`,
`Zend/zend_generators.c`, `Zend/zend_sort.c`) in coercive typing mode, PHP's mode for a file without `strict_types`,
as Laravel's are.

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
- `substr(string, offset, length = null)` counts UTF-8 bytes, as PHP's string is its bytes: a negative offset counts
  from the end, a negative length stops that many bytes before it, and `null` runs to the end.

## Values JS cannot hold

A PHP string is bytes; a JS string is UTF-16. A result or input JS cannot hold throws a JS `TypeError` that names the
limit, as the codecs do ([codecs](codecs.md)): a `substr` result that splits a UTF-8 sequence
(`substr("héllo", 1, 1)`), a `range` character of 0x80 or more, and a string holding a lone surrogate passed to
`substr`, `str_starts_with` or `range`.

## Not ported

- `Generator::throw()`.
- An unfinished `Generator` that is dropped never runs its JS generator's `finally` blocks; PHP runs them when it
  destroys the generator.
- A JS generator object advanced before it is wrapped in `Generator`: its earlier yields are not seen, and a wrapped
  one must only be driven through its `Generator`.
- `array_unique`'s `SORT_LOCALE_STRING`, `SORT_NATURAL` and `SORT_STRING | SORT_FLAG_CASE` comparators (and the
  `SORT_FLAG_CASE` forms of the first two): each throws a `ValueError` naming the flag in full. PHP compares no value of an array of one element, so no flag is refused there.
- PHP callable strings (`'strlen'`) and arrays (`[Str::class, 'upper']`) as `array_filter` callbacks: each throws a
  `TypeError` naming the callable form; pass a function, or an object with an `__invoke` method.
- `toPhpArray` does not act on `ArrayObject`'s `STD_PROP_LIST` flag: an `ArrayObject` always gives its storage.
- `array_unique`'s enum rule orders different cases by a runtime counter where PHP compares object addresses; it only
  groups equal cases, as PHP's comment says, and the kept keys are the same.
- `in_array` and `array_unique` apply PHP's enum rule above to the values they compare, not to values nested inside
  them, which `looseEquals` and `spaceship` compare; those do not apply PHP's enum handler yet.
