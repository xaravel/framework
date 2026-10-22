// PHP's `\RuntimeException`, grader-internal (Story 4.5, ESC-4.5-1 item 2). Not exported from the package.
// PHP parent: `\Exception`. On its internal parent, which links it to the runtime's `\RuntimeException` when the runtime's
// class map is published (Story 9.12, `SplParent.ts`).
import { FQCN } from "../support/values";
import { Exception } from "./Exception";
import { splParent } from "./SplParent";

export class RuntimeException extends splParent("RuntimeException", Exception) {
  static override readonly [FQCN]: string = "RuntimeException";
}
