// PHPUnit 13.4.3's `PHPUnit\Framework\TestCase` (Stories 4.4 and 4.7), as far
// as Ported Tests use it: Assert's assertions plus the exception, output and
// assertion-count expectations, and PHPUnit's test doubles.
//
// A `portedTest` whose `this` is a TestCase runs PHPUnit's lifecycle
// (`runLifecycle`/`runTest`): the output buffer starts, then `setUp`, the
// body (a throw is checked against the exception expectation, else
// `assertWasRaised`), the output assertions, `tearDown`, and the buffer stops.
// The expectations live in a module WeakMap, per instance, which
// `portedTest` reads through `testCaseState`.
//
// Test doubles (Story 4.7, `decisions/ESC-4.4-2.md` item 6): `createMock(X)`,
// `createPartialMock(X, [...])` and `getMockBuilder(X)->…->getMock()` return
// PHPUnit mock objects, registered with this TestCase and verified after the
// body (`portedTest`'s lifecycle); `createStub(X)` returns a test stub, which
// is never verified. `X` is a class or a contract token. Mockery stays
// reachable through `Mockery.mock()`; `createMock` never calls it. Counts that
// have no assertion kind (`addToAssertionCount`, mock verification) go to the
// counting context's kind-less count (AssertionCounter).
import { argumentError, stringParam, unmarkFloat } from "../comparison/PhpValues";
import { addToAssertionCount, recordAssertion } from "../declarations/AssertionCounter";
import { Assert, type ClassOrInterface } from "./Assert";
import { classOrInterface } from "./Constraints";
import { type DoubleTarget, testDouble } from "./MockObject/Generator/Generator";
import { MockBuilder } from "./MockObject/MockBuilder";
import type { MockObject } from "./MockObject/Runtime/Interface/MockObject";
import type { Stub } from "./MockObject/Runtime/Interface/Stub";
import { AnyInvokedCount } from "./MockObject/Runtime/Rule/AnyInvokedCount";
import { InvokedAtLeastOnce } from "./MockObject/Runtime/Rule/InvokedAtLeastOnce";
import { InvokedCount } from "./MockObject/Runtime/Rule/InvokedCount";
import { Exception as ExceptionStub } from "./MockObject/Runtime/Stub/Exception";
import { ExceptionExpectation } from "./TestCase/ExceptionExpectation";
import { MockObjectRegistry } from "./TestCase/MockObjectRegistry";
import { OutputBuffer } from "./TestCase/OutputBuffer";
import { codeOf, isThrowable, messageOf } from "./Throwable";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** One TestCase instance's expectations. Internal. */
export interface TestCaseState {
  readonly exception: ExceptionExpectation;
  readonly output: OutputBuffer;
  readonly mockObjects: MockObjectRegistry;
}

const states = new WeakMap<object, TestCaseState>();

/** The expectations of `value` when it is a TestCase, else null. Internal (read by `portedTest`). */
export function testCaseState(value: unknown): TestCaseState | null {
  return typeof value === "object" && value !== null ? (states.get(value) ?? null) : null;
}

function state(test: TestCase): TestCaseState {
  const found = states.get(test);
  if (found === undefined) {
    throw new TypeError("PHPUnit\\Framework\\TestCase: not a TestCase instance");
  }
  return found;
}

function stringArgument(method: string, name: string, value: unknown): string {
  try {
    return stringParam(method, 1, name, value);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError(error.message.replace("PHPUnit\\Framework\\Assert::", "PHPUnit\\Framework\\TestCase::"));
    }
    throw error;
  }
}

/** PHP's `int|string` parameter in coercive mode; a bigint keeps its exact digits as a string. */
function intOrString(method: string, argument: unknown): number | string {
  const value = unmarkFloat(argument);
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value : String(value);
  }
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  const error = argumentError(method, 1, "code", "string|int", argument);
  throw new TypeError(error.message.replace("PHPUnit\\Framework\\Assert::", "PHPUnit\\Framework\\TestCase::"));
}

export class TestCase extends Assert {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\TestCase";

  #numberOfAssertionsPerformed = 0;

  constructor() {
    super();
    states.set(this, { exception: new ExceptionExpectation(), output: new OutputBuffer(), mockObjects: new MockObjectRegistry() });
  }

  /** The test passes only if the body throws an instance of `exception` (a class or an interface token). */
  expectException(exception: ClassOrInterface): void {
    classOrInterface(exception);
    state(this).exception.expectClass(exception);
  }

  expectExceptionCode(code: number | string): void {
    state(this).exception.expectCode(intOrString("expectExceptionCode", code));
  }

  /** The thrown exception's message must contain `message` (or be empty, for `''`). */
  expectExceptionMessage(message: string): void {
    state(this).exception.expectMessageIsOrContains(stringArgument("expectExceptionMessage", "message", message));
  }

  /** DIV-10: `regularExpression` is a JS `RegExp`; a PCRE pattern string is a TypeError. */
  expectExceptionMessageMatches(regularExpression: RegExp): void {
    if (!(regularExpression instanceof RegExp)) {
      throw new TypeError(`PHPUnit\\Framework\\TestCase::expectExceptionMessageMatches(): Argument #1 ($regularExpression) must be a RegExp (DIV-10), got ${typeof regularExpression}`);
    }
    state(this).exception.expectMessageMatches(regularExpression);
  }

