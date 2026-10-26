// PHP's `CachingIterator` (ESC-14.1-2): an `Iterator` over another `Iterator` that fetches one element ahead, so
// `hasNext()` is the inner iterator's `valid()`. The fetch is PHP's `spl_caching_it_next`: the inner iterator's
// current key and value are cached (and, under `FULL_CACHE`, added to the cache array), the string form is taken under
// `CALL_TOSTRING` (of the value) or `TOSTRING_USE_INNER` (of the inner iterator), then the inner iterator moves on.
// `toString()` is `__toString` (also `[Symbol.toPrimitive]`), so the class carries the `Stringable` brand as well as
// `Iterator`, `Traversable` and `Countable`; `[Symbol.iterator]()` yields the values, `entries()` the pairs and
// `keys()` the keys, by PHP's `foreach` protocol. Under `FULL_CACHE` a key PHP cannot store in an array throws PHP's
// `TypeError` after the element is cached and before the inner iterator moves, as PHP's fetch order leaves it. `CATCH_GET_CHILD` is kept but not acted on (there is no `RecursiveCachingIterator`);
// the `ArrayAccess` methods and `setFlags` are not ported.
import { registerClass } from "../registry/registry";
import { BadMethodCallException } from "./BadMethodCallException";
import { toPhpString } from "./casts";
import { Iterator } from "./Iterator";
import { foreachIterator, foreachKeys, foreachValues } from "./liveCursor";
import { arrayFromEntries, PhpArray, type PhpKeyInput } from "./PhpArray";
import { className, phpTypeName } from "./phpType";
import { Stringable } from "./Stringable";
import { Traversable } from "./Traversable";
import { TypeError as PhpTypeError } from "./TypeError";
import { ValueError } from "./ValueError";
import { valueCopy } from "./valueCopy";

/** The four string flags, of which a CachingIterator takes at most one. */
const STRING_FLAGS = [1, 2, 4, 8] as const;

const COUNTABLE = Symbol.for("Countable");

export class CachingIterator implements Iterator, Stringable {
  /** Convert every element to string. */
  static readonly CALL_TOSTRING = 1;
  /** Use the key for the string conversion. */
  static readonly TOSTRING_USE_KEY = 2;
  /** Use the current value for the string conversion. */
  static readonly TOSTRING_USE_CURRENT = 4;
  /** Use the inner iterator for the string conversion. */
  static readonly TOSTRING_USE_INNER = 8;
  /** Ignore exceptions thrown in accessing children (RecursiveCachingIterator only). */
  static readonly CATCH_GET_CHILD = 16;
  /** Cache every element read. */
  static readonly FULL_CACHE = 256;

  readonly #inner: Iterator;
  readonly #flags: number;
  #valid = false;
  #current: { readonly key: unknown; readonly value: unknown } | null = null;
  #string: string | null = null;
  #cache = new PhpArray<PhpKeyInput, unknown>();

  /**
   * `new CachingIterator($iterator, $flags = CachingIterator::CALL_TOSTRING)`. Throws PHP's `TypeError` when
   * `iterator` is not an `Iterator`, and PHP's `ValueError` when `flags` holds more than one string flag.
   */
  constructor(iterator: Iterator, flags: number = CachingIterator.CALL_TOSTRING) {
    if (!(iterator instanceof Iterator)) {
      throw new PhpTypeError(`CachingIterator::__construct(): Argument #1 ($iterator) must be of type Iterator, ${phpTypeName(iterator)} given`);
    }
    if (STRING_FLAGS.filter((flag) => (flags & flag) !== 0).length > 1) {
      throw new ValueError(
        "CachingIterator::__construct(): Argument #2 ($flags) must contain only one of CachingIterator::CALL_TOSTRING, CachingIterator::TOSTRING_USE_KEY, CachingIterator::TOSTRING_USE_CURRENT, or CachingIterator::TOSTRING_USE_INNER",
      );
    }
    this.#inner = iterator;
    this.#flags = flags;
  }

  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  get [Stringable.brand](): true {
    return true;
  }

