# PHP values and semantics helpers

PHP values map to TypeScript by fixed rules (AD-9, DIV-9), so that no Component chooses its own representation of null,
arrays, integers or markers. Everything here is exported from `@xaravel/runtime/php` and from the package root, and is
synchronous.

## The value model

- **Null.** `null` is the only absent value, and `undefined` never escapes a public API. `normalizeNull(value)` turns
  `undefined` into `null` at a boundary and returns every other value unchanged.
- **Arrays.** A PHP list is a JS `Array`. A map whose keys are all non-integer-like strings is a plain object. Any other
  PHP array is a `PhpArray`.
- **Integers.** An int is a safe-integer `number`, or a `bigint` beyond ±(2^53 − 1) within int64.
- **Floats.** A float is any other `number`. Where Upstream depends on the int/float distinction, `float(n)` marks an
  integral float such as `1.0`. It returns a frozen `PhpFloat`, a `Number` subclass, so arithmetic still sees the
  number. `isFloat(v)` is PHP's `is_float`: true for a marked value and for a non-integral `number`.
- **By-reference parameters.** PHP's `function f(&$x)` takes a `Ref` box (`Ref<T>`). The callee writes `ref.value`, and the
  caller reads it back.
- **Objects.** `stdClass` is PHP's class with no members; a dynamic property is a plain property write. An object PHP
  compares with `==` exposes its compared properties through `[Symbol.for('xaravel.php.props')]()`.

## `PhpArray`

`new PhpArray(entries)` is an ordered map with PHP's key normalisation. A `PhpKeyInput` (a string, number, `bigint`,
boolean, `null` or marked float) normalises to a `PhpArrayKey` (a safe-integer `number`, a `bigint` or a `string`):
`"1"` becomes `1`, `1.7` becomes `1`, `true` becomes `1`, and `null` becomes `""`. Rewriting a key keeps its first
position.

- `get`, `set`, `has` and `delete` normalise the key. `get` returns `null` for a missing key.
- `push(value)` is `$a[] = $value`: it writes at PHP's next free index and returns the key.
- `copy()` is PHP's `$b = $a`.
- `keys()`, `values()` and `[Symbol.iterator]()` yield normalised keys and `[key, value]` pairs in insertion order. The
  grader reads the iterator through the `Symbol.for('xaravel.php.array')` brand, without importing the runtime.

An illegal key throws PHP's `TypeError` `Cannot access offset of type … on array`. A push past `PHP_INT_MAX` throws
PHP's `Error` `Cannot add element to the array as the next element is already occupied`.

## Brands

A marker interface becomes a brand getter on the prototype (AD-9.5). `hasBrand(classOrInstance, Token)` reads it
from a class without instantiating it, or from an instance through its prototype chain.

## Semantics helpers

These follow PHP 8.5 over the value model, and their Oracle tests check them against PHP:

- `looseEquals(a, b)` is PHP's `==`, and `spaceship(a, b)` is `<=>`, returning `-1`, `0` or `1`. Arrays compare
  entry by entry and objects by their properties. A recursive structure throws `Nesting level too deep - recursive
  dependency?`.
- `isNumeric(v)` is PHP's `is_numeric`: it accepts numeric strings with leading or trailing whitespace.
- `toInt(v)`, `toFloat(v)`, `toPhpString(v)` and `toBool(v)` are PHP's `(int)`, `(float)`, `(string)` and `(bool)`
  casts. `toPhpString` of an object without a `__toString` port throws PHP's `Error` `Object of class … could not be
  converted to string`. A port that returns a non-string throws PHP's `TypeError`.
- `valueCopy(x)` is PHP's value copy: nested arrays are copied, and objects are shared by handle.

PHP's warnings and notices (`Array to string conversion`) are not reproduced. PHP still returns the value, and so do
the helpers.
