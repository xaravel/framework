// pilot/porting: Story 8.7 pilot translation, never merged
// Ported from tests/Support/SupportCollectionTest.php (Illuminate\Tests\Support\SupportCollectionTest).
import { portedTest, TestCase } from "@xaravel/assert";
import { Mockery } from "@xaravel/mockery";
import { collect, Collection, LazyCollection } from "@xaravel/collections";
import { Model } from "@xaravel/database";
import { HtmlString } from "@xaravel/support";
import { Arrayable } from "@xaravel/contracts/support";
import { ArrayObject, InvalidArgumentException, JsonSerializable, looseEquals, PhpArray, stdClass, strrev, toPhpString } from "@xaravel/runtime/php";

const ID = "Illuminate\\Tests\\Support\\SupportCollectionTest";

/** `collectionClassProvider()`: one row per collection class. */
const collectionClassProvider = [[Collection], [LazyCollection]];

type CollectionClass = typeof Collection | typeof LazyCollection;

/** `(object) [...]`: a stdClass carrying the array's entries as properties. */
function toObject(props: Readonly<Record<string, unknown>>): stdClass {
  return Object.assign(new stdClass(), props);
}

portedTest(`${ID}::testShiftReturnsNullOnEmptyCollection`, { case: TestCase }, async function () {
  const itemFoo = new stdClass();
  itemFoo.text = "f";
  const itemBar = new stdClass();
  itemBar.text = "x";

  const items = collect([itemFoo, itemBar]);

  const foo = items.shift();
  const bar = items.shift();

  this.assertSame("f", foo?.text);
  this.assertSame("x", bar?.text);
  this.assertNull(items.shift());
});

portedTest(`${ID}::testShiftManyReturnsEmptyCollectionOnEmptyCollection`, { case: TestCase }, async function () {
  this.assertEquals(new Collection(), new Collection().shift(0));
  this.assertEquals(new Collection(), new Collection().shift(2));
});

portedTest(`${ID}::testToArrayCallsToArrayOnEachItemInCollection`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const item1 = Mockery.mock(Arrayable);
  item1.expects("toArray").andReturn("foo.array");
  const item2 = Mockery.mock(Arrayable);
  item2.expects("toArray").andReturn("bar.array");
  const c = new collection([item1, item2]);
  const results = c.toArray();

  this.assertEquals(["foo.array", "bar.array"], results);
});

