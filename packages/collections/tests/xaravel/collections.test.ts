// Xaravel Tests for Story 14.1: PHP array keys and shapes through Collection and LazyCollection (XT-collections-1),
// the ArrayAccess forms of DIV-12.6 and DIV-12.17 (XT-collections-2), and LazyCollection's sources (XT-collections-3).
// One test per Xaravel acceptance-criterion row of the manifest, in order. Story 14.2 adds XT-collections-4 (how the
// search members read their arguments, through the runtime's PHP comparisons and DIV-12.20, and the AD-26 options forms
// of `random`, `splice`, `sortBy`, `Arr.first`, `Arr.last` and `Arr.random`) and XT-collections-5 (`sole` and
// `firstOrFail` throwing `ItemNotFoundException` / `MultipleItemsFoundException`, registered under their Upstream
// FQCNs, the messages of `random` and `shift`, and `sortBy`'s `UnhandledMatchError` for an unmatched `descending`).
//
// Story 14.3 adds XT-collections-6 (`filter()` on a list keeps the original keys and `values()` re-indexes, against the
// Oracle) and XT-collections-7 (sync members reject an async callback in `tsc` and in lint, and the async companions
// await their callbacks in key order; AD-6, DIV-1).
//
// XT-collections-1 compares with the signed Oracle fixture of `conformance/oracle-requests/14.1.jsonl`, and
// XT-collections-6 with that of `conformance/oracle-requests/14.3.jsonl`; a missing fixture fails the test. F-10 recorded reason: XT-collections-1 is a Xaravel Test, so no Upstream test exists whose
// inputs the request could take. Per docs/ops/oracle.md § Per-Story requests, the request evaluates only the inputs its
// acceptance criterion names (epics.md Story 14.1: "integer-like string keys and mixed keys … `toArray()` and
// `jsonEncode` produce the list or object shape that the Oracle produces"): an array with integer-like, leading-zero,
// negative, `-0` and repeated keys, a list written with string keys, a list with a gap, and a filtered list, each read
// back through `toArray()`, `toJson()` and `json_encode`, on Collection and LazyCollection. It contains no Upstream
// test and no fixture.
//
// F-10 recorded reason for `14.3.jsonl`: XT-collections-6 is a Xaravel Test, so no Upstream test exists whose inputs
// the request could take. The request evaluates only the inputs its acceptance criterion names (epics.md Story 14.3:
// "`filter()` on a list … items are removed … the original keys are kept, and `values()` re-indexes, matching the
// Oracle"): the list `[1, 2, 3, 4]` filtered to its even values, which removes the first item and a middle one, read
// back through `toArray()`, `toJson()`, `values()->toArray()` and `values()->toJson()`, on Collection and
// LazyCollection (`LazyCollection::make`). It contains no Upstream test and no fixture.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Arr, Collection, collect, ItemNotFoundException, LazyCollection, MultipleItemsFoundException } from "@xaravel/collections";
import { Arrayable } from "@xaravel/contracts/support";
import { array_values, arrayEntries, fqcn, InvalidArgumentException, jsonEncode, keyed, looseEquals, PhpArray, TypeError as PhpTypeError, registerClass, resolveClass, RuntimeException, SORT_REGULAR, SORT_STRING, stdClass, UnhandledMatchError } from "@xaravel/runtime";

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
const FIXTURES = "conformance/fixtures/collections";
const PUBLIC_KEY = "conformance/oracle/oracle.pub";

/** The signed Oracle output of the one request for `id` in the request file `requests` (repository-relative). */
function oracle(id: string, requests_: string): Output {
  const requests = readRequests(join(REPO, requests_)).filter((request) => request.id === id);
  if (requests.length !== 1) {
    throw new Error(`${requests_}: expected one request for ${id}, found ${requests.length}`);
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
  "Collection and LazyCollection keep a PHP array's key order and normalise integer-like string keys as PHP does ('10' and '-5' become ints, '07' and '-0' stay strings, a repeated key keeps its first position and its last value) (FR-23.1, FR-23.2), and toArray(), toJson() and jsonEncode give the list or object shape the Oracle gives for the same arrays: string keys 0..n-1 in order are a list, a gap or a filter that keeps keys is an object, and values() is a list again (FR-23.3); keys() and entries() iterate the normalised keys and pairs in order; toArray() turns each Arrayable item, a nested collection included, into its own toArray(); a callback that mutates the nested array it receives leaves the collection unchanged, as PHP passes items by value; a value no array form covers (a scalar) given to Arr.from throws Upstream's InvalidArgumentException 'Items cannot be represented by a scalar value.'",
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
    const pairs = [
      [10, "a"],
      [9, "b"],
      ["x", "c"],
      ["07", "d"],
      [-5, "e"],
      [1, "g"],
      ["-0", "h"],
    ];
    for (const [name, c] of [
      ["Collection", collect(mixed)],
      ["LazyCollection", LazyCollection.make(mixed)],
    ] as const) {
      Assert.assertSame(normalised, [...c.keys()], `${name} keys(), in order`);
      Assert.assertSame(pairs, [...c.entries()], `${name} entries(), in order`);
    }

    // toArray() converts each Arrayable item, a nested collection included, to its own toArray().
    for (const [name, make] of [
      ["Collection", (items: unknown) => collect(items)],
      ["LazyCollection", (items: unknown) => LazyCollection.make(items)],
    ] as const) {
      Assert.assertSame([new XtArrayable().toArray(), { a: 1 }, "x"], make([new XtArrayable(), collect({ a: 1 }), "x"]).toArray(), `${name} toArray() of Arrayable items`);
    }

    // A callback that mutates the nested array it receives leaves the collection unchanged (PHP passes it by value).
    const nested = collect([[1, 2]]);
    nested.map((v: number[]) => {
      v.push(9);
      return v;
    });
    nested.each((v: number[]) => {
      v.push(9);
    });
    nested.filter((v: number[]) => v.push(9) > 0);
    Assert.assertSame([[1, 2]], nested.all(), "Collection callbacks get copies");
    const lazyNested = LazyCollection.make([[1, 2]]);
    lazyNested
      .map((v: number[]) => {
        v.push(9);
        return v;
      })
      .all();
    Assert.assertSame([[1, 2]], lazyNested.all(), "LazyCollection callbacks get copies");
    Assert.assertSame(["a", "b", "c"], collect(list).toArray(), "integer-like string keys 0..n-1 are a list");

    // Arr::from's default arm: a scalar is no array form.
    let fromScalar: unknown = null;
    try {
      Arr.from(1);
    } catch (error) {
      fromScalar = error;
    }
    Assert.assertInstanceOf(InvalidArgumentException, fromScalar);
    Assert.assertSame("Items cannot be represented by a scalar value.", (fromScalar as InvalidArgumentException).getMessage());

    // The shapes, against the Oracle.
    const output = oracle("XT-collections-1", "conformance/oracle-requests/14.1.jsonl");
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
  "LazyCollection.make() enumerates as Upstream from an array, an Arrayable, a generator function whose keyed(k, v) yields give PHP's keys and whose plain yields take PHP's next int key, and a plain function whose result is wrapped as an array, each enumeration calling the generator function afresh; a bare generator object passed to make() or the constructor throws Upstream's InvalidArgumentException (DIV-12.18); a LazyCollection.range or LazyCollection.times result gives the same items each time it is enumerated; LazyCollection.range with a zero step throws Upstream's InvalidArgumentException 'Step value cannot be zero.'",
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

    const range = LazyCollection.range(1, 3);
    Assert.assertSame([1, 2, 3], range.all(), "range, first enumeration");
    Assert.assertSame([1, 2, 3], range.all(), "range, second enumeration");
    const times = LazyCollection.times(3, (number: number) => number * 10);
    Assert.assertSame([10, 20, 30], times.all(), "times, first enumeration");
    Assert.assertSame([10, 20, 30], times.all(), "times, second enumeration");

    let zeroStep: unknown = null;
    try {
      LazyCollection.range(1, 5, 0);
    } catch (error) {
      zeroStep = error;
    }
    Assert.assertInstanceOf(InvalidArgumentException, zeroStep);
    Assert.assertSame("Step value cannot be zero.", (zeroStep as InvalidArgumentException).getMessage());
  },
);

