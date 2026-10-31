// Xaravel Tests for action item epic-16-item-1-runtime-array-column-rawurldecode (decisions/ESC-16.1-2.md, approved by
// the monitor under decisions/MAINT-2026-10-26-runtime-builtins.md): the two PHP builtins illuminate/json-schema calls
// that the runtime lacked. XT-runtime-149: array_column (Type::enum's `array_column($values::cases(), 'value')`).
// XT-runtime-150: rawurldecode (the Deserializer's). XT-runtime-151: their registry entries and the root and subpath
// exports. None needs an Oracle fixture: each expected value is what PHP 8.5.11 gives for the same case, probed with
// the host's `php`. `php-array-column-rawurldecode.probe.php` prints each label as `<label>\t<json_encode(value)>` and
// `php-array-column-rawurldecode.probe.txt` is its output (`php -d error_reporting=0
// php-array-column-rawurldecode.probe.php > php-array-column-rawurldecode.probe.txt`). Every recorded label is
// computed with the runtime and compared. Not recorded: the assertions marked `Xaravel-only`, which have no PHP
// counterpart (`undefined`, DIV-9.18's JS `TypeError`, export identity).
import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as root from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { fqcn, registerClass, registerContractToken } from "@xaravel/runtime/registry";
import { PHP_FUNCTIONS } from "../../src/php/phpFunctions";

const NS = "XaravelFixture\\PhpArrayColumn";

/** Each label's recorded JSON. */
const evidence = new Map(
  readFileSync(`${import.meta.dir}/php-array-column-rawurldecode.probe.txt`, "utf8").trim().split("\n").map((line) => {
    const [label, value] = line.split("\t") as [string, string];
    return [label, value] as const;
  }),
);

/** `value` as the probe records it. */
function json(value: unknown): string {
  const encoded = p.jsonEncode(value, p.JSON_PRESERVE_ZERO_FRACTION);
  if (encoded === false) {
    throw new globalThis.Error("jsonEncode failed");
  }
  return encoded;
}

/** The probe's `attempt`: the result, or "<class>: <message>" for a throw. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    let name: string;
    try {
      name = fqcn(error as object);
    } catch {
      name = `JS ${(error as Error).name}`;
    }
    return `${name}: ${(error as Error).message}`;
  }
}

/** A PHP array literal with keys in the order given. */
function arr(...entries: [p.PhpKeyInput, unknown][]): p.PhpArray {
  return new p.PhpArray(entries);
}

const PHP_PROPERTIES: unique symbol = Symbol.for("xaravel.php.properties");

/** The probe's `Row`: public, protected and private properties, promoted `id` and `name`, and a method. */
class Row {
  static readonly [PHP_PROPERTIES] = [
    { name: "note", visibility: "public", default: null },
    { name: "secret", visibility: "protected", default: "s" },
    { name: "hidden", visibility: "private", default: "h" },
    { name: "id", visibility: "public" },
    { name: "name", visibility: "public" },
  ];

  note: unknown = null;
  secret: unknown = "s";
  hidden: unknown = "h";

  constructor(
    public id: unknown,
    public name: unknown,
  ) {}

  title(): string {
    return "t";
  }
}

registerClass(`${NS}\\Row`, Row);

/** The probe's `Label`: a `__toString`. */
class Label {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  toString(): string {
    return this.#text;
  }
}

registerClass(`${NS}\\Label`, Label);

/** The probe's `Suit`: a string-backed AD-26 enum. */
class Suit {
  static readonly backingType = "string";
  static readonly Hearts: Suit = Object.freeze(new Suit("Hearts", "H"));
  static readonly Spades: Suit = Object.freeze(new Suit("Spades", "S"));

  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static cases(): Suit[] {
    return [Suit.Hearts, Suit.Spades];
  }
}

registerClass(`${NS}\\Suit`, Suit);

/** The probe's `Rank`: an int-backed AD-26 enum. */
class Rank {
  static readonly backingType = "int";
  static readonly Ace: Rank = Object.freeze(new Rank("Ace", 1));
  static readonly King: Rank = Object.freeze(new Rank("King", 13));

  constructor(
    readonly name: string,
    readonly value: number,
  ) {}

  static cases(): Rank[] {
    return [Rank.Ace, Rank.King];
  }
}

registerClass(`${NS}\\Rank`, Rank);

/** The probe's `Status`: a pure AD-26 enum. */
class Status {
  static readonly Active: Status = Object.freeze(new Status("Active"));
  static readonly Inactive: Status = Object.freeze(new Status("Inactive"));

  constructor(readonly name: string) {}

  static cases(): Status[] {
    return [Status.Active, Status.Inactive];
  }
}

registerClass(`${NS}\\Status`, Status);

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const CONTRACT_PARENTS = Symbol.for("xaravel.contract.parents");

