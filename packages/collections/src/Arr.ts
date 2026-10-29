// Laravel's Illuminate\Support\Arr (v13.37.0). Story 14.6 completes the independent array helpers.
// CSS styles reach Support through a throwing Str.finish dependency seam.
// PHP array arguments accept lists, plain maps and PhpArrays, with value-copy isolation (AD-9).
// By-reference parameters use Ref (DIV-9.2), while ArrayAccess objects retain PHP's handle semantics.
// Callbacks are synchronous (AD-6); PHP callable forms resolve through the shared runtime.
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  ARRAY_FILTER_USE_BOTH,
  array_is_list,
  bindPhpArguments,
  http_build_query,
  PHP_QUERY_RFC3986,
  ksort,
  krsort,
  sort,
  rsort,
  SORT_REGULAR,
  SortDirection,
  unhandledMatch,
  abs,
  ArgumentCountError,
  ArrayAccess,
  array_all,
  array_any,
  arrayAppend,
  array_push,
  offsetAssign,
  offsetReference,
  referenceAt,
  callUnpacked,
  array_pop,
  array_slice,
  in_array,
  implode,
  is_numeric,
  BlockedByComponentError,
  array_combine,
  array_filter,
  array_find_key,
  array_first,
  array_flip,
  array_intersect_key,
  array_key_exists,
  array_keys,
  array_last,
  array_map,
  array_merge,
  array_reverse,
  array_shift,
  array_unshift,
  array_values,
  arrayEntries,
  arrayFromEntries,
  Closure,
  Generator,
  yieldFrom,
  count,
  explode,
  InvalidArgumentException,
  is_array,
  is_bool,
  is_float,
  is_int,
  gettype,
  sprintf,
  phpReturn,
  type PhpFloat,
  is_null,
  is_object,
  is_string,
  isFloat,
  iterator_to_array,
  JsonSerializable,
  jsonDecode,
  method_exists,
  mixin,
  PhpArray,
  type PhpKeyInput,
  Randomizer,
  Ref,
  registerClass,
  spaceship,
  str_contains,
  toBool,
  toPhpArray,
  toPhpString,
  Traversable,
  valueCopy,
  WeakMap,
} from "@xaravel/runtime";
import { Collection } from "./Collection";
import { ItemNotFoundException } from "./ItemNotFoundException";
import { MultipleItemsFoundException } from "./MultipleItemsFoundException";
import { Enumerable, type SortByDescCallback } from "./Enumerable";
import { data_get, value } from "./helpers";
import { arrayRead, callCallable, isOptionsObject, offsetIsSet, offsetRead, propertyIsSet, propertyRead, type SyncCallable, type ValueOrSyncCallback } from "./support/callables";

/** A callback over a value and its key. */
type ItemCallback = (value: any, key: any) => unknown;

/** Arr also accepts the runtime PHP callable tuple and invokable forms for sorting. */
type ArrValueOrCallback<K> = K extends { __invoke: unknown } ? never : ValueOrSyncCallback<K>;

/** A sorting retriever or PHP callable, all synchronous. */
type ArrSortCallback<R> = SortByDescCallback<R> | SyncCallable<[value: any, key: any], R>;

/** A PHP array as the value model holds it (AD-9): a list, an all-string-keyed plain object, or a `PhpArray`. */
function asValueModel(array: unknown): unknown {
  return arrayFromEntries(arrayEntries(array as object));
}

/** The values PHP's `foreach ($array as $values)` gives for an array or a Traversable. */
function iterateValues(array: unknown): Iterable<unknown> {
  if (is_array(array)) {
    return arrayEntries(array as object).map(([, value]) => value);
  }
  return array as Iterable<unknown>;
}

/** The `[key, value]` pairs PHP's `foreach ($array as $key => $value)` gives for an array or a Traversable. */
function iterateEntries(array: unknown): Iterable<readonly [unknown, unknown]> {
  if (is_array(array)) {
    return arrayEntries(array as object);
  }
  return Generator.owned(yieldFrom(array)).entries();
}

/** A PHP array as a `PhpArray` of its own, `$b = $a`: a `PhpArray` keeps its next free index (`PhpArray.copy`). */
function ownPhpArray(array: unknown): PhpArray {
  return array instanceof PhpArray ? array.copy() : new PhpArray(arrayEntries(array as object));
}

/**
 * `unset($target[$key])` on a PHP array or an `ArrayAccess` object: an object's `offsetUnset($key)`, changed in place
 * (a handle), or a new array without the key.
 */
function unsetKey(target: unknown, key: unknown): unknown {
  if (is_object(target) && !is_array(target)) {
    (target as { offsetUnset(offset: unknown): void }).offsetUnset(key);
    return target;
  }
  const copy = ownPhpArray(target);
  copy.delete(key as never);
  return copy;
}

/**
 * `$parent[$part] = $child` for the reference walk of `forget`: a PHP array gets a new array holding the changed child;
 * an `ArrayAccess` parent is unchanged, as PHP's `&$parent[$part]` on one is a reference to `offsetGet`'s result,
 * which reaches the parent only when the child is an object, changed in place.
 */
