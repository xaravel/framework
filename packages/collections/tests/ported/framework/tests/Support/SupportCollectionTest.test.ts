// Ported from framework/tests/Support/SupportCollectionTest.php (Laravel v13.37.0): Story 14.1's Test IDs, then Story
// 14.2's, each in Upstream's order. The Collections Stories 14.3-14.5 add theirs to this file.
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
// Story 14.2: a test that rebinds `$collection` to an instance and then calls `new $collection(...)` keeps the dataset
// constructor under its own name and names the instance `collection_` (PORTING.md § Data providers). A keyed array
// spread into a call is `...array_values(new PhpArray(...))` (DIV-9.15). `isset($a[k])` on an `all()` result reads it
// through `phpArrayEntries` (PORTING.md § Reading a PHP array), and a `<` / `>` whose operand may be a string is
// `spaceship` (PORTING.md § Mechanical expression rule). testValueWithObjects calls Support's `literal()` helper, which
// arrives with Support (Epic 19), so it keeps Upstream's body in the blocked case, through a local `literal` that
// throws the same error. TestAccessorEloquentTestStub's `$this->$accessor()` is `callMethod(this, accessor)`, PHP's
// case-insensitive dynamic method call (PORTING.md's idiom table).
//
// `Mockery::mock(Arrayable::class)` is `Mockery.mock(Arrayable)` over the contract token, and
// `Mockery::mock(JsonSerializable::class)` is `Mockery.mock(JsonSerializable)` over the runtime's PHP-interface token
// (PORTING.md § Test-adaptation rules, Mockery; decisions/ESC-14.1-11.md).
import { phpArrayEntries, portedTest, TestCase } from "@xaravel/assert";
import { Collection, collect, ItemNotFoundException, LazyCollection, MultipleItemsFoundException } from "@xaravel/collections";
import { Arrayable } from "@xaravel/contracts/support";
import { Mockery } from "@xaravel/mockery";
import {
  ArrayAccess,
  ArrayIterator,
  ArrayObject,
  array_intersect_assoc,
  array_values,
  BlockedByComponentError,
  callMethod,
  CachingIterator,
  count,
  Error as PhpError,
  Exception,
  fqcn,
  gettype,
  implode,
  InvalidArgumentException,
  is_null,
  is_numeric,
  JSON_BIGINT_AS_STRING,
  JSON_ERROR_DEPTH,
  JSON_PRETTY_PRINT,
  JsonSerializable,
  jsonEncode,
  json_last_error,
  lcfirst,
  looseEquals,
  method_exists,
  min,
  PhpArray,
  range as phpRange,
  ReflectionClass,
  registerTestClass,
  resolveClass,
  spaceship,
  sprintf,
  stdClass,
  str_starts_with,
  strlen,
  substr,
  Throwable,
  toPhpString,
  UnexpectedValueException,
  valueCopy,
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

/** Upstream's test-local pure enum `StaffEnum` (AD-26). */
class StaffEnum {
  static readonly Taylor = new StaffEnum("Taylor");
  static readonly Joe = new StaffEnum("Joe");
  static readonly James = new StaffEnum("James");

  constructor(readonly name: string) {}

  static cases(): StaffEnum[] {
    return [StaffEnum.Taylor, StaffEnum.Joe, StaffEnum.James];
  }
}

/** Upstream's test-local `TestAccessorEloquentTestStub`: `__get` / `__isset` through `get<Attribute>Attribute()`. */
class TestAccessorEloquentTestStub {
  protected attributes: Record<string, unknown> = {};

  constructor(attributes: Record<string, unknown>) {
    this.attributes = valueCopy(attributes);
  }

  __get(attribute: string): unknown {
    const accessor = "get" + lcfirst(attribute) + "Attribute";
    if (method_exists(this, accessor)) {
      return callMethod(this, accessor);
    }

    return Object.hasOwn(this, attribute) ? ((this as unknown as Record<string, unknown>)[attribute] ?? null) : null;
  }

  __isset(attribute: string): boolean {
    const accessor = "get" + lcfirst(attribute) + "Attribute";

    if (method_exists(this, accessor)) {
      return !is_null(callMethod(this, accessor));
    }

    return Object.hasOwn(this, attribute) && ((this as unknown as Record<string, unknown>)[attribute] ?? null) !== null;
  }

  getSomeAttribute(): unknown {
    return Object.hasOwn(this.attributes, "some") ? (this.attributes["some"] ?? null) : null;
  }
}

/** Upstream's test-local `TestArrayAccessImplementation`: an `ArrayAccess` over a private array. */
class TestArrayAccessImplementation {
  private arr: Record<string, unknown>;

  constructor(arr: Record<string, unknown>) {
    this.arr = valueCopy(arr);
  }

  get [ArrayAccess.brand](): true {
    return true;
  }

  offsetExists(offset: string): boolean {
    return Object.hasOwn(this.arr, offset) && (this.arr[offset] ?? null) !== null;
  }

  offsetGet(offset: string): unknown {
    // PHP's read of a missing key gives `null` (AD-9).
    return Object.hasOwn(this.arr, offset) ? (this.arr[offset] ?? null) : null;
  }

  offsetSet(offset: string, value: unknown): void {
    this.arr[offset] = value;
  }

  offsetUnset(offset: string): void {
    delete this.arr[offset];
  }
}

/** A row of testPluckWithDotNotation and testPluckWithClosure. */
type PluckRow = { name: string; skill: { backend: string[] } };

/** The PHP `stdClass` with one dynamic property `text`. */
type StdClassWithText = stdClass & { text?: unknown };

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
    registerTestClass("Illuminate\\Tests\\Support\\StaffEnum", StaffEnum);
    registerTestClass("Illuminate\\Tests\\Support\\TestAccessorEloquentTestStub", TestAccessorEloquentTestStub);
    registerTestClass("Illuminate\\Tests\\Support\\TestArrayAccessImplementation", TestArrayAccessImplementation);
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

/** Support's `literal` helper, which arrives with Support (Epic 19). */
function literal(arguments_: Record<string, unknown>): unknown {
  void arguments_;
  throw new BlockedByComponentError("support");
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

portedTest(`${ID}::testToArrayCallsToArrayOnEachItemInCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const item1 = Mockery.mock(Arrayable);
  item1.expects("toArray").andReturn("foo.array");
  const item2 = Mockery.mock(Arrayable);
  item2.expects("toArray").andReturn("bar.array");
  const c = new collection([item1, item2]);
  const results = c.toArray();

  this.assertEquals(["foo.array", "bar.array"], results);
});

portedTest(`${ID}::testLazyReturnsLazyCollection`, { case: SupportCollectionTest }, async function () {
  const data = new Collection([1, 2, 3, 4, 5]);

  const lazy = data.lazy();

  data.add(6);

  this.assertInstanceOf(LazyCollection, lazy);
  this.assertSame([1, 2, 3, 4, 5], lazy.all());
});

portedTest(`${ID}::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const item1 = Mockery.mock(JsonSerializable);
  item1.expects("jsonSerialize").andReturn("foo.json");
  const item2 = Mockery.mock(Arrayable);
  item2.expects("toArray").andReturn("bar.array");
  const c = new collection([item1, item2]);
  const results = c.jsonSerialize();

  this.assertEquals(["foo.json", "bar.array"], results);
});

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

// Story 14.2: retrieval, search and mutation methods, in Upstream's order.

portedTest(`${ID}::testFirstReturnsFirstItemInCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(["foo", "bar"]);
  this.assertSame("foo", c.first());
});

portedTest(`${ID}::testFirstWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["foo", "bar", "baz"]);
  const result = data.first((value: unknown) => {
    return value === "bar";
  });
  this.assertSame("bar", result);
});

