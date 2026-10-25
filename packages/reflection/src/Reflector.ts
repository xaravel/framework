// Laravel's `Illuminate\Support\Reflector` (Story 13.1), ported line for line over `@xaravel/runtime`'s PHP reflection
// classes (DIV-3.2). TypeScript erases types, so a parameter's type is the Spec its `inject` map declares, read through
// `ReflectionParameter.getType()`; a class or contract token is named by its `fqcn()`, and `String`, `Number`,
// `Boolean` and `primitive` are builtin (DIV-3.3). `static::` is `this`, PHP's bare `return;` is `return null`, and
// `array_filter` drops PHP-falsy names (`toBool`).
//
// - `class_exists($n) || interface_exists($n)` is "the Class Registry resolves `n`" (`resolveClass`). A contract
//   token's FQCN is not in the Registry, so a token-typed parameter never passes `isParameterSubclassOf` yet
//   (ESC-13.1-7).
// - `isCallable` follows DIV-9.14: a class is a registered constructor or an FQCN string, visibility is erased, and a
//   non-array string is callable only as a `'Class::method'` string (or under `syntaxOnly`).
// - `getClassAttributes` returns a `Collection`, which does not exist before Epic 14, so it throws
//   `BlockedByComponentError("collections")`. `getClassAttribute` builds the same per-class instance lists as plain
//   arrays and takes the first instance (ESC-13.1-4's ruling, DIV-12.15).
// - `isParameterBackedEnumWithStringBackingType` is not ported: it needs an enum model and `ReflectionEnum`
//   (ESC-13.1-8).
//
// Everything is sync, and `null` is the only absent value.
import type { Collection } from "@xaravel/contracts/bus";
import { BlockedByComponentError, fqcn, registerClass, resolveClass, toBool } from "@xaravel/runtime";
import { ReflectionClass, ReflectionException, ReflectionMethod, ReflectionNamedType, type ReflectionParameter, ReflectionUnionType } from "@xaravel/runtime/php";

/** A class, as `getAttributes` filters by it. */
type AttributeClass = abstract new (...args: never[]) => unknown;

/** PHP's `is_object($v)`: an object that is not a PHP array (a JS array or a plain object literal, DIV-9.2). */
function isObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype !== null && prototype !== Object.prototype;
}

