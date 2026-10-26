// Xaravel Tests for action item epic-14-item-5-runtime-array-functions, the runtime half of ESC-14.2-1
// (decisions/MAINT-2026-10-26-story-14-2.md, option 1, approved under decisions/MAINT-2026-10-26-runtime-builtins.md).
// XT-runtime-68: `array_any`, `array_all`, `array_find_key`, `array_first`, `array_last`, `array_search` and
// `array_flip`. XT-runtime-69: `array_slice`, `array_reverse`, `array_intersect_key` and `array_intersect_assoc`.
// XT-runtime-70: the by-reference `array_shift`, `array_pop`, `array_unshift` and `array_splice`, and `asort` /
// `arsort` with PHP's sort flags. XT-runtime-71: `min`, `max`, `str_contains`, `strlen`, `lcfirst`, `property_exists`,
// `method_exists`, `identical` and the `is_numeric` / `is_float` names. XT-runtime-72: `Random\Randomizer` and
// `SortDirection`. XT-runtime-73: every probe label recomputed, and the fresh-process export check. None needs an
// Oracle fixture: each expected value and message is what PHP 8.5.11 gives for the same construct, probed with the
// host's `php`: `php-array-functions.probe.php` prints each PHP-derived value as `<label>\t<json>`
// (`JSON_PRESERVE_ZERO_FRACTION`, a NAN as `"NAN"`), `php-array-functions.probe.txt` is its output under PHP 8.5.11
// (`php -d error_reporting=0 php-array-functions.probe.php > php-array-functions.probe.txt`), and XT-runtime-73
// computes every recorded label with the runtime and compares it with PHP's value. Not recorded: the assertions marked
// `Xaravel-only`, which have no PHP counterpart (a `Ref` and the write-back, the unported callable and engine forms,
// a class constructor or a contract token as a class-string, the random draws, and a string JS cannot hold).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  array_all,
  array_any,
  array_find_key,
  array_first,
  array_flip,
  array_intersect_assoc,
  array_intersect_key,
  array_key_last,
  array_keys,
  array_last,
  array_pop,
  array_reverse,
  array_search,
  array_shift,
  array_slice,
  array_splice,
  array_unshift,
  arrayEntries,
  arrayFromEntries,
  arsort,
  asort,
  BackedEnum,
  Error as PhpError,
  enumExists,
  float,
  identical,
  is_float,
  is_numeric,
  isFloat,
  isNumeric,
  Iterator,
  IteratorAggregate,
  JSON_PRESERVE_ZERO_FRACTION,
  jsonEncode,
  lcfirst,
  looseEquals,
  max,
  method_exists,
  min,
  PhpArray,
  property_exists,
  Randomizer,
  Ref,
  SORT_FLAG_CASE,
  SORT_LOCALE_STRING,
  SORT_NATURAL,
  SORT_NUMERIC,
  SORT_REGULAR,
  SORT_STRING,
  SortDirection,
  stdClass,
  str_contains,
  strlen,
  Traversable,
  UnitEnum,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass, resolveClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpArrayFunctions";
const INT_MAX = 9223372036854775807n;
const INT_MIN = -9223372036854775808n;

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = [
  "array_all",
  "array_any",
  "array_find_key",
  "array_first",
  "array_flip",
  "array_intersect_assoc",
  "array_intersect_key",
  "array_last",
  "array_pop",
  "array_reverse",
  "array_search",
  "array_shift",
  "array_slice",
  "array_splice",
  "array_unshift",
  "arsort",
  "asort",
  "identical",
  "is_float",
  "is_numeric",
  "lcfirst",
  "max",
  "method_exists",
  "min",
  "property_exists",
  "Randomizer",
  "SORT_FLAG_CASE",
  "SORT_LOCALE_STRING",
  "SORT_NATURAL",
  "SortDirection",
  "str_contains",
  "strlen",
] as const;

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** `"<class>: <message>"` of what `fn` throws (a PHP throwable), else its result; the probe's `attempt`. */
function attempt(fn: () => unknown): unknown {
  let result: unknown;
  try {
    result = fn();
  } catch (error) {
    const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
    return `${fqcn(klass)}: ${(error as globalThis.Error).message}`;
  }
  return result;
}

/** `fn` throws a JS `TypeError` (no PHP throwable) whose message contains `part`. */
function assertJsTypeError(part: string, fn: () => unknown): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof globalThis.TypeError && !(error instanceof PhpError), `expected a JS TypeError: ${String(error)}`);
  Assert.assertStringContainsString(part, (error as globalThis.Error).message);
}

/** `value` with every NAN as `"NAN"`, as the probe's `nan_safe` gives it, through lists and keyed arrays. */
function nanSafe(value: unknown): unknown {
  if ((typeof value === "number" || isFloat(value)) && Number.isNaN(Number(value))) {
    return "NAN";
  }
  if (Array.isArray(value)) {
    return value.map(nanSafe);
  }
  if (value instanceof PhpArray || (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype)) {
    return arrayFromEntries(arrayEntries(value).map(([key, item]) => [key, nanSafe(item)] as const));
  }
  return value;
}

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = jsonEncode(nanSafe(value), JSON_PRESERVE_ZERO_FRACTION);
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

