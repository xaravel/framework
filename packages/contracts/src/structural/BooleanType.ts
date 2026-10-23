// Illuminate\JsonSchema\Types\BooleanType, as a contract names it (AD-1.2): a subset of its public methods.
import type { Type } from "./Type";

/** A JSON schema boolean type. */
export interface BooleanType extends Type {
  /** Set the type's default value. */
  default(value: boolean): this;
}
