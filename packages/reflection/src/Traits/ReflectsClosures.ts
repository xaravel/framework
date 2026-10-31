// Laravel's `Illuminate\Support\Traits\ReflectsClosures` (Story 13.1), as a runtime trait: `class X extends mixin(Base,
// ReflectsClosures)` (AD-26 Traits row). Its four methods are `protected`, as Upstream declares them.
//
// Ported line for line over `ReflectionFunction` (DIV-3.2-3.4). A closure's parameters are the keys of its
// `inject({ … }, fn)` map, in order, and its return type is its `returns(spec, fn)` Spec. A closure declared with no
// `inject` at all has no parameter list to read, so `ReflectionFunction.getParameters()` throws the runtime's
// `RuntimeException` naming the `inject({ <param>: <Spec> }, fn)` form, unchanged (DIV-3.3).
//
// Upstream builds its results with `Collection`, which does not exist before Epic 14, so this port uses plain arrays
// and objects: `closureParameterTypes` returns a plain object keyed by parameter name (the form PHP's all-string-keyed
// array takes, DIV-9.2), and the list results are JS arrays. Everything is sync.
import { Error as PhpError, registerClass, registerTrait, RuntimeException } from "@xaravel/runtime";
import { ReflectionFunction, ReflectionIntersectionType, ReflectionNamedType, ReflectionUnionType } from "@xaravel/runtime/php";
import { Reflector } from "../Reflector";

/** A PHP `Closure`: a function, declared with `inject(...)` / `returns(...)` for reflection. */
type Closure = (...args: never[]) => unknown;

/** Reflects the parameter and return types of Closures (DIV-3.2-3.4). Use it as `class X extends mixin(Base, ReflectsClosures)`. */
export class ReflectsClosures {
  /**
   * Get the class name of the first parameter of the given Closure. Throws `RuntimeException` when the Closure has no
   * parameters, or its first parameter has no class type (builtin, `primitive`, a union or variadic).
   */
  protected firstClosureParameterType(closure: Closure): string {
    const types = Object.values(this.closureParameterTypes(closure));

    if (types.length === 0) {
      throw new RuntimeException("The given Closure has no parameters.");
    }

    if (types[0] === null) {
      throw new RuntimeException("The first parameter of the given Closure is missing a type hint.");
    }

    return types[0]!;
  }

  /**
   * Get the class names of the first parameter of the given Closure, including union types. Throws
   * `RuntimeException` when the Closure has no parameters, or its first parameter names no class.
   */
  protected firstClosureParameterTypes(closure: Closure): string[] {
    const reflection = new ReflectionFunction(closure);

    const types: Record<string, string[] | null> = {};

    for (const parameter of reflection.getParameters()) {
      types[parameter.getName()] = parameter.isVariadic() ? null : Reflector.getParameterClassNames(parameter);
    }

    if (Object.keys(types).length === 0) {
      throw new RuntimeException("The given Closure has no parameters.");
    }

    const first = Object.values(types)[0];

    if (first === null || first === undefined || first.length === 0) {
      throw new RuntimeException("The first parameter of the given Closure is missing a type hint.");
    }

    return first;
  }

  /**
   * Get the class names / types of the parameters of the given Closure: an object keyed by parameter name, in order,
   * whose value is the class name, or null for a builtin, untyped, union or variadic parameter.
   */
  protected closureParameterTypes(closure: Closure): Record<string, string | null> {
    const reflection = new ReflectionFunction(closure);

    const types: Record<string, string | null> = {};

    for (const parameter of reflection.getParameters()) {
      types[parameter.getName()] = parameter.isVariadic() ? null : Reflector.getParameterClassName(parameter);
    }

    return types;
  }

  /**
   * Get the class names / types of the return type of the given Closure: its `returns(...)` class, or a union's
   * classes in order, without builtins, `self` and `static`. Empty without a return type, or for an intersection.
   */
  protected closureReturnTypes(closure: Closure): string[] {
    const reflection = new ReflectionFunction(closure);

    const returnType = reflection.getReturnType();

    if (returnType === null || returnType instanceof ReflectionIntersectionType) {
      return [];
    }

    const types = returnType instanceof ReflectionUnionType ? returnType.getTypes() : [returnType];

    return types
      .map((type) => namedTypeOf(type))
      .filter((type) => !(type.isBuiltin() || ["static", "self"].includes(type.getName())))
      .map((type) => type.getName());
  }
}

/**
 * The named type `type` is. A union's intersection member (a DNF type) has no `isBuiltin()` in PHP, so Upstream's
 * `reject` callback fails on it with PHP's `Error`; this throws the same.
 */
function namedTypeOf(type: ReflectionNamedType | ReflectionIntersectionType): ReflectionNamedType {
  if (type instanceof ReflectionNamedType) {
    return type;
  }

  throw new PhpError("Call to undefined method ReflectionIntersectionType::isBuiltin()");
}

registerTrait("Illuminate\\Support\\Traits\\ReflectsClosures", ReflectsClosures);
registerClass("Illuminate\\Support\\Traits\\ReflectsClosures", ReflectsClosures);
