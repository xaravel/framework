// PHP's `ReflectionClass` (DIV-3.2, DIV-12.15) over a class or a contract token, which PHP sees as an interface. A
// class's parents are its registered ancestors on the constructor chain: an unregistered one (a `mixin()` layer, the
// JS `Error`) is skipped. Its attributes are its own `@attribute(...)` list.
import { fqcn, isContractToken, type RegisteredClass, registerClass, resolveClass } from "../registry/registry";
import { ownAttributes } from "./attributes";
import { hasBrand } from "./hasBrand";
import { ReflectionAttribute } from "./ReflectionAttribute";
import { ReflectionException } from "./ReflectionException";
import { ReflectionMethod } from "./ReflectionMethod";
import { phpTypeName } from "./phpType";
import { TypeError as PhpTypeError } from "./TypeError";
import { classChain, type ReflectionTarget, reflectionTarget, registeredName } from "./reflectionTargets";

/** A contract token's parent tokens (`@xaravel/contracts`' `CONTRACT_PARENTS`), read without importing contracts. */
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** The parent tokens `token` extends, nearest first, each once. */
function tokenAncestors(token: object): object[] {
  const seen: object[] = [];
  const queue: unknown[] = [token];
  while (queue.length > 0) {
    const parents: unknown = (queue.shift() as Record<symbol, unknown>)[CONTRACT_PARENTS];
    for (const parent of Array.isArray(parents) ? (parents as unknown[]) : []) {
      if (isContractToken(parent) && parent !== token && !seen.includes(parent)) {
        seen.push(parent);
        queue.push(parent);
      }
    }
  }
  return seen;
}

export class ReflectionClass {
  /** PHP's `$name`: the FQCN. */
  readonly name: string;
  readonly #target: ReflectionTarget;

  /**
   * Reflects `objectOrClass`: a class, an object's class, a contract token, or the class a registered FQCN names.
   * Throws `ReflectionException` `Class "<name>" does not exist` for an FQCN the Registry does not hold (a token's
   * FQCN included, a token being no registered class).
   */
  constructor(objectOrClass: object | string) {
    this.#target = reflectionTarget(objectOrClass, "ReflectionClass::__construct(): Argument #1 ($objectOrClass)");
    this.name = fqcn(this.#target);
  }

  /** PHP's `getName()`: the FQCN. */
  getName(): string {
    return this.name;
  }

  /** PHP's `getParentClass()`: the nearest registered ancestor class, or `false` when there is none (a token's case). */
  getParentClass(): ReflectionClass | false {
    if (typeof this.#target !== "function") {
      return false;
    }
    for (const parent of classChain(this.#target)) {
      if (registeredName(parent) !== null) {
        return new ReflectionClass(parent);
      }
    }
    return false;
  }

  /**
   * PHP's `isSubclassOf(class)`, `class` a class, a token, a `ReflectionClass` or a registered FQCN: a class against a
   * class is its strict constructor chain; a class against a token is `hasBrand`; a token against a token walks the
   * token's parents. Never itself. An FQCN the Registry does not hold throws `ReflectionException`, any other value
   * PHP's `TypeError`.
   */
  isSubclassOf(klass: object | string): boolean {
    let other: unknown;
    if (klass instanceof ReflectionClass) {
      other = klass.#target;
    } else if (typeof klass === "string") {
      try {
        other = resolveClass(klass);
      } catch {
        throw new ReflectionException(`Class "${klass}" does not exist`);
      }
    } else if (typeof klass === "function" || isContractToken(klass)) {
      other = klass;
    } else {
      throw new PhpTypeError(`ReflectionClass::isSubclassOf(): Argument #1 ($class) must be of type ReflectionClass|string, ${phpTypeName(klass)} given`);
    }
    const self = this.#target;
    if (other === self) {
      return false;
    }
    if (typeof self === "function") {
      if (typeof other === "function") {
        return [...classChain(self)].includes(other as RegisteredClass);
      }
      return hasBrand(self, other);
    }
    return isContractToken(other) && tokenAncestors(self).includes(other);
  }

  /** PHP's `getMethod(name)`. Throws `ReflectionException` `Method <FQCN>::<name>() does not exist` when none is found. */
  getMethod(name: string): ReflectionMethod {
    return new ReflectionMethod(this.#target, name);
  }

  /**
   * PHP's `getAttributes(filter)` (DIV-12.15): the class's own `@attribute(...)` entries, in source order, those whose
   * class is `filter` or extends it when `filter` is given. Never a parent's. Throws `TypeError` for a `filter` that is
   * not a class.
   */
  getAttributes(filter: (abstract new (...args: never[]) => unknown) | null = null): ReflectionAttribute[] {
    if (filter !== null && typeof filter !== "function") {
      throw new TypeError("ReflectionClass::getAttributes(): the filter must be an attribute class (DIV-12.15)");
    }
    const own = ownAttributes(this.#target);
    return own
      .filter((entry) => filter === null || entry.class === filter || entry.class.prototype instanceof filter)
      .map((entry) => new ReflectionAttribute(entry, own.filter((other) => other.class === entry.class).length > 1));
  }
}

registerClass("ReflectionClass", ReflectionClass);
