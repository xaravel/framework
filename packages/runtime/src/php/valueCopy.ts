// PHP's value copy of arrays (AD-9.2, Story 9.6): `$b = $a` copies an array, nested arrays included, while objects
// are shared by handle.
import { arrayEntries, phpType } from "./casts";
import { copyArrayPointer } from "./arrayPointer";
import { PhpArray } from "./PhpArray";

const PHP_ARRAY = Symbol.for("xaravel.php.array");
const RECURSION = "Nesting level too deep - recursive dependency?";

function copyValue(x: unknown, path: Set<object>): unknown {
  if (x === undefined) {
    return null;
  }
  if (typeof x !== "object" || x === null || phpType(x) !== "array") {
    return x;
  }
  if (path.has(x)) {
    throw new Error(RECURSION);
  }
  path.add(x);
  try {
    if (Array.isArray(x)) {
      const copy: unknown[] = [];
      copy.length = x.length;
      for (let index = 0; index < x.length; index++) {
        if (index in x) {
          copy[index] = copyValue(x[index], path);
        }
      }
      return copyArrayPointer(x, copy);
    }
    if (x instanceof PhpArray) {
      const copy = x.copy();
      for (const [key, value] of x) {
        copy.set(key, copyValue(value, path));
      }
      return copyArrayPointer(x, copy);
    }
    if ((x as Record<symbol, unknown>)[PHP_ARRAY] === true) {
      // A branded array of another implementation (the grader's) is copied into a PhpArray.
      return copyArrayPointer(x, new PhpArray(arrayEntries(x).map(([key, value]) => [key, copyValue(value, path)] as const)));
    }
    const copy = Object.create(Object.getPrototypeOf(x) as object | null) as Record<string, unknown>;
    for (const key of Object.keys(x)) {
      // defineProperty, so an own "__proto__" key stays an entry and never replaces the copy's prototype.
      Object.defineProperty(copy, key, { value: copyValue((x as Record<string, unknown>)[key], path), enumerable: true, writable: true, configurable: true });
    }
    return copyArrayPointer(x, copy);
  } finally {
    path.delete(x);
  }
}

/**
 * `x` copied as PHP copies a value: every array level (an `Array`, a plain object, a `PhpArray`) is a new array of
 * the same kind with the same keys in the same order, a `PhpArray` keeping its next free index; objects (`Ref`s
 * included) are shared by handle; any other value is returned as it is, `undefined` as `null`. Mutating the copy
 * leaves `x` unchanged. A JS array that contains itself (a PHP array cannot, without references) hits a Xaravel guard,
 * which throws an `Error` with PHP's comparison message `Nesting level too deep - recursive dependency?`.
 */
export function valueCopy<T>(x: T): Exclude<T, undefined> | (undefined extends T ? null : never) {
  return copyValue(x, new Set()) as Exclude<T, undefined> | (undefined extends T ? null : never);
}
