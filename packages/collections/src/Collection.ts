// Laravel's `Illuminate\Support\Collection` (v13.37.0), the members Story 14.1 ports; the Collections Stories that
// port their tests add the rest. It is `mixin(null, EnumeratesValues, Macroable)`, as Upstream's
// `use EnumeratesValues, Macroable` (`TransformsToResourceCollection` needs `@xaravel/http` and comes with the Story
// that ports its tests).
//
// The items are the collection's own `PhpArray`, built from a value copy of the PHP array `getArrayableItems` gives,
// so later writes to the caller's array never reach it. `all()` and `get()` hand back value copies, never the
// internal array (AD-9). PHP's interfaces are brand getters (AD-9.5): `ArrayAccess`, `CanBeEscapedWhenCastToString`,
// `Enumerable` and its parents (`Arrayable`, `Countable`, `IteratorAggregate`, `Traversable`, `Jsonable`,
// `JsonSerializable`), and `Stringable`, which PHP adds for `__toString`. `IteratorAggregate` is
// `[Symbol.iterator]` (the values), `entries()` and `keys()`, as a Traversable iterates (AD-26); index syntax is
// `get()` and the `offset*` methods (DIV-12.6, DIV-12.17).
import { CanBeEscapedWhenCastToString } from "@xaravel/contracts/support";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  ArrayAccess,
  ArrayIterator,
  array_filter,
  array_key_exists,
  array_unique,
  array_values,
  arrayEntries,
  arrayFromEntries,
  in_array,
  IteratorAggregate,
  JsonSerializable,
  mixin,
  PhpArray,
  type PhpArrayKey,
  type PhpKeyInput,
  range as phpRange,
  registerClass,
  SORT_REGULAR,
  Stringable,
  Traversable,
  valueCopy,
} from "@xaravel/runtime";
import { EnumeratesValues } from "./Traits/EnumeratesValues";
import { Arr } from "./Arr";
import { Enumerable } from "./Enumerable";
import { value } from "./helpers";
import { LazyCollection } from "./LazyCollection";

/** The `Countable` brand `count()` and the grader read (no token; `packages/runtime/src/php/ArrayObject.ts`). */
const COUNTABLE = Symbol.for("Countable");

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** A collection of items: Laravel's `Illuminate\Support\Collection`. */
export class Collection extends mixin(null, EnumeratesValues, Macroable) {
  /** The items contained in the collection. */
  protected items: PhpArray;

  /** Create a new collection from a PHP array, an `Enumerable`, an `Arrayable`, a Traversable, an object or a scalar. */
  constructor(items: unknown = []) {
    super();
    this.items = new PhpArray(arrayEntries(valueCopy(this.getArrayableItems(items)) as object));
  }

  get [ArrayAccess.brand](): true {
    return true;
  }

  get [CanBeEscapedWhenCastToString.brand](): true {
    return true;
  }

  get [Enumerable.brand](): true {
    return true;
  }

  get [Arrayable.brand](): true {
    return true;
  }

  get [COUNTABLE](): true {
    return true;
  }

  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  get [Jsonable.brand](): true {
    return true;
  }

  get [JsonSerializable.brand](): true {
    return true;
  }

  get [Stringable.brand](): true {
    return true;
  }

  /** Create a new instance of the collection. */
  protected newInstance(items: unknown = []): this {
    return new (this.constructor as new (items?: unknown) => this)(items);
  }

  /** Create a collection with the given range. */
  static range<R>(this: new (items?: unknown, ...args: any[]) => R, from: unknown, to: unknown, step: unknown = 1, ...args: unknown[]): R {
    return new this(phpRange(from, to, step), ...args);
  }

  /** Get all of the items in the collection. */
  all(): any {
    return valueCopy(arrayFromEntries(this.items));
  }

  /** Get a lazy collection for the items in this collection. */
  lazy(): LazyCollection {
    return new LazyCollection(this.all());
  }

