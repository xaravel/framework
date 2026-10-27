// Ported from framework/tests/Support/SupportCollectionTest.php (Laravel v13.37.0): Story 14.1's Test IDs, then Story
// 14.2's, then Story 14.3's, then Story 14.4's, each in Upstream's order. Story 14.5 adds its own to this file.
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
// Story 14.3: `when`, `unless` and `duplicates` are overloaded generic members, which TypeScript cannot call through the
// `AnyCollection` union, so those calls go through `OverloadedView`, one class's static type; the call itself is
// Upstream's. `$c->when->contains(...)` is `c.__get('when').__call('contains', [...])` (DIV-12.16), and the
// `HigherOrderWhenProxy` it returns answers `concat` (DIV-12.12). testWhere uses Support's `HtmlString` and
// testWhereInstanceOf `Str`, so they keep Upstream's bodies in the blocked case, through local classes that throw
// `BlockedByComponentError("support")`. The fixtures `TestSupportCollectionHigherOrderItem`,
// `TestSupportCollectionHigherOrderStaticClass1` and `TestSupportCollectionHigherOrderStaticClass2` call PHP's
// `strtoupper`, `trim` and `chunk_split`, which the runtime exports since ESC-14.3-1, and testHighOrderPercentage's
// expected `75.00` is `float(75)`, as `round` returns a float (DIV-9.4).
//
// Story 14.4: testImplode builds Support's `Illuminate\Support\Stringable`, so it keeps Upstream's body in the blocked
// case, through a local `Stringable` that throws `BlockedByComponentError("support")`. testImplodeModels builds Eloquent
// models, so it keeps Upstream's body in `SupportCollectionBlockedByDatabaseTest`, whose `setUp` throws
// `BlockedByComponentError("database")`, through a local `Model` that throws the same error. The tests of the members
// include the runtime set builtins and PHP callable strings approved by ESC-14.4-1 / ESC-14.4-2.
//
// `Mockery::mock(Arrayable::class)` is `Mockery.mock(Arrayable)` over the contract token, and
// `Mockery::mock(JsonSerializable::class)` is `Mockery.mock(JsonSerializable)` over the runtime's PHP-interface token
// (PORTING.md § Test-adaptation rules, Mockery; decisions/ESC-14.1-11.md).
import { phpArrayEntries, portedTest, TestCase } from "@xaravel/assert";
import { Collection, collect, HigherOrderCollectionProxy, ItemNotFoundException, LazyCollection, MultipleItemsFoundException } from "@xaravel/collections";
import { Arrayable } from "@xaravel/contracts/support";
import { Mockery } from "@xaravel/mockery";
import {
  Ref,
  SORT_NATURAL,
  SORT_REGULAR,
  SORT_STRING,
  SORT_NUMERIC,
  SortDirection,
  ArrayAccess,
  ArrayIterator,
  ArrayObject,
  array_intersect_assoc,
  array_keys,
  array_values,
  BlockedByComponentError,
  callMethod,
  CachingIterator,
  chunk_split,
  count,
  Error as PhpError,
  Exception,
  float,
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
  strtoupper,
  substr,
  Throwable,
  toPhpString,
  trim,
  UnexpectedValueException,
  ValueError,
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

/** Upstream's test-local `TestSupportCollectionHigherOrderItem`. */
class TestSupportCollectionHigherOrderItem {
  name: unknown;

  constructor(name: unknown = "taylor") {
    this.name = name;
  }

  uppercase(): string {
    return (this.name = strtoupper(this.name));
  }

  is(name: unknown): boolean {
    return this.name === name;
  }
}

/** Upstream's test-local `TestSupportCollectionHigherOrderStaticClass1`. */
class TestSupportCollectionHigherOrderStaticClass1 {
  static transform(name: unknown): string {
    return strtoupper(name);
  }

  static matches(name: string): boolean {
    return str_starts_with(name, "T");
  }
}

/** Upstream's test-local `TestSupportCollectionHigherOrderStaticClass2`. */
class TestSupportCollectionHigherOrderStaticClass2 {
  static transform(name: unknown): string {
    return trim(chunk_split(name, 1, " "));
  }

  static matches(name: string): boolean {
    return str_starts_with(name, "O");
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

/** Upstream's simple constructor fixture. */
class TestCollectionMapIntoObject {
  constructor(public value: unknown) {}
}

/** Upstream's subclass that forwards its state when constructing derived collections. */
class TestCollectionWithExtraState extends Collection {
  constructor(items: unknown = [], public tag: string = "") {
    super(items);
  }
  protected override newInstance(items: unknown = []): this {
    const Class = this.constructor as new (items: unknown, tag: string) => this;
    return new Class(items, this.tag);
  }
}

class SupportCollectionTest extends TestCase {
  sortByRating(value: { rating: unknown }): unknown { return value.rating; }
  sortByUrl(value: { url: unknown }): unknown { return value.url; }

  setUp(): void {
    for (const [name, klass] of [...COMMON_FIXTURES, ...ENUM_FIXTURES]) {
      registerTestClass(name, klass);
    }
    registerTestClass("Illuminate\\Tests\\Support\\TestJsonSerializeToStringObject", TestJsonSerializeToStringObject);
    registerTestClass("Illuminate\\Tests\\Support\\TestCollectionSubclass", TestCollectionSubclass);
    registerTestClass("Illuminate\\Tests\\Support\\StaffEnum", StaffEnum);
    registerTestClass("Illuminate\\Tests\\Support\\TestCollectionWithExtraState", TestCollectionWithExtraState);
    registerTestClass("Illuminate\\Tests\\Support\\TestCollectionMapIntoObject", TestCollectionMapIntoObject);
    registerTestClass("Illuminate\\Tests\\Support\\TestAccessorEloquentTestStub", TestAccessorEloquentTestStub);
    registerTestClass("Illuminate\\Tests\\Support\\TestArrayAccessImplementation", TestArrayAccessImplementation);
    registerTestClass("Illuminate\\Tests\\Support\\TestSupportCollectionHigherOrderItem", TestSupportCollectionHigherOrderItem);
    registerTestClass("Illuminate\\Tests\\Support\\TestSupportCollectionHigherOrderStaticClass1", TestSupportCollectionHigherOrderStaticClass1);
    registerTestClass("Illuminate\\Tests\\Support\\TestSupportCollectionHigherOrderStaticClass2", TestSupportCollectionHigherOrderStaticClass2);
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

/** Support's `Illuminate\Support\HtmlString`, which arrives with Support (Epic 19). */
class HtmlString {
  constructor(html: string = "") {
    void html;
    throw new BlockedByComponentError("support");
  }
}

/** Support's `Illuminate\Support\Str`, which arrives with Support (Epic 19). */
class Str {
  constructor() {
    throw new BlockedByComponentError("support");
  }
}

/** Support's `Illuminate\Support\Stringable`, which arrives with Support (Epic 19). */
class Stringable {
  constructor(value: string = "") {
    void value;
    throw new BlockedByComponentError("support");
  }
}

/** The test case of the Test IDs that need Eloquent's `Model` (Database, Epic 36). */
class SupportCollectionBlockedByDatabaseTest extends SupportCollectionTest {
  override setUp(): void {
    throw new BlockedByComponentError("database");
  }
}

/** Eloquent's `Illuminate\Database\Eloquent\Model`, which arrives with Database (Epic 36). */
class Model {
  constructor() {
    throw new BlockedByComponentError("database");
  }

  setAttribute(key: string, value: unknown): this {
    void key;
    void value;
    throw new BlockedByComponentError("database");
  }
}

/**
 * One class's view of a collection under test, for the members TypeScript cannot call through the `AnyCollection`
 * union: overloaded generic members (`when`, `unless`, `duplicates`), whose overloads it does not merge across the two
 * classes. Both classes declare them alike, so the view changes only the static type, never the call.
 */
type OverloadedView = Collection;

/** What a `HigherOrderWhenProxy` answers for `concat` (DIV-12.12): the collection's result, or the collection. */
type WhenConcat = { concat(source: unknown): AnyCollection };

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

// Story 14.3: filtering, slicing and conditional methods, in Upstream's order.

portedTest(`${ID}::testSkipMethod`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6]);

  // Total items to skip is smaller than collection length
  this.assertSame([5, 6], data.skip(4).values().all());

  // Total items to skip is more than collection length
  this.assertSame([], data.skip(10).values().all());
});

portedTest(`${ID}::testSkipUntil`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 1, 2, 2, 3, 3, 4, 4]);

  // Item at the beginning of the collection
  this.assertSame([1, 1, 2, 2, 3, 3, 4, 4], data.skipUntil(1).values().all());

  // Item at the middle of the collection
  this.assertSame([3, 3, 4, 4], data.skipUntil(3).values().all());

  // Item not in the collection
  this.assertSame([], data.skipUntil(5).values().all());

  // Item at the beginning of the collection
  data = data
    .skipUntil((value: number, key: number) => {
      void key;
      return value <= 1;
    })
    .values();

  this.assertSame([1, 1, 2, 2, 3, 3, 4, 4], data.all());

  // Item at the middle of the collection
  data = data
    .skipUntil((value: number, key: number) => {
      void key;
      return value >= 3;
    })
    .values();

  this.assertSame([3, 3, 4, 4], data.all());

  // Item not in the collection
  data = data
    .skipUntil((value: number, key: number) => {
      void key;
      return value >= 5;
    })
    .values();

  this.assertSame([], data.all());
});

portedTest(`${ID}::testSkipWhile`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 1, 2, 2, 3, 3, 4, 4]);

  // Item at the beginning of the collection
  this.assertSame([2, 2, 3, 3, 4, 4], data.skipWhile(1).values().all());

  // Item not in the collection
  this.assertSame([1, 1, 2, 2, 3, 3, 4, 4], data.skipWhile(5).values().all());

  // Item in the collection but not at the beginning
  this.assertSame([1, 1, 2, 2, 3, 3, 4, 4], data.skipWhile(2).values().all());

  // Item not in the collection
  data = data
    .skipWhile((value: number, key: number) => {
      void key;
      return value >= 5;
    })
    .values();

  this.assertSame([1, 1, 2, 2, 3, 3, 4, 4], data.all());

  // Item in the collection but not at the beginning
  data = data
    .skipWhile((value: number, key: number) => {
      void key;
      return value >= 2;
    })
    .values();

  this.assertSame([1, 1, 2, 2, 3, 3, 4, 4], data.all());

  // Item at the beginning of the collection
  data = data
    .skipWhile((value: number, key: number) => {
      void key;
      return value < 3;
    })
    .values();

  this.assertSame([3, 3, 4, 4], data.all());
});

portedTest(`${ID}::testFilter`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([
    { id: 1, name: "Hello" },
    { id: 2, name: "World" },
  ]);
  this.assertEquals(
    new PhpArray([[1, { id: 2, name: "World" }]]),
    c
      .filter((item: Record<string, unknown>) => {
        return looseEquals(item["id"], 2);
      })
      .all(),
  );

  c = new collection(["", "Hello", "", "World"]);
  this.assertEquals(["Hello", "World"], c.filter().values().toArray());

  c = new collection({ id: 1, first: "Hello", second: "World" });
  this.assertEquals(
    { first: "Hello", second: "World" },
    c
      .filter((item: unknown, key: string) => {
        return key !== "id";
      })
      .all(),
  );

  c = new collection([1, 2, 3, null, false, "", 0, []]);
  this.assertEquals([1, 2, 3], c.filter().all());
});

portedTest(`${ID}::testHigherOrderKeyBy`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    { id: "id1", name: "first" },
    { id: "id2", name: "second" },
  ]);

  this.assertEquals({ id1: "first", id2: "second" }, ((c.__get("keyBy").__get("id") as AnyCollection).__get("map").__get("name") as AnyCollection).all()); // adapted:DIV-12.16
});

portedTest(`${ID}::testHigherOrderUnique`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    { id: "1", name: "first" },
    { id: "1", name: "second" },
  ]);

  this.assertCount(1, c.__get("unique").__get("id")); // adapted:DIV-12.16
});

portedTest(`${ID}::testHigherOrderFilter`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    new (class {
      name = "Alex";

      active(): boolean {
        return true;
      }
    })(),
    new (class {
      name = "John";

      active(): boolean {
        return false;
      }
    })(),
  ]);

  this.assertCount(1, c.__get("filter").__call("active", [])); // adapted:DIV-12.16
});

portedTest(`${ID}::testHigherOrderSole`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([new TestSupportCollectionHigherOrderItem("Adam"), new TestSupportCollectionHigherOrderItem("Taylor")]);

  this.assertSame("Taylor", (c.__get("sole").__call("is", ["Taylor"]) as TestSupportCollectionHigherOrderItem).name); // adapted:DIV-12.16
});

