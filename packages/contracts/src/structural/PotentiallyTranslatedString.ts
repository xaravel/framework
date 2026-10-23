// Illuminate\Translation\PotentiallyTranslatedString, as a contract names it (AD-1.2): a subset of its public methods
// (`__toString` is `toString()`, AD-26).
import type { PhpArrayLike } from "./PhpArrayLike";

/** A validation message that may be translated. */
export interface PotentiallyTranslatedString {
  /** Translate the string. */
  translate(replace?: PhpArrayLike, locale?: string | null): this;
  translate(options?: { replace?: PhpArrayLike; locale?: string | null }): this;

  /** Get the original string. */
  original(): string;

  /** Get the potentially translated string. */
  toString(): string;

  /** The string representation for a string conversion (AD-26: `__toString` is `toString()` plus `[Symbol.toPrimitive]`). */
  [Symbol.toPrimitive](hint: string): string;
}
