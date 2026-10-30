// The Oracle inputs of XT-config-3 and XT-config-4 (Story 15.2), with the Xaravel side of each case. Each XT has one
// `php-expr` request in `conformance/oracle-requests/15.2.jsonl`: its `setup` builds the inputs and each `expr` is one
// case. `requestInput(id)` builds that request's input from the cases below, so the test can check the committed line
// against it, and each case's `run` computes the same value in Xaravel, in the same order (a case may depend on the
// side effects of the cases before it, as the Oracle's exprs do).
//
// XT-config-3 (FR-20.1): `\Dotenv\Dotenv::parse($c)` on contents covering phpdotenv's grammar: unquoted, single- and
// double-quoted values and escape sequences, `${VAR}` interpolation (nested, undefined, single-quoted), multiline
// quoted values, `export`, inline and full-line comments, empty values and whitespace, CR / LF / CRLF lines, quoted
// and Unicode names, a BOM, and invalid lines with their error messages (long and control-character lines included);
// then each `Validator` assertion's pass and failure message.
//
// XT-config-4 (FR-20.2): immutable and mutable repositories over phpdotenv's default adapters (`$_SERVER`, `$_ENV`), a
// repository with the putenv adapter, and an allow list, each loading content through `StringStore`, with the
// superglobals and `getenv` read back after each load. A name already in `$_SERVER` / `$_ENV` wins over the file in
// immutable mode and loses in mutable mode; a name only `putenv` set is not "real" to the default adapters.
import {
  ArrayAdapter,
  Dotenv,
  Loader,
  Parser,
  PutenvAdapter,
  RepositoryBuilder,
  type RepositoryInterface,
  StringStore,
  Validator,
} from "@xaravel/config";
import { getenv, putenv, superglobals } from "@xaravel/runtime/php";
import { runInFrame } from "@xaravel/runtime/scope";

/** One case: the PHP expression the Oracle evaluates, and the Xaravel computation of the same value. */
export interface DotenvCase {
  readonly expr: string;
  readonly run: () => unknown;
}

/** A request's inputs and cases. */
export interface DotenvRequest {
  readonly setup: readonly string[];
  readonly cases: readonly DotenvCase[];
}

/** `s` as a PHP double-quoted string literal that evaluates to the same UTF-8 string. */
export function phpString(s: string): string {
  let out = "\"";
  for (const char of s) {
    const code = char.codePointAt(0)!;
    switch (char) {
      case "\\":
        out += "\\\\";
        break;
      case "\"":
        out += "\\\"";
        break;
      case "$":
        out += "\\$";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default:
        if (code < 0x20 || code === 0x7f) {
          out += `\\x${code.toString(16).padStart(2, "0")}`;
        } else if (code === 0xfeff) {
          out += "\\u{FEFF}";
        } else {
          out += char;
        }
    }
  }
  return out + "\"";
}

/** The grammar contents of XT-config-3, by PHP variable name, in order. */
export const GRAMMAR: readonly (readonly [name: string, content: string])[] = [
  ["unquoted", "A=x\nB=1.5\nC=a.b-c/d:e@f\nD=true"],
  ["quoting", "A=x\nB='x y'\nC=\"x\\ny\"\nD='a\\nb'\nE=\"x y\"\nF=''\nG=\"\""],
  ["escapes", "A=\"a\\tb\"\nB=\"a\\\"b\"\nC=\"a\\\\b\"\nD=\"a\\$b\"\nE=\"\\f\\r\\v\"\nF=\"\\nx\"\nG='\\t'"],
  ["interpolation", "A=1\nB=\"${A}2\"\nC=\"${NOPE}\"\nD=${A}\nE='${A}'\nF=\"${B}-${A}\"\nG=$A\nH=\"\\${A}\"\nI=${B}${A}x\nJ=\"${A\"\nK=\"${}\"\nL=\"pre${A}post\""],
  ["order", "B=${A}\nA=1\nC=${A}"],
  ["multiline", "K=\"a\nb\"\nL=\"x\n\ny\nz\"\nM=\"one\ntwo\" # c\nN=\"a=\"\nO=\"\\\"\nstill\""],
  ["comments", "export A=1 # c\n# x\n  # indented\nE=\nF= \nJ=a#b\nK=a #b\nL=\"x # y\" # z\nM='p # q'\nN=#\nexport  P=2\nexport\tQ=3"],
  ["whitespace", "\n\n  \nA=1\r\nB=2\rC=3\n D = spaced \n\tE\t=\tt\t\nF=\" lead\"\nG='trail '"],
  ["names", "N\n\"Q\"=1\n'R'=2\nA.B=3\nA_B=4\n123=5\nexport S\nÄB=6\nnaïve=7"],
  ["unicode", "U=héllo\nV=\"日本\"\nW='ü ber'\nX=\"emoji 😀\"\nY=a\u00a0b"],
  ["bom", "\u{FEFF}A=1\nB=2"],
  ["empty", ""],
  ["unclosedDouble", "A=\"x"],
  ["unclosedSingle", "A='x"],
  ["invalidName", "1 2=3"],
  ["unexpectedWhitespace", "A=x y"],
  ["unexpectedEquals", "=x"],
  ["afterQuote", "A=\"a\"b"],
  ["badEscape", "A=\"\\q\""],
  ["exportInvalid", "export 1 2=3"],
  ["controlChars", "A=a\tb c"],
  ["longLine", "A=" + "é".repeat(45) + " x"],
  ["longAscii", "A=" + "a".repeat(90) + " x"],
  ["secondLineError", "A=1\nB=x y\nC=3"],
  ["dollarName", "A$=1"],
];