portedTest(`${ID}::testWhere`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
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

  const object = Object.assign(new stdClass(), { foo: "bar" });

  this.assertEquals([], c.where("v", object).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.where("v", "<>", object).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.where("v", "!=", object).values().all());

  this.assertEquals([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.where("v", "!==", object).values().all());

  this.assertEquals([], c.where("v", ">", object).values().all());

  this.assertEquals([{ v: 3 }, { v: "3" }], c.where((value: Record<string, unknown>) => looseEquals(value["v"], 3)).values().all());

  this.assertEquals([{ v: 3 }], c.where((value: Record<string, unknown>) => value["v"] === 3).values().all());

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

portedTest(`${ID}::testWhereStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 3 }, { v: "3" }]);

  this.assertEquals([{ v: 3 }], c.whereStrict("v", 3).values().all());
});

portedTest(`${ID}::testWhereInstanceOf`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([new stdClass(), new stdClass(), new collection(), new stdClass(), new Str()]);
  this.assertCount(3, c.whereInstanceOf(stdClass));

  this.assertCount(4, c.whereInstanceOf([stdClass, Str]));
});

portedTest(`${ID}::testWhereIn`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);
  this.assertEquals([{ v: 1 }, { v: 3 }, { v: "3" }], c.whereIn("v", [1, 3]).values().all());
  this.assertSame([], c.whereIn("v", [2]).whereIn("v", [1, 3]).values().all());
  this.assertEquals([{ v: 1 }], c.whereIn("v", [1]).whereIn("v", [1, 3]).values().all());
});

portedTest(`${ID}::testWhereInStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);
  this.assertEquals([{ v: 1 }, { v: 3 }], c.whereInStrict("v", [1, 3]).values().all());
});

portedTest(`${ID}::testWhereNotIn`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);
  this.assertEquals([{ v: 2 }, { v: 4 }], c.whereNotIn("v", [1, 3]).values().all());
  this.assertEquals([{ v: 4 }], c.whereNotIn("v", [2]).whereNotIn("v", [1, 3]).values().all());
});

portedTest(`${ID}::testWhereNotInStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);
  this.assertEquals([{ v: 2 }, { v: "3" }, { v: 4 }], c.whereNotInStrict("v", [1, 3]).values().all());
});

portedTest(`${ID}::testBetween`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);

  this.assertEquals([{ v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }], c.whereBetween("v", [2, 4]).values().all());
  this.assertEquals([{ v: 1 }], c.whereBetween("v", [-1, 1]).all());
  this.assertEquals([{ v: 3 }, { v: "3" }], c.whereBetween("v", [3, 3]).values().all());
});

portedTest(`${ID}::testWhereNotBetween`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([{ v: 1 }, { v: 2 }, { v: 3 }, { v: "3" }, { v: 4 }]);

  this.assertEquals([{ v: 1 }], c.whereNotBetween("v", [2, 4]).values().all());
  this.assertEquals([{ v: 2 }, { v: 3 }, { v: 3 }, { v: 4 }], c.whereNotBetween("v", [-1, 1]).values().all());
  this.assertEquals([{ v: 1 }, { v: "2" }, { v: "4" }], c.whereNotBetween("v", [3, 3]).values().all());
});

portedTest(`${ID}::testDuplicates`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let duplicates = (collection.make([1, 2, 1, "laravel", null, "laravel", "php", null]) as OverloadedView).duplicates().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [2, 1],
      [5, "laravel"],
      [7, null],
    ]),
    duplicates,
  );

  // does loose comparison
  duplicates = (collection.make([2, "2", [], null]) as OverloadedView).duplicates().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [1, "2"],
      [3, null],
    ]),
    duplicates,
  );

  // works with mix of primitives
  duplicates = (collection.make([1, "2", ["laravel"], ["laravel"], null, "2"]) as OverloadedView).duplicates().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [3, ["laravel"]],
      [5, "2"],
    ]),
    duplicates,
  );

  // works with mix of objects and primitives **excepts numbers**.
  const expected = new Collection(["laravel"]);
  duplicates = (collection.make([new Collection(["laravel"]), expected, expected, [], "2", "2"]) as OverloadedView).duplicates().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [1, expected],
      [2, expected],
      [5, "2"],
    ]),
    duplicates,
  );
});

portedTest(`${ID}::testDuplicatesWithKey`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let items: Record<string, string>[] = [{ framework: "vue" }, { framework: "laravel" }, { framework: "laravel" }];
  let duplicates = (collection.make(items) as OverloadedView).duplicates("framework").all();
  this.assertSame(new PhpArray([[2, "laravel"]]), duplicates);

  // works with key and strict
  items = [{ Framework: "vue" }, { framework: "vue" }, { Framework: "vue" }];
  duplicates = (collection.make(items) as OverloadedView).duplicates("Framework", true).all();
  this.assertSame(new PhpArray([[2, "vue"]]), duplicates);
});

portedTest(`${ID}::testDuplicatesWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const items = [{ framework: "vue" }, { framework: "laravel" }, { framework: "laravel" }];
  const duplicates = (collection.make(items) as OverloadedView)
    .duplicates((item: Record<string, unknown>) => {
      return item["framework"];
    })
    .all();
  this.assertSame(new PhpArray([[2, "laravel"]]), duplicates);
});

portedTest(`${ID}::testDuplicatesWithStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let duplicates = collection.make([1, 2, 1, "laravel", null, "laravel", "php", null]).duplicatesStrict().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [2, 1],
      [5, "laravel"],
      [7, null],
    ]),
    duplicates,
  );

  // does strict comparison
  duplicates = collection.make([2, "2", [], null]).duplicatesStrict().all();
  this.assertSame([], duplicates);

  // works with mix of primitives
  duplicates = collection.make([1, "2", ["laravel"], ["laravel"], null, "2"]).duplicatesStrict().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [3, ["laravel"]],
      [5, "2"],
    ]),
    duplicates,
  );

  // works with mix of primitives, objects, and numbers
  const expected = new collection(["laravel"]);
  duplicates = collection.make([new collection(["laravel"]), expected, expected, [], "2", "2"]).duplicatesStrict().all();
  this.assertSame(
    new PhpArray<number, unknown>([
      [2, expected],
      [5, "2"],
    ]),
    duplicates,
  );
});

portedTest(`${ID}::testUnique`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(["Hello", "World", "World"]);
  this.assertEquals(["Hello", "World"], c.unique().all());

  c = new collection([
    [1, 2],
    [1, 2],
    [2, 3],
    [3, 4],
    [2, 3],
  ]);
  this.assertEquals(
    [
      [1, 2],
      [2, 3],
      [3, 4],
    ],
    c.unique().values().all(),
  );
});

portedTest(`${ID}::testUniqueWithCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(
    new PhpArray([
      [1, { id: 1, first: "Taylor", last: "Otwell" }],
      [2, { id: 2, first: "Taylor", last: "Otwell" }],
      [3, { id: 3, first: "Abigail", last: "Otwell" }],
      [4, { id: 4, first: "Abigail", last: "Otwell" }],
      [5, { id: 5, first: "Taylor", last: "Swift" }],
      [6, { id: 6, first: "Taylor", last: "Swift" }],
    ]),
  );

  this.assertEquals(
    new PhpArray([
      [1, { id: 1, first: "Taylor", last: "Otwell" }],
      [3, { id: 3, first: "Abigail", last: "Otwell" }],
    ]),
    c.unique("first").all(),
  );

  this.assertEquals(
    new PhpArray([
      [1, { id: 1, first: "Taylor", last: "Otwell" }],
      [3, { id: 3, first: "Abigail", last: "Otwell" }],
      [5, { id: 5, first: "Taylor", last: "Swift" }],
    ]),
    c
      .unique((item: Record<string, unknown>) => {
        return toPhpString(item["first"]) + toPhpString(item["last"]);
      })
      .all(),
  );

  this.assertEquals(
    new PhpArray([
      [1, { id: 1, first: "Taylor", last: "Otwell" }],
      [2, { id: 2, first: "Taylor", last: "Otwell" }],
    ]),
    c
      .unique((item: unknown, key: number) => {
        return key % 2;
      })
      .all(),
  );
});

portedTest(`${ID}::testUniqueStrict`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    {
      id: "0",
      name: "zero",
    },
    {
      id: "00",
      name: "double zero",
    },
    {
      id: "0",
      name: "again zero",
    },
  ]);

  this.assertEquals(
    [
      {
        id: "0",
        name: "zero",
      },
      {
        id: "00",
        name: "double zero",
      },
    ],
    c.uniqueStrict("id").all(),
  );
});

portedTest(`${ID}::testEvery`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([]);
  this.assertTrue(c.every("key", "value"));
  this.assertTrue(
    c.every(() => {
      return false;
    }),
  );

  c = new collection([{ age: 18 }, { age: 20 }, { age: 20 }]);
  this.assertFalse(c.every("age", 18));
  this.assertTrue(c.every("age", ">=", 18));
  this.assertTrue(
    c.every((item: Record<string, number>) => {
      return item["age"]! >= 18;
    }),
  );
  this.assertFalse(
    c.every((item: Record<string, number>) => {
      return item["age"]! >= 20;
    }),
  );

  c = new collection([null, null]);
  this.assertTrue(
    c.every((item: unknown) => {
      return item === null;
    }),
  );

  c = new collection([{ active: true }, { active: true }]);
  this.assertTrue(c.every("active"));
  this.assertTrue(c.__get("every").__get("active")); // adapted:DIV-12.16
  this.assertFalse(c.concat([{ active: false }]).__get("every").__get("active")); // adapted:DIV-12.16
});

portedTest(`${ID}::testTake`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["taylor", "dayle", "shawn"]);
  data = data.take(2);
  this.assertEquals(["taylor", "dayle"], data.all());
});

portedTest(`${ID}::testTakeLast`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["taylor", "dayle", "shawn"]);
  data = data.take(-2);
  this.assertEquals(
    new PhpArray([
      [1, "dayle"],
      [2, "shawn"],
    ]),
    data.all(),
  );
});

portedTest(`${ID}::testTakeLastWithLimitGreaterThanCollectionSize`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["taylor", "dayle", "shawn"]);
  data = data.take(-5);
  this.assertEquals(["taylor", "dayle", "shawn"], data.all());
});

portedTest(`${ID}::testTakeUntilUsingValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3, 4]);

  data = data.takeUntil(3);

  this.assertSame([1, 2], data.toArray());
});

portedTest(`${ID}::testTakeUntilUsingCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3, 4]);

  data = data.takeUntil((item: number) => {
    return item >= 3;
  });

  this.assertSame([1, 2], data.toArray());
});

portedTest(`${ID}::testTakeUntilReturnsAllItemsForUnmetValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4]);

  let actual = data.takeUntil(99);

  this.assertSame(data.toArray(), actual.toArray());

  actual = data.takeUntil((item: number) => {
    return item >= 99;
  });

  this.assertSame(data.toArray(), actual.toArray());
});

portedTest(`${ID}::testTakeUntilCanBeProxied`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new TestSupportCollectionHigherOrderItem("Adam"), new TestSupportCollectionHigherOrderItem("Taylor"), new TestSupportCollectionHigherOrderItem("Jason")]);

  const actual = data.__get("takeUntil").__call("is", ["Jason"]) as AnyCollection; // adapted:DIV-12.16

  this.assertCount(2, actual);
  this.assertSame("Adam", (actual.get(0) as TestSupportCollectionHigherOrderItem).name);
  this.assertSame("Taylor", (actual.get(1) as TestSupportCollectionHigherOrderItem).name);
});

portedTest(`${ID}::testTakeWhileUsingValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 1, 2, 2, 3, 3]);

  data = data.takeWhile(1);

  this.assertSame([1, 1], data.toArray());
});

portedTest(`${ID}::testTakeWhileUsingCallback`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3, 4]);

  data = data.takeWhile((item: number) => {
    return item < 3;
  });

  this.assertSame([1, 2], data.toArray());
});

