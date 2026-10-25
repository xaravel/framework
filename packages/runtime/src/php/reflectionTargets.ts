// What `ReflectionClass` and `ReflectionMethod` reflect (DIV-3.2): a class, or a contract token, which PHP sees as an
// interface. Internal: the package entries do not export it.
import { fqcn, isContractToken, type RegisteredClass, resolveClass, resolveContractToken } from "../registry/registry";
import { phpTypeName } from "./phpType";
import { TypeError as PhpTypeError } from "./TypeError";
import { ReflectionException } from "./ReflectionException";

/** A reflected class or contract token. */
export type ReflectionTarget = RegisteredClass | object;

/** `klass`'s Registry FQCN, or null when it is not registered (a `mixin()` layer, a JS builtin). */
export function registeredName(klass: unknown): string | null {
  if (typeof klass !== "function") {
    return null;
  }
  try {
    return fqcn(klass);
  } catch {
    return null;
  }
}

/**
 * The class registered under the name `name`, else the contract token recorded under it (`registerContractToken`,
 * ESC-13.1-7), as PHP resolves a class or interface name. Throws `ReflectionException` `Class "<name>" does not exist`,
 * the name as given, when neither holds it.
 */
export function resolveReflectionName(name: string): ReflectionTarget {
  try {
    return resolveClass(name);
  } catch {
    const token = resolveContractToken(name);
    if (token === null) {
      throw new ReflectionException(`Class "${name}" does not exist`);
    }
    return token;
  }
}

/**
 * The class or token `objectOrClass` names: a class as it is, a contract token as it is, a registered FQCN string's
 * class or a recorded token FQCN's token (`resolveReflectionName`), else an object's class. A string that names
 * neither throws `ReflectionException` `Class "<name>" does not exist`; any other value throws PHP's `TypeError`
 * `<who> must be of type object|string, <type> given`, `who` naming the PHP argument.
 */
export function reflectionTarget(objectOrClass: unknown, who: string): ReflectionTarget {
  if (typeof objectOrClass === "string") {
    return resolveReflectionName(objectOrClass);
  }
  if (typeof objectOrClass === "function" || isContractToken(objectOrClass)) {
    return objectOrClass as ReflectionTarget;
  }
  if (typeof objectOrClass === "object" && objectOrClass !== null) {
    const klass: unknown = Object.getPrototypeOf(objectOrClass)?.constructor;
    if (typeof klass === "function") {
      return klass as RegisteredClass;
    }
  }
  throw new PhpTypeError(`${who} must be of type object|string, ${phpTypeName(objectOrClass)} given`);
}

/** The parent classes of `klass` up the constructor chain, nearest first, registered or not. */
export function* classChain(klass: object): Generator<RegisteredClass> {
  for (let parent: unknown = Object.getPrototypeOf(klass); typeof parent === "function" && parent !== Function.prototype; parent = Object.getPrototypeOf(parent)) {
    yield parent as RegisteredClass;
  }
}

/** A method `findMethod` found. */
export interface FoundMethod {
  readonly fn: (...args: never[]) => unknown;
  readonly declaringClass: RegisteredClass;
}

/**
 * The method `name` of `target` (DIV-3.2, DIV-9.14): a function-valued member on its prototype chain below
 * `Object.prototype` (never `constructor`), else on its static chain below `Function.prototype`. Its declaring class is
 * the class whose prototype or static side owns it, or, for an unregistered owner (a `mixin()` layer), the nearest
 * registered class below it on the chain, as PHP names a trait method's using class. A token has none. Null when
 * none is found.
 */
export function findMethod(target: ReflectionTarget, name: string): FoundMethod | null {
  if (typeof target !== "function") {
    return null;
  }
  let last: RegisteredClass = target as RegisteredClass;
  if (name !== "constructor") {
    for (let holder: unknown = (target as { prototype?: unknown }).prototype; typeof holder === "object" && holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
      const owner: unknown = Object.getOwnPropertyDescriptor(holder, "constructor")?.value;
      if (registeredName(owner) !== null) {
        last = owner as RegisteredClass;
      }
      const descriptor = Object.getOwnPropertyDescriptor(holder, name);
      if (descriptor !== undefined && typeof descriptor.value === "function") {
        return { fn: descriptor.value as FoundMethod["fn"], declaringClass: last };
      }
    }
  }
  last = target as RegisteredClass;
  for (const klass of [target as RegisteredClass, ...classChain(target as RegisteredClass)]) {
    if (registeredName(klass) !== null) {
      last = klass;
    }
    const descriptor = Object.getOwnPropertyDescriptor(klass, name);
    if (descriptor !== undefined && typeof descriptor.value === "function") {
      return { fn: descriptor.value as FoundMethod["fn"], declaringClass: last };
    }
  }
  return null;
}
