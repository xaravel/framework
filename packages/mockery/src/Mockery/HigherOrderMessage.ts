// `Mockery\HigherOrderMessage` (Mockery 1.6.15): what `shouldReceive()`,
// `shouldNotReceive()`, `allows()`, `shouldHaveReceived()` and
// `shouldNotHaveReceived()` return when given no method name.
// `$mock->shouldReceive()->foo(1)` is `$mock->shouldReceive('foo')->withArgs([1])`.
//
// PHP's `__call` is a Proxy: a string key reads a function that sends the
// message. Symbol keys, and `then` (a promise probe, as on a mock: ESC-4.5-1
// item 5), read the object itself.
import { FQCN } from "../support/values";

type Sender = Record<string, (...args: unknown[]) => unknown>;

export class HigherOrderMessage {
  static readonly [FQCN]: string = "Mockery\\HigherOrderMessage";

  readonly #method: string;
  readonly #mock: object;

  constructor(mock: object, method: string) {
    this.#mock = mock;
    this.#method = method;
    return new Proxy(this, {
      get: (target, key, receiver): unknown => {
        if (typeof key === "symbol" || key === "then") {
          return Reflect.get(target, key, receiver);
        }
        return (...args: unknown[]): unknown => target.__call(key, args);
      },
    });
  }

  /** Sends `method(args)` as the message's API call. */
  __call(method: string, args: unknown[]): any {
    const mock = this.#mock as Sender;
    if (this.#method === "shouldNotHaveReceived") {
      return mock[this.#method]!(method, args);
    }
    const expectation = mock[this.#method]!(method) as { withArgs(args: unknown[]): unknown };
    return expectation.withArgs(args);
  }
}
