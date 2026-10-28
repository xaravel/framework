// PHP's `ArrayObject` (ESC-14.1-2): an `IteratorAggregate` over a PHP array held as a `PhpArray` (`arrayStorage.ts`).
// `getIterator()` is an instance of its iterator class (`ArrayIterator`, or the subclass `setIteratorClass` named),
// built without its constructor as PHP builds it, that wraps this object with its flags, so it sees later writes and
// a later `exchangeArray`. A missing key reads as null (PHP's warning is not reproduced), and an `undefined` key as
// null (AD-9). `ARRAY_AS_PROPS` and `STD_PROP_LIST` are kept by `getFlags()` / `setFlags()` but not acted on; the sort
// methods are not ported. It carries the `IteratorAggregate`, `Traversable`, `Countable` and `ArrayAccess` brands;
// `[Symbol.iterator]()`, `entries()` and `keys()` iterate `getIterator()`; and its props (`json_encode`, `==`) are its
// storage, as PHP's `get_properties` handler gives them.
import { fqcn, registerClass, resolveClass, type RegisteredClass } from "../registry/registry";
import { ArrayIterator } from "./ArrayIterator";
import { ArrayAccess } from "./ArrayAccess";
import {
  attachState,
  boxDelete,
  boxOf,
  boxPush,
  boxSet,
  initState,
  PUBLIC_FLAGS,
  serializeState,
  SPL_ARRAY,
  stateOf,
  storageFor,
  unserializeState,
} from "./arrayStorage";
import { IteratorAggregate } from "./IteratorAggregate";
import { propertyTable } from "./mangle";
import { arrayFromEntries, type PhpKeyInput } from "./PhpArray";
import { Traversable } from "./Traversable";
import { TypeError as PhpTypeError } from "./TypeError";
import { valueCopy } from "./valueCopy";

const PHP_PROPS = Symbol.for("xaravel.php.props");
const COUNTABLE = Symbol.for("Countable");

/** Whether `klass` is `ArrayIterator` or a subclass of it. */
function derivesFromArrayIterator(klass: unknown): klass is RegisteredClass {
  return klass === ArrayIterator || (typeof klass === "function" && klass.prototype instanceof ArrayIterator);
}

export class ArrayObject implements IteratorAggregate, ArrayAccess {
  /** PHP's `ArrayObject::STD_PROP_LIST`. */
  static readonly STD_PROP_LIST = 1;
  /** PHP's `ArrayObject::ARRAY_AS_PROPS`. */
  static readonly ARRAY_AS_PROPS = 2;

  /**
   * `new ArrayObject($array = [], $flags = 0, $iteratorClass = ArrayIterator::class)`: a copy of a PHP array, an
   * `ArrayObject` or `ArrayIterator` (wrapped, so writes reach it), or a copy of another object's properties. Throws
   * PHP's `TypeError` for any other value, and for an iterator class not derived from `ArrayIterator`.
   */
  constructor(array: unknown = [], flags: number = 0, iteratorClass: string | RegisteredClass = ArrayIterator) {
    initState(this, "ArrayObject", array, flags);
    if (iteratorClass !== ArrayIterator) {
      this.#iteratorClass("__construct", 3, iteratorClass);
    }
  }

  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  get [COUNTABLE](): true {
    return true;
  }

  get [ArrayAccess.brand](): true {
    return true;
  }

  get [SPL_ARRAY](): true {
    return true;
  }

  /** An instance of the iterator class over this object, with its flags, built without its constructor. */
  getIterator(): ArrayIterator {
    const state = stateOf(this);
    const klass = state.iteratorClass ?? ArrayIterator;
    const iterator = Object.create((klass as { prototype: object }).prototype) as ArrayIterator;
    for (const { name, default: value } of propertyTable(klass) ?? []) {
      Object.defineProperty(iterator, name, { value: valueCopy(value), enumerable: true, writable: true, configurable: true });
    }
    attachState(iterator, { storage: this, flags: state.flags, cursor: null, iteratorClass: null });
    return iterator;
  }

  /** The FQCN of the iterator class `getIterator()` uses. */
  getIteratorClass(): string {
    return fqcn(stateOf(this).iteratorClass ?? ArrayIterator);
  }

