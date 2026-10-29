// Illuminate\Support\Enumerable, from laravel/framework v13.37.0: the interface `Collection` and `LazyCollection`
// implement, as a contract token (AD-1, AD-9.5). PHP's `Enumerable extends Arrayable, Countable, IteratorAggregate,
// Jsonable, JsonSerializable`; `Countable` is no token, so the token records the other four as parents and lists the
// built-in methods `count` and `getIterator` (decisions/ESC-10.2-4.md). A class implements it with a brand getter per
// token in its chain (`get [Enumerable.brand]()`, `get [Arrayable.brand]()`, …), as `instanceof` reads only a token's
// own brand.
//
// The TypeScript interface covers the members Stories 14.1-14.4 port (`collapseWithKeys` is the classes' own, as in PHP's interface); later Collections Stories extend it with
// theirs. As in PHP's interface, `dot` and `multiply` are the classes' own members, not the interface's. It also declares the async companions (`filterAsync`, `rejectAsync`, `partitionAsync`, `everyAsync`,
// `containsAsync`, `firstAsync`; DIV-1 Callbacks, DIV-1.2), which are Xaravel's and not PHP's, so the token's method
// map, which records PHP's interface, does not list them. Sync members type their callbacks with `SyncCallback`, so
// an async callback does not compile and lint reports it (AD-6). `has`, `hasAny`, `except` and `only` take a list of
// keys or the keys as arguments (PHP's `func_get_args()`).
// `random` has only the positional form here, as Upstream's interface declares `random($number = null)`; `sortBy`
// and `duplicates` also take AD-26's options object (`{ options, descending }`, `{ callback, strict }`).
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { type ContractToken, contract } from "@xaravel/contracts";
import type { NotPromise } from "@xaravel/contracts/async";
import type { SyncCallback, SyncCallable, ValueOrSyncCallback } from "./support/callables";
import { type CachingIterator, IteratorAggregate, JsonSerializable, type PhpArray, type PhpArrayKey, type SortDirection, type Traversable } from "@xaravel/runtime";

/** A sort key or synchronous comparison, optionally paired with a direction. */
export type SortByDescComparison<R> = string | number | bigint | SyncCallback<[a: any, b: any], R> | [string | number | bigint | SyncCallback<[a: any, b: any], R>, boolean | string | SortDirection];

/** Descending sort accepts a key, a synchronous retriever, or PHP comparison-array forms. */
export type SortByDescCallback<R> = string | number | bigint | boolean | null | SyncCallback<[value: any, key: any], R> | SortByDescComparison<R>[] | PhpArray<PhpArrayKey, SortByDescComparison<R>> | Record<string, SortByDescComparison<R>>;

/**
 * The callback of `whenEmpty`, `unless` and their kin: called with the collection and the condition's value. A
 * closure, or an invokable object whose `__invoke` is called. A dual helper's callback (AD-6, DIV-1.6): it may be
 * async, and its own result type `R` is returned.
 */
export type EnumerableCallback<S, V, R> = ((self: S, value: V) => R) | { __invoke(self: S, value: V): R };

/** What such a callback's result `r` makes the member return: `r ?? this`, as `when` does. */
export type EnumerableResult<R, S> = Exclude<R, null | undefined | void> | S;

declare const EnumerableBrand: unique symbol;

/** Laravel's `Enumerable`: the members `Collection` and `LazyCollection` share. */
export interface Enumerable extends Arrayable, Jsonable, JsonSerializable, IteratorAggregate {
  readonly [Enumerable.brand]: true;

  /** Get all items in the enumerable. */
  all(): unknown;

  /** Execute a callback over each item. */
  each<R>(callback: SyncCallable<[item: any, key: any], R>): this;

  /** Run a filter over each of the items. */
  filter<R>(callback?: SyncCallable<[value: any, key: any], R> | null): Enumerable;

  /** Get an item from the collection by key. */
  get(key: unknown, defaultValue?: unknown): unknown;

  /** Determine if all of the keys exist in the collection. */
  has(key: unknown, ...moreKeys: unknown[]): boolean;

  /** Determine if any of the keys exist in the collection. */
  hasAny(key: unknown, ...moreKeys: unknown[]): boolean;

  /** Alias for the "contains" method. */
  some(key: unknown, operator?: unknown, value?: unknown): boolean;

  /** Determine if an item exists, using strict comparison. */
  containsStrict(key: unknown, value?: unknown): boolean;

