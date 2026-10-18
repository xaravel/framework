// sebastian/comparator 8.4.0's `ExceptionComparator` (Story 4.3): two errors
// compare as objects, without file, line, trace or string.
import type { Entries } from "../comparison/PhpComparison";
import { ObjectComparator } from "./ObjectComparator";

const SKIPPED = new Set(["file", "line", "trace", "string", "xdebug_message"]);

export class ExceptionComparator extends ObjectComparator {
  override accepts(expected: unknown, actual: unknown): boolean {
    return expected instanceof Error && actual instanceof Error;
  }

  protected override toArray(object: object): Entries {
    return super.toArray(object).filter(([key]) => typeof key !== "string" || !SKIPPED.has(key));
  }
}
