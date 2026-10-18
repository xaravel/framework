// The date family (Story 3.1, decisions/ESC-3.1-1.md): `date-format`
// requests from SupportCarbonTest. Bodies are read as for php-expr (no
// dataset bindings: the input has none, so a body using a parameter is
// unreadable). `now` is the PHP source of the `setTestNow(…)` argument in
// the class's setUp() (a leading `$this-><property> =` dropped), or null;
// `timezone` is phpunit.xml.dist's `date.timezone`. An unreadable setUp() or
// a missing `date.timezone` fails the run rather than guess. setUp() itself still runs
// before the setup (the evaluation contract), so `now` documents the clock.
import type { DateFormatInput } from "../request";
import { isCode, readSegments, renderSource, statements, type ExtractTest, type Family, type PhpClass, type PhpFile, resolveClassName, matchClose, splitArgs } from "./php";

export const DATE_FILES: readonly string[] = ["tests/Support/SupportCarbonTest.php"];

/** The Carbon classes whose `setTestNow` freezes the clock. */
const CARBON_CLASSES = new Set(["\\illuminate\\support\\carbon", "\\carbon\\carbon", "\\carbon\\carbonimmutable", "\\illuminate\\support\\facades\\date"]);

/** The `setTestNow` argument in setUp(), as resolved source; null when setUp() sets no test clock. Throws when setUp() cannot be read. */
export function testNow(file: PhpFile, cls: PhpClass): string | null {
  const body = cls.methods.get("setup")?.body;
  if (body === undefined || body === null) {
    return null;
  }
  const list = statements(body);
  if (list === null) {
    throw new Error(`${file.path}: ${cls.name}::setUp() is not readable, so the test clock (now) is unknown`);
  }
  let now: string | null = null;
  for (const statement of list) {
    const code = statement.code;
    const [name, colon, method, open] = code;
    const mentions = code.some((token) => token.text.toLowerCase() === "settestnow");
    const unknown = (): never => {
      throw new Error(`${file.path}: ${cls.name}::setUp() calls setTestNow in a form the date family cannot read (line ${code[0]!.line})`);
    };
    if (name === undefined || colon?.name !== "T_DOUBLE_COLON" || method?.text.toLowerCase() !== "settestnow" || open?.name !== "(") {
      if (mentions) unknown();
      continue;
    }
    if (!CARBON_CLASSES.has(resolveClassName(file, name).toLowerCase())) {
      unknown();
    }
    const fullOpen = statement.tokens.indexOf(open);
    const args = splitArgs(statement.tokens, fullOpen, matchClose(statement.tokens, fullOpen));
    if (args.length !== 1 || code[matchClose(code, 3) + 1]?.name !== ";") {
      unknown();
    }
    let arg = args[0]!;
    const argCode = arg.filter(isCode);
    if (argCode[0]?.text === "$this" && argCode[1]?.name === "T_OBJECT_OPERATOR" && argCode[2]?.name === "T_STRING" && argCode[3]?.name === "=") {
      arg = arg.slice(arg.indexOf(argCode[3]) + 1);
    }
    now = renderSource(file, arg);
  }
  return now;
}

export const dateFamily: Family<DateFormatInput> = {
  name: "date",
  kind: "date-format",
  files: DATE_FILES,
  extract(test: ExtractTest): DateFormatInput[] {
    const timezone = test.ini["date.timezone"];
    if (timezone === undefined || timezone === "") {
      throw new Error("phpunit.xml.dist sets no date.timezone <ini>, which date-format requests need");
    }
    if (test.method.body === null) {
      return [];
    }
    const now = testNow(test.file, test.cls);
    const segments = readSegments(test.file, test.method.body, { defined: [], cls: test.cls });
    return (segments ?? []).map((segment) => ({ now, timezone, setup: segment.setup, exprs: segment.exprs }));
  },
};