/** A PHP array with the given entries, in order. */
function phpArray(...entries: [string | number, unknown][]): PhpArray {
  return new PhpArray(entries);
}

/** `$a[] = 'next'` on a copy of the PHP array `value`, as PHP's next free index places it. */
function appendNext(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...(value as unknown[]), "next"];
  }
  const copy = value instanceof PhpArray ? value.copy() : new PhpArray(arrayEntries(value as object));
  copy.push("next");
  return copy;
}

/** The probe's `Plain`: a field, a static property, a hooked (accessor) property, an instance and a static method. */
class Plain {
  static stat = 2;
  own = 1;

  get hooked(): number {
    return 3;
  }

  parentMethod(): void {}

  static parentStatic(): void {}
}

registerClass(`${NS}\\Plain`, Plain);

/** The probe's `Kid`: methods of its own, and a `__call`. */
class Kid extends Plain {
  fooBar(): void {}

  static bar(): void {}

  __call(_name: string, _arguments: unknown[]): void {}
}

registerClass(`${NS}\\Kid`, Kid);

/** The probe's `Text`, with a `__toString` port. */
class Text {
  toString(): string {
    return "text";
  }
}

registerClass(`${NS}\\Text`, Text);

/** The probe's `NoText`, without one. */
class NoText {}

registerClass(`${NS}\\NoText`, NoText);

/** The probe's `Declared`: a property only its PHP property table declares (ESC-9.7-1), no own or static JS property. */
class Declared {}

Object.defineProperty(Declared, Symbol.for("xaravel.php.properties"), { value: [{ name: "declared", visibility: "public", default: null }] });

registerClass(`${NS}\\Declared`, Declared);

/** The probe's pure enum `Suit` (AD-26). */
class Suit {
  static readonly Hearts = new Suit("Hearts");
  static readonly Spades = new Suit("Spades");

  constructor(readonly name: string) {}

  static cases(): Suit[] {
    return [Suit.Hearts, Suit.Spades];
  }
}

registerClass(`${NS}\\Suit`, Suit);

/** `[asort's result, the sorted array, the next free key]` for `a` and `flags`; `arsort`'s when `reverse`. */
function sorted(a: unknown, flags: number = SORT_REGULAR, reverse: boolean = false): unknown[] {
  const ref = new Ref<unknown>(a);
  const result = reverse ? arsort(ref, flags) : asort(ref, flags);
  return [result, ref.value, array_key_last(appendNext(ref.value))];
}

/** `[the removed value, the array after, the array after an append]` of a by-reference `fn` on `a`. */
function byReference(a: unknown, fn: (ref: Ref<unknown>) => unknown): unknown[] {
  const ref = new Ref<unknown>(a);
  const result = fn(ref);
  return [result, ref.value, appendNext(ref.value)];
}

const LIST = [1, 2, 3, 4];
const MIXED = (): PhpArray => phpArray(["a", 1], [5, 2], ["b", 3], [9, 4]);
const REGULAR = { x: 10, y: "9", z: 2, w: "10", v: 1.5, u: "abc", t: null, s: true, r: "1e1" };
const NUMERIC = { a: "10", b: "9.5", c: "abc", d: 1, e: " 2", f: "1e1", g: null };
const STRINGS = { a: "b", b: "B", c: "a", d: 10, e: 9, f: "A", g: "é", h: "e", i: "", j: 1.5 };
const NATURAL = ["img12", "img10", "IMG2", "img1", "img2", "img 02", "x1.10", "x1.9", "img012", "img0", "", " img3", "a  b", "a b"];
const STABLE = { k1: 1, k2: "1", k3: float(1), k4: 0, k5: "01", k6: 2 };
const BIG: Record<string, unknown> = {};
for (let i = 0; i < 40; i++) {
  const value = (i * 7) % 13;
  BIG[`k${i}`] = i % 2 === 0 ? value : String(value);
}

