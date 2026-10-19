// `JMac\Testing\Exceptions\PassthruTypeMismatchException` (jasonmccreary/double v1.0.1): passthru() given an
// instance that is not the doubled class or a subclass. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class PassthruTypeMismatchException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\PassthruTypeMismatchException";

  constructor(
    readonly target: string,
    readonly givenClass: string,
  ) {
    super(
      DoubleException.lead(
        `\`passthru()\` was given an instance of \`${givenClass}\`, but this is a double for \`${target}\`. The instance passed to \`passthru()\` must be \`${target}\` or one of its subclasses.`,
      ),
    );
  }
}
