// Xaravel Tests for Story 9.5: `PhpArray`, `Ref`, the float marker, `normalizeNull` and `hasBrand` (AD-9.1, AD-9.2,
// AD-9.4, AD-9.5). One test per acceptance-criterion row of the manifest, in order. XT-runtime-16, 17 and 19 compare
// with the signed Oracle fixtures of `conformance/oracle-requests/9.5.jsonl`; a missing fixture fails the test.
//
// F-10 recorded reason: XT-runtime-16, 17 and 19 are Xaravel Tests (stories/9.5.md has no test_ids), so no Upstream
// test exists whose inputs these requests could take. Per docs/ops/oracle.md § Per-Story requests ("A Story that needs
// expected values for other inputs (an Xaravel Differential suite …) commits
// conformance/oracle-requests/<story-id>.jsonl"; an Xaravel Test ID runs bound to a bare PHPUnit TestCase) and
// epics.md (Epic 9: "verified by Oracle Differential Tests"), each request evaluates only the PHP construct its
// acceptance criterion names, and contains no Laravel code and no Upstream fixture:
//   - XT-runtime-16: the AC's literal `["1" => …, "01" => …, 1.7 => …, true => …, null => …]` plus
//     `array_key_first([$k => 0])` over PHP's key edge cases;
//   - XT-runtime-17: `json_encode` of the matrix arrays;
//   - XT-runtime-19: `is_float` over the listed values.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Error as PhpError, float, hasBrand, isFloat, jsonEncode, normalizeNull, PhpArray, PhpFloat, Ref, TypeError as PhpTypeError } from "@xaravel/runtime/php";
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
const REQUESTS = "conformance/oracle-requests/9.5.jsonl";
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

/** The one key of a one-entry `PhpArray` built with `key`. */
function keyOf(key: unknown): unknown {
  return [...new PhpArray([[key as string, 0]]).keys()][0];
}

/** The edge keys of XT-runtime-16's `$keys`, in the request's order. */
const EDGE_KEYS: readonly unknown[] = [
  "-0",
  " 1",
  "1.0",
  "+1",
  "00",
  "9223372036854775807",
  "9223372036854775808",
  "-9223372036854775808",
  false,
  -1.9,
  -0,
  NaN,
  Infinity,
  -Infinity,
  1e20,
  -1e20,
  2 ** 63,
  9007199254740993n,
];

class XtValuesPoint {}
registerClass("Xaravel\\Tests\\Runtime\\XtValuesPoint", XtValuesPoint);
class XtValuesUnregistered {}

