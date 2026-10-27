// Xaravel Tests for action item epic-14-item-8-runtime-round-string-array-pointer (decisions/ESC-14.3-1.md, option 1,
// approved under decisions/MAINT-2026-10-26-runtime-builtins.md). XT-runtime-80: `round`, the `PHP_ROUND_*` constants
// and the `RoundingMode` enum. XT-runtime-81: `reset`, `end`, `is_bool`, `strtoupper`, `trim` and `chunk_split`.
// XT-runtime-82: every probe label recomputed, and the fresh-process export check. None needs an Oracle fixture: each
// expected value and message is what PHP 8.5.11 gives for the same call, probed with the host's `php`:
// `php-round-string-functions.probe.php` prints each PHP-derived value as `<label>\t<json>`
// (`JSON_PRESERVE_ZERO_FRACTION`, a non-finite float as `INF`, `-INF` or `NAN`), `php-round-string-functions.probe.txt`
// is its output under PHP 8.5.11 (`php -d error_reporting=0 php-round-string-functions.probe.php >
// php-round-string-functions.probe.txt`), and XT-runtime-82 computes every recorded label with the runtime and compares
// it with PHP's value. Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (`undefined`,
// the float marker, a `Ref`, the unported object form of `reset` / `end`, a result or input JS cannot hold, and the
// grader's map of root throwables).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  BackedEnum,
  chunk_split,
  end,
  enumExists,
  Error as PhpError,
  float,
  is_bool,
  isFloat,
  JSON_PRESERVE_ZERO_FRACTION,
  jsonEncode,
  PHP_ROUND_HALF_DOWN,
  PHP_ROUND_HALF_EVEN,
  PHP_ROUND_HALF_ODD,
  PHP_ROUND_HALF_UP,
  PhpArray,
  PhpFloat,
  Ref,
  reset,
  round,
  RoundingMode,
  SortDirection,
  stdClass,
  Stringable,
  strtoupper,
  trim,
  UnitEnum,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass, resolveClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpRoundStringFunctions";

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = [
  "PHP_ROUND_HALF_DOWN",
  "PHP_ROUND_HALF_EVEN",
  "PHP_ROUND_HALF_ODD",
  "PHP_ROUND_HALF_UP",
  "RoundingMode",
  "chunk_split",
  "end",
  "is_bool",
  "reset",
  "round",
  "strtoupper",
  "trim",
] as const;

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/**
 * `"<class>: <message>"` of what `fn` throws (a PHP throwable), else its result, a non-finite float as its name; the
 * probe's `attempt`.
 */
function attempt(fn: () => unknown): unknown {
  let result: unknown;
  try {
    result = fn();
  } catch (error) {
    const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
    return `${fqcn(klass)}: ${(error as globalThis.Error).message}`;
  }
  if (typeof result === "number" && !Number.isFinite(result)) {
    return Number.isNaN(result) ? "NAN" : result > 0 ? "INF" : "-INF";
  }
  return result;
}

/** `fn` throws a JS `TypeError` (no PHP throwable) whose message contains `part`. */
function assertJsTypeError(part: string, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof globalThis.TypeError && !(error instanceof PhpError), `expected a JS TypeError: ${String(error)}`);
  Assert.assertStringContainsString(part, (error as globalThis.Error).message);
}

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = jsonEncode(value, JSON_PRESERVE_ZERO_FRACTION);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** Runs `code` as a module in a fresh `bun` process from the package directory. */
function child(code: string): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: inherited });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

/** The probe's `Text`, whose `__toString` port gives `text`. */
class Text {
  toString(): string {
    return "text";
  }
}

registerClass(`${NS}\\Text`, Text);

/** `round(...args)`, or what it throws; the probe's `r`. */
function r(...args: unknown[]): unknown {
  return attempt(() => (round as (...a: unknown[]) => unknown)(...args));
}

/** `trim(...args)`, or what it throws. */
function t(...args: unknown[]): unknown {
  return attempt(() => (trim as (...a: unknown[]) => unknown)(...args));
}

/** `chunk_split(...args)`, or what it throws. */
function c(...args: unknown[]): unknown {
  return attempt(() => (chunk_split as (...a: unknown[]) => unknown)(...args));
}

const INT_MAX = 9223372036854775807n;
const INT_MIN = -9223372036854775808n;

