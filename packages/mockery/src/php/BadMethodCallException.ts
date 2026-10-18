// PHP's `\BadMethodCallException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
import { FQCN } from "../support/values";
import { BadFunctionCallException } from "./BadFunctionCallException";

export class BadMethodCallException extends BadFunctionCallException {
  static override readonly [FQCN]: string = "BadMethodCallException";
}
