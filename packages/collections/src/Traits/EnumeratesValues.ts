// Laravel's `Illuminate\Support\Traits\EnumeratesValues` (v13.37.0), the members Story 14.1 ports, as a runtime trait
// (AD-26 Traits row): `Collection` and `LazyCollection` are `mixin(null, EnumeratesValues, Macroable)`, and the trait
// uses `Conditionable` as Upstream's does. The other members belong to the Collections Stories that port their tests;
// `dump` and `dd` call Symfony's VarDumper through Support (Epic 19).
//
// `static::$proxies` is one Upstream static per using class, held per Scope Frame unit with `frameStatic` (AD-5): the
// key is the class whose own `proxy` is this trait's (the layer `mixin` builds), so `Collection`, its subclasses and
// `LazyCollection` each share PHP's one array. A table is never mutated in place: `proxy()` sets a fresh copy.
//
// `$escapeWhenCastingToString` shares its name with a method (DIV-12.2): the method keeps the name, and the state is
// the `escapeWhenCastingToStringProperty` field.
//
// The trait's methods call the using class's own members (`all`, `map`, `getIterator`, …), so each declares `this`
// as `EnumeratesValuesHost`. This module and `Collection.ts` import each other; it uses `Collection` only at call time
// (`collect()`), and `Collection.ts` loads first (the package index exports it first, and `LazyCollection.ts` imports it
// first), so the trait is defined before either class extends it.
import { Conditionable } from "@xaravel/conditionable";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import {
  array_map,
  BlockedByComponentError,
  CachingIterator,
  Exception,
  fqcn,
  frameStatic,
  get_debug_type,
  implode,
  in_array,
  is_a,
  is_array,
  is_callable,
  is_scalar,
  is_string,
  type Iterator,
  JSON_PRETTY_PRINT,
  JsonSerializable,
  jsonDecode,
  jsonEncode,
  looseEquals,
  mixin,
  type PhpArrayKey,
  registerClass,
  sprintf,
  toBool,
  type Traversable,
  UnexpectedValueException,
  UnitEnum,
} from "@xaravel/runtime";
import { Arr } from "../Arr";
import { Collection } from "../Collection";
import { Enumerable } from "../Enumerable";
import { data_get } from "../helpers";
import { HigherOrderCollectionProxy } from "../HigherOrderCollectionProxy";
import { callCallable } from "../support/callables";

/** Any class, abstract or not. */
type AnyClass = abstract new (...args: never[]) => unknown;

/** A class that constructs a collection from its items and extra arguments, as `new static($items, ...$args)` does. */
type CollectionClass<R> = new (items?: unknown, ...args: any[]) => R;

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** The members of the using class (`Collection`, `LazyCollection`) that the trait's methods call. */
export interface EnumeratesValuesHost {
  all(): unknown;
  isEmpty(): boolean;
  map(callback: ItemCallback): EnumeratesValuesHost;
  filter(callback?: ItemCallback | null): EnumeratesValuesHost;
  getIterator(): Traversable;
  entries(): Iterable<[PhpArrayKey, unknown]>;
  jsonSerialize(): unknown;
  toJson(options?: number): string;
}

/** The `frameStatic` key of a using class's `static::$proxies`. */
const PROXIES: unique symbol = Symbol("Illuminate\\Support\\Traits\\EnumeratesValues::$proxies");

/** Upstream's initial `static::$proxies`. */
const DEFAULT_PROXIES: readonly string[] = Object.freeze([
  "average",
  "avg",
  "contains",
  "doesntContain",
  "each",
  "every",
  "filter",
  "first",
  "flatMap",
  "groupBy",
  "hasMany",
  "hasSole",
  "keyBy",
  "last",
  "map",
  "max",
  "min",
  "partition",
  "percentage",
  "reject",
  "skipUntil",
  "skipWhile",
  "sole",
  "some",
  "sortBy",
  "sortByDesc",
  "sum",
  "takeUntil",
  "takeWhile",
  "unique",
  "unless",
  "until",
  "when",
]);

/** The class that uses the trait for `klass`: the nearest class up its chain whose own `proxy` is the trait's. */
function usingClass(klass: unknown): AnyClass {
  for (let current: unknown = klass; typeof current === "function" && current !== Function.prototype; current = Object.getPrototypeOf(current)) {
    if (current !== EnumeratesValues && Object.getOwnPropertyDescriptor(current, "proxy")?.value === EnumeratesValues.proxy) {
      return current as AnyClass;
    }
  }
  throw new TypeError("EnumeratesValues: the class does not use Illuminate\\Support\\Traits\\EnumeratesValues; declare it as `class X extends mixin(Base, EnumeratesValues)`");
}

