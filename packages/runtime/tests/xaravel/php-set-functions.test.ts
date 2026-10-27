// Xaravel Tests for action item epic-14-item-9-runtime-set-functions-callable-names (decisions/ESC-14.4-1.md, option 1,
// approved under decisions/MAINT-2026-10-26-runtime-builtins.md; decisions/ESC-14.4-2.md, option 1, which amends
// DIV-9.13 and DIV-9.14). XT-runtime-83: the set functions, `array_merge_recursive`, `array_replace`,
// `array_replace_recursive`, `array_pad`, `is_int` and `arrayUnion`. XT-runtime-84: the PHP function-name resolver,
// through `callbackParameter` and `is_callable`, and its registry against PHP's reflection and the package root.
// XT-runtime-85: every probe label recomputed, and the fresh-process export check. None needs an Oracle fixture: each
// expected value, message and callback call log is what PHP 8.5.11 gives for the same call, probed with the host's
// `php`: `php-set-functions.probe.php` prints each PHP-derived value as `<label>\t<json>` (`JSON_PRESERVE_ZERO_FRACTION`),
// `php-set-functions.probe.txt` is its output under PHP 8.5.11 (`php -d error_reporting=0 php-set-functions.probe.php >
// php-set-functions.probe.txt`), and XT-runtime-85 computes every recorded label with the runtime and compares it with
// PHP's value. Not recorded: the assertions marked `Xaravel-only`, which have no PHP counterpart (`undefined`, a `Ref`,
// a `PhpArray` input, a JS cycle, the runtime's message for a callable it does not port, a contract token, and the
// registry's own shape).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  arrayEntries,
  array_diff,
  array_diff_assoc,
  array_diff_key,
  array_diff_uassoc,
  array_diff_ukey,
  array_filter,
  array_intersect,
  array_intersect_uassoc,
  array_map,
  array_merge_recursive,
  array_pad,
  array_replace,
  array_replace_recursive,
  array_udiff,
  array_uintersect,
  arrayUnion,
  ArrayObject,
  count,
  Error as PhpError,
  float,
  is_callable,
  is_int,
  JSON_PRESERVE_ZERO_FRACTION,
  jsonEncode,
  PhpArray,
  phpFunction,
  type PhpKeyInput,
  Ref,
  reset,
  RuntimeException,
  spaceship,
  stdClass,
  strcasecmp,
  strcmp,
  Stringable,
  uasort,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass } from "@xaravel/runtime/registry";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpSetFunctions";

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = [
  "array_diff",
  "array_diff_assoc",
  "array_diff_key",
  "array_diff_uassoc",
  "array_diff_ukey",
  "array_intersect",
  "array_intersect_uassoc",
  "array_merge_recursive",
  "array_pad",
  "array_replace",
  "array_replace_recursive",
  "array_udiff",
  "array_uintersect",
  "arrayUnion",
  "is_int",
  "phpFunction",
] as const;

type Fn = (...args: unknown[]) => unknown;

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
  try {
    return fn();
  } catch (error) {
    const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
    return `${fqcn(klass)}: ${(error as globalThis.Error).message}`;
  }
}

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = jsonEncode(value, JSON_PRESERVE_ZERO_FRACTION);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** A PHP array literal with keys in the order given (a JS object puts integer-like keys first). */
function arr(...entries: [PhpKeyInput, unknown][]): PhpArray {
  return new PhpArray(entries);
}

/** Runs `code` as a module in a fresh `bun` process from the package directory. */
function child(code: string): { code: number; out: string; err: string } {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...inherited } = process.env;
  const run = Bun.spawnSync([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, stdout: "pipe", stderr: "pipe", env: inherited });
  return { code: run.exitCode, out: run.stdout.toString().trim(), err: run.stderr.toString() };
}

/** The probe's `Text`, whose `__toString` port gives its text. */
class Text {
  readonly #text: string;

  constructor(text: string = "text") {
    this.#text = text;
  }

  toString(): string {
    return this.#text;
  }
}

/** The probe's `Plain`, which has no `__toString`. */
class Plain {}

registerClass(`${NS}\\Text`, Text);
registerClass(`${NS}\\Plain`, Plain);

/** `fn(...args, callback)` for a callback that logs each call and returns `result(a, b)`; the probe's `logged`. */
function logged(fn: Fn, args: unknown[], result: (a: unknown, b: unknown) => unknown): unknown[] {
  const log: unknown[] = [];
  const callback = (a: unknown, b: unknown): unknown => {
    log.push([a, b]);
    return result(a, b);
  };
  const value = attempt(() => fn(...args, callback));
  return [value, log];
}

/** The probe's comparators, by name. */
const COMPARATORS: readonly [string, (a: unknown, b: unknown) => unknown][] = [
  ["spaceship", (a, b) => spaceship(a, b)],
  ["greater", (a, b) => spaceship(a, b) > 0],
  ["one", () => 1],
  ["zero", () => 0],
  ["minus", () => -1],
  ["float", () => 0.5],
  ["string", (a, b) => String(spaceship(a, b))],
  ["null", () => null],
];

