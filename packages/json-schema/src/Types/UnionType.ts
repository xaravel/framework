// Laravel's `Illuminate\JsonSchema\Types\UnionType` (v13.37.0), ported line for line. `$types` shares its name with its
// getter, so its state is `typesProperty` (DIV-12.2). `array_map('strval', …)` is `toPhpString` over the members.
import type { PhpArrayLike } from "@xaravel/contracts/json-schema";
import { array_filter, array_map, array_unique, array_values, in_array, InvalidArgumentException, registerClass, toPhpString } from "@xaravel/runtime";
import { OBJECT_VARS } from "../internal/objectVars";
import { Type } from "./Type";

/** A JSON schema multi-type union: Laravel's `Illuminate\JsonSchema\Types\UnionType`. */
export class UnionType extends Type {
  /** The JSON Schema primitive type names a union may be composed of. */
  static readonly SUPPORTED: readonly string[] = Object.freeze(["string", "integer", "number", "boolean", "object", "array"]);

  /** The union's member type names (Upstream's `$types`, DIV-12.2). */
  protected typesProperty: string[];

  /**
   * Create a new union type instance. Throws `InvalidArgumentException` for a member that is no supported type name;
   * a `'null'` member makes the type nullable instead.
   */
  constructor(types: PhpArrayLike) {
    super();
    let names = array_map((type: unknown) => toPhpString(type), types) as PhpArrayLike;

    if (in_array("null", names, true)) {
      this.nullable();

      names = array_filter(names, (name: string) => name !== "null") as PhpArrayLike;
    }

    for (const name of array_values(names) as string[]) {
      if (!in_array(name, UnionType.SUPPORTED, true)) {
        throw new InvalidArgumentException(`Unsupported JSON Schema type [${name}] in a multi-type union.`);
      }
    }

    this.typesProperty = array_values(array_unique(names)) as string[];
  }

  /** Get the union's member type names. */
  types(): string[] {
    return [...this.typesProperty];
  }

  /** Upstream's `get_object_vars($this)`: the parent's properties, then this class's (package-internal, DIV-12.2). */
  override [OBJECT_VARS](): Record<string, unknown> {
    return {
      ...super[OBJECT_VARS](),
      types: [...this.typesProperty],
    };
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\UnionType", UnionType);
