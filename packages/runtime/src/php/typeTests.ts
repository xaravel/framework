// PHP's type tests (action item epic-14-item-3-runtime-type-tests-functions, ESC-14.1-9; `is_null` action item
// epic-14-item-6-runtime-sort-string-functions, ESC-14.2-4; `is_bool` action item
// epic-14-item-8-runtime-round-string-array-pointer, ESC-14.3-1; `is_int` action item
// epic-14-item-9-runtime-set-functions-callable-names, ESC-14.4-1), under their PHP names, ports
// of PHP 8.5.11's `ext/standard/type.c`, `Zend/zend_builtin_functions.c` (`is_a_impl`) and `Zend/zend_API.c`
// (`zend_is_callable_at_frame`, `zend_get_callable_name_ex`) in coercive typing mode, over the AD-9 value model:
//
// - `phpType` decides arrays and objects, except that a contract token is its class-string (AD-9): `is_string(token)`
//   is true and `is_array(token)` false;
// - a class constructor (`isClassConstructor`: its own Registry FQCN key, or `class …` source) stands for its
//   class-string where a class is named (`is_a`, `is_callable`), as Reflector treats a registered class; it is no
//   Closure, and `is_a(ctor, name)` needs `$allowString`;
// - any other function is a PHP `Closure`.
//
// `is_callable` follows DIV-9.13 and DIV-9.14 as ESC-14.4-2 amends them: a string is callable as a global function name
// the runtime exports (`phpFunction`, the registry of `phpFunctions.ts`) or as a `'Class::method'` the class rules
// accept (any string under `$syntaxOnly`), and every method reachable by name is public. Everything is synchronous.
import { isContractToken, lookUpName } from "../registry/registry";
import { BackedEnum } from "./BackedEnum";
import { arrayEntries, toPhpString } from "./casts";
import { isBackedEnumClass, isEnumClass } from "./classExistence";
import { isClassConstructor, isClosureValue } from "./Closure";
import { hasBrand } from "./hasBrand";
import { boolParameter, stringParameter } from "./phpArguments";
import { phpFunction } from "./phpFunctions";
import type { PhpArrayKey } from "./PhpArray";
import { className, phpType } from "./phpType";
import { Ref } from "./Ref";
import { findMethod, registeredName } from "./reflectionTargets";
import { isTraversable } from "./traverse";
import { UnitEnum } from "./UnitEnum";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** A class or a contract token, as a class name resolves. */
type ClassLike = abstract new (...args: never[]) => unknown;

/** Whether `value` is a PHP object: a non-array object, or a Closure (a class constructor is a class-string). */
function isPhpObject(value: unknown): value is object {
  if (typeof value === "function") {
    return !isClassConstructor(value);
  }
  return typeof value === "object" && value !== null && !isContractToken(value) && phpType(value) === "object";
}

/** Whether `value` is a PHP string: a string, a contract token or a class constructor (their class-strings). */
function isStringLike(value: unknown): boolean {
  return typeof value === "string" || isContractToken(value) || isClassConstructor(value);
}

/**
 * The PHP string a string-like value stands for: the string, a token's FQCN, a class's Registry FQCN or JS name.
 * Internal: `unhandledMatch` reads a class-string subject through it too.
 */
export function stringOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isContractToken(value)) {
    return (value as Record<symbol, string>)[CLASS_FQCN] as string;
  }
  const name: unknown = (value as { name?: unknown }).name;
  return registeredName(value) ?? (typeof name === "string" ? name : "");
}

/** The class or token a string-like value names (a token or a class constructor as it is), or null on a miss. */
function classOf(value: unknown): ClassLike | object | null {
  if (typeof value === "string") {
    return lookUpName(value);
  }
  return value as ClassLike | object;
}

/** The class of the object `value` (its prototype's `constructor`), or null when it has none. */
function objectClass(value: object): ClassLike | null {
  if (typeof value === "function") {
    return null;
  }
  const klass: unknown = (Object.getPrototypeOf(value) as { constructor?: unknown } | null)?.constructor;
  return typeof klass === "function" ? (klass as ClassLike) : null;
}

/** PHP's `is_array($value)`: an `Array`, a plain object or a `PhpArray` (AD-9); a contract token is a string. */
export function is_array(value: unknown): boolean {
  return !isContractToken(value) && phpType(value) === "array";
}

/** PHP's `is_object($value)`: any other object, a function included (`phpType`); a contract token is a string. */
export function is_object(value: unknown): boolean {
  return !isContractToken(value) && phpType(value) === "object";
}

/** PHP's `is_null($value)`: true for `null` and for `undefined`, which reads as null (AD-9); false for anything else. */
export function is_null(value: unknown): boolean {
  return value === null || value === undefined;
}

