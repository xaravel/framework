// PHP's `Exception` (Story 9.10; AD-19 and the spine's Consistency Conventions "Errors" row): the root of PHP's
// exceptions, a JS `Error` subclass, so a port can `catch (e) { if (e instanceof Exception) … }` as PHP catches
// `\Exception`. It is never a PHP `Error`.
//
// `new Exception(message = "", code = 0, previous = null)` takes its arguments as PHP does in coercive mode
// (`throwableArguments.ts`: a `null` message is `""`, a numeric-string code its int) and keeps them behind
// `getMessage()`, `getCode()` and `getPrevious()`; a non-null `previous` is also the JS `cause`.
// `code` is an own, writable, non-enumerable property, and `name` the class's FQCN brand, so a registered subclass
// shows its FQCN in a JS stack. A subclass's PHP defaults (`protected $code = 404`) are ported in its constructor,
// never as JS fields, which would be set after `super()` and override an explicit code (`docs/exceptions.md`). It
// carries the `Throwable` and `Stringable` brands (ESC-14.1-2), which every subclass inherits.
import { registerClass } from "../registry/registry";
import { Stringable } from "./Stringable";
import { causeOf, initThrowable, intArgument, previousArgument, stringArgument } from "./throwableArguments";
import { Throwable } from "./Throwable";

export class Exception extends globalThis.Error implements Throwable {
  /** PHP's `$code`. */
  declare code: number | bigint;
  readonly #previous: globalThis.Error | null;

  constructor(message: string = "", code: number | bigint = 0, previous: globalThis.Error | null = null) {
    const coercedMessage = stringArgument("Exception", 1, "message", message);
    const coercedCode = intArgument("Exception", 2, "code", code);
    const coercedPrevious = previousArgument("Exception", 3, previous);
    super(coercedMessage, causeOf(coercedPrevious));
    initThrowable(this, new.target, "Exception", coercedCode);
    this.#previous = coercedPrevious;
  }

  /** PHP's `Throwable` brand (ESC-14.1-2): every PHP throwable the runtime ports is `instanceof Throwable`. */
  get [Throwable.brand](): true {
    return true;
  }

  /** PHP's `Stringable` brand, which `Throwable` extends; the JS `toString()` is kept. */
  get [Stringable.brand](): true {
    return true;
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

registerClass("Exception", Exception);
