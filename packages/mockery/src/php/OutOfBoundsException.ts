// PHP's `\OutOfBoundsException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
import { FQCN } from "../support/values";
import { RuntimeException } from "./RuntimeException";

export class OutOfBoundsException extends RuntimeException {
  static override readonly [FQCN]: string = "OutOfBoundsException";
}
