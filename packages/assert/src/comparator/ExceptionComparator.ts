// sebastian/comparator 8.4.0's `ExceptionComparator` (Story 4.3): two PHP
// `\Exception`s compare as objects, without file, line, trace or string.
//
// When the runtime's class map is published (`Symbol.for('xaravel.php.classes')`,
// read by symbol only, AD-2), only two instances of its `Exception` are accepted:
// a PHP `\Error` (the runtime's `Error`, `TypeError`, …) or a plain JS `Error`
// goes to the next comparator, as PHP sends `\Error` to `ObjectComparator`
// (Story 9.11, ESC-4.3-1 item 10). With no map, any two JS `Error`s are accepted,
// as before (DIV-9.8).
import type { Entries } from "../comparison/PhpComparison";
import { phpClass } from "../Framework/Exception/RuntimeExceptionParent";
import { ObjectComparator } from "./ObjectComparator";

const SKIPPED = new Set(["file", "line", "trace", "string", "xdebug_message"]);

export class ExceptionComparator extends ObjectComparator {
  override accepts(expected: unknown, actual: unknown): boolean {
    const exception = phpClass("Exception");
    if (exception !== null) {
      return expected instanceof exception && actual instanceof exception;
    }
    return expected instanceof Error && actual instanceof Error;
  }

  protected override toArray(object: object): Entries {
    return super.toArray(object).filter(([key]) => typeof key !== "string" || !SKIPPED.has(key));
  }
}
