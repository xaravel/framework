// Illuminate\Contracts\JsonSchema\JsonSchema, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { AnyOfType } from "../structural/AnyOfType";
import type { ArrayType } from "../structural/ArrayType";
import type { BooleanType } from "../structural/BooleanType";
import type { Closure } from "../structural/Closure";
import type { IntegerType } from "../structural/IntegerType";
import type { NumberType } from "../structural/NumberType";
import type { ObjectType } from "../structural/ObjectType";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { StringType } from "../structural/StringType";
import type { Type } from "../structural/Type";
import type { UnionType } from "../structural/UnionType";

declare const JsonSchemaBrand: unique symbol;

export interface JsonSchema {
  readonly [JsonSchema.brand]: true;

  /** Create a new object schema instance. */
  object(properties?: Closure | Readonly<Record<string, Type>> | PhpArrayLike): ObjectType;

  /** Create a new array property instance. */
  array(): ArrayType;

  /** Create a new string property instance. */
  string(): StringType;

  /** Create a new integer property instance. */
  integer(): IntegerType;

  /** Create a new number property instance. */
  number(): NumberType;

  /** Create a new boolean property instance. */
  boolean(): BooleanType;

  /** Create a new multi-type union instance. */
  union(types: PhpArrayLike): UnionType;

  /** Create a new anyOf schema instance. */
  anyOf(schemas: Closure | readonly Type[] | PhpArrayLike): AnyOfType;
}

export const JsonSchema = contract<JsonSchema, typeof JsonSchemaBrand>(
  "Illuminate\\Contracts\\JsonSchema\\JsonSchema",
  {
    anyOf: ["schemas"],
    array: [],
    boolean: [],
    integer: [],
    number: [],
    object: ["properties"],
    string: [],
    union: ["types"],
  },
);