portedTest(`${ID}::testTakeWhileReturnsNoItemsForUnmetValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4]);

  let actual = data.takeWhile(2);

  this.assertSame([], actual.toArray());

  actual = data.takeWhile((item: unknown) => {
    return looseEquals(item, 99);
  });

  this.assertSame([], actual.toArray());
});

portedTest(`${ID}::testTakeWhileCanBeProxied`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    new TestSupportCollectionHigherOrderItem("Adam"),
    new TestSupportCollectionHigherOrderItem("Adam"),
    new TestSupportCollectionHigherOrderItem("Taylor"),
    new TestSupportCollectionHigherOrderItem("Taylor"),
  ]);

  const actual = data.__get("takeWhile").__call("is", ["Adam"]) as AnyCollection; // adapted:DIV-12.16

  this.assertCount(2, actual);
  this.assertSame("Adam", (actual.get(0) as TestSupportCollectionHigherOrderItem).name);
  this.assertSame("Adam", (actual.get(1) as TestSupportCollectionHigherOrderItem).name);
});

portedTest(`${ID}::testRejectRemovesElementsPassingTruthTest`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(["foo", "bar"]);
  this.assertEquals(["foo"], c.reject("bar").values().all());

  c = new collection(["foo", "bar"]);
  this.assertEquals(
    ["foo"],
    c
      .reject((v: unknown) => {
        return v === "bar";
      })
      .values()
      .all(),
  );

  c = new collection(["foo", null]);
  this.assertEquals(["foo"], c.reject(null).values().all());

  c = new collection(["foo", "bar"]);
  this.assertEquals(["foo", "bar"], c.reject("baz").values().all());

  c = new collection(["foo", "bar"]);
  this.assertEquals(
    ["foo", "bar"],
    c
      .reject((v: unknown) => {
        return v === "baz";
      })
      .values()
      .all(),
  );

  c = new collection({ id: 1, primary: "foo", secondary: "bar" });
  this.assertEquals(
    { primary: "foo", secondary: "bar" },
    c
      .reject((item: unknown, key: string) => {
        return key === "id";
      })
      .all(),
  );
});

portedTest(`${ID}::testRejectWithoutAnArgumentRemovesTruthyValues`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
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

portedTest(`${ID}::testSliceOffset`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([4, 5, 6, 7, 8], data.slice(3).values().toArray());
});

portedTest(`${ID}::testSliceNegativeOffset`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([6, 7, 8], data.slice(-3).values().toArray());
});

portedTest(`${ID}::testSliceOffsetAndLength`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([4, 5, 6], data.slice(3, 3).values().toArray());
});

portedTest(`${ID}::testSliceOffsetAndNegativeLength`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([4, 5, 6, 7], data.slice(3, -1).values().toArray());
});

portedTest(`${ID}::testSliceNegativeOffsetAndLength`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([4, 5, 6], data.slice(-5, 3).values().toArray());
});

portedTest(`${ID}::testSliceNegativeOffsetAndNegativeLength`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, 2, 3, 4, 5, 6, 7, 8]);
  this.assertEquals([3, 4, 5, 6], data.slice(-6, -2).values().toArray());
});

portedTest(`${ID}::testHigherOrderCollectionGroupBy`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new TestSupportCollectionHigherOrderItem(), new TestSupportCollectionHigherOrderItem("TAYLOR"), new TestSupportCollectionHigherOrderItem("foo")]);

  this.assertEquals(
    {
      taylor: [data.get(0)],
      TAYLOR: [data.get(1)],
      foo: [data.get(2)],
    },
    (data.__get("groupBy").__get("name") as AnyCollection).toArray(), // adapted:DIV-12.16
  );

  this.assertEquals(
    {
      TAYLOR: [data.get(0), data.get(1)],
      FOO: [data.get(2)],
    },
    (data.__get("groupBy").__call("uppercase", []) as AnyCollection).toArray(), // adapted:DIV-12.16
  );
});

portedTest(`${ID}::testHigherOrderCollectionMap`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const person1 = Object.assign(new stdClass(), { name: "Taylor" });
  const person2 = Object.assign(new stdClass(), { name: "Yaz" });

  let data = new collection([person1, person2]);

  this.assertEquals(["Taylor", "Yaz"], (data.__get("map").__get("name") as AnyCollection).toArray()); // adapted:DIV-12.16

  data = new collection([new TestSupportCollectionHigherOrderItem(), new TestSupportCollectionHigherOrderItem()]);

  this.assertEquals(["TAYLOR", "TAYLOR"], ((data.__get("each").__call("uppercase", []) as AnyCollection).__get("map").__get("name") as AnyCollection).toArray()); // adapted:DIV-12.16
});

portedTest(`${ID}::testHigherOrderCollectionMapFromArrays`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const person1 = { name: "Taylor" };
  const person2 = { name: "Yaz" };

  let data = new collection([person1, person2]);

  this.assertEquals(["Taylor", "Yaz"], (data.__get("map").__get("name") as AnyCollection).toArray()); // adapted:DIV-12.16

  data = new collection([new TestSupportCollectionHigherOrderItem(), new TestSupportCollectionHigherOrderItem()]);

  this.assertEquals(["TAYLOR", "TAYLOR"], ((data.__get("each").__call("uppercase", []) as AnyCollection).__get("map").__get("name") as AnyCollection).toArray()); // adapted:DIV-12.16
});

portedTest(`${ID}::testHigherOrderCollectionStaticCall`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const class1 = fqcn(TestSupportCollectionHigherOrderStaticClass1);
  const class2 = fqcn(TestSupportCollectionHigherOrderStaticClass2);

  const classes = new collection([class1, class2]);

  this.assertEquals(["TAYLOR", "t a y l o r"], (classes.__get("map").__call("transform", ["taylor"]) as AnyCollection).toArray()); // adapted:DIV-12.16
  this.assertEquals(class1, classes.__get("first").__call("matches", ["Taylor"])); // adapted:DIV-12.16
  this.assertEquals(class2, classes.__get("first").__call("matches", ["Otwell"])); // adapted:DIV-12.16
});

portedTest(`${ID}::testPartition`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(phpRange(1, 10));

  const [firstPartition, secondPartition] = data
    .partition((i: number) => {
      return i <= 5;
    })
    .all() as AnyCollection[];

  this.assertEquals([1, 2, 3, 4, 5], firstPartition!.values().toArray());
  this.assertEquals([6, 7, 8, 9, 10], secondPartition!.values().toArray());
});

portedTest(`${ID}::testPartitionCallbackWithKey`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection(["zero", "one", "two", "three"]);

  const [even, odd] = data
    .partition((item: unknown, index: number) => {
      return index % 2 === 0;
    })
    .all() as AnyCollection[];

  this.assertEquals(["zero", "two"], even!.values().toArray());
  this.assertEquals(["one", "three"], odd!.values().toArray());
});

portedTest(`${ID}::testPartitionByKey`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const courses = new collection([
    { free: true, title: "Basic" },
    { free: false, title: "Premium" },
  ]);

  const [free, premium] = courses.partition("free").all() as AnyCollection[];

  this.assertSame([{ free: true, title: "Basic" }], free!.values().toArray());
  this.assertSame([{ free: false, title: "Premium" }], premium!.values().toArray());
});

portedTest(`${ID}::testPartitionWithOperators`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([
    { name: "Tim", age: 17 },
    { name: "Agatha", age: 62 },
    { name: "Kristina", age: 33 },
    { name: "Tim", age: 41 },
  ]);

  const [tims, others] = data.partition("name", "Tim").all() as AnyCollection[];

  this.assertEquals(
    [
      { name: "Tim", age: 17 },
      { name: "Tim", age: 41 },
    ],
    tims!.values().all(),
  );

  this.assertEquals(
    [
      { name: "Agatha", age: 62 },
      { name: "Kristina", age: 33 },
    ],
    others!.values().all(),
  );

  const [adults, minors] = data.partition("age", ">=", 18).all() as AnyCollection[];

  this.assertEquals(
    [
      { name: "Agatha", age: 62 },
      { name: "Kristina", age: 33 },
      { name: "Tim", age: 41 },
    ],
    adults!.values().all(),
  );

  this.assertEquals([{ name: "Tim", age: 17 }], minors!.values().all());
});

portedTest(`${ID}::testPartitionPreservesKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const courses = new collection({
    a: { free: true },
    b: { free: false },
    c: { free: true },
  });

  const [free, premium] = courses.partition("free").all() as AnyCollection[];

  this.assertSame({ a: { free: true }, c: { free: true } }, free!.toArray());
  this.assertSame({ b: { free: false } }, premium!.toArray());
});

portedTest(`${ID}::testPartitionEmptyCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection();

  this.assertCount(
    2,
    data.partition(() => {
      return true;
    }),
  );
});

portedTest(`${ID}::testHigherOrderPartition`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const courses = new collection({
    a: { free: true },
    b: { free: false },
    c: { free: true },
  });

  const [free, premium] = (courses.__get("partition").__get("free") as AnyCollection).all() as AnyCollection[]; // adapted:DIV-12.16

  this.assertSame({ a: { free: true }, c: { free: true } }, free!.toArray());

  this.assertSame({ b: { free: false } }, premium!.toArray());
});

portedTest(`${ID}::testWhen`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).when("adam", (data: AnyCollection, newName: string) => {
    return data.concat([newName]);
  });

  this.assertSame(["michael", "tom", "adam"], data.toArray());

  data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).when(false, (data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame(["michael", "tom"], data.toArray());
});

portedTest(`${ID}::testWhenDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).when(
    false,
    (data: AnyCollection) => {
      return data.concat(["adam"]);
    },
    (data: AnyCollection) => {
      return data.concat(["taylor"]);
    },
  );

  this.assertSame(["michael", "tom", "taylor"], data.toArray());
});

portedTest(`${ID}::testWhenEmpty`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.whenEmpty(() => {
    throw new Exception("whenEmpty() should not trigger on a collection with items");
  });

  this.assertSame(["michael", "tom"], data.toArray());

  data = new collection();

  data = data.whenEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame(["adam"], data.toArray());
});

portedTest(`${ID}::testWhenEmptyDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.whenEmpty(
    (data: AnyCollection) => {
      return data.concat(["adam"]);
    },
    (data: AnyCollection) => {
      return data.concat(["taylor"]);
    },
  );

  this.assertSame(["michael", "tom", "taylor"], data.toArray());
});

portedTest(`${ID}::testWhenNotEmpty`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.whenNotEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame(["michael", "tom", "adam"], data.toArray());

  data = new collection();

  data = data.whenNotEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame([], data.toArray());
});

portedTest(`${ID}::testWhenNotEmptyDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.whenNotEmpty(
    (data: AnyCollection) => {
      return data.concat(["adam"]);
    },
    (data: AnyCollection) => {
      return data.concat(["taylor"]);
    },
  );

  this.assertSame(["michael", "tom", "adam"], data.toArray());
});

portedTest(`${ID}::testHigherOrderWhenAndUnless`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).when(true).concat(["chris"]);

  this.assertSame(["michael", "tom", "chris"], data.toArray());

  data = (data as OverloadedView).when(false).concat(["adam"]);

  this.assertSame(["michael", "tom", "chris"], data.toArray());

  data = (data as OverloadedView).unless(false).concat(["adam"]);

  this.assertSame(["michael", "tom", "chris", "adam"], data.toArray());

  data = (data as OverloadedView).unless(true).concat(["bogdan"]);

  this.assertSame(["michael", "tom", "chris", "adam"], data.toArray());
});

portedTest(`${ID}::testHigherOrderWhenAndUnlessWithProxy`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = (data.__get("when").__call("contains", ["michael"]) as WhenConcat).concat(["chris"]); // adapted:DIV-12.16

  this.assertSame(["michael", "tom", "chris"], data.toArray());

  data = (data.__get("when").__call("contains", ["missing"]) as WhenConcat).concat(["adam"]); // adapted:DIV-12.16

  this.assertSame(["michael", "tom", "chris"], data.toArray());

  data = (data.__get("unless").__call("contains", ["missing"]) as WhenConcat).concat(["adam"]); // adapted:DIV-12.16

  this.assertSame(["michael", "tom", "chris", "adam"], data.toArray());

  data = (data.__get("unless").__call("contains", ["adam"]) as WhenConcat).concat(["bogdan"]); // adapted:DIV-12.16

  this.assertSame(["michael", "tom", "chris", "adam"], data.toArray());
});

portedTest(`${ID}::testUnless`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).unless(false, (data: AnyCollection) => {
    return data.concat(["caleb"]);
  });

  this.assertSame(["michael", "tom", "caleb"], data.toArray());

  data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).unless(true, (data: AnyCollection) => {
    return data.concat(["caleb"]);
  });

  this.assertSame(["michael", "tom"], data.toArray());
});

portedTest(`${ID}::testUnlessDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = (data as OverloadedView).unless(
    true,
    (data: AnyCollection) => {
      return data.concat(["caleb"]);
    },
    (data: AnyCollection) => {
      return data.concat(["taylor"]);
    },
  );

  this.assertSame(["michael", "tom", "taylor"], data.toArray());
});

portedTest(`${ID}::testUnlessEmpty`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.unlessEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame(["michael", "tom", "adam"], data.toArray());

  data = new collection();

  data = data.unlessEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame([], data.toArray());
});

portedTest(`${ID}::testUnlessEmptyDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.unlessEmpty(
    (data: AnyCollection) => {
      return data.concat(["adam"]);
    },
    (data: AnyCollection) => {
      return data.concat(["taylor"]);
    },
  );

  this.assertSame(["michael", "tom", "adam"], data.toArray());
});

portedTest(`${ID}::testUnlessNotEmpty`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.unlessNotEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame(["michael", "tom"], data.toArray());

  data = new collection();

  data = data.unlessNotEmpty((data: AnyCollection) => {
    return data.concat(["adam"]);
  });

  this.assertSame(["adam"], data.toArray());
});

portedTest(`${ID}::testUnlessNotEmptyDefault`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(["michael", "tom"]);

  data = data.unlessNotEmpty(
    (data: AnyCollection) => {
      return data.concat(["adam"]);
    },
    (data: AnyCollection) => {
      return data.concat(["taylor"]);
    },
  );

  this.assertSame(["michael", "tom", "taylor"], data.toArray());
});

portedTest(`${ID}::testWhereNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([{ name: "Taylor" }, { name: null }, { name: "Bert" }, { name: false }, { name: "" }]);

  this.assertSame(new PhpArray([[1, { name: null }]]), data.whereNull("name").all());

  this.assertSame([], data.whereNull().all());
});

portedTest(`${ID}::testWhereNullWithoutKey`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([1, null, 3, "null", false, true]);
  this.assertSame(new PhpArray([[1, null]]), collection_.whereNull().all());
});

portedTest(`${ID}::testWhereNotNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let originalData: unknown;
  const data = new collection(
    (originalData = [{ name: "Taylor" }, { name: null }, { name: "Bert" }, { name: false }, { name: "" }]),
  );

  this.assertSame(
    new PhpArray<number, unknown>([
      [0, { name: "Taylor" }],
      [2, { name: "Bert" }],
      [3, { name: false }],
      [4, { name: "" }],
    ]),
    data.whereNotNull("name").all(),
  );

  this.assertSame(originalData, data.whereNotNull().all());
});

portedTest(`${ID}::testWhereNotNullWithoutKey`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([1, null, 3, "null", false, true]);

  this.assertSame(
    new PhpArray<number, unknown>([
      [0, 1],
      [2, 3],
      [3, "null"],
      [4, false],
      [5, true],
    ]),
    data.whereNotNull().all(),
  );
});

portedTest(`${ID}::testHighOrderPercentage`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collection_ = new collection([
    { name: "Taylor", active: true },
    { name: "Nuno", active: true },
    { name: "Dries", active: false },
    { name: "Jess", active: true },
  ]);

  this.assertSame(float(75), collection_.__get("percentage").__get("active")); // adapted:DIV-9.4 adapted:DIV-12.16
});

