// Xaravel Tests for Story 14.1: PHP array keys and shapes through Collection and LazyCollection (XT-collections-1),
// the ArrayAccess forms of DIV-12.6 and DIV-12.17 (XT-collections-2), and LazyCollection's sources (XT-collections-3).
// One test per Xaravel acceptance-criterion row of the manifest, in order.
//
// XT-collections-1 compares with the signed Oracle fixture of `conformance/oracle-requests/14.1.jsonl`; a missing
// fixture fails the test. F-10 recorded reason: XT-collections-1 is a Xaravel Test, so no Upstream test exists whose
// inputs the request could take. Per docs/ops/oracle.md § Per-Story requests, the request evaluates only the inputs its
// acceptance criterion names (epics.md Story 14.1: "integer-like string keys and mixed keys … `toArray()` and
// `jsonEncode` produce the list or object shape that the Oracle produces"): an array with integer-like, leading-zero,
// negative, `-0` and repeated keys, a list written with string keys, a list with a gap, and a filtered list, each read
// back through `toArray()`, `toJson()` and `json_encode`, on Collection and LazyCollection. It contains no Upstream
// test and no fixture.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Collection, collect, LazyCollection } from "@xaravel/collections";
import { Arrayable } from "@xaravel/contracts/support";
import { arrayEntries, InvalidArgumentException, jsonEncode, keyed, PhpArray } from "@xaravel/runtime";

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

// The grader's fixture reader is a test module of @xaravel/assert, outside this package's tsc project, so it is loaded
// at run time rather than re-implemented here.
const ORACLE_VALUES = join(REPO, "packages", "assert", "tests", "xaravel", "oracle-values.ts");
const { decode, readRequests, readSignedFixture } = (await import(ORACLE_VALUES)) as OracleValues;
const REQUESTS = "conformance/oracle-requests/14.1.jsonl";
const FIXTURES = "conformance/fixtures/collections";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

/** The signed Oracle output of the one request for `id`. */
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

/** The decoded value of result `index`. */
function result(output: Output, index: number): unknown {
  const entry = output.results[index];
  if (entry === undefined || !("value" in entry)) {
    throw new Error(`result ${index} is not a value`);
  }
  return decode(entry.value);
}

/** The keys of a PHP array, in order. */
function keysOf(array: unknown): unknown[] {
  return arrayEntries(array as object).map(([key]) => key);
}

xaravelTest(
  "XT-collections-1",
  "Collection and LazyCollection keep a PHP array's key order and normalise integer-like string keys as PHP does ('10' and '-5' become ints, '07' and '-0' stay strings, a repeated key keeps its first position and its last value) (FR-23.1, FR-23.2), and toArray(), toJson() and jsonEncode give the list or object shape the Oracle gives for the same arrays: string keys 0..n-1 in order are a list, a gap or a filter that keeps keys is an object, and values() is a list again (FR-23.3)",
  () => {
    const mixed = new PhpArray<string | number, string>([
      ["10", "a"],
      ["9", "b"],
      ["x", "c"],
      ["07", "d"],
      ["-5", "e"],
      ["1", "f"],
      [1, "g"],
      ["-0", "h"],
    ]);
    const list = new PhpArray<string, string>([
      ["0", "a"],
      ["1", "b"],
      ["2", "c"],
    ]);
    const gap = new PhpArray<number, string>([
      [0, "a"],
      [2, "c"],
    ]);

    // Key order and normalisation, read directly.
    const normalised = [10, 9, "x", "07", -5, 1, "-0"];
    Assert.assertSame(normalised, keysOf(collect(mixed).toArray()), "Collection keys");
    Assert.assertSame(normalised, keysOf(LazyCollection.make(mixed).toArray()), "LazyCollection keys");
    Assert.assertSame("g", collect(mixed).get(1), "a repeated key keeps its last value");
    for (const [key] of collect(mixed).entries()) {
      Assert.assertTrue(normalised.includes(key as string | number), `iterated key ${String(key)}`);
    }
    Assert.assertSame(["a", "b", "c"], collect(list).toArray(), "integer-like string keys 0..n-1 are a list");

    // The shapes, against the Oracle.
    const output = oracle("XT-collections-1");
    const filtered = (): Collection => collect(["a", "b", "c"]).filter((v: string) => v !== "b");
    const actual: [string, unknown][] = [
      ["collect($mixed)->toArray()", collect(mixed).toArray()],
      ["collect($mixed)->toJson()", collect(mixed).toJson()],
      ["json_encode(collect($mixed))", jsonEncode(collect(mixed))],
      ["LazyCollection::make($mixed)->toArray()", LazyCollection.make(mixed).toArray()],
      ["LazyCollection::make($mixed)->toJson()", LazyCollection.make(mixed).toJson()],
      ["collect($list)->toArray()", collect(list).toArray()],
      ["collect($list)->toJson()", collect(list).toJson()],
      ["collect($gap)->toArray()", collect(gap).toArray()],
      ["collect($gap)->toJson()", collect(gap).toJson()],
      ["filter()->toArray()", filtered().toArray()],
      ["filter()->toJson()", filtered().toJson()],
      ["filter()->values()->toJson()", filtered().values().toJson()],
    ];
    Assert.assertSame(actual.length, output.results.length, "one Oracle result per expression");
    actual.forEach(([expr, value], index) => {
      Assert.assertSame(result(output, index), value, expr);
    });
  },
);

