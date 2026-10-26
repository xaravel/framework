// Ported from framework/tests/Support/SupportCollectionTest.php (Laravel v13.37.0): Story 14.1's Test IDs, in
// Upstream's order. The Collections Stories 14.2-14.5 add theirs to this file.
//
// `collectionClassProvider` rows hold the constructors (PORTING.md § Data providers): `#0` is `Collection` and `#1`
// `LazyCollection`. Index syntax on a collection or another `ArrayAccess` object is a method call: a read is `get(k)`
// (DIV-12.6), and a write, `isset` or `unset` is `offsetSet` / `offsetExists` / `offsetUnset` (DIV-12.17). A
// higher-order read `$c->name` is `c.__get('name')` (DIV-12.16). A macro is called through a typed view of the
// collection, as `macro()` installs it at run time. `$collection::m()` is `collection.m()`, and `X::class` used as a
// string is `fqcn(X)` (AD-10). `$range` in testTimesMethod shadows PHP's `range()`, which is imported as `phpRange`.
//
// testDump calls Symfony's VarDumper and testEnsureForObjects Support's `class_basename`; both arrive with Support
// (Epic 19), so they keep Upstream's body in a case whose `setUp` throws `BlockedByComponentError("support")`, and
// their Expectations lines are `skip` / `blocked-by:support`. VarDumper is reached through the Class Registry by its
// FQCN, and `class_basename` through a local function that throws the same error.
//
// testToArrayCallsToArrayOnEachItemInCollection and testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection
// are not ported yet: they wait on ESC-14.1-11, as `Mockery.mock(<contract token>)` builds a mock that is not
// `instanceof` the token.
// `blocked-by:mockery` is not available: `bun run expectations:check` accepts a `blocked-by` Component only of a later
// Phase (tools/expectations/reasons.ts:282), and mockery is Phase 0 while collections is Phase 1, so these stay
// `not-ported-yet` with `ESC-14.1-11`.
import { portedTest, TestCase } from "@xaravel/assert";
import { Collection, LazyCollection } from "@xaravel/collections";
import {
  ArrayIterator,
  ArrayObject,
  BlockedByComponentError,
  CachingIterator,
  Error as PhpError,
  fqcn,
  gettype,
  implode,
  JSON_BIGINT_AS_STRING,
  JSON_ERROR_DEPTH,
  JSON_PRETTY_PRINT,
  JsonSerializable,
  jsonEncode,
  json_last_error,
  PhpArray,
  range as phpRange,
  ReflectionClass,
  registerTestClass,
  resolveClass,
  sprintf,
  stdClass,
  str_starts_with,
  substr,
  Throwable,
  toPhpString,
  UnexpectedValueException,
  WeakMap,
} from "@xaravel/runtime";
import {
  FIXTURES as COMMON_FIXTURES,
  TestArrayableObject,
  TestJsonableObject,
  TestJsonSerializeObject,
  TestJsonSerializeWithScalarValueObject,
  TestTraversableAndJsonSerializableObject,
} from "./Fixtures/Common";
import { FIXTURES as ENUM_FIXTURES, TestBackedEnum, TestEnum, TestStringBackedEnum } from "./Fixtures/Enums";

const ID = "Illuminate\\Tests\\Support\\SupportCollectionTest";

/** An instance of either class under test. */
type AnyCollection = Collection | LazyCollection;

/** A row of `collectionClassProvider`: the class under test, through the static members both classes share. */
interface CollectionClass {
  new (items?: unknown): AnyCollection;
  make(items?: unknown): AnyCollection;
  wrap(value: unknown): AnyCollection;
  unwrap(value: unknown): unknown;
  empty(): AnyCollection;
  times(number: number, callback?: ((number: number) => unknown) | null): AnyCollection;
  range(from: number, to: number): AnyCollection;
  fromJson(json: string, depth?: number, flags?: number): AnyCollection;
  macro(name: string, macro: unknown): unknown;
  proxy(method: string): void;
}

/** `collectionClassProvider`: each collection class, respectively. */
const COLLECTION_CLASSES: readonly (readonly [CollectionClass])[] = [[Collection], [LazyCollection]];

