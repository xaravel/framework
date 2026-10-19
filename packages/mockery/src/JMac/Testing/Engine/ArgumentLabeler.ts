// `JMac\Testing\Engine\ArgumentLabeler` (jasonmccreary/double v1.0.1): each positional comparison labelled with
// its declared parameter name; positions past the last declared name are `<name>[n]`, and with no names
// `argument <n>`. Internal.
import { FQCN } from "../../../support/values";
import { ArgumentComparison } from "../Diagnostics/ArgumentComparison";
import type { PositionalComparison } from "./MethodExpectation";

function labelFor(parameterNames: readonly string[], index: number): string {
  if (parameterNames.length === 0) {
    return `argument ${String(index + 1)}`;
  }
  const lastDeclaredIndex = parameterNames.length - 1;
  return index <= lastDeclaredIndex ? parameterNames[index]! : `${parameterNames[lastDeclaredIndex]!}[${String(index - lastDeclaredIndex)}]`;
}

export class ArgumentLabeler {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\ArgumentLabeler";

  static label(parameterNames: readonly string[], comparisons: readonly PositionalComparison[]): ArgumentComparison[] {
    return comparisons.map((comparison) => new ArgumentComparison(labelFor(parameterNames, comparison.index), comparison.differs, comparison.text));
  }
}
