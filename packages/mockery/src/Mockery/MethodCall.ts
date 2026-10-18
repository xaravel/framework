// `Mockery\MethodCall` (Mockery 1.6.15): one call a mock received.
import { FQCN } from "../support/values";

export class MethodCall {
  static readonly [FQCN]: string = "Mockery\\MethodCall";

  readonly #args: readonly unknown[];
  readonly #method: string;

  constructor(method: string, args: readonly unknown[]) {
    this.#method = method;
    this.#args = args;
  }

  getArgs(): readonly unknown[] {
    return this.#args;
  }

  getMethod(): string {
    return this.#method;
  }
}
