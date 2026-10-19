// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\ConsecutiveCalls` (Story 4.7): `willReturn($a, $b, …)` and `willReturnOnConsecutiveCalls(…)`: one value per call, a stub value invoked; past the last one, NoMoreReturnValuesConfiguredException.
import { NoMoreReturnValuesConfiguredException } from "../../Exception/NoMoreReturnValuesConfiguredException";
import type { Invocation } from "../Invocation";
import { isStub, STUB, type Stub } from "./Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class ConsecutiveCalls implements Stub {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Stub\\ConsecutiveCalls";

  readonly [STUB] = true as const;
  readonly #stack: unknown[];
  readonly #numberOfConfiguredReturnValues: number;

  constructor(stack: readonly unknown[]) {
    this.#stack = [...stack];
    this.#numberOfConfiguredReturnValues = stack.length;
  }

  invoke(invocation: Invocation): unknown {
    if (this.#stack.length === 0) {
      throw new NoMoreReturnValuesConfiguredException(invocation.className(), invocation.methodName(), this.#numberOfConfiguredReturnValues);
    }
    const value = this.#stack.shift();
    return isStub(value) ? value.invoke(invocation) : value;
  }
}
