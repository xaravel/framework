// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\InvocationHandler` (Story 4.7):
// a double's matchers, and the dispatch of each call to them.
//
// `invoke` asks every matcher in order: each one that matches is invoked; the
// first return value wins; the last exception is rethrown after all of them,
// and the first AssertionFailedError is kept, so `verify` rethrows it even
// when the test caught it. A call no matcher returns for returns the value
// `Invocation::generateReturnValue` generates (Story 9.11: the declared return
// type's, when a signature row exists; else `null`, DIV-6.4).
//
// Story 9.11 (ESC-5.3-3): when a rule raises an ExpectationFailedException after
// the test's counts have ended (a call from a timer the body left behind), the
// failure is reported to `Symbol.for('xaravel.harness.late')` with kind `null`
// and not thrown, and the call returns `null`.
import { countsEnded, lateReports, reportLateFailure } from "../../../declarations/AssertionCounter";
import { AssertionFailedError } from "../../AssertionFailedError";
import { ExpectationFailedException } from "../../ExpectationFailedException";
import type { ConfigurableMethod } from "../ConfigurableMethod";
import { MethodParametersAlreadyConfiguredForAnotherMatcherException } from "../Exception/MethodParametersAlreadyConfiguredForAnotherMatcherException";
import type { Invocation } from "./Invocation";
import type { InvocationMocker } from "./Interface/InvocationMocker";
import type { InvocationStubber } from "./Interface/InvocationStubber";
import { InvocationMockerImplementation } from "./InvocationMockerImplementation";
import { InvocationStubberImplementation } from "./InvocationStubberImplementation";
import { Matcher } from "./Matcher";
import type { InvocationOrder } from "./Rule/InvocationOrder";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class InvocationHandler {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\MockObject\\InvocationHandler";

  readonly #matchers: Matcher[] = [];
  readonly #configurableMethods: readonly ConfigurableMethod[];
  readonly #className: string;
  readonly #isMockObject: boolean;
  readonly #addToAssertionCount: (count: number) => void;
  #assertionFailure: AssertionFailedError | null = null;

  /** `addToAssertionCount`: the counting of the TestCase that made the double (a no-op for a stub). */
  constructor(configurableMethods: readonly ConfigurableMethod[], className: string, isMockObject: boolean, addToAssertionCount: (count: number) => void) {
    this.#configurableMethods = configurableMethods;
    this.#className = className;
    this.#isMockObject = isMockObject;
    this.#addToAssertionCount = addToAssertionCount;
  }

  isMockObject(): boolean {
    return this.#isMockObject;
  }

  /** Counts `count` assertions on the TestCase that made the double. Internal (Parameters). */
  addToAssertionCount(count: number): void {
    this.#addToAssertionCount(count);
  }

  hasInvocationCountRule(): boolean {
    return this.#matchers.some((matcher) => matcher.hasInvocationCountRule());
  }

  hasParametersRule(): boolean {
    return this.#matchers.some((matcher) => matcher.hasParametersRule());
  }

  expects(rule: InvocationOrder): InvocationMocker | InvocationStubber {
    const matcher = new Matcher(rule, this.#className);
    this.#matchers.push(matcher);
    if (this.#isMockObject) {
      return new InvocationMockerImplementation(this, matcher, this.#configurableMethods);
    }
    return new InvocationStubberImplementation(this, matcher, this.#configurableMethods);
  }

  invoke(invocation: Invocation): unknown {
    const reported = lateReports();
    let exception: { value: unknown } | null = null;
    let hasReturnValue = false;
    let returnValue: unknown = null;
    for (const match of this.#matchers) {
      try {
        if (match.matches(invocation)) {
          const value = match.invoked(invocation);
          if (!hasReturnValue) {
            returnValue = value;
            hasReturnValue = true;
          }
        }
      } catch (error) {
        exception = { value: error };
        if (this.#assertionFailure === null && error instanceof AssertionFailedError) {
          this.#assertionFailure = error;
        }
      }
    }
    if (exception !== null) {
      if (exception.value instanceof ExpectationFailedException && countsEnded()) {
        if (lateReports() === reported) {
          reportLateFailure(null);
        }
        return null;
      }
      throw exception.value;
    }
    if (hasReturnValue) {
      return returnValue ?? null;
    }
    return invocation.generateReturnValue();
  }

  verify(): void {
    for (const matcher of this.#matchers) {
      matcher.verify();
    }
    if (this.#assertionFailure !== null) {
      throw this.#assertionFailure;
    }
  }

  hasMatcherWithParametersRuleForMethodName(excludeMatcher: Matcher, methodName: string): boolean {
    return this.#matchers.some(
      (matcher) => matcher !== excludeMatcher && matcher.hasMethodNameRule() && matcher.hasParametersRule() && matcher.methodNameRule().matchesName(methodName),
    );
  }

  /** `MethodParametersAlreadyConfiguredForAnotherMatcherException` for the first configurable method `matcher` names that another matcher constrains. Internal. */
  ensureNoOtherMatcherHasParametersRuleForSameMethod(matcher: Matcher): void {
    for (const method of this.#configurableMethods) {
      if (matcher.methodNameRule().matchesName(method.name()) && this.hasMatcherWithParametersRuleForMethodName(matcher, method.name())) {
        throw new MethodParametersAlreadyConfiguredForAnotherMatcherException(method.name());
      }
    }
  }
}
