// PHP's `ReflectionParameter` (DIV-3.2, DIV-3.3): one key of an `inject` map, in order. Its Spec is its type, and a
// `variadic(spec)` Spec makes it variadic, of type `spec`. A method's parameter is declared by the method's class; a
// closure's by none (JS keeps no class scope).
import { specOf } from "../metadata/specs";
import { registerClass } from "../registry/registry";
import type { ReflectionClass } from "./ReflectionClass";
import { type ReflectionTypeValue, typeOfSpec } from "./reflectionTypes";

export class ReflectionParameter {
  /** PHP's `$name`: the parameter's name. */
  readonly name: string;
  readonly #spec: unknown;
  readonly #declaringClass: ReflectionClass | null;

  /** Built by `getParameters()`: the `inject` key, its Spec, and the declaring class or null. */
  constructor(name: string, spec: unknown, declaringClass: ReflectionClass | null) {
    this.name = name;
    this.#spec = spec;
    this.#declaringClass = declaringClass;
  }

  /** PHP's `getName()`. */
  getName(): string {
    return this.name;
  }

  /** PHP's `isVariadic()`: whether the Spec is `variadic(...)`. */
  isVariadic(): boolean {
    return specOf(this.#spec)?.kind === "variadic";
  }

  /**
   * PHP's `getType()`: the Spec's type (a variadic's element type). Throws `TypeError` for a value that is not a
   * class, a token, `String`, `Number`, `Boolean` or a Spec value.
   */
  getType(): ReflectionTypeValue {
    const info = specOf(this.#spec);
    return typeOfSpec(info?.kind === "variadic" ? info.spec : this.#spec, `ReflectionParameter::getType(): the Spec of $${this.name}`);
  }

  /** PHP's `getDeclaringClass()`: the method's class, or null for a closure. */
  getDeclaringClass(): ReflectionClass | null {
    return this.#declaringClass;
  }
}

registerClass("ReflectionParameter", ReflectionParameter);
