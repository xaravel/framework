// The Str family (Story 3.1, decisions/ESC-3.1-1.md): `php-expr` requests
// from SupportStrTest and SupportStringableTest. Each readable body gives one
// request per segment: `bindings` from the dataset row, `setup` the
// statements before the segment's assertions (earlier assertions reduced to
// their actual argument), `exprs` the actual arguments.
import type { PhpExprInput } from "../request";
import { readSegments, type ExtractTest, type Family } from "./php";

export const STR_FILES: readonly string[] = ["tests/Support/SupportStrTest.php", "tests/Support/SupportStringableTest.php"];

/** php-expr inputs of a body read with the php-expr rules, the dataset bound to the method's parameters. */
export function phpExprInputs(test: ExtractTest): PhpExprInput[] {
  if (test.method.body === null || test.bindings === null) {
    return [];
  }
  const bindings = test.bindings;
  const segments = readSegments(test.file, test.method.body, { defined: Object.keys(bindings).map((name) => `$${name}`), cls: test.cls });
  return (segments ?? []).map((segment) => ({ bindings, setup: segment.setup, exprs: segment.exprs }));
}

export const strFamily: Family<PhpExprInput> = {
  name: "str",
  kind: "php-expr",
  files: STR_FILES,
  extract: phpExprInputs,
};