  /** Determine if an item exists in the enumerable. */
  contains<R>(callback: SyncCallback<[value: any, key: any], R>): boolean;
  contains<K>(key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): boolean;

  /** Determine if an item is not contained in the collection. */
  doesntContain(key: unknown, operator?: unknown, value?: unknown): boolean;

  /** Get all items except for those with the specified keys. */
  except(keys: unknown, ...moreKeys: unknown[]): Enumerable;

  /** Filter items by the given key value pair. */
  where(key: unknown, operator?: unknown, value?: unknown): Enumerable;

  /** Get the first item from the enumerable passing the given truth test. */
  first<R>(callback?: SyncCallback<[value: any, key: any], R> | null, defaultValue?: unknown): unknown;

  /** Get the first item by the given key value pair. */
  firstWhere(key: unknown, operator?: unknown, value?: unknown): unknown;

  /** Determine if the collection contains a single item. */
  containsOneItem(): boolean;

  /** Determine if the collection contains multiple items. */
  containsManyItems(): boolean;

  /** Determine if the collection contains a single item, optionally matching the given criteria. */
  hasSole(key?: unknown, operator?: unknown, value?: unknown): boolean;

  /** Determine if the collection contains multiple items, optionally matching the given criteria. */
  hasMany(key?: unknown, operator?: unknown, value?: unknown): boolean;

  /** Get the keys of the collection items. */
  keys(): Enumerable;

  /** Get the last item from the collection. */
  last<R>(callback?: SyncCallback<[value: any, key: any], R> | null, defaultValue?: unknown): unknown;

  /** Create a new collection consisting of every n-th element. */
  nth(step: number, offset?: number): Enumerable;

  /** Get the items with the specified keys. */
  only(keys: unknown, ...moreKeys: unknown[]): Enumerable;

  /** Get one or a specified number of items randomly from the collection. */
  random(number?: unknown): unknown;

  /** Search the collection for a given value and return the corresponding key if successful. */
  search(value: unknown, strict?: boolean): PhpArrayKey | false;

  /** Get the item before the given item. */
  before(value: unknown, strict?: boolean): unknown;

  /** Get the item after the given item. */
  after(value: unknown, strict?: boolean): unknown;

  /** Skip the first {$count} items. */
  skip(count: number): Enumerable;

  /** Get a slice of items from the enumerable. */
  slice(offset: number, length?: number | null): Enumerable;

  /** Get the first item in the collection, but only if exactly one item exists. Otherwise, throw an exception. */
  sole(key?: unknown, operator?: unknown, value?: unknown): unknown;

  /** Get the first item in the collection but throw an exception if no matching items exist. */
  firstOrFail(key?: unknown, operator?: unknown, value?: unknown): unknown;

  /** Sort the collection using the given callback. */
  sortBy(callback: unknown, options?: number, descending?: boolean | SortDirection): Enumerable;
  sortBy(callback: unknown, options?: { options?: number; descending?: boolean | SortDirection }): Enumerable;

  /** Take the first or last {$limit} items. */
  take(limit: number): Enumerable;

  /** Get the values of a given key. */
  pluck(value: unknown, key?: unknown): Enumerable;

  /** Determine if the collection is empty or not. */
  isEmpty(): boolean;

  /** Determine if the collection is not empty. */
  isNotEmpty(): boolean;

  /** Run a map over each of the items. */
  map<R>(callback: SyncCallable<[value: any, key: any], R>): Enumerable;