/** Upstream's test-local `TestJsonSerializeToStringObject`. */
class TestJsonSerializeToStringObject implements JsonSerializable {
  get [JsonSerializable.brand](): true {
    return true;
  }

  jsonSerialize(): string {
    return "foobar";
  }
}

/** Upstream's test-local `TestCollectionSubclass`. */
class TestCollectionSubclass extends Collection {
  //
}

/** The PHP `stdClass` with one dynamic property `foo`. */
type StdClassWithFoo = stdClass & { foo?: unknown };

/** A collection with the macro `foo` that testMacroable registers. */
type WithFoo = { foo(): AnyCollection };

class SupportCollectionTest extends TestCase {
  setUp(): void {
    for (const [name, klass] of [...COMMON_FIXTURES, ...ENUM_FIXTURES]) {
      registerTestClass(name, klass);
    }
    registerTestClass("Illuminate\\Tests\\Support\\TestJsonSerializeToStringObject", TestJsonSerializeToStringObject);
    registerTestClass("Illuminate\\Tests\\Support\\TestCollectionSubclass", TestCollectionSubclass);
  }
}

/** The test case of the Test IDs that need Support (Epic 19): VarDumper and `class_basename`. */
class SupportCollectionBlockedBySupportTest extends SupportCollectionTest {
  override setUp(): void {
    throw new BlockedByComponentError("support");
  }
}

/** Symfony's `VarDumper`, from the Class Registry (Support, Epic 19). */
function VarDumper(): { setHandler(handler: ((value: unknown) => void) | null): unknown } {
  return resolveClass("Symfony\\Component\\VarDumper\\VarDumper") as unknown as { setHandler(handler: ((value: unknown) => void) | null): unknown };
}

/** Support's `class_basename` helper, which arrives with Support (Epic 19). */
function class_basename(value: unknown): string {
  void value;
  throw new BlockedByComponentError("support");
}

portedTest(`${ID}::testEmptyCollectionIsEmpty`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection();

  this.assertTrue(c.isEmpty());
});

portedTest(`${ID}::testEmptyCollectionIsNotEmpty`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(["foo", "bar"]);

  this.assertFalse(c.isEmpty());
  this.assertTrue(c.isNotEmpty());
});

portedTest(`${ID}::testCollectionIsConstructed`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection("foo");
  this.assertSame(["foo"], data.all());

  data = new collection(2);
  this.assertSame([2], data.all());

  data = new collection(false);
  this.assertSame([false], data.all());

  data = new collection(null);
  this.assertEmpty(data.all());

  data = new collection();
  this.assertEmpty(data.all());
});

portedTest(`${ID}::testGetArrayableItems`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection();

  const class_ = new ReflectionClass(collection);
  const method = class_.getMethod("getArrayableItems");

  let items: unknown = new TestArrayableObject();
  let array = method.invokeArgs(data, [items]);
  this.assertSame({ foo: "bar" }, array);

  items = new TestJsonableObject();
  array = method.invokeArgs(data, [items]);
  this.assertSame({ foo: "bar" }, array);

  items = new TestJsonSerializeObject();
  array = method.invokeArgs(data, [items]);
  this.assertSame({ foo: "bar" }, array);

  items = new TestJsonSerializeWithScalarValueObject();
  array = method.invokeArgs(data, [items]);
  this.assertSame(["foo"], array);

  const subject = [new stdClass(), new stdClass()];
  items = new TestTraversableAndJsonSerializableObject(subject);
  array = method.invokeArgs(data, [items]);
  this.assertSame(subject, array);

  items = new collection({ foo: "bar" });
  array = method.invokeArgs(data, [items]);
  this.assertSame({ foo: "bar" }, array);

  items = { foo: "bar" };
  array = method.invokeArgs(data, [items]);
  this.assertSame({ foo: "bar" }, array);
});

// testToArrayCallsToArrayOnEachItemInCollection waits on ESC-14.1-11 (`Mockery.mock(Arrayable)` is not `instanceof Arrayable`).

portedTest(`${ID}::testLazyReturnsLazyCollection`, { case: SupportCollectionTest }, async function () {
  const data = new Collection([1, 2, 3, 4, 5]);

  const lazy = data.lazy();

  data.add(6);

  this.assertInstanceOf(LazyCollection, lazy);
  this.assertSame([1, 2, 3, 4, 5], lazy.all());
});

// testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection waits on ESC-14.1-11 (`Mockery.mock(JsonSerializable)` and
// `Mockery.mock(Arrayable)` are not `instanceof` their tokens).

portedTest(`${ID}::testToJsonEncodesTheJsonSerializeResult`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = this.getMockBuilder<Collection | LazyCollection>(collection).onlyMethods(["jsonSerialize"]).getMock();
  c.expects(this.once()).method("jsonSerialize").willReturn(["foo"]);
  const results = c.toJson();
  this.assertJsonStringEqualsJsonString(jsonEncode(["foo"]) as string, results);
});

portedTest(`${ID}::testToPrettyJsonEncodesTheJsonSerializeResult`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = this.getMockBuilder<Collection | LazyCollection>(collection).onlyMethods(["jsonSerialize"]).getMock();
  c.expects(this.once()).method("jsonSerialize").willReturn({ foo: "bar", baz: "qux" });
  const results = c.toPrettyJson();
  const expected = jsonEncode({ foo: "bar", baz: "qux" }, JSON_PRETTY_PRINT) as string;
  this.assertJsonStringEqualsJsonString(expected, results);
  this.assertSame(expected, results);
  this.assertStringContainsString("\n", results);
  this.assertStringContainsString("    ", results);
});

portedTest(`${ID}::testCastingToStringJsonEncodesTheToArrayResult`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = this.getMockBuilder<Collection | LazyCollection>(collection).onlyMethods(["jsonSerialize"]).getMock();
  c.expects(this.once()).method("jsonSerialize").willReturn(["foo"]);

  this.assertJsonStringEqualsJsonString(jsonEncode(["foo"]) as string, toPhpString(c));
});

portedTest(`${ID}::testOffsetAccess`, { case: SupportCollectionTest }, async function () {
  const c = new Collection({ name: "taylor" });
  this.assertSame("taylor", c.get("name")); // adapted:DIV-12.6
  c.offsetSet("name", "dayle"); // adapted:DIV-12.17
  this.assertSame("dayle", c.get("name")); // adapted:DIV-12.6
  this.assertTrue(c.offsetExists("name")); // adapted:DIV-12.17
  c.offsetUnset("name"); // adapted:DIV-12.17
  this.assertFalse(c.offsetExists("name")); // adapted:DIV-12.17
  c.offsetSet(null, "jason"); // adapted:DIV-12.17
  this.assertSame("jason", c.get(0)); // adapted:DIV-12.6
});

portedTest(`${ID}::testArrayAccessOffsetExists`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "bar", null]);
  this.assertTrue(c.offsetExists(0));
  this.assertTrue(c.offsetExists(1));
  this.assertFalse(c.offsetExists(2));
});

portedTest(`${ID}::testBehavesLikeAnArrayWithArrayAccess`, { case: SupportCollectionTest }, async function () {
  // indexed array
  let input: unknown[] | Record<string, unknown> = ["foo", null];
  let c = new Collection(input);
  this.assertEquals((input?.[0] ?? null) !== null, c.offsetExists(0)); // existing value // adapted:DIV-12.17
  this.assertEquals((input?.[1] ?? null) !== null, c.offsetExists(1)); // existing but null value // adapted:DIV-12.17
  this.assertEquals((input?.[1000] ?? null) !== null, c.offsetExists(1000)); // non-existing value // adapted:DIV-12.17
  this.assertEquals(input[0], c.get(0)); // adapted:DIV-12.6
  this.assertEquals(input[1], c.get(1)); // adapted:DIV-12.6

  // associative array
  input = { k1: "foo", k2: null };
  c = new Collection(input);
  this.assertEquals((input?.["k1"] ?? null) !== null, c.offsetExists("k1")); // existing value // adapted:DIV-12.17
  this.assertEquals((input?.["k2"] ?? null) !== null, c.offsetExists("k2")); // existing but null value // adapted:DIV-12.17
  this.assertEquals((input?.["k3"] ?? null) !== null, c.offsetExists("k3")); // non-existing value // adapted:DIV-12.17
  this.assertEquals(input["k1"], c.get("k1")); // adapted:DIV-12.6
  this.assertEquals(input["k2"], c.get("k2")); // adapted:DIV-12.6
});

