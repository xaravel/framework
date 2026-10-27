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
//
// Story 14.4 adds XT-collections-8 (`merge()` renumbers integer keys and lets string keys overwrite, as `array_merge`
// does, against the Oracle). F-10 recorded reason for `14.4.jsonl`: XT-collections-8 is a Xaravel Test, so no Upstream
// test exists whose inputs the request could take. The request evaluates only the inputs its acceptance criterion
// names (epics.md Story 14.4: "`merge()` with integer keys and with string keys … integer keys are renumbered and
// string keys overwrite, as PHP's `array_merge` does … `union()` keeps the left-hand keys, as `+` does"): an
// integer-keyed array (`[1 => 'a', 2 => 'b']` merged with `[5 => 'c']`), a string-keyed one (`['a' => 1, 'b' => 2]`
// merged with `['b' => 3, 'c' => 4]`) and a mixed one (`['a' => 1, 5 => 'x', 'b' => 2]` merged with
// `['b' => 3, 7 => 'y']`), each through `merge()` and through `union()`, read back through `toArray()` and `toJson()`,
// on Collection (`collect`) and LazyCollection (`LazyCollection::make`). It contains no Upstream test and no fixture.
// Both the `merge()` and `union()` results are compared with the signed Oracle output. XT-collections-8 also checks, inline and with no Oracle request, members this Story adds that no ported
// test runs: `implode` (testImplode is `blocked-by:support`), `Arr.dot`'s AD-26 options form and prefix, and
// `combine`'s `ValueError` (LazyCollection's only when enumerated, with Laravel's message).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Arr, Collection, collect, ItemNotFoundException, LazyCollection, MultipleItemsFoundException } from "@xaravel/collections";
import { TestBackedEnum, TestStringBackedEnum, FIXTURES as ENUM_FIXTURES } from "../ported/framework/tests/Support/Fixtures/Enums";
import { ArgumentCountError, ArrayIterator, Generator } from "@xaravel/runtime";
import { Arrayable } from "@xaravel/contracts/support";
import { array_values, arrayEntries, Error as PhpError, fqcn, InvalidArgumentException, jsonEncode, keyed, looseEquals, PhpArray, TypeError as PhpTypeError, registerClass, resolveClass, RuntimeException, SORT_NUMERIC, SORT_NATURAL, SORT_REGULAR, SORT_STRING, stdClass, UnhandledMatchError, ValueError } from "@xaravel/runtime";

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
collect([1]).percentage(async () => true);
LazyCollection.make([1]).percentage(async () => true);
collect([1]).groupBy(async () => "a");
LazyCollection.make([1]).groupBy(async () => "a");
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
export const percent = collect([1, 2]).percentage((value) => value > 1);
export const lazyPercent = LazyCollection.make([1, 2]).percentage((value) => value > 1);
export const grouped = collect([1, 2]).groupBy((value) => value % 2);
export const groupedKey = collect([{ k: "a" }]).groupBy("k", true);
export const lazyGrouped = LazyCollection.make([1, 2]).groupBy((value, key) => key);
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
    symlinkSync(join(REPO, "packages", "runtime"), join(dir, "node_modules", "@xaravel", "runtime"));
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
  "Collections are sync (AD-6): passing an async callback to a sync member (filter, map, each, first, reject, every, partition, contains and takeWhile on Collection, filter on LazyCollection, percentage and groupBy on both classes, Arr.where, and filter on an Enumerable-typed receiver) fails to compile under the repository's tsc, through SyncCallback's NotPromise half (and ValueOrSyncCallback for the value-or-callback members), and oxlint's no-misused-promises reports every such call, through its void half, while the same calls with sync callbacks, and value forms such as every('age', '>=', 18) and reject(), compile and lint clean; the async companions filterAsync, rejectAsync, partitionAsync, everyAsync, containsAsync and firstAsync (DIV-1 Callbacks, DIV-1.2) exist on Collection and LazyCollection, await each callback before starting the next, in key order, keep the items' keys, return filter's, reject's, partition's, every's, contains' and first's results (every and contains stopping at the first decisive item, first resolving value(default) when none matches), and reject when a callback rejects; async-surface.json lists the six companions of Collection, LazyCollection and the Enumerable interface with root callback; duplicates' AD-26 options object { callback, strict } gives what its positional form gives, on both classes, while an invokable object is the callback and a plain object with a function __invoke is not read as the options object; whereInstanceOf filters by a class-name string, a constructor or a list of classes, keyBy keys an enum case by its value, an object by its string and null by \"\", concat appends a Collection's and a LazyCollection's values with keys reset, and two Collections of equal items are == through the props protocol (AD-9.6)",
  async () => {
    // (a) tsc and (b) oxlint reject async callbacks to sync members.
    await withFixture(ASYNC_CALLBACKS, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertNotEquals(0, tsc.code, tsc.output);
      Assert.assertSame(ASYNC_LINES.length, 16, "the fixture's async calls");
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

xaravelTest(
  "XT-collections-8",
  "merge() renumbers integer keys from 0 and lets a later string key overwrite an earlier one in its first position, as PHP's array_merge does, keeping key order (FR-23.1, FR-23.2): an integer-keyed array becomes a list ([\"a\",\"b\",\"c\"]), a string-keyed one an object ({\"a\":1,\"b\":3,\"c\":4}), and a mixed one keeps its string keys and renumbers its integer keys in order; toArray() and toJson() give the list or object shape the Oracle gives for the same arrays (FR-23.3), on Collection and LazyCollection; implode joins scalar items by its first argument and a callback's results by glue, and plucks a key from arrays or objects that are not Support's Stringable",
  () => {
    const int = new PhpArray<number, string>([
      [1, "a"],
      [2, "b"],
    ]);
    const intItems = new PhpArray<number, string>([[5, "c"]]);
    const string = { a: 1, b: 2 };
    const stringItems = { b: 3, c: 4 };
    const mixed = new PhpArray<string | number, unknown>([
      ["a", 1],
      [5, "x"],
      ["b", 2],
    ]);
    const mixedItems = new PhpArray<string | number, unknown>([
      ["b", 3],
      [7, "y"],
    ]);

    for (const [name, make] of [
      ["Collection", (items: unknown) => collect(items)],
      ["LazyCollection", (items: unknown) => LazyCollection.make(items)],
    ] as const) {
      Assert.assertSame(["a", "b", "c"], make(int).merge(intItems).toArray(), `${name} merge() renumbers integer keys into a list`);
      Assert.assertSame('["a","b","c"]', make(int).merge(intItems).toJson(), `${name} merge() of integer keys is a list in JSON`);
      Assert.assertSame(["a", "b", "c"], keysOf(make(string).merge(stringItems).toArray()), `${name} merge() keeps the first position of an overwritten string key`);
      Assert.assertSame('{"a":1,"b":3,"c":4}', make(string).merge(stringItems).toJson(), `${name} merge() lets the later string key's value win`);
      Assert.assertSame(["a", 0, "b", 1], keysOf(make(mixed).merge(mixedItems).toArray()), `${name} merge() keeps string keys and renumbers integer keys in order`);
      Assert.assertSame('{"a":1,"0":"x","b":3,"1":"y"}', make(mixed).merge(mixedItems).toJson(), `${name} merge() of mixed keys is an object in JSON`);
      const receiver = make(int);
      receiver.merge(intItems);
      Assert.assertSame([1, 2], keysOf(receiver.all()), `${name} merge() leaves its receiver unchanged`);

      // An integer-like string key is the int PHP makes of it, so merge() renumbers it as array_merge does.
      const numericString = new PhpArray<string, string>([
        ["5", "a"],
        ["x", "b"],
      ]);
      Assert.assertSame([5, "x"], keysOf(make(numericString).all()), `${name} normalises the key '5' to the int 5`);
      Assert.assertSame([0, "x", 1], keysOf(make(numericString).merge(new PhpArray<string, string>([["7", "c"]])).toArray()), `${name} merge() renumbers the integer-like string keys '5' and '7'`);
    }

    // A member this Story adds that no ported test runs (testImplode is blocked-by:support): implode.
    for (const [name, make] of [
      ["Collection", (items: unknown) => collect(items)],
      ["LazyCollection", (items: unknown) => LazyCollection.make(items)],
    ] as const) {
      Assert.assertSame("a,b", make(["a", "b"]).implode(","), `${name}.implode() joins scalar items by its first argument`);
      Assert.assertSame("ab", make(["a", "b"]).implode(null), `${name}.implode(null) joins scalar items with ''`);
      Assert.assertSame("a!-b!", make(["a", "b"]).implode((value: string) => `${value}!`, "-"), `${name}.implode() joins a callback's results by glue`);
      Assert.assertSame("x, y", make([{ name: "x" }, { name: "y" }]).implode("name", ", "), `${name}.implode() plucks a key from array items`);
      const objects = [Object.assign(new stdClass(), { name: "x" }), Object.assign(new stdClass(), { name: "y" })];
      Assert.assertSame("xy", make(objects).implode("name"), `${name}.implode() plucks a property from objects that are not Support's Stringable`);
    }

    // Arr.dot's AD-26 options form equals its positional form, and a prefix lands on every key.
    const nested = { a: { b: { c: 1 } }, d: 2 };
    const dotted = Arr.dot(nested, "p.", 1);
    Assert.assertSame(dotted, Arr.dot(nested, { prepend: "p.", depth: 1 }), "Arr.dot's options object equals its positional form");
    Assert.assertSame(["p.a.b", "p.d"], keysOf(dotted), "Arr.dot puts the prefix on every key, depth levels down");

    // combine() with mismatched counts: Collection throws PHP's ValueError at once, LazyCollection when enumerated.
    const thrown = (run: () => unknown): unknown => {
      try {
        run();
      } catch (error) {
        return error;
      }
      return null;
    };
    Assert.assertInstanceOf(ValueError, thrown(() => collect([1, 2]).combine([3])), "Collection.combine() throws ValueError");
    let lazyCombined: unknown = null;
    Assert.assertNull(
      thrown(() => (lazyCombined = LazyCollection.make([1, 2]).combine([3]))),
      "LazyCollection.combine() does not throw before it is enumerated",
    );
    const lazyError = thrown(() => (lazyCombined as LazyCollection).all());
    Assert.assertInstanceOf(ValueError, lazyError, "LazyCollection.combine() throws ValueError when enumerated");
    Assert.assertSame("Both parameters should have an equal number of elements", (lazyError as ValueError).getMessage(), "LazyCollection.combine()'s message");

    // The shapes, against the Oracle.
    const output = oracle("XT-collections-8", "conformance/oracle-requests/14.4.jsonl");
    const lazy = "\\Illuminate\\Support\\LazyCollection::make";
    const actual: [string, unknown][] = [
      ["collect($int)->merge($intItems)->toArray()", collect(int).merge(intItems).toArray()],
      ["collect($int)->merge($intItems)->toJson()", collect(int).merge(intItems).toJson()],
      [`${lazy}($int)->merge($intItems)->toArray()`, LazyCollection.make(int).merge(intItems).toArray()],
      [`${lazy}($int)->merge($intItems)->toJson()`, LazyCollection.make(int).merge(intItems).toJson()],
      ["collect($string)->merge($stringItems)->toArray()", collect(string).merge(stringItems).toArray()],
      ["collect($string)->merge($stringItems)->toJson()", collect(string).merge(stringItems).toJson()],
      [`${lazy}($string)->merge($stringItems)->toArray()`, LazyCollection.make(string).merge(stringItems).toArray()],
      [`${lazy}($string)->merge($stringItems)->toJson()`, LazyCollection.make(string).merge(stringItems).toJson()],
      ["collect($mixed)->merge($mixedItems)->toArray()", collect(mixed).merge(mixedItems).toArray()],
      ["collect($mixed)->merge($mixedItems)->toJson()", collect(mixed).merge(mixedItems).toJson()],
      [`${lazy}($mixed)->merge($mixedItems)->toArray()`, LazyCollection.make(mixed).merge(mixedItems).toArray()],
      [`${lazy}($mixed)->merge($mixedItems)->toJson()`, LazyCollection.make(mixed).merge(mixedItems).toJson()],

      ["collect($int)->union($intItems)->toArray()", collect(int).union(intItems).toArray()],
      ["collect($int)->union($intItems)->toJson()", collect(int).union(intItems).toJson()],
      [`${lazy}($int)->union($intItems)->toArray()`, LazyCollection.make(int).union(intItems).toArray()],
      [`${lazy}($int)->union($intItems)->toJson()`, LazyCollection.make(int).union(intItems).toJson()],
      ["collect($string)->union($stringItems)->toArray()", collect(string).union(stringItems).toArray()],
      ["collect($string)->union($stringItems)->toJson()", collect(string).union(stringItems).toJson()],
      [`${lazy}($string)->union($stringItems)->toArray()`, LazyCollection.make(string).union(stringItems).toArray()],
      [`${lazy}($string)->union($stringItems)->toJson()`, LazyCollection.make(string).union(stringItems).toJson()],
      ["collect($mixed)->union($mixedItems)->toArray()", collect(mixed).union(mixedItems).toArray()],
      ["collect($mixed)->union($mixedItems)->toJson()", collect(mixed).union(mixedItems).toJson()],
      [`${lazy}($mixed)->union($mixedItems)->toArray()`, LazyCollection.make(mixed).union(mixedItems).toArray()],
      [`${lazy}($mixed)->union($mixedItems)->toJson()`, LazyCollection.make(mixed).union(mixedItems).toJson()],
    ];
    Assert.assertSame(actual.length, output.results.length, "one Oracle result per expression, merge() then union()");
    actual.forEach(([expr, value], index) => {
      Assert.assertSame(result(output, index), value, expr);
    });

  },
);

// F-10 recorded reason for 14.5.jsonl: XT-collections-9 has no Upstream test. Its request checks only the
// criterion's numeric fractions, natural strings, multiple keys and stable ties, with mixed/string keys so keys(),
// toArray() and toJson() expose FR-23.1-3 key order and array shapes on both classes. No fixture is embedded.
xaravelTest(
  "XT-collections-9",
  "sortBy numeric fractions, natural strings, multiple sort keys and stable ties preserve Oracle key order and array/JSON shapes on Collection and LazyCollection (FR-23.1, FR-23.3); the signed fixture is required",
  () => {
    const cases = [
      [new PhpArray<string | number, unknown>([["late", { price: 1.9 }], [7, { price: "10.2" }], ["first", { price: 1.2 }], ["tie", { price: 1.2 }], ["last", { price: "10.5" }]]), "price", SORT_NUMERIC],
      [{ c: { name: "img10" }, a: { name: "img2" }, b: { name: "img1" } }, "name", SORT_NATURAL],
      [new PhpArray<string | number, unknown>([[9, { group: 2, price: 1.5 }], ["first", { group: 1, price: 1.2 }], [3, { group: 1, price: 1.9 }], ["tie", { group: 1, price: 1.9 }]]), [["group", "asc"], ["price", "desc"]], SORT_NUMERIC],
      [new PhpArray<string | number, unknown>([[5, { rank: 1 }], ["a", { rank: 1 }], [2, { rank: 1 }]]), "rank", SORT_NUMERIC],
    ] as const;
    const actual: unknown[] = [];
    for (const [items, callback, options] of cases) {
      for (const make of [(items: unknown) => collect(items), (items: unknown) => LazyCollection.make(items)]) {
        const sorted = make(items).sortBy(callback, options);
        actual.push(sorted.keys().all(), sorted.toArray(), sorted.toJson());
      }
    }
    const output = oracle("XT-collections-9", "conformance/oracle-requests/14.5.jsonl");
    Assert.assertSame(actual.length, output.results.length);
    actual.forEach((value, index) => Assert.assertSame(result(output, index), value, `sort expression ${index}`));
  },
);

xaravelTest(
  "XT-collections-10",
  "mapInto maps int and string backed enum values through from, preserves static case identity and keys on both classes, ordinary constructors receive each source value and key, and AD-26 enum constructors, cases, from and tryFrom retain their value behavior",
  () => {
    for (const [name, klass] of ENUM_FIXTURES) registerClass(name, klass);
    class CapturedMapInto {
      constructor(readonly value: unknown, readonly key: unknown) {}
    }
    registerClass("XaravelTests\\Collections\\CapturedMapInto", CapturedMapInto);
    for (const make of [(items: unknown) => collect(items), (items: unknown) => LazyCollection.make(items)]) {
      const constructed = make({ first: "alpha", second: "beta" }).mapInto(CapturedMapInto);
      Assert.assertSame(["first", "second"], constructed.keys().all());
      Assert.assertSame(["alpha", "first"], [(constructed.get("first") as CapturedMapInto).value, (constructed.get("first") as CapturedMapInto).key]);
      Assert.assertSame(["beta", "second"], [(constructed.get("second") as CapturedMapInto).value, (constructed.get("second") as CapturedMapInto).key]);
      const constructedByName = make({ first: "alpha", second: "beta" }).mapInto(fqcn(CapturedMapInto));
      Assert.assertSame(["first", "second"], constructedByName.keys().all());
      Assert.assertSame(["alpha", "first"], [(constructedByName.get("first") as CapturedMapInto).value, (constructedByName.get("first") as CapturedMapInto).key]);
      Assert.assertSame(["beta", "second"], [(constructedByName.get("second") as CapturedMapInto).value, (constructedByName.get("second") as CapturedMapInto).key]);
      const ints = make({ first: 1, second: 2 }).mapInto(TestBackedEnum);
      Assert.assertSame(["first", "second"], ints.keys().all());
      Assert.assertSame(TestBackedEnum.A, ints.get("first"));
      Assert.assertSame(TestBackedEnum.B, ints.get("second"));
      const strings = make({ first: "A", second: "B" }).mapInto(TestStringBackedEnum);
      Assert.assertSame(["first", "second"], strings.keys().all());
      Assert.assertSame(TestStringBackedEnum.A, strings.get("first"));
      Assert.assertSame(TestStringBackedEnum.B, strings.get("second"));
      Assert.assertSame([TestBackedEnum.A, TestBackedEnum.B], TestBackedEnum.cases());
      Assert.assertSame([TestStringBackedEnum.A, TestStringBackedEnum.B], TestStringBackedEnum.cases());
      Assert.assertSame(TestBackedEnum.A, TestBackedEnum.from(1));
      Assert.assertSame(TestBackedEnum.B, TestBackedEnum.tryFrom(2));
      Assert.assertNull(TestBackedEnum.tryFrom(3));
      Assert.assertSame(TestStringBackedEnum.A, TestStringBackedEnum.from("A"));
      Assert.assertSame(TestStringBackedEnum.B, TestStringBackedEnum.tryFrom("B"));
      Assert.assertNull(TestStringBackedEnum.tryFrom("C"));
      Assert.assertSame("Custom", new TestBackedEnum("Custom", 9).name);
      Assert.assertSame(9, new TestBackedEnum("Custom", 9).value);
      Assert.assertSame("custom", new TestStringBackedEnum("Custom", "custom").value);
      Assert.assertSame([TestBackedEnum.A], make([1]).mapInto(fqcn(TestBackedEnum)).all());
      for (const [values, klass] of [[[3], TestBackedEnum], [["C"], TestStringBackedEnum]] as const) {
        let failure: unknown = null;
        try { make(values).mapInto(klass).all(); } catch (error) { failure = error; }
        Assert.assertInstanceOf(ValueError, failure);
      }
    }
  },
);

xaravelTest(
  "XT-collections-11",
  "mapAsync and eachAsync await callbacks sequentially in original key order on both classes, copy array values, map preserves keys and each stops on false; every independent new sync callback API rejects async callbacks in tsc and lint; successful reduceSpread accumulates values and keys, dictionary/groups copy reused callback arrays including PhpArray results, PHP callable forms typecheck and execute with receiver binding and avg callbacks receive only values; pipe pipelines copy array results, run in order and propagate errors, while lazy mapping preserves duplicate keys before materialization and sorting/reverse defer enumeration; chunkWhile rereads an iterator advanced by its predicate; chunk reindexing, sliding step advancement and duplicate-key fullness preserve source behavior; owned direct and composed chunk/sliding/chunkWhile temporary sources run finally on early stop and callback errors, cleanup-only exceptions propagate and user-held Generators remain resumable, with callback exceptions taking precedence over competing finally exceptions (AD-6, DIV-1.2, DIV-9.16)",
  async () => {
    const operations = [
      "sum(async (value: number) => value)",
      "avg(async (value: number) => value)",
      "average(async (value: number) => value)",
      "mapSpread(async (value: number) => value)",
      "eachSpread(async (value: number) => value)",
      "mapToDictionary(async (value: number) => ({ key: value }))",
      "mapToGroups(async (value: number) => ({ key: value }))",
      "chunkWhile(async (value: number) => value)",
      "chunkBy(async (value: number) => value)",
      "sortKeysUsing(async (a: number, b: number) => a - b)",
      "reduceSpread(async (value: number) => [value], 0)",
      "map(async (value: number) => value)",
      "each(async () => true)",
      "flatMap(async (value: number) => [value])",
      "mapWithKeys(async (value: number) => ({ value }))",
      "sort(async (a: number, b: number) => a - b)",
      "sortByDesc(async (value: number) => value)",
      "sortByDesc([async (a: number, b: number) => a - b])",
      "sortByDesc([[async (a: number, b: number) => a - b, true]])",
      "min(async (value: number) => value)",
      "max(async (value: number) => value)",
      "reduce(async (carry: number, value: number) => carry + value, 0)",
      "reduceWithKeys(async (carry: number, value: number) => carry + value, 0)",
      "reduceInto(0, async () => true)",
      "pipe(async () => 1)",
      "pipeThrough([async (carry: number) => carry])",
      "tap(async () => true)",
      "map({ __invoke: async (value: number) => value })",
      "filter({ __invoke: async (value: number) => value })",
      "mapToDictionary({ __invoke: async (value: number) => ({ key: value }) })",
      "avg({ __invoke: async (value: number) => value })",
      "chunkWhile({ __invoke: async (value: number) => value })",
      "sortKeysUsing({ __invoke: async (a: number, b: number) => a - b })",
    ];
    const lines = [
      'import { Arr, collect, LazyCollection, type Enumerable } from "@xaravel/collections";',
      'const e: Enumerable = collect([1]);',
      ...["collect([1])", "LazyCollection.make([1])", "e"].flatMap((target) => operations.map((operation) => `${operation.startsWith("pipe(") ? "void " : ""}${target}.${operation};`)),
      'Arr.mapWithKeys([1], async (value: number) => ({ value }));',
      'Arr.map([1], async (value: number) => value);',
      'const descendingComparison: Extract<Parameters<typeof e.sortByDesc<number>>[0], (...args: number[]) => unknown> = async (a: number, b: number) => a - b; void descendingComparison;',
      'const pipelineCallback: Parameters<typeof e.pipeThrough<number>>[0][number] = async (carry: number) => carry; void pipelineCallback;',
    ];
    const invalid = lines.join("\n") + "\n";
    const diagnosticLines = lines.slice(2).map((_, index) => index + 3);
    await withFixture(invalid, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertNotEquals(0, tsc.code, tsc.output);
      Assert.assertSame(diagnosticLines, tsc.errors.map((entry) => Number(entry.split(":")[0])), tsc.output);
      const lint = oxlintFixture(dir);
      Assert.assertNotEquals(0, lint.code, lint.output);
      Assert.assertSame(diagnosticLines.filter((line) => !lines[line - 1]!.includes(".pipeThrough([") && !lines[line - 1]!.includes(".sortByDesc([")).map((line) => `${line}:no-misused-promises`), lint.diagnostics, lint.output);
    });
    const valid = invalid.replaceAll("async ", "") + [
      'e.sortByDesc("name");', 'e.sortByDesc(0);', 'e.sortByDesc(null);',
      'e.sortByDesc(["name", ["age", "desc"]]);',
    ].join("\n");
    await withFixture(valid, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertSame(0, tsc.code, tsc.output);
      const lint = oxlintFixture(dir);
      Assert.assertSame(0, lint.code, lint.output);
    });
    const callableForms = [
      '"strrev"', '"Callbacks::apply"', '[Callbacks, "apply"]', '["Callbacks", "apply"]',
      'new PhpArray<number, unknown>([[0, Callbacks], [1, "apply"]])', 'invokable',
    ];
    const callableOperations = ["map", "filter", "mapWithKeys", "mapToDictionary", "mapToGroups", "mapSpread", "eachSpread", "chunkWhile", "chunkBy", "sum", "avg", "average", "min", "max", "sortKeysUsing", "sort"];
    const callableFixture = [
      'import { collect, LazyCollection, type Enumerable } from "@xaravel/collections";',
      'import { PhpArray } from "@xaravel/runtime";',
      'class Callbacks { static apply(value: number) { return value; } }',
      'const invokable = new class { __invoke(value: number) { return value; } };',
      'const e: Enumerable = collect([1]);',
      ...["collect([1])", "LazyCollection.make([1])", "e"].flatMap((target) => callableOperations.flatMap((operation) => callableForms.map((form) => `${target}.${operation}(${form});`))),
      ...["collect([1])", "LazyCollection.make([1])", "e"].flatMap((target) => [
        `${target}.avg(value => value);`, `${target}.average(value => value);`,
        `const result${target === "e" ? "E" : target.startsWith("collect") ? "C" : "L"}: unknown[] | Record<string, unknown> | PhpArray = ${target}.reduceSpread((total: number, value: number) => [total + value], 0);`,
      ]),
      'void resultE; void resultC; void resultL;',
    ].join("\n") + "\n";
    await withFixture(callableFixture, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertSame(0, tsc.code, tsc.output);
      const lint = oxlintFixture(dir);
      Assert.assertSame(0, lint.code, lint.output);
    });
    const invalidAvg = [
      'import { collect, LazyCollection, type Enumerable } from "@xaravel/collections";',
      'const e: Enumerable = collect([1]);',
      ...["collect([1])", "LazyCollection.make([1])", "e"].flatMap((target) => ["avg", "average"].map((method) => `${target}.${method}((value: number, key: number) => value + key);`)),
    ].join("\n") + "\n";
    await withFixture(invalidAvg, async (dir) => {
      const tsc = await tscFixture(dir);
      Assert.assertSame([3, 4, 5, 6, 7, 8], tsc.errors.map((entry) => Number(entry.split(":")[0])), tsc.output);
    });
    Assert.assertSame({ a: "ba", b: "dc" }, collect({ a: "ab", b: "cd" }).map("strrev").all());
    Assert.assertSame({ a: "ba", b: "dc" }, Arr.map({ a: "ab", b: "cd" }, "strrev"));
    let lazyArityFailure: unknown = null;
    try { LazyCollection.make(["ab"]).map("strrev").all(); } catch (error) { lazyArityFailure = error; }
    Assert.assertInstanceOf(ArgumentCountError, lazyArityFailure);
    const mapInput = [[1], [2]];
    Assert.assertSame([[1, 9], [2, 9]], collect(mapInput).map((item: number[]) => { item.push(9); return item; }).all());
    Assert.assertSame([[1], [2]], mapInput);
    const fallbackInput = [[1]];
    const fallbackCounts: number[] = [];
    Assert.assertSame([[1, 9]], collect(fallbackInput).map((...args: unknown[]) => {
      fallbackCounts.push(args.length);
      const item = args[0] as number[];
      item.push(9);
      if (args.length > 1) throw new ArgumentCountError("one argument only");
      return item;
    }).all());
    Assert.assertSame([2, 1], fallbackCounts);
    Assert.assertSame([[1]], fallbackInput);
    class ExecutableCallable {
      static prefix = "static:";
      prefix = "instance:";
      static staticMap(value: string): string { return this.prefix + value; }
      map(value: string): string { return this.prefix + value; }
      pair(value: number, key: string): Record<string, unknown> { return { [this.prefix]: [value, key] }; }
      __invoke(value: string): string { return this.map(value); }
    }
    registerClass("XaravelTests\\Collections\\ExecutableCallable", ExecutableCallable);
    for (const invalid of ["missing_story145_callback", [ExecutableCallable, "missing"], new PhpArray<number, unknown>([[0, ExecutableCallable], [1, "missing"]])] as const) {
      let directFailure: unknown = null;
      let collectionFailure: unknown = null;
      try { Arr.map([], invalid); } catch (error) { directFailure = error; }
      try { collect([]).map(invalid); } catch (error) { collectionFailure = error; }
      Assert.assertInstanceOf(PhpTypeError, directFailure);
      Assert.assertInstanceOf(PhpTypeError, collectionFailure);
      Assert.assertSame((directFailure as PhpTypeError).getMessage(), (collectionFailure as PhpTypeError).getMessage());
    }
    class ArgumentCallable {
      readonly calls: unknown[] = [];
      predicate(value: number[], key: unknown): boolean {
        this.calls.push([value.slice(), key]); value.push(9); return key !== "omit";
      }
      spread(left: number[], right: number[], key: unknown): unknown[] {
        this.calls.push([left.slice(), right.slice(), key]); left.push(9); right.push(8); return [left, right, key];
      }
      aggregate(value: number[], ...keys: unknown[]): number {
        this.calls.push([value.slice(), keys]); const result = value[0]!; value.push(9); return result;
      }
      consecutive(value: number[], key: unknown, chunk: Collection): boolean {
        this.calls.push([value.slice(), key, chunk.toArray()]); value.push(9); return key !== "stop";
      }
    }
    class AggregateInvoker extends ArgumentCallable {
      __invoke(value: number[], ...keys: unknown[]): number { return this.aggregate(value, ...keys); }
    }
    class SpreadInvoker extends ArgumentCallable {
      __invoke(left: number[], right: number[], key: unknown): unknown[] { return this.spread(left, right, key); }
    }
    class WhileInvoker extends ArgumentCallable {
      __invoke(value: number[], key: unknown, chunk: Collection): boolean { return this.consecutive(value, key, chunk); }
    }
    registerClass("XaravelTests\\Collections\\ArgumentCallable", ArgumentCallable);
    registerClass("XaravelTests\\Collections\\AggregateInvoker", AggregateInvoker);
    registerClass("XaravelTests\\Collections\\SpreadInvoker", SpreadInvoker);
    registerClass("XaravelTests\\Collections\\WhileInvoker", WhileInvoker);
    for (const make of [(items: unknown) => collect(items), (items: unknown) => LazyCollection.make(items)]) {
      const arguments_ = new ArgumentCallable();
      const filteredInput = new PhpArray<number | string, number[]>([[5, [1]], ["omit", [2]], [2, [3]]]);
      Assert.assertSame(new PhpArray([[5, [1]], [2, [3]]]), make(filteredInput).filter([arguments_, "predicate"]).all());
      Assert.assertSame([[[1], 5], [[2], "omit"], [[3], 2]], arguments_.calls);
      Assert.assertSame(new PhpArray<number | string, number[]>([[5, [1]], ["omit", [2]], [2, [3]]]), filteredInput);
      const spreadCallable = new ArgumentCallable();
      const spreadInput = { outer: [[1], [2]] };
      Assert.assertSame({ outer: [[1, 9], [2, 8], "outer"] }, make(spreadInput).mapSpread([spreadCallable, "spread"]).all());
      Assert.assertSame([[[1], [2], "outer"]], spreadCallable.calls);
      Assert.assertSame({ outer: [[1], [2]] }, spreadInput);
      const spreadInvoker = new SpreadInvoker();
      Assert.assertSame({ outer: [[1, 9], [2, 8], "outer"] }, make(spreadInput).mapSpread(spreadInvoker).all());
      Assert.assertSame([[[1], [2], "outer"]], spreadInvoker.calls);
      const eachSpreadInvoker = new SpreadInvoker();
      const spreadSource = make(spreadInput);
      Assert.assertSame(spreadSource, spreadSource.eachSpread(eachSpreadInvoker));
      Assert.assertSame([[[1], [2], "outer"]], eachSpreadInvoker.calls);
      Assert.assertSame({ outer: [[1], [2]] }, spreadInput);
      const aggregateInvoker = new AggregateInvoker();
      const aggregateInput = { a: [1], b: [3] };
      Assert.assertSame(4, make(aggregateInput).sum(aggregateInvoker));
      Assert.assertSame([[[1], ["a"]], [[3], ["b"]]], aggregateInvoker.calls);
      const averageCallable = new ArgumentCallable();
      Assert.assertSame(2, make(aggregateInput).avg([averageCallable, "aggregate"]));
      Assert.assertSame([[[1], []], [[3], []]], averageCallable.calls);
      Assert.assertSame({ a: [1], b: [3] }, aggregateInput);
      const whileCallable = new ArgumentCallable();
      const whileInput = { a: [1], stop: [2], last: [3] };
      Assert.assertSame([{ a: [1] }, { stop: [2], last: [3] }], make(whileInput).chunkWhile([whileCallable, "consecutive"]).toArray());
      Assert.assertSame([[[2], "stop", { a: [1] }], [[3], "last", { stop: [2] }]], whileCallable.calls);
      Assert.assertSame({ a: [1], stop: [2], last: [3] }, whileInput);
      const whileInvoker = new WhileInvoker();
      Assert.assertSame([{ a: [1] }, { stop: [2], last: [3] }], make(whileInput).chunkWhile(whileInvoker).toArray());
      Assert.assertSame([[[2], "stop", { a: [1] }], [[3], "last", { stop: [2] }]], whileInvoker.calls);
      Assert.assertSame({ a: [1], stop: [2], last: [3] }, whileInput);
      const callable = new ExecutableCallable();
      Assert.assertSame({ a: 1, b: 2 }, make({ b: 2, a: 1 }).sortKeysUsing("strcmp").all());
      for (const [form, prefix] of [
        [[ExecutableCallable, "staticMap"], "static:"],
        [[fqcn(ExecutableCallable), "staticMap"], "static:"],
        [`${fqcn(ExecutableCallable)}::staticMap`, "static:"],
        [[callable, "map"], "instance:"],
        [new PhpArray<number, unknown>([[0, callable], [1, "map"]]), "instance:"],
        [callable, "instance:"],
      ] as const) {
        Assert.assertSame({ a: prefix + "x", b: prefix + "y" }, make({ a: "x", b: "y" }).map(form).all());
      }
      Assert.assertSame({ "instance:": [[1, "a"], [2, "b"]] }, make({ a: 1, b: 2 }).mapToDictionary([callable, "pair"]).all());
      Assert.assertSame({ "instance:": [[1, "a"], [2, "b"]] }, make({ a: 1, b: 2 }).mapToGroups(new PhpArray<number, unknown>([[0, callable], [1, "pair"]])).toArray());
      const phpReducerCalls: unknown[] = [];
      const phpReduced = make({ a: 2, b: 3 }).reduceSpread((total: number, keys: string, value: number, key: string) => {
        phpReducerCalls.push([total, keys, value, key]);
        return new PhpArray<number, unknown>([[7, total + value], [11, keys + key]]);
      }, 0, "");
      Assert.assertSame(new PhpArray<number, unknown>([[7, 5], [11, "ab"]]), phpReduced);
      Assert.assertSame([[0, "", 2, "a"], [2, "a", 3, "b"]], phpReducerCalls);
      Assert.assertSame({ total: 2 }, make([2]).reduceSpread((total: number, value: number) => ({ total: total + value }), 0));
      const namedCalls: unknown[] = [];
      let namedFailure: unknown = null;
      try {
        make([2, 3]).reduceSpread((total: number, value: number) => { namedCalls.push([total, value]); return { total: total + value }; }, 0);
      } catch (error) { namedFailure = error; }
      Assert.assertInstanceOf(PhpError, namedFailure);
      Assert.assertSame("Cannot use positional argument after named argument", (namedFailure as PhpError).getMessage());
      Assert.assertSame([[0, 2]], namedCalls);
      const nested = [0];
      const phpPair = new PhpArray<number, unknown>([[7, nested], [9, ["ignored"]]]);
      const phpDictionary = make([1, 2]).mapToDictionary((value: number) => { nested[0] = value; return phpPair; }).all();
      Assert.assertSame(new PhpArray([[7, [[1], [2]]]]), phpDictionary);
      nested[0] = 9;
      Assert.assertSame(new PhpArray([[7, [[1], [2]]]]), phpDictionary);
      const phpGroups = make([3, 4]).mapToGroups((value: number) => { nested[0] = value; return phpPair; }).toArray();
      Assert.assertSame(new PhpArray([[7, [[3], [4]]]]), phpGroups);
      nested[0] = 10;
      Assert.assertSame(new PhpArray([[7, [[3], [4]]]]), phpGroups);
      Assert.assertSame([10, 3, "abc"], make({ a: 2, b: 3, c: 5 }).reduceSpread(
        (total: number, count: number, keys: string, value: number, key: string) => [total + value, count + 1, keys + key], 0, 0, "",
      ));
      Assert.assertSame([0, "empty"], make([]).reduceSpread(() => { throw new RuntimeException("unreachable reducer"); }, 0, "empty"));
      const averageCalls: unknown[][] = [];
      Assert.assertSame(2, make([1, 3]).avg((...args: unknown[]) => { averageCalls.push(args); return args[0]; }));
      Assert.assertSame([[1], [3]], averageCalls);
      const reusedPair = { group: [0] };
      const dictionary = make([1, 2]).mapToDictionary((value: number) => { reusedPair.group[0] = value; return reusedPair; }).all();
      Assert.assertSame({ group: [[1], [2]] }, dictionary);
      reusedPair.group[0] = 9;
      Assert.assertSame({ group: [[1], [2]] }, dictionary);
      const groups = make([3, 4]).mapToGroups((value: number) => { reusedPair.group[0] = value; return reusedPair; }).toArray();
      Assert.assertSame({ group: [[3], [4]] }, groups);
      reusedPair.group[0] = 10;
      Assert.assertSame({ group: [[3], [4]] }, groups);
      const items = new PhpArray<string | number, number[]>([[5, [1]], ["a", [2]], [2, [3]]]);
      const source = make(items);
      const events: unknown[] = [];
      const mapped = await source.mapAsync(async (value: number[], key: unknown) => {
        events.push(["start", key]);
        await Promise.resolve();
        value.push(9);
        events.push(["end", key]);
        return value;
      });
      Assert.assertSame([["start", 5], ["end", 5], ["start", "a"], ["end", "a"], ["start", 2], ["end", 2]], events);
      Assert.assertSame([5, "a", 2], mapped.keys().all());
      Assert.assertSame(new PhpArray<string | number, unknown>([[5, [1, 9]], ["a", [2, 9]], [2, [3, 9]]]), mapped.all());
      Assert.assertSame(items, source.all(), "mapAsync gives each callback an array copy");
      const reused: number[] = [];
      const copied = await source.mapAsync(async (_value: unknown, key: unknown) => {
        await Promise.resolve();
        reused.push(typeof key === "number" ? key : 99);
        return reused;
      });
      reused.push(100);
      Assert.assertSame(new PhpArray<string | number, unknown>([[5, [5]], ["a", [5, 99]], [2, [5, 99, 2]]]), copied.all());
      const retained = [1];
      const piped = source.pipe(() => retained);
      retained.push(2);
      Assert.assertSame([1], piped, "pipe copies its callback result immediately");
      const pipelineEvents: unknown[] = [];
      const pipeline = source.pipeThrough([
        (carry: unknown) => { Assert.assertSame(source, carry); pipelineEvents.push("first"); return retained; },
        (carry: number[]) => { pipelineEvents.push("second"); carry.push(3); return carry; },
      ]);
      retained.push(4);
      Assert.assertSame(["first", "second"], pipelineEvents);
      Assert.assertSame([1, 2, 3], pipeline);
      Assert.assertSame([1, 2, 4], retained, "pipeline callbacks receive value copies");
      Assert.assertSame(source, source.pipeThrough([]));
      const pipeError = new Error("pipe failed");
      for (const execute of [
        () => source.pipe(() => { throw pipeError; }),
        () => source.pipeThrough([() => { throw pipeError; }, () => { pipelineEvents.push("unreachable"); }]),
      ]) {
        let failure: unknown = null;
        try { execute(); } catch (error) { failure = error; }
        Assert.assertSame(pipeError, failure);
      }
      Assert.assertSame(["first", "second"], pipelineEvents);
      Assert.assertSame(1, make([1, Number.NaN]).max());
      const maximumEvents: unknown[] = [];
      const maximum = make([null, 1, 2]).max((value: number) => {
        maximumEvents.push(value);
        return value === 1 ? null : 7;
      });
      Assert.assertSame([1, 2], maximumEvents, "max filters null source items before invoking the retriever, while a null retrieved value remains an accumulator candidate");
      Assert.assertSame(7, maximum);
      const sortedKeys = make(new PhpArray<string | number, number>([[5, 2], ["name", 3], [2, 1]])).sortDesc();
      Assert.assertSame(["name", 5, 2], sortedKeys.keys().all());
      Assert.assertSame(new PhpArray<string | number, number>([["name", 3], [5, 2], [2, 1]]), sortedKeys.all());
      Assert.assertSame({ mapped: 1 }, make([1]).mapWithKeys(() => collect({ mapped: 1 })).all());

      class ComparableRating {
        constructor(public rating: number) {}
        [Symbol.for("xaravel.php.props")](): { rating: number } { return { rating: this.rating }; }
      }
      const first = new ComparableRating(2);
      const second = new ComparableRating(1);
      const third = new ComparableRating(3);
      const candidates = [first, second, third];
      let retrievals = 0;
      const minimum = make([0, 1, 2]).min((value: number) => {
        retrievals++;
        if (value === 2) { second.rating = 4; }
        return candidates[value]!;
      });
      Assert.assertSame(3, retrievals);
      Assert.assertSame(source instanceof LazyCollection ? third : first, minimum, "minimum preserves eager map/reject/reduce versus lazy iteration boundaries");
      events.length = 0;
      const returned = await source.eachAsync(async (value: number[], key: unknown) => {
        events.push(["start", key]);
        await Promise.resolve();
        value.push(8);
        events.push(["end", key]);
        return key === "a" ? false : null;
      });
      Assert.assertSame(source, returned);
      Assert.assertSame([["start", 5], ["end", 5], ["start", "a"], ["end", "a"]], events);
      Assert.assertSame(items, source.all(), "eachAsync gives each callback an array copy");
      for (const companion of ["mapAsync", "eachAsync"] as const) {
        const boom = new Error("callback failed");
        const called: unknown[] = [];
        let failure: unknown = null;
        try {
          await source[companion](async (_value: unknown, key: unknown) => {
            called.push(key);
            await Promise.resolve();
            if (key === "a") { throw boom; }
            return key;
          });
        } catch (error) { failure = error; }
        Assert.assertSame(boom, failure);
        Assert.assertSame([5, "a"], called);
      }
    }
    Assert.assertSame({ mapped: 1 }, Arr.mapWithKeys([1], () => collect({ mapped: 1 })));
    const retainedReduction: number[] = [];
    const reduction = LazyCollection.make(function* () {
      yield 1;
      retainedReduction.push(99);
      yield 2;
    }).reduce((carry: number[], value: number) => {
      if (value === 1) { retainedReduction.push(value); return retainedReduction; }
      carry.push(value);
      return carry;
    }, []);
    Assert.assertSame([1, 2], reduction, "reduce copies callback-return arrays before advancing a lazy source");
    for (const companion of ["mapAsync", "eachAsync"] as const) {
      const sourceFailure = new Error("source failed");
      const sourceEvents: unknown[] = [];
      const throwingSource = LazyCollection.make(function* () {
        try { yield keyed("a", 1); throw sourceFailure; }
        finally { sourceEvents.push("finally"); }
      });
      let failure: unknown = null;
      try {
        await throwingSource[companion](async (value: number, key: unknown) => {
          sourceEvents.push([key, value]);
          await Promise.resolve();
          return value;
        });
      } catch (error) { failure = error; }
      Assert.assertSame(sourceFailure, failure);
      Assert.assertSame([["a", 1], "finally"], sourceEvents);
    }
    const duplicateEvents: unknown[] = [];
    const duplicateResult = await LazyCollection.make(function* () {
      yield keyed(5, 1); yield keyed("name", 2); yield keyed(5, 3);
    }).mapAsync(async (value: number, key: unknown) => {
      duplicateEvents.push([key, value]);
      await Promise.resolve();
      return value * 2;
    });
    Assert.assertSame([[5, 1], ["name", 2], [5, 3]], duplicateEvents);
    Assert.assertSame([5, "name"], duplicateResult.keys().all());
    Assert.assertSame(new PhpArray<string | number, number>([[5, 6], ["name", 4]]), duplicateResult.all());
    const timing: unknown[] = [];
    const timedMaximum = LazyCollection.make(function* () {
      timing.push("null"); yield null;
      timing.push("one"); yield 1;
      timing.push("two"); yield 2;
      timing.push("done");
    }).max((value: number) => { timing.push(["retrieve", value]); return value; });
    Assert.assertSame(2, timedMaximum);
    Assert.assertSame(["null", "one", ["retrieve", 1], "two", ["retrieve", 2], "done"], timing);
    for (const invalidResult of [null, false, 0, "scalar"]) {
      Assert.assertSame([], Arr.mapWithKeys([1], () => invalidResult));
      Assert.assertSame([], collect([1]).mapWithKeys(() => invalidResult).all());
      const invalidLazy = LazyCollection.make([1]).mapWithKeys(() => invalidResult);
      let failure: unknown = null;
      try { invalidLazy.all(); } catch (error) { failure = error; }
      Assert.assertInstanceOf(PhpError, failure);
      Assert.assertSame('Can use "yield from" only with arrays and Traversables', (failure as PhpError).getMessage());
    }
    let enumerations = 0;
    let visited = 0;
    const lazy = LazyCollection.make(function* () {
      enumerations++;
      for (const value of [3, 1, 2]) { visited++; yield value; }
    });
    const associative = lazy.mapWithKeys((value: number) => ({ duplicate: value }));
    Assert.assertSame(0, enumerations);
    const iterator = associative.entries();
    Assert.assertSame(["duplicate", 3], iterator.next().value);
    Assert.assertSame(1, visited);
    Assert.assertSame(["duplicate", 1], iterator.next().value);
    Assert.assertSame(2, visited);
    Assert.assertSame(["duplicate", 2], iterator.next().value);
    Assert.assertSame(3, visited);
    Assert.assertTrue(iterator.next().done);
    Assert.assertSame({ duplicate: 2 }, associative.all());
    Assert.assertSame(2, enumerations);
    for (const operation of ["sort", "sortDesc", "reverse"] as const) {
      const before = enumerations;
      const deferred = lazy[operation]();
      Assert.assertSame(before, enumerations);
      const expected = operation === "sort" ? [1, 2, 3] : operation === "sortDesc" ? [3, 2, 1] : [2, 1, 3];
      Assert.assertSame(expected, deferred.values().all());
      Assert.assertSame(before + 1, enumerations);
    }
    const earlyEvents: unknown[] = [];
    const earlySource = LazyCollection.make(function* () {
      try { yield keyed("first", 1); earlyEvents.push("unreachable"); yield 2; }
      finally { earlyEvents.push("finally"); }
    });
    Assert.assertSame(earlySource, await earlySource.eachAsync(async (_value: unknown, key: unknown) => {
      earlyEvents.push(key);
      await Promise.resolve();
      return false;
    }));
    Assert.assertSame(["first", "finally"], earlyEvents);
    for (const companion of ["mapAsync", "eachAsync"] as const) {
      const events: unknown[] = [];
      const bodyError = new RuntimeException("callback error");
      const finalError = new RuntimeException("finally error");
      const failFinally = (): never => { events.push("finally"); throw finalError; };
      const source = LazyCollection.make(function* () {
        try { yield 1; events.push("unreachable"); yield 2; }
        finally { failFinally(); }
      });
      let failure: unknown = null;
      try { await source[companion](async () => { await Promise.resolve(); throw bodyError; }); }
      catch (error) { failure = error; }
      Assert.assertSame(bodyError, failure); // adapted:DIV-9.16
      Assert.assertSame(["finally"], events);
    }
    const heldEvents: unknown[] = [];
    const held = new Generator((function* () {
      try { yield keyed("first", 1); heldEvents.push("resumed"); yield keyed("second", 2); }
      finally { heldEvents.push("finally"); }
    })());
    await LazyCollection.make(() => held).eachAsync(async () => false);
    Assert.assertSame([], heldEvents);
    Assert.assertSame(1, held.current());
    held.next();
    Assert.assertSame(2, held.current());
    Assert.assertSame(["resumed"], heldEvents);
    held.next();
    Assert.assertSame(["resumed", "finally"], heldEvents);
    const advanced = new Generator((function* () { yield 1; yield 2; yield 3; yield 4; })());
    let advancedOnce = false;
    Assert.assertSame([[1], new PhpArray([[2, 3]]), new PhpArray([[3, 4]])], LazyCollection.make(() => advanced).chunkWhile(() => {
      if (!advancedOnce) { advanced.next(); advancedOnce = true; }
      return false;
    }).map((chunk: LazyCollection) => chunk.all()).all());
    const consumerAdvanced = new Generator((function* () { yield 1; yield 2; yield 3; yield 4; })());
    const consumerChunks: unknown[] = [];
    LazyCollection.make(() => consumerAdvanced).chunkWhile(() => false).each((chunk: LazyCollection) => {
      consumerChunks.push(chunk.all());
      if (consumerChunks.length === 1) consumerAdvanced.next();
    });
    Assert.assertSame([[1], new PhpArray([[2, 3]]), new PhpArray([[3, 4]])], consumerChunks);
    for (const preserveKeys of [false, { preserveKeys: false }] as const) {
      const events: unknown[] = [];
      const source = LazyCollection.make(function* () {
        try {
          events.push("left"); yield keyed("left", "a");
          events.push(5); yield keyed(5, "b");
          events.push("unreachable"); yield keyed("right", "c");
        } finally { events.push("finally"); }
      });
      const chunks: unknown[] = [];
      source.chunk(2, preserveKeys).each((chunk: LazyCollection) => { chunks.push(chunk.all()); return false; });
      Assert.assertSame([["a", "b"]], chunks);
      Assert.assertSame(["left", 5, "finally"], events);
    }
    for (const [size, step, expected, consumed] of [
      [3, 1, [[[0, 1], [1, 2], [2, 3]], [[1, 2], [2, 3], [3, 4]]], [1, 2, 3, 4]],
      [2, 2, [[[0, 1], [1, 2]], [[2, 3], [3, 4]]], [1, 2, 3, 4]],
      [2, 4, [[[0, 1], [1, 2]], [[4, 5], [5, 6]]], [1, 2, 3, 4, 5, 6]],
    ] as const) {
      const events: unknown[] = [];
      const source = LazyCollection.make(function* () {
        try { for (let value = 1; value <= 8; value++) { events.push(value); yield value; } }
        finally { events.push("finally"); }
      });
      const windows: unknown[] = [];
      source.sliding(size, step).each((window: LazyCollection) => { windows.push(arrayEntries(window.all() as object)); return windows.length < 2; });
      Assert.assertSame(expected, windows);
      Assert.assertSame([...consumed, "finally"], events);
    }
    for (const operation of ["chunk", "sliding"] as const) {
      const events: unknown[] = [];
      const source = LazyCollection.make(function* () {
        try {
          events.push(1); yield keyed("same", 1);
          events.push(2); yield keyed("same", 2);
          events.push(3); yield keyed("other", 3);
          events.push("unreachable"); yield 4;
        } finally { events.push("finally"); }
      });
      const chunks: unknown[] = [];
      source[operation](2).each((chunk: LazyCollection) => { chunks.push(chunk.all()); return false; });
      Assert.assertSame([{ same: 2, other: 3 }], chunks);
      Assert.assertSame([1, 2, 3, "finally"], events);
    }
    for (const terminal of ["first", "take", "each"] as const) {
      const events: unknown[] = [];
      const source = LazyCollection.make(function* () {
        try { for (const item of [1, 2, 3, 4]) { events.push(item); yield item; } }
        finally { events.push("finally"); }
      });
      const ready = source.chunk(2).sliding(1);
      if (terminal === "first") Assert.assertSame([[1, 2]], ready.first().toArray());
      else if (terminal === "take") Assert.assertSame([[[1, 2]]], ready.take(1).toArray());
      else {
        const bodyError = new RuntimeException("sync each error");
        let failure: unknown = null;
        try { ready.each(() => { throw bodyError; }); } catch (error) { failure = error; }
        Assert.assertSame(bodyError, failure);
      }
      Assert.assertSame([1, 2, "finally"], events);
    }
    for (const [count, expected] of [
      [0, [1, 2, 3, 4]],
      [1, new PhpArray([[1, 2], [2, 3], [3, 4]])],
      [2, new PhpArray([[2, 3], [3, 4]])],
      [-1, []],
    ] as const) {
      Assert.assertSame(expected, LazyCollection.make([1, 2, 3, 4]).skip(count).all());
      Assert.assertSame(expected, LazyCollection.make(function* () { yield 1; yield 2; yield 3; yield 4; }).skip(count).all());
      Assert.assertSame([], LazyCollection.make([]).skip(count).all());
    }
    const exhaustedValues = [[1], [2]];
    const exhaustionEvents: unknown[] = [];
    const exhaustedByPredicate = new Generator((function* () {
      try { yield exhaustedValues[0]; yield exhaustedValues[1]; }
      finally { exhaustionEvents.push("finally"); }
    })());
    Assert.assertSame([], LazyCollection.make(() => exhaustedByPredicate).skipWhile((item: number[]) => {
      item.push(9);
      while (exhaustedByPredicate.valid()) exhaustedByPredicate.next();
      return false;
    }).sliding(1).all());
    Assert.assertSame([[1], [2]], exhaustedValues);
    Assert.assertSame(["finally"], exhaustionEvents);
    Assert.assertFalse(exhaustedByPredicate.valid());
    class ObservedIterator extends ArrayIterator {
      readonly events: unknown[] = [];
      override valid(): boolean { const result = super.valid(); this.events.push(["valid", result]); return result; }
      override current(): unknown { const result = super.current(); this.events.push(["current", result]); return result; }
      override key(): ReturnType<ArrayIterator["key"]> { const result = super.key(); this.events.push(["key", result]); return result; }
      override next(): void { this.events.push(["next"]); super.next(); }
      override rewind(): void { this.events.push(["rewind"]); super.rewind(); }
    }
    registerClass("XaravelTests\\Collections\\ObservedIterator", ObservedIterator);
    const emptyProbe = new ObservedIterator([1, 2]);
    Assert.assertFalse(LazyCollection.make(() => emptyProbe).isEmpty());
    Assert.assertSame([["valid", true]], emptyProbe.events);
    const firstProbe = new ObservedIterator([1, 2]);
    Assert.assertSame(1, LazyCollection.make(() => firstProbe).first());
    Assert.assertSame([["valid", true], ["current", 1]], firstProbe.events);
    const skipProbe = new ObservedIterator([1, 2, 3, 4]);
    Assert.assertSame(new PhpArray([[2, 3]]), LazyCollection.make(() => skipProbe).skip(2).take(1).all());
    Assert.assertSame([
      ["valid", true], ["next"], ["valid", true], ["next"], ["valid", true],
      ["valid", true], ["key", 2], ["current", 3],
    ], skipProbe.events);
    const whileProbe = new ObservedIterator([1, 2, 3]);
    Assert.assertSame(new PhpArray([[1, 2]]), LazyCollection.make(() => whileProbe).skipWhile((value: number, key: number) => {
      whileProbe.events.push(["callback", value, key]); return value < 2;
    }).take(1).all());
    Assert.assertSame([
      ["valid", true], ["current", 1], ["key", 0], ["callback", 1, 0], ["next"],
      ["valid", true], ["current", 2], ["key", 1], ["callback", 2, 1],
      ["valid", true], ["key", 1], ["current", 2],
    ], whileProbe.events);
    const chunkProbe = new ObservedIterator([1, 2, 3]);
    Assert.assertSame([1, 2], LazyCollection.make(() => chunkProbe).chunk(2, false).first().all());
    Assert.assertSame([["valid", true], ["current", 1], ["next"], ["valid", true], ["current", 2]], chunkProbe.events);
    const chunkWhileProbe = new ObservedIterator([1, 2, 3]);
    Assert.assertSame([1], LazyCollection.make(() => chunkWhileProbe).chunkWhile((value: number, key: number) => {
      chunkWhileProbe.events.push(["callback", value, key]); return false;
    }).first().all());
    Assert.assertSame([
      ["valid", true], ["key", 0], ["current", 1], ["next"],
      ["valid", true], ["current", 2], ["key", 1], ["callback", 2, 1],
    ], chunkWhileProbe.events);
    const slidingProbe = new ObservedIterator([1, 2, 3, 4, 5, 6, 7]);
    Assert.assertSame([[1, 2], new PhpArray([[4, 5], [5, 6]])], LazyCollection.make(() => slidingProbe).sliding(2, 4).take(2).toArray());
    Assert.assertSame([
      ["valid", true], ["key", 0], ["current", 1], ["next"], ["valid", true], ["key", 1], ["current", 2],
      ["valid", true], ["next"], ["valid", true], ["next"], ["next"],
      ["valid", true], ["key", 4], ["current", 5], ["next"], ["valid", true], ["key", 5], ["current", 6],
    ], slidingProbe.events);
    const takeProbe = new ObservedIterator([1, 2]);
    Assert.assertSame([1], LazyCollection.make(() => takeProbe).take(1).all());
    Assert.assertSame([["valid", true], ["key", 0], ["current", 1]], takeProbe.events);
    const zeroProbe = new ObservedIterator([1, 2]);
    Assert.assertSame([], LazyCollection.make(() => zeroProbe).take(0).all());
    Assert.assertSame([], zeroProbe.events);
    const zeroEvents: unknown[] = [];
    Assert.assertSame([], LazyCollection.make(function* () {
      try { zeroEvents.push("started"); yield 1; }
      finally { zeroEvents.push("finally"); }
    }).take(0).all());
    Assert.assertSame([], zeroEvents);
    const manualPaths: [string, (source: LazyCollection) => unknown, unknown, unknown][] = [
      ["first", source => source.first(), 2, null],
      ["isEmpty", source => source.isEmpty(), false, true],
      ["skip", source => source.skip(1).all(), new PhpArray([[2, 3], [3, 4]]), []],
      ["skipWhile", source => source.skipWhile((value: number) => value < 3).all(), new PhpArray([[2, 3], [3, 4]]), []],
      ["take", source => source.take(2).all(), new PhpArray([[1, 2], [2, 3]]), []],
      ["chunk", source => source.chunk(2).toArray(), [new PhpArray([[1, 2], [2, 3]]), new PhpArray([[3, 4]])], []],
      ["sliding", source => source.sliding(2).toArray(), [new PhpArray([[1, 2], [2, 3]]), new PhpArray([[2, 3], [3, 4]])], []],
      ["chunkWhile", source => source.chunkWhile((value: number) => value < 4).toArray(), [new PhpArray([[1, 2], [2, 3]]), new PhpArray([[3, 4]])], []],
    ];
    for (const [name, operation, advancedExpected, exhaustedExpected] of manualPaths) {
      for (const exhausted of [false, true]) {
        const events: unknown[] = [];
        const held = new Generator((function* () {
          try { yield 1; yield 2; yield 3; yield 4; }
          finally { events.push("finally"); }
        })());
        held.next(); // Already advanced beyond the first yield, as Upstream's manual cursor APIs allow.
        if (exhausted) while (held.valid()) held.next();
        Assert.assertSame(exhausted ? exhaustedExpected : advancedExpected, operation(LazyCollection.make(() => held)), name);
        if (!exhausted && (name === "first" || name === "isEmpty" || name === "take")) {
          Assert.assertSame([], events, name);
          Assert.assertSame(name === "take" ? 3 : 2, held.current(), name);
        }
        while (held.valid()) held.next();
        Assert.assertSame(["finally"], events, name);
      }
    }
    const movedWhile = new Generator((function* () { yield 1; yield 2; yield 3; yield 4; })());
    movedWhile.next();
    Assert.assertSame(new PhpArray([[2, 3], [3, 4]]), LazyCollection.make(() => movedWhile).skipWhile(() => { movedWhile.next(); return false; }).all());
    const recapturedEvents: unknown[] = [];
    const recapturedCollection = LazyCollection.make(function* () {
      try { yield 1; yield 2; yield 3; }
      finally { recapturedEvents.push("finally"); }
    });
    const recaptured = recapturedCollection.getIterator() as Generator;
    recaptured.next();
    recapturedCollection.source = () => recaptured;
    Assert.assertSame(new PhpArray([[1, 2]]), recapturedCollection.take(1).all());
    Assert.assertSame([], recapturedEvents);
    Assert.assertSame(2, recaptured.current());
    while (recaptured.valid()) recaptured.next();
    Assert.assertSame(["finally"], recapturedEvents);
    Assert.assertSame([], recapturedCollection.take(1).all());
    const inheritedOwnershipEvents: unknown[] = [];
    const temporarySource = LazyCollection.make(function* () {
      try { yield 1; yield 2; yield 3; }
      finally { inheritedOwnershipEvents.push("finally"); }
    });
    Assert.assertSame([1, 2], new LazyCollection(temporarySource).chunk(2).first().all());
    Assert.assertSame(["finally"], inheritedOwnershipEvents);
    for (const operation of ["isEmpty", "skip", "skipWhile"] as const) {
      const events: unknown[] = [];
      const source = LazyCollection.make(function* () {
        try { for (const item of [1, 2, 3]) { events.push(item); yield item; } }
        finally { events.push("finally"); }
      });
      if (operation === "isEmpty") Assert.assertFalse(source.isEmpty());
      else if (operation === "skip") Assert.assertSame(2, source.skip(1).first());
      else Assert.assertSame(2, source.skipWhile((value: number) => value < 2).first());
      Assert.assertSame(operation === "isEmpty" ? [1, "finally"] : [1, 2, "finally"], events);
      const heldEvents: unknown[] = [];
      const held = new Generator((function* () {
        try { yield 1; yield 2; yield 3; }
        finally { heldEvents.push("finally"); }
      })());
      const referenced = LazyCollection.make(() => held);
      if (operation === "isEmpty") Assert.assertFalse(referenced.isEmpty());
      else if (operation === "skip") Assert.assertSame(2, referenced.skip(1).first());
      else Assert.assertSame(2, referenced.skipWhile((value: number) => value < 2).first());
      Assert.assertSame([], heldEvents);
      Assert.assertSame(operation === "isEmpty" ? 1 : 2, held.current());
      while (held.valid()) held.next();
      Assert.assertSame(["finally"], heldEvents);
    }
    const traversals: ((source: LazyCollection) => LazyCollection)[] = [
      (source) => source.chunk(2),
      (source) => source.sliding(2),
      (source) => source.chunkWhile(() => false),
      (source) => source.chunk(2).sliding(1),
      (source) => source.sliding(2).chunk(1),
      (source) => source.chunkWhile(() => false).sliding(1),
    ];
    const nestedValues = (item: unknown): unknown => item instanceof LazyCollection || item instanceof Collection ? [...item].map(nestedValues) : item;
    const completeExpected = [
      [[1, 2], [3, 4]],
      [[1, 2], [2, 3], [3, 4]],
      [[1], [2], [3], [4]],
      [[[1, 2]], [[3, 4]]],
      [[[1, 2]], [[2, 3]], [[3, 4]]],
      [[[1]], [[2]], [[3]], [[4]]],
    ];
    for (const [index, traverse] of traversals.entries()) {
      const events: unknown[] = [];
      const source = LazyCollection.make(function* () {
        try { for (const value of [1, 2, 3, 4]) { events.push(value); yield value; } }
        finally { events.push("finally"); }
      });
      Assert.assertSame(completeExpected[index], [...traverse(source)].map(nestedValues));
      Assert.assertSame([1, 2, 3, 4, "finally"], events);
      const sourceError = new RuntimeException("composed source error");
      const sourceEvents: unknown[] = [];
      const throwingSource = LazyCollection.make(function* () {
        try { sourceEvents.push(1); yield 1; sourceEvents.push(2); yield 2; throw sourceError; }
        finally { sourceEvents.push("finally"); }
      });
      let failure: unknown = null;
      try { traverse(throwingSource).all(); } catch (error) { failure = error; }
      Assert.assertSame(sourceError, failure);
      Assert.assertSame([1, 2, "finally"], sourceEvents);
    }
    for (const traverse of traversals) {
      for (const exit of ["false", "callback-error", "competing-error", "cleanup-error"] as const) {
        const events: unknown[] = [];
        const bodyError = new RuntimeException("composed body error");
        const cleanupError = new RuntimeException("composed cleanup error");
        const failCleanup = (): never => { throw cleanupError; };
        const source = LazyCollection.make(function* () {
          try { for (const item of [1, 2, 3, 4]) { events.push(item); yield keyed(item, item); } }
          finally { events.push("finally"); if (exit === "competing-error" || exit === "cleanup-error") failCleanup(); }
        });
        let failure: unknown = null;
        try {
          await traverse(source).eachAsync(async () => {
            await Promise.resolve();
            if (exit === "callback-error" || exit === "competing-error") throw bodyError;
            return false;
          });
        } catch (error) { failure = error; }
        if (exit === "false") Assert.assertNull(failure);
        else if (exit === "cleanup-error") Assert.assertSame(cleanupError, failure);
        else Assert.assertSame(bodyError, failure); // adapted:DIV-9.16
        Assert.assertSame([1, 2, "finally"], events);
      }
      const events: unknown[] = [];
      const held = new Generator((function* () {
        try { for (const item of [1, 2, 3]) { events.push(item); yield item; } }
        finally { events.push("finally"); }
      })());
      await traverse(LazyCollection.make(() => held)).eachAsync(async () => false);
      Assert.assertSame([1, 2], events);
      Assert.assertSame(2, held.current());
      held.next();
      Assert.assertSame(3, held.current());
      held.next();
      Assert.assertSame([1, 2, 3, "finally"], events);
    }
    for (const throwingFinally of [false, true]) {
      const events: unknown[] = [];
      const bodyError = new RuntimeException("chunkWhile predicate error");
      const failCleanup = (): never => { throw new RuntimeException("chunkWhile cleanup error"); };
      const source = LazyCollection.make(function* () {
        try { yield 1; yield 2; events.push("unreachable"); yield 3; }
        finally { events.push("finally"); if (throwingFinally) failCleanup(); }
      });
      let failure: unknown = null;
      try { source.map(value => value).chunkWhile(() => { throw bodyError; }).all(); }
      catch (error) { failure = error; }
      Assert.assertSame(bodyError, failure); // adapted:DIV-9.16
      Assert.assertSame(["finally"], events);
    }
    const surface = JSON.parse(readFileSync(join(REPO, "packages", "collections", "async-surface.json"), "utf8")) as { method: string; root: string }[];
    for (const klass of ["Collection", "LazyCollection", "Enumerable"]) {
      for (const companion of ["mapAsync", "eachAsync"]) {
        Assert.assertTrue(surface.some((entry) => entry.method === `${klass}.${companion}` && entry.root === "callback"));
      }
    }
  },
  120_000,
);