/** A stand-in contract token named `name`, built as `contract()` builds one (see token-table.test.ts). */
function token(name: string): object {
  const brand = Symbol.for(name);
  return Object.freeze({
    brand,
    [CLASS_FQCN]: name,
    [CONTRACT_PARENTS]: Object.freeze([]),
    [Symbol.toPrimitive]: (): symbol => brand,
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
  });
}

const CONTRACT_FQCN = `${NS}\\Contract`;
const CONTRACT = token(CONTRACT_FQCN);
registerContractToken(CONTRACT);

const rows = [{ id: 3, n: "a" }, { id: 5, n: "b" }, { x: 1 }];
const ints = [[10, 20], [30]];

/** The probe's object rows: `$b` has the dynamic property `extra`. */
function objectRows(): { a: Row; b: Row; objects: Row[]; std: p.stdClass } {
  const a = new Row(1, "one");
  const b = new Row(2, "two");
  (b as unknown as Record<string, unknown>)["extra"] = "dyn";
  const std = new p.stdClass();
  (std as unknown as Record<string, unknown>)["1"] = "one";
  (std as unknown as Record<string, unknown>)["n"] = "std";
  return { a, b, objects: [a, b], std };
}

/** Each probe label's runtime computation. */
const PROBE_CASES: Readonly<Record<string, () => unknown>> = {
  column: () => [
    p.array_column(rows, "n"),
    p.array_column(rows, "n", "id"),
    p.array_column(rows, "id", "n"),
    p.array_column(rows, "x"),
    p.array_column(rows, "missing"),
    p.array_column([], "n"),
    p.array_column({ k: { n: 1 }, j: { n: 2 } }, "n"),
    p.array_column([{ n: null }, { n: false }], "n"),
    p.array_column([{ n: { deep: 1 } }], "n"),
  ],
  "column.whole": () => [
    p.array_column(rows, null),
    p.array_column(rows, null, "id"),
    p.array_column(rows, null, "n"),
    p.array_column([1, "x", null, { id: 2 }], null),
    p.array_column([1, "x", null, { id: 2 }], null, "id"),
  ],
  "column.int": () => [
    p.array_column(ints, 1),
    p.array_column(ints, "1"),
    p.array_column(ints, 0, 1),
    p.array_column(ints, "01"),
    p.array_column(ints, " 1"),
    p.array_column(ints, 1.7),
    p.array_column(ints, true),
    p.array_column(ints, false),
    p.array_column([arr(["1.5", "a"], [1, "b"])], "1.5"),
    p.array_column([arr(["1.5", "a"], [1, "b"])], 1.5),
    p.array_column([arr(["-3", "a"])], -3),
    p.array_column([arr(["", "e"], [0, "z"])], ""),
    p.array_column([{ NAN: "n" }], Number.NaN),
    p.array_column([{ INF: "i" }], Number.POSITIVE_INFINITY),
    p.array_column([{ x: "l" }], new Label("x")),
  ],
  "column.scalars": () => [
    p.array_column([1, "x", null, true, 2.5, { n: "kept" }], "n"),
    p.array_column([1, "x", { n: "kept", id: 4 }], "n", "id"),
  ],
  "column.objects": () => {
    const { a, objects, std } = objectRows();
    const cast = Object.assign(new p.stdClass(), { k: "cast" });
    return [
      p.array_column(objects, "name"),
      p.array_column(objects, "name", "id"),
      p.array_column(objects, "id", "name"),
      p.array_column(objects, "note"),
      p.array_column(objects, "secret"),
      p.array_column(objects, "hidden"),
      p.array_column(objects, "title"),
      p.array_column(objects, "extra"),
      p.array_column(objects, "extra", "name"),
      p.array_column(objects, "name", "secret"),
      p.array_column([std], 1),
      p.array_column([std], "1"),
      p.array_column([std, { n: "arr" }, a], "n"),
      p.array_column([std, { name: "arr" }, a], "name"),
      p.array_column([cast], "k"),
      p.count(p.array_column(objects, null)),
      (p.array_column(objects, null) as unknown[])[0] === a,
    ];
  },
  "column.enums": () => [
    p.array_column(Suit.cases(), "value"),
    p.array_column(Suit.cases(), "name"),
    p.array_column(Suit.cases(), "value", "name"),
    p.array_column(Suit.cases(), "name", "value"),
    p.array_column(Rank.cases(), "value"),
    p.array_column(Rank.cases(), "name", "value"),
    p.array_column(Status.cases(), "name"),
    p.array_column(Status.cases(), "value"),
    p.array_column(Suit.cases(), "cases"),
    p.array_column(Suit.cases(), "from"),
  ],
  "column.keys": () => [
    p.array_column([{ v: "a", k: null }, { v: "b", k: true }, { v: "c", k: false }], "v", "k"),
    p.array_column([{ v: "a", k: 1.9 }, { v: "b", k: -1.5 }, { v: "c", k: 0.5 }], "v", "k"),
    p.array_column([{ v: "a", k: "7" }, { v: "b", k: "07" }, { v: "c", k: "-0" }, { v: "d", k: "-8" }], "v", "k"),
    p.array_column([{ v: "a", k: "x" }, { v: "b", k: "x" }, { v: "c", k: "y" }], "v", "k"),
    p.array_column([{ v: "a", k: 5 }, { v: "b" }, { v: "c", k: "z" }, { v: "d" }], "v", "k"),
    p.array_column([{ v: "a", k: -5 }, { v: "b" }], "v", "k"),
    p.array_column([{ v: "a" }, { v: "b", k: 0 }, { v: "c" }], "v", "k"),
    p.array_column([{ v: "a", k: Suit.Hearts.value }], "v", "k"),
    p.array_column([{ v: "a", k: p.PHP_INT_MAX }, { v: "b" }, { v: "c", k: "z" }], "v", "k"),
    attempt(() => p.array_column([{ v: "a", k: [1] }], "v", "k")),
    attempt(() => p.array_column([{ v: "a", k: new p.stdClass() }], "v", "k")),
    attempt(() => p.array_column([{ v: "a", k: Suit.Hearts }], "v", "k")),
    attempt(() => p.array_column([{ v: "a", k: 1 }, { v: "b", k: [] }], "v", "k")),
  ],
  "column.bad": () => [
    attempt(() => p.array_column("x", "n")),
    attempt(() => p.array_column(null, "n")),
    attempt(() => p.array_column(new p.ArrayIterator([]), "n")),
    attempt(() => p.array_column([], [])),
    attempt(() => p.array_column([], new p.stdClass())),
    attempt(() => p.array_column([], "n", [])),
    attempt(() => p.array_column([], "n", new p.stdClass())),
    attempt(() => p.array_column([], Suit.Hearts)),
    attempt(() => p.array_column([{ a: 1 }], "a", new Label("a"))),
    attempt(() => p.array_column([], () => "n")),
    attempt(() => p.array_column([], "n", () => "n")),
  ],
  rawurldecode: () => [
    p.rawurldecode("a%20b+c"),
    p.rawurldecode("%e2%82%AC"),
    p.rawurldecode("%"),
    p.rawurldecode("%zz"),
    p.rawurldecode("100%"),
    p.rawurldecode("%41%4"),
    p.rawurldecode("%4g%41"),
    p.rawurldecode("%%41"),
    p.rawurldecode("%2B%25%2b"),
    p.rawurldecode("%C3%BC/ü"),
    p.rawurldecode(""),
    p.rawurldecode("plain"),
    p.rawurldecode("%00"),
    p.rawurldecode("%7e%7E"),
    p.rawurldecode("%23%2F%3F"),
  ],
  "rawurldecode.coercion": () => [
    p.rawurldecode(12),
    p.rawurldecode(true),
    p.rawurldecode(false),
    p.rawurldecode(null),
    p.rawurldecode(1.5),
    p.rawurldecode(new Label("%41")),
    p.rawurldecode(0.1),
    p.rawurldecode(1e100),
    p.rawurldecode(-0.0),
    attempt(() => p.rawurldecode([])),
    attempt(() => p.rawurldecode(new p.stdClass())),
    attempt(() => p.rawurldecode(Suit.Hearts)),
  ],
  reflection: () =>
    ["array_column", "rawurldecode"].map((name) => {
      const fn = PHP_FUNCTIONS[name]!;
      return [fn.required, fn.total, fn.variadic];
    }),
  counts: () => {
    const column = p.phpFunction("array_column")!;
    const decode = p.phpFunction("rawurldecode")!;
    return [
      attempt(() => column([])),
      attempt(() => column()),
      attempt(() => column([], "a", "b", "c")),
      attempt(() => decode()),
      attempt(() => decode("a", "b")),
      p.function_exists("array_column"),
      p.function_exists("RAWURLDECODE"),
      column([{ n: 1 }], "n"),
      decode("%41"),
    ];
  },
};

