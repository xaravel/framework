// PHP's `property_exists` and `method_exists` (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1), under
// their PHP names, ports of PHP 8.5.11's `Zend/zend_builtin_functions.c` in coercive typing mode, over the AD-9 value
// model. `$object_or_class` is an object, a class constructor or a contract token (a class-string, AD-9), or a
// class-string the Registry resolves (`lookUpName`); a string naming nothing gives false. What PHP declares maps to JS
// as the rest of the runtime reads it:
//
// - a property is an own string-keyed property of an object; a static property an enumerable own data property, or
//   an accessor, of the class or a parent (a static method is not enumerable); a declared property one the class's PHP
//   property table lists (`Symbol.for('xaravel.php.properties')`, ESC-9.7-1); an accessor on the prototype chain is a
//   property (PHP 8.4's hooked property);
// - a method is what `findMethod` finds (DIV-3.2, DIV-9.14: the prototype chain, then the static chain), matched
//   exactly and then case-insensitively, as PHP method names are; `__toString` is also the AD-26 `toString()` port;
//   a Closure has PHP's `Closure` methods; a contract token has its recorded methods (its built-in parents' too) and its parents'.
//
// Everything is synchronous.
import { isContractToken, lookUpName } from "../registry/registry";
import { Closure, isClassConstructor, isClosureValue } from "./Closure";
import { propertyTable } from "./mangle";
import { stringParameter } from "./phpArguments";
import { phpType, phpTypeName } from "./phpType";
import { classChain, findMethod } from "./reflectionTargets";
import { stringPort } from "./scalarString";
import { phpValueOf } from "./throwableArguments";
import { CLOSURE_METHODS } from "./typeTests";
import { TypeError as PhpTypeError } from "./TypeError";

const CONTRACT_BUILTINS = Symbol.for("xaravel.contract.builtins");
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** What `$object_or_class` names: an object of a class, a Closure, a class, a contract token, or nothing (a miss). */
type Subject =
  | { readonly kind: "object"; readonly object: object; readonly klass: object | null }
  | { readonly kind: "closure" }
  | { readonly kind: "class"; readonly klass: object }
  | { readonly kind: "token"; readonly token: object }
  | null;

/** The subject of `fn`'s `$object_or_class`; throws PHP's `TypeError` for a value that is no object or string. */
function subjectOf(fn: string, value: unknown): Subject {
  const subject = value ?? null;
  if (typeof subject === "string" || isContractToken(subject) || isClassConstructor(subject)) {
    const target = typeof subject === "string" ? lookUpName(subject) : subject;
    if (target === null) {
      return null;
    }
    if (isContractToken(target)) {
      return { kind: "token", token: target };
    }
    return target === Closure ? { kind: "closure" } : { kind: "class", klass: target };
  }
  if (isClosureValue(subject)) {
    return { kind: "closure" };
  }
  if (typeof subject === "object" && subject !== null && phpType(subject) === "object") {
    const klass: unknown = (Object.getPrototypeOf(subject) as { constructor?: unknown } | null)?.constructor;
    return { kind: "object", object: subject, klass: typeof klass === "function" ? klass : null };
  }
  throw new PhpTypeError(`${fn}(): Argument #1 ($object_or_class) must be of type object|string, ${phpTypeName(phpValueOf(subject))} given`);
}

/** Whether `holder` has an own accessor (getter or setter) named `name`. */
function hasAccessor(holder: object, name: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(holder, name);
  return descriptor !== undefined && ("get" in descriptor || "set" in descriptor);
}

/** Whether the class `klass` declares the property `name`: a static or declared property, or an accessor. */
function classHasProperty(klass: object, name: string): boolean {
  if (propertyTable(klass)?.some((slot) => slot.name === name) === true) {
    return true;
  }
  for (const holder of [klass, ...classChain(klass)]) {
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    if (descriptor !== undefined && ("get" in descriptor || "set" in descriptor || descriptor.enumerable === true)) {
      return true;
    }
  }
  for (let holder: unknown = (klass as { prototype?: unknown }).prototype; typeof holder === "object" && holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
    if (hasAccessor(holder, name)) {
      return true;
    }
  }
  return false;
}