// Story 14.4: set operations and combining, in Upstream's order.

portedTest(`${ID}::testFlatten`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  // Flat arrays are unaffected
  let c = new collection(["#foo", "#bar", "#baz"]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Nested arrays are flattened with existing flat items
  c = new collection([["#foo", "#bar"], "#baz"]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Sets of nested arrays are flattened
  c = new collection([["#foo", "#bar"], ["#baz"]]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Deeply nested arrays are flattened
  c = new collection([["#foo", ["#bar"]], ["#baz"]]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Nested collections are flattened alongside arrays
  c = new collection([new collection(["#foo", "#bar"]), ["#baz"]]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Nested collections containing plain arrays are flattened
  c = new collection([new collection(["#foo", ["#bar"]]), ["#baz"]]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Nested arrays containing collections are flattened
  c = new collection([["#foo", new collection(["#bar"])], ["#baz"]]);
  this.assertEquals(["#foo", "#bar", "#baz"], c.flatten().all());

  // Nested arrays containing collections containing arrays are flattened
  c = new collection([["#foo", new collection(["#bar", ["#zap"]])], ["#baz"]]);
  this.assertEquals(["#foo", "#bar", "#zap", "#baz"], c.flatten().all());
});

portedTest(`${ID}::testFlattenWithMixedCollectionTypes`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([new Collection(["#foo", new LazyCollection(["#bar"])]), new LazyCollection(["#baz", new Collection(["#zap"])])]);
  this.assertEquals(["#foo", "#bar", "#baz", "#zap"], c.flatten().all());
});

portedTest(`${ID}::testFlattenWithDepth`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  // No depth flattens recursively
  let c = new collection([["#foo", ["#bar", ["#baz"]]], "#zap"]);
  this.assertEquals(["#foo", "#bar", "#baz", "#zap"], c.flatten().all());

  // Specifying a depth only flattens to that depth
  c = new collection([["#foo", ["#bar", ["#baz"]]], "#zap"]);
  this.assertEquals(["#foo", ["#bar", ["#baz"]], "#zap"], c.flatten(1).all());

  c = new collection([["#foo", ["#bar", ["#baz"]]], "#zap"]);
  this.assertEquals(["#foo", "#bar", ["#baz"], "#zap"], c.flatten(2).all());
});

portedTest(`${ID}::testFlattenIgnoresKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
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

portedTest(`${ID}::testMergeNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ name: "Hello" });
  this.assertEquals({ name: "Hello" }, c.merge(null).all());
});

portedTest(`${ID}::testMergeArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ name: "Hello" });
  this.assertEquals({ name: "Hello", id: 1 }, c.merge({ id: 1 }).all());
});

portedTest(`${ID}::testMergeCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ name: "Hello" });
  this.assertEquals({ name: "World", id: 1 }, c.merge(new collection({ name: "World", id: 1 })).all());
});

portedTest(`${ID}::testMergeRecursiveNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'name': 'Hello' });
  this.assertEquals({ 'name': 'Hello' }, c.mergeRecursive(null).all());
});

portedTest(`${ID}::testMergeRecursiveArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'name': 'Hello', 'id': 1 });
  this.assertEquals({ 'name': 'Hello', 'id': [1, 2] }, c.mergeRecursive({ 'id': 2 }).all());
});

portedTest(`${ID}::testMergeRecursiveCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'name': 'Hello', 'id': 1, 'meta': { 'tags': ['a', 'b'], 'roles': 'admin' } });
  this.assertEquals(
  { 'name': 'Hello', 'id': 1, 'meta': { 'tags': ['a', 'b', 'c'], 'roles': ['admin', 'editor'] } },
  c.mergeRecursive(new collection({ 'meta': { 'tags': ['c'], 'roles': 'editor' } })).all()
  );
});

portedTest(`${ID}::testMultiplyCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection([
    "Hello",
    1,
    new PhpArray<string | number, unknown>([
      ["tags", ["a", "b"]],
      [0, "admin"],
    ]),
  ]);

  this.assertSame([], c.multiply(-1).all());
  this.assertSame([], c.multiply(0).all());

  this.assertEquals(
    [
      "Hello",
      1,
      new PhpArray<string | number, unknown>([
        ["tags", ["a", "b"]],
        [0, "admin"],
      ]),
    ],
    c.multiply(1).all(),
  );

  this.assertEquals(
    [
      "Hello",
      1,
      new PhpArray<string | number, unknown>([
        ["tags", ["a", "b"]],
        [0, "admin"],
      ]),
      "Hello",
      1,
      new PhpArray<string | number, unknown>([
        ["tags", ["a", "b"]],
        [0, "admin"],
      ]),
      "Hello",
      1,
      new PhpArray<string | number, unknown>([
        ["tags", ["a", "b"]],
        [0, "admin"],
      ]),
    ],
    c.multiply(3).all(),
  );
});

portedTest(`${ID}::testReplaceNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(['a', 'b', 'c']);
  this.assertEquals(['a', 'b', 'c'], c.replace(null).all());
});

portedTest(`${ID}::testReplaceArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(['a', 'b', 'c']);
  this.assertEquals(['a', 'd', 'e'], c.replace(new PhpArray<string | number, unknown>([[1, 'd'], [2, 'e']])).all());

  c = new collection(['a', 'b', 'c']);
  this.assertEquals(['a', 'd', 'e', 'f', 'g'], c.replace(new PhpArray<string | number, unknown>([[1, 'd'], [2, 'e'], [3, 'f'], [4, 'g']])).all());

  c = new collection({ 'name': 'amir', 'family': 'otwell' });
  this.assertEquals({ 'name': 'taylor', 'family': 'otwell', 'age': 26 }, c.replace({ 'name': 'taylor', 'age': 26 }).all());
});

portedTest(`${ID}::testReplaceCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(['a', 'b', 'c']);
  this.assertEquals(
  ['a', 'd', 'e'],
  c.replace(new collection(new PhpArray<string | number, unknown>([[1, 'd'], [2, 'e']]))).all()
  );

  c = new collection(['a', 'b', 'c']);
  this.assertEquals(
  ['a', 'd', 'e', 'f', 'g'],
  c.replace(new collection(new PhpArray<string | number, unknown>([[1, 'd'], [2, 'e'], [3, 'f'], [4, 'g']]))).all()
  );

  c = new collection({ 'name': 'amir', 'family': 'otwell' });
  this.assertEquals(
  { 'name': 'taylor', 'family': 'otwell', 'age': 26 },
  c.replace(new collection({ 'name': 'taylor', 'age': 26 })).all()
  );
});

portedTest(`${ID}::testReplaceRecursiveNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(['a', 'b', ['c', 'd']]);
  this.assertEquals(['a', 'b', ['c', 'd']], c.replaceRecursive(null).all());
});

portedTest(`${ID}::testReplaceRecursiveArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(['a', 'b', ['c', 'd']]);
  this.assertEquals(['z', 'b', ['c', 'e']], c.replaceRecursive(new PhpArray<string | number, unknown>([[0, 'z'], [2, new PhpArray<string | number, unknown>([[1, 'e']])]])).all());

  c = new collection(['a', 'b', ['c', 'd']]);
  this.assertEquals(['z', 'b', ['c', 'e'], 'f'], c.replaceRecursive(new PhpArray<string | number, unknown>([[0, 'z'], [2, new PhpArray<string | number, unknown>([[1, 'e']])], [3, 'f']])).all());
});

portedTest(`${ID}::testReplaceRecursiveCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(['a', 'b', ['c', 'd']]);
  this.assertEquals(
  ['z', 'b', ['c', 'e']],
  c.replaceRecursive(new collection(new PhpArray<string | number, unknown>([[0, 'z'], [2, new PhpArray<string | number, unknown>([[1, 'e']])]]))).all()
  );
});

portedTest(`${ID}::testUnionNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'name': 'Hello' });
  this.assertEquals({ 'name': 'Hello' }, c.union(null).all());
});

portedTest(`${ID}::testUnionArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'name': 'Hello' });
  this.assertEquals({ 'name': 'Hello', 'id': 1 }, c.union({ 'id': 1 }).all());
});

portedTest(`${ID}::testUnionCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'name': 'Hello' });
  this.assertEquals({ 'name': 'Hello', 'id': 1 }, c.union(new collection({ 'name': 'World', 'id': 1 })).all());
});

portedTest(`${ID}::testDiffCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'id': 1, 'first_word': 'Hello' });
  this.assertEquals({ 'id': 1 }, c.diff(new collection({ 'first_word': 'Hello', 'last_word': 'World' })).all());
});

portedTest(`${ID}::testDiffUsingWithCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(['en_GB', 'fr', 'HR']);

  this.assertEquals(['en_GB', 'fr', 'HR'], c.diff(new collection(['en_gb', 'hr'])).values().toArray());

  this.assertEquals(['fr'], c.diffUsing(new collection(['en_gb', 'hr']), 'strcasecmp').values().toArray());
});

portedTest(`${ID}::testDiffUsingWithNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection(['en_GB', 'fr', 'HR']);
  this.assertEquals(['en_GB', 'fr', 'HR'], c.diffUsing(null, 'strcasecmp').values().toArray());
});

portedTest(`${ID}::testDiffNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'id': 1, 'first_word': 'Hello' });
  this.assertEquals({ 'id': 1, 'first_word': 'Hello' }, c.diff(null).all());
});

portedTest(`${ID}::testDiffKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c1 = new collection({ 'id': 1, 'first_word': 'Hello' });
  const c2 = new collection({ 'id': 123, 'foo_bar': 'Hello' });
  this.assertEquals({ 'first_word': 'Hello' }, c1.diffKeys(c2).all());
});

portedTest(`${ID}::testDiffKeysUsing`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c1 = new collection({ 'id': 1, 'first_word': 'Hello' });
  const c2 = new collection({ 'ID': 123, 'foo_bar': 'Hello' });

  this.assertEquals({ 'id': 1, 'first_word': 'Hello' }, c1.diffKeys(c2).all());

  this.assertEquals({ 'first_word': 'Hello' }, c1.diffKeysUsing(c2, 'strcasecmp').all());
});

portedTest(`${ID}::testDiffAssoc`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c1 = new collection({ 'id': 1, 'first_word': 'Hello', 'not_affected': 'value' });
  const c2 = new collection({ 'id': 123, 'foo_bar': 'Hello', 'not_affected': 'value' });
  this.assertEquals({ 'id': 1, 'first_word': 'Hello' }, c1.diffAssoc(c2).all());
});

portedTest(`${ID}::testDiffAssocUsing`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c1 = new collection(new PhpArray<string | number, unknown>([['a', 'green'], ['b', 'brown'], ['c', 'blue'], [0, 'red']]));
  const c2 = new collection(new PhpArray<string | number, unknown>([['A', 'green'], [0, 'yellow'], [1, 'red']]));

  this.assertEquals(new PhpArray<string | number, unknown>([['a', 'green'], ['b', 'brown'], ['c', 'blue'], [0, 'red']]), c1.diffAssoc(c2).all());

  this.assertEquals(new PhpArray<string | number, unknown>([['b', 'brown'], ['c', 'blue'], [0, 'red']]), c1.diffAssocUsing(c2, 'strcasecmp').all());
});

portedTest(`${ID}::testIntersectNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'id': 1, 'first_word': 'Hello' });
  this.assertSame([], c.intersect(null).all());
});

portedTest(`${ID}::testIntersectCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ 'id': 1, 'first_word': 'Hello' });
  this.assertEquals({ 'first_word': 'Hello' }, c.intersect(new collection({ 'first_world': 'Hello', 'last_word': 'World' })).all());
});

portedTest(`${ID}::testIntersectUsingWithNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collect = new collection(['green', 'brown', 'blue']);

  this.assertSame([], collect.intersectUsing(null, 'strcasecmp').all());
});

portedTest(`${ID}::testIntersectUsingCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const collect = new collection(['green', 'brown', 'blue']);

  this.assertEquals(['green', 'brown'], collect.intersectUsing(new collection(['GREEN', 'brown', 'yellow']), 'strcasecmp').all());
});

portedTest(`${ID}::testIntersectAssocWithNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const array1 = new collection(
    new PhpArray<string | number, string>([
      ["a", "green"],
      ["b", "brown"],
      ["c", "blue"],
      [0, "red"],
    ]),
  );

  this.assertSame([], array1.intersectAssoc(null).all());
});

portedTest(`${ID}::testIntersectAssocCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const array1 = new collection(
    new PhpArray<string | number, string>([
      ["a", "green"],
      ["b", "brown"],
      ["c", "blue"],
      [0, "red"],
    ]),
  );
  const array2 = new collection(
    new PhpArray<string | number, string>([
      ["a", "green"],
      ["b", "yellow"],
      [0, "blue"],
      [1, "red"],
    ]),
  );

  this.assertEquals({ a: "green" }, array1.intersectAssoc(array2).all());
});

portedTest(`${ID}::testIntersectAssocUsingWithNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const array1 = new collection(new PhpArray<string | number, unknown>([['a', 'green'], ['b', 'brown'], ['c', 'blue'], [0, 'red']]));

  this.assertSame([], array1.intersectAssocUsing(null, 'strcasecmp').all());
});

portedTest(`${ID}::testIntersectAssocUsingCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const array1 = new collection(new PhpArray<string | number, unknown>([['a', 'green'], ['b', 'brown'], ['c', 'blue'], [0, 'red']]));
  const array2 = new collection(new PhpArray<string | number, unknown>([['a', 'GREEN'], ['B', 'brown'], [0, 'yellow'], [1, 'red']]));

  this.assertEquals({ 'b': 'brown' }, array1.intersectAssocUsing(array2, 'strcasecmp').all());
});

