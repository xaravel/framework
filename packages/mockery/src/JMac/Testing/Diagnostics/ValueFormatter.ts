// `JMac\Testing\Diagnostics\ValueFormatter` (jasonmccreary/double v1.0.1): a
// scalar or null as `var_export` prints it, an array as `array(<count>)`, any
// other value as `get_debug_type`. Internal.
import { arrayEntries, FQCN, getDebugType, isPhpArray, varExport } from "../../../support/values";

export class ValueFormatter {
  static readonly [FQCN]: string = "JMac\\Testing\\Diagnostics\\ValueFormatter";

  static describe(value: unknown): string {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
      return varExport(value);
    }
    if (isPhpArray(value)) {
      return `array(${arrayEntries(value).length})`;
    }
    return getDebugType(value);
  }
}
