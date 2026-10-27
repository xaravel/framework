// Laravel's `Illuminate\Support\Traits\EnumeratesValues` (v13.37.0), the members Stories 14.1-14.3 port, as a
// runtime trait (AD-26 Traits row): `Collection` and `LazyCollection` are `mixin(null, EnumeratesValues, Macroable)`,
// and the trait uses `Conditionable` as Upstream's does. The other members belong to the Collections Stories that port
// their tests; `dump` and `dd` call Symfony's VarDumper through Support (Epic 19). `whereBetween` and `whereNotBetween`
// read PHP's `reset` / `end` over a `Ref` of their own copy of `$values` (DIV-9.2), as PHP's by-value parameter is.
// `whenEmpty` and its kin call Conditionable's `when`, so they are dual helpers as it is (AD-6, DIV-1.6): no
// `@asyncRoot` tag and no declared Promise.
//
// `static::$proxies` is one Upstream static per using class, held per Scope Frame unit with `frameStatic` (AD-5): the
// key is the class whose own `proxy` is this trait's (the layer `mixin` builds), so `Collection`, its subclasses and
// `LazyCollection` each share PHP's one array. A table is never mutated in place: `proxy()` sets a fresh copy.
//
// `$escapeWhenCastingToString` shares its name with a method (DIV-12.2): the method keeps the name, and the state is
// the `escapeWhenCastingToStringProperty` field.
//
// `func_num_args()` is `arguments.length`, read in `function` methods only, and `func_get_args()` forwards
// `...arguments` unchanged. Members whose first parameter is a PHP value or a callback, or that read the argument count
// (`some`, `firstWhere`, `hasMany`, `where`, `every`, `partition`), keep only the positional form, and a lone object
// is the PHP value (DIV-12.20).
//
// The trait's methods call the using class's own members (`all`, `map`, `getIterator`, …), so each declares `this`
// as `EnumeratesValuesHost`. This module and `Collection.ts` import each other; it uses `Collection` only at call time
// (`collect()`), and `Collection.ts` loads first (the package index exports it first, and `LazyCollection.ts` imports it
// first), so the trait is defined before either class extends it.
import { Conditionable } from "@xaravel/conditionable";
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import {
  array_any,
  array_filter,
  array_map,
  arrayEntries,
  BlockedByComponentError,
  CachingIterator,
  count,
  end,
  Exception,
  fqcn,
  frameStatic,
  get_debug_type,
  identical,
  implode,
  in_array,
  is_a,
  is_array,
  is_callable,
  is_object,
  is_scalar,
  is_string,
  isContractToken,
  type Iterator,
  JSON_PRETTY_PRINT,
  JsonSerializable,
  jsonDecode,
  jsonEncode,
  looseEquals,
  mixin,
  type PhpArrayKey,
  type PhpFloat,
  Ref,
  registerClass,
  reset,
  round,
  spaceship,
  sprintf,
  Stringable,
  toBool,
  toPhpString,
  valueCopy,
  type Traversable,
  UnexpectedValueException,
  UnitEnum,
} from "@xaravel/runtime";
import { Arr } from "../Arr";
import { Collection } from "../Collection";
import { Enumerable } from "../Enumerable";
import { enum_value } from "../functions";
import { data_get, data_has } from "../helpers";
import { HigherOrderCollectionProxy } from "../HigherOrderCollectionProxy";
import { callCallable, type SyncCallback, type ValueOrSyncCallback } from "../support/callables";

/** Any class, abstract or not. */
type AnyClass = abstract new (...args: never[]) => unknown;

/** A class that constructs a collection from its items and extra arguments, as `new static($items, ...$args)` does. */
type CollectionClass<R> = new (items?: unknown, ...args: any[]) => R;

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** The arguments of a `($key, $operator = null, $value = null)` member, as `func_get_args()` forwards them. */
type WhereArguments = [key: unknown, operator?: unknown, value?: unknown];

/** The protected `newInstance` of the using class, which `partition` calls as Upstream's `$this->newInstance(...)`. */
interface NewInstanceHost<T> {
  newInstance(items?: unknown): T;
}

/**
 * The callback or default of `whenEmpty` and its kin: called with the collection (and the condition, as `when` passes
 * it). A closure, or an invokable object whose `__invoke` is called. A dual helper's callback (AD-6, DIV-1.6): it may
 * be async, and its own result type `R` is returned.
 */
type CollectionCallback<S, R> = ((self: S, value: boolean) => R) | { __invoke(self: S, value: boolean): R };

