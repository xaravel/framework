// Laravel's global Collections helpers (`src/Illuminate/Collections/helpers.php`, v13.37.0): `collect`, `data_fill`,
// `data_has`, `data_get`, `data_set`, `data_forget`, `head`, `last`, `value` and `when`. The by-reference helpers take
// PHP's `&$target` as a `Ref` (DIV-9.2), as `Arr.set` does: the caller reads the changed target back from its `value`.
// Their recursive `&$target[$segment]` / `&$target->{$segment}` arguments never outlive the call, so the walk goes by
// value and writes each level back as PHP does (PORTING.md, By-reference parameters; ESC-14.6-10). An `ArrayAccess`
// level goes through `offsetReference` (builtin storage writes through; a userland `offsetGet` writes nothing, DIV-9.17).
import type { NotPromise } from "@xaravel/contracts/async";
import {
  array_first,
  array_key_first,
  array_key_last,
  array_last,
  array_shift,
  arrayEntries,
  ArrayAccess,
  ArrayIterator,
  ArrayObject,
  Closure,
  explode,
  Generator,
  hasBrand,
  identical,
  in_array,
  is_array,
  is_iterable,
  is_object,
  offsetAssign,
  offsetReference,
  property_exists,
  Ref,
  toBool,
  toPhpArray,
  Traversable,
  valueCopy,
} from "@xaravel/runtime";
import { Arr } from "./Arr";
import { Collection } from "./Collection";
import { arrayRead, offsetRead, propertyIsDeclared, propertyIsSet, propertyRead, propertyUnset, propertyWrite } from "./support/callables";

/** Create a collection from the given value. */
export function collect(value: unknown = []): Collection {
  return new Collection(value);
}

/** Fill in data where it's missing: `data_set(target, key, value, false)`. `target` is PHP's `&$target` (DIV-9.2). */
export function data_fill(target: Ref<unknown>, key: unknown, value: unknown): unknown {
  return data_set(target, key, value, false);
}

/**
 * Determine if a key / property exists on an array or object using "dot" notation: each segment is a key of a PHP
 * array or an `ArrayAccess` object, or a declared property of an object (`property_exists`). A `null` or empty key
 * gives `false`.
 */
