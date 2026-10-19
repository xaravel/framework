// `JMac\Testing\Exceptions\StaticMethodException` (jasonmccreary/double v1.0.1): expects()/allows() on a static
// method. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class StaticMethodException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\StaticMethodException";

  constructor(
    readonly target: string,
    readonly method: string,
    readonly fabricated = false,
  ) {
    super(DoubleException.lead(`Can't configure \`${method}\` on a double for \`${target}\` since it's a static method. Static methods can't be doubled.`));
  }
}
