// PHP's `ArrayIterator` (ESC-14.1-2): an `Iterator` over a PHP array held as a `PhpArray` (`arrayStorage.ts`), also the
// iterator an `ArrayObject`'s `getIterator()` returns, which wraps that object. Its position is PHP's hash position
// (`LiveCursor`): it follows insertion order, sees entries written after it was made, moves off an entry deleted under
// it, and keeps its index when the storage it reads is exchanged. A missing key reads as null (PHP's warning is not
// reproduced), and an `undefined` key as null (AD-9). `ARRAY_AS_PROPS` and `STD_PROP_LIST` are kept by `getFlags()` /
// `setFlags()` but not acted on; `seek()` and the sort methods are not ported. It carries the `Iterator`,
// `Traversable`, `Countable` and `ArrayAccess` brands; `[Symbol.iterator]()` yields the values, `entries()` the pairs
// and `keys()` the keys, by PHP's `foreach` protocol; and its props (`json_encode`, `==`) are its storage, as PHP's
// `get_properties` handler gives them.
import { registerClass } from "../registry/registry";
import { arrayFromEntries, type PhpArrayKey, type PhpKeyInput } from "./PhpArray";
import { boxDelete, boxOf, boxPush, boxSet, initState, PUBLIC_FLAGS, serializeState, SPL_ARRAY, stateOf, unserializeState } from "./arrayStorage";
import { Iterator } from "./Iterator";
import { foreachIterator, foreachKeys, foreachValues, LiveCursor } from "./liveCursor";
import { Traversable } from "./Traversable";
import { valueCopy } from "./valueCopy";

const PHP_PROPS = Symbol.for("xaravel.php.props");
const COUNTABLE = Symbol.for("Countable");
const ARRAY_ACCESS = Symbol.for("ArrayAccess");

/** The position of `it`, made on first use. */
function cursorOf(it: ArrayIterator): LiveCursor<PhpArrayKey> {
  const state = stateOf(it);
  if (state.cursor === null) {
    state.cursor = new LiveCursor<PhpArrayKey>({
      order: () => boxOf(it).seqs,
      lastSeq: () => boxOf(it).lastSeq,
    });
  }
  return state.cursor;
}

export class ArrayIterator implements Iterator {
  /** PHP's `ArrayIterator::STD_PROP_LIST`. */
  static readonly STD_PROP_LIST = 1;
  /** PHP's `ArrayIterator::ARRAY_AS_PROPS`. */
  static readonly ARRAY_AS_PROPS = 2;

  /**
   * `new ArrayIterator($array = [], $flags = 0)`: a copy of a PHP array, the storage of an `ArrayObject` or
   * `ArrayIterator` (wrapped, so writes reach it), or a copy of another object's properties. Throws PHP's `TypeError`
   * for any other value.
   */
  constructor(array: unknown = [], flags: number = 0) {
    initState(this, "ArrayIterator", array, flags);
  }

  get [Iterator.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  get [COUNTABLE](): true {
    return true;
  }

  get [ARRAY_ACCESS](): true {
    return true;
  }

  get [SPL_ARRAY](): true {
    return true;
  }

  /** The value at the position, or null past the end. */
  current(): unknown {
    const item = cursorOf(this).item();
    return item === null ? null : boxOf(this).array.get(item.item);
  }

  /** The key at the position, or null past the end. */
  key(): PhpArrayKey | null {
    return cursorOf(this).item()?.item ?? null;
  }

  next(): void {
    cursorOf(this).next();
  }

  rewind(): void {
    cursorOf(this).rewind();
  }

  valid(): boolean {
    return cursorOf(this).item() !== null;
  }

  /** `count($it)`. */
  count(): number {
    return boxOf(this).array.size;
  }

  /** A copy of the storage (nested arrays copied too), as AD-9 holds a PHP array. */
  getArrayCopy(): unknown {
    return valueCopy(arrayFromEntries(boxOf(this).array));
  }

  /** `array_key_exists`: true for a key whose value is null. */
  offsetExists(key: PhpKeyInput | undefined): boolean {
    return boxOf(this).array.has(key ?? null);
  }

  /** The value at `key`, or null when it is missing. */
  offsetGet(key: PhpKeyInput | undefined): unknown {
    return boxOf(this).array.get(key ?? null);
  }

  /** `$it[$key] = $value`; a null (or `undefined`) key appends, as `$it[] = $value`. */
  offsetSet(key: PhpKeyInput | undefined, value: unknown): void {
    if (key === null || key === undefined) {
      boxPush(boxOf(this), value);
    } else {
      boxSet(boxOf(this), key, value);
    }
  }

  offsetUnset(key: PhpKeyInput | undefined): void {
    boxDelete(boxOf(this), key ?? null);
  }

  /** `$it[] = $value`. */
  append(value: unknown): void {
    boxPush(boxOf(this), value);
  }

  getFlags(): number {
    return stateOf(this).flags;
  }

  setFlags(flags: number): void {
    stateOf(this).flags = flags & PUBLIC_FLAGS;
  }

  /** `[flags, storage, dynamic properties, null]`, PHP's serialized form; a wrapped object is written as itself. */
  __serialize(): unknown[] {
    return serializeState(this, null);
  }

  /** Restores what `__serialize()` wrote, validated as PHP's `__unserialize` does (`arrayStorage.ts`). */
  __unserialize(data: unknown): void {
    unserializeState(this, "ArrayIterator", data);
  }

  /** The props protocol: the storage, which a reader never writes. */
  [PHP_PROPS](): unknown {
    return boxOf(this).array;
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
}

registerClass("ArrayIterator", ArrayIterator);