xaravelTest(
  "XT-collections-4",
  "contains('1') on collect([1]) is true and containsStrict('1') on the same collection is false: contains compares with the runtime's PHP loose comparison (looseEquals, so '1' == 1 and, in PHP 8, 0 != 'a') and containsStrict with PHP's === (identical, so an int is never its numeric string, and two arrays are identical only with the same keys in the same order); contains(key, value) and containsStrict(key, value) compare an item's key the same way; contains(callback) is true exactly when the callback accepts an item; doesntContain(value) and doesntContain(key, value) are the negations of contains; some(value) and some(callback) agree with contains; a lone object argument to these members is the PHP value, never an options object (DIV-12.20); all of this holds on Collection and LazyCollection. On the AD-26 side, a trailing plain object is the options object: random({ number: 2 }) and random({ number: 2, preserveKeys: true }) match random(2) and random(2, true) in count and kept keys, on both classes, and LazyCollection's returns a LazyCollection; splice(1, { length: 1, replacement: ['x'] }) matches splice(1, 1, ['x']); and Arr.first(array, { callback, default }), Arr.last(array, { callback, default }) and Arr.random(array, { number, preserveKeys }) match their positional forms (AD-26). first(null, { a: 1 }) and last(null, { a: 1 }) on an empty collection give { a: 1 }: a lone object after the callback is the PHP default, never Arr.first / Arr.last's options object (DIV-12.20), on both classes. A dotted pull('a.b') on collect({ a: { b: 1, c: 2 } }) returns 1 and leaves { a: { c: 2 } }, its nested child a plain object rather than a PhpArray, and except('a.b') gives the same result while leaving the original collection unchanged. sortBy(callback, { descending: true }) matches sortBy(callback, SORT_REGULAR, true), and sortBy(callback, { options: SORT_STRING }) matches sortBy(callback, SORT_STRING), keys kept, on both classes (AD-26); sortBy([['name', 'asc'], ['age', 'desc']]) sorts by each comparison in turn, and value('balance') reads an object's property and a nested collection's key, on both classes",
  () => {
    for (const make of [(items: unknown) => collect(items), (items: unknown) => new LazyCollection(items)]) {
      Assert.assertTrue(make([1]).contains("1"), "loose: '1' == 1");
      Assert.assertFalse(make([1]).containsStrict("1"), "strict: '1' !== 1");
      Assert.assertTrue(make([1]).containsStrict(1));
      Assert.assertFalse(make([0]).contains("a"), "PHP 8: 0 != 'a'");
      Assert.assertTrue(make([null]).contains(false), "null == false");
      Assert.assertFalse(make([null]).containsStrict(false));

      Assert.assertTrue(make([{ a: 1, b: 2 }]).contains({ b: 2, a: 1 }), "a lone object is the PHP value: == ignores key order");
      Assert.assertFalse(make([{ a: 1, b: 2 }]).containsStrict({ b: 2, a: 1 }), "=== needs the same key order");
      Assert.assertTrue(make([{ a: 1, b: 2 }]).containsStrict({ a: 1, b: 2 }));

      Assert.assertTrue(make([{ v: "1" }]).contains("v", 1), "contains(key, value) is loose");
      Assert.assertFalse(make([{ v: "1" }]).containsStrict("v", 1), "containsStrict(key, value) is strict");
      Assert.assertTrue(make([{ v: "1" }]).containsStrict("v", "1"));

      Assert.assertTrue(make([1, 2, 3]).contains((value: number) => value > 2), "contains(callback) accepted");
      Assert.assertFalse(make([1, 2, 3]).contains((value: number) => value > 5), "contains(callback) rejected");

      Assert.assertFalse(make([1]).doesntContain("1"), "doesntContain(value) negates the loose contains");
      Assert.assertTrue(make([1]).doesntContain(2));
      Assert.assertFalse(make([{ a: 1, b: 2 }]).doesntContain({ b: 2, a: 1 }), "a lone object is the PHP value");
      Assert.assertFalse(make([{ v: "1" }]).doesntContain("v", 1), "doesntContain(key, value) negates contains(key, value)");
      Assert.assertTrue(make([{ v: "1" }]).doesntContain("v", 2));

      Assert.assertTrue(make([1]).some("1"), "some(value) is contains(value)");
      Assert.assertFalse(make([1]).some(2));
      Assert.assertTrue(make([{ a: 1, b: 2 }]).some({ b: 2, a: 1 }), "a lone object is the PHP value");
      Assert.assertTrue(make([1, 2, 3]).some((value: number) => value > 2), "some(callback) is contains(callback)");
      Assert.assertFalse(make([1, 2, 3]).some((value: number) => value > 5));

      Assert.assertEquals({ a: 1 }, make([]).first(null, { a: 1 }), "first's lone object default is the PHP value");
      Assert.assertEquals({ a: 1 }, make([]).last(null, { a: 1 }), "last's lone object default is the PHP value");

      const source = { a: 1, b: 2, c: 3 };
      for (const picked of [make(source).random({ number: 2 }), make(source).random(2)]) {
        Assert.assertInstanceOf(make([]).constructor, picked);
        Assert.assertSame(2, picked.count());
        Assert.assertEquals([0, 1], picked.keys().all(), "without preserveKeys the picks are a list");
      }
      for (const picked of [make(source).random({ number: 2, preserveKeys: true }), make(source).random(2, true)]) {
        Assert.assertInstanceOf(make([]).constructor, picked);
        Assert.assertSame(2, picked.count());
        for (const [key, item] of arrayEntries(picked.all() as object)) {
          Assert.assertSame((source as Record<string, unknown>)[key as string], item, "preserveKeys keeps each pick under its own key");
        }
      }
    }

    for (const make of [(items: unknown) => collect(items), (items: unknown) => new LazyCollection(items)]) {
      const rows = [{ n: 10 }, { n: 9 }, { n: 2 }];
      const byN = (row: { n: number }) => row.n;
      const descending = make(rows).sortBy(byN, { descending: true }).all();
      Assert.assertEquals(make(rows).sortBy(byN, SORT_REGULAR, true).all(), descending);
      Assert.assertEquals([[0, { n: 10 }], [1, { n: 9 }], [2, { n: 2 }]], arrayEntries(descending as object), "descending, keys kept");
      const asStrings = make(rows).sortBy(byN, { options: SORT_STRING }).all();
      Assert.assertEquals(make(rows).sortBy(byN, SORT_STRING).all(), asStrings);
      Assert.assertEquals([[0, { n: 10 }], [2, { n: 2 }], [1, { n: 9 }]], arrayEntries(asStrings as object), "SORT_STRING orders '10' < '2' < '9', keys kept");
      Assert.assertEquals([[2, { n: 2 }], [1, { n: 9 }], [0, { n: 10 }]], arrayEntries(make(rows).sortBy(byN, {}).all() as object), "an empty options object is the defaults");

      const people = [
        { name: "b", age: 1 },
        { name: "a", age: 2 },
        { name: "a", age: 3 },
      ];
      Assert.assertEquals(
        [
          { name: "a", age: 3 },
          { name: "a", age: 2 },
          { name: "b", age: 1 },
        ],
        make(people).sortBy([["name", "asc"], ["age", "desc"]]).values().all(),
        "a list of comparisons sorts by each in turn (sortByMany)",
      );

      Assert.assertSame(5, make([Object.assign(new stdClass(), { id: 1 }), Object.assign(new stdClass(), { balance: 5 })]).value("balance"), "value() reads an object's property");
      Assert.assertSame(7, make([collect({ x: 1 }), collect({ balance: 7 })]).value("balance"), "value() reads a nested collection's key");
    }

    Assert.assertInstanceOf(LazyCollection, new LazyCollection([1, 2, 3]).random({ number: 2 }));

    const pulled = collect({ a: { b: 1, c: 2 } });
    Assert.assertSame(1, pulled.pull("a.b"));
    Assert.assertEquals({ a: { c: 2 } }, pulled.all());
    Assert.assertFalse(pulled.get("a") instanceof PhpArray, "the rebuilt nested child keeps its plain-object form");
    Assert.assertSame(Object.prototype, Object.getPrototypeOf(pulled.get("a")));

    const original = collect({ a: { b: 1, c: 2 } });
    const excepted = original.except("a.b");
    Assert.assertEquals({ a: { c: 2 } }, excepted.all());
    Assert.assertFalse(excepted.get("a") instanceof PhpArray);
    Assert.assertSame(Object.prototype, Object.getPrototypeOf(excepted.get("a")));
    Assert.assertEquals({ a: { b: 1, c: 2 } }, original.all(), "except leaves the original unchanged");

    const optionsForm = collect(["a", "b", "c"]);
    const positional = collect(["a", "b", "c"]);
    Assert.assertEquals(positional.splice(1, 1, ["x"]).all(), optionsForm.splice(1, { length: 1, replacement: ["x"] }).all());
    Assert.assertEquals(["a", "x", "c"], optionsForm.all());
    Assert.assertEquals(positional.all(), optionsForm.all());

    const above = (value: number) => value > 1;
    Assert.assertSame(Arr.first([1, 2, 3], above), Arr.first([1, 2, 3], { callback: above }));
    Assert.assertSame(2, Arr.first([1, 2, 3], { callback: above }));
    Assert.assertSame(Arr.first([], null, "d"), Arr.first([], { default: "d" }));
    Assert.assertSame("d", Arr.first([1], { callback: (value: number) => value > 5, default: "d" }));
    Assert.assertSame(Arr.last([1, 2, 3], above), Arr.last([1, 2, 3], { callback: above }));
    Assert.assertSame(3, Arr.last([1, 2, 3], { callback: above }));
    Assert.assertSame(Arr.last([], null, "d"), Arr.last([], { default: "d" }));

    for (const picked of [Arr.random([1, 2, 3], { number: 2 }), Arr.random([1, 2, 3], 2)]) {
      Assert.assertCount(2, picked);
      Assert.assertTrue(Array.isArray(picked), "without preserveKeys the picks are a list");
    }
    for (const picked of [Arr.random({ a: 1, b: 2, c: 3 }, { number: 2, preserveKeys: true }), Arr.random({ a: 1, b: 2, c: 3 }, 2, true)]) {
      Assert.assertCount(2, picked);
      for (const [key, item] of arrayEntries(picked as object)) {
        Assert.assertSame(({ a: 1, b: 2, c: 3 } as Record<string, unknown>)[key as string], item);
      }
    }
  },
);