/** The probe's `$modeValues`: `[num, precision]` pairs rounded in every mode. */
const MODE_VALUES: readonly (readonly [unknown, number])[] = [
  [1.5, 0],
  [-1.5, 0],
  [2.5, 0],
  [-2.5, 0],
  [-0.5, 0],
  [0.5, 0],
  [1.955, 2],
  [-1.55, 1],
  [1.4, 0],
  [-1.4, 0],
  [25, -1],
  [-35, -1],
  [float(3), 0],
];

/** The probe's `$arrays`, each read by `reset` or `end` through a `Ref`. */
function pointerArrays(): unknown[] {
  return [
    [],
    [1, 2, 3],
    { a: 1, b: 2 },
    new PhpArray<string | number, string>([
      [5, "x"],
      [2, "y"],
      ["k", "z"],
    ]),
    [null],
    [[1], [2]],
  ];
}

/** `fn(new Ref(array))` and the array the `Ref` holds after, for each of the probe's arrays. */
function pointerCase(fn: (ref: Ref<unknown>) => unknown): unknown[] {
  return pointerArrays().map((array) => {
    const ref = new Ref<unknown>(array);
    return [fn(ref), ref.value];
  });
}

const SUBJECT = "..abcdefxyz.edcba..";

/** Each probe label's value, computed with the runtime. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  "round.constants": () => [PHP_ROUND_HALF_UP, PHP_ROUND_HALF_DOWN, PHP_ROUND_HALF_EVEN, PHP_ROUND_HALF_ODD],
  "round.enum": () => [
    RoundingMode.cases().map((mode) => mode.name),
    RoundingMode.HalfEven instanceof UnitEnum,
    RoundingMode.HalfEven instanceof BackedEnum,
    enumExists("RoundingMode"),
    RoundingMode.HalfOdd === RoundingMode.cases()[3],
    attempt(() => new RoundingMode("HalfOdd")),
  ],
  "round.basic": () => [
    r(3.4),
    r(3.5),
    r(-3.5),
    r(75),
    r(float(75), 2),
    r(5.045, 2),
    r(5.055, 2),
    r(0.285, 2),
    r(1.955, 2),
    r(1.45, 1),
    r(-1.45, 1),
    r(1241757, -3),
    r(5, -1),
    r(-15, -1),
    r(1234567, -2),
    r(5, 2),
    r(INT_MAX),
    r(INT_MIN, -2),
    r("3.7"),
    r("  12.345  ", 1),
    r("1e3", -2),
    r(true),
    r(false),
    r(null),
    r(0.1 + 0.2, 15),
    r(123.456, -1),
    r(123.456, -2),
    r(123.456, -3),
    r(0.49999999999999994),
    r(-0.4),
    r(2.5, "1"),
    r(2.55, 1.9),
    r(2.55, true),
    r(1.5, null),
  ],
  "round.modes.int": () => [1, 2, 3, 4, 5, 6, 7, 8].map((mode) => MODE_VALUES.map(([num, precision]) => r(num, precision, mode))),
  "round.modes.enum": () => RoundingMode.cases().map((mode) => MODE_VALUES.map(([num, precision]) => r(num, precision, mode))),
  "round.modes.coerced": () => [r(2.5, 0, 1.9), r(2.5, 0, "3"), r(2.5, 0, true), r(2.5, 0, " 4 "), r(2.5, 0, float(2))],
  "round.edges": () => [
    r(Infinity),
    r(-Infinity),
    r(NaN),
    r(-0),
    r(-0, 2),
    r(float(0), -3),
    r(1e16),
    r(1e16 + 2, -1),
    r(1.5e16, 0),
    r(9007199254740993n, -1),
    r(1.5, 30),
    r(1.5, -30),
    r(1.5, 400),
    r(1.5, -400),
    r(-1.5, -400),
    r(-1.5, -30),
    r(-4e-31, 30),
    r(-1.5, -22),
    r(1.5, INT_MAX),
    r(1.5, INT_MIN),
    r(1.5, 2147483648),
    r(1.5, -2147483649),
    r(1.5e-25, 25),
    r(2.5e-25, 25),
    r(-1.5e-30, 30),
    r(1.2345e-10, 24),
    r(1.2345e-10, 24, PHP_ROUND_HALF_EVEN),
    r(1.23456789e-7, 23),
    r(5e-324, 323),
    r(1.7976931348623157e308, -308),
    r(1.7976931348623157e308, -307),
    r(4.5e300, -300),
    r(float(1e22), -22),
    r(1e23, -23),
    r(123456.789, -23),
    r(0.000001234, 22),
    r(1.0000000000000002, 15),
    r(-2.675, 2),
  ],
  "round.errors": () => [
    r(1.5, 0, 0),
    r(1.5, 0, 9),
    r(1.5, 0, -1),
    r(1.5, 0, INT_MAX),
    r(1.5, 0, null),
    r(1.5, 0, "x"),
    r(1.5, 0, []),
    r(1.5, 0, SortDirection.Ascending),
    r(1.5, 0, new stdClass()),
    r(1.5, 0, 1.5e30),
    r("abc"),
    r("abc", 0, 0),
    r([]),
    r(new stdClass()),
    r("5 apples"),
    r(1.5, "x"),
    r(1.5, 1.5e30),
    r(1.5, []),
    r(1.5, "x", 0),
    r(Infinity, 0, 0),
  ],
  "pointer.reset": () => pointerCase(reset),
  "pointer.end": () => pointerCase(end),
  "pointer.bad": () => [
    attempt(() => reset(new Ref<unknown>(5))),
    attempt(() => reset(new Ref<unknown>(null))),
    attempt(() => end(new Ref<unknown>("abc"))),
    attempt(() => end(new Ref<unknown>(1.5))),
    attempt(() => reset(new Ref<unknown>(true))),
  ],
  is_bool: () => [true, false, 0, 1, "", null, [], "true", float(0), "0"].map((value) => is_bool(value)),
  strtoupper: () => ["abc", "Ab1-z", "é ß", "", 5, 1.5, true, false, null, new Text(), "x\0y", "ÿabcÀ", [], new stdClass()].map((value) => attempt(() => strtoupper(value))),
  "trim.default": () => [
    t(" \t\n\r\0\vx \v"),
    t("  é  "),
    t("\f x \f"),
    t(""),
    t("   "),
    t("abc"),
    t(5),
    t(1.5),
    t(true),
    t(null),
    t(new Text()),
    t([]),
    t(" \t\n\r\0\vx \v", " \n\r\t\v\0"),
  ],
  "trim.lists": () => [
    t(SUBJECT, "a..e"),
    t(SUBJECT, "xa..c"),
    t(SUBJECT, "..a"),
    t(SUBJECT, "a.."),
    t(SUBJECT, "z..a"),
    t(SUBJECT, ""),
    t(SUBJECT, "."),
    t(SUBJECT, ".a..c..e"),
    t(SUBJECT, "a..b..e"),
    t(SUBJECT, ".."),
    t(SUBJECT, "..."),
    t(SUBJECT, "...."),
    t(SUBJECT, ".a..e."),
    t(SUBJECT, "...e"),
    t("ééaé", "é"),
    t("éaé", "é"),
    t("xaxbx", "x"),
    t("abc", "A..Z"),
    t("ABCabc", "A..Z"),
    t(" x ", null),
    t("5x5", 5),
    t("x", []),
  ],
  chunk_split: () => [
    c("abcdefg", 3),
    c("abc", 3),
    c("abc", 5),
    c("", 1),
    c("", 5, "|"),
    c("abcd", 2, "|"),
    c("é", 1, ""),
    c("é", 2, "|"),
    c("éé", 2, "|"),
    c("a".repeat(80)),
    c("abcdef", 1, "<>"),
    c("abc", "2"),
    c("abc", 1.5),
    c("abc", true, null),
    c(12345, 2, 0),
    c("abc", 0),
    c("abc", -1),
    c("", 0),
    c("abc", "x"),
    c([], 1),
    c("abc", 1, []),
    c("abc", INT_MAX),
    c("abc", null),
  ],
};

/** The probe record: each label's recorded PHP 8.5.11 value. */
function probeRecord(): Map<string, string> {
  const record = new Map<string, string>();
  for (const line of readFileSync(resolve(import.meta.dir, "php-round-string-functions.probe.txt"), "utf8").split("\n")) {
    if (line !== "") {
      const tab = line.indexOf("\t");
      record.set(line.slice(0, tab), line.slice(tab + 1));
    }
  }
  return record;
}

