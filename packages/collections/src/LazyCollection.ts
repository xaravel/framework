// Laravel's `Illuminate\Support\LazyCollection` (v13.37.0), the members Stories 14.1-14.4 port; the Collections
// Stories that port their tests add the rest. The async companions (`filterAsync`, …; DIV-1 Callbacks, DIV-1.2)
// enumerate the source once, awaiting each callback in key order, and resolve a lazy collection over the kept items. It is `mixin(null, EnumeratesValues, Macroable)`, as Upstream's
// `use EnumeratesValues, Macroable`.
//
// Generators follow DIV-12.18: a source generator function writes `yield keyed(k, v)` for PHP's `yield $k => $v` and
// `yield* yieldFrom(it)` for `yield from $it`, and the internal sources below do the same. Calling a generator function
// gives a bare JS generator object, which answers `instanceof Generator`, `Traversable` and `Iterator` as PHP's does but
// carries no runtime brand, so `makeIterator` wraps it in the runtime's `Generator` (spotting it as a `Generator`
// without the `Traversable` brand) before Upstream's `Traversable` test; a bare generator object passed to the
// constructor is still refused, as Upstream refuses one. PHP's interfaces are brand getters (AD-9.5), and
// `IteratorAggregate` is `[Symbol.iterator]` (the values) and `entries()` (AD-26); `keys()` is Upstream's member, a
// lazy collection of the keys, which iterates as the keys.
//
// A generator source that Upstream builds over a `use (...)` variable it changes (`skip`'s and `take`'s count,
// `only`'s keys, `pluck`'s paths) copies it into a local on each enumeration, as PHP's `use` copies the value into
// each call. `func_num_args()` is `arguments.length`, read in `function` methods only, and `func_get_args()` forwards
// `...arguments` unchanged. `contains`, `doesntContain`, `doesntContainStrict`, `sole`, `hasSole`, `firstOrFail`,
// `first` and `last` keep only the positional form, and a lone object is the PHP value (DIV-12.20); `random`,
// `sortBy` and `duplicates` also take an options object (AD-26). Strict comparisons of items are PHP's `===` through `identical`, so two arrays
// compare by their keys and values.
//
// This module imports `Collection` first: `Collection.ts` loads the trait before either class is defined. `zip` reads
// its iterators' `contains->valid()`, `map->current()` and `each->next()` as the `__get` / `__call` calls PHP makes
// (DIV-12.16's form); it and `combine` close the temporary generators they hold as manual cursors through
// `deferredIteratorScope`, opened where PHP first reads each cursor and closed in PHP's destruction order. PHP's
// `INF` (`flatten`, `dot`) is `Infinity`. The `*Using` members pass their comparison callback through to Collection's,
// so a PHP callable string such as `'strcasecmp'` reaches the runtime's `array_udiff` & co., which call the runtime's
// export of that name (DIV-9.13, ESC-14.4-2).
import { Collection } from "./Collection";
import { Arrayable, CanBeEscapedWhenCastToString, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  abs,
  array_slice,
  ceil,
  toFloat,
  array_flip,
  array_key_exists,
  arrayEntries,
  arrayFromEntries,
  ArrayIterator,
  Closure,
  count,
  explode,
  Generator,
  hasBrand,
  identical,
  in_array,
  InvalidArgumentException,
  is_array,
  is_callable,
  is_int,
  is_null,
  is_object,
  is_string,
  type Iterator,
  IteratorAggregate,
  iterator_count,
  iterator_to_array,
  JsonSerializable,
  keyed,
  type KeyedYield,
  looseEquals,
  method_exists,
  min,
  mixin,
  PhpArray,
  type PhpArrayKey,
  type PhpKeyInput,
  registerClass,
  type SortDirection,
  SORT_REGULAR,
  stdClass,
  Stringable,
  toBool,
  toInt,
  toPhpArray,
  toPhpString,
  Traversable,
  UnitEnum,
  ValueError,
  valueCopy,
  yieldFrom,
} from "@xaravel/runtime";
import { Arr } from "./Arr";
import { Enumerable, type SortByDescCallback } from "./Enumerable";
import { enum_value } from "./functions";
import { data_get, value } from "./helpers";
import type { HigherOrderCollectionProxy } from "./HigherOrderCollectionProxy";
import { callCallable, isOptionsObject, offsetRead, propertyIsSet, propertyRead, type SyncCallback, type SyncCallable, type ValueOrSyncCallback } from "./support/callables";
import { EnumeratesValues } from "./Traits/EnumeratesValues";

/** The `Countable` brand `count()` and the grader read (no token; `packages/runtime/src/php/ArrayObject.ts`). */
const COUNTABLE = Symbol.for("Countable");

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** The arguments of a `($key, $operator = null, $value = null)` member, as `func_get_args()` forwards them. */
type WhereArguments = [key: unknown, operator?: unknown, value?: unknown];

/** What a `HigherOrderWhenProxy` from `unless($condition)` answers: the collection's `filter`, or the collection. */
interface WhenFilterProxy {
  filter(callback: unknown): LazyCollection;
}

/** The values PHP's `foreach ($values as $value)` gives for an array or a Traversable. */
function valuesOf(values: unknown): Iterable<unknown> {
  return is_array(values) ? arrayEntries(values as object).map(([, value_]) => value_) : (values as Iterable<unknown>);
}

/**
 * PHP's `callable(T, T): int` comparison of two values or two keys: a sync function, or a PHP callable string naming a
 * global function the runtime exports (`'strcasecmp'`, DIV-9.13).
 */
type CompareCallback<R> = SyncCallable<[a: any, b: any], R> | string;

/** The `[key, value]` pairs PHP's `foreach ($values as $key => $value)` gives for an array or an `Enumerable`. */
function entriesOf(values: unknown): Iterable<readonly [unknown, unknown]> {
  return is_array(values) ? arrayEntries(values as object) : (values as { entries(): Iterable<readonly [unknown, unknown]> }).entries();
}

/** A generator function, PHP's `Closure(): Generator` source (DIV-12.18). */
type SourceFunction = () => unknown;

/** A lazily enumerated collection: Laravel's `Illuminate\Support\LazyCollection`. */
export class LazyCollection extends mixin(null, EnumeratesValues, Macroable) implements Enumerable, CanBeEscapedWhenCastToString {
  /** The source from which to generate items: a generator function, another lazy collection, or a PHP array. */
  source: unknown;

  /** Only wrappers this collection created own their source; caller-held iterators are never marked. */
  readonly #ownedIterators = new WeakSet<Traversable>();

