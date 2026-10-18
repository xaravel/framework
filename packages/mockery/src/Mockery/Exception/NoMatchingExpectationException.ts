// `Mockery\Exception\NoMatchingExpectationException` (Mockery 1.6.15): a call
// whose arguments match none of its method's expectations.
import { Exception } from "../Exception";
import type { LegacyMockInterface } from "../LegacyMockInterface";
import { FQCN } from "../../support/values";

export class NoMatchingExpectationException extends Exception {
  static override readonly [FQCN]: string = "Mockery\\Exception\\NoMatchingExpectationException";

  #actual: unknown[] = [];
  #method: string | null = null;
  #mockObject: LegacyMockInterface | null = null;

  getActualArguments(): unknown[] {
    return this.#actual;
  }

  getMethodName(): string | null {
    return this.#method;
  }

  getMock(): LegacyMockInterface | null {
    return this.#mockObject;
  }

  getMockName(): string | null {
    const mock = this.getMock();
    if (mock === null) {
      return null;
    }
    return mock.mockery_getName();
  }

  setActualArguments(count: unknown[]): this {
    this.#actual = count;
    return this;
  }

  setMethodName(name: string): this {
    this.#method = name;
    return this;
  }

  setMock(mock: LegacyMockInterface): this {
    this.#mockObject = mock;
    return this;
  }
}
