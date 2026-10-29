// Laravel's `Illuminate\Support` namespaced functions (`src/Illuminate/Collections/functions.php`, v13.37.0).
import { BackedEnum, UnitEnum } from "@xaravel/runtime";
import { value as resolveValue } from "./helpers";

/**
 * Return a scalar value for the given value that might be an enum: a backed case's `value`, a pure case's `name`,
 * else the value itself, or `value(default)` when it is `null`.
 *
 * @internal
 */
export function enum_value(value: unknown, defaultValue: unknown = null): unknown {
  if (value instanceof BackedEnum) {
    return (value as unknown as { value: unknown }).value;
  }
  if (value instanceof UnitEnum) {
    return value.name;
  }
  return value ?? resolveValue(defaultValue);
}