/** What a `whenEmpty`-style callback's result `r` makes the member return: `r ?? this`, as `when` does. */
type CollectionResult<R, S> = Exclude<R, null | undefined | void> | S;

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
  contains(key: unknown, operator?: unknown, value?: unknown): boolean;
  first(callback?: ItemCallback | null, defaultValue?: unknown): unknown;
  take(limit: number): EnumeratesValuesHost;
  count(): number;
}

/** What a `HigherOrderWhenProxy` from `unless($condition)` answers: the collection's `filter`, or the collection. */
interface WhenFilterProxy {
  filter(callback: unknown): EnumeratesValuesHost;
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
  if (typeof type === "string") {
    return type;
  }
  if (typeof type === "function" || isContractToken(type)) {
    return fqcn(type as object);
  }
  return toPhpString(type);
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
  each<T extends EnumeratesValuesHost, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T {
    for (const [key, item] of this.entries()) {
      if (callCallable(callback, valueCopy(item), key) === false) {
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
    const allowedTypes = is_array(type) ? arrayEntries(type as object).map(([, allowedType]) => allowedType) : [type];

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

  /**
   * Determine if all items pass the given truth test: with one argument, a callback (or a `data_get` key) read as a
   * bool for each item and its key; with more, every item matches `where(key, operator, value)`. `true` when empty.
   */
  every<R>(this: EnumeratesValuesHost & EnumeratesValues, callback: SyncCallback<[value: any, key: any], R>): boolean;
  every<K>(this: EnumeratesValuesHost & EnumeratesValues, key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): boolean;
  every(this: EnumeratesValuesHost & EnumeratesValues, key: unknown, operator: unknown = null, value: unknown = null): boolean {
    void operator;
    void value;
    if (arguments.length === 1) {
      const callback = this.valueRetriever(key);

      for (const [k, v] of this.entries()) {
        if (!toBool(callback(v, k))) {
          return false;
        }
      }

      return true;
    }

    return this.every(this.operatorForWhere(...([...arguments] as WhereArguments)));
  }

  /** Create a collection of all elements that do not pass a given truth test, or that are not `==` the value. */
  reject<T extends EnumeratesValuesHost, R>(this: T, callback: SyncCallback<[value: any, key: any], R>): T;
  reject<T extends EnumeratesValuesHost, K>(this: T, callback?: ValueOrSyncCallback<K>): T;
  reject<T extends EnumeratesValuesHost>(this: T, callback: unknown = true): T {
    const useAsCallable = (this as T & EnumeratesValues).useAsCallable(callback);

    return this.filter((value: unknown, key: unknown) => (useAsCallable ? !toBool(callCallable(callback, valueCopy(value), key)) : !looseEquals(value, callback))) as T;
  }

  /**
   * Partition the collection into two collections by the given callback (or `data_get` key), or, with more than one
   * argument, by `where(key, operator, value)`: a collection of `[passed, failed]`, each keeping its items' keys.
   */
  partition<T extends EnumeratesValuesHost, R>(this: T & EnumeratesValues, callback: SyncCallback<[value: any, key: any], R>): T;
  partition<T extends EnumeratesValuesHost, K>(this: T & EnumeratesValues, key: ValueOrSyncCallback<K>, operator?: unknown, value?: unknown): T;
  partition<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, operator: unknown = null, value: unknown = null): T {
    void operator;
    void value;
    const callback = arguments.length === 1 ? this.valueRetriever(key) : (this.operatorForWhere(...([...arguments] as WhereArguments)) as ItemCallback);

    const [passed, failed] = Arr.partition(this.getIterator(), callback);

    const self = this as unknown as NewInstanceHost<T>;

    return self.newInstance([self.newInstance(passed), self.newInstance(failed)]);
  }

  /**
   * Calculate the percentage of items that pass a given truth test, rounded to `precision` digits by PHP's `round`: a
   * float (with the float marker when integral, DIV-9.4), or `null` for an empty collection.
   */
  percentage<R>(this: EnumeratesValuesHost, callback: SyncCallback<[value: any, key: any], R>, precision: number = 2): number | PhpFloat | null {
    if (this.isEmpty()) {
      return null;
    }

    return round((this.filter(callback).count() / this.count()) * 100, precision);
  }

  /**
   * Apply the callback if the collection is empty, else the `default` when one is given: `when(isEmpty(), callback,
   * default)`. A dual helper, as `when` is (AD-6, DIV-1.6): it returns its callback's result, or the collection when
   * that is `null`.
   */
  whenEmpty<R = never, D = never>(callback: CollectionCallback<this, R>, defaultValue: CollectionCallback<this, D> | null = null): CollectionResult<R | D, this> {
    return this.when((this as unknown as EnumeratesValuesHost).isEmpty(), callback as never, defaultValue as never) as CollectionResult<R | D, this>;
  }

  /** Apply the callback if the collection is not empty, else the `default` when one is given (a dual helper, as `when`). */
  whenNotEmpty<R = never, D = never>(callback: CollectionCallback<this, R>, defaultValue: CollectionCallback<this, D> | null = null): CollectionResult<R | D, this> {
    return this.when(!(this as unknown as EnumeratesValuesHost).isEmpty(), callback as never, defaultValue as never) as CollectionResult<R | D, this>;
  }

  /** Apply the callback unless the collection is empty: `whenNotEmpty(callback, default)` (a dual helper, as `when`). */
  unlessEmpty<R = never, D = never>(callback: CollectionCallback<this, R>, defaultValue: CollectionCallback<this, D> | null = null): CollectionResult<R | D, this> {
    return this.whenNotEmpty(callback, defaultValue);
  }

  /** Apply the callback unless the collection is not empty: `whenEmpty(callback, default)` (a dual helper, as `when`). */
  unlessNotEmpty<R = never, D = never>(callback: CollectionCallback<this, R>, defaultValue: CollectionCallback<this, D> | null = null): CollectionResult<R | D, this> {
    return this.whenEmpty(callback, defaultValue);
  }

  /** Alias for the "contains" method. */
  some(this: EnumeratesValuesHost, key: unknown, operator: unknown = null, value: unknown = null): boolean {
    void operator;
    void value;
    return this.contains(...([...arguments] as WhereArguments));
  }

  /** Get the first item by the given key value pair (or the first item a callback accepts). */
  firstWhere(this: EnumeratesValuesHost & EnumeratesValues, key: unknown, operator: unknown = null, value: unknown = null): unknown {
    void key;
    void operator;
    void value;
    return this.first(this.operatorForWhere(...([...arguments] as WhereArguments)) as ItemCallback);
  }

  /** Determine if the collection contains multiple items, optionally matching the given criteria. */
  hasMany(this: EnumeratesValuesHost & EnumeratesValues, key: unknown = null, operator: unknown = null, value: unknown = null): boolean {
    void operator;
    void value;
    const filter = arguments.length > 1 ? this.operatorForWhere(...([...arguments] as WhereArguments)) : key;

    return (this.unless(looseEquals(filter, null)) as unknown as WhenFilterProxy).filter(filter).take(2).count() === 2;
  }

  /** Get a single key's value ("dot" notation) from the first item that has the key, or `default`. */
  value(this: EnumeratesValuesHost, key: unknown, defaultValue: unknown = null): unknown {
    const value_ = this.first((target: unknown) => {
      return data_has(target, key);
    });

    return data_get(value_, key, defaultValue);
  }

  /** Filter items by the given key value pair (or by a callback). */
  where<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, operator: unknown = null, value: unknown = null): T {
    void key;
    void operator;
    void value;
    return this.filter(this.operatorForWhere(...([...arguments] as WhereArguments)) as ItemCallback) as T;
  }

  /** Filter items where the value for the given key ("dot" notation; the item itself when `null`) is `null`. */
  whereNull<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown = null): T {
    return this.whereStrict(key, null);
  }

