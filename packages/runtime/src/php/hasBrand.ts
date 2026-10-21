// Brand checks (AD-9.5, DIV-9.5). A contract brand sits on the prototype as `get [Token]() { return true as const }`,
// so `hasBrand` reads it from a class's prototype without instantiating the class, or from an instance through its
// prototype chain. The property key is the one JS derives from the token in `get [Token]()`: a symbol as it is, or an
// object's or function's `Symbol.toPrimitive` result.

/** The symbol property key `token` gives as a computed key; throws a `TypeError` when it gives none. */
function brandKey(token: unknown): symbol {
  if (typeof token === "symbol") {
    return token;
  }
  if ((typeof token === "object" && token !== null) || typeof token === "function") {
    const toPrimitive: unknown = (token as { [Symbol.toPrimitive]?: unknown })[Symbol.toPrimitive];
    if (typeof toPrimitive === "function") {
      const key: unknown = (toPrimitive as (hint: string) => unknown).call(token, "string");
      if (typeof key === "symbol") {
        return key;
      }
    }
  }
  throw new TypeError("hasBrand(): the token does not convert to a symbol");
}

/**
 * Whether `classOrInstance` carries the brand `token`: for a class, its prototype's `[key]` is `true`, read without
 * a constructor call; for any other object, its `[key]`, read through its prototype chain, is
 * `true`. Any other value has no brand.
 */
export function hasBrand(classOrInstance: unknown, token: unknown): boolean {
  const key = brandKey(token);
  if (typeof classOrInstance === "function") {
    const prototype: unknown = (classOrInstance as { prototype?: unknown }).prototype;
    return typeof prototype === "object" && prototype !== null && (prototype as Record<symbol, unknown>)[key] === true;
  }
  if (typeof classOrInstance === "object" && classOrInstance !== null) {
    return (classOrInstance as Record<symbol, unknown>)[key] === true;
  }
  return false;
}