xaravelTest(
  "XT-collections-5",
  "sole() with no item, or no matching item, throws ItemNotFoundException, and with two matching items throws MultipleItemsFoundException whose getCount() is 2 and whose message is '2 items were found.'; firstOrFail() with no matching item throws ItemNotFoundException and with several returns the first; both exceptions are RuntimeExceptions whose fqcn() is their Upstream FQCN (Illuminate\\Support\\ItemNotFoundException, Illuminate\\Support\\MultipleItemsFoundException), resolved through the Class Registry; the same holds for LazyCollection. random(4) on three items throws InvalidArgumentException 'You requested 4 items, but there are only 3 items available.' on Collection and LazyCollection, and Collection's shift(-1) throws InvalidArgumentException 'Number of shifted items may not be less than zero.'; sortBy(callback, SORT_REGULAR, 0) throws UnhandledMatchError with the message Unhandled match case 0, and sortBy(callback, SORT_REGULAR, 'desc') with Unhandled match case 'desc', as PHP's match with no matching arm does, on Collection and LazyCollection; LazyCollection's sortBy returns without throwing and throws only when it is enumerated",
  () => {
    const caught = (run: () => unknown): unknown => {
      try {
        run();
      } catch (error) {
        return error;
      }
      return null;
    };

    Assert.assertSame("Illuminate\\Support\\ItemNotFoundException", fqcn(ItemNotFoundException));
    Assert.assertSame("Illuminate\\Support\\MultipleItemsFoundException", fqcn(MultipleItemsFoundException));
    Assert.assertSame(ItemNotFoundException, resolveClass("Illuminate\\Support\\ItemNotFoundException"));
    Assert.assertSame(MultipleItemsFoundException, resolveClass("Illuminate\\Support\\MultipleItemsFoundException"));

    for (const make of [(items: unknown) => collect(items), (items: unknown) => new LazyCollection(items)]) {
      const none = caught(() => make([]).sole());
      Assert.assertInstanceOf(ItemNotFoundException, none, "sole() on no item");
      Assert.assertInstanceOf(RuntimeException, none);
      Assert.assertSame("Illuminate\\Support\\ItemNotFoundException", fqcn(none as object));

      Assert.assertInstanceOf(ItemNotFoundException, caught(() => make([1, 2]).sole((value: number) => value > 5)), "sole() with no match");

      const several = caught(() => make([{ name: "foo" }, { name: "foo" }, { name: "bar" }]).sole("name", "foo"));
      Assert.assertInstanceOf(MultipleItemsFoundException, several, "sole() with two matches");
      Assert.assertInstanceOf(RuntimeException, several);
      Assert.assertSame("Illuminate\\Support\\MultipleItemsFoundException", fqcn(several as object));
      Assert.assertSame(2, (several as MultipleItemsFoundException).getCount());
      Assert.assertSame("2 items were found.", (several as MultipleItemsFoundException).getMessage());

      Assert.assertSame("bar", make(["foo", "bar"]).sole((value: string) => value === "bar"), "sole() with one match");

      Assert.assertInstanceOf(ItemNotFoundException, caught(() => make([]).firstOrFail()), "firstOrFail() on no item");
      Assert.assertInstanceOf(ItemNotFoundException, caught(() => make([{ name: "foo" }]).firstOrFail("name", "bar")), "firstOrFail() with no match");
      Assert.assertSame("foo", make(["foo", "foo", "bar"]).firstOrFail(), "firstOrFail() with several items gives the first");
    }

    for (const make of [(items: unknown) => collect(items), (items: unknown) => new LazyCollection(items)]) {
      const tooMany = caught(() => make([1, 2, 3]).random(4));
      Assert.assertInstanceOf(InvalidArgumentException, tooMany, "random() over the count");
      Assert.assertSame("You requested 4 items, but there are only 3 items available.", (tooMany as InvalidArgumentException).getMessage());
    }

    for (const make of [(items: unknown) => collect(items), (items: unknown) => new LazyCollection(items)]) {
      const byValue = (value: number) => value;
      const zero = caught(() => make([2, 1]).sortBy(byValue, SORT_REGULAR, 0 as unknown as boolean).all());
      Assert.assertInstanceOf(UnhandledMatchError, zero, "sortBy() with descending 0");
      Assert.assertSame("Unhandled match case 0", (zero as UnhandledMatchError).getMessage());
      const desc = caught(() => make([2, 1]).sortBy(byValue, SORT_REGULAR, "desc" as unknown as boolean).all());
      Assert.assertInstanceOf(UnhandledMatchError, desc, "sortBy() with descending 'desc'");
      Assert.assertSame("Unhandled match case 'desc'", (desc as UnhandledMatchError).getMessage());
    }

    const lazySorted = new LazyCollection([2, 1]).sortBy((value: number) => value, SORT_REGULAR, 0 as unknown as boolean);
    Assert.assertInstanceOf(LazyCollection, lazySorted, "LazyCollection.sortBy() does not throw before it is enumerated");
    const lazyZero = caught(() => lazySorted.all());
    Assert.assertInstanceOf(UnhandledMatchError, lazyZero, "enumerating it throws");
    Assert.assertSame("Unhandled match case 0", (lazyZero as UnhandledMatchError).getMessage());

    const negative = caught(() => collect(["foo", "bar", "baz"]).shift(-1));
    Assert.assertInstanceOf(InvalidArgumentException, negative, "shift() with a negative count");
    Assert.assertSame("Number of shifted items may not be less than zero.", (negative as InvalidArgumentException).getMessage());
  },
);

