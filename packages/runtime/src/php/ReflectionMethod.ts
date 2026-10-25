// PHP's `ReflectionMethod` (DIV-3.2, DIV-9.14): a method found by name on a class's prototype chain, else its static
// chain. Its parameters come from the method function's own `@inject({ … })` map, its return type from `returns`, and
// its declaring class is the class that owns it. TypeScript's `private` and `protected` are erased, so every method
// reachable by name is public (DIV-9.14).
import { readReturnMetadata } from "../metadata/returns";
import { fqcn, registerClass } from "../registry/registry";
import { ReflectionClass } from "./ReflectionClass";
import { phpTypeName } from "./phpType";
import { ReflectionException } from "./ReflectionException";
import { TypeError as PhpTypeError } from "./TypeError";
import type { ReflectionParameter } from "./ReflectionParameter";
import { parametersOf } from "./reflectionParameters";
import { findMethod, type FoundMethod, reflectionTarget } from "./reflectionTargets";
import { type ReflectionTypeValue, typeOfSpec } from "./reflectionTypes";

export class ReflectionMethod {
  /** PHP's `$name`: the method's name. */
  readonly name: string;
  /** PHP's `$class`: the declaring class's FQCN. */
  readonly class: string;
  readonly #found: FoundMethod;

  /**
   * Reflects the method `method` of `objectOrClass` (a class, an object, a contract token or a registered FQCN).
   * Throws `ReflectionException` `Class "<name>" does not exist` for an FQCN the Registry does not hold, and
   * `Method <FQCN>::<method>() does not exist` when no such method is found.
   */
  constructor(objectOrClass: object | string, method: string) {
    const target = reflectionTarget(objectOrClass, "ReflectionMethod::__construct(): Argument #1 ($objectOrMethod)");
    if (typeof method !== "string") {
      throw new PhpTypeError(`ReflectionMethod::__construct(): Argument #2 ($method) must be of type ?string, ${phpTypeName(method)} given`);
    }
    const found = findMethod(target, method);
    if (found === null) {
      throw new ReflectionException(`Method ${fqcn(target)}::${method}() does not exist`);
    }
    this.name = method;
    this.class = fqcn(found.declaringClass);
    this.#found = found;
  }

  /** PHP's `getName()`. */
  getName(): string {
    return this.name;
  }

  /** PHP's `getDeclaringClass()`: the class that owns the method. */
  getDeclaringClass(): ReflectionClass {
    return new ReflectionClass(this.#found.declaringClass);
  }

  /**
   * PHP's `getParameters()`: one `ReflectionParameter` per key of the method's own `inject` map, in order, each
   * declared by the method's class. Throws `RuntimeException` for a method with no `inject` declaration (DIV-3.3).
   */
  getParameters(): ReflectionParameter[] {
    return parametersOf(this.#found.fn, this.getDeclaringClass(), `Method ${this.class}::${this.name}()`, "@inject({ <param>: <Spec> })");
  }

  /** PHP's `getReturnType()`: the type of the method's `returns` Spec, or null without one (DIV-3.4). */
  getReturnType(): ReflectionTypeValue | null {
    const spec = readReturnMetadata(this.#found.fn);
    return spec === null ? null : typeOfSpec(spec, "ReflectionMethod::getReturnType(): the return Spec");
  }

  /** PHP's `isPublic()`: always true, visibility being erased (DIV-9.14). */
  isPublic(): boolean {
    return true;
  }
}

registerClass("ReflectionMethod", ReflectionMethod);
