// `JMac\Testing\Exceptions\UnsatisfiedExpectationFields` (jasonmccreary/double v1.0.1): the message of "one or more
// expects() expectations were never satisfied". Internal.
import { FQCN } from "../../../support/values";
import { CallListFormatter } from "../Diagnostics/CallListFormatter";
import { Pluralizer } from "../Diagnostics/Pluralizer";
import type { UnsatisfiedExpectation } from "../Diagnostics/UnsatisfiedExpectation";
import { DoubleException } from "./DoubleException";

function renderSingle(label: string, expectation: UnsatisfiedExpectation, fabricated: boolean): string {
  let message = `Double \`${label}\` ${expectation.description}.`;
  if (expectation.argumentComparisons !== null) {
    message += `\n\n${CallListFormatter.renderComparisonBlock(`The following similar call was made to \`${expectation.method}\`:`, expectation.argumentComparisons)}`;
  } else if (expectation.otherObservedCalls.length > 0) {
    message += `\n\n${CallListFormatter.renderCorrelationParagraph(expectation.method, expectation.otherObservedCalls)}`;
    if (expectation.argumentMismatch !== null) {
      message += `\n${expectation.argumentMismatch.charAt(0).toUpperCase()}${expectation.argumentMismatch.slice(1)}`;
    }
  }
  return DoubleException.appendFabricatedNote(message, fabricated);
}

function renderInlineCorrelation(expectation: UnsatisfiedExpectation): string {
  if (expectation.otherObservedCalls.length === 0) {
    return "";
  }
  return ` (other calls: ${CallListFormatter.describe(expectation.method, expectation.otherObservedCalls)})`;
}

function renderMultiple(label: string, expectations: readonly UnsatisfiedExpectation[], fabricated: boolean): string {
  const message = `${Pluralizer.pluralize(expectations.length, "expectation was", "expectations were")} not satisfied on double \`${label}\`:\n\n${expectations
    .map((expectation) => `    ${expectation.description}${renderInlineCorrelation(expectation)}`)
    .join("\n")}`;
  return DoubleException.appendFabricatedNote(message, fabricated);
}

export class UnsatisfiedExpectationFields {
  static readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\UnsatisfiedExpectationFields";

  static renderMessage(label: string, expectations: readonly UnsatisfiedExpectation[], fabricated: boolean): string {
    return expectations.length === 1 ? renderSingle(label, expectations[0]!, fabricated) : renderMultiple(label, expectations, fabricated);
  }
}
