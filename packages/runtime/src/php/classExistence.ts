// PHP's `interface_exists` and `enum_exists` (ESC-13.1-7, ESC-13.1-8), named as PORTING.md names PHP functions. Both
// read only what is loaded, as `resolveClass` does (AD-10.4): there is no `$autoload` parameter and nothing is imported.
// An interface is a contract token recorded under the name (`registerContractToken`); an enum is a registered class
// whose static side has a `cases` function (AD-26).
import { isContractToken, lookUpName } from "../registry/registry";
import { phpTypeName } from "./phpType";
import { TypeError as PhpTypeError } from "./TypeError";

/** Whether `klass` is an AD-26 enum class: a class whose static side has a `cases` function. Internal. */
export function isEnumClass(klass: unknown): boolean {
  return typeof klass === "function" && typeof (klass as { cases?: unknown }).cases === "function";
}

/** Whether `value` is a case of an AD-26 enum (PHP's `ZEND_ACC_ENUM` class): an object whose class is one. Internal. */
export function isEnumCase(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return typeof prototype === "object" && prototype !== null && isEnumClass(Reflect.get(prototype, "constructor"));
}

/** Whether `klass` is a backed AD-26 enum class: an enum class that declares `static backingType` `'string'` or `'int'`. Internal. */
export function isBackedEnumClass(klass: unknown): boolean {
  if (!isEnumClass(klass)) {
    return false;
  }
  const declared: unknown = (klass as { backingType?: unknown }).backingType;
  return declared === "string" || declared === "int";
}

/**
 * PHP's `interface_exists($interface)`: whether `name` names a recorded contract token and no registered class
 * (case-insensitive, a leading `\` ignored). Throws PHP's `TypeError` for a non-string.
 */
export function interfaceExists(name: string): boolean {
  if (typeof name !== "string") {
    throw new PhpTypeError(`interface_exists(): Argument #1 ($interface) must be of type string, ${phpTypeName(name)} given`);
  }
  return isContractToken(lookUpName(name));
}

/**
 * PHP's `enum_exists($enum)`: whether `name` names a registered enum class (AD-26: its static side has a `cases`
 * function). Throws PHP's `TypeError` for a non-string.
 */
export function enumExists(name: string): boolean {
  if (typeof name !== "string") {
    throw new PhpTypeError(`enum_exists(): Argument #1 ($enum) must be of type string, ${phpTypeName(name)} given`);
  }
  return isEnumClass(lookUpName(name));
}