xaravelTest(
  "XT-collections-6",
  "filter() on a list that removes the first item and a middle one keeps the original keys of the items it keeps, in order (FR-23.1), and values() re-indexes them from 0; toArray() and toJson() give the object shape for the kept keys ({\"1\":2,\"3\":4}) and the list shape after values() ([2,4]), as the Oracle gives for the same list (FR-23.3), on Collection and LazyCollection",
  () => {
    const list = [1, 2, 3, 4];
    const even = (value: number): boolean => value % 2 === 0;

    for (const [name, make] of [
      ["Collection", () => collect(list)],
      ["LazyCollection", () => LazyCollection.make(list)],
    ] as const) {
      const filtered = make().filter(even);
      Assert.assertSame([1, 3], keysOf(filtered.toArray()), `${name} filter() keeps the original keys`);
      Assert.assertSame([2, 4], filtered.values().toArray(), `${name} values() re-indexes as a list`);
      Assert.assertSame('{"1":2,"3":4}', filtered.toJson(), `${name} filter() is an object in JSON`);
      Assert.assertSame("[2,4]", filtered.values().toJson(), `${name} values() is a list in JSON`);
      Assert.assertSame([1, 2, 3, 4], make().all(), `${name} filter() leaves the source unchanged`);
    }

    // The shapes, against the Oracle.
    const output = oracle("XT-collections-6", "conformance/oracle-requests/14.3.jsonl");
    const actual: [string, unknown][] = [
      ["collect($list)->filter(fn ($v) => $v % 2 === 0)->toArray()", collect(list).filter(even).toArray()],
      ["collect($list)->filter(fn ($v) => $v % 2 === 0)->toJson()", collect(list).filter(even).toJson()],
      ["collect($list)->filter(fn ($v) => $v % 2 === 0)->values()->toArray()", collect(list).filter(even).values().toArray()],
      ["collect($list)->filter(fn ($v) => $v % 2 === 0)->values()->toJson()", collect(list).filter(even).values().toJson()],
      ["\\Illuminate\\Support\\LazyCollection::make($list)->filter(fn ($v) => $v % 2 === 0)->toArray()", LazyCollection.make(list).filter(even).toArray()],
      ["\\Illuminate\\Support\\LazyCollection::make($list)->filter(fn ($v) => $v % 2 === 0)->toJson()", LazyCollection.make(list).filter(even).toJson()],
      ["\\Illuminate\\Support\\LazyCollection::make($list)->filter(fn ($v) => $v % 2 === 0)->values()->toArray()", LazyCollection.make(list).filter(even).values().toArray()],
      ["\\Illuminate\\Support\\LazyCollection::make($list)->filter(fn ($v) => $v % 2 === 0)->values()->toJson()", LazyCollection.make(list).filter(even).values().toJson()],
    ];
    Assert.assertSame(actual.length, output.results.length, "one Oracle result per expression");
    actual.forEach(([expr, value], index) => {
      Assert.assertSame(result(output, index), value, expr);
    });
  },
);

