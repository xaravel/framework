// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\InvocationStubberImplementation`
// (Story 4.7): `method()` on a test stub; it has no `with()`.
import { AbstractInvocationImplementation } from "./AbstractInvocationImplementation";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class InvocationStubberImplementation extends AbstractInvocationImplementation {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\InvocationStubberImplementation";
}
