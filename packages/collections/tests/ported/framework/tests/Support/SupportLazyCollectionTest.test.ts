// Complete Story 14.7 tests from framework/tests/Support/SupportLazyCollectionTest.php, in Upstream order.
// Keyed generators and yield-from follow DIV-12.18. The four clock tests retain their full bodies behind the
// Support (Epic 19) boundary. Every dependency declaration below throws; none supplies a clock or fake behavior.
import { portedTest, TestCase } from "@xaravel/assert";
import { Collection, LazyCollection } from "@xaravel/collections";
import { Mockery } from "@xaravel/mockery";
import { BlockedByComponentError, InvalidArgumentException, fqcn, looseEquals, type Iterator } from "@xaravel/runtime";
import { array_keys, keyed, range, yieldFrom } from "@xaravel/runtime/php";
import { SupportLazyCollectionBlockedBySupportTest } from "../../../../support/SupportClockBoundary";

const ID = "Illuminate\\Tests\\Support\\SupportLazyCollectionTest";

/** The absent Support clock's surface, used only in the retained blocked bodies. */
interface Clock {
  copy(): Clock;
  sub(amount: number, unit: string): Clock;
  addMinutes(minutes: number): Clock;
  getTimestamp(): number;
}
interface ClockCollection extends LazyCollection {
  throttle(seconds: number): this;
  takeUntilTimeout(timeout: Clock, callback: (value: unknown, key: unknown) => void): this;
  withHeartbeat(duration: unknown, callback: () => void): this;
  mockery_init(container: unknown): this;
  shouldAllowMockingProtectedMethods(): this;
  expects(method: string): any;
}
interface CarbonSurface {
  now(): Clock;
  create(year: number, month: number, day: number): Clock;
  setTestNow(time: Clock): void;
}
interface DurationSurface { minutes(minutes: number): unknown; }
interface Duration { totalMicroseconds: number; }
interface SleepSurface {
  fake(enabled?: boolean): void;
  assertSlept(callback: (duration: Duration, index: number) => boolean, options: { times: number }): void;
}
interface WormholeSurface { new (amount: number): { second(): void }; }

/** Resolve nothing until Support exists: this seam always reports the real missing component. */
function support<T>(): T { throw new BlockedByComponentError("support"); }
/** Support's helper and PHP's clone of its Carbon object remain behind the same clock dependency boundary. */
function tap(value: ClockCollection): ClockCollection { void value; throw new BlockedByComponentError("support"); }
function cloneClock(value: Clock): Clock { void value; throw new BlockedByComponentError("support"); }

portedTest(`${ID}::testCanCreateEmptyCollection`, { case: TestCase }, async function () {
  this.assertSame([], LazyCollection.make().all());
  this.assertSame([], LazyCollection.empty().all());
});

portedTest(`${ID}::testCanCreateCollectionFromArray`, { case: TestCase }, async function () {
  let array: unknown = [1, 2, 3];
  let data = LazyCollection.make(array);
  this.assertSame(array, data.all());
  array = { a: 1, b: 2, c: 3 };
  data = LazyCollection.make(array);
  this.assertSame(array, data.all());
});

portedTest(`${ID}::testCanCreateCollectionFromArrayable`, { case: TestCase }, async function () {
  let array: unknown = [1, 2, 3];
  let data = LazyCollection.make(new Collection(array));
  this.assertSame(array, data.all());
  array = { a: 1, b: 2, c: 3 };
  data = LazyCollection.make(new Collection(array));
  this.assertSame(array, data.all());
});

portedTest(`${ID}::testCanCreateCollectionFromGeneratorFunction`, { case: TestCase }, async function () {
  let data = LazyCollection.make(function* () { yield 1; yield 2; yield 3; });
  this.assertSame([1, 2, 3], data.all());
  data = LazyCollection.make(function* () {
    yield keyed("a", 1); // adapted:DIV-12.18
    yield keyed("b", 2); // adapted:DIV-12.18
    yield keyed("c", 3); // adapted:DIV-12.18
  });
  this.assertSame({ a: 1, b: 2, c: 3 }, data.all());
});

portedTest(`${ID}::testCanCreateCollectionFromNonGeneratorFunction`, { case: TestCase }, async function () {
  const data = LazyCollection.make(() => "laravel");
  this.assertSame(["laravel"], data.all());
});

