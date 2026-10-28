import type { ArrayAccess } from "./ArrayAccess";
import { ArrayObject } from "./ArrayObject";
import { boxOf, boxSet } from "./arrayStorage";
import { getDebugType } from "./phpType";
import { TypeError as PhpTypeError } from "./TypeError";
import { normalizeKey, type PhpArrayKey } from "./PhpArray";
import { Ref } from "./Ref";
import { valueCopy } from "./valueCopy";

/** A real Ref accepted by synchronous PHP by-reference helpers. */
export type OffsetReference = Ref<unknown>;

// Captured cells retain identity across sibling references and SPL wrappers,
// including after a slot is detached by replacement, removal or exchange.
const capturedSlots = new WeakMap<OffsetReference, { value: unknown }>();

/** Internal: register the cell behind a native-array reference. */
export function registerOffsetReferenceTarget(reference: OffsetReference, cell: { value: unknown }): void {
  capturedSlots.set(reference, cell);
}

/** Internal observation target for offsetAssign's user-code string coercion. */
export function offsetReferenceTarget(reference: OffsetReference): { value: unknown } {
  return capturedSlots.get(reference) ?? reference;
}

/**
 * The reference PHP obtains from `$object[$offset]` (DIV-9.17).
 * Builtin ArrayObject::offsetGet, including an inherited implementation, exposes
 * its storage slot. References to the same slot share writes through value;
 * offsetSet/unset detach the old slot, and a later insertion creates a new one.
 * A storage exchange leaves captured references with the original storage.
 * An overriding/userland offsetGet yields a detached value:
 * helper assignments stay local and never invoke offsetSet. No PHP indirect
 * modification notice is emitted (DIV-9.17). Arrays are copied on assignment;
 * object values retain their handles. Consumers decide root/null-key policies;
 * here null denotes the empty-string offset, never replacement of the object.
 */
export function offsetReference(object: ArrayAccess, offset: unknown): OffsetReference {
  offset ??= null;
  if (!(object instanceof ArrayObject) || object.offsetGet !== ArrayObject.prototype.offsetGet) {
    let local = valueCopy(object.offsetGet(offset));
    const reference = new Ref<unknown>(null);
    Object.defineProperty(reference, "value", {
      enumerable: true,
      configurable: true,
      get: () => local,
      set: (value: unknown) => { local = valueCopy(value); },
    });
    return reference;
  }
  const box = boxOf(object);
  let key: PhpArrayKey;
  try {
    key = normalizeKey(offset);
  } catch (error) {
    if (!(error instanceof PhpTypeError)) throw error;
    throw new PhpTypeError(`Cannot access offset of type ${getDebugType(offset)} on ${getDebugType(object)}`);
  }
  // Taking a reference to a missing builtin offset creates a null slot in PHP.
  if (!box.array.has(key)) {
    boxSet(box, key, null);
  }
  let slot = box.references.get(key);
  if (slot === undefined) {
    slot = { value: box.array.get(key) };
    box.references.set(key, slot);
  }
  const captured = slot;
  const reference = new Ref<unknown>(null);
  capturedSlots.set(reference, captured);
  Object.defineProperty(reference, "value", {
    enumerable: true,
    configurable: true,
    get: () => captured.value,
    set: (value: unknown) => {
      const copy = valueCopy(value);
      captured.value = copy;
      if (box.references.get(key) === captured) box.array.set(key, copy);
    },
  });
  return reference;
}
