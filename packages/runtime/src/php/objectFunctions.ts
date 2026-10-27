// PHP's `property_exists` and `method_exists` (action item epic-14-item-5-runtime-array-functions, ESC-14.2-1), under
// their PHP names, ports of PHP 8.5.11's `Zend/zend_builtin_functions.c` in coercive typing mode, over the AD-9 value
// model; and `callMethod`, PHP's dynamic method call `$object->$name(...$args)` (action item
// epic-14-item-7-runtime-match-error-dynamic-call, ESC-14.2-7), a port of `Zend/zend_vm_def.h` `ZEND_INIT_METHOD_CALL`
// with `zend_std_get_method` and `zend_undefined_method`, which resolves a method as `method_exists` does (one
// resolver, `resolveMethod`) and falls back to the class's `__call`. `$object_or_class` is an object, a class
// constructor or a contract token (a class-string, AD-9), or a class-string the Registry resolves (`lookUpName`); a
// string naming nothing gives false. What PHP declares maps to JS as the rest of the runtime reads it:
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
import { Error as PhpError } from "./Error";
import { propertyTable } from "./mangle";
import { normalizeNull } from "./normalizeNull";
import { stringParameter } from "./phpArguments";
import { getDebugType, phpType, phpTypeName } from "./phpType";
import { classChain } from "./reflectionTargets";
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

/** A method the resolver found: the function, and whether it is static (on the class's static chain). */
interface ResolvedMethod {
  readonly fn: (...args: never[]) => unknown;
  readonly isStatic: boolean;
}

/** `holder`'s own function-valued data property whose name, lower-cased, is `lower` (never `constructor`), or null. */
function methodNamed(holder: object, lower: string): ((...args: never[]) => unknown) | null {
  for (const own of Object.getOwnPropertyNames(holder)) {
    if (own === "constructor" || own.toLowerCase() !== lower) {
      continue;
    }
    const value: unknown = Object.getOwnPropertyDescriptor(holder, own)?.value;
    if (typeof value === "function") {
      return value as (...args: never[]) => unknown;
    }
  }
  return null;
}

/** `holder`'s own method `name`, matched exactly and then case-insensitively (`lower`), or null. */
function ownMethod(holder: object, name: string, lower: string, isStatic: boolean): ((...args: never[]) => unknown) | null {
  if (isStatic || name !== "constructor") {
    const exact: unknown = Object.getOwnPropertyDescriptor(holder, name)?.value;
    if (typeof exact === "function") {
      return exact as (...args: never[]) => unknown;
    }
  }
  return methodNamed(holder, lower);
}

/**
 * The method `name` of the class `klass`, as `method_exists` and `callMethod` resolve it (`findMethod`'s chains):
 * each holder of the prototype chain, nearest first, then each of the static chain, matched on each holder exactly and
 * then case-insensitively, as PHP's case-insensitive names let a subclass's `FOO` override a parent's `foo`; then
 * `__toString` as the `toString()` port. Null when none is found.
 */
export function resolveMethod(klass: object, name: string): ResolvedMethod | null {
  const lower = name.toLowerCase();
  const prototype: unknown = (klass as { prototype?: unknown }).prototype;
  for (let holder: unknown = prototype; typeof holder === "object" && holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
    const fn = ownMethod(holder, name, lower, false);
    if (fn !== null) {
      return { fn, isStatic: false };
    }
  }
  for (const holder of [klass, ...classChain(klass)]) {
    const fn = ownMethod(holder, name, lower, true);
    if (fn !== null) {
      return { fn, isStatic: true };
    }
  }
  if (lower === "__tostring" && typeof prototype === "object" && prototype !== null) {
    const port = stringPort(prototype);
    if (port !== null) {
      return { fn: port, isStatic: false };
    }
  }
  return null;
}

