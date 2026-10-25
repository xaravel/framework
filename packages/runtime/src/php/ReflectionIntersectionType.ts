// PHP's `ReflectionIntersectionType` (DIV-3.2, DIV-3.4): the intersection type an `allOf(...)` Spec reads as.
import { registerClass } from "../registry/registry";
import type { ReflectionNamedType } from "./ReflectionNamedType";

export class ReflectionIntersectionType {
  readonly #types: readonly ReflectionNamedType[];

  /** Built by the reflection classes from the Spec's members, in order. */
  constructor(types: readonly ReflectionNamedType[]) {
    this.#types = Object.freeze([...types]);
  }

  /** PHP's `getTypes()`: the members, in declaration order. */
  getTypes(): ReflectionNamedType[] {
    return [...this.#types];
  }
}

registerClass("ReflectionIntersectionType", ReflectionIntersectionType);
