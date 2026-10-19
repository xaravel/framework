// `JMac\Testing\Engine\DoubleControlMethods` (jasonmccreary/double v1.0.1): the control verbs ClassGenerator puts
// on every ordinary double, in the subset the ai, mcp and boost suites use: `instance`, `expects`, `allows`,
// `strict` and `passthru` (`received`, `unused` and `verify` have no Upstream use, ESC-4.8-1 item 4, but stay
// reserved names). Internal: ClassGenerator copies these members onto each generated prototype.
import { FQCN } from "../../../support/values";
import { Double } from "../Double";
import type { MethodExpectation } from "./MethodExpectation";

export class DoubleControlMethods {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\DoubleControlMethods";

  /** The double itself, as `OverriddenDouble.instance()` gives its wrapped double. */
  instance(): this {
    return this;
  }

  expects(method: string): MethodExpectation {
    return Double.registerExpectation(this, method, true);
  }

  allows(method: string): MethodExpectation {
    return Double.registerExpectation(this, method, false);
  }

  strict(): this {
    Double.strict(this);
    return this;
  }

  passthru(realInstance: object | null = null): this {
    Double.passthru(this, realInstance);
    return this;
  }
}