xaravelTest(
  "XT-collections-2",
  "Collection's ArrayAccess forms replace PHP's index syntax: get(k) and offsetGet(k) read an item (null for a missing key from offsetGet, the default from get) (DIV-12.6), offsetSet(k, v) writes at a normalised key keeping its position, offsetSet(null, v) appends at PHP's next free int key, offsetExists is PHP's isset (false for a null item), offsetUnset removes the key, and values read back are copies (DIV-12.17)",
  () => {
    const c = new Collection(new PhpArray<string | number, unknown>([["a", 1], [5, null], ["7", "x"]]));

    Assert.assertSame(1, c.get("a"));
    Assert.assertSame(1, c.offsetGet("a"));
    Assert.assertSame("x", c.get(7), "'7' is the int key 7");
    Assert.assertSame("x", c.offsetGet("7"));
    Assert.assertNull(c.offsetGet("missing"));
    Assert.assertSame("default", c.get("missing", "default"));
    Assert.assertSame("lazy", c.get("missing", () => "lazy"), "a Closure default is called");

    Assert.assertTrue(c.offsetExists("a"));
    Assert.assertFalse(c.offsetExists(5), "isset is false for a null item");
    Assert.assertNull(c.get(5));
    Assert.assertFalse(c.offsetExists("missing"));

    c.offsetSet("a", 2);
    c.offsetSet(null, "appended");
    c.offsetSet("9", "nine");
    c.offsetSet(null, "after nine");
    Assert.assertSame(["a", 5, 7, 8, 9, 10], keysOf(c.all()), "a write keeps the key's position; null appends at the next int key");
    Assert.assertSame(2, c.get("a"));
    Assert.assertSame("appended", c.get(8));
    Assert.assertSame("after nine", c.get(10));

    c.offsetUnset("a");
    c.offsetUnset(9);
    Assert.assertFalse(c.offsetExists("a"));
    Assert.assertSame([5, 7, 8, 10], keysOf(c.all()));

    const nested = new Collection({ list: [1, 2] });
    (nested.get("list") as number[]).push(3);
    (nested.all() as { list: number[] }).list.push(4);
    Assert.assertSame([1, 2], nested.get("list"), "reads are value copies");
    const source = [1, 2];
    const copy = new Collection([source]);
    source.push(3);
    Assert.assertSame([[1, 2]], copy.all(), "the constructor copies the caller's array");
  },
);

/** An `Arrayable` source for XT-collections-3. */
class XtArrayable implements Arrayable {
  get [Arrayable.brand](): true {
    return true;
  }

  toArray(): PhpArray {
    return new PhpArray<string | number, string>([
      ["k", "v"],
      [3, "w"],
    ]);
  }
}

xaravelTest(
  "XT-collections-3",
  "LazyCollection.make() enumerates as Upstream from an array, an Arrayable, a generator function whose keyed(k, v) yields give PHP's keys and whose plain yields take PHP's next int key, and a plain function whose result is wrapped as an array, each enumeration calling the generator function afresh; a bare generator object passed to make() or the constructor throws Upstream's InvalidArgumentException (DIV-12.18)",
  () => {
    Assert.assertSame({ a: 1, b: 2 }, LazyCollection.make({ a: 1, b: 2 }).all(), "an array");
    Assert.assertSame(
      [
        ["k", "v"],
        [3, "w"],
      ],
      arrayEntries(LazyCollection.make(new XtArrayable()).all() as object),
      "an Arrayable",
    );

    let calls = 0;
    const generated = LazyCollection.make(function* () {
      calls++;
      yield "first";
      yield keyed("k", "keyed");
      yield keyed(10, "ten");
      yield "next";
    });
    Assert.assertSame(
      [
        [0, "first"],
        ["k", "keyed"],
        [10, "ten"],
        [11, "next"],
      ],
      [...generated.entries()],
      "a generator function's keys",
    );
    Assert.assertSame(4, generated.count());
    Assert.assertSame(["first", "keyed", "ten", "next"], [...generated]);
    Assert.assertSame(3, calls, "each enumeration calls the generator function");
    Assert.assertSame(["FIRST", "KEYED", "TEN", "NEXT"], generated.map((value: string) => value.toUpperCase()).values().all());

    Assert.assertSame(["plain"], LazyCollection.make(() => "plain").all(), "a plain function's scalar result is wrapped");
    Assert.assertSame({ x: 1 }, LazyCollection.make(() => ({ x: 1 })).all(), "a plain function's array result is the items");

    for (const make of [(source: unknown) => LazyCollection.make(source), (source: unknown) => new LazyCollection(source)]) {
      let thrown: unknown = null;
      try {
        make(
          (function* () {
            yield 1;
          })(),
        );
      } catch (error) {
        thrown = error;
      }
      Assert.assertInstanceOf(InvalidArgumentException, thrown);
      Assert.assertSame("Generators should not be passed directly to LazyCollection. Instead, pass a generator function.", (thrown as InvalidArgumentException).getMessage());
    }
  },
);
