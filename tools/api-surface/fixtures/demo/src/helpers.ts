// Story 6.5 fixture: functions, matched by camelCase short name.

/** Upstream `Demo\helper_fn($value = null, bool $strict = false)`: the positional and the options form (AD-26), matched. */
export function helperFn(value?: unknown, strict?: boolean): unknown;
export function helperFn(options?: { value?: unknown; strict?: boolean }): unknown;
export function helperFn(value: unknown = null, strict = false): unknown {
  const options = strict || typeof value !== "object" || value === null ? { value, strict } : (value as { value?: unknown; strict?: boolean });
  return options.strict === true ? (options.value ?? null) : null;
}
