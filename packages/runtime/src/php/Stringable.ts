// PHP's `Stringable` interface as a contract token (ESC-14.1-2), built by `phpInterface`; `__toString` is a built-in
// method (`Symbol.for('xaravel.contract.builtins')`). PHP adds `Stringable` to any class declaring `__toString`; a
// port's `toString()` is its `__toString`, so a class porting one carries the brand itself.
import { phpInterface } from "./phpInterface";

declare const StringableBrand: unique symbol;

/** PHP's `Stringable`: its `__toString` is the port's `toString()`. */
export interface Stringable {
  readonly [Stringable.brand]: true;
  toString(): string;
}

export const Stringable = phpInterface<Stringable, typeof StringableBrand>("Stringable", {}, [], ["__toString"]);
