// Calling a PHP callable and reading a PHP array or object by key, as the Collections core does. Internal: not
// exported from the package.
import { arrayEntries, Error as PhpError, getDebugType, normalizeKey } from "@xaravel/runtime";

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
  for (const [entryKey, value] of arrayEntries(array)) {
    if (entryKey === normalized) {
      return value;
    }
  }
  return null;
}

/**
 * PHP's `$object->{$key}` read: the property when the object has it, else the object's `__get($key)` port when it has
 * one, else `null`.
 */
export function propertyRead(object: object, key: unknown): unknown {
  const name = String(key);
  if (name in object) {
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
  if (name in object) {
    return ((object as Record<string, unknown>)[name] ?? null) !== null;
  }
  const magic: unknown = (object as { __isset?: unknown }).__isset;
  if (typeof magic === "function") {
    return Reflect.apply(magic, object, [name]) === true;
  }
  return false;
}