/** Each label of `php-array-functions.probe.txt` and the runtime's value for the same case. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  // XT-runtime-68
  any_all: () => [
    array_any([1, 2, 3], (v: number) => v > 1),
    array_any([1, 2, 3], (v: number) => v > 5),
    array_all([1, 2, 3], (v: number) => v > 0),
    array_all([1, 2, 3], (v: number) => v > 1),
    array_any([], () => true),
    array_all([], () => false),
    array_any({ a: 1, b: 2 }, (_v: unknown, k: unknown) => k === "b"),
    array_all({ a: 1, b: 2 }, (_v: unknown, k: unknown) => typeof k === "string"),
    array_any([0, 1], (v: unknown) => v),
    array_all(["x", ""], (v: unknown) => v),
  ],
  "any_all.stops": () => {
    let seen: unknown[] = [];
    const record = (v: number, k: unknown): boolean => {
      seen.push(k);
      return v > 1;
    };
    const any = array_any([1, 2, 3], record);
    const anySeen = seen;
    seen = [];
    const all = array_all([2, 1, 3], record);
    const allSeen = seen;
    seen = [];
    const found = array_find_key([1, 2, 3], record);
    return [any, anySeen, all, allSeen, found, seen];
  },
  find_key: () => [
    array_find_key([1, 2, 3], (v: number) => v > 1),
    array_find_key([1, 2, 3], (v: number) => v > 5),
    array_find_key({ a: 1, b: 2 }, (_v: unknown, k: unknown) => k !== "a"),
    array_find_key(phpArray([5, "x"], ["k", "y"]), (v: unknown) => v === "x"),
    array_find_key([], () => true),
  ],
  "callbacks.errors": () => [
    attempt(() => array_any([1], null)),
    attempt(() => array_all([1], null)),
    attempt(() => array_find_key([1], null)),
    attempt(() => array_any([1], 5)),
    attempt(() => array_any(1, () => true)),
    attempt(() => array_find_key("x", () => true)),
  ],
  first_last: () => [
    array_first([]),
    array_last([]),
    array_first([1, 2]),
    array_last([1, 2]),
    array_first({ x: 1, y: 2 }),
    array_last({ x: 1, y: 2 }),
    array_first(phpArray([5, "a"], ["k", "b"])),
    array_last(phpArray([5, "a"], ["k", "b"])),
    attempt(() => array_first(1)),
    attempt(() => array_last(null)),
  ],
  search: () => [
    array_search("1", [0, 1, "1"]),
    array_search("1", [0, 1, "1"], true),
    array_search(null, [0]),
    array_search("x", [1]),
    array_search(1, { a: "1" }, "yes"),
    array_search(2, phpArray([5, 2], ["k", 2])),
    array_search("abc", [0]),
    array_search([1], [[1], [2]], true),
    array_search(Suit.Hearts, [true, Suit.Hearts]),
    array_search(Suit.Spades, [null, Suit.Hearts]),
    attempt(() => array_search(1, 1)),
    attempt(() => array_search(1, [1], [])),
  ],
  flip: () => [array_flip(["a", "b", 1, 1.5, true, "1"]), array_flip({ x: "y", z: "y" }), array_flip([]), array_flip([null, "-0", "07", "a"]), attempt(() => array_flip("x"))],

  // XT-runtime-69
  slice: () => [
    array_slice(LIST, 1),
    array_slice(LIST, -2),
    array_slice(LIST, 1, 2),
    array_slice(LIST, 1, -1),
    array_slice(LIST, 1, null, true),
    array_slice(LIST, 1, 2, true),
    array_slice(LIST, 5),
    array_slice(LIST, 4),
    array_slice(LIST, -10, 2),
    array_slice(LIST, 2, 0),
    array_slice(LIST, 1, -5),
    array_slice(MIXED(), 1),
    array_slice(MIXED(), 1, null, true),
    array_slice(MIXED(), -3, 2),
    array_slice({ x: 1, y: 2 }, 1),
  ],
  "slice.errors": () => [attempt(() => array_slice([1], "x")), attempt(() => array_slice([1], 0, "x")), attempt(() => array_slice([1], 0, null, [])), attempt(() => array_slice(1, 0))],
  reverse: () => [
    array_reverse([1, 2, 3]),
    array_reverse([1, 2, 3], true),
    array_reverse(MIXED()),
    array_reverse(MIXED(), true),
    array_reverse([]),
    array_reverse({ x: 1, y: 2 }),
    attempt(() => array_reverse(1)),
    attempt(() => array_reverse([1], [])),
  ],
  intersect_key: () => [
    array_intersect_key({ a: 1, b: 2, c: 3 }, { a: 0, c: 0 }),
    array_intersect_key({ a: 1, b: 2 }),
    array_intersect_key([1, 2, 3], phpArray([0, "x"], [2, "y"])),
    array_intersect_key(phpArray([5, "a"], [6, "b"]), phpArray(["5", "c"])),
    array_intersect_key({ a: 1, b: 2, c: 3 }, { a: 0, b: 0 }, { b: 0, c: 0 }),
    array_intersect_key([1, 2], []),
    attempt(() => array_intersect_key(1, [])),
    attempt(() => array_intersect_key([], [], "x")),
  ],
  intersect_assoc: () => [
    array_intersect_assoc({ a: "1", b: 2 }, { a: 1, b: "3" }),
    array_intersect_assoc({ a: [1] }, { a: [2] }),
    array_intersect_assoc({ a: float(1), b: null, c: true, d: false }, { a: "1", b: "", c: "1", d: "0" }),
    array_intersect_assoc([1, 2, 3], [1, 5, 3], [1, 2, 3]),
    array_intersect_assoc({ a: new Text() }, { a: "text" }),
    array_intersect_assoc({ a: 1 }),
    attempt(() => array_intersect_assoc({ a: new NoText() }, { a: "x" })),
    attempt(() => array_intersect_assoc({ a: 1 }, 2)),
  ],

  // XT-runtime-70
  shift: () => [[1, 2, 3], phpArray([5, "a"], ["x", "b"], [9, "c"]), [], { x: 1 }].map((a) => byReference(a, array_shift)),
  pop: () => {
    const unset = phpArray([0, 0], [1, 1], [2, 2]);
    unset.delete(2);
    return [[1, 2, 3], phpArray([5, "a"], ["x", "b"], [9, "c"]), phpArray([9, "c"], [5, "a"]), unset, [], { x: 1, y: 2 }, phpArray([-5, "a"])].map((a) => byReference(a, array_pop));
  },
  unshift: () =>
    (
      [
        [[3], [1, 2]],
        [phpArray(["x", 1], [5, 2]), ["z"]],
        [[], []],
        [phpArray([9, "a"]), [null]],
      ] as [unknown, unknown[]][]
    ).map(([a, values]) => byReference(a, (ref) => array_unshift(ref, ...values))),
  splice: () => {
    const splice = array_splice as (ref: Ref<unknown>, ...args: unknown[]) => unknown;
    const five = [1, 2, 3, 4, 5];
    const fives = [[1], [1, 2], [-1], [1, 0, ["x", "y"]], [1, -1], [1, 1, "x"], [1, 1, null], [10], [-10, 1], [0, null, phpArray(["k", "r"], [9, "s"])], [2, -10], [1, 1, new Text()]].map((args) => {
      const ref = new Ref<unknown>(five);
      const removed = splice(ref, ...args);
      return [removed, ref.value];
    });
    const mixed = [[1, 2, { k: "r" }], [0, 1], [-1, 1, "z"], [2]].map((args) => byReference(MIXED(), (ref) => splice(ref, ...args)));
    return [...fives, ...mixed];
  },
  "refs.errors": () => [
    attempt(() => array_shift(new Ref<unknown>(1))),
    attempt(() => array_pop(new Ref<unknown>("x"))),
    attempt(() => array_unshift(new Ref<unknown>(null), 1)),
    attempt(() => array_splice(new Ref<unknown>(1.5), 0)),
    attempt(() => array_splice(new Ref<unknown>([1]), "x")),
    attempt(() => array_splice(new Ref<unknown>([1]), 0, "x")),
    attempt(() => asort(new Ref<unknown>(true))),
    attempt(() => asort(new Ref<unknown>([1]), "x")),
    attempt(() => arsort(new Ref<unknown>([1]), [])),
  ],
  sorts: () =>
    [false, true].map((reverse) => {
      const hash = phpArray([5, 3], [1, 1], [9, 2]);
      hash.delete(9);
      return [
        sorted(REGULAR, SORT_REGULAR, reverse),
        sorted(NUMERIC, SORT_NUMERIC, reverse),
        sorted(STRINGS, SORT_STRING, reverse),
        sorted(STRINGS, SORT_STRING | SORT_FLAG_CASE, reverse),
        sorted(NATURAL, SORT_NATURAL, reverse),
        sorted(NATURAL, SORT_NATURAL | SORT_FLAG_CASE, reverse),
        sorted(STRINGS, SORT_LOCALE_STRING, reverse),
        sorted(STABLE, SORT_REGULAR, reverse),
        sorted(BIG, SORT_REGULAR, reverse),
        sorted(BIG, SORT_STRING, reverse),
        sorted([3, 1, 2], SORT_REGULAR, reverse),
        sorted(hash, SORT_REGULAR, reverse),
        sorted([], SORT_REGULAR, reverse),
        sorted({ only: 1 }, SORT_REGULAR, reverse),
        sorted(REGULAR, 99, reverse),
        sorted({ a: "B", b: "a" }, SORT_REGULAR | SORT_FLAG_CASE, reverse),
      ];
    }),
  "sorts.enum": () =>
    [false, true].map((reverse) => {
      const ref = new Ref<unknown>({ a: Suit.Hearts, b: 2, c: Suit.Hearts, d: 1 });
      if (reverse) {
        arsort(ref);
      } else {
        asort(ref);
      }
      return array_keys(ref.value);
    }),
  "sorts.nan": () => [SORT_NUMERIC, SORT_REGULAR].flatMap((flags) => [false, true].map((reverse) => sorted({ a: Number.NaN, b: float(1), c: 0.5 }, flags, reverse))),
  "sorts.nul": () => [SORT_LOCALE_STRING, SORT_STRING].flatMap((flags) => [false, true].map((reverse) => sorted({ b: "x\0b", a: "x\0a" }, flags, reverse))),
  sort_flags: () => [SORT_REGULAR, SORT_NUMERIC, SORT_STRING, SORT_LOCALE_STRING, SORT_NATURAL, SORT_FLAG_CASE],

  // XT-runtime-71
  min_max: () => [
    min(2, "10", 3.5),
    max([1, "5", 4]),
    min("apple", "banana"),
    max([1, 2], [1, 3]),
    min(0, "0"),
    min(0, "0", 0),
    min([0, "0"]),
    max(0, "0"),
    max(0, "0", 0),
    max([0, "0"]),
    max("abc", 0),
    min("abc", 0),
    max(1, float(2)),
    min(1, float(1)),
    max(float(1), 1),
    max(float(1), Number.NaN),
    max(Number.NaN, float(1)),
    max(float(1), Number.NaN, float(2)),
    max([float(1), Number.NaN, float(2)]),
    min(float(1), Number.NaN),
    min(Number.NaN, float(1)),
    min([Number.NaN, float(1)]),
    min(null, false, 0),
    max(true, 2),
    max("10", "9"),
    max("10", "9a"),
    min(phpArray([5, 3], ["k", 1])),
    max(["a", "b"], "z"),
    min(-1, INT_MIN, INT_MAX),
  ],
  "min_max.nan": () => [
    max(9007199254740993n, Number.NaN),
    max(9007199254740993n, Number.NaN, float(1)),
    min(9007199254740993n, Number.NaN),
    min(9007199254740993n, Number.NaN, float(1)),
    max(Number.NaN, 9007199254740993n),
    min(Number.NaN, 9007199254740993n),
    max(float(1), 9007199254740993n, Number.NaN),
    min(float(1), 9007199254740993n, Number.NaN),
  ],
  "min_max.errors": () => [attempt(() => min()), attempt(() => max()), attempt(() => min(1)), attempt(() => max("x")), attempt(() => min([])), attempt(() => max([]))],
  strings: () => [
    str_contains("abc", ""),
    str_contains("abc", "bc"),
    str_contains("abc", "d"),
    str_contains("", ""),
    str_contains("héllo", "é"),
    str_contains(12.5, ".5"),
    str_contains(new Text(), "ex"),
    strlen("héllo"),
    strlen(12.5),
    strlen(true),
    strlen(""),
    strlen(new Text()),
    strlen("😀"),
    lcfirst("ABC"),
    lcfirst("Élan"),
    lcfirst(""),
    lcfirst("1A"),
    lcfirst(new Text()),
  ],
  "strings.errors": () => [attempt(() => strlen([])), attempt(() => str_contains([], "a")), attempt(() => str_contains("a", new NoText())), attempt(() => lcfirst([]))],
  property_exists: () => {
    const plain = new Plain();
    (plain as unknown as Record<string, unknown>)["dynamic"] = 1;
    return [
      property_exists(plain, "own"),
      property_exists(plain, "dynamic"),
      property_exists(plain, "stat"),
      property_exists(plain, "hooked"),
      property_exists(plain, "missing"),
      property_exists(plain, "OWN"),
      property_exists(new Kid(), "stat"),
      property_exists(new Kid(), "hooked"),
      property_exists(`${NS}\\Kid`, "stat"),
      property_exists(`${NS}\\Kid`, "hooked"),
      property_exists(`${NS}\\Kid`, "nope"),
      property_exists("Nope\\Missing", "own"),
      property_exists(plain, "parentMethod"),
      property_exists(() => null, "x"),
      property_exists("Iterator", "current"),
    ];
  },
  property_table: () => [property_exists(`${NS}\\Declared`, "declared"), property_exists(new Declared(), "declared"), property_exists(`${NS}\\Declared`, "other")],
  method_exists: () => [
    method_exists(new Kid(), "fooBar"),
    method_exists(new Kid(), "FOOBAR"),
    method_exists(new Kid(), "parentMethod"),
    method_exists(new Kid(), "parentstatic"),
    method_exists(new Kid(), "bar"),
    method_exists(new Kid(), "missing"),
    method_exists(`${NS}\\Kid`, "fooBar"),
    method_exists(`${NS}\\Kid`, "Bar"),
    method_exists(`\\${NS}\\Kid`, "parentMethod"),
    method_exists("Nope\\Missing", "x"),
    method_exists(new Text(), "__toString"),
    method_exists(`${NS}\\Text`, "__tostring"),
    method_exists(new NoText(), "__toString"),
    method_exists(new Kid(), "__call"),
    method_exists(() => null, "__invoke"),
    method_exists(() => null, "bindTo"),
    method_exists(() => null, "call"),
    method_exists(() => null, "nope"),
    method_exists("Closure", "__invoke"),
    method_exists("Closure", "fromCallable"),
    method_exists("Iterator", "current"),
    method_exists("Iterator", "Valid"),
    method_exists("Iterator", "nope"),
    method_exists("IteratorAggregate", "getIterator"),
    method_exists("Traversable", "current"),
    method_exists(new Plain(), "own"),
  ],
  "object.errors": () => [
    attempt(() => property_exists(1, "x")),
    attempt(() => property_exists([], "x")),
    attempt(() => property_exists(null, "x")),
    attempt(() => property_exists(new Plain(), [])),
    attempt(() => method_exists(null, "x")),
    attempt(() => method_exists(1.5, "x")),
    attempt(() => method_exists({ a: 1 }, "x")),
    attempt(() => method_exists(new Plain(), [])),
  ],
  identical: () => {
    const object = new stdClass();
    return [
      identical([1, 2], [1, 2]),
      identical({ a: 1, b: 2 }, { b: 2, a: 1 }),
      identical(1, float(1)),
      identical([1, "1"], [1, 1]),
      identical(object, object),
      identical(new stdClass(), new stdClass()),
      identical(null, null),
      identical([[1]], [[1]]),
      identical(float(0), -0),
      identical(phpArray([5, "a"]), phpArray([5, "a"])),
    ];
  },
  is_numeric_float: () => [["1e3", " 1", "1 ", "abc", 1.5, "", "0x1A", ".5", null].map((v) => is_numeric(v)), [float(1), 1, 1.5, "1.5", -0].map((v) => is_float(v))],

  // XT-runtime-72
  randomizer: () => {
    const randomizer = new Randomizer();
    return [
      randomizer.pickArrayKeys({ a: 1, b: 2, c: 3 }, 3),
      randomizer.pickArrayKeys(phpArray([5, "x"]), 1),
      randomizer.pickArrayKeys(phpArray([5, "x"], ["k", "y"], [7, "z"]), 3),
      fqcn(randomizer),
    ];
  },
  "randomizer.errors": () => {
    const randomizer = new Randomizer();
    return [
      attempt(() => randomizer.pickArrayKeys([], 1)),
      attempt(() => randomizer.pickArrayKeys({ a: 1 }, 0)),
      attempt(() => randomizer.pickArrayKeys({ a: 1 }, 2)),
      attempt(() => randomizer.pickArrayKeys({ a: 1, b: 2 }, -1)),
      attempt(() => randomizer.pickArrayKeys("x", 1)),
      attempt(() => randomizer.pickArrayKeys([1], "x")),
      attempt(() => randomizer.pickArrayKeys([], 0)),
    ];
  },
  sort_direction: () => [
    SortDirection.Ascending.name,
    SortDirection.Descending.name,
    SortDirection.cases().map((direction) => direction.name),
    enumExists("SortDirection"),
    SortDirection.Ascending instanceof UnitEnum,
    SortDirection.Ascending instanceof BackedEnum,
    identical(SortDirection.Ascending, SortDirection.Ascending),
    looseEquals(SortDirection.Ascending, SortDirection.Descending),
    attempt(() => new SortDirection("Ascending")),
  ],
};

/** `label`'s recorded PHP value. */
function recorded(label: string): string {
  const line = readFileSync(resolve(import.meta.dir, "php-array-functions.probe.txt"), "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${label}\t`));
  if (line === undefined) {
    throw new globalThis.Error(`no probe label ${label}`);
  }
  return line.slice(label.length + 1);
}

/** Asserts each of `labels` against the probe record. */
function assertProbed(...labels: string[]): void {
  for (const label of labels) {
    Assert.assertSame(recorded(label), json((PROBE_CASES[label] as () => unknown)()), label);
  }
}

xaravelTest(
  "XT-runtime-68",
  "array_any, array_all and array_find_key call a non-null callback with (value, key) and stop at the first decisive entry; array_first, array_last, array_search (loose and strict) and array_flip give PHP's values, keys and messages (ESC-14.2-1)",
  () => {
    assertProbed("any_all", "any_all.stops", "find_key", "callbacks.errors", "first_last", "search", "flip");

    // Xaravel-only: the unported callable forms (DIV-9.13), and a class constructor or a token as a class-string.
    for (const callback of ["strlen", [new Kid(), "fooBar"], Kid, Traversable]) {
      const form = Array.isArray(callback) ? "array" : "string";
      Assert.assertSame(
        `TypeError: array_any(): Argument #2 ($callback) is a PHP callable ${form}, which Xaravel does not port; pass a function`,
        attempt(() => array_any([1], callback)),
      );
    }
    // Accepted: an object of a class with an `__invoke` method.
    Assert.assertSame(1, array_find_key([1, 2], new (class Invokable {
      __invoke(v: unknown): boolean {
        return v === 2;
      }
    })()));
    // Refused: an `undefined` callback is PHP's null, and a plain object with an `__invoke` key is a PHP array (AD-9).
    Assert.assertSame("TypeError: array_all(): Argument #2 ($callback) must be a valid callback, no array or string given", attempt(() => array_all([1], undefined)));
    const arrayWithInvoke = { __invoke: (v: unknown): boolean => v === 2 };
    Assert.assertSame("TypeError: array_all(): Argument #2 ($callback) is a PHP callable array, which Xaravel does not port; pass a function", attempt(() => array_all([1], arrayWithInvoke)));
    // The input is not changed.
    const input = ["a", "b"];
    array_flip(input);
    Assert.assertSame('["a","b"]', json(input));
  },
);

xaravelTest(
  "XT-runtime-69",
  "array_slice and array_reverse keep string keys and renumber int keys unless preserve_keys, and array_intersect_key and array_intersect_assoc keep the first array's entries whose key (and string value) every other array has, with PHP's messages (ESC-14.2-1)",
  () => {
    assertProbed("slice", "slice.errors", "reverse", "intersect_key", "intersect_assoc");

    // Xaravel-only: the input is not changed, and the result is an AD-9 form.
    const mixed = MIXED();
    array_reverse(mixed);
    array_slice(mixed, 1);
    Assert.assertSame('{"a":1,"5":2,"b":3,"9":4}', json(mixed));
    Assert.assertTrue(Array.isArray(array_slice(mixed, 1, 1)));
    Assert.assertTrue(array_reverse(mixed, true) instanceof PhpArray);
    Assert.assertSame(Object.prototype, Object.getPrototypeOf(array_intersect_key({ a: 1 }, { a: 2 })));
  },
);

xaravelTest(
  "XT-runtime-70",
  "array_shift, array_pop, array_unshift and array_splice take a Ref, write PHP's new array back to its value (int keys renumbered where PHP renumbers them, a PhpArray's next free index kept by array_pop) and return PHP's results; asort and arsort sort by value keeping keys, stably, under SORT_REGULAR, SORT_NUMERIC, SORT_STRING, SORT_LOCALE_STRING, SORT_NATURAL and SORT_FLAG_CASE (ESC-14.2-1)",
  () => {
    assertProbed("shift", "pop", "unshift", "splice", "refs.errors", "sorts", "sorts.enum", "sorts.nan", "sorts.nul", "sort_flags");

    // Xaravel-only: a by-reference argument must be a Ref (DIV-9.2).
    for (const [name, fn] of [
      ["array_shift", () => array_shift([1] as unknown as Ref<unknown>)],
      ["array_pop", () => array_pop([1] as unknown as Ref<unknown>)],
      ["array_unshift", () => array_unshift([1] as unknown as Ref<unknown>, 0)],
      ["array_splice", () => array_splice([1] as unknown as Ref<unknown>, 0)],
      ["asort", () => asort([1] as unknown as Ref<unknown>)],
      ["arsort", () => arsort([1] as unknown as Ref<unknown>)],
    ] as const) {
      assertJsTypeError(`${name}(): Argument #1 ($array) is by reference; pass a Ref holding the array (DIV-9.2)`, fn);
    }
    // Xaravel-only: the new array is written back; the old JS value, which another holder may share, is unchanged.
    const list = [1, 2, 3];
    const ref = new Ref<unknown>(list);
    Assert.assertSame(1, array_shift(ref));
    Assert.assertSame("[1,2,3]", json(list));
    Assert.assertNotSame(list, ref.value);
    const map = phpArray([5, "a"], [9, "b"]);
    const sortRef = new Ref<unknown>(map);
    arsort(sortRef);
    Assert.assertSame('{"5":"a","9":"b"}', json(map));
    Assert.assertTrue(sortRef.value instanceof PhpArray, "keys 9, 5 are no list");
    // A PhpArray input whose kept next free index is the one the result's keys give goes out in the AD-9 form.
    const listPop = new Ref<unknown>(phpArray([0, "a"], [1, "b"], [2, "c"]));
    array_pop(listPop);
    Assert.assertTrue(Array.isArray(listPop.value), "a list after array_pop is an Array");
    const listSort = new Ref<unknown>(phpArray([1, "b"], [0, "a"]));
    asort(listSort);
    Assert.assertSame('["a","b"]', json(listSort.value));
    Assert.assertTrue(Array.isArray(listSort.value), "a list after asort is an Array");
    const mapSort = new Ref<unknown>(phpArray(["x", 2], ["y", 1]));
    asort(mapSort);
    Assert.assertSame(Object.prototype, Object.getPrototypeOf(mapSort.value), "all string keys after asort are a plain object");
    // One whose kept index differs stays a PhpArray: [0, 1, 7] popped keeps 8, not 2; unset 9 then sorted keeps 10.
    const keptSort = phpArray([5, 3], [1, 1], [9, 2]);
    keptSort.delete(9);
    const keptRef = new Ref<unknown>(keptSort);
    asort(keptRef);
    Assert.assertTrue(keptRef.value instanceof PhpArray);
    Assert.assertSame(10, (keptRef.value as PhpArray).push("d"));
    // Xaravel-only: a string comparison of a string holding a lone surrogate, which has no UTF-8 form.
    assertJsTypeError("asort(): the string holds a lone surrogate, which has no UTF-8 form", () => asort(new Ref<unknown>(["\ud800", "\ud801"]), SORT_STRING));
    assertJsTypeError("arsort(): the string holds a lone surrogate, which has no UTF-8 form", () => arsort(new Ref<unknown>(["a", "\udc00"]), SORT_NATURAL));
    assertJsTypeError("asort(): the string holds a lone surrogate, which has no UTF-8 form", () => asort(new Ref<unknown>(["a", "\udc00"]), SORT_LOCALE_STRING));
    // An empty array is left as it is.
    const empty: unknown[] = [];
    const emptyRef = new Ref<unknown>(empty);
    Assert.assertNull(array_pop(emptyRef));
    Assert.assertSame(empty, emptyRef.value);
    // A PhpArray stays one after array_pop, so the next append lands where PHP's does.
    const popRef = new Ref<unknown>(phpArray([0, "a"], [1, "b"], [7, "c"]));
    array_pop(popRef);
    Assert.assertTrue(popRef.value instanceof PhpArray);
    Assert.assertSame(7, (popRef.value as PhpArray).push("d"));
  },
);

xaravelTest(
  "XT-runtime-71",
  "min and max give PHP 8.5's results for an array, two arguments (the direct-call form) and more, with PHP's ArgumentCountError, TypeError and ValueError; str_contains, strlen (UTF-8 bytes) and lcfirst (ASCII) give PHP's values; property_exists and method_exists read objects, classes, class-strings and contract tokens as PHP's do; identical is PHP's ===, and is_numeric and is_float are isNumeric and isFloat (ESC-14.2-1)",
  () => {
    assertProbed("min_max", "min_max.nan", "min_max.errors", "strings", "strings.errors", "property_exists", "property_table", "method_exists", "object.errors", "identical", "is_numeric_float");
    Assert.assertSame(isNumeric, is_numeric);
    Assert.assertSame(isFloat, is_float);

    // Xaravel-only: a class constructor and a contract token are class-strings (AD-9).
    Assert.assertTrue(method_exists(Kid, "fooBar"));
    Assert.assertTrue(method_exists(Kid, "PARENTMETHOD"));
    Assert.assertTrue(method_exists(Iterator, "current"));
    Assert.assertTrue(method_exists(IteratorAggregate, "getiterator"));
    Assert.assertFalse(method_exists(Traversable, "current"));
    Assert.assertTrue(property_exists(Kid, "stat"));
    Assert.assertFalse(property_exists(Iterator, "current"));
    Assert.assertFalse(property_exists(Kid, "name"), "a class's own name is no PHP property");
    Assert.assertTrue(property_exists(Declared, "declared"), "the property table, for a class constructor");
    Assert.assertFalse(Object.hasOwn(new Declared(), "declared"));
    Assert.assertFalse(method_exists(Text, "constructor"));
    Assert.assertTrue(method_exists(Text, "__toString"));
    Assert.assertFalse(method_exists(NoText, "__TOSTRING"));
    // Xaravel-only: a string JS cannot hold.
    assertJsTypeError("lone surrogate", () => strlen("\ud800"));
    assertJsTypeError("lone surrogate", () => str_contains("a", "\udc00"));
    // Xaravel-only: `undefined` reads as null.
    Assert.assertSame(0, strlen(undefined));
    Assert.assertNull(min(undefined, 1));
    Assert.assertSame("TypeError: min(): Argument #1 ($value) must be of type array, null given", attempt(() => min(undefined)));
  },
);

xaravelTest(
  "XT-runtime-72",
  "Random\\Randomizer::pickArrayKeys returns num distinct keys in the array's order, each subset possible, with PHP's ValueError and TypeError messages, and refuses an engine; SortDirection is a registered AD-26 pure enum with the cases Ascending and Descending, a UnitEnum and no BackedEnum (ESC-14.2-1)",
  () => {
    assertProbed("randomizer", "randomizer.errors", "sort_direction");

    // Xaravel-only: random draws. Every pair of three keys turns up, always in the array's order.
    const randomizer = new Randomizer();
    const pairs = new Set<string>();
    const singles = new Set<unknown>();
    for (let draw = 0; draw < 300; draw++) {
      const keys = randomizer.pickArrayKeys({ a: 1, b: 2, c: 3 }, 2);
      Assert.assertSame(2, keys.length);
      Assert.assertTrue(keys[0]! < keys[1]!, `in the array's order: ${json(keys)}`);
      pairs.add(keys.join(""));
      singles.add(randomizer.pickArrayKeys(phpArray([5, "x"], ["k", "y"], [7, "z"]), 1)[0]);
    }
    Assert.assertSame("ab,ac,bc", [...pairs].sort().join(","));
    Assert.assertSame(3, singles.size);
    assertJsTypeError("($engine) is not ported", () => new Randomizer({}));
    Assert.assertSame(Randomizer, resolveClass("Random\\Randomizer"));

    // Xaravel-only: the AD-26 shape.
    Assert.assertSame(SortDirection, resolveClass("SortDirection"));
    Assert.assertTrue(Object.isFrozen(SortDirection.Ascending));
    Assert.assertSame(SortDirection.Ascending, SortDirection.cases()[0]);
    Assert.assertTrue(SortDirection.Descending instanceof SortDirection);
    Assert.assertNull((SortDirection as unknown as { backingType?: unknown }).backingType ?? null);
  },
);

xaravelTest(
  "XT-runtime-73",
  "every PHP 8.5.11 value recorded in php-array-functions.probe.txt (from php-array-functions.probe.php: the array functions, the by-reference functions and sorts, min, max, the string and object functions, identical, Randomizer and SortDirection, with the exception class and message of each recorded case) is what the runtime gives for the same case, and a fresh process exports every new name from the root and @xaravel/runtime/php as the same object and resolves Random\\Randomizer and SortDirection (ESC-14.2-1)",
  () => {
    const record = readFileSync(resolve(import.meta.dir, "php-array-functions.probe.txt"), "utf8");
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
      `const r = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/index.ts"))}); const p = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/php/index.ts"))}); const { resolveClass } = await import("@xaravel/runtime/registry"); const names = ${JSON.stringify(NEW_EXPORTS)}; console.log(names.filter((n) => p[n] === undefined || r[n] !== p[n]).join(",") || "all", resolveClass("Random\\\\Randomizer") === p.Randomizer && resolveClass("SortDirection") === p.SortDirection, p.is_numeric === p.isNumeric && p.is_float === p.isFloat && r.is_numeric === r.isNumeric && r.is_float === r.isFloat, Object.keys(globalThis[Symbol.for("xaravel.php.classes")]).length);`,
    );
    Assert.assertSame(0, run.code, run.err);
    Assert.assertSame("all true true 24", run.out);
  },
  60_000,
);
