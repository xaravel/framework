// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\AnyParameters` (Story 4.7):
// the parameters rule of a matcher without `with()`.
import type { Invocation } from "../Invocation";
import type { ParametersRule } from "./ParametersRule";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class AnyParameters implements ParametersRule {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Rule\\AnyParameters";

  apply(_invocation: Invocation): void {}

  verify(): void {}
}
