// `JMac\Testing\Diagnostics\ArgumentFormatter` (jasonmccreary/double v1.0.1). Internal.
import { FQCN } from "../../../support/values";
import { ValueFormatter } from "./ValueFormatter";

export class ArgumentFormatter {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\ArgumentFormatter";

  static describe(args: readonly unknown[]): string {
    return args.map((argument) => ValueFormatter.describe(argument)).join(", ");
  }
}
