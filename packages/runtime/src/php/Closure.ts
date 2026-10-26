// PHP's `Closure` (action item epic-14-item-3-runtime-type-tests-functions, ESC-14.1-9). A PHP closure is a JS function
// that is not a class constructor (AD-9, DIV-12.19): a class value stands for its class-string, as Reflector treats a
// registered class, and a JS class cannot be called without `new`, so it is no Closure. A plain, arrow, bound, async or
// generator function is one; a native constructor such as `Map` reads as a function, so it is one too. `x instanceof
// Closure` is that test, and `new Closure()` throws PHP's `Error`, as PHP refuses to instantiate the class. It is
// registered as `Closure`, and is not in `Symbol.for('xaravel.php.classes')`.
import { registerClass } from "../registry/registry";
import { Error as PhpError } from "./Error";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** Whether a function's source is a `class`, per function: the source never changes, so it is read once. */
const classSource = new WeakMap<object, boolean>();

/**
 * Whether `value` is a class constructor, which stands for its class-string: a function that carries its own Registry
 * FQCN key, or whose `Function.prototype.toString` source is a `class`. Internal.
 */
export function isClassConstructor(value: unknown): boolean {
  if (typeof value !== "function") {
    return false;
  }
  if (Object.hasOwn(value, CLASS_FQCN)) {
    return true;
  }
  let isClass = classSource.get(value);
  if (isClass === undefined) {
    isClass = /^class\b/.test(Function.prototype.toString.call(value));
    classSource.set(value, isClass);
  }
  return isClass;
}

/** Whether `value` is a PHP Closure: a function that is not a class constructor. Internal. */
export function isClosureValue(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function" && !isClassConstructor(value);
}

export class Closure {
  /** `x instanceof Closure`: true exactly for a function that is not a class constructor. */
  static [Symbol.hasInstance](value: unknown): boolean {
    return isClosureValue(value);
  }

  /** PHP refuses `new Closure()`: throws PHP's `Error` `Instantiation of class Closure is not allowed`. */
  constructor() {
    throw new PhpError("Instantiation of class Closure is not allowed");
  }
}

registerClass("Closure", Closure);
