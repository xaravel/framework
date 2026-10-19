// `JMac\Testing\Diagnostics\CallListFormatter` (jasonmccreary/double v1.0.1): capped call lists, the
// correlation paragraph and the comparison block of Double's messages. Internal.
import { FQCN } from "../../../support/values";
import type { ArgumentComparison } from "./ArgumentComparison";

const DIFF_LEGEND = "(`-` expected / `+` actual)";
const CAP = 3;

function capAndJoin(rendered: readonly string[]): string {
  const total = rendered.length;
  const shown = total <= CAP ? rendered : rendered.slice(0, CAP - 1);
  const remaining = total - shown.length;
  let joined = shown.join(", ");
  if (remaining > 0) {
    joined += `, and ${String(remaining)} more`;
  }
  return joined;
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

export class CallListFormatter {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\CallListFormatter";

  /** A capped "`method(args)`, `method(args)`, and N more" list. */
  static describe(method: string, callDescriptions: readonly string[]): string {
    return capAndJoin(callDescriptions.map((call) => `\`${method}(${call})\``));
  }

  static describeCalls(callDescriptions: readonly string[]): string {
    return capAndJoin(callDescriptions.map((call) => `\`${call}\``));
  }

  static renderCorrelationParagraph(method: string, callDescriptions: readonly string[]): string {
    return `The following calls to \`${method}\` were made during this test: ${CallListFormatter.describe(method, callDescriptions)}\n`;
  }

  static renderComparisonBlock(intro: string, comparisons: readonly ArgumentComparison[]): string {
    const lines = comparisons.map((comparison) => (comparison.differs ? `  ${comparison.label}:\n${indent(comparison.text, "    ")}` : `  ${comparison.label}: ${comparison.text}`));
    const anyDiffers = comparisons.some((comparison) => comparison.differs);
    return `${intro}\n${lines.join("\n")}\n${anyDiffers ? `\n${DIFF_LEGEND}\n` : ""}`;
  }
}
