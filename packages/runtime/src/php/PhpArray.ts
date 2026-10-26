// A PHP array that is neither a list nor an all-non-integer-string-keyed map (AD-9.2, DIV-9.2): an ordered map with
// PHP's key normalisation and insertion-order iteration, branded `Symbol.for('xaravel.php.array')` on the prototype
// (AD-9.5). Its `[Symbol.iterator]()` yields normalised `[key, value]` pairs, the protocol the grader reads without
// importing the runtime (decisions/ESC-4.1-1.md). A key is a safe-integer `number`, a `bigint` for an int beyond
// ±(2^53 − 1), or a `string`. `jsonEncode` encodes it by the list rule.
import type { PhpFloat } from "./PhpFloat";
import { fqcn, registerClass } from "../registry/registry";
import { Error as PhpError } from "./Error";
import { normalizeNull } from "./normalizeNull";
import { floatToInt, INT_MAX, INT_MIN, intKey } from "./phpInt";
import { TypeError as PhpTypeError } from "./TypeError";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");

/** A normalised PHP array key. */
export type PhpArrayKey = number | bigint | string;

/** A value PHP accepts as an array key before normalisation (a marked float included). */
export type PhpKeyInput = PhpArrayKey | boolean | null | PhpFloat;

/** A string PHP stores as an int key: canonical decimal (the int range is checked separately). */
const INTEGER_KEY = /^(?:0|-?[1-9]\d*)$/;

function isMarkedFloat(value: object): boolean {
  return (value as Record<symbol, unknown>)[PHP_FLOAT] === true;
}

/** The PHP type name of an illegal offset, as PHP's `Cannot access offset of type <type> on array` gives it. */
function offsetType(key: unknown): string {
  switch (typeof key) {
    case "function":
      return "Closure";
    case "object": {
      if (key === null) {
        return "null";
      }
      if (Array.isArray(key) || PHP_ARRAY in key) {
        return "array";
      }
      const prototype: unknown = Object.getPrototypeOf(key);
      if (prototype === Object.prototype || prototype === null) {
        return "array";
      }
      try {
        return fqcn(key);
      } catch {
        return "object";
      }
    }
    case "bigint":
      return "int";
    default:
      return typeof key;
  }
}

/**
 * `key` normalised as PHP normalises an array key: a canonical decimal string in the int64 range is an int, a bool
 * is 0 or 1, `null` is `""`, and a float (a marked one included) truncates. Throws PHP's `TypeError` for any other
 * value, and for a `bigint` outside the int64 range, which is no PHP int. The casts read a plain object's keys through
 * it; `@xaravel/runtime/php` exports it so a port normalises keys as the codecs and the grader do (ESC-14.1-1).
 */
export function normalizeKey(key: unknown): PhpArrayKey {
  switch (typeof key) {
    case "string":
      if (INTEGER_KEY.test(key)) {
        const value = BigInt(key);
        if (value >= INT_MIN && value <= INT_MAX) {
          return intKey(value);
        }
      }
      return key;
    case "number":
      return floatToInt(key);
    case "bigint":
      if (key >= INT_MIN && key <= INT_MAX) {
        return intKey(key);
      }
      break;
    case "boolean":
      return key ? 1 : 0;
    case "object":
      if (key === null) {
        return "";
      }
      if (isMarkedFloat(key)) {
        return floatToInt(Number(key));
      }
      break;
    default:
      break;
  }
  throw new PhpTypeError(`Cannot access offset of type ${offsetType(key)} on array`);
}

/** The int value of a normalised key, or null for a string key. */
function intValue(key: PhpArrayKey): bigint | null {
  return typeof key === "string" ? null : BigInt(key);
}

/** Reads a `PhpArray`'s next free index (set by the class's static block). */
let readNextFree: (array: PhpArray) => bigint | null;
/** Builds a `PhpArray` from entries with the given next free index (set by the class's static block). */
let buildWithNextFree: (entries: Iterable<readonly [PhpArrayKey, unknown]>, nextFree: bigint | null) => PhpArray;

export class PhpArray<K extends PhpKeyInput = PhpKeyInput, V = unknown> implements Iterable<[PhpArrayKey, V]> {
  readonly #entries = new Map<PhpArrayKey, V>();
  /** PHP's `nNextFreeElement`: the largest int key ever inserted plus 1 (capped at `PHP_INT_MAX`); null when none. */
  #nextFree: bigint | null = null;

  static {
    readNextFree = (array) => array.#nextFree;
    buildWithNextFree = (entries, nextFree) => {
      const array = new PhpArray(entries);
      array.#nextFree = nextFree;
      return array;
    };
  }

  constructor(entries: Iterable<readonly [K, V]> = []) {
    for (const [key, value] of entries) {
      this.set(key, value);
    }
  }

