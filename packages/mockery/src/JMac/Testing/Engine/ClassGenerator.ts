// `JMac\Testing\Engine\ClassGenerator` (jasonmccreary/double v1.0.1): the generated class of a double. Internal.
//
// A class target gets `class extends Target`; a token (an interface) or an intersection of tokens a fresh class
// that carries each token's brand `Symbol.for('<FQCN>')` (as a getter, so an AD-1 token's `Symbol.hasInstance`
// holds), and the brand of every contract each token extends (`DoubleTarget.parentBrands`, ESC-10.1-6). Its name is
// `JMac\Testing\Engine\Generated\<Short>_<n>`, with the process-wide counter of ClassGenerator.php, and one generated
// class serves every double of the same targets (cached, as PHP's).
//
// Every instance method of the targets, other than a `__*` magic method outside DOUBLEABLE_MAGIC_METHODS, is
// overridden on the generated prototype by a method that calls `ProxyBehavior.intercept` with the arguments
// actually passed (`func_get_args()`). A bare symbol token lists no method, so a method is added to that double's
// own prototype when it is first configured. The control verbs (DoubleControlMethods) go on the prototype too, unless a target declares a reserved
// name: then `override` gives a bare class, which Double wraps in an OverriddenDouble, and without it
// ReservedNameCollisionException is thrown. Several targets must all be tokens (InvalidDoubleTargetException).
// Instances are made with `Object.create`, so no constructor and no field initializer runs (ESC-4.8-1 item 3).
// A token's built-ins (`DoubleTarget.builtins()`, ESC-10.2-4) get JS's protocols: with `getIterator`, the
// prototype's `[Symbol.iterator]()` iterates what the intercepted `getIterator` returns (null iterates nothing; a
// value that is not iterable throws PHP's TypeError); with `__toString`, its `toString()` (unless a target that lists
// methods declares a `toString`; a bare symbol, which declares every name, does not count) and
// `[Symbol.toPrimitive]()` return what the intercepted `__toString` returns. The `count` and `offset*` built-ins get
// no JS protocol, only their methods. A class target has none. The protocols are @xaravel/assert's
// `defineContractProtocols`, which PHPUnit's doubles share.
import { defineContractBrand, defineContractProtocols } from "@xaravel/assert";
import { FQCN } from "../../../support/values";
import { InvalidDoubleTargetException } from "../Exceptions/InvalidDoubleTargetException";
import { ReservedNameCollisionException } from "../Exceptions/ReservedNameCollisionException";
import { DoubleControlMethods } from "./DoubleControlMethods";
import type { DoubleTarget } from "./DoubleTarget";
import { ProxyBehavior } from "./ProxyBehavior";

const CONTROL = Symbol("JMac\\Testing\\DoubleInterface");

/** One generated double class. */
export interface Generated {
  readonly name: string;
  readonly prototype: object;
  /** Whether the class carries the control verbs (implements DoubleInterface). */
  readonly control: boolean;
}

let counter = 0;
const singleCache = new Map<DoubleTarget, Map<boolean, Generated>>();
const intersectionCache = new Map<string, Generated>();

function defineInterceptor(prototype: object, name: string): void {
  const interceptor = {
    [name](this: object, ...args: unknown[]): unknown {
      return ProxyBehavior.intercept(this, name, args);
    },
  }[name]!;
  Object.defineProperty(prototype, name, { value: interceptor, writable: true, enumerable: false, configurable: true });
}

/**
 * The JS protocols of the targets' built-ins (ESC-10.2-4), through @xaravel/assert's `defineContractProtocols`:
 * `[Symbol.iterator]` through the built-in `getIterator`, and `toString` (unless a target that lists methods declares
 * `toString`; a bare symbol declares every name) and `[Symbol.toPrimitive]` through the built-in `__toString`.
 */
function defineBuiltinProtocols(prototype: object, className: string, targets: readonly DoubleTarget[]): void {
  const builtin = (lower: string): string | null =>
    targets
      .filter((target) => target.builtins().has(lower))
      .flatMap((target) => target.instanceMethods())
      .find((method) => method.toLowerCase() === lower) ?? null;
  defineContractProtocols(prototype, className, {
    getIterator: builtin("getiterator"),
    toString: builtin("__tostring"),
    wireToString: !targets.some((target) => !target.acceptsAnyMethod() && target.declares("toString")),
  });
}