/** The content the XT-config-3 validator cases load into an array-backed repository. */
const VALIDATED = "V=abc\nI=12\nB=yes\nE=  \nN";

/**
 * XT-config-3's validator cases: each assertion's pass and failure message on `$validated`, an array-backed Dotenv
 * that has loaded `VALIDATED`. Each Xaravel side runs in a unit frame, where Dotenv loads at boot or in a request, so
 * `preg_last_error()` reads the code of the call before it, as `allowedRegexValues`' invalid-pattern check needs
 * (spec-15-2 deferred item).
 */
function validatorCases(): DotenvCase[] {
  let validated: Dotenv | null = null;
  const inUnit = (fn: () => unknown) => () => runInFrame("unit", fn);
  const passes = (validator: () => Validator) => () => runInFrame("unit", () => validator() instanceof Validator);
  return [
    {
      expr: "$validated->load()",
      run: inUnit(() => {
        validated = new Dotenv(new StringStore(VALIDATED), new Parser(), new Loader(), RepositoryBuilder.createWithNoAdapters().addAdapter(ArrayAdapter).make());
        return validated.load();
      }),
    },
    { expr: "$validated->required(['V', 'I', 'B', 'E']) instanceof \\Dotenv\\Validator", run: passes(() => validated!.required(["V", "I", "B", "E"])) },
    { expr: "$validated->required(['N', 'MISSING'])", run: inUnit(() => validated!.required(["N", "MISSING"])) },
    { expr: "$validated->required('V')->notEmpty() instanceof \\Dotenv\\Validator", run: passes(() => validated!.required("V").notEmpty()) },
    { expr: "$validated->ifPresent(['E', 'N'])->notEmpty()", run: inUnit(() => validated!.ifPresent(["E", "N"]).notEmpty()) },
    { expr: "$validated->ifPresent(['I', 'MISSING'])->isInteger() instanceof \\Dotenv\\Validator", run: passes(() => validated!.ifPresent(["I", "MISSING"]).isInteger()) },
    { expr: "$validated->ifPresent(['V', 'E'])->isInteger()", run: inUnit(() => validated!.ifPresent(["V", "E"]).isInteger()) },
    { expr: "$validated->ifPresent('B')->isBoolean() instanceof \\Dotenv\\Validator", run: passes(() => validated!.ifPresent("B").isBoolean()) },
    { expr: "$validated->ifPresent(['V', 'I'])->isBoolean()", run: inUnit(() => validated!.ifPresent(["V", "I"]).isBoolean()) },
    { expr: "$validated->ifPresent('V')->allowedValues(['abc', 'def']) instanceof \\Dotenv\\Validator", run: passes(() => validated!.ifPresent("V").allowedValues(["abc", "def"])) },
    { expr: "$validated->ifPresent('V')->allowedValues(['x', 'y'])", run: inUnit(() => validated!.ifPresent("V").allowedValues(["x", "y"])) },
    { expr: "$validated->ifPresent('V')->allowedRegexValues('/^a/') instanceof \\Dotenv\\Validator", run: passes(() => validated!.ifPresent("V").allowedRegexValues("/^a/")) },
    { expr: "$validated->ifPresent('V')->allowedRegexValues('/^z/')", run: inUnit(() => validated!.ifPresent("V").allowedRegexValues("/^z/")) },
    { expr: "$validated->ifPresent('V')->allowedRegexValues('/(/')", run: inUnit(() => validated!.ifPresent("V").allowedRegexValues("/(/")) },
  ];
}

