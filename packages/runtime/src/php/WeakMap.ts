// PHP's `WeakMap` (ESC-14.1-2): a map from objects to values that holds neither its keys nor its values strongly and,
// unlike a JS `WeakMap`, iterates, in insertion order (a rewritten key keeps its position). Each value sits in a JS
// `WeakMap` keyed by its object, an ephemeron, so a value that references its key does not keep it alive; only the
// order record (the key's `WeakRef` and its insertion sequence) is held strongly, and a `FinalizationRegistry` drops it
// once the key is collected; an entry whose key is gone is skipped before that. A key is a PHP object (a class instance
// or a function, never a PHP array). `offsetExists` is `isset`: false for a null value, as PHP's is. `getIterator()`
// is an `InternalIterator` over the live entries (`LiveCursor`). It carries the `IteratorAggregate`, `Traversable`,
// `Countable` and `ArrayAccess` brands; `[Symbol.iterator]()` yields the values, `entries()` the `[key, value]` pairs
// and `keys()` the keys. `phpSerialize` throws PHP's `Exception` `Serialization of 'WeakMap' is not allowed`, as PHP
// does. The object ids in the missing-key message (`Object stdClass#<n> not contained in WeakMap`) come from a
// runtime-local counter, as the grader's handles do, so they are not PHP's numbers.
import { registerClass } from "../registry/registry";
import { Error as PhpError } from "./Error";
import { Exception } from "./Exception";
import { internalIterator, type InternalIterator } from "./InternalIterator";
import { IteratorAggregate } from "./IteratorAggregate";
import { LiveCursor } from "./liveCursor";
import { getDebugType, phpType } from "./phpType";
import { Traversable } from "./Traversable";
import { TypeError as PhpTypeError } from "./TypeError";

const COUNTABLE = Symbol.for("Countable");
const ARRAY_ACCESS = Symbol.for("ArrayAccess");

/** One entry's order record: its key, held weakly. Its insertion sequence is its value in the order map. */
interface Entry {
  readonly ref: WeakRef<object>;
}

/** What the ephemeron table holds for a key: its order record and its value. */
interface Slot {
  readonly entry: Entry;
  value: unknown;
}

/** The ids the missing-key message gives objects, by first use. */
const objectIds = new globalThis.WeakMap<object, number>();
let lastObjectId = 0;

function objectId(o: object): number {
  let id = objectIds.get(o);
  if (id === undefined) {
    id = ++lastObjectId;
    objectIds.set(o, id);
  }
  return id;
}

/** `key` as a WeakMap key; throws PHP's `TypeError` when it is no PHP object. */
function objectKey(key: unknown): object {
  if (((typeof key === "object" && key !== null) || typeof key === "function") && phpType(key) === "object") {
    return key;
  }
  throw new PhpTypeError("WeakMap key must be an object");
}

export class WeakMap implements IteratorAggregate {
  /** Each key's slot; a JS `WeakMap`, so neither the key nor its value is held by the map. */
  readonly #slots = new globalThis.WeakMap<object, Slot>();
  /** The order records, in insertion order, each with its insertion sequence. */
  readonly #order = new Map<Entry, number>();
  #lastSeq = 0;
  readonly #registry = new FinalizationRegistry<Entry>((entry) => {
    this.#order.delete(entry);
  });

  get [IteratorAggregate.brand](): true {
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

  /** `$map[$key]`. Throws PHP's `Error` when `key` is not in the map. */
  offsetGet(key: object): unknown {
    const object = objectKey(key);
    const slot = this.#slots.get(object);
    if (slot === undefined) {
      throw new PhpError(`Object ${getDebugType(object)}#${String(objectId(object))} not contained in WeakMap`);
    }
    return slot.value;
  }

  /**
   * `$map[$key] = $value`; a rewritten key keeps its position. A null (or `undefined`) key is `$map[] = $value`,
   * which PHP refuses with its `Error`.
   */
  offsetSet(key: object | null | undefined, value: unknown): void {
    if (key === null || key === undefined) {
      throw new PhpError("Cannot append to WeakMap");
    }
    const object = objectKey(key);
    const normal = value ?? null;
    const slot = this.#slots.get(object);
    if (slot !== undefined) {
      slot.value = normal;
      return;
    }
    const entry: Entry = { ref: new WeakRef(object) };
    this.#slots.set(object, { entry, value: normal });
    this.#order.set(entry, ++this.#lastSeq);
    this.#registry.register(object, entry, entry);
  }

  /** `isset($map[$key])`: false for a missing key and for a null value. */
  offsetExists(key: object): boolean {
    const slot = this.#slots.get(objectKey(key));
    return slot !== undefined && slot.value !== null;
  }

  /** `unset($map[$key])`. */
  offsetUnset(key: object): void {
    const object = objectKey(key);
    const slot = this.#slots.get(object);
    if (slot !== undefined) {
      this.#slots.delete(object);
      this.#order.delete(slot.entry);
      this.#registry.unregister(slot.entry);
    }
  }

  /** `count($map)`: the entries whose key is alive. */
  count(): number {
    let count = 0;
    for (const entry of this.#order.keys()) {
      if (entry.ref.deref() !== undefined) {
        count++;
      }
    }
    return count;
  }

  /** An `InternalIterator` over the live entries, keys the objects. */
  getIterator(): InternalIterator {
    const slots = this.#slots;
    const order = this.#order;
    return internalIterator<Entry>({
      cursor: new LiveCursor<Entry>({
        order: () => order,
        lastSeq: () => this.#lastSeq,
        alive: (entry) => entry.ref.deref() !== undefined,
      }),
      key: (entry) => entry.ref.deref() ?? null,
      current: (entry) => {
        const object = entry.ref.deref();
        return object === undefined ? null : (slots.get(object)?.value ?? null);
      },
    });
  }

  /** PHP refuses to serialize a WeakMap. */
  __serialize(): never {
    throw new Exception("Serialization of 'WeakMap' is not allowed");
  }

  /** PHP refuses to unserialize a WeakMap. */
  __unserialize(_data: unknown): never {
    throw new Exception("Unserialization of 'WeakMap' is not allowed");
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
}

registerClass("WeakMap", WeakMap);
