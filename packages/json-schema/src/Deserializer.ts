// Laravel's `Illuminate\JsonSchema\Deserializer` (v13.37.0), ported line for line.
//
// A schema is a PHP array in any of its three forms (DIV-9.2): a list `Array`, a string-keyed plain object or a
// `PhpArray`. Upstream reads it with `isset($a['k'])` (the key exists and its value is not `null`), `$a['k'] ?? null`,
// `unset($copy['k'])` on a by-value copy and `foreach`; the port reads it through the local `isset`, `offset`,
// `without` and the runtime's `arrayEntries`, and builds each PHP array it returns with `arrayFromEntries`, so a list
// stays a list, a string-keyed map a plain object and any other keys a `PhpArray`. Every other PHP builtin comes from
// `@xaravel/runtime/php` under its PHP name; `(int)`, `(bool)`, `(string)` and `'strval'` are `toInt`, `toBool` and
// `toPhpString`, and `$value + 0` is `plus(value, 0)`, so a numeric string becomes an int or a float as in PHP and an
// integral float keeps its float marker (DIV-9.4). `$type->{$method}(…)` calls `min`, `max` or `multipleOf` directly.
// `(fn () => $this->default = …)->call($type)` is the Type's package-internal `[ASSIGN_DEFAULT]` (DIV-12.2).
// `static::MAX_NODES` and `new static` are `this` (AD-26). Everything is synchronous (AD-6).
import { registerClass } from "@xaravel/runtime";
import {
  array_filter,
  array_flip,
  array_intersect,
  array_is_list,
  array_key_exists,
  array_keys,
  array_map,
  array_merge,
  array_unique,
  array_values,
  arrayEntries,
  arrayFromEntries,
  explode,
  floor,
  identical,
  implode,
  in_array,
  InvalidArgumentException,
  is_array,
  is_bool,
  is_float,
  is_int,
  is_numeric,
  is_string,
  normalizeKey,
  PhpArray,
  type PhpKeyInput,
  plus,
  rawurldecode,
  str_replace,
  str_starts_with,
  substr,
  toBool,
  toInt,
  toPhpString,
} from "@xaravel/runtime/php";
import type { PhpArrayLike } from "@xaravel/contracts/json-schema";
import { ASSIGN_DEFAULT } from "./internal/assignDefault";
import { AnyOfType } from "./Types/AnyOfType";
import { ArrayType } from "./Types/ArrayType";
import { BooleanType } from "./Types/BooleanType";
import { IntegerType } from "./Types/IntegerType";
import { NumberType } from "./Types/NumberType";
import { ObjectType } from "./Types/ObjectType";
import { StringType } from "./Types/StringType";
import type { Type } from "./Types/Type";
import { UnionType } from "./Types/UnionType";

/** A PHP array schema fragment, in any of its three forms (DIV-9.2). */
type Schema = PhpArrayLike;

/** An int or a float: a `number`, or an integral float with the runtime's marker (DIV-9.4). */
type PhpNumber = number | ReturnType<typeof floor>;

/** The brand of a PHP array object other than an `Array` or a plain object (AD-9). */
const PHP_ARRAY = Symbol.for("xaravel.php.array");

/**
 * PHP's `$array[$key]` read of an array, `null` when the key is absent (the read `$array[$key] ?? null` gives). The key
 * is normalised as PHP normalises it (`"1"` is `1`), then looked up by key: an index into a list, the `PhpArray`'s own
 * keyed access, or an own property of a plain object.
 */
function offset(array: unknown, key: PhpKeyInput): unknown {
  if (!is_array(array)) {
    return null;
  }

  const normalized = normalizeKey(key);
  if (Array.isArray(array)) {
    const index = typeof normalized === "bigint" ? Number(normalized) : normalized;
    return typeof index === "number" && index >= 0 && index < array.length ? ((array[index] as unknown) ?? null) : null;
  }
  if (array instanceof PhpArray) {
    return array.has(normalized) ? (array.get(normalized) ?? null) : null;
  }
  if ((array as Record<symbol, unknown>)[PHP_ARRAY] === true) {
    for (const [entryKey, value] of arrayEntries(array as object)) {
      if (entryKey === normalized) {
        return value ?? null;
      }
    }

    return null;
  }
  const name = String(normalized);

  return Object.prototype.hasOwnProperty.call(array, name) ? (((array as Record<string, unknown>)[name] as unknown) ?? null) : null;
}

