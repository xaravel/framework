// Illuminate\JsonSchema\Types\ObjectType, as a contract names it (AD-1.2): a subset of its public methods.
import type { PhpArrayLike } from "./PhpArrayLike";
import type { Type } from "./Type";

/** A JSON schema object type. */
export interface ObjectType extends Type {
  /** Disallow additional properties. */
  withoutAdditionalProperties(): this;

  /** Set the type's default value. */
  default(value: PhpArrayLike): this;
}
