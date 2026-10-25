// Laravel's `Illuminate\Support\HigherOrderWhenProxy` (Story 12.1), what `when()` / `unless()` return when they are
// called with no callback.
//
// Upstream answers any property read or method call on the proxy through PHP's `__get` / `__call`. Both are ported as
// explicit methods, line for line. Xaravel has no Proxy outside `Model` (AD-7, AD-26), so at construction the proxy
// also gets generated delegating members (DIV-12.12): a method routed through `__call(name, args)` for each
// function-valued own property of the target and each method on its prototype chain below `Object.prototype`, and a
// getter routed through `__get(name)` for each other own string-keyed property and each prototype accessor. `constructor`, `then` (so the proxy is never a
// thenable) and every member the proxy declares are excluded, and the members are non-enumerable. A member added to
// the target later is reached only through `__call` / `__get`.
//
// State. Upstream's `$target`, `$condition`, `$hasCondition` and `$negateConditionOnCapture` keep their names as
// `#private` fields, so `condition()` and `negateConditionOnCapture()` keep theirs and no target name collides with
// them (DIV-12.12).
//
// A Promise is never a condition (DIV-1.6): a captured thenable, or one passed to `condition()`, throws a `TypeError`
// saying to await it first. Members are looked up only below `Object.prototype`, and a method is never read as a
// property, as PHP keeps the two apart.
import { Error as PhpError, normalizeNull, registerClass, toBool } from "@xaravel/runtime";
import { classNameOf, isThenable } from "./support/values";

/** The names the proxy declares itself, which are never generated (DIV-12.12). */
type ProxyMember = keyof HigherOrderWhenProxy | "constructor" | "then";

/** The target's public members that the proxy delegates (DIV-12.12). */
type Delegated<T> = Exclude<keyof T & string, ProxyMember>;

/**
 * A proxy that holds a condition (`when(value)`, `unless(value)`, or after a capture). Each delegated method returns
 * the target method's result when the condition is truthy, else the target; each delegated property returns the
 * target's value when the condition is truthy, else the target.
 */
export type ConditionedWhenProxy<T> = HigherOrderWhenProxy<T> & {
  readonly [K in Delegated<T>]: T[K] extends (...args: infer A) => infer R ? (...args: A) => R | T : T[K] | T;
};

/**
 * A proxy with no condition yet (`when()`, `unless()`). Its next delegated method call or property read captures the
 * condition, and returns the proxy holding it.
 */
export type CapturingWhenProxy<T> = HigherOrderWhenProxy<T> & {
  readonly [K in Delegated<T>]: T[K] extends (...args: infer A) => unknown ? (...args: A) => ConditionedWhenProxy<T> : ConditionedWhenProxy<T>;
};

/** Whether `value` can hold members: an object or a function. */
function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * The nearest definition of `name` on `target`: its own property, else one on its prototype chain below
 * `Object.prototype`, as a property read on the target resolves it. Null when there is none (an `Object.prototype`
 * member counts as none, as PHP objects have no such members).
 */
function memberOf(target: object, name: string): PropertyDescriptor | null {
  for (let holder: object | null = target; holder !== null && holder !== Object.prototype; holder = Object.getPrototypeOf(holder) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(holder, name);
    if (descriptor !== undefined) {
      return descriptor;
    }
  }

  return null;
}

/** Whether `descriptor` is a method: a function-valued data property. */
function isMethod(descriptor: PropertyDescriptor | null): descriptor is PropertyDescriptor & { value: (...args: unknown[]) => unknown } {
  return descriptor !== null && "value" in descriptor && typeof descriptor.value === "function";
}

/**
 * A proxy that applies the next property read or method call to its target only when a condition holds. With no
 * condition yet, the next read or call captures one instead: its result becomes the condition.
 */
export class HigherOrderWhenProxy<T = unknown> {
  /** The target being conditionally operated on. */
  readonly #target: T;

  /** The condition for proxying. */
  #condition: unknown = null;

  /** Indicates whether the proxy has a condition. */
  #hasCondition: boolean = false;

  /** Determine whether the condition should be negated. */
  #negateConditionOnCapture: boolean | null = null;

  /** Create a new proxy instance, with a delegating member for each of the target's methods and own properties (DIV-12.12). */
  constructor(target: T) {
    this.#target = target;
    this.#delegate();
  }

