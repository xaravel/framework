// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\ReturnStub` (Story 4.7): `willReturn($value)`.
import type { Invocation } from "../Invocation";
import { STUB, type Stub } from "./Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ReturnStub implements Stub {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Stub\\ReturnStub";

  readonly [STUB] = true as const;
  readonly #value: unknown;

  constructor(value: unknown) {
    this.#value = value;
  }

  invoke(_invocation: Invocation): unknown {
    return this.#value;
  }
}
