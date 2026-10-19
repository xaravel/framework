// `JMac\Testing\Exceptions\UnexpectedCallFields` (jasonmccreary/double v1.0.1): the message of "Strict mode got an
// unexpected call", shared by UnexpectedCallException and PHPUnitUnexpectedCallException. Internal.
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import { CallListFormatter } from "../Diagnostics/CallListFormatter";
import { DoubleException } from "./DoubleException";

export class UnexpectedCallFields {
  static readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\UnexpectedCallFields";

  static renderMessage(
    label: string,
    method: string,
    argumentsDescription: string,
    fabricated: boolean,
    otherObservedCalls: readonly string[] = [],
    argumentComparisons: readonly ArgumentComparison[] | null = null,
  ): string {
    let message = `Double \`${label}\` received an unexpected call to \`${method}(${argumentsDescription})\`. This double is in Strict mode, so you need to configure every call.`;
    if (argumentComparisons !== null) {
      message += `\n\n${CallListFormatter.renderComparisonBlock(`The following similar call was made to \`${method}\`:`, argumentComparisons)}`;
    } else if (otherObservedCalls.length > 0) {
      message += `\n\n${CallListFormatter.renderCorrelationParagraph(method, otherObservedCalls)}`;
    } else {
      message += ` For example: \`$${DoubleException.suggestedVariableName(label)}->allows('${method}')->returns(...)\`.`;
    }
    return DoubleException.appendFabricatedNote(message, fabricated);
  }
}