  /** Get the median non-null value. */
  median(key?: unknown): unknown;
  /** Sum the resolved values. */
  sum<R>(callback?: SyncCallable<[value: any, key: any], R> | string | null): unknown;
  /** Average the non-null resolved values. */
  avg<R>(callback?: SyncCallable<[value: any], R> | string | null): unknown;
  /** Alias for avg. */
  average<R>(callback?: SyncCallable<[value: any], R> | string | null): unknown;
  /** Execute a callback over unpacked chunks. */
  eachSpread<R>(callback: SyncCallable<any[], R> | string): this;
  /** Map unpacked chunks. */
  mapSpread<R>(callback: SyncCallable<any[], R> | string): Enumerable;
  /** Group callback pairs into arrays. */
  mapToDictionary<R>(callback: SyncCallable<[value: any, key: any], R>): Enumerable;
  /** Group callback pairs into collections. */
  mapToGroups<R>(callback: SyncCallable<[value: any, key: any], R>): Enumerable;
  /** Map values into a constructor or backed enum. */
  mapInto(className: (new (...args: any[]) => unknown) | string): Enumerable;
  /** Return complete sliding windows; also takes AD-26's options object `{ size, step }`. */
  sliding(size?: number, step?: number): Enumerable;
  sliding(options?: { size?: number; step?: number }): Enumerable;
  /** Split into balanced groups. */
  split(numberOfGroups: number): Enumerable;
  /** Split into groups filling the first completely. */
  splitIn(numberOfGroups: number): Enumerable;
  /** Chunk the collection into chunks of the given size. */
  chunk(size: number): Enumerable;
  /** Chunk consecutive items while the callback returns true. */
  chunkWhile<R>(callback: SyncCallable<[value: any, key: any, chunk: import("./Collection").Collection], R>): Enumerable;
  /** Chunk consecutive items with equal resolved keys. */
  chunkBy<R>(key: SyncCallable<[value: any, key: any], R> | string): Enumerable;
  /** Sort keys with PHP flags; also takes AD-26's options object `{ options, descending }`. */
  sortKeys(options?: number, descending?: boolean | SortDirection): Enumerable;
  sortKeys(options?: { options?: number; descending?: boolean | SortDirection }): Enumerable;
  /** Sort keys in descending order. */
  sortKeysDesc(options?: number): Enumerable;
  /** Sort keys using a synchronous comparator. */
  sortKeysUsing<R>(callback: SyncCallable<[a: any, b: any], R> | string): Enumerable;
  /** Reduce to several aggregate values. */
  reduceSpread<R>(callback: SyncCallable<any[], R> | string, ...initial: unknown[]): unknown[] | Record<string, unknown> | PhpArray;

  /** Map and collapse the result by one level. */
  flatMap<R>(callback: SyncCallable<[value: any, key: any], R>): Enumerable;
  /** Map the items into associative key/value pairs. */
  mapWithKeys<R>(callback: SyncCallable<[value: any, key: any], R>): Enumerable;
  /** Reverse the items, keeping keys. */
  reverse(): Enumerable;
  /** Sort the items with a callback or PHP sort flags, keeping keys. */
  sort<R>(callback?: SyncCallable<[a: any, b: any], R> | string | number | null): Enumerable;
  /** Sort by a retriever descending. */
  sortByDesc<R>(callback: SortByDescCallback<R>, options?: number): Enumerable;
  /** Sort descending, keeping keys. */
  sortDesc(options?: number): Enumerable;
  /** Get the most frequent values. */
  mode(key?: unknown): unknown;
  /** Get the minimum resolved value. */
  min<R>(callback?: SyncCallable<[value: any, key: any], R> | string | null): unknown;
  /** Get the maximum resolved value. */
  max<R>(callback?: SyncCallable<[value: any, key: any], R> | string | null): unknown;
  /** Reduce the collection. */
  reduce<R>(callback: SyncCallable<[carry: any, value: any, key: any], R>, initial?: unknown): unknown;
  /** Reduce an associative collection. */
  reduceWithKeys<R>(callback: SyncCallable<[carry: any, value: any, key: any], R>, initial?: unknown): unknown;
  /** Reduce by mutating an initial value. */
  reduceInto<I, R>(initial: I, callback: SyncCallable<[carry: import("@xaravel/runtime").Ref<I>, value: any, key: any], R>): I;
  /** Pass the collection to a callback. */
  pipe<R>(callback: SyncCallable<[collection: this], R>): R;
  /** Pass the collection to a constructor. */
  pipeInto<R>(className: new (collection: this) => R): R;
  /** Pass the collection through callbacks in order. */
  pipeThrough<R>(pipes: SyncCallable<[carry: any], R>[]): unknown;
  /** Invoke a callback and return the collection. */
  tap<R>(callback: SyncCallable<[collection: this], R>): this;
  /** Paginate using a slice. */
  forPage(page: number, perPage: number): Enumerable;
  /** Map sequentially in key order.
   * @asyncRoot callback
   */
  mapAsync(callback: (value: any, key: any) => unknown): Promise<Enumerable>;
  /** Iterate sequentially in key order.
   * @asyncRoot callback
   */
  eachAsync(callback: (value: any, key: any) => unknown): Promise<this>;

