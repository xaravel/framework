// Laravel's `Illuminate\JsonSchema\Types\AnyOfType` (v13.37.0), ported line for line. The promoted `$schemas` shares
// its name with its getter, so its state is `schemasProperty` (DIV-12.2).
import type { PhpArrayLike } from "@xaravel/contracts/json-schema";
import { array_values, registerClass } from "@xaravel/runtime";
import { OBJECT_VARS } from "../internal/objectVars";
import { Type } from "./Type";

/** A JSON schema `anyOf` of several schemas: Laravel's `Illuminate\JsonSchema\Types\AnyOfType`. */
export class AnyOfType extends Type {
  /** The anyOf schemas (Upstream's `$schemas`, DIV-12.2). */
  protected schemasProperty: Type[];

  /** Create a new anyOf type instance. */
  constructor(schemas: PhpArrayLike) {
    super();
    this.schemasProperty = array_values(schemas) as Type[];
  }

  /** Get the anyOf schemas. */
  schemas(): Type[] {
    return [...this.schemasProperty];
  }

  /** Upstream's `get_object_vars($this)`: the parent's properties, then this class's (package-internal, DIV-12.2). */
  override [OBJECT_VARS](): Record<string, unknown> {
    return {
      ...super[OBJECT_VARS](),
      schemas: [...this.schemasProperty],
    };
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\AnyOfType", AnyOfType);
