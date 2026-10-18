// `Mockery\Exception\InvalidCountException` (Mockery 1.6.15): an unmet call count.
import { Exception } from "../CountValidator/Exception";
import type { LegacyMockInterface } from "../LegacyMockInterface";
import { FQCN } from "../../support/values";
import { RuntimeException } from "./RuntimeException";

export class InvalidCountException extends Exception {
  static override readonly [FQCN]: string = "Mockery\\Exception\\InvalidCountException";

  #actual: number | null = null;
  #expected = 0;
  #expectedComparative = "<=";
  #method: string | null = null;
  #mockObject: LegacyMockInterface | null = null;

  getActualCount(): number | null {
    return this.#actual;
  }

  getExpectedCount(): number {
    return this.#expected;
  }

  getExpectedCountComparative(): string {
    return this.#expectedComparative;
  }

  getMethodName(): string | null {
    return this.#method;
  }

  getMock(): LegacyMockInterface | null {
    return this.#mockObject;
  }

  getMockName(): string {
    const mock = this.getMock();
    if (mock === null) {
      return "";
    }
    return mock.mockery_getName();
  }

  setActualCount(count: number): this {
    this.#actual = count;
    return this;
  }

  setExpectedCount(count: number): this {
    this.#expected = count;
    return this;
  }

  setExpectedCountComparative(comp: string): this {
    if (!["=", ">", "<", ">=", "<="].includes(comp)) {
      throw new RuntimeException(`Illegal comparative for expected call counts set: ${comp}`);
    }
    this.#expectedComparative = comp;
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