/** The frame static that holds `klass`'s `static::$proxies`. */
function proxies(klass: unknown): { get(): readonly string[]; set(value: readonly string[]): void } {
  return frameStatic<readonly string[]>(usingClass(klass), PROXIES, () => DEFAULT_PROXIES);
}

/** An `ensure` type as Upstream's message and comparison read it: a type-name string, or a class's or token's FQCN. */
function typeName(type: unknown): string {
  return typeof type === "string" ? type : fqcn(type as object);
}

/** PHP's `$item instanceof $type`, for a type-name string, a class or a contract token. */
function isInstanceOf(item: unknown, type: unknown): boolean {
  if (typeof type === "string") {
    return is_a(item, type);
  }
  if ((typeof item !== "object" && typeof item !== "function") || item === null) {
    return false;
  }
  return item instanceof (type as AnyClass);
}

/** The values Upstream enumerates: the collection's own `$items` or source, through the shared members. */
export class EnumeratesValues extends mixin(null, Conditionable) {
  /** Indicates that the object's string representation should be escaped when `__toString` is invoked (DIV-12.2). */
  protected escapeWhenCastingToStringProperty = false;

  /** Create a new collection instance if the value isn't one already. */
  static make<R>(this: CollectionClass<R>, items: unknown = [], ...args: unknown[]): R {
    return new this(items, ...args);
  }

  /** Wrap the given value in a collection if applicable. */
  static wrap<R>(this: CollectionClass<R>, value: unknown, ...args: unknown[]): R {
    return value instanceof Enumerable ? new this(value, ...args) : new this(Arr.wrap(value), ...args);
  }

  /** Get the underlying items from the given collection if applicable. */
  static unwrap(value: unknown): unknown {
    return value instanceof Enumerable ? value.all() : (value ?? null);
  }

  /** Create a new instance with no items. */
  static empty<R>(this: CollectionClass<R>, ...args: unknown[]): R {
    return new this([], ...args);
  }

  /** Create a new collection by invoking the callback a given amount of times (`1` to `number`). */
  static times<R>(this: CollectionClass<R> & { range(from: number, to: number, step?: number, ...args: unknown[]): unknown }, number: number, callback: ((number: number) => unknown) | null = null, ...args: unknown[]): R {
    if (number < 1) {
      return new this([], ...args);
    }

    const range = this.range(1, number, 1, ...args) as { unless(value: unknown): { map(callback: unknown): unknown } };

    return range.unless(looseEquals(callback, null)).map(callback) as R;
  }

  /** Create a new collection by decoding a JSON string. */
  static fromJson<R>(this: CollectionClass<R>, json: string, depth: number = 512, flags: number = 0, ...args: unknown[]): R {
    return new this(jsonDecode(json, true, depth, flags), ...args);
  }

  /** Execute a callback over each item; returning `false` from it stops the iteration. */
  each<T extends EnumeratesValuesHost>(this: T, callback: ItemCallback): T {
    for (const [key, item] of this.entries()) {
      if (callCallable(callback, item, key) === false) {
        break;
      }
    }

    return this;
  }

  /**
   * Ensure that every item in the collection is of the expected type: a type name (`'int'`, `'string'`, …), a class, a
   * contract token, or a list of them. Throws `UnexpectedValueException` naming the first item of another type.
   */
  ensure<T extends EnumeratesValuesHost>(this: T, type: unknown): T {
    const allowedTypes = is_array(type) ? (type as unknown[]) : [type];

    return (this as T & EnumeratesValues).each((item: unknown, index: unknown) => {
      const itemType = get_debug_type(item);

      for (const allowedType of allowedTypes) {
        if (itemType === typeName(allowedType) || isInstanceOf(item, allowedType)) {
          return true;
        }
      }

      throw new UnexpectedValueException(
        sprintf(
          "Collection should only include [%s] items, but '%s' found at position %d.",
          implode(
            ", ",
            allowedTypes.map((allowedType) => typeName(allowedType)),
          ),
          itemType,
          index,
        ),
      );
    }) as T;
  }

  /** Determine if the collection is not empty. */
  isNotEmpty(this: EnumeratesValuesHost): boolean {
    return !this.isEmpty();
  }

