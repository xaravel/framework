// PHP's built-in `IteratorAggregate` interface (AD-26: `getIterator()` is `[Symbol.iterator]`). A contract that
// extends it extends this structural form; it is no contract token, so the token records no parent for it.

/** PHP's `IteratorAggregate`. */
export interface IteratorAggregate {
  /** Retrieve an external iterator. */
  [Symbol.iterator](): Iterator<unknown>;
}
