// `Mockery\Exception\InvalidOrderException` (Mockery 1.6.15): a call out of its `ordered()` place.
import { Exception } from "../Exception";
import type { LegacyMockInterface } from "../LegacyMockInterface";
import { FQCN } from "../../support/values";

export class InvalidOrderException extends Exception {
  static override readonly [FQCN]: string = "Mockery\\Exception\\InvalidOrderException";

  #actual: number | null = null;
  #expected = 0;
  #method: string | null = null;
  #mockObject: LegacyMockInterface | null = null;

  getActualOrder(): number | null {
    return this.#actual;
  }

  getExpectedOrder(): number {
    return this.#expected;
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

  setActualOrder(count: number): this {
    this.#actual = count;
    return this;
  }

  setExpectedOrder(count: number): this {
    this.#expected = count;
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