  /** Create a collection of all elements that do not pass a given truth test, or that are not `==` the value. */
  reject<T extends EnumeratesValuesHost>(this: T, callback: unknown = true): T {
    const useAsCallable = (this as T & EnumeratesValues).useAsCallable(callback);

    return this.filter((value: unknown, key: unknown) => (useAsCallable ? !toBool(callCallable(callback, value, key)) : !looseEquals(value, callback))) as T;
  }

  /** Collect the values into a `Collection`. */
  collect(this: EnumeratesValuesHost): Collection {
    return new Collection(this.all());
  }

  /** Get the collection of items as a plain array, with each `Arrayable` item as its `toArray()`. */
  toArray(this: EnumeratesValuesHost): any {
    return this.map((value: unknown) => (value instanceof Arrayable ? value.toArray() : value)).all();
  }

  /** Convert the object into something JSON serializable: each item's `jsonSerialize()`, decoded `toJson()` or `toArray()`. */
  jsonSerialize(this: EnumeratesValuesHost): any {
    return array_map((value: unknown) => {
      if (value instanceof JsonSerializable) {
        return value.jsonSerialize();
      }
      if (value instanceof Jsonable) {
        return jsonDecode(value.toJson(), true);
      }
      if (value instanceof Arrayable) {
        return value.toArray();
      }
      return value;
    }, this.all());
  }

  /** Get the collection of items as JSON. */
  toJson(this: EnumeratesValuesHost, options: number = 0): string {
    return jsonEncode(this.jsonSerialize(), options) as string;
  }

  /** Get the collection of items as pretty print formatted JSON. */
  toPrettyJson(this: EnumeratesValuesHost, options: number = 0): string {
    return this.toJson(JSON_PRETTY_PRINT | options);
  }

  /** Get a CachingIterator instance. */
  getCachingIterator(this: EnumeratesValuesHost, flags: number = CachingIterator.CALL_TOSTRING): CachingIterator {
    return new CachingIterator(this.getIterator() as Iterator, flags);
  }

  /**
   * Convert the collection to its string representation, its JSON (`__toString`). The escaped form, after
   * `escapeWhenCastingToString()`, calls Support's `e()` helper, which arrives with Support (Epic 19).
   */
  toString(this: EnumeratesValuesHost & EnumeratesValues): string {
    if (this.escapeWhenCastingToStringProperty) {
      throw new BlockedByComponentError("support");
    }

    return this.toJson();
  }

  /** `__toString` for JavaScript's string conversion. */
  [Symbol.toPrimitive](this: EnumeratesValuesHost & EnumeratesValues): string {
    return this.toString();
  }

  /** Indicate that the model's string representation should be escaped when `__toString` is invoked. */
  escapeWhenCastingToString(escape: boolean = true): this {
    this.escapeWhenCastingToStringProperty = escape;

    return this;
  }

  /** Add a method to the list of proxied methods. */
  static proxy(method: string): void {
    const slot = proxies(this);
    slot.set([...slot.get(), method]);
  }

  /**
   * Dynamically access collection proxies (DIV-12.16): `$collection->each` is `collection.__get('each')`. Throws PHP's
   * `Exception` for a name that is not a proxied method.
   */
  __get(this: EnumeratesValuesHost & EnumeratesValues, key: string): HigherOrderCollectionProxy {
    if (!in_array(key, proxies(this.constructor).get())) {
      throw new Exception(`Property [${key}] does not exist on this collection instance.`);
    }

    return new HigherOrderCollectionProxy(this as unknown as Enumerable, key);
  }

  /** Results array of items from Collection or Arrayable: a scalar, `null` or enum case wrapped, anything else `Arr.from`. */
  protected getArrayableItems(items: unknown): unknown {
    return items === null || items === undefined || is_scalar(items) || items instanceof UnitEnum ? Arr.wrap(items ?? null) : Arr.from(items);
  }

  /** Determine if the given value is callable, but not a string. */
  protected useAsCallable(value: unknown): boolean {
    return !is_string(value) && is_callable(value);
  }

  /** Get a value retrieving callback: the callable itself, or a `data_get` of the key. */
  protected valueRetriever(value: unknown): ItemCallback {
    if (this.useAsCallable(value)) {
      return (item: unknown, key: unknown) => callCallable(value, item, key);
    }

    return (item: unknown) => data_get(item, value);
  }

  /** Make a function that returns what's passed to it. */
  protected identity(): (value: unknown) => unknown {
    return (value: unknown) => value;
  }
}

registerClass("Illuminate\\Support\\Traits\\EnumeratesValues", EnumeratesValues);
