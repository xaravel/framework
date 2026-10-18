// PHPUnit 13.4.3's `Constraint\IsJson` (Story 4.4): `json_validate()`. Internal to the grader.
import { JSON_ERROR_CTRL_CHAR, JSON_ERROR_DEPTH, JSON_ERROR_NONE, JSON_ERROR_STATE_MISMATCH, JSON_ERROR_SYNTAX, JSON_ERROR_UTF8, jsonDecode, jsonValidate } from "../../../util/Json";
import { Constraint, valueToTypeStringFragment } from "../../Constraint";

function determineJsonError(json: string): string {
  switch (jsonDecode(json).error) {
    case JSON_ERROR_NONE:
      return "";
    case JSON_ERROR_DEPTH:
      return "Maximum stack depth exceeded";
    case JSON_ERROR_STATE_MISMATCH:
      return "Underflow or the modes mismatch";
    case JSON_ERROR_CTRL_CHAR:
      return "Unexpected control character found";
    case JSON_ERROR_SYNTAX:
      return "Syntax error, malformed JSON";
    case JSON_ERROR_UTF8:
      return "Malformed UTF-8 characters, possibly incorrectly encoded";
    default:
      return "Unknown error";
  }
}

export class IsJson extends Constraint {
  toString(): string {
    return "is valid JSON";
  }

  override negatedToString(): string {
    return "is not valid JSON";
  }

  protected override matches(other: unknown): boolean {
    if (typeof other !== "string" || other === "") {
      return false;
    }
    return jsonValidate(other) === JSON_ERROR_NONE;
  }

  override failureDescription(other: unknown): string {
    if (typeof other !== "string") {
      return `${valueToTypeStringFragment(other)}is valid JSON`;
    }
    if (other === "") {
      return "an empty string is valid JSON";
    }
    return `a string is valid JSON (${determineJsonError(other)})`;
  }

  override negatedFailureDescription(other: unknown): string {
    if (typeof other !== "string") {
      return `${valueToTypeStringFragment(other)}is not valid JSON`;
    }
    if (other === "") {
      return "an empty string is not valid JSON";
    }
    return "a string is not valid JSON";
  }
}
