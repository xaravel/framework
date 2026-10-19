// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\InvokedAtLeastOnce` (Story 4.7): `atLeastOnce()`.
import { ExpectationFailedException } from "../../../ExpectationFailedException";
import type { Invocation } from "../Invocation";
import { InvocationOrder } from "./InvocationOrder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class InvokedAtLeastOnce extends InvocationOrder {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\InvokedAtLeastOnce";

  toString(): string {
    return "invoked at least once";
  }

  verify(): void {
    if (this.numberOfInvocations() < 1) {
      throw new ExpectationFailedException("Expected invocation at least once but it never occurred.");
    }
  }

  matches(_invocation: Invocation): boolean {
    return true;
  }
}