/** PHP's `isset($array[$key])`: the array has the key and its value is not `null`. */
function isset(array: unknown, key: PhpKeyInput): boolean {
  return is_array(array) && offset(array, key) !== null;
}

/** PHP's `$copy = $array; unset($copy[$key]);`: a by-value copy of the array without the key. */
function without(array: Schema, key: PhpKeyInput): Schema {
  const normalized = normalizeKey(key);

  return arrayFromEntries(arrayEntries(array as object).filter(([entryKey]) => entryKey !== normalized)) as Schema;
}

/** Turns a raw JSON Schema array back into Types: Laravel's `Illuminate\JsonSchema\Deserializer`. */
export class Deserializer {
  /** The maximum number of schema fragments that may be expanded. */
  protected static readonly MAX_NODES: number = 20000;

  /** The root schema being deserialized (used to resolve local $refs). */
  protected root: Schema;

  /** The number of schema fragments expanded so far. */
  protected nodes: number = 0;

  /** The cache of resolved local "$ref" targets, keyed by reference. */
  protected refCache: Map<string, Schema> = new Map();

  /** Create a new deserializer instance. */
  protected constructor(root: Schema) {
    this.root = root;
  }

  /**
   * Deserialize the Laravel-supported JSON Schema subset into a type. Throws `InvalidArgumentException` for a schema
   * outside the subset.
   */
  static deserialize(schema: Schema): Type {
    return new this(schema).build(schema);
  }

  /** Build a type from the given schema fragment. Throws `InvalidArgumentException`. */
  protected build(schema: Schema, refs: readonly string[] = []): Type {
    const maxNodes = (this.constructor as typeof Deserializer).MAX_NODES;

    if (++this.nodes > maxNodes) {
      throw new InvalidArgumentException(
        "The JSON Schema is too large to deserialize; it expands beyond [" + toPhpString(maxNodes) + "] fragments.",
      );
    }

    [schema, refs] = this.resolveRef(schema, refs);

    const composition = this.buildAnyOfComposition(schema, refs);
    if (composition !== null) {
      this.applyCommon(composition, schema);

      return composition;
    }

    let nullableFromUnion: boolean;
    [schema, nullableFromUnion, refs] = this.normalizeUnions(schema, refs);

    const [name, nullableFromType] = this.resolveType(schema);

    let type: Type;
    if (is_array(name)) {
      this.ensureUnionConstraintsAreSupported(schema);

      type = new UnionType(name as string[]);
    } else {
      switch (name) {
        case "object":
          type = this.buildObject(schema, refs);
          break;
        case "array":
          type = this.buildArray(schema, refs);
          break;
        case "string":
          type = this.buildString(schema);
          break;
        case "integer":
          type = this.buildInteger(schema);
          break;
        case "number":
          type = this.buildNumber(schema);
          break;
        case "boolean":
          type = new BooleanType();
          break;
        default:
          throw new InvalidArgumentException("Unsupported JSON Schema type [" + toPhpString(name) + "].");
      }
    }

    this.applyCommon(type, schema);

    if (nullableFromUnion || nullableFromType) {
      type.nullable();
    }

    return type;
  }

  /**
   * Build an anyOf composition unless it is the existing nullable single-schema form. Throws
   * `InvalidArgumentException`.
   */
  protected buildAnyOfComposition(schema: Schema, refs: readonly string[] = []): AnyOfType | null {
    if (!isset(schema, "anyOf") || !is_array(offset(schema, "anyOf"))) {
      return null;
    }

    let nullable = false;
    const branches: [Schema, readonly string[]][] = [];

    for (const [, entry] of arrayEntries(offset(schema, "anyOf") as object)) {
      if (!is_array(entry)) {
        throw new InvalidArgumentException("Unable to represent the schema for an anyOf branch; boolean schemas are not supported.");
      }

      const [branch, branchRefs] = this.resolveRef(entry as Schema, refs);

      if (this.isNullBranch(branch)) {
        nullable = true;
      } else {
        branches.push([branch, branchRefs]);
      }
    }

    if (nullable && branches.length === 1) {
      return null;
    }

    const type = new AnyOfType(branches.map((branch) => this.build(branch[0], branch[1])));

    if (nullable) {
      type.nullable();
    }

    return type;
  }

