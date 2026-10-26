// A position over a live insertion-ordered collection, as PHP's hash iteration keeps one (ESC-14.1-2). Internal:
// `ArrayIterator` and `WeakMap`'s `InternalIterator` share it, with the `foreach` generators below.
//
// PHP's position is a bucket index. Here it is approximated by an insertion sequence: the source gives each item a
// sequence number, strictly increasing along its live order (an item deleted and set again is a new item with a new,
// larger sequence, at the end), and the last sequence it handed out. The cursor stands on the first live item whose
// sequence is at least its mark, so:
//
// - it follows insertion order, and an item deleted under it moves it to the next one, as PHP's iterator update does
//   (a later `next()` then steps past that one);
// - past the end its mark is beyond the last item, so an item appended later is reached, also after the last entry
//   it stood on was deleted (it re-reads the collection only when a later sequence exists);
// - a deleted-and-re-set key is visited again at its new place.
//
// The source's order map is the collection's identity. When it is replaced (an `ArrayObject`'s `exchangeArray`), the
// cursor keeps its position index: it stands on the item at the same index of the new order, or past the end. This
// follows insertion order, not PHP's bucket indexes, which count the holes of a table not yet compacted. A cursor
// starts at the first item. It is registered under a Xaravel name, as `PhpArray` is (AD-10).
import { registerClass } from "../registry/registry";

/** What a cursor walks: the live order (item → insertion sequence) and the last sequence handed out. */
export interface CursorSource<T> {
  /** Each live item and its sequence, in order; a new map when the collection's contents are replaced. */
  order(): ReadonlyMap<T, number>;
  /** The largest sequence handed out so far in the current order. */
  lastSeq(): number;
  /** Whether an item in the order still counts (a `WeakMap` entry whose key was collected does not). */
  alive?(item: T): boolean;
}

/** The position of a PHP iterator over a live collection whose items are `T`. */
export class LiveCursor<T> {
  readonly #source: CursorSource<T>;
  /** The order the position refers to; null before the first read. */
  #order: ReadonlyMap<T, number> | null = null;
  /** The cursor stands on the first live item whose sequence is at least this. */
  #mark = 0;
  /** A live iterator of `#order` that has yielded the items up to the current one. */
  #iterator: globalThis.Iterator<[T, number]> | null = null;
  #current: { readonly item: T; readonly seq: number } | null = null;

  constructor(source: CursorSource<T>) {
    this.#source = source;
  }

  /** Moves to the first item. */
  rewind(): void {
    this.#order = this.#source.order();
    this.#mark = 0;
    this.#iterator = null;
    this.#current = null;
  }

  /** The item the cursor stands on, or null past the end. */
  item(): { readonly item: T } | null {
    return this.#resolve();
  }

  /** Moves to the next item; past the end it stays where it is. */
  next(): void {
    const current = this.#resolve();
    if (current !== null) {
      this.#mark = current.seq + 1;
      this.#current = null;
    }
  }

  #alive(item: T): boolean {
    return this.#source.alive === undefined || this.#source.alive(item);
  }

  /** The current item, after following an order change and stepping off a deleted item. */
  #resolve(): { readonly item: T; readonly seq: number } | null {
    const order = this.#source.order();
    if (this.#order === null) {
      this.#order = order;
    } else if (order !== this.#order) {
      this.#carry(this.#order, order);
    }
    const current = this.#current;
    if (current !== null && order.get(current.item) === current.seq && this.#alive(current.item)) {
      return current;
    }
    this.#current = null;
    if (this.#mark > this.#source.lastSeq()) {
      return null;
    }
    const iterator = this.#iterator ?? order.entries();
    for (;;) {
      const step = iterator.next();
      if (step.done === true) {
        this.#iterator = null;
        return null;
      }
      const [item, seq] = step.value;
      if (seq >= this.#mark && this.#alive(item)) {
        this.#iterator = iterator;
        this.#current = { item, seq };
        this.#mark = seq;
        return this.#current;
      }
    }
  }

  /** Moves the position from `from` to the item at the same index of `to`, or past its end. */
  #carry(from: ReadonlyMap<T, number>, to: ReadonlyMap<T, number>): void {
    let index = 0;
    for (const [item, seq] of from) {
      if (seq >= this.#mark) {
        break;
      }
      if (this.#alive(item)) {
        index++;
      }
    }
    this.#order = to;
    this.#iterator = null;
    this.#current = null;
    this.#mark = this.#source.lastSeq() + 1;
    for (const [item, seq] of to) {
      if (!this.#alive(item)) {
        continue;
      }
      if (index === 0) {
        this.#mark = seq;
        return;
      }
      index--;
    }
  }
}

/** The five methods of PHP's `Iterator`, as the `foreach` generators call them. */
export interface IteratorMethods {
  rewind(): void;
  valid(): boolean;
  current(): unknown;
  key(): unknown;
  next(): void;
}

/**
 * PHP's `foreach ($it as $k => $v)` over an `Iterator`: `rewind()`, then while `valid()`, `current()` and `key()` as one
 * `[key, value]` pair, then `next()`. The `entries()` of the runtime's Iterator classes.
 */
export function* foreachIterator(iterator: IteratorMethods): Generator<[unknown, unknown], void, undefined> {
  iterator.rewind();
  while (iterator.valid()) {
    const value = iterator.current();
    const key = iterator.key();
    yield [key, value];
    iterator.next();
  }
}

/**
 * PHP's `foreach ($it as $v)`: `rewind()`, then while `valid()`, `current()` (PHP reads no key here), then `next()`.
 * The `[Symbol.iterator]()` of the runtime's Iterator classes.
 */
export function* foreachValues(iterator: IteratorMethods): Generator<unknown, void, undefined> {
  iterator.rewind();
  while (iterator.valid()) {
    yield iterator.current();
    iterator.next();
  }
}

/** The keys `foreachIterator` reads. The `keys()` of the runtime's Iterator classes. */
export function* foreachKeys(iterator: IteratorMethods): Generator<unknown, void, undefined> {
  for (const [key] of foreachIterator(iterator)) {
    yield key;
  }
}

registerClass("Xaravel\\Runtime\\Php\\LiveCursor", LiveCursor);
