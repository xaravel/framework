// Laravel's `Illuminate\Support\LazyCollection` (v13.37.0), the members Stories 14.1-14.3 port; the Collections
// Stories that port their tests add the rest. The async companions (`filterAsync`, …; DIV-1 Callbacks, DIV-1.2)
// enumerate the source once, awaiting each callback in key order, and resolve a lazy collection over the kept items. It is `mixin(null, EnumeratesValues, Macroable)`, as Upstream's
// `use EnumeratesValues, Macroable`.
//
// Generators follow DIV-12.18: a source generator function writes `yield keyed(k, v)` for PHP's `yield $k => $v` and
// `yield* yieldFrom(it)` for `yield from $it`, and the internal sources below do the same. Calling a generator function
// gives a bare JS generator object, which is no `Traversable` in the runtime (it answers `instanceof Generator`), so
// `makeIterator` wraps it in the runtime's `Generator` before Upstream's `Traversable` test; a bare generator object
// passed to the constructor is still refused, as Upstream refuses one. PHP's interfaces are brand getters (AD-9.5), and
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
// This module imports `Collection` first: `Collection.ts` loads the trait before either class is defined.
import "./Collection";
import { Arrayable, CanBeEscapedWhenCastToString, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  abs,
  array_flip,
  array_key_exists,
  arrayEntries,
  arrayFromEntries,
  ArrayIterator,
  Closure,
  count,
  explode,
  Generator,
  identical,
  in_array,
  InvalidArgumentException,
  is_array,
  is_callable,
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
  stdClass,
  Stringable,
  toBool,
  toInt,
  toPhpArray,
  toPhpString,
  Traversable,
  UnitEnum,
  valueCopy,
  yieldFrom,
} from "@xaravel/runtime";
import { Arr } from "./Arr";
import { Enumerable } from "./Enumerable";
import { enum_value } from "./functions";
import { data_get, value } from "./helpers";
import { callCallable, isOptionsObject, offsetRead, propertyIsSet, propertyRead, type SyncCallback, type ValueOrSyncCallback } from "./support/callables";
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

/** A generator function, PHP's `Closure(): Generator` source (DIV-12.18). */
type SourceFunction = () => unknown;

/** A lazily enumerated collection: Laravel's `Illuminate\Support\LazyCollection`. */
export class LazyCollection extends mixin(null, EnumeratesValues, Macroable) {
  /** The source from which to generate items: a generator function, another lazy collection, or a PHP array. */
  source: unknown;

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
  filter<R>(callback: SyncCallback<[value: any, key: any], R> | null = null): this {
    const test: ItemCallback = callback ?? ((value_: unknown) => toBool(value_));
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
    return !(this.getIterator() as Iterator).valid();
  }

  /** Run a map over each of the items: the callback gets each value and its key, and keys are kept. */
  map<R>(callback: SyncCallback<[value: any, key: any], R>): this {
    return this.lazyInstance(function* (this: LazyCollection): globalThis.Generator<KeyedYield, void, unknown> {
      for (const [key, value_] of this.entries()) {
        yield keyed(key, callCallable(callback, valueCopy(value_), key));
      }
    });
  }

  /** Return only unique items from the collection, by `==` or, when `strict`, by `===`; the first of each is kept. */
  unique<T, R>(this: T, key: SyncCallback<[value: any, key: any], R>, strict?: boolean): T;
  unique<T, K>(this: T, key?: ValueOrSyncCallback<K>, strict?: boolean): T;
  unique(key: unknown = null, strict: boolean = false): this {
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
  containsStrict(key: unknown, value_: unknown = null): boolean {
    if (arguments.length === 2) {
      return this.contains((item: unknown) => identical(data_get(item, key), value_));
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
      if (!iterator.valid()) {
        return value(defaultValue);
      }

      return iterator.current();
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
  pluck(value_: unknown, key: unknown = null): this {
    return this.lazyInstance(function* (this: LazyCollection) {
      // PHP's `use ($value, $key)` copies them into each call, which reassigns its own copies.
      const [itemValuePath, itemKeyPath] = this.explodePluckParameters(value_, key);

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
  search(value_: unknown, strict: boolean = false): PhpArrayKey | false {
    const predicate: unknown = this.useAsCallable(value_)
      ? value_
      : (item: unknown) => {
          return strict ? identical(item, value_) : looseEquals(item, value_);
        };

    for (const [key, item] of this.entries()) {
      if (toBool(callCallable(predicate, valueCopy(item), key))) {
        return key;
      }
    }

    return false;
  }

  /** Get the item before the given item (by `==`, `===` when `strict`, or a callback), or `null`. */
  before(value_: unknown, strict: boolean = false): any {
    let previous: unknown = null;

    const predicate: unknown = this.useAsCallable(value_)
      ? value_
      : (item: unknown) => {
          return strict ? identical(item, value_) : looseEquals(item, value_);
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
  after(value_: unknown, strict: boolean = false): any {
    let found = false;

    const predicate: unknown = this.useAsCallable(value_)
      ? value_
      : (item: unknown) => {
          return strict ? identical(item, value_) : looseEquals(item, value_);
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
      const iterator = this.getIterator() as Iterator;

      while (iterator.valid() && toBool(remaining--)) {
        iterator.next();
      }

      while (iterator.valid()) {
        yield keyed(iterator.key(), iterator.current());

        iterator.next();
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
      const iterator = this.getIterator() as Iterator;

      while (iterator.valid() && toBool(callCallable(callback, valueCopy(iterator.current()), iterator.key()))) {
        iterator.next();
      }

      while (iterator.valid()) {
        yield keyed(iterator.key(), iterator.current());

        iterator.next();
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

      while (toBool(remaining--)) {
        if (!iterator.valid()) {
          break;
        }

        yield keyed(iterator.key(), iterator.current());

        if (toBool(remaining)) {
          iterator.next();
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

  /**
   * Make an iterator from the given source: an `IteratorAggregate`'s iterator, an `ArrayIterator` over an array, or
   * what a callable source returns (a generator, wrapped in the runtime's `Generator` under DIV-12.18; any other
   * value wrapped in an array).
   */
  protected makeIterator(source: unknown): Traversable {
    if (source instanceof IteratorAggregate) {
      return source.getIterator();
    }

    if (is_array(source)) {
      return new ArrayIterator(source);
    }

    if (is_callable(source)) {
      let maybeTraversable = callCallable(source as SourceFunction);

      // DIV-12.18: a generator function's bare JS generator object iterates as the runtime's `Generator`.
      if (maybeTraversable instanceof Generator && !(maybeTraversable instanceof Traversable)) {
        maybeTraversable = new Generator(maybeTraversable);
      }

      return maybeTraversable instanceof Traversable ? maybeTraversable : new ArrayIterator(Arr.wrap(maybeTraversable));
    }

    return new ArrayIterator(toPhpArray(source));
  }
}

registerClass("Illuminate\\Support\\LazyCollection", LazyCollection);
