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
- **Offset assignment.** `offsetAssign(ref, key, value)` assigns through a `Ref` holding
  any PHP value; a null key appends. Arrays separate and copy values, null/false
  become arrays, and scalar errors preserve the receiver. `ArrayAccess` retains its
  handle and receives `offsetSet` with copied arguments. The result is the assigned
  value; string writes count UTF-8 bytes, pad with spaces and return the first written
  byte (null for an ignored negative offset or a receiver write during RHS conversion).
  Conversion preserves callback writes, including same-value writes and exceptions. Results outside the JS string model
  throw a JS `TypeError` naming the UTF-8 limit (ESC-9.7-1 §2). DIV-9.17 omits
  notices and the false-to-array deprecation. This construct helper is not a PHP
  global function and does not resolve through `phpFunction`.
- **Offset references.** `offsetReference(object, offset)` returns an `OffsetReference`,
  a real `Ref<unknown>` accepted by by-reference helpers. Builtin `ArrayObject`
  storage (also through wrappers and inherited `offsetGet`) writes through. An
  overridden or other userland `offsetGet` yields a detached array value and never
  calls `offsetSet`; DIV-9.17 omits PHP's indirect-modification notice. Assignments
  copy arrays and preserve object handles. Captured references share reference
  writes; direct offset overwrites and unsets detach them from the slot. Reinsertion
  creates a new slot. After a storage exchange, existing references retain the
  original storage. A null (or undefined) offset selects the empty-string
  slot; consumers retain responsibility for whole-root/null-key policies.
- **Arbitrary offset references.** `referenceAt(ref, key)` acquires PHP's `&$x[$key]`
  through a `Ref` holding any PHP value; null appends (`&$x[]`). Arrays create a
  missing null slot, preserve key coercion and append overflow, and share repeated
  references to a captured slot. Sibling writes and direct array overwrites retain
  aliases; removing a slot or replacing the receiver detaches it. Array copies
  made before acquisition are isolated; copies made afterward preserve existing
  reference cells, as PHP does. Surviving reference cells travel with entries through
  append, removal, reindexing, sorting, casts and array-returning operations. Deleted
  or truncated native slots are pruned before copying; referenced values are shared
  without recursive descent. Assigned arrays copy values and objects keep their
  handles. Null and false become arrays before key validation. Other scalars fail
  unchanged, strings raise PHP's reference or offset-type error, and preceding
  `offsetAssign` writes remain observable. ArrayAccess delegates to
  `offsetReference`, including its builtin versus userland semantics and null
  empty-string offset policy. DIV-9.17 omits notices and deprecations only.
- **Objects.** `stdClass` is PHP's class with no members; a dynamic property is a plain property write. An object PHP
  compares with `==` exposes its compared properties through `[Symbol.for('xaravel.php.props')]()`. `stdClass`
  carries that hook as a non-enumerable prototype method returning its own enumerable string properties, in order, so
  `==` and `<=>` compare two stdClass objects, `jsonDecode` objects included, by their properties as PHP does. Its order is JS key order, integer-like names first, so a stdClass mixing integer-like and string
  names compares (`<=>`) in that order, not PHP's insertion order (the limit `jsonDecode.ts`'s header notes).

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

## Array helpers

The codecs and the casts read and build PHP arrays through three helpers, which a port uses so its keys normalise and
order exactly as `jsonEncode` and the grader's do (ESC-14.1-1):

- `arrayEntries(array)` is the `[key, value]` pairs of a PHP array (a list, a plain object or a `PhpArray`) in PHP
  order, keys normalised (`{"1": "a"}` gives `[[1, "a"]]`) and `undefined` values read as `null`.
- `arrayFromEntries(entries)` is the PHP array of `[key, value]` entries as the value model holds it: a list is an
  `Array`, all-string keys a plain object, anything else a `PhpArray`. A repeated key keeps its first position and
  its last value.
- `normalizeKey(key)` is PHP's array-key normalisation (`"07"` stays `"07"`, `"7"` is `7`, `true` is `1`, `null` is
  `""`, a float truncates). Any other key throws PHP's `TypeError` `Cannot access offset of type … on array`.

## Type names

`gettype(value)` and `getDebugType(value)` are PHP's `gettype` (`NULL`, `boolean`, `integer`, `double`, `string`,
`array`, `object`) and `get_debug_type` (`null`, `bool`, `int`, `float`, `string`, `array`, the Registry FQCN,
`Closure` for a function, `P@anonymous` for an unregistered class whose nearest registered parent is `P`, else
`class@anonymous`), over the same value model (ESC-14.1-1).

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