  /** Create a collection of all elements that do not pass a given truth test. */
  reject<R>(callback: SyncCallback<[value: any, key: any], R>): Enumerable;
  reject<K>(callback?: ValueOrSyncCallback<K>): Enumerable;

  /** Return only unique items from the collection array; also takes AD-26's options object `{ key, strict }`. */
  unique<R>(options?: { key?: SyncCallback<[value: any, key: any], R> | string | null; strict?: boolean }): Enumerable;
  unique<R>(key: SyncCallback<[value: any, key: any], R>, strict?: boolean): Enumerable;
  unique<K>(key?: ValueOrSyncCallback<K>, strict?: boolean): Enumerable;

  /** Shuffle the items in the collection. */
  shuffle(): Enumerable;

  /** Reset the keys on the underlying array. */
  values(): Enumerable;

  /** Get the values iterator. */
  getIterator(): Traversable;

  /** Count the number of items in the collection. */
  count(): number;

  /** Count the number of items in the collection by a field or using a callback. */
  countBy(countBy?: unknown): Enumerable;

  /** Iterate the `[key, value]` pairs, as PHP's `foreach ($c as $k => $v)` does (AD-26). */
  entries(): Iterable<[PhpArrayKey, unknown]>;

  /** Collect the values into a collection. */
  collect(): Enumerable;

  /** Get the collection of items as a plain array. */
  toArray(): any;

  /** Convert the object into something JSON serializable. */
  jsonSerialize(): unknown;

  /** Get the collection of items as JSON. */
  toJson(options?: number): string;

  /** Get the collection of items as pretty print formatted JSON. */
  toPrettyJson(options?: number): string;

  /** Get a CachingIterator instance. */
  getCachingIterator(flags?: number): CachingIterator;

  /** Convert the collection to its string representation (`__toString`). */
  toString(): string;

  /** Indicate that the model's string representation should be escaped when __toString is invoked. */
  escapeWhenCastingToString(escape?: boolean): this;

  /** Retrieve duplicate items. */
  duplicates<R>(callback?: SyncCallback<[value: any, key: any], R> | string | null, strict?: boolean): Enumerable;
  duplicates<R>(options?: { callback?: SyncCallback<[value: any, key: any], R> | string | null; strict?: boolean }): Enumerable;

  /** Retrieve duplicate items using strict comparison. */
  duplicatesStrict<R>(callback?: SyncCallback<[value: any, key: any], R> | string | null): Enumerable;

  /** Determine if all items pass the given truth test. */
  every<R>(callback: SyncCallback<[value: any, key: any], R>): boolean;
  every<K>(key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): boolean;

  /** Apply the callback if the collection is empty (a dual helper, as `when`). */
  whenEmpty<R = never, D = never>(callback: EnumerableCallback<this, boolean, R>, defaultValue?: EnumerableCallback<this, boolean, D> | null): EnumerableResult<R | D, this>;

  /** Apply the callback if the collection is not empty (a dual helper, as `when`). */
  whenNotEmpty<R = never, D = never>(callback: EnumerableCallback<this, boolean, R>, defaultValue?: EnumerableCallback<this, boolean, D> | null): EnumerableResult<R | D, this>;

  /** Apply the callback unless the collection is empty (a dual helper, as `when`). */
  unlessEmpty<R = never, D = never>(callback: EnumerableCallback<this, boolean, R>, defaultValue?: EnumerableCallback<this, boolean, D> | null): EnumerableResult<R | D, this>;

  /** Apply the callback unless the collection is not empty (a dual helper, as `when`). */
  unlessNotEmpty<R = never, D = never>(callback: EnumerableCallback<this, boolean, R>, defaultValue?: EnumerableCallback<this, boolean, D> | null): EnumerableResult<R | D, this>;

  /**
   * Apply the callback if the given "value" is (or resolves to) falsy, else the default when one is given (a dual
   * helper, as Conditionable's `unless`).
   */
  unless<V, R = never, D = never>(value: NotPromise<V> | ((self: this) => NotPromise<V>), callback: EnumerableCallback<this, V, R>, defaultValue?: EnumerableCallback<this, V, D> | null): EnumerableResult<R | D, this>;

  /** Filter items where the value for the given key is null. */
  whereNull(key?: unknown): Enumerable;

  /** Filter items where the value for the given key is not null. */
  whereNotNull(key?: unknown): Enumerable;

  /** Filter items by the given key value pair using strict comparison. */
  whereStrict(key: unknown, value: unknown): Enumerable;