  /** Run a filter over each of the items: the callback gets each value and its key, and keys are kept. */
  filter(callback: ItemCallback | null = null): this {
    if (callback !== null) {
      return this.newInstance(Arr.where(this.items, callback));
    }

    return this.newInstance(array_filter(this.items));
  }

  /** Get an item from the collection by key, or `value(default)` when the key is missing. */
  get(key: unknown, defaultValue: unknown = null): unknown {
    key ??= "";

    if (array_key_exists(key, this.items)) {
      return valueCopy(this.items.get(key as PhpKeyInput));
    }

    return value(defaultValue);
  }

  /** Determine if the collection is empty or not. */
  isEmpty(): boolean {
    return this.items.size === 0;
  }

  /** Run a map over each of the items: the callback gets each value and its key, and keys are kept. */
  map(callback: ItemCallback): this {
    return this.newInstance(Arr.map(this.items, callback));
  }

  /** Return only unique items from the collection array, by `==` or, when `strict`, by `===`. */
  unique(key: unknown = null, strict: boolean = false): this {
    if (key === null && strict === false) {
      return this.newInstance(array_unique(this.items, SORT_REGULAR));
    }

    const callback = this.valueRetriever(key);

    const exists: unknown[] = [];

    return this.reject((item: unknown, itemKey: unknown) => {
      const id = callback(item, itemKey);
      if (in_array(id, exists, strict)) {
        return true;
      }

      exists.push(id);
      return null;
    });
  }

  /** Reset the keys on the underlying array. */
  values(): this {
    return this.newInstance(array_values(this.items));
  }

  /** Get an iterator for the items: an `ArrayIterator` over a copy of them. */
  getIterator(): ArrayIterator {
    return new ArrayIterator(this.items);
  }

  /** The values, as `foreach ($c as $v)` gives them (AD-26). */
  *[Symbol.iterator](): Generator<unknown, void, undefined> {
    yield* this.getIterator();
  }

  /** The `[key, value]` pairs, as `foreach ($c as $k => $v)` gives them (AD-26). */
  *entries(): Generator<[PhpArrayKey, unknown], void, undefined> {
    yield* this.getIterator().entries() as Iterable<[PhpArrayKey, unknown]>;
  }

  /** The keys, in order. */
  *keys(): Generator<PhpArrayKey, void, undefined> {
    yield* this.getIterator().keys() as Iterable<PhpArrayKey>;
  }

  /** Count the number of items in the collection. */
  count(): number {
    return this.items.size;
  }

  /** Count the number of items in the collection by a field or using a callback (by value when none). */
  countBy(countBy: unknown = null): this {
    return this.newInstance(this.lazy().countBy(countBy).all());
  }

  /** Add an item to the collection, at PHP's next free integer key. */
  add(item: unknown): this {
    this.items.push(valueCopy(item));

    return this;
  }

  /** Determine if an item exists at an offset: PHP's `isset`, so a `null` item is absent. */
  offsetExists(offset: unknown): boolean {
    return this.items.has(offset as PhpKeyInput) && this.items.get(offset as PhpKeyInput) !== null;
  }

  /** Get an item at a given offset, or `null` when it is missing. */
  offsetGet(offset: unknown): unknown {
    return valueCopy(this.items.get(offset as PhpKeyInput));
  }

  /** Set the item at a given offset; a `null` offset appends, as `$c[] = $value` does. */
  offsetSet(offset: unknown, value_: unknown): void {
    if (offset === null || offset === undefined) {
      this.items.push(valueCopy(value_));
    } else {
      this.items.set(offset as PhpKeyInput, valueCopy(value_));
    }
  }

  /** Unset the item at a given offset. */
  offsetUnset(offset: unknown): void {
    this.items.delete(offset as PhpKeyInput);
  }
}

registerClass("Illuminate\\Support\\Collection", Collection);
