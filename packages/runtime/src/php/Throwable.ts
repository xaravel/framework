// PHP's `Throwable` interface as a contract token (ESC-14.1-2), built by `phpInterface`, extending `Stringable`. The
// runtime's `Error` and `Exception` carry its brand and `Stringable`'s, so every PHP throwable the runtime ports is
// `instanceof Throwable`; a JS `Error` is not. The token lists PHP's seven methods; the runtime's throwables port
// `getMessage`, `getCode` and `getPrevious`, so the other four are optional in the TS interface.
import { phpInterface } from "./phpInterface";
import { Stringable } from "./Stringable";

declare const ThrowableBrand: unique symbol;

/** PHP's `Throwable`. */
export interface Throwable extends Stringable {
  readonly [Throwable.brand]: true;
  getMessage(): string;
  getCode(): number | bigint;
  getFile?(): string;
  getLine?(): number;
  getTrace?(): unknown;
  getPrevious(): globalThis.Error | null;
  getTraceAsString?(): string;
}

export const Throwable = phpInterface<Throwable, typeof ThrowableBrand>(
  "Throwable",
  { getMessage: [], getCode: [], getFile: [], getLine: [], getTrace: [], getPrevious: [], getTraceAsString: [] },
  [Stringable],
);
