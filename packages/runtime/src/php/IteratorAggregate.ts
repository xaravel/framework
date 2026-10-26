// PHP's `IteratorAggregate` interface as a contract token (ESC-14.1-2), built by `phpInterface`, extending
// `Traversable`; `getIterator` is a built-in method (`Symbol.for('xaravel.contract.builtins')`), as `contract()` lists
// it for a contract with this parent. A class carrying its brand also carries `Traversable`'s, and its
// `[Symbol.iterator]()`, `entries()` and `keys()` iterate what `getIterator()` returns.
import { phpInterface } from "./phpInterface";
import { Traversable } from "./Traversable";

declare const IteratorAggregateBrand: unique symbol;

/** PHP's `IteratorAggregate`. */
export interface IteratorAggregate extends Traversable {
  readonly [IteratorAggregate.brand]: true;
  getIterator(): Traversable;
}

export const IteratorAggregate = phpInterface<IteratorAggregate, typeof IteratorAggregateBrand>("IteratorAggregate", {}, [Traversable], ["getIterator"]);
