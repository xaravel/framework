// PHP's `is_numeric` (AD-9, Story 9.6), which reads `_is_numeric_string_ex` (`numericString.ts`, re-exported here for
// the casts and `looseEquals`).
import { phpType } from "./casts";
import { parseNumeric } from "./numericString";
import { isFloat } from "./PhpFloat";

export { type NumericString, parseNumeric } from "./numericString";

/**
 * PHP's `is_numeric($v)`: true for an int or a float (`NAN` and `INF` included), and for a numeric string, which may
 * have leading and trailing whitespace; false for anything else.
 */
export function isNumeric(v: unknown): boolean {
  switch (typeof v) {
    case "number":
      return true;
    case "bigint":
    case "symbol":
      // `phpType` throws its TypeError for a bigint outside int64 and for a symbol, as every helper does.
      return phpType(v) === "int";
    case "string":
      return parseNumeric(v, false) !== null;
    default:
      return isFloat(v);
  }
}
