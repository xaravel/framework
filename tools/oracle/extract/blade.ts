// The Blade family (Story 3.1, decisions/ESC-3.1-1.md): `blade-render`
// requests from the `compileString(<literal>)` calls under tests/View/Blade/
// and the `Blade::render(<literal>[, <literal array>])` calls in
// tests/Integration/View/BladeTest.php. The Oracle renders each template, so
// DIV-5's rendered-HTML assertions get an expected value even where Upstream
// asserts compiled PHP.
//
// A readable body holds only known assertions and `$var = <literal>;`
// assignments. A template is a literal, or a variable assigned a literal
// earlier in the body; `data` is `{}` for compileString, else the decoded
// array. One request per distinct (template, data), in body order. A test
// class that declares its own setUp() (beyond AbstractBladeTestCase's)
// configures the compiler, so its templates give no request. A body
// with any other statement, or a call whose template or data is not a
// literal (a parameter, an interpolated string, a computed value), gives no
// request.
import type { BladeRenderInput, Json } from "../request";
import { asObject, decodeLiteral, isCode, isKnownAssertion, matchClose, resolveClassName, splitArgs, statements, hasNamedArgument, type ExtractTest, type Family, type Token } from "./php";

/** The test-less base class of tests/View/Blade/; listed, but it has no Test IDs. */
export const BLADE_BASE = "tests/View/Blade/AbstractBladeTestCase.php";

export const BLADE_FILES: readonly string[] = [
  "tests/View/Blade/AbstractBladeTestCase.php",
  "tests/View/Blade/BladeAppendTest.php",
  "tests/View/Blade/BladeBoolTest.php",
  "tests/View/Blade/BladeBreakStatementsTest.php",
  "tests/View/Blade/BladeCanStatementsTest.php",
  "tests/View/Blade/BladeCananyStatementsTest.php",
  "tests/View/Blade/BladeCannotStatementsTest.php",
  "tests/View/Blade/BladeCheckedStatementsTest.php",
  "tests/View/Blade/BladeClassTest.php",
  "tests/View/Blade/BladeCommentsTest.php",
  "tests/View/Blade/BladeComponentFirstTest.php",
  "tests/View/Blade/BladeComponentTagCompilerTest.php",
  "tests/View/Blade/BladeComponentsTest.php",
  "tests/View/Blade/BladeContextTest.php",
  "tests/View/Blade/BladeContinueStatementsTest.php",
  "tests/View/Blade/BladeCustomTest.php",
  "tests/View/Blade/BladeEchoHandlerTest.php",
  "tests/View/Blade/BladeEchoTest.php",
  "tests/View/Blade/BladeElseAuthStatementsTest.php",
  "tests/View/Blade/BladeElseGuestStatementsTest.php",
  "tests/View/Blade/BladeElseIfStatementsTest.php",
  "tests/View/Blade/BladeElseStatementsTest.php",
  "tests/View/Blade/BladeEndSectionsTest.php",
  "tests/View/Blade/BladeEnvironmentStatementsTest.php",
  "tests/View/Blade/BladeErrorTest.php",
  "tests/View/Blade/BladeEscapedTest.php",
  "tests/View/Blade/BladeExpressionTest.php",
  "tests/View/Blade/BladeExtendsTest.php",
  "tests/View/Blade/BladeForStatementsTest.php",
  "tests/View/Blade/BladeForeachStatementsTest.php",
  "tests/View/Blade/BladeForelseStatementsTest.php",
  "tests/View/Blade/BladeFragmentTest.php",
  "tests/View/Blade/BladeHasSectionTest.php",
  "tests/View/Blade/BladeHasStackTest.php",
  "tests/View/Blade/BladeHelpersTest.php",
  "tests/View/Blade/BladeIfAuthStatementsTest.php",
  "tests/View/Blade/BladeIfEmptyStatementsTest.php",
  "tests/View/Blade/BladeIfGuestStatementsTest.php",
  "tests/View/Blade/BladeIfIssetStatementsTest.php",
  "tests/View/Blade/BladeIfStatementsTest.php",
  "tests/View/Blade/BladeIncludesTest.php",
  "tests/View/Blade/BladeInjectTest.php",
  "tests/View/Blade/BladeJsTest.php",
  "tests/View/Blade/BladeJsonTest.php",
  "tests/View/Blade/BladeLangTest.php",
  "tests/View/Blade/BladeOverwriteSectionTest.php",
  "tests/View/Blade/BladePhpStatementsTest.php",
  "tests/View/Blade/BladePrependTest.php",
  "tests/View/Blade/BladePropsTest.php",
  "tests/View/Blade/BladePushTest.php",
  "tests/View/Blade/BladeSectionMissingTest.php",
  "tests/View/Blade/BladeSectionTest.php",
  "tests/View/Blade/BladeSessionTest.php",
  "tests/View/Blade/BladeShowTest.php",
  "tests/View/Blade/BladeStackTest.php",
  "tests/View/Blade/BladeStopSectionTest.php",
  "tests/View/Blade/BladeStyleTest.php",
  "tests/View/Blade/BladeUnlessStatementsTest.php",
  "tests/View/Blade/BladeUnsetStatementsTest.php",
  "tests/View/Blade/BladeUseTest.php",
  "tests/View/Blade/BladeVerbatimTest.php",
  "tests/View/Blade/BladeWhileStatementsTest.php",
  "tests/View/Blade/BladeYieldTest.php",
  "tests/Integration/View/BladeTest.php",
];