  /** Filter items by the given key value pair. */
  whereIn(key: unknown, values: unknown, strict?: boolean): Enumerable;

  /** Filter items by the given key value pair using strict comparison. */
  whereInStrict(key: unknown, values: unknown): Enumerable;

  /** Filter items such that the value of the given key is between the given values. */
  whereBetween(key: unknown, values: unknown): Enumerable;

  /** Filter items such that the value of the given key is not between the given values. */
  whereNotBetween(key: unknown, values: unknown): Enumerable;

  /** Filter items by the given key value pair. */
  whereNotIn(key: unknown, values: unknown, strict?: boolean): Enumerable;

  /** Filter items by the given key value pair using strict comparison. */
  whereNotInStrict(key: unknown, values: unknown): Enumerable;

  /** Filter the items, removing any items that don't match the given type(s). */
  whereInstanceOf(type: unknown): Enumerable;

  /** Group an associative array by a field or using a callback (or by a list of them, one level each). */
  groupBy<R>(groupBy: SyncCallback<[value: any, key: any], R>, preserveKeys?: boolean): Enumerable;
  groupBy<K>(groupBy: ValueOrSyncCallback<K>, preserveKeys?: boolean): Enumerable;

  /** Key an associative array by a field or using a callback. */
  keyBy<R>(keyBy: SyncCallback<[value: any, key: any], R>): Enumerable;
  keyBy<K>(keyBy: ValueOrSyncCallback<K>): Enumerable;

  /** Partition the collection into two arrays using the given callback or key. */
  partition<R>(callback: SyncCallback<[value: any, key: any], R>): Enumerable;
  partition<K>(key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): Enumerable;

  /** Push all of the given items onto the collection. */
  concat(source: unknown): Enumerable;

  /** Skip items in the collection until the given condition is met. */
  skipUntil<R>(callback: SyncCallback<[value: any, key: any], R>): Enumerable;
  skipUntil<K>(value: ValueOrSyncCallback<K>): Enumerable;

  /** Skip items in the collection while the given condition is met. */
  skipWhile<R>(callback: SyncCallback<[value: any, key: any], R>): Enumerable;
  skipWhile<K>(value: ValueOrSyncCallback<K>): Enumerable;

  /** Take items in the collection until the given condition is met. */
  takeUntil<R>(callback: SyncCallback<[value: any, key: any], R>): Enumerable;
  takeUntil<K>(value: ValueOrSyncCallback<K>): Enumerable;

  /** Take items in the collection while the given condition is met. */
  takeWhile<R>(callback: SyncCallback<[value: any, key: any], R>): Enumerable;
  takeWhile<K>(value: ValueOrSyncCallback<K>): Enumerable;

  /** Return only unique items from the collection array using strict comparison. */
  uniqueStrict<R>(key: SyncCallback<[value: any, key: any], R>): Enumerable;
  uniqueStrict<K>(key?: ValueOrSyncCallback<K>): Enumerable;

  /** Collapse the collection of items into a single array. */
  collapse(): Enumerable;

  /** Cross join with the given lists, returning all possible permutations. */
  crossJoin(...lists: unknown[]): Enumerable;

  /** Get the items in the collection that are not present in the given items. */
  diff(items: unknown): Enumerable;

  /** Get the items in the collection that are not present in the given items, using the callback. */
  diffUsing<R>(items: unknown, callback: SyncCallback<[a: any, b: any], R> | string): Enumerable;

  /** Get the items in the collection whose keys and values are not present in the given items. */
  diffAssoc(items: unknown): Enumerable;

  /** Get the items in the collection whose keys and values are not present in the given items, using the callback. */
  diffAssocUsing<R>(items: unknown, callback: SyncCallback<[a: any, b: any], R> | string): Enumerable;

  /** Get the items in the collection whose keys are not present in the given items. */
  diffKeys(items: unknown): Enumerable;

  /** Get the items in the collection whose keys are not present in the given items, using the callback. */
  diffKeysUsing<R>(items: unknown, callback: SyncCallback<[a: any, b: any], R> | string): Enumerable;

  /** Get a flattened list of the items in the collection. */
  flatten(depth?: number): Enumerable;

  /** Flip the values with their keys. */
  flip(): Enumerable;

  /** Concatenate values of a given key as a string. */
  implode<R>(value: SyncCallback<[value: any, key: any], R> | string | null, glue?: string | null): string;

