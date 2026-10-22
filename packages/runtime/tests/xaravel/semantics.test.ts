// Xaravel Tests for Story 9.6: the PHP semantics helpers `looseEquals`, `spaceship`, `isNumeric`, `toInt`, `toFloat`,
// `toPhpString`, `toBool` and `valueCopy` (AD-9.1, AD-9.2, AD-9.3, AD-9.4, AD-9.6). One test per acceptance-criterion
// row of the manifest, in order. XT-runtime-22 compares with the signed Oracle fixture of
// `conformance/oracle-requests/9.6.jsonl`; a missing fixture fails the test.
//
// F-10 recorded reason: XT-runtime-22 is a Xaravel Test (stories/9.6.md has no test_ids), so no Upstream test exists
// whose inputs the request could take. Per docs/ops/oracle.md § Per-Story requests ("A Story that needs expected
// values for other inputs (an Xaravel Differential suite …) commits conformance/oracle-requests/<story-id>.jsonl"; an
// Xaravel Test ID runs bound to a bare PHPUnit TestCase) and epics.md (Epic 9: "verified by Oracle Differential
// Tests"), the request evaluates only the PHP constructs its acceptance criterion names (`==`, `<=>`, `is_numeric`,
// `(int)`, `(float)`, `(string)`, `(bool)`) over scalars, numeric and whitespace strings, `"1e3"`, `INF`, `NAN`,
// arrays and stdClass objects, and contains no Laravel code and no Upstream fixture.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Error as PhpError, float, isNumeric, jsonEncode, looseEquals, PhpArray, Ref, spaceship, toBool, toFloat, toInt, toPhpString, TypeError as PhpTypeError, valueCopy } from "@xaravel/runtime/php";
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
  BrandedArray: new (entries: Iterable<readonly [number | bigint | string, unknown]>) => object;
}

// The runtime has no dependencies (AD-2), so its tsc project cannot reference @xaravel/assert's test files; the
// grader's fixture reader is loaded at run time instead of being re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { BrandedArray, decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;
const REQUESTS = "conformance/oracle-requests/9.6.jsonl";
const FIXTURES = "conformance/fixtures/runtime";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

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

/** Asserts `fn` throws the ported PHP class `type` itself (its FQCN, not a subclass's) with `message` (Story 9.10). */
function assertPhpThrows(fn: () => unknown, type: abstract new (...args: never[]) => Error, message: string): void {
  const error = thrownBy(fn);
  Assert.assertTrue(error instanceof type, `expected a PHP ${fqcn(type)}: ${String(error)}`);
  Assert.assertSame(fqcn(type), fqcn(error as Error));
  Assert.assertSame(message, (error as Error).message);
}

/**
 * An encoded Oracle value decoded into the AD-9 value model with every PHP float marked by `float()`, as a port
 * receives it: a list is an `Array`, an all-string-keyed array a plain object, any other array a `PhpArray`; an
 * object is the grader's decoded object (its props behind `Symbol.for('xaravel.php.props')`).
 */
function decodeMarked(encoded: unknown): unknown {
  if (typeof encoded !== "object" || encoded === null) {
    return decode(encoded);
  }
  const value = encoded as Record<string, unknown>;
  if (typeof value["float"] === "string") {
    return float(decode(encoded) as number);
  }
  if (Array.isArray(value["array"])) {
    const entries = (value["array"] as [unknown, unknown][]).map(([key, item]) => [typeof key === "string" ? key : (decode(key) as number | bigint), decodeMarked(item)] as const);
    if (entries.every(([key], index) => key === index)) {
      return entries.map(([, item]) => item);
    }
    if (entries.every(([key]) => typeof key === "string")) {
      return Object.fromEntries(entries);
    }
    return new PhpArray(entries);
  }
  return decode(encoded);
}

/** A short form of operand `index` of `$w`, for a mismatch line. */
function show(raw: unknown[][], index: number): string {
  return `$w[${index}] ${JSON.stringify(raw[index]![1])}`;
}

/** Whether two numbers are the same PHP float result (NAN equals NAN, -0.0 is not 0.0). */
function sameFloat(a: number, b: number): boolean {
  return Object.is(a, b);
}

class XtSemanticsName {
  constructor(private readonly name: string) {}