  /** Build an object type from the given schema fragment. Throws `InvalidArgumentException`. */
  protected buildObject(schema: Schema, refs: readonly string[] = []): ObjectType {
    const properties: [PhpKeyInput, Type][] = [];

    if (isset(schema, "properties") && is_array(offset(schema, "properties"))) {
      const required = is_array(offset(schema, "required"))
        ? array_flip(array_map((value: unknown) => toPhpString(value), offset(schema, "required")))
        : [];

      for (const [key, definition] of arrayEntries(offset(schema, "properties") as object)) {
        if (!is_array(definition)) {
          throw new InvalidArgumentException(
            "Unable to represent the schema for property [" + toPhpString(key) + "]; boolean schemas are not supported.",
          );
        }

        const property = this.build(definition as Schema, refs);

        if (isset(required, toPhpString(key))) {
          property.required();
        }

        properties.push([key, property]);
      }
    }

    const type = new ObjectType(arrayFromEntries(properties) as PhpArrayLike);

    if ((offset(schema, "additionalProperties") ?? null) === false) {
      type.withoutAdditionalProperties();
    }

    return type;
  }

  /** Build an array type from the given schema fragment. Throws `InvalidArgumentException`. */
  protected buildArray(schema: Schema, refs: readonly string[] = []): ArrayType {
    const type = new ArrayType();

    if (isset(schema, "items") && !identical(offset(schema, "items"), [])) {
      const items = offset(schema, "items");

      if (!is_array(items) || array_is_list(items)) {
        throw new InvalidArgumentException('Tuple and boolean JSON Schema "items" are not supported.');
      }

      type.items(this.build(items as Schema, refs));
    }

    if (isset(schema, "minItems")) {
      type.min(toInt(offset(schema, "minItems")) as number);
    }

    if (isset(schema, "maxItems")) {
      type.max(toInt(offset(schema, "maxItems")) as number);
    }

    if (isset(schema, "uniqueItems")) {
      type.unique(toBool(offset(schema, "uniqueItems")));
    }

    return type;
  }

  /** Build a string type from the given schema fragment. */
  protected buildString(schema: Schema): StringType {
    const type = new StringType();

    if (isset(schema, "minLength")) {
      type.min(toInt(offset(schema, "minLength")) as number);
    }

    if (isset(schema, "maxLength")) {
      type.max(toInt(offset(schema, "maxLength")) as number);
    }

    if (isset(schema, "pattern")) {
      type.pattern(toPhpString(offset(schema, "pattern")));
    }

    if (isset(schema, "format")) {
      type.format(toPhpString(offset(schema, "format")));
    }

    return type;
  }

  /** Build an integer type from the given schema fragment. Throws `InvalidArgumentException`. */
  protected buildInteger(schema: Schema): IntegerType {
    return this.applyNumericBounds(new IntegerType(), schema, (value: PhpNumber) => this.toInteger(value));
  }

  /** Build a number type from the given schema fragment. Throws `InvalidArgumentException`. */
  protected buildNumber(schema: Schema): NumberType {
    return this.applyNumericBounds(new NumberType(), schema);
  }

  /** Apply the numeric bound keywords to the given integer or number type. Throws `InvalidArgumentException`. */
  protected applyNumericBounds<TType extends IntegerType | NumberType>(type: TType, schema: Schema, cast: ((value: PhpNumber) => PhpNumber) | null = null): TType {
    cast ??= (value: PhpNumber) => value;

    for (const [keyword, method] of [["minimum", "min"], ["maximum", "max"], ["multipleOf", "multipleOf"]] as const) {
      if (!isset(schema, keyword)) {
        continue;
      }

      const value = this.toNumber(offset(schema, keyword));
      if (value === null) {
        throw new InvalidArgumentException("The JSON Schema [" + keyword + "] constraint must be a number.");
      }

      const bound = cast(value) as number;
      switch (method) {
        case "min":
          type.min(bound);
          break;
        case "max":
          type.max(bound);
          break;
        case "multipleOf":
          type.multipleOf(bound);
          break;
      }
    }

    return type;
  }

