// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\InvocationMocker` (Story 4.7):
// what `expects()` and `method()` return on a mock object.
import type { InvocationStubber } from "./InvocationStubber";

export interface InvocationMocker extends InvocationStubber {
  with(...arguments_: unknown[]): this;
}
