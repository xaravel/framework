// Laravel's `Illuminate\JsonSchema\Types\ObjectType` (v13.37.0), ported line for line. The promoted `$properties` is
// declared at the constructor, after `$additionalProperties`, so `get_object_vars` lists it last. `properties` is a
// PHP array of Types keyed by property name: a plain object, or a `PhpArray` when a name is integer-like (DIV-9.2).
// An array argument is copied, as PHP passes arrays by value; the Types in it are shared by handle.
import type { PhpArrayLike } from "@xaravel/contracts/json-schema";
import { registerClass, valueCopy } from "@xaravel/runtime";
import { OBJECT_VARS } from "../internal/objectVars";
import { Type } from "./Type";

/** A JSON schema object type: Laravel's `Illuminate\JsonSchema\Types\ObjectType`. */
export class ObjectType extends Type {
  /** Whether additional properties are allowed. */
  protected additionalProperties: boolean | null = null;

  /** The object's properties, keyed by name. */
  protected properties: PhpArrayLike;

  /** Create a new object type instance. */
  constructor(properties: PhpArrayLike = []) {
    super();
    this.properties = valueCopy(properties);
  }

  /** Disallow additional properties. */
  withoutAdditionalProperties(): this {
    this.additionalProperties = false;

    return this;
  }

  /** Set the type's default value. */
  default(value: PhpArrayLike): this {
    this.defaultProperty = valueCopy(value);

    return this;
  }

  /** Upstream's `get_object_vars($this)`: the parent's properties, then this class's (package-internal, DIV-12.2). */
  override [OBJECT_VARS](): Record<string, unknown> {
    return {
      ...super[OBJECT_VARS](),
      additionalProperties: this.additionalProperties,
      properties: valueCopy(this.properties),
    };
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\ObjectType", ObjectType);