portedTest(`${ID}::testIntersectByKeysNull`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const c = new collection({ name: "Mateus", age: 18 });
  this.assertSame([], c.intersectByKeys(null).all());
});

portedTest(`${ID}::testIntersectByKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection({ name: "Mateus", age: 18 });
  this.assertEquals({ name: "Mateus" }, c.intersectByKeys(new collection({ name: "Mateus", surname: "Guimaraes" })).all());

  c = new collection({ name: "taylor", family: "otwell", age: 26 });
  this.assertEquals({ name: "taylor", family: "otwell" }, c.intersectByKeys(new collection({ height: 180, name: "amir", family: "moharami" })).all());
});

portedTest(`${ID}::testCollapse`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  // Normal case: a two-dimensional array with different elements
  let object1: stdClass;
  let object2: stdClass;
  let data = new collection([[(object1 = new stdClass())], [(object2 = new stdClass())]]);
  this.assertEquals([object1, object2], data.collapse().all());

  // Case including numeric and string elements
  data = new collection([[1], [2], [3], ["foo", "bar"], new collection(["baz", "boom"])]);
  this.assertEquals([1, 2, 3, "foo", "bar", "baz", "boom"], data.collapse().all());

  // Case with empty two-dimensional arrays
  data = new collection([[], [], []]);
  this.assertSame([], data.collapse().all());

  // Case with both empty arrays and arrays with elements
  data = new collection([[], [1, 2], [], ["foo", "bar"]]);
  this.assertEquals([1, 2, "foo", "bar"], data.collapse().all());

  // Case including collections and arrays
  const collection_ = new collection(["baz", "boom"]);
  data = new collection([[1], [2], [3], ["foo", "bar"], collection_]);
  this.assertEquals([1, 2, 3, "foo", "bar", "baz", "boom"], data.collapse().all());
});

portedTest(`${ID}::testCollapseWithNestedCollections`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new collection([1, 2, 3]), new collection([4, 5, 6])]);
  this.assertEquals([1, 2, 3, 4, 5, 6], data.collapse().all());
});

portedTest(`${ID}::testCollapseWithMixedCollectionTypes`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new Collection([1, 2]), new LazyCollection([3, 4]), [5]]);
  this.assertEquals([1, 2, 3, 4, 5], data.collapse().all());
});

portedTest(`${ID}::testCollapseWithKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([new PhpArray<string | number, unknown>([[1, 'a']]), new PhpArray<string | number, unknown>([[3, 'c']]), new PhpArray<string | number, unknown>([[2, 'b']]), 'drop']);
  this.assertEquals(new PhpArray<string | number, unknown>([[1, 'a'], [3, 'c'], [2, 'b']]), data.collapseWithKeys().all());


  data = new collection(['a', 'b', 'c']);
  this.assertSame([], data.collapseWithKeys().all());
});

portedTest(`${ID}::testCollapseWithKeysOnNestedCollections`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new collection({ 'a': '1a', 'b': '1b' }), new collection({ 'b': '2b', 'c': '2c' }), 'drop']);
  this.assertEquals({ 'a': '1a', 'b': '2b', 'c': '2c' }, data.collapseWithKeys().all());
});

portedTest(`${ID}::testCollapseWithKeysWithMixedCollectionTypes`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection([new Collection({ 'a': 1, 'b': 2 }), new LazyCollection({ 'b': 3, 'c': 4 })]);
  this.assertEquals({ 'a': 1, 'b': 3, 'c': 4 }, data.collapseWithKeys().all());
});

portedTest(`${ID}::testCollapseWithKeysWithStringKeys`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection({ 'first': { 'a': 1, 'b': 2 }, 'second': { 'c': 3 } });
  this.assertSame({ 'a': 1, 'b': 2, 'c': 3 }, data.collapseWithKeys().all());


  data = new collection(new PhpArray<string | number, unknown>([[5, { 'a': 1 }], ['second', new collection({ 'b': 2, 'a': 3 })]]));
  this.assertSame({ 'a': 3, 'b': 2 }, data.collapseWithKeys().all());
});

portedTest(`${ID}::testJoin`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertSame("a, b, c", new collection(["a", "b", "c"]).join(", "));

  this.assertSame("a, b and c", new collection(["a", "b", "c"]).join(", ", " and "));

  this.assertSame("a and b", new collection(["a", "b"]).join(", ", " and "));

  this.assertSame("a", new collection(["a"]).join(", ", " and "));

  this.assertSame("", new collection([]).join(", ", " and "));
});

portedTest(`${ID}::testCrossJoin`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  // Cross join with an array
  this.assertEquals(
    [
      [1, "a"],
      [1, "b"],
      [2, "a"],
      [2, "b"],
    ],
    new collection([1, 2]).crossJoin(["a", "b"]).all(),
  );

  // Cross join with a collection
  this.assertEquals(
    [
      [1, "a"],
      [1, "b"],
      [2, "a"],
      [2, "b"],
    ],
    new collection([1, 2]).crossJoin(new collection(["a", "b"])).all(),
  );

  // Cross join with 2 collections
  this.assertEquals(
    [
      [1, "a", "I"],
      [1, "a", "II"],
      [1, "b", "I"],
      [1, "b", "II"],
      [2, "a", "I"],
      [2, "a", "II"],
      [2, "b", "I"],
      [2, "b", "II"],
    ],
    new collection([1, 2]).crossJoin(new collection(["a", "b"]), new collection(["I", "II"])).all(),
  );
});

portedTest(`${ID}::testFlip`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.assertSame([], (new collection()).flip().all());
  this.assertSame({ 'taylor': 'name' }, (new collection({ 'name': 'taylor' })).flip().all());

  const data = new collection({ 'name': 'taylor', 'framework': 'laravel' });
  this.assertEquals({ 'taylor': 'name', 'laravel': 'framework' }, data.flip().toArray());
});

portedTest(`${ID}::testFlipSkipsUnsupportedValues`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = new collection({ 'string': 'taylor', 'integer': 1, 'null': null, 'false': false, 'true': true, 'float': 1.5, 'array': [], 'object': new stdClass() });

  this.assertSame(new PhpArray<string | number, unknown>([['taylor', 'string'], [1, 'integer']]), data.flip().all());
});

portedTest(`${ID}::testImplode`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([
    { name: "taylor", email: "foo" },
    { name: "dayle", email: "bar" },
  ]);
  this.assertSame("foobar", data.implode("email"));
  this.assertSame("foo,bar", data.implode("email", ","));

  data = new collection(["taylor", "dayle"]);
  this.assertSame("taylordayle", data.implode(""));
  this.assertSame("taylor,dayle", data.implode(","));

  data = new collection([
    { name: new Stringable("taylor"), email: new Stringable("foo") },
    { name: new Stringable("dayle"), email: new Stringable("bar") },
  ]);
  this.assertSame("foobar", data.implode("email"));
  this.assertSame("foo,bar", data.implode("email", ","));

  data = new collection([new Stringable("taylor"), new Stringable("dayle")]);
  this.assertSame("taylordayle", data.implode(""));
  this.assertSame("taylor,dayle", data.implode(","));
  this.assertSame("taylor_dayle", data.implode("_"));

  data = new collection([
    { name: "taylor", email: "foo" },
    { name: "dayle", email: "bar" },
  ]);
  this.assertSame(
    "taylor-foodayle-bar",
    data.implode((user: Record<string, unknown>) => toPhpString(user["name"]) + "-" + toPhpString(user["email"])),
  );
  this.assertSame(
    "taylor-foo,dayle-bar",
    data.implode((user: Record<string, unknown>) => toPhpString(user["name"]) + "-" + toPhpString(user["email"]), ","),
  );
});

portedTest(`${ID}::testImplodeModels`, { case: SupportCollectionBlockedByDatabaseTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const model = new (class extends Model {})();
  model.setAttribute("email", "foo");
  const modelTwo = new (class extends Model {})();
  modelTwo.setAttribute("email", "bar");
  const data = new collection([model, modelTwo]);

  this.assertSame("foobar", data.implode("email"));
  this.assertSame("foo,bar", data.implode("email", ","));
});

portedTest(`${ID}::testZip`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 2, 3]);
  c = c.zip(new collection([4, 5, 6]));
  this.assertInstanceOf(collection, c);
  this.assertInstanceOf(collection, c.get(0));
  this.assertInstanceOf(collection, c.get(1));
  this.assertInstanceOf(collection, c.get(2));
  this.assertCount(3, c);
  this.assertEquals([1, 4], (c.get(0) as AnyCollection).all());
  this.assertEquals([2, 5], (c.get(1) as AnyCollection).all());
  this.assertEquals([3, 6], (c.get(2) as AnyCollection).all());

  c = new collection([1, 2, 3]);
  c = c.zip([4, 5, 6], [7, 8, 9]);
  this.assertCount(3, c);
  this.assertEquals([1, 4, 7], (c.get(0) as AnyCollection).all());
  this.assertEquals([2, 5, 8], (c.get(1) as AnyCollection).all());
  this.assertEquals([3, 6, 9], (c.get(2) as AnyCollection).all());

  c = new collection([1, 2, 3]);
  c = c.zip([4, 5, 6], [7]);
  this.assertCount(3, c);
  this.assertEquals([1, 4, 7], (c.get(0) as AnyCollection).all());
  this.assertEquals([2, 5, null], (c.get(1) as AnyCollection).all());
  this.assertEquals([3, 6, null], (c.get(2) as AnyCollection).all());
});

portedTest(`${ID}::testPadPadsArrayWithValue`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 2, 3]);
  c = c.pad(4, 0);
  this.assertEquals([1, 2, 3, 0], c.all());

  c = new collection([1, 2, 3, 4, 5]);
  c = c.pad(4, 0);
  this.assertEquals([1, 2, 3, 4, 5], c.all());

  c = new collection([1, 2, 3]);
  c = c.pad(-4, 0);
  this.assertEquals([0, 1, 2, 3], c.all());

  c = new collection([1, 2, 3, 4, 5]);
  c = c.pad(-4, 0);
  this.assertEquals([1, 2, 3, 4, 5], c.all());
});

portedTest(`${ID}::testCombineWithArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([1, 2, 3]);
  let actual = c.combine([4, 5, 6]).toArray();
  let expected: unknown = new PhpArray<number, number>([
    [1, 4],
    [2, 5],
    [3, 6],
  ]);

  this.assertSame(expected, actual);

  c = new collection(["name", "family"]);
  actual = c
    .combine(
      new PhpArray<number, string>([
        [1, "taylor"],
        [2, "otwell"],
      ]),
    )
    .toArray();
  expected = {
    name: "taylor",
    family: "otwell",
  };

  this.assertSame(expected, actual);

  c = new collection(
    new PhpArray<number, string>([
      [1, "name"],
      [2, "family"],
    ]),
  );
  actual = c.combine(["taylor", "otwell"]).toArray();
  expected = {
    name: "taylor",
    family: "otwell",
  };

  this.assertSame(expected, actual);

  c = new collection(
    new PhpArray<number, string>([
      [1, "name"],
      [2, "family"],
    ]),
  );
  actual = c
    .combine(
      new PhpArray<number, string>([
        [2, "taylor"],
        [3, "otwell"],
      ]),
    )
    .toArray();
  expected = {
    name: "taylor",
    family: "otwell",
  };

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testCombineWithCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const expected = new PhpArray<number, number>([
    [1, 4],
    [2, 5],
    [3, 6],
  ]);

  const keyCollection = new collection(array_keys(expected));
  const valueCollection = new collection(array_values(expected));
  const actual = keyCollection.combine(valueCollection).toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testCombineWithFewerValuesThanKeysThrows`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(ValueError);

  new collection([1, 2]).combine([3]).all();
});

portedTest(`${ID}::testCombineWithMoreValuesThanKeysThrows`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  this.expectException(ValueError);

  new collection([1]).combine([2, 3]).all();
});

