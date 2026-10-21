// A PHP array that is neither a list nor an all-non-integer-string-keyed map (AD-9.2, DIV-9.2): an ordered map with
// PHP's key normalisation and insertion-order iteration, branded `Symbol.for('xaravel.php.array')` on the prototype
// (AD-9.5). Its `[Symbol.iterator]()` yields normalised `[key, value]` pairs, the protocol the grader reads without
// importing the runtime (decisions/ESC-4.1-1.md). A key is a safe-integer `number`, a `bigint` for an int beyond
// ±(2^53 − 1), or a `string`. `jsonEncode` encodes it by the list rule.
import type { PhpFloat } from "./PhpFloat";
import { fqcn, registerClass } from "../registry/registry";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const PHP_FLOAT = Symbol.for("xaravel.php.float");

/** A normalised PHP array key. */
export type PhpArrayKey = number | bigint | string;

/** A value PHP accepts as an array key before normalisation (a marked float included). */
export type PhpKeyInput = PhpArrayKey | boolean | null | PhpFloat;

const INT_MAX = 9223372036854775807n;
const INT_MIN = -9223372036854775808n;
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const SAFE_MIN = BigInt(Number.MIN_SAFE_INTEGER);
const TWO_64 = 1n << 64n;
const TWO_63 = 1n << 63n;
/** A string PHP stores as an int key: canonical decimal (the int range is checked separately). */
const INTEGER_KEY = /^(?:0|-?[1-9]\d*)$/;

/** An int key: a `number` when safe, else a `bigint`. */
function intKey(value: bigint): PhpArrayKey {
  return value >= SAFE_MIN && value <= SAFE_MAX ? Number(value) : value;
}

/** PHP's float to int key conversion: truncation, 0 for a non-finite float, modulo 2^64 out of range. */
function floatKey(value: number): PhpArrayKey {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const truncated = Math.trunc(value);
  if (Number.isSafeInteger(truncated)) {
    return truncated === 0 ? 0 : truncated;
  }
  let wrapped = BigInt(truncated) % TWO_64;
  if (wrapped < 0n) {
    wrapped += TWO_64;
  }
  return intKey(wrapped >= TWO_63 ? wrapped - TWO_64 : wrapped);
}

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
 * value, and for a `bigint` outside the int64 range, which is no PHP int.
 */
function normalizeKey(key: unknown): PhpArrayKey {
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
      return floatKey(key);
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
        return floatKey(Number(key));
      }
      break;
    default:
      break;
  }
  throw new TypeError(`Cannot access offset of type ${offsetType(key)} on array`);
}

/** The int value of a normalised key, or null for a string key. */
function intValue(key: PhpArrayKey): bigint | null {
  return typeof key === "string" ? null : BigInt(key);
}

export class PhpArray<K extends PhpKeyInput = PhpKeyInput, V = unknown> implements Iterable<[PhpArrayKey, V]> {
  readonly #entries = new Map<PhpArrayKey, V>();
  /** PHP's `nNextFreeElement`: the largest int key ever inserted plus 1 (capped at `PHP_INT_MAX`); null when none. */
  #nextFree: bigint | null = null;

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
    return this.#entries.has(normal) ? (this.#entries.get(normal) as V) : null;
  }

  /** `$a[$key] = $value`. A rewritten key keeps its first position. Returns this array. */
  set(key: K | PhpKeyInput, value: V): this {
    const normal = normalizeKey(key);
    this.#entries.set(normal, (value === undefined ? null : value) as V);
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
      throw new Error("Cannot add element to the array as the next element is already occupied");
    }
    this.#entries.set(key, (value === undefined ? null : value) as V);
    this.#advance(key);
    return key;
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

registerClass("Xaravel\\Runtime\\Php\\PhpArray", PhpArray);
