// Xaravel Tests for Story 9.7: the `phpSerialize` / `phpUnserialize` codec (AD-23.1, AD-9, AD-10). One test per
// acceptance-criterion row of the manifest, in order. Each compares with the signed Oracle fixture of
// `conformance/oracle-requests/9.7.jsonl` (XT-runtime-25 reads XT-runtime-24's); a missing fixture fails the test.
//
// F-10 recorded reason: XT-runtime-24..26 are Xaravel Tests (stories/9.7.md has no test_ids), so no Upstream test
// exists whose inputs the requests could take. Per docs/ops/oracle.md § Per-Story requests ("A Story that needs
// expected values for other inputs (an Xaravel Differential suite …) commits conformance/oracle-requests/<story-id>.jsonl";
// an Xaravel Test ID runs bound to a bare PHPUnit TestCase) and epics.md (Epic 9: "verified by Oracle Differential
// Tests"), the requests evaluate only the PHP constructs the acceptance criteria name (`serialize()`, `unserialize()`
// with and without `allowed_classes`) over ints, floats, bools, null, UTF-8 strings, lists, maps, stdClass objects and
// three fixture classes declared in the request (`XaravelFixture\Serialize\Point`, `Packed`, `Sleepy`), and contain no
// Laravel code and no Upstream fixture.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { __PHP_Incomplete_Class, float, isFloat, PhpArray, PhpFloat, phpSerialize, phpUnserialize, stdClass } from "@xaravel/runtime/php";
import * as root from "@xaravel/runtime";
import { fqcn, registerClass } from "@xaravel/runtime/registry";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");

/** The part of the grader's Oracle helpers (`packages/assert/tests/xaravel/oracle-values.ts`) this file uses. */
interface Output {
  error: unknown;
  results: ({ value: unknown } | { throws: unknown })[];
}
interface OracleValues {
  decode: (encoded: unknown) => unknown;
  readRequests: (path: string) => { id: string; sha256: string }[];
  readSignedFixture: (path: string, sha256: string, publicKeyPem: string) => Output;
}

// The runtime has no dependencies (AD-2), so its tsc project cannot reference @xaravel/assert's test files; the
// grader's fixture reader is loaded at run time instead of being re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;
const REQUESTS = "conformance/oracle-requests/9.7.jsonl";
const FIXTURES = "conformance/fixtures/runtime";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";
const PHP_ARRAY = Symbol.for("xaravel.php.array");
const RECURSION = "Nesting level too deep - recursive dependency?";

/** The signed Oracle output of the Story's one request for `id`. */
function oracle(id: string): Output {
  const requests = readRequests(join(REPO, REQUESTS)).filter((request) => request.id === id);
  if (requests.length !== 1) {
    throw new Error(`${REQUESTS}: expected one request for ${id}, found ${requests.length}`);
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

/** The `[key, encoded value]` pairs of an encoded array. */
function rawEntries(encoded: unknown): unknown[][] {
  return (encoded as { array: unknown[][] }).array;
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

function assertThrows(fn: () => unknown, type: new (...args: never[]) => Error, message: string): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof type, `expected a ${type.name}: ${String(error)}`);
  Assert.assertSame(message, (error as Error).message);
}

/** The JS property a serialized property name stands for: `\0*\0x` and `\0Class\0x` are `x`. */
function unmangle(name: string): string {
  return name.startsWith("\0") && name.indexOf("\0", 1) !== -1 ? name.slice(name.indexOf("\0", 1) + 1) : name;
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
  return Object.keys(value).map((key) => [/^(?:0|-?[1-9]\d*)$/.test(key) ? Number(key) : key, (value as Record<string, unknown>)[key]]);
}

/** A JS object's properties by name, as PHP's `(array)` cast unmangled shows them. */
function jsProps(value: object): Map<string, unknown> {
  if (value instanceof __PHP_Incomplete_Class) {
    return new Map([["__PHP_Incomplete_Class_Name", value.__PHP_Incomplete_Class_Name], ...value.entries().map(([key, item]) => [unmangle(key), item] as [string, unknown])]);
  }
  return new Map(Object.keys(value).map((key) => [key, (value as Record<string, unknown>)[key]]));
}

/**
 * Where the JS value `js` differs from the Oracle's encoded `encoded`, or null when it is the same PHP value: an int
 * or float of the same kind and value (NAN equal to NAN, -0.0 not 0.0), the same string, an array with the same keys
 * in the same order, an object of the registered class of the same name with the same properties by name (any
 * visibility; JS has none), and a recursion marker at an object being compared up the path.
 */
function differs(js: unknown, encoded: unknown, at: string, path: object[] = []): string | null {
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
    for (let index = 0; index < entries.length; index++) {
      const [key, item] = entries[index]!;
      const expectedKey = decode(expected[index]![0]);
      if (key !== expectedKey) {
        return `${at}: key ${index} is ${String(key)}, the Oracle's ${String(expectedKey)}`;
      }
      const inner = differs(item, expected[index]![1], `${at}[${String(key)}]`, path);
      if (inner !== null) {
        return inner;
      }
    }
    return null;
  }
  if (typeof js !== "object" || js === null || jsEntries(js) !== null) {
    return fail();
  }
  if (typeof value["recursion"] === "string") {
    return path.includes(js) && fqcn(js) === value["recursion"] ? null : fail();
  }
  if (typeof value["object"] !== "string" || fqcn(js) !== value["object"]) {
    return fail();
  }
  const props = jsProps(js);
  const expected = value["properties"] as [string, string, unknown][];
  if (props.size !== expected.length) {
    return `${at}: ${props.size} properties [${[...props.keys()].join(", ")}], the Oracle's ${expected.length}`;
  }
  for (const [name, , item] of expected) {
    if (!props.has(name)) {
      return `${at}: no property ${name}`;
    }
    const inner = differs(props.get(name), item, `${at}->${name}`, [...path, js]);
    if (inner !== null) {
      return inner;
    }
  }
  return null;
}

