# PHP built-in interfaces and SPL classes

The runtime ports the PHP built-in interfaces and SPL classes Collections returns, accepts or checks (ESC-14.1-2,
action item `epic-14-item-1-runtime-php-types`). Everything here is exported from `@xaravel/runtime/php` and from the
package root, is registered under its PHP name, and is synchronous. None of it is in the
`Symbol.for('xaravel.php.classes')` map, which keeps its 24 throwable and `stdClass` built-ins
([exceptions](exceptions.md)); the class lookup (`Symbol.for('xaravel.class.lookup')`) and `resolveClass` find it.
Loading the package root or `@xaravel/runtime/php` records all six interfaces and registers all five classes. Loading
only `@xaravel/runtime/scope` or `@xaravel/runtime/registry` records `Throwable` and `Stringable`, which PHP's
`Exception` and `Error` carry; the others resolve once a module that defines them loads.

## The interfaces

`Traversable`, `Iterator`, `IteratorAggregate`, `JsonSerializable`, `Stringable` and `Throwable` are contract tokens,
each with a same-named TypeScript interface. Each is built inside the runtime with the shape `@xaravel/contracts`'
`contract()` gives (the runtime does not import contracts, AD-2), and recorded with `registerContractToken`, so
`interfaceExists('Throwable')`, `new ReflectionClass('Iterator')` and the grader's `assertInstanceOf('Traversable', …)`
resolve them. A token's brand is `Symbol.for('<name>')`; `x instanceof Token` and `hasBrand(x, Token)` read it.

| Token | Methods | Built-in methods | Parents |
|---|---|---|---|
| `Traversable` | | | |
| `Iterator` | `current`, `key`, `next`, `rewind`, `valid` | | `Traversable` |
| `IteratorAggregate` | | `getIterator` | `Traversable` |
| `JsonSerializable` | `jsonSerialize` | | |
| `Stringable` | | `__toString` | |
| `Throwable` | `getMessage`, `getCode`, `getFile`, `getLine`, `getTrace`, `getPrevious`, `getTraceAsString` | | `Stringable` |

A class implements one with a brand getter per token in its chain:
`get [Iterator.brand]() { return true }` and `get [Traversable.brand]() { return true }`.

- **Traversable.** A Traversable iterates as a JS Map does (decisions/MAINT-2026-10-25-story-14-1.md): its
  `[Symbol.iterator]()` yields its values, `entries()` its `[key, value]` pairs and `keys()` its keys, so
  `foreach ($c as $v)` is `for (const v of c)` and `foreach ($c as $k => $v)` is `for (const [k, v] of c.entries())`.
  An Iterator class runs PHP's `foreach` protocol in all three (`rewind`, then `valid` / `current` / `key` / `next`);
  an IteratorAggregate class iterates what `getIterator()` returns. `PhpArray`, the low-level PHP array, is no
  Traversable and keeps its `[key, value]` iterator.
- **JsonSerializable.** Its brand is the `Symbol.for('JsonSerializable')` key `jsonEncode` reads, so a branded object
  encodes as its `jsonSerialize()` result.
- **Stringable.** A port's `toString()` is its `__toString`. PHP adds `Stringable` to every class that declares
  `__toString`; a class porting one carries the `Stringable` brand itself.
- **Throwable.** The runtime's `Error` and `Exception` carry the `Throwable` and `Stringable` brands (and declare
  `implements Throwable`), so every PHP throwable the runtime ports is `instanceof Throwable`; a JS `Error` is not. The
  runtime's throwables keep their JS `toString()`, and port `getMessage`, `getCode` and `getPrevious` only (the other
  four are optional in the TS interface).

The classes below also carry the `Countable` brand (`Symbol.for('Countable')`), and all but `CachingIterator` the
`ArrayAccess` brand (`Symbol.for('ArrayAccess')`), the brands the grader and `@xaravel/contracts` read, so
`assertCount` and `assertContains` take them as PHPUnit does.

