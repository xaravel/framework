// Illuminate\JsonSchema\Types\StringType, as a contract names it (AD-1.2): a subset of its public methods.
import type { Type } from "./Type";

/** A JSON schema string type. */
export interface StringType extends Type {
  /** Set the minimum length (inclusive). */
  min(value: number): this;

  /** Set the maximum length (inclusive). */
  max(value: number): this;

  /** Set the pattern the value must satisfy. */
  pattern(value: string): this;

  /** Set the format the value must satisfy. */
  format(value: string): this;

  /** Set the type's default value. */
  default(value: string): this;
}
