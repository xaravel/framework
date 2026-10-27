// Xaravel Tests for action item epic-14-item-3-runtime-type-tests-functions, the runtime half of ESC-14.1-9 and
// ESC-14.1-10 (decisions/MAINT-2026-10-26-story-14-1-third.md, option 1 each). XT-runtime-62: the type tests and the
// `Closure`, `UnitEnum`, `BackedEnum`, `ArrayAccess` and `Generator` `instanceof` targets. XT-runtime-63: `is_a` and
// `is_callable`. XT-runtime-64: `sprintf`, `implode` and `explode`. XT-runtime-65: the array functions, `count`,
// `abs` and the `get_debug_type` / `json_last_error` names. XT-runtime-66: `ReflectionMethod::invoke`, `invokeArgs`
// and `setAccessible`. XT-runtime-67: every probe label recomputed, and the fresh-process export check. None needs an
// Oracle fixture: each expected value and message is what PHP 8.5.11 gives for the same construct, probed with the
// host's `php`: `php-type-tests.probe.php` prints each PHP-derived value as `<label>\t<json>`
// (`JSON_PRESERVE_ZERO_FRACTION`), `php-type-tests.probe.txt` is its output under PHP 8.5.11
// (`php -d error_reporting=0 php-type-tests.probe.php > php-type-tests.probe.txt`), and XT-runtime-67 computes every
// recorded label with the runtime and compares it with PHP's value. Not recorded: the assertions marked
// `Xaravel-only`, which have no PHP counterpart (a class constructor or a contract token standing for its
// class-string, DIV-9.14's `'strlen'`, a closure's callable name, the unported callable and named-argument forms,
// and the JS `TypeError` for a byte string JS cannot hold).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import {
  abs,
  array_key_exists,
  array_key_first,
  array_key_last,
  array_keys,
  array_map,
  array_merge,
  array_values,
  ArrayAccess,
  ArrayIterator,
  ArrayObject,
  BackedEnum,
  Closure,
  COUNT_NORMAL,
  COUNT_RECURSIVE,
  count,
  Error as PhpError,
  explode,
  float,
  Generator,
  get_debug_type,
  getDebugType,
  gettype,
  hasBrand,
  implode,
  interfaceExists,
  is_a,
  is_array,
  is_callable,
  is_iterable,
  is_object,
  is_string,
  iterator_to_array,
  Iterator,
  JSON_PRESERVE_ZERO_FRACTION,
  json_last_error,
  jsonEncode,
  jsonLastError,
  LogicException,
  PhpArray,
  ReflectionMethod,
  Ref,
  sprintf,
  stdClass,
  toPhpString,
  Traversable,
  UnitEnum,
} from "@xaravel/runtime/php";
import * as php from "@xaravel/runtime/php";
import { fqcn, registerClass, resolveClass } from "@xaravel/runtime/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const NS = "XaravelFixture\\PhpTypeTests";
const INT_MAX = 9223372036854775807n;
const INT_MIN = -9223372036854775808n;
const CONTRACT_METHODS = Symbol.for("xaravel.contract.methods");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** Every name this item adds to `@xaravel/runtime/php` and the package root. */
const NEW_EXPORTS = [
  "abs",
  "array_key_exists",
  "array_key_first",
  "array_key_last",
  "array_keys",
  "array_map",
  "array_merge",
  "array_values",
  "ArrayAccess",
  "BackedEnum",
  "Closure",
  "COUNT_NORMAL",
  "COUNT_RECURSIVE",
  "count",
  "explode",
  "get_debug_type",
  "implode",
  "is_a",
  "is_array",
  "is_callable",
  "is_iterable",
  "is_object",
  "is_string",
  "json_last_error",
  "sprintf",
  "UnitEnum",
] as const;

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** `"<class>: <message>"` of what `fn` throws (a PHP throwable), or null; the probe's `thrown`. */
function thrownText(fn: () => unknown): string | null {
  const error = thrownBy(fn);
  if (error === null) {
    return null;
  }
  const klass = (error as object).constructor as abstract new (...args: never[]) => unknown;
  return `${fqcn(klass)}: ${(error as globalThis.Error).message}`;
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

/** A PHP array with the given entries, in order (keys PHP would not reorder). */
function phpArray(...entries: [string | number, unknown][]): PhpArray {
  return new PhpArray(entries);
}

/** A bare JS generator object, what a ported generator function returns. */
function bareGenerator(): globalThis.Generator<unknown, void, unknown> {
  return (function* () {
    yield 1;
  })();
}

/** The probe's `Invokable`. */
class Invokable {
  __invoke(): string {
    return "invoked";
  }
}

registerClass(`${NS}\\Invokable`, Invokable);

/** The probe's `Methods`: an instance `m` and a static `s`. */
class Methods {
  m(): string {
    return "m";
  }

  static s(): string {
    return "s";
  }
}

registerClass(`${NS}\\Methods`, Methods);

/** The probe's `OnlyCall`. */
class OnlyCall {
  __call(name: string, _args: unknown[]): string {
    return name;
  }
}

registerClass(`${NS}\\OnlyCall`, OnlyCall);

/** The probe's `OnlyCallStatic`. */
class OnlyCallStatic {
  static __callStatic(name: string, _args: unknown[]): string {
    return name;
  }
}

registerClass(`${NS}\\OnlyCallStatic`, OnlyCallStatic);

/** The probe's `Counted`: a `Countable` whose `count()` is 3. */
class Counted {
  get [Symbol.for("Countable")](): true {
    return true;
  }

  count(): number {
    return 3;
  }
}

registerClass(`${NS}\\Counted`, Counted);

/** The probe's `CountedText`: a `Countable` whose `count()` returns a non-int string. */
class CountedText {
  get [Symbol.for("Countable")](): true {
    return true;
  }

  count(): string {
    return "7 apples";
  }
}

registerClass(`${NS}\\CountedText`, CountedText);

/** The probe's `Text`, with a `__toString` port. */
class Text {
  toString(): string {
    return "text";
  }
}

registerClass(`${NS}\\Text`, Text);

/** The probe's `Base`: a protected instance method and a static one that name the called class. */
class Base {
  protected hidden(a: unknown, b: unknown = "B"): unknown[] {
    return [fqcn(this.constructor), a, b];
  }

  static make(x: unknown): unknown[] {
    return [fqcn(this), x];
  }
}

registerClass(`${NS}\\Base`, Base);

class Child extends Base {}

registerClass(`${NS}\\Child`, Child);

class Other {}

registerClass(`${NS}\\Other`, Other);

class MyException extends LogicException {}

registerClass(`${NS}\\MyException`, MyException);

/** The probe's pure enum `Pure` (AD-26). */
class Pure {
  static readonly A = new Pure("A");

  constructor(readonly name: string) {}

  static cases(): Pure[] {
    return [Pure.A];
  }
}

registerClass(`${NS}\\Pure`, Pure);

/** The probe's backed enum `Backed` (AD-26): `case A = 'a'`. */
class Backed {
  static readonly backingType = "string";
  static readonly A = new Backed("A", "a");

  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static cases(): Backed[] {
    return [Backed.A];
  }
}

registerClass(`${NS}\\Backed`, Backed);

/** Each label of `php-type-tests.probe.txt` and the runtime's value for the same case. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  // XT-runtime-62
  types: () => [[], { a: 1 }, phpArray([5, 1]), new stdClass(), () => null, float(1), "s", null, Traversable, 1, true].map((v) => [is_array(v), is_object(v), is_string(v)]),
  is_iterable: () => [[1], new ArrayIterator([]), bareGenerator(), new stdClass(), "s", Traversable, { a: 1 }].map((v) => is_iterable(v)),
  "instanceof.closure": () => [
    function () {} instanceof Closure,
    (() => 1) instanceof Closure,
    function named() {} instanceof Closure,
    new stdClass() instanceof Closure,
  ],
  "instanceof.enum": () => [Pure.A instanceof UnitEnum, Backed.A instanceof UnitEnum, Pure.A instanceof BackedEnum, Backed.A instanceof BackedEnum, new stdClass() instanceof UnitEnum],
  "instanceof.array_access": () => [new ArrayObject([]) instanceof ArrayAccess, new ArrayIterator([]) instanceof ArrayAccess, new stdClass() instanceof ArrayAccess],
  "instanceof.generator": () => [bareGenerator() instanceof Generator, new ArrayIterator([]) instanceof Generator],
  new_closure: () => thrownText(() => new Closure()),
  interface_exists: () => [interfaceExists("ArrayAccess"), interfaceExists("UnitEnum"), interfaceExists("BackedEnum"), interfaceExists("Closure"), resolveClass("Closure") === Closure],

  // XT-runtime-63
  "is_a.object": () => {
    const ao = new ArrayObject([]);
    return [is_a(ao, "ArrayObject"), is_a(ao, "arrayobject"), is_a(ao, "\\ArrayObject"), is_a(ao, "Traversable"), is_a(ao, "IteratorAggregate"), is_a(ao, "ArrayAccess"), is_a(ao, "Nope"), is_a(ao, "Iterator"), is_a(ao, "ArrayIterator")];
  },
  "is_a.string": () => [
    is_a("ArrayIterator", "Traversable"),
    is_a("ArrayIterator", "Traversable", true),
    is_a("ArrayIterator", "ArrayIterator", true),
    is_a("Nope", "Nope", true),
    is_a("arrayiterator", "Iterator", true),
    is_a("ArrayIterator", "ArrayObject", true),
  ],
  "is_a.exception": () => [
    is_a(new MyException(), "LogicException"),
    is_a(new MyException(), "Exception"),
    is_a(new MyException(), "Throwable"),
    is_a(new MyException(), "RuntimeException"),
    is_a(new LogicException(), `${NS}\\MyException`),
    is_a(`${NS}\\MyException`, "Exception", true),
    is_a(`${NS}\\MyException`, "Throwable", true),
  ],
  "is_a.enum": () => [
    is_a(Pure.A, "UnitEnum"),
    is_a(Pure.A, "BackedEnum"),
    is_a(Backed.A, "BackedEnum"),
    is_a(`${NS}\\Pure`, "UnitEnum", true),
    is_a(`${NS}\\Backed`, "BackedEnum", true),
    is_a(`${NS}\\Pure`, "BackedEnum", true),
    is_a(Pure.A, `${NS}\\Pure`),
  ],
  "is_a.interface": () => [is_a("Iterator", "Traversable", true), is_a("Iterator", "Iterator", true), is_a("Traversable", "Iterator", true), is_a("BackedEnum", "UnitEnum", true), is_a("Iterator", "Traversable")],
  "is_a.closure": () => [is_a(() => null, "Closure"), is_a(() => null, "closure"), is_a(new stdClass(), "Closure"), is_a(1, "stdClass"), is_a(null, "stdClass"), is_a(new stdClass(), "stdClass", "yes")],
  "is_a.errors": () => [thrownText(() => is_a(new stdClass(), [])), thrownText(() => is_a(new stdClass(), "stdClass", []))],
  "is_callable.closure": () => [is_callable(() => null), is_callable(() => 1, true)],
  is_callable: () =>
    [
      new Invokable(),
      [new Methods(), "m"],
      [new Methods(), "s"],
      [new Methods(), "missing"],
      [new OnlyCall(), "missing"],
      [new OnlyCallStatic(), "missing"],
      [`${NS}\\Methods`, "s"],
      [`${NS}\\Methods`, "m"],
      [`${NS}\\Methods`, "missing"],
      [`${NS}\\OnlyCallStatic`, "missing"],
      [`${NS}\\OnlyCall`, "missing"],
      `${NS}\\Methods::s`,
      `${NS}\\Methods::m`,
      "Nope::x",
      ["Nope", "x"],
      [1, 2],
      [new Methods()],
      phpArray([1, "m"], [0, new Methods()]),
      { a: new Methods(), b: "m" },
      [new Methods(), "m", "x"],
      new stdClass(),
      5,
      null,
      1.5,
      true,
      "Traversable",
    ].map((v) => {
      const name = new Ref<unknown>(null);
      const plain = is_callable(v, false, name);
      return [plain, is_callable(v, true), name.value];
    }),
  "is_callable.closure_array": () => {
    const closure = (): null => null;
    return [
      [closure, "__invoke"],
      [closure, "call"],
      [closure, "nope"],
      [closure, "BIND"],
    ].map((v) => {
      const name = new Ref<unknown>(null);
      const plain = is_callable(v, false, name);
      return [plain, is_callable(v, true), name.value];
    });
  },
  "is_callable.strings": () =>
    [`\\${NS}\\Methods::s`, `${NS}\\Methods::`, `${NS}\\OnlyCallStatic::`].map((v) => {
      const name = new Ref<unknown>(null);
      const plain = is_callable(v, false, name);
      return [plain, is_callable(v, true), name.value];
    }),
  "is_callable.errors": () => [thrownText(() => is_callable("x", []))],

  // XT-runtime-64
  "sprintf.basic": () => [
    sprintf("%s %d %u %f %.2f %F %e %E %g %G %x %X %o %b %c %%", "a", 42, 7, 1.5, 3.14159, 2.5, 1234.5678, 0.000123, 0.0001234, 1e20, 255, 255, 8, 5, 65),
    sprintf("[%5s][%-5s|][%05d][%+d][%+d][%'*8s][%-05d][%-05s]", "ab", "ab", 42, 5, -5, "x", 5, "x"),
    sprintf("%1$s %2$s %1$s", "a", "b"),
    sprintf("%.3e|%10.4f|%-10.2f|%010.3f|%+.1f|%+05d", 12345.6789, 3.14159265, 2.5, -3.14159, 0, -42),
    sprintf("[%*d][%-*d][%.*f][%2$*1$d]", 5, 42, 6, 7, 2, 1.23456),
    sprintf("%u|%d|%x|%b|%o", -1, 3.99, -1, -1, -1),
    sprintf("%s|%s|%s|%s|%s|%s|%d|%d", true, false, null, [1], float(1), 0.1 + 0.2, "12abc", "1e3"),
    sprintf("%.2f|%.0f|%.0f|%.0f|%.0e|%.2f|%.1f|%f|%e", 0.125, 0.5, 1.5, 2.5, 2.5, 0.375, 0.05, -0, 0),
    sprintf("%g|%g|%g|%g|%g|%g|%G|%.3g|%.10g|%g", 100000, 1000000, 0.0001, 0.00001, 1.5, -0, 1e-10, 3.14159, 1 / 3, 0),
    sprintf("%f|%e|%g|%f|%F|%5.1f|%d", Infinity, -Infinity, NaN, -Infinity, NaN, Infinity, Infinity),
    sprintf("%.60f|%.1f|%f|%.15e", 0.1, 1e300, 1.2345678901234568e29, 1 / 3),
    sprintf("%5.2s|%.0s|%-6.3s|", "abcdef", "abc", "abcdef"),
    sprintf("%5ld|%'x-6d|%3c", 7, 3, 66),
    sprintf("%s", new Text()),
    sprintf("héllo %s %5s", "wörld", "é"),
    sprintf("%.2x|%5.1x|%.3b", 255, 255, 5),
    sprintf("%h|%H|%.3h", 1e20, 0.00001234, 1234.5678),
    sprintf("no conversions"),
    sprintf(""),
  ],
  "sprintf.errors": () => [
    thrownText(() => sprintf("%s %s", "a")),
    thrownText(() => sprintf("%y", 1)),
    thrownText(() => sprintf("%y")),
    thrownText(() => sprintf("abc%", 1)),
    thrownText(() => sprintf("abc%")),
    thrownText(() => sprintf("%0$s", 1)),
    thrownText(() => sprintf("%3$s", 1)),
    thrownText(() => sprintf("%*d", "x", 1)),
    thrownText(() => sprintf("%*d", -1, 1)),
    thrownText(() => sprintf("%.*f", 1.5, 1)),
    thrownText(() => sprintf("%.*f", -2, 1)),
    thrownText(() => sprintf("%.*f", -1, 1)),
    thrownText(() => sprintf("%.*g", -1, 1.5)),
    thrownText(() => sprintf("%'", 1)),
    thrownText(() => sprintf("%s", new stdClass())),
    thrownText(() => sprintf("%9999999999d", 1)),
    thrownText(() => sprintf("%*d")),
    thrownText(() => sprintf("%.9999999999f", 1)),
  ],
  implode: () => [
    implode(",", [1, 1.5, true, false, null, "a"]),
    implode([1, 2]),
    implode(",", [new Text(), "b"]),
    implode(",", [[1], "b"]),
    implode(", ", []),
    implode("-", { x: 1, y: 2 }),
    implode(5, [1, 2]),
    implode(",", [0.1 + 0.2, 1e100, -0, float(100)]),
  ],
  "implode.errors": () => [
    thrownText(() => implode(",")),
    thrownText(() => implode([1], ",")),
    thrownText(() => implode(",", 5)),
    thrownText(() => implode(new stdClass(), [1])),
    thrownText(() => implode(",", [new stdClass()])),
    thrownText(() => implode(["a"], null)),
    thrownText(() => implode(",", null)),
    thrownText(() => implode(5)),
  ],
  explode: () => [
    explode(",", "a,b,,c"),
    explode(",", "a,b,c", 2),
    explode(",", "a,b,c", -1),
    explode(",", "a,b,c", 0),
    explode(",", "a,b,c", 1),
    explode("|", "a,b"),
    explode("|", "a,b", -1),
    explode(",", ""),
    explode(",", "", -1),
    explode(",", "a,b,c", -5),
    explode("ab", "xabyabz"),
    explode(",", ",a,"),
    explode(1, "01210"),
    explode("é", "aébéc"),
  ],
  "explode.errors": () => [thrownText(() => explode("", "a")), thrownText(() => explode([], "a")), thrownText(() => explode(",", "a", "x"))],

  // XT-runtime-65
  "array_map.one": () => [
    array_map((v: unknown) => (v as number) * 2, phpArray(["a", 1], [3, 2], ["b", 3])),
    array_map((v: unknown) => `${toPhpString(v)}!`, phpArray([5, "x"], [6, "y"])),
    array_map(null, phpArray(["a", 1], [0, 2])),
    array_map((v: unknown) => v, []),
    array_map(new Invokable(), [1]),
  ],
  "array_map.many": () => [
    array_map((a: unknown, b: unknown) => [a, b], [1, 2, 3], { x: "a" }),
    array_map(null, [1, 2], ["a", "b", "c"]),
    array_map(null, { k: 1 }, { j: 2 }),
    array_map((...parts: unknown[]) => parts.map((part) => toPhpString(part)).join(""), ["a"], ["b"], ["c", "d"]),
  ],
  "array_map.errors": () => [
    thrownText(() => array_map((v: unknown) => v, 5)),
    thrownText(() => array_map((v: unknown) => v, [1], 5)),
    thrownText(() => array_map(null, [1], [2], "x")),
    thrownText(() => array_map(5, [1])),
  ],
  array_keys: () => {
    const mixed = phpArray(["a", 1], ["b", "1"], ["c", 2], [5, 1]);
    const empties = { a: null, b: 0, c: "" };
    return [array_keys(mixed), array_keys(mixed, 1), array_keys(mixed, 1, true), array_keys(empties, null), array_keys(empties, null, true), array_keys([])];
  },
  array_values: () => [array_values(phpArray(["a", 1], [5, 2], ["c", [3]])), array_values([])],
  array_key_exists: () => [
    array_key_exists("a", { a: null }),
    array_key_exists(null, { "": 1 }),
    array_key_exists(1.5, phpArray([1, "x"])),
    array_key_exists(true, phpArray([1, "x"])),
    array_key_exists(false, ["x"]),
    array_key_exists("1", phpArray([1, "x"])),
    array_key_exists(1, phpArray(["1", "x"])),
    array_key_exists("01", phpArray([1, "x"])),
    array_key_exists("b", { a: 1 }),
    array_key_exists(0, []),
  ],
  "array_key_exists.errors": () => [thrownText(() => array_key_exists([], [])), thrownText(() => array_key_exists(new stdClass(), [])), thrownText(() => array_key_exists("a", 5))],
  array_key_first_last: () => {
    const keyed = phpArray(["x", 1], [5, 2]);
    return [array_key_first(keyed), array_key_last(keyed), array_key_first([]), array_key_last([]), array_key_first([7]), thrownText(() => array_key_first("x"))];
  },
  array_merge: () => [
    array_merge(),
    array_merge(phpArray([5, "a"], [9, "b"]), phpArray([3, "c"])),
    array_merge({ a: 1, b: 2 }, phpArray(["a", 3], [7, 4])),
    array_merge({ x: 1 }, [], { y: 2, x: 9 }),
    array_merge(phpArray([3, "a"])),
    thrownText(() => array_merge([1], 5)),
    thrownText(() => array_merge("x")),
  ],
  count: () => [
    count([1, [2, 3]]),
    count([1, [2, 3]], COUNT_RECURSIVE),
    count(phpArray([0, 1], [1, [2, [3, 4]]], ["a", []]), 1),
    count(new ArrayObject([1, 2, 3])),
    count(new Counted()),
    count(new CountedText()),
    count([]),
    count({ a: 1 }, "1"),
    COUNT_NORMAL,
    COUNT_RECURSIVE,
  ],
  "count.errors": () => [
    thrownText(() => count(1)),
    thrownText(() => count("abc")),
    thrownText(() => count(null)),
    thrownText(() => count(new stdClass())),
    thrownText(() => count([], 5)),
    thrownText(() => count([], "x")),
  ],
  abs: () => [abs(-5), abs(-1.5), abs(-0), abs("-3"), abs("-3.5"), abs(INT_MIN), abs(INT_MAX), abs(5), abs(true), abs(null), abs(float(-2))],
  "abs.errors": () => [thrownText(() => abs("x")), thrownText(() => abs([])), thrownText(() => abs("1x"))],
  aliases: () => [get_debug_type(1.5), get_debug_type(new ArrayObject([])), get_debug_type(() => null), get_debug_type(null), json_last_error()],

  // XT-runtime-66
  "reflection.invoke": () => {
    const hidden = new ReflectionMethod(Base, "hidden");
    const make = new ReflectionMethod(Child, "make");
    return [
      hidden.invoke(new Base(), 1),
      hidden.invoke(new Child(), 1, 2),
      hidden.invokeArgs(new Child(), [5]),
      hidden.invokeArgs(new Base(), phpArray([3, "x"], [1, "y"])),
      make.invoke(null, "n"),
      make.invoke(new Other(), "o"),
      make.invokeArgs(null, ["a"]),
      new ReflectionMethod(Base, "make").invoke(null, "b"),
      new ReflectionMethod(new Child(), "make").invoke(null, "c"),
      hidden.setAccessible(true),
      hidden.setAccessible(false),
    ];
  },
  "reflection.errors": () => {
    const hidden = new ReflectionMethod(Base, "hidden");
    return [
      thrownText(() => hidden.invoke(null, 1)),
      thrownText(() => hidden.invoke(new Other(), 1)),
      thrownText(() => hidden.invokeArgs(null, [1])),
      thrownText(() => new ReflectionMethod(Child, "hidden").invoke(new Base(), 1)),
      thrownText(() => hidden.invoke(5)),
      thrownText(() => hidden.invokeArgs(new Base(), 5)),
      thrownText(() => hidden.invokeArgs(5, [])),
      thrownText(() => hidden.setAccessible([])),
    ];
  },
};

/** `label`'s recorded PHP value, parsed. */
function recorded(label: string): string {
  const line = readFileSync(resolve(import.meta.dir, "php-type-tests.probe.txt"), "utf8")
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
  "XT-runtime-62",
  "is_array, is_object, is_string and is_iterable give PHP's results over the AD-9 value model (a contract token is its class-string, a class constructor is no Closure), and instanceof Closure, UnitEnum, BackedEnum, ArrayAccess and Generator answer as PHP's do: a non-class function, an AD-26 case (backed for BackedEnum), the ArrayAccess brand and a bare JS generator object; new Closure() throws PHP's Error, and the three tokens are recorded interfaces (ESC-14.1-9)",
  () => {
    assertProbed("types", "is_iterable", "instanceof.closure", "instanceof.enum", "instanceof.array_access", "instanceof.generator", "new_closure", "interface_exists");

    // Xaravel-only: a class constructor stands for its class-string, yet is a PHP object to is_object (phpType).
    Assert.assertTrue(is_object(ArrayObject));
    Assert.assertFalse(is_string(ArrayObject));
    Assert.assertFalse(is_array(ArrayObject));
    Assert.assertFalse(is_iterable(ArrayObject));
    Assert.assertFalse(is_object(Traversable));
    Assert.assertSame("array", gettype(Traversable), "gettype keeps its result");
    Assert.assertSame("Closure", getDebugType(() => null));
    Assert.assertTrue(is_array(phpArray([5, 1])));

    // Xaravel-only: what a JS function is to Closure.
    class Plain {}
    Assert.assertSame(
      "[true,true,true,true,false,false,false,true]",
      json([
        (async () => null) instanceof Closure,
        function* () {} instanceof Closure,
        (() => null).bind(null) instanceof Closure,
        Map instanceof Closure,
        Plain instanceof Closure,
        ArrayObject instanceof Closure,
        Closure instanceof Closure,
        is_a(async () => null, "Closure"),
      ]),
    );
    Assert.assertSame(Closure, resolveClass("closure"));
    Assert.assertSame("Closure", fqcn(Closure));

    // The enum tokens answer through their instance test, not a brand.
    Assert.assertFalse(hasBrand(Pure.A, UnitEnum));
    Assert.assertFalse(Pure instanceof UnitEnum, "an enum class is a class-string, not a case");
    Assert.assertSame(UnitEnum, ((BackedEnum as unknown as Record<symbol, readonly object[]>)[CONTRACT_PARENTS] ?? [])[0]);
    Assert.assertSame('["cases"]', JSON.stringify((UnitEnum as unknown as Record<symbol, unknown>)[CONTRACT_METHODS]));
    Assert.assertSame('["from","tryFrom"]', JSON.stringify((BackedEnum as unknown as Record<symbol, unknown>)[CONTRACT_METHODS]));
    Assert.assertSame('["offsetExists","offsetGet","offsetSet","offsetUnset"]', JSON.stringify((ArrayAccess as unknown as Record<symbol, unknown>)[CONTRACT_METHODS]));
    Assert.assertTrue({ [Symbol.for("ArrayAccess")]: true } instanceof ArrayAccess);

    // Generator: a bare JS generator object answers, and the runtime's traversal still wraps it.
    const wrapped = new Generator(bareGenerator());
    Assert.assertTrue(wrapped instanceof Generator);
    Assert.assertFalse({} instanceof Generator);
    Assert.assertSame("[1]", json(iterator_to_array(bareGenerator())));
    Assert.assertTrue(wrapped instanceof Iterator);
  },
);

xaravelTest(
  "XT-runtime-63",
  "is_a($value, $class, $allowString) gives PHP's results for classes, interfaces, enum tokens and class-strings, a miss being false, and is_callable($value, $syntaxOnly, $name) gives PHP's results and callable names for invokables, callable arrays and Class::method strings under DIV-9.13 and DIV-9.14 (ESC-14.1-9)",
  () => {
    assertProbed("is_a.object", "is_a.string", "is_a.exception", "is_a.enum", "is_a.interface", "is_a.closure", "is_a.errors", "is_callable.closure", "is_callable", "is_callable.closure_array", "is_callable.strings", "is_callable.errors");

    // Xaravel-only: a class constructor and a contract token are class-strings.
    Assert.assertSame(
      "[false,true,true,false,true,true,true,false]",
      json([
        is_a(ArrayObject, "Traversable"),
        is_a(ArrayObject, "Traversable", true),
        is_a(ArrayObject, "arrayobject", true),
        is_a(ArrayObject, "ArrayIterator", true),
        is_a(Iterator, "Traversable", true),
        is_a(Pure, "UnitEnum", true),
        is_a(Backed, "BackedEnum", true),
        is_a(Pure, "BackedEnum", true),
      ]),
    );
    Assert.assertFalse(is_a(new ArrayObject([]), "Countable"), "Countable is no recorded interface");
    Assert.assertFalse(is_a(Pure.A, "Nope"));

    // Xaravel-only: DIV-9.14 (a function name is callable when the runtime exports it, ESC-14.4-2), a closure's name,
    // class constructors and tokens as targets.
    Assert.assertTrue(is_callable("strlen"));
    Assert.assertFalse(is_callable("str_rot13"));
    Assert.assertTrue(is_callable("str_rot13", true));
    const name = new Ref<unknown>(null);
    Assert.assertTrue(is_callable(() => null, false, name));
    Assert.assertSame("Closure::__invoke", name.value);
    Assert.assertTrue(is_callable([Methods, "s"], false, name));
    Assert.assertSame(`${NS}\\Methods::s`, name.value);
    Assert.assertFalse(is_callable([Methods, "m"]));
    Assert.assertFalse(is_callable(Methods, false, name));
    Assert.assertTrue(is_callable(Methods, true));
    Assert.assertSame(`${NS}\\Methods`, name.value);
    Assert.assertFalse(is_callable([Traversable, "x"]));
    Assert.assertTrue(is_callable([Traversable, "x"], true));
    Assert.assertTrue(is_callable(undefined, true) === false, "undefined reads as null");
    assertJsTypeError("pass a Ref", () => is_callable("x", false, {} as Ref<unknown>));
  },
);

xaravelTest(
  "XT-runtime-64",
  "sprintf ports php_formatted_print (flags, widths, argnum, * widths and precisions, every specifier, exact half-even float digits, INF and NaN) with PHP's ArgumentCountError and ValueError messages, and implode and explode give PHP's results and messages (ESC-14.1-9)",
  () => {
    assertProbed("sprintf.basic", "sprintf.errors", "implode", "implode.errors", "explode", "explode.errors");

    // Xaravel-only: a result or input JS cannot hold.
    assertJsTypeError("not valid UTF-8", () => sprintf("%.1s", "é"));
    assertJsTypeError("not valid UTF-8", () => sprintf("%c", 200));
    assertJsTypeError("lone surrogate", () => sprintf("%s", "\ud800"));
    assertJsTypeError("lone surrogate", () => explode(",", "a\ud800"));
    Assert.assertSame("a|", sprintf("%s|%s", "a", undefined), "undefined reads as null");
    Assert.assertSame("[]", json(explode(",", "", -1)));
    // An explicit `undefined` second argument is PHP's null, not the one-argument form (AD-9).
    Assert.assertSame(
      "TypeError: implode(): If argument #1 ($separator) is of type string, argument #2 ($array) must be of type array, null given",
      thrownText(() => implode(",", undefined)),
    );
  },
);

xaravelTest(
  "XT-runtime-65",
  "array_map, array_keys, array_values, array_key_exists, array_key_first, array_key_last, array_merge, count with COUNT_NORMAL and COUNT_RECURSIVE, and abs give PHP's values, keys and messages, and get_debug_type and json_last_error are getDebugType and jsonLastError (ESC-14.1-9)",
  () => {
    assertProbed(
      "array_map.one",
      "array_map.many",
      "array_map.errors",
      "array_keys",
      "array_values",
      "array_key_exists",
      "array_key_exists.errors",
      "array_key_first_last",
      "array_merge",
      "count",
      "count.errors",
      "abs",
      "abs.errors",
      "aliases",
    );
    Assert.assertSame(getDebugType, get_debug_type);
    Assert.assertSame(jsonLastError, json_last_error);

    // Xaravel-only: the unported callable forms (DIV-9.13: a name the runtime does not export, ESC-14.4-2), as
    // array_filter refuses them.
    Assert.assertSame(
      "TypeError: array_map(): Argument #1 ($callback) is a PHP callable string, which Xaravel does not port; pass a function",
      thrownText(() => array_map("str_rot13", ["a"])),
    );
    Assert.assertSame(
      "TypeError: array_map(): Argument #1 ($callback) is a PHP callable array, which Xaravel does not port; pass a function",
      thrownText(() => array_map([new Methods(), "m"], ["a"])),
    );
    // Xaravel-only: a class constructor and a contract token are class-strings, so PHP callable strings.
    for (const callback of [Methods, Traversable]) {
      Assert.assertSame(
        "TypeError: array_map(): Argument #1 ($callback) is a PHP callable string, which Xaravel does not port; pass a function",
        thrownText(() => array_map(callback, ["a"])),
      );
      Assert.assertSame(
        "TypeError: array_filter(): Argument #2 ($callback) is a PHP callable string, which Xaravel does not port; pass a function",
        thrownText(() => php.array_filter(["a"], callback)),
      );
    }
    // An explicit `undefined` filter value is PHP's null, not an omitted one (AD-9).
    Assert.assertSame('["a","b"]', json(array_keys({ a: null, b: "", c: 1 }, undefined)));
    Assert.assertSame('["a","b","c"]', json(array_keys({ a: null, b: "", c: 1 })));
    // A float result carries the float marker where PHP's is a float.
    Assert.assertTrue(php.isFloat(abs(float(-2))));
    Assert.assertTrue(php.isFloat(abs(-0)));
    Assert.assertSame(2, abs(-2));
    // A self-referencing array counts once, as PHP's recursion guard gives it.
    const loop: unknown[] = [1];
    loop.push(loop);
    Assert.assertSame(2, count(loop, COUNT_RECURSIVE));
    Assert.assertSame(3, count({ a: 1, b: [1] }, COUNT_RECURSIVE));
    Assert.assertSame("TypeError: count(): Argument #1 ($value) must be of type Countable|array, string given", thrownText(() => count(Traversable)));
  },
);

xaravelTest(
  "XT-runtime-66",
  "ReflectionMethod::invoke and invokeArgs call a method of any visibility on the object, or a static method with the reflected class as this, and throw PHP's ReflectionException and TypeError messages; setAccessible is a no-op returning null; a named argument in invokeArgs is a JS TypeError (ESC-14.1-10)",
  () => {
    assertProbed("reflection.invoke", "reflection.errors");

    // Xaravel-only: named arguments are not ported, and a class constructor is a class-string, no object.
    const hidden = new ReflectionMethod(Base, "hidden");
    assertJsTypeError('the named argument "a"', () => hidden.invokeArgs(new Base(), { a: 1 }));
    Assert.assertSame("TypeError: ReflectionMethod::invoke(): Argument #1 ($object) must be of type ?object, string given", thrownText(() => hidden.invoke(Base, 1)));
    Assert.assertSame(`["${NS.replaceAll("\\", "\\\\")}\\\\Base",null,"B"]`, json(hidden.invoke(new Base(), undefined)), "undefined reads as null");
  },
);

xaravelTest(
  "XT-runtime-67",
  "every PHP 8.5.11 value recorded in php-type-tests.probe.txt (from php-type-tests.probe.php: the type tests, instanceof, is_a, is_callable, sprintf, implode, explode, the array functions, count, abs and ReflectionMethod::invoke, with the exception class and message of each recorded case) is what the runtime gives for the same case, and a fresh process exports every new name from the root and @xaravel/runtime/php as the same object, resolves Closure, and keeps the 24-entry classes map (ESC-14.1-9, ESC-14.1-10)",
  () => {
    const record = readFileSync(resolve(import.meta.dir, "php-type-tests.probe.txt"), "utf8");
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
      `const r = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/index.ts"))}); const p = await import(${JSON.stringify(resolve(PACKAGE_DIR, "src/php/index.ts"))}); const { resolveClass } = await import("@xaravel/runtime/registry"); const names = ${JSON.stringify(NEW_EXPORTS)}; console.log(names.filter((n) => p[n] === undefined || r[n] !== p[n]).join(",") || "all", resolveClass("Closure") === p.Closure, p.get_debug_type === p.getDebugType && p.json_last_error === p.jsonLastError && r.get_debug_type === r.getDebugType && r.json_last_error === r.jsonLastError, Object.keys(globalThis[Symbol.for("xaravel.php.classes")]).length);`,
    );
    Assert.assertSame(0, run.code, run.err);
    Assert.assertSame("all true true 24", run.out);
  },
  60_000,
);
