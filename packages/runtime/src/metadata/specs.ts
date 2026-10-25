// Spec values (AD-4; DIV-3.2, DIV-3.3, DIV-3.4): what an `inject` map or a `returns` declaration may name beside a
// class, a contract token, `String`, `Number` and `Boolean`.
//
// - `primitive`: an untyped PHP parameter (`mixed`, never coerced).
// - `self`, `parent`, `static`: PHP's relative hints, which reflection names as written and `Reflector` resolves
//   against the declaring class. The `static` export is bound as `static_` here, `static` being reserved.
// - `variadic(spec)`: a variadic parameter of type `spec`.
// - `oneOf(a, b, …)`: a union; a member may be an `allOf(...)` (a DNF type).
// - `allOf(a, b, …)`: an intersection of classes or tokens.
//
// Each value is a frozen null-prototype descriptor carrying a module-private brand, so `specOf` tells it from a plain
// object of the same shape. `specOf` is internal: the reflection classes read it.
import { isContractToken } from "../registry/registry";

/** The private brand every Spec value carries. */
const SPEC: unique symbol = Symbol("xaravel.spec");

/** The kinds of Spec value. */
export type SpecKind = "primitive" | "self" | "parent" | "static" | "variadic" | "oneOf" | "allOf";

/** What `specOf` reads from a Spec value. Internal. */
export interface SpecInfo {
  readonly kind: SpecKind;
  /** `variadic`'s element Spec, else null. */
  readonly spec: unknown;
  /** `oneOf` / `allOf`'s members, in order, else an empty list. */
  readonly types: readonly unknown[];
}

/** A frozen, branded, null-prototype descriptor. */
function descriptor(kind: SpecKind, spec: unknown = null, types: readonly unknown[] = []): object {
  const info: SpecInfo = Object.freeze({ kind, spec, types: Object.freeze([...types]) });
  const value = Object.create(null) as Record<PropertyKey, unknown>;
  Object.defineProperty(value, SPEC, { value: info, enumerable: false, writable: false, configurable: false });
  Object.defineProperty(value, "kind", { value: kind, enumerable: true, writable: false, configurable: false });
  return Object.freeze(value);
}

/** The Spec value's kind and parts, or null when `value` is not a Spec value. Internal. */
export function specOf(value: unknown): SpecInfo | null {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, SPEC)) {
    return null;
  }
  return (value as Record<PropertyKey, unknown>)[SPEC] as SpecInfo;
}

/** An untyped PHP parameter or return (`mixed`): a builtin type, never coerced (DIV-3.3). */
export const primitive: object = descriptor("primitive");

/** PHP's `self` hint (DIV-3.2, DIV-3.4). */
export const self: object = descriptor("self");

/** PHP's `parent` hint (DIV-3.2). */
export const parent: object = descriptor("parent");

/** PHP's `static` hint (DIV-3.4), exported as `static`. */
const static_: object = descriptor("static");
export { static_ as static };

/** Whether `value` is a class (a constructor other than the builtin-type constructors) or a contract token. */
export function isClassSpec(value: unknown): boolean {
  if (typeof value === "function") {
    return value !== String && value !== Number && value !== Boolean;
  }
  return isContractToken(value);
}

/** `value`'s description in a message. */
function described(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  const info = specOf(value);
  if (info !== null) {
    return `${info.kind === "variadic" || info.kind === "oneOf" || info.kind === "allOf" ? `${info.kind}(...)` : info.kind}`;
  }
  if (value === String || value === Number || value === Boolean) {
    return value === String ? "String" : value === Number ? "Number" : "Boolean";
  }
  return typeof value;
}

/** A variadic parameter whose elements are `spec` (DIV-3.3). Throws `TypeError` for a missing, `null` or `variadic` Spec. */
export function variadic(...args: unknown[]): object {
  const spec = args[0];
  if (args.length === 0 || spec === undefined || spec === null) {
    throw new TypeError(`variadic(): the element Spec must be a class, a token or a Spec value, not ${args.length === 0 ? "missing" : described(spec)} (DIV-3.3)`);
  }
  if (specOf(spec)?.kind === "variadic") {
    throw new TypeError("variadic(): a variadic Spec cannot be variadic again (DIV-3.3)");
  }
  return descriptor("variadic", spec);
}

/**
 * A union of `types`, in order (DIV-3.1, DIV-3.2). Throws `TypeError` for fewer than two members, or a member that is
 * missing, `null`, a `oneOf(...)` or a `variadic(...)`. A member may be an `allOf(...)` (a DNF type).
 */
export function oneOf(...types: unknown[]): object {
  if (types.length < 2) {
    throw new TypeError(`oneOf(): a union needs at least two members, ${types.length} given (DIV-3.2)`);
  }
  for (const [index, type] of types.entries()) {
    const kind = specOf(type)?.kind;
    if (type === undefined || type === null || kind === "oneOf" || kind === "variadic") {
      throw new TypeError(`oneOf(): member ${index + 1} cannot be ${described(type)} (DIV-3.2)`);
    }
  }
  return descriptor("oneOf", null, types);
}

/**
 * An intersection of `types`, in order (DIV-3.4). Throws `TypeError` for fewer than two members, or a member that is
 * not a class or a contract token.
 */
export function allOf(...types: unknown[]): object {
  if (types.length < 2) {
    throw new TypeError(`allOf(): an intersection needs at least two members, ${types.length} given (DIV-3.4)`);
  }
  for (const [index, type] of types.entries()) {
    if (!isClassSpec(type)) {
      throw new TypeError(`allOf(): member ${index + 1} must be a class or a token, not ${described(type)} (DIV-3.4)`);
    }
  }
  return descriptor("allOf", null, types);
}
