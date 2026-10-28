// The storage `ArrayObject` and `ArrayIterator` share (ESC-14.1-2). Internal.
//
// A box holds a PHP array as a `PhpArray`, with each key's insertion sequence (`seqs`, in the array's order) and the
// last sequence handed out, which a `LiveCursor` reads as PHP's hash position; every write goes through `boxSet`,
// `boxPush` and `boxDelete`, which keep the three in step. An instance's state (in a side table keyed by the instance,
// so an instance `phpUnserialize` builds without the constructor gets an empty one on first use) is its storage, its
// flags, its position (an `ArrayIterator`'s) and its iterator class (an `ArrayObject`'s). The storage is the instance's
// own box, or the other SPL array object it wraps, as PHP's `SPL_ARRAY_USE_OTHER` does: an `ArrayObject`'s
// `getIterator()`, and an `ArrayObject` or `ArrayIterator` built over (or exchanged to) another one, read and write
// that object's current storage. `exchangeArray` and `__unserialize` replace only the instance's own storage, so they
// detach it and leave the wrapped object as it was.
import { resolveClass, type RegisteredClass } from "../registry/registry";
import { arrayEntries } from "./casts";
import { InvalidArgumentException } from "./InvalidArgumentException";
import { Iterator } from "./Iterator";
import type { LiveCursor } from "./liveCursor";
import { declaredProps, objectProps, objectTable, unmangle } from "./mangle";
import { normalizeKey, PhpArray, type PhpArrayKey, type PhpKeyInput } from "./PhpArray";
import { phpType, phpTypeName } from "./phpType";
import { TypeError as PhpTypeError } from "./TypeError";
import { UnexpectedValueException } from "./UnexpectedValueException";
import { valueCopy } from "./valueCopy";

/** PHP's `SPL_ARRAY_CLONE_MASK`: the flags `__unserialize` takes from its data. */
const CLONE_MASK = 0x0100ffff;

/**
 * The flags `getFlags()` shows (`~SPL_ARRAY_INT_MASK`): PHP keeps only these from the constructor and `setFlags`, and
 * its internal `SPL_ARRAY_IS_SELF` (0x01000000), which `__unserialize` may take, is not ported.
 */
export const PUBLIC_FLAGS = 0xffff;

/** The prototype brand of `ArrayObject` and `ArrayIterator`, which instances `phpUnserialize` builds carry too. */
export const SPL_ARRAY: unique symbol = Symbol("xaravel.php.splArray");

/** The brand of a box. */
const BOX: unique symbol = Symbol("xaravel.php.arrayBox");

/** A PHP array with its keys' insertion sequences, in the array's order, and the last sequence handed out. */
export interface ArrayBox {
  readonly [BOX]: true;
  readonly array: PhpArray<PhpKeyInput, unknown>;
  readonly seqs: Map<PhpArrayKey, number>;
  lastSeq: number;
  /** Captured offset slots; deleting a key detaches its cell. */
  readonly references: Map<PhpArrayKey, { value: unknown }>;
}

/** A box over `array`, which it takes as it is. */
export function newBox(array: PhpArray<PhpKeyInput, unknown> = new PhpArray()): ArrayBox {
  const seqs = new Map<PhpArrayKey, number>();
  for (const key of array.keys()) {
    seqs.set(key, seqs.size + 1);
  }
  return { [BOX]: true, array, seqs, lastSeq: seqs.size, references: new Map() };
}

/** Whether a storage is a box rather than a wrapped SPL array object. */
function isBox(storage: ArrayBox | object): storage is ArrayBox {
  return (storage as Record<symbol, unknown>)[BOX] === true;
}

/** `$a[$key] = $value`: a new key takes the next sequence, a rewritten one keeps its own. */
export function boxSet(box: ArrayBox, key: PhpKeyInput, value: unknown): void {
  const normal = normalizeKey(key);
  const had = box.array.has(normal);
  box.array.set(normal, value);
  // A direct SPL offset write replaces even a referenced slot (PHP 8.5.11).
  box.references.delete(normal);
  if (!had) {
    box.seqs.set(normal, ++box.lastSeq);
  }
}

/** `$a[] = $value`. */
export function boxPush(box: ArrayBox, value: unknown): void {
  box.seqs.set(box.array.push(value), ++box.lastSeq);
}

/** `unset($a[$key])`. */
export function boxDelete(box: ArrayBox, key: PhpKeyInput): void {
  const normal = normalizeKey(key);
  if (box.array.delete(normal)) {
    box.seqs.delete(normal);
    box.references.delete(normal);
  }
}

/** One instance's state. */
export interface ArrayState {
  /** The instance's own box, or the SPL array object it wraps. */
  storage: ArrayBox | object;
  flags: number;
  /** The position of an `ArrayIterator`, made on first use. */
  cursor: LiveCursor<PhpArrayKey> | null;
  /** An `ArrayObject`'s iterator class; null for `ArrayIterator`. */
  iteratorClass: RegisteredClass | null;
}

const states = new WeakMap<object, ArrayState>();

/** Whether `value` is an `ArrayObject` or `ArrayIterator` (a subclass, or one built without its constructor). */
export function isSplArray(value: unknown): value is object {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[SPL_ARRAY] === true;
}

/** The state of `o`, an empty one when it has none (an instance built without its constructor). */
export function stateOf(o: object): ArrayState {
  let state = states.get(o);
  if (state === undefined) {
    state = { storage: newBox(), flags: 0, cursor: null, iteratorClass: null };
    states.set(o, state);
  }
  return state;
}

