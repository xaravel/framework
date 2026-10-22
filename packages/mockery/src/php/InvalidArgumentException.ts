// PHP's `\InvalidArgumentException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
// PHP parent: `\LogicException`. On its internal parent, which links it to the runtime's `\InvalidArgumentException` when the runtime's
// class map is published (Story 9.12, `SplParent.ts`).
import { FQCN } from "../support/values";
import { LogicException } from "./LogicException";
import { splParent } from "./SplParent";

export class InvalidArgumentException extends splParent("InvalidArgumentException", LogicException) {
  static override readonly [FQCN]: string = "InvalidArgumentException";
}