/** XT-config-3: one `Dotenv::parse` case per content, then the validator cases. */
function grammar(): DotenvRequest {
  return {
    setup: [
      ...GRAMMAR.map(([name, content]) => `$${name} = ${phpString(content)};`),
      `$validated = new \\Dotenv\\Dotenv(new \\Dotenv\\Store\\StringStore(${phpString(VALIDATED)}), new \\Dotenv\\Parser\\Parser(), new \\Dotenv\\Loader\\Loader(), \\Dotenv\\Repository\\RepositoryBuilder::createWithNoAdapters()->addAdapter(\\Dotenv\\Repository\\Adapter\\ArrayAdapter::class)->make());`,
    ],
    cases: [
      ...GRAMMAR.map(([name, content]) => ({ expr: `\\Dotenv\\Dotenv::parse($${name})`, run: () => Dotenv.parse(content) })),
      ...validatorCases(),
    ],
  };
}

/** The names XT-config-4 writes, cleaned out of `$_SERVER`, `$_ENV` and the process environment before and after. */
export const PRECEDENCE_NAMES = ["A", "B", "C", "G", "H", "P", "X", "Y"].map((suffix) => `XT_CONFIG_4_${suffix}`);

/** Removes every XT-config-4 name from the superglobals and the process environment. */
export function cleanPrecedence(): void {
  for (const name of PRECEDENCE_NAMES) {
    superglobals.server.delete(name);
    superglobals.env.delete(name);
    putenv(name);
  }
}

/** `new Dotenv(new StringStore($c), new Parser(), new Loader(), $repository)` loaded. */
function load(content: string, repository: RepositoryInterface): unknown {
  return new Dotenv(new StringStore(content), new Parser(), new Loader(), repository).load();
}

/** PHP's `$_SERVER[$name] ?? null`, `$_ENV[$name] ?? null` and `getenv($name)` for each name. */
function state(...names: string[]): unknown {
  return names.map((name) => [superglobals.server.get(name), superglobals.env.get(name), getenv(name)]);
}

/** The PHP form of `state`. */
function phpState(...names: string[]): string {
  return `array_map(fn ($n) => [$_SERVER[$n] ?? null, $_ENV[$n] ?? null, getenv($n)], [${names.map((name) => `'${name}'`).join(", ")}])`;
}