portedTest(`${ID}::testFirstWithCallbackAndDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["foo", "bar"]);
  const result = data.first((value: unknown) => {
    return value === "baz";
  }, "default");
  this.assertSame("default", result);
});

portedTest(`${ID}::testFirstWithDefaultAndWithoutCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection();
  let result = data.first(null, "default");
  this.assertSame("default", result);

  data = new collection(["foo", "bar"]);
  result = data.first(null, "default");
  this.assertSame("foo", result);
});

portedTest(`${ID}::testSoleReturnsFirstItemInCollectionIfOnlyOneExists`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([{ name: "foo" }, { name: "bar" }]);

  this.assertSame({ name: "foo" }, collection_.where("name", "foo").sole());
  this.assertSame({ name: "foo" }, collection_.sole("name", "=", "foo"));
  this.assertSame({ name: "foo" }, collection_.sole("name", "foo"));
});

portedTest(`${ID}::testSoleThrowsExceptionIfNoItemsExist`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(ItemNotFoundException);

  const collection_ = new collection([{ name: "foo" }, { name: "bar" }]);

  collection_.where("name", "INVALID").sole();
});

portedTest(`${ID}::testSoleThrowsExceptionIfMoreThanOneItemExists`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectExceptionObject(new MultipleItemsFoundException(2));

  const collection_ = new collection([{ name: "foo" }, { name: "foo" }, { name: "bar" }]);

  collection_.where("name", "foo").sole();
});

portedTest(`${ID}::testSoleReturnsFirstItemInCollectionIfOnlyOneExistsWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["foo", "bar", "baz"]);
  const result = data.sole((value: unknown) => {
    return value === "bar";
  });
  this.assertSame("bar", result);
});

portedTest(`${ID}::testSoleThrowsExceptionIfNoItemsExistWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(ItemNotFoundException);

  const data = new collection(["foo", "bar", "baz"]);

  data.sole((value: unknown) => {
    return value === "invalid";
  });
});

portedTest(`${ID}::testSoleThrowsExceptionIfMoreThanOneItemExistsWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectExceptionObject(new MultipleItemsFoundException(2));

  const data = new collection(["foo", "bar", "bar"]);

  data.sole((value: unknown) => {
    return value === "bar";
  });
});

portedTest(`${ID}::testHasSole`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([{ age: 2 }, { age: 3 }]);

  this.assertFalse(collection_.hasSole());
  this.assertFalse(collection_.where("age", 1).hasSole());
  this.assertTrue(collection_.where("age", 2).hasSole());

  this.assertFalse(collection_.hasSole(() => true));
  this.assertFalse(collection_.hasSole(() => false));
  this.assertTrue(collection_.hasSole((item: Record<string, unknown>) => item["age"] === 2));

  this.assertFalse(collection_.hasSole("age", ">", 1));
  this.assertFalse(collection_.hasSole("age", "<", 1));
  this.assertTrue(collection_.hasSole("age", 2));

  const data = new collection([Object.assign(new stdClass(), { active: true, verified: true }), Object.assign(new stdClass(), { active: false, verified: true })]);

  this.assertFalse(data.__get("hasSole").__get("verified")); // adapted:DIV-12.16
});

portedTest(`${ID}::testHasMany`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([{ age: 2 }, { age: 3 }]);

  this.assertTrue(collection_.hasMany());
  this.assertFalse(collection_.where("age", 1).hasMany());
  this.assertFalse(collection_.where("age", 2).hasMany());

  this.assertTrue(collection_.hasMany(() => true));
  this.assertFalse(collection_.hasMany(() => false));
  this.assertFalse(collection_.hasMany((item: Record<string, unknown>) => item["age"] === 2));

  this.assertTrue(collection_.hasMany("age", ">", 1));
  this.assertFalse(collection_.hasMany("age", "<", 1));
  this.assertFalse(collection_.hasMany("age", 2));

  const data = new collection([Object.assign(new stdClass(), { active: true, verified: true }), Object.assign(new stdClass(), { active: false, verified: true })]);

  this.assertTrue(data.__get("hasMany").__get("verified")); // adapted:DIV-12.16
});

portedTest(`${ID}::testFirstOrFailReturnsFirstItemInCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([{ name: "foo" }, { name: "bar" }]);

  this.assertSame({ name: "foo" }, collection_.where("name", "foo").firstOrFail());
  this.assertSame({ name: "foo" }, collection_.firstOrFail("name", "=", "foo"));
  this.assertSame({ name: "foo" }, collection_.firstOrFail("name", "foo"));
});

portedTest(`${ID}::testFirstOrFailThrowsExceptionIfNoItemsExist`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(ItemNotFoundException);

  const collection_ = new collection([{ name: "foo" }, { name: "bar" }]);

  collection_.where("name", "INVALID").firstOrFail();
});

portedTest(`${ID}::testFirstOrFailDoesntThrowExceptionIfMoreThanOneItemExists`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([{ name: "foo" }, { name: "foo" }, { name: "bar" }]);

  this.assertSame({ name: "foo" }, collection_.where("name", "foo").firstOrFail());
});

portedTest(`${ID}::testFirstOrFailReturnsFirstItemInCollectionIfOnlyOneExistsWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["foo", "bar", "baz"]);
  const result = data.firstOrFail((value: unknown) => {
    return value === "bar";
  });
  this.assertSame("bar", result);
});

portedTest(`${ID}::testFirstOrFailThrowsExceptionIfNoItemsExistWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(ItemNotFoundException);

  const data = new collection(["foo", "bar", "baz"]);

  data.firstOrFail((value: unknown) => {
    return value === "invalid";
  });
});

portedTest(`${ID}::testFirstOrFailDoesntThrowExceptionIfMoreThanOneItemExistsWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["foo", "bar", "bar"]);

  this.assertSame(
    "bar",
    data.firstOrFail((value: unknown) => {
      return value === "bar";
    }),
  );
});

portedTest(`${ID}::testFirstOrFailStopsIteratingAtFirstMatch`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    () => {
      return false;
    },
    () => {
      return true;
    },
    () => {
      throw new Exception();
    },
  ]);

  this.assertNotNull(
    data.firstOrFail((callback: () => unknown) => {
      return callback();
    }),
  );
});

portedTest(`${ID}::testFirstWhere`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    { material: "paper", type: "book" },
    { material: "rubber", type: "gasket" },
  ]);

  this.assertSame("book", (data.firstWhere("material", "paper") as Record<string, unknown>)["type"]);
  this.assertSame("gasket", (data.firstWhere("material", "rubber") as Record<string, unknown>)["type"]);
  this.assertNull(data.firstWhere("material", "nonexistent"));
  this.assertNull(data.firstWhere("nonexistent", "key"));

  this.assertSame("book", (data.firstWhere((value: Record<string, unknown>) => value["material"] === "paper") as Record<string, unknown>)["type"]);
  this.assertSame("gasket", (data.firstWhere((value: Record<string, unknown>) => value["material"] === "rubber") as Record<string, unknown>)["type"]);
  this.assertNull(data.firstWhere((value: Record<string, unknown>) => value["material"] === "nonexistent"));
  this.assertNull(data.firstWhere((value: Record<string, unknown>) => (value?.["nonexistent"] ?? null) === "key"));
});

portedTest(`${ID}::testFirstWhereUsingEnum`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    { id: 1, name: StaffEnum.Taylor },
    { id: 2, name: StaffEnum.Joe },
    { id: 3, name: StaffEnum.James },
  ]);

  this.assertSame(1, (data.firstWhere("name", "Taylor") as Record<string, unknown>)["id"]);
  this.assertSame(2, (data.firstWhere("name", StaffEnum.Joe) as Record<string, unknown>)["id"]);
  this.assertSame(3, (data.firstWhere("name", StaffEnum.James) as Record<string, unknown>)["id"]);
});

portedTest(`${ID}::testLastReturnsLastItemInCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(["foo", "bar"]);
  this.assertSame("bar", c.last());

  c = new collection([]);
  this.assertNull(c.last());
});

