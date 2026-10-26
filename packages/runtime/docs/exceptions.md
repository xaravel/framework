# PHP exceptions and the protocol

`@xaravel/runtime` is the home of PHP's own throwables (AD-19, and the spine's Consistency Conventions
"Errors" row). Each is a JS `Error` subclass with
PHP's name and parent chain, registered under its PHP name. A port therefore catches them as PHP does, and imports
them from `@xaravel/runtime` (or `@xaravel/runtime/php`), never from another package (PORTING.md § Exceptions).

## The classes

| PHP root | Classes (parent first) |
| --- | --- |
| `Exception` | `ErrorException`, `JsonException`, `RuntimeException`, `LogicException` |
| `LogicException` | `InvalidArgumentException`, `DomainException`, `LengthException`, `OutOfRangeException`, `BadFunctionCallException` (and its `BadMethodCallException`) |
| `RuntimeException` | `OutOfBoundsException`, `RangeException`, `OverflowException`, `UnderflowException`, `UnexpectedValueException` |
| `Error` | `TypeError` (and its `ArgumentCountError`), `ValueError`, `ArithmeticError` (and its `DivisionByZeroError`) |

PHP's `Exception` and `Error` each extend the JS `Error` directly. Every class is therefore `instanceof` the JS
`Error`, and no class is under both PHP roots, as in PHP. The chains match PHP 8.5's `class_parents`, which the Oracle
tests check. `Exception` and `Error` carry the `Throwable` and `Stringable` brands, so every class here is
`instanceof Throwable`, as in PHP, while a JS `Error` is not ([built-in interfaces](php-builtins.md)).

The names `Error` and `TypeError` shadow the JS globals in a module that imports them. A module that needs both
imports the PHP class under an alias: `import { Error as PhpError, TypeError as PhpTypeError } from "@xaravel/runtime"`.

## Constructors and getters

`new Exception(message = "", code = 0, previous = null)` and `new Error(...)` with the same parameters are inherited by
every other class. `new ErrorException(message = "", code = 0, severity = 1, filename = null, line = null, previous =
null)` adds `getSeverity()`, which defaults to PHP's `E_ERROR` (1).

- `getMessage()` returns the message, and `getCode()` returns the code.
- `getPrevious()` returns the previous throwable, or `null`. A non-null `previous` is also the JS `cause`.
- `code` is an own, writable, non-enumerable property. An int code is a `number` or, beyond ±(2^53 − 1), a `bigint`
  in the int64 range (AD-9.3). A `bigint` outside int64 is no PHP int: an argument holding one is read as the float
  PHP makes of that integer literal. `new Exception("a", 2n ** 70n)` throws
  `Exception::__construct(): Argument #2 ($code) must be of type int, float given`, and `new Exception(2n ** 70n)`
  has the message `1.1805916207174E+21`. On an object built without the constructor (as `phpUnserialize` builds one),
  `getCode()` is `0`, `getPrevious()` is `null` and `getSeverity()` is `1`.
- `name` is the class's FQCN brand, so a registered subclass shows its FQCN in a JS stack: a `ScopeFrameException`
  prints as `Xaravel\Runtime\Scope\ScopeFrameException: …`. An unregistered subclass inherits its parent's brand, so
  its `name` is the nearest registered parent's FQCN.

The constructors take their arguments as PHP does in coercive mode, the mode Laravel's files and the Oracle run in
(`decisions/ESC-9.10-2.md`):

| Parameter | Taken | Rejected |
| --- | --- | --- |
| `string` (`$message`; `?string` `$filename`) | a string; `null` as `""` (a `?string` keeps `null`); `true` / `false` as `"1"` / `""`; an int in decimal; a float as PHP's `(string)` gives it (`5.5` as `"5.5"`, `1e100` as `"1.0E+100"`); an object with a `__toString` port, through it, its return coerced the same way (a port returning `5` gives `"5"`; one returning `null` or an array is PHP's `TypeError` `…::__toString(): Return value must be of type string, … returned`) | an array, a closure, another object |
| `int` (`$code`, `$severity`; `?int` `$line`) | an int; `null` as `0` (a `?int` keeps `null`); `true` / `false` as `1` / `0`; a finite float inside int64, truncated toward zero (`5.0` as `5`, `5.5` as `5`); a numeric string, whitespace around it allowed, read the same way (`"5"`, `" 5"`, `"5.5"`, `"1e3"`) | a leading-numeric (`"5abc"`), non-numeric (`"x"`, `""`) or out-of-range string, a non-finite or out-of-range float, an array, an object |
| `?Throwable` (`$previous`) | `null`, or any JS `Error` | anything else |

PHP's deprecation notices for a coerced `null` or a fractional float are not reproduced. A rejected argument throws
PHP's `TypeError` with PHP's message, which names the root that declares the constructor:
`Exception::__construct(): Argument #2 ($code) must be of type int, string given`,
`Exception::__construct(): Argument #3 ($previous) must be of type ?Throwable, string given`, or, for an
`ErrorException`, `ErrorException::__construct(): … Argument #6 ($previous) …`. A `null` severity is `0`, as PHP
coerces it, not the default `1`.

## Porting a subclass

A Laravel exception extends its PHP parent: `class ItemNotFoundException extends RuntimeException`. It is registered
under its Upstream FQCN, and its messages match Upstream exactly.

A subclass's PHP defaults, such as `protected $code = 404` and `protected $message = 'missing'`, are ported in its
constructor, never as JS class fields: a field is set after `super()` returns and would override an explicit code.
PHP keeps them as follows, and the port does the same:

