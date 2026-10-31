// Laravel's `Illuminate\JsonSchema\Serializer` (v13.37.0), ported line for line.
//
// `(fn () => get_object_vars($type))->call($type)` is the package-internal `objectVars(type)`, which gives Upstream's
// properties in PHP's declaration order (DIV-12.2), so the output's keys come in Upstream's order. `get_class($type)`
// is `fqcn()`; a class the Registry does not hold (Upstream's anonymous `new class extends Type {}`) is named as
// `get_debug_type` names it, `Illuminate\JsonSchema\Types\Type@anonymous`. `static::` is `this`. Each Type subclass
// extends `Type`, which calls this class, so `instanceof Types\X` is `is_a(type, X::class)` through the Class
// Registry, and this module imports no Type as a value. `'strval'` is `toPhpString`.
import {
  ARRAY_FILTER_USE_BOTH,
  array_filter,
  array_keys,
  array_map,
  count,
  fqcn,
  get_debug_type,
  in_array,
  is_a,
  is_array,
  RuntimeException,
  registerClass,
  toPhpString,
} from "@xaravel/runtime";
import { objectVars } from "./internal/objectVars";
import type { Type } from "./Types/Type";

const TYPE = "Illuminate\\JsonSchema\\Types\\Type";
const ANY_OF_TYPE = "Illuminate\\JsonSchema\\Types\\AnyOfType";
const ARRAY_TYPE = "Illuminate\\JsonSchema\\Types\\ArrayType";
const BOOLEAN_TYPE = "Illuminate\\JsonSchema\\Types\\BooleanType";
const INTEGER_TYPE = "Illuminate\\JsonSchema\\Types\\IntegerType";
const NUMBER_TYPE = "Illuminate\\JsonSchema\\Types\\NumberType";
const OBJECT_TYPE = "Illuminate\\JsonSchema\\Types\\ObjectType";
const STRING_TYPE = "Illuminate\\JsonSchema\\Types\\StringType";
const UNION_TYPE = "Illuminate\\JsonSchema\\Types\\UnionType";

/** PHP's `get_class($type)`: the Registry FQCN, else the anonymous class's `get_debug_type` name. */
function getClass(type: Type): string {
  try {
    return fqcn(type);
  } catch {
    return get_debug_type(type);
  }
}

/** Serializes a Type to its JSON Schema array: Laravel's `Illuminate\JsonSchema\Serializer`. */
export class Serializer {
  /** The properties to ignore when serializing. */
  protected static ignore: string[] = ["required", "nullable"];

  /**
   * Serialize the given property to an array. Throws `RuntimeException` for a Type class it does not know.
   */
  static serialize(type: Type): Record<string, unknown> {
    let attributes: Record<string, unknown> = objectVars(type);

    if (is_a(type, ANY_OF_TYPE)) {
      attributes["anyOf"] = array_map(
        (schema: Type) => this.serialize(schema),
        attributes["schemas"],
      );

      delete attributes["schemas"];

      if (this.isNullable(type)) {
        (attributes["anyOf"] as unknown[]).push({ type: "null" });
      }

      return array_filter(attributes, (value: unknown, key: string) => {
        if (in_array(key, this.ignore, true)) {
          return false;
        }

        return value !== null;
      }, ARRAY_FILTER_USE_BOTH) as Record<string, unknown>;
    }

    const typeClass = getClass(type);
    switch (typeClass) {
      case ARRAY_TYPE:
        attributes["type"] = "array";
        break;
      case BOOLEAN_TYPE:
        attributes["type"] = "boolean";
        break;
      case INTEGER_TYPE:
        attributes["type"] = "integer";
        break;
      case NUMBER_TYPE:
        attributes["type"] = "number";
        break;
      case OBJECT_TYPE:
        attributes["type"] = "object";
        break;
      case STRING_TYPE:
        attributes["type"] = "string";
        break;
      case UNION_TYPE:
        attributes["type"] = attributes["types"];
        break;
      default:
        throw new RuntimeException("Unsupported [" + typeClass + "] type.");
    }

    delete attributes["types"];

    const nullable = this.isNullable(type);

    if (nullable) {
      attributes["type"] = is_array(attributes["type"])
        ? [...(attributes["type"] as unknown[]), "null"]
        : [attributes["type"], "null"];
    }

    attributes = array_filter(attributes, (value: unknown, key: string) => {
      if (in_array(key, this.ignore, true)) {
        return false;
      }

      return value !== null;
    }, ARRAY_FILTER_USE_BOTH) as Record<string, unknown>;

    if (is_a(type, OBJECT_TYPE)) {
      if (count(attributes["properties"]) === 0) {
        delete attributes["properties"];
      } else {
        const required = array_map(
          (key: unknown) => toPhpString(key),
          array_keys(array_filter(
            attributes["properties"],
            (property: Type) => this.isRequired(property),
          )),
        ) as string[];

        if (required.length !== 0) {
          attributes["required"] = required;
        }

        attributes["properties"] = array_map(
          (property: Type) => this.serialize(property),
          attributes["properties"],
        );
      }
    }

    if (is_a(type, ARRAY_TYPE)) {
      if ((attributes["items"] ?? null) !== null && is_a(attributes["items"], TYPE)) {
        attributes["items"] = this.serialize(attributes["items"] as Type);
      }
    }

    return attributes;
  }

  /** Determine if the given type is required. */
  protected static isRequired(type: Type): boolean {
    const attributes = objectVars(type);

    return (attributes["required"] ?? null) !== null && attributes["required"] === true;
  }

  /** Determine if the given type is nullable. */
  protected static isNullable(type: Type): boolean {
    const attributes = objectVars(type);

    return (attributes["nullable"] ?? null) !== null && attributes["nullable"] === true;
  }
}

registerClass("Illuminate\\JsonSchema\\Serializer", Serializer);