portedTest(`${ID}::testLastWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([100, 200, 300]);
  let result = data.last((value: number) => {
    return value < 250;
  });
  this.assertEquals(200, result);

  result = data.last((value: number, key: number) => {
    return key < 2;
  });
  this.assertEquals(200, result);

  result = data.last((value: number) => {
    return value > 300;
  });
  this.assertNull(result);
});

portedTest(`${ID}::testLastWithCallbackAndDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["foo", "bar"]);
  let result = data.last((value: unknown) => {
    return value === "baz";
  }, "default");
  this.assertSame("default", result);

  data = new collection(["foo", "bar", "Bar"]);
  result = data.last((value: unknown) => {
    return value === "bar";
  }, "default");
  this.assertSame("bar", result);
});

portedTest(`${ID}::testLastWithDefaultAndWithoutCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection();
  const result = data.last(null, "default");
  this.assertSame("default", result);
});

portedTest(`${ID}::testPopReturnsAndRemovesLastItemInCollection`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "bar"]);

  this.assertSame("bar", c.pop());
  this.assertSame("foo", c.first());
});

portedTest(`${ID}::testPopReturnsAndRemovesLastXItemsInCollection`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "bar", "baz"]);

  this.assertEquals(new Collection(["baz", "bar"]), c.pop(2));
  this.assertSame("foo", c.first());

  this.assertEquals(new Collection(["baz", "bar", "foo"]), new Collection(["foo", "bar", "baz"]).pop(6));
});

portedTest(`${ID}::testShiftReturnsAndRemovesFirstItemInCollection`, { case: SupportCollectionTest }, async function () {
  const data = new Collection(["Taylor", "Otwell"]);

  this.assertSame("Taylor", data.shift());
  this.assertSame("Otwell", data.first());
  this.assertSame("Otwell", data.shift());
  this.assertNull(data.first());
});

portedTest(`${ID}::testShiftReturnsAndRemovesFirstXItemsInCollection`, { case: SupportCollectionTest }, async function () {
  let data = new Collection(["foo", "bar", "baz"]);

  this.assertEquals(new Collection(["foo", "bar"]), data.shift(2));
  this.assertSame("baz", data.first());

  this.assertEquals(new Collection(["foo", "bar", "baz"]), new Collection(["foo", "bar", "baz"]).shift(6));

  data = new Collection(["foo", "bar", "baz"]);

  this.assertEquals(new Collection([]), data.shift(0));
  this.assertEquals(collect(["foo", "bar", "baz"]), data);

  this.expectException(resolveClass("InvalidArgumentException"));
  new Collection(["foo", "bar", "baz"]).shift(-1);

  this.expectException(resolveClass("InvalidArgumentException"));
  new Collection(["foo", "bar", "baz"]).shift(-2);
});

portedTest(`${ID}::testShiftReturnsNullOnEmptyCollection`, { case: SupportCollectionTest }, async function () {
  const itemFoo: StdClassWithText = new stdClass();
  itemFoo.text = "f";
  const itemBar: StdClassWithText = new stdClass();
  itemBar.text = "x";

  const items = collect([itemFoo, itemBar]);

  const foo = items.shift() as StdClassWithText | null;
  const bar = items.shift() as StdClassWithText | null;

  this.assertSame("f", foo?.text);
  this.assertSame("x", bar?.text);
  this.assertNull(items.shift());
});

portedTest(`${ID}::testShiftManyReturnsEmptyCollectionOnEmptyCollection`, { case: SupportCollectionTest }, async function () {
  this.assertEquals(new Collection(), new Collection().shift(0));
  this.assertEquals(new Collection(), new Collection().shift(2));
});

portedTest(`${ID}::testForgetSingleKey`, { case: SupportCollectionTest }, async function () {
  let c: object = new Collection(["foo", "bar"]);
  c = (c as Collection).forget(0).all() as object;
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === "foo" && v !== null));
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === 0 && v !== null));
  this.assertTrue(phpArrayEntries(c).some(([key, v]) => key === 1 && v !== null));

  c = new Collection({ foo: "bar", baz: "qux" });
  c = (c as Collection).forget("foo").all() as object;
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === "foo" && v !== null));
  this.assertTrue(phpArrayEntries(c).some(([key, v]) => key === "baz" && v !== null));
});

portedTest(`${ID}::testForgetArrayOfKeys`, { case: SupportCollectionTest }, async function () {
  let c: object = new Collection(["foo", "bar", "baz"]);
  c = (c as Collection).forget([0, 2]).all() as object;
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === 0 && v !== null));
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === 2 && v !== null));
  this.assertTrue(phpArrayEntries(c).some(([key, v]) => key === 1 && v !== null));

  c = new Collection({ name: "taylor", foo: "bar", baz: "qux" });
  c = (c as Collection).forget(["foo", "baz"]).all() as object;
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === "foo" && v !== null));
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === "baz" && v !== null));
  this.assertTrue(phpArrayEntries(c).some(([key, v]) => key === "name" && v !== null));
});

portedTest(`${ID}::testForgetCollectionOfKeys`, { case: SupportCollectionTest }, async function () {
  let c: object = new Collection(["foo", "bar", "baz"]);
  c = (c as Collection).forget(collect([0, 2])).all() as object;
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === 0 && v !== null));
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === 2 && v !== null));
  this.assertTrue(phpArrayEntries(c).some(([key, v]) => key === 1 && v !== null));

  c = new Collection({ name: "taylor", foo: "bar", baz: "qux" });
  c = (c as Collection).forget(collect(["foo", "baz"])).all() as object;
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === "foo" && v !== null));
  this.assertFalse(phpArrayEntries(c).some(([key, v]) => key === "baz" && v !== null));
  this.assertTrue(phpArrayEntries(c).some(([key, v]) => key === "name" && v !== null));
});

portedTest(`${ID}::testAdd`, { case: SupportCollectionTest }, async function () {
  const c = new Collection([]);
  this.assertEquals([1], c.add(1).values().all());
  this.assertEquals([1, 2], c.add(2).values().all());
  this.assertEquals([1, 2, ""], c.add("").values().all());
  this.assertEquals([1, 2, "", null], c.add(null).values().all());
  this.assertEquals([1, 2, "", null, false], c.add(false).values().all());
  this.assertEquals([1, 2, "", null, false, []], c.add([]).values().all());
  this.assertEquals([1, 2, "", null, false, [], "name"], c.add("name").values().all());
});

portedTest(`${ID}::testContainsOneItem`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertFalse(new collection([]).containsOneItem());
  this.assertTrue(new collection([1]).containsOneItem());
  this.assertFalse(new collection([1, 2]).containsOneItem());

  this.assertFalse(collect([1, 2, 2]).containsOneItem((number: unknown) => number === 2));
  this.assertTrue(collect(["ant", "bear", "cat"]).containsOneItem((word: string) => strlen(word) === 4));
  this.assertFalse(collect(["ant", "bear", "cat"]).containsOneItem((word: string) => strlen(word) > 4));
});

portedTest(`${ID}::testContainsManyItems`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertFalse(new collection([]).containsManyItems());
  this.assertFalse(new collection([1]).containsManyItems());
  this.assertTrue(new collection([1, 2]).containsManyItems());
  this.assertTrue(new collection([1, 2, 3]).containsManyItems());

  this.assertTrue(collect([1, 2, 2]).containsManyItems((number: unknown) => number === 2));
  this.assertFalse(collect(["ant", "bear", "cat"]).containsManyItems((word: string) => strlen(word) === 4));
  this.assertFalse(collect(["ant", "bear", "cat"]).containsManyItems((word: string) => strlen(word) > 4));
  this.assertTrue(collect(["ant", "bear", "cat"]).containsManyItems((word: string) => strlen(word) === 3));
});

portedTest(`${ID}::testValues`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    { id: 1, name: "Hello" },
    { id: 2, name: "World" },
  ]);
  this.assertEquals(
    [{ id: 2, name: "World" }],
    c
      .filter((item: Record<string, unknown>) => {
        return looseEquals(item["id"], 2);
      })
      .values()
      .all(),
  );
});

portedTest(`${ID}::testValuesResetKey`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(
    new PhpArray([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]),
  );
  this.assertEquals(["a", "b", "c"], data.values().all());
});

portedTest(`${ID}::testValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([
    { id: 1, name: "Hello" },
    { id: 2, name: "World" },
  ]);

  this.assertSame("Hello", c.value("name"));
  this.assertSame("World", c.where("id", 2).value("name"));

  c = new collection([
    { id: 1, pivot: { value: "foo" } },
    { id: 2, pivot: { value: "bar" } },
  ]);

  this.assertEquals({ value: "foo" }, c.value("pivot"));
  this.assertSame("foo", c.value("pivot.value"));
  this.assertSame("bar", c.where("id", 2).value("pivot.value"));
});

