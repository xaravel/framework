// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\MockBuilder` (Story 4.7):
// `getMockBuilder(X)->…->getMock()` makes a mock object of `X` and registers
// it with the TestCase, which verifies it after the test body.
import type { TestCase } from "../TestCase";
import type { DoubleTarget } from "./Generator/Generator";
import type { MockObject } from "./Runtime/Interface/MockObject";
import { TestDoubleBuilder } from "./TestDoubleBuilder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class MockBuilder<T = unknown> extends TestDoubleBuilder {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\MockBuilder";

  readonly #testCase: TestCase;

  constructor(testCase: TestCase, type: DoubleTarget) {
    super(type);
    this.#testCase = testCase;
  }

  getMock(): T & MockObject {
    const object = this.getTestDouble(true, (count) => this.#testCase.addToAssertionCount(count));
    this.#testCase.registerMockObject(this.type, object as MockObject);
    return object as T & MockObject;
  }
}
