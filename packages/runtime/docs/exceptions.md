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
tests check.

The names `Error` and `TypeError` shadow the JS globals in a module that imports them. A module that needs both
imports the PHP class under an alias: `import { Error as PhpError, TypeError as PhpTypeError } from "@xaravel/runtime"`.

## Constructors and getters

`new Exception(message = "", code = 0, previous = null)` and `new Error(...)` with the same parameters are inherited by
every other class. `new ErrorException(message = "", code = 0, severity = 1, filename = null, line = null, previous =
null)` adds `getSeverity()`, which defaults to PHP's `E_ERROR` (1).

- `getMessage()` returns the message, and `getCode()` returns the code.
- `getPrevious()` returns the previous throwable, or `null`. A non-null `previous` is also the JS `cause`.
- `code` is an own, writable, non-enumerable property. An int code is a `number` or, beyond ±(2^53 − 1), a `bigint`
  in the int64 range (AD-9.3). On an object built without the constructor (as `phpUnserialize` builds one),
  `getCode()` is `0`, `getPrevious()` is `null` and `getSeverity()` is `1`.
- `name` is the class's FQCN brand, so a registered subclass shows its FQCN in a JS stack: a `ScopeFrameException`
  prints as `Xaravel\Runtime\Scope\ScopeFrameException: …`. An unregistered subclass inherits its parent's brand, so
  its `name` is the nearest registered parent's FQCN.

A bad argument throws PHP's `TypeError` with PHP's message. The message names the root that declares the constructor:
`Exception::__construct(): Argument #2 ($code) must be of type int, string given`,
`Exception::__construct(): Argument #3 ($previous) must be of type ?Throwable, string given`, or, for an
`ErrorException`, `ErrorException::__construct(): … Argument #6 ($previous) …`. Any JS `Error` counts as a
`Throwable`.

## Porting a subclass

A Laravel exception extends its PHP parent: `class ItemNotFoundException extends RuntimeException`. It is registered
under its Upstream FQCN, and its messages match Upstream exactly.

A subclass's PHP defaults, such as `protected $code = 404` and `protected $message = 'missing'`, are ported in its
constructor, never as JS class fields: a field is set after `super()` returns and would override an explicit code.
PHP keeps them as follows, and the port does the same:

- The message default applies only when no message is passed. `new NotFound('')` has the message `''`, so the port
  uses a default parameter, `message = 'missing'`.
- The code default applies unless a non-zero code is passed. `new NotFound('x', 0)` has the code 404, so the port
  passes `code === 0 ? 404 : code`.

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
  `jsonDecode` depth below 1: `ValueError`.

Xaravel's own API-misuse errors (`registerClass():`, `mixin():`, `frameSlot():`, `float():`, values JS cannot hold)
stay JS `TypeError`s, because no PHP throwable stands behind them. PHP fatals (a trait collision, `Nesting level too
deep`) stay JS `Error`s.

## The `Symbol.for('xaravel.php.classes')` protocol

Loading any runtime entry (the package root, `scope`, `registry` or `php`) defines
`globalThis[Symbol.for('xaravel.php.classes')]`. It is a frozen null-prototype object that maps each PHP built-in class
the runtime ports, by PHP's declared name, to the class: the 22 classes above, plus `stdClass` and
`__PHP_Incomplete_Class`. The property is non-writable, non-configurable and non-enumerable.

The grader reads it without importing the runtime. It tells PHP's `\Error` from `\Exception` with
`error instanceof map.Error` and `error instanceof map.Exception`, and folds case itself, because PHP class names are
case-insensitive. If the symbol is already defined with another value (by other code, or by another copy of
`@xaravel/runtime`), loading throws a `LogicException` and does not install over it.

## Not ported

- `Throwable` and `Stringable`, which are interfaces and arrive as Epic 10 tokens.
- `getFile()`, `getLine()`, `getTrace()`, `getTraceAsString()` and `__toString()`.
- PHP's coercion of constructor arguments: a numeric-string or float code, or a `null` message, throws the `TypeError`
  instead.
- A PHP property table for exceptions.