- The message default applies only when no message is passed. `new NotFound('')` has the message `''`, so the port
  uses a default parameter, `message = 'missing'`.
- The code default applies unless a non-zero code is passed. `new NotFound('x', 0)` has the code 404, so the port
  passes `code === 0 ? 404 : code`. PHP compares the coerced code, so a port whose code may arrive as another type
  (`'0'`, `null`) passes it as an int.

```ts
export class NotFound extends RuntimeException {
  constructor(message: string = "missing", code: number | bigint = 0, previous: Error | null = null) {
    super(message, code === 0 ? 404 : code, previous);
  }
}

registerClass("App\\Exceptions\\NotFound", NotFound);
```

## Where the runtime throws them

- `resolveClass` and `resolveClassAsync`: `Error` `Class "<FQCN>" not found`.
- `ScopeFrameException` extends `RuntimeException`.
- `PhpArray`: `TypeError` `Cannot access offset of type … on array`, and `Error` `Cannot add element to the array as
  the next element is already occupied`.
- `toPhpString`: `Error` `Object of class … could not be converted to string`, and `TypeError`
  `…::__toString(): Return value must be of type string, … returned`.
- `phpSerialize`: `Exception` `Serialization of 'Closure' is not allowed`, and `TypeError`
  `…::__serialize() must return an array`.
- `phpUnserialize`: `TypeError` for a bad argument or `allowed_classes` option.
- `jsonEncode` and `jsonDecode` under `JSON_THROW_ON_ERROR`: `JsonException` with the `JSON_ERROR_*` code. A
  `jsonDecode` depth below 1: `ValueError`. A `jsonEncode` depth that is not finite or not in the int64 range:
  `TypeError` `json_encode(): Argument #3 ($depth) must be of type int, float given`.

Xaravel's own API-misuse errors (`registerClass():`, `mixin():`, `frameSlot():`, `float():`,
`BlockedByComponentError():`, values JS cannot hold) stay JS `TypeError`s, because no PHP throwable stands behind
them. PHP fatals (a trait collision, `Nesting level too deep`) stay JS `Error`s.

## `BlockedByComponentError`

A Ported Test whose Upstream test needs a Component from a later Phase throws `BlockedByComponentError` from its
case's `setUp`, before any exception expectation is set, and its Expectations line is `skip` / `blocked-by:<c>`
(`decisions/ESC-5.3-1.md`, `decisions/ESC-12.1-2.md`). Thrown from a test body after `expectException(...)`, it fails
the expectation check as an assertion failure, and the blocked-by form is lost. Story 17.2 raises it from framework
code, for a service whose Component isn't installed. It is exported from the package root and registered as
`Xaravel\Runtime\BlockedByComponentError`.

- `new BlockedByComponentError(component, detail = null)`. `component` is the owning Component's name from the
  component map, in its lowercase kebab form (`database`, `json-schema`); it is exposed, readonly, as `component`.
  `detail` is a string or `null`.
- The message is `BlockedByComponentError(<component>)`, or `BlockedByComponentError(<component>): <detail>`, and
  `name` is `BlockedByComponentError`. Bun's junit report records the `name` as the failure's `type`, so the harness
  matches the line only on that `type` and a message that starts `BlockedByComponentError(<c>)`.
- Any other component (not a string, `""`, `Database`, `a b`, `(x)`), or a detail that is neither a string nor
  `null`, throws a JS `TypeError` `BlockedByComponentError(): …`.
- It is a JS `Error`, not a PHP throwable: `instanceof Exception` and `instanceof Error` (PHP's) are false, so a test
  that expects an `Exception` cannot pass by catching it.

```ts
class ConditionableTest extends TestCase {
  setUp(): void {
    throw new BlockedByComponentError("database", "Illuminate\\Database is not installed");
  }
}

portedTest(`${ID}::testWhen`, { case: ConditionableTest }, function () {
  // The ported body, which runs once the database Component lands.
});
```

## The `Symbol.for('xaravel.php.classes')` protocol

Loading any of the four package entries (the package root, `scope`, `registry` or `php`) defines
`globalThis[Symbol.for('xaravel.php.classes')]`; a module below them, loaded first, publishes nothing
(`decisions/ESC-9.10-2.md` (a)). It is a frozen null-prototype object that maps each PHP built-in class
the runtime ports, by PHP's declared name, to the class: the 22 classes above, plus `stdClass` and
`__PHP_Incomplete_Class`. The property is non-writable, non-configurable and non-enumerable.

The grader reads it without importing the runtime. It tells PHP's `\Error` from `\Exception` with
`error instanceof map.Error` and `error instanceof map.Exception`, and folds case itself, because PHP class names are
case-insensitive. If the symbol is already defined with another value (by other code, or by another copy of
`@xaravel/runtime`), loading throws a `LogicException` and does not install over it. `XARAVEL_NO_SCOPE_GLOBAL=1` skips
the install, as it skips the scope entry point ([scope-frames.md](scope-frames.md)), so a second copy loaded with it
imports without throwing.

## Not ported

- `Throwable` and `Stringable`, which are interfaces and arrive as Epic 10 tokens.
- `getFile()`, `getLine()`, `getTrace()`, `getTraceAsString()` and `__toString()`.
- PHP's deprecation notices for a coerced constructor argument (the coercion itself is ported, above).
- A PHP property table for exceptions.