function setKey(parent: unknown, part: unknown, child: unknown): unknown {
  if (is_object(parent) && !is_array(parent)) {
    return parent;
  }
  return ownPhpArray(parent).set(part as never, child);
}

/** A forgotten array back in the caller's form: a `PhpArray` stays one (its next free index kept), else AD-9's. */
function asCallerForm(original: unknown, updated: unknown): unknown {
  if (original instanceof PhpArray || !(updated instanceof PhpArray)) {
    return updated;
  }
  return arrayFromEntries(updated);
}

/** Laravel's array helpers. */
export class Arr extends mixin(null, Macroable) {
  /** Determine whether the given value is array accessible: a PHP array or an `ArrayAccess` object. */
  static accessible(value: unknown): boolean {
    return is_array(value) || value instanceof ArrayAccess;
  }

  /** Determine whether a value can be represented through an array contract. */
  static arrayable(value: unknown): boolean {
    return is_array(value) || value instanceof Arrayable || value instanceof Generator || value instanceof Traversable || value instanceof Jsonable || value instanceof JsonSerializable;
  }

  /** Add a dot-keyed value when the current value is null or missing. */
  static add(array: unknown, key: unknown, value: unknown): unknown {
    const result = new Ref(valueCopy(array));
    if (is_null(this.get(array, key))) this.set(result, key, value);
    return result.value;
  }

