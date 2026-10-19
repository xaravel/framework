// `JMac\Testing\Exceptions\ExpectationCallMismatchFields` (jasonmccreary/double v1.0.1): the message of "a call to a
// method with expects() configured matches none of its expectations". Internal.
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import { CallListFormatter } from "../Diagnostics/CallListFormatter";
import { Pluralizer } from "../Diagnostics/Pluralizer";
import { DoubleException } from "./DoubleException";

export class ExpectationCallMismatchFields {
  static readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\ExpectationCallMismatchFields";

  static renderMessage(
    label: string,
    method: string,
    argumentsDescription: string,
    fabricated: boolean,
    configuredCalls: readonly string[] = [],
    argumentComparisons: readonly ArgumentComparison[] | null = null,
    passthru = false,
  ): string {
    let message = `Double \`${label}\` received a call to \`${method}(${argumentsDescription})\` that doesn't match any of its configured expectations.`;
    if (argumentComparisons !== null) {
      message += `\n\n${CallListFormatter.renderComparisonBlock(`The following similar call was made to \`${method}\`:`, argumentComparisons)}`;
    } else if (configuredCalls.length > 0) {
      message += `\n\nThis double has ${Pluralizer.pluralize(configuredCalls.length, "expectation", "expectations")} configured for \`${method}\`, but none match this call: ${CallListFormatter.describe(method, configuredCalls)}`;
    }
    message = DoubleException.appendPassthruNote(message, passthru);
    return DoubleException.appendFabricatedNote(message, fabricated);
  }
}
