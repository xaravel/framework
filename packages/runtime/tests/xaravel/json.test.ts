// Xaravel Tests for Story 9.8: `jsonEncode` / `jsonDecode` with PHP flag semantics (AD-23.1, AD-9). One test per
// acceptance-criterion row of the manifest, in order, plus local rows the Oracle cannot express (a JS lone surrogate,
// a `bigint` beyond int64, a symbol, `undefined`, the Registry's import cycle, `json_last_error()` outside a frame).
// Each Oracle row compares with the signed fixture of `conformance/oracle-requests/9.8.jsonl`; a missing fixture fails
// the test.
//
// F-10 recorded reason: XT-runtime-27..30 are Xaravel Tests (stories/9.8.md has no test_ids), so no Upstream test
// exists whose inputs the requests could take. Per docs/ops/oracle.md § Per-Story requests ("A Story that needs
// expected values for other inputs (an Xaravel Differential suite …) commits conformance/oracle-requests/<story-id>.jsonl";
// an Xaravel Test ID runs bound to a bare PHPUnit TestCase) and epics.md (Epic 9: "verified by Oracle Differential
// Tests"), the requests evaluate only `json_encode`, `json_decode`, `json_last_error()`, `json_last_error_msg()` and
// `JsonResponse::getContent()` over ints, floats, bools, null, UTF-8 strings, lists, maps, stdClass objects and seven
// fixture classes declared in the request (`XaravelFixture\Json\Plain`, `Serial`, `SelfSerial`, `Arr`, `Jsn`, `Both`,
// `JsnSerial`, implementing PHP's `JsonSerializable` and Laravel's `Arrayable` / `Jsonable` contracts), and contain no
// Upstream fixture.
//
// ESC-9.8-1 part 1: a JSON error throws PHP's `JsonException` (or `ValueError` for a bad depth) with PHP's message and
// code, ported by Story 9.10, so these rows assert the Oracle's class (as `fqcn()`), message and code.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Assert, xaravelTest } from "@xaravel/assert";
import {
  float,
  isFloat,
  JSON_BIGINT_AS_STRING,
  JSON_ERROR_INF_OR_NAN,
  JSON_ERROR_RECURSION,
  JSON_ERROR_SYNTAX,
  JSON_ERROR_UNSUPPORTED_TYPE,
  JSON_ERROR_UTF8,
  JSON_FORCE_OBJECT,
  JSON_HEX_AMP,
  JSON_HEX_APOS,
  JSON_HEX_QUOT,
  JSON_HEX_TAG,
  JSON_INVALID_UTF8_IGNORE,
  JSON_INVALID_UTF8_SUBSTITUTE,
  JSON_NUMERIC_CHECK,
  JSON_OBJECT_AS_ARRAY,
  JSON_PARTIAL_OUTPUT_ON_ERROR,
  JSON_PRESERVE_ZERO_FRACTION,
  JSON_PRETTY_PRINT,
  JSON_THROW_ON_ERROR,
  JSON_UNESCAPED_LINE_TERMINATORS,
  JSON_UNESCAPED_SLASHES,
  JSON_UNESCAPED_UNICODE,
  JsonException,
  jsonDecode,
  jsonEncode,
  jsonLastError,
  jsonLastErrorMsg,
  PhpArray,
  PhpFloat,
  stdClass,
  ValueError,
} from "@xaravel/runtime/php";
import * as root from "@xaravel/runtime";
import { fqcn, registerClass } from "@xaravel/runtime/registry";
import { currentFrame, runInFrame, runInNarrowFrame } from "@xaravel/runtime/scope";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");

/** The part of the grader's Oracle helpers (`packages/assert/tests/xaravel/oracle-values.ts`) this file uses. */
interface Output {
  error: unknown;
  results: ({ value: unknown } | { throws: unknown })[];
}
interface OracleValues {
  decode: (encoded: unknown) => unknown;
  readRequests: (path: string) => { id: string; sha256: string; exprs: string[] }[];
  readSignedFixture: (path: string, sha256: string, publicKeyPem: string) => Output;
}

// The runtime has no dependencies (AD-2), so its tsc project cannot reference @xaravel/assert's test files; the
// grader's fixture reader is loaded at run time instead of being re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;
const REQUESTS = "conformance/oracle-requests/9.8.jsonl";
const FIXTURES = "conformance/fixtures/runtime";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const PHP_ARRAY = Symbol.for("xaravel.php.array");

/** The signed Oracle output of the Story's one request for `id` whose first expr is `firstExpr`. */
function oracle(id: string, firstExpr: string): Output {
  const requests = readRequests(join(REPO, REQUESTS)).filter((request) => request.id === id && request.exprs[0] === firstExpr);
  if (requests.length !== 1) {
    throw new Error(`${REQUESTS}: expected one request for ${id} with first expr ${firstExpr}, found ${requests.length}`);
  }
  const request = requests[0]!;
  const output = readSignedFixture(join(REPO, FIXTURES, `${request.sha256}.json`), request.sha256, readFileSync(join(REPO, PUBLIC_KEY), "utf8"));
  if (output.error !== null) {
    throw new Error(`${id}: the Oracle reported an error: ${JSON.stringify(output.error)}`);
  }
  return output;
}

/** The raw encoded value of result `index`. */
function rawResult(output: Output, index: number): unknown {
  const result = output.results[index];
  if (result === undefined || !("value" in result)) {
    throw new Error(`result ${index} is not a value: ${JSON.stringify(result ?? null)}`);
  }
  return result.value;
}

/** The encoded values of an encoded list, in order. */
function rawItems(encoded: unknown): unknown[] {
  return (encoded as { array: unknown[][] }).array.map(([, value]) => value);
}

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/**
 * Asserts `fn` throws the PHP class `phpClass` (`JsonException` unless given; its `fqcn()`) with `message` and the
 * numeric `code`, read as a property and through `getCode()` (ESC-9.8-1 part 1, Story 9.10).
 */
function assertJsonError(fn: () => unknown, message: string, code: number, at: string, phpClass = "JsonException"): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof (phpClass === "ValueError" ? ValueError : JsonException), `${at}: expected a ${phpClass}: ${String(error)}`);
  Assert.assertSame(phpClass, fqcn(error as Error), at);
  Assert.assertSame(message, (error as Error).message, at);
  Assert.assertSame(code, (error as { code?: unknown }).code, at);
  Assert.assertSame(code, (error as JsonException).getCode(), at);
}