  /**
   * Sets the iterator class `getIterator()` uses: a class-string or registered class derived from `ArrayIterator`.
   * Throws PHP's `TypeError` for any other (an unregistered class named by its JS name).
   */
  setIteratorClass(iteratorClass: string | RegisteredClass): void {
    this.#iteratorClass("setIteratorClass", 1, iteratorClass);
  }

  /** `count($o)`. */
  count(): number {
    return boxOf(this).array.size;
  }

  /** A copy of the storage (nested arrays copied too), as AD-9 holds a PHP array. */
  getArrayCopy(): unknown {
    return valueCopy(arrayFromEntries(boxOf(this).array));
  }

  /**
   * Replaces this object's storage with `array` (as the constructor reads it, so another `ArrayObject` is wrapped) and
   * returns the old array, as `getArrayCopy()`. An object this one wraps is left as it was; an iterator over this
   * object keeps its position index.
   */
  exchangeArray(array: unknown): unknown {
    const state = stateOf(this);
    const old = valueCopy(arrayFromEntries(boxOf(this).array));
    state.storage = storageFor(this, "ArrayObject", "exchangeArray", array);
    return old;
  }

  /** `array_key_exists`: true for a key whose value is null. */
  offsetExists(key: PhpKeyInput | undefined): boolean {
    return boxOf(this).array.has(key ?? null);
  }

  /** The value at `key`, or null when it is missing. */
  offsetGet(key: PhpKeyInput | undefined): unknown {
    return boxOf(this).array.get(key ?? null);
  }

  /** `$o[$key] = $value`; a null (or `undefined`) key appends, as `$o[] = $value`. */
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

  /** `$o[] = $value`. */
  append(value: unknown): void {
    boxPush(boxOf(this), value);
  }

  getFlags(): number {
    return stateOf(this).flags;
  }

  setFlags(flags: number): void {
    stateOf(this).flags = flags & PUBLIC_FLAGS;
  }

  /**
   * `[flags, storage, dynamic properties, iterator class]`, PHP's serialized form: a wrapped object is written as
   * itself, and the iterator class is null for `ArrayIterator`.
   */
  __serialize(): unknown[] {
    const klass = stateOf(this).iteratorClass;
    return serializeState(this, klass === null || klass === ArrayIterator ? null : fqcn(klass));
  }

  /** Restores what `__serialize()` wrote, validated as PHP's `__unserialize` does (`arrayStorage.ts`). */
  __unserialize(data: unknown): void {
    unserializeState(this, "ArrayObject", data);
  }

  /** The props protocol: the storage, which a reader never writes. */
  [PHP_PROPS](): unknown {
    return boxOf(this).array;
  }

  /** The values of `getIterator()`. */
  [Symbol.iterator](): Generator<unknown, void, undefined> {
    return this.getIterator()[Symbol.iterator]();
  }

  /** The `[key, value]` pairs of `getIterator()`. */
  entries(): Generator<[unknown, unknown], void, undefined> {
    return this.getIterator().entries();
  }

  /** The keys of `getIterator()`. */
  keys(): Generator<unknown, void, undefined> {
    return this.getIterator().keys();
  }

  /** Validates and sets the iterator class, argument `position` of `<method>()`. */
  #iteratorClass(method: string, position: number, iteratorClass: unknown): void {
    let klass: unknown = iteratorClass;
    if (typeof iteratorClass === "string") {
      try {
        klass = resolveClass(iteratorClass);
      } catch {
        klass = null;
      }
    }
    if (!derivesFromArrayIterator(klass) || !isRegistered(klass)) {
      const given = typeof iteratorClass === "string" ? iteratorClass : typeof iteratorClass === "function" ? nameOf(iteratorClass) : String(iteratorClass);
      throw new PhpTypeError(`ArrayObject::${method}(): Argument #${String(position)} ($iteratorClass) must be a class name derived from ArrayIterator, ${given} given`);
    }
    stateOf(this).iteratorClass = klass;
  }
}

/** Whether `klass` is registered, so `getIteratorClass()` and `__serialize()` can name it. */
function isRegistered(klass: RegisteredClass): boolean {
  try {
    fqcn(klass);
    return true;
  } catch {
    return false;
  }
}

/** A class's FQCN, or its JS name when it is not registered. */
function nameOf(klass: object): string {
  try {
    return fqcn(klass);
  } catch {
    return String((klass as { name?: unknown }).name);
  }
}

registerClass("ArrayObject", ArrayObject);