xaravelTest(
  "XT-runtime-16",
  "a PhpArray built with keys \"1\", \"01\", 1.7, true and null normalises them to 1, \"01\", 1, 1 and \"\" in insertion order, a rewrite keeping the first position, every edge key as the Oracle's PHP, an illegal key throws PHP's TypeError, and its map API normalises keys and pushes at PHP's next free index (AD-9.2)",
  () => {
    const output = oracle("XT-runtime-16");

    // The AC literal: entries in insertion order, normalised keys, and the grader reads the same PHP array.
    const literal = new PhpArray<string | number | boolean | null, string>([
      ["1", "a"],
      ["01", "b"],
      [1.7, "c"],
      [true, "d"],
      [null, "e"],
    ]);
    const entries = [...literal];
    Assert.assertSame(3, entries.length);
    Assert.assertSame(1, entries[0]?.[0]);
    Assert.assertSame("d", entries[0]?.[1]);
    Assert.assertSame("01", entries[1]?.[0]);
    Assert.assertSame("b", entries[1]?.[1]);
    Assert.assertSame("", entries[2]?.[0]);
    Assert.assertSame("e", entries[2]?.[1]);
    const expected = decode(rawResult(output, 0));
    Assert.assertEquals(expected, literal);
    Assert.assertSame(expected, literal);

    // The edge keys, one by one, against `array_key_first([$k => 0])`.
    const oracleKeys = decode(rawResult(output, 1));
    Assert.assertTrue(Array.isArray(oracleKeys), "the Oracle's keys are a list");
    const keys = oracleKeys as unknown[];
    Assert.assertSame(EDGE_KEYS.length, keys.length);
    EDGE_KEYS.forEach((key, index) => {
      Assert.assertSame(keys[index], keyOf(key), `edge key #${index}`);
    });
    // An int beyond ±(2^53 − 1) is a bigint key; the marked float truncates like a float.
    Assert.assertSame(9223372036854775807n, keyOf("9223372036854775807"));
    Assert.assertSame(1, keyOf(float(1)));
    Assert.assertSame(1, keyOf(float(1.7)));
    Assert.assertSame("-9223372036854775809", keyOf("-9223372036854775809"));
    // A bigint outside the int64 range is no PHP int.
    assertPhpThrows(() => new PhpArray([[2n ** 63n, 1]]), PhpTypeError, "Cannot access offset of type int on array");
    assertPhpThrows(() => new PhpArray([[-(2n ** 63n) - 1n, 1]]), PhpTypeError, "Cannot access offset of type int on array");

    // Illegal keys: PHP 8.5's message, the type as PHP names it.
    assertPhpThrows(() => new PhpArray([[[] as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type array on array");
    assertPhpThrows(() => new PhpArray([[new PhpArray() as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type array on array");
    assertPhpThrows(() => new PhpArray([[new XtValuesPoint() as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type Xaravel\\Tests\\Runtime\\XtValuesPoint on array");
    assertPhpThrows(() => new PhpArray([[new XtValuesUnregistered() as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type object on array");
    assertPhpThrows(() => new PhpArray([[(() => 1) as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type Closure on array");
    assertPhpThrows(() => new PhpArray([[undefined as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type undefined on array");
    assertPhpThrows(() => new PhpArray([[Symbol("k") as unknown as string, 1]]), PhpTypeError, "Cannot access offset of type symbol on array");
    assertPhpThrows(() => new PhpArray().get({} as unknown as string), PhpTypeError, "Cannot access offset of type array on array");

    // The map API.
    const map = new PhpArray<string | number, string>();
    Assert.assertSame(0, map.size);
    Assert.assertNull(map.get(0));
    Assert.assertSame(0, map.push("a"));
    map.set("5", "b");
    Assert.assertSame(6, map.push("c"));
    map.set("x", "d");
    Assert.assertSame("b", map.get(5));
    Assert.assertSame("b", map.get("5"));
    Assert.assertSame("b", map.get(5.9));
    Assert.assertTrue(map.has("6"));
    Assert.assertFalse(map.has("05"));
    Assert.assertSame(4, map.size);
    Assert.assertTrue(map.delete("6"));
    Assert.assertFalse(map.delete(6));
    Assert.assertSame(7, map.push("e"));
    Assert.assertSame("[0,5,\"x\",7]", jsonEncode([...map.keys()]));
    Assert.assertSame("[\"a\",\"b\",\"d\",\"e\"]", jsonEncode([...map.values()]));
    Assert.assertSame("[[0,\"a\"],[5,\"b\"],[\"x\",\"d\"],[7,\"e\"]]", jsonEncode([...map.entries()]));
    // A rewrite keeps the first position.
    map.set(0, "z");
    Assert.assertSame(0, [...map.keys()][0]);
    Assert.assertSame("z", map.get(false));
    // A stored undefined reads back as null.
    map.set("u", undefined as unknown as string);
    Assert.assertNull(map.get("u"));
    const pushed = map.push(undefined as unknown as string);
    Assert.assertNull(map.get(pushed));

    // A negative key is followed by key + 1 (PHP >= 8.3), and delete never lowers the next free index.
    const negative = new PhpArray([[-5, "a"]]);
    Assert.assertSame(-4, negative.push("b"));
    const deleted = new PhpArray([[3, "a"]]);
    deleted.delete(3);
    Assert.assertSame(4, deleted.push("b"));

    // Past PHP_INT_MAX: PHP's Error.
    const full = new PhpArray([["9223372036854775807", "a"]]);
    assertPhpThrows(() => full.push("b"), PhpError, "Cannot add element to the array as the next element is already occupied");

    // Exported from the package root, and registered.
    Assert.assertSame(PhpArray, root.PhpArray);
    Assert.assertSame("Xaravel\\Runtime\\Php\\PhpArray", fqcn(PhpArray));
  },
);

xaravelTest(
  "XT-runtime-17",
  "jsonEncode of a PhpArray whose keys are 0..n-1 in order is a list, and any other key set is an object, byte-identical to the Oracle's json_encode (AD-9.2)",
  () => {
    const output = oracle("XT-runtime-17");
    const arrays = [
      new PhpArray([
        [0, "a"],
        [1, "b"],
      ]),
      new PhpArray([
        [1, "a"],
        [0, "b"],
      ]),
      new PhpArray([[1, "a"]]),
      new PhpArray(),
      new PhpArray<string | number, number>([
        ["a", 1],
        [5, 2],
      ]),
      new PhpArray<number, unknown>([
        [
          1,
          new PhpArray([
            [0, "x"],
            [1, "y"],
          ]),
        ],
        [
          0,
          new PhpArray<number | string, unknown>([
            [2, "z"],
            ["k", new PhpArray([[0, true]])],
          ]),
        ],
      ]),
    ];
    Assert.assertSame(arrays.length, output.results.length);
    arrays.forEach((array, index) => {
      Assert.assertSame(decode(rawResult(output, index)), jsonEncode(array), `json_encode #${index}`);
    });
    Assert.assertSame('["a","b"]', jsonEncode(arrays[0]));
    Assert.assertSame('{"1":"a","0":"b"}', jsonEncode(arrays[1]));
    Assert.assertSame('{"1":"a"}', jsonEncode(arrays[2]));
    Assert.assertSame("[]", jsonEncode(arrays[3]));
    Assert.assertSame('{"a":1,"5":2}', jsonEncode(arrays[4]));
    // A bigint key encodes as its digits, and a float value as PHP writes it (Story 9.8).
    Assert.assertSame('{"9223372036854775807":null}', jsonEncode(new PhpArray([["9223372036854775807", null]])));
    Assert.assertSame('{"1":1.5}', jsonEncode(new PhpArray([[1, 1.5]])));
    // A marked float is a float: PHP writes 1.0 as 1.
    Assert.assertSame("1", jsonEncode(float(1)));
    Assert.assertSame("[1]", jsonEncode([float(1)]));
    // PHP's default depth: 512 levels encode, 513 give false (JSON_ERROR_DEPTH).
    let deep: unknown = 1;
    for (let i = 0; i < 512; i++) {
      deep = new PhpArray([[1, deep]]);
    }
    Assert.assertStringStartsWith('{"1":{"1":', jsonEncode(deep) as string);
    const tooDeep = new PhpArray([[1, deep]]);
    Assert.assertSame(false, jsonEncode(tooDeep));
  },
);

xaravelTest("XT-runtime-18", "a function that writes through a Ref<T> box changes the value its caller reads back (AD-9.2)", () => {
  const bump = (x: Ref<number>): void => {
    x.value++;
  };
  const r = new Ref(1);
  bump(r);
  Assert.assertSame(2, r.value);
  const list = new Ref<string[]>([]);
  ((x: Ref<string[]>) => {
    x.value = [...x.value, "a"];
  })(list);
  Assert.assertSame('["a"]', jsonEncode(list.value));
  Assert.assertSame(Ref, root.Ref);
  Assert.assertSame("Xaravel\\Runtime\\Php\\Ref", fqcn(Ref));
});

xaravelTest(
  "XT-runtime-19",
  "a PHP float with an integral value, marked with float(), is isFloat while the plain number stays usable; isFloat matches the Oracle's is_float, and float() of a non-number throws a TypeError (AD-9.4)",
  () => {
    const output = oracle("XT-runtime-19");
    const raw = rawResult(output, 0) as { array: [unknown, Record<string, string>][] };
    const isFloats = decode(rawResult(output, 1)) as unknown[];
    Assert.assertSame(raw.array.length, isFloats.length);
    raw.array.forEach(([, encoded], index) => {
      // A PHP float is marked as it arrives; an int stays a plain number.
      const plain = decode(encoded) as number;
      const value = "float" in encoded ? float(plain) : plain;
      Assert.assertSame(isFloats[index], isFloat(value), `is_float #${index}`);
      if ("float" in encoded) {
        // Unmarked, a float is seen only when it is no int: true for 1.5, NAN, -0.0 and 2^53, false for the integral
        // 1.0, which is why the marker exists.
        const noInt = !Number.isFinite(plain) || !Number.isInteger(plain) || Object.is(plain, -0) || Math.abs(plain) > Number.MAX_SAFE_INTEGER;
        Assert.assertSame(noInt, isFloat(plain), `unmarked is_float #${index}`);
      }
    });

    const one = float(1);
    Assert.assertTrue(isFloat(one));
    Assert.assertFalse(isFloat(1));
    Assert.assertTrue(isFloat(1.5));
    Assert.assertTrue(isFloat(NaN));
    Assert.assertTrue(isFloat(-0));
    Assert.assertTrue(isFloat(2 ** 53));
    Assert.assertFalse(isFloat("1.5"));
    Assert.assertFalse(isFloat(null));
    Assert.assertSame(1, +one);
    Assert.assertSame(1, Number(one));
    Assert.assertSame(2, (one as unknown as number) + 1);
    Assert.assertTrue((one as unknown as number) < 2);
    Assert.assertSame(one, float(one));
    Assert.assertTrue(Object.isFrozen(one));
    Assert.assertTrue(one instanceof PhpFloat);
    assertThrows(() => float("1" as unknown as number), TypeError, "float(): Argument #1 ($n) must be of type float, string given");
    Assert.assertSame(isFloat, root.isFloat);
    Assert.assertSame("Xaravel\\Runtime\\Php\\PhpFloat", fqcn(PhpFloat));
  },
);

xaravelTest("XT-runtime-20", "normalizeNull(undefined) is null, and every other value is returned unchanged (AD-9.1)", () => {
  Assert.assertNull(normalizeNull(undefined));
  Assert.assertNull(normalizeNull(null));
  Assert.assertSame(0, normalizeNull(0));
  Assert.assertSame("", normalizeNull(""));
  Assert.assertSame(false, normalizeNull(false));
  const object = { a: 1 };
  Assert.assertSame(object, normalizeNull(object));
  Assert.assertSame(normalizeNull, root.normalizeNull);
});

xaravelTest(
  "XT-runtime-21",
  "hasBrand(ClassOrInstance, Token) reads a prototype brand getter from a class, a subclass or an instance without instantiating a class, takes a symbol token or one that converts to a symbol, and is false for an unbranded class, null and 1 (AD-9.5)",
  () => {
    const T = Symbol.for("X\\Y");
    let constructed = 0;
    class A {
      constructor() {
        constructed++;
      }

      get [T](): true {
        return true;
      }
    }
    class B extends A {}
    class Plain {}

    Assert.assertTrue(hasBrand(A, T));
    Assert.assertTrue(hasBrand(B, T));
    Assert.assertSame(0, constructed);
    Assert.assertTrue(hasBrand(new B(), T));
    Assert.assertSame(1, constructed);
    Assert.assertFalse(hasBrand(Plain, T));
    Assert.assertFalse(hasBrand(new Plain(), T));
    Assert.assertFalse(hasBrand(null, T));
    Assert.assertFalse(hasBrand(1, T));
    Assert.assertFalse(hasBrand(A, Symbol.for("X\\Z")));

    // A token object whose Symbol.toPrimitive gives the symbol, as `get [Token]()` computes its key.
    const Token = { [Symbol.toPrimitive]: () => T };
    Assert.assertTrue(hasBrand(A, Token));
    Assert.assertTrue(hasBrand(new B(), Token));
    const FunctionToken = Object.assign(() => null, { [Symbol.toPrimitive]: () => T });
    Assert.assertTrue(hasBrand(B, FunctionToken));

    // A token that converts to no symbol.
    assertThrows(() => hasBrand(A, "X\\Y"), TypeError, "hasBrand(): the token does not convert to a symbol");
    assertThrows(() => hasBrand(A, {}), TypeError, "hasBrand(): the token does not convert to a symbol");
    assertThrows(() => hasBrand(A, { [Symbol.toPrimitive]: () => "X\\Y" }), TypeError, "hasBrand(): the token does not convert to a symbol");

    // The PhpArray and float brands sit on their prototypes.
    Assert.assertTrue(hasBrand(PhpArray, Symbol.for("xaravel.php.array")));
    Assert.assertTrue(hasBrand(new PhpArray(), Symbol.for("xaravel.php.array")));
    Assert.assertFalse(Object.hasOwn(new PhpArray(), Symbol.for("xaravel.php.array")));
    Assert.assertTrue(hasBrand(PhpFloat, Symbol.for("xaravel.php.float")));
    Assert.assertTrue(hasBrand(float(1), Symbol.for("xaravel.php.float")));
    Assert.assertSame(hasBrand, root.hasBrand);
  },
);
