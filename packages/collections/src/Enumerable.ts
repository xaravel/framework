// Illuminate\Support\Enumerable, from laravel/framework v13.37.0: the interface `Collection` and `LazyCollection`
// implement, as a contract token (AD-1, AD-9.5). PHP's `Enumerable extends Arrayable, Countable, IteratorAggregate,
// Jsonable, JsonSerializable`; `Countable` is no token, so the token records the other four as parents and lists the
// built-in methods `count` and `getIterator` (decisions/ESC-10.2-4.md). A class implements it with a brand getter per
// token in its chain (`get [Enumerable.brand]()`, `get [Arrayable.brand]()`, …), as `instanceof` reads only a token's
// own brand.
//
// The TypeScript interface covers the members Stories 14.1 and 14.2 port; later Collections Stories extend it with
// theirs. `has`, `hasAny`, `except` and `only` take a list of keys or the keys as arguments (PHP's `func_get_args()`).
// `random` has only the positional form here, as Upstream's interface declares `random($number = null)`.
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { type ContractToken, contract } from "@xaravel/contracts";
import { type CachingIterator, IteratorAggregate, JsonSerializable, type PhpArrayKey, type Traversable } from "@xaravel/runtime";

declare const EnumerableBrand: unique symbol;

/** Laravel's `Enumerable`: the members `Collection` and `LazyCollection` share. */
export interface Enumerable extends Arrayable, Jsonable, JsonSerializable, IteratorAggregate {
  readonly [Enumerable.brand]: true;

  /** Get all items in the enumerable. */
  all(): unknown;

  /** Execute a callback over each item. */
  each(callback: (item: any, key: any) => unknown): this;

  /** Run a filter over each of the items. */
  filter(callback?: ((value: any, key: any) => unknown) | null): Enumerable;

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
  contains(key: unknown, operator?: unknown, value?: unknown): boolean;

  /** Determine if an item is not contained in the collection. */
  doesntContain(key: unknown, operator?: unknown, value?: unknown): boolean;

  /** Get all items except for those with the specified keys. */
  except(keys: unknown, ...moreKeys: unknown[]): Enumerable;

  /** Filter items by the given key value pair. */
  where(key: unknown, operator?: unknown, value?: unknown): Enumerable;

  /** Get the first item from the enumerable passing the given truth test. */
  first(callback?: ((value: any, key: any) => unknown) | null, defaultValue?: unknown): unknown;

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
  last(callback?: ((value: any, key: any) => unknown) | null, defaultValue?: unknown): unknown;

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

  /** Take the first or last {$limit} items. */
  take(limit: number): Enumerable;

  /** Get the values of a given key. */
  pluck(value: unknown, key?: unknown): Enumerable;

  /** Determine if the collection is empty or not. */
  isEmpty(): boolean;

  /** Determine if the collection is not empty. */
  isNotEmpty(): boolean;

  /** Run a map over each of the items. */
  map(callback: (value: any, key: any) => unknown): Enumerable;

  /** Create a collection of all elements that do not pass a given truth test. */
  reject(callback?: unknown): Enumerable;

  /** Return only unique items from the collection array. */
  unique(key?: unknown, strict?: boolean): Enumerable;

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

  /** Dynamically access collection proxies (DIV-12.16). */
  __get(key: string): unknown;
}

export const Enumerable = contract<Enumerable, typeof EnumerableBrand>(
  "Illuminate\\Support\\Enumerable",
  {
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
    take: ["limit"],
    pluck: ["value", "key"],
    isEmpty: [],
    isNotEmpty: [],
    map: ["callback"],
    reject: ["callback"],
    unique: ["key", "strict"],
    values: [],
    countBy: ["countBy"],
    collect: [],
    toArray: [],
    jsonSerialize: [],
    toJson: ["options"],
    toPrettyJson: ["options"],
    getCachingIterator: ["flags"],
    escapeWhenCastingToString: ["escape"],
    __get: ["key"],
  },
  [Arrayable, IteratorAggregate as unknown as ContractToken<object>, Jsonable, JsonSerializable as unknown as ContractToken<object>],
  {},
  ["count", "getIterator"],
);