portedTest(`${ID}::testValueUsingEnum`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    { id: 1, name: StaffEnum.Taylor },
    { id: 2, name: StaffEnum.Joe },
  ]);

  this.assertSame(StaffEnum.Taylor, c.value("name"));
  this.assertEquals(StaffEnum.Joe, c.where("id", 2).value("name"));
});

portedTest(`${ID}::testValueWithNegativeValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
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

portedTest(`${ID}::testValueWithObjects`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([literal({ id: 1 }), literal({ id: 2, balance: "" }), literal({ id: 3, balance: 200 })]);

  this.assertSame("", c.value("balance"));

  c = new collection([literal({ id: 1 }), literal({ id: 2, balance: literal({ currency: "USD", value: 0 }) }), literal({ id: 3, balance: literal({ currency: "USD", value: 200 }) })]);

  this.assertEquals(0, c.value("balance.value"));
});

portedTest(`${ID}::testExcept`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ first: "Taylor", last: "Otwell", email: "taylorotwell@gmail.com" });

  this.assertEquals(data.all(), data.except(null).all());
  this.assertEquals({ first: "Taylor" }, data.except(["last", "email", "missing"]).all());
  this.assertEquals({ first: "Taylor" }, data.except("last", "email", "missing").all());
  this.assertEquals({ first: "Taylor" }, data.except(collect(["last", "email", "missing"])).all());

  this.assertEquals({ first: "Taylor", email: "taylorotwell@gmail.com" }, data.except(["last"]).all());
  this.assertEquals({ first: "Taylor", email: "taylorotwell@gmail.com" }, data.except("last").all());
  this.assertEquals({ first: "Taylor", email: "taylorotwell@gmail.com" }, data.except(collect(["last"])).all());
});

portedTest(`${ID}::testExceptSelf`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ first: "Taylor", last: "Otwell" });
  this.assertEquals({ first: "Taylor", last: "Otwell" }, data.except(data).all());
});

portedTest(`${ID}::testPluckWithArrayAndObjectValues`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([Object.assign(new stdClass(), { name: "taylor", email: "foo" }), { name: "dayle", email: "bar" }]);
  this.assertEquals({ taylor: "foo", dayle: "bar" }, data.pluck("email", "name").all());
  this.assertEquals(["foo", "bar"], data.pluck("email").all());
});

portedTest(`${ID}::testPluckWithArrayAccessValues`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new TestArrayAccessImplementation({ name: "taylor", email: "foo" }), new TestArrayAccessImplementation({ name: "dayle", email: "bar" })]);

  this.assertEquals({ taylor: "foo", dayle: "bar" }, data.pluck("email", "name").all());
  this.assertEquals(["foo", "bar"], data.pluck("email").all());
});

portedTest(`${ID}::testPluckWithDotNotation`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    {
      name: "amir",
      skill: {
        backend: ["php", "python"],
      },
    },
    {
      name: "taylor",
      skill: {
        backend: ["php", "asp", "java"],
      },
    },
  ]);

  this.assertEquals(
    [
      ["php", "python"],
      ["php", "asp", "java"],
    ],
    data.pluck("skill.backend").all(),
  );
});

portedTest(`${ID}::testPluckWithClosure`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    {
      name: "amir",
      skill: {
        backend: ["php", "python"],
      },
    },
    {
      name: "taylor",
      skill: {
        backend: ["php", "asp", "java"],
      },
    },
  ]);

  this.assertEquals(["amir (verified)", "taylor (verified)"], data.pluck((row: PluckRow) => toPhpString(row["name"]) + " (verified)").all());
  this.assertEquals({ "php/python": "amir", "php/asp/java": "taylor" }, data.pluck("name", (row: PluckRow) => implode("/", row["skill"]["backend"])).all());
});

portedTest(`${ID}::testPluckDuplicateKeysExist`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    { brand: "Tesla", color: "red" },
    { brand: "Pagani", color: "white" },
    { brand: "Tesla", color: "black" },
    { brand: "Pagani", color: "orange" },
  ]);

  this.assertEquals({ Tesla: "black", Pagani: "orange" }, data.pluck("color", "brand").all());
});

portedTest(`${ID}::testHas`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ id: 1, first: "Hello", second: "World" });
  this.assertTrue(data.has("first"));
  this.assertFalse(data.has("third"));
  this.assertTrue(data.has(["first", "second"]));
  this.assertFalse(data.has(["third", "first"]));
  this.assertTrue(data.has("first", "second"));
});

portedTest(`${ID}::testHasAny`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ id: 1, first: "Hello", second: "World" });

  this.assertTrue(data.hasAny("first"));
  this.assertFalse(data.hasAny("third"));
  this.assertTrue(data.hasAny(["first", "second"]));
  this.assertTrue(data.hasAny(["first", "fourth"]));
  this.assertFalse(data.hasAny(["third", "fourth"]));
  this.assertFalse(data.hasAny("third", "fourth"));
  this.assertFalse(data.hasAny([]));
});

portedTest(`${ID}::testGetOrPut`, { case: SupportCollectionTest }, async function () {
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
    data.getOrPut("name", () => {
      return null;
    }),
  );

  this.assertSame(
    "foo",
    data.getOrPut("email", () => {
      return null;
    }),
  );

  this.assertSame(
    "male",
    data.getOrPut("gender", () => {
      return "male";
    }),
  );

  this.assertSame("taylor", data.get("name"));
  this.assertSame("foo", data.get("email"));
  this.assertSame("male", data.get("gender"));
});

portedTest(`${ID}::testGetOrPutWithNoKey`, { case: SupportCollectionTest }, async function () {
  let data = new Collection(["taylor", "shawn"]);
  this.assertSame("dayle", data.getOrPut(null, "dayle"));
  this.assertSame("john", data.getOrPut(null, "john"));
  this.assertSame(["taylor", "shawn", "dayle", "john"], data.all());

  data = new Collection(
    new PhpArray<number | string, string>([
      [0, "taylor"],
      ["", "shawn"],
    ]),
  );
  this.assertSame("shawn", data.getOrPut(null, "dayle"));
  this.assertSame(
    new PhpArray<number | string, string>([
      [0, "taylor"],
      ["", "shawn"],
    ]),
    data.all(),
  );
});

portedTest(`${ID}::testPut`, { case: SupportCollectionTest }, async function () {
  let data = new Collection({ name: "taylor", email: "foo" });
  data = data.put("name", "dayle");
  this.assertEquals({ name: "dayle", email: "foo" }, data.all());
});

portedTest(`${ID}::testPutWithNoKey`, { case: SupportCollectionTest }, async function () {
  let data = new Collection(["taylor", "shawn"]);
  data = data.put(null, "dayle");
  this.assertEquals(["taylor", "shawn", "dayle"], data.all());
});

portedTest(`${ID}::testRandom`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6]);

  let random: unknown = data.random();
  this.assertIsInt(random);
  this.assertContains(random, data.all());

  random = data.random(0);
  this.assertInstanceOf(collection, random);
  this.assertCount(0, random);

  random = data.random(1);
  this.assertInstanceOf(collection, random);
  this.assertCount(1, random);

  random = data.random(2);
  this.assertInstanceOf(collection, random);
  this.assertCount(2, random);

  random = data.random("0");
  this.assertInstanceOf(collection, random);
  this.assertCount(0, random);

  random = data.random("1");
  this.assertInstanceOf(collection, random);
  this.assertCount(1, random);

  random = data.random("2");
  this.assertInstanceOf(collection, random);
  this.assertCount(2, random);

  random = data.random(2, true);
  this.assertInstanceOf(collection, random);
  this.assertCount(2, random);
  this.assertCount(2, array_intersect_assoc((random as AnyCollection).all(), data.all()));

  random = data.random((items: unknown) => min(10, count(items)));
  this.assertInstanceOf(collection, random);
  this.assertCount(6, random);

  random = data.random((items: unknown) => min(10, Number(count(items)) - 1), true);
  this.assertInstanceOf(collection, random);
  this.assertCount(5, random);
  this.assertCount(5, array_intersect_assoc((random as AnyCollection).all(), data.all()));
});

portedTest(`${ID}::testRandomOnEmptyCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection();

  let random: unknown = data.random(0);
  this.assertInstanceOf(collection, random);
  this.assertCount(0, random);

  random = data.random("0");
  this.assertInstanceOf(collection, random);
  this.assertCount(0, random);
});

