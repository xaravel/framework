// PHP's `\InvalidArgumentException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
import { FQCN } from "../support/values";
import { LogicException } from "./LogicException";

export class InvalidArgumentException extends LogicException {
  static override readonly [FQCN]: string = "InvalidArgumentException";
}
