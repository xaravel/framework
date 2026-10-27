// Laravel's `Illuminate\Support\Collection` (v13.37.0), the members Stories 14.1-14.4 port; the Collections
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
// `first` and `last` keep only the positional form, and a lone object is the PHP value (DIV-12.20); `random`,
// `sortBy`, `splice` and `duplicates` also take an options object (AD-26).
//
// Collections are sync (AD-6): a sync member's callback is a `SyncCallback`, which `tsc` and lint refuse to be async,
// and `filterAsync`, `rejectAsync`, `partitionAsync`, `everyAsync`, `containsAsync` and `firstAsync` are the async
// companions (DIV-1 Callbacks, DIV-1.2), tagged `@asyncRoot callback`: each awaits its callback for one item at a
// time, in key order. PHP's `==` on two collections compares their properties, which the props protocol gives the
// runtime (AD-9.6). `implode`'s `instanceof Stringable` names Support's `Illuminate\Support\Stringable` (Collection.php
// imports no `\Stringable`), so it is `is_a` through the Class Registry; PHP's `INF` (`flatten`, `dot`) is `Infinity`.
// PHP's `+` on two arrays (`union`) is the runtime's `arrayUnion` (ESC-14.4-1). The `*Using` members hand their
// comparison callback to the runtime's `array_udiff` & co. as Upstream does, so a PHP callable string that names a
// global function (`'strcasecmp'`) is called as the runtime's export of that name (DIV-9.13, ESC-14.4-2).
import { CanBeEscapedWhenCastToString } from "@xaravel/contracts/support";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  abs,
  array_chunk,
  key,
  reset,
  intdiv,
  floor,
  ceil,
  ksort,
  krsort,
  uksort,
  ArrayAccess,
  ArrayIterator,
  array_all,
  array_any,
  array_combine,
  array_diff,
  array_diff_assoc,
  array_diff_key,
  array_diff_uassoc,
  array_diff_ukey,
  array_filter,
  array_find_key,
  array_flip,
  array_intersect,
  array_intersect_assoc,
  array_intersect_key,
  array_intersect_uassoc,
  array_key_exists,
  array_keys,
  array_map,
  array_merge,
  array_merge_recursive,
  array_pad,
  array_pop,
  array_replace,
  array_replace_recursive,
  array_reverse,
  array_search,
  array_shift,
  array_slice,
  array_splice,
  array_udiff,
  array_uintersect,
  array_unique,
  array_unshift,
  array_values,
  arrayEntries,
  arrayFromEntries,
  arrayUnion,
  arsort,
  asort,
  identical,
  implode,
  in_array,
  InvalidArgumentException,
  is_a,
  is_array,
  is_bool,
  is_callable,
  is_null,
  is_object,
  is_string,
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
  resolveCallable,
  SORT_FLAG_CASE,
  SORT_LOCALE_STRING,
  SORT_NATURAL,
  SORT_NUMERIC,
  SORT_REGULAR,
  SORT_STRING,
  SortDirection,
  spaceship,
  stdClass,
  strcasecmp,
  strcmp,
  strcoll,
  Stringable,
  strnatcasecmp,
  strnatcmp,
  toFloat,
  toInt,
  toBool,
  toPhpString,
  Traversable,
  uasort,
  unhandledMatch,
  UnitEnum,
  valueCopy,
} from "@xaravel/runtime";
import { EnumeratesValues } from "./Traits/EnumeratesValues";
import { Arr } from "./Arr";
import { Enumerable, type SortByDescCallback } from "./Enumerable";
import { enum_value } from "./functions";
import { data_get, value } from "./helpers";
import type { HigherOrderCollectionProxy } from "./HigherOrderCollectionProxy";
import { ItemNotFoundException } from "./ItemNotFoundException";
import { LazyCollection } from "./LazyCollection";
import { MultipleItemsFoundException } from "./MultipleItemsFoundException";
import { arrayRead, callCallable, isOptionsObject, type SyncCallback, type SyncCallable, type ValueOrSyncCallback } from "./support/callables";

/** The `Countable` brand `count()` and the grader read (no token; `packages/runtime/src/php/ArrayObject.ts`). */
const COUNTABLE = Symbol.for("Countable");

/** The props protocol's key (AD-9.6): the properties PHP compares and casts. */
const PHP_PROPS = Symbol.for("xaravel.php.props");

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/**
 * PHP's `callable(T, T): int` comparison of two values or two keys: a sync function, or a PHP callable string naming a
 * global function the runtime exports (`'strcasecmp'`, DIV-9.13).
 */
type CompareCallback<R> = SyncCallable<[a: any, b: any], R> | string;

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