/**
 * PHP's `property_exists($object_or_class, $property)`: whether the object or class has the property `property`
 * (case-sensitive): for an object, an own string-keyed property; for an object or a class, a static property on its
 * class chain, a property its PHP property table declares, or an accessor on its prototype chain (see the header). A
 * Closure and a contract token have none, and a class-string naming nothing gives false. Throws PHP's `TypeError` for a
 * `property` that is no string and an `object_or_class` that is no object or string.
 */
export function property_exists(object_or_class: unknown, property: unknown): boolean {
  const name = stringParameter("property_exists", 2, "property", property);
  const subject = subjectOf("property_exists", object_or_class);
  switch (subject?.kind) {
    case "object":
      return Object.hasOwn(subject.object, name) || (subject.klass !== null && classHasProperty(subject.klass, name));
    case "class":
      return classHasProperty(subject.klass, name);
    default:
      return false;
  }
}

/**
 * The method names of `token` and of its parents, lower-cased: its members and its built-in parents' methods
 * (`Symbol.for('xaravel.contract.builtins')`, `getIterator` for `IteratorAggregate`).
 */
function tokenMethods(token: object, into: Set<string> = new Set()): Set<string> {
  for (const key of [CONTRACT_METHODS, CONTRACT_BUILTINS]) {
    const methods: unknown = (token as Record<symbol, unknown>)[key];
    if (Array.isArray(methods)) {
      for (const method of methods as unknown[]) {
        if (typeof method === "string") {
          into.add(method.toLowerCase());
        }
      }
    }
  }
  const parents: unknown = (token as Record<symbol, unknown>)[CONTRACT_PARENTS];
  if (Array.isArray(parents)) {
    for (const parent of parents as unknown[]) {
      if (isContractToken(parent)) {
        tokenMethods(parent, into);
      }
    }
  }
  return into;
}

/** Whether `holder` has an own function-valued data property whose name, lower-cased, is `lower` (never `constructor`). */
function hasMethodNamed(holder: object, lower: string): boolean {
  return Object.getOwnPropertyNames(holder).some((own) => {
    if (own === "constructor" || own.toLowerCase() !== lower) {
      return false;
    }
    return typeof Object.getOwnPropertyDescriptor(holder, own)?.value === "function";
  });
}

/** Whether the class `klass` has the method `name`, matched exactly, then case-insensitively, then as `__toString`. */
function classHasMethod(klass: object, name: string): boolean {
  if (findMethod(klass, name) !== null) {
    return true;
  }
  const lower = name.toLowerCase();
  const prototype: unknown = (klass as { prototype?: unknown }).prototype;
  for (let holder: unknown = prototype; typeof holder === "object" && holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
    if (hasMethodNamed(holder, lower)) {
      return true;
    }
  }
  for (const holder of [klass, ...classChain(klass)]) {
    if (hasMethodNamed(holder, lower)) {
      return true;
    }
  }
  return lower === "__tostring" && typeof prototype === "object" && prototype !== null && stringPort(prototype) !== null;
}

/**
 * PHP's `method_exists($object_or_class, $method)`: whether the object's class or the class has the method `method`,
 * of any visibility, PHP's names being case-insensitive: a method `findMethod` finds (the prototype chain, then the
 * static chain), `__toString` for a class with a `toString()` port, PHP's `Closure` methods for a Closure (and for the
 * class-string `Closure`), and a contract token's recorded methods and its parents'. `__call` does not make a missing
 * method exist, as in PHP. A class-string naming nothing gives false. Throws PHP's `TypeError` for a `method` that is
 * no string and an `object_or_class` that is no object or string.
 */
export function method_exists(object_or_class: unknown, method: unknown): boolean {
  const name = stringParameter("method_exists", 2, "method", method);
  const subject = subjectOf("method_exists", object_or_class);
  switch (subject?.kind) {
    case "closure":
      return CLOSURE_METHODS.has(name.toLowerCase());
    case "token":
      return tokenMethods(subject.token).has(name.toLowerCase());
    case "class":
      return classHasMethod(subject.klass, name);
    case "object":
      return subject.klass !== null && classHasMethod(subject.klass, name);
    default:
      return false;
  }
}
