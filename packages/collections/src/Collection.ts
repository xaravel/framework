// Laravel's `Illuminate\Support\Collection` (v13.37.0), the members Stories 14.1 and 14.2 port; the Collections
// Stories that port their tests add the rest. It is `mixin(null, EnumeratesValues, Macroable)`, as Upstream's
// `use EnumeratesValues, Macroable` (`TransformsToResourceCollection` needs `@xaravel/http` and comes with the Story
// that ports its tests).
//
// The items are the collection's own `PhpArray`, built from a value copy of the PHP array `getArrayableItems` gives,
// so later writes to the caller's array never reach it. `all()` and `get()` hand back value copies, never the
// internal array (AD-9). PHP's interfaces are brand getters (AD-9.5): `ArrayAccess`, `CanBeEscapedWhenCastToString`,
// `Enumerable` and its parents (`Arrayable`, `Countable`, `IteratorAggregate`, `Traversable`, `Jsonable`,
// `JsonSerializable`), and `Stringable`, which PHP adds for `__toString`. `IteratorAggregate` is
// `[Symbol.iterator]` (the values) and `entries()`, as a Traversable iterates (AD-26); `keys()` is Upstream's member,
// a collection of the keys, which iterates as the keys; index syntax is `get()` and the `offset*` methods (DIV-12.6,
// DIV-12.17).
//
// The members that change the items in place through PHP's by-reference array functions (`pop`, `shift`, `unshift`,
// `splice`, `pull`) hand them a `Ref` over the items (DIV-9.2) and keep what it holds afterwards as the items, a
// `PhpArray`. `func_num_args()` is `arguments.length`, read in `function` methods only, and `func_get_args()` forwards
// `...arguments` unchanged. `contains`, `doesntContain`, `doesntContainStrict`, `sole`, `hasSole`, `firstOrFail`,
// `first` and `last` keep only the positional form, and a lone object is the PHP value (DIV-12.20); `random` and
// `splice` also take an options object (AD-26).
import { CanBeEscapedWhenCastToString } from "@xaravel/contracts/support";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  abs,
  ArrayAccess,
  ArrayIterator,
  array_all,
  array_any,
  array_filter,
  array_find_key,
  array_key_exists,
  array_keys,
  array_pop,
  array_search,
  array_shift,
  array_slice,
  array_splice,
  array_unique,
  array_unshift,
  array_values,
  arrayEntries,
  arrayFromEntries,
  identical,
  in_array,
  InvalidArgumentException,
  is_array,
  is_callable,
  IteratorAggregate,
  JsonSerializable,
  looseEquals,
  min,
  mixin,
  PhpArray,
  type PhpArrayKey,
  type PhpKeyInput,
  range as phpRange,
  Ref,
  registerClass,
  SORT_REGULAR,
  stdClass,
  Stringable,
  toInt,
  Traversable,
  valueCopy,
} from "@xaravel/runtime";
import { EnumeratesValues } from "./Traits/EnumeratesValues";
import { Arr } from "./Arr";
import { Enumerable } from "./Enumerable";
import { data_get, value } from "./helpers";
import { ItemNotFoundException } from "./ItemNotFoundException";
import { LazyCollection } from "./LazyCollection";
import { MultipleItemsFoundException } from "./MultipleItemsFoundException";
import { callCallable, isOptionsObject } from "./support/callables";

/** The `Countable` brand `count()` and the grader read (no token; `packages/runtime/src/php/ArrayObject.ts`). */
const COUNTABLE = Symbol.for("Countable");

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** The arguments of a `($key, $operator = null, $value = null)` member, as `func_get_args()` forwards them. */
type WhereArguments = [key: unknown, operator?: unknown, value?: unknown];

/** What a `HigherOrderWhenProxy` from `unless($condition)` answers: the collection's `filter`, or the collection. */
interface WhenFilterProxy {
  filter(callback: unknown): Collection;
}

/**
 * The items a by-reference array function left in `ref.value`, as the collection keeps them: a `PhpArray` as it is
 * (with PHP's next free index), any other PHP array as a `PhpArray` of its entries.
 */
function itemsOf(ref: Ref<unknown>): PhpArray {
  return asItems(ref.value);
}

/** A PHP array as the collection keeps its items: a `PhpArray` as it is, any other form as a `PhpArray` of it. */
function asItems(array: unknown): PhpArray {
  return array instanceof PhpArray ? array : new PhpArray(arrayEntries(array as object));
}

