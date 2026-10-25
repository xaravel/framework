// PHP's `Attribute` (DIV-12.15): the attribute that marks a class as an attribute class, with PHP 8.5's flags. A
// class used as `@attribute(X, ...)` must itself carry `@attribute(Attribute, flags)` for
// `ReflectionAttribute.newInstance()` to build it. `Attribute` is itself an attribute class targeting classes, as
// PHP's internal `#[Attribute(Attribute::TARGET_CLASS)]` declares it.
import { registerClass } from "../registry/registry";
import { declareOwnAttribute } from "./attributes";

export class Attribute {
  static readonly TARGET_CLASS = 1;
  static readonly TARGET_FUNCTION = 2;
  static readonly TARGET_METHOD = 4;
  static readonly TARGET_PROPERTY = 8;
  static readonly TARGET_CLASS_CONSTANT = 16;
  static readonly TARGET_PARAMETER = 32;
  static readonly TARGET_CONSTANT = 64;
  static readonly TARGET_ALL = 127;
  static readonly IS_REPEATABLE = 128;

  /** PHP's `$flags`: the targets the attribute allows, and whether it repeats. */
  flags: number;

  constructor(flags: number = Attribute.TARGET_ALL) {
    this.flags = flags;
  }
}

declareOwnAttribute(Attribute, Attribute, [Attribute.TARGET_CLASS]);

registerClass("Attribute", Attribute);