/**
 * A fixture that passes an async callback to sync members: one call per line holding `async`, on Collection,
 * LazyCollection, `Arr` and an `Enumerable`-typed receiver, for callback-only members and value-or-callback ones.
 */
const ASYNC_CALLBACKS = `import { Arr, collect, type Enumerable, LazyCollection } from "@xaravel/collections";

const e: Enumerable = collect([1]);

collect([1]).filter(async () => true);
collect([1]).map(async (value: number) => value);
LazyCollection.make([1]).filter(async () => true);
collect([1]).each(async () => true);
collect([1]).first(async () => true);
collect([1]).reject(async () => true);
collect([1]).every(async () => true);
collect([1]).partition(async () => true);
collect([1]).contains(async () => true);
collect([1]).takeWhile(async () => true);
Arr.where([1], async () => true);
e.filter(async () => true);
`;

/** The lines of `ASYNC_CALLBACKS` that pass an async callback. */
const ASYNC_LINES = ASYNC_CALLBACKS.split("\n").flatMap((line, index) => (line.includes("async") ? [index + 1] : []));

/** The same calls with sync callbacks, and value forms of the value-or-callback members. */
const SYNC_CALLBACKS = `import { Arr, collect, type Enumerable, LazyCollection } from "@xaravel/collections";

const e: Enumerable = collect([1]);

export const kept = collect([1, 2, 3]).filter((value: number) => value > 1);
export const doubled = collect([1, 2, 3]).map((value: number, key: number) => value * key);
export const unannotated = collect([1, 2, 3]).filter((value) => value > 1);
export const lazyKept = LazyCollection.make([1]).filter((value) => value > 0);
export const each = collect([1]).each(() => true);
export const first = collect([1]).first((value, key) => value > key);
export const rejected = collect([1]).reject((value) => value === 1);
export const rejectedNone = collect([1]).reject();
export const everyCallback = collect([1]).every((value) => value > 0);
export const everyOperator = collect([{ age: 18 }]).every("age", ">=", 18);
export const parts = collect([1]).partition((value) => value > 0);
export const containsValue = collect([1]).contains(1);
export const containsCallback = collect([1]).contains((value) => value === 1);
export const taken = collect([1]).takeWhile((value) => value < 2);
export const takenValue = collect([1]).takeWhile(1);
export const where = Arr.where([1], (value) => value > 0);
export const enumerable = e.filter((value) => value !== null);
`;

/**
 * A temp project holding `fixture.ts`, which imports `@xaravel/collections` through a `node_modules` link to the
 * package (seams.test.ts's form, with Bun's types); `run` gets its directory, and the directory is removed after.
 */
