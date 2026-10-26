// Laravel's `Illuminate\Support\MultipleItemsFoundException` (v13.37.0): thrown by `sole()` when more than one item
// matches. It extends the runtime's SPL `RuntimeException` (AD-19), as Upstream's extends PHP's, and keeps Upstream's
// message, `"$count items were found."`.
import { registerClass, RuntimeException, toPhpString } from "@xaravel/runtime";

/** More than one item was found: Laravel's `MultipleItemsFoundException`. */
export class MultipleItemsFoundException extends RuntimeException {
  /** The number of items found. */
  count: number;

  /** Create a new exception instance for `count` items, with PHP's `code` and `previous`. */
  constructor(count: number, code: number | bigint = 0, previous: globalThis.Error | null = null) {
    super(`${toPhpString(count)} items were found.`, code, previous);

    this.count = count;
  }

  /** Get the number of items found. */
  getCount(): number {
    return this.count;
  }
}

registerClass("Illuminate\\Support\\MultipleItemsFoundException", MultipleItemsFoundException);
