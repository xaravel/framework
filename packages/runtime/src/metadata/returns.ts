// `returns` metadata (DIV-3.4): a closure's PHP return hint, which TypeScript erases. `returns(spec, fn)` writes the
// Spec under `Symbol.for('xaravel.returns')` in `fn`'s own `Symbol.metadata` object, the one `inject(map, fn)` writes
// its map into, so the two coexist; it returns `fn` itself. `readReturnMetadata(fn)` gives the Spec, or null.
import { type Fn, METADATA, type MetadataHolder, ownMetadata } from "./inject";
import { specOf } from "./specs";

/** The key the Spec is stored under in a `Symbol.metadata` object. */
const RETURNS = Symbol.for("xaravel.returns");

function invalid(detail: string): TypeError {
  return new TypeError(`returns(): ${detail} (DIV-3.4)`);
}

/**
 * Declares `fn`'s return hint as `spec` (a class, a token, `String`, `Number`, `Boolean`, `primitive`, `oneOf(...)`,
 * `allOf(...)`, or the markers `self` / `static` / `parent`) and returns `fn`. Throws `TypeError` for a `null` or
 * `undefined` Spec, a `variadic(...)` Spec, or a `fn` that is not a function.
 */
export function returns<F extends Fn>(spec: unknown, fn: F): F {
  if (spec === undefined || spec === null) {
    throw invalid(`the Spec must be a class, a token or a Spec value, not ${spec === null ? "null" : "undefined"}`);
  }
  if (specOf(spec)?.kind === "variadic") {
    throw invalid("a return type cannot be variadic(...)");
  }
  if (typeof fn !== "function") {
    throw invalid("the second argument must be a function");
  }
  Object.defineProperty(ownMetadata(fn), RETURNS, { value: spec, enumerable: true, writable: true, configurable: true });
  return fn;
}

/** The return Spec `returns` stored for `fn`, or null. */
export function readReturnMetadata(fn: unknown): unknown {
  if (typeof fn !== "function") {
    return null;
  }
  const metadata: unknown = (fn as unknown as MetadataHolder)[METADATA];
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }
  const spec: unknown = (metadata as MetadataHolder)[RETURNS];
  return spec === undefined ? null : spec;
}
