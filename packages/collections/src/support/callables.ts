// Calling a PHP callable and reading a PHP array or object by key, as the Collections core does, and the type of a
// sync member's callback. Internal: not exported from the package.
import type { NotPromise } from "@xaravel/contracts/async";
import { Error as PhpError, getDebugType, is_array, normalizeKey, type PhpArray, toBool } from "@xaravel/runtime";

const PHP_ARRAY = Symbol.for("xaravel.php.array");

/**
 * The callback of a sync member (`filter`, `map`, `each`, `first`, …), whose result `R` the member infers. Collections
 * are sync (AD-6, DIV-1 Callbacks): an async callback is refused, and goes to the async companion instead
 * (`filterAsync`, …, DIV-1.2). The type is an intersection of two signatures, and each half catches it for one tool:
 * the `NotPromise<R>` half makes `tsc` reject an async callback (`TS2322`, its Promise result is `never`), and the
 * `void` half lets oxlint's `no-misused-promises` (`checksVoidReturn`) see a void-returning parameter and report the
 * Promise-returning function passed to it. A bare `NotPromise<R>` is caught only by `tsc`, and `NotPromise<R> | void`
 * only by lint. A sync callback keeps its contextual parameter types and any result.
 */
export type SyncCallback<A extends unknown[], R> = ((...args: A) => NotPromise<R>) & ((...args: A) => void);

/**
 * A value-or-callback parameter (`contains`, `every`, `reject`, `skipUntil`, …): the value as it is, or, when the
 * argument is a function, its `SyncCallback`, so an async callback is refused there too (AD-6). Members declare it in
 * an overload after a `SyncCallback` one, which keeps a callback's contextual parameter types.
 */
export type ValueOrSyncCallback<K> = K extends (...args: infer A) => infer R ? SyncCallback<A, R> : K;

/**
 * PHP's `$callback(...$args)`: a function is called with `args`, and an object whose `__invoke` is a function through
 * it. Anything else throws PHP's `Error` `Value not callable`. A PHP callable string or array is not ported here
 * (DIV-9.13), so it throws too.
 */
export function callCallable(callback: unknown, ...args: unknown[]): unknown {
  if (typeof callback === "function") {
    return (Reflect.apply(callback, undefined, args) as unknown) ?? null;
  }
  if (typeof callback === "object" && callback !== null && typeof (callback as { __invoke?: unknown }).__invoke === "function") {
    return (callback as { __invoke: (...parameters: unknown[]) => unknown }).__invoke(...args) ?? null;
  }
  throw new PhpError(`Value of type ${getDebugType(callback)} is not callable`);
}

/** PHP's `$array[$key]` read on a PHP array (a list, a plain object or a `PhpArray`): `null` for a missing key. */
export function arrayRead(array: object, key: unknown): unknown {
  const normalized = normalizeKey(key);
  if (Array.isArray(array)) {
    return typeof normalized === "number" && normalized >= 0 && normalized < array.length ? ((array[normalized] as unknown) ?? null) : null;
  }
  if ((array as Record<symbol, unknown>)[PHP_ARRAY] === true) {
    return (array as PhpArray).get(normalized) ?? null;
  }
  const name = String(normalized);
  return Object.hasOwn(array, name) ? (((array as Record<string, unknown>)[name] as unknown) ?? null) : null;
}

/**
 * Whether `object` has the PHP property `name`: an own property, or an accessor up its prototype chain. A function
 * reached through the prototype is a method, not a property.
 */
function hasProperty(object: object, name: string): boolean {
  if (Object.hasOwn(object, name)) {
    return true;
  }
  for (let holder: object | null = Object.getPrototypeOf(object) as object | null; holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    if (descriptor !== undefined) {
      return descriptor.get !== undefined || descriptor.set !== undefined || typeof descriptor.value !== "function";
    }
  }
  return false;
}

/**
 * PHP's `$object->{$key}` read: the property when the object has it, else the object's `__get($key)` port when it has
 * one, else `null`.
 */
export function propertyRead(object: object, key: unknown): unknown {
  const name = String(key);
  if (hasProperty(object, name)) {
    return ((object as Record<string, unknown>)[name] as unknown) ?? null;
  }
  const magic: unknown = (object as { __get?: unknown }).__get;
  if (typeof magic === "function") {
    return (Reflect.apply(magic, object, [name]) as unknown) ?? null;
  }
  return null;
}

/** PHP's `isset($object->{$key})`: a non-null property, else the object's `__isset($key)` port when it has one. */
export function propertyIsSet(object: object, key: unknown): boolean {
  const name = String(key);
  if (hasProperty(object, name)) {
    return ((object as Record<string, unknown>)[name] ?? null) !== null;
  }
  const magic: unknown = (object as { __isset?: unknown }).__isset;
  if (typeof magic === "function") {
    return toBool(Reflect.apply(magic, object, [name]));
  }
  return false;
}

/**
 * PHP's `$target[$key]` read on a PHP array or an `ArrayAccess` object: `arrayRead` for an array, the object's
 * `offsetGet($key)` otherwise.
 */
export function offsetRead(target: object, key: unknown): unknown {
  if (is_array(target)) {
    return arrayRead(target, key);
  }
  return (target as { offsetGet(offset: unknown): unknown }).offsetGet(key) ?? null;
}

/**
 * PHP's `isset($target[$key])` on a PHP array (the key is present and its value is not `null`) or an `ArrayAccess`
 * object (its `offsetExists($key)`).
 */
export function offsetIsSet(target: object, key: unknown): boolean {
  if (is_array(target)) {
    return arrayRead(target, key) !== null;
  }
  return toBool((target as { offsetExists(offset: unknown): unknown }).offsetExists(key));
}

/**
 * Whether `value` is an AD-26 options object: a plain object (prototype `Object.prototype` or `null`) whose `__invoke`
 * is not a function. A member reads one only in a position where PHP never takes an array, so the reading is
 * unambiguous: `random`'s `$number` (an int, a callable or null), `splice`'s `$length` (an int or null), `sortBy`'s
 * `$options` (an int), and the `$callback` of `Arr.first` / `Arr.last` (a `?callable`) and of `duplicates` (a callable,
 * a key string or null). An object with a function `__invoke` is a callable in this port (`callCallable` invokes it),
 * so it is never read as options.
 */
export function isOptionsObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (typeof (value as { __invoke?: unknown }).__invoke === "function") {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