  /** Expects the class, message (contains) and code of `exception`. */
  expectExceptionObject(exception: Error): void {
    if (!(exception instanceof Error)) {
      throw new TypeError(`PHPUnit\\Framework\\TestCase::expectExceptionObject(): Argument #1 ($exception) must be of type Throwable, ${typeof exception} given`);
    }
    this.expectException((Object.getPrototypeOf(exception) as { constructor: ClassOrInterface }).constructor);
    this.expectExceptionMessage(messageOf(exception));
    this.expectExceptionCode(codeOf(exception) as number | string);
  }

  /** The test performs no assertion: records `expectNotToPerformAssertions` (ESC-4.2-1 item 6); any other assertion makes it risky. */
  expectNotToPerformAssertions(): void {
    recordAssertion("expectNotToPerformAssertions");
  }

  /** What the test writes through `process.stdout.write` must be `expectedString` (ESC-4.4-2 item 2). */
  expectOutputString(expectedString: string): void {
    state(this).output.expectString(stringArgument("expectOutputString", "expectedString", expectedString));
  }

  // Story 4.7: test doubles

  /** A mock object of `type` (a class or a contract token): every method doubled, no constructor run; registered and verified after the body. */
  createMock<T>(type: abstract new (...args: never[]) => T): T & MockObject;
  createMock(type: DoubleTarget): MockObject;
  createMock(type: DoubleTarget): MockObject {
    const mock = testDouble(type, true, [], [], false, (count) => this.addToAssertionCount(count)) as MockObject;
    this.registerMockObject(type, mock);
    return mock;
  }

  /** A mock object of `type` whose `methods` are doubled and whose other methods are the real ones; no constructor run. */
  createPartialMock<T>(type: abstract new (...args: never[]) => T, methods: readonly string[]): T & MockObject;
  createPartialMock(type: DoubleTarget, methods: readonly string[]): MockObject;
  createPartialMock(type: DoubleTarget, methods: readonly string[]): MockObject {
    return new MockBuilder(this, type).disableOriginalConstructor().disableOriginalClone().onlyMethods(methods).getMock();
  }

  /** A test stub of `type`: every method doubled, no constructor run, no `expects()`, never verified. */
  static createStub<T>(type: abstract new (...args: never[]) => T): T & Stub;
  static createStub(type: DoubleTarget): Stub;
  static createStub(type: DoubleTarget): Stub {
    return testDouble(type, false, [], [], false, () => {}) as Stub;
  }

  /** `self::createStub($type)` called as `$this->createStub($type)`. */
  createStub<T>(type: abstract new (...args: never[]) => T): T & Stub;
  createStub(type: DoubleTarget): Stub;
  createStub(type: DoubleTarget): Stub {
    return TestCase.createStub(type);
  }

  getMockBuilder<T>(className: abstract new (...args: never[]) => T): MockBuilder<T>;
  getMockBuilder(className: DoubleTarget): MockBuilder;
  getMockBuilder(className: DoubleTarget): MockBuilder {
    return new MockBuilder(this, className);
  }

  /** Internal (PHPUnit's `@internal registerMockObject`): `mockObject` is verified after the body. */
  registerMockObject(type: unknown, mockObject: MockObject): void {
    state(this).mockObjects.register(type, mockObject);
  }

  /** Counts `count` assertions that have no kind (Story 4.7): they count for the zero-assertion rule, never in the report's kinds. */
  addToAssertionCount(count: number): void {
    addToAssertionCount(count);
    this.#numberOfAssertionsPerformed += count;
  }

  /** The kind-less assertions this TestCase counted. */
  numberOfAssertionsPerformed(): number {
    return this.#numberOfAssertionsPerformed;
  }

  /** A matcher that matches any number of calls (PHPUnit deprecates it; the deprecation is not emitted, ESC-4.7-1 item 3). */
  any(): AnyInvokedCount {
    return new AnyInvokedCount();
  }

  never(): InvokedCount {
    return new InvokedCount(0);
  }

  atLeastOnce(): InvokedAtLeastOnce {
    return new InvokedAtLeastOnce();
  }

  once(): InvokedCount {
    return new InvokedCount(1);
  }

  exactly(count: number): InvokedCount {
    if (typeof count !== "number" || !Number.isSafeInteger(count)) {
      throw new TypeError(`PHPUnit\\Framework\\TestCase::exactly(): Argument #1 ($count) must be of type int, ${typeof count} given`);
    }
    return new InvokedCount(count);
  }

  /** A stub that throws `exception`, for `willReturnOnConsecutiveCalls(…)` and `willReturn(…)`. */
  throwException(exception: Error): ExceptionStub {
    if (!isThrowable(exception)) {
      throw new TypeError(`PHPUnit\\Framework\\TestCase::throwException(): Argument #1 ($exception) must be of type Throwable, ${typeof exception} given`);
    }
    return new ExceptionStub(exception);
  }
}