portedTest(`${ID}::testSplice`, { case: SupportCollectionTest }, async function () {
  let data = new Collection(["foo", "baz"]);
  data.splice(1);
  this.assertEquals(["foo"], data.all());

  data = new Collection(["foo", "baz"]);
  data.splice(1, 0, "bar");
  this.assertEquals(["foo", "bar", "baz"], data.all());

  data = new Collection(["foo", "baz"]);
  data.splice(1, 1);
  this.assertEquals(["foo"], data.all());

  data = new Collection(["foo", "baz"]);
  const cut = data.splice(1, 1, "bar");
  this.assertEquals(["foo", "bar"], data.all());
  this.assertEquals(["baz"], cut.all());

  data = new Collection(["foo", "baz"]);
  data.splice(1, 0, ["bar"]);
  this.assertEquals(["foo", "bar", "baz"], data.all());

  data = new Collection(["foo", "baz"]);
  data.splice(1, 0, new Collection(["bar"]));
  this.assertEquals(["foo", "bar", "baz"], data.all());
});

portedTest(`${ID}::testGetPluckValueWithAccessors`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const model = new TestAccessorEloquentTestStub({ some: "foo" });
  const modelTwo = new TestAccessorEloquentTestStub({ some: "bar" });
  const data = new collection([model, modelTwo]);

  this.assertEquals(["foo", "bar"], data.pluck("some").all());
});

portedTest(`${ID}::testNth`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(
    new PhpArray([
      [6, "a"],
      [4, "b"],
      [7, "c"],
      [1, "d"],
      [5, "e"],
      [3, "f"],
    ]),
  );

  this.assertEquals(["a", "e"], data.nth(4).all());
  this.assertEquals(["b", "f"], data.nth(4, 1).all());
  this.assertEquals(["c"], data.nth(4, 2).all());
  this.assertEquals(["d"], data.nth(4, 3).all());
  this.assertEquals(["c", "e"], data.nth(2, 2).all());
  this.assertEquals(["c", "d", "e", "f"], data.nth(1, 2).all());
  this.assertEquals(["c", "d", "e", "f"], data.nth(1, 2).all());
  this.assertEquals(["e", "f"], data.nth(1, -2).all());
  this.assertEquals(["c", "e"], data.nth(2, -4).all());
  this.assertEquals(["e"], data.nth(4, -2).all());
  this.assertEquals(["e"], data.nth(2, -2).all());
});

portedTest(`${ID}::testNthThrowsExceptionForInvalidStep`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectExceptionObject(new InvalidArgumentException("Step value must be at least 1."));

  new collection([1, 2, 3]).nth(0).all();
});

portedTest(`${ID}::testNthThrowsExceptionForNegativeStep`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectExceptionObject(new InvalidArgumentException("Step value must be at least 1."));

  new collection([1, 2, 3]).nth(-1).all();
});

portedTest(`${ID}::testContains`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 3, 5]);

  this.assertTrue(c.contains(1));
  this.assertTrue(c.contains("1"));
  this.assertFalse(c.contains(2));
  this.assertFalse(c.contains("2"));

  c = new collection(["1"]);
  this.assertTrue(c.contains("1"));
  this.assertTrue(c.contains(1));

  c = new collection([null]);
  this.assertTrue(c.contains(false));
  this.assertTrue(c.contains(null));
  this.assertTrue(c.contains([]));
  this.assertTrue(c.contains(0));
  this.assertTrue(c.contains(""));

  c = new collection([0]);
  this.assertTrue(c.contains(0));
  this.assertTrue(c.contains("0"));
  this.assertTrue(c.contains(false));
  this.assertTrue(c.contains(null));

  this.assertTrue(
    c.contains((value: number) => {
      return value < 5;
    }),
  );
  this.assertFalse(
    c.contains((value: number) => {
      return value > 5;
    }),
  );

  c = new collection([{ v: 1 }, { v: 3 }, { v: 5 }]);

  this.assertTrue(c.contains("v", 1));
  this.assertFalse(c.contains("v", 2));

  c = new collection(["date", "class", Object.assign(new stdClass(), { foo: 50 })]);

  this.assertTrue(c.contains("date"));
  this.assertTrue(c.contains("class"));
  this.assertFalse(c.contains("foo"));

  c = new collection([
    { a: false, b: false },
    { a: true, b: false },
  ]);

  this.assertTrue(c.__get("contains").__get("a")); // adapted:DIV-12.16
  this.assertFalse(c.__get("contains").__get("b")); // adapted:DIV-12.16

  c = new collection([null, 1, 2]);

  this.assertTrue(
    c.contains((value: unknown) => {
      return is_null(value);
    }),
  );
});

