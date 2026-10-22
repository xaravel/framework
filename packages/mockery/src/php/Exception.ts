// PHP's `\Exception`, grader-internal (Story 4.5, ESC-4.5-1 item 2): the root
// of the SPL parents of Mockery's exceptions. Not exported from the package.
// PHP parent: none (the JS `Error`). On its internal parent, which carries the
// constructor and PHP's getters and links it to the runtime's `\Exception` when
// the runtime's class map is published (Story 9.12, `SplParent.ts`).
import { FQCN } from "../support/values";
import { splParent } from "./SplParent";

export class Exception extends splParent("Exception", Error) {
  static override readonly [FQCN]: string = "Exception";
}
