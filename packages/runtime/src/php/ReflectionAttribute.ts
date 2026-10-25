// PHP's `ReflectionAttribute` (DIV-12.15): one `@attribute(X, ...args)` on a class, as
// `ReflectionClass.getAttributes()` lists it. `newInstance()` builds `new X(...args)` on each call, after PHP 8.5's
// checks: `X` carries `@attribute(Attribute, flags)`, the flags are valid, they allow a class target, and an
// attribute repeated on the class is `Attribute::IS_REPEATABLE`. Each failure is PHP's `Error` with PHP's message.
import { fqcn, registerClass } from "../registry/registry";
import { Attribute } from "./Attribute";
import { type AttributeEntry, ownAttributes } from "./attributes";
import { Error } from "./Error";

/** PHP's target names, by flag, in PHP's order (`zend_get_attribute_target_names`). */
const TARGET_NAMES: readonly (readonly [number, string])[] = [
  [Attribute.TARGET_CLASS, "class"],
  [Attribute.TARGET_FUNCTION, "function"],
  [Attribute.TARGET_METHOD, "method"],
  [Attribute.TARGET_PROPERTY, "property"],
  [Attribute.TARGET_CLASS_CONSTANT, "class constant"],
  [Attribute.TARGET_PARAMETER, "parameter"],
  [Attribute.TARGET_CONSTANT, "constant"],
];

export class ReflectionAttribute {
  readonly #entry: AttributeEntry;
  readonly #repeated: boolean;

  /** Built by `ReflectionClass.getAttributes()`: the entry, and whether its class appears more than once on the target. */
  constructor(entry: AttributeEntry, repeated: boolean) {
    this.#entry = entry;
    this.#repeated = repeated;
  }

  /** PHP's `getName()`: the attribute class's FQCN. */
  getName(): string {
    return fqcn(this.#entry.class);
  }

  /** PHP's `newInstance()`: a new attribute object, built from the arguments on each call. */
  newInstance(): object {
    const klass = this.#entry.class;
    const declaration = ownAttributes(klass).find((entry) => entry.class === Attribute);
    if (declaration === undefined) {
      throw new Error(`Attempting to use non-attribute class "${this.getName()}" as attribute`);
    }
    const flags: unknown = declaration.args.length === 0 ? Attribute.TARGET_ALL : declaration.args[0];
    if (typeof flags !== "number" || !Number.isInteger(flags) || flags < 0 || flags > (Attribute.TARGET_ALL | Attribute.IS_REPEATABLE)) {
      throw new Error("Invalid attribute flags specified");
    }
    if ((flags & Attribute.TARGET_CLASS) === 0) {
      const allowed = TARGET_NAMES.filter(([flag]) => (flags & flag) !== 0).map(([, name]) => name);
      throw new Error(`Attribute "${this.getName()}" cannot target class (allowed targets: ${allowed.join(", ")})`);
    }
    if (this.#repeated && (flags & Attribute.IS_REPEATABLE) === 0) {
      throw new Error(`Attribute "${this.getName()}" must not be repeated`);
    }
    return new (klass as unknown as new (...args: unknown[]) => object)(...this.#entry.args);
  }
}

registerClass("ReflectionAttribute", ReflectionAttribute);