function isOverridable(name: string): boolean {
  return !name.startsWith("__") || ClassGenerator.DOUBLEABLE_MAGIC_METHODS.includes(name);
}

export class ClassGenerator {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\ClassGenerator";

  static readonly RESERVED_METHODS: readonly string[] = Object.freeze(["instance", "expects", "allows", "strict", "passthru", "received", "unused", "verify"]);
  static readonly DOUBLEABLE_MAGIC_METHODS: readonly string[] = Object.freeze(["__invoke", "__toString", "__serialize", "__unserialize", "__clone"]);

  static generate(target: DoubleTarget, override: boolean): Generated {
    let byOverride = singleCache.get(target);
    const known = byOverride?.get(override);
    if (known !== undefined) {
      return known;
    }
    const generated = ClassGenerator.#build([target], override);
    if (byOverride === undefined) {
      byOverride = new Map();
      singleCache.set(target, byOverride);
    }
    byOverride.set(override, generated);
    return generated;
  }

  static generateForIntersection(targets: readonly DoubleTarget[]): Generated {
    const seen = new Set<string>();
    for (const target of targets) {
      if (seen.has(target.name)) {
        throw InvalidDoubleTargetException.duplicateTarget(target.name);
      }
      seen.add(target.name);
      if (!target.isInterface()) {
        throw InvalidDoubleTargetException.mustBeInterface(target.name);
      }
    }
    const key = targets
      .map((target) => target.name)
      .sort()
      .join("&");
    const known = intersectionCache.get(key);
    if (known !== undefined) {
      return known;
    }
    const generated = ClassGenerator.#build(targets, false);
    intersectionCache.set(key, generated);
    return generated;
  }

  /** Whether `double` carries the control verbs (PHP's `instanceof DoubleInterface`). */
  static isControlled(double: object): boolean {
    return (double as Record<symbol, unknown>)[CONTROL] === true;
  }

  /**
   * A double whose bare symbol token lists no methods gets an interceptor for `method` once it is configured, on its
   * own prototype (Double gives each such double one), never on the shared generated prototype.
   */
  static ensureMethod(double: object, method: string): void {
    const prototype = Object.getPrototypeOf(double) as object;
    if (!Object.hasOwn(prototype, method)) {
      defineInterceptor(prototype, method);
    }
  }

  static #build(targets: readonly DoubleTarget[], override: boolean): Generated {
    const declared = new Set(targets.flatMap((target) => target.methodNames()));
    const collisions = ClassGenerator.RESERVED_METHODS.filter((name) => declared.has(name));
    const joined = targets.map((target) => target.name).join("&");
    if (collisions.length > 0 && !override) {
      throw ReservedNameCollisionException.forCollisions(joined, collisions);
    }
    const short = targets.map((target) => target.shortName().replace(/[^A-Za-z0-9_]/g, "_")).join("_");
    const name = `JMac\\Testing\\Engine\\Generated\\${short}_${String(++counter)}`;
    const parent = targets.length === 1 ? targets[0]!.ctor : null;
    const generated: abstract new (...args: never[]) => object = parent !== null ? class extends (parent as unknown as new () => object) {} : class {};
    Object.defineProperty(generated, "name", { value: name.slice(name.lastIndexOf("\\") + 1) });
    Object.defineProperty(generated, FQCN, { value: name });
    const prototype = generated.prototype as object;
    const overridden = new Set<string>();
    for (const target of targets) {
      for (const method of target.instanceMethods()) {
        if (!overridden.has(method) && isOverridable(method)) {
          overridden.add(method);
          defineInterceptor(prototype, method);
        }
      }
      if (target.brand !== null) {
        defineContractBrand(prototype, target.brand);
      }
      for (const brand of target.parentBrands) {
        defineContractBrand(prototype, brand);
      }
    }
    defineBuiltinProtocols(prototype, name, targets);
    const control = collisions.length === 0;
    if (control) {
      for (const verb of ["instance", "expects", "allows", "strict", "passthru"]) {
        Object.defineProperty(prototype, verb, {
          value: (DoubleControlMethods.prototype as unknown as Record<string, unknown>)[verb],
          writable: false,
          enumerable: false,
          configurable: false,
        });
      }
      Object.defineProperty(prototype, CONTROL, { value: true, writable: false, enumerable: false, configurable: false });
    }
    return { name, prototype, control };
  }
}