/** The values PHP's `foreach ($source as $item)` gives for an array or a Traversable. */
function valuesOf(source: unknown): Iterable<unknown> {
  return is_array(source) ? arrayEntries(source as object).map(([, item]) => item) : (source as Iterable<unknown>);
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

  /**
   * The props protocol (AD-9.6): the PHP properties PHP's `==`, `<=>` and `(array)` read, with their mangled protected
   * names, in PHP's order (the class's own `$items`, then the trait's `$escapeWhenCastingToString`). So two collections
   * of equal items are `==`, as in PHP (`looseEquals`, `array_unique`'s `SORT_REGULAR`, `in_array`).
   */
  [PHP_PROPS](): PhpArray {
    return new PhpArray([
      ["\0*\0items", this.all()],
      ["\0*\0escapeWhenCastingToString", this.escapeWhenCastingToStringProperty],
    ]);
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
  filter<R>(callback: SyncCallable<[value: any, key: any], R> | null = null): this {
    if (callback !== null) {
      return this.newInstance(Arr.where(this.items, (value_: unknown, key: unknown) => callCallable(callback, valueCopy(value_), key)));
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
  map<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    const target = resolveCallable(callback);
    if (target === null) return this.newInstance(Arr.map(this.items, callback));
    return this.newInstance(Arr.map(this.items, (...args: unknown[]) => target(...args.map(argument => valueCopy(argument)))));
  }

  /** Get the median of the non-null values of a key. */
  median(key_: unknown = null): unknown {
    const values = (key_ !== null ? this.pluck(key_) : this).reject((item: unknown) => item === null).sort().values();
    const count = values.count();
    if (count === 0) return null;
    const middle = Number(intdiv(count, 2));
    if (count % 2) return values.get(middle);
    return this.newInstance([values.get(middle - 1), values.get(middle)]).average();
  }

  /** Group the first pair returned by each callback into an array dictionary. */
  mapToDictionary<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    const dictionary = new PhpArray<PhpArrayKey, unknown[]>();
    for (const [key_, item] of this.items) {
      const pair = new Ref<unknown>(valueCopy(callCallable(callback, valueCopy(item), key_)));
      const pairKey = key(pair.value);
      const value_ = reset(pair);
      if (!dictionary.has(pairKey)) dictionary.set(pairKey, []);
      dictionary.get(pairKey)!.push(valueCopy(value_));
    }
    return this.newInstance(dictionary);
  }

  /** Return complete sliding windows while preserving inner keys. */
  sliding(size: number | { size?: number; step?: number } = 2, step: number = 1): this {
    if (isOptionsObject(size)) { step = size.step ?? 1; size = size.size ?? 2; }
    if (size < 1) throw new InvalidArgumentException("Size value must be at least 1.");
    if (step < 1) throw new InvalidArgumentException("Step value must be at least 1.");
    const chunks = toFloat(floor((this.count() - size) / step)) + 1;
    return (this.constructor as typeof Collection).times(chunks, (number: number) => this.slice((number - 1) * step, size)) as this;
  }

  /** Split into balanced groups, renumbering integer keys inside each group. */
  split(numberOfGroups: number): this {
    if (numberOfGroups < 1) throw new InvalidArgumentException("Number of groups must be at least 1.");
    if (this.isEmpty()) return this.newInstance();
    const groups = this.newInstance();
    const groupSize = toFloat(floor(this.count() / numberOfGroups));
    const remain = this.count() % numberOfGroups;
    let start = 0;
    for (let i = 0; i < numberOfGroups; i++) {
      const size = groupSize + (i < remain ? 1 : 0);
      if (size) { groups.push(this.newInstance(array_slice(this.items, start, size))); start += size; }
    }
    return groups;
  }

  /** Split into groups, filling the first groups completely. */
  splitIn(numberOfGroups: number): this {
    if (numberOfGroups < 1) throw new InvalidArgumentException("Number of groups must be at least 1.");
    return this.chunk(toFloat(ceil(this.count() / numberOfGroups)));
  }

  /** Chunk items into collections, preserving keys by default. */
  chunk(size: number, preserveKeys: boolean | { preserveKeys?: boolean } = true): this {
    if (isOptionsObject(preserveKeys)) preserveKeys = preserveKeys.preserveKeys ?? true;
    if (size <= 0) return this.newInstance();
    return this.newInstance(array_chunk(this.items, size, preserveKeys).map(chunk => this.newInstance(chunk)));
  }

  /** Chunk consecutive items while the callback returns true. */
  chunkWhile<R>(callback: SyncCallable<[value: any, key: any, chunk: Collection], R>): this {
    return this.newInstance(this.lazy().chunkWhile(callback).mapInto(this.constructor as new (...args: any[]) => this));
  }

  /** Sort keys with PHP sort flags, preserving values. */
  sortKeys(options: number | { options?: number; descending?: boolean | SortDirection } = SORT_REGULAR, descending: boolean | SortDirection = false): this {
    if (isOptionsObject(options)) { descending = options.descending ?? false; options = options.options ?? SORT_REGULAR; }
    const items = new Ref<unknown>(valueCopy(this.items));
    if (descending === true || descending === SortDirection.Descending) krsort(items, options);
    else if (descending === false || descending === SortDirection.Ascending) ksort(items, options);
    else throw unhandledMatch(descending);
    return this.newInstance(items.value);
  }

  /** Sort keys in descending order. */
  sortKeysDesc(options: number = SORT_REGULAR): this { return this.sortKeys(options, SortDirection.Descending); }

  /** Sort keys with a synchronous comparison callback. */
  sortKeysUsing<R>(callback: CompareCallback<R>): this {
    const items = new Ref<unknown>(valueCopy(this.items));
    uksort(items, callback);
    return this.newInstance(items.value);
  }

  /** Transform each item in place and return this collection. */
  transform<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    this.items = new PhpArray(arrayEntries(this.map(callback).all()));
    return this;
  }

  /** Run an associative map over the items, replacing earlier values with the same returned key. */
  mapWithKeys<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    return this.newInstance(Arr.mapWithKeys(this.items, callback));
  }

  /** Reverse the items while preserving their keys. */
  reverse(): this {
    return this.newInstance(array_reverse(this.items, true));
  }

  /** Sort the items with a comparison callback or PHP sort flags, preserving keys. */
  sort<R>(callback: CompareCallback<R> | number | null = null): this {
    const ref = new Ref<unknown>(valueCopy(this.items));
    if (toBool(callback) && is_callable(callback)) {
      uasort(ref, callback);
    } else {
      asort(ref, callback ?? SORT_REGULAR);
    }
    return this.newInstance(itemsOf(ref));
  }

  /** Sort the items in descending order with PHP sort flags, preserving keys. */
  sortDesc(options: number = SORT_REGULAR): this {
    const ref = new Ref<unknown>(valueCopy(this.items));
    arsort(ref, options);
    return this.newInstance(itemsOf(ref));
  }

  /** Get the most frequent values of a key, or null when there are no non-null values. */
  mode(key: unknown = null): unknown {
    const collection = (key !== null ? this.pluck(key) : this).reject((item: unknown) => item === null);
    if (collection.isEmpty()) {
      return null;
    }
    const counts = this.newInstance();
    collection.each((value_: unknown) => {
      counts.offsetSet(value_, counts.offsetExists(value_) ? Number(counts.get(value_)) + 1 : 1);
    });
    const sorted = counts.sort();
    const highestValue = sorted.last();
    return sorted.filter((value_: unknown) => looseEquals(value_, highestValue)).sort().keys().all();
  }

  /** Return only unique items from the collection array, by `==` or, when `strict`, by `===`. */
  unique<T, R>(this: T, key: SyncCallback<[value: any, key: any], R>, strict?: boolean): T;
  unique<T, K>(this: T, key?: ValueOrSyncCallback<K>, strict?: boolean): T;
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

  /**
   * Retrieve duplicate items from the collection: each item (or each item's value by `callback`, a callable or a
   * `data_get` key) after the first equal one, keyed as here, compared by `==` or, when `strict`, by `===`. Also takes
   * AD-26's options object `{ callback, strict }`: PHP types `$callback` `callable|string|null`, so a plain object there
   * is the options object, unless its `__invoke` is a function, which makes it a callable (`isOptionsObject`).
   */
  duplicates<R>(callback?: SyncCallback<[value: any, key: any], R> | string | null, strict?: boolean): this;
  duplicates<R>(options?: { callback?: SyncCallback<[value: any, key: any], R> | string | null; strict?: boolean }): this;
  duplicates(callback: unknown = null, strict: boolean = false): this {
    if (arguments.length === 1 && isOptionsObject(callback)) {
      ({ callback = null, strict = false } = callback as { callback?: unknown; strict?: boolean });
    }

    const items = this.map(this.valueRetriever(callback));

    const uniqueItems = items.unique(null, strict);

    const compare = this.duplicateComparator(strict);

    const duplicates = this.newInstance();

    for (const [key, value_] of items.entries()) {
      if (uniqueItems.isNotEmpty() && compare(value_, uniqueItems.first())) {
        uniqueItems.shift();
      } else {
        duplicates.offsetSet(key, value_);
      }
    }

    return duplicates;
  }

  /** Retrieve duplicate items from the collection using strict comparison (PHP's `===`). */
  duplicatesStrict<R>(callback: SyncCallback<[value: any, key: any], R> | string | null = null): this {
    return this.duplicates(callback, true);
  }

  /** Get the comparison function to detect duplicates: PHP's `===` (`identical`) when `strict`, else `==`. */
  protected duplicateComparator(strict: boolean): (a: unknown, b: unknown) => boolean {
    if (strict) {
      return (a: unknown, b: unknown) => identical(a, b);
    }

    return (a: unknown, b: unknown) => looseEquals(a, b);
  }

  /** Reset the keys on the underlying array. */
  values(): this {
    return this.newInstance(array_values(this.items));
  }

  /**
   * Determine if an item exists in the collection: with one argument, an item `==` the value, or one a callback
   * accepts; with more, an item matching `where(key, operator, value)`.
   */
  contains<R>(callback: SyncCallback<[value: any, key: any], R>): boolean;
  contains<K>(key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): boolean;
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
  first<R>(callback: SyncCallback<[value: any, key: any], R> | null = null, defaultValue: unknown = null): any {
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
  containsOneItem<R>(callback: SyncCallback<[value: any, key: any], R> | null = null): boolean {
    return this.hasSole(callback);
  }

  /**
   * Determine if the collection contains multiple items, optionally ones the callback accepts.
   *
   * @deprecated 12.50.0 Use the `hasMany()` method instead.
   */
  containsManyItems<R>(callback: SyncCallback<[value: any, key: any], R> | null = null): boolean {
    return this.hasMany(callback);
  }

  /**
   * Group an associative array by a field or using a callback (a callable over the item and its key, or a `data_get`
   * key), or by a list of them, one nested level each. A callback may give a list of group keys, which puts the item in
   * each group. A `bool` group key is its int, an enum case its value, and a `Stringable` or `null` its string. Each
   * group is a new collection of the items, keyed as here when `preserveKeys`, else re-indexed.
   */
  groupBy<T, R>(this: T, groupBy: SyncCallback<[value: any, key: any], R>, preserveKeys?: boolean): T;
  groupBy<T, K>(this: T, groupBy: ValueOrSyncCallback<K>, preserveKeys?: boolean): T;
  groupBy(groupBy: unknown, preserveKeys: boolean = false): this {
    let nextGroups: unknown = null;

    if (!this.useAsCallable(groupBy) && is_array(groupBy)) {
      const nextGroupsRef = new Ref<unknown>(groupBy);

      groupBy = array_shift(nextGroupsRef);

      nextGroups = nextGroupsRef.value;
    }

    const retriever = this.valueRetriever(groupBy);

    const results = new PhpArray<PhpKeyInput, this>();

    for (const [key, value_] of arrayEntries(this.items)) {
      let groupKeys = retriever(value_, key);

      if (!is_array(groupKeys)) {
        groupKeys = [groupKeys];
      }

      for (const [, item] of arrayEntries(groupKeys as object)) {
        let groupKey: unknown;
        if (is_bool(item)) {
          groupKey = toInt(item);
        } else if (item instanceof UnitEnum) {
          groupKey = enum_value(item);
        } else if (item instanceof Stringable || is_null(item)) {
          groupKey = toPhpString(item);
        } else {
          groupKey = item;
        }

        if (!array_key_exists(groupKey, results)) {
          results.set(groupKey as PhpKeyInput, this.newInstance());
        }

        results.get(groupKey as PhpKeyInput)!.offsetSet(preserveKeys ? key : null, value_);
      }
    }

    const result = this.newInstance(results);

    if (toBool(nextGroups)) {
      return (result.__get("map") as HigherOrderCollectionProxy).__call("groupBy", [nextGroups, preserveKeys]) as this;
    }

    return result;
  }

  /**
   * Key an associative array by a field or using a callback (a callable over the item and its key, or a `data_get`
   * key): an enum case key is its value, an object key its string, and a `null` key `""`; a later item with the same
   * key replaces an earlier one.
   */
  keyBy<T, R>(this: T, keyBy: SyncCallback<[value: any, key: any], R>): T;
  keyBy<T, K>(this: T, keyBy: ValueOrSyncCallback<K>): T;
  keyBy(keyBy: unknown): this {
    const retriever = this.valueRetriever(keyBy);

    const results = new PhpArray();

    for (const [key, item] of arrayEntries(this.items)) {
      let resolvedKey = retriever(item, key);

      if (resolvedKey instanceof UnitEnum) {
        resolvedKey = enum_value(resolvedKey);
      }

      if (is_object(resolvedKey)) {
        resolvedKey = toPhpString(resolvedKey);
      }

      if (is_null(resolvedKey)) {
        resolvedKey = toPhpString(resolvedKey);
      }

      results.set(resolvedKey as PhpKeyInput, item);
    }

    return this.newInstance(results);
  }

  /** Get the keys of the collection items, as a collection. */
  keys(): this {
    return this.newInstance(array_keys(this.items));
  }

  /** Get the last item passing the given truth test (or the last item), or `value(default)`. */
  last<R>(callback: SyncCallback<[value: any, key: any], R> | null = null, defaultValue: unknown = null): any {
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

  /** Push all of the given items (an array or a Traversable's values) onto a new collection, after these. */
  concat(source: unknown): this {
    const result = this.newInstance(this);

    for (const item of valuesOf(source)) {
      result.push(item);
    }

    return result;
  }

  /**
   * Collapse the collection of items (arrays and `Enumerable`s; other items are dropped) into a single array, as
   * `array_merge` joins them: integer keys renumbered, a later string key overwriting an earlier one.
   */
  collapse(): this {
    return this.newInstance(Arr.collapse(this.items));
  }

  /**
   * Collapse the collection of items (arrays and `Enumerable`s; other items are dropped) into a single array while
   * preserving its keys, as `array_replace` joins them: a later key, integer or string, overwrites an earlier one in its
   * first position.
   */
  collapseWithKeys(): this {
    if (this.items.size === 0) {
      return this.newInstance();
    }

    const results: unknown[] = [];

    for (let values of this.items.values()) {
      if (values instanceof Enumerable) {
        values = values.all();
      } else if (!is_array(values)) {
        continue;
      }

      results.push(values);
    }

    if (results.length === 0) {
      return this.newInstance();
    }

    return this.newInstance(array_replace(...(results as [unknown, ...unknown[]])));
  }

  /** Get the items in the collection that are not present in the given items: by value, compared as `(string)`. */
  diff(items: unknown): this {
    return this.newInstance(array_diff(this.items, this.getArrayableItems(items)));
  }

  /**
   * Get the items in the collection that are not present in the given items, using the callback: `callback(a, b)`
   * compares two values and returns a negative, zero or positive int, as `array_udiff` reads it.
   */
  diffUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    return this.newInstance(array_udiff(this.items, this.getArrayableItems(items), callback));
  }

  /** Get the items in the collection whose keys and values are not present in the given items (values as `(string)`). */
  diffAssoc(items: unknown): this {
    return this.newInstance(array_diff_assoc(this.items, this.getArrayableItems(items)));
  }

  /**
   * Get the items in the collection whose keys and values are not present in the given items, using the callback:
   * `callback(a, b)` compares two keys, as `array_diff_uassoc` reads it, and the values are compared as `(string)`.
   */
  diffAssocUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    return this.newInstance(array_diff_uassoc(this.items, this.getArrayableItems(items), callback));
  }

  /** Get the items in the collection whose keys are not present in the given items. */
  diffKeys(items: unknown): this {
    return this.newInstance(array_diff_key(this.items, this.getArrayableItems(items)));
  }

  /**
   * Get the items in the collection whose keys are not present in the given items, using the callback: `callback(a, b)`
   * compares two keys, as `array_diff_ukey` reads it.
   */
  diffKeysUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    return this.newInstance(array_diff_ukey(this.items, this.getArrayableItems(items), callback));
  }

  /**
   * Flip the items in the collection: each int or string value becomes a key whose value is its key (`array_flip`);
   * any other value is skipped, as PHP skips it with a warning.
   */
  flip(): this {
    return this.newInstance(array_flip(this.items));
  }

  /** Intersect the collection with the given items: the entries whose value the items hold, compared as `(string)`. */
  intersect(items: unknown): this {
    return this.newInstance(array_intersect(this.items, this.getArrayableItems(items)));
  }

  /**
   * Intersect the collection with the given items, using the callback: `callback(a, b)` compares two values, as
   * `array_uintersect` reads it.
   */
  intersectUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    return this.newInstance(array_uintersect(this.items, this.getArrayableItems(items), callback));
  }

  /**
   * Intersect the collection with the given items with additional index check, using the callback: `callback(a, b)`
   * compares two keys, as `array_intersect_uassoc` reads it, and the values are compared as `(string)`.
   */
  intersectAssocUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    return this.newInstance(array_intersect_uassoc(this.items, this.getArrayableItems(items), callback));
  }

  /**
   * Recursively merge the collection with the given items (`array_merge_recursive`): integer keys renumbered, and the
   * values of a string key both hold merged into one array.
   */
  mergeRecursive(items: unknown): this {
    return this.newInstance(array_merge_recursive(this.items, this.getArrayableItems(items)));
  }

  /** Union the collection with the given items, as PHP's array `+`: these entries, then each given one whose key is new. */
  union(items: unknown): this {
    return this.newInstance(arrayUnion(this.items, this.getArrayableItems(items)));
  }

  /** Replace the collection items with the given items (`array_replace`): a given key's value replaces this one's. */
  replace(items: unknown): this {
    return this.newInstance(array_replace(this.items, this.getArrayableItems(items)));
  }

  /** Recursively replace the collection items with the given items (`array_replace_recursive`), nested arrays by key. */
  replaceRecursive(items: unknown): this {
    return this.newInstance(array_replace_recursive(this.items, this.getArrayableItems(items)));
  }

  /**
   * Pad collection to the specified length with a value (`array_pad`): on the right for a positive `size`, on the left
   * for a negative one; integer keys are renumbered. Throws PHP's `ValueError` beyond PHP's array size limit.
   */
  pad(size: number, value_: unknown): this {
    return this.newInstance(array_pad(this.items, size, value_));
  }

  /**
   * Cross join with the given lists (arrays, `Arrayable`s or iterables), returning all possible permutations: a list
   * of lists, one item of this collection and one of each list.
   */
  crossJoin(...lists: unknown[]): this {
    return this.newInstance(Arr.crossJoin(this.items, ...(array_map((items: unknown) => this.getArrayableItems(items), lists) as unknown[])));
  }

  /** Get a flattened list of the items in the collection, nested arrays and `Enumerable`s flattened `depth` levels. */
  flatten(depth: number = Infinity): this {
    return this.newInstance(Arr.flatten(this.items, depth));
  }

  /**
   * Concatenate values of a given key as a string: a callback's results, each item's `value` ("dot" notation) when
   * the first item is an array or an object other than Support's `Stringable`, else the items themselves, joined by
   * `glue` (or, for the items themselves, by `value`).
   */
  implode<R>(value: SyncCallback<[value: any, key: any], R> | string | null, glue?: string | null): string;
  implode(value_: unknown, glue: string | null = null): string {
    if (this.useAsCallable(value_)) {
      return implode(glue ?? "", this.map(value_ as ItemCallback).all());
    }

    const first: unknown = this.first();

    // `Stringable` is Support's `Illuminate\Support\Stringable` (Collection.php imports no `\Stringable`), read
    // through the Class Registry: until Support registers it, no object is one, as PHP says of any other object.
    if (is_array(first) || (is_object(first) && !is_a(first, "Illuminate\\Support\\Stringable"))) {
      return implode(glue ?? "", this.pluck(value_).all());
    }

    return implode(value_ ?? "", this.items);
  }

  /** Intersect the collection with the given items with additional index check: the entries both have, by `(string)`. */
  intersectAssoc(items: unknown): this {
    return this.newInstance(array_intersect_assoc(this.items, this.getArrayableItems(items)));
  }

  /** Intersect the collection with the given items by key: the entries whose key the items have. */
  intersectByKeys(items: unknown): this {
    return this.newInstance(array_intersect_key(this.items, this.getArrayableItems(items)));
  }

  /**
   * Join all items from the collection using a string. The final items can use a separate glue string: then one item
   * is returned as it is, and none gives `''`.
   */
  join(glue: string, finalGlue: string = ""): any {
    if (finalGlue === "") {
      return this.implode(glue);
    }

    const count = this.count();

    if (count === 0) {
      return "";
    }

    if (count === 1) {
      return this.last();
    }

    const collection = this.newInstance(this.items);

    const finalItem: unknown = collection.pop();

    return toPhpString(collection.implode(glue)) + toPhpString(finalGlue) + toPhpString(finalItem);
  }

  /** Merge the collection with the given items (`array_merge`): integer keys renumbered, string keys overwritten. */
  merge(items: unknown): this {
    return this.newInstance(array_merge(this.items, this.getArrayableItems(items)));
  }

  /** Multiply the items in the collection by the multiplier: the items' values, `multiplier` times over, as a list. */
  multiply(multiplier: number): this {
    const new_ = this.newInstance();

    for (let i = 0; i < multiplier; i++) {
      new_.push(...array_values(this.items));
    }

    return new_;
  }

  /**
   * Create a collection by using this collection for keys and another for its values. Throws PHP's `ValueError` when
   * their counts differ.
   */
  combine(values: unknown): this {
    return this.newInstance(array_combine(this.all(), this.getArrayableItems(values)));
  }

  /** Flatten a multi-dimensional associative array with dots, `depth` levels down. */
  dot(depth: number = Infinity): this {
    return this.newInstance(Arr.dot(this.all(), "", depth));
  }

  /** Convert a flatten "dot" notation array into an expanded array. */
  undot(): this {
    return this.newInstance(Arr.undot(this.all()));
  }

  /**
   * Zip the collection together with one or more arrays: a list of collections, the n-th holding the n-th item of this
   * collection and of each array, `null` where one is shorter. `new Collection([1, 2, 3]).zip([4, 5, 6])` is
   * `[[1, 4], [2, 5], [3, 6]]`.
   */
  zip(items: unknown, ...moreItems: unknown[]): this {
    void items;
    void moreItems;
    const arrayableItems = array_map((items_: unknown) => this.getArrayableItems(items_), [...arguments]);

    const params = array_merge([(...args: unknown[]) => this.newInstance(args), this.items], arrayableItems) as [unknown, unknown, ...unknown[]];

    return this.newInstance(array_map(...params));
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

  /** Skip items in the collection until the given condition is met: an item `===` the value, or a callback's match. */
  skipUntil<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  skipUntil<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  skipUntil(value_: unknown): this {
    return this.newInstance(this.lazy().skipUntil(value_).all());
  }

  /** Skip items in the collection while the given condition is met: an item `===` the value, or a callback's match. */
  skipWhile<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  skipWhile<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  skipWhile(value_: unknown): this {
    return this.newInstance(this.lazy().skipWhile(value_).all());
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
   * Sort the collection by a value retriever (a callback over the item and its key, or a `data_get` key), with PHP's
   * sort `options`, ascending or (`descending` true or `SortDirection.Descending`) descending, keys kept. A list of
   * comparisons that is not callable sorts by each in turn (`sortByMany`). Also takes AD-26's options object
   * `{ options, descending }` after the callback. Any other `descending` throws PHP's `UnhandledMatchError`.
   */
  sortBy(callback: unknown, options?: number, descending?: boolean | SortDirection): this;
  sortBy(callback: unknown, options?: { options?: number; descending?: boolean | SortDirection }): this;
  sortBy(callback: unknown, options: unknown = SORT_REGULAR, descending: unknown = false): this {
    if (arguments.length === 2 && isOptionsObject(options)) {
      ({ options = SORT_REGULAR, descending = false } = options as { options?: number; descending?: boolean | SortDirection });
    }

    if (is_array(callback) && !is_callable(callback)) {
      return this.sortByMany(callback, options as number);
    }

    const results = new PhpArray();

    const retriever = this.valueRetriever(callback);

    // First we will loop through the items and get the comparator from a callback
    // function which we were given. Then, we will sort the returned values and
    // grab all the corresponding values for the sorted keys from this array.
    for (const [key, value_] of arrayEntries(this.items)) {
      results.set(key, retriever(value_, key));
    }

    const ref = new Ref<unknown>(results);
    if (descending === false || descending === SortDirection.Ascending) {
      asort(ref, options);
    } else if (descending === true || descending === SortDirection.Descending) {
      arsort(ref, options);
    } else {
      throw unhandledMatch(descending);
    }
    const sorted = itemsOf(ref);

    // Once we have sorted all of the keys in the array, we will loop through them
    // and grab the corresponding model so we can set the underlying items list
    // to the sorted version. Then we'll just return the collection instance.
    for (const key of array_keys(sorted) as PhpArrayKey[]) {
      sorted.set(key, this.items.get(key));
    }

    return this.newInstance(sorted);
  }

  /** Sort by a retriever or multiple comparisons in descending order. */
  sortByDesc<R>(callback: SortByDescCallback<R>, options: number = SORT_REGULAR): this {
    if (is_array(callback) && !is_callable(callback)) {
      const comparisons = asItems(valueCopy(callback));
      for (const [index, key] of comparisons) {
        const comparison = asItems(Arr.wrap(key));
        comparison.set(1, SortDirection.Descending);
        comparisons.set(index, comparison);
      }
      return this.sortBy(comparisons, options, true);
    }
    return this.sortBy(callback, options, true);
  }

  /** Sort the collection using multiple comparisons. */
  protected sortByMany(comparisons: unknown = [], options: number = SORT_REGULAR): this {
    const ref = new Ref<unknown>(this.items);

    uasort(ref, (a: unknown, b: unknown) => {
      for (const [, comparison_] of arrayEntries(comparisons as object)) {
        const comparison = Arr.wrap(comparison_) as object;

        const prop = arrayRead(comparison, 0);

        const direction_ = Arr.get(comparison, 1, true);
        const direction =
          direction_ === true || direction_ === "asc" || direction_ === SortDirection.Ascending
            ? SortDirection.Ascending
            : direction_ === false || direction_ === "desc" || direction_ === SortDirection.Descending
              ? SortDirection.Descending
              : SortDirection.Descending; // for backwards compatibility

        let result: unknown;

        if (!is_string(prop) && is_callable(prop)) {
          result = callCallable(prop, valueCopy(a), valueCopy(b));
        } else {
          let values: object = [data_get(a, prop), data_get(b, prop)];

          if (direction === SortDirection.Descending) {
            values = array_reverse(values) as object;
          }

          if ((options & SORT_FLAG_CASE) === SORT_FLAG_CASE) {
            if ((options & SORT_NATURAL) === SORT_NATURAL) {
              result = strnatcasecmp(arrayRead(values, 0), arrayRead(values, 1));
            } else {
              result = strcasecmp(arrayRead(values, 0), arrayRead(values, 1));
            }
          } else {
            switch (options) {
              case SORT_NUMERIC:
                result = spaceship(toFloat(arrayRead(values, 0)), toFloat(arrayRead(values, 1)));
                break;
              case SORT_STRING:
                result = strcmp(arrayRead(values, 0), arrayRead(values, 1));
                break;
              case SORT_NATURAL:
                result = strnatcmp(toPhpString(arrayRead(values, 0)), toPhpString(arrayRead(values, 1)));
                break;
              case SORT_LOCALE_STRING:
                result = strcoll(arrayRead(values, 0), arrayRead(values, 1));
                break;
              default:
                result = spaceship(arrayRead(values, 0), arrayRead(values, 1));
            }
          }
        }

        if (result === 0) {
          continue;
        }

        return result;
      }

      return null;
    });

    return this.newInstance(itemsOf(ref));
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

  /** Take items in the collection until the given condition is met: an item `===` the value, or a callback's match. */
  takeUntil<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  takeUntil<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  takeUntil(value_: unknown): this {
    return this.newInstance(this.lazy().takeUntil(value_).all());
  }

  /** Take items in the collection while the given condition is met: an item `===` the value, or a callback's match. */
  takeWhile<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  takeWhile<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  takeWhile(value_: unknown): this {
    return this.newInstance(this.lazy().takeWhile(value_).all());
  }

  /** Map values sequentially in key order, preserving keys and copying callback values.
   * @asyncRoot callback
   */
  async mapAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const mapped = new PhpArray();
    for (const [key, item] of this.entries()) {
      mapped.set(key, valueCopy(await callCallable(callback, valueCopy(item), key)));
    }
    return this.newInstance(mapped);
  }

  /** Execute a callback sequentially in key order, stopping only on false.
   * @asyncRoot callback
   */
  async eachAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    for (const [key, item] of this.entries()) {
      if (await callCallable(callback, valueCopy(item), key) === false) {
        break;
      }
    }
    return this;
  }

  /**
   * `filter`'s async companion (DIV-1 Callbacks, DIV-1.2): the items for which the awaited `callback(value, key)` is
   * truthy, keys kept. The callback may be async; each call is awaited before the next starts, in key order. A rejected
   * callback rejects the result.
   *
   * @asyncRoot callback
   */
  async filterAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const kept = new PhpArray();

    for (const [key, value_] of arrayEntries(this.items)) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        kept.set(key, value_);
      }
    }

    return this.newInstance(kept);
  }

  /**
   * `reject`'s async companion (DIV-1 Callbacks, DIV-1.2): the items for which the awaited `callback(value, key)` is
   * falsy, keys kept. The callback may be async; each call is awaited before the next starts, in key order. A rejected
   * callback rejects the result.
   *
   * @asyncRoot callback
   */
  async rejectAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const kept = new PhpArray();

    for (const [key, value_] of arrayEntries(this.items)) {
      if (!toBool(await callCallable(callback, valueCopy(value_), key))) {
        kept.set(key, value_);
      }
    }

    return this.newInstance(kept);
  }

  /**
   * `partition`'s async companion (DIV-1 Callbacks, DIV-1.2): a collection of `[passed, failed]` by the awaited
   * `callback(value, key)`, each keeping its items' keys. The callback may be async; each call is awaited before the
   * next starts, in key order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async partitionAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const passed = new PhpArray();
    const failed = new PhpArray();

    for (const [key, value_] of arrayEntries(this.items)) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        passed.set(key, value_);
      } else {
        failed.set(key, value_);
      }
    }

    return this.newInstance([this.newInstance(passed), this.newInstance(failed)]);
  }

  /**
   * `every`'s async companion (DIV-1 Callbacks, DIV-1.2): whether the awaited `callback(value, key)` is truthy for every
   * item, stopping at the first falsy one (`true` when empty). The callback may be async; each call is awaited before
   * the next starts, in key order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async everyAsync(callback: (value: any, key: any) => unknown): Promise<boolean> {
    for (const [key, value_] of arrayEntries(this.items)) {
      if (!toBool(await callCallable(callback, valueCopy(value_), key))) {
        return false;
      }
    }

    return true;
  }

  /**
   * `contains`'s async companion for a callback (DIV-1 Callbacks, DIV-1.2): whether the awaited `callback(value, key)`
   * is truthy for some item, stopping at the first. The callback may be async; each call is awaited before the next
   * starts, in key order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async containsAsync(callback: (value: any, key: any) => unknown): Promise<boolean> {
    for (const [key, value_] of arrayEntries(this.items)) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        return true;
      }
    }

    return false;
  }

  /**
   * `first`'s async companion for a callback (DIV-1 Callbacks, DIV-1.2): the first item for which the awaited
   * `callback(value, key)` is truthy, else `value(default_)`. The callback may be async; each call is awaited before the
   * next starts, in key order, stopping at the first match. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async firstAsync(callback: (value: any, key: any) => unknown, default_: unknown = null): Promise<any> {
    for (const [key, value_] of arrayEntries(this.items)) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        return valueCopy(value_);
      }
    }

    return value(default_);
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
