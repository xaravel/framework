// The validation-message family (Story 3.1, decisions/ESC-3.1-1.md):
// `validation-message` requests from the ValidationValidatorTest methods that
// assert on `$v->messages()` or `$v->errors()`.
//
// A readable body is, in order:
//
//   $trans = $this->getIlluminateArrayTranslator();
//   $trans->addLines(<literal array>, 'en');            (any number)
//   $v = new Validator($trans, <data>[, <rules>[, <messages>[, <attributes>]]]);
//   $v->messages()->setFormat(<string literal>);        (at most once)
//   $v->passes(); / $v->fails();                        (any number)
//   known assertions
//
// with every array a literal with string keys (`[]` is `{}`). `addLines` comes
// before any assertion, passes()/fails() or setFormat; setFormat comes before
// the first assertion on messages()/errors(), and no passes()/fails() follows
// it (they replace the formatted MessageBag). `exprs` are those assertions'
// actual arguments, which may use only `$v` and `$trans`; other assertions
// are not inputs. A second translator or validator, another locale, a
// non-literal array or any other statement gives no request.
import type { Json, JsonObject, ValidationMessageInput } from "../request";
import { asObject, checkVariables, decodeLiteral, isCode, isKnownAssertion, matchClose, renderSource, resolveClassName, splitArgs, statements, unreadableReason, type ExtractTest, type Family, type Statement, type Token } from "./php";

export const VALIDATION_FILES: readonly string[] = ["tests/Validation/ValidationValidatorTest.php"];

const VALIDATOR = "\\illuminate\\validation\\validator";

function texts(code: readonly Token[]): string {
  return code.map((token) => token.text).join(" ");
}

/** The code-token arguments of the call whose `(` is at `open`. */
function callArgs(code: readonly Token[], open: number): Token[][] | null {
  if (code[open]?.name !== "(") {
    return null;
  }
  const close = matchClose(code, open);
  return close === code.length - 2 && code[close + 1]!.name === ";" ? splitArgs(code, open, close).map((arg) => arg.filter(isCode)) : null;
}

function objectArg(arg: readonly Token[] | undefined): JsonObject | null {
  return arg === undefined ? {} : asObject(decodeLiteral(arg));
}

/** True when the code calls `$v->messages()` or `$v->errors()`. */
function onMessages(code: readonly Token[]): boolean {
  return code.some((token, i) => token.text === "$v" && code[i + 1]?.name === "T_OBJECT_OPERATOR" && ["messages", "errors"].includes(code[i + 2]?.text.toLowerCase() ?? "") && code[i + 3]?.name === "(");
}

/** True when the code calls `$v->passes()` or `$v->fails()`, which replace the MessageBag (and its format). */
function reruns(code: readonly Token[]): boolean {
  return code.some((token, i) => token.text === "$v" && code[i + 1]?.name === "T_OBJECT_OPERATOR" && ["passes", "fails"].includes(code[i + 2]?.text.toLowerCase() ?? "") && code[i + 3]?.name === "(");
}

function read(test: ExtractTest, list: readonly Statement[]): ValidationMessageInput | null {
  let translator = false;
  let lines: JsonObject = {};
  let validator: { data: JsonObject; rules: JsonObject; messages: JsonObject; attributes: JsonObject } | null = null;
  let format: string | null = null;
  let ran = false;
  const exprs: string[] = [];
  for (const statement of list) {
    const code = statement.code;
    const text = texts(code);
    if (statement.assertion !== null) {
      if (!isKnownAssertion(statement) || validator === null) {
        return null;
      }
      ran = true;
      const actual = statement.assertion.actual.filter(isCode);
      if (format !== null && reruns(actual)) {
        return null;
      }
      if (!onMessages(actual)) {
        continue;
      }
      if (unreadableReason(test.file, actual, null) !== null || checkVariables(actual, new Set(["$v", "$trans"])) !== null) {
        return null;
      }
      exprs.push(renderSource(test.file, statement.assertion.actual));
      continue;
    }
    if (text === "$trans = $this -> getIlluminateArrayTranslator ( ) ;") {
      if (translator) {
        return null;
      }
      translator = true;
      continue;
    }
    if (text.startsWith("$trans -> addLines (")) {
      const args = callArgs(code, 3);
      const added = args !== null && args.length === 2 && decodeLiteral(args[1]!) === "en" ? asObject(decodeLiteral(args[0]!)) : null;
      if (!translator || ran || format !== null || added === null) {
        return null;
      }
      lines = { ...lines, ...added };
      continue;
    }
    if (code[0]?.text === "$v" && code[1]?.name === "=" && code[2]?.name === "T_NEW" && code[3] !== undefined && resolveClassName(test.file, code[3]).toLowerCase() === VALIDATOR) {
      const args = callArgs(code, 4);
      if (!translator || validator !== null || args === null || args.length < 2 || args.length > 5 || texts(args[0]!) !== "$trans") {
        return null;
      }
      const data = objectArg(args[1]);
      const rules = objectArg(args[2]);
      const messages = objectArg(args[3]);
      const attributes = objectArg(args[4]);
      if (data === null || rules === null || messages === null || attributes === null) {
        return null;
      }
      validator = { data, rules, messages, attributes };
      continue;
    }
    if (text.startsWith("$v -> messages ( ) -> setFormat (")) {
      const args = callArgs(code, 7);
      const value: Json | undefined = args !== null && args.length === 1 ? decodeLiteral(args[0]!) : undefined;
      if (validator === null || format !== null || exprs.length > 0 || typeof value !== "string") {
        return null;
      }
      format = value;
      ran = true;
      continue;
    }
    if (text === "$v -> passes ( ) ;" || text === "$v -> fails ( ) ;") {
      if (validator === null || format !== null) {
        return null;
      }
      ran = true;
      continue;
    }
    return null;
  }
  if (validator === null || exprs.length === 0) {
    return null;
  }
  return { lines, data: validator.data, rules: validator.rules, messages: validator.messages, attributes: validator.attributes, format, exprs };
}

export const validationFamily: Family<ValidationMessageInput> = {
  name: "validation",
  kind: "validation-message",
  files: VALIDATION_FILES,
  extract(test: ExtractTest): ValidationMessageInput[] {
    if (test.method.body === null) {
      return [];
    }
    const list = statements(test.method.body);
    const input = list === null ? null : read(test, list);
    return input === null ? [] : [input];
  },
};