portedTest(`${ID}::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const item1 = Mockery.mock(JsonSerializable);
  item1.expects("jsonSerialize").andReturn("foo.json");
  const item2 = Mockery.mock(Arrayable);
  item2.expects("toArray").andReturn("bar.array");
  const c = new collection([item1, item2]);
  const results = c.jsonSerialize();

  this.assertEquals(["foo.json", "bar.array"], results);
});

portedTest(`${ID}::testArrayAccessOffsetGet`, { case: TestCase }, async function () {
  const c = new Collection(["foo", "bar"]);
  this.assertSame("foo", c.offsetGet(0));
  this.assertSame("bar", c.offsetGet(1));
});

portedTest(`${ID}::testForgetArrayOfKeys`, { case: TestCase }, async function () {
  let c = new Collection(["foo", "bar", "baz"]);
  c = c.forget([0, 2]).all();
  this.assertFalse((c?.[0] ?? null) !== null);
  this.assertFalse((c?.[2] ?? null) !== null);
  this.assertTrue((c?.[1] ?? null) !== null);

  c = new Collection({ name: "taylor", foo: "bar", baz: "qux" });
  c = c.forget(["foo", "baz"]).all();
  this.assertFalse((c?.["foo"] ?? null) !== null);
  this.assertFalse((c?.["baz"] ?? null) !== null);
  this.assertTrue((c?.["name"] ?? null) !== null);
});

portedTest(`${ID}::testWhere`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  let c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);

  this.assertEquals([{ v: 3 }, { v: "3" }], c.where("v", 3).values().all());
  this.assertEquals([{ v: 3 }, { v: "3" }], c.where("v", "=", 3).values().all());
  this.assertEquals([{ v: 3 }, { v: "3" }], c.where("v", "==", 3).values().all());
  this.assertEquals([{ v: 3 }, { v: "3" }], c.where("v", "garbage", 3).values().all());
  this.assertEquals([{ v: 3 }], c.where("v", "===", 3).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 4 }], c.where("v", "<>", 3).values().all());
  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 4 }], c.where("v", "!=", 3).values().all());
  this.assertEquals([{ v: 1 }, { v: 2 }, { v: "3" }, { v: 4 }], c.where("v", "!==", 3).values().all());
  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }], c.where("v", "<=", 3).values().all());
  this.assertEquals([{ v: 3 }, { v: "3" }, { v: 4 }], c.where("v", ">=", 3).values().all());
  this.assertEquals([{ v: 1 }, { v: 2 }], c.where("v", "<", 3).values().all());
  this.assertEquals([{ v: 4 }], c.where("v", ">", 3).values().all());

  const object = toObject({ foo: "bar" });

  this.assertEquals([], c.where("v", object).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.where("v", "<>", object).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.where("v", "!=", object).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.where("v", "!==", object).values().all());

  this.assertEquals([], c.where("v", ">", object).values().all());

  this.assertEquals([{ v: 3 }, { v: "3" }], c.where((value: { v: unknown }) => looseEquals(value["v"], 3)).values().all());

  this.assertEquals([{ v: 3 }], c.where((value: { v: unknown }) => value["v"] === 3).values().all());

  c = new collection([{ v: 1 }, { v: object }]);
  this.assertEquals([{ v: object }], c.where("v", object).values().all());

  this.assertEquals([{ v: 1 }, { v: object }], c.where("v", "<>", null).values().all());

  this.assertEquals([], c.where("v", "<", null).values().all());

  c = new collection([{ v: 1 }, { v: new HtmlString("hello") }]);
  this.assertEquals([{ v: new HtmlString("hello") }], c.where("v", "hello").values().all());

  c = new collection([{ v: 1 }, { v: "hello" }]);
  this.assertEquals([{ v: "hello" }], c.where("v", new HtmlString("hello")).values().all());

  c = new collection([{ v: 1 }, { v: 2 }, { v: null }]);
  this.assertEquals([{ v: 1 }, { v: 2 }], c.where("v").values().all());

  c = new collection([
    { v: 1, g: 3 },
    { v: 2, g: 2 },
    { v: 2, g: 3 },
    { v: 2, g: null },
  ]);
  this.assertEquals([{ v: 2, g: 3 }], c.where("v", 2).where("g", 3).values().all());
  this.assertEquals([{ v: 2, g: 3 }], c.where("v", 2).where("g", ">", 2).values().all());
  this.assertSame([], c.where("v", 2).where("g", 4).values().all());
  this.assertEquals([{ v: 2, g: null }], c.where("v", 2).whereNull("g").values().all());
});

portedTest(`${ID}::testWhereInStrict`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);
  this.assertEquals([{ v: 1 }, { v: 3 }], c.whereInStrict("v", [1, 3]).values().all());
});

portedTest(`${ID}::testValueWithNegativeValue`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  let c = new collection([
    { id: 1, balance: 0 },
    { id: 2, balance: 200 },
  ]);

  this.assertEquals(0, c.value("balance"));

  c = new collection([
    { id: 1, balance: "" },
    { id: 2, balance: 200 },
  ]);

  this.assertSame("", c.value("balance"));

  c = new collection([
    { id: 1, balance: null },
    { id: 2, balance: 200 },
  ]);

  this.assertEquals(null, c.value("balance"));

  c = new collection([{ id: 1 }, { id: 2, balance: 200 }]);

  this.assertEquals(200, c.value("balance"));

  c = new collection([{ id: 1 }, { id: 2, balance: 0 }, { id: 3, balance: 200 }]);

  this.assertEquals(0, c.value("balance"));
});

portedTest(`${ID}::testFlattenIgnoresKeys`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  // No depth ignores keys
  let c = new collection(
    new PhpArray<number | string, unknown>([
      [0, "#foo"],
      [1, { key: "#bar" }],
      [2, { key: "#baz" }],
      ["key", "#zap"],
    ]),
  );
  this.assertEquals(["#foo", "#bar", "#baz", "#zap"], c.flatten().all());

  // Depth of 1 ignores keys
  c = new collection(
    new PhpArray<number | string, unknown>([
      [0, "#foo"],
      [1, { key: "#bar" }],
      [2, { key: "#baz" }],
      ["key", "#zap"],
    ]),
  );
  this.assertEquals(["#foo", "#bar", "#baz", "#zap"], c.flatten(1).all());
});

portedTest(`${ID}::testMergeCollection`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const c = new collection({ name: "Hello" });
  this.assertEquals({ name: "World", id: 1 }, c.merge(new collection({ name: "World", id: 1 })).all());
});

portedTest(`${ID}::testUnionCollection`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const c = new collection({ name: "Hello" });
  this.assertEquals({ name: "Hello", id: 1 }, c.union(new collection({ name: "World", id: 1 })).all());
});

portedTest(`${ID}::testEachSpread`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  let c = new collection([
    [1, "a"],
    [2, "b"],
  ]);

  let result: unknown[] = [];
  c.eachSpread((number: number, character: string) => {
    result.push([number, character]);
  });
  this.assertEquals(c.all(), result);

  result = [];
  c.eachSpread((number: number, character: string) => {
    result.push([number, character]);

    return false;
  });
  this.assertEquals([[1, "a"]], result);

  result = [];
  c.eachSpread((number: number, character: string, key: number) => {
    result.push([number, character, key]);
  });
  this.assertEquals(
    [
      [1, "a", 0],
      [2, "b", 1],
    ],
    result,
  );

  c = new collection([new Collection([1, "a"]), new Collection([2, "b"])]);
  result = [];
  c.eachSpread((number: number, character: string, key: number) => {
    result.push([number, character, key]);
  });
  this.assertEquals(
    [
      [1, "a", 0],
      [2, "b", 1],
    ],
    result,
  );
});

portedTest(`${ID}::testSortByAlwaysReturnsAssoc`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  let data = new collection({ a: "taylor", b: "dayle" });
  data = data.sortBy((x: string) => x);

  this.assertEquals({ b: "dayle", a: "taylor" }, data.all());

  data = new collection(["taylor", "dayle"]);
  data = data.sortBy((x: string) => x);

  this.assertEquals(
    new PhpArray([
      [1, "dayle"],
      [0, "taylor"],
    ]),
    data.all(),
  );

  data = new collection({ a: { sort: 2 }, b: { sort: 1 } });
  data = data.sortBy([["sort", "asc"]]);

  this.assertEquals({ b: { sort: 1 }, a: { sort: 2 } }, data.all());

  data = new collection([{ sort: 2 }, { sort: 1 }]);
  data = data.sortBy([["sort", "asc"]]);

  this.assertEquals(
    new PhpArray([
      [1, { sort: 1 }],
      [0, { sort: 2 }],
    ]),
    data.all(),
  );
});

portedTest(`${ID}::testImplodeModels`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const model = new (class extends Model {})();
  model.setAttribute("email", "foo");
  const modelTwo = new (class extends Model {})();
  modelTwo.setAttribute("email", "bar");
  const data = new collection([model, modelTwo]);

  this.assertSame("foobar", data.implode("email"));
  this.assertSame("foo,bar", data.implode("email", ","));
});

portedTest(`${ID}::testGetOrPut`, { case: TestCase }, async function () {
  let data = new Collection({ name: "taylor", email: "foo" });

  this.assertSame("taylor", data.getOrPut("name", null));
  this.assertSame("foo", data.getOrPut("email", null));
  this.assertSame("male", data.getOrPut("gender", "male"));

  this.assertSame("taylor", data.get("name"));
  this.assertSame("foo", data.get("email"));
  this.assertSame("male", data.get("gender"));

  data = new Collection({ name: "taylor", email: "foo" });

  this.assertSame(
    "taylor",
    data.getOrPut("name", () => null),
  );

  this.assertSame(
    "foo",
    data.getOrPut("email", () => null),
  );

  this.assertSame(
    "male",
    data.getOrPut("gender", () => "male"),
  );

  this.assertSame("taylor", data.get("name"));
  this.assertSame("foo", data.get("email"));
  this.assertSame("male", data.get("gender"));
});

portedTest(`${ID}::testTakeUntilUsingValue`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3, 4]);

  data = data.takeUntil(3);

  this.assertSame([1, 2], data.toArray());
});

portedTest(`${ID}::testSplitInThrowsExceptionForInvalidNumberOfGroups`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  this.expectExceptionObject(new InvalidArgumentException("Number of groups must be at least 1."));

  new collection([1, 2, 3]).splitIn(0);
});

portedTest(`${ID}::testTransform`, { case: TestCase }, async function () {
  const data = new Collection({ first: "taylor", last: "otwell" });
  data.transform((item: string, key: string) => toPhpString(key) + "-" + toPhpString(strrev(item)));
  this.assertEquals({ first: "first-rolyat", last: "last-llewto" }, data.all());
});

portedTest(`${ID}::testRejectWithoutAnArgumentRemovesTruthyValues`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const data1 = new collection([false, true, new collection(), 0]);
  this.assertSame(
    new PhpArray<number, unknown>([
      [0, false],
      [3, 0],
    ]),
    data1.reject().all(),
  );

  const data2 = new collection({
    a: true,
    b: true,
    c: true,
  });
  this.assertTrue(data2.reject().isEmpty());
});

portedTest(`${ID}::testPushWithOneItem`, { case: TestCase }, async function () {
  const expected = new PhpArray<number, unknown>([
    [0, 4],
    [1, 5],
    [2, 6],
    [3, ["a", "b", "c"]],
    [4, { who: "Jonny", preposition: "from", where: "Laroe" }],
    [5, "Jonny from Laroe"],
  ]);

  const data = new Collection([4, 5, 6]);
  data.push(["a", "b", "c"]);
  data.push({ who: "Jonny", preposition: "from", where: "Laroe" });
  const actual = data.push("Jonny from Laroe").toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testEvenMedianCollection`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const data = new collection([toObject({ foo: 0 }), toObject({ foo: 3 })]);
  this.assertSame(1.5, data.median("foo"));
});

