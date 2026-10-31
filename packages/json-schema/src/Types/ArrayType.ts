// Laravel's `Illuminate\JsonSchema\Types\ArrayType` (v13.37.0), ported line for line. `$items` shares its name with a
// method, so its state is `itemsProperty` (DIV-12.2). An array argument is copied, as PHP passes arrays by value.
import type { PhpArrayLike } from "@xaravel/contracts/json-schema";
import { registerClass, valueCopy } from "@xaravel/runtime";
import { OBJECT_VARS } from "../internal/objectVars";
import { Type } from "./Type";

/** A JSON schema array type: Laravel's `Illuminate\JsonSchema\Types\ArrayType`. */
export class ArrayType extends Type {
  /** The minimum number of items (inclusive). */
  protected minItems: number | null = null;

  /** The maximum number of items (inclusive). */
  protected maxItems: number | null = null;

  /** The schema of the items contained in the array (Upstream's `$items`, DIV-12.2). */
  protected itemsProperty: Type | null = null;

  /** Whether the array items must be unique. */
  protected uniqueItems: boolean | null = null;

  /** Set the minimum number of items (inclusive). */
  min(value: number): this {
    this.minItems = value;

    return this;
  }

  /** Set the maximum number of items (inclusive). */
  max(value: number): this {
    this.maxItems = value;

    return this;
  }

  /** Set the schema for array items. */
  items(type: Type): this {
    this.itemsProperty = type;

    return this;
  }

  /** Indicate that the array items must be unique. */
  unique(unique: boolean = true): this {
    this.uniqueItems = unique ? unique : null;

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
      minItems: this.minItems,
      maxItems: this.maxItems,
      items: this.itemsProperty,
      uniqueItems: this.uniqueItems,
    };
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\ArrayType", ArrayType);
