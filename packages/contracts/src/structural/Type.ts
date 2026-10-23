// Illuminate\JsonSchema\Types\Type, as a contract names it (AD-1.2): a subset of its public methods (`__toString` is
// `toString()`, AD-26).
import type { PhpArrayLike } from "./PhpArrayLike";

/** A JSON schema type. */
export interface Type {
  /** Indicate that the type is required. */
  required(required?: boolean): this;

  /** Indicate that the type is optional. */
  nullable(nullable?: boolean): this;

  /** Set the type's title. */
  title(value: string): this;

  /** Set the type's description. */
  description(value: string): this;

  /** Restrict the value to one of the provided enumerated values. */
  enum(values: PhpArrayLike | string): this;

  /** Convert the type to an array. */
  toArray(): PhpArrayLike;

  /** Convert the type to its string representation. */
  toString(): string;

  /** The string representation for a string conversion (AD-26: `__toString` is `toString()` plus `[Symbol.toPrimitive]`). */
  [Symbol.toPrimitive](hint: string): string;
}