## The position

PHP's iterator over a hash table keeps a bucket index. The runtime's `ArrayIterator` and `InternalIterator` keep an
insertion sequence instead, with the same effects: the position follows insertion order; an entry written later is
reached, also past the end and also after the last entry it stood on was deleted; an entry deleted under it moves it
to the next entry (a later `next()` steps past that one, so a `foreach` that deletes and re-sets its current key `a`
over `{a, b, c}` visits `a`, `c`, `a`); a deleted-and-re-set key is visited again at its new place; and when an
`ArrayObject`'s storage is exchanged, an iterator over it keeps its index (after one `next()` on `{x, y, z}`,
`exchangeArray({p, q, r})` leaves it on `q`).

## `ArrayIterator` and `ArrayObject`

`new ArrayIterator(array = [], flags = 0)` is an `Iterator`, and `new ArrayObject(array = [], flags = 0,
iteratorClass = ArrayIterator)` an `IteratorAggregate`, over a PHP array held as a `PhpArray`. The argument is copied
when it is a PHP array, nested arrays included, as PHP copies arrays by value. Another `ArrayObject` or `ArrayIterator` (one `phpUnserialize` built included) is wrapped, as
PHP's are: the new object reads and writes the other's current storage, and serialises it as itself
(`O:11:"ArrayObject":4:{i:0;i:0;i:1;O:11:"ArrayObject":4:{…}i:2;a:0:{}i:3;N;}`). Any other object's properties are
copied. Any other value throws PHP's `TypeError`
`ArrayIterator::__construct(): Argument #1 ($array) must be of type array, int given`.

Both give `count()`, `getArrayCopy()` (a copy, nested arrays included, as the value model holds it), `offsetExists` (true for a `null` value),
`offsetGet` (`null` for a missing key; PHP's warning is not reproduced), `offsetSet` (a `null` key appends),
`offsetUnset`, `append`, `getFlags` / `setFlags`, and the constants `STD_PROP_LIST` (1) and `ARRAY_AS_PROPS` (2). An
`undefined` key reads as `null` (AD-9). Their props (`[Symbol.for('xaravel.php.props')]()`, read by `jsonEncode`,
`looseEquals` and the grader) are the storage, as PHP's `get_properties` handler gives them, so
`jsonEncode(new ArrayObject([1, 2]))` is `{"0":1,"1":2}`. `__serialize()` writes PHP's form,
`O:11:"ArrayObject":4:{i:0;i:0;i:1;a:…;i:2;a:0:{}i:3;N;}`. `__unserialize` reads it back with PHP's checks: PHP's
`UnexpectedValueException` `Incomplete or ill-typed serialization data` for missing or ill-typed flags, storage,
members or iterator class; PHP's `InvalidArgumentException` `Passed variable is not an array or object` for a scalar
storage; and PHP's `UnexpectedValueException` for an iterator class that does not exist or is no `Iterator`. It takes
only the flags in PHP's `SPL_ARRAY_CLONE_MASK` (`0x0100FFFF`) from the data. The members (protected and private names
mangled, as `phpSerialize` writes a property table) become properties under their own names.