/** Each of `labels` computes to the value PHP 8.5.11 recorded for it. */
function assertProbeLabels(labels: readonly string[]): void {
  const record = probeRecord();
  for (const label of labels) {
    Assert.assertSame(record.get(label) ?? null, json(PROBE_CASES[label]!()), label);
  }
}

xaravelTest(
  "XT-runtime-80",
  "round(num, precision, mode) gives PHP 8.5.11's _php_math_round result as a float (marked float() when integral, -0 kept) for an int, a float or a numeric string, a negative or out-of-range precision, every int mode 1 to 8 and every RoundingMode case, with PHP's TypeError and ValueError messages; PHP_ROUND_HALF_UP..ODD are 1 to 4, and RoundingMode is a registered AD-26 pure enum with PHP 8.4's eight cases in order, a UnitEnum and no BackedEnum, which refuses new (ESC-14.3-1)",
  () => {
    // Every recorded round, constant and RoundingMode case against PHP 8.5.11: ints, floats and numeric strings,
    // negative and out-of-range precisions, every int mode 1 to 8 and every case, and PHP's TypeErrors and ValueErrors.
    assertProbeLabels(["round.constants", "round.enum", "round.basic", "round.modes.int", "round.modes.enum", "round.modes.coerced", "round.edges", "round.errors"]);
    Assert.assertSame("[3.0,4.0,-4.0,75.0]", json([round(3.4), round(3.5), round(-3.5), round(75)]));
    Assert.assertSame("4.0", json(round("3.7")));
    Assert.assertSame("1.5", json(round(1.5, 2147483648)));
    Assert.assertSame("0.0", json(round(1.5, -2147483649)));
    // PHP_ROUND_HALF_EVEN and RoundingMode::HalfEven give the same row; mode 5 is PHP's ceiling.
    Assert.assertSame("[2.0,-2.0,2.0,-2.0]", json([1.5, -1.5, 2.5, -2.5].map((n) => round(n, 0, PHP_ROUND_HALF_EVEN))));
    Assert.assertSame("[2.0,-2.0,2.0,-2.0]", json([1.5, -1.5, 2.5, -2.5].map((n) => round(n, 0, RoundingMode.HalfEven))));
    Assert.assertSame("[2.0,-1.0,3.0,-2.0]", json([1.5, -1.5, 2.5, -2.5].map((n) => round(n, 0, 5))));
    Assert.assertSame("[2.0,-1.0,3.0,-2.0]", json([1.5, -1.5, 2.5, -2.5].map((n) => round(n, 0, RoundingMode.PositiveInfinity))));
    Assert.assertSame("TypeError: round(): Argument #3 ($mode) must be of type RoundingMode|int, string given", r(1.5, 0, "x"));
    Assert.assertSame("TypeError: round(): Argument #1 ($num) must be of type int|float, string given", r("abc"));
    Assert.assertSame("TypeError: round(): Argument #2 ($precision) must be of type int, string given", r(1.5, "x"));
    Assert.assertSame("[1242000.0,10.0,-0.0]", json([round(1241757, -3), round(5, -1), round(-0.4)]));
    Assert.assertSame("ValueError: round(): Argument #3 ($mode) must be a valid rounding mode (RoundingMode::*)", r(1.5, 0, 9));
    Assert.assertSame("[1,2,3,4]", json([PHP_ROUND_HALF_UP, PHP_ROUND_HALF_DOWN, PHP_ROUND_HALF_EVEN, PHP_ROUND_HALF_ODD]));
    // Xaravel-only: an integral result carries the float marker, -0 included; a fraction is a plain number.
    const three = round(3.4);
    Assert.assertTrue(three instanceof PhpFloat);
    Assert.assertSame(3, Number(three));
    Assert.assertTrue(isFloat(round(75)));
    Assert.assertTrue(Object.is(Number(round(-0.4)), -0));
    Assert.assertSame(5.05, round(5.045, 2));
    Assert.assertTrue(Number.isNaN(round(NaN) as number));
    Assert.assertSame(Infinity, round(Infinity));
    // Xaravel-only: undefined reads as null for num; an omitted precision and mode are 0 and PHP_ROUND_HALF_UP.
    Assert.assertSame(0, Number(round(undefined)));
    Assert.assertSame(3, Number(round(2.5, undefined, undefined)));
    // Xaravel-only: a symbol is no PHP value, which no parameter takes.
    Assert.assertSame("TypeError: round(): Argument #1 ($num) must be of type int|float, symbol given", r(Symbol("s")));
    // RoundingMode: registered, frozen cases, out of the grader's map of root throwables.
    Assert.assertSame("RoundingMode", fqcn(RoundingMode));
    Assert.assertSame(RoundingMode, resolveClass("RoundingMode"));
    Assert.assertTrue(Object.isFrozen(RoundingMode.HalfEven));
    Assert.assertSame("HalfEven", RoundingMode.HalfEven.name);
    Assert.assertSame(
      "HalfAwayFromZero,HalfTowardsZero,HalfEven,HalfOdd,TowardsZero,AwayFromZero,NegativeInfinity,PositiveInfinity",
      RoundingMode.cases()
        .map((mode) => mode.name)
        .join(","),
    );
    Assert.assertTrue(RoundingMode.HalfOdd instanceof UnitEnum);
    Assert.assertFalse(RoundingMode.HalfOdd instanceof BackedEnum);
    Assert.assertTrue(enumExists("RoundingMode"));
    // Xaravel-only: an object of RoundingMode's prototype that is no case is no valid mode.
    Assert.assertSame("ValueError: round(): Argument #3 ($mode) must be a valid rounding mode (RoundingMode::*)", r(1.5, 0, Object.create(RoundingMode.prototype)));
    Assert.assertTrue(RoundingMode.PositiveInfinity instanceof RoundingMode);
    Assert.assertNull((RoundingMode as unknown as { backingType?: unknown }).backingType ?? null);
    const classes = (globalThis as Record<symbol, unknown>)[Symbol.for("xaravel.php.classes")] as Record<string, unknown>;
    Assert.assertFalse(Object.hasOwn(classes, "RoundingMode"));
    Assert.assertSame("Error: Cannot instantiate enum RoundingMode", attempt(() => new RoundingMode("X")));
  },
);

