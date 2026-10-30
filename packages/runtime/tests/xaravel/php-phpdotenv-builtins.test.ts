// Xaravel Tests for action item epic-15-item-1-runtime-phpdotenv-builtins (decisions/ESC-15.2-1.md, parts a-e,
// approved by the monitor under decisions/MAINT-2026-10-26-runtime-builtins.md): the PHP builtins vlucas/phpdotenv
// v5.7.0 calls. XT-runtime-131: the string functions. XT-runtime-132: ctype and filter_var. XT-runtime-133: mbstring
// and its encoding table. XT-runtime-134: function_exists, class_exists, the registry's counts, the root and subpath
// exports, and strtok's Scope Frame state. None needs an Oracle fixture: each expected value and message is what PHP
// 8.5.11 gives for the same call, probed with the host's `php`: `php-phpdotenv-builtins.probe.php` prints each value
// as `<label>\t<json_encode(value)>` and `php-phpdotenv-builtins.probe.txt` is its output (`php -d error_reporting=0
// php-phpdotenv-builtins.probe.php > php-phpdotenv-builtins.probe.txt`). Every recorded label is recomputed with the
// runtime. Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (a JS `TypeError` for a
// value JS cannot hold or an encoding the runtime does not port, a `Ref`, Scope Frames).
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn, registerClass } from "@xaravel/runtime/registry";
import { runInFrame, runInNarrowFrame } from "@xaravel/runtime/scope";
import { encodingMimeNames, encodingName } from "../../src/php/mbstringFunctions";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const evidence = new Map(
  readFileSync(`${import.meta.dir}/php-phpdotenv-builtins.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const tab = line.indexOf("\t");
    return [line.slice(0, tab), line.slice(tab + 1)] as const;
  }),
);

/** The probe's fixture `Text`: a class with a `__toString` port. */
class Text {
  constructor(private readonly text: string = "text") {}

  toString(): string {
    return this.text;
  }
}
registerClass("XaravelFixture\\PhpdotenvBuiltins\\Text", Text);

/** The probe's fixture `Plain`: a class with no `__toString`. */
class Plain {}
registerClass("XaravelFixture\\PhpdotenvBuiltins\\Plain", Plain);

/** The probe's fixture enum `Suit` (AD-26): a class with a static `cases`. */
class Suit {
  static readonly Hearts: Suit = new Suit();

  static cases(): Suit[] {
    return [Suit.Hearts];
  }
}
registerClass("XaravelFixture\\PhpdotenvBuiltins\\Suit", Suit);

/** The probe's fixture trait `Greets`, composed once so `mixin` marks it. */
class Greets {}
registerClass("XaravelFixture\\PhpdotenvBuiltins\\Greets", Greets);
class UsesGreets extends root.mixin(null, Greets) {}
registerClass("XaravelFixture\\PhpdotenvBuiltins\\UsesGreets", UsesGreets);
/** A registered base class a `mixin` call composes `Greets` onto. */
class GreetsBase {}
registerClass("XaravelFixture\\PhpdotenvBuiltins\\GreetsBase", GreetsBase);
class UsesGreetsOnBase extends root.mixin(GreetsBase, Greets) {}
void UsesGreetsOnBase;

function json(value: unknown): string {
  return p.jsonEncode(value) as string;
}

/** The probe's `attempt`: the result, or "<class>: <message>" for a throw. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    return `${fqcn(error as object)}: ${(error as Error).message}`;
  }
}

/** The probe's `each_call`: each argument list through `fn`. */
function eachCall(fn: (...args: never[]) => unknown, calls: readonly (readonly unknown[])[]): unknown[] {
  return calls.map((args) => attempt(() => Reflect.apply(fn, undefined, args)));
}

/** The probe's `replaced`: str_replace with its by-reference count, as [result, count]. */
function replaced(search: unknown, replace: unknown, subject: unknown): unknown {
  return attempt(() => {
    const count = new p.Ref<unknown>(null);
    const result = p.str_replace(search, replace, subject, count);
    return [result, count.value];
  });
}

/** A JS `TypeError` (not PHP's) thrown by `fn`, as its message; fails when `fn` throws anything else or nothing. */
function jsTypeError(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    Assert.assertTrue(error instanceof TypeError && !(error instanceof p.TypeError), `a JS TypeError: ${String(error)}`);
    return (error as Error).message;
  }
  Assert.fail("no JS TypeError thrown");
  return "";
}

const BOOLS = (): unknown[] => [
  "1", "true", " Yes ", "on", "off", "no", "0", "", "maybe", null, true, false, 1, [1], "TRUE", "False", " on\n", "\fon", "on\0", "\v on\r\t",
  new Text("yes"), new Plain(), 0, p.float(1), 2, "  ", () => 1,
];
const INTS = (): unknown[] => [
  "12", " 12 ", "012", "-0", "+5", "9223372036854775808", p.float(1), "1e3", "9223372036854775807", "-9223372036854775808",
  "-9223372036854775809", "", " ", "0", "00", "+0", "-", "+", "1 2", "\t7\n", "0x1A", 12, -3, true, false, null, [1], new Text("8"),
  new Plain(), 1.5, "12345678901234567890", "1234567890123456789", "\f1", "٣", "-012",
];
const NEW = [
  "addcslashes", "class_exists", "ctype_digit", "ctype_space", "filter_var", "function_exists", "ltrim", "mb_convert_encoding",
  "mb_encoding_aliases", "mb_list_encodings", "mb_strlen", "mb_strpos", "mb_substr", "ord", "rtrim", "str_replace",
  "stripcslashes", "strpos", "strtok",
] as const;

/** Each probe label's runtime computation, as `php-phpdotenv-builtins.probe.php` computes it with PHP. */
const CASES: Readonly<Record<string, () => unknown>> = {
  strpos: () => eachCall(p.strpos, [
    ["a=\"b", "=\""], ["héllo", "l"], ["abc", "d"], ["abc", "", 1], ["abc", "c", -1], ["abc", "a", 4], ["abc", "a", -4],
    ["abc", "", 3], ["abc", "", -3], ["aXbX", "X", 2], ["ab", "b", "1"], [12345, 3], ["abc", "a", 1.9], [[], "a"],
    ["abc", "b", "x"], ["", ""], ["abc", "a", 3],
  ]),
  str_replace: () => [
    replaced("\\\\", "", "a\\\\b\\\\c"),
    replaced("\\", "/", "a\\b\\c"),
    replaced(["a", "b"], ["1", "2"], "aabbc"),
    replaced(["a", "b", "c"], ["x"], "abcabc"),
    replaced(["a", "b"], "z", "abc"),
    replaced(["ab", "b"], ["b", "x"], "abab"),
    replaced(["", "a"], ["1", "2"], "abc"),
    replaced("", "x", "abc"),
    replaced("a", "b", new p.PhpArray<string | number, unknown>([["k", "aa"], [5, 1], [7, ["a"]], ["n", null], ["f", 1.5], ["t", true], ["o", new Text("xa")]])),
    replaced("a", "b", [new Plain()]),
    replaced(["a", "b"], [new Plain()], "c"),
    replaced(["a", [1]], "b", "aArray"),
    replaced("é", "e", "héllo é"),
    replaced(1, 2, 1213),
    replaced(["a", "a"], ["b", "c"], "a"),
    replaced(["a", "b"], ["", "z"], "a"),
    replaced("a", ["b"], "abc"),
    replaced(new Plain(), "", "a"),
    replaced(new Text("a"), new Text("b"), new Text("aa")),
    replaced("a", "b", []),
    replaced("x", "y", ""),
    replaced([1, 2.5, true, null], ["one", "two", "three", "four"], "12.51"),
    replaced({ x: "a", y: "b" }, { p: "1", q: "2" }, "ab"),
  ],
  ltrim: () => eachCall(p.ltrim, [
    [" \t\n\r\v\fa b \f", " \t\n\r\v\f"], ["  \n\0x  "], ["xxayx", "x"], ["abcdef", "a..c"], ["..ab", "..a"], ["a..b", "a.."],
    ["zab", "z..a"], ["", "a"], ["aaa", "a"], [12, "1"], ["abc", ""], ["abc", null], ["ééa", "é"],
  ]),
  rtrim: () => eachCall(p.rtrim, [
    [" a b \t\n\r\v\f", " \t\n\r\v\f"], ["  x\n\0  "], ["/a//", "/"], ["abcdef", "d..f"], ["ab..", "..b"], ["aaa", "a"],
    ["abc", "a..c"], ["", "a"], [[], "a"],
  ]),
  ord: () => eachCall(p.ord, [[""], ["é"], ["A"], ["\0"], ["ab"], [5], [true], [null], [[]]]),
  strtok: () => runInFrame("unit", () => [
    p.strtok("\n\nab\ncd", "\n"), p.strtok("\n"), p.strtok("\n"), p.strtok("\n"),
    p.strtok("\n\n\n", "\n"), p.strtok("\n"),
    p.strtok("a b  c", " "), p.strtok(" "), p.strtok(" "), p.strtok(" "),
    p.strtok("a,b;c", ",;"), p.strtok(";"), p.strtok(","),
    p.strtok("abc", ""), p.strtok(""),
    p.strtok("x=y", "="), p.strtok("x", null),
    p.strtok("", "a"), p.strtok("a"),
    p.strtok("héllo", "l"), p.strtok("l"),
  ]),
  "strtok.errors": () => eachCall(p.strtok, [[[], "a"], ["a", []]]),
  addcslashes: () => eachCall(p.addcslashes, [
    ["a\0\x1f\x7f\n\"", "\0..\x1f\x7f"], ["Hello World", "A..Z"], ["\x07\x08\t\n\x0b\x0c\r", "\0..\x1f"], ["foo[bar]", "A..Z"],
    ["zoo[\".\"]", "z..A"], ["abc", ""], ["", "a"], ["a\\b", "\\"], ["quote\"s", "\""], ["abc", "a.."], ["\u0080ÿ é", "\u0080..ÿ"],
    [[], "a"],
  ]),
  stripcslashes: () => eachCall(p.stripcslashes, [
    ["\\f\\n\\x41\\101\\q\\"], ["\\a\\b\\t\\n\\v\\f\\r"], ["\\x4"], ["\\x"], ["\\0"], ["\\1234"], ["\\\\"], ["a\\"], ["\\x414"], ["\\e"],
    ["plain"], ["\\\""], ["\\101\\x42c"], [""], ["\\x7a\\172"], [[]],
  ]),
  ctype_space: () => eachCall(p.ctype_space, [
    [" \x0b"], [""], [32], [1000], [-96], [null], [" \t\n\r\x0b\x0c"], ["a "], [9], [-247], [256], [-129], [p.float(1)], [true], [[]],
    [" "], [" "], [new Text(" ")], [-128], [-1],
  ]),
  ctype_digit: () => eachCall(p.ctype_digit, [
    ["012"], [5], [53], ["1.5"], [""], [1000], [-1000], [-96], [255], [-128], ["٣"], ["12a"], [null], [p.float(1)], [[]], [false], ["-1"],
  ]),
  "filter_var.boolean": () => BOOLS().map((v) => attempt(() => p.filter_var(v, p.FILTER_VALIDATE_BOOLEAN))),
  "filter_var.boolean.null": () => BOOLS().map((v) => attempt(() => p.filter_var(v, p.FILTER_VALIDATE_BOOLEAN, p.FILTER_NULL_ON_FAILURE))),
  "filter_var.bool": () => ["yes", "nah"].map((v) => attempt(() => p.filter_var(v, p.FILTER_VALIDATE_BOOL, { flags: p.FILTER_NULL_ON_FAILURE }))),
  "filter_var.int": () => INTS().map((v) => attempt(() => p.filter_var(v, p.FILTER_VALIDATE_INT))),
  "filter_var.int.null": () => INTS().map((v) => attempt(() => p.filter_var(v, p.FILTER_VALIDATE_INT, p.FILTER_NULL_ON_FAILURE))),
  "filter_var.int.options": () => [
    p.filter_var("5", p.FILTER_VALIDATE_INT, { options: { min_range: 1, max_range: 10 } }),
    p.filter_var("15", p.FILTER_VALIDATE_INT, { options: { min_range: 1, max_range: 10 } }),
    p.filter_var("0", p.FILTER_VALIDATE_INT, { options: { min_range: 1 } }),
    p.filter_var("15", p.FILTER_VALIDATE_INT, { options: { max_range: 10, default: 3 } }),
    p.filter_var("x", p.FILTER_VALIDATE_INT, { options: { default: "d" } }),
    p.filter_var("x", p.FILTER_VALIDATE_INT, { options: { default: "d" }, flags: p.FILTER_NULL_ON_FAILURE }),
    p.filter_var("7", p.FILTER_VALIDATE_INT, { options: { default: "d" } }),
    p.filter_var("5", p.FILTER_VALIDATE_INT, { options: { min_range: "5", max_range: "5" } }),
    p.filter_var("5", p.FILTER_VALIDATE_INT, { options: { min_range: "abc" } }),
    p.filter_var("15", p.FILTER_VALIDATE_INT, { options: { min_range: 1, max_range: 10 }, flags: p.FILTER_NULL_ON_FAILURE }),
    p.filter_var("5", p.FILTER_VALIDATE_INT, { options: "ignored" }),
    p.filter_var("5", p.FILTER_VALIDATE_INT, []),
    p.filter_var([1], p.FILTER_VALIDATE_INT, { options: { default: 9 } }),
    p.filter_var(new Plain(), p.FILTER_VALIDATE_INT, { options: { default: 9 } }),
    p.filter_var("no", p.FILTER_VALIDATE_BOOLEAN, { options: { default: "d" } }),
    p.filter_var("maybe", p.FILTER_VALIDATE_BOOLEAN, { options: { default: "d" }, flags: p.FILTER_NULL_ON_FAILURE }),
    p.filter_var("5", p.FILTER_VALIDATE_INT, { flags: "134217728" }),
  ],
  "filter_var.default": () => [5, 1.5, [1], "a b", null, true, false, new Text("t"), new Plain(), 0.1 + 0.2, 1e100, p.float(-0), p.float(7)].map((v) => attempt(() => p.filter_var(v))),
  "filter_var.default.null": () => [[1], "a", new Plain()].map((v) => attempt(() => p.filter_var(v, p.FILTER_DEFAULT, p.FILTER_NULL_ON_FAILURE))),
  "filter_var.arguments": () => [
    attempt(() => p.filter_var("1", "x")),
    attempt(() => p.filter_var("1", p.FILTER_VALIDATE_INT, "x")),
    attempt(() => p.filter_var("1", "257")),
    attempt(() => p.filter_var("1", p.float(257))),
    attempt(() => p.filter_var("1", p.FILTER_VALIDATE_INT, "0")),
    attempt(() => p.filter_var("1", p.FILTER_VALIDATE_INT, new Plain())),
  ],
  "filter_var.constants": () => [p.FILTER_DEFAULT, p.FILTER_VALIDATE_BOOLEAN, p.FILTER_VALIDATE_BOOL, p.FILTER_VALIDATE_INT, p.FILTER_NULL_ON_FAILURE],
  mb_strlen: () => eachCall(p.mb_strlen, [
    ["héllo"], [""], ["日本語"], ["😀a"], ["abc", null], ["héllo", "UTF-8"], ["héllo", "utf8"], ["héllo", "UTF8"], ["héllo", "utf-8"],
    [12.5], ["a", "nope"], ["a", ""], [[]],
  ]),
  mb_substr: () => eachCall(p.mb_substr, [
    ["héllo", 1, 3], ["héllo", -3], ["héllo", 1, -1], ["héllo", -2, -1], ["héllo", 10], ["héllo", -10, 2], ["héllo", 0, -10],
    ["héllo", 2, null], ["héllo", 5], ["héllo", 4, 0], ["😀ab", 0, 1], ["héllo", 1, 2, "UTF-8"], ["héllo", "1", "2"], ["", 0],
    ["héllo", "x"], ["héllo", 3, -2], ["a", 0, 1, "nope"],
  ]),
  mb_strpos: () => eachCall(p.mb_strpos, [
    ["héllo", "l", 0, "UTF-8"], ["héllo", "l"], ["héllo", "l", 3], ["héllo", "l", -2], ["héllo", "x"], ["héllo", ""], ["héllo", "", 2],
    ["héllo", "", -1], ["héllo", "", 5], ["héllo", "l", 6], ["héllo", "l", -6], ["héllo", "h", -5], ["日本語", "語"], ["héllo", "é"],
    ["", ""], ["", "a"], ["héllo", "l", 0, "nope"], ["héllo", "o", 5], ["abc", "c", "1"],
  ]),
  mb_convert_encoding: () => [
    attempt(() => p.mb_convert_encoding("héllo", "UTF-8", "UTF-8")),
    attempt(() => p.mb_convert_encoding("héllo", "UTF-8")),
    attempt(() => p.mb_convert_encoding("héllo", "utf8", "utf-8")),
    attempt(() => p.mb_convert_encoding("héllo", "UTF-8", ["UTF-8"])),
    attempt(() => p.mb_convert_encoding(new p.PhpArray<string | number, unknown>([["a", "é"], [3, "x"], ["k", { n: "ü" }]]), "UTF-8", "UTF-8")),
    attempt(() => p.mb_convert_encoding("a", "nope")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", "nope")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", ["nope"])),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", "")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", [])),
    attempt(() => p.mb_convert_encoding(5, "UTF-8")),
    attempt(() => p.mb_convert_encoding("", "UTF-8", "UTF-8")),
    attempt(() => p.mb_convert_encoding([5, null, true, 1.5], "UTF-8", "UTF-8")),
    attempt(() => p.mb_convert_encoding(new p.PhpArray<string | number, unknown>([[0, "a"], [1, new Plain()], ["k", new Text("t")], [2, "b"]]), "UTF-8", "UTF-8")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", "UTF-8, utf8")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", "UTF-8,")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", "UTF-8, nope")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", ["utf8", "UTF-8"])),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", " ")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", ",\tUTF-8 ,")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", "UTF-8\n")),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", [""])),
    attempt(() => p.mb_convert_encoding("a", "UTF-8", [" utf8"])),
    attempt(() => p.mb_convert_encoding("a", [])),
    attempt(() => p.mb_convert_encoding(new Plain(), "UTF-8")),
    attempt(() => p.mb_convert_encoding(new Text("é"), "UTF-8")),
  ],
  mb_list_encodings: () => p.mb_list_encodings(),
  mb_encoding_aliases: () => p.mb_list_encodings().map((e) => [e, p.mb_encoding_aliases(e)]),
  "encodings.mime": () => encodingMimeNames().map(([name, mime]) => [name, mime ?? false]),
  "encodings.resolve": () => {
    const resolved: [string, string | null][] = [];
    for (const [name, mime] of encodingMimeNames()) {
      for (const n of [name, ...p.mb_encoding_aliases(name), ...(mime === null ? [] : [mime])]) {
        for (const variant of [n, p.strtolower(n), p.strtoupper(n)]) {
          resolved.push([variant, encodingName(variant)]);
        }
      }
    }
    return resolved;
  },
  "mb_encoding_aliases.errors": () => eachCall(p.mb_encoding_aliases, [["nope"], [""], [" UTF-8"], ["UTF-8 "], [[]], [5], [null], ["pass"], ["auto"]]),
  function_exists: () => eachCall(p.function_exists, [
    ["strlen"], ["\\STRLEN"], ["apache_getenv"], ["minus"], ["\\\\strlen"], ["Strpos"], ["filter_var"], ["mb_strlen"], [""], [5], [null],
    [[]], [new Text("strlen")], ["strlen::x"], ["function_exists"], ["class_exists"], ["ctype_digit"],
  ]),
  class_exists: () => eachCall(p.class_exists, [
    ["stdClass"], ["\\stdClass"], ["STDCLASS"], ["XaravelFixture\\PhpdotenvBuiltins\\Plain"], ["xaravelfixture\\phpdotenvbuiltins\\plain"],
    ["XaravelFixture\\PhpdotenvBuiltins\\Suit"], ["RoundingMode"], ["Stringable"], ["ArrayAccess"],
    ["XaravelFixture\\PhpdotenvBuiltins\\Greets"], ["Nope\\Nothing"], ["ArrayObject", false], ["ArrayObject", []], [""], [5], [null],
    [[]], ["\\\\stdClass"], [new Text("stdClass")],
  ]),
  reflection: () => NEW.map((name) => {
    const fn = PHP_FUNCTIONS[name]!;
    return [fn.name, fn.required, fn.total, fn.variadic, [...fn.byRef]];
  }),
  counts: () => NEW.map((name) => {
    const fn = PHP_FUNCTIONS[name]!;
    return [fn.required > 0 ? attempt(() => fn.call()) : null, attempt(() => fn.call(...Array.from({ length: fn.total + 1 }, () => null)))];
  }),
};

/** Asserts that each of `labels` is recorded and recomputes to PHP's value. */
function assertLabels(labels: readonly string[]): void {
  for (const label of labels) {
    const recorded = evidence.get(label);
    Assert.assertNotNull(recorded ?? null, `missing evidence: ${label}`);
    Assert.assertSame(recorded, json(CASES[label]!()), label);
  }
}

xaravelTest(
  "XT-runtime-131",
  "strpos, str_replace, ltrim, rtrim, ord, strtok, addcslashes and stripcslashes give PHP 8.5.11's results over UTF-8 bytes, with PHP's ValueError, TypeError and Error for what PHP rejects, str_replace's by-reference count, and a JS TypeError for a result JS cannot hold (ESC-15.2-1 part a)",
  () => {
    assertLabels(["strpos", "str_replace", "ltrim", "rtrim", "ord", "strtok", "strtok.errors", "addcslashes", "stripcslashes"]);
    // Xaravel-only: a result that is no valid UTF-8, and an input with a lone surrogate, throw the JS TypeError limit.
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.stripcslashes("\\xff")));
    // "Ã" is the bytes C3 83 and "©" C2 A9, so each names one byte of "é" (C3 A9).
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.ltrim("éa", "Ã")));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.rtrim("aé", "©")));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.strtok("é", "©")));
    Assert.assertStringContainsString("splits a UTF-8 sequence", jsTypeError(() => p.addcslashes("é", "©")));
    for (const call of [() => p.strpos("a\ud800", "a"), () => p.str_replace("a", "b", "\ud800"), () => p.ord("\udc00"), () => p.ltrim("\ud800")]) {
      Assert.assertStringContainsString("lone surrogate", jsTypeError(call));
    }
    // Xaravel-only: str_replace's count is a Ref; null or omitted is no count; a value that is no Ref is refused.
    Assert.assertSame("b", p.str_replace("a", "b", "a"));
    Assert.assertSame("b", p.str_replace("a", "b", "a", null));
    Assert.assertStringContainsString("DIV-9.2", jsTypeError(() => p.str_replace("a", "b", "a", 5 as never)));
    const count = new p.Ref<unknown>(7);
    p.str_replace("x", "y", "abc", count);
    Assert.assertSame(0, count.value);
    // Xaravel-only: an undefined optional argument is omitted.
    Assert.assertSame("a", p.ltrim(" \0a", undefined));
    Assert.assertSame(0, p.strpos("abc", "a", undefined));
    // Xaravel-only: str_replace keeps an array subject's keys through arrayFromEntries.
    Assert.assertSame(json({ a: "y" }), json(p.str_replace("x", "y", { a: "x" })));
    Assert.assertTrue(Array.isArray(p.str_replace("x", "y", ["x", "z"])));
  },
);

xaravelTest(
  "XT-runtime-132",
  "ctype_space and ctype_digit test a string byte-wise in the C locale and an int as PHP does; filter_var gives PHP 8.5.11's results for FILTER_DEFAULT, FILTER_VALIDATE_BOOLEAN and FILTER_VALIDATE_INT with FILTER_NULL_ON_FAILURE, min_range, max_range and default, PHP's TypeError for a bad argument, and a JS TypeError for any other filter, flag or option (ESC-15.2-1 parts b and e)",
  () => {
    assertLabels([
      "ctype_space", "ctype_digit", "filter_var.boolean", "filter_var.boolean.null", "filter_var.bool", "filter_var.int",
      "filter_var.int.null", "filter_var.int.options", "filter_var.default", "filter_var.default.null", "filter_var.arguments",
      "filter_var.constants",
    ]);
    // Xaravel-only: a filter, flag or option the port does not carry throws the JS TypeError limit.
    for (const call of [
      () => p.filter_var("1", 274),
      () => p.filter_var("1", 99999),
      () => p.filter_var("1", p.FILTER_VALIDATE_INT, 2),
      () => p.filter_var("1", p.FILTER_DEFAULT, 4),
      () => p.filter_var("1", p.FILTER_VALIDATE_INT, { filter: 257 }),
      () => p.filter_var("1", p.FILTER_VALIDATE_BOOLEAN, { options: { min_range: 1 } }),
      () => p.filter_var("1", p.FILTER_VALIDATE_INT, { options: { decimal: "," } }),
    ]) {
      Assert.assertStringContainsString("is not ported", jsTypeError(call));
    }
    // Xaravel-only: an int beyond 2^53 is a bigint, inside it a number.
    Assert.assertSame(9223372036854775807n, p.filter_var("9223372036854775807", p.FILTER_VALIDATE_INT));
    Assert.assertSame(12, p.filter_var("12", p.FILTER_VALIDATE_INT));
    // Xaravel-only: a bigint inside int64 is an int to ctype; a lone surrogate is refused.
    Assert.assertTrue(p.ctype_digit(1000n));
    Assert.assertTrue(p.ctype_space(32n));
    Assert.assertStringContainsString("lone surrogate", jsTypeError(() => p.ctype_space(" \ud800")));
    // Xaravel-only: a contract token is its class-string.
    Assert.assertFalse(p.ctype_space(p.Stringable));
    Assert.assertSame("Stringable", p.filter_var(p.Stringable));
    // Xaravel-only: an array default comes back as a copy, as PHP copies it.
    const fallback = [1, 2];
    const filtered = p.filter_var("x", p.FILTER_VALIDATE_INT, { options: { default: fallback } });
    Assert.assertEquals([1, 2], filtered);
    (filtered as number[]).push(3);
    Assert.assertEquals([1, 2], fallback);
  },
);

xaravelTest(
  "XT-runtime-133",
  "mb_strlen, mb_substr, mb_strpos and mb_convert_encoding work in code points over UTF-8 and its aliases, mb_list_encodings and mb_encoding_aliases give PHP 8.5.11's 79 encodings and their aliases, names resolve as mbfl_name2encoding_ex resolves them, an unknown name throws PHP's ValueError, and a known encoding other than UTF-8 throws a JS TypeError naming the limit (ESC-15.2-1 part c)",
  () => {
    assertLabels([
      "mb_strlen", "mb_substr", "mb_strpos", "mb_convert_encoding", "mb_list_encodings", "mb_encoding_aliases", "encodings.mime",
      "encodings.resolve", "mb_encoding_aliases.errors",
    ]);
    Assert.assertSame(79, p.mb_list_encodings().length);
    // Xaravel-only: a known encoding other than UTF-8 throws the JS TypeError limit.
    for (const call of [
      () => p.mb_strlen("a", "ISO-8859-1"),
      () => p.mb_substr("a", 0, 1, "latin1"),
      () => p.mb_strpos("a", "a", 0, "ASCII"),
      () => p.mb_convert_encoding("a", "ISO-8859-1"),
      () => p.mb_convert_encoding("a", "UTF-8", "ISO-8859-1"),
      () => p.mb_convert_encoding("a", "UTF-8", ["UTF-8", "SJIS"]),
      () => p.mb_strlen("a", "UTF-8-Mobile#DOCOMO"),
    ]) {
      Assert.assertStringContainsString("is not ported", jsTypeError(call));
    }
    Assert.assertStringContainsString("auto", jsTypeError(() => p.mb_convert_encoding("a", "UTF-8", "auto")));
    Assert.assertStringContainsString("lone surrogate", jsTypeError(() => p.mb_strlen("\ud800")));
    // Xaravel-only: the lists are new arrays each call; the converted array is a copy; a JS cycle is an empty array.
    const list = p.mb_list_encodings();
    list.push("x");
    Assert.assertSame(79, p.mb_list_encodings().length);
    const aliases = p.mb_encoding_aliases("UTF-8");
    aliases.push("x");
    Assert.assertSame('["utf8"]', json(p.mb_encoding_aliases("UTF-8")));
    const input = { a: ["é"] };
    const copy = p.mb_convert_encoding(input, "UTF-8") as { a: string[] };
    Assert.assertFalse(copy === (input as unknown));
    Assert.assertFalse(copy.a === input.a);
    const cyclic: unknown[] = ["x"];
    cyclic.push(cyclic);
    Assert.assertSame('["x",[]]', json(p.mb_convert_encoding(cyclic, "UTF-8")));
    // Xaravel-only: an undefined optional argument is omitted.
    Assert.assertSame(5, p.mb_strlen("héllo", undefined));
    Assert.assertSame("éllo", p.mb_substr("héllo", 1, undefined, undefined));
  },
);

xaravelTest(
  "XT-runtime-134",
  "function_exists reads the PHP function-name registry and class_exists the Class Registry as PHP 8.5.11 reads its tables; every new function is a registry entry with PHP's ReflectionFunction counts and ArgumentCountErrors, exported from the root and @xaravel/runtime/php as the same object; strtok keeps its string and position per Scope Frame, two concurrent frames apart, and records nothing outside a frame (ESC-15.2-1 part d, AD-5)",
  async () => {
    assertLabels(["function_exists", "class_exists", "reflection", "counts"]);
    // Every recorded label is computed, and every computed label recorded.
    Assert.assertSame(json([...evidence.keys()].sort()), json(Object.keys(CASES).sort()));
    // Root and subpath identity, for every new name.
    const names = [...NEW, "FILTER_DEFAULT", "FILTER_NULL_ON_FAILURE", "FILTER_VALIDATE_BOOL", "FILTER_VALIDATE_BOOLEAN", "FILTER_VALIDATE_INT"];
    for (const name of names) {
      const fromPhp = (p as Record<string, unknown>)[name];
      Assert.assertNotNull(fromPhp ?? null, name);
      Assert.assertSame(fromPhp, (root as Record<string, unknown>)[name], name);
    }
    for (const name of NEW) {
      Assert.assertSame((p as Record<string, unknown>)[name], PHP_FUNCTIONS[name]!.fn, name);
      Assert.assertTrue(p.is_callable(name), name);
    }
    // Xaravel-only: class_exists for a test class, a contract token and a class constructor's own name.
    Assert.assertTrue(p.class_exists(fqcn(Plain)));
    Assert.assertFalse(p.class_exists("Traversable"));
    Assert.assertFalse(p.class_exists("Ref"));
    Assert.assertTrue(p.class_exists("Xaravel\\Runtime\\Php\\Ref"));
    // Xaravel-only: a class composing a trait, and a mixin base, stay classes; the trait does not.
    Assert.assertTrue(p.class_exists(fqcn(UsesGreets)));
    Assert.assertTrue(p.class_exists(fqcn(GreetsBase)));
    Assert.assertFalse(p.class_exists(fqcn(Greets)));

    // strtok outside a frame: the two-argument form returns its first token and records nothing.
    Assert.assertSame("a", p.strtok("a b", " "));
    Assert.assertFalse(p.strtok(" "));
    // In a narrow frame no unit encloses, nothing is recorded either.
    runInNarrowFrame("narrow", [], () => {
      Assert.assertSame("a", p.strtok("a b", " "));
      Assert.assertFalse(p.strtok(" "));
    });
    // A frame's state does not outlive it.
    runInFrame("unit", () => Assert.assertSame("a", p.strtok("a b", " ")));
    Assert.assertFalse(p.strtok(" "));
    runInFrame("unit", () => Assert.assertFalse(p.strtok(" ")));
    // Two concurrent frames tokenize apart.
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1));
    const [left, right] = await Promise.all([
      runInFrame("unit", async () => {
        const out: unknown[] = [p.strtok("a b c", " ")];
        await tick();
        out.push(p.strtok(" "));
        await tick();
        out.push(p.strtok(" "), p.strtok(" "));
        return out;
      }),
      runInFrame("unit", async () => {
        const out: unknown[] = [p.strtok("1,2", ",")];
        await tick();
        out.push(p.strtok(","));
        await tick();
        out.push(p.strtok(","));
        return out;
      }),
    ]);
    Assert.assertSame('["a","b","c",false]', json(left));
    Assert.assertSame('["1","2",false]', json(right));
  },
);
