// Laravel's `Illuminate\JsonSchema\Types\StringType` (v13.37.0), ported line for line. `$pattern` and `$format` share
// their names with methods, so their state is `patternProperty` and `formatProperty` (DIV-12.2).
import { registerClass } from "@xaravel/runtime";
import { OBJECT_VARS } from "../internal/objectVars";
import { Type } from "./Type";

/** A JSON schema string type: Laravel's `Illuminate\JsonSchema\Types\StringType`. */
export class StringType extends Type {
  /** The minimum length (inclusive). */
  protected minLength: number | null = null;

  /** The maximum length (inclusive). */
  protected maxLength: number | null = null;

  /** A regular expression the value must match (Upstream's `$pattern`, DIV-12.2). */
  protected patternProperty: string | null = null;

  /** The format of the string (Upstream's `$format`, DIV-12.2). */
  protected formatProperty: string | null = null;

  /** Set the minimum length (inclusive). */
  min(value: number): this {
    this.minLength = value;

    return this;
  }

  /** Set the maximum length (inclusive). */
  max(value: number): this {
    this.maxLength = value;

    return this;
  }

  /** Set the pattern the value must satisfy. */
  pattern(value: string): this {
    this.patternProperty = value;

    return this;
  }

  /** Set the format of the string. */
  format(value: string): this {
    this.formatProperty = value;

    return this;
  }

  /** Set the type's default value. */
  default(value: string): this {
    this.defaultProperty = value;

    return this;
  }

  /** Upstream's `get_object_vars($this)`: the parent's properties, then this class's (package-internal, DIV-12.2). */
  override [OBJECT_VARS](): Record<string, unknown> {
    return {
      ...super[OBJECT_VARS](),
      minLength: this.minLength,
      maxLength: this.maxLength,
      pattern: this.patternProperty,
      format: this.formatProperty,
    };
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\StringType", StringType);
