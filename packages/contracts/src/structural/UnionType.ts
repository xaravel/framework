// Illuminate\JsonSchema\Types\UnionType, as a contract names it (AD-1.2): a subset of its public methods.
import type { PhpArrayLike } from "./PhpArrayLike";
import type { Type } from "./Type";

/** A JSON schema multi-type union. */
export interface UnionType extends Type {
  /** Get the types in the union. */
  types(): PhpArrayLike;
}
