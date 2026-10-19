// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Matcher` (Story 4.7): one
// `expects()` or `method()` configuration of a double: its invocation count
// rule, method name rule, parameters rule and stub.
import { ExpectationFailedException } from "../../ExpectationFailedException";
import { MethodNameNotConfiguredException } from "../Exception/MethodNameNotConfiguredException";
import type { Invocation } from "./Invocation";
import { AnyInvokedCount } from "./Rule/AnyInvokedCount";
import { AnyParameters } from "./Rule/AnyParameters";
import type { InvocationOrder } from "./Rule/InvocationOrder";
import { InvokedCount } from "./Rule/InvokedCount";
import type { MethodName } from "./Rule/MethodName";
import type { ParametersRule } from "./Rule/ParametersRule";
import type { Stub } from "./Stub/Stub";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class Matcher {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\Matcher";

  readonly #invocationRule: InvocationOrder;
  readonly #className: string;
  #methodNameRule: MethodName | null = null;
  #parametersRule: ParametersRule | null = null;
  #stub: Stub | null = null;

  constructor(rule: InvocationOrder, className: string) {
    this.#invocationRule = rule;
    this.#className = className;
  }

  hasInvocationCountRule(): boolean {
    return !(this.#invocationRule instanceof AnyInvokedCount);
  }

  hasMethodNameRule(): boolean {
    return this.#methodNameRule !== null;
  }

  methodNameRule(): MethodName {
    if (this.#methodNameRule === null) {
      throw new MethodNameNotConfiguredException();
    }
    return this.#methodNameRule;
  }

  setMethodNameRule(rule: MethodName): void {
    this.#methodNameRule = rule;
  }

  hasParametersRule(): boolean {
    return this.#parametersRule !== null;
  }

  setParametersRule(rule: ParametersRule): void {
    this.#parametersRule = rule;
  }

  setStub(stub: Stub): void {
    this.#stub = stub;
  }

  invoked(invocation: Invocation): unknown {
    if (this.#methodNameRule === null) {
      throw new MethodNameNotConfiguredException();
    }
    this.#invocationRule.invoked(invocation);
    try {
      this.#parametersRule?.apply(invocation);
    } catch (error) {
      if (error instanceof ExpectationFailedException) {
        throw new ExpectationFailedException(`Expectation for ${this.#methodNameRule.failureDescription(this.#className)} failed.\n${error.getMessage()}`, error.getComparisonFailure());
      }
      throw error;
    }
    if (this.#stub !== null) {
      return this.#stub.invoke(invocation);
    }
    return invocation.generateReturnValue();
  }

  matches(invocation: Invocation): boolean {
    if (this.#methodNameRule === null) {
      throw new MethodNameNotConfiguredException();
    }
    if (!this.#invocationRule.matches(invocation)) {
      return false;
    }
    try {
      if (!this.#methodNameRule.matches(invocation)) {
        return false;
      }
    } catch (error) {
      if (error instanceof ExpectationFailedException) {
        throw new ExpectationFailedException(`Expectation for ${this.#methodNameRule.failureDescription(this.#className)} failed.\n${error.getMessage()}`, error.getComparisonFailure());
      }
      throw error;
    }
    return true;
  }

  verify(): void {
    if (this.#methodNameRule === null) {
      throw new MethodNameNotConfiguredException();
    }
    try {
      this.#invocationRule.verify();
    } catch (error) {
      if (!(error instanceof ExpectationFailedException)) {
        throw error;
      }
      const actual = this.#invocationRule.numberOfInvocations();
      const invoked = actual === 0 ? "never invoked" : actual === 1 ? "invoked once" : `invoked ${actual} times`;
      throw new ExpectationFailedException(`${this.#methodNameRule.failureDescription(this.#className)} was expected to be ${this.#invocationRule.toString()} but was ${invoked}.`);
    }
    this.#parametersRule ??= new AnyParameters();
    const invocationIsAny = this.#invocationRule instanceof AnyInvokedCount;
    const invocationIsNever = this.#invocationRule instanceof InvokedCount && this.#invocationRule.isNever();
    if (!invocationIsAny && !invocationIsNever) {
      try {
        this.#parametersRule.verify();
      } catch (error) {
        if (error instanceof ExpectationFailedException) {
          throw new ExpectationFailedException(`Expectation for ${this.#methodNameRule.failureDescription(this.#className)} failed.\n${throwableToString(error)}`);
        }
        throw error;
      }
    }
  }
}

/** `ThrowableToStringMapper::map` for an ExpectationFailedException (a SelfDescribing): `toString()`, then the diff, trimmed, then a newline. */
function throwableToString(error: ExpectationFailedException): string {
  let buffer = error.getMessage();
  const failure = error.getComparisonFailure();
  if (failure !== null) {
    buffer += failure.getDiff();
  }
  return buffer === "" ? "" : `${phpTrim(buffer)}\n`;
}

/** PHP's `trim()`: spaces, tabs, newlines, carriage returns, NUL and vertical tabs. */
function phpTrim(text: string): string {
  // oxlint-disable-next-line no-control-regex -- PHP's trim() strips NUL and vertical tab
  return text.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");
}
