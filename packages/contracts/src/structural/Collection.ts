// Illuminate\Support\Collection, as a contract names it (AD-1.2): a subset of its public methods (`getIterator()` is
// `[Symbol.iterator]`, AD-26), so the later `@xaravel/collections` port satisfies it.
import type { Countable } from "./Countable";
import type { IteratorAggregate } from "./IteratorAggregate";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A collection of items. */
export interface Collection extends Countable, IteratorAggregate {
  /** Get all of the items in the collection. */
  all(): PhpArrayLike;

  /** Determine if the collection is empty or not. */
  isEmpty(): boolean;

  /** Get the collection of items as a plain array. */
  toArray(): PhpArrayLike;
}