/** PHP's `is_bool($value)`: true for `true` and `false`, false for anything else. */
export function is_bool(value: unknown): boolean {
  return typeof value === "boolean";
}

/**
 * PHP's `is_int($value)`: true for a PHP int (`phpType`: a number that is a safe integer and not `-0` nor marked
 * `float()`, or a bigint), false for anything else, a float, a numeric string and a bool included.
 */
export function is_int(value: unknown): boolean {
  return phpType(value) === "int";
}

/** PHP's `is_string($value)`: a string, or a contract token, which is its class-string (AD-9). */
export function is_string(value: unknown): boolean {
  return typeof value === "string" || isContractToken(value);
}

/** PHP's `is_iterable($value)`: an array, or a Traversable object (a bare JS generator object included). */
export function is_iterable(value: unknown): boolean {
  return is_array(value) || (!isClassConstructor(value) && isTraversable(value));
}

/** The names a contract token answers: its own FQCN and its parents', lower-cased, a leading `\` dropped. */
function tokenNames(token: object, into: Set<string> = new Set()): Set<string> {
  into.add(normalName((token as Record<symbol, string>)[CLASS_FQCN] as string));
  const parents: unknown = (token as Record<symbol, unknown>)[CONTRACT_PARENTS];
  if (Array.isArray(parents)) {
    for (const parent of parents as unknown[]) {
      if (isContractToken(parent)) {
        tokenNames(parent, into);
      }
    }
  }
  return into;
}

/** A PHP class name as the lookup compares it: lower-cased, a leading `\` dropped. */
function normalName(name: string): string {
  return (name.startsWith("\\") ? name.slice(1) : name).toLowerCase();
}

/** `instanceof_function(instance, target)` for the class or token a class-string names. */
function classIsA(instance: ClassLike | object, target: ClassLike | object): boolean {
  if (isContractToken(instance)) {
    return isContractToken(target) && tokenNames(instance).has(normalName((target as Record<symbol, string>)[CLASS_FQCN] as string));
  }
  if (typeof instance !== "function") {
    return false;
  }
  if (isContractToken(target)) {
    if (target === UnitEnum) {
      return isEnumClass(instance);
    }
    if (target === BackedEnum) {
      return isBackedEnumClass(instance);
    }
    return hasBrand(instance, target);
  }
  if (typeof target !== "function") {
    return false;
  }
  const prototype: unknown = (target as { prototype?: unknown }).prototype;
  const instancePrototype: unknown = (instance as { prototype?: unknown }).prototype;
  return instance === target || (typeof prototype === "object" && prototype !== null && typeof instancePrototype === "object" && instancePrototype !== null && Object.prototype.isPrototypeOf.call(prototype, instancePrototype));
}

/**
 * PHP's `is_a($object_or_class, $class, $allow_string = false)`: whether `object_or_class` is an object of `class`
 * (`instanceof`, which reads a token's instance test or brand), or, with `allow_string`, a class-string (a contract token
 * or a class constructor included) naming `class`, a subclass of it, or a class or token implementing it. `class` is
 * matched case-insensitively, a leading `\` ignored. A name nothing holds, and any other value, give false. Throws PHP's
 * `TypeError` for a `class` that is no string and an `allow_string` that is no bool.
 */
export function is_a(object_or_class: unknown, class_: unknown, allow_string: unknown = false): boolean {
  const name = stringParameter("is_a", 2, "class", class_);
  const allowString = boolParameter("is_a", 3, "allow_string", allow_string);
  const target = lookUpName(name);
  if (allowString && isStringLike(object_or_class)) {
    const instance = classOf(object_or_class);
    return instance !== null && target !== null && classIsA(instance, target);
  }
  if (!isPhpObject(object_or_class) || target === null) {
    return false;
  }
  if (isContractToken(target) || typeof target === "function") {
    return object_or_class instanceof (target as ClassLike);
  }
  return false;
}

/** The class-string rule: `method` is a static method of `klass`, or it has none of that name and has `__callStatic`. */
function staticCallable(klass: ClassLike | object, method: string): boolean {
  const found = findMethod(klass, method);
  if (found !== null) {
    return found.isStatic;
  }
  return findMethod(klass, "__callStatic") !== null;
}

/** PHP's `Closure` methods, lower-cased (PHP method names are case-insensitive). Internal: `method_exists` reads them too. */
export const CLOSURE_METHODS: ReadonlySet<string> = new Set(["__invoke", "bind", "bindto", "call", "fromcallable"]);

/**
 * The object rule: `method` is a method of `object`'s class (either chain), or the class has `__call`. A Closure's
 * methods are PHP's `Closure` methods, named in any case.
 */
