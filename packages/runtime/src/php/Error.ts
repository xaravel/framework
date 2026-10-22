// PHP's `Error` (Story 9.10; AD-19 and the spine's Consistency Conventions "Errors" row): the root of PHP's internal
// errors, a JS `Error` subclass, so a port can `catch (e) { if (e instanceof Error) … }` as PHP catches `\Error`. It is
// never a PHP `Exception`; a module that needs the JS `Error` too imports this one under an alias (`Error as PhpError`).
//
// `new Error(message = "", code = 0, previous = null)` checks its arguments as PHP does (`throwableArguments.ts`)
// and keeps them behind `getMessage()`, `getCode()` and `getPrevious()`; a non-null `previous` is also the JS `cause`.
// `code` is an own, writable, non-enumerable property, and `name` the class's FQCN brand, so a registered subclass
// shows its FQCN in a JS stack. A subclass's PHP defaults (`protected $code = 404`) are ported in its constructor,
// never as JS fields, which would be set after `super()` and override an explicit code (`docs/exceptions.md`).
import { registerClass } from "../registry/registry";
import { causeOf, checkArgument, initThrowable } from "./throwableArguments";

export class Error extends globalThis.Error {
  /** PHP's `$code`. */
  declare code: number | bigint;
  readonly #previous: globalThis.Error | null;

  constructor(message: string = "", code: number | bigint = 0, previous: globalThis.Error | null = null) {
    checkArgument("Error", 1, "message", "string", message);
    checkArgument("Error", 2, "code", "int", code);
    checkArgument("Error", 3, "previous", "?Throwable", previous);
    super(message, causeOf(previous));
    initThrowable(this, new.target, "Error", code);
    this.#previous = previous;
  }

  /** PHP's `getMessage()`. */
  getMessage(): string {
    return this.message;
  }

  /** PHP's `getCode()`; 0 on an object built without the constructor (`phpUnserialize`). */
  getCode(): number | bigint {
    return this.code ?? 0;
  }

  /** PHP's `getPrevious()`: the previous throwable, or null. */
  getPrevious(): globalThis.Error | null {
    return #previous in this ? this.#previous : null;
  }
}

registerClass("Error", Error);