  /** Intersect the collection with the given items. */
  intersect(items: unknown): Enumerable;

  /** Intersect the collection with the given items, using the callback. */
  intersectUsing<R>(items: unknown, callback: SyncCallback<[a: any, b: any], R> | string): Enumerable;

  /** Intersect the collection with the given items with additional index check. */
  intersectAssoc(items: unknown): Enumerable;

  /** Intersect the collection with the given items with additional index check, using the callback. */
  intersectAssocUsing<R>(items: unknown, callback: SyncCallback<[a: any, b: any], R> | string): Enumerable;

  /** Intersect the collection with the given items by key. */
  intersectByKeys(items: unknown): Enumerable;

  /** Join all items from the collection using a string. The final items can use a separate glue string. */
  join(glue: string, finalGlue?: string): unknown;

  /** Merge the collection with the given items. */
  merge(items: unknown): Enumerable;

  /** Recursively merge the collection with the given items. */
  mergeRecursive(items: unknown): Enumerable;

  /** Create a collection by using this collection for keys and another for its values. */
  combine(values: unknown): Enumerable;

  /** Union the collection with the given items. */
  union(items: unknown): Enumerable;

  /** Replace the collection items with the given items. */
  replace(items: unknown): Enumerable;

  /** Recursively replace the collection items with the given items. */
  replaceRecursive(items: unknown): Enumerable;

  /** Convert a flatten "dot" notation array into an expanded array. */
  undot(): Enumerable;

  /** Zip the collection together with one or more arrays. */
  zip(items: unknown, ...moreItems: unknown[]): Enumerable;

  /** Pad collection to the specified length with a value. */
  pad(size: number, value: unknown): Enumerable;

  /**
   * `filter` with a callback that may be async (DIV-1 Callbacks, DIV-1.2), awaited in key order.
   *
   * @asyncRoot callback
   */
  filterAsync(callback: (value: any, key: any) => unknown): Promise<Enumerable>;

  /**
   * `reject` with a callback that may be async (DIV-1 Callbacks, DIV-1.2), awaited in key order.
   *
   * @asyncRoot callback
   */
  rejectAsync(callback: (value: any, key: any) => unknown): Promise<Enumerable>;

  /**
   * `partition` with a callback that may be async (DIV-1 Callbacks, DIV-1.2), awaited in key order.
   *
   * @asyncRoot callback
   */
  partitionAsync(callback: (value: any, key: any) => unknown): Promise<Enumerable>;

  /**
   * `every` with a callback that may be async (DIV-1 Callbacks, DIV-1.2), awaited in key order.
   *
   * @asyncRoot callback
   */
  everyAsync(callback: (value: any, key: any) => unknown): Promise<boolean>;

  /**
   * `contains` with a callback that may be async (DIV-1 Callbacks, DIV-1.2), awaited in key order.
   *
   * @asyncRoot callback
   */
  containsAsync(callback: (value: any, key: any) => unknown): Promise<boolean>;

  /**
   * `first` with a callback that may be async (DIV-1 Callbacks, DIV-1.2), awaited in key order.
   *
   * @asyncRoot callback
   */
  firstAsync(callback: (value: any, key: any) => unknown, defaultValue?: unknown): Promise<unknown>;

  /** Dynamically access collection proxies (DIV-12.16). */
  __get(key: string): unknown;
}

/**
 * The static side of `Enumerable`, satisfied by an implementing class's constructor: PHP's interface declares these
 * as static methods, which a TypeScript interface cannot hold (decisions/ESC-10.2-1.md).
 */
export interface EnumerableStatic {
  /** Create a new collection instance if the value isn't one already. */
  make(items?: unknown): Enumerable;

  /** Create a new instance by invoking the callback a given amount of times. */
  times(number: number, callback?: ((number: number) => unknown) | null): Enumerable;

  /** Create a collection with the given range. */
  range(from: number, to: number, step?: number): Enumerable;

  /** Wrap the given value in a collection if applicable. */
  wrap(value: unknown): Enumerable;

  /** Get the underlying items from the given collection if applicable. */
  unwrap(value: unknown): unknown;

  /** Create a new instance with no items. */
  empty(): Enumerable;

  /** Add a method to the list of proxied methods. */
  proxy(method: string): void;
}

