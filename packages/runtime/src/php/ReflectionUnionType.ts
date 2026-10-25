// PHP's `ReflectionUnionType` (DIV-3.2, DIV-3.4): the union type a `oneOf(...)` Spec reads as.
import { registerClass } from "../registry/registry";
import type { ReflectionIntersectionType } from "./ReflectionIntersectionType";
import type { ReflectionNamedType } from "./ReflectionNamedType";

export class ReflectionUnionType {
  readonly #types: readonly (ReflectionNamedType | ReflectionIntersectionType)[];

  /** Built by the reflection classes from the Spec's members, in order. */
  constructor(types: readonly (ReflectionNamedType | ReflectionIntersectionType)[]) {
    this.#types = Object.freeze([...types]);
  }

  /** PHP's `getTypes()`: the members, in declaration order; an `allOf(...)` member is a `ReflectionIntersectionType`. */
  getTypes(): (ReflectionNamedType | ReflectionIntersectionType)[] {
    return [...this.#types];
  }
}

registerClass("ReflectionUnionType", ReflectionUnionType);
