// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\ReturnSelf` (Story 4.7): `willReturnSelf()`: the double itself.
import type { Invocation } from "../Invocation";
import { STUB, type Stub } from "./Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ReturnSelf implements Stub {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Stub\\ReturnSelf";

  readonly [STUB] = true as const;
  invoke(invocation: Invocation): unknown {
    return invocation.object();
  }
}
