// PHP's built-in `DateTimeInterface`, as a contract names it (AD-1.2): a subset of its public methods, so a later
// `Carbon` port that keeps them satisfies it.

/** PHP's `DateTimeInterface`. */
export interface DateTimeInterface {
  /** Returns the date formatted according to the given format. */
  format(format: string): string;

  /** Gets the Unix timestamp. */
  getTimestamp(): number;

  /** Returns the timezone offset in seconds. */
  getOffset(): number;
}