portedTest(`${ID}::testConcatWithArray`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const expected = [4, 5, 6, "a", "b", "c", "Jonny", "from", "Laroe", "Jonny", "from", "Laroe"];

  let data = new collection([4, 5, 6]);
  data = data.concat(["a", "b", "c"]);
  data = data.concat({ who: "Jonny", preposition: "from", where: "Laroe" });
  const actual = data.concat({ who: "Jonny", preposition: "from", where: "Laroe" }).toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testConcatWithCollection`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const expected = [4, 5, 6, "a", "b", "c", "Jonny", "from", "Laroe", "Jonny", "from", "Laroe"];

  let firstCollection = new collection([4, 5, 6]);
  const secondCollection = new collection(["a", "b", "c"]);
  const thirdCollection = new collection({ who: "Jonny", preposition: "from", where: "Laroe" });
  firstCollection = firstCollection.concat(secondCollection);
  firstCollection = firstCollection.concat(thirdCollection);
  const actual = firstCollection.concat(thirdCollection).toArray();

  this.assertSame(expected, actual);
});

portedTest(`${ID}::testUndot`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection
    .make({
      name: "Taylor",
      "meta.foo": "bar",
      "meta.baz": "boom",
      "meta.bam.boom": "bip",
    })
    .undot();
  this.assertSame(
    {
      name: "Taylor",
      meta: {
        foo: "bar",
        baz: "boom",
        bam: {
          boom: "bip",
        },
      },
    },
    data.all(),
  );

  data = collection
    .make({
      "foo.0": "bar",
      "foo.1": "baz",
      "foo.baz": "boom",
    })
    .undot();
  this.assertSame(
    {
      foo: new PhpArray<number | string, string>([
        [0, "bar"],
        [1, "baz"],
        ["baz", "boom"],
      ]),
    },
    data.all(),
  );
});

portedTest(`${ID}::testDot`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = collection
    .make({
      name: "Taylor",
      meta: {
        foo: "bar",
        baz: "boom",
        bam: {
          boom: "bip",
        },
      },
    })
    .dot();
  this.assertSame(
    {
      name: "Taylor",
      "meta.foo": "bar",
      "meta.baz": "boom",
      "meta.bam.boom": "bip",
    },
    data.all(),
  );

  data = collection
    .make({
      foo: new PhpArray<number | string, string>([
        [0, "bar"],
        [1, "baz"],
        ["baz", "boom"],
      ]),
    })
    .dot();
  this.assertSame(
    {
      "foo.0": "bar",
      "foo.1": "baz",
      "foo.baz": "boom",
    },
    data.all(),
  );
});

portedTest(`${ID}::testDotWithDepth`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const data = collection
    .make({
      name: "Taylor",
      meta: {
        foo: "bar",
        bam: {
          boom: "bip",
        },
      },
    })
    .dot(1);
  this.assertSame(
    {
      name: "Taylor",
      "meta.foo": "bar",
      "meta.bam": {
        boom: "bip",
      },
    },
    data.all(),
  );
});

// Story 14.5, in Upstream order.
// Illuminate\Tests\Support\SupportCollectionTest::testSliding#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSliding#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testCountByStandalone`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(['foo', 'foo', 'foo', 'bar', 'bar', 'foobar']);
  this.assertEquals({ foo: 3, bar: 2, foobar: 1 }, c.countBy().all()); // adapted:DIV-9.2
  c = new collection([true, true, false, false, false]);
  this.assertEquals(new PhpArray<any, unknown>([[true, 2], [false, 3]]), c.countBy().all()); // adapted:DIV-9.2
  c = new collection([1, 5, 1, 5, 5, 1]);
  this.assertEquals(new PhpArray<any, unknown>([[1, 3], [5, 3]]), c.countBy().all()); // adapted:DIV-9.2
  c = new collection([StaffEnum.James, StaffEnum.Joe, StaffEnum.Taylor]);
  this.assertEquals({ James: 1, Joe: 1, Taylor: 1 }, c.countBy().all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testCountByWithKey`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([{ key: 'a' }, { key: 'a' }, { key: 'a' }, { key: 'a' }, { key: 'b' }, { key: 'b' }, { key: 'b' }]);
  this.assertEquals({ a: 4, b: 3 }, c.countBy('key').all()); // adapted:DIV-9.2
  c = new collection([{ key: TestBackedEnum.A }, { key: TestBackedEnum.B }, { key: TestBackedEnum.B }]);
  this.assertEquals(new PhpArray<any, unknown>([[1, 1], [2, 2]]), c.countBy('key').all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testEach`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const original = new PhpArray<any, unknown>([[0, 1], [1, 2], ["foo", "bar"], ["bam", "baz"]]);
  const c = new collection(original);
  let result = new PhpArray<any, unknown>();
  c.each((item: unknown, key: any) => { result.set(key, item); });
  this.assertEquals(original, result);
  result = new PhpArray<any, unknown>();
  c.each((item: unknown, key: any) => {
    result.set(key, item);
    if (typeof key === "string") { return false; }
    return null;
  });
  this.assertEquals(new PhpArray<any, unknown>([[0, 1], [1, 2], ["foo", "bar"]]), result); // adapted:DIV-9.2
});

// Illuminate\\Tests\\Support\\SupportCollectionTest::testEachSpread#0: held whole under ESC-14.5-3.
// Illuminate\\Tests\\Support\\SupportCollectionTest::testEachSpread#1: held whole under ESC-14.5-3.

portedTest(`${ID}::testSort`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([5, 3, 1, 2, 4]).sort();
  this.assertEquals([1, 2, 3, 4, 5], data.values().all()); // adapted:DIV-9.2
  data = new collection([-1, -3, -2, -4, -5, 0, 5, 3, 1, 2, 4]).sort();
  this.assertEquals([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5], data.values().all()); // adapted:DIV-9.2
  data = new collection(['foo', 'bar-10', 'bar-1']).sort();
  this.assertEquals(['bar-1', 'bar-10', 'foo'], data.values().all()); // adapted:DIV-9.2
  data = new collection(['T2', 'T1', 'T10']).sort();
  this.assertEquals(['T1', 'T10', 'T2'], data.values().all()); // adapted:DIV-9.2
  data = new collection(['T2', 'T1', 'T10']).sort(SORT_NATURAL);
  this.assertEquals(['T1', 'T2', 'T10'], data.values().all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortDesc`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([5, 3, 1, 2, 4]).sortDesc();
  this.assertEquals([5, 4, 3, 2, 1], data.values().all()); // adapted:DIV-9.2
  data = new collection([-1, -3, -2, -4, -5, 0, 5, 3, 1, 2, 4]).sortDesc();
  this.assertEquals([5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5], data.values().all()); // adapted:DIV-9.2
  data = new collection(['bar-1', 'foo', 'bar-10']).sortDesc();
  this.assertEquals(['foo', 'bar-10', 'bar-1'], data.values().all()); // adapted:DIV-9.2
  data = new collection(['T2', 'T1', 'T10']).sortDesc();
  this.assertEquals(['T2', 'T10', 'T1'], data.values().all()); // adapted:DIV-9.2
  data = new collection(['T2', 'T1', 'T10']).sortDesc(SORT_NATURAL);
  this.assertEquals(['T10', 'T2', 'T1'], data.values().all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortWithCallback`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([5, 3, 1, 2, 4]).sort((a: any, b: any) => spaceship(a, b));
  this.assertEquals(phpRange(1, 5), array_values(data.all()));
});

portedTest(`${ID}::testSortBy`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(['taylor', 'dayle']);
  data = data.sortBy((x: any) => x);
  this.assertEquals(['dayle', 'taylor'], array_values(data.all())); // adapted:DIV-9.2
  data = new collection(['dayle', 'taylor']);
  data = data.sortBy((x: any) => x, SORT_REGULAR, SortDirection.Descending);
  this.assertEquals(['taylor', 'dayle'], array_values(data.all())); // adapted:DIV-9.2
  data = new collection(['dayle', 'taylor']);
  data = data.sortByDesc((x: any) => x);
  this.assertEquals(['taylor', 'dayle'], array_values(data.all())); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortByString`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ name: 'taylor' }, { name: 'dayle' }]);
  data = data.sortBy('name', SORT_STRING);
  this.assertEquals([{ name: 'dayle' }, { name: 'taylor' }], array_values(data.all())); // adapted:DIV-9.2
  data = new collection([{ name: 'taylor' }, { name: 'dayle' }]);
  data = data.sortBy('name', SORT_STRING, true);
  this.assertEquals([{ name: 'taylor' }, { name: 'dayle' }], array_values(data.all())); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortByCallableString`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ sort: 2 }, { sort: 1 }]);
  data = data.sortBy([['sort', 'asc']]);
  this.assertEquals([{ sort: 1 }, { sort: 2 }], array_values(data.all())); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortByCallableStringDesc`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }]);
  data = data.sortByDesc(['id']);
  this.assertEquals([{ id: 2, name: 'bar' }, { id: 1, name: 'foo' }], array_values(data.all())); // adapted:DIV-9.2
  data = new collection([{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }, { id: 2, name: 'baz' }]);
  data = data.sortByDesc(['id']);
  this.assertEquals([{ id: 2, name: 'bar' }, { id: 2, name: 'baz' }, { id: 1, name: 'foo' }], array_values(data.all())); // adapted:DIV-9.2
  data = data.sortByDesc(['id', 'name']);
  this.assertEquals([{ id: 2, name: 'baz' }, { id: 2, name: 'bar' }, { id: 1, name: 'foo' }], array_values(data.all())); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortByAlwaysReturnsAssoc`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection({ a: 'taylor', b: 'dayle' });
  data = data.sortBy((x: any) => x);
  this.assertEquals({ b: 'dayle', a: 'taylor' }, data.all()); // adapted:DIV-9.2
  data = new collection(['taylor', 'dayle']);
  data = data.sortBy((x: any) => x);
  this.assertEquals(new PhpArray<any, unknown>([[1, 'dayle'], [0, 'taylor']]), data.all()); // adapted:DIV-9.2
  data = new collection({ a: { sort: 2 }, b: { sort: 1 } });
  data = data.sortBy([['sort', 'asc']]);
  this.assertEquals({ b: { sort: 1 }, a: { sort: 2 } }, data.all()); // adapted:DIV-9.2
  data = new collection([{ sort: 2 }, { sort: 1 }]);
  data = data.sortBy([['sort', 'asc']]);
  this.assertEquals(new PhpArray<any, unknown>([[1, { sort: 1 }], [0, { sort: 2 }]]), data.all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testSortByManyWithNumericFlagComparesFractionalValues`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ price: 1.5 }, { price: '10.5' }, { price: 1.2 }, { price: '10.2' }, { price: 1.9 }]);
  this.assertSame([1.2, 1.5, 1.9, '10.2', '10.5'], data.sortBy([['price', 'asc']], SORT_NUMERIC).pluck('price').values().all()); // adapted:DIV-9.2
  this.assertSame(['10.5', '10.2', 1.9, 1.5, 1.2], data.sortBy([['price', 'desc']], SORT_NUMERIC).pluck('price').values().all()); // adapted:DIV-9.2
  this.assertSame(data.sortBy('price', SORT_NUMERIC).pluck('price').values().all(), data.sortBy([['price', 'asc']], SORT_NUMERIC).pluck('price').values().all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testSortByMany#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSortByMany#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testNaturalSortByManyWithNull`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let itemFoo = new stdClass();
  itemFoo.first = 'f';
  itemFoo.second = null;
  let itemBar = new stdClass();
  itemBar.first = 'f';
  itemBar.second = 's';
  let data = new collection([itemFoo, itemBar]);
  data = data.sortBy([['first', 'desc'], ['second', 'desc']], SORT_NATURAL);
  this.assertEquals(itemBar, data.first());
  this.assertEquals(itemFoo, data.skip(1).first());
});

// Illuminate\Tests\Support\SupportCollectionTest::testSortKeys#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSortKeys#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSortKeysDesc#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSortKeysDesc#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSortKeysUsing#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSortKeysUsing#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testReverse`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(['zaeed', 'alan']);
  let reversed = data.reverse();
  this.assertSame(new PhpArray<any, unknown>([[1, 'alan'], [0, 'zaeed']]), reversed.all()); // adapted:DIV-9.2
  data = new collection({ name: 'taylor', framework: 'laravel' });
  reversed = data.reverse();
  this.assertSame({ framework: 'laravel', name: 'taylor' }, reversed.all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testChunk#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunk#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhenGivenZeroAsSize#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhenGivenZeroAsSize#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhenGivenLessThanZero#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhenGivenLessThanZero#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkPreservingKeys#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkPreservingKeys#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitIn#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitIn#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhileOnEqualElements#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhileOnEqualElements#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhileOnContiguouslyIncreasingIntegers#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhileOnContiguouslyIncreasingIntegers#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhilePreservingStringKeys#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkWhilePreservingStringKeys#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithCallback#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithCallback#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithStringKey#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithStringKey#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkByPreservesKeys#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkByPreservesKeys#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithDotNotation#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithDotNotation#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithEmptyCollection#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithEmptyCollection#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithSingleItem#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testChunkByWithSingleItem#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMap#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMap#1: held whole under ESC-14.5-1.

// Illuminate\\Tests\\Support\\SupportCollectionTest::testMapSpread#0: held whole under ESC-14.5-3.
// Illuminate\\Tests\\Support\\SupportCollectionTest::testMapSpread#1: held whole under ESC-14.5-3.

portedTest(`${ID}::testFlatMap`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ name: 'taylor', hobbies: ['programming', 'basketball'] }, { name: 'adam', hobbies: ['music', 'powerlifting'] }]);
  data = data.flatMap((person: any) => person['hobbies']);
  this.assertEquals(['programming', 'basketball', 'music', 'powerlifting'], data.all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testMapToDictionary#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapToDictionary#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMapToDictionaryWithNumericKeys#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapToDictionaryWithNumericKeys#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMapToGroups#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapToGroups#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMapToGroupsWithNumericKeys#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapToGroupsWithNumericKeys#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testMapWithKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ name: 'Blastoise', type: 'Water', idx: 9 }, { name: 'Charmander', type: 'Fire', idx: 4 }, { name: 'Dragonair', type: 'Dragon', idx: 148 }]);
  data = data.mapWithKeys((pokemon: any) => new PhpArray<any, unknown>([[pokemon['name'], pokemon['type']]]));
  this.assertEquals({ Blastoise: 'Water', Charmander: 'Fire', Dragonair: 'Dragon' }, data.all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testMapWithKeysIntegerKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ id: 1, name: 'A' }, { id: 3, name: 'B' }, { id: 2, name: 'C' }]);
  data = data.mapWithKeys((item: any) => new PhpArray<any, unknown>([[item['id'], item]]));
  this.assertSame([1, 3, 2], data.keys().all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testMapWithKeysMultipleRows`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]);
  data = data.mapWithKeys((item: any) => new PhpArray<any, unknown>([[item['id'], item['name']], [item['name'], item['id']]]));
  this.assertSame(new PhpArray<any, unknown>([[1, 'A'], ['A', 1], [2, 'B'], ['B', 2], [3, 'C'], ['C', 3]]), data.all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testMapWithKeysCallbackKey`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(new PhpArray<any, unknown>([[3, { id: 1, name: 'A' }], [5, { id: 3, name: 'B' }], [4, { id: 2, name: 'C' }]]));
  data = data.mapWithKeys((item: any, key: any) => new PhpArray<any, unknown>([[key, item['id']]]));
  this.assertSame([3, 5, 4], data.keys().all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testMapInto#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapInto#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMapIntoWithIntBackedEnums#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapIntoWithIntBackedEnums#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMapIntoWithStringBackedEnums#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMapIntoWithStringBackedEnums#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitThrowsExceptionForInvalidNumberOfGroups#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitThrowsExceptionForInvalidNumberOfGroups#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitThrowsExceptionForNegativeNumberOfGroups#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitThrowsExceptionForNegativeNumberOfGroups#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitInThrowsExceptionForInvalidNumberOfGroups#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitInThrowsExceptionForInvalidNumberOfGroups#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitInThrowsExceptionForNegativeNumberOfGroups#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitInThrowsExceptionForNegativeNumberOfGroups#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testMapWithKeysOverwritingKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 1, name: 'C' }]);
  data = data.mapWithKeys((item: any) => new PhpArray<any, unknown>([[item['id'], item['name']]]));
  this.assertSame(new PhpArray<any, unknown>([[1, 'C'], [2, 'B']]), data.all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testTransform: held whole under ESC-14.5-1.

portedTest(`${ID}::testGroupByAttribute`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ rating: 1, url: '1' }, { rating: 1, url: '1' }, { rating: 2, url: '2' }]);
  let result = data.groupBy('rating');
  this.assertEquals(new PhpArray<any, unknown>([[1, [{ rating: 1, url: '1' }, { rating: 1, url: '1' }]], [2, [{ rating: 2, url: '2' }]]]), result.toArray()); // adapted:DIV-9.2
  result = data.groupBy('url');
  this.assertEquals(new PhpArray<any, unknown>([[1, [{ rating: 1, url: '1' }, { rating: 1, url: '1' }]], [2, [{ rating: 2, url: '2' }]]]), result.toArray()); // adapted:DIV-9.2
});