/** Gives `o` the state `state` (an iterator `getIterator()` builds). */
export function attachState(o: object, state: ArrayState): void {
  states.set(o, state);
}

/** The box `o` reads and writes: its own, or the one of the object it wraps, followed to the end. */
export function boxOf(o: object): ArrayBox {
  let storage = stateOf(o).storage;
  while (!isBox(storage)) {
    storage = stateOf(storage).storage;
  }
  return storage;
}

/**
 * The storage `<className>::<method>()` makes of `value` for `o`: a box over a copy of a PHP array (nested arrays
 * copied too, `valueCopy`), the
 * `ArrayObject` or `ArrayIterator` itself (wrapped), or a box over a copy of any other object's properties. A wrap that
 * would lead back to `o` takes a copy of the storage instead. Throws PHP's `TypeError` for any other value.
 */
export function storageFor(o: object, className: string, method: string, value: unknown): ArrayBox | object {
  const type = typeof value === "symbol" || typeof value === "bigint" ? "int" : phpType(value);
  if (type === "array") {
    const copy = valueCopy(value);
    return newBox(copy instanceof PhpArray ? (copy as PhpArray<PhpKeyInput, unknown>) : new PhpArray(arrayEntries(copy as object)));
  }
  if (type === "object") {
    if (isSplArray(value)) {
      return wrapsBack(value, o) ? newBox(boxOf(value).array.copy()) : value;
    }
    return newBox(new PhpArray(objectProps(value as object)));
  }
  throw new PhpTypeError(`${className}::${method}(): Argument #1 ($array) must be of type array, ${phpTypeName(value)} given`);
}

/** Whether `value`'s chain of wrapped objects reaches `o`. */
function wrapsBack(value: object, o: object): boolean {
  let storage: ArrayBox | object = value;
  while (!isBox(storage)) {
    if (storage === o) {
      return true;
    }
    storage = stateOf(storage).storage;
  }
  return false;
}

/** Sets up `o`'s state from its constructor arguments. */
export function initState(o: object, className: string, array: unknown, flags: number): void {
  states.set(o, { storage: storageFor(o, className, "__construct", array), flags: flags & PUBLIC_FLAGS, cursor: null, iteratorClass: null });
}

/**
 * `__serialize()`'s array: the flags, the storage (a copy of the own array, or the wrapped object itself), the dynamic
 * properties (protected and private names mangled, as `phpSerialize` writes a class's property table) and the iterator
 * class (null for the default).
 */
export function serializeState(o: object, iteratorClassName: string | null): unknown[] {
  const state = stateOf(o);
  const members: Record<string, unknown> = {};
  const table = objectTable(o);
  const props = table === null ? Object.keys(o).map((key) => [key, (o as Record<string, unknown>)[key] ?? null] as const) : declaredProps(o, table);
  for (const [key, value] of props) {
    Object.defineProperty(members, key, { value, enumerable: true, writable: true, configurable: true });
  }
  const storage = isBox(state.storage) ? state.storage.array.copy() : state.storage;
  return [state.flags, storage, members, iteratorClassName];
}

/**
 * `__unserialize($data)`, as PHP's `spl_array___unserialize`: `data` is `[flags, storage, members]` with an optional
 * iterator class. Throws PHP's `UnexpectedValueException` `Incomplete or ill-typed serialization data` when the flags
 * are no int, the storage or members are missing, the members are no array or the class is neither null nor a string;
 * PHP's `InvalidArgumentException` `Passed variable is not an array or object` for any other storage; and PHP's
 * `UnexpectedValueException` when the class is missing or no `Iterator`. Keeps the flags outside PHP's
 * `SPL_ARRAY_CLONE_MASK` and takes the rest from the data; replaces only this instance's storage; restores the
 * members under their unmangled names.
 */
export function unserializeState(o: object, className: string, data: unknown): void {
  const entries = new Map(phpType(data) === "array" ? arrayEntries(data as object) : []);
  const flags = entries.get(0);
  const storage = entries.get(1);
  const members = entries.get(2);
  const iteratorClass = entries.has(3) ? entries.get(3) : null;
  if (
    flags === undefined ||
    phpType(flags) !== "int" ||
    !entries.has(1) ||
    members === undefined ||
    phpType(members) !== "array" ||
    (iteratorClass !== null && typeof iteratorClass !== "string")
  ) {
    throw new UnexpectedValueException("Incomplete or ill-typed serialization data");
  }
  const storageType = phpType(storage);
  if (storageType !== "array" && storageType !== "object") {
    throw new InvalidArgumentException("Passed variable is not an array or object");
  }
  const state = stateOf(o);
  state.flags = ((state.flags & ~CLONE_MASK) | (Number(flags) & CLONE_MASK)) & PUBLIC_FLAGS;
  state.storage = storageFor(o, className, "__unserialize", storage);
  for (const [key, value] of arrayEntries(members as object)) {
    Object.defineProperty(o, unmangle(String(key)), { value, enumerable: true, writable: true, configurable: true });
  }
  if (typeof iteratorClass === "string") {
    let klass: RegisteredClass;
    try {
      klass = resolveClass(iteratorClass);
    } catch {
      throw new UnexpectedValueException(`Cannot deserialize ArrayObject with iterator class '${iteratorClass}'; no such class exists`);
    }
    if ((klass.prototype as Record<symbol, unknown> | undefined)?.[Iterator.brand] !== true) {
      throw new UnexpectedValueException(`Cannot deserialize ArrayObject with iterator class '${iteratorClass}'; this class does not implement the Iterator interface`);
    }
    state.iteratorClass = klass;
  }
}
