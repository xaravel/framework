// PHP's keyed yield under DIV-12.18 (ESC-14.1-5, action item epic-14-item-2-runtime-generators-functions). A JS
// generator yields only values, so a ported `yield $k => $v` is `yield keyed(k, v)`: a frozen `KeyedYield` marker the
// runtime's `Generator` reads as that key and value. `yield $v` stays `yield v`, and PHP's automatic integer keys
// apply. `yieldFrom` re-yields each pair it delegates as a delegated marker, which keeps the source's key and never
// moves the automatic key counter; only the runtime makes one. The class is registered under a Xaravel name, as
// `PhpArray` is (AD-10).
import { registerClass } from "../registry/registry";

/** The markers `yieldFrom` yields (a source's own key, which leaves the counter alone). */
const DELEGATED = new WeakSet<KeyedYield>();

/** The runtime's key to the marker's constructor. */
const CREATE: unique symbol = Symbol("KeyedYield");

/** A yielded key and value (DIV-12.18): `yield keyed(k, v)` is PHP's `yield $k => $v`. Frozen. */
export class KeyedYield {
  /** The yielded key; `undefined` reads as null (AD-9). */
  readonly key: unknown;
  /** The yielded value; `undefined` reads as null (AD-9). */
  readonly value: unknown;

  /** Built by `keyed(k, v)`; `new KeyedYield()` throws a `TypeError`. */
  constructor(...args: unknown[]) {
    if (args[0] !== CREATE) {
      throw new TypeError("KeyedYield is built by keyed(key, value)");
    }
    this.key = args[1] ?? null;
    this.value = args[2] ?? null;
    Object.freeze(this);
  }
}

/** PHP's `yield $key => $value` as a JS `yield` operand (DIV-12.18): `yield keyed(key, value)`. */
export function keyed(key: unknown, value: unknown): KeyedYield {
  return new KeyedYield(CREATE, key, value);
}

/** The marker of a pair `yieldFrom` delegates: the source's key, which does not move the counter. Internal. */
export function delegated(key: unknown, value: unknown): KeyedYield {
  const marker = new KeyedYield(CREATE, key, value);
  DELEGATED.add(marker);
  return marker;
}

/** Whether `marker` is one `yieldFrom` delegated. Internal. */
export function isDelegated(marker: KeyedYield): boolean {
  return DELEGATED.has(marker);
}

registerClass("Xaravel\\Runtime\\Php\\KeyedYield", KeyedYield);