  /** Apply the keywords shared by every type to the given instance. Throws `InvalidArgumentException`. */
  protected applyCommon(type: Type, schema: Schema): void {
    if (isset(schema, "title")) {
      type.title(toPhpString(offset(schema, "title")));
    }

    if (isset(schema, "description")) {
      type.description(toPhpString(offset(schema, "description")));
    }

    if (isset(schema, "enum") && is_array(offset(schema, "enum"))) {
      type.enum(offset(schema, "enum") as PhpArrayLike);
    }

    if (array_key_exists("default", schema)) {
      if (offset(schema, "default") === null) {
        throw new InvalidArgumentException("A null JSON Schema [default] is not supported.");
      }

      // The "default" setter is typed per concrete type, so assign it directly...
      type[ASSIGN_DEFAULT](offset(schema, "default"));
    }
  }

  /**
   * Resolve the base type name (a name, or a list of names for a multi-type union) and whether the schema is
   * nullable. Throws `InvalidArgumentException`.
   */
  protected resolveType(schema: Schema): [string | string[], boolean] {
    let type: unknown = offset(schema, "type");
    let nullable = false;

    if (is_array(type)) {
      nullable = in_array("null", type, true);

      const names = array_values(array_unique(array_map((value: unknown) => toPhpString(value), array_filter(
        type,
        (value: unknown) => value !== "null",
      )))) as string[];

      if (names.length > 1) {
        return [names, nullable];
      }

      type = names[0] ?? null;
    }

    type ??= this.inferType(schema);

    if (!is_string(type)) {
      throw new InvalidArgumentException("Unable to determine the JSON Schema type for the given schema.");
    }

    return [type as string, nullable];
  }

  /** Infer the type name when "type" is absent but the shape is unambiguous. */
  protected inferType(schema: Schema): string | null {
    if (isset(schema, "properties") || isset(schema, "additionalProperties") || isset(schema, "required")) {
      return "object";
    }

    if (isset(schema, "items") || isset(schema, "minItems") || isset(schema, "maxItems") || isset(schema, "uniqueItems")) {
      return "array";
    }

    if (isset(schema, "enum") && is_array(offset(schema, "enum"))) {
      return this.inferEnumType(offset(schema, "enum") as PhpArrayLike);
    }

    if (isset(schema, "minLength") || isset(schema, "maxLength") || isset(schema, "pattern") || isset(schema, "format")) {
      return "string";
    }

    if (isset(schema, "minimum") || isset(schema, "maximum") || isset(schema, "multipleOf")) {
      return "number";
    }

    return null;
  }

  /** Infer the scalar type shared by a homogeneous enum of scalars. */
  protected inferEnumType(enumValues: PhpArrayLike): string | null {
    let resolved: string | null = null;

    for (const [, value] of arrayEntries(enumValues as object)) {
      let current: string | null;
      if (is_bool(value)) {
        current = "boolean";
      } else if (is_int(value)) {
        current = "integer";
      } else if (is_float(value)) {
        current = "number";
      } else if (is_string(value)) {
        current = "string";
      } else {
        current = null;
      }

      if (current === null) {
        return null;
      }

      if (resolved === null || resolved === current) {
        resolved = current;

        continue;
      }

      // A mix of integers and floats is still numeric; anything else is ambiguous...
      if (in_array(resolved, ["integer", "number"], true) && in_array(current, ["integer", "number"], true)) {
        resolved = "number";

        continue;
      }

      return null;
    }

    return resolved;
  }

  /** Ensure a multi-type union carries no type-specific constraint keywords. Throws `InvalidArgumentException`. */
  protected ensureUnionConstraintsAreSupported(schema: Schema): void {
    const keywords = [
      "minLength", "maxLength", "pattern", "format",
      "minimum", "maximum", "multipleOf",
      "items", "minItems", "maxItems", "uniqueItems",
      "properties", "required", "additionalProperties",
    ];

    const unsupported = array_values(array_intersect(keywords, array_keys(schema))) as unknown[];

    if (unsupported.length !== 0) {
      throw new InvalidArgumentException(
        "Type-specific keywords [" + implode(", ", unsupported) + "] are not supported on a multi-type JSON Schema union.",
      );
    }
  }

