// Laravel's `Illuminate\Support\MultipleItemsFoundException` (v13.37.0): thrown by `sole()` when more than one item
// matches. It extends the runtime's SPL `RuntimeException` (AD-19), as Upstream's extends PHP's, and keeps Upstream's
// message, `"$count items were found."`.
import { registerClass, RuntimeException, toPhpString } from "@xaravel/runtime";
import { isOptionsObject } from "./support/callables";

/** More than one item was found: Laravel's `MultipleItemsFoundException`. */
export class MultipleItemsFoundException extends RuntimeException {
  /** The number of items found. */
  count: number;

  /**
   * Create a new exception instance for `count` items, with PHP's `code` and `previous`. Also takes AD-26's options
   * object `{ code, previous }` after the count: PHP's `$code` is an int, so a plain object there is never the code.
   */
  constructor(count: number, code?: number | bigint, previous?: globalThis.Error | null);
  constructor(count: number, options?: { code?: number | bigint; previous?: globalThis.Error | null });
  constructor(count: number, code: unknown = 0, previous: globalThis.Error | null = null) {
    const options = isOptionsObject(code) ? (code as { code?: number | bigint; previous?: globalThis.Error | null }) : null;
    super(`${toPhpString(count)} items were found.`, options === null ? (code as number | bigint) : (options.code ?? 0), options === null ? previous : (options.previous ?? null));

    this.count = count;
  }

  /** Get the number of items found. */
  getCount(): number {
    return this.count;
  }
}

registerClass("Illuminate\\Support\\MultipleItemsFoundException", MultipleItemsFoundException);