async function withFixture<T>(source: string, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-collections-sync-"));
  try {
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { types: ["bun"] }, include: ["fixture.ts"] }, null, 2) + "\n");
    writeFileSync(join(dir, "tsconfig.base.json"), readFileSync(join(REPO, "tsconfig.base.json")));
    mkdirSync(join(dir, "node_modules", "@xaravel"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "@types"), { recursive: true });
    symlinkSync(join(REPO, "packages", "collections"), join(dir, "node_modules", "@xaravel", "collections"));
    symlinkSync(join(REPO, "node_modules", "@types", "bun"), join(dir, "node_modules", "@types", "bun"));
    writeFileSync(join(dir, "fixture.ts"), source);
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The repository's pinned `tsc -b` in `dir`: its exit code, its output, and the `fixture.ts(<line>,…): error TS<n>` pairs. */
async function tscFixture(dir: string): Promise<{ code: number; output: string; errors: string[] }> {
  const proc = Bun.spawn([process.execPath, "--bun", join(REPO, "node_modules", "typescript", "bin", "tsc"), "-b", "--pretty", "false"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const output = `${stdout}${stderr}`;
  const errors = [...output.matchAll(/^fixture\.ts\((\d+),\d+\): error (TS\d+)/gm)].map((match) => `${match[1]}:${match[2]}`);
  return { code, output, errors };
}

/** oxlint with the repository's `.oxlintrc.json`, type-aware, from the repository root (lint.test.ts's form): `<line>:<rule>` per diagnostic. */
function oxlintFixture(dir: string): { code: number; output: string; diagnostics: string[] } {
  const proc = Bun.spawnSync([process.execPath, "--bun", "oxlint", "--type-aware", "-c", ".oxlintrc.json", "--format", "unix", join(dir, "fixture.ts")], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
  const output = proc.stdout.toString() + proc.stderr.toString();
  const diagnostics: string[] = [];
  for (const line of output.split("\n")) {
    const match = /^.+?fixture\.ts:(\d+):\d+: .*\[(?:Error|Warning)\/[\w-]+\(([\w-]+)\)\]$/.exec(line);
    if (match !== null) {
      diagnostics.push(`${match[1]}:${match[2]}`);
    }
  }
  return { code: proc.exitCode ?? -1, output, diagnostics };
}

/** An invokable object, the callable form of an object (`__invoke`), keying `duplicates` by `k`. */
class XtInvokable {
  __invoke(row: Record<string, unknown>): unknown {
    return row["k"] ?? null;
  }
}

/** A local class for whereInstanceOf, registered under its own FQCN. */
class XtInstance {}
registerClass("Xaravel\\Tests\\Collections\\XtInstance", XtInstance);

/** A backed enum (AD-26) whose case keys keyBy by its value. */
class XtSuit {
  static readonly backingType = "string";
  static readonly Hearts = new XtSuit("Hearts", "H");

  constructor(
    readonly name: string,
    readonly value: string,
  ) {}

  static cases(): XtSuit[] {
    return [XtSuit.Hearts];
  }
}

/** An object with a `__toString` port, which keyBy keys by its string. */
class XtStringable {
  toString(): string {
    return "stringable";
  }
}

/** `duplicates`' two forms, as Collection and LazyCollection both declare them (one view, so each call is one overload set). */
interface Duplicating {
  duplicates(callback?: ((row: any) => unknown) | string | null, strict?: boolean): { all(): unknown };
  duplicates(options?: { callback?: ((row: any) => unknown) | string | null; strict?: boolean }): { all(): unknown };
}

/** A callback for the companions that logs its start and end around two awaits, and accepts even values. */
function loggedEven(log: string[]): (value: number, key: unknown) => Promise<boolean> {
  return async (value: number, key: unknown): Promise<boolean> => {
    log.push(`start ${String(key)}`);
    await Promise.resolve();
    await new Promise<void>((resolve_) => {
      setTimeout(resolve_, 1);
    });
    log.push(`end ${String(key)}`);
    return value % 2 === 0;
  };
}

/** The `start` / `end` log of callbacks run one after another over `keys`, in order. */
function sequential(keys: readonly unknown[]): string[] {
  return keys.flatMap((key) => [`start ${String(key)}`, `end ${String(key)}`]);
}

/** The rejection of `promise`, or null when it fulfils. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

xaravelTest(
  "XT-collections-7",
  "Collections are sync (AD-6): passing an async callback to a sync member (filter, map, each, first, reject, every, partition, contains and takeWhile on Collection, filter on LazyCollection, Arr.where, and filter on an Enumerable-typed receiver) fails to compile under the repository's tsc, through SyncCallback's NotPromise half (and ValueOrSyncCallback for the value-or-callback members), and oxlint's no-misused-promises reports every such call, through its void half, while the same calls with sync callbacks, and value forms such as every('age', '>=', 18) and reject(), compile and lint clean; the async companions filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync and firstAsync (DIV-1 Callbacks, DIV-1.2) exist on Collection and LazyCollection, await each callback before starting the next, in key order, keep the items' keys, return filter's, reject's, partition's, every's, contains' and first's results (every and contains stopping at the first decisive item, first resolving value(default) when none matches), and reject when a callback rejects; async-surface.json lists the six companions of Collection, LazyCollection and the Enumerable interface with root callback; duplicates' AD-26 options object { callback, strict } gives what its positional form gives, on both classes, while an invokable object is the callback and a plain object with a function __invoke is not read as the options object; whereInstanceOf filters by a class-name string, a constructor or a list of classes, keyBy keys an enum case by its value, an object by its string and null by \"\", concat appends a Collection's and a LazyCollection's values with keys reset, and two Collections of equal items are == through the props protocol (AD-9.6)",
  async () => {
    // (a) tsc and (b) oxlint reject async callbacks to sync members.
    await withFixture(ASYNC_CALLBACKS, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertNotEquals(0, tsc.code, tsc.output);
      Assert.assertSame(ASYNC_LINES.length, 12, "the fixture's async calls");
      Assert.assertSame(
        ASYNC_LINES,
        tsc.errors.map((error) => Number(error.split(":")[0])),
        `every async call fails to compile: ${tsc.output}`,
      );
      for (const error of tsc.errors) {
        Assert.assertContains(error.split(":")[1], ["TS2322", "TS2345", "TS2769"], tsc.output);
      }
      Assert.assertTrue(tsc.output.includes("'Promise<boolean>' is not assignable to type 'never'"), tsc.output);
      Assert.assertTrue(tsc.output.includes("'Promise<number>' is not assignable to type 'never'"), tsc.output);

      const lint = oxlintFixture(dir);
      Assert.assertNotEquals(0, lint.code, lint.output);
      Assert.assertSame(
        ASYNC_LINES.map((line) => `${line}:no-misused-promises`),
        lint.diagnostics,
        lint.output,
      );
    });
    await withFixture(SYNC_CALLBACKS, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertSame(0, tsc.code, tsc.output);
      const lint = oxlintFixture(dir);
      Assert.assertSame([], lint.diagnostics, lint.output);
      Assert.assertSame(0, lint.code, lint.output);
    });

    // (c) The companions, on both classes, over keys out of order.
    const items = (): PhpArray =>
      new PhpArray<string | number, number>([
        [5, 1],
        ["a", 2],
        [0, 3],
        [9, 4],
      ]);
    for (const [name, klass] of [
      ["Collection", Collection],
      ["LazyCollection", LazyCollection],
    ] as const) {
      const make = (): Collection | LazyCollection => new klass(items());
      let log: string[] = [];

      const filtered = await make().filterAsync(loggedEven(log));
      Assert.assertInstanceOf(klass, filtered, `${name}.filterAsync() resolves the class`);
      Assert.assertSame(
        new PhpArray<string | number, number>([
          ["a", 2],
          [9, 4],
        ]),
        filtered.all(),
        `${name}.filterAsync() keeps the passing items' keys`,
      );
      Assert.assertSame(sequential([5, "a", 0, 9]), log, `${name}.filterAsync() awaits in key order, one at a time`);

      log = [];
      const rejected = await make().rejectAsync(loggedEven(log));
      Assert.assertInstanceOf(klass, rejected);
      Assert.assertSame([5, 0], keysOf(rejected.all()), `${name}.rejectAsync() keeps the failing items' keys`);
      Assert.assertSame([1, 3], array_values(rejected.all()));
      Assert.assertSame(sequential([5, "a", 0, 9]), log, `${name}.rejectAsync() awaits in key order, one at a time`);

      log = [];
      const partitioned = await make().partitionAsync(loggedEven(log));
      Assert.assertInstanceOf(klass, partitioned);
      Assert.assertSame(2, partitioned.count(), `${name}.partitionAsync() resolves exactly [passed, failed]`);
      const [passed, failed] = partitioned.all() as (Collection | LazyCollection)[];
      Assert.assertInstanceOf(klass, passed);
      Assert.assertInstanceOf(klass, failed);
      Assert.assertSame(
        new PhpArray<string | number, number>([
          ["a", 2],
          [9, 4],
        ]),
        passed!.all(),
        `${name}.partitionAsync() passed items, keys kept`,
      );
      Assert.assertSame(
        new PhpArray<number, number>([
          [5, 1],
          [0, 3],
        ]),
        failed!.all(),
        `${name}.partitionAsync() failed items, keys kept`,
      );
      Assert.assertSame(sequential([5, "a", 0, 9]), log, `${name}.partitionAsync() awaits in key order, one at a time`);

      log = [];
      Assert.assertFalse(await make().everyAsync(loggedEven(log)), `${name}.everyAsync() is false for an odd item`);
      Assert.assertSame(sequential([5]), log, `${name}.everyAsync() stops at the first falsy result`);
      log = [];
      const all = loggedEven(log);
      Assert.assertTrue(await make().everyAsync(async (value: number, key: unknown) => (await all(value, key)) || true), `${name}.everyAsync() is true when every result is`);
      Assert.assertSame(sequential([5, "a", 0, 9]), log);
      Assert.assertTrue(await new klass([]).everyAsync(async () => false), `${name}.everyAsync() is true when empty`);

      log = [];
      Assert.assertTrue(await make().containsAsync(loggedEven(log)), `${name}.containsAsync() finds an even item`);
      Assert.assertSame(sequential([5, "a"]), log, `${name}.containsAsync() stops at the first truthy result`);
      Assert.assertFalse(await make().containsAsync(async () => false), `${name}.containsAsync() is false when nothing matches`);

      log = [];
      Assert.assertSame(2, await make().firstAsync(loggedEven(log)), `${name}.firstAsync() gives the first even item`);
      Assert.assertSame(sequential([5, "a"]), log, `${name}.firstAsync() stops at the first match`);
      Assert.assertNull(await make().firstAsync(async () => false), `${name}.firstAsync() defaults to null`);
      Assert.assertSame("none", await make().firstAsync(async () => false, "none"));
      Assert.assertSame("lazy", await make().firstAsync(async () => false, () => "lazy"), `${name}.firstAsync() resolves value(default)`);

      const boom = new Error("boom");
      for (const [companion, run] of [
        ["filterAsync", (callback: (value: number, key: unknown) => Promise<boolean>) => make().filterAsync(callback)],
        ["rejectAsync", (callback: (value: number, key: unknown) => Promise<boolean>) => make().rejectAsync(callback)],
        ["partitionAsync", (callback: (value: number, key: unknown) => Promise<boolean>) => make().partitionAsync(callback)],
        ["everyAsync", (callback: (value: number, key: unknown) => Promise<boolean>) => make().everyAsync(callback)],
        ["containsAsync", (callback: (value: number, key: unknown) => Promise<boolean>) => make().containsAsync(callback)],
        ["firstAsync", (callback: (value: number, key: unknown) => Promise<boolean>) => make().firstAsync(callback)],
      ] as const) {
        const calls: unknown[] = [];
        const error = await rejection(
          run(async (value: number, key: unknown) => {
            calls.push(key);
            await Promise.resolve();
            if (key === "a") {
              throw boom;
            }
            // A result that never decides `every` / `contains` / `first`, so the walk reaches the rejection.
            return value > 0 && companion === "everyAsync";
          }),
        );
        Assert.assertSame(boom, error, `${name}.${companion}() rejects with the callback's rejection`);
        Assert.assertSame([5, "a"], calls, `${name}.${companion}() calls no callback after the rejection`);
      }
    }

    // (d) async-surface.json lists the companions.
    const surface = readFileSync(join(REPO, "packages", "collections", "async-surface.json"), "utf8");
    const entries = (JSON.parse(surface) as { method: string; file: string; root: string }[]).map((entry) => `${entry.method} ${entry.file} ${entry.root}`);
    for (const [klass, file] of [
      ["Collection", "src/Collection.ts"],
      ["LazyCollection", "src/LazyCollection.ts"],
      ["Enumerable", "src/Enumerable.ts"],
    ]) {
      for (const companion of ["filterAsync", "rejectAsync", "partitionAsync", "everyAsync", "containsAsync", "firstAsync"]) {
        Assert.assertContains(`${klass}.${companion} ${file} callback`, entries, `async-surface.json lists ${klass}.${companion}`);
      }
    }

    // (e) duplicates' options object.
    const rows = [{ k: "a" }, { k: "b" }, { k: "a" }, { K: "a" }, { k: "1" }, { k: 1 }];
    for (const make of [(items_: unknown): Duplicating => collect(items_), (items_: unknown): Duplicating => LazyCollection.make(items_)]) {
      Assert.assertSame(make(rows).duplicates("k", true).all(), make(rows).duplicates({ callback: "k", strict: true }).all(), "{ callback, strict } is duplicates(callback, strict)");
      Assert.assertSame(make(rows).duplicates("k").all(), make(rows).duplicates({ callback: "k" }).all(), "{ callback } is duplicates(callback)");
      Assert.assertSame(make([1, "1", 1]).duplicates(null, true).all(), make([1, "1", 1]).duplicates({ strict: true }).all(), "{ strict } is duplicates(null, strict)");
      const byK = (row: Record<string, unknown>): unknown => row["k"] ?? null;
      Assert.assertSame(make(rows).duplicates(byK, true).all(), make(rows).duplicates({ callback: byK, strict: true }).all(), "a callback in the options object");
      Assert.assertSame(new PhpArray<number, unknown>([[2, "a"], [5, 1]]), make(rows).duplicates({ callback: "k" }).all(), "the loose form's duplicates");
      Assert.assertSame(new PhpArray<number, unknown>([[2, "a"]]), make(rows).duplicates({ callback: "k", strict: true }).all(), "the strict form's duplicates");
      // An invokable object is a callable at run time, which the static type does not list, so the calls go through a view.
      const loose = (c: Duplicating) => c as unknown as { duplicates(callback: unknown): { all(): unknown } };
      Assert.assertSame(make(rows).duplicates("k").all(), loose(make(rows)).duplicates(new XtInvokable()).all(), "an invokable object is the callback");
      // A plain object with a function `__invoke` is not the options object; it is a PHP array, used as a data_get path,
      // which PHP's array offset refuses, as it refuses an array holding a Closure there.
      let plain: unknown = null;
      try {
        loose(make(rows))
          .duplicates({ __invoke: (row: Record<string, unknown>): unknown => row["k"] ?? null })
          .all();
      } catch (error) {
        plain = error;
      }
      Assert.assertInstanceOf(PhpTypeError, plain, "a plain object with a function __invoke is not read as options");
    }

    // (f) Members this Story adds that no ported test runs: whereInstanceOf, keyBy, concat, and Collection's props protocol.
    for (const [name, make] of [
      ["Collection", (items_: unknown): Collection | LazyCollection => collect(items_)],
      ["LazyCollection", (items_: unknown): Collection | LazyCollection => LazyCollection.make(items_)],
    ] as const) {
      const std = new stdClass();
      const local = new XtInstance();
      const typed = make([std, local, "x", 1, new stdClass()]);
      Assert.assertSame([0, 4], keysOf(typed.whereInstanceOf(fqcn(stdClass)).all()), `${name}.whereInstanceOf() with a class-name string`);
      Assert.assertSame([0, 4], keysOf(typed.whereInstanceOf(stdClass).all()), `${name}.whereInstanceOf() with a constructor`);
      Assert.assertSame([1], keysOf(typed.whereInstanceOf(XtInstance).all()), `${name}.whereInstanceOf() with a registered local class`);
      Assert.assertSame([1], keysOf(typed.whereInstanceOf(fqcn(XtInstance)).all()), `${name}.whereInstanceOf() with its class-name string`);
      Assert.assertSame([0, 1, 4], keysOf(typed.whereInstanceOf([stdClass, XtInstance]).all()), `${name}.whereInstanceOf() with a list of classes`);

      const keyed_ = make([
        { id: XtSuit.Hearts, v: 1 },
        { id: new XtStringable(), v: 2 },
        { id: null, v: 3 },
        { id: 7, v: 4 },
      ]).keyBy("id");
      Assert.assertSame(["H", "stringable", "", 7], keysOf(keyed_.all()), `${name}.keyBy(): an enum case's value, an object's string, null as ""`);
      Assert.assertSame([1, 2, 3, 4], array_values(keyed_.map((row: Record<string, unknown>) => row["v"]).all()));

      Assert.assertSame(["a", "b", "c", "d"], make(["a"]).concat(collect(["b"])).concat(LazyCollection.make({ k: "c", j: "d" })).all(), `${name}.concat() of a Collection and a LazyCollection, keys reset`);
    }
    Assert.assertTrue(looseEquals(collect([1]), collect([1])), "two Collections of equal items are == (AD-9.6)");
    Assert.assertFalse(looseEquals(collect([1]), collect([2])), "Collections of different items are not ==");
    Assert.assertFalse(looseEquals(collect([1]), new LazyCollection([1])), "a Collection is not == a LazyCollection");
  },
  120_000,
);
