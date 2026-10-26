// PHP's `===` (`zend_is_identical` of PHP 8.5.11's `Zend/zend_operators.c`) over the AD-9 value model, for
// `in_array`'s strict mode (action item epic-14-item-2-runtime-generators-functions): the same PHP type and value; an
// int and a float never; a float by value (`NAN` never, `-0.0` and `0.0` alike); two arrays with the same keys in the
// same order and identical values (`zend_hash_compare`, ordered); an object only itself. Internal: the package does
// not export this module.
import { arrayEntries, floatValue } from "./casts";
import { Error as PhpError } from "./Error";
import type { PhpArrayKey } from "./PhpArray";
import { phpType } from "./phpType";

/** Whether two normalised array keys are the same key. */
function sameKey(a: PhpArrayKey, b: PhpArrayKey): boolean {
  if (typeof a === "string" || typeof b === "string") {
    return a === b;
  }
  return BigInt(a) === BigInt(b);
}

function same(a: unknown, b: unknown, guard: Set<object>): boolean {
  const type = phpType(a);
  if (type !== phpType(b)) {
    return false;
  }
  switch (type) {
    case "null":
      return true;
    case "bool":
    case "string":
      return a === b;
    case "int":
      return BigInt(a as number | bigint) === BigInt(b as number | bigint);
    case "float":
      return floatValue(a) === floatValue(b);
    case "object":
      return a === b;
    default:
      break;
  }
  if (a === b) {
    return true;
  }
  if (guard.has(a as object)) {
    throw new PhpError("Nesting level too deep - recursive dependency?");
  }
  guard.add(a as object);
  try {
    const left = arrayEntries(a as object);
    const right = arrayEntries(b as object);
    if (left.length !== right.length) {
      return false;
    }
    return left.every(([key, value], index) => {
      const [otherKey, otherValue] = right[index]!;
      return sameKey(key, otherKey) && same(value, otherValue, guard);
    });
  } finally {
    guard.delete(a as object);
  }
}

/** PHP's `$a === $b`. Throws PHP's `Error` `Nesting level too deep - recursive dependency?` for an array in itself. */
export function identical(a: unknown, b: unknown): boolean {
  return same(a ?? null, b ?? null, new Set());
}
