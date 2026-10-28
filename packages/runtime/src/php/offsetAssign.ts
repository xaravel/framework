import { hasBrand } from "./hasBrand";
import { ArrayAccess } from "./ArrayAccess";
import { keptArray, toPhpArray } from "./arrayFunctions";
import { copyArrayPointer } from "./arrayPointer";
import { toInt, toPhpString } from "./casts";
import { Error as PhpError } from "./Error";
import { LONE_SURROGATE, utf8 } from "./mangle";
import { parseNumeric } from "./numericString";
import { nextFreeIndex, normalizeKey, type PhpKeyInput } from "./PhpArray";
import { offsetReferenceTarget } from "./offsetReference";
import { className, getDebugType, phpType } from "./phpType";
import { Ref } from "./Ref";
import { TypeError as PhpTypeError } from "./TypeError";
import { valueCopy } from "./valueCopy";

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function bytes(string: string): Uint8Array {
  if (LONE_SURROGATE.test(string)) throw new TypeError("offsetAssign(): the string holds a lone surrogate, which has no UTF-8 form");
  return utf8.encode(string);
}

function decode(value: Uint8Array): string {
  try { return decoder.decode(value); }
  catch { throw new TypeError("offsetAssign(): the result splits a UTF-8 sequence, which JS cannot hold"); }
}

/** Observe writes only during RHS coercion; nested observers forward through each other. */
function stringReplacement(reference: Ref<unknown>, value: unknown): { text: string; written: boolean } {
  // Only object conversion can invoke user code. Primitive writes need no
  // descriptor interception, including when an ordinary writable Ref is sealed.
  if (phpType(value) !== "object") return { text: toPhpString(value), written: false };
  const target = offsetReferenceTarget(reference);
  const descriptor = Object.getOwnPropertyDescriptor(target, "value")!;
  let current: unknown = descriptor.value;
  let written = false;
  Object.defineProperty(target, "value", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: () => descriptor.get ? descriptor.get.call(target) : current,
    set: (next: unknown) => {
      written = true;
      if (descriptor.set) descriptor.set.call(target, next);
      else if (descriptor.writable) current = next;
      else throw new TypeError("Cannot assign to read only property 'value'");
    },
  });
  try { return { text: toPhpString(value), written }; }
  finally {
    Object.defineProperty(target, "value", "value" in descriptor ? { ...descriptor, value: current } : descriptor);
  }
}

/**
 * PHP's `$x[$key] = $value` over a Ref; null key means `$x[] = $value`.
 * Arrays separate and copy values; ArrayAccess keeps its handle and receives
 * copied arguments. Null/false become arrays before key validation. The result
 * is the assigned value, except strings return the written first byte (null for
 * an ignored negative offset or a receiver write during RHS coercion). Notices/deprecations are omitted (DIV-9.17).
 * Unrepresentable byte strings throw a JS TypeError under ESC-9.7-1 §2.
 */
export function offsetAssign(reference: Ref<unknown>, key: unknown, value: unknown): unknown {
  if (!(reference instanceof Ref)) throw new TypeError("offsetAssign(): pass a Ref holding the value (DIV-9.2)");
  key ??= null;
  const assigned = valueCopy(value);
  let input = reference.value;
  let type = phpType(input);
  if (type === "null" || input === false) {
    reference.value = [];
    input = reference.value;
    type = "array";
  }
  if (type === "array") {
    const normalized = key === null ? null : normalizeKey(key);
    const array = toPhpArray(input);
    if (normalized === null) array.push(assigned);
    else array.set(normalized as PhpKeyInput, assigned);
    reference.value = copyArrayPointer(input as object, keptArray([...array], nextFreeIndex(array)) as object);
    return valueCopy(assigned);
  }
  if (type === "object") {
    if (!hasBrand(input as object, ArrayAccess)) throw new PhpError(`Cannot use object of type ${className(input as object)} as array`);
    (input as ArrayAccess).offsetSet(valueCopy(key), valueCopy(assigned));
    return valueCopy(value);
  }
  if (type !== "string") throw new PhpError("Cannot use a scalar value as an array");
  if (key === null) throw new PhpError("[] operator not supported for strings");
  const keyType = phpType(key);
  if (keyType === "array" || keyType === "object" || (keyType === "string" && parseNumeric(toPhpString(key), true)?.int == null)) {
    throw new PhpTypeError(`Cannot access offset of type ${getDebugType(key)} on string`);
  }
  let offset = BigInt(toInt(key));
  const original = bytes(toPhpString(input));
  if (offset < 0n) offset += BigInt(original.length);
  // PHP ignores an excessively negative offset before even coercing the RHS.
  if (offset < 0n) return null;
  const converted = stringReplacement(reference, assigned);
  if (converted.written) return null;
  const replacement = bytes(converted.text);
  if (replacement.length === 0) throw new PhpError("Cannot assign an empty string to a string offset");
  const first = decode(replacement.subarray(0, 1));
  const result = new Uint8Array(Math.max(original.length, Number(offset) + 1));
  result.fill(0x20);
  result.set(original);
  result[Number(offset)] = replacement[0]!;
  reference.value = decode(result);
  return first;
}