  /**
   * Create a new lazy collection instance from a generator function (or any function), another lazy collection, a PHP
   * array, an `Arrayable`, a Traversable or an object; `null` is empty. Throws `InvalidArgumentException` for a bare
   * generator object.
   */
  constructor(source: unknown = null) {
    super();
    if (source instanceof Closure || source instanceof LazyCollection) {
      this.source = source;
    } else if (source === null) {
      this.source = (this.constructor as typeof LazyCollection).empty();
    } else if (source instanceof Generator) {
      throw new InvalidArgumentException("Generators should not be passed directly to LazyCollection. Instead, pass a generator function.");
    } else {
      this.source = this.getArrayableItems(source);
    }
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

  /**
   * A new instance of this class over the generator function `source`, bound to this collection as PHP binds `$this`
   * in Upstream's `new static(function () { … })`.
   */
  protected lazyInstance(source: (this: LazyCollection) => globalThis.Generator<unknown, void, unknown>): this {
    return new (this.constructor as new (source?: unknown) => this)(source.bind(this));
  }

  /** Create a collection with the given range, by `step` (its absolute value), up or down. Throws for a zero step. */
  static range<R>(this: new (source?: unknown, ...args: any[]) => R, from: number, to: number, step: number = 1, ...args: unknown[]): R {
    if (looseEquals(step, 0)) {
      throw new InvalidArgumentException("Step value cannot be zero.");
    }

    void args;

    return new this(function* () {
      // PHP's `use ($from, $to, $step)` copies the bounds into each call, so every enumeration starts afresh.
      let current = from;
      if (current <= to) {
        for (; current <= to; current += Number(abs(step))) {
          yield current;
        }
      } else {
        for (; current >= to; current -= Number(abs(step))) {
          yield current;
        }
      }
    });
  }

  /** Get all items in the enumerable. */
  all(): any {
    if (is_array(this.source)) {
      return valueCopy(this.source);
    }

    return iterator_to_array(this.getIterator());
  }

  /** Eager load all items into a new lazy collection backed by an array. */
  eager(): this {
    return this.newInstance(this.all());
  }

  /** Cache values as they are enumerated, sharing one source cursor across independent runners. */
  remember(): this {
    const iterator = this.getIterator() as Iterator;
    let iteratorIndex = 0;
    const cache: [unknown, unknown][] = [];

    // The captured source belongs to the returned collection, not to an individual runner. Closing a runner
    // must not traverse or close that source: another runner can still extend this positional cache.
    return this.lazyInstance(function* () {
      for (let index = 0; true; index++) {
        if (array_key_exists(index, cache)) {
          yield keyed(cache[index]![0], valueCopy(cache[index]![1]));
          continue;
        }

        if (iteratorIndex < index) {
          iterator.next();
          iteratorIndex++;
        }

        if (!iterator.valid()) break;

        cache[index] = [iterator.key(), valueCopy(iterator.current())];
        yield keyed(cache[index]![0], valueCopy(cache[index]![1]));
      }
    });
  }

  /** Shuffle the items in the collection, lazily through the eager collection. */
  shuffle(): this {
    return this.passthru("shuffle", []);
  }

  /** Count the number of items in the collection by a field or using a callback (by value when none). */
  countBy(countBy: unknown = null): this {
    const callback = countBy === null ? this.identity() : this.valueRetriever(countBy);
    return this.lazyInstance(function* (this: LazyCollection) {
      const counts = new PhpArray();

      for (const [key, value_] of this.entries()) {
        const group = enum_value(callback(valueCopy(value_), key)) as PhpKeyInput;

        if (!toBool(counts.get(group))) {
          counts.set(group, 0);
        }

        counts.set(group, (counts.get(group) as number) + 1);
      }

      yield* yieldFrom(counts);
    });
  }

  /** Run a filter over each of the items: the callback gets each value and its key, and keys are kept. */
  filter<R>(callback: SyncCallable<[value: any, key: any], R> | null = null): this {
    const test = callback ?? ((value_: unknown) => toBool(value_));
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key, value_] of this.entries()) {
        if (toBool(callCallable(test, valueCopy(value_), key))) {
          yield keyed(key, value_);
        }
      }
    });
  }

  /** Get an item by key (the first whose key is `==` it), or `value(default)` when none is; `null` for a `null` key. */
  get(key: unknown, defaultValue: unknown = null): unknown {
    if (key === null || key === undefined) {
      return null;
    }

    for (const [outerKey, outerValue] of this.entries()) {
      if (looseEquals(outerKey, key)) {
        return outerValue;
      }
    }

    return value(defaultValue);
  }

  /** Determine if the items are empty or not. */
  isEmpty(): boolean {
    for (const iterator of this.iteratorScope(this.getIterator() as Iterator)) return !iterator.valid();
    return true;
  }

  /** Pass each item to a synchronous callback, lazily, keeping its key and value. */
  tapEach<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key, value_] of this.entries()) {
        callCallable(callback, valueCopy(value_), key);
        yield keyed(key, value_);
      }
    });
  }

  /** Run a map over each of the items: the callback gets each value and its key, and keys are kept. */
  map<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    return this.lazyInstance(function* (this: LazyCollection): globalThis.Generator<KeyedYield, void, unknown> {
      for (const [key, value_] of this.entries()) {
        yield keyed(key, callCallable(callback, valueCopy(value_), key));
      }
    });
  }

  /** Lazily yield each key and value returned by the callback. */
  mapWithKeys<R>(callback: SyncCallable<[value: any, key: any], R>): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key, item] of this.entries()) {
        yield* yieldFrom(callCallable(callback, valueCopy(item), key));
      }
    });
  }

  /** Get the median by collecting the source. */
  median(key: unknown = null): unknown { return this.collect().median(key); }

  /** Group callback pairs into a dictionary when enumerated. */
  mapToDictionary<R>(callback: SyncCallable<[value: any, key: any], R>): this { return this.passthru("mapToDictionary", [callback]); }

  /** Return complete sliding windows while preserving their keys; also takes AD-26's options object `{ size, step }`. */
  sliding(size?: number, step?: number): this;
  sliding(options?: { size?: number; step?: number }): this;
  sliding(size: number | { size?: number; step?: number } = 2, step: number = 1): this {
    if (isOptionsObject(size)) { step = size.step ?? 1; size = size.size ?? 2; }
    if (size < 1) throw new InvalidArgumentException("Size value must be at least 1.");
    if (step < 1) throw new InvalidArgumentException("Step value must be at least 1.");
    const windowSize = size;
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const iterator of this.iteratorScope(this.getIterator() as Iterator)) {
        let chunk = new PhpArray();
        while (iterator.valid()) {
          chunk.set(iterator.key() as PhpKeyInput, valueCopy(iterator.current()));
          if (chunk.size === windowSize) {
            const result = new (this.constructor as typeof LazyCollection)(chunk);
            chunk = new PhpArray(arrayEntries(array_slice(chunk, step, null, true) as object));
            yield result;
            if (step > windowSize) {
              for (let i = 0; i < step - windowSize && iterator.valid(); i++) iterator.next();
            }
          }
          iterator.next();
        }
      }
    });
  }

  /** Split the collected values into balanced groups. */
  split(numberOfGroups: number): this {
    if (numberOfGroups < 1) throw new InvalidArgumentException("Number of groups must be at least 1.");
    return this.passthru("split", [numberOfGroups]);
  }

  /** Split into groups filling the first groups completely. */
  splitIn(numberOfGroups: number): this {
    if (numberOfGroups < 1) throw new InvalidArgumentException("Number of groups must be at least 1.");
    return this.chunk(toFloat(ceil(this.count() / numberOfGroups)));
  }

  /** Lazily chunk items, preserving inner keys by default. */
  chunk(size: number, preserveKeys: boolean | { preserveKeys?: boolean } = true): this {
    if (isOptionsObject(preserveKeys)) preserveKeys = preserveKeys.preserveKeys ?? true;
    if (size <= 0) return new (this.constructor as new (source?: unknown) => this)([]);
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const iterator of this.iteratorScope(this.getIterator() as Iterator)) {
        while (iterator.valid()) {
          const chunk = new PhpArray();
          while (true) {
            chunk.set(preserveKeys ? iterator.key() as PhpKeyInput : chunk.size, valueCopy(iterator.current()));
            if (chunk.size < size) {
              iterator.next();
              if (!iterator.valid()) break;
            } else break;
          }
          yield new (this.constructor as typeof LazyCollection)(chunk);
          iterator.next();
        }
      }
    });
  }

  /** Lazily chunk consecutive items while the callback returns true. */
  chunkWhile<R>(callback: SyncCallable<[value: any, key: any, chunk: Collection], R>): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const iterator of this.iteratorScope(this.getIterator() as Iterator)) {
        let chunk = new Collection();
        if (iterator.valid()) {
          chunk.offsetSet(iterator.key(), iterator.current());
          iterator.next();
        }
        while (iterator.valid()) {
          if (!toBool(callCallable(callback, valueCopy(iterator.current()), iterator.key(), chunk))) {
            yield new (this.constructor as typeof LazyCollection)(chunk);
            chunk = new Collection();
          }
          chunk.offsetSet(iterator.key(), iterator.current());
          iterator.next();
        }
        if (chunk.isNotEmpty()) yield new (this.constructor as typeof LazyCollection)(chunk);
      }
    });
  }

  /** Sort keys lazily through Collection; also takes AD-26's options object `{ options, descending }`. */
  sortKeys(options?: number, descending?: boolean | SortDirection): this;
  sortKeys(options?: { options?: number; descending?: boolean | SortDirection }): this;
  sortKeys(options: number | { options?: number; descending?: boolean | SortDirection } = SORT_REGULAR, descending: boolean | SortDirection = false): this {
    if (isOptionsObject(options)) { descending = options.descending ?? false; options = options.options ?? SORT_REGULAR; }
    return this.passthru("sortKeys", [options, descending]);
  }

  /** Sort keys in descending order when consumed. */
  sortKeysDesc(options: number = SORT_REGULAR): this { return this.passthru("sortKeysDesc", [options]); }

  /** Sort keys with a synchronous comparison callback when consumed. */
  sortKeysUsing<R>(callback: CompareCallback<R>): this { return this.passthru("sortKeysUsing", [callback]); }

  /** Reverse the items lazily through the eager collection, keeping keys. */
  reverse(): this {
    return this.passthru("reverse", []);
  }

  /** Sort by a retriever descending, lazily through the eager collection. */
  sortByDesc<R>(callback: SortByDescCallback<R>, options: number = SORT_REGULAR): this {
    return this.passthru("sortByDesc", [callback, options]);
  }

  /** Sort lazily through the eager collection, keeping keys. */
  sort<R>(callback: SyncCallable<[a: any, b: any], R> | string | number | null = null): this {
    return this.passthru("sort", [callback]);
  }

  /** Sort descending lazily through the eager collection, keeping keys. */
  sortDesc(options: number = SORT_REGULAR): this {
    return this.passthru("sortDesc", [options]);
  }

  /** Get the most frequent values through the eager collection. */
  mode(key: unknown = null): unknown {
    return this.collect().mode(key);
  }

  /**
   * Return only unique items from the collection, by `==` or, when `strict`, by `===`; the first of each is kept. Also
   * takes AD-26's options object `{ key, strict }`: PHP's `$key` is a callable, a key string or null, so a plain object
   * there is the options object, unless its `__invoke` is a function (`isOptionsObject`).
   */
  unique<T, R>(this: T, options?: { key?: SyncCallback<[value: any, key: any], R> | string | null; strict?: boolean }): T;
  unique<T, R>(this: T, key: SyncCallback<[value: any, key: any], R>, strict?: boolean): T;
  unique<T, K>(this: T, key?: ValueOrSyncCallback<K>, strict?: boolean): T;
  unique(key: unknown = null, strict: boolean = false): this {
    if (isOptionsObject(key)) {
      ({ key = null, strict = false } = key as { key?: unknown; strict?: boolean });
    }
    const callback = this.valueRetriever(key);
    return this.lazyInstance(function* (this: LazyCollection): globalThis.Generator<KeyedYield, void, unknown> {
      const exists: unknown[] = [];

      for (const [itemKey, item] of this.entries()) {
        const id = callback(valueCopy(item), itemKey);
        if (!in_array(id, exists, strict)) {
          yield keyed(itemKey, item);

          exists.push(id);
        }
      }
    });
  }

  /**
   * Retrieve duplicate items from the collection, through `Collection.duplicates`. Also takes AD-26's options object
   * `{ callback, strict }`.
   */
  duplicates<R>(callback?: SyncCallback<[value: any, key: any], R> | string | null, strict?: boolean): this;
  duplicates<R>(options?: { callback?: SyncCallback<[value: any, key: any], R> | string | null; strict?: boolean }): this;
  duplicates(callback?: unknown, strict?: boolean): this {
    void callback;
    void strict;
    return this.passthru("duplicates", [...arguments]);
  }

  /** Retrieve duplicate items from the collection using strict comparison, through `Collection.duplicatesStrict`. */
  duplicatesStrict<R>(callback: SyncCallback<[value: any, key: any], R> | string | null = null): this {
    void callback;
    return this.passthru("duplicatesStrict", [...arguments]);
  }

  /** Reset the keys on the underlying array. */
  values(): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const item of this) {
        yield item;
      }
    });
  }

  /**
   * Determine if an item exists in the enumerable: with one argument, an item `==` the value, or one a callback
   * accepts; with more, an item matching `where(key, operator, value)`.
   */
  contains<R>(callback: SyncCallback<[value: any, key: any], R>): boolean;
  contains<K>(key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): boolean;
  contains(key: unknown, operator: unknown = null, value_: unknown = null): boolean {
    void operator;
    void value_;
    if (arguments.length === 1 && this.useAsCallable(key)) {
      const placeholder = new stdClass();

      return this.first(key as ItemCallback, placeholder) !== placeholder;
    }

    if (arguments.length === 1) {
      const needle = key;

      for (const item of this) {
        if (looseEquals(item, needle)) {
          return true;
        }
      }

      return false;
    }

    return this.contains(this.operatorForWhere(...([...arguments] as WhereArguments)));
  }

  /** Determine if an item exists, using strict comparison (PHP's `===`); with a value, by an item's `key`. */
  containsStrict(key: unknown, value: unknown = null): boolean {
    if (arguments.length === 2) {
      return this.contains((item: unknown) => identical(data_get(item, key), value));
    }

    if (this.useAsCallable(key)) {
      const placeholder = new stdClass();

      return this.first(key as ItemCallback, placeholder) !== placeholder;
    }

    for (const item of this) {
      if (identical(item, key)) {
        return true;
      }
    }

    return false;
  }

  /** Determine if an item is not contained in the enumerable. */
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

  /** Get all items except for those with the specified keys, through `Collection.except`. */
  except(keys: unknown, ...moreKeys: unknown[]): this {
    void keys;
    void moreKeys;
    return this.passthru("except", [...arguments]);
  }

  /** Get the first item passing the given truth test (or the first item), or `value(default)`. */
  first<R>(callback: SyncCallback<[value: any, key: any], R> | null = null, defaultValue: unknown = null): any {
    const iterator = this.getIterator() as Iterator;

    if (callback === null) {
      for (const cursor of this.iteratorScope(iterator)) {
        if (!cursor.valid()) return value(defaultValue);
        return cursor.current();
      }
      return value(defaultValue);
    }

    for (const [key, value_] of iterator.entries() as Iterable<[PhpArrayKey, unknown]>) {
      if (toBool(callCallable(callback, valueCopy(value_), key))) {
        return value_;
      }
    }

    return value(defaultValue);
  }

  /** Determine if all of the keys exist in the collection (a list, or the keys as arguments). */
  has(key: unknown, ...moreKeys: unknown[]): boolean {
    void moreKeys;
    const keys = new PhpArray(arrayEntries(array_flip(is_array(key) ? key : [...arguments]) as object));

    for (const [itemKey] of this.entries()) {
      keys.delete(itemKey);

      if (!toBool(keys)) {
        return true;
      }
    }

    return false;
  }

  /** Determine if any of the keys exist in the collection (a list, or the keys as arguments). */
  hasAny(key: unknown, ...moreKeys: unknown[]): boolean {
    void moreKeys;
    const keys = array_flip(is_array(key) ? key : [...arguments]);

    for (const [itemKey] of this.entries()) {
      if (array_key_exists(itemKey, keys)) {
        return true;
      }
    }

    return false;
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
   * Determine if the collection contains multiple items.
   *
   * @deprecated 12.50.0 Use the `hasMany()` method instead.
   */
  containsManyItems(): boolean {
    return this.hasMany();
  }

  /** Group an associative array by a field or using a callback, lazily through `Collection.groupBy`. */
  groupBy<T, R>(this: T, groupBy: SyncCallback<[value: any, key: any], R>, preserveKeys?: boolean): T;
  groupBy<T, K>(this: T, groupBy: ValueOrSyncCallback<K>, preserveKeys?: boolean): T;
  groupBy(groupBy: unknown, preserveKeys?: boolean): this {
    void groupBy;
    void preserveKeys;
    return this.passthru("groupBy", [...arguments]);
  }

  /**
   * Key an associative array by a field or using a callback (a callable over the item and its key, or a `data_get`
   * key), lazily: an enum case key is its value, and an object or `null` key its string.
   */
  keyBy<T, R>(this: T, keyBy: SyncCallback<[value: any, key: any], R>): T;
  keyBy<T, K>(this: T, keyBy: ValueOrSyncCallback<K>): T;
  keyBy(keyBy: unknown): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($keyBy)` copies the argument into each call, which reassigns its own copy.
      const retriever = this.valueRetriever(keyBy);

      for (const [key, item] of this.entries()) {
        let resolvedKey = retriever(item, key);

        if (resolvedKey instanceof UnitEnum) {
          resolvedKey = enum_value(resolvedKey);
        }

        if (is_object(resolvedKey) || is_null(resolvedKey)) {
          resolvedKey = toPhpString(resolvedKey);
        }

        yield keyed(resolvedKey, item);
      }
    });
  }

  /** Get the keys of the collection items, as a lazy collection. */
  keys(): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key] of this.entries()) {
        yield key;
      }
    });
  }

  /** Get the last item passing the given truth test (or the last item), or `value(default)`. */
  last<R>(callback: SyncCallback<[value: any, key: any], R> | null = null, defaultValue: unknown = null): any {
    const placeholder = new stdClass();
    let needle: unknown = placeholder;

    for (const [key, value_] of this.entries()) {
      if (callback === null || toBool(callCallable(callback, valueCopy(value_), key))) {
        needle = value_;
      }
    }

    return needle === placeholder ? value(defaultValue) : needle;
  }

  /** Get the values of a given key ("dot" notation, segments or a Closure), keyed by `key` when given. */
  pluck(value: unknown, key: unknown = null): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($value, $key)` copies them into each call, which reassigns its own copies.
      const [itemValuePath, itemKeyPath] = this.explodePluckParameters(value, key);

      for (const item of this) {
        const itemValue = itemValuePath instanceof Closure ? callCallable(itemValuePath, valueCopy(item)) : data_get(item, itemValuePath);

        if (itemKeyPath === null) {
          yield itemValue;
        } else {
          let itemKey = itemKeyPath instanceof Closure ? callCallable(itemKeyPath, valueCopy(item)) : data_get(item, itemKeyPath);

          if (is_object(itemKey) && method_exists(itemKey, "__toString")) {
            itemKey = toPhpString(itemKey);
          }

          yield keyed(itemKey, itemValue);
        }
      }
    });
  }

  /** Create a new collection consisting of every n-th element, from `offset`. Throws for a step below 1. */
  nth(step: number, offset: number = 0): this {
    if (step < 1) {
      throw new InvalidArgumentException("Step value must be at least 1.");
    }

    return this.lazyInstance(function* (this: LazyCollection) {
      let position = 0;

      for (const item of this.slice(offset)) {
        // PHP's `$position % $step` is an int modulo: each operand is cast to int.
        if (Number(toInt(position)) % Number(toInt(step)) === 0) {
          yield item;
        }

        position++;
      }
    });
  }

  /** Get the items with the specified keys (a list, an `Enumerable`, or the keys as arguments); `null` keeps all. */
  only(keys: unknown, ...moreKeys: unknown[]): this {
    void moreKeys;
    if (keys instanceof Enumerable) {
      keys = keys.all();
    } else if (keys !== null) {
      keys = is_array(keys) ? keys : [...arguments];
    }

    const selected = keys;

    return this.lazyInstance(function* (this: LazyCollection) {
      if (selected === null) {
        yield* yieldFrom(this);
      } else {
        // PHP's `use ($keys)` copies them into each call, which changes its own copy.
        const remaining = new PhpArray(arrayEntries(array_flip(selected) as object));

        for (const [key, value_] of this.entries()) {
          if (array_key_exists(key, remaining)) {
            yield keyed(key, value_);

            remaining.delete(key);

            if (!toBool(remaining)) {
              break;
            }
          }
        }
      }
    });
  }

  /** Select specific values from the items within the collection; `null` keeps every item as it is. */
  select(keys: unknown, ...moreKeys: unknown[]): this {
    void moreKeys;
    if (keys instanceof Enumerable) {
      keys = keys.all();
    } else if (keys !== null) {
      keys = is_array(keys) ? keys : [...arguments];
    }

    const selected = keys;

    return this.lazyInstance(function* (this: LazyCollection) {
      if (selected === null) {
        yield* yieldFrom(this);
      } else {
        for (const item of this) {
          const result = new PhpArray();

          for (const [, key] of arrayEntries(selected as object)) {
            if (Arr.accessible(item) && Arr.exists(item, key)) {
              result.set(key as PhpKeyInput, offsetRead(item as object, key));
            } else if (is_object(item) && propertyIsSet(item as object, key)) {
              result.set(key as PhpKeyInput, propertyRead(item as object, key));
            }
          }

          yield arrayFromEntries(result);
        }
      }
    });
  }

  /** Push all of the given items (an array or a Traversable) onto a new lazy collection, after these, keys reset. */
  concat(source: unknown): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      yield* yieldFrom(this);
      yield* yieldFrom(source);
    }).values();
  }

  /**
   * Collapse the collection of items (arrays and `Enumerable`s; other items are dropped) into a single list of their
   * values, lazily: their keys are dropped.
   */
  collapse(): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const values of this) {
        if (is_array(values) || values instanceof Enumerable) {
          for (const value_ of valuesOf(values)) {
            yield value_;
          }
        }
      }
    });
  }

  /**
   * Collapse the collection of items (arrays and `Enumerable`s; other items are dropped) into a single array while
   * preserving its keys, lazily: each item's entries are yielded with their keys, so a later key wins when enumerated.
   */
  collapseWithKeys(): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const values of this) {
        if (is_array(values) || values instanceof Enumerable) {
          for (const [key, value_] of entriesOf(values)) {
            yield keyed(key, value_);
          }
        }
      }
    });
  }

  /** Get the items that are not present in the given items, through `Collection.diff`. */
  diff(items: unknown): this {
    void items;
    return this.passthru("diff", [...arguments]);
  }

  /** Get the items that are not present in the given items, using the callback, through `Collection.diffUsing`. */
  diffUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    void items;
    void callback;
    return this.passthru("diffUsing", [...arguments]);
  }

  /** Get the items whose keys and values are not present in the given items, through `Collection.diffAssoc`. */
  diffAssoc(items: unknown): this {
    void items;
    return this.passthru("diffAssoc", [...arguments]);
  }

  /**
   * Get the items whose keys and values are not present in the given items, using the callback on the keys, through
   * `Collection.diffAssocUsing`.
   */
  diffAssocUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    void items;
    void callback;
    return this.passthru("diffAssocUsing", [...arguments]);
  }

  /** Get the items whose keys are not present in the given items, through `Collection.diffKeys`. */
  diffKeys(items: unknown): this {
    void items;
    return this.passthru("diffKeys", [...arguments]);
  }

  /** Get the items whose keys are not present in the given items, using the callback, through `Collection.diffKeysUsing`. */
  diffKeysUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    void items;
    void callback;
    return this.passthru("diffKeysUsing", [...arguments]);
  }

  /**
   * Flip the items in the collection, lazily: each string or int value is yielded as a key whose value is its key; any
   * other value is skipped.
   */
  flip(): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key, value_] of this.entries()) {
        if (is_string(value_) || is_int(value_)) {
          yield keyed(value_, key);
        }
      }
    });
  }

  /** Intersect the collection with the given items, through `Collection.intersect`. */
  intersect(items: unknown): this {
    void items;
    return this.passthru("intersect", [...arguments]);
  }

  /** Intersect the collection with the given items, using the callback, through `Collection.intersectUsing`. */
  intersectUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    void items;
    void callback;
    return this.passthru("intersectUsing", [...arguments]);
  }

  /**
   * Intersect the collection with the given items with additional index check, using the callback on the keys, through
   * `Collection.intersectAssocUsing`.
   */
  intersectAssocUsing<R>(items: unknown, callback: CompareCallback<R>): this {
    void items;
    void callback;
    return this.passthru("intersectAssocUsing", [...arguments]);
  }

  /** Recursively merge the collection with the given items, through `Collection.mergeRecursive`. */
  mergeRecursive(items: unknown): this {
    void items;
    return this.passthru("mergeRecursive", [...arguments]);
  }

  /** Union the collection with the given items (PHP's array `+`), through `Collection.union`. */
  union(items: unknown): this {
    void items;
    return this.passthru("union", [...arguments]);
  }

  /**
   * Replace the collection items with the given items, lazily: each key the given items hold yields their value in
   * this key's place, and their other entries follow, in order.
   */
  replace(items: unknown): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($items)` copies the argument into each call, which reassigns and unsets its own copy.
      const items_ = new PhpArray(arrayEntries(this.getArrayableItems(items) as object));

      for (const [key, value_] of this.entries()) {
        if (array_key_exists(key, items_)) {
          yield keyed(key, items_.get(key));

          items_.delete(key);
        } else {
          yield keyed(key, value_);
        }
      }

      for (const [key, value_] of items_) {
        yield keyed(key, value_);
      }
    });
  }

  /** Recursively replace the collection items with the given items, through `Collection.replaceRecursive`. */
  replaceRecursive(items: unknown): this {
    void items;
    return this.passthru("replaceRecursive", [...arguments]);
  }

  /**
   * Pad collection to the specified length with a value: for a positive `size`, lazily, the items and then `value`
   * until `size` items are yielded; for a negative one, through `Collection.pad`, on the left.
   */
  pad(size: number, value: unknown): this {
    if (size < 0) {
      return this.passthru("pad", [...arguments]);
    }

    return this.lazyInstance(function* (this: LazyCollection) {
      let yielded = 0;

      for (const [index, item] of this.entries()) {
        yield keyed(index, item);

        yielded++;
      }

      while (yielded++ < size) {
        yield value;
      }
    });
  }

  /** Cross join with the given lists, returning all possible permutations, through `Collection.crossJoin`. */
  crossJoin(...arrays: unknown[]): this {
    void arrays;
    return this.passthru("crossJoin", [...arguments]);
  }

  /** Get a flattened list of the items in the collection, nested arrays and `Enumerable`s flattened `depth` levels. */
  flatten(depth: number = Infinity): this {
    const instance = this.lazyInstance(function* (this: LazyCollection) {
      for (const item of this) {
        if (!is_array(item) && !(item instanceof Enumerable)) {
          yield item;
        } else if (depth === 1) {
          yield* yieldFrom(item);
        } else {
          yield* yieldFrom(this.newInstance(item).flatten(depth - 1));
        }
      }
    });

    return instance.values();
  }

  /** Concatenate values of a given key as a string, through `Collection.implode`. */
  implode<R>(value: SyncCallback<[value: any, key: any], R> | string | null, glue?: string | null): string;
  implode(value_: unknown, glue: string | null = null): string {
    void value_;
    void glue;
    return this.collect().implode(...([...arguments] as [string | null, (string | null)?]));
  }

  /** Intersect the collection with the given items with additional index check, through `Collection.intersectAssoc`. */
  intersectAssoc(items: unknown): this {
    void items;
    return this.passthru("intersectAssoc", [...arguments]);
  }

  /** Intersect the collection with the given items by key, through `Collection.intersectByKeys`. */
  intersectByKeys(items: unknown): this {
    void items;
    return this.passthru("intersectByKeys", [...arguments]);
  }

  /**
   * Join all items from the collection using a string. The final items can use a separate glue string. Through
   * `Collection.join`.
   */
  join(glue: string, finalGlue: string = ""): any {
    void glue;
    void finalGlue;
    return this.collect().join(...([...arguments] as [string, string?]));
  }

  /** Merge the collection with the given items, through `Collection.merge`. */
  merge(items: unknown): this {
    void items;
    return this.passthru("merge", [...arguments]);
  }

  /** Multiply the items in the collection by the multiplier, through `Collection.multiply`. */
  multiply(multiplier: number): this {
    void multiplier;
    return this.passthru("multiply", [...arguments]);
  }

  /**
   * Create a collection by using this collection for keys and another (an array, an `IteratorAggregate` or a generator
   * function) for its values, lazily. Enumerating it throws PHP's `ValueError` when their counts differ. A temporary
   * values generator starts at its first `valid()`, as in PHP, and when the enumeration is abandoned or throws, it is
   * closed before this collection's source, the order PHP destroys them in.
   */
  combine(values: unknown): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($values)` copies the argument into each call, which reassigns its own copy.
      const iterator = this.makeIterator(values) as Iterator;

      const errorMessage = "Both parameters should have an equal number of elements";

      // `foreach ($this as $key)`, stepped by hand so that `$iterator` (a CV) closes before the `foreach` temporary.
      for (const keys of closingScope(this[Symbol.iterator]())) {
        for (const start of this.deferredIteratorScope(iterator)) {
          for (let step = keys.next(); step.done !== true; step = keys.next()) {
            const key = step.value;
            start();
            if (!iterator.valid()) {
              throw new ValueError(errorMessage);
            }

            yield keyed(key, iterator.current());

            iterator.next();
          }

          start();
          if (iterator.valid()) {
            throw new ValueError(errorMessage);
          }
        }
      }
    });
  }

  /** Flatten a multi-dimensional associative array with dots, `depth` levels down, through `Collection.dot`. */
  dot(depth: number = Infinity): this {
    return this.passthru("dot", [depth]);
  }

  /** Convert a flatten "dot" notation array into an expanded array, through `Collection.undot`. */
  undot(): this {
    return this.passthru("undot", []);
  }

  /**
   * Zip the collection together with one or more arrays, lazily: lazy collections of the n-th items, while any source
   * has one, `null` for a shorter source. `new LazyCollection([1, 2, 3]).zip([4, 5, 6])` is `[[1, 4], [2, 5], [3, 6]]`.
   * Each temporary source generator starts where PHP first reads it, and when the enumeration is abandoned or throws,
   * they are closed in order, this collection's first, as PHP destroys them.
   */
  zip(items: unknown, ...moreItems: unknown[]): this {
    void items;
    void moreItems;
    const iterables = [...arguments];

    return this.lazyInstance(function* (this: LazyCollection) {
      const iterators = new Collection(iterables).map((iterable: unknown) => this.makeIterator(iterable)).prepend(this.getIterator());

      // Destroying `$iterators` closes them in order. Each owned one is read through a `StartingCursor`, so it starts
      // where PHP's `contains->valid()` or `map->current()` first reads it, in PHP's order among the others.
      for (const starts of this.deferredIteratorScopes([...iterators] as Iterator[])) {
        const cursors = new Collection(([...iterators] as Iterator[]).map((iterator, index) => (this.#ownedIterators.has(iterator) ? new StartingCursor(iterator, starts[index]!) : iterator)));

        while (toBool((cursors.__get("contains") as HigherOrderCollectionProxy).__call("valid", []))) {
          yield this.newInstance((cursors.__get("map") as HigherOrderCollectionProxy).__call("current", []));

          (cursors.__get("each") as HigherOrderCollectionProxy).__call("next", []);
        }
      }
    });
  }

  /**
   * Get one item randomly (`number` null), or `number` items as a lazy collection, through `Collection.random`. Also
   * takes AD-26's options object `{ number, preserveKeys }`.
   */
  random(number?: unknown, preserveKeys?: boolean): any;
  random(options?: { number?: unknown; preserveKeys?: boolean }): any;
  random(number: unknown = null, preserveKeys: boolean = false): any {
    void preserveKeys;
    const result: unknown = this.collect().random(...([...arguments] as [unknown?, boolean?]));

    if (arguments.length === 1 && isOptionsObject(number)) {
      number = (number as { number?: unknown }).number ?? null;
    }

    return number === null ? result : this.newInstance(result);
  }

  /** Search the collection for a value (`==`, or `===` when `strict`) or a callback's match: its key, or `false`. */
  search(value: unknown, strict: boolean = false): PhpArrayKey | false {
    const predicate: unknown = this.useAsCallable(value)
      ? value
      : (item: unknown) => {
          return strict ? identical(item, value) : looseEquals(item, value);
        };

    for (const [key, item] of this.entries()) {
      if (toBool(callCallable(predicate, valueCopy(item), key))) {
        return key;
      }
    }

    return false;
  }

  /** Get the item before the given item (by `==`, `===` when `strict`, or a callback), or `null`. */
  before(value: unknown, strict: boolean = false): any {
    let previous: unknown = null;

    const predicate: unknown = this.useAsCallable(value)
      ? value
      : (item: unknown) => {
          return strict ? identical(item, value) : looseEquals(item, value);
        };

    for (const [key, item] of this.entries()) {
      if (toBool(callCallable(predicate, valueCopy(item), key))) {
        return previous;
      }

      previous = item;
    }

    return null;
  }

  /** Get the item after the given item (by `==`, `===` when `strict`, or a callback), or `null`. */
  after(value: unknown, strict: boolean = false): any {
    let found = false;

    const predicate: unknown = this.useAsCallable(value)
      ? value
      : (item: unknown) => {
          return strict ? identical(item, value) : looseEquals(item, value);
        };

    for (const [key, item] of this.entries()) {
      if (found) {
        return item;
      }

      if (toBool(callCallable(predicate, valueCopy(item), key))) {
        found = true;
      }
    }

    return null;
  }

  /** Skip the first `count` items. */
  skip(count: number): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($count)` copies the count into each call, which counts down its own copy.
      let remaining = count;
      for (const iterator of this.iteratorScope(this.getIterator() as Iterator)) {
        while (iterator.valid() && toBool(remaining--)) iterator.next();
        while (iterator.valid()) {
          yield keyed(iterator.key(), iterator.current());
          iterator.next();
        }
      }
    });
  }

  /** Skip items in the collection until the given condition is met: an item `===` the value, or a callback's match. */
  skipUntil<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  skipUntil<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  skipUntil(value_: unknown): this {
    const callback = this.useAsCallable(value_) ? value_ : this.equality(value_);

    return this.skipWhile(this.negate(callback));
  }

  /** Skip items in the collection while the given condition is met: an item `===` the value, or a callback's match. */
  skipWhile<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  skipWhile<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  skipWhile(value_: unknown): this {
    const callback = this.useAsCallable(value_) ? value_ : this.equality(value_);

    return this.lazyInstance(function* (this: LazyCollection) {
      for (const iterator of this.iteratorScope(this.getIterator() as Iterator)) {
        while (iterator.valid() && toBool(callCallable(callback, valueCopy(iterator.current()), iterator.key()))) iterator.next();
        while (iterator.valid()) {
          yield keyed(iterator.key(), iterator.current());
          iterator.next();
        }
      }
    });
  }

  /** Slice the underlying collection array, keys kept (a negative offset or length through `Collection.slice`). */
  slice(offset: number, length: number | null = null): this {
    if (offset < 0 || (length !== null && length < 0)) {
      return this.passthru("slice", [...arguments]);
    }

    const instance = this.skip(offset);

    return length === null ? instance : instance.take(length);
  }

  /**
   * Get the only item (optionally the only one a callback or `where(key, operator, value)` accepts). Throws
   * `ItemNotFoundException` for none and `MultipleItemsFoundException` for more than one.
   */
  sole(key: unknown = null, operator: unknown = null, value_: unknown = null): any {
    void operator;
    void value_;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    return (this.unless(looseEquals(filter, null)) as unknown as WhenFilterProxy).filter(filter).take(2).collect().sole();
  }

  /** Determine if the collection contains a single item, optionally matching the given criteria. */
  hasSole(key: unknown = null, operator: unknown = null, value_: unknown = null): boolean {
    void operator;
    void value_;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    return (this.unless(looseEquals(filter, null)) as unknown as WhenFilterProxy).filter(filter).take(2).count() === 1;
  }

  /** Get the first item (optionally the first matching), or throw `ItemNotFoundException` when there is none. */
  firstOrFail(key: unknown = null, operator: unknown = null, value_: unknown = null): any {
    void operator;
    void value_;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    return (this.unless(looseEquals(filter, null)) as unknown as WhenFilterProxy).filter(filter).take(1).collect().firstOrFail();
  }

  /**
   * Sort the collection using the given callback, lazily through `Collection.sortBy`. Also takes AD-26's options
   * object `{ options, descending }` after the callback.
   */
  sortBy(callback: unknown, options?: number, descending?: boolean | SortDirection): this;
  sortBy(callback: unknown, options?: { options?: number; descending?: boolean | SortDirection }): this;
  sortBy(callback: unknown, options?: unknown, descending?: unknown): this {
    void callback;
    void options;
    void descending;
    return this.passthru("sortBy", [...arguments]);
  }

  /** Take the first `limit` items, or the last `-limit` for a negative one. */
  take(limit: number): this {
    if (limit < 0) {
      return this.lazyInstance(function* (this: LazyCollection) {
        // PHP's `use ($limit)` copies the limit into each call.
        const size = Number(abs(limit));
        const ringBuffer: [PhpArrayKey, unknown][] = [];
        let position = 0;

        for (const [key, value_] of this.entries()) {
          ringBuffer[position] = [key, value_];
          position = (position + 1) % size;
        }

        const ringBufferCount = Number(count(ringBuffer));

        for (let i = 0, end = Number(min(size, ringBufferCount)); i < end; i++) {
          const pointer = ringBufferCount < size ? i : (position + i) % size;
          yield keyed(ringBuffer[pointer]![0], ringBuffer[pointer]![1]);
        }
      });
    }

    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($limit)` copies the limit into each call, which counts down its own copy.
      let remaining = limit;
      const iterator = this.getIterator() as Iterator;

      if (!toBool(remaining)) return;
      for (const cursor of this.iteratorScope(iterator)) {
        while (toBool(remaining--)) {
          if (!cursor.valid()) break;
          yield keyed(cursor.key(), cursor.current());
          if (toBool(remaining)) cursor.next();
        }
      }
    });
  }

  /** Take items in the collection until the given condition is met: an item `===` the value, or a callback's match. */
  takeUntil<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  takeUntil<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  takeUntil(value_: unknown): this {
    const callback = this.useAsCallable(value_) ? value_ : this.equality(value_);

    return this.lazyInstance(function* (this: LazyCollection) {
      for (const [key, item] of this.entries()) {
        if (toBool(callCallable(callback, valueCopy(item), key))) {
          break;
        }

        yield keyed(key, item);
      }
    });
  }

  /** Take items in the collection while the given condition is met: an item `===` the value, or a callback's match. */
  takeWhile<T, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  takeWhile<T, K>(this: T, value: ValueOrSyncCallback<K>): T;
  takeWhile(value_: unknown): this {
    const callback = this.useAsCallable(value_) ? value_ : this.equality(value_);

    return this.takeUntil((item: unknown, key: unknown) => !toBool(callCallable(callback, item, key)));
  }

  /** Materialize mapped values sequentially in key order, copying values and preserving keys.
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
   * `filter`'s async companion (DIV-1 Callbacks, DIV-1.2): a lazy collection over the items for which the awaited
   * `callback(value, key)` is truthy, keys kept. The source is enumerated once; each call is awaited before the next
   * starts, in key order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async filterAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const kept = new PhpArray();

    for (const [key, value_] of this.entries()) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        kept.set(key, value_);
      }
    }

    return this.newInstance(kept);
  }

  /**
   * `reject`'s async companion (DIV-1 Callbacks, DIV-1.2): a lazy collection over the items for which the awaited
   * `callback(value, key)` is falsy, keys kept. The source is enumerated once; each call is awaited before the next
   * starts, in key order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async rejectAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const kept = new PhpArray();

    for (const [key, value_] of this.entries()) {
      if (!toBool(await callCallable(callback, valueCopy(value_), key))) {
        kept.set(key, value_);
      }
    }

    return this.newInstance(kept);
  }

  /**
   * `partition`'s async companion (DIV-1 Callbacks, DIV-1.2): a lazy collection of `[passed, failed]` lazy collections
   * by the awaited `callback(value, key)`, each keeping its items' keys. The source is enumerated once; each call is
   * awaited before the next starts, in key order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async partitionAsync(callback: (value: any, key: any) => unknown): Promise<this> {
    const passed = new PhpArray();
    const failed = new PhpArray();

    for (const [key, value_] of this.entries()) {
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
   * item, stopping at the first falsy one (`true` when empty). Each call is awaited before the next starts, in key
   * order. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async everyAsync(callback: (value: any, key: any) => unknown): Promise<boolean> {
    for (const [key, value_] of this.entries()) {
      if (!toBool(await callCallable(callback, valueCopy(value_), key))) {
        return false;
      }
    }

    return true;
  }

  /**
   * `contains`'s async companion for a callback (DIV-1 Callbacks, DIV-1.2): whether the awaited `callback(value, key)`
   * is truthy for some item, stopping at the first. Each call is awaited before the next starts, in key order. A
   * rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async containsAsync(callback: (value: any, key: any) => unknown): Promise<boolean> {
    for (const [key, value_] of this.entries()) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        return true;
      }
    }

    return false;
  }

  /**
   * `first`'s async companion for a callback (DIV-1 Callbacks, DIV-1.2): the first item for which the awaited
   * `callback(value, key)` is truthy, else `value(default_)`. Each call is awaited before the next starts, in key
   * order, stopping at the first match. A rejected callback rejects the result.
   *
   * @asyncRoot callback
   */
  async firstAsync(callback: (value: any, key: any) => unknown, default_: unknown = null): Promise<any> {
    for (const [key, value_] of this.entries()) {
      if (toBool(await callCallable(callback, valueCopy(value_), key))) {
        return valueCopy(value_);
      }
    }

    return value(default_);
  }

  /** Get the values iterator. */
  getIterator(): Traversable {
    return this.makeIterator(this.source);
  }

  /** The values, as `foreach ($c as $v)` gives them (AD-26). */
  *[Symbol.iterator](): globalThis.Generator<unknown, void, undefined> {
    yield* this.getIterator();
  }

  /** The `[key, value]` pairs, as `foreach ($c as $k => $v)` gives them (AD-26). */
  *entries(): globalThis.Generator<[PhpArrayKey, unknown], void, undefined> {
    yield* this.getIterator().entries() as Iterable<[PhpArrayKey, unknown]>;
  }

  /** Count the number of items in the collection. */
  count(): number {
    if (is_array(this.source)) {
      return Number(count(this.source));
    }

    return iterator_count(this.getIterator());
  }

  /** Explode the "value" and "key" arguments passed to "pluck": a string is its "dot" segments. */
  protected explodePluckParameters(value_: unknown, key: unknown): [unknown, unknown] {
    value_ = is_string(value_) ? explode(".", value_) : value_;

    key = key === null || is_array(key) || key instanceof Closure ? key : explode(".", key);

    return [value_, key];
  }

  /** Pass this lazy collection through a method on the collection class, lazily. */
  protected passthru(method: string, params: unknown[]): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      const collection = this.collect() as unknown as Record<string, (...args: unknown[]) => unknown>;
      yield* yieldFrom(collection[method]!(...params));
    });
  }

  /** Keep a fresh owned generator's public cleanup traversal open around an otherwise untouched manual cursor. */
  protected *iteratorScope(iterator: Iterator): globalThis.Generator<Iterator, void, undefined> {
    if (!this.#ownedIterators.has(iterator)) {
      yield iterator;
      return;
    }
    const traversal = iterator.entries()[Symbol.iterator]();
    try {
      // Only our fresh runtime Generator wrappers are primed; their current/key reads have no user effects.
      traversal.next();
      yield iterator;
    } finally {
      traversal.return?.();
    }
  }

  /**
   * Like `iteratorScope`, but the cleanup traversal opens only when the yielded `start()` is first called, which is
   * where PHP first reads the cursor (a non-owned iterator gets a no-op `start`). The traversal is closed on exit.
   */
  protected *deferredIteratorScope(iterator: Iterator): globalThis.Generator<() => void, void, undefined> {
    if (!this.#ownedIterators.has(iterator)) {
      yield () => {};
      return;
    }
    const opened: { traversal: globalThis.Iterator<unknown> | null } = { traversal: null };
    try {
      yield () => {
        if (opened.traversal !== null) return;
        opened.traversal = iterator.entries()[Symbol.iterator]();
        // Only our fresh runtime Generator wrappers are primed; this runs the generator to its first yield, as the
        // first read PHP makes at this point does.
        opened.traversal.next();
      };
    } finally {
      opened.traversal?.return?.();
    }
  }

  /**
   * `deferredIteratorScope` for each iterator, the first innermost, so that on exit they close in order, as PHP
   * destroys an array of iterators. Yields the `start()` functions in the iterators' order.
   */
  protected *deferredIteratorScopes(iterators: readonly Iterator[]): globalThis.Generator<(() => void)[], void, undefined> {
    if (iterators.length === 0) {
      yield [];
      return;
    }
    for (const start of this.deferredIteratorScope(iterators[iterators.length - 1]!)) {
      for (const starts of this.deferredIteratorScopes(iterators.slice(0, -1))) {
        yield [...starts, start];
      }
    }
  }

  /**
   * Make an iterator from the given source: an `IteratorAggregate`'s iterator, an `ArrayIterator` over an array, or
   * what a callable source returns (a generator, wrapped in the runtime's `Generator` under DIV-12.18; any other
   * value wrapped in an array).
   */
  protected makeIterator(source: unknown): Traversable {
    if (source instanceof IteratorAggregate) {
      const iterator = source.getIterator();
      if (source instanceof LazyCollection && source.#ownedIterators.has(iterator)) this.#ownedIterators.add(iterator);
      else this.#ownedIterators.delete(iterator);
      return iterator;
    }

    if (is_array(source)) {
      return new ArrayIterator(source);
    }

    if (is_callable(source)) {
      let maybeTraversable = callCallable(source as SourceFunction);
      // A returned runtime iterator may have been captured by the caller, even if we created it earlier.
      if (maybeTraversable instanceof Traversable) this.#ownedIterators.delete(maybeTraversable);

      // DIV-12.18: a generator function's bare JS generator object iterates as the runtime's `Generator`.
      // It answers `instanceof Traversable` too, but carries no brand; the runtime's `Generator` wrapper does.
      if (maybeTraversable instanceof Generator && !hasBrand(maybeTraversable, Traversable)) {
        maybeTraversable = Generator.owned(maybeTraversable as globalThis.Generator<unknown, unknown, unknown>);
        this.#ownedIterators.add(maybeTraversable as Generator);
      }

      return maybeTraversable instanceof Traversable ? maybeTraversable : new ArrayIterator(Arr.wrap(maybeTraversable));
    }

    return new ArrayIterator(toPhpArray(source));
  }
}

/**
 * An owned iterator as `zip` reads it: `valid`, `current`, `key` and `next` call its scope's `start()` first, then
 * forward. Internal to this module; it never leaves `zip`.
 */
class StartingCursor {
  readonly #iterator: Iterator;
  readonly #start: () => void;

  constructor(iterator: Iterator, start: () => void) {
    this.#iterator = iterator;
    this.#start = start;
  }

  valid(): boolean {
    this.#start();
    return this.#iterator.valid();
  }

  current(): unknown {
    this.#start();
    return this.#iterator.current();
  }

  key(): unknown {
    this.#start();
    return this.#iterator.key();
  }

  next(): void {
    this.#start();
    this.#iterator.next();
  }
}

/** Hold `iterator` for a `for…of` scope that returns it on exit; a body exception wins over one from `return()`. */
function* closingScope<T>(iterator: globalThis.Iterator<T>): globalThis.Generator<globalThis.Iterator<T>, void, undefined> {
  try {
    yield iterator;
  } finally {
    iterator.return?.();
  }
}

registerClass("Illuminate\\Support\\LazyCollection", LazyCollection);
