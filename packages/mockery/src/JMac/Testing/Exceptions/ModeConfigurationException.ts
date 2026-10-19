// `JMac\Testing\Exceptions\ModeConfigurationException` (jasonmccreary/double v1.0.1): a double's mode set twice.
// Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class ModeConfigurationException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\ModeConfigurationException";

  constructor(
    readonly label: string,
    readonly current: string,
    readonly attempted: string,
    readonly fabricated = false,
  ) {
    super(DoubleException.lead(`Double \`${label}\` is already "${current.toLowerCase()}". You can't set its mode again.${DoubleException.fabricatedNote(fabricated)}`));
  }
}