portedTest(`${ID}::testArrayAccessOffsetGet`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "bar"]);
  this.assertSame("foo", c.offsetGet(0));
  this.assertSame("bar", c.offsetGet(1));
});

portedTest(`${ID}::testArrayAccessOffsetSet`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "foo"]);

  c.offsetSet(1, "bar");
  this.assertSame("bar", c.get(1)); // adapted:DIV-12.6

  c.offsetSet(null, "qux");
  this.assertSame("qux", c.get(2)); // adapted:DIV-12.6
});

portedTest(`${ID}::testArrayAccessOffsetUnset`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "bar"]);

  c.offsetUnset(1);
  this.assertFalse(c.offsetExists(1)); // adapted:DIV-12.17
});

portedTest(`${ID}::testCountable`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(["foo", "bar"]);
  this.assertCount(2, c);
});

portedTest(`${ID}::testCountableByWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(["alice", "aaron", "bob", "carla"]);
  this.assertEquals(
    { a: 2, b: 1, c: 1 },
    c
      .countBy((name: string) => {
        return substr(name, 0, 1);
      })
      .all(),
  );

  c = new collection([1, 2, 3, 4, 5]);
  this.assertEquals(
    new PhpArray([
      [true, 2],
      [false, 3],
    ]),
    c
      .countBy((i: number) => {
        return i % 2 === 0;
      })
      .all(),
  );

  c = new collection(["A", "A", "B", "A"]);
  this.assertEquals({ A: 3, B: 1 }, c.countBy((i: string) => TestStringBackedEnum.from(i)).all());
});

portedTest(`${ID}::testIterable`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo"]);
  this.assertInstanceOf(ArrayIterator, c.getIterator());
  this.assertEquals(["foo"], c.getIterator().getArrayCopy());
});

portedTest(`${ID}::testCachingIterator`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(["foo"]);
  this.assertInstanceOf(CachingIterator, c.getCachingIterator());
});

portedTest(`${ID}::testMacroable`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  // Foo() macro : unique values starting with A
  collection.macro("foo", function (this: AnyCollection) {
    return this.filter((item: unknown) => {
      return str_starts_with(item, "a");
    })
      .unique()
      .values();
  });

  const c = new collection(["a", "a", "aa", "aaa", "bar"]) as AnyCollection & WithFoo;

  this.assertSame(["a", "aa", "aaa"], c.foo().all());
});

portedTest(`${ID}::testCanAddMethodsToProxy`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  collection.macro("adults", function (this: AnyCollection, callback: (item: unknown) => number) {
    return this.filter((item: unknown) => {
      return callback(item) >= 18;
    });
  });

  collection.proxy("adults");

  const c = new collection([{ age: 3 }, { age: 12 }, { age: 18 }, { age: 56 }]);

  this.assertSame([{ age: 18 }, { age: 56 }], (c.__get("adults").__get("age") as AnyCollection).values().all()); // adapted:DIV-12.16
});

portedTest(`${ID}::testMakeMethod`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection.make("foo");
  this.assertEquals(["foo"], data.all());
});

portedTest(`${ID}::testMakeMethodFromNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection.make(null);
  this.assertSame([], data.all());

  data = collection.make();
  this.assertSame([], data.all());
});

portedTest(`${ID}::testMakeMethodFromCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const firstCollection = collection.make({ foo: "bar" });
  const secondCollection = collection.make(firstCollection);
  this.assertEquals({ foo: "bar" }, secondCollection.all());
});

portedTest(`${ID}::testMakeMethodFromArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection.make({ foo: "bar" });
  this.assertEquals({ foo: "bar" }, data.all());
});

portedTest(`${ID}::testWrapWithScalar`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection.wrap("foo");
  this.assertEquals(["foo"], data.all());
});