`ArrayObject.getIterator()` is an instance of its iterator class, built without its constructor as PHP builds it, that
wraps the object with its flags, so it sees later writes. `setIteratorClass(name)` takes a class-string or registered class
derived from `ArrayIterator`, whose declared property defaults the iterator gets (any other throws PHP's `TypeError` `ArrayObject::setIteratorClass(): Argument #1
($iteratorClass) must be a class name derived from ArrayIterator, stdClass given`), and `getIteratorClass()` gives its
FQCN. `exchangeArray(array)` replaces the object's own storage (as the constructor reads the argument) and returns the
old array; an object it wrapped is left as it was.

## `CachingIterator`

`new CachingIterator(iterator, flags = CachingIterator.CALL_TOSTRING)` wraps an `Iterator` and fetches one element
ahead, as PHP's `spl_caching_it_next` does: `valid()`, `key()` and `current()` read the cached element, and `hasNext()`
is the inner iterator's `valid()`. `getInnerIterator()` and `getFlags()` give its arguments. The constants are
`CALL_TOSTRING` (1), `TOSTRING_USE_KEY` (2), `TOSTRING_USE_CURRENT` (4), `TOSTRING_USE_INNER` (8), `CATCH_GET_CHILD`
(16) and `FULL_CACHE` (256).

- `toString()`, also `[Symbol.toPrimitive]`, is `__toString`: the value converted at the fetch under `CALL_TOSTRING`,
  the inner iterator under `TOSTRING_USE_INNER`, the key or current value under `TOSTRING_USE_KEY` /
  `TOSTRING_USE_CURRENT`. Without any of them it throws PHP's `BadMethodCallException`
  `CachingIterator does not fetch string value (see CachingIterator::__construct)`.
- Under `FULL_CACHE`, `getCache()` is a copy of every element read since the last rewind and `count()` their number; without it
  both throw `CachingIterator does not use a full cache (see CachingIterator::__construct)`. A key no PHP array takes
  (an object) throws PHP's `TypeError` `Cannot access offset of type stdClass on array` with the element already
  cached and `valid()` true, and the inner iterator not moved, as PHP's fetch order leaves it.
- Two string flags throw PHP's `ValueError`; an argument that is no `Iterator` throws PHP's `TypeError`.

## `WeakMap` and `InternalIterator`

`new WeakMap()` maps PHP objects (class instances and functions) to values, holds neither its keys nor its values
strongly, and iterates in insertion order; rewriting a key keeps its position. Each value sits in a JS `WeakMap` keyed
by its object (an ephemeron), so a value that references its key does not keep it alive; only the order record, the
key's `WeakRef`, is held strongly, and a `FinalizationRegistry` drops it once the key is collected. It gives
`offsetGet`, `offsetSet`, `offsetExists` (PHP's `isset`: false for a `null` value), `offsetUnset`, `count()` and
`getIterator()`, an `InternalIterator` over the live entries whose keys are the objects. `InternalIterator`'s
constructor is private, as PHP's is: `new InternalIterator()` throws PHP's `Error`; `phpSerialize` and `phpUnserialize`
refuse it with PHP's `Exception` `Serialization of 'InternalIterator' is not allowed` (and `Unserialization …`).

A key that is no object throws PHP's `TypeError` `WeakMap key must be an object`; `offsetSet(null, …)` (`$map[] = …`,
an `undefined` key too) throws PHP's `Error` `Cannot append to WeakMap`; reading a missing key throws PHP's `Error`
`Object stdClass#<n> not contained in WeakMap`, where `<n>` comes from a runtime-local counter, as the grader's object
handles do, not PHP's object id. `phpSerialize` throws PHP's `Exception` `Serialization of 'WeakMap' is not allowed`,
and `phpUnserialize` `Unserialization of 'WeakMap' is not allowed`.

## `Random\Randomizer`

`Randomizer` (`new Randomizer()`, registered as `Random\Randomizer`, ESC-14.2-1, action item
`epic-14-item-5-runtime-array-functions`) ports PHP 8.5.11's `ext/random/randomizer.c` with a secure engine, as PHP's
default `Random\Engine\Secure` is, drawing from `crypto.getRandomValues`. `pickArrayKeys(array, num)` returns `num`
distinct keys of `array`, as a list in the array's order, each subset of that size equally likely (PHP's
`php_array_pick_keys`: it marks the positions it keeps, or, for more than half, those it leaves out). An empty array
throws PHP's `ValueError` `Random\Randomizer::pickArrayKeys(): Argument #1 ($array) must not be empty`, a `num` below 1
or above the count `… Argument #2 ($num) must be between 1 and the number of elements in argument #1 ($array)`, and a
non-array or a `num` that is no int PHP's `TypeError`.