const MIXED = (): unknown[] => [1, "1", 2, "a", null, float(1), true];
const OTHER = (): unknown[] => ["1", "", 2.5];
const KEYED = (): PhpArray => arr(["a", "green"], ["b", "brown"], ["c", "blue"], [0, "red"], [5, "x"]);
const KEYED2 = (): PhpArray => arr(["a", "GREEN"], ["B", "brown"], [0, "yellow"], [1, "red"], ["x", "blue"]);
const LARGE = [9, 3, 14, 1, 7, 12, 5, 18, 2, 11, 16, 6, 0, 13, 8, 17, 4, 10, 15];

/** A stdClass with `p = 1`, the probe's `$o`. */
function objectP(): stdClass {
  const o = new stdClass();
  o["p"] = 1;
  return o;
}

/** The probe's `$self` (`['x' => &$self]`) and `$nested` (`['x' => ['x' => &…]]`), as JS cycles. */
function cycles(): { self: Record<string, unknown>; nested: Record<string, unknown> } {
  const self: Record<string, unknown> = {};
  self["x"] = self;
  const inner: Record<string, unknown> = {};
  inner["x"] = inner;
  return { self, nested: { x: inner } };
}

const call = (fn: unknown, ...args: unknown[]): unknown => (fn as Fn)(...args);

/** `$r[] = 'z'` on a copy of the PHP array `value`, as PHP's next free index places it. */
function appendZ(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...(value as unknown[]), "z"];
  }
  const copy = value instanceof PhpArray ? value.copy() : new PhpArray(arrayEntries(value as object));
  copy.push("z");
  return copy;
}

/** The probe's `$unset`: `['a', 'b', 'c']` with key 2 unset, so its next free index is 3. */
function unsetArray(): PhpArray {
  const array = arr([0, "a"], [1, "b"], [2, "c"]);
  array.delete(2);
  return array;
}

/** The value under `key` of the PHP array `array`. */
function at(array: unknown, key: string): unknown {
  return array instanceof PhpArray ? array.get(key) : (array as Record<string, unknown>)[key];
}

/** Every function the package root exports (a class excluded), by name, in the probe's order. */
function rootFunctions(): string[] {
  return Object.entries(root)
    .filter(([, value]) => typeof value === "function" && !/^class\b/.test(Function.prototype.toString.call(value)))
    .map(([name]) => name)
    .sort();
}