  get [PHP_ARRAY](): true {
    return true;
  }

  /** The number of entries (`count($a)`). */
  get size(): number {
    return this.#entries.size;
  }

  /** The value at `key`, or null when the key is missing. */
  get(key: K | PhpKeyInput): V | null {
    const normal = normalizeKey(key);
    return this.#entries.get(normal) ?? null;
  }

  /** `$a[$key] = $value`. A rewritten key keeps its first position. Returns this array. */
  set(key: K | PhpKeyInput, value: V): this {
    const normal = normalizeKey(key);
    this.#entries.set(normal, normalizeNull(value) as V);
    this.#advance(normal);
    return this;
  }

  /** `array_key_exists($key, $a)`. */
  has(key: K | PhpKeyInput): boolean {
    return this.#entries.has(normalizeKey(key));
  }

  /** `unset($a[$key])`; whether the key was present. The next free index never goes down. */
  delete(key: K | PhpKeyInput): boolean {
    return this.#entries.delete(normalizeKey(key));
  }

  /**
   * `$a[] = $value`: sets the next free index (the largest int key ever inserted plus 1, or 0) and returns that key.
   * Throws PHP's `Cannot add element to the array as the next element is already occupied` when that index is taken
   * (past `PHP_INT_MAX`).
   */
  push(value: V): PhpArrayKey {
    const key = intKey(this.#nextFree ?? 0n);
    if (this.#entries.has(key)) {
      throw new PhpError("Cannot add element to the array as the next element is already occupied");
    }
    this.#entries.set(key, normalizeNull(value) as V);
    this.#advance(key);
    return key;
  }

  /**
   * A copy of this array as PHP's `$b = $a` makes it: the same entries in the same order and the same next free index,
   * so `[5 => 1]`, unset 5, copy, push gives key 6. The values are shared; `valueCopy` copies nested arrays.
   */
  copy(): PhpArray<K, V> {
    const copy = new PhpArray<K, V>();
    for (const [key, value] of this.#entries) {
      copy.#entries.set(key, value);
    }
    copy.#nextFree = this.#nextFree;
    return copy;
  }

  /** The keys, in insertion order. */
  keys(): IterableIterator<PhpArrayKey> {
    return this.#entries.keys();
  }

  /** The values, in insertion order. */
  values(): IterableIterator<V> {
    return this.#entries.values();
  }

  /** The `[key, value]` pairs, in insertion order. */
  *entries(): IterableIterator<[PhpArrayKey, V]> {
    for (const [key, value] of this.#entries) {
      yield [key, value];
    }
  }

  [Symbol.iterator](): IterableIterator<[PhpArrayKey, V]> {
    return this.entries();
  }

  #advance(key: PhpArrayKey): void {
    const value = intValue(key);
    if (value !== null && (this.#nextFree === null || value >= this.#nextFree)) {
      this.#nextFree = value < INT_MAX ? value + 1n : INT_MAX;
    }
  }
}

/**
 * PHP's `nNextFreeElement` of `array`: the key `$a[] = …` takes next, or null when no int key was ever inserted (then
 * 0). Internal: the package entries do not export it (action item epic-14-item-5-runtime-array-functions).
 */
export function nextFreeIndex(array: PhpArray): bigint | null {
  return readNextFree(array);
}

/**
 * A `PhpArray` of `entries` (normalised keys, in order) whose next free index is `nextFree`, as PHP keeps it where it
 * does not renumber (`array_pop`, `asort`). Internal: the package entries do not export it.
 */
export function phpArrayWithNextFree(entries: Iterable<readonly [PhpArrayKey, unknown]>, nextFree: bigint | null): PhpArray {
  return buildWithNextFree(entries, nextFree);
}

/**
 * `[key, value]` entries as AD-9 holds a PHP array (DIV-9.2): keys normalised, a repeated key keeping its first
 * position and its last value; a list is an `Array`, all string keys a plain object (built with `defineProperty`, so a
 * `"__proto__"` key stays an entry), anything else a `PhpArray`. The codecs build arrays through it;
 * `@xaravel/runtime/php` exports it so a port returns PHP arrays in the same form (ESC-14.1-1).
 */
export function arrayFromEntries(entries: Iterable<readonly [PhpKeyInput, unknown]>): unknown {
  const array = new PhpArray<PhpKeyInput, unknown>(entries);
  const pairs = [...array];
  if (pairs.every(([key], index) => key === index)) {
    return pairs.map(([, value]) => value);
  }
  if (pairs.every(([key]) => typeof key === "string")) {
    const map: Record<string, unknown> = {};
    for (const [key, value] of pairs) {
      Object.defineProperty(map, key as string, { value, enumerable: true, writable: true, configurable: true });
    }
    return map;
  }
  return array;
}

registerClass("Xaravel\\Runtime\\Php\\PhpArray", PhpArray);
