// PHP's `Iterator` interface as a contract token (ESC-14.1-2), built by `phpInterface`, extending `Traversable`. A
// class carrying its brand also carries `Traversable`'s, and its `[Symbol.iterator]()`, `entries()` and `keys()` run
// PHP's `foreach` protocol over the five methods (`rewind`, then `valid` / `current` / `key` / `next`), yielding the
// values, the `[key, value]` pairs and the keys.
import { phpInterface } from "./phpInterface";
import { Traversable } from "./Traversable";

declare const IteratorBrand: unique symbol;

/** PHP's `Iterator`. */
export interface Iterator extends Traversable {
  readonly [Iterator.brand]: true;
  current(): unknown;
  key(): unknown;
  next(): void;
  rewind(): void;
  valid(): boolean;
}

export const Iterator = phpInterface<Iterator, typeof IteratorBrand>("Iterator", { current: [], key: [], next: [], rewind: [], valid: [] }, [Traversable]);
