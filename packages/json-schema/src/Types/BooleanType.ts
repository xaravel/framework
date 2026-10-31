// Laravel's `Illuminate\JsonSchema\Types\BooleanType` (v13.37.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { Type } from "./Type";

/** A JSON schema boolean type: Laravel's `Illuminate\JsonSchema\Types\BooleanType`. */
export class BooleanType extends Type {
  /** Set the type's default value. */
  default(value: boolean): this {
    this.defaultProperty = value;

    return this;
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\BooleanType", BooleanType);
