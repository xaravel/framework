// PHP's built-in `Stringable` interface (AD-26: `__toString` is `toString()` plus `[Symbol.toPrimitive]`). A contract that extends it extends
// this structural form; it is no contract token, so the token records no parent for it.

/** PHP's `Stringable`. */
export interface Stringable {
  /** The string representation of the object. */
  toString(): string;

  /** The string representation for a string conversion (AD-26: `__toString` is `toString()` plus `[Symbol.toPrimitive]`). */
  [Symbol.toPrimitive](hint: string): string;
}
