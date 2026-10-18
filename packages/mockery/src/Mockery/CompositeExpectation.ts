// `Mockery\CompositeExpectation` (Mockery 1.6.15, CompositeExpectation.php):
// what `shouldReceive` returns. It forwards each call to every expectation it
// holds (PHP's `__call`) and returns itself: one explicit forwarder per
// Expectation API method.
import { RuntimeException } from "../php/RuntimeException";
import { FQCN } from "../support/values";
import type { Expectation } from "./Expectation";
import type { LegacyMockInterface, MockObject } from "./LegacyMockInterface";

export class CompositeExpectation {
  static readonly [FQCN]: string = "Mockery\\CompositeExpectation";

  protected _expectations: Expectation[] = [];

  toString(): string {
    return `[${this._expectations.map((expectation) => expectation.toString()).join(", ")}]`;
  }

  add(expectation: Expectation): void {
    this._expectations.push(expectation);
  }

  andReturn(...args: unknown[]): this {
    return this.forward((expectation) => expectation.andReturn(...args));
  }

  andReturnValues(values: readonly unknown[]): this {
    return this.forward((expectation) => expectation.andReturnValues(values));
  }

  andThrow(exception: unknown, message: string = "", code: number = 0, previous: Error | null = null): this {
    return this.forward((expectation) => expectation.andThrow(exception, message, code, previous));
  }

  atLeast(): this {
    return this.forward((expectation) => expectation.atLeast());
  }

  atMost(): this {
    return this.forward((expectation) => expectation.atMost());
  }

  getMock(): LegacyMockInterface {
    return this.firstExpectation().getMock();
  }

  getOrderNumber(): number | null {
    return this.firstExpectation().getOrderNumber();
  }

  mock(): LegacyMockInterface {
    return this.getMock();
  }

  never(): this {
    return this.forward((expectation) => expectation.never());
  }

  once(): this {
    return this.forward((expectation) => expectation.once());
  }

  ordered(group: string | number | null = null): this {
    return this.forward((expectation) => expectation.ordered(group));
  }

  shouldReceive(...methodNames: (string | Readonly<Record<string, unknown>>)[]): CompositeExpectation {
    return (this.getMock() as MockObject).shouldReceive(...methodNames);
  }

  times(limit: number | null = null): this {
    return this.forward((expectation) => expectation.times(limit));
  }

  twice(): this {
    return this.forward((expectation) => expectation.twice());
  }

  with(...args: unknown[]): this {
    return this.forward((expectation) => expectation.with(...args));
  }

  withAnyArgs(): this {
    return this.forward((expectation) => expectation.withAnyArgs());
  }

  withArgs(argsOrClosure: readonly unknown[] | ((...args: any[]) => unknown)): this {
    return this.forward((expectation) => expectation.withArgs(argsOrClosure));
  }

  andReturnArg(index: number): this {
    return this.forward((expectation) => expectation.andReturnArg(index));
  }

  andReturnFalse(): this {
    return this.forward((expectation) => expectation.andReturnFalse());
  }

  andReturnNull(): this {
    return this.forward((expectation) => expectation.andReturnNull());
  }

  andReturnSelf(): this {
    return this.forward((expectation) => expectation.andReturnSelf());
  }

  andReturnTrue(): this {
    return this.forward((expectation) => expectation.andReturnTrue());
  }

  andReturnUsing(...args: ((...args: any[]) => unknown)[]): this {
    return this.forward((expectation) => expectation.andReturnUsing(...args));
  }

  andReturns(...args: unknown[]): this {
    return this.forward((expectation) => expectation.andReturns(...args));
  }

  andThrowExceptions(exceptions: readonly unknown[]): this {
    return this.forward((expectation) => expectation.andThrowExceptions(exceptions));
  }

  andThrows(exception: unknown, message: string = "", code: number = 0, previous: Error | null = null): this {
    return this.forward((expectation) => expectation.andThrows(exception, message, code, previous));
  }

  because(message: string): this {
    return this.forward((expectation) => expectation.because(message));
  }

  byDefault(): this {
    return this.forward((expectation) => expectation.byDefault());
  }

  globally(): this {
    return this.forward((expectation) => expectation.globally());
  }

  passthru(): this {
    return this.forward((expectation) => expectation.passthru());
  }

  withNoArgs(): this {
    return this.forward((expectation) => expectation.withNoArgs());
  }

  withSomeOfArgs(...args: unknown[]): this {
    return this.forward((expectation) => expectation.withSomeOfArgs(...args));
  }

  zeroOrMoreTimes(): this {
    return this.forward((expectation) => expectation.zeroOrMoreTimes());
  }

  shouldNotReceive(...methodNames: (string | Readonly<Record<string, unknown>>)[]): unknown {
    return (this.getMock() as MockObject).shouldNotReceive(...methodNames);
  }

  /** PHP's `__call`: the call on every expectation, in order. */
  protected forward(call: (expectation: Expectation) => unknown): this {
    for (const expectation of this._expectations) {
      call(expectation);
    }
    return this;
  }

  private firstExpectation(): Expectation {
    const first = this._expectations[0];
    if (first === undefined) {
      throw new RuntimeException("No expectations have been added to this composite expectation");
    }
    return first;
  }
}
