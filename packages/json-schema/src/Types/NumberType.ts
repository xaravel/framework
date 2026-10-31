// Laravel's `Illuminate\JsonSchema\Types\NumberType` (v13.37.0), ported line for line. Each value is an int or a float;
// an integral float carries the runtime's float marker (DIV-9.4), which `jsonEncode` writes as PHP does. `$multipleOf`
// shares its name with a method, so its state is `multipleOfProperty` (DIV-12.2).
import { type PhpFloat, registerClass } from "@xaravel/runtime";
import { OBJECT_VARS } from "../internal/objectVars";
import { Type } from "./Type";

/** A JSON schema number type: Laravel's `Illuminate\JsonSchema\Types\NumberType`. */
export class NumberType extends Type {
  /** The minimum value (inclusive). */
  protected minimum: number | PhpFloat | null = null;

  /** The maximum value (inclusive). */
  protected maximum: number | PhpFloat | null = null;

  /** The number the value must be a multiple of (Upstream's `$multipleOf`, DIV-12.2). */
  protected multipleOfProperty: number | PhpFloat | null = null;

  /** Set the minimum value (inclusive). */
  min(value: number | PhpFloat): this {
    this.minimum = value;

    return this;
  }

  /** Set the maximum value (inclusive). */
  max(value: number | PhpFloat): this {
    this.maximum = value;

    return this;
  }

  /** Set the number the value must be a multiple of. */
  multipleOf(value: number | PhpFloat): this {
    this.multipleOfProperty = value;

    return this;
  }

  /** Set the type's default value. */
  default(value: number | PhpFloat): this {
    this.defaultProperty = value;

    return this;
  }

  /** Upstream's `get_object_vars($this)`: the parent's properties, then this class's (package-internal, DIV-12.2). */
  override [OBJECT_VARS](): Record<string, unknown> {
    return {
      ...super[OBJECT_VARS](),
      minimum: this.minimum,
      maximum: this.maximum,
      multipleOf: this.multipleOfProperty,
    };
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\NumberType", NumberType);
