// PHPUnit 13.4.3's `TestCase\ExceptionExpectation` (Story 4.4): what
// `expectException*` record, and how `runTest` checks it. Internal to the grader.
//
// `shouldBeVerifiedFor`, `verify` and `assertWasRaised` are PHPUnit's: a
// thrown PHPUnit exception (an assertion failure, a skip) is never verified
// unless the expected class is `PHPUnit\Framework\Exception` or a subclass, so
// it propagates; `verify` asserts each expectation through `Assert.assertThat`
// (each records `assertThat`, as PHP's caller is not Assert); a message-only,
// pattern-only or code-only expectation with nothing thrown fails without
// counting (PHPUnit's `addToAssertionCount` paths record no kind).
import { Assert } from "../Assert";
import { AssertionFailedError } from "../AssertionFailedError";
import type { Constraint } from "../Constraint";
import { Exception as ExceptionConstraint } from "../Constraint/Exception/Exception";
import { ExceptionCode } from "../Constraint/Exception/ExceptionCode";
import { ExceptionMessageIsOrContains } from "../Constraint/Exception/ExceptionMessageIsOrContains";
import { ExceptionMessageMatchesRegularExpression } from "../Constraint/Exception/ExceptionMessageMatchesRegularExpression";
import { Exception } from "../Exception/Exception";
import { codeOf, messageOf } from "../Throwable";

export class ExceptionExpectation {
  private expectedException: unknown = null;
  private expectedMessage: string | null = null;
  private expectedMessageConstraint: Constraint | null = null;
  private expectedMessageRegularExpression: RegExp | null = null;
  private expectedCode: number | string | null = null;

  expectClass(exception: unknown): void {
    this.expectedException = exception;
  }

  expectCode(code: number | string): void {
    this.expectedCode = code;
  }

  expectMessageIsOrContains(message: string): void {
    this.expectedMessage = message;
    this.expectedMessageConstraint = new ExceptionMessageIsOrContains(message);
  }

  expectMessageMatches(regularExpression: RegExp): void {
    this.expectedMessageRegularExpression = regularExpression;
  }

  /** Whether any expectation is set. */
  isSet(): boolean {
    return this.expectedException !== null || this.expectedCode !== null || this.expectedMessage !== null || this.expectedMessageRegularExpression !== null;
  }

  shouldBeVerifiedFor(throwable: unknown): boolean {
    let result = this.isSet();
    if (throwable instanceof Exception) {
      result = false;
    }
    const expected = this.expectedException;
    if (typeof expected === "function" && (expected === Exception || (expected as { prototype?: unknown }).prototype instanceof Exception)) {
      result = true;
    }
    return result;
  }

  verify(exception: unknown): void {
    if (this.expectedException !== null) {
      Assert.assertThat(exception, new ExceptionConstraint(this.expectedException));
    }
    const thrown = exception instanceof Error ? exception : null;
    if (this.expectedMessageConstraint !== null) {
      Assert.assertThat(thrown === null ? null : messageOf(thrown), this.expectedMessageConstraint);
    }
    if (this.expectedMessageRegularExpression !== null) {
      Assert.assertThat(thrown === null ? null : messageOf(thrown), new ExceptionMessageMatchesRegularExpression(this.expectedMessageRegularExpression));
    }
    if (this.expectedCode !== null) {
      Assert.assertThat(thrown === null ? null : codeOf(thrown), new ExceptionCode(this.expectedCode));
    }
  }

  assertWasRaised(): void {
    if (this.expectedException !== null) {
      Assert.assertThat(null, new ExceptionConstraint(this.expectedException));
    } else if (this.expectedMessageConstraint !== null) {
      throw new AssertionFailedError(`Failed asserting that exception with message containing "${this.expectedMessage ?? ""}" is thrown`);
    } else if (this.expectedMessageRegularExpression !== null) {
      throw new AssertionFailedError(`Failed asserting that exception with message matching "${String(this.expectedMessageRegularExpression)}" is thrown`);
    } else if (this.expectedCode !== null) {
      throw new AssertionFailedError(`Failed asserting that exception with code "${String(this.expectedCode)}" is thrown`);
    }
  }
}
