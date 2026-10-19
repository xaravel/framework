// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\InvocationStubber` (Story 4.7):
// what `method()` returns on a test stub. The APIs Upstream never calls
// (`willReturnArgument`, `willReturnReference`, `willReturnStrictMap`, `seal`,
// …) are not ported.
import type { Constraint } from "../../../Constraint";
import type { Stub } from "../Stub/Stub";

export interface InvocationStubber {
  method(constraint: Constraint | string): this;
  will(stub: Stub): this;
  willReturn(value: unknown, ...nextValues: unknown[]): this;
  willReturnMap(valueMap: readonly (readonly unknown[])[]): this;
  willReturnCallback(callback: (...args: any[]) => unknown): this;
  willReturnSelf(): this;
  willReturnOnConsecutiveCalls(...values: unknown[]): this;
  willThrowException(exception: Error): this;
}
