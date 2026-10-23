// Illuminate\JsonSchema\Types\AnyOfType, as a contract names it (AD-1.2): a subset of its public methods.
import type { PhpArrayLike } from "./PhpArrayLike";
import type { Type } from "./Type";

/** A JSON schema anyOf type. */
export interface AnyOfType extends Type {
  /** Get the schemas of the anyOf. */
  schemas(): PhpArrayLike;
}