class XtPoint {
  constructor(
    public x: unknown,
    public y: unknown,
  ) {}
}
registerClass("XaravelFixture\\Serialize\\Point", XtPoint);

class XtPacked {
  constructor(
    public secret: unknown,
    public hidden: unknown,
    public open: unknown,
  ) {}

  __serialize(): Record<string, unknown> {
    return { "\0*\0secret": this.secret, "\0XaravelFixture\\Serialize\\Packed\0hidden": this.hidden, open: this.open };
  }

  __unserialize(data: Record<string, unknown>): void {
    this.secret = data["\0*\0secret"];
    this.hidden = data["\0XaravelFixture\\Serialize\\Packed\0hidden"];
    this.open = data["open"];
  }
}
registerClass("XaravelFixture\\Serialize\\Packed", XtPacked);

class XtSleepy {
  skip: unknown = "dropped";

  constructor(
    public a: unknown,
    public b: unknown,
  ) {}

  __sleep(): string[] {
    return ["a", "b"];
  }

  __wakeup(): void {
    this.skip = "woken";
  }
}
registerClass("XaravelFixture\\Serialize\\Sleepy", XtSleepy);

/** Records the order in which `__wakeup` / `__unserialize` run. */
const hookLog: string[] = [];

class XtWaker {
  n: unknown = null;