/** The registry entries in name order. */
function registry(): (typeof PHP_FUNCTIONS)[string][] {
  return Object.values(PHP_FUNCTIONS).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Each probe label's runtime computation, as `php-set-functions.probe.php` computes it with PHP. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  diff: () => [
    array_diff(MIXED(), OTHER()),
    array_diff(KEYED(), KEYED2()),
    array_diff([1, 2, 3, 4, 5], [2], [4, 5]),
    array_diff([], [1]),
    array_diff([1, 2]),
    array_diff([1, 2], []),
    array_diff({ x: 1 }, ["1"]),
    array_diff({ x: 1 }, ["2"]),
    array_diff([1, 1, 2, 1], [1]),
    array_diff(["é", "e", "😀"], ["e"]),
  ],
  intersect: () => [
    array_intersect(MIXED(), OTHER()),
    array_intersect(KEYED(), KEYED2()),
    array_intersect([1, 2, 3, 4, 5, 2], [2, 4, 5], [5, 2]),
    array_intersect([], [1]),
    array_intersect([1, 2]),
    array_intersect([1, 2], []),
    array_intersect({ b: "x", a: "x", c: "y" }, ["x"]),
    array_intersect(["é", "e", "😀", "z"], ["😀", "e"]),
    array_intersect([3, 1, 2, 10, "10", 1.5], ["1.5", 10, 3]),
  ],
  "diff.strings": () => [
    array_diff([[], [1], "Array", new Text(), "text"], ["Array"]),
    array_diff([[], new Text("b"), "a"], [new Text("a")]),
    array_intersect([[], [1], "Array", new Text(), "text"], ["Array", "text"]),
    array_diff_assoc([[], new Text()], ["Array", "text"]),
    attempt(() => array_diff([new Plain()], [1])),
    attempt(() => array_diff([1, 2], [new Plain()])),
    attempt(() => array_intersect([new Plain(), 1], [1])),
    attempt(() => array_diff_assoc([new Plain()], [1])),
    array_diff_assoc([new Plain()], { a: 1 }),
  ],
  diff_key: () => [
    array_diff_key(arr(["1", "a"], ["b", 2], [3, "c"]), arr([1, "x"])),
    array_diff_key(arr(["a", 1], ["b", 2], ["c", 3], [0, 4]), { a: 0 }, arr(["c", 0], ["0", 0])),
    array_diff_key([10, 20, 30], arr([1, null])),
    array_diff_key(arr(["01", 1], ["1", 2], ["-0", 3], ["0", 4]), arr([1, 0], [0, 0])),
    array_diff_key([]),
    array_diff_key([1, 2]),
  ],
  diff_assoc: () => [
    array_diff_assoc({ a: 1, b: "1" }, { a: "1" }),
    array_diff_assoc(KEYED(), KEYED2()),
    array_diff_assoc([0, 1, 2], ["0", "1", 3]),
    array_diff_assoc({ a: float(1), b: true, c: null }, { a: "1", b: "1", c: "" }),
    array_diff_assoc({ a: 1, b: 2, c: 3 }, { a: 1 }, { b: 2 }),
    array_diff_assoc([1]),
  ],
  "diff.errors": () => [
    attempt(() => array_diff(5)),
    attempt(() => array_diff([1], 5)),
    attempt(() => array_diff([1, 2], [1], "x")),
    attempt(() => array_diff([], [1], null)),
    attempt(() => array_diff([1], [], null)),
    attempt(() => array_diff_key(5)),
    attempt(() => array_diff_key([1], [1], 1.5)),
    attempt(() => array_diff_assoc(null)),
    attempt(() => array_diff_assoc([1], true)),
    attempt(() => array_intersect("a")),
    attempt(() => array_intersect([1], [1], new stdClass())),
  ],
  "callback.strcasecmp": () => [
    array_udiff(arr(["a", "Apple"], ["b", "banana"], ["c", "Cherry"], [0, "date"]), ["APPLE", "DATE"], "strcasecmp"),
    array_uintersect(arr(["a", "Apple"], ["b", "banana"], ["c", "Cherry"], [0, "date"]), ["APPLE", "DATE"], "strcasecmp"),
    array_diff_ukey({ a: 1, B: 2, c: 3 }, { A: 0, b: 0 }, "strcasecmp"),
    array_diff_uassoc({ a: "x", B: "y", c: "z" }, { A: "x", b: "Y" }, "strcasecmp"),
    array_intersect_uassoc({ a: "x", B: "y", c: "z" }, { A: "x", b: "Y" }, "strcasecmp"),
    array_udiff({ first: "Taylor", last: "Otwell" }, { first: "taylor", last: "otwell" }, "strcasecmp"),
    array_udiff({ a: "x" }, ["A"], ["B"], "STRCASECMP"),
    array_uintersect(["a", "B", "c"], ["b", "A"], ["a", "b"], "\\strcasecmp"),
  ],
  "callback.closure": () => {
    const minus = (a: unknown, b: unknown): number => (a as number) - (b as number);
    return [
      array_udiff([1, 5, 3, 9], [3, 4], minus),
      array_uintersect({ x: 1, y: 5, z: 3 }, [3, 4, 5], minus),
      array_diff_ukey(arr([1, "a"], [2, "b"], [3, "c"]), arr([2, "z"]), minus),
      array_diff_uassoc(arr([1, "a"], [2, "b"], [3, "c"]), arr([2, "b"], [3, "x"]), minus),
      array_intersect_uassoc(arr([1, "a"], [2, "b"], [3, "c"]), arr([2, "b"], [3, "x"]), minus),
      array_udiff([1, 2], [], minus),
      array_udiff([], [1], minus),
      array_udiff([2, 1], minus),
      array_uintersect([2, 1], minus),
      array_diff_uassoc({ b: 1, a: 2 }, (a: unknown, b: unknown) => strcmp(a, b)),
    ];
  },
  "callback.logs": () => {
    const logs = new PhpArray<PhpKeyInput, unknown>();
    for (const [name, result] of COMPARATORS) {
      logs.set(name, [
        logged(array_udiff, [[3, 1, 2, 5, 4], [2, 5], [4, 9]], result),
        logged(array_uintersect, [[3, 1, 2, 5, 4], [2, 5, 3], [4, 3, 2]], result),
        logged(array_diff_ukey, [{ c: 1, a: 2, b: 3, d: 4 }, { b: 0, x: 0 }, { d: 0 }], result),
        logged(array_diff_uassoc, [{ c: 1, a: 2, b: 3, d: 4 }, { b: 3, a: 9 }, { d: "4" }], result),
        logged(array_intersect_uassoc, [{ c: 1, a: 2, b: 3, d: 4 }, { b: 3, a: 2, d: 4 }, { d: 4, b: "3" }], result),
      ]);
    }
    return logs;
  },
  "callback.logs.large": () => [
    logged(array_udiff, [LARGE, [3, 7, 11, 15], [0, 18]], (a, b) => spaceship(a, b)),
    logged(array_uintersect, [LARGE, [3, 7, 11, 15, 18, 0, 9]], (a, b) => spaceship(a, b)),
  ],
  "callback.throws": () => [
    logged(array_udiff, [[3, 1, 2], [2]], (a, b) => {
      if (a === 2 || b === 2) {
        throw new RuntimeException("stop");
      }
      return spaceship(a, b);
    }),
    logged(array_diff_ukey, [{ b: 1, a: 2 }, { a: 0 }], () => {
      throw new RuntimeException("stop");
    }),
  ],
  "callback.errors": () => [
    attempt(() => call(array_udiff, [1])),
    attempt(() => call(array_udiff, [1], 5)),
    attempt(() => array_udiff([1], [1], null)),
    attempt(() => array_udiff(5, [1], "strcasecmp")),
    attempt(() => array_udiff([1], 5, "strcasecmp")),
    attempt(() => call(array_uintersect, [1])),
    attempt(() => array_uintersect([1], [1], 1)),
    attempt(() => array_uintersect([1], null, "strcasecmp")),
    attempt(() => call(array_diff_ukey, { a: 1 })),
    attempt(() => array_diff_ukey({ a: 1 }, [], true)),
    attempt(() => array_diff_ukey({ a: 1 }, "x", "strcasecmp")),
    attempt(() => call(array_diff_uassoc, [1])),
    attempt(() => array_diff_uassoc(null, [], "strcasecmp")),
    attempt(() => call(array_intersect_uassoc, [1])),
    attempt(() => array_intersect_uassoc([1], [1], 2.5)),
    attempt(() => array_intersect_uassoc([1], [1], 2, "strcasecmp")),
    attempt(() => array_udiff(["x"], [new Plain()], (a: unknown, b: unknown) => strcmp(a, b))),
  ],
  merge_recursive: () => [
    array_merge_recursive(arr(["a", 1], ["b", arr(["c", 1], [5, 2])]), arr(["a", 2], ["b", arr(["c", [3]], [5, 4])]), arr(["a", null], [3, "x"])),
    array_merge_recursive(),
    array_merge_recursive(arr([5, "a"], ["k", "v"], [9, "b"])),
    array_merge_recursive(arr([5, "a"]), arr([5, "b"])),
    array_merge_recursive({ a: null }, { a: null }),
    array_merge_recursive({ a: [1] }, { a: "x" }),
    array_merge_recursive({ a: "x" }, { a: arr([0, 1], ["k", 2]) }),
    array_merge_recursive({ a: { k: 1 } }, { a: { k: 2 } }, { a: { k: [3] } }),
    array_merge_recursive({ a: objectP() }, { a: 2 }),
    array_merge_recursive({ a: 1 }, { a: objectP() }),
    array_merge_recursive({ a: [1] }, { a: new ArrayObject({ q: 2 }) }),
    array_merge_recursive(arr(["1", "x"], ["a", "y"]), arr(["1", "z"])),
    array_merge_recursive([], []),
    array_merge_recursive({ a: [] }, { a: [] }),
  ],
  replace: () => [
    array_replace(arr([5, "a"], ["k", "v"], [9, "b"]), arr([9, "B"], [0, "z"]), { k: "V", n: "new" }),
    array_replace([1, 2]),
    array_replace({ a: [1, 2] }, { a: [9] }),
    array_replace([], arr([3, "x"])),
    array_replace(arr(["1", "a"]), arr([1, "b"])),
  ],
  replace_recursive: () => [
    array_replace_recursive({ a: arr([0, 1], [1, 2], ["k", { x: 1 }]), b: 1 }, { a: arr([0, 9], ["k", { y: 2 }]), b: [1] }),
    array_replace_recursive([1, 2]),
    array_replace_recursive({ a: "x" }, { a: ["y"] }),
    array_replace_recursive({ a: ["y"] }, { a: "x" }),
    array_replace_recursive(arr([5, [1, 2]]), arr([5, arr([1, "b"])]), arr([5, arr([2, "c"])])),
    array_replace_recursive({ a: objectP() }, { a: { q: 1 } }),
    array_replace_recursive({ a: { q: 1 } }, { a: objectP() }),
  ],
  "merge.recursion": () => {
    const { self, nested } = cycles();
    return [
      attempt(() => count(array_merge_recursive(self, self))),
      attempt(() => count(array_merge_recursive({ x: { y: 1 } }, self))),
      attempt(() => count(array_merge_recursive(self, { x: { y: 1 } }))),
      attempt(() => count(array_merge_recursive({ x: { x: [] } }, nested))),
      attempt(() => count(array_replace_recursive(self, self))),
      attempt(() => count(array_replace_recursive({ x: { y: 1 } }, self))),
      attempt(() => count(array_replace_recursive(self, { x: { y: 1 } }))),
      attempt(() => count(array_replace_recursive({ x: { x: [] } }, nested))),
    ];
  },
  "merge.errors": () => [
    attempt(() => array_merge_recursive(5)),
    attempt(() => array_merge_recursive([1], 5)),
    attempt(() => call(array_replace)),
    attempt(() => array_replace(5)),
    attempt(() => array_replace([1], "x")),
    attempt(() => call(array_replace_recursive)),
    attempt(() => array_replace_recursive(null)),
    attempt(() => array_replace_recursive([1], [2], 3)),
  ],
  next_free: () =>
    [
      array_intersect(["a", "b"], ["a"]),
      array_intersect(unsetArray(), ["a", "b"]),
      array_uintersect(["a", "b"], ["a"], "strcmp"),
      array_udiff(["a", "b"], ["b"], "strcmp"),
      array_diff_ukey(arr([5, "a"], [9, "b"]), arr([9, 0]), (a: unknown, b: unknown) => spaceship(a, b)),
      array_diff_uassoc(arr([5, "a"], [9, "b"]), arr([9, "b"]), (a: unknown, b: unknown) => spaceship(a, b)),
      array_intersect_uassoc(arr([5, "a"], [9, "b"]), arr([5, "a"]), (a: unknown, b: unknown) => spaceship(a, b)),
      array_diff(unsetArray()),
      array_diff(unsetArray(), []),
      array_diff(arr([3, "a"]), ["b"]),
      array_diff(["a", "b"], ["b"]),
      array_diff_key(["a", "b"], arr([1, 0])),
      array_diff_assoc(["a", "b"], arr([1, "b"])),
      array_replace(["a", "b"], arr([5, "c"])),
      array_replace(unsetArray(), ["x"]),
      array_replace_recursive(unsetArray(), ["x"]),
      array_pad(unsetArray(), 2, 0),
      array_pad(unsetArray(), 3, 0),
      arrayUnion(unsetArray(), ["x"]),
      arrayUnion(["a", "b"], arr([5, "c"])),
      at(array_merge_recursive({ k: unsetArray() }, { k: ["d"] }), "k"),
      at(array_replace_recursive({ k: unsetArray() }, { k: ["x"] }), "k"),
    ].map(appendZ),
  array_pad: () => [
    array_pad([1, 2], 5, 0),
    array_pad([1, 2], -5, 0),
    array_pad([1, 2], 1, 0),
    array_pad([1, 2], 2, 0),
    array_pad([1, 2], -2, 0),
    array_pad([1, 2], 0, 0),
    array_pad(arr(["a", 1], [5, 2]), 4, "x"),
    array_pad(arr(["a", 1], [5, 2]), -4, "x"),
    array_pad([], 3, null),
    array_pad(arr([3, "a"], [7, "b"]), 3, [1]),
    array_pad([1], "3", 0),
    array_pad([1], float(2), 0),
    array_pad([1], true, 0),
    array_pad([1], null, 0),
  ],
  "array_pad.errors": () => [
    attempt(() => array_pad([1], 2 ** 30 + 1, 0)),
    attempt(() => array_pad([1], -(2 ** 30) - 1, 0)),
    attempt(() => array_pad(5, 2, 0)),
    attempt(() => array_pad([1], "x", 0)),
    attempt(() => array_pad([1], 1.5, 0)),
    attempt(() => array_pad([1], [], 0)),
  ],
  // PHP's `-0` is the int 0.
  is_int: () => [is_int(1), is_int(float(1)), is_int(9223372036854775807n), is_int(0), is_int("1"), is_int(true), is_int(null), is_int([]), is_int(1.5), is_int(new stdClass())],
  union: () => [
    arrayUnion([1, 2], [3, 4, 5]),
    arrayUnion({ a: 1, b: 2 }, arr(["b", 3], ["c", 4], [0, 5])),
    arrayUnion(arr(["1", "x"]), arr([1, "y"], [2, "z"])),
    arrayUnion([], { a: 1 }),
    arrayUnion({ a: 1 }, []),
    arrayUnion(arr([5, "a"]), arr([0, "b"])),
  ],
  "union.errors": () => [
    attempt(() => arrayUnion([1], 1)),
    attempt(() => arrayUnion(1, [1])),
    attempt(() => arrayUnion([1], null)),
    attempt(() => arrayUnion(null, [1])),
    attempt(() => arrayUnion([1], "a")),
    attempt(() => arrayUnion([1], 1.5)),
    attempt(() => arrayUnion([1], true)),
    attempt(() => arrayUnion([1], new stdClass())),
  ],
  "resolver.calls": () => [
    array_map("strtoupper", ["a", "b"]),
    array_map("STRTOUPPER", ["a"]),
    array_map("\\strtoupper", ["a"]),
    array_map("strcasecmp", ["a", "B"], ["A", "c"]),
    array_filter(["a", "", "b", null], "strlen"),
    array_filter([1, "x", 2.5, "3"], "is_numeric"),
    array_map("reset", [[1, 2], [3]]),
    array_map("end", [[1, 2], [3]]),
    array_map("max", [1, 5], [4, 2]),
    array_map("count", [[1, 2], []]),
    array_map("array_pad", [[1]], [3], [0]),
    array_map("array_keys", [{ a: 1 }]),
    array_map("is_callable", ["strlen", "nope", "\\strlen"]),
    (() => {
      const sortable = new Ref<unknown>({ b: "B", a: "a", c: "C", d: "A" });
      uasort(sortable, "strcasecmp");
      return sortable.value;
    })(),
  ],
  "resolver.arity": () => [
    attempt(() => array_map("strtoupper", ["a"], ["b"])),
    attempt(() => array_map("strcasecmp", ["a"])),
    attempt(() => array_map("StrCaseCmp", ["a"], ["b"], ["c"])),
    attempt(() => array_map("array_keys", ["a"], ["b"], ["c"], ["d"])),
    attempt(() => array_filter(["a"], "strcasecmp")),
    attempt(() => array_filter(["a"], "is_callable", php.ARRAY_FILTER_USE_BOTH)),
    attempt(() => php.array_any([1, "a"], "is_string")),
    attempt(() => php.array_all([1, 2], "is_int")),
    attempt(() => php.array_find_key({ a: 1 }, "is_string")),
  ],
  "resolver.is_callable": () =>
    ["strcasecmp", "STRCASECMP", "\\strcasecmp", "\\\\strcasecmp", "StrToUpper", "is_int", "array_udiff", "reset", "nope", " strlen", "strlen ", "", "\\"].map((value) => {
      const name = new Ref<unknown>(null);
      const plain = is_callable(value, false, name);
      return [plain, is_callable(value, true), name.value];
    }),
  "resolver.reflection": () => registry().map((fn) => [fn.name, fn.required, fn.total, fn.variadic, [...fn.byRef]]),
  "resolver.counts": () =>
    registry().map((fn) => [fn.required > 0 ? attempt(() => fn.call()) : null, fn.variadic ? null : attempt(() => fn.call(...Array.from({ length: fn.total + 1 }, () => null)))]),
  "resolver.exports": () => new PhpArray(rootFunctions().map((name) => [name, phpFunction(name) !== null] as const)),
};

