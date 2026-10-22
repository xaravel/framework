// `inject` metadata (AD-4, DIV-3, Story 9.9): the one writer of a class's or a function's injection map, which the
// Container (Epic 18) reads to resolve parameters by name, in order.
//
// - `@inject(map)` on a class stores the map in the class's `context.metadata`, so a subclass without its own
//   `inject` inherits it through the metadata prototype chain, as PHP inherits a constructor.
// - `@inject(map)` on a method (instance or static) stores it in the method function's own `Symbol.metadata` object,
//   so an override without `inject` has none.
// - `inject(map, fn)` stores it in `fn`'s own `Symbol.metadata` object and returns `fn` itself.
//
// The map is copied once into a frozen null-prototype object, keeping key order (key order is parameter order).
// `readInjectMetadata(target)` returns that map, or `null`.
import "./polyfill";

/**
 * `Symbol.metadata`: native, else the polyfill's `Symbol.for('Symbol.metadata')`, which is also where Bun attaches a
 * decorated class's metadata when `Symbol` could not be polyfilled (a frozen `Symbol`, ESC-9.9-1).
 */
const METADATA: symbol = (Symbol as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

/** The key the map is stored under in a `Symbol.metadata` object. */
const INJECT = Symbol.for("xaravel.inject");

/** A parameter name, which is an identifier (an integer-like key would reorder the map). */
const IDENTIFIER = /^[\p{ID_Start}_$][\p{ID_Continue}$‌‍]*$/u;

/** A map of parameter name to what is injected for it (a class, a contract token or a spec), in parameter order. */
export type InjectMap = Readonly<Record<string, unknown>>;

/** What `inject(map)` returns: a TC39 class or method decorator. */
export type InjectDecorator = (value: unknown, context: DecoratorContext) => void;

type Fn = (...args: never[]) => unknown;
type MetadataHolder = Record<PropertyKey, unknown>;

function invalid(detail: string): TypeError {
  return new TypeError(`inject(): ${detail} (AD-4)`);
}

/** `map` validated and copied into a frozen null-prototype object, its key order kept. */
function freezeMap(map: unknown): InjectMap {
  if (typeof map !== "object" || map === null || Array.isArray(map)) {
    throw invalid("the map must be a plain object");
  }
  const prototype: unknown = Object.getPrototypeOf(map);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid("the map must be a plain object");
  }
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(map)) {
    if (typeof key !== "string" || !IDENTIFIER.test(key)) {
      throw invalid(`the key ${typeof key === "string" ? jsonQuote(key) : "<symbol>"} is not a parameter name`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(map, key)!;
    if (!descriptor.enumerable) {
      continue;
    }
    const value: unknown = "value" in descriptor ? descriptor.value : (map as Record<string, unknown>)[key];
    if (value === undefined || value === null) {
      throw invalid(`the value for ${key} must be a class, a token or a spec, not ${value === null ? "null" : "undefined"}`);
    }
    Object.defineProperty(copy, key, { value, enumerable: true, writable: false, configurable: false });
  }
  return Object.freeze(copy);
}

/** A key quoted for a message. */
function jsonQuote(key: string): string {
  return `"${key.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** `fn`'s own `Symbol.metadata` object, created (inheriting any it already reads) when it has none. */
function ownMetadata(fn: Fn): MetadataHolder {
  if (Object.hasOwn(fn, METADATA)) {
    const own: unknown = (fn as unknown as MetadataHolder)[METADATA];
    if (typeof own === "object" && own !== null) {
      return own as MetadataHolder;
    }
  }
  const inherited: unknown = (fn as unknown as MetadataHolder)[METADATA];
  const created = Object.create(typeof inherited === "object" ? inherited : null) as MetadataHolder;
  Object.defineProperty(fn, METADATA, { value: created, enumerable: false, writable: true, configurable: true });
  return created;
}

function store(holder: MetadataHolder, map: InjectMap): void {
  Object.defineProperty(holder, INJECT, { value: map, enumerable: true, writable: true, configurable: true });
}

/**
 * `inject(map)`: a TC39 decorator for a class (its constructor's parameters) or a method (instance or static).
 * `inject(map, fn)`: stores the map on `fn` and returns `fn`. The map's keys are the parameter names, in order.
 * Throws `TypeError` for a map that is not a plain object, a key that is not an identifier, an `undefined` or `null`
 * value, a `fn` that is not a function, or a decorator kind other than `class` / `method`.
 */
export function inject(map: InjectMap): InjectDecorator;
export function inject<F extends Fn>(map: InjectMap, fn: F): F;
export function inject(map: InjectMap, ...rest: unknown[]): InjectDecorator | Fn {
  const frozen = freezeMap(map);
  if (rest.length > 0) {
    const fn = rest[0];
    if (typeof fn !== "function") {
      throw invalid("the second argument must be a function");
    }
    store(ownMetadata(fn as Fn), frozen);
    return fn as Fn;
  }
  return (value: unknown, context: DecoratorContext): void => {
    if (typeof context !== "object" || context === null || (context.kind !== "class" && context.kind !== "method")) {
      throw invalid(`a ${typeof context === "object" && context !== null ? String(context.kind) : "non-decorator"} cannot be decorated; use it on a class or a method`);
    }
    if (context.kind === "class") {
      store(context.metadata as MetadataHolder, frozen);
      return;
    }
    if (typeof value !== "function") {
      throw invalid("the decorated method is not a function");
    }
    store(ownMetadata(value as Fn), frozen);
  };
}

/** The map `inject` stored for `target` (a class, a method or a function), in parameter order, or `null`. */
export function readInjectMetadata(target: unknown): InjectMap | null {
  if (typeof target !== "function") {
    return null;
  }
  const metadata: unknown = (target as unknown as MetadataHolder)[METADATA];
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }
  const map: unknown = (metadata as MetadataHolder)[INJECT];
  return typeof map === "object" && map !== null ? (map as InjectMap) : null;
}
