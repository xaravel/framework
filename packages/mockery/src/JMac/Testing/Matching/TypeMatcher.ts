// `JMac\Testing\Matching\TypeMatcher` (jasonmccreary/double v1.0.1): `Argument.type(name)`. A builtin name runs PHP's
// `is_<name>` over the AD-9 value model (a safe integer is an int, any other number a float, DIV-9); `mixed` matches
// anything; any other name is `instanceof` by name (or carries the contract brand `Symbol.for(name)`, AD-1), and a
// class or a contract token is `instanceof` it.
import { classNameOf, FQCN, getDebugType, instanceOfName, isBrandedArray, isClass, isClosure, isPhpArray, isPhpObject } from "../../../support/values";
import { Matcher } from "./Matcher";

type AnyClass = abstract new (...args: never[]) => object;

/**
 * A class, or an AD-1 contract token: a frozen, non-function object with an own, non-writable string
 * `Symbol.for('xaravel.class.fqcn')` (@xaravel/assert's `isContractToken`), whose `Symbol.hasInstance` reads its brand.
 */
export type TypeTarget = AnyClass | { readonly [Symbol.hasInstance]: (value: unknown) => boolean };

function builtin(name: string, actual: unknown): boolean | null {
  switch (name) {
    case "int":
      return (typeof actual === "number" && Number.isSafeInteger(actual)) || typeof actual === "bigint";
    case "float":
      return typeof actual === "number" && !Number.isSafeInteger(actual);
    case "string":
      return typeof actual === "string";
    case "bool":
      return typeof actual === "boolean";
    case "array":
      return isPhpArray(actual);
    case "object":
      return isPhpObject(actual);
    case "callable":
      return isClosure(actual);
    case "iterable":
      return isPhpArray(actual) || isBrandedArray(actual) || (isPhpObject(actual) && typeof (actual as Record<symbol, unknown>)[Symbol.iterator] === "function");
    case "null":
      return actual === null;
    default:
      return null;
  }
}

export class TypeMatcher extends Matcher {
  static override readonly [FQCN]: string = "JMac\\Testing\\Matching\\TypeMatcher";

  readonly #type: string | TypeTarget;

  constructor(type: string | TypeTarget) {
    super();
    this.#type = type;
  }

  #name(): string {
    if (typeof this.#type === "string") {
      return this.#type;
    }
    const brand: unknown = (this.#type as unknown as Record<symbol, unknown>)[FQCN];
    return typeof brand === "string" ? brand : (classNameOf(this.#type) ?? "class@anonymous");
  }

  matches(actual: unknown): boolean {
    if (typeof this.#type !== "string") {
      return (isClass(this.#type) || typeof this.#type === "object") && isPhpObject(actual) && actual instanceof (this.#type as AnyClass);
    }
    const lower = this.#type.toLowerCase();
    if (lower === "mixed") {
      return true;
    }
    const byBuiltin = builtin(lower, actual);
    if (byBuiltin !== null) {
      return byBuiltin;
    }
    return isPhpObject(actual) && (instanceOfName(actual, this.#type) || (actual as Record<symbol, unknown>)[Symbol.for(this.#type.replace(/^\\/, ""))] === true);
  }

  describe(): string {
    return `type(${this.#name()})`;
  }

  explainMismatch(actual: unknown): string | null {
    if (this.matches(actual)) {
      return null;
    }
    return `expected type ${this.#name()}, got ${getDebugType(actual)}`;
  }
}