/** PHP's `is_array($v)`: a JS array, or a plain object literal (DIV-9.2). */
function isArray(value: unknown): value is Record<PropertyKey, unknown> {
  if (Array.isArray(value)) {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/** Whether `klass` is a constructor the Class Registry names (AD-10): a class PHP could name. */
function isRegisteredClass(klass: unknown): klass is abstract new (...args: never[]) => unknown {
  if (typeof klass !== "function") {
    return false;
  }
  try {
    fqcn(klass);
    return true;
  } catch {
    return false;
  }
}

/**
 * PHP's `class_exists($class) || interface_exists($class)` (DIV-9.14): a registered constructor, or an FQCN string the
 * Class Registry resolves.
 */
function classExists(klass: unknown): boolean {
  if (typeof klass === "string") {
    try {
      resolveClass(klass);
      return true;
    } catch {
      return false;
    }
  }
  return isRegisteredClass(klass);
}

/** PHP's `method_exists($class, $method)`: whether `new ReflectionMethod(class, method)` finds it. */
function methodExists(klass: object | string, method: string): boolean {
  try {
    new ReflectionMethod(klass, method);
    return true;
  } catch (error) {
    if (error instanceof ReflectionException) {
      return false;
    }
    throw error;
  }
}

/**
 * Laravel's reflection helpers: whether a value is callable, a class's attributes, and the class names a parameter's
 * declared type gives (DIV-3.2).
 */
export class Reflector {
  /**
   * PHP 7.4's `is_callable` (DIV-9.14). A non-array value is callable when it is a function (other than a registered
   * class, which stands for its class-string), an object whose `__invoke` is a function, or a `'Class::method'` string
   * that the array rules accept as `[Class, method]` with no object; under `syntaxOnly`, any string is callable. An
   * array `[classOrObject, method]` is callable when the class (a registered constructor, an object's class, or an
   * FQCN string the Class Registry resolves) has the method, or when it has `__call` (for an object) or
   * `__callStatic` (for a class). Visibility is erased, so every method found is public; a `#private` method is never
   * found. Never throws.
   */
  static isCallable(variable: unknown, syntaxOnly: boolean = false): boolean {
    if (!isArray(variable)) {
      return isCallableValue(variable, syntaxOnly);
    }

    const first: unknown = variable[0] ?? null;
    const second: unknown = variable[1] ?? null;

    if (first === null || second === null || typeof second !== "string") {
      return false;
    }

    if (syntaxOnly && (typeof first === "string" || isObject(first)) && typeof second === "string") {
      return true;
    }

    const klass: unknown = isObject(first) ? (Object.getPrototypeOf(first) as { constructor: unknown }).constructor : first;

    const method = second;

    if (!classExists(klass)) {
      return false;
    }

    const reflected = klass as object | string;

    if (methodExists(reflected, method)) {
      return new ReflectionMethod(reflected, method).isPublic();
    }

    if (isObject(first) && methodExists(reflected, "__call")) {
      return new ReflectionMethod(reflected, "__call").isPublic();
    }

    if (!isObject(first) && methodExists(reflected, "__callStatic")) {
      return new ReflectionMethod(reflected, "__callStatic").isPublic();
    }

    return false;
  }

  /**
   * Get the specified class attribute, optionally following an inheritance chain: the first `attribute` instance on
   * `objectOrClass`'s own `@attribute(...)` list, then, when `ascend` is true, on each parent class's, or null.
   * Every matching attribute on the walked classes is built first (`newInstance()`), as Upstream builds the whole
   * collection (DIV-12.15). Throws `ReflectionException` for an FQCN the Class Registry does not hold.
   */
  static getClassAttribute<T extends object>(objectOrClass: object | string, attribute: abstract new (...args: never[]) => T, ascend: boolean = false): T | null {
    const instances = this.classAttributeLists(objectOrClass, attribute, ascend).flatMap(([, list]) => list);

    return (instances[0] as T | undefined) ?? null;
  }

  /**
   * Get the specified class attribute(s), optionally following an inheritance chain. Upstream returns a `Collection`
   * (of instances, or keyed by class name when `includeParents` is true), and Collections (Epic 14) is not ported yet,
   * so this throws `BlockedByComponentError("collections")`.
   */
  static getClassAttributes(objectOrClass: object | string, attribute: AttributeClass, includeParents: boolean = false): Collection {
    void objectOrClass;
    void attribute;
    void includeParents;

    throw new BlockedByComponentError("collections", "Reflector::getClassAttributes() returns an Illuminate\\Support\\Collection");
  }

  /**
   * The attribute instances of each walked class, keyed by its FQCN in walk order: `objectOrClass`'s, then each
   * parent's when `includeParents` is true. Upstream's `getClassAttributes` loop, as plain arrays.
   */
  private static classAttributeLists(objectOrClass: object | string, attribute: AttributeClass, includeParents: boolean): [string, object[]][] {
    let reflectionClass: ReflectionClass | false = new ReflectionClass(objectOrClass);

    const attributes: [string, object[]][] = [];

    do {
      attributes.push([reflectionClass.name, reflectionClass.getAttributes(attribute).map((reflectionAttribute) => reflectionAttribute.newInstance())]);
    } while (includeParents && false !== (reflectionClass = reflectionClass.getParentClass()));

    return attributes;
  }

  /**
   * Get the class name of the given parameter's type, if possible: the FQCN of a class or token, with `self` /
   * `parent` resolved against the declaring class. Null for a builtin (`String`, `Number`, `Boolean`, `primitive`) or a
   * union.
   */
  static getParameterClassName(parameter: ReflectionParameter): string | null {
    const type = parameter.getType();

    if (!(type instanceof ReflectionNamedType) || type.isBuiltin()) {
      return null;
    }

    return this.getTypeName(parameter, type);
  }

  /** Get the class names of the given parameter's type, including union types; builtin members are dropped. */
  static getParameterClassNames(parameter: ReflectionParameter): string[] {
    const type = parameter.getType();

    if (!(type instanceof ReflectionUnionType)) {
      return [this.getParameterClassName(parameter)].filter((name): name is string => toBool(name));
    }

    const unionTypes: string[] = [];

    for (const listedType of type.getTypes()) {
      if (!(listedType instanceof ReflectionNamedType) || listedType.isBuiltin()) {
        continue;
      }

      unionTypes.push(this.getTypeName(parameter, listedType));
    }

    return unionTypes.filter((name) => toBool(name));
  }

  /**
   * Get the given type's class name: `self` is the declaring class's FQCN, `parent` its parent's when it has one;
   * any other name, or a closure's parameter (no declaring class), is returned as it is.
   */
  protected static getTypeName(parameter: ReflectionParameter, type: ReflectionNamedType): string {
    const name = type.getName();

    const klass = parameter.getDeclaringClass();

    if (klass !== null) {
      if (name === "self") {
        return klass.getName();
      }

      if (name === "parent") {
        const parent = klass.getParentClass();

        if (parent !== false) {
          return parent.getName();
        }
      }
    }

    return name;
  }

  /**
   * Determine if the parameter's type is a subclass of the given type (a class, a token, or an FQCN). The parameter's
   * class name must resolve through the Class Registry, so a token-typed parameter gives false (ESC-13.1-7). Throws
   * `ReflectionException` for a `className` FQCN the Registry does not hold, as PHP does.
   */
  static isParameterSubclassOf(parameter: ReflectionParameter, className: object | string): boolean {
    const paramClassName = this.getParameterClassName(parameter);

    return toBool(paramClassName) && classExists(paramClassName) && new ReflectionClass(paramClassName as string).isSubclassOf(className);
  }
}

/**
 * PHP's `is_callable($var, $syntaxOnly)` for a non-array value (DIV-9.14): a function that is not a registered class,
 * an object whose `__invoke` is a function, or a string (any string under `syntaxOnly`, else a `'Class::method'`
 * string `Reflector.isCallable([Class, method])` accepts). A registered class stands for its class-string.
 */
function isCallableValue(value: unknown, syntaxOnly: boolean): boolean {
  if (typeof value === "function") {
    return syntaxOnly || !isRegisteredClass(value);
  }

  if (isObject(value)) {
    return typeof (value as { __invoke?: unknown }).__invoke === "function";
  }

  if (typeof value !== "string") {
    return false;
  }

  if (syntaxOnly) {
    return true;
  }

  const separator = value.indexOf("::");

  if (separator <= 0) {
    return false;
  }

  return Reflector.isCallable([value.slice(0, separator), value.slice(separator + 2)]);
}

registerClass("Illuminate\\Support\\Reflector", Reflector);
