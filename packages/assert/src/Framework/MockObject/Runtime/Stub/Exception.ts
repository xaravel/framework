// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\Exception` (Story 4.7): `willThrowException($e)` and `throwException($e)`.
import type { Invocation } from "../Invocation";
import { STUB, type Stub } from "./Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class Exception implements Stub {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Stub\\Exception";

  readonly [STUB] = true as const;
  readonly #exception: Error;

  constructor(exception: Error) {
    this.#exception = exception;
  }

  invoke(_invocation: Invocation): unknown {
    throw this.#exception;
  }
}
