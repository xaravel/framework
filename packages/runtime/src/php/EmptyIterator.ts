// PHP's `EmptyIterator` (action item epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator,
// ESC-15.2-6), a port of PHP 8.5.11's `ext/spl/spl_iterators.c`: an `Iterator` with no elements. `valid()` is false,
// `next()` and `rewind()` do nothing, and `current()` and `key()` throw PHP's `BadMethodCallException`. The class
// carries the `Iterator` and `Traversable` brands; `[Symbol.iterator]()` yields the values, `entries()` the pairs and
// `keys()` the keys, by PHP's `foreach` protocol, so each yields nothing. It has no properties: its props
// (`[Symbol.for('xaravel.php.props')]()`, which `looseEquals` needs to compare two by value) are a subclass's own
// enumerable string properties, none for an `EmptyIterator`, so `(array)`, `json_encode` and `serialize` see an object
// with none and two compare `==`. It is not final, as in PHP.
import { registerClass } from "../registry/registry";
import { BadMethodCallException } from "./BadMethodCallException";
import { Iterator } from "./Iterator";
import { foreachIterator, foreachKeys, foreachValues } from "./liveCursor";
import { PhpArray } from "./PhpArray";
import { Traversable } from "./Traversable";

const PHP_PROPS = Symbol.for("xaravel.php.props");

export class EmptyIterator implements Iterator {
  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  /** Always throws PHP's `BadMethodCallException`: there is no value. */
  current(): never {
    throw new BadMethodCallException("Accessing the value of an EmptyIterator");
  }

  /** Always throws PHP's `BadMethodCallException`: there is no key. */
  key(): never {
    throw new BadMethodCallException("Accessing the key of an EmptyIterator");
  }

  /** Does nothing. */
  next(): void {}

  /** Always false. */
  valid(): boolean {
    return false;
  }

  /** Does nothing. */
  rewind(): void {}

  /** The own enumerable string properties, in order, as a PHP array (none for an `EmptyIterator`); `undefined` reads as `null`. */
  [PHP_PROPS](): PhpArray {
    return new PhpArray(Object.keys(this).map((key) => [key, (this as unknown as Record<string, unknown>)[key] ?? null] as const));
  }

  /** The values, by PHP's `foreach` protocol: none. */
  [Symbol.iterator](): Generator<unknown, void, undefined> {
    return foreachValues(this);
  }

  /** The `[key, value]` pairs, by PHP's `foreach` protocol: none. */
  entries(): Generator<[unknown, unknown], void, undefined> {
    return foreachIterator(this);
  }

  /** The keys, by PHP's `foreach` protocol: none. */
  keys(): Generator<unknown, void, undefined> {
    return foreachKeys(this);
  }
}

registerClass("EmptyIterator", EmptyIterator);