  __wakeup(): void {
    hookLog.push(`wakeup ${String(this.n)}`);
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtWaker", XtWaker);

class XtUnpacker {
  n: unknown = null;

  __serialize(): Record<string, unknown> {
    return { n: this.n };
  }

  __unserialize(data: Record<string, unknown>): void {
    hookLog.push(`unserialize ${String((data["n"] as XtWaker).n)}`);
    this.n = data["n"];
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtUnpacker", XtUnpacker);

class XtMangledSleep {
  a = 1;
  b = 2;
  c = 3;

  __sleep(): unknown {
    return ["a", "\0*\0b", "missing", "c"];
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtMangledSleep", XtMangledSleep);

class XtBadSleep {
  a = 1;

  __sleep(): unknown {
    return "a";
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtBadSleep", XtBadSleep);

class XtBadSerialize {
  __serialize(): unknown {
    return "no array";
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtBadSerialize", XtBadSerialize);

class XtPropsPort {
  readonly #x = 7;

  [Symbol.for("xaravel.php.props")](): unknown {
    return new PhpArray<number | string, unknown>([
      ["x", this.#x],
      [5, "five"],
    ]);
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtPropsPort", XtPropsPort);

class XtUnregistered {}

/** The values of the request's `$v`, built in JS as a port builds them (integral floats marked, DIV-9.4). */
function matrix(): unknown[] {
  const self = new stdClass();
  self.name = "me";
  self.self = self;
  const p = new XtPoint(1, 2);
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
    9007199254740992n,
    float(0),
    -0,
    float(1),
    0.1,
    0.1 + 0.2,
    float(1e15),
    1e16,
    1e17,
    1e100,
    1e-5,
    0.0001,
    5e-324,
    1.7976931348623157e308,
    Infinity,
    -Infinity,
    NaN,
    -1.5,
    "",
    "abc",
    "é",
    "日本語",
    "😀",
    'say "hi"; ok',
    "a\0b",
    "line\nbreak",
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
      ["5", "five"],
      ["05", "oh-five"],
    ]),
    [[], { x: [] }],
    new stdClass(),
    Object.assign(new stdClass(), { a: 1, b: [1, 2] }),
    self,
    new XtPoint(1, 2.5),
    new XtPacked("s", [1, 2], "o"),
    new XtSleepy(1, "two"),
    [p, p, [p]],
  ];
}

xaravelTest(
  "XT-runtime-24",
  "phpSerialize gives the bytes of the Oracle's serialize() over ints, floats, bools, null, UTF-8 strings, lists, maps and objects (stdClass, public props, __serialize, __sleep, shared and self-referencing), each value alone and the whole list, and throws PHP's errors (AD-23.1)",
  () => {
    const output = oracle("XT-runtime-24");
    const v = matrix();
    const raw = rawEntries(rawResult(output, 0));
    const serialized = decode(rawResult(output, 1)) as string[];
    Assert.assertSame(raw.length, v.length);
    Assert.assertSame(raw.length, serialized.length);
    const mismatches: string[] = [];
    v.forEach((value, index) => {
      // The JS input is the Oracle's $v[index].
      const difference = differs(value, raw[index]![1], `$v[${index}]`);
      if (difference !== null) {
        mismatches.push(`input ${difference}`);
      }
      const actual = phpSerialize(value);
      if (actual !== serialized[index]) {
        mismatches.push(`serialize($v[${index}]): Oracle ${JSON.stringify(serialized[index])}, got ${JSON.stringify(actual)}`);
      }
    });
    const whole = decode(rawResult(output, 2)) as string;
    const actualWhole = phpSerialize(v);
    if (actualWhole !== whole) {
      mismatches.push(`serialize($v): Oracle ${JSON.stringify(whole)}, got ${JSON.stringify(actualWhole)}`);
    }
    Assert.assertSame("", mismatches.join("\n"), `${mismatches.length} mismatch(es) with the Oracle`);

    // __sleep: names verbatim, a missing name skipped; a result that is no array writes N; as PHP does.
    Assert.assertSame('O:36:"Xaravel\\Tests\\Runtime\\XtMangledSleep":3:{s:1:"a";i:1;s:4:"\0*\0b";i:2;s:1:"c";i:3;}', phpSerialize(new XtMangledSleep()));
    Assert.assertSame("N;", phpSerialize(new XtBadSleep()));
    // The props protocol, always as s: keys.
    Assert.assertSame('O:33:"Xaravel\\Tests\\Runtime\\XtPropsPort":2:{s:1:"x";i:7;s:1:"5";s:4:"five";}', phpSerialize(new XtPropsPort()));
    // undefined reads as null; the root exports the codec.
    Assert.assertSame("N;", phpSerialize(undefined));
    Assert.assertSame("a:1:{i:0;N;}", phpSerialize([undefined]));
    Assert.assertSame("d:1;", phpSerialize(float(1)));
    Assert.assertSame("i:1;", phpSerialize(1));

    // PHP's errors.
    assertThrows(() => phpSerialize(() => 1), Error, "Serialization of 'Closure' is not allowed");
    assertThrows(() => phpSerialize([1, () => 1]), Error, "Serialization of 'Closure' is not allowed");
    assertThrows(() => phpSerialize(new XtBadSerialize()), TypeError, "Xaravel\\Tests\\Runtime\\XtBadSerialize::__serialize() must return an array");
    Assert.assertTrue(thrownBy(() => phpSerialize(new XtUnregistered())) instanceof TypeError, "an unregistered class is a TypeError");
    Assert.assertTrue(thrownBy(() => phpSerialize("\uD800")) instanceof TypeError, "a lone surrogate is a TypeError");
    Assert.assertTrue(thrownBy(() => phpSerialize(2n ** 63n)) instanceof TypeError, "a bigint beyond int64 is a TypeError");
    const loop: unknown[] = [1];
    loop.push(loop);
    assertThrows(() => phpSerialize(loop), Error, RECURSION);
    // The same JS array twice, not inside itself, is two PHP array values.
    const twice = [1];
    Assert.assertSame("a:2:{i:0;a:1:{i:0;i:1;}i:1;a:1:{i:0;i:1;}}", phpSerialize([twice, twice]));

    Assert.assertSame(phpSerialize, root.phpSerialize);
    Assert.assertSame(stdClass, root.stdClass);
    Assert.assertSame("stdClass", fqcn(new stdClass()));
    Assert.assertSame("__PHP_Incomplete_Class", fqcn(new __PHP_Incomplete_Class("X")));
  },
);

xaravelTest(
  "XT-runtime-25",
  "phpUnserialize of each Oracle serialize() string rebuilds the Oracle's unserialize() value: AD-9 arrays, marked integral floats, registered classes without their constructor, __unserialize and __wakeup after the parse, shared and self-referencing objects identical; re-serializing gives the same bytes; malformed payloads are false (AD-23.1)",
  () => {
    const output = oracle("XT-runtime-24");
    const serialized = decode(rawResult(output, 1)) as string[];
    const rebuilt = rawEntries(rawResult(output, 3));
    Assert.assertSame(serialized.length, rebuilt.length);
    const mismatches: string[] = [];
    const values = serialized.map((payload, index) => {
      const value = phpUnserialize(payload);
      const difference = differs(value, rebuilt[index]![1], `unserialize($v[${index}])`);
      if (difference !== null) {
        mismatches.push(difference);
      }
      const again = phpSerialize(value);
      if (again !== payload) {
        mismatches.push(`serialize(unserialize($v[${index}])): ${JSON.stringify(payload)}, got ${JSON.stringify(again)}`);
      }
      return value;
    });
    const whole = decode(rawResult(output, 2)) as string;
    const again = phpSerialize(phpUnserialize(whole));
    if (again !== whole) {
      mismatches.push(`serialize(unserialize(serialize($v))): ${JSON.stringify(whole)}, got ${JSON.stringify(again)}`);
    }
    Assert.assertSame("", mismatches.join("\n"), `${mismatches.length} mismatch(es) with the Oracle`);

    // Class identity, no constructor, the hooks; shared and self-referencing objects.
    const byClass = (klass: abstract new (...args: never[]) => unknown): unknown => values.find((value) => value instanceof klass);
    Assert.assertTrue(byClass(XtPoint) instanceof XtPoint, "a Point");
    Assert.assertSame("o", (byClass(XtPacked) as XtPacked).open);
    Assert.assertSame("woken", (byClass(XtSleepy) as XtSleepy).skip);
    const self = values.find((value) => value instanceof stdClass && (value as stdClass)["self"] !== undefined) as stdClass;
    Assert.assertSame(self, self["self"]);
    const shared = values[values.length - 1] as [XtPoint, XtPoint, [XtPoint]];
    Assert.assertTrue(shared[0] instanceof XtPoint, "a Point");
    Assert.assertSame(shared[0], shared[1]);
    Assert.assertSame(shared[0], shared[2][0]);
    Assert.assertTrue(phpUnserialize("d:1;") instanceof PhpFloat, "an integral d: is marked");
    Assert.assertSame(0.5, phpUnserialize("d:0.5;"));
    Assert.assertTrue(Object.is(-0, phpUnserialize("d:-0;")), "-0.0");
    Assert.assertSame(9007199254740993n, phpUnserialize("i:9007199254740993;"));
    Assert.assertTrue(phpUnserialize("a:2:{i:5;s:1:\"a\";i:2;s:1:\"b\";}") instanceof PhpArray, "a PhpArray");
    Assert.assertSame("[5,2]", JSON.stringify([...(phpUnserialize("a:2:{i:5;s:1:\"a\";i:2;s:1:\"b\";}") as PhpArray).keys()]));
    // A "__proto__" key stays an entry.
    const proto = phpUnserialize('a:1:{s:9:"__proto__";i:1;}') as Record<string, unknown>;
    Assert.assertTrue(Object.getPrototypeOf(proto) === Object.prototype, "the prototype is kept");
    Assert.assertSame('["__proto__"]', JSON.stringify(Object.keys(proto)));
    // A JS array twice: two PHP arrays, so two JS arrays.
    const pair = phpUnserialize("a:2:{i:0;a:0:{}i:1;a:0:{}}") as unknown[][];
    Assert.assertTrue(pair[0] !== pair[1], "two arrays");
    // R: reads a slot without taking one; r: takes one.
    Assert.assertSame("[5,5]", JSON.stringify(phpUnserialize("a:2:{i:0;i:5;i:1;R:2;}")));
    const viaRef = phpUnserialize('O:8:"stdClass":1:{s:1:"a";R:1;}') as stdClass;
    Assert.assertSame(viaRef, viaRef["a"]);
    const slots = phpUnserialize('a:3:{i:0;O:8:"stdClass":0:{}i:1;r:2;i:2;O:8:"stdClass":0:{}}') as stdClass[];
    Assert.assertSame(slots[0], slots[1]);
    Assert.assertTrue(slots[2] !== slots[0], "r: took slot 3");
    // Every __wakeup / __unserialize runs after the parse, in the order PHP runs them (each object's payload complete).
    hookLog.length = 0;
    const hooked = phpSerialize([Object.assign(new XtWaker(), { n: 1 }), Object.assign(new XtUnpacker(), { n: Object.assign(new XtWaker(), { n: 2 }) }), Object.assign(new XtWaker(), { n: 3 })]);
    phpUnserialize(hooked);
    Assert.assertSame("wakeup 1,wakeup 2,unserialize 2,wakeup 3", hookLog.join(","));

    // Malformed payloads are false, as PHP returns them; trailing data is ignored; i: beyond int64 saturates.
    for (const payload of [
      "",
      "x",
      "N",
      "b:2;",
      "b:1",
      'i:;',
      "i:1.5;",
      's:5:"abc";',
      's:3:"abc"',
      'a:2:{i:0;i:1;}',
      'a:1:{i:0;i:1;',
      'a:1:{N;i:1;}',
      'a:1:{d:1;i:1;}',
      "a:2:{i:0;i:5;i:1;r:2;}",
      "a:1:{i:0;r:9;}",
      "a:1:{i:0;r:1;}",
      "r:1;",
      "d:abc;",
      "d:+INF;",
      "d:1e;",
      'O:8:"stdClass":1:{s:1:"a";}',
      'O:3:"a b":0:{}',
      'O:0:"":0:{}',
      'E:7:"Foo:Bar";',
      'C:3:"Foo":0:{}',
      "a:1:{i:0;".repeat(4097) + "N;" + "}".repeat(4097),
    ]) {
      Assert.assertFalse(phpUnserialize(payload), `unserialize(${JSON.stringify(payload.slice(0, 40))})`);
    }
    Assert.assertSame(4096, (() => {
      let depth = 0;
      let value = phpUnserialize("a:1:{i:0;".repeat(4096) + "N;" + "}".repeat(4096));
      while (Array.isArray(value)) {
        depth++;
        value = value[0] as unknown;
      }
      return depth;
    })());
    Assert.assertFalse(phpUnserialize(undefined));
    Assert.assertFalse(phpUnserialize(null));
    Assert.assertFalse(phpUnserialize("b:0;"));
    Assert.assertSame(5, phpUnserialize("i:5;junk"));
    Assert.assertSame(9223372036854775807n, phpUnserialize("i:99999999999999999999;"));
    Assert.assertSame(-9223372036854775808n, phpUnserialize("i:-99999999999999999999;"));
    Assert.assertSame(1000, Number(phpUnserialize("d:1e3;")));
    Assert.assertSame(0.5, phpUnserialize("d:.5;"));
    Assert.assertSame(-Infinity, phpUnserialize("d:-INF;"));
    Assert.assertTrue(Number.isNaN(phpUnserialize("d:NAN;") as number), "NAN");
    Assert.assertSame("aAb", phpUnserialize('S:3:"a\\41b";'));
    Assert.assertSame("é", phpUnserialize('s:2:"é";'));
    Assert.assertFalse(phpUnserialize('s:1:"é";'));
    // A string JS cannot hold, and a payload with a lone surrogate: TypeError.
    Assert.assertTrue(thrownBy(() => phpUnserialize('S:1:"\\ff";')) instanceof TypeError, "invalid UTF-8 is a TypeError");
    Assert.assertTrue(thrownBy(() => phpUnserialize('s:1:"\uD800";')) instanceof TypeError, "a lone surrogate is a TypeError");
    Assert.assertSame(phpUnserialize, root.phpUnserialize);
  },
);

xaravelTest(
  "XT-runtime-26",
  "phpUnserialize(s, { allowedClasses }) rebuilds a class outside the list (false, a case-insensitive list, an unregistered class) as __PHP_Incomplete_Class with the Oracle's props and no hook run, rebuilds the allowed ones, and re-serializing an incomplete object restores the original bytes (AD-23.1)",
  () => {
    const output = oracle("XT-runtime-26");
    const s = decode(rawResult(output, 0)) as string;
    const mismatches: string[] = [];
    const check = (value: unknown, index: number, label: string): void => {
      const difference = differs(value, rawResult(output, index), label);
      if (difference !== null) {
        mismatches.push(difference);
      }
    };
    const none = phpUnserialize(s, { allowedClasses: false });
    check(none, 1, "allowed_classes false");
    const points = phpUnserialize(s, { allowedClasses: ["xaravelfixture\\serialize\\point"] });
    check(points, 2, "allowed_classes [point]");
    check(phpUnserialize(s, { allowedClasses: ["stdClass"] }), 3, "allowed_classes [stdClass]");
    const noneAgain = phpSerialize(none);
    if (noneAgain !== decode(rawResult(output, 4))) {
      mismatches.push(`serialize(allowed_classes false): Oracle ${JSON.stringify(decode(rawResult(output, 4)))}, got ${JSON.stringify(noneAgain)}`);
    }
    const pointsAgain = phpSerialize(points);
    if (pointsAgain !== decode(rawResult(output, 5))) {
      mismatches.push(`serialize(allowed_classes [point]): Oracle ${JSON.stringify(decode(rawResult(output, 5)))}, got ${JSON.stringify(pointsAgain)}`);
    }
    const ghost = decode(rawResult(output, 6)) as string;
    const ghostValue = phpUnserialize(ghost);
    check(ghostValue, 7, "an unregistered class");
    const ghostAgain = phpSerialize(ghostValue);
    if (ghostAgain !== decode(rawResult(output, 8))) {
      mismatches.push(`serialize(ghost): Oracle ${JSON.stringify(decode(rawResult(output, 8)))}, got ${JSON.stringify(ghostAgain)}`);
    }
    Assert.assertSame("", mismatches.join("\n"), `${mismatches.length} mismatch(es) with the Oracle`);

    // The incomplete objects: the original name, no hook run; the allowed class rebuilt.
    const incomplete = none as unknown[];
    Assert.assertTrue(incomplete[0] instanceof __PHP_Incomplete_Class, "an incomplete object");
    Assert.assertSame("XaravelFixture\\Serialize\\Point", (incomplete[0] as __PHP_Incomplete_Class).__PHP_Incomplete_Class_Name);
    Assert.assertSame(s, noneAgain);
    Assert.assertTrue((points as unknown[])[0] instanceof XtPoint, "an allowed Point");
    Assert.assertTrue((points as unknown[])[1] instanceof __PHP_Incomplete_Class, "Packed is not allowed");
    Assert.assertTrue(ghostValue instanceof __PHP_Incomplete_Class, "an unregistered class is incomplete");
    // The default allows every registered class; a list is compared case-insensitively.
    const all = phpUnserialize(s) as unknown[];
    Assert.assertTrue(all[1] instanceof XtPacked, "a Packed");
    Assert.assertSame("woken", (all[2] as XtSleepy).skip);
    Assert.assertTrue((phpUnserialize(s, { allowedClasses: ["XARAVELFIXTURE\\SERIALIZE\\SLEEPY"] }) as unknown[])[2] instanceof XtSleepy, "case-insensitive");
    Assert.assertTrue((phpUnserialize(s, { allowedClasses: true }) as unknown[])[3] instanceof stdClass, "a stdClass");
    Assert.assertSame(__PHP_Incomplete_Class, root.__PHP_Incomplete_Class);
  },
);