/** The recorded probe values, by label. */
function recorded(): Map<string, string> {
  const record = new Map<string, string>();
  for (const line of readFileSync(resolve(import.meta.dir, "php-set-functions.probe.txt"), "utf8").split("\n")) {
    if (line !== "") {
      const tab = line.indexOf("\t");
      record.set(line.slice(0, tab), line.slice(tab + 1));
    }
  }
  return record;
}

/** Each of `labels` is what PHP 8.5.11 recorded for it. */
function assertProbeLabels(labels: readonly string[]): void {
  const record = recorded();
  for (const label of labels) {
    Assert.assertSame(record.get(label) ?? null, json(PROBE_CASES[label]!()), label);
  }
}

xaravelTest(
  "XT-runtime-83",
  "array_diff, array_diff_assoc, array_diff_key and array_intersect compare values as PHP strings and keys as PHP's normalised keys, keys kept; the callback forms array_udiff, array_diff_uassoc, array_diff_ukey, array_uintersect and array_intersect_uassoc call a function, an invokable or a PHP function name in PHP's order (zend_sort and PHP's walk) with PHP's results for consistent and inconsistent comparators; array_merge_recursive, array_replace and array_replace_recursive merge and replace as PHP does, Recursion detected included; array_pad pads left or right with PHP's ValueError past 2^30; is_int is true for ints only; arrayUnion is PHP's array +; each with PHP 8.5.11's TypeError, ArgumentCountError and Error messages (ESC-14.4-1)",
  () => {
    assertProbeLabels([
      "diff",
      "intersect",
      "diff.strings",
      "diff_key",
      "diff_assoc",
      "diff.errors",
      "callback.strcasecmp",
      "callback.closure",
      "callback.logs",
      "callback.logs.large",
      "callback.throws",
      "callback.errors",
      "merge_recursive",
      "replace",
      "replace_recursive",
      "merge.recursion",
      "merge.errors",
      "array_pad",
      "array_pad.errors",
      "is_int",
      "union",
      "union.errors",
      "next_free",
    ]);
    // Where PHP copies the first array, the result keeps its next free index.
    Assert.assertSame('{"0":"a","2":"z"}', json(appendZ(array_intersect(["a", "b"], ["a"]))));
    Assert.assertSame('{"0":"a","1":"b","3":"z"}', json(appendZ(arrayUnion(unsetArray(), ["x"]))));
    Assert.assertSame('["a","z"]', json(appendZ(array_diff(["a", "b"], ["b"]))));
    // Values as strings, keys kept.
    Assert.assertSame('{"2":2,"3":"a"}', json(array_diff(MIXED(), OTHER())));
    Assert.assertSame('{"0":1,"1":"1","4":null,"5":1.0,"6":true}', json(array_intersect(MIXED(), OTHER())));
    Assert.assertSame('{"3":{},"4":"text"}', json(array_diff([[], [1], "Array", new Text(), "text"], ["Array"])));
    Assert.assertSame(`Error: Object of class ${NS}\\Plain could not be converted to string`, attempt(() => array_diff([new Plain()], [1])));
    Assert.assertSame('{"b":2,"3":"c"}', json(array_diff_key(arr(["1", "a"], ["b", 2], [3, "c"]), arr([1, "x"]))));
    Assert.assertSame('{"b":"1"}', json(array_diff_assoc({ a: 1, b: "1" }, { a: "1" })));
    // The callback forms, a PHP function name included.
    Assert.assertSame('{"b":"banana","c":"Cherry"}', json(array_udiff(arr(["a", "Apple"], ["b", "banana"], ["c", "Cherry"], [0, "date"]), ["APPLE", "DATE"], "strcasecmp")));
    Assert.assertSame('{"c":3}', json(array_diff_ukey({ a: 1, B: 2, c: 3 }, { A: 0, b: 0 }, "strcasecmp")));
    Assert.assertSame('{"a":"x"}', json(array_intersect_uassoc({ a: "x", B: "y", c: "z" }, { A: "x", b: "Y" }, "strcasecmp")));
    Assert.assertSame("TypeError: array_udiff(): Argument #3 must be a valid callback, no array or string given", attempt(() => array_udiff([1], [1], null)));
    Assert.assertSame("ArgumentCountError: array_udiff() expects at least 2 arguments, 1 given", attempt(() => call(array_udiff, [1])));
    Assert.assertSame("TypeError: array_udiff(): Argument #1 ($array) must be of type array, int given", attempt(() => array_udiff(5, [1], "strcasecmp")));
    // A logging comparator is called in PHP's order, a false result retried swapped.
    const [result, log] = logged(array_udiff, [[3, 1, 2], [2]], (a, b) => spaceship(a, b) > 0) as [unknown, unknown[]];
    Assert.assertSame('[3,1]', json(result));
    Assert.assertSame("[[3,1],[2,1],[3,2],[1,2],[2,1],[1,2],[2,1],[2,2],[2,2],[2,3],[3,2]]", json(log));
    // Merge and replace.
    Assert.assertSame('{"a":[1,2,null],"b":{"c":[1,3],"5":2,"6":4},"0":"x"}', json(array_merge_recursive(arr(["a", 1], ["b", arr(["c", 1], [5, 2])]), arr(["a", 2], ["b", arr(["c", [3]], [5, 4])]), arr(["a", null], [3, "x"]))));
    Assert.assertSame('{"a":{"0":9,"1":2,"k":{"x":1,"y":2}},"b":[1]}', json(array_replace_recursive({ a: arr([0, 1], [1, 2], ["k", { x: 1 }]), b: 1 }, { a: arr([0, 9], ["k", { y: 2 }]), b: [1] })));
    Assert.assertSame('{"5":"a","k":"V","9":"B","0":"z","n":"new"}', json(array_replace(arr([5, "a"], ["k", "v"], [9, "b"]), arr([9, "B"], [0, "z"]), { k: "V", n: "new" })));
    const { self } = cycles();
    Assert.assertSame("Error: Recursion detected", attempt(() => array_merge_recursive(self, self)));
    Assert.assertSame("Error: Recursion detected", attempt(() => array_replace_recursive(self, self)));
    Assert.assertTrue(thrownBy(() => array_merge_recursive(self, self)) instanceof PhpError);
    // array_pad, is_int, arrayUnion.
    Assert.assertSame('{"0":"x","1":"x","a":1,"2":2}', json(array_pad(arr(["a", 1], [5, 2]), -4, "x")));
    Assert.assertSame("ValueError: array_pad(): Argument #2 ($length) must not exceed the maximum allowed array size", attempt(() => array_pad([1], 2 ** 30 + 1, 0)));
    Assert.assertTrue(is_int(1));
    Assert.assertTrue(is_int(5n));
    Assert.assertFalse(is_int(float(1)));
    Assert.assertFalse(is_int("1"));
    Assert.assertSame("[1,2,5]", json(arrayUnion([1, 2], [3, 4, 5])));
    Assert.assertSame('{"1":"x","2":"z"}', json(arrayUnion(arr(["1", "x"]), arr([1, "y"], [2, "z"]))));
    Assert.assertSame("TypeError: Unsupported operand types: array + bool", attempt(() => arrayUnion([1], true)));

    // Xaravel-only: a list result is a JS array (AD-9), and a PhpArray input reads as its entries.
    Assert.assertTrue(Array.isArray(array_diff([1, 2], [3])));
    Assert.assertSame('{"1":2}', json(array_diff(new PhpArray([[0, 1], [1, 2]]), [1])));
    // Xaravel-only: undefined reads as null.
    Assert.assertSame("[]", json(array_diff([undefined], [""])));
    Assert.assertSame("[null,null]", json(array_pad([], 2, undefined)));
    Assert.assertFalse(is_int(undefined));
    Assert.assertFalse(is_int(2 ** 53));
    Assert.assertFalse(is_int(-0));
    // Xaravel-only: an invokable object is a callback; a callable array or a name the runtime does not export is not ported.
    Assert.assertSame("[1]", json(array_udiff([1, 2], [2], new (class Compare {
      __invoke(a: unknown, b: unknown): unknown {
        return spaceship(a, b);
      }
    })())));
    Assert.assertSame(
      "TypeError: array_udiff(): Argument #3 is a PHP callable string, which Xaravel does not port; pass a function",
      attempt(() => array_udiff([1], [1], "nope")),
    );
    Assert.assertSame(
      "TypeError: array_diff_ukey(): Argument #3 is a PHP callable array, which Xaravel does not port; pass a function",
      attempt(() => array_diff_ukey([1], [1], [new Text(), "toString"])),
    );
    // Xaravel-only: a contract token is its class-string, so no array.
    Assert.assertSame("TypeError: array_diff(): Argument #2 must be of type array, string given", attempt(() => array_diff([1], Stringable)));
    Assert.assertSame("TypeError: Unsupported operand types: array + string", attempt(() => arrayUnion([1], Stringable)));
    // Xaravel-only: a nested array merged into is copied, never changed in place.
    const inner = { k: 1 };
    array_merge_recursive({ a: inner }, { a: { k: 2 } });
    array_replace_recursive({ a: inner }, { a: { k: 2 } });
    Assert.assertSame('{"k":1}', json(inner));
    // Xaravel-only: a contract token under a shared string key is its class-string, wrapped as a scalar.
    const merged = array_merge_recursive({ a: Stringable }, { a: 1 }) as { a: unknown[] };
    Assert.assertSame('{"a":["Stringable",1]}', json(merged));
    Assert.assertSame(Stringable, merged.a[0]);
  },
);

