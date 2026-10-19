// Story 6.5 fixture: functions, matched by camelCase short name.

/** Upstream `Demo\helper_fn($value = null, bool $strict = false)`: matched. */
export function helperFn(value: unknown = null, strict = false): unknown {
  return strict ? value : null;
}
