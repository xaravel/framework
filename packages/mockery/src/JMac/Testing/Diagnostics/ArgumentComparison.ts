// `JMac\Testing\Diagnostics\ArgumentComparison` (jasonmccreary/double v1.0.1): one labelled argument of a
// comparison block. Internal.
import { FQCN } from "../../../support/values";

export class ArgumentComparison {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\ArgumentComparison";

  constructor(
    readonly label: string,
    readonly differs: boolean,
    readonly text: string,
  ) {}
}
