// PHP's `array` type, as a contract parameter or return names it (AD-9): a list, an all-string-keyed map, or a
// `PhpArray` for any other key mix. A pseudo-type, not a class, so it is a `type`.
import type { PhpArray } from "@xaravel/runtime/php";

/** A PHP array in any of its three forms. */
export type PhpArrayLike = readonly unknown[] | Readonly<Record<string, unknown>> | PhpArray;