portedTest(`${ID}::testDoesntContain`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 3, 5]);

  this.assertFalse(c.doesntContain(1));
  this.assertFalse(c.doesntContain("1"));
  this.assertTrue(c.doesntContain(2));
  this.assertTrue(c.doesntContain("2"));

  c = new collection(["1"]);
  this.assertFalse(c.doesntContain("1"));
  this.assertFalse(c.doesntContain(1));

  c = new collection([null]);
  this.assertFalse(c.doesntContain(false));
  this.assertFalse(c.doesntContain(null));
  this.assertFalse(c.doesntContain([]));
  this.assertFalse(c.doesntContain(0));
  this.assertFalse(c.doesntContain(""));

  c = new collection([0]);
  this.assertFalse(c.doesntContain(0));
  this.assertFalse(c.doesntContain("0"));
  this.assertFalse(c.doesntContain(false));
  this.assertFalse(c.doesntContain(null));

  this.assertFalse(
    c.doesntContain((value: number) => {
      return value < 5;
    }),
  );
  this.assertTrue(
    c.doesntContain((value: number) => {
      return value > 5;
    }),
  );

  c = new collection([{ v: 1 }, { v: 3 }, { v: 5 }]);

  this.assertFalse(c.doesntContain("v", 1));
  this.assertTrue(c.doesntContain("v", 2));

  c = new collection(["date", "class", Object.assign(new stdClass(), { foo: 50 })]);

  this.assertFalse(c.doesntContain("date"));
  this.assertFalse(c.doesntContain("class"));
  this.assertTrue(c.doesntContain("foo"));

  c = new collection([
    { a: false, b: false },
    { a: true, b: false },
  ]);

  this.assertFalse(c.__get("doesntContain").__get("a")); // adapted:DIV-12.16
  this.assertTrue(c.__get("doesntContain").__get("b")); // adapted:DIV-12.16

  c = new collection([null, 1, 2]);

  this.assertFalse(
    c.doesntContain((value: unknown) => {
      return is_null(value);
    }),
  );
});

portedTest(`${ID}::testDoesntContainStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 3, 5, "02"]);

  this.assertFalse(c.doesntContainStrict(1));
  this.assertTrue(c.doesntContainStrict("1"));
  this.assertTrue(c.doesntContainStrict(2));
  this.assertFalse(c.doesntContainStrict("02"));
  this.assertTrue(c.doesntContainStrict("2"));
  this.assertTrue(c.doesntContainStrict(true));
  this.assertFalse(
    c.doesntContainStrict((value: unknown) => {
      return spaceship(value, 5) < 0;
    }),
  );
  this.assertTrue(
    c.doesntContainStrict((value: unknown) => {
      return spaceship(value, 5) > 0;
    }),
  );

  c = new collection([0]);
  this.assertFalse(c.doesntContainStrict(0));
  this.assertTrue(c.doesntContainStrict("0"));

  this.assertTrue(c.doesntContainStrict(false));
  this.assertTrue(c.doesntContainStrict(null));

  c = new collection([1, null]);
  this.assertFalse(c.doesntContainStrict(null));
  this.assertTrue(c.doesntContainStrict(0));
  this.assertTrue(c.doesntContainStrict(false));

  c = new collection([{ v: 1 }, { v: 3 }, { v: "04" }, { v: 5 }]);

  this.assertFalse(c.doesntContainStrict("v", 1));
  this.assertTrue(c.doesntContainStrict("v", 2));
  this.assertTrue(c.doesntContainStrict("v", "1"));
  this.assertTrue(c.doesntContainStrict("v", 4));
  this.assertFalse(c.doesntContainStrict("v", "04"));
  this.assertTrue(c.doesntContainStrict("v", "4"));

  c = new collection(["date", "class", Object.assign(new stdClass(), { foo: 50 }), ""]);

  this.assertFalse(c.doesntContainStrict("date"));
  this.assertFalse(c.doesntContainStrict("class"));
  this.assertTrue(c.doesntContainStrict("foo"));
  this.assertTrue(c.doesntContainStrict(null));
  this.assertFalse(c.doesntContainStrict(""));
});

portedTest(`${ID}::testSome`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 3, 5]);

  this.assertTrue(c.some(1));
  this.assertFalse(c.some(2));
  this.assertTrue(
    c.some((value: number) => {
      return value < 5;
    }),
  );
  this.assertFalse(
    c.some((value: number) => {
      return value > 5;
    }),
  );

  c = new collection([{ v: 1 }, { v: 3 }, { v: 5 }]);

  this.assertTrue(c.some("v", 1));
  this.assertFalse(c.some("v", 2));

  c = new collection(["date", "class", Object.assign(new stdClass(), { foo: 50 })]);

  this.assertTrue(c.some("date"));
  this.assertTrue(c.some("class"));
  this.assertFalse(c.some("foo"));

  c = new collection([
    { a: false, b: false },
    { a: true, b: false },
  ]);

  this.assertTrue(c.__get("some").__get("a")); // adapted:DIV-12.16
  this.assertFalse(c.__get("some").__get("b")); // adapted:DIV-12.16

  c = new collection([null, 1, 2]);

  this.assertTrue(
    c.some((value: unknown) => {
      return is_null(value);
    }),
  );
});

portedTest(`${ID}::testContainsStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, null, 2]);
  this.assertTrue(c.containsStrict((value: unknown) => is_null(value)));
  this.assertFalse(c.containsStrict((value: unknown) => value === 0));

  c = new collection([1, 3, 5, "02"]);

  this.assertTrue(c.containsStrict(1));
  this.assertFalse(c.containsStrict("1"));
  this.assertFalse(c.containsStrict(2));
  this.assertTrue(c.containsStrict("02"));
  this.assertFalse(c.containsStrict(true));
  this.assertTrue(
    c.containsStrict((value: unknown) => {
      return spaceship(value, 5) < 0;
    }),
  );
  this.assertFalse(
    c.containsStrict((value: unknown) => {
      return spaceship(value, 5) > 0;
    }),
  );

  c = new collection([0]);
  this.assertTrue(c.containsStrict(0));
  this.assertFalse(c.containsStrict("0"));

  this.assertFalse(c.containsStrict(false));
  this.assertFalse(c.containsStrict(null));

  c = new collection([1, null]);
  this.assertTrue(c.containsStrict(null));
  this.assertFalse(c.containsStrict(0));
  this.assertFalse(c.containsStrict(false));

  c = new collection([{ v: 1 }, { v: 3 }, { v: "04" }, { v: 5 }]);

  this.assertTrue(c.containsStrict("v", 1));
  this.assertFalse(c.containsStrict("v", 2));
  this.assertFalse(c.containsStrict("v", "1"));
  this.assertFalse(c.containsStrict("v", 4));
  this.assertTrue(c.containsStrict("v", "04"));

  c = new collection(["date", "class", Object.assign(new stdClass(), { foo: 50 }), ""]);

  this.assertTrue(c.containsStrict("date"));
  this.assertTrue(c.containsStrict("class"));
  this.assertFalse(c.containsStrict("foo"));
  this.assertFalse(c.containsStrict(null));
  this.assertTrue(c.containsStrict(""));
});

portedTest(`${ID}::testContainsWithOperator`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 3 }, { v: "4" }, { v: 5 }]);

  this.assertTrue(c.contains("v", "=", 4));
  this.assertTrue(c.contains("v", "==", 4));
  this.assertFalse(c.contains("v", "===", 4));
  this.assertTrue(c.contains("v", ">", 4));
});