function objectCallable(object: object, method: string): boolean {
  if (isClosureValue(object)) {
    return CLOSURE_METHODS.has(method.toLowerCase());
  }
  const klass = objectClass(object);
  if (klass === null) {
    return false;
  }
  return findMethod(klass, method) !== null || findMethod(klass, "__call") !== null;
}

/** Entries `0` and `1` of a PHP array of exactly two entries, or null. */
function callablePair(value: object): [unknown, unknown] | null {
  const entries = arrayEntries(value);
  if (entries.length !== 2) {
    return null;
  }
  const at = (key: PhpArrayKey): [unknown] | null => {
    const entry = entries.find(([k]) => k === key);
    return entry === undefined ? null : [entry[1]];
  };
  const first = at(0);
  const second = at(1);
  return first === null || second === null ? null : [first[0], second[0]];
}

/** `zend_is_callable_at_frame` with no calling scope (DIV-9.13, DIV-9.14). */
function isCallable(value: unknown, syntaxOnly: boolean): boolean {
  if (isStringLike(value)) {
    if (syntaxOnly) {
      return true;
    }
    const string = stringOf(value);
    const separator = string.indexOf("::");
    if (separator < 0) {
      // A global function name: the runtime's export of that name (ESC-14.4-2).
      return phpFunction(string) !== null;
    }
    if (separator === 0) {
      return false;
    }
    const klass = lookUpName(string.slice(0, separator));
    return klass !== null && staticCallable(klass, string.slice(separator + 2));
  }
  if (isPhpObject(value)) {
    return isClosureValue(value) || typeof (value as { __invoke?: unknown }).__invoke === "function";
  }
  if (!is_array(value)) {
    return false;
  }
  const pair = callablePair(value as object);
  if (pair === null) {
    return false;
  }
  const [target, method] = pair;
  if ((!isStringLike(target) && !isPhpObject(target)) || typeof method !== "string") {
    return false;
  }
  if (syntaxOnly) {
    return true;
  }
  if (isStringLike(target)) {
    const klass = classOf(target);
    return klass !== null && staticCallable(klass, method);
  }
  return objectCallable(target as object, method);
}

/** `zend_get_callable_name_ex`, except that a Closure is `Closure::__invoke` (PHP 8.5 names it by file and line). */
function callableName(value: unknown): string {
  if (isStringLike(value)) {
    return stringOf(value);
  }
  if (isPhpObject(value)) {
    return isClosureValue(value) ? "Closure::__invoke" : `${className(value)}::__invoke`;
  }
  if (is_array(value)) {
    const pair = callablePair(value as object);
    if (pair === null || typeof pair[1] !== "string") {
      return "Array";
    }
    if (isStringLike(pair[0])) {
      return `${stringOf(pair[0])}::${pair[1]}`;
    }
    return isPhpObject(pair[0]) ? `${className(pair[0])}::${pair[1]}` : "Array";
  }
  return toPhpString(value);
}

/**
 * PHP's `is_callable($value, $syntax_only = false, &$callable_name = null)`, under DIV-9.13 and DIV-9.14: a Closure
 * or an object with a function `__invoke` is callable; a callable array `[object, method]` when the method is on the
 * object's class (either chain) or the class has `__call`; `[class-string, method]` (a class constructor or a contract
 * token included) and a `'Class::method'` string when the method is static, or missing with a `__callStatic`; a
 * string with no `::` when it names, in any case and after one leading `\`, a PHP global function the runtime
 * exports (`phpFunction`, ESC-14.4-2). Any other string, a PHP function the runtime does not export included, is
 * not. Under `syntax_only`, any string, and any two-entry array of a class-string or an object and a string, is.
 * `callable_name`, a `Ref`, receives PHP's name (`<FQCN>::method`, `<FQCN>::__invoke`, `Closure::__invoke`, the
 * string itself, `Array`). Throws PHP's `TypeError` for a
 * `syntax_only` that is no bool, and a JS `TypeError` for a `callable_name` that is no `Ref`.
 */
export function is_callable(value: unknown, syntax_only: unknown = false, callable_name: Ref<unknown> | null = null): boolean {
  const syntaxOnly = boolParameter("is_callable", 2, "syntax_only", syntax_only);
  const subject = value ?? null;
  const result = isCallable(subject, syntaxOnly);
  if (callable_name !== null && callable_name !== undefined) {
    if (!(callable_name instanceof Ref)) {
      throw new TypeError("is_callable(): Argument #3 ($callable_name) is by reference; pass a Ref");
    }
    callable_name.value = callableName(subject);
  }
  return result;
}