## `SortDirection`

`SortDirection` is PHP 8.6's enum, as symfony/polyfill-php86 v1.43.0 declares it for PHP 8.1 to 8.5: a pure AD-26
enum with the cases `SortDirection.Ascending` and `SortDirection.Descending`, each a frozen instance with its `name`,
and `SortDirection.cases()` in that order. It declares no `backingType`, so a case is `instanceof UnitEnum` and not
`instanceof BackedEnum`, and `enumExists('SortDirection')` is `true`. `new SortDirection()` throws PHP's `Error`
`Cannot instantiate enum SortDirection`. It is registered as `SortDirection`.

## `RoundingMode`

`RoundingMode` is PHP 8.4's enum, as PHP 8.5.11 declares it: a pure AD-26 enum built as `SortDirection` is, with the
cases `HalfAwayFromZero`, `HalfTowardsZero`, `HalfEven`, `HalfOdd`, `TowardsZero`, `AwayFromZero`, `NegativeInfinity`
and `PositiveInfinity`, in that order (`RoundingMode.cases()`), each a frozen instance with its `name`. A case is
`instanceof UnitEnum` and not `instanceof BackedEnum`, and `enumExists('RoundingMode')` is `true`.
`new RoundingMode()` throws PHP's `Error` `Cannot instantiate enum RoundingMode`. It is registered as `RoundingMode`.
`round` takes a case as its `mode`: the four `Half*` cases are `PHP_ROUND_HALF_UP` to `PHP_ROUND_HALF_ODD`, and
`TowardsZero`, `AwayFromZero`, `NegativeInfinity` and `PositiveInfinity` are PHP's internal modes 7, 8, 6 and 5.

None of `Random\Randomizer`, `SortDirection` and `RoundingMode` is in the `Symbol.for('xaravel.php.classes')` map;
`resolveClass` and the class lookup find each.

## Not ported

- `ARRAY_AS_PROPS` and `STD_PROP_LIST` are kept by `getFlags()` / `setFlags()` but not acted on.
  As in PHP, the constructor and `setFlags` keep only the low 16 bits; PHP's internal `SPL_ARRAY_IS_SELF` bit, which
  `__unserialize` may take from its data, is not ported.
- `ArrayIterator` has no `seek()`, and neither class has the sort methods (`asort`, `ksort`, `uasort`, `uksort`,
  `natsort`, `natcasesort`).
- `CachingIterator`'s `ArrayAccess` methods and `setFlags` are not ported; `CATCH_GET_CHILD` is not acted on.
- `Countable`, `ArrayAccess`, `SeekableIterator`, `OuterIterator` and `Serializable` are not tokens; the classes carry
  the brands of the six interfaces above plus the `Countable` and `ArrayAccess` brand symbols.
- PHP adds `Stringable` implicitly to a class declaring `__toString`; here a class carries the brand itself.
- The runtime's throwables keep their JS `toString()`.
- An `ArrayObject` or `ArrayIterator` over an object that is no SPL array object copies its properties rather than
  writing through to them; PHP 8.5 deprecates that input. A wrap that would lead back to the object itself takes a
  copy of the storage, where PHP uses the object's own property table.
- A position carried across `exchangeArray` follows insertion order, not PHP's bucket indexes, which count the holes
  of a hash table PHP has not compacted yet.
- `getDebugType` names an unregistered class with no registered parent `class@anonymous`, where PHP names it after its
  first interface; the runtime cannot read a class's interface order.
- `Random\Randomizer`'s engines and its `engine` property: passing an engine to `new Randomizer(...)` throws a JS
  `TypeError` naming the limit, and the keys PHP picks for a given engine seed are not reproduced. Its other methods
  (`nextInt`, `getInt`, `nextFloat`, `getFloat`, `getBytes`, `getBytesFromString`, `shuffleArray`, `shuffleBytes`) are
  not ported.
