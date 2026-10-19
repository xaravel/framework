// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\InvocationMockerImplementation`
// (Story 4.7): `expects()` and `method()` on a mock object, with `with()`.
// PHPUnit's deprecation for `with()` without `expects()` is not emitted
// (ESC-4.7-1 item 3).
import type { InvocationMocker } from "./Interface/InvocationMocker";
import { AbstractInvocationImplementation } from "./AbstractInvocationImplementation";
import { Parameters } from "./Rule/Parameters";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class InvocationMockerImplementation extends AbstractInvocationImplementation implements InvocationMocker {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\InvocationMockerImplementation";

  with(...arguments_: unknown[]): this {
    this.ensureParametersCanBeConfigured();
    this.invocationHandler.ensureNoOtherMatcherHasParametersRuleForSameMethod(this.matcher);
    this.matcher.setParametersRule(new Parameters(arguments_, (count) => this.invocationHandler.addToAssertionCount(count)));
    return this;
  }
}