  /** Filter items where the value for the given key ("dot" notation; the item itself when `null`) is not `null`. */
  whereNotNull<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown = null): T {
    return this.where(key, "!==", null);
  }

  /** Filter items by the given key value pair using strict comparison (PHP's `===`). */
  whereStrict<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, value: unknown): T {
    return this.where(key, "===", value);
  }

  /** Filter items whose value for the given key is in `values` (an array, `Arrayable` or Traversable), by `==` or `===`. */
  whereIn<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, values: unknown, strict: boolean = false): T {
    values = this.getArrayableItems(values);

    return this.filter((item: unknown) => in_array(data_get(item, key), values, strict)) as T;
  }

  /** Filter items whose value for the given key is in `values`, using strict comparison. */
  whereInStrict<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, values: unknown): T {
    return this.whereIn(key, values, true);
  }

  /**
   * Filter items such that the value of the given key is between the given values: `>=` the first of `values` and
   * `<=` the last, by PHP's comparison.
   */
  whereBetween<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, values: unknown): T {
    return (this.where(key, ">=", reset(new Ref(values))) as T & EnumeratesValues).where(key, "<=", end(new Ref(values)));
  }

  /**
   * Filter items such that the value of the given key is not between the given values: `<` the first of `values` or
   * `>` the last, by PHP's comparison.
   */
  whereNotBetween<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, values: unknown): T {
    // PHP's arrow function captures `$values` by value, and `reset` / `end` take each call's copy by reference.
    // PHP's `$a > $b` compares the operands swapped: `$b < $a`.
    return this.filter((item: unknown) => spaceship(data_get(item, key), reset(new Ref(values))) < 0 || spaceship(end(new Ref(values)), data_get(item, key)) < 0) as T;
  }

  /** Filter items whose value for the given key is not in `values` (an array, `Arrayable` or Traversable), by `==` or `===`. */
  whereNotIn<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, values: unknown, strict: boolean = false): T {
    values = this.getArrayableItems(values);

    return this.reject((item: unknown) => in_array(data_get(item, key), values, strict));
  }

  /** Filter items whose value for the given key is not in `values`, using strict comparison. */
  whereNotInStrict<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown, values: unknown): T {
    return this.whereNotIn(key, values, true);
  }

  /** Filter the items, removing any that are not instances of the given type (a class, a class name, or a list of them). */
  whereInstanceOf<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, type: unknown): T {
    return this.filter((value_: unknown) => {
      if (is_array(type)) {
        return array_any(type, (classType: unknown) => isInstanceOf(value_, classType));
      }

      return isInstanceOf(value_, type);
    }) as T;
  }

  /** Return only unique items from the collection array using strict comparison (PHP's `===`). */
  uniqueStrict<T extends EnumeratesValuesHost, R>(this: T & EnumeratesValues, key: SyncCallback<[value: any, key: any], R>): T;
  uniqueStrict<T extends EnumeratesValuesHost, K>(this: T & EnumeratesValues, key?: ValueOrSyncCallback<K>): T;
  uniqueStrict<T extends EnumeratesValuesHost>(this: T & EnumeratesValues, key: unknown = null): T {
    return (this as unknown as { unique(key: unknown, strict: boolean): T }).unique(key, true);
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

  /**
   * Get an operator checker callback: a callback key is returned as it is; otherwise a callback that compares each
   * item's `data_get(item, key)` with `value` under `operator` (`=` when only the key, or the key and a value, are
   * given), enum cases read through `enum_value`, and PHP's comparisons.
   */
  protected operatorForWhere(key: unknown, operator: unknown = null, value: unknown = null): unknown {
    if (this.useAsCallable(key)) {
      return key;
    }

    if (arguments.length === 1) {
      value = true;

      operator = "=";
    }

    if (arguments.length === 2) {
      value = operator;

      operator = "=";
    }

    return (item: unknown): unknown => {
      const retrieved = enum_value(data_get(item, key));
      // PHP's closure `use ($value)` copies the value into each call, which reassigns its own copy.
      const compared = enum_value(value);

      const strings = array_filter([retrieved, compared], (value_: unknown) => {
        return is_string(value_) ? true : value_ instanceof Stringable ? true : false;
      });

      if (Number(count(strings)) < 2 && looseEquals(count(array_filter([retrieved, compared], is_object)), 1)) {
        return in_array(operator, ["!=", "<>", "!=="]);
      }

      switch (operator) {
        default:
        case "=":
        case "==":
          return looseEquals(retrieved, compared);
        case "!=":
        case "<>":
          return !looseEquals(retrieved, compared);
        case "<":
          return spaceship(retrieved, compared) < 0;
        // PHP's `$a > $b` and `$a >= $b` compare the operands swapped: `$b < $a` and `$b <= $a`.
        case ">":
          return spaceship(compared, retrieved) < 0;
        case "<=":
          return spaceship(retrieved, compared) <= 0;
        case ">=":
          return spaceship(compared, retrieved) <= 0;
        case "===":
          return identical(retrieved, compared);
        case "!==":
          return !identical(retrieved, compared);
        case "<=>":
          return spaceship(retrieved, compared);
      }
    };
  }

  /** Determine if the given value is callable, but not a string. */
  protected useAsCallable(value: unknown): boolean {
    return !is_string(value) && is_callable(value);
  }

  /** Get a value retrieving callback: the callable itself, or a `data_get` of the key. */
  protected valueRetriever(value: unknown): ItemCallback {
    if (this.useAsCallable(value)) {
      return (item: unknown, key: unknown) => callCallable(value, valueCopy(item), key);
    }

    return (item: unknown) => data_get(item, value);
  }

  /** Make a function to check an item's equality: PHP's `$item === $value` (`identical`). */
  protected equality(value: unknown): (item: unknown) => boolean {
    return (item: unknown) => identical(item, value);
  }

  /** Make a function using another function, by negating its result (read as a bool). */
  protected negate(callback: unknown): (...params: unknown[]) => boolean {
    return (...params: unknown[]) => !toBool(callCallable(callback, ...params));
  }

  /** Make a function that returns what's passed to it. */
  protected identity(): (value: unknown) => unknown {
    return (value: unknown) => value;
  }
}

registerClass("Illuminate\\Support\\Traits\\EnumeratesValues", EnumeratesValues);
