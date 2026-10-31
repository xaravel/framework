// Laravel's `Illuminate\JsonSchema\JsonSchemaTypeFactory` (v13.37.0), ported line for line. It implements the
// `Illuminate\Contracts\JsonSchema\JsonSchema` contract through its brand getter (AD-1). A `Closure` argument is any JS
// function, called with the factory as Upstream calls it.
import { type Closure, JsonSchema as JsonSchemaContract, type PhpArrayLike } from "@xaravel/contracts/json-schema";
import { registerClass } from "@xaravel/runtime";
import { JsonSchema } from "./JsonSchema";
import { AnyOfType } from "./Types/AnyOfType";
import { ArrayType } from "./Types/ArrayType";
import { BooleanType } from "./Types/BooleanType";
import { IntegerType } from "./Types/IntegerType";
import { NumberType } from "./Types/NumberType";
import { ObjectType } from "./Types/ObjectType";
import { StringType } from "./Types/StringType";
import { UnionType } from "./Types/UnionType";

/** The factory behind `JsonSchema`'s static builders: Laravel's `Illuminate\JsonSchema\JsonSchemaTypeFactory`. */
export class JsonSchemaTypeFactory extends JsonSchema implements JsonSchemaContract {
  /** The `JsonSchemaContract` brand: an `instanceof JsonSchemaContract` check finds this class (AD-9.5). */
  get [JsonSchemaContract.brand](): true {
    return true;
  }

  /** Create a new object schema instance. */
  object(properties: Closure | PhpArrayLike = []): ObjectType {
    if (typeof properties === "function") {
      properties = (properties as (schema: JsonSchemaTypeFactory) => PhpArrayLike)(this);
    }

    return new ObjectType(properties);
  }

  /** Create a new array property instance. */
  array(): ArrayType {
    return new ArrayType();
  }

  /** Create a new string property instance. */
  string(): StringType {
    return new StringType();
  }

  /** Create a new integer property instance. */
  integer(): IntegerType {
    return new IntegerType();
  }

  /** Create a new number property instance. */
  number(): NumberType {
    return new NumberType();
  }

  /** Create a new boolean property instance. */
  boolean(): BooleanType {
    return new BooleanType();
  }

  /** Create a new multi-type union instance. */
  union(types: PhpArrayLike): UnionType {
    return new UnionType(types);
  }

  /** Create a new anyOf schema instance. */
  anyOf(schemas: Closure | PhpArrayLike): AnyOfType {
    if (typeof schemas === "function") {
      schemas = (schemas as (schema: JsonSchemaTypeFactory) => PhpArrayLike)(this);
    }

    return new AnyOfType(schemas);
  }
}

registerClass("Illuminate\\JsonSchema\\JsonSchemaTypeFactory", JsonSchemaTypeFactory);