/** Each label computed with the runtime and compared with PHP's recorded value. */
function assertProbeLabels(labels: readonly string[]): void {
  const differences: string[] = [];
  for (const label of labels) {
    const recorded = evidence.get(label);
    Assert.assertNotNull(recorded ?? null, `missing evidence: ${label}`);
    const computed = json(attempt(PROBE_CASES[label]!));
    if (computed !== recorded) {
      differences.push(`${label}\n  PHP:     ${recorded}\n  runtime: ${computed}`);
    }
  }
  Assert.assertSame("", differences.join("\n"));
}

xaravelTest(
  "XT-runtime-149",
  "array_column gives PHP 8.5.11's results: a column of array rows (a numeric-string key finding its int key), whole rows for a null column, object rows by public and dynamic property only (never a protected or private property or a method), AD-26 enum cases by name and backed value in case order, index values as keys (null \"\", a bool 0 or 1, a float truncated, a numeric string its int, a row without one appended at the next int key), a row that is neither an array nor an object skipped, and PHP's TypeErrors for a non-array, a key that is no string, int or null, and an index value no array key takes (ESC-16.1-2)",
  () => {
    assertProbeLabels(["column", "column.whole", "column.int", "column.scalars", "column.objects", "column.enums", "column.keys", "column.bad"]);
    // Xaravel-only: an undefined key reads as null (AD-9).
    Assert.assertSame(json(p.array_column(rows, null)), json(p.array_column(rows, undefined)));
    Assert.assertSame(json(["a", "b"]), json(p.array_column(rows, "n", undefined)));
    Assert.assertSame(json([null]), json(p.array_column([{ n: undefined }], "n")));
    // Xaravel-only: a nested array value is a copy, as PHP's value semantics give it.
    const nested = { n: [1] };
    const column = p.array_column([nested], "n") as unknown[][];
    column[0]!.push(2);
    Assert.assertSame(json([1]), json(nested.n));
    // Xaravel-only: a contract token is its class-string (AD-9): as an index value it is the FQCN key, and as
    // column_key or index_key it names the FQCN column.
    const tokenRows = [{ v: "a", k: CONTRACT, [CONTRACT_FQCN]: "c" }];
    const stringRows = [{ v: "a", k: CONTRACT_FQCN, [CONTRACT_FQCN]: "c" }];
    Assert.assertSame(json(p.array_column(stringRows, "v", "k")), json(p.array_column(tokenRows, "v", "k")));
    Assert.assertSame(json({ [CONTRACT_FQCN]: "a" }), json(p.array_column(tokenRows, "v", "k")));
    Assert.assertSame(json(p.array_column(stringRows, CONTRACT_FQCN)), json(p.array_column(stringRows, CONTRACT)));
    Assert.assertSame(json(["c"]), json(p.array_column(stringRows, CONTRACT)));
    Assert.assertSame(json(p.array_column(stringRows, "v", CONTRACT_FQCN)), json(p.array_column(stringRows, "v", CONTRACT)));
    Assert.assertSame(json({ c: "a" }), json(p.array_column(stringRows, "v", CONTRACT)));
  },
);

