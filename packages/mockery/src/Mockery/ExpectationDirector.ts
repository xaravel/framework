// `Mockery\ExpectationDirector` (Mockery 1.6.15, ExpectationDirector.php):
// the expectations of one mock method, which it matches calls against.
import { Mockery } from "../Mockery";
import { FQCN } from "../support/values";
import { Exception } from "./Exception";
import { NoMatchingExpectationException } from "./Exception/NoMatchingExpectationException";
import type { Expectation } from "./Expectation";
import type { LegacyMockInterface } from "./LegacyMockInterface";

export class ExpectationDirector {
  static readonly [FQCN]: string = "Mockery\\ExpectationDirector";

  /** Default expectations (`byDefault()`), consulted when no other expectation matches. */
  protected _defaults: Expectation[] = [];
  protected _expectations: Expectation[] = [];
  protected readonly _mock: LegacyMockInterface;
  protected readonly _name: string;

  constructor(name: string, mock: LegacyMockInterface) {
    this._name = name;
    this._mock = mock;
  }

  addExpectation(expectation: Expectation): void {
    this._expectations.push(expectation);
  }

  /** Runs the call through its expectation, or throws NoMatchingExpectationException. */
  call(args: readonly unknown[]): unknown {
    const expectation = this.findExpectation(args);
    if (expectation !== null) {
      return expectation.verifyCall(args);
    }
    const noMatchingExpectationException = new NoMatchingExpectationException(
      `No matching handler found for ${this._mock.mockery_getName()}::${Mockery.formatArgs(this._name, args)}. Either the method was unexpected or its arguments matched no expected argument list for this method\n\n${Mockery.formatObjects(args)}`,
    );
    noMatchingExpectationException.setMock(this._mock).setMethodName(this._name).setActualArguments([...args]);
    throw noMatchingExpectationException;
  }

  findExpectation(args: readonly unknown[]): Expectation | null {
    let expectation: Expectation | null = null;
    if (this._expectations.length > 0) {
      expectation = this._findExpectationIn(this._expectations, args);
    }
    if (expectation === null && this._defaults.length > 0) {
      return this._findExpectationIn(this._defaults, args);
    }
    return expectation;
  }

  getDefaultExpectations(): Expectation[] {
    return this._defaults;
  }

  /** The number of call-count-constrained expectations (the defaults' when there are no others). */
  getExpectationCount(): number {
    let count = 0;
    let expectations = this.getExpectations();
    if (expectations.length === 0) {
      expectations = this.getDefaultExpectations();
    }
    for (const expectation of expectations) {
      if (expectation.isCallCountConstrained()) {
        count++;
      }
    }
    return count;
  }

  getExpectations(): Expectation[] {
    return this._expectations;
  }

  /** Moves `expectation`, which must be the last one added, to the front of the defaults. */
  makeExpectationDefault(expectation: Expectation): void {
    if (this._expectations.at(-1) === expectation) {
      this._expectations.pop();
      this._defaults.unshift(expectation);
      return;
    }
    throw new Exception("Cannot turn a previously defined expectation into a default");
  }

  verify(): void {
    if (this._expectations.length > 0) {
      for (const expectation of this._expectations) {
        expectation.verify();
      }
      return;
    }
    for (const defaultExpectation of this._defaults) {
      defaultExpectation.verify();
    }
  }

  /** The first eligible expectation whose arguments match, else the first whose arguments match. */
  protected _findExpectationIn(expectations: readonly Expectation[], args: readonly unknown[]): Expectation | null {
    for (const expectation of expectations) {
      if (!expectation.isEligible()) {
        continue;
      }
      if (!expectation.matchArgs(args)) {
        continue;
      }
      return expectation;
    }
    for (const expectation of expectations) {
      if (expectation.matchArgs(args)) {
        return expectation;
      }
    }
    return null;
  }
}