portedTest(`${ID}::testSliceNegativeOffsetAndNegativeLength`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([3, 4, 5, 6], data.slice(-6, -2).values().toArray());
});

portedTest(`${ID}::testCollectionFromTraversable`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  const data = new collection(new ArrayObject([1, 2, 3]));
  this.assertEquals([1, 2, 3], data.toArray());
});

portedTest(`${ID}::testUnless`, { case: TestCase, dataset: collectionClassProvider }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.unless(false, (data: Collection | LazyCollection) => data.concat(["caleb"]));

  this.assertSame(["michael", "tom", "caleb"], data.toArray());

  data = new collection(["michael", "tom"]);

  data = data.unless(true, (data: Collection | LazyCollection) => data.concat(["caleb"]));

  this.assertSame(["michael", "tom"], data.toArray());
});

portedTest(`${ID}::testPutAddsItemToCollection`, { case: TestCase }, async function () {
  const data = new Collection();
  this.assertSame([], data.toArray());
  data.put("foo", 1);
  this.assertSame({ foo: 1 }, data.toArray());
  data.put("bar", { nested: "two" });
  this.assertSame({ foo: 1, bar: { nested: "two" } }, data.toArray());
  data.put("foo", 3);
  this.assertSame({ foo: 3, bar: { nested: "two" } }, data.toArray());
});