portedTest(`${ID}::testDoesNotCreateCollectionFromGenerator`, { case: TestCase }, async function () {
  this.expectException(InvalidArgumentException);
  const generateNumber = function* () { yield 1; };
  LazyCollection.make(generateNumber());
});

portedTest(`${ID}::testEager`, { case: TestCase }, async function () {
  const source = [1, 2, 3, 4, 5];
  const data = LazyCollection.make(function* () { yield* yieldFrom(source); }).eager(); // adapted:DIV-12.18
  source.push(6);
  this.assertSame([1, 2, 3, 4, 5], data.all());
});

portedTest(`${ID}::testRemember`, { case: TestCase }, async function () {
  let source = [1, 2, 3, 4];
  const collection = LazyCollection.make(function* () { yield* yieldFrom(source); }).remember(); // adapted:DIV-12.18
  this.assertSame([1, 2, 3, 4], collection.all());
  source = [];
  this.assertSame([1, 2, 3, 4], collection.all());
});

portedTest(`${ID}::testRememberWithTwoRunners`, { case: TestCase }, async function () {
  const source = [1, 2, 3, 4];
  const collection = LazyCollection.make(function* () { yield* yieldFrom(source); }).remember(); // adapted:DIV-12.18
  const a = collection.getIterator() as Iterator;
  const b = collection.getIterator() as Iterator;
  this.assertEquals(1, a.current());
  this.assertEquals(1, b.current());
  b.next();
  this.assertEquals(1, a.current());
  this.assertEquals(2, b.current());
  b.next();
  this.assertEquals(1, a.current());
  this.assertEquals(3, b.current());
  a.next();
  this.assertEquals(2, a.current());
  this.assertEquals(3, b.current());
  a.next();
  this.assertEquals(3, a.current());
  this.assertEquals(3, b.current());
  a.next();
  this.assertEquals(4, a.current());
  this.assertEquals(3, b.current());
  b.next();
  this.assertEquals(4, a.current());
  this.assertEquals(4, b.current());
});

portedTest(`${ID}::testRememberWithDuplicateKeys`, { case: TestCase }, async function () {
  const collection = LazyCollection.make(function* () {
    yield keyed("key", 1); // adapted:DIV-12.18
    yield keyed("key", 2); // adapted:DIV-12.18
  }).remember();
  const results = collection.map((value: unknown, key: unknown) => [key, value]).values().all();
  this.assertSame([["key", 1], ["key", 2]], results);
});

portedTest(`${ID}::testTakeUntilTimeout`, { case: SupportLazyCollectionBlockedBySupportTest }, async function () {
  const Carbon = support<CarbonSurface>();
  const timeout = Carbon.now();
  const mock = Mockery.mock(fqcn(LazyCollection) + "[now]");
  let timedOutWith: unknown[] = [];
  const results = (mock.times(10) as ClockCollection)
    .tap((collection: ClockCollection) => {
      tap(collection)
        .mockery_init(mock.mockery_getContainer())
        .shouldAllowMockingProtectedMethods()
        .expects("now")
        .times(3)
        .andReturn(
          cloneClock(timeout).sub(2, "minute").getTimestamp(),
          cloneClock(timeout).sub(1, "minute").getTimestamp(),
          timeout.getTimestamp(),
        );
    })
    .takeUntilTimeout(timeout, (value: unknown, key: unknown) => { timedOutWith = [value, key]; })
    .all();
  this.assertSame([1, 2], results);
  this.assertSame([2, 1], timedOutWith);
});

portedTest(`${ID}::testTapEach`, { case: TestCase }, async function () {
  let data: LazyCollection | unknown[] = LazyCollection.times(10);
  const tapped: unknown[] = [];
  data = data.tapEach((value: unknown, key: number) => { tapped[key] = value; });
  this.assertEmpty(tapped);
  data = data.take(5).all();
  this.assertSame([1, 2, 3, 4, 5], data);
  this.assertSame([1, 2, 3, 4, 5], tapped);
});

