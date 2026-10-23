// Illuminate\JsonSchema\Types\ArrayType, as a contract names it (AD-1.2): a subset of its public methods.
import type { PhpArrayLike } from "./PhpArrayLike";
import type { Type } from "./Type";

/** A JSON schema array type. */
export interface ArrayType extends Type {
  /** Set the minimum number of items (inclusive). */
  min(value: number): this;

  /** Set the maximum number of items (inclusive). */
  max(value: number): this;

  /** Set the schema for array items. */
  items(type: Type): this;

  /** Indicate that the array items must be unique. */
  unique(unique?: boolean): this;

  /** Set the type's default value. */
  default(value: PhpArrayLike): this;
}
