// PHP's `iterable` type (AD-9): any JS `Iterable`, or a PHP array in its map or `PhpArray` form.
import type { PhpArray } from "@xaravel/runtime/php";

/** A PHP `iterable`. */
export type PhpIterable = Iterable<unknown> | Readonly<Record<string, unknown>> | PhpArray;
