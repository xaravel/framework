// PHP's `ErrorException` (Story 9.10, AD-19): an `Exception` that carries a PHP error's severity.
// `new ErrorException(message = "", code = 0, severity = 1, filename = null, line = null, previous = null)` checks its
// arguments as PHP does, naming `ErrorException::__construct()` (so a bad `previous` is argument #6), and keeps the
// severity behind `getSeverity()`; the default is PHP's `E_ERROR` (1). `filename` and `line` are checked and not kept:
// `getFile()` and `getLine()` are not ported.
import { registerClass } from "../registry/registry";
import { Exception } from "./Exception";
import { checkArgument } from "./throwableArguments";

export class ErrorException extends Exception {
  readonly #severity: number | bigint;

  constructor(message: string = "", code: number | bigint = 0, severity: number | bigint = 1, filename: string | null = null, line: number | bigint | null = null, previous: globalThis.Error | null = null) {
    checkArgument("ErrorException", 1, "message", "string", message);
    checkArgument("ErrorException", 2, "code", "int", code);
    checkArgument("ErrorException", 3, "severity", "int", severity);
    checkArgument("ErrorException", 4, "filename", "?string", filename);
    checkArgument("ErrorException", 5, "line", "?int", line);
    checkArgument("ErrorException", 6, "previous", "?Throwable", previous);
    super(message, code, previous);
    this.#severity = severity;
  }

  /** PHP's `getSeverity()`; `E_ERROR` (1) on an object built without the constructor (`phpUnserialize`). */
  getSeverity(): number | bigint {
    return #severity in this ? this.#severity : 1;
  }
}

registerClass("ErrorException", ErrorException);
