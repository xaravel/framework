// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub\Stub` (Story 4.7): what a
// matcher returns for a matched call. Every stub class carries `STUB`, so a
// stub passed as a value (`willReturn($this->throwException($e))`) is used as
// a stub, as PHP's `instanceof Stub` does.
import type { Invocation } from "../Invocation";

/** The brand of the grader's stub classes. Internal. */
export const STUB: unique symbol = Symbol("PHPUnit\\Framework\\MockObject\\Stub\\Stub");

export interface Stub {
  readonly [STUB]: true;
  invoke(invocation: Invocation): unknown;
}

/** Whether `value` is one of the grader's stubs. Internal. */
export function isStub(value: unknown): value is Stub {
  return typeof value === "object" && value !== null && (value as Partial<Stub>)[STUB] === true;
}
