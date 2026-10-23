// PHP's built-in `Countable` interface (AD-26: `count()`). A contract that extends it extends this structural form;
// it is no contract token, so the token records no parent for it.

/** PHP's `Countable`. */
export interface Countable {
  /** Count elements of an object. */
  count(): number;
}
