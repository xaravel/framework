// PHP's built-in `ArrayAccess` interface (AD-26: `offsetExists` / `offsetGet` / `offsetSet` / `offsetUnset` plus `get()`). A
// contract that extends it extends this structural form; it is no contract token, so the token records no parent for it.

/** PHP's `ArrayAccess`. */
export interface ArrayAccess {
  /** Whether an offset exists. */
  offsetExists(offset: unknown): boolean;

  /** The value at an offset. */
  offsetGet(offset: unknown): unknown;

  /** Assign a value to an offset. */
  offsetSet(offset: unknown, value: unknown): void;

  /** Unset an offset. */
  offsetUnset(offset: unknown): void;

  /** The value at a key: AD-26 pairs `ArrayAccess` with `get()`, as index syntax works only on `Model`. */
  get(key: unknown): unknown;
}
