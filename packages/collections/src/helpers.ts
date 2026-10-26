// Laravel's global Collections helpers (`src/Illuminate/Collections/helpers.php`, v13.37.0) that Story 14.1 ports:
// `collect`, `data_get` and `value`. The others (`data_fill`, `data_has`, `data_set`, `data_forget`, `head`, `last`,
// `when`) belong to the Stories that port their tests.
import { array_key_first, array_key_last, arrayEntries, Closure, explode, Generator, in_array, is_array, is_iterable, is_object, Traversable } from "@xaravel/runtime";
import { Arr } from "./Arr";
import { Collection } from "./Collection";
import { arrayRead, propertyIsSet, propertyRead } from "./support/callables";

/** Create a collection from the given value. */
export function collect(value_: unknown = []): Collection {
  return new Collection(value_);
}

/**
 * Get an item from an array or object using "dot" notation. `key` is a dot-separated string, an int, a list of
 * segments, or `null` (the target itself); `*` maps over every item, `{first}` / `{last}` take the first or last key,
 * and `\*`, `\{first}`, `\{last}` are the literal keys.
 */
export function data_get(target: unknown, key: unknown, defaultValue: unknown = null): unknown {
  if (key === null || key === undefined) {
    return target ?? null;
  }

  const segments: unknown[] = is_array(key) ? arrayEntries(key as object).map(([, segment]) => segment) : explode(".", key);

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] ?? null;
    // `unset($key[$i])`: the rest of the key is what follows this segment.
    const rest = segments.slice(i + 1);

    if (segment === null) {
      return target ?? null;
    }

    if (segment === "*") {
      if (target instanceof Collection) {
        target = target.all();
      } else if (!is_iterable(target)) {
        return value(defaultValue);
      }

      const result: unknown[] = [];

      for (const item of iterateValues(target)) {
        result.push(data_get(item, rest));
      }

      return in_array("*", rest) ? Arr.collapse(result) : result;
    }

    let current: unknown = segment;
    switch (segment) {
      case "\\*":
        current = "*";
        break;
      case "\\{first}":
        current = "{first}";
        break;
      case "{first}":
        current = array_key_first(Arr.from(target));
        break;
      case "\\{last}":
        current = "{last}";
        break;
      case "{last}":
        current = array_key_last(Arr.from(target));
        break;
      default:
        break;
    }

    if (Arr.accessible(target) && Arr.exists(target, current)) {
      target = is_array(target) ? arrayRead(target as object, current) : (target as { offsetGet(key: unknown): unknown }).offsetGet(current);
    } else if (is_object(target) && propertyIsSet(target as object, current)) {
      target = propertyRead(target as object, current);
    } else {
      return value(defaultValue);
    }
  }

  return target ?? null;
}

/**
 * Return the default value of the given value: a Closure is called with `args` and its result returned, anything else
 * is returned as it is. A dual helper (AD-6.5): a callback returning `T` gives `T`, so an async one gives its own
 * Promise, never awaited here.
 */
export function value<T>(value_: (...args: any[]) => T, ...args: unknown[]): T;
export function value<T>(value_: T, ...args: unknown[]): T;
export function value(value_: unknown, ...args: unknown[]): unknown {
  return value_ instanceof Closure ? ((value_ as (...parameters: unknown[]) => unknown)(...args) ?? null) : (value_ ?? null);
}

/**
 * The values PHP's `foreach ($target as $item)` gives for an array or a Traversable; a bare JS generator object
 * iterates as the runtime's `Generator` (DIV-12.18).
 */
function iterateValues(target: unknown): Iterable<unknown> {
  if (is_array(target)) {
    return arrayEntries(target as object).map(([, item]) => item);
  }
  if (target instanceof Generator && !(target instanceof Traversable)) {
    return new Generator(target);
  }
  return target as Iterable<unknown>;
}
