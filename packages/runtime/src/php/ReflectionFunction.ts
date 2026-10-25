// PHP's `ReflectionFunction` (DIV-3.2, DIV-3.3, DIV-3.4) over a closure: its parameters come from its
// `inject({ … }, fn)` map and its return type from `returns(<Spec>, fn)`. PHP's global functions have no runtime
// table (DIV-9.13), so a function name string does not exist.
import { readReturnMetadata } from "../metadata/returns";
import { registerClass } from "../registry/registry";
import { phpTypeName } from "./phpType";
import { ReflectionException } from "./ReflectionException";
import { TypeError as PhpTypeError } from "./TypeError";
import type { ReflectionParameter } from "./ReflectionParameter";
import { parametersOf } from "./reflectionParameters";
import { type ReflectionTypeValue, typeOfSpec } from "./reflectionTypes";

export class ReflectionFunction {
  readonly #fn: (...args: never[]) => unknown;

  /**
   * Reflects the closure `fn`. A string throws `ReflectionException` `Function <name>() does not exist`; any other
   * value throws PHP's `TypeError`.
   */
  constructor(fn: (...args: never[]) => unknown) {
    if (typeof fn === "string") {
      throw new ReflectionException(`Function ${fn as string}() does not exist`);
    }
    if (typeof fn !== "function") {
      throw new PhpTypeError(`ReflectionFunction::__construct(): Argument #1 ($function) must be of type Closure|string, ${phpTypeName(fn)} given`);
    }
    this.#fn = fn;
  }

  /**
   * PHP's `getParameters()`: one `ReflectionParameter` per key of the closure's `inject` map, in order, each with no
   * declaring class. Throws `RuntimeException` for a closure with no `inject` declaration (DIV-3.3).
   */
  getParameters(): ReflectionParameter[] {
    return parametersOf(this.#fn, null, "The closure", "inject({ <param>: <Spec> }, fn)");
  }

  /** PHP's `getReturnType()`: the type of the closure's `returns` Spec, or null without one (DIV-3.4). */
  getReturnType(): ReflectionTypeValue | null {
    const spec = readReturnMetadata(this.#fn);
    return spec === null ? null : typeOfSpec(spec, "ReflectionFunction::getReturnType(): the return Spec");
  }
}

registerClass("ReflectionFunction", ReflectionFunction);
