// Story 6.3 fixture: arrow test bodies in a file that does not call `uses()`; lints clean at every placement.
import { test } from "./support";

test("it runs", () => {
  return null;
});