export const Enumerable = contract<Enumerable, typeof EnumerableBrand>(
  "Illuminate\\Support\\Enumerable",
  {
    median: ["key"],
    sum: ["callback"],
    avg: ["callback"],
    average: ["callback"],
    eachSpread: ["callback"],
    mapSpread: ["callback"],
    mapToDictionary: ["callback"],
    mapToGroups: ["callback"],
    mapInto: ["class"],
    sliding: ["size", "step"],
    split: ["numberOfGroups"],
    splitIn: ["numberOfGroups"],
    chunk: ["size"],
    chunkWhile: ["callback"],
    chunkBy: ["key"],
    sortKeys: ["options", "descending"],
    sortKeysDesc: ["options"],
    sortKeysUsing: ["callback"],
    reduceSpread: ["callback", "initial"],
    all: [],
    each: ["callback"],
    filter: ["callback"],
    get: ["key", "default"],
    has: ["key"],
    hasAny: ["key"],
    some: ["key", "operator", "value"],
    containsStrict: ["key", "value"],
    contains: ["key", "operator", "value"],
    doesntContain: ["key", "operator", "value"],
    except: ["keys"],
    where: ["key", "operator", "value"],
    first: ["callback", "default"],
    firstWhere: ["key", "operator", "value"],
    containsOneItem: [],
    containsManyItems: [],
    hasSole: ["key", "operator", "value"],
    hasMany: ["key", "operator", "value"],
    keys: [],
    last: ["callback", "default"],
    nth: ["step", "offset"],
    only: ["keys"],
    random: ["number"],
    search: ["value", "strict"],
    before: ["value", "strict"],
    after: ["value", "strict"],
    skip: ["count"],
    slice: ["offset", "length"],
    sole: ["key", "operator", "value"],
    firstOrFail: ["key", "operator", "value"],
    sortBy: ["callback", "options", "descending"],
    take: ["limit"],
    pluck: ["value", "key"],
    isEmpty: [],
    isNotEmpty: [],
    map: ["callback"],
    reject: ["callback"],
    unique: ["key", "strict"],
    shuffle: [],
    values: [],
    countBy: ["countBy"],
    collect: [],
    toArray: [],
    jsonSerialize: [],
    toJson: ["options"],
    toPrettyJson: ["options"],
    getCachingIterator: ["flags"],
    escapeWhenCastingToString: ["escape"],
    duplicates: ["callback", "strict"],
    duplicatesStrict: ["callback"],
    every: ["key", "operator", "value"],
    whenEmpty: ["callback", "default"],
    whenNotEmpty: ["callback", "default"],
    unlessEmpty: ["callback", "default"],
    unlessNotEmpty: ["callback", "default"],
    unless: ["value", "callback", "default"],
    whereNull: ["key"],
    whereNotNull: ["key"],
    whereStrict: ["key", "value"],
    whereIn: ["key", "values", "strict"],
    whereInStrict: ["key", "values"],
    whereBetween: ["key", "values"],
    whereNotBetween: ["key", "values"],
    whereNotIn: ["key", "values", "strict"],
    whereNotInStrict: ["key", "values"],
    whereInstanceOf: ["type"],
    groupBy: ["groupBy", "preserveKeys"],
    keyBy: ["keyBy"],
    partition: ["key", "operator", "value"],
    concat: ["source"],
    skipUntil: ["value"],
    skipWhile: ["value"],
    takeUntil: ["value"],
    takeWhile: ["value"],
    uniqueStrict: ["key"],
    collapse: [],
    crossJoin: ["lists"],
    diff: ["items"],
    diffUsing: ["items", "callback"],
    diffAssoc: ["items"],
    diffAssocUsing: ["items", "callback"],
    diffKeys: ["items"],
    diffKeysUsing: ["items", "callback"],
    flatten: ["depth"],
    flip: [],
    implode: ["value", "glue"],
    intersect: ["items"],
    intersectUsing: ["items", "callback"],
    intersectAssoc: ["items"],
    intersectAssocUsing: ["items", "callback"],
    intersectByKeys: ["items"],
    join: ["glue", "finalGlue"],
    merge: ["items"],
    mergeRecursive: ["items"],
    combine: ["values"],
    union: ["items"],
    replace: ["items"],
    replaceRecursive: ["items"],
    undot: [],
    zip: ["items"],
    pad: ["size", "value"],
    __get: ["key"],
  },
  [Arrayable, IteratorAggregate as unknown as ContractToken<object>, Jsonable, JsonSerializable as unknown as ContractToken<object>],
  {},
  ["count", "getIterator"],
);
