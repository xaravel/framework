// PHP's `interface_exists` and `enum_exists` (ESC-13.1-7, ESC-13.1-8), named as PORTING.md names PHP functions. Both
// read only what is loaded, as `resolveClass` does (AD-10.4): there is no `$autoload` parameter and nothing is imported.
// An interface is a contract token recorded under the name (`registerContractToken`); an enum is a registered class
// whose static side has a `cases` function (AD-26).
//
// And PHP's `class_exists` (ESC-15.2-1 part d; action item epic-15-item-1-runtime-phpdotenv-builtins), named and
// coerced as PHP's own: true for a registered class or enum, false for a contract token (an interface), a trait and
// a name nothing holds. A trait is a registered class too (AD-26); it is told apart once `mixin` has composed it,
// which marks it with the non-enumerable `Symbol.for('xaravel.traits.trait')`.
import { isContractToken, lookUpName } from "../registry/registry";
import { boolParameter, stringParameter } from "./phpArguments";
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

/** The mark `mixin` (`traits/mixin.ts`) sets on each class it composes as a trait. */
const TRAIT = Symbol.for("xaravel.traits.trait");

/**
 * PHP's `class_exists($class, $autoload = true)`: whether `class` names a registered class, an enum included as PHP
 * counts one (case-insensitive, one leading `\` ignored, a test class up the active frame chain first, as
 * `lookUpName` reads), and not a contract token (an interface) or a trait `mixin` has composed. Nothing is ever
 * autoloaded (AD-10.4), so `$autoload` is read and ignored. Coerced as PHP's `string` and `bool` parameters
 * (`class_exists(5)` is false); anything else throws PHP's `TypeError`.
 */
export function class_exists(klass: unknown, autoload: unknown = true): boolean {
  const name = stringParameter("class_exists", 1, "class", klass);
  boolParameter("class_exists", 2, "autoload", autoload);
  const found = lookUpName(name);
  return typeof found === "function" && !isContractToken(found) && !Object.hasOwn(found, TRAIT);
}