xaravelTest(
  "XT-runtime-81",
  "reset and end give the first and last value of the array a Ref holds, or false for an empty one, and leave it as it is; is_bool is true for true and false only; strtoupper raises ASCII a-z only; trim removes PHP's default list or a php_charmask list with x..y ranges over UTF-8 bytes; chunk_split splits UTF-8 bytes into length-byte chunks each ending in the separator; each with PHP 8.5.11's TypeError and ValueError messages, and a JS TypeError for a non-Ref, an object's internal pointer, a lone surrogate, and a result that splits a UTF-8 sequence (ESC-14.3-1)",
  () => {
    // Every recorded reset, end, is_bool, strtoupper, trim and chunk_split case against PHP 8.5.11: values, x..y and
    // malformed lists, and PHP's TypeErrors and ValueErrors.
    assertProbeLabels(["pointer.reset", "pointer.end", "pointer.bad", "is_bool", "strtoupper", "trim.default", "trim.lists", "chunk_split"]);
    // reset and end read the array and leave the same JS value in the Ref.
    const list = [1, 2, 3];
    const ref = new Ref<unknown>(list);
    Assert.assertSame(1, reset(ref));
    Assert.assertSame(3, end(ref));
    Assert.assertSame(list, ref.value);
    Assert.assertFalse(reset(new Ref<unknown>({})) as boolean);
    Assert.assertSame("TypeError: reset(): Argument #1 ($array) must be of type array, int given", attempt(() => reset(new Ref<unknown>(5))));
    // Xaravel-only: a contract token is its class-string.
    Assert.assertSame("TypeError: reset(): Argument #1 ($array) must be of type array, string given", attempt(() => reset(new Ref<unknown>(Stringable))));
    Assert.assertSame("TypeError: end(): Argument #1 ($array) must be of type array, string given", attempt(() => end(new Ref<unknown>(Stringable))));
    // Xaravel-only: undefined reads as null, both in the Ref and as an array value.
    Assert.assertSame("TypeError: end(): Argument #1 ($array) must be of type array, null given", attempt(() => end(new Ref<unknown>(undefined))));
    Assert.assertNull(reset(new Ref<unknown>([undefined])));
    // Xaravel-only: a non-Ref, and a Ref holding an object (PHP 8.1's deprecated form), are not ported.
    assertJsTypeError("is by reference; pass a Ref", () => reset([1] as unknown as Ref<unknown>));
    assertJsTypeError("is by reference; pass a Ref", () => end(null as unknown as Ref<unknown>));
    assertJsTypeError("internal pointer (deprecated since PHP 8.1) is not ported", () => reset(new Ref<unknown>(new stdClass())));
    assertJsTypeError("internal pointer (deprecated since PHP 8.1) is not ported", () => end(new Ref<unknown>(() => 1)));
    // is_bool.
    Assert.assertTrue(is_bool(false));
    Assert.assertFalse(is_bool(undefined));
    Assert.assertFalse(is_bool(float(1)));
    // strtoupper, trim and chunk_split.
    Assert.assertSame("AB1-Z", strtoupper("Ab1-z"));
    Assert.assertSame("é ß", strtoupper("é ß"));
    Assert.assertSame("x", trim(" \t\n\r\0\vx \v"));
    Assert.assertSame("bcdefxyz.edcb", trim(SUBJECT, "..a"));
    Assert.assertSame("..abcdefxyz.edcba..", trim(SUBJECT, "a..e"));
    Assert.assertSame("fxyz", trim(SUBJECT, ".a..e."));
    Assert.assertSame("abc", trim("ABCabc", "A..Z"));
    Assert.assertSame("TypeError: strtoupper(): Argument #1 ($string) must be of type string, array given", attempt(() => strtoupper([])));
    Assert.assertSame("TypeError: trim(): Argument #2 ($characters) must be of type string, array given", t("x", []));
    Assert.assertSame("TypeError: chunk_split(): Argument #2 ($length) must be of type int, string given", c("abc", "x"));
    Assert.assertSame("abc\r\ndef\r\ng\r\n", chunk_split("abcdefg", 3));
    Assert.assertSame("|", chunk_split("", 5, "|"));
    Assert.assertSame("ValueError: chunk_split(): Argument #2 ($length) must be greater than 0", c("abc", 0));
    // Xaravel-only: an omitted (or undefined) list is PHP's default; an explicit null is "".
    Assert.assertSame("x", trim(" x ", undefined));
    Assert.assertSame(" x ", trim(" x ", null));
    // Xaravel-only: a result that splits a UTF-8 sequence, and a lone surrogate, are no JS string.
    assertJsTypeError("trim(): the result splits a UTF-8 sequence", () => trim("ê", "é"));
    assertJsTypeError("chunk_split(): the result splits a UTF-8 sequence", () => chunk_split("é", 1, "|"));
    assertJsTypeError("chunk_split(): the result splits a UTF-8 sequence", () => chunk_split("aé", 2));
    assertJsTypeError("strtoupper(): the string holds a lone surrogate", () => strtoupper("\ud800"));
    assertJsTypeError("trim(): the string holds a lone surrogate", () => trim("x", "\udc00"));
    assertJsTypeError("chunk_split(): the string holds a lone surrogate", () => chunk_split("x", 1, "\ud800"));
  },
);