portedTest(`${ID}::testGroupByAttributeWithStringableKey`, { case: SupportCollectionBlockedBySupportTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  const payload = [
    { name: new Stringable("Laravel"), url: "1" },
    { name: new HtmlString("Laravel"), url: "1" },
    { name: new (class {
      toString(): string { return "Framework"; }
      [Symbol.toPrimitive](): string { return this.toString(); }
    })(), url: "2" },
  ];
  const data = new collection(payload);
  let result = data.groupBy("name");
  this.assertEquals({ Laravel: [payload[0], payload[1]], Framework: [payload[2]] }, result.toArray()); // adapted:DIV-9.2
  result = data.groupBy("url");
  this.assertEquals(new PhpArray<any, unknown>([[1, [payload[0], payload[1]]], [2, [payload[2]]]]), result.toArray()); // adapted:DIV-9.2
});

portedTest(`${ID}::testGroupByAttributeWithEnumKey`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let payload: any;
  let data = new collection(payload = [{ name: TestEnum.A, url: '1' }, { name: TestBackedEnum.A, url: '1' }, { name: TestStringBackedEnum.A, url: '2' }]);
  let result = data.groupBy('name');
  this.assertEquals(new PhpArray<any, unknown>([['A', [payload[0], payload[2]]], ['1', [payload[1]]]]), result.toArray()); // adapted:DIV-9.2
  result = data.groupBy('url');
  this.assertEquals(new PhpArray<any, unknown>([['1', [payload[0], payload[1]]], ['2', [payload[2]]]]), result.toArray()); // adapted:DIV-9.2
});

// Illuminate\\Tests\\Support\\SupportCollectionTest::testGroupByCallable#0: held whole under ESC-14.5-3.
// Illuminate\\Tests\\Support\\SupportCollectionTest::testGroupByCallable#1: held whole under ESC-14.5-3.

portedTest(`${ID}::testGroupByAttributeWithBackedEnumKey`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ rating: TestBackedEnum.A, url: '1' }, { rating: TestBackedEnum.B, url: '1' }]);
  let result = data.groupBy('rating');
  this.assertEquals(new PhpArray<any, unknown>([[TestBackedEnum.A.value, [{ rating: TestBackedEnum.A, url: '1' }]], [TestBackedEnum.B.value, [{ rating: TestBackedEnum.B, url: '1' }]]]), result.toArray()); // adapted:DIV-9.2
});

portedTest(`${ID}::testGroupByAttributePreservingKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(new PhpArray<any, unknown>([[10, { rating: 1, url: '1' }], [20, { rating: 1, url: '1' }], [30, { rating: 2, url: '2' }]]));
  let result = data.groupBy('rating', true);
  let expected_result = new PhpArray<any, unknown>([[1, new PhpArray<any, unknown>([[10, { rating: 1, url: '1' }], [20, { rating: 1, url: '1' }]])], [2, new PhpArray<any, unknown>([[30, { rating: 2, url: '2' }]])]]);
  this.assertEquals(expected_result, result.toArray());
});

portedTest(`${ID}::testGroupByClosureWhereItemsHaveSingleGroup`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ rating: 1, url: '1' }, { rating: 1, url: '1' }, { rating: 2, url: '2' }]);
  let result = data.groupBy((item: any) => item['rating']);
  this.assertEquals(new PhpArray<any, unknown>([[1, [{ rating: 1, url: '1' }, { rating: 1, url: '1' }]], [2, [{ rating: 2, url: '2' }]]]), result.toArray()); // adapted:DIV-9.2
});

portedTest(`${ID}::testGroupByClosureWhereItemsHaveSingleGroupPreservingKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(new PhpArray<any, unknown>([[10, { rating: 1, url: '1' }], [20, { rating: 1, url: '1' }], [30, { rating: 2, url: '2' }]]));
  let result = data.groupBy((item: any) => item['rating'], true);
  let expected_result = new PhpArray<any, unknown>([[1, new PhpArray<any, unknown>([[10, { rating: 1, url: '1' }], [20, { rating: 1, url: '1' }]])], [2, new PhpArray<any, unknown>([[30, { rating: 2, url: '2' }]])]]);
  this.assertEquals(expected_result, result.toArray());
});

portedTest(`${ID}::testGroupByClosureWhereItemsHaveMultipleGroups`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ user: 1, roles: ['Role_1', 'Role_3'] }, { user: 2, roles: ['Role_1', 'Role_2'] }, { user: 3, roles: ['Role_1'] }]);
  let result = data.groupBy((item: any) => item['roles']);
  let expected_result = { Role_1: [{ user: 1, roles: ['Role_1', 'Role_3'] }, { user: 2, roles: ['Role_1', 'Role_2'] }, { user: 3, roles: ['Role_1'] }], Role_2: [{ user: 2, roles: ['Role_1', 'Role_2'] }], Role_3: [{ user: 1, roles: ['Role_1', 'Role_3'] }] };
  this.assertEquals(expected_result, result.toArray());
});