  /** Set the condition on the proxy. A Promise or another thenable is never a condition: it throws a `TypeError` (DIV-1.6). */
  condition(condition: unknown): this {
    if (isThenable(condition)) {
      throw new TypeError("HigherOrderWhenProxy: the condition is a Promise or another thenable; await it before calling condition()");
    }
    [this.#condition, this.#hasCondition] = [normalizeNull(condition), true];

    return this;
  }

  /** Indicate that the condition should be negated. */
  negateConditionOnCapture(): this {
    this.#negateConditionOnCapture = true;

    return this;
  }

  /**
   * Proxy accessing an attribute onto the target: Upstream's `$proxy->{$key}`. With no condition, the attribute's value
   * becomes the condition (negated when `negateConditionOnCapture()` was called) and the proxy is returned. Otherwise the
   * attribute's value when the condition is truthy, and the target when it is not. A key the target lacks is read
   * through the target's own `__get` when it has one, else as `null`.
   */
  __get(key: string): unknown {
    if (!this.#hasCondition) {
      const condition = this.#read(key);

      return this.condition(this.#capture(condition, key));
    }

    return toBool(this.#condition) ? this.#read(key) : this.#target;
  }

  /**
   * Proxy a method call on the target: Upstream's `$proxy->{$method}(...$parameters)`. With no condition, the call's
   * result becomes the condition (negated when `negateConditionOnCapture()` was called) and the proxy is returned.
   * Otherwise the call's result when the condition is truthy, and the target, without calling it, when it is not. A
   * method the target lacks goes to the target's own `__call` when it has one, else throws PHP's `Error`.
   */
  __call(method: string, parameters: unknown[]): unknown {
    if (!this.#hasCondition) {
      const condition = this.#call(method, parameters);

      return this.condition(this.#capture(condition, `${method}()`));
    }

    return toBool(this.#condition) ? this.#call(method, parameters) : this.#target;
  }

  /** The captured `condition`, negated with PHP `!` when asked; a thenable throws (DIV-1.6). */
  #capture(condition: unknown, source: string): unknown {
    if (isThenable(condition)) {
      throw new TypeError(
        `HigherOrderWhenProxy: the condition captured from ${source} is a Promise or another thenable; await it before calling when() / unless()`,
      );
    }

    return this.#negateConditionOnCapture === true ? !toBool(condition) : condition;
  }

  /**
   * `$this->target->{$key}`, with `undefined` read as `null` (AD-9). A property is an own property or a prototype accessor
   * or value that is not a method; a method name, or a key the target lacks, is read through the target's own `__get`
   * when it has one, else as `null`, as PHP keeps methods and properties apart.
   */
  #read(key: string): unknown {
    const target = this.#target as unknown;
    if (!isObjectLike(target)) {
      return null;
    }
    const member = memberOf(target, key);
    if (member !== null && !isMethod(member)) {
      return normalizeNull(Reflect.get(target, key));
    }
    const magic = memberOf(target, "__get");

    return isMethod(magic) ? normalizeNull(magic.value.call(target, key)) : null;
  }

  /**
   * `$this->target->{$method}(...$parameters)`, with an `undefined` result read as `null` (AD-9). A method is a
   * function-valued own property or prototype-chain method below `Object.prototype`; any other name goes to the
   * target's own `__call` when it has one, else throws PHP's `Error`.
   */
  #call(method: string, parameters: unknown[]): unknown {
    const target = this.#target as unknown;
    if (isObjectLike(target)) {
      const member = memberOf(target, method);
      if (isMethod(member)) {
        return normalizeNull(member.value.apply(target, parameters));
      }
      const magic = memberOf(target, "__call");
      if (isMethod(magic)) {
        return normalizeNull(magic.value.call(target, method, [...parameters]));
      }
    }

    throw new PhpError(`Call to undefined method ${classNameOf(target)}::${method}()`);
  }

  /** A method member routed through `__call(name, args)` (DIV-12.12). */
  #defineMethod(name: string): void {
    Object.defineProperty(this, name, { value: (...args: unknown[]): unknown => this.__call(name, args), writable: false, enumerable: false, configurable: true });
  }

  /** A property member routed through `__get(name)` (DIV-12.12). */
  #defineGetter(name: string): void {
    Object.defineProperty(this, name, { get: () => this.__get(name), enumerable: false, configurable: true });
  }

  /**
   * Defines the delegating members (DIV-12.12): the target's own properties first (a function-valued one as a method,
   * any other as a getter), then its prototype chain's methods and accessors (as getters); the nearest definition wins.
   */
  #delegate(): void {
    const target = this.#target as unknown;
    if (!isObjectLike(target)) {
      return;
    }
    const excluded = new Set<string>(["constructor", "then", "__proto__"]);
    for (let prototype: object | null = Object.getPrototypeOf(this) as object | null; prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype) as object | null) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        excluded.add(name);
      }
    }
    for (const name of Object.getOwnPropertyNames(target)) {
      if (excluded.has(name)) {
        continue;
      }
      excluded.add(name);
      if (isMethod(Object.getOwnPropertyDescriptor(target, name) ?? null)) {
        this.#defineMethod(name);
      } else {
        this.#defineGetter(name);
      }
    }
    for (let prototype: object | null = Object.getPrototypeOf(target) as object | null; prototype !== null && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype) as object | null) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (excluded.has(name)) {
          continue;
        }
        // The nearest definition wins, as a property read on the target resolves it: a getter here hides a method above.
        excluded.add(name);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name) ?? null;
        if (isMethod(descriptor)) {
          this.#defineMethod(name);
        } else if (descriptor !== null && typeof descriptor.get === "function") {
          this.#defineGetter(name);
        }
      }
    }
  }
}

registerClass("Illuminate\\Support\\HigherOrderWhenProxy", HigherOrderWhenProxy);
