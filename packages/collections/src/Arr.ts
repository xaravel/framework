// Laravel's `Illuminate\Support\Arr` (v13.37.0), the members the Collections core calls: `accessible`, `collapse`,
// `exists`, `from`, `map`, `where` and `wrap`. Story 14.6 ports the rest with its tests. Every member reads its PHP
// array argument as `@xaravel/runtime` does (a list, a plain object or a `PhpArray`) and never mutates or returns the
// caller's array: an array that Upstream returns as it is comes back as a value copy (AD-9).
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { Macroable } from "@xaravel/macroable";
import {
  ARRAY_FILTER_USE_BOTH,
  ArgumentCountError,
  ArrayAccess,
  array_combine,
  array_filter,
  array_key_exists,
  array_keys,
  array_map,
  array_merge,
  arrayEntries,
  arrayFromEntries,
  InvalidArgumentException,
  is_array,
  is_object,
  isFloat,
  iterator_to_array,
  JsonSerializable,
  jsonDecode,
  mixin,
  registerClass,
  toPhpArray,
  toPhpString,
  Traversable,
  valueCopy,
  WeakMap,
} from "@xaravel/runtime";
import { Enumerable } from "./Enumerable";

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

/** Laravel's array helpers. */
export class Arr extends mixin(null, Macroable) {
  /** Determine whether the given value is array accessible: a PHP array or an `ArrayAccess` object. */
  static accessible(value: unknown): boolean {
    return is_array(value) || value instanceof ArrayAccess;
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

  /**
   * Determine if the given key exists in the provided array. An `Enumerable` answers through its `has` (Story 14.2),
   * an `ArrayAccess` object through `offsetExists`, and a PHP array by `array_key_exists`, with a float or `null` key
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

  /** Run a map over each of the items in the array; the callback gets each value and its key. */
  static map(array: unknown, callback: (value: any, key: any) => unknown): unknown {
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

  /** Filter the array using the given callback, which gets each value and its key. */
  static where(array: unknown, callback: (value: any, key: any) => unknown): unknown {
    return array_filter(array, callback, ARRAY_FILTER_USE_BOTH);
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
