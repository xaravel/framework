// `JMac\Testing\DoubleInterface` (jasonmccreary/double v1.0.1), as a type: the control verbs of a double, in the
// subset the ai, mcp and boost suites use (`received`, `unused` and `verify` are not ported, ESC-4.8-1 item 4).
// An ordinary double is its target and these verbs; an OverriddenDouble has the verbs only, and `instance()` gives
// the target-shaped double.
import type { MethodExpectation } from "./Engine/MethodExpectation";

export interface DoubleInterface<T = any> {
  /** The target-shaped double: the double itself, or the one an OverriddenDouble wraps. */
  instance(): T;
  /** An expectation the double must meet: once by default. */
  expects(method: string): MethodExpectation;
  /** An expectation the double may meet: any number of times by default. */
  allows(method: string): MethodExpectation;
  /** Every call must be configured. */
  strict(): this;
  /** An unconfigured call runs the target's real method, after copying `realInstance`'s fields when given. */
  passthru(realInstance?: object | null): this;
}
