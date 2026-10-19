// `JMac\Testing\Exceptions\MagicMethodException` (jasonmccreary/double v1.0.1): expects()/allows() on a magic
// method. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class MagicMethodException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\MagicMethodException";

  constructor(
    readonly target: string,
    readonly method: string,
    readonly fabricated = false,
  ) {
    super(DoubleException.lead(`Can't configure \`${method}\` on a double for \`${target}\` since it's a magic method. Magic methods can't be doubled.`));
  }
}
