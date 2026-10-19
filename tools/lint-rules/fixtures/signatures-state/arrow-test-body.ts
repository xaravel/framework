// Story 6.3 fixture: fails `xaravel/no-arrow-test-body` only, at any placement.
import { test, TestCase, uses } from "./support";

uses(TestCase);

test("it runs", () => {
  return null;
});
