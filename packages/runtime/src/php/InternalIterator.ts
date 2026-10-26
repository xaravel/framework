// PHP's `InternalIterator` (ESC-14.1-2): the `Iterator` an internal class's `getIterator()` returns, here `WeakMap`'s.
// Its constructor is private in PHP: `new InternalIterator()` throws PHP's `Error`, and only the runtime builds one,
// over a live position (`LiveCursor`) and the key and value each item stands for. It carries the `Iterator` and
// `Traversable` brands; `[Symbol.iterator]()` yields the values, `entries()` the pairs and `keys()` the keys, by PHP's
// `foreach` protocol. `phpSerialize` and `phpUnserialize` refuse it with PHP's `Exception`, as PHP does.
import { registerClass } from "../registry/registry";
import { Error as PhpError } from "./Error";
import { Exception } from "./Exception";
import { Iterator } from "./Iterator";
import { foreachIterator, foreachKeys, foreachValues, type LiveCursor } from "./liveCursor";
import { Traversable } from "./Traversable";

/** What an `InternalIterator` walks: a position, and the key and value of the item it stands on. */
export interface InternalSource<T> {
  readonly cursor: LiveCursor<T>;
  key(item: T): unknown;
  current(item: T): unknown;
}

/** The runtime's key to the private constructor. */
const CREATE: unique symbol = Symbol("InternalIterator");

export class InternalIterator implements Iterator {
  readonly #source: InternalSource<unknown>;

  /** Private in PHP: throws PHP's `Error`; the runtime builds one with `internalIterator`. */
  constructor(...args: unknown[]) {
    if (args[0] !== CREATE) {
      throw new PhpError("Call to private InternalIterator::__construct() from global scope");
    }
    this.#source = args[1] as InternalSource<unknown>;
  }

  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  current(): unknown {
    const item = this.#source.cursor.item();
    return item === null ? null : this.#source.current(item.item);
  }

  key(): unknown {
    const item = this.#source.cursor.item();
    return item === null ? null : this.#source.key(item.item);
  }

  next(): void {
    this.#source.cursor.next();
  }

  rewind(): void {
    this.#source.cursor.rewind();
  }

  valid(): boolean {
    return this.#source.cursor.item() !== null;
  }

  /** PHP refuses to serialize an InternalIterator. */
  __serialize(): never {
    throw new Exception("Serialization of 'InternalIterator' is not allowed");
  }

  /** PHP refuses to unserialize an InternalIterator. */
  __unserialize(_data: unknown): never {
    throw new Exception("Unserialization of 'InternalIterator' is not allowed");
  }

  /** The values, by PHP's `foreach` protocol. */
  [Symbol.iterator](): Generator<unknown, void, undefined> {
    return foreachValues(this);
  }

  /** The `[key, value]` pairs, by PHP's `foreach` protocol. */
  entries(): Generator<[unknown, unknown], void, undefined> {
    return foreachIterator(this);
  }

  /** The keys, by PHP's `foreach` protocol. */
  keys(): Generator<unknown, void, undefined> {
    return foreachKeys(this);
  }
}

/** An `InternalIterator` over `source`. Internal. */
export function internalIterator<T>(source: InternalSource<T>): InternalIterator {
  return new InternalIterator(CREATE, source);
}

registerClass("InternalIterator", InternalIterator);
