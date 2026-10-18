// PHP's `\UnexpectedValueException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
import { FQCN } from "../support/values";
import { RuntimeException } from "./RuntimeException";

export class UnexpectedValueException extends RuntimeException {
  static override readonly [FQCN]: string = "UnexpectedValueException";
}