export function data_has(target: unknown, key: unknown): boolean {
  if (key === null || key === undefined || identical(key, [])) {
    return false;
  }

  const segments: unknown[] = is_array(key) ? arrayEntries(key as object).map(([, segment]) => segment) : explode(".", key);

  for (const segment of segments) {
    if (Arr.accessible(target) && Arr.exists(target, segment)) {
      target = offsetRead(target as object, segment);
    } else if (is_object(target) && property_exists(target, segment)) {
      target = propertyRead(target as object, segment);
    } else {
      return false;
    }
  }

  return true;
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
 * Set an item on an array or object using "dot" notation. `target` is PHP's `&$target` (DIV-9.2): the changed target is
 * written to `target.value`, and returned. `key` is a dot-separated string, an int or a list of segments; `*` sets every
 * item (a target that is not array accessible becomes `[]` first). A missing level is created as `[]`, and a scalar
 * level is replaced by one. With `overwrite` false an existing key or set property is kept.
 */
export function data_set(target: Ref<unknown>, key: unknown, value: unknown, overwrite: boolean = true): unknown {
  target.value = valueCopy(target.value);
  setIn(target, key, value, overwrite);
  return valueCopy(target.value);
}

/**
 * Remove / unset an item from an array or object using "dot" notation. `target` is PHP's `&$target` (DIV-9.2): the
 * changed target is written to `target.value`, and returned. `*` forgets the rest of the key in every item; a missing
 * key is left alone.
 */
export function data_forget(target: Ref<unknown>, key: unknown): unknown {
  target.value = valueCopy(target.value);
  forgetIn(target, key);
  return valueCopy(target.value);
}

/** Get the first element of an array, or `false` when it is empty (any falsy value, as PHP's `empty()`). Throws PHP's `TypeError` for a truthy non-array. */
export function head(array: unknown): unknown {
  return !toBool(array) ? false : valueCopy(array_first(array));
}

/** Get the last element from an array, or `false` when it is empty (any falsy value, as PHP's `empty()`). Throws PHP's `TypeError` for a truthy non-array. */
export function last(array: unknown): unknown {
  return !toBool(array) ? false : valueCopy(array_last(array));
}

/**
 * Return the default value of the given value: a Closure is called with `args` and its result returned, anything else
 * is returned as it is. A dual helper (AD-6.5): a callback returning `T` gives `T`, so an async one gives its own
 * Promise, never awaited here.
 */
export function value<T>(value: (...args: any[]) => T, ...args: unknown[]): T;
export function value<T>(value: T, ...args: unknown[]): T;
export function value(value: unknown, ...args: unknown[]): unknown {
  return resolveValue(value, ...args);
}

/** `when`'s condition: a value or a Closure giving one, never a Promise (DIV-1.6). */
type WhenCondition<C> = NotPromise<C> | (() => NotPromise<C>);

/**
 * Return a value if the given condition is truthy: `value(value, condition)`, else `value(default, condition)`. A
 * Closure condition is called first, and its result is the condition. A dual helper (AD-6.5), as `value`: a Closure's
 * result is returned as it is, so an async one gives its own Promise, never awaited here. A thenable condition, or a
 * Closure condition that returns one, throws a `TypeError` saying to await it first, as Conditionable's `when` does,
 * since a Promise would always test truthy (DIV-1.6).
 */
export function when<C, V, D>(condition: WhenCondition<C>, value: (condition: any) => V, defaultValue: (condition: any) => D): V | D;
export function when<C, V, D = null>(condition: WhenCondition<C>, value: (condition: any) => V, defaultValue?: D): V | D;
export function when<C, V, D>(condition: WhenCondition<C>, value: V, defaultValue: (condition: any) => D): V | D;
export function when<C, V, D = null>(condition: WhenCondition<C>, value: V, defaultValue?: D): V | D;
export function when(condition: unknown, value: unknown, defaultValue: unknown = null): unknown {
  if (isThenable(condition)) {
    throw new TypeError("when(): the condition is a Promise or another thenable; await it before calling when()");
  }
  if (condition instanceof Closure) {
    condition = (condition as () => unknown)() ?? null;
    if (isThenable(condition)) {
      throw new TypeError("when(): the condition closure returned a Promise or another thenable; await it before calling when()");
    }
  }

  if (toBool(condition)) {
    return resolveValue(value, condition);
  }

  return resolveValue(defaultValue, condition);
}

/** Whether `value` is a Promise or another thenable: an object or function with a function `then`. */
function isThenable(value: unknown): boolean {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** `value`'s body, which `when` calls too, as its own parameter `value` hides the helper there. */
function resolveValue(value: unknown, ...args: unknown[]): unknown {
  return value instanceof Closure ? ((value as (...parameters: unknown[]) => unknown)(...args) ?? null) : (value ?? null);
}

/** The key's segments, as PHP's `is_array($key) ? $key : explode('.', $key)` gives them. */
function segmentsOf(key: unknown): Ref<unknown> {
  return new Ref<unknown>(is_array(key) ? valueCopy(key) : explode(".", key));
}

/** A segment as an array key: PHP's `$array[null]` is the key `""`, never an append. */
function arrayKey(segment: unknown): unknown {
  return segment ?? "";
}

/**
 * PHP's `foreach ($target as &$inner)` over an array accessible target: `visit` gets each item as a `Ref` and may change
 * it. An array's items and a builtin `ArrayObject` / `ArrayIterator`'s storage are written back; any other Traversable
 * is iterated through its iterator, whose items are copies (an object item keeps its handle), so only a change made
 * inside an object item is kept; an `ArrayAccess` object that is not Traversable iterates its properties.
 */
function eachByReference(target: Ref<unknown>, visit: (inner: Ref<unknown>) => void): void {
  const current = target.value;
  if (is_array(current)) {
    for (const [itemKey, item] of arrayEntries(current as object)) {
      const inner = new Ref<unknown>(item);
      visit(inner);
      offsetAssign(target, itemKey, inner.value);
    }
  } else if (current instanceof ArrayObject || current instanceof ArrayIterator) {
    for (const [itemKey, item] of arrayEntries(current.getArrayCopy() as object)) {
      const inner = new Ref<unknown>(item);
      visit(inner);
      (current instanceof ArrayObject ? ArrayObject : ArrayIterator).prototype.offsetSet.call(current, itemKey as never, inner.value);
    }
  } else if (current instanceof Traversable) {
    for (const item of iterateValues(current)) {
      visit(new Ref<unknown>(item));
    }
  } else if (is_object(current)) {
    // `foreach` from outside the class sees only the public properties: `(array)`'s keys without a mangled prefix.
    const names = [...toPhpArray(current).keys()].map(String).filter((name) => !name.startsWith("\0"));
    for (const name of names) {
      const inner = new Ref<unknown>(propertyRead(current as object, name));
      visit(inner);
      propertyWrite(current as object, name, inner.value);
    }
  }
}

/**
 * PHP's `data_set($target[$segment], …)` or `data_set($target->{$segment}, …)`: `recurse` gets the level as a `Ref`,
 * and a PHP array level or a property is written back. An `ArrayAccess` level is `offsetReference`'s.
 */
function descend(target: Ref<unknown>, segment: unknown, recurse: (inner: Ref<unknown>) => void): void {
  const current = target.value;
  if (is_array(current)) {
    const inner = new Ref<unknown>(arrayRead(current as object, arrayKey(segment)));
    recurse(inner);
    offsetAssign(target, arrayKey(segment), inner.value);
  } else if (current instanceof ArrayAccess) {
    recurse(offsetReference(current, segment));
  } else if (is_object(current)) {
    const inner = new Ref<unknown>(propertyRead(current as object, segment));
    recurse(inner);
    if (propertyIsDeclared(current as object, segment)) {
      propertyWrite(current as object, segment, inner.value);
    }
  } else {
    // PHP's `&$target[$segment]` on the `[]` just assigned: a new null item.
    const inner = new Ref<unknown>(null);
    recurse(inner);
    offsetAssign(target, arrayKey(segment), inner.value);
  }
}

/** `data_set`'s body over an owned target. */
function setIn(target: Ref<unknown>, key: unknown, value: unknown, overwrite: boolean): void {
  const segments = segmentsOf(key);
  const segment = array_shift(segments);
  const more = toBool(segments.value);

  if (segment === "*") {
    if (!Arr.accessible(target.value)) {
      target.value = [];
    }

    if (more) {
      eachByReference(target, (inner) => setIn(inner, segments.value, value, overwrite));
    } else if (overwrite) {
      eachByReference(target, (inner) => {
        inner.value = valueCopy(value);
      });
    }
  } else if (Arr.accessible(target.value)) {
    const writeKey = is_array(target.value) ? arrayKey(segment) : segment;
    if (more) {
      if (!Arr.exists(target.value, writeKey)) {
        offsetAssign(target, writeKey, []);
      }

      descend(target, segment, (inner) => setIn(inner, segments.value, value, overwrite));
    } else if (overwrite || !Arr.exists(target.value, writeKey)) {
      offsetAssign(target, writeKey, value);
    }
  } else if (is_object(target.value)) {
    const object = target.value as object;
    if (more) {
      if (!propertyIsSet(object, segment)) {
        propertyWrite(object, segment, []);
      }

      descend(target, segment, (inner) => setIn(inner, segments.value, value, overwrite));
    } else if (overwrite || !propertyIsSet(object, segment)) {
      propertyWrite(object, segment, value);
    }
  } else {
    target.value = [];

    if (more) {
      descend(target, segment, (inner) => setIn(inner, segments.value, value, overwrite));
    } else if (overwrite) {
      offsetAssign(target, arrayKey(segment), value);
    }
  }
}

/** `data_forget`'s body over an owned target. */
function forgetIn(target: Ref<unknown>, key: unknown): void {
  const segments = segmentsOf(key);
  const segment = array_shift(segments);
  const more = toBool(segments.value);

  if (segment === "*" && Arr.accessible(target.value)) {
    if (more) {
      eachByReference(target, (inner) => forgetIn(inner, segments.value));
    }
  } else if (Arr.accessible(target.value)) {
    if (more && Arr.exists(target.value, is_array(target.value) ? arrayKey(segment) : segment)) {
      descend(target, segment, (inner) => forgetIn(inner, segments.value));
    } else {
      Arr.forget(target, segment);
    }
  } else if (is_object(target.value)) {
    const object = target.value as object;
    if (more && propertyIsSet(object, segment)) {
      descend(target, segment, (inner) => forgetIn(inner, segments.value));
    } else if (propertyIsSet(object, segment)) {
      propertyUnset(object, segment);
    }
  }
}

/**
 * The values PHP's `foreach ($target as $item)` gives for an array or a Traversable; a bare JS generator object
 * iterates as the runtime's `Generator` (DIV-12.18).
 */
function iterateValues(target: unknown): Iterable<unknown> {
  if (is_array(target)) {
    return arrayEntries(target as object).map(([, item]) => item);
  }
  // A bare JS generator object answers `instanceof Generator` and `instanceof Traversable` but carries no brand.
  if (target instanceof Generator && !hasBrand(target, Traversable)) {
    return new Generator(target);
  }
  return target as Iterable<unknown>;
}