/** Whether the class `klass` has the method `name`, matched exactly, then case-insensitively, then as `__toString`. */
function classHasMethod(klass: object, name: string): boolean {
  return resolveMethod(klass, name) !== null;
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

/** PHP's `Closure` methods other than `__invoke`, by lower-cased name, which `callMethod` does not port. */
const UNPORTED_CLOSURE_METHODS: ReadonlyMap<string, string> = new Map([
  ["bind", "bind"],
  ["bindto", "bindTo"],
  ["call", "call"],
  ["fromcallable", "fromCallable"],
  ["getcurrent", "getCurrent"],
]);

/**
 * PHP's `$object->$name(...$args)` (ESC-14.2-7), checked in PHP's order (`ZEND_INIT_METHOD_CALL`):
 *
 * 1. a `name` that is no JS string (a `__toString` object included) throws PHP's `Error` `Method name must be a string`;
 * 2. an `object` that is no PHP object throws PHP's `Error` `Call to a member function <name>() on <type>`, the type
 *    `null`, `true`, `false`, `int`, `float`, `string` or `array` (a class constructor or a contract token is a
 *    class-string, so `string`); a symbol or a `bigint` outside int64, no PHP value, throws the runtime's JS
 *    `TypeError`, as `phpType` does;
 * 3. a Closure's `__invoke`, in any case, calls the function with `args`; `bind`, `bindTo`, `call`, `fromCallable` and
 *    `getCurrent` are not ported and throw a JS `TypeError` naming the method;
 * 4. otherwise the method `method_exists` finds on the object's class (each holder nearest first, exactly and then
 *    case-insensitively, the prototype chain before the static chain, then `__toString` as the `toString()` port) is
 *    called, a prototype method with `this` the object, a static one with `this` the object's class (PHP's
 *    `static::`);
 * 5. failing that, the class's instance `__call`, found the same way, is called as `__call(name, args)`, `name` in the
 *    caller's case and `args` a JS array (a static `__call` and `__callStatic` take no part);
 * 6. failing that, it throws PHP's `Error` `Call to undefined method <get_debug_type(object)>::<name>()`.
 *
 * The result of the call is returned, `undefined` read as `null` (AD-9). PHP's visibility checks are not ported: a JS
 * method has none.
 */
export function callMethod(object: unknown, name: unknown, ...args: unknown[]): unknown {
  if (typeof name !== "string") {
    throw new PhpError("Method name must be a string");
  }
  const value = object ?? null;
  if (isContractToken(value) || isClassConstructor(value)) {
    throw new PhpError(`Call to a member function ${name}() on string`);
  }
  // `phpType` throws the runtime's JS `TypeError` for a symbol or a `bigint` outside int64, which are no PHP values.
  if (phpType(value) !== "object") {
    throw new PhpError(`Call to a member function ${name}() on ${phpTypeName(value)}`);
  }
  const target = value as object;
  if (isClosureValue(target)) {
    const lower = name.toLowerCase();
    if (lower === "__invoke") {
      return normalizeNull((target as (...values: unknown[]) => unknown)(...args));
    }
    const unported = UNPORTED_CLOSURE_METHODS.get(lower);
    if (unported !== undefined) {
      throw new TypeError(`callMethod(): Closure::${unported}() is not ported; call the closure directly`);
    }
    throw new PhpError(`Call to undefined method Closure::${name}()`);
  }
  const klass: unknown = (Object.getPrototypeOf(target) as { constructor?: unknown } | null)?.constructor;
  if (typeof klass === "function") {
    const method = resolveMethod(klass, name);
    if (method !== null) {
      return normalizeNull(Reflect.apply(method.fn, method.isStatic ? klass : target, args));
    }
    const magic = resolveMethod(klass, "__call");
    if (magic !== null && !magic.isStatic) {
      return normalizeNull(Reflect.apply(magic.fn, target, [name, args]));
    }
  }
  throw new PhpError(`Call to undefined method ${getDebugType(target)}::${name}()`);
}
