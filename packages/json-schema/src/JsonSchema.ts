// Laravel's `Illuminate\JsonSchema\JsonSchema` (v13.37.0).
//
// Upstream's `__callStatic` forwards every static call to a new `JsonSchemaTypeFactory`. The port has no Proxy (AD-26),
// so the factory's eight methods are explicit static delegators here (DIV-12.22), typed as the factory types them;
// `__callStatic` stays for a name given at run time, through the runtime's `callMethod`. `fromArray` hands the raw
// schema to the `Deserializer`.
//
// `JsonSchemaTypeFactory` and every Type extend this class, and the `Deserializer` builds Types, so this module imports
// none of them as values: the factory and the Deserializer are resolved through the Class Registry when a method runs,
// as PHP's autoloader would load them.
import type { Closure, PhpArrayLike } from "@xaravel/contracts/json-schema";
import { callMethod, registerClass, resolveClass } from "@xaravel/runtime";
import type { Deserializer } from "./Deserializer";
import type { JsonSchemaTypeFactory } from "./JsonSchemaTypeFactory";
import type { AnyOfType } from "./Types/AnyOfType";
import type { ArrayType } from "./Types/ArrayType";
import type { BooleanType } from "./Types/BooleanType";
import type { IntegerType } from "./Types/IntegerType";
import type { NumberType } from "./Types/NumberType";
import type { ObjectType } from "./Types/ObjectType";
import type { StringType } from "./Types/StringType";
import type { Type } from "./Types/Type";
import type { UnionType } from "./Types/UnionType";

/** A new `JsonSchemaTypeFactory`, as `new JsonSchemaTypeFactory` in `__callStatic`. */
function factory(): JsonSchemaTypeFactory {
  const klass = resolveClass("Illuminate\\JsonSchema\\JsonSchemaTypeFactory") as unknown as new () => JsonSchemaTypeFactory;
  return new klass();
}

/** The `Deserializer` class, as `Deserializer::deserialize` in `fromArray` names it. */
function deserializer(): typeof Deserializer {
  return resolveClass("Illuminate\\JsonSchema\\Deserializer") as unknown as typeof Deserializer;
}

/** The JSON Schema builder: Laravel's `Illuminate\JsonSchema\JsonSchema`. */
export class JsonSchema {
  /**
   * Build a type from a raw array of the Laravel-supported JSON Schema subset. Throws `InvalidArgumentException` for a
   * schema outside the subset.
   */
  static fromArray(schema: PhpArrayLike): Type {
    return deserializer().deserialize(schema);
  }

  /** Create a new object schema instance. */
  static object(properties: Closure | PhpArrayLike = []): ObjectType {
    return factory().object(properties);
  }

  /** Create a new anyOf schema instance. */
  static anyOf(schemas: Closure | PhpArrayLike): AnyOfType {
    return factory().anyOf(schemas);
  }

  /** Create a new integer property instance. */
  static integer(): IntegerType {
    return factory().integer();
  }

  /** Create a new number property instance. */
  static number(): NumberType {
    return factory().number();
  }

  /** Create a new string property instance. */
  static string(): StringType {
    return factory().string();
  }

  /** Create a new boolean property instance. */
  static boolean(): BooleanType {
    return factory().boolean();
  }

  /** Create a new array property instance. */
  static array(): ArrayType {
    return factory().array();
  }

  /** Create a new multi-type union instance. */
  static union(types: PhpArrayLike): UnionType {
    return factory().union(types);
  }

  /** Dynamically pass static methods to the schema instance. */
  static __callStatic(name: string, args: unknown): Type {
    return callMethod(factory(), name, ...(args as unknown[])) as Type;
  }
}

registerClass("Illuminate\\JsonSchema\\JsonSchema", JsonSchema);
