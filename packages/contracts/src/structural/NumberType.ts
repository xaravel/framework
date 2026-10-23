// Illuminate\JsonSchema\Types\NumberType, as a contract names it (AD-1.2): a subset of its public methods.
import type { Type } from "./Type";

/** A JSON schema number type. */
export interface NumberType extends Type {
  /** Set the minimum value (inclusive). */
  min(value: number): this;

  /** Set the maximum value (inclusive). */
  max(value: number): this;

  /** Set the value the number must be a multiple of. */
  multipleOf(value: number): this;

  /** Set the type's default value. */
  default(value: number): this;
}
