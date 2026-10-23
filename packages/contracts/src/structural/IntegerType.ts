// Illuminate\JsonSchema\Types\IntegerType, as a contract names it (AD-1.2): a subset of its public methods.
import type { Type } from "./Type";

/** A JSON schema integer type. */
export interface IntegerType extends Type {
  /** Set the minimum value (inclusive). */
  min(value: number): this;

  /** Set the maximum value (inclusive). */
  max(value: number): this;

  /** Set the value the integer must be a multiple of. */
  multipleOf(value: number): this;

  /** Set the type's default value. */
  default(value: number): this;
}
