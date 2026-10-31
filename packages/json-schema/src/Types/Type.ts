// Laravel's `Illuminate\JsonSchema\Types\Type` (v13.37.0), ported line for line.
//
// Each Upstream property that shares its name with a method (`required`, `title`, `description`, `enum`, `nullable`,
// and `default`, which the subclasses' `default()` shares) keeps the method's name, and its state is the
// `<name>Property` field (DIV-12.2). `[OBJECT_VARS]()` gives the Serializer Upstream's `get_object_vars` view, and the
// props protocol (AD-9.6) gives PHP's `==` the same properties under their mangled protected names.
//
// `enum(class-string<BackedEnum>)` takes the enum's class-string or its class (`IntBackedEnum::class` is the class,
// AD-26); `$values::cases()` resolves a string through the Class Registry. `__toString` is `toString()` plus
// `[Symbol.toPrimitive]` (AD-26), and `json_encode` is the runtime's `jsonEncode` (AD-23).
import {
  array_column,
  array_values,
  BackedEnum,
  InvalidArgumentException,
  is_string,
  is_subclass_of,
  JSON_PRETTY_PRINT,
  jsonEncode,
  PhpArray,
  type RegisteredClass,
  registerClass,
  resolveClass,
  Stringable,
  valueCopy,
} from "@xaravel/runtime";
import type { PhpArrayLike } from "@xaravel/contracts/json-schema";
import { OBJECT_VARS } from "../internal/objectVars";
import { JsonSchema } from "../JsonSchema";
import { Serializer } from "../Serializer";

/** The props protocol key (AD-9.6), read by PHP's `==` and the grader. */
const PHP_PROPS = Symbol.for("xaravel.php.props");

/** An AD-26 enum class: a class with a static `cases()`. */
type EnumClass = RegisteredClass & { cases(): readonly unknown[] };

/** A JSON schema type: Laravel's abstract `Illuminate\JsonSchema\Types\Type`. */
export abstract class Type extends JsonSchema {
  /** Whether the type is required (Upstream's `$required`, DIV-12.2). */
  protected requiredProperty: boolean | null = null;

  /** The type's title (Upstream's `$title`, DIV-12.2). */
  protected titleProperty: string | null = null;

  /** The type's description (Upstream's `$description`, DIV-12.2). */
  protected descriptionProperty: string | null = null;

  /** The default value for the type (Upstream's `$default`, DIV-12.2). */
  protected defaultProperty: unknown = null;

  /** The set of allowed values for the type (Upstream's `$enum`, DIV-12.2). */
  protected enumProperty: unknown[] | null = null;

  /** Indicates if the type is nullable (Upstream's `$nullable`, DIV-12.2). */
  protected nullableProperty: boolean | null = null;

  /** The `Stringable` brand PHP gives a class with `__toString` (AD-9.5). */
  get [Stringable.brand](): true {
    return true;
  }

  /** Indicate that the type is required. */
  required(required: boolean = true): this {
    this.requiredProperty = required ? required : null;

    return this;
  }

  /** Indicate that the type is optional. */
  nullable(nullable: boolean = true): this {
    this.nullableProperty = nullable ? nullable : null;

    return this;
  }

  /** Set the type's title. */
  title(value: string): this {
    this.titleProperty = value;

    return this;
  }

  /** Set the type's description. */
  description(value: string): this {
    this.descriptionProperty = value;

    return this;
  }

  /**
   * Restrict the value to one of the provided enumerated values: a list of values, or a `BackedEnum`'s class-string
   * or class, whose cases' values are taken. Throws `InvalidArgumentException` for a class that is no `BackedEnum`.
   */
  enum(values: PhpArrayLike | string | RegisteredClass): this {
    if (is_string(values) || typeof values === "function") {
      if (!is_subclass_of(values, BackedEnum)) {
        throw new InvalidArgumentException("The provided class must be a BackedEnum.");
      }

      const enumClass = (typeof values === "function" ? values : resolveClass(values as string)) as EnumClass;
      values = array_column(enumClass.cases(), "value") as unknown[];
    }

    // Keep order and allow complex values (arrays / objects) without forcing uniqueness...
    this.enumProperty = array_values(valueCopy(values));

    return this;
  }

  /** Convert the type to an array. */
  toArray(): Record<string, unknown> {
    return Serializer.serialize(this);
  }

  /** Convert the type to its string representation. */
  toString(): string {
    const json = jsonEncode(this.toArray(), JSON_PRETTY_PRINT);

    return json === false ? "" : json;
  }

  /** The string representation for a string conversion (Upstream's `__toString`, AD-26). */
  [Symbol.toPrimitive](_hint: string): string {
    return this.toString();
  }

  /** Upstream's `get_object_vars($this)`: the properties in PHP's declaration order (package-internal, DIV-12.2). */
  [OBJECT_VARS](): Record<string, unknown> {
    return valueCopy({
      required: this.requiredProperty,
      title: this.titleProperty,
      description: this.descriptionProperty,
      default: this.defaultProperty,
      enum: this.enumProperty,
      nullable: this.nullableProperty,
    });
  }

  /** The props protocol (AD-9.6): the PHP properties PHP's `==` reads, with their mangled protected names. */
  [PHP_PROPS](): PhpArray {
    return new PhpArray(Object.entries(this[OBJECT_VARS]()).map(([name, value]) => [`\0*\0${name}`, value]));
  }
}

registerClass("Illuminate\\JsonSchema\\Types\\Type", Type);