  get [COUNTABLE](): true {
    return true;
  }

  /** Rewinds the inner iterator, clears the cache and fetches the first element. */
  rewind(): void {
    this.#inner.rewind();
    this.#cache = new PhpArray<PhpKeyInput, unknown>();
    this.#fetchNext();
  }

  /** Whether the cached element is valid. */
  valid(): boolean {
    return this.#valid;
  }

  /** The cached value, or null. */
  current(): unknown {
    return this.#current?.value ?? null;
  }

  /** The cached key, or null. */
  key(): unknown {
    return this.#current?.key ?? null;
  }

  /** Fetches the next element. */
  next(): void {
    this.#fetchNext();
  }

  /** Whether the inner iterator has a further element. */
  hasNext(): boolean {
    return this.#inner.valid();
  }

  getInnerIterator(): Iterator {
    return this.#inner;
  }

  getFlags(): number {
    return this.#flags;
  }

  /** The cache, as AD-9 holds a PHP array. Throws PHP's `BadMethodCallException` without `FULL_CACHE`. */
  getCache(): unknown {
    this.#requireFullCache();
    return valueCopy(arrayFromEntries(this.#cache));
  }

  /** The number of cached elements. Throws PHP's `BadMethodCallException` without `FULL_CACHE`. */
  count(): number {
    this.#requireFullCache();
    return this.#cache.size;
  }

  /**
   * PHP's `__toString()`: the key or current value converted under `TOSTRING_USE_KEY` / `TOSTRING_USE_CURRENT`, else
   * the string taken at the fetch (`""` when none). Throws PHP's `BadMethodCallException` without a string flag.
   */
  toString(): string {
    const flags = this.#flags;
    if ((flags & (CachingIterator.CALL_TOSTRING | CachingIterator.TOSTRING_USE_KEY | CachingIterator.TOSTRING_USE_CURRENT | CachingIterator.TOSTRING_USE_INNER)) === 0) {
      throw new BadMethodCallException(`${className(this)} does not fetch string value (see CachingIterator::__construct)`);
    }
    if ((flags & CachingIterator.TOSTRING_USE_KEY) !== 0) {
      return toPhpString(this.key());
    }
    if ((flags & CachingIterator.TOSTRING_USE_CURRENT) !== 0) {
      return toPhpString(this.current());
    }
    return this.#string ?? "";
  }

  [Symbol.toPrimitive](): string {
    return this.toString();
  }

  /** The values, by PHP's `foreach` protocol. */
  [Symbol.iterator](): Generator<unknown, void, undefined> {
    return foreachValues(this);
  }

  /** The `[key, value]` pairs, by PHP's `foreach` protocol. */
  entries(): Generator<[unknown, unknown], void, undefined> {
    return foreachIterator(this);
  }

  /** The keys, by PHP's `foreach` protocol. */
  keys(): Generator<unknown, void, undefined> {
    return foreachKeys(this);
  }

  #requireFullCache(): void {
    if ((this.#flags & CachingIterator.FULL_CACHE) === 0) {
      throw new BadMethodCallException(`${className(this)} does not use a full cache (see CachingIterator::__construct)`);
    }
  }

  /** `spl_caching_it_next`. */
  #fetchNext(): void {
    this.#current = null;
    this.#string = null;
    if (!this.#inner.valid()) {
      this.#valid = false;
      return;
    }
    const value = this.#inner.current();
    const key = this.#inner.key() ?? null;
    this.#current = { key, value };
    this.#valid = true;
    if ((this.#flags & CachingIterator.FULL_CACHE) !== 0) {
      this.#cache.set(key as PhpKeyInput, value);
    }
    if ((this.#flags & CachingIterator.TOSTRING_USE_INNER) !== 0) {
      this.#string = toPhpString(this.#inner);
    } else if ((this.#flags & CachingIterator.CALL_TOSTRING) !== 0) {
      this.#string = toPhpString(value);
    }
    this.#inner.next();
  }
}

registerClass("CachingIterator", CachingIterator);