const BLADE_FACADE = "\\illuminate\\support\\facades\\blade";

/** A template or data argument: a literal, or a variable holding one. Undefined when neither. */
function argument(code: readonly Token[], assigned: ReadonlyMap<string, Json>): Json | undefined {
  if (code.length === 1 && code[0]!.name === "T_VARIABLE") {
    return assigned.get(code[0]!.text);
  }
  return decodeLiteral(code);
}

export const bladeFamily: Family<BladeRenderInput> = {
  name: "blade",
  kind: "blade-render",
  files: BLADE_FILES,
  extract(test: ExtractTest): BladeRenderInput[] {
    // A class with its own setUp() configures the compiler (directives, echo handlers) beyond {template, data}.
    if (test.method.body === null || test.cls.methods.has("setup")) {
      return [];
    }
    const list = statements(test.method.body);
    if (list === null) {
      return [];
    }
    const assigned = new Map<string, Json>();
    const out: BladeRenderInput[] = [];
    const seen = new Set<string>();
    for (const statement of list) {
      const code = statement.code;
      if (statement.assertion === null) {
        // `$var = <literal>;`
        const value = code[0]?.name === "T_VARIABLE" && code[0].text !== "$this" && code[1]?.name === "=" ? decodeLiteral(code.slice(2, -1)) : undefined;
        if (value === undefined) {
          return [];
        }
        assigned.set(code[0]!.text, value);
        continue;
      }
      if (!isKnownAssertion(statement) || hasNamedArgument(code)) {
        return [];
      }
      for (let i = 0; i + 1 < code.length; i++) {
        const token = code[i]!;
        const prev = code[i - 1];
        const next = code[i + 1]!;
        if (next.name !== "(" || token.name !== "T_STRING") {
          continue;
        }
        const name = token.text.toLowerCase();
        const compile = name === "compilestring" && prev?.name === "T_OBJECT_OPERATOR";
        const render = name === "render" && prev?.name === "T_DOUBLE_COLON" && code[i - 2] !== undefined && resolveClassName(test.file, code[i - 2]!).toLowerCase() === BLADE_FACADE;
        if (!compile && !render) {
          continue;
        }
        const close = matchClose(code, i + 1);
        const args = splitArgs(code, i + 1, close).map((arg) => arg.filter(isCode));
        if (args.length === 0 || (compile && args.length !== 1) || (render && args.length > 3)) {
          return [];
        }
        const template = argument(args[0]!, assigned);
        const data = render && args.length > 1 ? asObject(argument(args[1]!, assigned)) : {};
        if (typeof template !== "string" || data === null || (args.length === 3 && typeof decodeLiteral(args[2]!) !== "boolean")) {
          return [];
        }
        const input: BladeRenderInput = { template, data };
        const key = JSON.stringify([template, data]);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(input);
        }
      }
    }
    return out;
  },
};
