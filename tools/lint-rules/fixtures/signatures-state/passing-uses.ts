// Story 6.3 fixture: `function` test bodies in a file that calls `uses()`; lints clean at every placement.
import { test, TestCase, uses } from "./support";

uses(TestCase);

test("it runs", function () {
  return this.name;
});