xaravelTest(
  "XT-runtime-84",
  "a PHP callable string naming a global function the runtime exports, in any case and after one leading backslash, resolves through phpFunction to that export, so every runtime function that takes a callback calls it and is_callable is true for it; the resolved callback throws PHP's ArgumentCountError for a wrong argument count and wraps a by-reference argument in a fresh Ref; a name the runtime does not export keeps the TypeError and is_callable false; the registry lists every PHP-named function export of the package root, each the same object as the root export, with ReflectionFunction's counts, variadic flag and by-reference positions (ESC-14.4-2)",
  () => {
    assertProbeLabels(["resolver.calls", "resolver.arity", "resolver.is_callable", "resolver.reflection", "resolver.counts", "resolver.exports"]);
    // Resolution: case-insensitive, one leading backslash, no `::`.
    Assert.assertSame(strcasecmp, PHP_FUNCTIONS["strcasecmp"]!.fn);
    Assert.assertSame(phpFunction("strcasecmp"), phpFunction("STRCASECMP"));
    Assert.assertSame(phpFunction("strcasecmp"), phpFunction("\\strcasecmp"));
    Assert.assertNull(phpFunction("\\\\strcasecmp"));
    Assert.assertNull(phpFunction("nope"));
    Assert.assertSame("[0,-1]", json(array_map("strcasecmp", ["a", "B"], ["A", "c"])));
    Assert.assertSame("ArgumentCountError: strtoupper() expects exactly 1 argument, 2 given", attempt(() => array_map("strtoupper", ["a"], ["b"])));
    Assert.assertSame("ArgumentCountError: strcasecmp() expects exactly 2 arguments, 3 given", attempt(() => array_map("StrCaseCmp", ["a"], ["b"], ["c"])));
    Assert.assertSame("ArgumentCountError: array_keys() expects at most 3 arguments, 4 given", attempt(() => array_map("array_keys", ["a"], ["b"], ["c"], ["d"])));
    Assert.assertSame("ArgumentCountError: array_udiff() expects at least 2 arguments, 0 given", attempt(() => PHP_FUNCTIONS["array_udiff"]!.call()));
    // A by-reference argument gets a fresh Ref.
    Assert.assertSame("[1,3]", json(array_map("reset", [[1, 2], [3]])));
    // is_callable and callable_name.
    const name = new Ref<unknown>(null);
    Assert.assertTrue(is_callable("\\StrLen", false, name));
    Assert.assertSame("\\StrLen", name.value);
    Assert.assertFalse(is_callable("nope"));
    Assert.assertFalse(is_callable("str_rot13"));
    // The registry against the root's exports.
    const exports = new Set(rootFunctions());
    for (const fn of registry()) {
      Assert.assertTrue(exports.has(fn.name), fn.name);
      Assert.assertSame((root as Record<string, unknown>)[fn.name], fn.fn, fn.name);
      Assert.assertSame((php as Record<string, unknown>)[fn.name], fn.fn, fn.name);
    }
    Assert.assertSame(85, registry().length);

    // Xaravel-only: the helpers, classes and constants are never resolved; a non-string is no name.
    for (const helper of ["arrayUnion", "arrayEntries", "phpFunction", "ArrayObject", "SORT_STRING", "Foo::bar", "strlen::x"]) {
      Assert.assertNull(phpFunction(helper), helper);
    }
    Assert.assertNull(phpFunction(5));
    Assert.assertNull(phpFunction(null));
    // Xaravel-only: the registry and its entries are frozen.
    Assert.assertTrue(Object.isFrozen(PHP_FUNCTIONS));
    Assert.assertTrue(Object.isFrozen(PHP_FUNCTIONS["reset"]!));
    Assert.assertTrue(Object.isFrozen(PHP_FUNCTIONS["reset"]!.byRef));
    // Xaravel-only: a Ref argument is passed as it is, and the export's write reaches it.
    const held = new Ref<unknown>([1, 2]);
    Assert.assertSame("[1]", json(array_map("reset", [held])));
    const shifted = new Ref<unknown>([1, 2]);
    Assert.assertSame(1, PHP_FUNCTIONS["array_shift"]!.call(shifted));
    Assert.assertSame("[2]", json(shifted.value));
    // Xaravel-only: an undefined result reads as null (AD-9), and reset gets a fresh Ref for undefined.
    Assert.assertFalse(PHP_FUNCTIONS["reset"]!.call([]) as boolean);
    Assert.assertSame("TypeError: reset(): Argument #1 ($array) must be of type array, null given", attempt(() => PHP_FUNCTIONS["reset"]!.call(undefined)));
    Assert.assertSame(reset, PHP_FUNCTIONS["reset"]!.fn);
    // Xaravel-only: a class constructor whose class-string names an exported function is called as it, as is_callable
    // agrees.
    class StrLen {}
    Assert.assertTrue(is_callable(StrLen));
    Assert.assertSame("[2]", json(array_map(StrLen, ["ab"])));
    // Xaravel-only: a class constructor or a contract token naming no exported function is a class-string only.
    Assert.assertSame(
      "TypeError: array_map(): Argument #1 ($callback) is a PHP callable string, which Xaravel does not port; pass a function",
      attempt(() => array_map(Stringable, ["a"])),
    );
  },
);