/** The `[key, value]` pairs of a JS PHP array (a list, a plain object or a branded array), or null for no array. */
function jsEntries(value: unknown): [number | bigint | string, unknown][] | null {
  if (Array.isArray(value)) {
    return value.map((item, index) => [index, item as unknown]);
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if ((value as Record<symbol, unknown>)[PHP_ARRAY] === true) {
    return [...(value as Iterable<[number | bigint | string, unknown]>)];
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }
  return Object.keys(value).map((key) => [phpKey(key), (value as Record<string, unknown>)[key]]);
}

/** A plain object's key as PHP normalises it: a canonical decimal in the int64 range is an int, else a string. */
function phpKey(key: string): number | bigint | string {
  if (!/^(?:0|-?[1-9]\d*)$/.test(key)) {
    return key;
  }
  const value = BigInt(key);
  if (value < -9223372036854775808n || value > 9223372036854775807n) {
    return key;
  }
  return Number.isSafeInteger(Number(value)) ? Number(value) : value;
}

/** The AD-9 form of a PHP array with these keys (DIV-9.2): a list, a plain object, else a `PhpArray`. */
function ad9Form(keys: readonly unknown[]): "list" | "map" | "PhpArray" {
  if (keys.every((key, index) => key === index)) {
    return "list";
  }
  return keys.every((key) => typeof key === "string") ? "map" : "PhpArray";
}

function formOf(js: unknown): "list" | "map" | "PhpArray" | null {
  if (Array.isArray(js)) {
    return "list";
  }
  if (typeof js === "object" && js !== null && (js as Record<symbol, unknown>)[PHP_ARRAY] === true) {
    return "PhpArray";
  }
  return jsEntries(js) === null ? null : "map";
}

/**
 * Where the decoded JS value `js` differs from the Oracle's encoded `encoded`, or null when it is the same PHP value
 * in its AD-9 form: an int or float of the same kind and value (-0.0 not 0.0), the same string, an array of the AD-9
 * form its keys give with the same keys in the same order, and a `stdClass` with the same properties by name.
 */
function differs(js: unknown, encoded: unknown, at: string): string | null {
  const fail = (): string => `${at}: Oracle ${JSON.stringify(encoded)}, got ${typeof js === "bigint" ? `${js}n` : String(js)}`;
  if (encoded === null || typeof encoded === "boolean" || typeof encoded === "string") {
    return js === encoded ? null : fail();
  }
  const value = encoded as Record<string, unknown>;
  if (typeof value["int"] === "string") {
    return (typeof js === "number" || typeof js === "bigint") && !isFloat(js) && BigInt(js) === BigInt(value["int"]) ? null : fail();
  }
  if (typeof value["float"] === "string") {
    return isFloat(js) && Object.is(Number(js), decode(encoded)) ? null : fail();
  }
  if (Array.isArray(value["array"])) {
    const entries = jsEntries(js);
    const expected = value["array"] as unknown[][];
    if (entries === null || entries.length !== expected.length) {
      return fail();
    }
    const keys = expected.map(([key]) => decode(key));
    if (formOf(js) !== ad9Form(keys)) {
      return `${at}: a ${String(formOf(js))}, AD-9 makes it a ${ad9Form(keys)}`;
    }
    for (let index = 0; index < entries.length; index++) {
      const [key, item] = entries[index]!;
      if (key !== keys[index]) {
        return `${at}: key ${index} is ${String(key)}, the Oracle's ${String(keys[index])}`;
      }
      const inner = differs(item, expected[index]![1], `${at}[${String(key)}]`);
      if (inner !== null) {
        return inner;
      }
    }
    return null;
  }
  if (typeof value["object"] !== "string" || typeof js !== "object" || js === null || jsEntries(js) !== null || fqcn(js) !== value["object"]) {
    return fail();
  }
  const props = new Map(Object.keys(js).map((key) => [key, (js as Record<string, unknown>)[key]]));
  const expected = value["properties"] as [string, string, unknown][];
  if (props.size !== expected.length) {
    return `${at}: ${props.size} properties [${[...props.keys()].join(", ")}], the Oracle's ${expected.length}`;
  }
  for (const [name, , item] of expected) {
    if (!props.has(name)) {
      return `${at}: no property ${name}`;
    }
    const inner = differs(props.get(name), item, `${at}->${name}`);
    if (inner !== null) {
      return inner;
    }
  }
  // A JS object lists array-index names first (ESC-9.8-1 part 3), so only the order of the other names is PHP's.
  const order = (names: readonly string[]): string => names.filter((name) => !ARRAY_INDEX.test(name) || Number(name) > 4294967294).join(", ");
  const expectedOrder = order(expected.map(([name]) => name));
  const actualOrder = order([...props.keys()]);
  return expectedOrder === actualOrder ? null : `${at}: properties in the order [${actualOrder}], the Oracle's [${expectedOrder}]`;
}

/** A canonical decimal string, which JS lists first among an object's keys when it is at most 2^32 - 2. */
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

function assertSamePhpValue(encoded: unknown, js: unknown, at: string): void {
  const difference = differs(js, encoded, at);
  Assert.assertTrue(difference === null, difference ?? "");
}

/** A `$try` result of XT-runtime-30's error request: `["value" => …]` or `["throws", "message", "code"]`, encoded. */
function tryResult(encoded: unknown): { value: unknown } | { throws: string; message: string; code: number } {
  const entries = new Map((encoded as { array: unknown[][] }).array.map(([key, item]) => [key as string, item]));
  if (entries.has("value")) {
    return { value: entries.get("value") };
  }
  return { throws: entries.get("throws") as string, message: entries.get("message") as string, code: Number(decode(entries.get("code"))) };
}

// XT-runtime-27's flags, in the request's order (its `$flags`).
const FLAGS = [
  0,
  JSON_HEX_TAG,
  JSON_HEX_AMP,
  JSON_HEX_APOS,
  JSON_HEX_QUOT,
  JSON_FORCE_OBJECT,
  JSON_NUMERIC_CHECK,
  JSON_UNESCAPED_SLASHES,
  JSON_PRETTY_PRINT,
  JSON_UNESCAPED_UNICODE,
  JSON_PARTIAL_OUTPUT_ON_ERROR,
  JSON_PRESERVE_ZERO_FRACTION,
  JSON_UNESCAPED_LINE_TERMINATORS,
  JSON_INVALID_UTF8_IGNORE,
  JSON_INVALID_UTF8_SUBSTITUTE,
  JSON_THROW_ON_ERROR,
  JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
  JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS,
  JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT,
  JSON_NUMERIC_CHECK | JSON_PRESERVE_ZERO_FRACTION,
  JSON_FORCE_OBJECT | JSON_PRETTY_PRINT,
  JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES | JSON_HEX_QUOT,
];

/** The values of XT-runtime-27's `$v`, built in JS as a port builds them (integral floats marked, DIV-9.4). */
function matrix(): unknown[] {
  const point = new stdClass();
  point.a = 1;
  point.b = [1, 2];
  point.c = new stdClass();
  return [
    null,
    true,
    false,
    0,
    1,
    -1,
    42,
    9223372036854775807n,
    -9223372036854775808n,
    float(1),
    0.1,
    -0,
    float(1e15),
    1e17,
    1e25,
    1e-5,
    1e-7,
    5e-324,
    0.1 + 0.2,
    -1.5,
    float(100),
    "",
    "/",
    "<>&'\"",
    "\u00e9",
    "\u65e5\u672c\u8a9e",
    "\u{1F600}",
    "\u2028\u2029",
    "\x01\x1f",
    "\x7f",
    'a\\b"c\n\r\t\b\f',
    "12",
    "1.0",
    " 5",
    "5 ",
    "-0",
    "1e3",
    "1e999",
    "0x1A",
    "9223372036854775808",
    [],
    [1, 2, 3],
    { a: 1, b: "x" },
    new PhpArray<number | string, unknown>([
      [0, 1],
      ["k", 2],
      [1, 3],
    ]),
    new PhpArray([
      [5, "a"],
      [2, "b"],
    ]),
    new PhpArray<number | string, unknown>([
      [5, "five"],
      ["05", "oh-five"],
      ["/k", "\u00e9"],
    ]),
    [[], { x: [] }, new stdClass()],
    new stdClass(),
    point,
    new PhpArray<number | string, unknown>([
      [12, "12"],
      ["n", ["1.5", "x", float(2)]],
    ]),
  ];
}

xaravelTest(
  "XT-runtime-27",
  "jsonEncode(value, flags, depth) is byte-identical to the Oracle's json_encode under no flag, each of the 15 single JSON_* encode flags and the 6 combinations of the request's $flags, and gives PHP's false, partial output or error message and code for INF, NAN, recursion and depth under 0, PARTIAL, THROW, THROW|PARTIAL and PRETTY|PARTIAL; a JS lone surrogate is PHP's malformed UTF-8, a symbol an unsupported type, undefined null; the Registry's import cycle stays load-safe; in a unit frame jsonLastError() / jsonLastErrorMsg() give the Oracle's json_last_error() / json_last_error_msg() after each call, a THROW call leaving them untouched (AD-5.5, AD-5.7, AD-9.1, AD-23.1)",
  () => {
    const output = oracle("XT-runtime-27", "$flags");
    const flags = decode(rawResult(output, 0)) as number[];
    Assert.assertSame(FLAGS.length, flags.length);
    flags.forEach((flag, index) => Assert.assertSame(FLAGS[index], flag, `flag #${index}`));
    const values = matrix();
    // The JS matrix is the Oracle's $v, element by element.
    const oracleValues = rawItems(rawResult(output, 1));
    Assert.assertSame(oracleValues.length, values.length);
    values.forEach((value, index) => assertSamePhpValue(oracleValues[index], value, `$v[${index}]`));
    const perValue = decode(rawResult(output, 2)) as unknown[][];
    const whole = decode(rawResult(output, 3)) as unknown[];
    flags.forEach((flag, i) => {
      Assert.assertSame(values.length, perValue[i]!.length);
      values.forEach((value, j) => {
        Assert.assertSame(perValue[i]![j], jsonEncode(value, flag), `json_encode($v[${j}], ${flag})`);
      });
      Assert.assertSame(whole[i], jsonEncode(values, flag), `json_encode($v, ${flag})`);
    });
    // Spot checks of the rules the matrix covers.
    Assert.assertSame("[1,0.1,1.0e+25,1.0e-7,-0,1000000000000000,1.0e+17,1.0e-5,5.0e-324]", jsonEncode([float(1), 0.1, 1e25, 1e-7, -0, float(1e15), 1e17, 1e-5, 5e-324]));
    Assert.assertSame("[1.0,-0.0,1.0e+25]", jsonEncode([float(1), -0, 1e25], JSON_PRESERVE_ZERO_FRACTION));
    Assert.assertSame('"\\u003C\\u003E\\u0026\\u0027\\u0022"', jsonEncode("<>&'\"", JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT));
    Assert.assertSame('"\\u2028"', jsonEncode("\u2028", JSON_UNESCAPED_UNICODE));
    Assert.assertSame('"\u2028"', jsonEncode("\u2028", JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS));
    Assert.assertSame("[]", jsonEncode([]));
    Assert.assertSame("{}", jsonEncode([], JSON_FORCE_OBJECT));
    Assert.assertSame("[\n    []\n]", jsonEncode([[]], JSON_PRETTY_PRINT));

    // The error rows: each case under each mode, as `$try` gives it.
    const errors = oracle("XT-runtime-27", "$modes");
    const modes = decode(rawResult(errors, 0)) as number[];
    const MODES = [0, JSON_PARTIAL_OUTPUT_ON_ERROR, JSON_THROW_ON_ERROR, JSON_THROW_ON_ERROR | JSON_PARTIAL_OUTPUT_ON_ERROR, JSON_PRETTY_PRINT | JSON_PARTIAL_OUTPUT_ON_ERROR];
    Assert.assertSame(MODES.length, modes.length);
    modes.forEach((mode, index) => Assert.assertSame(MODES[index], mode, `mode #${index}`));
    const self = new stdClass();
    self.name = "me";
    self.self = self;
    const cases: [unknown, number][] = [
      [Infinity, 512],
      [NaN, 512],
      [-Infinity, 512],
      [[1, Infinity, NaN], 512],
      [{ a: [Infinity], b: 2 }, 512],
      [self, 512],
      [[self, 1], 512],
      [[[[1]]], 2],
      [[[[1]]], 3],
      [[[[Infinity]]], 2],
      [[], 0],
      [1, 0],
      [{ k: [1] }, 1],
    ];
    const results = decode(rawResult(errors, 1)) as unknown[][];
    modes.forEach((mode, i) => {
      Assert.assertSame(cases.length, results[i]!.length);
      cases.forEach(([value, depth], j) => {
        const expected = results[i]![j];
        const at = `case #${j}, mode ${mode}`;
        if (Array.isArray(expected)) {
          // ESC-9.8-1 part 1: the Oracle's class, message and code.
          Assert.assertSame("JsonException", expected[0], at);
          assertJsonError(() => jsonEncode(value, mode, depth), expected[1] as string, expected[2] as number, at, expected[0] as string);
        } else {
          Assert.assertSame(expected, jsonEncode(value, mode, depth), at);
        }
      });
    });
    localRows();
    cycleRow();
    lastErrorSequence("XT-runtime-27", ENCODE_STEPS);
  },
);

// XT-runtime-28's fixture classes (its first setup), branded as PHP's and Laravel's contracts.
const PHP_PROPERTIES: unique symbol = Symbol.for("xaravel.php.properties");
const JSON_SERIALIZABLE: unique symbol = Symbol.for("JsonSerializable");
const ARRAYABLE: unique symbol = Symbol.for("Illuminate\\Contracts\\Support\\Arrayable");
const JSONABLE: unique symbol = Symbol.for("Illuminate\\Contracts\\Support\\Jsonable");
type PropertyTable = readonly { name: string; visibility: "public" | "protected" | "private"; default: unknown }[];

class XtPlain {
  static readonly [PHP_PROPERTIES]: PropertyTable = [
    { name: "a", visibility: "public", default: 1 },
    { name: "b", visibility: "protected", default: 2 },
    { name: "c", visibility: "private", default: 3 },
    { name: "list", visibility: "public", default: [1, 2] },
  ];

  a: unknown = 1;
  b: unknown = 2;
  c: unknown = 3;
  list: unknown = [1, 2];
}
registerClass("XaravelFixture\\Json\\Plain", XtPlain);

class XtSerial {
  static readonly [PHP_PROPERTIES]: PropertyTable = [
    { name: "a", visibility: "public", default: 1 },
    { name: "b", visibility: "protected", default: 2 },
  ];

  a: unknown = 1;
  b: unknown = 2;

  get [JSON_SERIALIZABLE](): true {
    return true;
  }

  jsonSerialize(): unknown {
    return { x: this.a, list: [1, 2.5], nested: new XtPlain() };
  }
}
registerClass("XaravelFixture\\Json\\Serial", XtSerial);

class XtSelfSerial {
  static readonly [PHP_PROPERTIES]: PropertyTable = [
    { name: "a", visibility: "public", default: 1 },
    { name: "hidden", visibility: "protected", default: 2 },
    { name: "secret", visibility: "private", default: 3 },
    { name: "n", visibility: "public", default: null },
  ];

  a: unknown = 1;
  hidden: unknown = 2;
  secret: unknown = 3;
  n: unknown = null;

  get [JSON_SERIALIZABLE](): true {
    return true;
  }

  jsonSerialize(): unknown {
    return this;
  }
}
registerClass("XaravelFixture\\Json\\SelfSerial", XtSelfSerial);

class XtArr {
  pub: unknown = "p";

  get [ARRAYABLE](): true {
    return true;
  }

  toArray(): unknown {
    return { from: "toArray", n: 1.5, u: "/\u00e9" };
  }
}
registerClass("XaravelFixture\\Json\\Arr", XtArr);

class XtJsn {
  pub: unknown = "p";

  get [JSONABLE](): true {
    return true;
  }

  toJson(options = 0): string {
    return `custom:${options}`;
  }
}
registerClass("XaravelFixture\\Json\\Jsn", XtJsn);

class XtBoth {
  pub: unknown = "p";

  get [ARRAYABLE](): true {
    return true;
  }

  get [JSON_SERIALIZABLE](): true {
    return true;
  }

  toArray(): unknown {
    return { via: "toArray" };
  }

  jsonSerialize(): unknown {
    return { via: "jsonSerialize" };
  }
}
registerClass("XaravelFixture\\Json\\Both", XtBoth);

/** Jsonable and JsonSerializable with different results, as a Collection or a Model is. */
class XtJsnSerial {
  pub: unknown = "p";

  get [JSONABLE](): true {
    return true;
  }

  get [JSON_SERIALIZABLE](): true {
    return true;
  }

  toJson(options = 0): string {
    return `jsonable:${options}`;
  }

  jsonSerialize(): unknown {
    return { via: "jsonSerialize", pub: this.pub };
  }
}
registerClass("XaravelFixture\\Json\\JsnSerial", XtJsnSerial);

/** An unregistered class that reports its properties through the props protocol, a mangled one among them. */
class XtPropsPort {
  [Symbol.for("xaravel.php.props")](): unknown {
    return { "\0*\0hidden": 1, shown: 2, "": "empty" };
  }
}

xaravelTest(
  "XT-runtime-28",
  "an object branded JsonSerializable, Arrayable, Jsonable or Jsonable and JsonSerializable encodes as Laravel's JsonResponse does at the top level and as PHP's json_encode does nested; any other object encodes its public properties (AD-23.1, AD-9.5)",
  () => {
    const output = oracle("XT-runtime-28", "$flags");
    const flags = decode(rawResult(output, 0)) as number[];
    const FLAGS_28 = [0, JSON_PRETTY_PRINT, JSON_FORCE_OBJECT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE];
    Assert.assertSame(FLAGS_28.length, flags.length);
    flags.forEach((flag, index) => Assert.assertSame(FLAGS_28[index], flag, `flag #${index}`));
    const xs = [new XtSerial(), new XtSelfSerial(), new XtArr(), new XtJsn(), new XtBoth(), new XtPlain(), new XtJsnSerial()];
    // The JS objects are the Oracle's $xs: the same classes and properties by name, in PHP's order.
    const oracleXs = rawItems(rawResult(output, 1));
    Assert.assertSame(oracleXs.length, xs.length);
    xs.forEach((x, index) => assertSamePhpValue(oracleXs[index], x, `$xs[${index}]`));
    const responses = decode(rawResult(output, 2)) as string[][];
    const nested = decode(rawResult(output, 3)) as string[][];
    const whole = decode(rawResult(output, 4)) as string[];
    flags.forEach((flag, i) => {
      Assert.assertSame(xs.length, responses[i]!.length);
      xs.forEach((x, j) => {
        Assert.assertSame(responses[i]![j], jsonEncode(x, flag), `JsonResponse(${fqcn(x)}, ${flag})`);
        Assert.assertSame(nested[i]![j], jsonEncode([x], flag), `json_encode([${fqcn(x)}], ${flag})`);
      });
      Assert.assertSame(whole[i], jsonEncode(xs, flag), `json_encode($xs, ${flag})`);
    });
    // The residual difference (Design Notes): PHP's json_encode of an Arrayable-only object writes its public
    // properties (`json_encode([$arr])` above), where jsonEncode at the top level applies Laravel's toArray() hook.
    Assert.assertSame('{"from":"toArray","n":1.5,"u":"\\/\\u00e9"}', jsonEncode(new XtArr()));
    Assert.assertSame('[{"pub":"p"}]', jsonEncode([new XtArr()]));
    // The props protocol, mangled names skipped; a function is a Closure without properties.
    Assert.assertSame('{"shown":2,"":"empty"}', jsonEncode(new XtPropsPort()));
    Assert.assertSame("{}", jsonEncode(() => 1));
    Assert.assertSame('[{},{"a":1}]', jsonEncode([function named(): void {}, { a: 1 }]));
    // A jsonSerialize() that returns an array holding the object itself is recursion.
    class Loop {
      get [JSON_SERIALIZABLE](): true {
        return true;
      }

      jsonSerialize(): unknown {
        return [this];
      }
    }
    Assert.assertSame(false, jsonEncode(new Loop()));
    Assert.assertSame("[null]", jsonEncode(new Loop(), JSON_PARTIAL_OUTPUT_ON_ERROR));
    assertJsonError(() => jsonEncode(new Loop(), JSON_THROW_ON_ERROR), "Recursion detected", JSON_ERROR_RECURSION, "Loop");
    // Local rows: a Jsonable whose toJson() gives no string, and a JsonSerializable brand without jsonSerialize().
    class BadJsonable {
      get [JSONABLE](): true {
        return true;
      }

      toJson(): unknown {
        return 1;
      }
    }
    const badJsonable = thrownBy(() => jsonEncode(new BadJsonable()));
    Assert.assertTrue(badJsonable instanceof TypeError, String(badJsonable));
    Assert.assertSame("jsonEncode(): a Jsonable's toJson() must return a string", (badJsonable as Error).message);
    class NoSerialize {
      get [JSON_SERIALIZABLE](): true {
        return true;
      }
    }
    const noSerialize = thrownBy(() => jsonEncode([new NoSerialize()]));
    Assert.assertTrue(noSerialize instanceof TypeError, String(noSerialize));
    Assert.assertSame("jsonEncode(): an object branded JsonSerializable has no jsonSerialize() method", (noSerialize as Error).message);
  },
);

xaravelTest("XT-runtime-29", "jsonEncode writes a bigint as its exact digits, in a list, as a map value and as a key, as the Oracle's json_encode writes PHP's ints (AD-9.3, AD-23.1)", () => {
  const output = oracle("XT-runtime-29", "json_encode($big)");
  const big = [9223372036854775807n, -9223372036854775808n, 9007199254740993n, -9007199254740993n, 9007199254740992n];
  const actual = [
    jsonEncode(big),
    jsonEncode({ max: 9223372036854775807n, min: -9223372036854775808n, odd: 9007199254740993n, list: big }),
    jsonEncode(
      new PhpArray<bigint, unknown>([
        [9223372036854775807n, -9223372036854775808n],
        [-9007199254740993n, 1],
      ]),
    ),
    jsonEncode(["9223372036854775807", "-9223372036854775808", "9223372036854775808"], JSON_NUMERIC_CHECK),
    jsonEncode(big, JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_FORCE_OBJECT),
  ];
  // Result #1 is the Oracle's $big, which the JS list equals element by element.
  const oracleBig = rawItems(rawResult(output, 1));
  Assert.assertSame(oracleBig.length, big.length);
  big.forEach((value, index) => assertSamePhpValue(oracleBig[index], value, `$big[${index}]`));
  Assert.assertSame(actual.length + 1, output.results.length);
  actual.forEach((json, index) => {
    const result = index === 0 ? 0 : index + 1;
    Assert.assertSame(decode(rawResult(output, result)), json, `result #${result}`);
  });
  Assert.assertSame("[9223372036854775807,-9223372036854775808,9007199254740993,-9007199254740993,9007199254740992]", actual[0]);
  // Local rows: a bigint beyond int64, which PHP cannot hold, still writes its exact digits.
  Assert.assertSame("1180591620717411303424", jsonEncode(2n ** 70n));
  Assert.assertSame('{"n":-18446744073709551616}', jsonEncode({ n: -(2n ** 64n) }));
});

xaravelTest(
  "XT-runtime-30",
  "jsonDecode(json, associative, depth, flags) gives the Oracle's json_decode value in AD-9 form (a list an Array, string keys a plain object, else a PhpArray; stdClass objects; integral floats marked), and null or PHP's error message and code on an error; jsonLastError() / jsonLastErrorMsg() follow the Oracle's json_last_error() through a sequence of calls in a unit frame, and record nothing outside one or in a narrow frame no unit encloses, while a narrow frame inside a unit records into the unit (AD-5.5, AD-5.7, AD-5.8, AD-9.1, AD-9.2, AD-9.4, AD-23.1)",
  () => {
    const output = oracle("XT-runtime-30", "$inputs");
    const inputs = decode(rawResult(output, 0)) as string[];
    const modes = decode(rawResult(output, 1)) as [boolean | null, number][];
    const MODES: [boolean | null, number][] = [
      [true, 0],
      [false, 0],
      [null, 0],
      [null, JSON_OBJECT_AS_ARRAY],
      [false, JSON_OBJECT_AS_ARRAY],
      [true, JSON_BIGINT_AS_STRING],
      [false, JSON_BIGINT_AS_STRING],
    ];
    Assert.assertSame(MODES.length, modes.length);
    modes.forEach(([assoc, flags], index) => {
      Assert.assertSame(MODES[index]![0], assoc, `mode #${index}`);
      Assert.assertSame(MODES[index]![1], flags, `mode #${index}`);
    });
    const results = rawItems(rawResult(output, 2));
    modes.forEach(([assoc, flags], i) => {
      const expected = rawItems(results[i]);
      Assert.assertSame(inputs.length, expected.length);
      inputs.forEach((json, j) => assertSamePhpValue(expected[j], jsonDecode(json, assoc, 512, flags), `json_decode(#${j}, ${String(assoc)}, 512, ${flags})`));
    });
    // The AD-9 forms, spelled out.
    Assert.assertTrue(Array.isArray(jsonDecode('{"0":"a","1":"b"}', true)), "an all-int-key run is a list");
    Assert.assertTrue(jsonDecode('{"5":1,"05":2}', true) instanceof PhpArray, "int and string keys are a PhpArray");
    Assert.assertSame(Object.prototype, Object.getPrototypeOf(jsonDecode('{"a":1}', true)));
    Assert.assertTrue(jsonDecode('{"a":1}') instanceof stdClass);
    Assert.assertTrue(jsonDecode("1.0") instanceof PhpFloat, "an integral float is marked");
    Assert.assertSame(0.5, jsonDecode("0.5"));
    Assert.assertTrue(Object.is(0, jsonDecode("-0")), "-0 is the int 0");
    Assert.assertSame(-9223372036854775808n, jsonDecode("-9223372036854775808"));
    Assert.assertSame("9223372036854775808", jsonDecode("9223372036854775808", null, 512, JSON_BIGINT_AS_STRING));
    // A stdClass keeps the order of its non-index names through a round trip.
    Assert.assertSame('{"b":1,"a":[2]}', jsonEncode(jsonDecode('{"b":1,"a":[2]}')));
    // Local rows: a null or undefined json reads as "" (a syntax error), and a depth beyond INT_MAX is PHP's ValueError.
    Assert.assertSame(null, jsonDecode(null));
    Assert.assertSame(null, jsonDecode(undefined));
    assertJsonError(() => jsonDecode(null, true, 512, JSON_THROW_ON_ERROR), "Syntax error", JSON_ERROR_SYNTAX, "null");
    assertJsonError(() => jsonDecode("1", true, 2147483648), "json_decode(): Argument #3 ($depth) must be less than 2147483647", 0, "depth 2^31", "ValueError");

    // The error rows.
    const errors = oracle("XT-runtime-30", "$bad");
    const bad = decode(rawResult(errors, 0)) as [string, number][];
    const runs: [boolean, number][] = [
      [false, 0],
      [true, 0],
      [false, JSON_THROW_ON_ERROR],
    ];
    runs.forEach(([assoc, flags], run) => {
      const rows = rawItems(rawResult(errors, run + 1));
      Assert.assertSame(bad.length, rows.length);
      bad.forEach(([json, depth], j) => {
        const expected = tryResult(rows[j]);
        const at = `json_decode(${JSON.stringify(json)}, ${String(assoc)}, ${depth}, ${flags})`;
        if ("value" in expected) {
          assertSamePhpValue(expected.value, jsonDecode(json, assoc, depth, flags), at);
        } else {
          Assert.assertSame("JsonException", expected.throws, at);
          assertJsonError(() => jsonDecode(json, assoc, depth, flags), expected.message, expected.code, at, expected.throws);
        }
      });
    });
    // Depth below 1 is PHP's ValueError, after the empty-string check.
    const edge = rawItems(rawResult(errors, 4)).map(tryResult);
    const calls: (() => unknown)[] = [() => jsonDecode("1", true, 0, 0), () => jsonDecode("", true, 0, 0), () => jsonDecode("[1]", true, 0, JSON_THROW_ON_ERROR), () => jsonDecode("", true, 512, JSON_THROW_ON_ERROR)];
    Assert.assertSame(calls.length, edge.length);
    edge.forEach((expected, index) => {
      if ("value" in expected) {
        assertSamePhpValue(expected.value, calls[index]!(), `edge #${index}`);
      } else {
        assertJsonError(calls[index]!, expected.message, expected.code, `edge #${index} (${expected.throws})`, expected.throws);
      }
    });
    assertJsonError(() => jsonDecode("1", true, 0), "json_decode(): Argument #3 ($depth) must be greater than 0", 0, "depth 0", "ValueError");
    assertJsonError(() => jsonDecode("[", true, 512, JSON_THROW_ON_ERROR), "Syntax error", JSON_ERROR_SYNTAX, "[");
    lastErrorSequence("XT-runtime-30", DECODE_STEPS);
    lastErrorLocalRows();
  },
);

/** XT-runtime-27's local rows: a JS lone surrogate is PHP's malformed UTF-8; a symbol is unsupported; undefined is null. */
function localRows(): void {
  // Encoding a lone surrogate (high, low, and in a key).
  Assert.assertSame(false, jsonEncode("a\ud800b"));
  Assert.assertSame("null", jsonEncode("a\ud800b", JSON_PARTIAL_OUTPUT_ON_ERROR));
  Assert.assertSame('["x",null]', jsonEncode(["x", "\udc00"], JSON_PARTIAL_OUTPUT_ON_ERROR));
  Assert.assertSame('{"":1}', jsonEncode({ "a\ud800": 1 }, JSON_PARTIAL_OUTPUT_ON_ERROR));
  assertJsonError(() => jsonEncode("a\ud800b", JSON_THROW_ON_ERROR), "Malformed UTF-8 characters, possibly incorrectly encoded", JSON_ERROR_UTF8, "throw");
  Assert.assertSame('"ab"', jsonEncode("a\ud800b", JSON_INVALID_UTF8_IGNORE));
  Assert.assertSame('"ab"', jsonEncode("a\ud800b", JSON_INVALID_UTF8_IGNORE | JSON_INVALID_UTF8_SUBSTITUTE));
  Assert.assertSame('"a\\ufffdb"', jsonEncode("a\ud800b", JSON_INVALID_UTF8_SUBSTITUTE));
  Assert.assertSame('"a\ufffdb"', jsonEncode("a\udc00b", JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE));
  Assert.assertSame('"\\ud83d\\ude00"', jsonEncode("\u{1F600}", JSON_INVALID_UTF8_IGNORE));
  // Decoding one: inside a string error 5 unless a flag applies (SUBSTITUTE wins over IGNORE, as in PHP's scanner).
  Assert.assertSame(null, jsonDecode('"a\ud800b"'));
  assertJsonError(() => jsonDecode('"a\ud800b"', null, 512, JSON_THROW_ON_ERROR), "Malformed UTF-8 characters, possibly incorrectly encoded", JSON_ERROR_UTF8, "decode");
  Assert.assertSame("a\ufffdb", jsonDecode('"a\ud800b"', null, 512, JSON_INVALID_UTF8_SUBSTITUTE));
  Assert.assertSame("ab", jsonDecode('"a\udc00b"', null, 512, JSON_INVALID_UTF8_IGNORE));
  Assert.assertSame("a\ufffdb", jsonDecode('"a\ud800b"', null, 512, JSON_INVALID_UTF8_SUBSTITUTE | JSON_INVALID_UTF8_IGNORE));
  assertJsonError(() => jsonDecode("\ud800", null, 512, JSON_THROW_ON_ERROR), "Malformed UTF-8 characters, possibly incorrectly encoded", JSON_ERROR_UTF8, "outside a string");
  // A symbol has no PHP value: an unsupported type.
  Assert.assertSame(false, jsonEncode(Symbol("s")));
  Assert.assertSame("[1,null]", jsonEncode([1, Symbol("s")], JSON_PARTIAL_OUTPUT_ON_ERROR));
  assertJsonError(() => jsonEncode(Symbol("s"), JSON_THROW_ON_ERROR), "Type is not supported", JSON_ERROR_UNSUPPORTED_TYPE, "symbol");
  // INF and NAN go on encoding; a later error wins without the partial flag, as in PHP.
  assertJsonError(() => jsonEncode([Infinity, Symbol("s")], JSON_THROW_ON_ERROR), "Type is not supported", JSON_ERROR_UNSUPPORTED_TYPE, "INF then symbol");
  assertJsonError(() => jsonEncode([Infinity], JSON_THROW_ON_ERROR), "Inf and NaN cannot be JSON encoded", JSON_ERROR_INF_OR_NAN, "INF");
  // undefined reads as null; a hole too.
  Assert.assertSame("null", jsonEncode(undefined));
  // oxlint-disable-next-line no-sparse-arrays
  Assert.assertSame('[null,{"a":null},null]', jsonEncode([undefined, { a: undefined }, ,]));
  // A JS array that contains itself is recursion.
  const loop: unknown[] = [1];
  loop.push(loop);
  Assert.assertSame(false, jsonEncode(loop));
  Assert.assertSame("[1,null]", jsonEncode(loop, JSON_PARTIAL_OUTPUT_ON_ERROR));
  // The package root exports the same functions and constants.
  Assert.assertSame(jsonEncode, root.jsonEncode);
  Assert.assertSame(jsonDecode, root.jsonDecode);
  Assert.assertSame(4194304, root.JSON_THROW_ON_ERROR);
}

/**
 * XT-runtime-27's local row: a fresh process that imports `@xaravel/runtime/registry` (or the php subpath) first can
 * write the classmap, so jsonEncode's imports keep the Registry's import cycle load-safe.
 */
function cycleRow(): void {
  const registry = fileURLToPath(import.meta.resolve("@xaravel/runtime/registry"));
  const php = fileURLToPath(import.meta.resolve("@xaravel/runtime/php"));
  const dir = mkdtempSync(join(tmpdir(), "xaravel-json-"));
  try {
    const scripts = [
      `import { writeClassmap } from ${jsonEncode(registry)};\nwriteClassmap(${jsonEncode(join(dir, "a.json"))});\nconsole.log("ok");\n`,
      `import { jsonEncode } from ${jsonEncode(php)};\nimport { writeClassmap } from ${jsonEncode(registry)};\nwriteClassmap(${jsonEncode(join(dir, "b.json"))});\nconsole.log(jsonEncode([1.5]));\n`,
    ];
    for (const [index, script] of scripts.entries()) {
      const run = Bun.spawnSync([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
      Assert.assertSame(0, run.exitCode, `script #${index}: ${run.stderr.toString()}`);
      Assert.assertSame(index === 0 ? "ok" : "[1.5]", run.stdout.toString().trim());
      Assert.assertSame("{}", readFileSync(join(dir, index === 0 ? "a.json" : "b.json"), "utf8"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A step of a `json_last_error()` sequence request (its `$steps`): `[op, arg, flags, depth]`; `"NAN"` stands for NAN. */
type Step = readonly ["decode" | "encode" | "last", unknown, number, number];

const LAST: Step = ["last", null, 0, 0];

// XT-runtime-27's json_last_error() sequence (the request's `$steps`).
const ENCODE_STEPS: readonly Step[] = [
  ["encode", "NAN", 0, 512],
  LAST,
  ["encode", "NAN", JSON_PARTIAL_OUTPUT_ON_ERROR, 512],
  LAST,
  ["encode", 1, JSON_THROW_ON_ERROR, 512],
  LAST,
  ["encode", 1, 0, 512],
  LAST,
  ["encode", "NAN", JSON_THROW_ON_ERROR, 512],
  LAST,
  ["encode", "NAN", JSON_THROW_ON_ERROR | JSON_PARTIAL_OUTPUT_ON_ERROR, 512],
  LAST,
  ["encode", [[1]], 0, 1],
  LAST,
  ["decode", "[", 0, 512],
  ["encode", { a: 1 }, 0, 512],
  LAST,
];

// XT-runtime-30's json_last_error() sequence (the request's `$steps`).
const DECODE_STEPS: readonly Step[] = [
  ["decode", "[", 0, 512],
  LAST,
  ["decode", "{", JSON_THROW_ON_ERROR, 512],
  LAST,
  ["decode", "[1]", JSON_THROW_ON_ERROR, 512],
  LAST,
  ["decode", "[1]", 0, 512],
  LAST,
  ["decode", '"\\ud800"', 0, 512],
  LAST,
  ["decode", "[1]", 0, 0],
  LAST,
  ["decode", "[", 0, 512],
  ["decode", "[1]", JSON_THROW_ON_ERROR, 0],
  LAST,
  ["decode", "", 0, 512],
  LAST,
  ["decode", "[1]", 0, 512],
  ["decode", "", JSON_THROW_ON_ERROR, 512],
  LAST,
  ["decode", "[[1]]", 0, 1],
  LAST,
  ["decode", "\"\u0001\"", JSON_THROW_ON_ERROR | JSON_PARTIAL_OUTPUT_ON_ERROR, 512],
  LAST,
];

/**
 * The Oracle's `$run($steps)` for the request of `id` whose first expr is `$steps`, replayed in one unit frame
 * (ESC-9.8-1 part 2): each call gives the Oracle's value or error, and each `last` step the Oracle's
 * `json_last_error()` and `json_last_error_msg()`.
 */
function lastErrorSequence(id: string, steps: readonly Step[]): void {
  const output = oracle(id, "$steps");
  // The JS steps are the Oracle's `$steps`, element by element.
  const oracleSteps = rawItems(rawResult(output, 0));
  Assert.assertSame(oracleSteps.length, steps.length, `${id}: $steps length`);
  steps.forEach((step, index) => assertSamePhpValue(oracleSteps[index], [...step], `$steps[${index}]`));
  const results = rawItems(rawResult(output, 1));
  Assert.assertSame(results.length, steps.length, `${id}: $run($steps) results`);
  Assert.assertSame(null, currentFrame(), "the sequence opens its own frame");
  runInFrame("unit", () => {
    steps.forEach(([op, arg, flags, depth], index) => {
      const expected = rawItems(results[index]);
      const tag = decode(expected[0]);
      const at = `${id} step #${index}`;
      if (op === "last") {
        Assert.assertSame("last", tag, at);
        Assert.assertSame(Number(decode(expected[1])), jsonLastError(), at);
        Assert.assertSame(decode(expected[2]), jsonLastErrorMsg(), at);
        return;
      }
      const call = (): unknown => (op === "decode" ? jsonDecode(arg as string, true, depth, flags) : jsonEncode(arg === "NAN" ? NaN : arg, flags, depth));
      if (tag === "value") {
        assertSamePhpValue(expected[1], call(), at);
      } else {
        // ESC-9.8-1 part 1: the Oracle's class (JsonException or ValueError), message and code.
        Assert.assertSame("throws", tag, at);
        Assert.assertTrue(["JsonException", "ValueError"].includes(decode(expected[1]) as string), at);
        assertJsonError(call, decode(expected[2]) as string, Number(decode(expected[3])), at, decode(expected[1]) as string);
      }
    });
  });
}

/** A `JsonSerializable` whose `jsonSerialize()` throws. */
class XtThrowingSerial {
  get [JSON_SERIALIZABLE](): true {
    return true;
  }

  jsonSerialize(): unknown {
    throw new RangeError("from jsonSerialize");
  }
}

/**
 * The local rows of `jsonLastError()` / `jsonLastErrorMsg()` (ESC-9.8-1 part 2): the record lives in the active unit
 * frame; outside a frame, or in a narrow frame no unit encloses, a call records nothing and the reads give 0.
 */
function lastErrorLocalRows(): void {
  // Outside a frame: nothing is recorded.
  Assert.assertSame(null, currentFrame());
  Assert.assertSame(null, jsonDecode("["));
  Assert.assertSame(0, jsonLastError());
  Assert.assertSame("No error", jsonLastErrorMsg());
  runInFrame("unit", () => {
    // Before any call in the frame: 0.
    Assert.assertSame(0, jsonLastError());
    Assert.assertSame("No error", jsonLastErrorMsg());
    jsonDecode('{"a":1,}');
    Assert.assertSame(JSON_ERROR_SYNTAX, jsonLastError());
    // A throwing call (THROW without PARTIAL) leaves the previous code.
    assertJsonError(() => jsonEncode(NaN, JSON_THROW_ON_ERROR), "Inf and NaN cannot be JSON encoded", JSON_ERROR_INF_OR_NAN, "throw");
    Assert.assertSame(JSON_ERROR_SYNTAX, jsonLastError());
    Assert.assertSame("Syntax error", jsonLastErrorMsg());
    // A jsonSerialize() exception propagates after the encoder's code (0 here) is recorded, as PHP does.
    Assert.assertTrue(thrownBy(() => jsonEncode([new XtThrowingSerial()])) instanceof RangeError);
    Assert.assertSame(0, jsonLastError());
    // Under THROW (without PARTIAL) the same exception leaves the record untouched.
    jsonDecode("[");
    Assert.assertTrue(thrownBy(() => jsonEncode([new XtThrowingSerial()], JSON_THROW_ON_ERROR)) instanceof RangeError);
    Assert.assertSame(JSON_ERROR_SYNTAX, jsonLastError());
    // Under PARTIAL, an earlier error in the same call is the code recorded (PHP 8.5.11: 7).
    Assert.assertTrue(thrownBy(() => jsonEncode([NaN, new XtThrowingSerial()], JSON_PARTIAL_OUTPUT_ON_ERROR)) instanceof RangeError);
    Assert.assertSame(JSON_ERROR_INF_OR_NAN, jsonLastError());
    // The top-level Jsonable hook never runs PHP's json_encode, so the record stays as it was.
    jsonDecode("[");
    Assert.assertSame("custom:0", jsonEncode(new XtJsn()));
    Assert.assertSame(JSON_ERROR_SYNTAX, jsonLastError());
    // A narrow frame declaring no slots writes through to the enclosing unit (AD-5.8).
    jsonEncode([1]);
    Assert.assertSame(0, jsonLastError());
    runInNarrowFrame("narrow", [], () => {
      Assert.assertSame(null, jsonDecode("["));
    });
    Assert.assertSame(JSON_ERROR_SYNTAX, jsonLastError());
    // A failed encode sets its code; each call records, success included.
    Assert.assertSame(false, jsonEncode("a\ud800"));
    Assert.assertSame(JSON_ERROR_UTF8, jsonLastError());
    Assert.assertSame("[1]", jsonEncode([1]));
    Assert.assertSame(0, jsonLastError());
    jsonEncode(Symbol("s"));
    Assert.assertSame(JSON_ERROR_UNSUPPORTED_TYPE, jsonLastError());
    Assert.assertSame("Type is not supported", jsonLastErrorMsg());
  });
  // The record does not outlive its frame, and another frame starts at 0.
  Assert.assertSame(0, jsonLastError());
  runInFrame("unit", () => Assert.assertSame(0, jsonLastError()));
  // A root narrow frame has no unit to hold the record: the call does not throw and records nothing.
  runInNarrowFrame("narrow", [], () => {
    Assert.assertSame(null, jsonDecode("["));
    Assert.assertSame(0, jsonLastError());
  });
  // The package root exports the same functions.
  Assert.assertSame(jsonLastError, root.jsonLastError);
  Assert.assertSame(jsonLastErrorMsg, root.jsonLastErrorMsg);
}