portedTest(`${ID}::testValueRetrieverAcceptsDotNotation`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([Object.assign(new stdClass(), { id: 1, foo: { bar: "B" } }), Object.assign(new stdClass(), { id: 2, foo: { bar: "A" } })]);

  c = c.sortBy("foo.bar");
  this.assertEquals([2, 1], c.pluck("id").all());
});

portedTest(`${ID}::testPullRetrievesItemFromCollection`, { case: SupportCollectionTest }, async function () {
  let c = new Collection(["foo", "bar"]);

  this.assertSame("foo", c.pull(0));
  this.assertSame("bar", c.pull(1));

  c = new Collection(["foo", "bar"]);

  this.assertNull(c.pull(-1));
  this.assertNull(c.pull(2));
});

portedTest(`${ID}::testPullRemovesItemFromCollection`, { case: SupportCollectionTest }, async function () {
  const c = new Collection(["foo", "bar"]);
  c.pull(0);
  this.assertEquals(new PhpArray([[1, "bar"]]), c.all());
  c.pull(1);
  this.assertSame([], c.all());
});

portedTest(`${ID}::testPullRemovesItemFromNestedCollection`, { case: SupportCollectionTest }, async function () {
  const nestedCollection = new Collection([
    new Collection([
      "value",
      new Collection({
        bar: "baz",
        test: "value",
      }),
    ]),
    "bar",
  ]);

  nestedCollection.pull("0.1.test");

  const actualArray = nestedCollection.toArray();
  const expectedArray = [["value", { bar: "baz" }], "bar"];

  this.assertEquals(expectedArray, actualArray);
});

portedTest(`${ID}::testPullReturnsDefault`, { case: SupportCollectionTest }, async function () {
  const c = new Collection([]);
  const value = c.pull(0, "foo");
  this.assertSame("foo", value);
});

portedTest(`${ID}::testSearchReturnsIndexOfFirstFoundItem`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 2],
      [6, 5],
      ["foo", "bar"],
    ]),
  );

  this.assertEquals(1, c.search(2));
  this.assertEquals(1, c.search("2"));
  this.assertSame("foo", c.search("bar"));
  this.assertEquals(
    4,
    c.search((value: unknown) => {
      return spaceship(value, 4) > 0;
    }),
  );
  this.assertSame(
    "foo",
    c.search((value: unknown) => {
      return !is_numeric(value);
    }),
  );
});

portedTest(`${ID}::testSearchInStrictMode`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([false, 0, 1, [], ""]);
  this.assertFalse(c.search("false", true));
  this.assertFalse(c.search("1", true));
  this.assertEquals(0, c.search(false, true));
  this.assertEquals(1, c.search(0, true));
  this.assertEquals(2, c.search(1, true));
  this.assertEquals(3, c.search([], true));
  this.assertEquals(4, c.search("", true));
});

portedTest(`${ID}::testSearchReturnsFalseWhenItemIsNotFound`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      ["foo", "bar"],
    ]),
  );

  this.assertFalse(c.search(6));
  this.assertFalse(c.search("foo"));
  this.assertFalse(
    c.search((value: unknown) => {
      return spaceship(value, 1) < 0 && is_numeric(value);
    }),
  );
  this.assertFalse(
    c.search((value: unknown) => {
      return value === "nope";
    }),
  );
});

portedTest(`${ID}::testBeforeReturnsItemBeforeTheGivenItem`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 2],
      [6, 5],
      ["name", "taylor"],
      ["framework", "laravel"],
    ]),
  );

  this.assertEquals(1, c.before(2));
  this.assertEquals(1, c.before("2"));
  this.assertEquals(5, c.before("taylor"));
  this.assertSame("taylor", c.before("laravel"));
  this.assertEquals(
    4,
    c.before((value: unknown) => {
      return spaceship(value, 4) > 0;
    }),
  );
  this.assertEquals(
    5,
    c.before((value: unknown) => {
      return !is_numeric(value);
    }),
  );
});

portedTest(`${ID}::testBeforeInStrictMode`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([false, 0, 1, [], ""]);
  this.assertNull(c.before("false", true));
  this.assertNull(c.before("1", true));
  this.assertNull(c.before(false, true));
  this.assertEquals(false, c.before(0, true));
  this.assertEquals(0, c.before(1, true));
  this.assertEquals(1, c.before([], true));
  this.assertSame([], c.before("", true));
});

portedTest(`${ID}::testBeforeReturnsNullWhenItemIsNotFound`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      ["foo", "bar"],
    ]),
  );

  this.assertNull(c.before(6));
  this.assertNull(c.before("foo"));
  this.assertNull(
    c.before((value: unknown) => {
      return spaceship(value, 1) < 0 && is_numeric(value);
    }),
  );
  this.assertNull(
    c.before((value: unknown) => {
      return value === "nope";
    }),
  );
});

portedTest(`${ID}::testBeforeReturnsNullWhenItemOnTheFirstitem`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      ["foo", "bar"],
    ]),
  );

  this.assertNull(c.before(1));
  this.assertNull(
    c.before((value: unknown) => {
      return spaceship(value, 2) < 0 && is_numeric(value);
    }),
  );

  c = new collection(
    new PhpArray<number | string, unknown>([
      ["foo", "bar"],
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]),
  );
  this.assertNull(c.before("bar"));
});

portedTest(`${ID}::testAfterReturnsItemAfterTheGivenItem`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 2],
      [5, 5],
      ["name", "taylor"],
      ["framework", "laravel"],
    ]),
  );

  this.assertEquals(2, c.after(1));
  this.assertEquals(3, c.after(2));
  this.assertEquals(4, c.after(3));
  this.assertEquals(2, c.after(4));
  this.assertSame("taylor", c.after(5));
  this.assertSame("laravel", c.after("taylor"));

  this.assertEquals(
    4,
    c.after((value: unknown) => {
      return spaceship(value, 2) > 0;
    }),
  );
  this.assertSame(
    "laravel",
    c.after((value: unknown) => {
      return !is_numeric(value);
    }),
  );
});

portedTest(`${ID}::testAfterInStrictMode`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([false, 0, 1, [], ""]);

  this.assertNull(c.after("false", true));
  this.assertNull(c.after("1", true));
  this.assertNull(c.after("", true));
  this.assertEquals(0, c.after(false, true));
  this.assertSame([], c.after(1, true));
  this.assertSame("", c.after([], true));
});

portedTest(`${ID}::testAfterReturnsNullWhenItemIsNotFound`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      ["foo", "bar"],
    ]),
  );

  this.assertNull(c.after(6));
  this.assertNull(c.after("foo"));
  this.assertNull(
    c.after((value: unknown) => {
      return spaceship(value, 1) < 0 && is_numeric(value);
    }),
  );
  this.assertNull(
    c.after((value: unknown) => {
      return value === "nope";
    }),
  );
});

portedTest(`${ID}::testAfterReturnsNullWhenItemOnTheLastItem`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(
    new PhpArray<number | string, unknown>([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      ["foo", "bar"],
    ]),
  );

  this.assertNull(c.after("bar"));
  this.assertNull(
    c.after((value: unknown) => {
      return spaceship(value, 4) > 0 && !is_numeric(value);
    }),
  );

  c = new collection(
    new PhpArray<number | string, unknown>([
      ["foo", "bar"],
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]),
  );
  this.assertNull(c.after(5));
});

