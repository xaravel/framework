import { TestCase } from "@xaravel/assert";
import { BlockedByComponentError } from "@xaravel/runtime";

/** The shared test-only hold for Support's absent clock; Epic 19 must remove this unconditional gate. */
export class SupportLazyCollectionBlockedBySupportTest extends TestCase {
  setUp(): void { throw new BlockedByComponentError("support"); }
}
