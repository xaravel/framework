import { ArrayAccess } from "./ArrayAccess";
import { arrayReference, assignedArray } from "./arrayReference";
import { copyArrayPointer } from "./arrayPointer";
import { keptArray, toPhpArray } from "./arrayFunctions";
import { toPhpString } from "./casts";
import { Error as PhpError } from "./Error";
import { hasBrand } from "./hasBrand";
import { parseNumeric } from "./numericString";
import { offsetReference, registerOffsetReferenceTarget } from "./offsetReference";
import { nextFreeIndex, normalizeKey } from "./PhpArray";
import { className, getDebugType, phpType } from "./phpType";
import { Ref } from "./Ref";
import { TypeError as PhpTypeError } from "./TypeError";

/** PHP's `&$x[$key]`; a null key denotes `&$x[]` (DIV-9.2/17). */
export function referenceAt(reference: Ref<unknown>, key: unknown): Ref<unknown> {
  if (!(reference instanceof Ref)) throw new TypeError("referenceAt(): pass a Ref holding the value (DIV-9.2)");
  key ??= null;
  let input = reference.value;
  let type = phpType(input);
  if (type === "null" || input === false) {
    reference.value = [];
    input = reference.value;
    type = "array";
  }
  if (type === "array") {
    const array = toPhpArray(input);
    const normalized = key === null ? array.push(null) : normalizeKey(key);
    if (!array.has(normalized)) array.set(normalized, null);
    const next = copyArrayPointer(input as object, keptArray([...array], nextFreeIndex(array)) as object);
    reference.value = next;
    assignedArray(reference, input as object, reference.value as object, normalized, array.get(normalized));
    const { cell, write } = arrayReference(reference, normalized);
    const captured = new Ref<unknown>(null);
    registerOffsetReferenceTarget(captured, cell);
    Object.defineProperty(captured, "value", {
      enumerable: true, configurable: true,
      get: () => cell.value,
      set: write,
    });
    return captured;
  }
  if (type === "object") {
    if (!hasBrand(input as object, ArrayAccess)) throw new PhpError(`Cannot use object of type ${className(input as object)} as array`);
    return offsetReference(input as ArrayAccess, key);
  }
  if (type !== "string") throw new PhpError("Cannot use a scalar value as an array");
  if (key === null) throw new PhpError("[] operator not supported for strings");
  const keyType = phpType(key);
  if (keyType === "array" || keyType === "object" || (keyType === "string" && parseNumeric(toPhpString(key), true)?.int == null)) {
    throw new PhpTypeError(`Cannot access offset of type ${getDebugType(key)} on string`);
  }
  throw new PhpError("Cannot create references to/from string offsets");
}