portedTest(`${ID}::testKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection({ name: "taylor", framework: "laravel" });
  this.assertEquals(["name", "framework"], c.keys().all());

  c = new collection(["taylor", "laravel"]);
  this.assertEquals([0, 1], c.keys().all());
});

portedTest(`${ID}::testPrepend`, { case: SupportCollectionTest }, async function () {
  let c = new Collection(["one", "two", "three", "four"]);
  this.assertEquals(["zero", "one", "two", "three", "four"], c.prepend("zero").all());

  c = new Collection({ one: 1, two: 2 });
  this.assertEquals({ zero: 0, one: 1, two: 2 }, c.prepend(0, "zero").all());

  c = new Collection({ one: 1, two: 2 });
  this.assertEquals(
    new PhpArray([
      [null, 0],
      ["one", 1],
      ["two", 2],
    ]),
    c.prepend(0, null).all(),
  );

  c = new Collection({ one: 1, two: 2 });
  this.assertEquals(
    new PhpArray([
      [null, 0],
      ["one", 1],
      ["two", 2],
    ]),
    c.prepend(0, "").all(),
  );
});

portedTest(`${ID}::testPushWithOneItem`, { case: SupportCollectionTest }, async function () {
  const expected = [4, 5, 6, ["a", "b", "c"], { who: "Jonny", preposition: "from", where: "Laroe" }, "Jonny from Laroe"];

  const data = new Collection([4, 5, 6]);
  data.push(["a", "b", "c"]);
  data.push({ who: "Jonny", preposition: "from", where: "Laroe" });
  const actual = data.push("Jonny from Laroe").toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testPushWithMultipleItems`, { case: SupportCollectionTest }, async function () {
  const expected = [4, 5, 6, "Jonny", "from", "Laroe", "Jonny", "from", "Laroe", "a", "b", "c"];

  const data = new Collection([4, 5, 6]);
  data.push("Jonny", "from", "Laroe");
  data.push(
    ...(array_values(
      new PhpArray([
        [11, "Jonny"],
        [12, "from"],
        [13, "Laroe"],
      ]),
    ) as unknown[]),
  ); // adapted:DIV-9.15
  data.push(...collect(["a", "b", "c"]));
  // oxlint-disable-next-line unicorn/no-useless-spread -- Upstream's `push(...[])`, a spread that passes no argument
  const actual = data.push(...[]).toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testUnshiftWithOneItem`, { case: SupportCollectionTest }, async function () {
  const expected = ["Jonny from Laroe", { who: "Jonny", preposition: "from", where: "Laroe" }, ["a", "b", "c"], 4, 5, 6];

  const data = new Collection([4, 5, 6]);
  data.unshift(["a", "b", "c"]);
  data.unshift({ who: "Jonny", preposition: "from", where: "Laroe" });
  const actual = data.unshift("Jonny from Laroe").toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testUnshiftWithMultipleItems`, { case: SupportCollectionTest }, async function () {
  const expected = ["a", "b", "c", "Jonny", "from", "Laroe", "Jonny", "from", "Laroe", 4, 5, 6];

  const data = new Collection([4, 5, 6]);
  data.unshift("Jonny", "from", "Laroe");
  data.unshift(
    ...(array_values(
      new PhpArray([
        [11, "Jonny"],
        [12, "from"],
        [13, "Laroe"],
      ]),
    ) as unknown[]),
  ); // adapted:DIV-9.15
  data.unshift(...collect(["a", "b", "c"]));
  // oxlint-disable-next-line unicorn/no-useless-spread -- Upstream's `unshift(...[])`, a spread that passes no argument
  const actual = data.unshift(...[]).toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testOnly`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ first: "Taylor", last: "Otwell", email: "taylorotwell@gmail.com" });

  this.assertEquals(data.all(), data.only(null).all());
  this.assertEquals({ first: "Taylor" }, data.only(["first", "missing"]).all());
  this.assertEquals({ first: "Taylor" }, data.only("first", "missing").all());
  this.assertEquals({ first: "Taylor" }, data.only(collect(["first", "missing"])).all());

  this.assertEquals({ first: "Taylor", email: "taylorotwell@gmail.com" }, data.only(["first", "email"]).all());
  this.assertEquals({ first: "Taylor", email: "taylorotwell@gmail.com" }, data.only("first", "email").all());
  this.assertEquals({ first: "Taylor", email: "taylorotwell@gmail.com" }, data.only(collect(["first", "email"])).all());
});

portedTest(`${ID}::testSelectWithArrays`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    { first: "Taylor", last: "Otwell", email: "taylorotwell@gmail.com" },
    { first: "Jess", last: "Archer", email: "jessarcher@gmail.com" },
  ]);

  this.assertEquals(data.all(), data.select(null).all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select(["first", "missing"]).all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select("first", "missing").all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select(collect(["first", "missing"])).all());

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select(["first", "email"]).all(),
  );

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select("first", "email").all(),
  );

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select(collect(["first", "email"])).all(),
  );
});

portedTest(`${ID}::testSelectWithArrayAccess`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    new TestArrayAccessImplementation({ first: "Taylor", last: "Otwell", email: "taylorotwell@gmail.com" }),
    new TestArrayAccessImplementation({ first: "Jess", last: "Archer", email: "jessarcher@gmail.com" }),
  ]);

  this.assertEquals(data.all(), data.select(null).all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select(["first", "missing"]).all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select("first", "missing").all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select(collect(["first", "missing"])).all());

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select(["first", "email"]).all(),
  );

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select("first", "email").all(),
  );

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select(collect(["first", "email"])).all(),
  );
});

portedTest(`${ID}::testSelectWithObjects`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    Object.assign(new stdClass(), { first: "Taylor", last: "Otwell", email: "taylorotwell@gmail.com" }),
    Object.assign(new stdClass(), { first: "Jess", last: "Archer", email: "jessarcher@gmail.com" }),
  ]);

  this.assertEquals(data.all(), data.select(null).all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select(["first", "missing"]).all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select("first", "missing").all());
  this.assertEquals([{ first: "Taylor" }, { first: "Jess" }], data.select(collect(["first", "missing"])).all());

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select(["first", "email"]).all(),
  );

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select("first", "email").all(),
  );

  this.assertEquals(
    [
      { first: "Taylor", email: "taylorotwell@gmail.com" },
      { first: "Jess", email: "jessarcher@gmail.com" },
    ],
    data.select(collect(["first", "email"])).all(),
  );
});

portedTest(`${ID}::testRandomThrowsAnExceptionUsingAmountBiggerThanCollectionSize`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(InvalidArgumentException);

  const data = new collection([1, 2, 3]);
  data.random(4);
});

portedTest(`${ID}::testHasReturnsValidResults`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(
    new PhpArray<string | number, string>([
      ["foo", "one"],
      ["bar", "two"],
      [1, "three"],
    ]),
  );
  this.assertTrue(data.has("foo"));
  this.assertTrue(data.has("foo", "bar", 1));
  this.assertFalse(data.has("foo", "bar", 1, "baz"));
  this.assertFalse(data.has("baz"));
});

portedTest(`${ID}::testPutAddsItemToCollection`, { case: SupportCollectionTest }, async function () {
  const data = new Collection();
  this.assertSame([], data.toArray());
  data.put("foo", 1);
  this.assertSame({ foo: 1 }, data.toArray());
  data.put("bar", { nested: "two" });
  this.assertSame({ foo: 1, bar: { nested: "two" } }, data.toArray());
  data.put("foo", 3);
  this.assertSame({ foo: 3, bar: { nested: "two" } }, data.toArray());
});
