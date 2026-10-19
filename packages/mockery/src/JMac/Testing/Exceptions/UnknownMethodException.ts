// `JMac\Testing\Exceptions\UnknownMethodException` (jasonmccreary/double v1.0.1): expects()/allows() on a method
// the target does not declare, with DidYouMean's suggestion. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class UnknownMethodException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\UnknownMethodException";

  constructor(
    readonly target: string,
    readonly method: string,
    readonly fabricated = false,
    readonly suggestion: string | null = null,
  ) {
    super(
      DoubleException.lead(
        `Can't configure \`${method}\` on a double for \`${target}\` because it doesn't declare this method.${suggestion !== null ? ` Did you mean \`${suggestion}\`?` : ""}${DoubleException.fabricatedNote(fabricated)}`,
      ),
    );
  }
}
