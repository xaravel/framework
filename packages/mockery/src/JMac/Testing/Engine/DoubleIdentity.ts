// `JMac\Testing\Engine\DoubleIdentity` (jasonmccreary/double v1.0.1): the identity that keys a double's state. PHP
// keys `Double::$states` (a WeakMap) by a `__td_identity` object; JS keys it by the double itself, so no member is
// added to the double. Internal.
import { FQCN } from "../../../support/values";
import type { DoubleState } from "./DoubleState";

const states = new WeakMap<object, DoubleState>();

export class DoubleIdentity {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\DoubleIdentity";

  static register(double: object, state: DoubleState): void {
    states.set(double, state);
  }

  /** The state of `double`, or null when it is not a generated double. */
  static stateOf(double: unknown): DoubleState | null {
    return (typeof double === "object" || typeof double === "function") && double !== null ? (states.get(double) ?? null) : null;
  }
}