xaravelTest(
  "XT-runtime-82",
  "every PHP 8.5.11 value recorded in php-round-string-functions.probe.txt (from php-round-string-functions.probe.php: round, the PHP_ROUND_* constants, RoundingMode, reset, end, is_bool, strtoupper, trim and chunk_split, with the exception class and message of each recorded case) is what the runtime gives for the same case, and a fresh process exports every new name from the root and @xaravel/runtime/php as the same object (ESC-14.3-1)",
  () => {
    const record = readFileSync(resolve(import.meta.dir, "php-round-string-functions.probe.txt"), "utf8");
    const labels = new Set<string>();
    for (const line of record.split("\n")) {
      if (line === "") {
        continue;
      }
      const tab = line.indexOf("\t");
      const label = line.slice(0, tab);
      labels.add(label);
      const compute = PROBE_CASES[label];
      Assert.assertNotNull(compute ?? null, `no runtime case for probe label ${label}`);
      Assert.assertSame(line.slice(tab + 1), json((compute as () => unknown)()), label);
    }
    Assert.assertSame(Object.keys(PROBE_CASES).sort().join(","), [...labels].sort().join(","));

    for (const name of NEW_EXPORTS) {
      Assert.assertSame((php as Record<string, unknown>)[name], (root as Record<string, unknown>)[name], name);
      Assert.assertNotNull((php as Record<string, unknown>)[name] ?? null, name);
    }
    // One fresh process imports both entries and compares every new name by identity.
    const run = child(
      `const r = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/index.ts"))}); const p = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/php/index.ts"))}); const names = ${JSON.stringify(NEW_EXPORTS)}; console.log(names.filter((n) => p[n] === undefined || r[n] !== p[n]).join(",") || "all");`,
    );
    Assert.assertSame(0, run.code, run.err);
    Assert.assertSame("all", run.out);
  },
  60_000,
);