  /**
   * Collapse "anyOf" / "oneOf" null branches into a single effective schema: the schema, whether a null branch made
   * it nullable, and the refs. Throws `InvalidArgumentException`.
   */
  protected normalizeUnions(schema: Schema, refs: readonly string[] = []): [Schema, boolean, readonly string[]] {
    for (const key of ["anyOf", "oneOf"]) {
      if (!isset(schema, key) || !is_array(offset(schema, key))) {
        continue;
      }

      let nullable = false;
      const branches: [Schema, readonly string[]][] = [];

      for (const [, entry] of arrayEntries(offset(schema, key) as object)) {
        if (!is_array(entry)) {
          continue;
        }

        const [branch, branchRefs] = this.resolveRef(entry as Schema, refs);

        if (this.isNullBranch(branch)) {
          nullable = true;
        } else {
          branches.push([branch, branchRefs]);
        }
      }

      if (!nullable || branches.length !== 1) {
        throw new InvalidArgumentException(
          'Only a nullable "' + key + '" (a single schema plus a "null" branch) is supported.',
        );
      }

      const [branch, branchRefs] = branches[0] as [Schema, readonly string[]];

      const siblings = without(schema, key);

      for (const [siblingKey, value] of arrayEntries(siblings as object)) {
        if (array_key_exists(siblingKey, branch) && !identical(offset(branch, siblingKey), value)) {
          throw new InvalidArgumentException(
            "Conflicting [" + toPhpString(siblingKey) + '] between a "' + key + '" branch and its sibling keys.',
          );
        }
      }

      return [array_merge(siblings, branch) as Schema, true, branchRefs];
    }

    return [schema, false, refs];
  }

  /** Determine if the given schema branch describes only the "null" type. */
  protected isNullBranch(branch: Schema): boolean {
    const type = offset(branch, "type");

    return type === "null" || identical(type, ["null"]);
  }

  /**
   * Resolve a local "$ref" against the root schema, merging sibling keys: the resolved schema and the refs followed.
   * Throws `InvalidArgumentException`.
   */
  protected resolveRef(schema: Schema, refs: readonly string[] = []): [Schema, readonly string[]] {
    if (!isset(schema, "$ref") || !is_string(offset(schema, "$ref"))) {
      return [schema, refs];
    }

    const ref = offset(schema, "$ref") as string;

    if (in_array(ref, refs, true)) {
      throw new InvalidArgumentException("Circular JSON Schema $ref [" + ref + "] detected.");
    }

    refs = [...refs, ref];

    const resolved = this.lookupRef(ref);

    const siblings = without(schema, "$ref");

    return this.resolveRef(array_merge(resolved, siblings) as Schema, refs);
  }

  /** Look up a local JSON pointer reference within the root schema. Throws `InvalidArgumentException`. */
  protected lookupRef(ref: string): Schema {
    const cached = this.refCache.get(ref) ?? null;
    if (cached !== null) {
      return cached;
    }

    if (ref === "#") {
      this.refCache.set(ref, this.root);

      return this.root;
    }

    if (!str_starts_with(ref, "#/")) {
      throw new InvalidArgumentException("Unable to resolve non-local JSON Schema $ref [" + ref + "].");
    }

    let target: unknown = this.root;

    for (let segment of explode("/", substr(ref, 2))) {
      segment = str_replace(["~1", "~0"], ["/", "~"], rawurldecode(segment)) as string;

      if (!is_array(target) || !array_key_exists(segment, target)) {
        throw new InvalidArgumentException("Unable to resolve JSON Schema $ref [" + ref + "].");
      }

      target = offset(target, segment);
    }

    if (!is_array(target)) {
      throw new InvalidArgumentException("The JSON Schema $ref [" + ref + "] does not point to a schema.");
    }

    this.refCache.set(ref, target as Schema);

    return target as Schema;
  }

  /** Normalize the given value to an integer or float, or null when not numeric. */
  protected toNumber(value: unknown): PhpNumber | null {
    if (is_int(value) || is_float(value)) {
      return value as PhpNumber;
    }

    if (is_string(value) && is_numeric(value)) {
      return plus(value, 0) as PhpNumber;
    }

    return null;
  }

  /** Cast the given number to an integer, rejecting non-integer values. Throws `InvalidArgumentException`. */
  protected toInteger(value: PhpNumber): number {
    if (is_float(value) && !identical(floor(value), value)) {
      throw new InvalidArgumentException("The JSON Schema integer constraint [" + toPhpString(value) + "] must be an integer.");
    }

    return toInt(value) as number;
  }
}

// @ts-expect-error TS2345: the Registry's `RegisteredClass` has a public constructor; Upstream's is protected, kept so.
registerClass("Illuminate\\JsonSchema\\Deserializer", Deserializer);
