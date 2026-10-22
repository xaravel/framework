// PHP's `\BadMethodCallException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
// PHP parent: `\BadFunctionCallException`. On its internal parent, which links it to the runtime's `\BadMethodCallException` when the runtime's
// class map is published (Story 9.12, `SplParent.ts`).
import { FQCN } from "../support/values";
import { BadFunctionCallException } from "./BadFunctionCallException";
import { splParent } from "./SplParent";

export class BadMethodCallException extends splParent("BadMethodCallException", BadFunctionCallException) {
  static override readonly [FQCN]: string = "BadMethodCallException";
}
