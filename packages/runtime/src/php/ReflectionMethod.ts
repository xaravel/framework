// PHP's `ReflectionMethod` (DIV-3.2, DIV-9.14): a method found by name on a class's prototype chain, else its static
// chain. Its parameters come from the method function's own `@inject({ … })` map, its return type from `returns`, and
// its declaring class is the class that owns it. TypeScript's `private` and `protected` are erased, so every method
// reachable by name is public (DIV-9.14). `invoke`, `invokeArgs` and the no-op `setAccessible` port
// `reflection_method_invoke` (action item epic-14-item-3-runtime-type-tests-functions, ESC-14.1-10): any method is
// invoked whatever its visibility, as PHP 8.1 and later do.
import { readReturnMetadata } from "../metadata/returns";
import { fqcn, isContractToken, registerClass } from "../registry/registry";
import { arrayEntries } from "./casts";
import { isClassConstructor } from "./Closure";
import { boolParameter } from "./phpArguments";
import { ReflectionClass } from "./ReflectionClass";
import { phpType, phpTypeName } from "./phpType";
import { ReflectionException } from "./ReflectionException";
import { TypeError as PhpTypeError } from "./TypeError";
import type { ReflectionParameter } from "./ReflectionParameter";
import { parametersOf } from "./reflectionParameters";
import { findMethod, type FoundMethod, type ReflectionTarget, reflectionTarget } from "./reflectionTargets";
import { type ReflectionTypeValue, typeOfSpec } from "./reflectionTypes";

export class ReflectionMethod {
  /** PHP's `$name`: the method's name. */
  readonly name: string;
  /** PHP's `$class`: the declaring class's FQCN. */
  readonly class: string;
  readonly #found: FoundMethod;
  /** The class the method was reflected on, PHP's called scope for a static method. */
  readonly #target: ReflectionTarget;

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
    this.#target = target;
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

  /**
   * PHP's `invoke($object, ...$args)`: calls the method with `args`, whatever its visibility. A static method ignores
   * `object` and runs with the reflected class as `this` (PHP's called scope); an instance method runs on `object`.
   * Throws PHP's `TypeError` for an `object` that is neither an object nor null, and PHP's `ReflectionException`
   * `Trying to invoke non static method <C>::<m>() without an object` / `Given object is not an instance of the class
   * this method was declared in`. The method's own exceptions propagate.
   */
  invoke(object: unknown = null, ...args: unknown[]): unknown {
    return this.#invoke("invoke", object, args.map((arg) => arg ?? null));
  }

  /**
   * PHP's `invokeArgs($object, $args = [])`: `invoke` with the values of the PHP array `args` as the arguments, in
   * order. A string key, PHP's named argument, throws a JS `TypeError`: named arguments are not ported. Throws PHP's
   * `TypeError` for an `args` that is no array.
   */
  invokeArgs(object: unknown = null, args: unknown = []): unknown {
    this.#checkObject("invokeArgs", object);
    if (typeof args !== "object" || args === null || isContractToken(args) || phpType(args) !== "array") {
      const type = isContractToken(args) || isClassConstructor(args) ? "string" : phpTypeName(args ?? null);
      throw new PhpTypeError(`ReflectionMethod::invokeArgs(): Argument #2 ($args) must be of type array, ${type} given`);
    }
    const values = arrayEntries(args).map(([key, value]) => {
      if (typeof key === "string") {
        throw new TypeError(`ReflectionMethod::invokeArgs(): the named argument "${key}" is not ported by Xaravel; pass the arguments as a list`);
      }
      return value ?? null;
    });
    return this.#invoke("invokeArgs", object, values);
  }

  /** PHP's `setAccessible($accessible)`: a no-op since PHP 8.1. Throws PHP's `TypeError` for an argument that is no bool. */
  setAccessible(accessible: unknown): null {
    boolParameter("ReflectionMethod::setAccessible", 1, "accessible", accessible);
    return null;
  }

  /** `Z_PARAM_OBJECT_OR_NULL`: `object` is an object (a class constructor is a class-string) or null. */
  #checkObject(method: string, object: unknown): void {
    if (object === null || object === undefined) {
      return;
    }
    const isObject = (typeof object === "function" && !isClassConstructor(object)) || (typeof object === "object" && !isContractToken(object) && phpType(object) === "object");
    if (!isObject) {
      const type = isContractToken(object) || isClassConstructor(object) ? "string" : phpTypeName(object);
      throw new PhpTypeError(`ReflectionMethod::${method}(): Argument #1 ($object) must be of type ?object, ${type} given`);
    }
  }

  /** `reflection_method_invoke`. */
  #invoke(method: string, object: unknown, args: unknown[]): unknown {
    this.#checkObject(method, object);
    const found = this.#found;
    let receiver: unknown;
    if (found.isStatic) {
      receiver = this.#target;
    } else {
      if (object === null || object === undefined) {
        throw new ReflectionException(`Trying to invoke non static method ${this.class}::${this.name}() without an object`);
      }
      if (!Function.prototype[Symbol.hasInstance].call(found.declaringClass, object)) {
        throw new ReflectionException("Given object is not an instance of the class this method was declared in");
      }
      receiver = object;
    }
    return (Reflect.apply(found.fn, receiver, args) as unknown) ?? null;
  }
}

registerClass("ReflectionMethod", ReflectionMethod);