portedTest(`${ID}::testThrottle`, { case: SupportLazyCollectionBlockedBySupportTest }, async function () {
  const Sleep = support<SleepSurface>();
  Sleep.fake();
  const data = (LazyCollection.times(3) as ClockCollection).throttle(2).all();
  Sleep.assertSlept((duration: Duration) => {
    this.assertEqualsWithDelta(2_000_000, duration.totalMicroseconds, 1_000);
    return true;
  }, { times: 3 });
  this.assertSame([1, 2, 3], data);
  Sleep.fake(false);
});

portedTest(`${ID}::testThrottleAccountsForTimePassed`, { case: SupportLazyCollectionBlockedBySupportTest }, async function () {
  const Sleep = support<SleepSurface>();
  const Carbon = support<CarbonSurface>();
  const Wormhole = support<WormholeSurface>();
  Sleep.fake();
  Carbon.setTestNow(Carbon.now());
  const data = (LazyCollection.times(3) as ClockCollection)
    .throttle(3)
    .tapEach((_value: unknown, index: unknown) => {
      if (looseEquals(index, 1)) { new Wormhole(1).second(); }
    }).all();
  Sleep.assertSlept((duration: Duration, index: number) => {
    const expectation = looseEquals(index, 1) ? 2_000_000 : 3_000_000;
    this.assertEqualsWithDelta(expectation, duration.totalMicroseconds, 1_000);
    return true;
  }, { times: 3 });
  this.assertSame([1, 2, 3], data);
  Sleep.fake(false);
});

portedTest(`${ID}::testUniqueDoubleEnumeration`, { case: TestCase }, async function () {
  const data = LazyCollection.times(2).unique();
  data.all();
  this.assertSame([1, 2], data.all());
});

portedTest(`${ID}::testAfter`, { case: TestCase }, async function () {
  const data = new LazyCollection([1, "2", 3, 4]);
  let result = data.after(1);
  this.assertSame("2", result);
  result = data.after("2", true);
  this.assertSame(3, result);
  const users = new LazyCollection([
    { name: "Taylor", age: 35 }, { name: "Jeffrey", age: 45 }, { name: "Mohamed", age: 35 },
  ]);
  result = users.after((user: { name: string }) => user["name"] === "Jeffrey");
  this.assertSame({ name: "Mohamed", age: 35 }, result);
});

portedTest(`${ID}::testBefore`, { case: TestCase }, async function () {
  const data = new LazyCollection([1, 2, "3", 4]);
  let result = data.before(2);
  this.assertSame(1, result);
  result = data.before(4, true);
  this.assertSame("3", result);
  const users = new LazyCollection([
    { name: "Taylor", age: 35 }, { name: "Jeffrey", age: 45 }, { name: "Mohamed", age: 35 },
  ]);
  result = users.before((user: { name: string }) => user["name"] === "Jeffrey");
  this.assertSame({ name: "Taylor", age: 35 }, result);
});

portedTest(`${ID}::testShuffle`, { case: TestCase }, async function () {
  const data = new LazyCollection([1, 2, 3, 4, 5]);
  let shuffled = data.shuffle();
  this.assertCount(5, shuffled);
  this.assertEquals([1, 2, 3, 4, 5], shuffled.sort().values().all());
  const users = new LazyCollection({ first: { name: "Taylor" }, second: { name: "Jeffrey" } });
  shuffled = users.shuffle();
  this.assertCount(2, shuffled);
  this.assertTrue(shuffled.contains("name", "Taylor"));
  this.assertTrue(shuffled.contains("name", "Jeffrey"));
});

portedTest(`${ID}::testCollapseWithKeys`, { case: TestCase }, async function () {
  let collection = new LazyCollection([{ a: 1, b: 2 }, { c: 3, d: 4 }]);
  let collapsed = collection.collapseWithKeys();
  this.assertEquals({ a: 1, b: 2, c: 3, d: 4 }, collapsed.all());
  collection = new LazyCollection([{ a: 1 }, new LazyCollection({ b: 2 })]);
  collapsed = collection.collapseWithKeys();
  this.assertEquals({ a: 1, b: 2 }, collapsed.all());
});

portedTest(`${ID}::testContainsOneItem`, { case: TestCase }, async function () {
  const collection = new LazyCollection([5]);
  this.assertTrue(collection.containsOneItem());
  const emptyCollection = new LazyCollection([]);
  this.assertFalse(emptyCollection.containsOneItem());
  const multipleCollection = new LazyCollection([1, 2, 3]);
  this.assertFalse(multipleCollection.containsOneItem());
});

