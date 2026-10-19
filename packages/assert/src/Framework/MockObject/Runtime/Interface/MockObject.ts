// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MockObject` (Story 4.7): a mock
// object (`createMock`, `getMockBuilder(…)->getMock()`), which the TestCase
// verifies after the test body.
import type { Constraint } from "../../../Constraint";
import type { InvocationOrder } from "../Rule/InvocationOrder";
import type { InvocationMocker } from "./InvocationMocker";

export interface MockObject {
  method(constraint: Constraint | string): InvocationMocker;
  expects(invocationRule: InvocationOrder): InvocationMocker;
}
