// PHPUnit 13.4.3's `PHPUnit\Framework\TestCase` (Story 4.4), as far as Ported
// Tests use it: Assert's assertions plus the exception, output and
// assertion-count expectations, and `createMock`.
//
// A `portedTest` whose `this` is a TestCase runs PHPUnit's lifecycle
// (`runLifecycle`/`runTest`): the output buffer starts, then `setUp`, the
// body (a throw is checked against the exception expectation, else
// `assertWasRaised`), the output assertions, `tearDown`, and the buffer stops.
// The expectations live in a module WeakMap, per instance, which
// `portedTest` reads through `testCaseState`.
//
// `createMock(X)` delegates to Mockery (ESC-4.4-1): it calls
// `globalThis[Symbol.for('xaravel.mockery.mock')]`, which `@xaravel/mockery`
// installs on load, and throws an error naming `@xaravel/mockery` when it is
// not loaded. The grader never imports Mockery.
import { argumentError, stringParam } from "../comparison/PhpValues";
import { recordAssertion } from "../declarations/AssertionCounter";
import { Assert, type ClassOrInterface } from "./Assert";
import { classOrInterface } from "./Constraints";
import { ExceptionExpectation } from "./TestCase/ExceptionExpectation";
import { OutputBuffer } from "./TestCase/OutputBuffer";
import { codeOf, messageOf } from "./Throwable";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const MOCKERY_MOCK = Symbol.for("xaravel.mockery.mock");

/** One TestCase instance's expectations. Internal. */
export interface TestCaseState {
  readonly exception: ExceptionExpectation;
  readonly output: OutputBuffer;
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
function intOrString(method: string, value: unknown): number | string {
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
  const error = argumentError(method, 1, "code", "string|int", value);
  throw new TypeError(error.message.replace("PHPUnit\\Framework\\Assert::", "PHPUnit\\Framework\\TestCase::"));
}

export class TestCase extends Assert {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\TestCase";

  constructor() {
    super();
    states.set(this, { exception: new ExceptionExpectation(), output: new OutputBuffer() });
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

  /** Mockery's mock of `type` (ESC-4.4-1): `@xaravel/mockery` must be loaded. */
  createMock<T extends object>(type: abstract new (...args: never[]) => T): T;
  createMock(type: unknown): unknown;
  createMock(type: unknown): unknown {
    const mock: unknown = (globalThis as Record<symbol, unknown>)[MOCKERY_MOCK];
    if (typeof mock !== "function") {
      throw new Error(
        "PHPUnit\\Framework\\TestCase::createMock() delegates to @xaravel/mockery, which is not loaded: import '@xaravel/mockery' (a devDependency of the test's package) so it installs globalThis[Symbol.for('xaravel.mockery.mock')]",
      );
    }
    return (mock as (type: unknown) => unknown)(type);
  }
}
