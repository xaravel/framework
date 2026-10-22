// The PHP built-in classes protocol (Story 9.10; ESC-4.3-1 items 10 and 14, ESC-4.4-2 item 7, ESC-4.5-1 item 2).
// Loading this module defines `globalThis[Symbol.for('xaravel.php.classes')]`: a frozen null-prototype object from
// each PHP built-in class the runtime ports, by PHP's declared name, to the class. The grader reads it without
// importing the runtime: it tells PHP's `\Error` from `\Exception` with `instanceof map.Error` /
// `instanceof map.Exception`, and folds case itself (PHP class names are case-insensitive). The property is
// non-writable, non-configurable and non-enumerable, as `Symbol.for('xaravel.scope.run')` is (`scope/scope.ts`).
// When the symbol is already defined with another value (other code, or another copy of the runtime), loading throws
// PHP's `LogicException` instead of installing over it.
//
// `src/index.ts` and every subpath index import this module right after the polyfill, so loading any runtime entry
// publishes the map.
import { __PHP_Incomplete_Class } from "./__PHP_Incomplete_Class";
import { ArgumentCountError } from "./ArgumentCountError";
import { ArithmeticError } from "./ArithmeticError";
import { BadFunctionCallException } from "./BadFunctionCallException";
import { BadMethodCallException } from "./BadMethodCallException";
import { DivisionByZeroError } from "./DivisionByZeroError";
import { DomainException } from "./DomainException";
import { Error } from "./Error";
import { ErrorException } from "./ErrorException";
import { Exception } from "./Exception";
import { InvalidArgumentException } from "./InvalidArgumentException";
import { JsonException } from "./JsonException";
import { LengthException } from "./LengthException";
import { LogicException } from "./LogicException";
import { OutOfBoundsException } from "./OutOfBoundsException";
import { OutOfRangeException } from "./OutOfRangeException";
import { OverflowException } from "./OverflowException";
import { RangeException } from "./RangeException";
import { RuntimeException } from "./RuntimeException";
import { stdClass } from "./stdClass";
import { TypeError } from "./TypeError";
import { UnderflowException } from "./UnderflowException";
import { UnexpectedValueException } from "./UnexpectedValueException";
import { ValueError } from "./ValueError";

const PHP_CLASSES = Symbol.for("xaravel.php.classes");

/** PHP's built-in classes the runtime ports, by PHP's declared name. */
const classes: Readonly<Record<string, abstract new (...args: never[]) => unknown>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, abstract new (...args: never[]) => unknown>, {
    Exception,
    ErrorException,
    Error,
    TypeError,
    ValueError,
    ArgumentCountError,
    ArithmeticError,
    DivisionByZeroError,
    JsonException,
    RuntimeException,
    LogicException,
    InvalidArgumentException,
    DomainException,
    LengthException,
    OutOfRangeException,
    OutOfBoundsException,
    RangeException,
    OverflowException,
    UnderflowException,
    UnexpectedValueException,
    BadFunctionCallException,
    BadMethodCallException,
    stdClass,
    __PHP_Incomplete_Class,
  }),
);

function installGlobal(): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, PHP_CLASSES);
  if (descriptor === undefined) {
    Object.defineProperty(globalThis, PHP_CLASSES, { value: classes, writable: false, configurable: false, enumerable: false });
  } else if (!("value" in descriptor) || descriptor.value !== classes) {
    throw new LogicException("Symbol.for('xaravel.php.classes') was already defined by other code or another copy of @xaravel/runtime; @xaravel/runtime will not install over it");
  }
}

installGlobal();
