// PHP's `\UnexpectedValueException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
// PHP parent: `\RuntimeException`. On its internal parent, which links it to the runtime's `\UnexpectedValueException` when the runtime's
// class map is published (Story 9.12, `SplParent.ts`).
import { FQCN } from "../support/values";
import { RuntimeException } from "./RuntimeException";
import { splParent } from "./SplParent";

export class UnexpectedValueException extends splParent("UnexpectedValueException", RuntimeException) {
  static override readonly [FQCN]: string = "UnexpectedValueException";
}
