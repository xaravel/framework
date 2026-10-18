// PHP's `\LogicException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
import { FQCN } from "../support/values";
import { Exception } from "./Exception";

export class LogicException extends Exception {
  static override readonly [FQCN]: string = "LogicException";
}
