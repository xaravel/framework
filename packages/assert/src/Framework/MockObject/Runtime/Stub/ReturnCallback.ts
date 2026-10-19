// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\ReturnCallback` (Story 4.7): `willReturnCallback($callback)`: the callback gets the call's arguments; `undefined` is `null` (AD-9).
import type { Invocation } from "../Invocation";
import { STUB, type Stub } from "./Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ReturnCallback implements Stub {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Stub\\ReturnCallback";

  readonly [STUB] = true as const;
  readonly #callback: (...args: unknown[]) => unknown;

  constructor(callback: (...args: unknown[]) => unknown) {
    this.#callback = callback;
  }

  invoke(invocation: Invocation): unknown {
    return this.#callback(...invocation.parameters()) ?? null;
  }
}