portedTest(`${ID}::testContainsManyItems`, { case: TestCase }, async function () {
  const emptyCollection = new LazyCollection([]);
  this.assertFalse(emptyCollection.containsManyItems());
  const singleCollection = new LazyCollection([1]);
  this.assertFalse(singleCollection.containsManyItems());
  const multipleCollection = new LazyCollection([1, 2]);
  this.assertTrue(multipleCollection.containsManyItems());
  const manyCollection = new LazyCollection([1, 2, 3]);
  this.assertTrue(manyCollection.containsManyItems());
});

portedTest(`${ID}::testDoesntContain`, { case: TestCase }, async function () {
  const collection = new LazyCollection([1, 2, 3, 4, 5]);
  this.assertTrue(collection.doesntContain(10));
  this.assertFalse(collection.doesntContain(3));
  this.assertTrue(collection.doesntContain("value", ">", 10));
  this.assertTrue(collection.doesntContain((value: number) => value > 10));
  const users = new LazyCollection([
    { name: "Taylor", role: "developer" }, { name: "Jeffrey", role: "designer" },
  ]);
  this.assertTrue(users.doesntContain("name", "Adam"));
  this.assertFalse(users.doesntContain("name", "Taylor"));
});

portedTest(`${ID}::testDot`, { case: TestCase }, async function () {
  const collection = new LazyCollection({
    foo: { bar: "baz" }, user: { name: "Taylor", profile: { age: 30 } },
    users: [{ name: "Taylor" }, { name: "Jeffrey" }],
  });
  const dotted = collection.dot();
  const expected = {
    "foo.bar": "baz", "user.name": "Taylor", "user.profile.age": 30,
    "users.0.name": "Taylor", "users.1.name": "Jeffrey",
  };
  this.assertEquals(expected, dotted.all());
});

portedTest(`${ID}::testWithHeartbeat`, { case: SupportLazyCollectionBlockedBySupportTest }, async function () {
  const Carbon = support<CarbonSurface>();
  const Duration = support<DurationSurface>();
  const start = Carbon.create(2000, 1, 1);
  const after2Minutes = start.copy().addMinutes(2);
  const after5Minutes = start.copy().addMinutes(5);
  const after7Minutes = start.copy().addMinutes(7);
  const after11Minutes = start.copy().addMinutes(11);
  Carbon.setTestNow(start);
  const output = new Collection();
  const numbers = (LazyCollection.range(1, 10) as ClockCollection)
    .tapEach((number: number) => {
      let time: Clock;
      switch (number) {
        case 3: time = after2Minutes; break;
        case 4: time = after5Minutes; break;
        case 6: time = after7Minutes; break;
        case 9: time = after11Minutes; break;
        default: time = Carbon.now();
      }
      return Carbon.setTestNow(time);
    })
    .withHeartbeat(Duration.minutes(5), () => { output.offsetSet(null, Carbon.now()); }) // adapted:DIV-12.17
    .tapEach((number: number) => { output.offsetSet(null, number); }).all(); // adapted:DIV-12.17
  this.assertEquals(range(1, 10), numbers);
  this.assertEquals([1, 2, 3, after5Minutes, 4, 5, 6, 7, 8, after11Minutes, 9, 10], output.all());
});

portedTest(`${ID}::testRandomPreservesKeys`, { case: TestCase }, async function () {
  const collection = new LazyCollection({ first: 1, second: 2, third: 3 });
  const keysWithoutPreserve = array_keys(collection.random(2).all());
  this.assertEquals([0, 1], keysWithoutPreserve);
  const keysWithPreserve = array_keys(collection.random(2, true).all());
  for (const key of keysWithPreserve) { this.assertContains(key, ["first", "second", "third"]); }
});

portedTest(`${ID}::testHasDoesNotCountDuplicateKeys`, { case: TestCase }, async function () {
  const collection = LazyCollection.make(function* () {
    yield keyed("a", 1); // adapted:DIV-12.18
    yield keyed("a", 2); // adapted:DIV-12.18
    yield keyed("c", 3); // adapted:DIV-12.18
  });
  this.assertFalse(collection.has("a", "b"));
  this.assertFalse(collection.has(["a", "b"]));
  this.assertTrue(collection.has("a"));
});