/** A callback that gets a value copy of each item (AD-9), as every callback of the collection does. */
function withCopies(callback: unknown): ItemCallback {
  return (value_: unknown, key: unknown) => callCallable(callback, valueCopy(value_), key);
}

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
      return this.newInstance(Arr.where(this.items, (value_: unknown, key: unknown) => callback(valueCopy(value_), key)));
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
    return this.newInstance(Arr.map(this.items, (value_: unknown, key: unknown) => callback(valueCopy(value_), key)));
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

  /**
   * Determine if an item exists in the collection: with one argument, an item `==` the value, or one a callback
   * accepts; with more, an item matching `where(key, operator, value)`.
   */
  contains(key: unknown, operator: unknown = null, value_: unknown = null): boolean {
    void operator;
    void value_;
    if (arguments.length === 1) {
      if (this.useAsCallable(key)) {
        return array_any(this.items, withCopies(key));
      }

      return in_array(key, this.items);
    }

    return this.contains(this.operatorForWhere(...([...arguments] as WhereArguments)));
  }

  /** Determine if an item exists, using strict comparison (PHP's `===`); with a value, by an item's `key`. */
  containsStrict(key: unknown, value_: unknown = null): boolean {
    if (arguments.length === 2) {
      return this.contains((item: unknown) => identical(data_get(item, key), value_));
    }

    if (this.useAsCallable(key)) {
      return array_any(this.items, withCopies(key));
    }

    return in_array(key, this.items, true);
  }

  /** Determine if an item is not contained in the collection. */
  doesntContain(key: unknown, operator: unknown = null, value_: unknown = null): boolean {
    void key;
    void operator;
    void value_;
    return !this.contains(...([...arguments] as WhereArguments));
  }

  /** Determine if an item is not contained in the enumerable, using strict comparison. */
  doesntContainStrict(key: unknown, operator: unknown = null, value_: unknown = null): boolean {
    void key;
    void operator;
    void value_;
    return !this.containsStrict(...([...arguments] as [key: unknown, value?: unknown]));
  }

  /** Get all items except for those with the specified keys (a list, an `Enumerable`, or the keys as arguments). */
  except(keys: unknown, ...moreKeys: unknown[]): this {
    void moreKeys;
    if (keys === null) {
      return this.newInstance(this.items);
    }

    if (keys instanceof Enumerable) {
      keys = keys.all();
    } else if (!is_array(keys)) {
      keys = [...arguments];
    }

    return this.newInstance(Arr.except(this.items, keys));
  }

  /** Get the first item passing the given truth test (or the first item), or `value(default)`. */
  first(callback: ItemCallback | null = null, defaultValue: unknown = null): any {
    return Arr.first(this.items, callback, defaultValue);
  }

  /** Remove an item from the collection by key (a key, a list of keys, or an `Arrayable` of them). */
  forget(keys: unknown): this {
    for (const key of arrayEntries(this.getArrayableItems(keys) as object).map(([, item]) => item)) {
      this.offsetUnset(key);
    }

    return this;
  }

  /** Get an item from the collection by key or add it to the collection (`value(value)`) if it does not exist. */
  getOrPut(key: unknown, value_: unknown): unknown {
    if (array_key_exists(key ?? "", this.items)) {
      return valueCopy(this.items.get((key ?? "") as PhpKeyInput));
    }

    this.offsetSet(key, (value_ = value(value_)));

    return value_;
  }

  /** Determine if all of the keys exist in the collection (a list, or the keys as arguments). */
  has(key: unknown, ...moreKeys: unknown[]): boolean {
    void moreKeys;
    const keys = is_array(key) ? key : [...arguments];

    return array_all(keys, (key_: unknown) => array_key_exists(key_ ?? "", this.items));
  }

  /** Determine if any of the keys exist in the collection (a list, or the keys as arguments). */
  hasAny(key: unknown, ...moreKeys: unknown[]): boolean {
    void moreKeys;
    if (this.isEmpty()) {
      return false;
    }

    const keys = is_array(key) ? key : [...arguments];

    return array_any(keys, (key_: unknown) => array_key_exists(key_ ?? "", this.items));
  }

  /**
   * Determine if the collection contains a single item, optionally one the callback accepts.
   *
   * @deprecated 12.49.0 Use the `hasSole()` method instead.
   */
  containsOneItem(callback: ItemCallback | null = null): boolean {
    return this.hasSole(callback);
  }

  /**
   * Determine if the collection contains multiple items, optionally ones the callback accepts.
   *
   * @deprecated 12.50.0 Use the `hasMany()` method instead.
   */
  containsManyItems(callback: ItemCallback | null = null): boolean {
    return this.hasMany(callback);
  }

  /** Get the keys of the collection items, as a collection. */
  keys(): this {
    return this.newInstance(array_keys(this.items));
  }

  /** Get the last item passing the given truth test (or the last item), or `value(default)`. */
  last(callback: ItemCallback | null = null, defaultValue: unknown = null): any {
    return Arr.last(this.items, callback, defaultValue);
  }

  /** Get the values of a given key ("dot" notation, segments or a Closure), keyed by `key` when given. */
  pluck(value_: unknown, key: unknown = null): this {
    return this.newInstance(Arr.pluck(this.items, value_, key));
  }

  /** Create a new collection consisting of every n-th element, from `offset`. Throws for a step below 1. */
  nth(step: number, offset: number = 0): this {
    if (step < 1) {
      throw new InvalidArgumentException("Step value must be at least 1.");
    }

    const new_: unknown[] = [];

    let position = 0;

    for (const item of this.slice(offset).items.values()) {
      // PHP's `$position % $step` is an int modulo: each operand is cast to int.
      if (Number(toInt(position)) % Number(toInt(step)) === 0) {
        new_.push(item);
      }

      position++;
    }

    return this.newInstance(new_);
  }

  /** Get the items with the specified keys (a list, an `Enumerable`, or the keys as arguments); `null` keeps all. */
  only(keys: unknown, ...moreKeys: unknown[]): this {
    void moreKeys;
    if (keys === null) {
      return this.newInstance(this.items);
    }

    if (keys instanceof Enumerable) {
      keys = keys.all();
    }

    keys = is_array(keys) ? keys : [...arguments];

    return this.newInstance(Arr.only(this.items, keys));
  }

  /** Select specific values from the items within the collection; `null` keeps every item as it is. */
  select(keys: unknown, ...moreKeys: unknown[]): this {
    void moreKeys;
    if (keys === null) {
      return this.newInstance(this.items);
    }

    if (keys instanceof Enumerable) {
      keys = keys.all();
    }

    keys = is_array(keys) ? keys : [...arguments];

    return this.newInstance(Arr.select(this.items, keys));
  }

  /** Get and remove the last item (`count` 1), or the last `count` items as a collection, last first. */
  pop(count: number = 1): any {
    if (count < 1) {
      return this.newInstance();
    }

    if (count === 1) {
      const ref = new Ref<unknown>(this.items);
      const popped = array_pop(ref);
      this.items = itemsOf(ref);
      return popped;
    }

    if (this.isEmpty()) {
      return this.newInstance();
    }

    const results: unknown[] = [];

    const collectionCount = this.count();

    const ref = new Ref<unknown>(this.items);
    for (const item of phpRange(1, min(count, collectionCount)) as unknown[]) {
      void item;
      results.push(array_pop(ref));
    }
    this.items = itemsOf(ref);

    return this.newInstance(results);
  }

  /** Push an item onto the beginning of the collection, under `key` when one is given. */
  prepend(value_: unknown, key: unknown = null): this {
    void key;
    this.items = asItems(Arr.prepend(this.items, ...((arguments.length > 1 ? [...arguments] : [value_]) as [unknown, unknown?])));

    return this;
  }

  /** Push one or more items onto the end of the collection. */
  push(...values: unknown[]): this {
    for (const value_ of values) {
      this.items.push(valueCopy(value_));
    }

    return this;
  }

  /** Prepend one or more items to the beginning of the collection (int keys renumbered). */
  unshift(...values: unknown[]): this {
    const ref = new Ref<unknown>(this.items);
    array_unshift(ref, ...values.map((value_) => valueCopy(value_)));
    this.items = itemsOf(ref);

    return this;
  }

  /** Get and remove an item from the collection ("dot" notation), or `value(default)`. */
  pull(key: unknown, defaultValue: unknown = null): unknown {
    const ref = new Ref<unknown>(this.items);
    const pulled = Arr.pull(ref, key, defaultValue);
    this.items = itemsOf(ref);

    return pulled;
  }

  /** Put an item in the collection by key. */
  put(key: unknown, value_: unknown): this {
    this.offsetSet(key, value_);

    return this;
  }

  /**
   * Get one item randomly (`number` null), or `number` items as a collection (a callable `number` gets the collection
   * and gives the count; keyed as here with `preserveKeys`). Also takes AD-26's options object `{ number,
   * preserveKeys }`. Throws `InvalidArgumentException` when more items are requested than the collection holds.
   */
  random(number?: unknown, preserveKeys?: boolean): any;
  random(options?: { number?: unknown; preserveKeys?: boolean }): any;
  random(number: unknown = null, preserveKeys: boolean = false): any {
    if (arguments.length === 1 && isOptionsObject(number)) {
      ({ number = null, preserveKeys = false } = number as { number?: unknown; preserveKeys?: boolean });
    }

    if (number === null) {
      return Arr.random(this.items);
    }

    if (is_callable(number)) {
      return this.newInstance(Arr.random(this.items, callCallable(number, this), preserveKeys));
    }

    return this.newInstance(Arr.random(this.items, number, preserveKeys));
  }

  /** Search the collection for a value (`==`, or `===` when `strict`) or a callback's match: its key, or `false`. */
  search(value_: unknown, strict: boolean = false): PhpArrayKey | false {
    if (!this.useAsCallable(value_)) {
      return array_search(value_, this.items, strict);
    }

    return array_find_key(this.items, withCopies(value_)) ?? false;
  }

  /** Get the item before the given item (by `search`), or `null`. */
  before(value_: unknown, strict: boolean = false): any {
    const key = this.search(value_, strict);

    if (key === false) {
      return null;
    }

    const keys = this.keys();
    const position = keys.search(key);

    if (position === 0) {
      return null;
    }

    return this.get(keys.get((position as number) - 1));
  }

  /** Get the item after the given item (by `search`), or `null`. */
  after(value_: unknown, strict: boolean = false): any {
    const key = this.search(value_, strict);

    if (key === false) {
      return null;
    }

    const keys = this.keys();
    const position = keys.search(key);

    if (position === keys.count() - 1) {
      return null;
    }

    return this.get(keys.get((position as number) + 1));
  }

  /** Get and remove the first item (`count` 1), or the first `count` items as a collection. Throws below zero. */
  shift(count: number = 1): any {
    if (count < 0) {
      throw new InvalidArgumentException("Number of shifted items may not be less than zero.");
    }

    if (count === 0) {
      return this.newInstance();
    }

    if (count === 1) {
      const ref = new Ref<unknown>(this.items);
      const shifted = array_shift(ref);
      this.items = itemsOf(ref);
      return shifted;
    }

    if (this.isEmpty()) {
      return this.newInstance();
    }

    const results: unknown[] = [];

    const collectionCount = this.count();

    const ref = new Ref<unknown>(this.items);
    for (const item of phpRange(1, min(count, collectionCount)) as unknown[]) {
      void item;
      results.push(array_shift(ref));
    }
    this.items = itemsOf(ref);

    return this.newInstance(results);
  }

  /** Skip the first `count` items. */
  skip(count: number): this {
    return this.slice(count);
  }

  /** Slice the underlying collection array, keys kept. */
  slice(offset: number, length: number | null = null): this {
    return this.newInstance(array_slice(this.items, offset, length, true));
  }

  /**
   * Get the only item (optionally the only one a callback or `where(key, operator, value)` accepts). Throws
   * `ItemNotFoundException` for none and `MultipleItemsFoundException` for more than one.
   */
  sole(key: unknown = null, operator: unknown = null, value_: unknown = null): any {
    void operator;
    void value_;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    const items = (this.unless(looseEquals(filter, null)) as unknown as WhenFilterProxy).filter(filter);

    const count = items.count();

    if (count === 0) {
      throw new ItemNotFoundException();
    }

    if (count > 1) {
      throw new MultipleItemsFoundException(count);
    }

    return items.first();
  }

  /** Determine if the collection contains a single item, optionally matching the given criteria. */
  hasSole(key: unknown = null, operator: unknown = null, value_: unknown = null): boolean {
    void operator;
    void value_;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    return (this.unless(looseEquals(filter, null)) as unknown as WhenFilterProxy).filter(filter).count() === 1;
  }

  /** Get the first item (optionally the first matching), or throw `ItemNotFoundException` when there is none. */
  firstOrFail(key: unknown = null, operator: unknown = null, value_: unknown = null): any {
    void operator;
    void value_;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    const placeholder = new stdClass();

    const item: unknown = this.first(filter as ItemCallback | null, placeholder);

    if (item === placeholder) {
      throw new ItemNotFoundException();
    }

    return item;
  }

  /**
   * Splice a portion of the underlying collection array: remove `length` items from `offset` (to the end with one
   * argument), put `replacement`'s items in their place, and return the removed items. Also takes AD-26's options
   * object `{ length, replacement }` after the offset.
   */
  splice(offset: number, length?: number | null, replacement?: unknown): this;
  splice(offset: number, options?: { length?: number | null; replacement?: unknown }): this;
  splice(offset: number, length: unknown = null, replacement: unknown = []): this {
    if (arguments.length === 2 && isOptionsObject(length)) {
      ({ length = null, replacement = [] } = length as { length?: number | null; replacement?: unknown });
    } else if (arguments.length === 1) {
      const ref = new Ref<unknown>(this.items);
      const removed = array_splice(ref, offset);
      this.items = itemsOf(ref);
      return this.newInstance(removed);
    }

    const ref = new Ref<unknown>(this.items);
    const removed = array_splice(ref, offset, length, this.getArrayableItems(replacement));
    this.items = itemsOf(ref);
    return this.newInstance(removed);
  }

  /** Take the first `limit` items, or the last `-limit` for a negative one. */
  take(limit: number): this {
    if (limit < 0) {
      return this.slice(limit, Number(abs(limit)));
    }

    return this.slice(0, limit);
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