xaravelTest(
  "XT-runtime-150",
  "rawurldecode gives PHP 8.5.11's results: each %XX (either hex case) is its byte, + stays +, a lone % or one not followed by two hex digits stays as it is, and the argument is coerced as PHP's string parameter (an int, a bool, null, a float, a __toString object) with PHP's TypeError for anything else (ESC-16.1-2)",
  () => {
    assertProbeLabels(["rawurldecode", "rawurldecode.coercion"]);
    // Xaravel-only: a result that is no valid UTF-8 throws DIV-9.18's JS TypeError.
    for (const input of ["%FF", "%C3", "a%e2%82"]) {
      Assert.assertSame("JS TypeError: rawurldecode(): the result splits a UTF-8 sequence, which JS cannot hold", attempt(() => p.rawurldecode(input)), input);
    }
    // Xaravel-only: an input holding a lone surrogate, which has no UTF-8 form, throws a JS TypeError.
    Assert.assertSame("JS TypeError: rawurldecode(): the string holds a lone surrogate, which has no UTF-8 form", attempt(() => p.rawurldecode("a\uD800")));
    // Xaravel-only: undefined reads as null, which coerces to "".
    Assert.assertSame("", p.rawurldecode(undefined));
  },
);

xaravelTest(
  "XT-runtime-151",
  "array_column and rawurldecode are registry entries with PHP's ReflectionFunction counts (2 required and 3 in all; exactly 1) and ArgumentCountErrors, function_exists finds them, and both are exported from the root and @xaravel/runtime/php as the same objects (ESC-16.1-2)",
  () => {
    assertProbeLabels(["reflection", "counts"]);
    // Every recorded label is computed.
    for (const label of evidence.keys()) {
      Assert.assertNotNull(PROBE_CASES[label] ?? null, label);
    }
    for (const name of ["array_column", "rawurldecode"]) {
      const fromPhp = (p as Record<string, unknown>)[name];
      Assert.assertNotNull(fromPhp ?? null, name);
      Assert.assertSame(fromPhp, (root as Record<string, unknown>)[name], name);
      Assert.assertSame(fromPhp, PHP_FUNCTIONS[name]!.fn, name);
      Assert.assertTrue(p.is_callable(name), name);
    }
  },
);
