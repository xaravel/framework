// PHP's `ErrorException` (Story 9.10, AD-19): an `Exception` that carries a PHP error's severity.
// `new ErrorException(message = "", code = 0, severity = 1, filename = null, line = null, previous = null)` takes its
// arguments as PHP does in coercive mode (`throwableArguments.ts`), naming `ErrorException::__construct()` (so a bad
// `previous` is argument #6), and keeps the severity behind `getSeverity()`; the default is PHP's `E_ERROR` (1), and a
// `null` severity is 0, as PHP coerces it. `filename` and `line` are coerced and not kept: `getFile()` and `getLine()`
// are not ported.
import { registerClass } from "../registry/registry";
import { Exception } from "./Exception";
import { intArgument, previousArgument, stringArgument } from "./throwableArguments";

export class ErrorException extends Exception {
  readonly #severity: number | bigint;

  constructor(message: string = "", code: number | bigint = 0, severity: number | bigint = 1, filename: string | null = null, line: number | bigint | null = null, previous: globalThis.Error | null = null) {
    const coercedMessage = stringArgument("ErrorException", 1, "message", message);
    const coercedCode = intArgument("ErrorException", 2, "code", code);
    const coercedSeverity = intArgument("ErrorException", 3, "severity", severity);
    stringArgument("ErrorException", 4, "filename", filename, true);
    intArgument("ErrorException", 5, "line", line, true);
    const coercedPrevious = previousArgument("ErrorException", 6, previous);
    super(coercedMessage, coercedCode, coercedPrevious);
    this.#severity = coercedSeverity;
  }

  /** PHP's `getSeverity()`; `E_ERROR` (1) on an object built without the constructor (`phpUnserialize`). */
  getSeverity(): number | bigint {
    return #severity in this ? this.#severity : 1;
  }
}

registerClass("ErrorException", ErrorException);
