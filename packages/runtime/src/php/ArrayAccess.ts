// PHP's `ArrayAccess` interface as a contract token (action item epic-14-item-3-runtime-type-tests-functions,
// ESC-14.1-9), built by `phpInterface` over the `Symbol.for("ArrayAccess")` brand `ArrayObject`, `ArrayIterator` and
// `WeakMap` already carry. Its members are PHP's: `offsetExists`, `offsetGet`, `offsetSet` and `offsetUnset`.
import { phpInterface } from "./phpInterface";

declare const ArrayAccessBrand: unique symbol;

/** PHP's `ArrayAccess`: `$x[$k]` reads and writes through its four `offset*` methods. */
export interface ArrayAccess {
  readonly [ArrayAccess.brand]: true;
  offsetExists(offset: unknown): boolean;
  offsetGet(offset: unknown): unknown;
  offsetSet(offset: unknown, value: unknown): void;
  offsetUnset(offset: unknown): void;
}

export const ArrayAccess = phpInterface<ArrayAccess, typeof ArrayAccessBrand>("ArrayAccess", {
  offsetExists: ["offset"],
  offsetGet: ["offset"],
  offsetSet: ["offset", "value"],
  offsetUnset: ["offset"],
});