  /** Get an array item using dot notation, binding PHP parameters before lookup. */
  static array(array: object, key: unknown, defaultValue?: unknown): object;
  static array(_array: unknown, _key: unknown, _defaultValue: unknown = null): unknown {
    const fn = "Illuminate\\Support\\Arr::array";
    const [array, key, defaultValue] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?array", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(array, key, defaultValue);
    if (!is_array(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be an array, %s found.", key, gettype(selected)));
    }
    return phpReturn(fn, "array", selected);
  }

  /** Get a boolean item using dot notation, binding PHP parameters before lookup. */
  static boolean(array: object, key: unknown, defaultValue?: unknown): boolean;
  static boolean(_array: unknown, _key: unknown, _defaultValue: unknown = null): boolean {
    const fn = "Illuminate\\Support\\Arr::boolean";
    const [array, key, defaultValue] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?bool", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(array, key, defaultValue);
    if (!is_bool(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a boolean, %s found.", key, gettype(selected)));
    }
    return phpReturn(fn, "bool", selected) as boolean;
  }

  /** Collapse an array of arrays (or of `Enumerable`s) into a single array. */
  static collapse(array: unknown): unknown {
    const results: unknown[] = [];

    for (const values of iterateValues(array)) {
      if (values instanceof Enumerable) {
        results.push(values.all());
      } else if (is_array(values)) {
        results.push(values);
      }
    }

    return array_merge([], ...results);
  }

  /** Cross join the given arrays (or iterables), returning all possible permutations: a list of lists, one item each. */
  static crossJoin(...arrays: unknown[]): unknown[] {
    let results: unknown[] = [[]];

    for (const [index, array] of arrays.entries()) {
      const append: unknown[] = [];

      for (const product_ of results) {
        // PHP's `foreach ($results as $product)` gives each product as a copy of its own.
        const product = ownPhpArray(product_);

        for (const item of iterateValues(array)) {
          product.set(index, valueCopy(item));

          append.push(arrayFromEntries(product.copy()));
        }
      }

      results = append;
    }

    return results;
  }

  /** Divide an array into its keys and its values. */
  static divide(array: unknown): [unknown[], unknown[]] {
    return valueCopy([array_keys(array), array_values(array)]);
  }

  /**
   * Flatten a multi-dimensional associative array with dots: each leaf (a value that is not a non-empty array, or one
   * `depth` levels down) under its keys joined by `.`, after `prepend`. Also takes AD-26's options object
   * `{ prepend, depth }` after the array: PHP types `$prepend` `string`, so a plain object there is never the prefix.
   */
  static dot(array: unknown, prepend?: string, depth?: number): unknown;
  static dot(array: unknown, options?: { prepend?: string; depth?: number }): unknown;
  static dot(array: unknown, prepend: unknown = "", depth: number = Infinity): unknown {
    if (arguments.length === 2 && isOptionsObject(prepend)) {
      ({ prepend = "", depth = Infinity } = prepend as { prepend?: string; depth?: number });
    }

    const results = new PhpArray();

    const flatten = (data: unknown, prefix: unknown, currentDepth: number): void => {
      for (const [key, value_] of iterateEntries(data)) {
        const newKey = toPhpString(prefix) + toPhpString(key);

        if (is_array(value_) && toBool(value_) && currentDepth < depth) {
          flatten(value_, newKey + ".", currentDepth + 1);
        } else {
          results.set(newKey, value_);
        }
      }
    };

    flatten(array, prepend, 0);

    return valueCopy(arrayFromEntries(results));
  }

  /** Convert a flatten "dot" notation array into an expanded array: each value `set` under its key. */
  static undot(array: unknown): unknown {
    const results = new Ref<unknown>([]);

    for (const [key, value_] of iterateEntries(array)) {
      this.set(results, key, value_);
    }

    return results.value;
  }

  /** Get all of the given array except for a specified array of keys (dot notation reaches nested arrays). */
  static except(array: unknown, keys: unknown): unknown {
    const ref = new Ref(array);
    this.forget(ref, keys);

    return valueCopy(ref.value);
  }

  /** Exclude entries having one of the supplied values, preserving keys. */
  static exceptValues(array: unknown, values: unknown, strict: boolean = false): unknown {
    values = toPhpArray(values);
    return valueCopy(array_filter(array, (item: unknown) => !in_array(item, values, strict)));
  }

  /**
   * Determine if the given key exists in the provided array. An `Enumerable` answers through its `has`, an
   * `ArrayAccess` object through `offsetExists`, and a PHP array by `array_key_exists`, with a float or `null` key
   * read as its string.
   */
  static exists(array: unknown, key: unknown): boolean {
    if (array instanceof Enumerable) {
      return array.has(key);
    }

    if (array instanceof ArrayAccess) {
      return (array as unknown as { offsetExists(offset: unknown): boolean }).offsetExists(key);
    }

    if (isFloat(key) || key === null || key === undefined) {
      key = toPhpString(key ?? null);
    }

    return array_key_exists(key, array);
  }

  /**
   * Return the first element in an iterable passing a given truth test (the callback gets each value and its key), or
   * `value(default)` when none does; with no callback, the first element. Also takes AD-26's options object
   * `{ callback, default }` after the array: PHP types `$callback` `callable|null`, so a plain object there is never the
   * callback.
   */
  static first<R>(array: unknown, callback?: SyncCallable<[value: any, key: any], R> | null, defaultValue?: unknown): unknown;
  static first<R>(array: unknown, options?: { callback?: SyncCallable<[value: any, key: any], R> | null; default?: unknown }): unknown;
  static first(array: unknown, callback: unknown = null, defaultValue: unknown = null): unknown {
    if (arguments.length === 2 && isOptionsObject(callback)) {
      ({ callback = null, default: defaultValue = null } = callback as { callback?: ItemCallback | null; default?: unknown });
    }

    if (callback === null) {
      if (!toBool(array)) {
        return value(defaultValue);
      }

      if (is_array(array)) {
        return valueCopy(array_first(array));
      }

      for (const [, item] of iterateEntries(array)) {
        return valueCopy(item);
      }

      return value(defaultValue);
    }

    if (array instanceof Traversable || array instanceof Generator) {
      for (const [key, value_] of iterateEntries(array)) {
        if (toBool(callCallable(callback, valueCopy(value_), key))) {
          return valueCopy(value_);
        }
      }

      return value(defaultValue);
    }

    array = this.from(array);

    const key = array_find_key(array, (value_: unknown, key_: unknown) => callCallable(callback, valueCopy(value_), key_));

    return key !== null ? valueCopy(arrayRead(array as object, key)) : value(defaultValue);
  }

  /**
   * Return the last element in an array passing a given truth test (the callback gets each value and its key), or
   * `value(default)` when none does; with no callback, the last element. Also takes AD-26's options object
   * `{ callback, default }` after the array, read as `first` reads it.
   */
  static last<R>(array: unknown, callback?: SyncCallable<[value: any, key: any], R> | null, defaultValue?: unknown): unknown;
  static last<R>(array: unknown, options?: { callback?: SyncCallable<[value: any, key: any], R> | null; default?: unknown }): unknown;
  static last(array: unknown, callback: unknown = null, defaultValue: unknown = null): unknown {
    if (arguments.length === 2 && isOptionsObject(callback)) {
      ({ callback = null, default: defaultValue = null } = callback as { callback?: ItemCallback | null; default?: unknown });
    }

    if (array === null || array === undefined) {
      return value(defaultValue);
    }

    array = this.from(array);

    if (callback === null) {
      return !toBool(array) ? value(defaultValue) : valueCopy(array_last(array));
    }

    return this.first(array_reverse(array, true), callback as ItemCallback, defaultValue);
  }

  /** Take the first or last limit items, renumbering integer keys. */
  static take(array: unknown, limit: number | bigint): unknown {
    return valueCopy(limit < 0 ? array_slice(array, limit, abs(limit)) : array_slice(array, 0, limit));
  }

  /**
   * Flatten a multi-dimensional array (`Enumerable`s read through `all()`) into a single level: a list of the values,
   * keys ignored, nested arrays flattened `depth` levels down.
   */
  static flatten(array: unknown, depth: number = Infinity): unknown[] {
    const result: unknown[] = [];

    for (let item of iterateValues(array)) {
      item = item instanceof Enumerable ? item.all() : item;

      if (!is_array(item)) {
        result.push(item);
      } else {
        const values = depth === 1 ? array_values(item) : this.flatten(item, depth - 1);

        for (const value_ of values) {
          result.push(value_);
        }
      }
    }

    return valueCopy(result);
  }

  /** Get a float item using dot notation, binding PHP parameters before lookup. */
  static float(array: object, key: unknown, defaultValue?: unknown): number | PhpFloat;
  static float(_array: unknown, _key: unknown, _defaultValue: unknown = null): number | PhpFloat {
    const fn = "Illuminate\\Support\\Arr::float";
    const [array, key, defaultValue] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?float", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(array, key, defaultValue);
    if (!is_float(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a float, %s found.", key, gettype(selected)));
    }
    return phpReturn(fn, "float", selected) as number | PhpFloat;
  }

  /**
   * Remove one or many array items from a given array using "dot" notation. `array` is PHP's `&$array` (DIV-9.2): the
   * new array is written to `array.value`, and an `ArrayAccess` object on the path loses the key in place.
   */
  static forget(array: Ref<unknown>, keys: unknown): void {
    const original = array;

    const keyList = arrayEntries(toPhpArray(keys)).map(([, key]) => key);

    if (keyList.length === 0) {
      return;
    }

    for (const key of keyList) {
      // clean up before each pass
      const target = valueCopy(original.value);

      // if the exact key exists in the top-level, remove it
      if (this.exists(target, key)) {
        original.value = asCallerForm(target, unsetKey(target, key));

        continue;
      }

      const parts = new Ref<unknown>(explode(".", key));

      // PHP's `$array = &$array[$part]`: each array passed on the way down, with the key it is left by.
      const path: [unknown, unknown][] = [];
      let current: unknown = target;
      let reached = true;

      while (Number(count(parts.value)) > 1) {
        const part = array_shift(parts);

        if (offsetIsSet(current as object, part) && this.accessible(offsetRead(current as object, part))) {
          path.push([current, part]);
          current = offsetRead(current as object, part);
        } else {
          reached = false;
          break;
        }
      }

      if (!reached) {
        continue;
      }

      // Each rebuilt level keeps the form its keys give, and a `PhpArray` stays one.
      let updated = asCallerForm(current, unsetKey(current, array_shift(parts)));

      for (let index = path.length - 1; index >= 0; index--) {
        const [parent, part] = path[index]!;
        updated = asCallerForm(parent, setKey(parent, part, updated));
      }

      original.value = asCallerForm(target, updated);
    }
  }

  /**
   * Get the underlying array of items from the given argument: a PHP array as it is, an `Enumerable`'s `all()`, an
   * `Arrayable`'s `toArray()`, a `WeakMap`'s values as a list, a Traversable's entries, a `Jsonable`'s decoded JSON, a
   * `JsonSerializable`'s `jsonSerialize()` cast to an array, or another object's properties. Throws
   * `InvalidArgumentException` for a scalar or `null`.
   */
  static from(items: unknown): unknown {
    if (is_array(items)) {
      return valueCopy(items);
    }
    if (items instanceof Enumerable) {
      return items.all();
    }
    if (items instanceof Arrayable) {
      return items.toArray();
    }
    if (items instanceof WeakMap) {
      return iterator_to_array(items, false);
    }
    if (items instanceof Traversable) {
      return iterator_to_array(items);
    }
    if (items instanceof Jsonable) {
      return jsonDecode(items.toJson(), true);
    }
    if (items instanceof JsonSerializable) {
      return asValueModel(toPhpArray(items.jsonSerialize()));
    }
    if (is_object(items)) {
      return asValueModel(toPhpArray(items));
    }
    throw new InvalidArgumentException("Items cannot be represented by a scalar value.");
  }

  /**
   * Get an item from an array (or an `ArrayAccess` object) using "dot" notation, or `value(default)` when it is
   * missing; a `null` key gives the array itself.
   */
  static get(array: unknown, key: unknown, defaultValue: unknown = null): unknown {
    if (!this.accessible(array)) {
      return value(defaultValue);
    }

    if (key === null || key === undefined) {
      return valueCopy(array);
    }

    if (this.exists(array, key)) {
      return valueCopy(offsetRead(array as object, key));
    }

    if (!str_contains(key, ".")) {
      return value(defaultValue);
    }

    for (const segment of explode(".", key)) {
      if (this.accessible(array) && this.exists(array, segment)) {
        array = offsetRead(array as object, segment);
      } else {
        return value(defaultValue);
      }
    }

    return valueCopy(array);
  }

  /** Determine whether every supplied dot key exists; null values still exist. */
  static has(array: unknown, keys: unknown): boolean {
    keys = toPhpArray(keys);
    if (!toBool(array) || Number(count(keys)) === 0) return false;
    for (const key of iterateValues(keys)) {
      let subKeyArray = array;
      if (this.exists(array, key)) continue;
      for (const segment of explode(".", key)) {
        if (this.accessible(subKeyArray) && this.exists(subKeyArray, segment)) subKeyArray = offsetRead(subKeyArray as object, segment);
        else return false;
      }
    }
    return true;
  }

  /** Determine whether all supplied dot keys exist. */
  static hasAll(array: unknown, keys: unknown): boolean {
    keys = toPhpArray(keys);
    if (!toBool(array) || Number(count(keys)) === 0) return false;
    return array_all(keys, (key: unknown) => this.has(array, key));
  }

  /** Determine whether any supplied dot key exists. */
  static hasAny(array: unknown, keys: unknown): boolean {
    if (is_null(keys)) return false;
    keys = toPhpArray(keys);
    if (!toBool(array) || Number(count(keys)) === 0) return false;
    return array_any(keys, (key: unknown) => this.has(array, key));
  }

  /** Determine whether every item passes the synchronous truth test. */
  static every<R>(array: unknown, callback: SyncCallable<[value: any, key: any], R>): boolean {
    if (is_array(array)) return array_all(array, (item: unknown, key: unknown) => callCallable(callback, valueCopy(item), key));
    for (const [key, item] of iterateEntries(array)) if (!toBool(callCallable(callback, valueCopy(item), key))) return false;
    return true;
  }

  /** Determine whether any item passes the synchronous truth test. */
  static some<R>(array: unknown, callback: SyncCallable<[value: any, key: any], R>): boolean {
    if (is_array(array)) return array_any(array, (item: unknown, key: unknown) => callCallable(callback, valueCopy(item), key));
    for (const [key, item] of iterateEntries(array)) if (toBool(callCallable(callback, valueCopy(item), key))) return true;
    return false;
  }

  /** Get an integer item using dot notation, binding PHP parameters before lookup. */
  static integer(array: object, key: unknown, defaultValue?: unknown): number | bigint;
  static integer(_array: unknown, _key: unknown, _defaultValue: unknown = null): number | bigint {
    const fn = "Illuminate\\Support\\Arr::integer";
    const [array, key, defaultValue] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?int", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(array, key, defaultValue);
    if (!is_int(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be an integer, %s found.", key, gettype(selected)));
    }
    return phpReturn(fn, "int", selected) as number | bigint;
  }

  /** Determine whether an array has keys other than sequential integers starting at zero. */
  static isAssoc(array: object): boolean;
  static isAssoc(array: unknown): boolean {
    [array] = bindPhpArguments("Illuminate\\Support\\Arr::isAssoc", [{ name: "array", type: "array" }], [...arguments]);
    return !array_is_list(array);
  }

  /** Determine whether all array keys are sequential integers starting at zero. */
  static isList(array: unknown): boolean {
    if (arguments.length === 0) throw new ArgumentCountError("Too few arguments to function Illuminate\\Support\\Arr::isList(), 0 passed and exactly 1 expected");
    return array_is_list(array);
  }

  /** Join items, optionally using a separate glue before the final item. */
  static join(array: unknown, glue: string, finalGlue: string = ""): unknown {
    if (finalGlue === "") return implode(glue, array);
    if (Number(count(array)) === 0) return "";
    if (Number(count(array)) === 1) return valueCopy(array_last(array));
    const remaining = new Ref(valueCopy(array));
    const finalItem = array_pop(remaining);
    return toPhpString(implode(glue, remaining.value)) + finalGlue + toPhpString(finalItem);
  }

  /** Key an array by a field or a synchronous callback. */
  static keyBy<R>(array: unknown, keyBy: SyncCallable<[value: any, key: any], R>): unknown;
  static keyBy<K>(array: unknown, keyBy: ArrValueOrCallback<K>): unknown;
  static keyBy(array: unknown, keyBy: unknown): unknown {
    return new Collection(array).keyBy(keyBy).all();
  }

  /** Prepend a string to each key. */
  static prependKeysWith(array: unknown, prependWith: string): unknown {
    return this.mapWithKeys(array as object, (item: unknown, key: unknown) => new PhpArray([[prependWith + toPhpString(key), item]]));
  }

  /** Get a subset of the items from the given array: the entries whose key is one of `keys`. */
  static only(array: unknown, keys: unknown): unknown {
    return valueCopy(array_intersect_key(array, array_flip(toPhpArray(keys))));
  }

  /** Keep entries having one of the supplied values, preserving keys. */
  static onlyValues(array: unknown, values: unknown, strict: boolean = false): unknown {
    values = toPhpArray(values);
    return valueCopy(array_filter(array, (item: unknown) => in_array(item, values, strict)));
  }

  /**
   * Select an array of values from an array: for each item (a PHP array, an `ArrayAccess` object or an object), the
   * array of the listed keys it has.
   */
  static select(array: unknown, keys: unknown): unknown {
    keys = this.wrap(keys);

    return this.map(array as object, (item: unknown) => {
      const result = new PhpArray();

      for (const key of iterateValues(keys)) {
        if (Arr.accessible(item) && Arr.exists(item, key)) {
          result.set(key as never, offsetRead(item as object, key));
        } else if (is_object(item) && propertyIsSet(item as object, key)) {
          result.set(key as never, propertyRead(item as object, key));
        }
      }

      return valueCopy(arrayFromEntries(result));
    });
  }

  /**
   * Pluck an array of values from an array: each item's `value` (a "dot" key, a list of segments, or a Closure of the
   * item), keyed by its `key` when one is given (a `__toString` object key is its string).
   */
  static pluck(array: unknown, value: unknown, key: unknown = null): unknown {
    const results = new PhpArray();

    [value, key] = this.explodePluckParameters(value, key);

    for (const item of iterateValues(array)) {
      const itemValue = value instanceof Closure ? callCallable(value, valueCopy(item)) : data_get(item, value);

      // If the key is "null", we will just append the value to the array and keep
      // looping. Otherwise we will key the array using the value of the key we
      // received from the developer. Then we'll return the final array form.
      if (key === null) {
        results.push(itemValue);
      } else {
        let itemKey = key instanceof Closure ? callCallable(key, valueCopy(item)) : data_get(item, key);

        if (is_object(itemKey) && method_exists(itemKey, "__toString")) {
          itemKey = toPhpString(itemKey);
        }

        results.set(itemKey as never, itemValue);
      }
    }

    return valueCopy(arrayFromEntries(results));
  }

  /** Explode the "value" and "key" arguments passed to "pluck": a string is its "dot" segments. */
  protected static explodePluckParameters(value: unknown, key: unknown): [unknown, unknown] {
    value = is_string(value) ? explode(".", value) : value;

    key = key === null || is_array(key) || key instanceof Closure ? key : explode(".", key);

    return [value, key];
  }

  /** Run a map over each of the items in the array; the callback gets each value and its key. */
  static map<R>(array: object, callback: SyncCallable<[value: any, key: any], R>): unknown {
    const keys = array_keys(array);

    let items: unknown;
    try {
      items = array_map(callback, array, keys);
    } catch (error) {
      if (!(error instanceof ArgumentCountError)) {
        throw error;
      }
      items = array_map(callback, array);
    }

    return array_combine(keys, items);
  }

  /** Run an associative map over an array; later occurrences replace earlier values of the same key. */
  static mapWithKeys<R>(array: object, callback: SyncCallable<[value: any, key: any], R>): unknown {
    const result = new PhpArray();
    for (const [key, value_] of arrayEntries(array as object)) {
      const assoc = callCallable(callback, valueCopy(value_), key);
      if (!is_array(assoc) && !is_object(assoc)) {
        continue;
      }
      for (const [mapKey, mapValue] of assoc instanceof Traversable ? iterateEntries(assoc) : arrayEntries(assoc as object)) {
        result.set(mapKey as PhpKeyInput, valueCopy(mapValue));
      }
    }
    return arrayFromEntries(result);
  }

  /** Map array chunks after appending each chunk's key to its arguments. */
  static mapSpread<R>(array: object, callback: SyncCallable<any[], R>): unknown {
    return this.map(array, (chunk: unknown, key: unknown) => {
      const ref = new Ref(chunk);
      arrayAppend(ref, key);
      return callUnpacked(callback, ref.value);
    });
  }

  /**
   * Push an item onto the beginning of an array: with two arguments it is prepended at key 0 (int keys renumbered),
   * with a `key` it is set first under that key (`[$key => $value] + $array`).
   */
  static prepend(array: unknown, value: unknown, key: unknown = null): unknown {
    if (arguments.length === 2) {
      const ref = new Ref(valueCopy(array));
      array_unshift(ref, valueCopy(value));
      array = ref.value;
    } else {
      // PHP's `[$key => $value] + $array`: the left-hand keys win.
      const union = new PhpArray([[key as never, valueCopy(value)]]);
      for (const [itemKey, item] of arrayEntries(valueCopy(array) as object)) {
        if (!union.has(itemKey)) {
          union.set(itemKey, item);
        }
      }
      array = arrayFromEntries(union);
    }

    return array;
  }

  /** Get a value from the array, and remove it ("dot" notation). `array` is PHP's `&$array` (DIV-9.2). */
  static pull(array: Ref<unknown>, key: unknown, defaultValue: unknown = null): unknown {
    const value_ = this.get(array.value, key, defaultValue);

    this.forget(array, key);

    return value_;
  }

  /** Convert an array into an RFC 3986 query string. */
  static query(array: unknown): string {
    if (arguments.length === 0) throw new ArgumentCountError("Too few arguments to function Illuminate\\Support\\Arr::query(), 0 passed and exactly 1 expected");
    return http_build_query(array, "", "&", PHP_QUERY_RFC3986);
  }

  /**
   * Get one or a specified number of random values from an array: one value when `number` is `null`, else a list of
   * `number` values (keyed as in the array with `preserveKeys`). Throws `InvalidArgumentException` when more items are
   * requested than the array holds. Also takes AD-26's options object `{ number, preserveKeys }` after the array: PHP
   * types `$number` `int|null`, so a plain object there is never the number.
   */
  static random(array: unknown, number?: unknown, preserveKeys?: boolean): unknown;
  static random(array: unknown, options?: { number?: unknown; preserveKeys?: boolean }): unknown;
  static random(array: unknown, number: unknown = null, preserveKeys: boolean = false): unknown {
    if (arguments.length === 2 && isOptionsObject(number)) {
      ({ number = null, preserveKeys = false } = number as { number?: unknown; preserveKeys?: boolean });
    }

    const requested = number === null ? 1 : number;

    const count_ = count(array);

    // PHP's `$requested > $count` is `$count < $requested`.
    if (spaceship(count_, requested) < 0) {
      throw new InvalidArgumentException(`You requested ${toPhpString(requested)} items, but there are only ${toPhpString(count_)} items available.`);
    }

    if (!toBool(array) || (number !== null && spaceship(number, 0) <= 0)) {
      return number === null ? null : [];
    }

    const keys = new Randomizer().pickArrayKeys(array, requested);

    if (number === null) {
      return valueCopy(arrayRead(array as object, keys[0]));
    }

    const results = new PhpArray();

    if (preserveKeys) {
      for (const key of keys) {
        results.set(key, arrayRead(array as object, key));
      }
    } else {
      for (const key of keys) {
        results.push(arrayRead(array as object, key));
      }
    }

    return valueCopy(arrayFromEntries(results));
  }

  /**
   * Set a dot-keyed item through a Ref (DIV-9.2), or replace the root for a null key.
   * Returns the innermost modified value; a root-leaf ArrayAccess assignment returns its object handle.
   */
  static set(array: Ref<unknown>, key: unknown, value: unknown): unknown {
    const supplied = valueCopy(value);
    if (is_null(key)) {
      array.value = supplied;
      return valueCopy(supplied);
    }
    const keys = explode(".", key);
    // Temporary traversal references are ported by value (PORTING.md, ESC-14.6-10).
    // Existing caller-held cells remain shared; this walk creates no native array cells.
    array.value = valueCopy(array.value);
    let reference = array;
    const path: { parent: Ref<unknown>; key: string; child: Ref<unknown> }[] = [];
    const reconnect = (): void => {
      for (let index = path.length - 1; index >= 0; index--) {
        const { parent, key: part, child } = path[index]!;
        // Shallow assembly of already owned children avoids recursively copying a newly built deep chain.
        // PhpArray.set also writes through any genuine, surviving caller-held reference cell.
        parent.value = asCallerForm(parent.value, setKey(parent.value, part, child.value));
      }
      path.length = 0;
    };
    try {
      for (let depth = 0; depth < keys.length - 1; depth++) {
        const segment = keys[depth]!;
        const current = reference.value;
        // Publish preceding native writes before a userland offset callback can observe them.
        if (current instanceof ArrayAccess) reconnect();
        const present = is_array(current) || current instanceof ArrayAccess;
        if (!present || !offsetIsSet(current as object, segment) || !is_array(offsetRead(reference.value as object, segment))) {
          const original = reference.value;
          offsetAssign(reference, segment, []);
          if (original instanceof PhpArray) reference.value = ownPhpArray(reference.value);
        }
        if (is_array(reference.value)) {
          const child = new Ref(arrayRead(reference.value as object, segment));
          path.push({ parent: reference, key: segment, child });
          reference = child;
        } else if (reference.value instanceof ArrayAccess) {
          reference = offsetReference(reference.value, segment);
        } else {
          // Only impossible scalar/string acquisitions reach the runtime error seam.
          reference = referenceAt(reference, segment);
        }
      }
      // A leaf object can likewise call user code, so retain all preceding initialization first.
      if (reference.value instanceof ArrayAccess) reconnect();
      const original = reference.value;
      offsetAssign(reference, keys[keys.length - 1]!, supplied);
      if (original instanceof PhpArray) reference.value = ownPhpArray(reference.value);
      return valueCopy(reference.value);
    } finally {
      // PHP retains initialization and partial string writes even when a later operation throws.
      reconnect();
    }
  }

  /** Append values through the caller's Ref; declared array return validation follows mutation. */
  static push(array: Ref<unknown>, key: unknown, ...values: unknown[]): object;
  static push(array: Ref<unknown>, _key: unknown, ...values: unknown[]): unknown {
    const fn = "Illuminate\\Support\\Arr::push";
    const args = Array.from(arguments);
    if (args.length > 0) args[0] = array.value;
    const boundValues = valueCopy(values);
    const [, key] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
    ], args);
    const target = new Ref(this.array(array.value as object, key, []));
    array_push(target, ...boundValues);
    return phpReturn(fn, "array", this.set(array, key, target.value));
  }

  /** Shuffle an array into a reindexed list, copying nested array values. */
  static shuffle(array: unknown): unknown[] {
    if (arguments.length === 0) throw new ArgumentCountError("Too few arguments to function Illuminate\\Support\\Arr::shuffle(), 0 passed and exactly 1 expected");
    return new Randomizer().shuffleArray(array);
  }

  /** Return the sole matching item, throwing when none or more than one match. */
  static sole<R>(array: unknown, callback: SyncCallable<[value: any, key: any], R> | null = null): unknown {
    if (toBool(callback)) array = this.where(array, callback as SyncCallable<[any, any], R>);
    const count_ = count(array);
    if (count_ === 0) throw new ItemNotFoundException();
    if (Number(count_) > 1) throw new MultipleItemsFoundException(Number(count_));
    return this.first(array);
  }

  /** Sort using a callback, dot path or ordered comparison list. */
  static sort<R>(array: unknown, callback: ArrSortCallback<R> = null): unknown {
    return new Collection(array).sortBy(callback).all();
  }

  /** Sort in descending order using a callback or dot path. */
  static sortDesc<R>(array: unknown, callback: ArrSortCallback<R> = null): unknown {
    return new Collection(array).sortByDesc(callback as Parameters<Collection["sortByDesc"]>[0]).all();
  }

  /** Recursively sort array keys or list values, with sort flags and an optional direction (AD-26). */
  static sortRecursive(array: unknown, options?: number, descending?: boolean | SortDirection): unknown;
  static sortRecursive(array: unknown, options?: { options?: number; descending?: boolean | SortDirection }): unknown;
  static sortRecursive(array: unknown, options: number | { options?: number; descending?: boolean | SortDirection } = SORT_REGULAR, descending: boolean | SortDirection = false): unknown {
    if (arguments.length === 0) throw new ArgumentCountError("Too few arguments to function Illuminate\\Support\\Arr::sortRecursive(), 0 passed and at least 1 expected");
    if (isOptionsObject(options)) { descending = options.descending ?? false; options = options.options ?? SORT_REGULAR; }
    array_is_list(array);
    const copied = ownPhpArray(valueCopy(array));
    for (const [key, item] of copied) {
      if (is_array(item)) copied.set(key, this.sortRecursive(item, options, descending));
    }
    const result = new Ref<unknown>(copied);
    if (!array_is_list(result.value)) {
      if (descending === false || descending === SortDirection.Ascending) ksort(result, options);
      else if (descending === true || descending === SortDirection.Descending) krsort(result, options);
      else throw unhandledMatch(descending);
    } else {
      if (descending === false || descending === SortDirection.Ascending) sort(result, options);
      else if (descending === true || descending === SortDirection.Descending) rsort(result, options);
      else throw unhandledMatch(descending);
    }
    return result.value;
  }

  /** Recursively sort array keys or list values in descending order. */
  static sortRecursiveDesc(array: unknown, options: number = SORT_REGULAR): unknown {
    if (arguments.length === 0) throw new ArgumentCountError("Too few arguments to function Illuminate\\Support\\Arr::sortRecursiveDesc(), 0 passed and at least 1 expected");
    return this.sortRecursive(array, options, SortDirection.Descending);
  }

  /** Get a string item using dot notation, binding PHP parameters before lookup. */
  static string(array: object, key: unknown, defaultValue?: unknown): string;
  static string(_array: unknown, _key: unknown, _defaultValue: unknown = null): string {
    const fn = "Illuminate\\Support\\Arr::string";
    const [array, key, defaultValue] = bindPhpArguments(fn, [
      { name: "array", type: "ArrayAccess|array" },
      { name: "key", type: "string|int|null" },
      { name: "default", type: "?string", default: null },
    ], Array.from(arguments));
    const selected = Arr.get(array, key, defaultValue);
    if (!is_string(selected)) {
      throw new InvalidArgumentException(sprintf("Array value for key [%s] must be a string, %s found.", key, gettype(selected)));
    }
    return phpReturn(fn, "string", selected) as string;
  }

  /** Compile conditional CSS classes. */
  static toCssClasses(array: unknown): string {
    const classes: unknown[] = [];
    for (const [class_, constraint] of iterateEntries(this.wrap(array))) {
      if (is_numeric(class_)) classes.push(constraint);
      else if (toBool(constraint)) classes.push(class_);
    }
    return implode(" ", classes);
  }

  /** Compile conditional CSS styles through Support's Str.finish dependency. */
  static toCssStyles(array: unknown): string {
    const styles: unknown[] = [];
    const finish = (_value: unknown, _cap: string): never => { throw new BlockedByComponentError("support"); };
    for (const [class_, constraint] of iterateEntries(this.wrap(array))) {
      if (is_numeric(class_)) styles.push(finish(constraint, ";"));
      else if (toBool(constraint)) styles.push(finish(class_, ";"));
    }
    return implode(" ", styles);
  }

  /** Filter the array using the given callback, which gets each value and its key. */
  static where<R>(array: unknown, callback: SyncCallable<[value: any, key: any], R>): unknown {
    return valueCopy(array_filter(valueCopy(array), callback, ARRAY_FILTER_USE_BOTH));
  }

  /** Reject entries passing the synchronous truth test. */
  static reject<R>(array: unknown, callback: SyncCallable<[value: any, key: any], R>): unknown {
    return this.where(array, (item: unknown, key: unknown) => !toBool(callCallable(callback, item, key)));
  }

  /**
   * Partition the array (or Traversable) into two arrays using the given callback, which gets each value and its key:
   * `[passed, failed]`, each keeping its entries' keys.
   */
  static partition<R>(array: unknown, callback: SyncCallable<[value: any, key: any], R>): [unknown, unknown] {
    const passed = new PhpArray();
    const failed = new PhpArray();

    for (const [key, item] of iterateEntries(array)) {
      if (toBool(callCallable(callback, valueCopy(item), key))) {
        passed.set(key as never, item);
      } else {
        failed.set(key as never, item);
      }
    }

    return [valueCopy(arrayFromEntries(passed)), valueCopy(arrayFromEntries(failed))];
  }

  /** Keep entries whose values are not null. */
  static whereNotNull(array: unknown): unknown {
    return this.where(array, (item: unknown) => !is_null(item));
  }

  /** If the given value is not an array and not null, wrap it in one. */
  static wrap(value: unknown): unknown {
    if (value === null || value === undefined) {
      return [];
    }

    return is_array(value) ? valueCopy(value) : [value];
  }

}

registerClass("Illuminate\\Support\\Arr", Arr);
