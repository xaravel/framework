# The serialize and JSON codecs

`@xaravel/runtime/php` holds the only PHP codecs (AD-23). Framework code never calls `JSON.stringify` on a framework
value. Cache entries, sessions, queued payloads and JSON responses therefore interoperate with PHP Laravel byte for
byte. Everything here is exported from `@xaravel/runtime/php` and from the package root, and is synchronous.

## `phpSerialize` / `phpUnserialize`

`phpSerialize(value)` returns the bytes PHP's `serialize()` writes for the same value, as a JS string whose UTF-8
encoding is the payload.

- String lengths are UTF-8 byte lengths. Floats are written at `serialize_precision = -1` (`d:0.1;`, `d:1.0E+100;`,
  `d:-0;`), and a `bigint` in exact digits.
- Objects are written by their Registry FQCN. A class may define `__serialize()`, `__sleep()`, or a PHP property table
  `[Symbol.for('xaravel.php.properties')]` that gives protected and private properties PHP's mangled names.
- A repeated object is a back-reference, as PHP numbers them.
- A function is a `Closure`, which PHP refuses: PHP's `Exception` `Serialization of 'Closure' is not allowed`.
  `__serialize()` returning a non-array throws PHP's `TypeError`.

`phpUnserialize(data, options)` rebuilds the value in the value model. It returns `false` for a malformed payload, as
PHP does. `PhpUnserializeOptions` has `allowedClasses`: `true` (the default), `false`, or a list of class names. A class
outside the list, or one not registered, comes back as `__PHP_Incomplete_Class`, which keeps the original name and
entries so `phpSerialize` writes them back unchanged. A rebuilt object starts from its declared defaults. Then
`__unserialize` or `__wakeup` runs. A bad `data` or option throws PHP's `TypeError` with PHP's message.

A value JS cannot hold (a string that is not valid UTF-8, a lone surrogate, an array that contains itself) throws a JS
`TypeError` that names the limit.

## `jsonEncode` / `jsonDecode`

`jsonEncode(value, flags = 0, depth = 512)` is PHP's `json_encode`, byte for byte across flag combinations. It returns
the JSON string, or `false` on error.

- A PHP array (an `Array`, a `PhpArray` or a plain object) is a list when its keys are exactly `0..n-1` in order, and
  an object otherwise. A plain object's integer-like keys are PHP's int keys, so `{"0":"a"}` is `["a"]` and `{}` is
  `[]`; use a `stdClass` or `JSON_FORCE_OBJECT` for `{}`. A plain object's integer-like keys come out in JS's ascending
  order, not insertion order (`{"1":"b","0":"a"}` is `["a","b"]`); use a `PhpArray`, which keeps its order. A `bigint`
  is written as its exact digits.
- `depth` is parsed as PHP parses it: a fractional depth truncates toward zero and the result wraps to int32 (`2^31`
  is `INT_MIN`, so every array is too deep). A depth that is not finite or lies outside `[-2^63, 2^63)` throws PHP's
  `TypeError`, leaving `jsonLastError()` as it was.
- `JsonSerializable` objects encode `jsonSerialize()`. At the top level, a `Jsonable` returns `toJson(flags)`, and an
  `Arrayable` encodes `toArray()`. Each is detected by its `Symbol.for(<FQCN>)` brand, without importing contracts.

`jsonDecode(json, associative = null, depth = 512, flags = 0)` is PHP's `json_decode`. With `associative` true (or
`JSON_OBJECT_AS_ARRAY`) objects decode to PHP arrays; otherwise they decode to `stdClass`. An int beyond int64 is a float, or
its digits under `JSON_BIGINT_AS_STRING`. A depth below 1 throws PHP's `ValueError`.

The flags and error codes are PHP's constants:

- Encode flags: `JSON_HEX_TAG`, `JSON_HEX_AMP`, `JSON_HEX_APOS`, `JSON_HEX_QUOT`, `JSON_FORCE_OBJECT`,
  `JSON_NUMERIC_CHECK`, `JSON_UNESCAPED_SLASHES`, `JSON_PRETTY_PRINT`, `JSON_UNESCAPED_UNICODE`,
  `JSON_PARTIAL_OUTPUT_ON_ERROR`, `JSON_PRESERVE_ZERO_FRACTION` and `JSON_UNESCAPED_LINE_TERMINATORS`.
- Decode flags: `JSON_OBJECT_AS_ARRAY` and `JSON_BIGINT_AS_STRING`.
- Flags for both: `JSON_INVALID_UTF8_IGNORE`, `JSON_INVALID_UTF8_SUBSTITUTE` and `JSON_THROW_ON_ERROR`.
- Error codes: `JSON_ERROR_NONE`, `JSON_ERROR_DEPTH`, `JSON_ERROR_STATE_MISMATCH`, `JSON_ERROR_CTRL_CHAR`,
  `JSON_ERROR_SYNTAX`, `JSON_ERROR_UTF8`, `JSON_ERROR_RECURSION`, `JSON_ERROR_INF_OR_NAN`,
  `JSON_ERROR_UNSUPPORTED_TYPE`, `JSON_ERROR_INVALID_PROPERTY_NAME`, `JSON_ERROR_UTF16` and
  `JSON_ERROR_NON_BACKED_ENUM`.

Under `JSON_THROW_ON_ERROR` an error throws PHP's `JsonException` with PHP's message, and the `JSON_ERROR_*` code as
its `getCode()`.

`jsonLastError()` and `jsonLastErrorMsg()` are PHP's `json_last_error()` and `json_last_error_msg()`. The record lives
in a Scope Frame slot (AD-5). Inside a frame, each call records its code. A call under `JSON_THROW_ON_ERROR` without
`JSON_PARTIAL_OUTPUT_ON_ERROR` leaves the record untouched, as PHP 8.5 does. Outside a frame the reads give `0` and
`No error`.
