// Ported from framework/tests/Support/Fixtures/UnionTypesClosure.php (Laravel v13.37.0), Story 13.1.
//
// The file returns a closure, so the module's default export is it. Its hints are declared with `inject` (DIV-3.3):
// the union `ExampleParameter|AnotherExampleParameter` as `oneOf(...)`, and the untyped `$b` as `primitive`.
import { inject, oneOf, primitive } from "@xaravel/runtime";
import { AnotherExampleParameter, ExampleParameter } from "../SupportReflectsClosuresTest.test";

export default inject({ a: oneOf(ExampleParameter, AnotherExampleParameter), b: primitive }, (a: ExampleParameter | AnotherExampleParameter, b: unknown) => { // adapted:DIV-3.3
  void a;
  void b;
  //
});
