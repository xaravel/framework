// `JMac\Testing\Exceptions\AmbiguousExpectationFields` (jasonmccreary/double v1.0.1): the message of "two or more
// expectations on one method with identical argument matching, each with a finite call limit". Internal.
import { FQCN } from "../../../support/values";
import type { AmbiguousExpectation } from "../Diagnostics/AmbiguousExpectation";
import { Pluralizer } from "../Diagnostics/Pluralizer";
import { DoubleException } from "./DoubleException";

function renderSingle(label: string, ambiguity: AmbiguousExpectation, fabricated: boolean): string {
  const message =
    `Double \`${label}\` has \`${ambiguity.method}(${ambiguity.argumentsDescription})\` registered ${Pluralizer.pluralize(ambiguity.count, "time", "times")}. This looks like an attempt to return values in sequence. To be explicit about the order, combine them into one expectation instead.\n\n` +
    `For example: \`${ambiguity.method}(...)->times(${String(ambiguity.count)})->returns(...)\`.`;
  return DoubleException.appendFabricatedNote(message, fabricated);
}

function renderMultiple(label: string, ambiguities: readonly AmbiguousExpectation[], fabricated: boolean): string {
  const message =
    `${Pluralizer.pluralize(ambiguities.length, "method was", "methods were")} registered ambiguously on double \`${label}\`:\n\n${ambiguities
      .map((ambiguity) => `    \`${ambiguity.method}(${ambiguity.argumentsDescription})\`, registered ${Pluralizer.pluralize(ambiguity.count, "time", "times")}`)
      .join("\n")}\n\n` + "Each looks like an attempt to return values in sequence. To be explicit about the order, combine each into one expectation instead, using `times(n)->returns(...)`.";
  return DoubleException.appendFabricatedNote(message, fabricated);
}

export class AmbiguousExpectationFields {
  static readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\AmbiguousExpectationFields";

  static renderMessage(label: string, ambiguities: readonly AmbiguousExpectation[], fabricated: boolean): string {
    return ambiguities.length === 1 ? renderSingle(label, ambiguities[0]!, fabricated) : renderMultiple(label, ambiguities, fabricated);
  }
}
