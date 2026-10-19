// `JMac\Testing\Diagnostics\Pluralizer` (jasonmccreary/double v1.0.1). Internal.
import { FQCN } from "../../../support/values";

export class Pluralizer {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\Pluralizer";

  static pluralize(count: number, singular: string, plural: string): string {
    return `${String(count)} ${count === 1 ? singular : plural}`;
  }
}