  toString(): string {
    return this.name;
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtSemanticsName", XtSemanticsName);

class XtSemanticsPoint {
  constructor(private readonly x: number) {}

  [Symbol.for("xaravel.php.props")](): unknown {
    return { x: this.x };
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtSemanticsPoint", XtSemanticsPoint);

class XtSemanticsOther {
  constructor(private readonly x: number) {}

  [Symbol.for("xaravel.php.props")](): unknown {
    return { x: this.x };
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtSemanticsOther", XtSemanticsOther);

class XtSemanticsOpaque {}
registerClass("Xaravel\\Tests\\Runtime\\XtSemanticsOpaque", XtSemanticsOpaque);

class XtSemanticsUnregistered {}

class XtSemanticsBadPort {
  toString(): string {
    return 5 as unknown as string;
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtSemanticsBadPort", XtSemanticsBadPort);

class XtSemanticsNode {
  [Symbol.for("xaravel.php.props")](): unknown {
    return { self: this };
  }
}
registerClass("Xaravel\\Tests\\Runtime\\XtSemanticsNode", XtSemanticsNode);

xaravelTest(
  "XT-runtime-22",
  "looseEquals, spaceship, isNumeric, toInt, toFloat, toPhpString and toBool match the Oracle's ==, <=>, is_numeric, (int), (float), (string) and (bool) over scalars, numeric strings, leading-whitespace strings, \"1e3\", INF, NAN, arrays and objects, follow PHP's object and recursion rules, and read undefined as null (AD-9, AD-9.6)",
  () => {
    const output = oracle("XT-runtime-22");
    const raw = (rawResult(output, 0) as { array: unknown[][] }).array;
    const w = raw.map(([, encoded]) => decodeMarked(encoded));
    const mismatches: string[] = [];

    // The == and <=> matrices over every ordered pair.
    const loose = decode(rawResult(output, 1)) as boolean[][];
    const order = decode(rawResult(output, 2)) as number[][];
    Assert.assertSame(w.length, loose.length);
    Assert.assertSame(w.length, order.length);
    for (let i = 0; i < w.length; i++) {
      for (let j = 0; j < w.length; j++) {
        const equal = looseEquals(w[i], w[j]);
        if (equal !== loose[i]![j]) {
          mismatches.push(`${show(raw, i)} == ${show(raw, j)}: Oracle ${String(loose[i]![j])}, got ${String(equal)}`);
        }
        const compared = spaceship(w[i], w[j]);
        if (compared !== order[i]![j]) {
          mismatches.push(`${show(raw, i)} <=> ${show(raw, j)}: Oracle ${String(order[i]![j])}, got ${String(compared)}`);
        }
      }
    }

    // is_numeric, (int), (float) and (bool) over each value.
    const numeric = decode(rawResult(output, 3)) as boolean[];
    const ints = decode(rawResult(output, 4)) as (number | bigint)[];
    const floats = decode(rawResult(output, 5)) as number[];
    const bools = decode(rawResult(output, 6)) as boolean[];
    Assert.assertSame(w.length, numeric.length);
    Assert.assertSame(w.length, ints.length);
    Assert.assertSame(w.length, floats.length);
    Assert.assertSame(w.length, bools.length);
    w.forEach((value, index) => {
      if (isNumeric(value) !== numeric[index]) {
        mismatches.push(`is_numeric(${show(raw, index)}): Oracle ${String(numeric[index])}, got ${String(isNumeric(value))}`);
      }
      if (toInt(value) !== ints[index]) {
        mismatches.push(`(int) ${show(raw, index)}: Oracle ${String(ints[index])}, got ${String(toInt(value))}`);
      }
      if (!sameFloat(toFloat(value), floats[index]!)) {
        mismatches.push(`(float) ${show(raw, index)}: Oracle ${String(floats[index])}, got ${String(toFloat(value))}`);
      }
      if (toBool(value) !== bools[index]) {
        mismatches.push(`(bool) ${show(raw, index)}: Oracle ${String(bools[index])}, got ${String(toBool(value))}`);
      }
    });

    // (string) over $v, the values of $w before the objects, and over the float-format list $f.
    const strings = decode(rawResult(output, 7)) as string[];
    // $v is $w without the four objects of $o.
    Assert.assertSame(w.length - 4, strings.length);
    strings.forEach((expected, index) => {
      const actual = toPhpString(w[index]);
      if (actual !== expected) {
        mismatches.push(`(string) ${show(raw, index)}: Oracle ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    });
    const floatStrings = decode(rawResult(output, 8)) as string[];
    const f = (rawResult(output, 9) as { array: unknown[][] }).array.map(([, encoded]) => decodeMarked(encoded));
    Assert.assertSame(f.length, floatStrings.length);
    f.forEach((value, index) => {
      const actual = toPhpString(value);
      if (actual !== floatStrings[index]) {
        mismatches.push(`(string) $f[${index}] ${String(value)}: Oracle ${JSON.stringify(floatStrings[index])}, got ${JSON.stringify(actual)}`);
      }
    });
    Assert.assertSame("", mismatches.join("\n"), `${mismatches.length} mismatch(es) with the Oracle`);

    // Objects with a toString() port: cast through it; compared with a string through it, with an int as 1.
    const name = new XtSemanticsName("a");
    Assert.assertSame("a", toPhpString(name));
    Assert.assertTrue(looseEquals(name, "a"));
    Assert.assertFalse(looseEquals(name, "b"));
    Assert.assertSame(-1, spaceship(name, "b"));
    Assert.assertSame(1, spaceship("b", name));
    Assert.assertTrue(looseEquals(name, 1));
    Assert.assertTrue(looseEquals(name, float(1)));
    Assert.assertFalse(looseEquals(name, 2));
    Assert.assertTrue(looseEquals(name, true));
    Assert.assertFalse(looseEquals(name, null));
    Assert.assertSame(1, spaceship(name, null));
    Assert.assertSame(-1, spaceship([], name));
    // Without a port: PHP's Error, naming the Registry FQCN, else "object" or "Closure".
    assertPhpThrows(() => toPhpString(new XtSemanticsOpaque()), PhpError, "Object of class Xaravel\\Tests\\Runtime\\XtSemanticsOpaque could not be converted to string");
    assertPhpThrows(() => toPhpString(new XtSemanticsUnregistered()), PhpError, "Object of class object could not be converted to string");
    assertPhpThrows(() => toPhpString(() => 1), PhpError, "Object of class Closure could not be converted to string");
    Assert.assertFalse(looseEquals(new XtSemanticsOpaque(), "a"));
    Assert.assertSame(1, spaceship(new XtSemanticsOpaque(), "a"));
    Assert.assertSame(-1, spaceship("a", new XtSemanticsOpaque()));
    Assert.assertTrue(looseEquals(new XtSemanticsOpaque(), 1));
    Assert.assertSame(1, toInt(new XtSemanticsOpaque()));
    Assert.assertSame(1, toFloat(new XtSemanticsOpaque()));
    Assert.assertTrue(toBool(new XtSemanticsOpaque()));
    // Same class: the props arrays; different classes: uncomparable both ways; no props protocol: identity.
    Assert.assertTrue(looseEquals(new XtSemanticsPoint(1), new XtSemanticsPoint(1)));
    Assert.assertSame(-1, spaceship(new XtSemanticsPoint(1), new XtSemanticsPoint(2)));
    Assert.assertSame(1, spaceship(new XtSemanticsPoint(2), new XtSemanticsPoint(1)));
    Assert.assertTrue(looseEquals(new XtSemanticsPoint(1), new XtSemanticsPoint(float(1) as unknown as number)));
    Assert.assertFalse(looseEquals(new XtSemanticsPoint(1), new XtSemanticsOther(1)));
    Assert.assertSame(1, spaceship(new XtSemanticsPoint(1), new XtSemanticsOther(1)));
    Assert.assertSame(1, spaceship(new XtSemanticsOther(1), new XtSemanticsPoint(1)));
    const opaque = new XtSemanticsOpaque();
    Assert.assertTrue(looseEquals(opaque, opaque));
    Assert.assertFalse(looseEquals(opaque, new XtSemanticsOpaque()));
    Assert.assertSame(1, spaceship(new XtSemanticsOpaque(), new XtSemanticsOpaque()));

    // Recursion: an array containing itself.
    const self: unknown[] = [1];
    self.push(self);
    const other: unknown[] = [1];
    other.push(other);
    Assert.assertTrue(looseEquals(self, self));
    assertThrows(() => looseEquals(self, other), Error, "Nesting level too deep - recursive dependency?");
    assertThrows(() => spaceship(self, other), Error, "Nesting level too deep - recursive dependency?");
    assertThrows(() => valueCopy(self), Error, "Nesting level too deep - recursive dependency?");
    // Recursion through object props: two instances of one class whose props contain the instance itself.
    assertThrows(() => looseEquals(new XtSemanticsNode(), new XtSemanticsNode()), Error, "Nesting level too deep - recursive dependency?");

    // An int beyond ±(2^53 − 1) is a bigint, in and out; a bigint outside int64 is no PHP int.
    Assert.assertSame(9223372036854775807n, toInt("9223372036854775807"));
    Assert.assertSame(9223372036854775807n, toInt("1e30"));
    Assert.assertSame(-9223372036854775808n, toInt(-(2 ** 63)));
    Assert.assertSame(5, toInt(5n));
    Assert.assertTrue(looseEquals(9007199254740993n, "9007199254740993"));
    Assert.assertFalse(looseEquals(9007199254740993n, 9007199254740992n));
    Assert.assertTrue(looseEquals(9007199254740993n, 9007199254740992));
    Assert.assertSame("9223372036854775807", toPhpString(9223372036854775807n));
    Assert.assertTrue(thrownBy(() => toInt(2n ** 63n)) instanceof TypeError);
    Assert.assertTrue(thrownBy(() => looseEquals(2n ** 63n, 1)) instanceof TypeError);

    // undefined reads as null; a PhpArray is an array; the float marker is a float.
    Assert.assertTrue(looseEquals(undefined, null));
    Assert.assertTrue(looseEquals(undefined, ""));
    Assert.assertSame("", toPhpString(undefined));
    Assert.assertSame(0, toInt(undefined));
    Assert.assertFalse(toBool(undefined));
    Assert.assertFalse(isNumeric(undefined));
    Assert.assertTrue(looseEquals(new PhpArray([[1, "a"]]), { 1: "a" }));
    Assert.assertTrue(looseEquals(new PhpArray([[0, "a"]]), ["a"]));
    Assert.assertSame("Array", toPhpString(new PhpArray()));
    Assert.assertSame("1.0E+15", toPhpString(float(1e15)));
    Assert.assertSame("1000000000000000", toPhpString(1e15));
    Assert.assertSame("1", toPhpString(toFloat("1")));
    Assert.assertTrue(isNumeric(float(1)));
    Assert.assertSame("-0", toPhpString(-0));
    // A toString() port that returns no string: PHP's TypeError.
    assertPhpThrows(() => toPhpString(new XtSemanticsBadPort()), PhpTypeError, "Xaravel\\Tests\\Runtime\\XtSemanticsBadPort::__toString(): Return value must be of type string, int returned");
    // A brand-only array (the grader's BrandedArray) is a PHP array.
    Assert.assertFalse(toBool(new BrandedArray([])));
    Assert.assertSame(0, toInt(new BrandedArray([])));
    Assert.assertTrue(toBool(new BrandedArray([[1, "a"]])));
    Assert.assertSame(1, toInt(new BrandedArray([[1, "a"]])));
    Assert.assertTrue(looseEquals(new BrandedArray([[1, "a"], ["k", 2]]), new PhpArray<number | string, unknown>([[1, "a"], ["k", 2]])));

    // Exported from the package root.
    Assert.assertSame(looseEquals, root.looseEquals);
    Assert.assertSame(spaceship, root.spaceship);
    Assert.assertSame(isNumeric, root.isNumeric);
    Assert.assertSame(toInt, root.toInt);
    Assert.assertSame(toFloat, root.toFloat);
    Assert.assertSame(toPhpString, root.toPhpString);
    Assert.assertSame(toBool, root.toBool);
  },
);

xaravelTest(
  "XT-runtime-23",
  "valueCopy(x) of a nested array or PhpArray copies every array level with its kind, key order and next free index, shares objects and Refs by handle, so mutating the copy leaves the original unchanged (AD-9.2)",
  () => {
    const point = new XtSemanticsOpaque();
    const ref = new Ref(1);
    const nested = new PhpArray<number | string, unknown>([
      [5, 1],
      ["list", [1, [2, 3]]],
      ["map", { a: [1], b: new PhpArray([[2, "x"]]) }],
    ]);
    const original = { list: [1, 2, { k: "v" }], php: nested, point, ref };
    const before = jsonEncode([original.list, [...nested.keys()]]);
    const copy = valueCopy(original);

    // Every array level is new and of the same kind; objects are shared.
    Assert.assertTrue(original !== copy, "a new array");
    Assert.assertTrue(original.list !== copy.list, "a new array");
    Assert.assertTrue(Array.isArray(copy.list));
    Assert.assertTrue(original.list[2] !== copy.list[2], "a new array");
    Assert.assertTrue(copy.php instanceof PhpArray);
    Assert.assertTrue(nested !== copy.php, "a new array");
    Assert.assertSame("[5,\"list\",\"map\"]", jsonEncode([...copy.php.keys()]));
    const copiedMap = copy.php.get("map") as { a: number[]; b: PhpArray };
    const originalMap = nested.get("map") as { a: number[]; b: PhpArray };
    Assert.assertTrue(originalMap !== copiedMap, "a new array");
    Assert.assertSame(Object.getPrototypeOf(originalMap), Object.getPrototypeOf(copiedMap));
    Assert.assertTrue(originalMap.a !== copiedMap.a, "a new array");
    Assert.assertTrue(originalMap.b !== copiedMap.b, "a new array");
    Assert.assertTrue(copiedMap.b instanceof PhpArray);
    Assert.assertSame(point, copy.point);
    Assert.assertSame(ref, copy.ref);

    // Mutating the copy at every level leaves the original unchanged.
    const originalInner = (nested.get("list") as unknown[])[1] as number[];
    const copiedInner = (copy.php.get("list") as unknown[])[1] as number[];
    Assert.assertTrue(originalInner !== copiedInner, "a new array");
    copiedInner.push(4);
    copiedInner[0] = 9;
    copy.list.push(3);
    (copy.list[2] as Record<string, string>)["k"] = "changed";
    copy.php.set(5, 99);
    copy.php.push("pushed");
    copiedMap.a.push(2);
    copiedMap.b.set(2, "y");
    (copy.php.get("list") as unknown[]).pop();
    Assert.assertSame(before, jsonEncode([original.list, [...nested.keys()]]));
    Assert.assertSame("v", (original.list[2] as Record<string, string>)["k"]);
    Assert.assertSame(1, nested.get(5));
    Assert.assertSame(3, nested.size);
    Assert.assertSame("[1]", jsonEncode(originalMap.a));
    Assert.assertSame("x", originalMap.b.get(2));
    Assert.assertSame(2, (nested.get("list") as unknown[]).length);
    Assert.assertSame("[2,3]", jsonEncode(originalInner));
    // A shared Ref is one box.
    copy.ref.value = 2;
    Assert.assertSame(2, ref.value);

    // The next free index survives the copy: [5 => 1], unset 5, copy, push gives key 6.
    const sparse = new PhpArray([[5, 1]]);
    sparse.delete(5);
    Assert.assertSame(6, valueCopy(sparse).push(2));
    Assert.assertSame(6, sparse.push(2));

    // A null-prototype map keeps its prototype; a scalar is returned as it is; undefined is null.
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { a: [1] });
    const bareCopy = valueCopy(bare);
    Assert.assertNull(Object.getPrototypeOf(bareCopy));
    Assert.assertTrue(bare["a"] !== bareCopy["a"], "a new array");
    Assert.assertSame("s", valueCopy("s"));
    Assert.assertSame(9223372036854775807n, valueCopy(9223372036854775807n));
    Assert.assertNull(valueCopy(undefined));
    Assert.assertSame(point, valueCopy(point));
    // A brand-only array (the grader's BrandedArray) is copied into a PhpArray with the same entries.
    const branded = new BrandedArray([[1, "a"], ["k", [2]]]);
    const brandedCopy = valueCopy(branded);
    Assert.assertTrue(brandedCopy instanceof PhpArray, "a PhpArray");
    Assert.assertSame('[[1,"a"],["k",[2]]]', jsonEncode([...(brandedCopy as PhpArray)]));
    // An own "__proto__" key stays an entry and leaves the prototype alone.
    const proto = JSON.parse('{"__proto__": [1], "a": 2}') as Record<string, unknown>;
    const protoCopy = valueCopy(proto);
    Assert.assertTrue(Object.getPrototypeOf(protoCopy) === Object.prototype, "the prototype is kept");
    Assert.assertSame('["__proto__","a"]', jsonEncode(Object.keys(protoCopy)));
    Assert.assertSame(valueCopy, root.valueCopy);
  },
);
