// Illuminate\Support\Enumerable, from laravel/framework v13.37.0: the interface `Collection` and `LazyCollection`
// implement, as a contract token (AD-1, AD-9.5). PHP's `Enumerable extends Arrayable, Countable, IteratorAggregate,
// Jsonable, JsonSerializable`; `Countable` is no token, so the token records the other four as parents and lists the
// built-in methods `count` and `getIterator` (decisions/ESC-10.2-4.md). A class implements it with a brand getter per
// token in its chain (`get [Enumerable.brand]()`, `get [Arrayable.brand]()`, …), as `instanceof` reads only a token's
// own brand.
//
// The TypeScript interface covers the members Story 14.1 ports; later Collections Stories extend it with theirs.
// `has` is declared for `Arr.exists`, whose `Enumerable` branch calls it; `Collection.has` and `LazyCollection.has`
// are Story 14.2's.
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

  /** Determine if an item exists in the collection by key (Story 14.2). */
  has(key: unknown): boolean;

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
