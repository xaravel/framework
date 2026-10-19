// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Stub` (Story 4.7): a test
// stub (`createStub`), which configures return values but has no expectations.
import type { Constraint } from "../../../Constraint";
import type { InvocationStubber } from "./InvocationStubber";

export interface Stub {
  method(constraint: Constraint | string): InvocationStubber;
}
