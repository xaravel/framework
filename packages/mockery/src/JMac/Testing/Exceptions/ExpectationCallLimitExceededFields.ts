// `JMac\Testing\Exceptions\ExpectationCallLimitExceededFields` (jasonmccreary/double v1.0.1): the message of "a call
// exceeded its expectation's maximum". Internal.
import { FQCN } from "../../../support/values";
import { Pluralizer } from "../Diagnostics/Pluralizer";
import { DoubleException } from "./DoubleException";

export class ExpectationCallLimitExceededFields {
  static readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\ExpectationCallLimitExceededFields";

  static renderMessage(label: string, method: string, argumentsDescription: string, maximum: number, callNumber: number, fabricated: boolean, otherMatchingExpectations = 0): string {
    let message = `Double \`${label}\` received ${Pluralizer.pluralize(callNumber, "call", "calls")} to \`${method}(${argumentsDescription})\`, but your expectation only allowed ${Pluralizer.pluralize(maximum, "call", "calls")}.`;
    if (otherMatchingExpectations > 0) {
      message +=
        otherMatchingExpectations === 1
          ? ` Note: 1 other expectation for \`${method}\` also matches this call's arguments but was not selected — check registration order.`
          : ` Note: ${String(otherMatchingExpectations)} other expectations for \`${method}\` also match this call's arguments but were not selected — check registration order.`;
    }
    return message + DoubleException.fabricatedNote(fabricated);
  }
}