portedTest(`${ID}::testWrapWithArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection.wrap(["foo"]);
  this.assertEquals(["foo"], data.all());
});

portedTest(`${ID}::testWrapWithArrayable`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let o: TestArrayableObject;
  const data = collection.wrap((o = new TestArrayableObject()));
  this.assertEquals([o], data.all());
});

portedTest(`${ID}::testWrapWithJsonable`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let o: TestJsonableObject;
  const data = collection.wrap((o = new TestJsonableObject()));
  this.assertEquals([o], data.all());
});

portedTest(`${ID}::testWrapWithJsonSerialize`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let o: TestJsonSerializeObject;
  const data = collection.wrap((o = new TestJsonSerializeObject()));
  this.assertEquals([o], data.all());
});

portedTest(`${ID}::testWrapWithCollectionClass`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection.wrap(collection.make(["foo"]));
  this.assertEquals(["foo"], data.all());
});

portedTest(`${ID}::testWrapWithCollectionSubclass`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = TestCollectionSubclass.wrap(collection.make(["foo"]));
  this.assertEquals(["foo"], data.all());
  this.assertInstanceOf(TestCollectionSubclass, data);
});

portedTest(`${ID}::testUnwrapCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["foo"]);
  this.assertEquals(["foo"], collection.unwrap(data));
});

portedTest(`${ID}::testUnwrapCollectionWithArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertEquals(["foo"], collection.unwrap(["foo"]));
});

portedTest(`${ID}::testUnwrapCollectionWithScalar`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertSame("foo", collection.unwrap("foo"));
});

portedTest(`${ID}::testEmptyMethod`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass | AnyCollection) {
  collection = (collection as CollectionClass).empty();

  this.assertCount(0, collection.all());
});

portedTest(`${ID}::testTimesMethod`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const two = collection.times(2, (number: number) => {
    return "slug-" + toPhpString(number);
  });

  const zero = collection.times(0, (number: number) => {
    return "slug-" + toPhpString(number);
  });

  const negative = collection.times(-4, (number: number) => {
    return "slug-" + toPhpString(number);
  });

  const range = collection.times(5);

  this.assertEquals(["slug-1", "slug-2"], two.all());
  this.assertTrue(zero.isEmpty());
  this.assertTrue(negative.isEmpty());
  this.assertEquals(phpRange(1, 5), range.all());
});

portedTest(`${ID}::testRangeMethod`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertSame([1, 2, 3, 4, 5], collection.range(1, 5).all());

  this.assertSame([-2, -1, 0, 1, 2], collection.range(-2, 2).all());

  this.assertSame([-4, -3, -2], collection.range(-4, -2).all());

  this.assertSame([5, 4, 3, 2, 1], collection.range(5, 1).all());

  this.assertSame([2, 1, 0, -1, -2], collection.range(2, -2).all());

  this.assertSame([-2, -3, -4], collection.range(-2, -4).all());
});

portedTest(`${ID}::testFromJson`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let array: Record<string, unknown>;
  const json = jsonEncode((array = { foo: "bar", baz: "quz" })) as string;

  const instance = collection.fromJson(json);

  this.assertSame(array, instance.toArray());
});

portedTest(`${ID}::testFromJsonWithDepth`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const json = jsonEncode({ foo: { baz: ["quz"] }, bar: "baz" }) as string;

  const instance = collection.fromJson(json, 1);

  this.assertEmpty(instance.toArray());
  this.assertSame(JSON_ERROR_DEPTH, json_last_error());
});

portedTest(`${ID}::testFromJsonWithFlags`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const instance = collection.fromJson('{"int":99999999999999999999999}', 512, JSON_BIGINT_AS_STRING);

  this.assertSame({ int: "99999999999999999999999" }, instance.toArray());
});

portedTest(`${ID}::testConstructMakeFromObject`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const object: StdClassWithFoo = new stdClass();
  object.foo = "bar";
  const data = collection.make(object);
  this.assertEquals({ foo: "bar" }, data.all());
});

portedTest(`${ID}::testConstructMethod`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection("foo");
  this.assertEquals(["foo"], data.all());
});

portedTest(`${ID}::testConstructMethodFromNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(null);
  this.assertSame([], data.all());

  data = new collection();
  this.assertSame([], data.all());
});

portedTest(`${ID}::testConstructMethodFromCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const firstCollection = new collection({ foo: "bar" });
  const secondCollection = new collection(firstCollection);
  this.assertEquals({ foo: "bar" }, secondCollection.all());
});

portedTest(`${ID}::testConstructMethodFromArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ foo: "bar" });
  this.assertEquals({ foo: "bar" }, data.all());
});

