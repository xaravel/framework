// Null normalisation at a boundary (AD-9.1, DIV-9.1): `null` is the only absent value, and `undefined` is never
// returned.

/** `null` for `undefined`; every other value unchanged (the same reference). */
export function normalizeNull<T>(value: T): Exclude<T, undefined> | null {
  return value === undefined ? null : (value as Exclude<T, undefined>);
}