xaravelTest(
  "XT-runtime-85",
  "every PHP 8.5.11 value recorded in php-set-functions.probe.txt (from php-set-functions.probe.php: the set functions, their callback call logs, array_merge_recursive, array_replace, array_replace_recursive, array_pad, is_int, array +, the resolver through callbacks and is_callable, the registry's ReflectionFunction counts and ArgumentCountErrors, and function_exists for every root function export, with the exception class and message of each recorded case) is what the runtime gives for the same case, and a fresh process exports every new name from the root and @xaravel/runtime/php as the same object (ESC-14.4-1, ESC-14.4-2)",
  () => {
    const record = recorded();
    for (const [label, value] of record) {
      const compute = PROBE_CASES[label];
      Assert.assertNotNull(compute ?? null, `no runtime case for probe label ${label}`);
      Assert.assertSame(value, json((compute as () => unknown)()), label);
    }
    Assert.assertSame(Object.keys(PROBE_CASES).sort().join(","), [...record.keys()].sort().join(","));

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
    // The registry resolves in a fresh process that loads only @xaravel/runtime/php.
    const resolved = child(`const p = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/php/index.ts"))}); console.log(JSON.stringify(p.array_map("strtoupper", ["a"])));`);
    Assert.assertSame(0, resolved.code, resolved.err);
    Assert.assertSame('["A"]', resolved.out);
  },
  60_000,
);