/** XT-config-4: repository modes and precedence. */
function precedence(): DotenvRequest {
  let repository: RepositoryInterface | null = null;
  const immutable = (): RepositoryInterface => RepositoryBuilder.createWithDefaultAdapters().immutable().make();
  const mutable = (): RepositoryInterface => RepositoryBuilder.createWithDefaultAdapters().make();
  const file = "XT_CONFIG_4_A=file\nXT_CONFIG_4_B=file\nXT_CONFIG_4_G=file";
  const PHP_LOAD = "(new \\Dotenv\\Dotenv(new \\Dotenv\\Store\\StringStore(%c), new \\Dotenv\\Parser\\Parser(), new \\Dotenv\\Loader\\Loader(), %r))->load()";
  const phpLoad = (content: string, repository: string): string => PHP_LOAD.replace("%c", phpString(content)).replace("%r", repository);
  const IMMUTABLE = "\\Dotenv\\Repository\\RepositoryBuilder::createWithDefaultAdapters()->immutable()->make()";
  const MUTABLE = "\\Dotenv\\Repository\\RepositoryBuilder::createWithDefaultAdapters()->make()";
  return {
    setup: [
      "$_SERVER['XT_CONFIG_4_A'] = 'real';",
      "$_ENV['XT_CONFIG_4_A'] = 'real';",
      "putenv('XT_CONFIG_4_G=real');",
      "putenv('XT_CONFIG_4_P=real');",
      `$repository = ${IMMUTABLE};`,
    ],
    cases: [
      // Before any load: the real values.
      {
        expr: phpState("XT_CONFIG_4_A", "XT_CONFIG_4_B", "XT_CONFIG_4_G"),
        run: () => {
          superglobals.server.set("XT_CONFIG_4_A", "real");
          superglobals.env.set("XT_CONFIG_4_A", "real");
          putenv("XT_CONFIG_4_G=real");
          putenv("XT_CONFIG_4_P=real");
          repository = immutable();
          return state("XT_CONFIG_4_A", "XT_CONFIG_4_B", "XT_CONFIG_4_G");
        },
      },
      // Immutable: A is real and kept; B and G (G only putenv'd, which the default adapters never read) are written.
      { expr: phpLoad(file, "$repository"), run: () => load(file, repository!) },
      { expr: phpState("XT_CONFIG_4_A", "XT_CONFIG_4_B", "XT_CONFIG_4_G"), run: () => state("XT_CONFIG_4_A", "XT_CONFIG_4_B", "XT_CONFIG_4_G") },
      { expr: "[$repository->get('XT_CONFIG_4_A'), $repository->get('XT_CONFIG_4_B'), $repository->has('XT_CONFIG_4_B'), $repository->has('XT_CONFIG_4_C'), $repository->get('XT_CONFIG_4_C')]", run: () => [repository!.get("XT_CONFIG_4_A"), repository!.get("XT_CONFIG_4_B"), repository!.has("XT_CONFIG_4_B"), repository!.has("XT_CONFIG_4_C"), repository!.get("XT_CONFIG_4_C")] },
      // The same immutable repository may overwrite what it loaded itself; a fresh one sees B as real.
      { expr: phpLoad("XT_CONFIG_4_B=again", "$repository"), run: () => load("XT_CONFIG_4_B=again", repository!) },
      { expr: phpLoad("XT_CONFIG_4_B=fresh", IMMUTABLE), run: () => load("XT_CONFIG_4_B=fresh", immutable()) },
      { expr: phpState("XT_CONFIG_4_B"), run: () => state("XT_CONFIG_4_B") },
      // Clearing: immutable does not clear a real variable; mutable does.
      { expr: phpLoad("XT_CONFIG_4_A", IMMUTABLE), run: () => load("XT_CONFIG_4_A", immutable()) },
      { expr: phpState("XT_CONFIG_4_A"), run: () => state("XT_CONFIG_4_A") },
      // Mutable: the file wins over the real value.
      { expr: phpLoad(file, MUTABLE), run: () => load(file, mutable()) },
      { expr: phpState("XT_CONFIG_4_A", "XT_CONFIG_4_B", "XT_CONFIG_4_G"), run: () => state("XT_CONFIG_4_A", "XT_CONFIG_4_B", "XT_CONFIG_4_G") },
      { expr: phpLoad("XT_CONFIG_4_A", MUTABLE), run: () => load("XT_CONFIG_4_A", mutable()) },
      { expr: phpState("XT_CONFIG_4_A"), run: () => state("XT_CONFIG_4_A") },
      // With the putenv adapter, a putenv'd variable is real to an immutable repository, and a new one is putenv'd.
      {
        expr: phpLoad("XT_CONFIG_4_P=file\nXT_CONFIG_4_H=file", "\\Dotenv\\Repository\\RepositoryBuilder::createWithDefaultAdapters()->addAdapter(\\Dotenv\\Repository\\Adapter\\PutenvAdapter::class)->immutable()->make()"),
        run: () => load("XT_CONFIG_4_P=file\nXT_CONFIG_4_H=file", RepositoryBuilder.createWithDefaultAdapters().addAdapter(PutenvAdapter).immutable().make()),
      },
      { expr: phpState("XT_CONFIG_4_P", "XT_CONFIG_4_H"), run: () => state("XT_CONFIG_4_P", "XT_CONFIG_4_H") },
      // An allow list writes only the listed names.
      {
        expr: phpLoad("XT_CONFIG_4_X=1\nXT_CONFIG_4_Y=2", "\\Dotenv\\Repository\\RepositoryBuilder::createWithDefaultAdapters()->allowList(['XT_CONFIG_4_X'])->make()"),
        run: () => load("XT_CONFIG_4_X=1\nXT_CONFIG_4_Y=2", RepositoryBuilder.createWithDefaultAdapters().allowList(["XT_CONFIG_4_X"]).make()),
      },
      { expr: phpState("XT_CONFIG_4_X", "XT_CONFIG_4_Y"), run: () => state("XT_CONFIG_4_X", "XT_CONFIG_4_Y") },
      // An empty name is refused.
      { expr: "$repository->get('')", run: () => repository!.get("") },
      // Interpolation reads the repository: a real value, not the file's.
      { expr: phpLoad("XT_CONFIG_4_C=${XT_CONFIG_4_G}", IMMUTABLE), run: () => load("XT_CONFIG_4_C=${XT_CONFIG_4_G}", immutable()) },
    ],
  };
}

/** The request inputs, by XT id. */
export function requests(): Readonly<Record<"XT-config-3" | "XT-config-4", DotenvRequest>> {
  return { "XT-config-3": grammar(), "XT-config-4": precedence() };
}