portedTest(`${ID}::testConstructMethodFromObject`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const object: StdClassWithFoo = new stdClass();
  object.foo = "bar";
  const data = new collection(object);
  this.assertEquals({ foo: "bar" }, data.all());
});

portedTest(`${ID}::testConstructMethodFromWeakMap`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const map = new WeakMap();
  const object: StdClassWithFoo = new stdClass();
  object.foo = "bar";
  map.offsetSet(object, 3); // adapted:DIV-12.17
  const data = new collection(map);
  this.assertEquals([3], data.all());
});

portedTest(`${ID}::testJsonSerialize`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([new TestArrayableObject(), new TestJsonableObject(), new TestJsonSerializeObject(), new TestJsonSerializeToStringObject(), "baz"]);

  this.assertSame([{ foo: "bar" }, { foo: "bar" }, { foo: "bar" }, "foobar", "baz"], c.jsonSerialize());
});

portedTest(`${ID}::testDump`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const log = new Collection();

  VarDumper().setHandler((value: unknown) => {
    log.add(value);
  });

  (new collection([1, 2, 3]) as unknown as { dump(...args: unknown[]): unknown }).dump("one", "two");

  this.assertSame([[1, 2, 3], "one", "two"], log.all());

  VarDumper().setHandler(null);
});

portedTest(`${ID}::testCollectionFromTraversable`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(new ArrayObject([1, 2, 3]));
  this.assertEquals([1, 2, 3], data.toArray());
});

portedTest(`${ID}::testCollectionFromTraversableWithKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(new ArrayObject({ foo: 1, bar: 2, baz: 3 }));
  this.assertEquals({ foo: 1, bar: 2, baz: 3 }, data.toArray());
});

portedTest(`${ID}::testCollectionFromEnum`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(TestEnum.A);
  this.assertEquals([TestEnum.A], data.toArray());
});

portedTest(`${ID}::testCollectionFromBackedEnum`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(TestBackedEnum.A);
  this.assertEquals([TestBackedEnum.A], data.toArray());
});

portedTest(`${ID}::testCollect`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection
    .make({
      a: 1,
      b: 2,
      c: 3,
    })
    .collect();

  this.assertInstanceOf(Collection, data);

  this.assertSame(
    {
      a: 1,
      b: 2,
      c: 3,
    },
    data.all(),
  );
});

portedTest(`${ID}::testEnsureForScalar`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection.make([1, 2, 3]);
  data.ensure("int");

  data = collection.make([1, 2, 3, "foo"]);
  this.expectExceptionObject(new UnexpectedValueException("Collection should only include [int] items, but 'string' found at position 3."));
  data.ensure("int");
});

portedTest(`${ID}::testEnsureForObjects`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection.make([new stdClass(), new stdClass(), new stdClass()]);
  data.ensure(stdClass);

  data = collection.make([new stdClass(), new stdClass(), new stdClass(), fqcn(collection)]); // adapted:DIV-12.19
  this.expectExceptionObject(
    new UnexpectedValueException(sprintf("Collection should only include [%s] items, but '%s' found at position %d.", class_basename(new stdClass()), gettype(fqcn(collection)), 3)), // adapted:DIV-12.19
  );
  data.ensure(stdClass);
});

portedTest(`${ID}::testEnsureForInheritance`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection.make([new PhpError(), new PhpError()]);
  data.ensure(Throwable);

  const wrongType = new collection();
  data = collection.make([new PhpError(), new PhpError(), wrongType]);
  this.expectExceptionObject(new UnexpectedValueException(sprintf("Collection should only include [%s] items, but '%s' found at position %d.", fqcn(Throwable), fqcn(wrongType), 2)));
  data.ensure(Throwable);
});

portedTest(`${ID}::testEnsureForMultipleTypes`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection.make([new PhpError(), 123]);
  data.ensure([Throwable, "int"]);

  const wrongType = new collection();
  data = collection.make([new PhpError(), new PhpError(), wrongType]);
  this.expectExceptionObject(new UnexpectedValueException(sprintf("Collection should only include [%s] items, but '%s' found at position %d.", implode(", ", [fqcn(Throwable), "int"]), fqcn(wrongType), 2)));
  data.ensure([Throwable, "int"]);
});
