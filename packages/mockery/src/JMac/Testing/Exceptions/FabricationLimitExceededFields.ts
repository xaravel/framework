// `JMac\Testing\Exceptions\FabricationLimitExceededFields` (jasonmccreary/double v1.0.1): the message of "Loose
// mode's fabrication depth cap was hit". Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

export class FabricationLimitExceededFields {
  static readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\FabricationLimitExceededFields";

  static renderMessage(label: string, method: string): string {
    return `Double \`${label}\` was returned automatically. This only happens one level deep from the original double. To respond to \`${method}()\`, you'll need to configure it explicitly. For example: \`$${DoubleException.suggestedVariableName(label)}->allows('${method}')->returns($anotherDouble)\`.`;
  }
}
