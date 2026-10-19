// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\AnyInvokedCount` (Story 4.7):
// `any()`, and the rule of a matcher made by `method()` without `expects()`.
import type { Invocation } from "../Invocation";
import { InvocationOrder } from "./InvocationOrder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class AnyInvokedCount extends InvocationOrder {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\AnyInvokedCount";

  toString(): string {
    return "invoked zero or more times";
  }

  verify(): void {}

  matches(_invocation: Invocation): boolean {
    return true;
  }
}