portedTest(`${ID}::testGroupByClosureWhereItemsHaveMultipleGroupsPreservingKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(new PhpArray<any, unknown>([[10, { user: 1, roles: ['Role_1', 'Role_3'] }], [20, { user: 2, roles: ['Role_1', 'Role_2'] }], [30, { user: 3, roles: ['Role_1'] }]]));
  let result = data.groupBy((item: any) => item['roles'], true);
  let expected_result = { Role_1: new PhpArray<any, unknown>([[10, { user: 1, roles: ['Role_1', 'Role_3'] }], [20, { user: 2, roles: ['Role_1', 'Role_2'] }], [30, { user: 3, roles: ['Role_1'] }]]), Role_2: new PhpArray<any, unknown>([[20, { user: 2, roles: ['Role_1', 'Role_2'] }]]), Role_3: new PhpArray<any, unknown>([[10, { user: 1, roles: ['Role_1', 'Role_3'] }]]) };
  this.assertEquals(expected_result, result.toArray());
});

portedTest(`${ID}::testGroupByMultiLevelAndClosurePreservingKeys`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(new PhpArray<any, unknown>([[10, { user: 1, skilllevel: 1, roles: ['Role_1', 'Role_3'] }], [20, { user: 2, skilllevel: 1, roles: ['Role_1', 'Role_2'] }], [30, { user: 3, skilllevel: 2, roles: ['Role_1'] }], [40, { user: 4, skilllevel: 2, roles: ['Role_2'] }]]));
  let result = data.groupBy(['skilllevel', (item: any) => item['roles']], true);
  let expected_result = new PhpArray<any, unknown>([[1, { Role_1: new PhpArray<any, unknown>([[10, { user: 1, skilllevel: 1, roles: ['Role_1', 'Role_3'] }], [20, { user: 2, skilllevel: 1, roles: ['Role_1', 'Role_2'] }]]), Role_3: new PhpArray<any, unknown>([[10, { user: 1, skilllevel: 1, roles: ['Role_1', 'Role_3'] }]]), Role_2: new PhpArray<any, unknown>([[20, { user: 2, skilllevel: 1, roles: ['Role_1', 'Role_2'] }]]) }], [2, { Role_1: new PhpArray<any, unknown>([[30, { user: 3, skilllevel: 2, roles: ['Role_1'] }]]), Role_2: new PhpArray<any, unknown>([[40, { user: 4, skilllevel: 2, roles: ['Role_2'] }]]) }]]);
  this.assertEquals(expected_result, result.toArray());
});

portedTest(`${ID}::testGroupByNull`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let payload: any;
  let data = new collection(payload = [{ name: 'a', url: '1' }, { name: 'b', url: null }, { name: 'c', url: null }]);
  let result = data.groupBy('url');
  this.assertEquals(new PhpArray<any, unknown>([['1', [payload[0]]], ['', [payload[1], payload[2]]]]), result.toArray()); // adapted:DIV-9.2
});

portedTest(`${ID}::testKeyByAttribute`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ rating: 1, name: '1' }, { rating: 2, name: '2' }, { rating: 3, name: '3' }]);
  let result = data.keyBy('rating');
  this.assertEquals(new PhpArray<any, unknown>([[1, { rating: 1, name: '1' }], [2, { rating: 2, name: '2' }], [3, { rating: 3, name: '3' }]]), result.all()); // adapted:DIV-9.2
  result = data.keyBy((item: any) => item['rating'] * 2);
  this.assertEquals(new PhpArray<any, unknown>([[2, { rating: 1, name: '1' }], [4, { rating: 2, name: '2' }], [6, { rating: 3, name: '3' }]]), result.all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testKeyByBackedEnum`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ id: 1, status: TestStringBackedEnum.A }, { id: 2, status: TestStringBackedEnum.B }]);
  this.assertEquals(new PhpArray<any, unknown>([[TestStringBackedEnum.A.value, { id: 1, status: TestStringBackedEnum.A }], [TestStringBackedEnum.B.value, { id: 2, status: TestStringBackedEnum.B }]]), data.keyBy('status').all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testKeyByClosure#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testKeyByClosure#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testKeyByObject`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ firstname: 'Taylor', lastname: 'Otwell', locale: 'US' }, { firstname: 'Lucas', lastname: 'Michot', locale: 'FR' }]);
  let result = data.keyBy((item: any, key: any) => new collection([key, item['firstname'], item['lastname']]));
  this.assertEquals({ '[0,"Taylor","Otwell"]': { firstname: 'Taylor', lastname: 'Otwell', locale: 'US' }, '[1,"Lucas","Michot"]': { firstname: 'Lucas', lastname: 'Michot', locale: 'FR' } }, result.all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testKeyByNull`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([{ rating: 1, name: '1' }, { rating: 2, name: null }]);
  let result = data.keyBy('name');
  this.assertEquals(new PhpArray<any, unknown>([['1', { rating: 1, name: '1' }], ['', { rating: 2, name: null }]]), result.all()); // adapted:DIV-9.2
});

// Illuminate\Tests\Support\SupportCollectionTest::testGettingSumFromCollection#0: held whole under ESC-14.5-2.
// Illuminate\Tests\Support\SupportCollectionTest::testGettingSumFromCollection#1: held whole under ESC-14.5-2.

// Illuminate\Tests\Support\SupportCollectionTest::testCanSumValuesWithoutACallback#0: held whole under ESC-14.5-2.
// Illuminate\Tests\Support\SupportCollectionTest::testCanSumValuesWithoutACallback#1: held whole under ESC-14.5-2.

// Illuminate\Tests\Support\SupportCollectionTest::testGettingSumFromEmptyCollection#0: held whole under ESC-14.5-2.
// Illuminate\Tests\Support\SupportCollectionTest::testGettingSumFromEmptyCollection#1: held whole under ESC-14.5-2.

portedTest(`${ID}::testPaginate`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection(['one', 'two', 'three', 'four']);
  this.assertEquals(['one', 'two'], c.forPage(0, 2).all()); // adapted:DIV-9.2
  this.assertEquals(['one', 'two'], c.forPage(1, 2).all()); // adapted:DIV-9.2
  this.assertEquals(new PhpArray<any, unknown>([[2, 'three'], [3, 'four']]), c.forPage(2, 2).all()); // adapted:DIV-9.2
  this.assertSame([], c.forPage(3, 2).all()); // adapted:DIV-9.2
});

portedTest(`${ID}::testGettingMaxItemsFromCollection`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([Object.assign(new stdClass(), { foo: 10 }), Object.assign(new stdClass(), { foo: 20 })]);
  this.assertEquals(20, c.max((item: any) => item.foo));
  this.assertEquals(20, c.max('foo'));
  this.assertEquals(20, (c.__get("max") as HigherOrderCollectionProxy).__get("foo")); // adapted:DIV-12.16
  c = new collection([{ foo: 10 }, { foo: 20 }]);
  this.assertEquals(20, c.max('foo'));
  this.assertEquals(20, (c.__get("max") as HigherOrderCollectionProxy).__get("foo")); // adapted:DIV-12.16
  c = new collection([1, 2, 3, 4, 5]);
  this.assertEquals(5, c.max());
  c = new collection();
  this.assertNull(c.max());
});

portedTest(`${ID}::testGettingMinItemsFromCollection`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let c = new collection([Object.assign(new stdClass(), { foo: 10 }), Object.assign(new stdClass(), { foo: 20 })]);
  this.assertEquals(10, c.min((item: any) => item.foo));
  this.assertEquals(10, c.min('foo'));
  this.assertEquals(10, (c.__get("min") as HigherOrderCollectionProxy).__get("foo")); // adapted:DIV-12.16
  c = new collection([{ foo: 10 }, { foo: 20 }]);
  this.assertEquals(10, c.min('foo'));
  this.assertEquals(10, (c.__get("min") as HigherOrderCollectionProxy).__get("foo")); // adapted:DIV-12.16
  c = new collection([{ foo: 10 }, { foo: 20 }, { foo: null }]);
  this.assertEquals(10, c.min('foo'));
  this.assertEquals(10, (c.__get("min") as HigherOrderCollectionProxy).__get("foo")); // adapted:DIV-12.16
  c = new collection([1, 2, 3, 4, 5]);
  this.assertEquals(1, c.min());
  c = new collection([1, null, 3, 4, 5]);
  this.assertEquals(1, c.min());
  c = new collection([0, 1, 2, 3, 4]);
  this.assertEquals(0, c.min());
  c = new collection();
  this.assertNull(c.min());
});

// Illuminate\Tests\Support\SupportCollectionTest::testGettingAvgItemsFromCollection#0: held whole under ESC-14.5-2.
// Illuminate\Tests\Support\SupportCollectionTest::testGettingAvgItemsFromCollection#1: held whole under ESC-14.5-2.

portedTest(`${ID}::testReduce`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3]);
  this.assertEquals(6, data.reduce((carry: number | null, element: number) => (carry ?? 0) + element));
  data = new collection({ foo: "bar", baz: "qux" });
  this.assertSame("foobarbazqux", data.reduce((carry: unknown, element: unknown, key: unknown) => toPhpString(carry) + toPhpString(key) + toPhpString(element)));
});

portedTest(`${ID}::testReduceInto`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3]);
  this.assertEquals(6, data.reduceInto(0, (result: Ref<number>, element: number) => { result.value += element; })); // adapted:DIV-9.2
  data = new collection({ foo: "bar", baz: "qux" });
  this.assertSame("foobarbazqux", data.reduceInto("", (result: Ref<string>, element: unknown, key: unknown) => { result.value += toPhpString(key) + toPhpString(element); })); // adapted:DIV-9.2
  data = new collection([1, 2, 3, 4, 5]);
  const result = data.reduceInto([] as number[], (result: Ref<number[]>, value: number) => {
    if (value % 2 === 0) { result.value.push(value); }
  });
  this.assertSame([2, 4], result); // adapted:DIV-9.2
});

// Illuminate\\Tests\\Support\\SupportCollectionTest::testReduceSpread#0: held whole under ESC-14.5-1; missing runtime PHP_INT_MIN/MAX prevents complete runnable translation.
// Illuminate\\Tests\\Support\\SupportCollectionTest::testReduceSpread#1: held whole under ESC-14.5-1; missing runtime PHP_INT_MIN/MAX prevents complete runnable translation.
/* Upstream body retained unchanged pending runtime constants and Support class_basename:
    public function testReduceSpread($collection)
    {
        $data = new $collection([-1, 0, 1, 2, 3, 4, 5]);

        [$sum, $max, $min] = $data->reduceSpread(function ($sum, $max, $min, $value) {
            $sum += $value;
            $max = max($max, $value);
            $min = min($min, $value);

            return [$sum, $max, $min];
        }, 0, PHP_INT_MIN, PHP_INT_MAX);

        $this->assertEquals(14, $sum);
        $this->assertEquals(5, $max);
        $this->assertEquals(-1, $min);
    }
*/

// Illuminate\\Tests\\Support\\SupportCollectionTest::testReduceSpreadThrowsAnExceptionIfReducerDoesNotReturnAnArray#0: held whole under ESC-14.5-1; missing runtime PHP_INT_MIN/MAX prevents complete runnable translation.
// Illuminate\\Tests\\Support\\SupportCollectionTest::testReduceSpreadThrowsAnExceptionIfReducerDoesNotReturnAnArray#1: held whole under ESC-14.5-1; missing runtime PHP_INT_MIN/MAX prevents complete runnable translation.
/* Upstream body retained unchanged pending runtime constants and Support class_basename:
    public function testReduceSpreadThrowsAnExceptionIfReducerDoesNotReturnAnArray($collection)
    {
        $data = new $collection([1]);

        $this->expectException(UnexpectedValueException::class);

        $data->reduceSpread(function () {
            return false;
        }, null);
    }
*/

// Illuminate\Tests\Support\SupportCollectionTest::testPipe#0: held whole under ESC-14.5-2.
// Illuminate\Tests\Support\SupportCollectionTest::testPipe#1: held whole under ESC-14.5-2.

portedTest(`${ID}::testPipeInto`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection(['first', 'second']);
  let instance = data.pipeInto(TestCollectionMapIntoObject);
  this.assertSame(data, instance.value);
});

// Illuminate\Tests\Support\SupportCollectionTest::testPipeThrough#0: held whole under ESC-14.5-2.
// Illuminate\Tests\Support\SupportCollectionTest::testPipeThrough#1: held whole under ESC-14.5-2.

// Illuminate\Tests\Support\SupportCollectionTest::testMedianValueWithArrayCollection#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMedianValueWithArrayCollection#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMedianValueByKey#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMedianValueByKey#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMedianOnCollectionWithNull#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMedianOnCollectionWithNull#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testEvenMedianCollection#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testEvenMedianCollection#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMedianOutOfOrderCollection#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMedianOutOfOrderCollection#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testMedianOnEmptyCollectionReturnsNull#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testMedianOnEmptyCollectionReturnsNull#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testModeOnNullCollection`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection();
  this.assertNull(data.mode());
});

portedTest(`${ID}::testMode`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3, 4, 4, 5]);
  this.assertIsArray(data.mode());
  this.assertEquals([4], data.mode()); // adapted:DIV-9.2
});

portedTest(`${ID}::testModeValueByKey`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([Object.assign(new stdClass(), { foo: 1 }), Object.assign(new stdClass(), { foo: 1 }), Object.assign(new stdClass(), { foo: 2 }), Object.assign(new stdClass(), { foo: 4 })]);
  let data2 = new Collection([{ foo: 1 }, { foo: 1 }, { foo: 2 }, { foo: 4 }]);
  this.assertEquals([1], data.mode('foo')); // adapted:DIV-9.2
  this.assertEquals(data2.mode('foo'), data.mode('foo'));
});

portedTest(`${ID}::testWithMultipleModeValues`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 2, 1]);
  this.assertEquals([1, 2], data.mode()); // adapted:DIV-9.2
});

portedTest(`${ID}::testModeOnCollectionWithNull`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([Object.assign(new stdClass(), { foo: 5 }), Object.assign(new stdClass(), { foo: null }), Object.assign(new stdClass(), { foo: null })]);
  this.assertEquals([5], data.mode('foo')); // adapted:DIV-9.2
  data = new collection([null, 3]);
  this.assertEquals([3], data.mode()); // adapted:DIV-9.2
});

portedTest(`${ID}::testModeOnCollectionWithOnlyNullsReturnsNull`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([null, null]);
  this.assertNull(data.mode());
});

// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionWithADivisibleCount#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionWithADivisibleCount#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionWithAnUndivisableCount#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionWithAnUndivisableCount#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionWithCountLessThenDivisor#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionWithCountLessThenDivisor#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionIntoThreeWithCountOfFour#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionIntoThreeWithCountOfFour#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionIntoThreeWithCountOfFive#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionIntoThreeWithCountOfFive#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionIntoSixWithCountOfTen#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitCollectionIntoSixWithCountOfTen#1: held whole under ESC-14.5-1.

// Illuminate\Tests\Support\SupportCollectionTest::testSplitEmptyCollection#0: held whole under ESC-14.5-1.
// Illuminate\Tests\Support\SupportCollectionTest::testSplitEmptyCollection#1: held whole under ESC-14.5-1.

portedTest(`${ID}::testTap`, { case: SupportCollectionTest, dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3]);
  let fromTap: unknown = [];
  let tappedInstance: AnyCollection | null = null;
  data = data.tap((data: AnyCollection) => {
    fromTap = data.slice(0, 1).toArray();
    tappedInstance = data;
  });
  this.assertSame(data, tappedInstance);
  this.assertSame([1], fromTap);
  this.assertSame([1, 2, 3], data.toArray());
});

portedTest(`${ID}::testItThrowsExceptionWhenTryingToAccessNoProxyProperty`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection();
  this.expectExceptionObject(new Exception('Property [foo] does not exist on this collection instance.'));
  data.__get("foo"); // adapted:DIV-12.16
});

portedTest(`${ID}::testGetWithNullReturnsNull`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection([1, 2, 3]);
  this.assertNull(data.get(null));
});

portedTest(`${ID}::testGetWithDefaultValue`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection({ name: 'taylor', framework: 'laravel' });
  this.assertSame('34', toPhpString(data.get('age', 34)));
});

portedTest(`${ID}::testGetWithCallbackAsDefaultValue`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let data = new collection({ name: 'taylor', framework: 'laravel' });
  let result = data.get('email', () => 'taylor@example.com');
  this.assertSame('taylor@example.com', result);
});

portedTest(`${ID}::testPercentageWithFlatCollection`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let collection_ = new collection([1, 1, 2, 2, 2, 3]);
  this.assertSame(33.33, collection_.percentage((value: any) => value === 1));
  this.assertSame(float(50), collection_.percentage((value: any) => value === 2)); // adapted:DIV-9.4
  this.assertSame(16.67, collection_.percentage((value: any) => value === 3));
  this.assertSame(float(0), collection_.percentage((value: any) => value === 5)); // adapted:DIV-9.4
});

portedTest(`${ID}::testPercentageWithNestedCollection`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let collection_ = new collection([{ name: 'Taylor', foo: 'foo' }, { name: 'Nuno', foo: 'bar' }, { name: 'Dries', foo: 'bar' }, { name: 'Jess', foo: 'baz' }]);
  this.assertSame(float(25), collection_.percentage((value: any) => value['foo'] === 'foo')); // adapted:DIV-9.4
  this.assertSame(float(50), collection_.percentage((value: any) => value['foo'] === 'bar')); // adapted:DIV-9.4
  this.assertSame(float(25), collection_.percentage((value: any) => value['foo'] === 'baz')); // adapted:DIV-9.4
  this.assertSame(float(0), collection_.percentage((value: any) => value['foo'] === 'test')); // adapted:DIV-9.4
});

portedTest(`${ID}::testPercentageReturnsNullForEmptyCollections`, { case: SupportCollectionTest , dataset: COLLECTION_CLASSES }, async function (collection: CollectionClass) {
  let collection_ = new collection([]);
  this.assertNull(collection_.percentage((value: any) => value === 1));
});

// Illuminate\Tests\Support\SupportCollectionTest::testNewInstanceIsUsedByCollectionMethods: held whole under ESC-14.5-1.

portedTest(`${ID}::testStaticFactoryMethodsForwardExtraArguments`, { case: SupportCollectionTest }, async function () {
  let made = TestCollectionWithExtraState.make([1, 2, 3], 'make-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, made);
  this.assertSame('make-tag', made.tag);
  this.assertSame([1, 2, 3], made.all()); // adapted:DIV-9.2
  let wrapped = TestCollectionWithExtraState.wrap([4, 5], 'wrap-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, wrapped);
  this.assertSame('wrap-tag', wrapped.tag);
  this.assertSame([4, 5], wrapped.all()); // adapted:DIV-9.2
  let empty = TestCollectionWithExtraState.empty('empty-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, empty);
  this.assertSame('empty-tag', empty.tag);
  this.assertEmpty(empty.all());
  let range = TestCollectionWithExtraState.range(1, 3, 1, 'range-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, range);
  this.assertSame('range-tag', range.tag);
  this.assertSame([1, 2, 3], range.all()); // adapted:DIV-9.2
  let times = TestCollectionWithExtraState.times(3, (i: any) => i * 10, 'times-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, times);
  this.assertSame('times-tag', times.tag);
  this.assertSame([10, 20, 30], times.all()); // adapted:DIV-9.2
  let timesZero = TestCollectionWithExtraState.times(0, null, 'zero-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, timesZero);
  this.assertSame('zero-tag', timesZero.tag);
  this.assertEmpty(timesZero.all());
  let json = TestCollectionWithExtraState.fromJson('["a","b"]', 512, 0, 'json-tag');
  this.assertInstanceOf(TestCollectionWithExtraState, json);
  this.assertSame('json-tag', json.tag);
  this.assertSame(['a', 'b'], json.all()); // adapted:DIV-9.2
});
