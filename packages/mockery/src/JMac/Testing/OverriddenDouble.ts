// `JMac\Testing\OverriddenDouble` (jasonmccreary/double v1.0.1): what `Double.for(target, { override: true })` gives
// when the target declares a reserved name (Laravel's Gate declares `allows`). It carries the control verbs and
// forwards each to Double; `instance()` is the target-shaped double, whose own methods are all doubled.
import { FQCN } from "../../support/values";
import { Double } from "./Double";
import type { DoubleInterface } from "./DoubleInterface";
import type { MethodExpectation } from "./Engine/MethodExpectation";

export class OverriddenDouble<T extends object = any> implements DoubleInterface<T> {
  static readonly [FQCN]: string = "JMac\\Testing\\OverriddenDouble";

  readonly #double: T;

  constructor(double: T) {
    this.#double = double;
  }

  instance(): T {
    return this.#double;
  }

  expects(method: string): MethodExpectation {
    return Double.registerExpectation(this.#double, method, true);
  }

  allows(method: string): MethodExpectation {
    return Double.registerExpectation(this.#double, method, false);
  }

  strict(): this {
    Double.strict(this.#double);
    return this;
  }

  passthru(realInstance: object | null = null): this {
    Double.passthru(this.#double, realInstance);
    return this;
  }
}
