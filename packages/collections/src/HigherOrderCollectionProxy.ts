// Laravel's `Illuminate\Support\HigherOrderCollectionProxy` (v13.37.0). PHP reads `$collection->each->name` and calls
// `$collection->each->save()` through `__get` and `__call`. Xaravel has no Proxy outside `Model` (AD-7), so each read
// or call is written as the call PHP makes (DIV-12.16): `collection.__get('each').__get('name')` and
// `collection.__get('each').__call('save', [])`.
import { Error as PhpError, getDebugType, is_array, is_object, is_string, registerClass, resolveClass } from "@xaravel/runtime";
import type { Enumerable } from "./Enumerable";
import { arrayRead, propertyRead } from "./support/callables";

/** Call `method` on `target` with `args`, or its `__call(method, args)` port when it has no such method. */
function callMethod(target: object, method: string, args: unknown[]): unknown {
  const member: unknown = (target as Record<string, unknown>)[method];
  if (typeof member === "function") {
    return (Reflect.apply(member, target, args) as unknown) ?? null;
  }
  const magic: unknown = (target as { __call?: unknown }).__call;
  if (typeof magic === "function") {
    return (Reflect.apply(magic, target, [method, args]) as unknown) ?? null;
  }
  throw new PhpError(`Call to undefined method ${getDebugType(target)}::${method}()`);
}

/** A proxy that runs one collection method (`each`, `map`, `filter`, …) over a key or method of every item. */
export class HigherOrderCollectionProxy {
  /** The collection being operated on. */
  protected collection: Enumerable;

  /** The method being proxied. */
  protected method: string;

  /** Create a new proxy instance. */
  constructor(collection: Enumerable, method: string) {
    this.method = method;
    this.collection = collection;
  }

  /**
   * Proxy accessing an attribute onto the collection items: `$proxy->key` (DIV-12.16). An item that is neither a PHP
   * array nor an object reads as `null`, as PHP's property read on it does (with a warning).
   */
  __get(key: string): unknown {
    return callMethod(this.collection, this.method, [
      (value: unknown): unknown => (is_array(value) ? arrayRead(value as object, key) : is_object(value) ? propertyRead(value as object, key) : null),
    ]);
  }

  /** Proxy a method call onto the collection items: `$proxy->method(...$parameters)` (DIV-12.16). */
  __call(method: string, parameters: unknown[]): unknown {
    return callMethod(this.collection, this.method, [
      (value: unknown): unknown => (is_string(value) ? callMethod(resolveClass(value as string), method, parameters) : callMethod(value as object, method, parameters)),
    ]);
  }
}

registerClass("Illuminate\\Support\\HigherOrderCollectionProxy", HigherOrderCollectionProxy);
