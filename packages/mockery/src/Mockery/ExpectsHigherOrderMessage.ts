// `Mockery\ExpectsHigherOrderMessage` (Mockery 1.6.15): what `expects()`
// returns with no method name; `$mock->expects()->foo(1)` expects `foo(1)` once.
import { FQCN } from "../support/values";
import { HigherOrderMessage } from "./HigherOrderMessage";

export class ExpectsHigherOrderMessage extends HigherOrderMessage {
  static override readonly [FQCN]: string = "Mockery\\ExpectsHigherOrderMessage";

  constructor(mock: object) {
    super(mock, "shouldReceive");
  }

  override __call(method: string, args: unknown[]): any {
    const expectation = super.__call(method, args) as { once(): unknown };
    return expectation.once();
  }
}
