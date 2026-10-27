// Ported from Laravel v13.37.0 framework/tests/Support/SupportArrTest.php.
import { portedTest, TestCase } from "@xaravel/assert";
import { Arr, Collection, LazyCollection, collect, ItemNotFoundException, MultipleItemsFoundException } from "../../../../../src";
import { ArrayIterator, ArrayObject, PhpArray, Ref, InvalidArgumentException, stdClass, WeakMap, Generator, array_values, array_intersect_assoc, is_string, is_numeric, toPhpString, strrev, str_contains, toBool, spaceship, phpSerialize as serialize, phpUnserialize as unserialize, registerTestClass, BlockedByComponentError, float, yieldFrom } from "@xaravel/runtime";
import { FIXTURES, TestArrayableObject, TestJsonableObject, TestJsonSerializeObject, TestJsonSerializeWithScalarValueObject, TestTraversableAndJsonSerializableObject } from "./Fixtures/Common";
import { TestEnum, TestBackedEnum, TestStringBackedEnum, FIXTURES as ENUM_FIXTURES } from "./Fixtures/Enums";
class SupportArrTest extends TestCase {
  setUp(): void { for (const [name, fixture] of [...FIXTURES, ...ENUM_FIXTURES]) registerTestClass(name, fixture); }

  // The reached CountsEnumerations trait helpers, preserving its lazy recorder and assertion.
  assertEnumerates(count: number, executor: (collection: LazyCollection) => void): void {
    this.assertEnumeratesCollection(LazyCollection.times(100), count, executor);
  }
  assertEnumeratesCollection(collection: LazyCollection, count: number, executor: (collection: LazyCollection) => void): void {
    const enumerated = new Ref(0); // adapted:DIV-9.2
    const data = this.countEnumerations(collection, enumerated); // adapted:DIV-9.2
    executor(data);
    this.assertEnumerations(count, enumerated.value); // adapted:DIV-9.2
  }
  assertEnumerations(expected: number, actual: number): void {
    this.assertEquals(expected, actual, 'Failed asserting that ' + toPhpString(actual) + ' items that were enumerated matches expected ' + toPhpString(expected) + '.');
  }
  countEnumerations(collection: LazyCollection, count: Ref<number>): LazyCollection {
    return collection.tapEach(() => { count.value++; }); // adapted:DIV-9.2
  }
}
// Carbon belongs to Support (Epic 19); retain the complete upstream test body below.
class Carbon { constructor(_value: string) { throw new BlockedByComponentError("support"); } }
portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testAdd', { case: SupportArrTest }, async function () {
  let array: any = Arr.add({ name: 'Desk' }, 'price', 100);
  this.assertEquals({ name: 'Desk', price: 100 }, array);
  this.assertEquals({ surname: 'Mövsümov' }, Arr.add([], 'surname', 'Mövsümov'));
  this.assertEquals({ developer: { name: 'Ferid' } }, Arr.add([], 'developer.name', 'Ferid'));
  this.assertEquals(new PhpArray<any, any>([[1, 'hAz']]), Arr.add([], 1, 'hAz'));
  this.assertEquals(new PhpArray<any, any>([[1, new PhpArray<any, any>([[1, 'hAz']])]]), Arr.add([], 1.1, 'hAz'));
  this.assertEquals({ type: 'Table' }, Arr.add({ type: 'Table' }, 'type', 'Chair'));
  this.assertEquals({ category: { type: 'Table' } }, Arr.add({ category: { type: 'Table' } }, 'category.type', 'Chair'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testCollapse', { case: SupportArrTest }, async function () {
  let data: any = [['foo', 'bar'], ['baz']];
  this.assertEquals(['foo', 'bar', 'baz'], Arr.collapse(data));
  let array: any = [[1], [2], [3], ['foo', 'bar']];
  this.assertEquals([1, 2, 3, 'foo', 'bar'], Arr.collapse(array));
  let emptyArray: any = [[], [], []];
  this.assertSame([], Arr.collapse(emptyArray));
  let mixedArray: any = [[], [1, 2], [], ['foo', 'bar']];
  this.assertEquals([1, 2, 'foo', 'bar'], Arr.collapse(mixedArray));
  let collection: any = collect(['baz', 'boom']);
  mixedArray = [[1], [2], [3], ['foo', 'bar'], collection];
  this.assertEquals([1, 2, 3, 'foo', 'bar', 'baz', 'boom'], Arr.collapse(mixedArray));
  mixedArray = [[1], new LazyCollection([2, 3]), collect([4])];
  this.assertEquals([1, 2, 3, 4], Arr.collapse(mixedArray));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testCrossJoin', { case: SupportArrTest }, async function () {
  this.assertSame([[1, 'a'], [1, 'b'], [1, 'c']], Arr.crossJoin([1], ['a', 'b', 'c']));
  this.assertSame([[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']], Arr.crossJoin([1, 2], ['a', 'b']));
  this.assertSame([[1, 'a'], [1, 'b'], [1, 'c'], [2, 'a'], [2, 'b'], [2, 'c']], Arr.crossJoin([1, 2], ['a', 'b', 'c']));
  this.assertSame([[1, 'a', 'I'], [1, 'a', 'II'], [1, 'a', 'III'], [1, 'b', 'I'], [1, 'b', 'II'], [1, 'b', 'III'], [2, 'a', 'I'], [2, 'a', 'II'], [2, 'a', 'III'], [2, 'b', 'I'], [2, 'b', 'II'], [2, 'b', 'III']], Arr.crossJoin([1, 2], ['a', 'b'], ['I', 'II', 'III']));
  this.assertEmpty(Arr.crossJoin([], ['a', 'b'], ['I', 'II', 'III']));
  this.assertEmpty(Arr.crossJoin([1, 2], [], ['I', 'II', 'III']));
  this.assertEmpty(Arr.crossJoin([1, 2], ['a', 'b'], []));
  this.assertEmpty(Arr.crossJoin([], [], []));
  this.assertEmpty(Arr.crossJoin([], []));
  this.assertEmpty(Arr.crossJoin([]));
  this.assertSame([[]], Arr.crossJoin());
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testDivide', { case: SupportArrTest }, async function () {
  let [keys, values] = Arr.divide([]);
  this.assertSame([], keys);
  this.assertSame([], values);
  [keys, values] = Arr.divide({ name: 'Desk' });
  this.assertEquals(['name'], keys);
  this.assertEquals(['Desk'], values);
  [keys, values] = Arr.divide({ name: 'Desk', price: 100, available: true });
  this.assertEquals(['name', 'price', 'available'], keys);
  this.assertEquals(['Desk', 100, true], values);
  [keys, values] = Arr.divide(['first', 'second']);
  this.assertEquals([0, 1], keys);
  this.assertEquals(['first', 'second'], values);
  [keys, values] = Arr.divide(new PhpArray<any, any>([[null, 'Null'], [1, 'one']]));
  this.assertEquals([null, 1], keys);
  this.assertEquals(['Null', 'one'], values);
  [keys, values] = Arr.divide([new PhpArray<any, any>([['one', 1], [2, 'second']]), 'one']);
  this.assertEquals([0, 1], keys);
  this.assertEquals([new PhpArray<any, any>([['one', 1], [2, 'second']]), 'one'], values);
  [keys, values] = Arr.divide(new PhpArray<any, any>([['', new PhpArray<any, any>([['one', 1], [2, 'second']])], [1, 'one']]));
  this.assertEquals([null, 1], keys);
  this.assertEquals([new PhpArray<any, any>([['one', 1], [2, 'second']]), 'one'], values);
  [keys, values] = Arr.divide(new PhpArray<any, any>([[null, new PhpArray<any, any>([['one', 1], [2, 'second']])], [1, 'one']]));
  this.assertEquals([null, 1], keys);
  this.assertEquals([new PhpArray<any, any>([['one', 1], [2, 'second']]), 'one'], values);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testDot', { case: SupportArrTest }, async function () {
  let array: any = Arr.dot({ foo: { bar: 'baz' } });
  this.assertSame({ 'foo.bar': 'baz' }, array);
  array = Arr.dot(new PhpArray<any, any>([[10, 100]]));
  this.assertSame(new PhpArray<any, any>([[10, 100]]), array);
  array = Arr.dot({ foo: new PhpArray<any, any>([[10, 100]]) });
  this.assertSame({ 'foo.10': 100 }, array);
  array = Arr.dot([]);
  this.assertSame([], array);
  array = Arr.dot({ foo: [] });
  this.assertSame({ foo: [] }, array);
  array = Arr.dot({ foo: { bar: [] } });
  this.assertSame({ 'foo.bar': [] }, array);
  array = Arr.dot({ name: 'taylor', languages: { php: true } });
  this.assertSame({ name: 'taylor', 'languages.php': true }, array);
  array = Arr.dot({ user: { name: 'Taylor', age: 25, languages: ['PHP', 'C#'] } });
  this.assertSame({ 'user.name': 'Taylor', 'user.age': 25, 'user.languages.0': 'PHP', 'user.languages.1': 'C#' }, array);
  array = Arr.dot(new PhpArray<any, any>([[0, 'foo'], ['foo', { bar: 'baz', baz: { a: 'b' } }]]));
  this.assertSame(new PhpArray<any, any>([[0, 'foo'], ['foo.bar', 'baz'], ['foo.baz.a', 'b']]), array);
  array = Arr.dot({ foo: 'bar', empty_array: [], user: { name: 'Taylor' }, key: 'value' });
  this.assertSame({ foo: 'bar', empty_array: [], 'user.name': 'Taylor', key: 'value' }, array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testDotWithDepth', { case: SupportArrTest }, async function () {
  let array: any = Arr.dot({ user: { name: 'Taylor', address: { city: 'Dallas' } } }, '', 1);
  this.assertSame({ 'user.name': 'Taylor', 'user.address': { city: 'Dallas' } }, array);
  array = Arr.dot({ user: { address: { city: { name: 'Dallas' } } } }, '', 2);
  this.assertSame({ 'user.address.city': { name: 'Dallas' } }, array);
  array = Arr.dot({ user: { address: { city: { name: 'Dallas' } } } }, '', Infinity);
  this.assertSame({ 'user.address.city.name': 'Dallas' }, array);
  array = Arr.dot({ name: 'taylor', languages: { php: true, js: { react: true } } }, '', 1);
  this.assertSame({ name: 'taylor', 'languages.php': true, 'languages.js': { react: true } }, array);
  array = Arr.dot({ foo: { bar: [] } }, '', 1);
  this.assertSame({ 'foo.bar': [] }, array);
  array = Arr.dot({ user: { name: 'Taylor', address: { city: 'Dallas' } } }, '', 0);
  this.assertSame({ user: { name: 'Taylor', address: { city: 'Dallas' } } }, array);
  array = Arr.dot({ user: { name: 'Taylor' } }, 'prefix.', 1);
  this.assertSame({ 'prefix.user.name': 'Taylor' }, array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testUndot', { case: SupportArrTest }, async function () {
  let array: any = Arr.undot({ 'user.name': 'Taylor', 'user.age': 25, 'user.languages.0': 'PHP', 'user.languages.1': 'C#' });
  this.assertEquals({ user: { name: 'Taylor', age: 25, languages: ['PHP', 'C#'] } }, array);
  array = Arr.undot({ 'pagination.previous': '<<', 'pagination.next': '>>' });
  this.assertEquals({ pagination: { previous: '<<', next: '>>' } }, array);
  array = Arr.undot(new PhpArray<any, any>([[0, 'foo'], ['foo.bar', 'baz'], ['foo.baz', { a: 'b' }]]));
  this.assertEquals(new PhpArray<any, any>([[0, 'foo'], ['foo', { bar: 'baz', baz: { a: 'b' } }]]), array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testExcept', { case: SupportArrTest }, async function () {
  let array: any = { name: 'taylor', age: 26 };
  this.assertEquals({ age: 26 }, Arr.except(array, ['name']));
  this.assertEquals({ age: 26 }, Arr.except(array, 'name'));
  array = { name: 'taylor', framework: { language: 'PHP', name: 'Laravel' } };
  this.assertEquals({ name: 'taylor' }, Arr.except(array, 'framework'));
  this.assertEquals({ name: 'taylor', framework: { name: 'Laravel' } }, Arr.except(array, 'framework.language'));
  this.assertEquals({ framework: { language: 'PHP' } }, Arr.except(array, ['name', 'framework.name']));
  array = new PhpArray<any, any>([[1, 'hAz'], [2, new PhpArray<any, any>([[5, 'foo'], [12, 'baz']])]]);
  this.assertEquals(new PhpArray<any, any>([[1, 'hAz']]), Arr.except(array, 2));
  this.assertEquals(new PhpArray<any, any>([[1, 'hAz'], [2, new PhpArray<any, any>([[12, 'baz']])]]), Arr.except(array, 2.5));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testExceptValues', { case: SupportArrTest }, async function () {
  let array: any = { name: 'taylor', age: 26, city: 'austin' };
  this.assertEquals({ name: 'taylor', city: 'austin' }, Arr.exceptValues(array, [26]));
  this.assertEquals({ name: 'taylor', city: 'austin' }, Arr.exceptValues(array, 26));
  array = ['foo', 'bar', 'baz', 'qux'];
  this.assertEquals(new PhpArray<any, any>([[1, 'bar'], [3, 'qux']]), Arr.exceptValues(array, ['foo', 'baz']));
  this.assertEquals(new PhpArray<any, any>([[0, 'foo'], [1, 'bar'], [3, 'qux']]), Arr.exceptValues(array, 'baz'));
  array = [1, 2, 3, 4, 5];
  this.assertEquals(new PhpArray<any, any>([[0, 1], [1, 2], [4, 5]]), Arr.exceptValues(array, [3, 4]));
  array = { a: 1, b: 2, c: 1, d: 3 };
  this.assertEquals({ b: 2, d: 3 }, Arr.exceptValues(array, 1));
  this.assertSame([], Arr.exceptValues([], 'foo'));
  this.assertEquals(['foo', 'bar'], Arr.exceptValues(['foo', 'bar'], []));
  array = [1, '1', 2, '2', 3];
  this.assertEquals(new PhpArray<any, any>([[1, '1'], [3, '2']]), Arr.exceptValues(array, [1, 2, 3], true));
  this.assertSame([], Arr.exceptValues(array, [1, 2, 3]));
  array = { a: true, b: false, c: 1, d: 0 };
  this.assertEquals({ a: true, b: false }, Arr.exceptValues(array, [1, 0], true));
  this.assertSame([], Arr.exceptValues(array, [1, 0]));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testExists', { case: SupportArrTest }, async function () {
  this.assertTrue(Arr.exists([1], 0));
  this.assertTrue(Arr.exists([null], 0));
  this.assertTrue(Arr.exists({ a: 1 }, 'a'));
  this.assertTrue(Arr.exists({ a: null }, 'a'));
  this.assertTrue(Arr.exists(new Collection({ a: null }), 'a'));
  this.assertFalse(Arr.exists([1], 1));
  this.assertFalse(Arr.exists([null], 1));
  this.assertFalse(Arr.exists({ a: 1 }, 0));
  this.assertFalse(Arr.exists(new Collection({ a: null }), 'b'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testWhereNotNull', { case: SupportArrTest }, async function () {
  let array = array_values(Arr.whereNotNull([null, 0, false, '', null, []]));
  this.assertEquals([0, false, '', []], array);
  array = array_values(Arr.whereNotNull([1, 2, 3]));
  this.assertEquals([1, 2, 3], array);
  array = array_values(Arr.whereNotNull([null, null, null]));
  this.assertSame([], array);
  array = array_values(Arr.whereNotNull(['a', null, 'b', null, 'c']));
  this.assertEquals(['a', 'b', 'c'], array);
  const class_ = new stdClass(); const function_ = () => null;
  array = array_values(Arr.whereNotNull([null, 1, 'string', float(0), false, [], class_, function_]));
  this.assertEquals([1, 'string', float(0), false, [], class_, function_], array); // adapted:DIV-9.4
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFirst', { case: SupportArrTest }, async function () {
  const array = [100, 200, 300];
  this.assertNull(Arr.first([], null));
  this.assertSame('foo', Arr.first([], null, 'foo'));
  this.assertSame('bar', Arr.first([], null, () => 'bar'));
  this.assertEquals(100, Arr.first(array));
  const value = Arr.first(array, (value: number) => value >= 150);
  this.assertEquals(200, value);
  const value2 = Arr.first(array, (value: number) => value > 300);
  const value3 = Arr.first(array, (value: number) => value > 300, 'bar');
  const value4 = Arr.first(array, (value: number) => value > 300, () => 'baz');
  const value5 = Arr.first(array, (_value: number, key: number) => key < 2);
  this.assertNull(value2);
  this.assertSame('bar', value3);
  this.assertSame('baz', value4);
  this.assertEquals(100, value5);
  const cursor = new Generator((function* () { while (false) { yield 1; } })());
  this.assertNull(Arr.first(cursor));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFirstWorksWithArrayObject', { case: SupportArrTest }, async function () {
  let arrayObject: any = new ArrayObject([0, 10, 20]);
  let result: any = Arr.first(arrayObject, (value: unknown) => value === 0);
  this.assertSame(0, result);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFirstIsLazy', { case: SupportArrTest }, async function () {
  this.assertEnumerates(2, (collection: LazyCollection) => {
    Arr.first(collection, (value: number) => value === 2);
  });
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFirstWorksWithYieldFrom', { case: SupportArrTest }, async function () {
  const products = new Generator((function* () {
    yield* yieldFrom(['Laptop', 'Monitor']); // adapted:DIV-12.18
    yield* yieldFrom(['Keyboard', 'Mouse']); // adapted:DIV-12.18
  })());
  this.assertSame('Laptop', Arr.first(products, (product: string) => product === 'Laptop')); // adapted:DIV-12.18
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testJoin', { case: SupportArrTest }, async function () {
  this.assertSame('a, b, c', Arr.join(['a', 'b', 'c'], ', '));
  this.assertSame('a, b and c', Arr.join(['a', 'b', 'c'], ', ', ' and '));
  this.assertSame('a and b', Arr.join(['a', 'b'], ', ', ' and '));
  this.assertSame('a', Arr.join(['a'], ', ', ' and '));
  this.assertSame('', Arr.join([], ', ', ' and '));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testLast', { case: SupportArrTest }, async function () {
  let array: any = [100, 200, 300];
  this.assertNull(Arr.last([], null));
  this.assertSame('foo', Arr.last([], null, 'foo'));
  this.assertSame('bar', Arr.last([], null, () => 'bar'));
  this.assertEquals(300, Arr.last(array));
  let value: any = Arr.last(array, (value: number) => value < 250);
  this.assertEquals(200, value);
  let value2: any = Arr.last(array, (value: number) => value > 300);
  let value3: any = Arr.last(array, (value: number) => value > 300, 'bar');
  let value4: any = Arr.last(array, (value: number) => value > 300, () => 'baz');
  let value5: any = Arr.last(array, (_value: number, key: number) => key < 2);
  this.assertNull(value2);
  this.assertSame('bar', value3);
  this.assertSame('baz', value4);
  this.assertEquals(200, value5);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testLastAcceptsIterables', { case: SupportArrTest }, async function () {
  let items: any = new ArrayIterator({ first: 100, second: 200, third: 300 });
  this.assertSame(300, Arr.last(items));
  this.assertSame(200, Arr.last(items, (_value: number, key: string) => key !== 'third'));
  this.assertSame('default', Arr.last(new ArrayIterator(), { default: 'default' }));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFlatten', { case: SupportArrTest }, async function () {
  let array: any = ['#foo', '#bar', '#baz'];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [['#foo', '#bar'], '#baz'];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [['#foo', null], '#baz', null];
  this.assertEquals(['#foo', null, '#baz', null], Arr.flatten(array));
  array = [['#foo', '#bar'], ['#baz']];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [['#foo', ['#bar']], ['#baz']];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [new Collection(['#foo', '#bar']), ['#baz']];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [new Collection(['#foo', ['#bar']]), ['#baz']];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [['#foo', new Collection(['#bar'])], ['#baz']];
  this.assertEquals(['#foo', '#bar', '#baz'], Arr.flatten(array));
  array = [['#foo', new Collection(['#bar', ['#zap']])], ['#baz']];
  this.assertEquals(['#foo', '#bar', '#zap', '#baz'], Arr.flatten(array));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFlattenWithLazyCollections', { case: SupportArrTest }, async function () {
  let array: any = [new LazyCollection(['#foo', ['#bar']]), ['#baz', new LazyCollection(['#zap'])]];
  this.assertEquals(['#foo', '#bar', '#baz', '#zap'], Arr.flatten(array));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFlattenWithDepth', { case: SupportArrTest }, async function () {
  let array: any = [['#foo', ['#bar', ['#baz']]], '#zap'];
  this.assertEquals(['#foo', '#bar', '#baz', '#zap'], Arr.flatten(array));
  array = [['#foo', ['#bar', ['#baz']]], '#zap'];
  this.assertEquals(['#foo', ['#bar', ['#baz']], '#zap'], Arr.flatten(array, 1));
  array = [['#foo', ['#bar', ['#baz']]], '#zap'];
  this.assertEquals(['#foo', '#bar', ['#baz'], '#zap'], Arr.flatten(array, 2));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testGet', { case: SupportArrTest }, async function () {
  let array: any = { 'products.desk': { price: 100 } };
  this.assertEquals({ price: 100 }, Arr.get(array, 'products.desk'));
  array = { products: { desk: { price: 100 } } };
  let value: any = Arr.get(array, 'products.desk');
  this.assertEquals({ price: 100 }, value);
  array = { foo: null, bar: { baz: null } };
  this.assertNull(Arr.get(array, 'foo', 'default'));
  this.assertNull(Arr.get(array, 'bar.baz', 'default'));
  array = { products: { desk: { price: 100 } } };
  let arrayAccessObject: any = new ArrayObject(array);
  value = Arr.get(arrayAccessObject, 'products.desk');
  this.assertEquals({ price: 100 }, value);
  let arrayAccessChild: any = new ArrayObject({ products: { desk: { price: 100 } } });
  array = { child: arrayAccessChild };
  value = Arr.get(array, 'child.products.desk');
  this.assertEquals({ price: 100 }, value);
  arrayAccessChild = new ArrayObject({ products: { desk: { price: 100 } } });
  let arrayAccessParent: any = new ArrayObject({ child: arrayAccessChild });
  array = { parent: arrayAccessParent };
  value = Arr.get(array, 'parent.child.products.desk');
  this.assertEquals({ price: 100 }, value);
  arrayAccessChild = new ArrayObject({ products: { desk: { price: 100 } } });
  arrayAccessParent = new ArrayObject({ child: arrayAccessChild });
  array = { parent: arrayAccessParent };
  value = Arr.get(array, 'parent.child.desk');
  this.assertNull(value);
  arrayAccessObject = new ArrayObject({ products: { desk: null } });
  array = { parent: arrayAccessObject };
  value = Arr.get(array, 'parent.products.desk.price');
  this.assertNull(value);
  array = new ArrayObject({ foo: null, bar: new ArrayObject({ baz: null }) });
  this.assertNull(Arr.get(array, 'foo', 'default'));
  this.assertNull(Arr.get(array, 'bar.baz', 'default'));
  array = ['foo', 'bar'];
  this.assertEquals(array, Arr.get(array, null));
  this.assertSame('default', Arr.get(null, 'foo', 'default'));
  this.assertSame('default', Arr.get(false, 'foo', 'default'));
  this.assertSame('default', Arr.get(null, null, 'default'));
  this.assertEmpty(Arr.get([], null));
  this.assertEmpty(Arr.get([], null, 'default'));
  array = { products: [{ name: 'desk' }, { name: 'chair' }] };
  this.assertSame('desk', Arr.get(array, 'products.0.name'));
  this.assertSame('chair', Arr.get(array, 'products.1.name'));
  array = { names: { developer: 'taylor' } };
  this.assertSame('dayle', Arr.get(array, 'names.otherDeveloper', 'dayle'));
  this.assertSame('dayle', Arr.get(array, 'names.otherDeveloper', () => 'dayle'));
  this.assertSame('bar', Arr.get({ '': 'bar' }, ''));
  this.assertSame('bar', Arr.get({ '': { '': 'bar' } }, '.'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testHas', { case: SupportArrTest }, async function () {
  let array: any = { 'products.desk': { price: 100 } };
  this.assertTrue(Arr.has(array, 'products.desk'));
  array = { products: { desk: { price: 100 } } };
  this.assertTrue(Arr.has(array, 'products.desk'));
  this.assertTrue(Arr.has(array, 'products.desk.price'));
  this.assertFalse(Arr.has(array, 'products.foo'));
  this.assertFalse(Arr.has(array, 'products.desk.foo'));
  array = { foo: null, bar: { baz: null } };
  this.assertTrue(Arr.has(array, 'foo'));
  this.assertTrue(Arr.has(array, 'bar.baz'));
  array = new ArrayObject({ foo: 10, bar: new ArrayObject({ baz: 10 }) });
  this.assertTrue(Arr.has(array, 'foo'));
  this.assertTrue(Arr.has(array, 'bar'));
  this.assertTrue(Arr.has(array, 'bar.baz'));
  this.assertFalse(Arr.has(array, 'xxx'));
  this.assertFalse(Arr.has(array, 'xxx.yyy'));
  this.assertFalse(Arr.has(array, 'foo.xxx'));
  this.assertFalse(Arr.has(array, 'bar.xxx'));
  array = new ArrayObject({ foo: null, bar: new ArrayObject({ baz: null }) });
  this.assertTrue(Arr.has(array, 'foo'));
  this.assertTrue(Arr.has(array, 'bar.baz'));
  array = ['foo', 'bar'];
  this.assertFalse(Arr.has(array, null));
  this.assertFalse(Arr.has(null, 'foo'));
  this.assertFalse(Arr.has(false, 'foo'));
  this.assertFalse(Arr.has(null, null));
  this.assertFalse(Arr.has([], null));
  array = { products: { desk: { price: 100 } } };
  this.assertTrue(Arr.has(array, ['products.desk']));
  this.assertTrue(Arr.has(array, ['products.desk', 'products.desk.price']));
  this.assertTrue(Arr.has(array, ['products', 'products']));
  this.assertFalse(Arr.has(array, ['foo']));
  this.assertFalse(Arr.has(array, []));
  this.assertFalse(Arr.has(array, ['products.desk', 'products.price']));
  array = { products: [{ name: 'desk' }] };
  this.assertTrue(Arr.has(array, 'products.0.name'));
  this.assertFalse(Arr.has(array, 'products.0.price'));
  this.assertFalse(Arr.has([], [null]));
  this.assertFalse(Arr.has(null, [null]));
  this.assertTrue(Arr.has({ '': 'some' }, ''));
  this.assertTrue(Arr.has({ '': 'some' }, ['']));
  this.assertFalse(Arr.has([''], ''));
  this.assertFalse(Arr.has([], ''));
  this.assertFalse(Arr.has([], ['']));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testHasAllMethod', { case: SupportArrTest }, async function () {
  let array: any = { name: 'Taylor', age: '', city: null };
  this.assertTrue(Arr.hasAll(array, 'name'));
  this.assertTrue(Arr.hasAll(array, 'age'));
  this.assertFalse(Arr.hasAll(array, ['age', 'car']));
  this.assertTrue(Arr.hasAll(array, 'city'));
  this.assertFalse(Arr.hasAll(array, ['city', 'some']));
  this.assertTrue(Arr.hasAll(array, ['name', 'age', 'city']));
  this.assertFalse(Arr.hasAll(array, ['name', 'age', 'city', 'country']));
  array = { user: { name: 'Taylor' } };
  this.assertTrue(Arr.hasAll(array, 'user.name'));
  this.assertFalse(Arr.hasAll(array, 'user.age'));
  array = { name: 'Taylor', age: '', city: null };
  this.assertFalse(Arr.hasAll(array, 'foo'));
  this.assertFalse(Arr.hasAll(array, 'bar'));
  this.assertFalse(Arr.hasAll(array, 'baz'));
  this.assertFalse(Arr.hasAll(array, 'bah'));
  this.assertFalse(Arr.hasAll(array, ['foo', 'bar', 'baz', 'bar']));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testHasAnyMethod', { case: SupportArrTest }, async function () {
  let array: any = { name: 'Taylor', age: '', city: null };
  this.assertTrue(Arr.hasAny(array, 'name'));
  this.assertTrue(Arr.hasAny(array, 'age'));
  this.assertTrue(Arr.hasAny(array, 'city'));
  this.assertFalse(Arr.hasAny(array, 'foo'));
  this.assertTrue((Arr.hasAny as (...args: unknown[]) => boolean)(array, 'name', 'email'));
  this.assertTrue(Arr.hasAny(array, ['name', 'email']));
  array = { name: 'Taylor', email: 'foo' };
  this.assertTrue((Arr.hasAny as (...args: unknown[]) => boolean)(array, 'name', 'email'));
  this.assertFalse((Arr.hasAny as (...args: unknown[]) => boolean)(array, 'surname', 'password'));
  this.assertFalse(Arr.hasAny(array, ['surname', 'password']));
  array = { foo: { bar: null, baz: '' } };
  this.assertTrue(Arr.hasAny(array, 'foo.bar'));
  this.assertTrue(Arr.hasAny(array, 'foo.baz'));
  this.assertFalse(Arr.hasAny(array, 'foo.bax'));
  this.assertTrue(Arr.hasAny(array, ['foo.bax', 'foo.baz']));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testEvery', { case: SupportArrTest }, async function () {
  this.assertFalse(Arr.every([1, 2], (value: unknown, _key: unknown) => is_string(value)));
  this.assertFalse(Arr.every(['foo', 2], (value: unknown, _key: unknown) => is_string(value)));
  this.assertTrue(Arr.every(['foo', 'bar'], (value: unknown, _key: unknown) => is_string(value)));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testEveryAcceptsIterables', { case: SupportArrTest }, async function () {
  let items: any = new ArrayIterator({ first: 1, second: 2 });
  this.assertTrue(Arr.every(items, (value: number, key: string) => toBool(is_string(key)) && value > 0));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSome', { case: SupportArrTest }, async function () {
  this.assertFalse(Arr.some([1, 2], (value: unknown, _key: unknown) => is_string(value)));
  this.assertTrue(Arr.some(['foo', 2], (value: unknown, _key: unknown) => is_string(value)));
  this.assertTrue(Arr.some(['foo', 'bar'], (value: unknown, _key: unknown) => is_string(value)));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSomeAcceptsIterables', { case: SupportArrTest }, async function () {
  let items: any = new ArrayIterator({ first: 1, second: 2 });
  this.assertTrue(Arr.some(items, (value: number, key: string) => key === 'second' && value === 2));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testOnly', { case: SupportArrTest }, async function () {
  let array: any = { name: 'Desk', price: 100, orders: 10 };
  array = Arr.only(array, ['name', 'price']);
  this.assertEquals({ name: 'Desk', price: 100 }, array);
  this.assertEmpty(Arr.only(array, ['nonExistingKey']));
  this.assertEmpty(Arr.only(array, null));
  this.assertEquals(['foo'], Arr.only(['foo', 'bar', 'baz'], 0));
  this.assertEquals(new PhpArray<any, any>([[1, 'bar'], [2, 'baz']]), Arr.only(['foo', 'bar', 'baz'], [1, 2]));
  this.assertEmpty(Arr.only(['foo', 'bar', 'baz'], [3]));
  this.assertEquals(['foo'], Arr.only(new PhpArray<any, any>([[0, 'foo'], ['bar', 'baz']]), 0));
  this.assertEquals({ bar: 'baz' }, Arr.only(new PhpArray<any, any>([[0, 'foo'], ['bar', 'baz']]), 'bar'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testOnlyValues', { case: SupportArrTest }, async function () {
  let array: any = { name: 'taylor', age: 26, city: 'austin' };
  this.assertEquals({ age: 26 }, Arr.onlyValues(array, [26]));
  this.assertEquals({ age: 26 }, Arr.onlyValues(array, 26));
  array = ['foo', 'bar', 'baz', 'qux'];
  this.assertEquals(new PhpArray<any, any>([[0, 'foo'], [2, 'baz']]), Arr.onlyValues(array, ['foo', 'baz']));
  this.assertEquals(new PhpArray<any, any>([[2, 'baz']]), Arr.onlyValues(array, 'baz'));
  array = [1, 2, 3, 4, 5];
  this.assertEquals(new PhpArray<any, any>([[2, 3], [3, 4]]), Arr.onlyValues(array, [3, 4]));
  array = { a: 1, b: 2, c: 1, d: 3 };
  this.assertEquals({ a: 1, c: 1 }, Arr.onlyValues(array, 1));
  this.assertSame([], Arr.onlyValues([], 'foo'));
  this.assertSame([], Arr.onlyValues(['foo', 'bar'], []));
  array = [1, '1', 2, '2', 3];
  this.assertEquals(new PhpArray<any, any>([[0, 1], [2, 2], [4, 3]]), Arr.onlyValues(array, [1, 2, 3], true));
  this.assertEquals([1, '1', 2, '2', 3], Arr.onlyValues(array, [1, 2, 3]));
  array = { a: true, b: false, c: 1, d: 0 };
  this.assertEquals({ c: 1, d: 0 }, Arr.onlyValues(array, [1, 0], true));
  this.assertEquals({ a: true, b: false, c: 1, d: 0 }, Arr.onlyValues(array, [1, 0]));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPluck', { case: SupportArrTest }, async function () {
  let data: any = { 'post-1': { comments: { tags: ['#foo', '#bar'] } }, 'post-2': { comments: { tags: ['#baz'] } } };
  this.assertEquals([{ tags: ['#foo', '#bar'] }, { tags: ['#baz'] }], Arr.pluck(data, 'comments'));
  this.assertEquals([['#foo', '#bar'], ['#baz']], Arr.pluck(data, 'comments.tags'));
  this.assertEquals([null, null], Arr.pluck(data, 'foo'));
  this.assertEquals([null, null], Arr.pluck(data, 'foo.bar'));
  let array: any = [{ developer: { name: 'Taylor' } }, { developer: { name: 'Abigail' } }];
  array = Arr.pluck(array, 'developer.name');
  this.assertEquals(['Taylor', 'Abigail'], array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPluckWithArrayValue', { case: SupportArrTest }, async function () {
  let array: any = [{ developer: { name: 'Taylor' } }, { developer: { name: 'Abigail' } }];
  array = Arr.pluck(array, ['developer', 'name']);
  this.assertEquals(['Taylor', 'Abigail'], array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPluckWithKeys', { case: SupportArrTest }, async function () {
  let array: any = [{ name: 'Taylor', role: 'developer' }, { name: 'Abigail', role: 'developer' }];
  let test1: any = Arr.pluck(array, 'role', 'name');
  let test2: any = Arr.pluck(array, null, 'name');
  this.assertEquals({ Taylor: 'developer', Abigail: 'developer' }, test1);
  this.assertEquals({ Taylor: { name: 'Taylor', role: 'developer' }, Abigail: { name: 'Abigail', role: 'developer' } }, test2);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPluckWithCarbonKeys', { case: SupportArrTest }, async function () {
  let array: any = [{ start: new Carbon('2017-07-25 00:00:00'), end: new Carbon('2017-07-30 00:00:00') }];
  array = Arr.pluck(array, 'end', 'start');
  this.assertEquals({ '2017-07-25 00:00:00': '2017-07-30 00:00:00' }, array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testArrayPluckWithArrayAndObjectValues', { case: SupportArrTest }, async function () {
  const array = [Object.assign(new stdClass(), { name: 'taylor', email: 'foo' }), { name: 'dayle', email: 'bar' }];
  this.assertEquals(['taylor', 'dayle'], Arr.pluck(array, 'name'));
  this.assertEquals({ taylor: 'foo', dayle: 'bar' }, Arr.pluck(array, 'email', 'name'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testArrayPluckWithNestedKeys', { case: SupportArrTest }, async function () {
  let array: any = [{ user: ['taylor', 'otwell'] }, { user: ['dayle', 'rees'] }];
  this.assertEquals(['taylor', 'dayle'], Arr.pluck(array, 'user.0'));
  this.assertEquals(['taylor', 'dayle'], Arr.pluck(array, ['user', 0]));
  this.assertEquals({ taylor: 'otwell', dayle: 'rees' }, Arr.pluck(array, 'user.1', 'user.0'));
  this.assertEquals({ taylor: 'otwell', dayle: 'rees' }, Arr.pluck(array, ['user', 1], ['user', 0]));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testArrayPluckWithNestedArrays', { case: SupportArrTest }, async function () {
  let array: any = [{ account: 'a', users: [{ first: 'taylor', last: 'otwell', email: 'taylorotwell@gmail.com' }] }, { account: 'b', users: [{ first: 'abigail', last: 'otwell' }, { first: 'dayle', last: 'rees' }] }];
  this.assertEquals([['taylor'], ['abigail', 'dayle']], Arr.pluck(array, 'users.*.first'));
  this.assertEquals({ a: ['taylor'], b: ['abigail', 'dayle'] }, Arr.pluck(array, 'users.*.first', 'account'));
  this.assertEquals([['taylorotwell@gmail.com'], [null, null]], Arr.pluck(array, 'users.*.email'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testMap', { case: SupportArrTest }, async function () {
  let data: any = { first: 'taylor', last: 'otwell' };
  let mapped: any = Arr.map(data, (value: unknown, key: unknown) => toPhpString(key) + '-' + toPhpString(strrev(value)));
  this.assertEquals({ first: 'first-rolyat', last: 'last-llewto' }, mapped);
  this.assertEquals({ first: 'taylor', last: 'otwell' }, data);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testMapWithEmptyArray', { case: SupportArrTest }, async function () {
  const mapped = Arr.map([], (value: unknown, key: unknown) => toPhpString(key) + '-' + toPhpString(value));
  this.assertSame([], mapped);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testMapNullValues', { case: SupportArrTest }, async function () {
  const data = { first: 'taylor', last: null };
  const mapped = Arr.map(data, (value: unknown, key: unknown) => toPhpString(key) + '-' + toPhpString(value));
  this.assertEquals({ first: 'first-taylor', last: 'last-' }, mapped);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testMapWithKeys', { case: SupportArrTest }, async function () {
  let data: any = [{ name: 'Blastoise', type: 'Water', idx: 9 }, { name: 'Charmander', type: 'Fire', idx: 4 }, { name: 'Dragonair', type: 'Dragon', idx: 148 }];
  data = Arr.mapWithKeys(data, (pokemon: { name: string; type: string; idx: number }) => new PhpArray<any, any>([[pokemon['name'], pokemon['type']]]));
  this.assertEquals({ Blastoise: 'Water', Charmander: 'Fire', Dragonair: 'Dragon' }, data);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testMapByReference', { case: SupportArrTest }, async function () {
  let data: any = { first: 'taylor', last: 'otwell' };
  let mapped: any = Arr.map(data, 'strrev');
  this.assertEquals({ first: 'rolyat', last: 'llewto' }, mapped);
  this.assertEquals({ first: 'taylor', last: 'otwell' }, data);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testMapSpread', { case: SupportArrTest }, async function () {
  let c: any = [[1, 'a'], [2, 'b']];
  let result: any = Arr.mapSpread(c, (number: number, character: string) => toPhpString(number) + '-' + toPhpString(character));
  this.assertEquals(['1-a', '2-b'], result);
  result = Arr.mapSpread(c, (number: number, character: string, key: number) => toPhpString(number) + '-' + toPhpString(character) + '-' + toPhpString(key));
  this.assertEquals(['1-a-0', '2-b-1'], result);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPrepend', { case: SupportArrTest }, async function () {
  let array: any = Arr.prepend(['one', 'two', 'three', 'four'], 'zero');
  this.assertEquals(['zero', 'one', 'two', 'three', 'four'], array);
  array = Arr.prepend({ one: 1, two: 2 }, 0, 'zero');
  this.assertEquals({ zero: 0, one: 1, two: 2 }, array);
  array = Arr.prepend({ one: 1, two: 2 }, 0, '');
  this.assertEquals({ '': 0, one: 1, two: 2 }, array);
  array = Arr.prepend({ one: 1, two: 2 }, 0, null);
  this.assertEquals(new PhpArray<any, any>([[null, 0], ['one', 1], ['two', 2]]), array);
  array = Arr.prepend(['one', 'two'], null, '');
  this.assertEquals(new PhpArray<any, any>([['', null], [0, 'one'], [1, 'two']]), array);
  array = Arr.prepend([], 'zero');
  this.assertEquals(['zero'], array);
  array = Arr.prepend([''], 'zero');
  this.assertEquals(['zero', ''], array);
  array = Arr.prepend(['one', 'two'], ['zero']);
  this.assertEquals([['zero'], 'one', 'two'], array);
  array = Arr.prepend(['one', 'two'], ['zero'], 'key');
  this.assertEquals(new PhpArray<any, any>([['key', ['zero']], [0, 'one'], [1, 'two']]), array);
  array = Arr.prepend(['one', 'two'], ['zero'], '');
  this.assertEquals(new PhpArray<any, any>([[0, 'one'], [1, 'two'], ['', ['zero']]]), array);
  array = Arr.prepend(new PhpArray<any, any>([[0, 'one'], [1, 'two'], ['', 'three']]), ['zero'], '');
  this.assertEquals(new PhpArray<any, any>([[0, 'one'], [1, 'two'], ['', ['zero']]]), array);
  array = Arr.prepend(['one', 'two'], ['zero'], null);
  this.assertEquals(new PhpArray<any, any>([[0, 'one'], [1, 'two'], [null, ['zero']]]), array);
  array = Arr.prepend(new PhpArray<any, any>([[0, 'one'], [1, 'two'], ['', 'three']]), ['zero'], null);
  this.assertEquals(new PhpArray<any, any>([[0, 'one'], [1, 'two'], [null, ['zero']]]), array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPull', { case: SupportArrTest }, async function () { // adapted:DIV-9.2
  let array: any = new Ref<unknown>( { name: 'Desk', price: 100 });
  let name: any = Arr.pull(array, 'name'); // adapted:DIV-9.2
  this.assertSame('Desk', name); // adapted:DIV-9.2
  this.assertSame({ price: 100 }, array.value); // adapted:DIV-9.2
  array.value = { 'joe@example.com': 'Joe', 'jane@localhost': 'Jane' };
  name = Arr.pull(array, 'joe@example.com'); // adapted:DIV-9.2
  this.assertSame('Joe', name); // adapted:DIV-9.2
  this.assertSame({ 'jane@localhost': 'Jane' }, array.value); // adapted:DIV-9.2
  array.value = { emails: { 'joe@example.com': 'Joe', 'jane@localhost': 'Jane' } };
  name = Arr.pull(array, 'emails.joe@example.com'); // adapted:DIV-9.2
  this.assertNull(name); // adapted:DIV-9.2
  this.assertSame({ emails: { 'joe@example.com': 'Joe', 'jane@localhost': 'Jane' } }, array.value); // adapted:DIV-9.2
  array.value = ['First', 'Second'];
  let first: any = Arr.pull(array, 0); // adapted:DIV-9.2
  this.assertSame('First', first); // adapted:DIV-9.2
  this.assertSame(new PhpArray<any, any>([[1, 'Second']]), array.value); // adapted:DIV-9.2
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testRandom', { case: SupportArrTest }, async function () {
  let random: any = Arr.random(['foo', 'bar', 'baz']);
  this.assertContains(random, ['foo', 'bar', 'baz']);
  random = Arr.random(['foo', 'bar', 'baz'], 0);
  this.assertIsArray(random);
  this.assertCount(0, random);
  random = Arr.random(['foo', 'bar', 'baz'], 1);
  this.assertIsArray(random);
  this.assertCount(1, random);
  this.assertContains(random[0], ['foo', 'bar', 'baz']);
  random = Arr.random(['foo', 'bar', 'baz'], 2);
  this.assertIsArray(random);
  this.assertCount(2, random);
  this.assertContains(random[0], ['foo', 'bar', 'baz']);
  this.assertContains(random[1], ['foo', 'bar', 'baz']);
  random = Arr.random(['foo', 'bar', 'baz'], '0');
  this.assertIsArray(random);
  this.assertCount(0, random);
  random = Arr.random(['foo', 'bar', 'baz'], '1');
  this.assertIsArray(random);
  this.assertCount(1, random);
  this.assertContains(random[0], ['foo', 'bar', 'baz']);
  random = Arr.random(['foo', 'bar', 'baz'], '2');
  this.assertIsArray(random);
  this.assertCount(2, random);
  this.assertContains(random[0], ['foo', 'bar', 'baz']);
  this.assertContains(random[1], ['foo', 'bar', 'baz']);
  random = Arr.random({ one: 'foo', two: 'bar', three: 'baz' }, 2, true);
  this.assertIsArray(random);
  this.assertCount(2, random);
  this.assertCount(2, array_intersect_assoc({ one: 'foo', two: 'bar', three: 'baz' }, random));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testRandomNotIncrementingKeys', { case: SupportArrTest }, async function () {
  let random: any = Arr.random({ foo: 'foo', bar: 'bar', baz: 'baz' });
  this.assertContains(random, ['foo', 'bar', 'baz']);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testRandomOnEmptyArray', { case: SupportArrTest }, async function () {
  let random: any = Arr.random([], 0);
  this.assertIsArray(random);
  this.assertCount(0, random);
  random = Arr.random([], '0');
  this.assertIsArray(random);
  this.assertCount(0, random);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testRandomThrowsAnErrorWhenRequestingMoreItemsThanAreAvailable', { case: SupportArrTest }, async function () {
  let exceptions = 0;
  try { Arr.random([]); } catch (error) { if (!(error instanceof InvalidArgumentException)) throw error; exceptions++; }
  try { Arr.random([], 1); } catch (error) { if (!(error instanceof InvalidArgumentException)) throw error; exceptions++; }
  try { Arr.random([], 2); } catch (error) { if (!(error instanceof InvalidArgumentException)) throw error; exceptions++; }
  this.assertSame(3, exceptions);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSet', { case: SupportArrTest }, async function () { // adapted:DIV-9.2
  let array: any = new Ref<unknown>( { products: { desk: { price: 100 } } });
  Arr.set(array, 'products.desk.price', 200); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: { price: 200 } } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.set(array, null, { price: 300 }); // adapted:DIV-9.2
  this.assertSame({ price: 300 }, array.value); // adapted:DIV-9.2
  array.value = { products: 'desk' };
  Arr.set(array, 'products.desk.price', 200); // adapted:DIV-9.2
  this.assertSame({ products: { desk: { price: 200 } } }, array.value); // adapted:DIV-9.2
  array.value = ['products'];
  Arr.set(array, 'products.desk.price', 200); // adapted:DIV-9.2
  this.assertSame(new PhpArray<any, any>([[0, 'products'], ['products', { desk: { price: 200 } }]]), array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.set(array, 'table', 500); // adapted:DIV-9.2
  this.assertSame({ products: { desk: { price: 100 } }, table: 500 }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.set(array, 'table.price', 350); // adapted:DIV-9.2
  this.assertSame({ products: { desk: { price: 100 } }, table: { price: 350 } }, array.value); // adapted:DIV-9.2
  array.value = [];
  Arr.set(array, 'products.desk.price', 200); // adapted:DIV-9.2
  this.assertSame({ products: { desk: { price: 200 } } }, array.value); // adapted:DIV-9.2
  array.value = { products: 'table' };
  Arr.set(array, 'products.desk.price', 300); // adapted:DIV-9.2
  this.assertSame({ products: { desk: { price: 300 } } }, array.value); // adapted:DIV-9.2
  array.value = new PhpArray<any, any>([[1, 'test']]);
  this.assertEquals(new PhpArray<any, any>([[1, 'hAz']]), Arr.set(array, 1, 'hAz')); // adapted:DIV-9.2
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSoleReturnsFirstItemInCollectionIfOnlyOneExists', { case: SupportArrTest }, async function () {
  this.assertSame('foo', Arr.sole(['foo']));
  let array: any = [{ name: 'foo' }, { name: 'bar' }];
  this.assertSame({ name: 'foo' }, Arr.sole(array, (value: { name: string }) => value['name'] === 'foo'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSoleThrowsExceptionIfNoItemsExist', { case: SupportArrTest }, async function () {
  this.expectException(ItemNotFoundException);
  Arr.sole(['foo'], (value: unknown) => value === 'baz');
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSoleThrowsExceptionIfMoreThanOneItemExists', { case: SupportArrTest }, async function () {
  this.expectExceptionObject(new MultipleItemsFoundException(2));
  Arr.sole(['baz', 'foo', 'baz'], (value: unknown) => value === 'baz');
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSort', { case: SupportArrTest }, async function () {
  let unsorted: any = [{ name: 'Desk' }, { name: 'Chair' }];
  let expected: any = [{ name: 'Chair' }, { name: 'Desk' }];
  let sorted: any = array_values(Arr.sort(unsorted));
  this.assertEquals(expected, sorted);
  let sortedWithClosure: any = array_values(Arr.sort(unsorted, (value: { name: string }) => value['name']));
  this.assertEquals(expected, sortedWithClosure);
  let sortedWithDotNotation: any = array_values(Arr.sort(unsorted, 'name'));
  this.assertEquals(expected, sortedWithDotNotation);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSortDesc', { case: SupportArrTest }, async function () {
  let unsorted: any = [{ name: 'Chair' }, { name: 'Desk' }];
  let expected: any = [{ name: 'Desk' }, { name: 'Chair' }];
  let sorted: any = array_values(Arr.sortDesc(unsorted));
  this.assertEquals(expected, sorted);
  let sortedWithClosure: any = array_values(Arr.sortDesc(unsorted, (value: { name: string }) => value['name']));
  this.assertEquals(expected, sortedWithClosure);
  let sortedWithDotNotation: any = array_values(Arr.sortDesc(unsorted, 'name'));
  this.assertEquals(expected, sortedWithDotNotation);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testToCssClasses', { case: SupportArrTest }, async function () {
  let classes: any = Arr.toCssClasses(['font-bold', 'mt-4']);
  this.assertSame('font-bold mt-4', classes);
  classes = Arr.toCssClasses(new PhpArray<any, any>([[0, 'font-bold'], [1, 'mt-4'], ['ml-2', true], ['mr-2', false]]));
  this.assertSame('font-bold mt-4 ml-2', classes);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testToCssStyles', { case: SupportArrTest }, async function () {
  let styles: any = Arr.toCssStyles(['font-weight: bold', 'margin-top: 4px;']);
  this.assertSame('font-weight: bold; margin-top: 4px;', styles);
  styles = Arr.toCssStyles(new PhpArray<any, any>([[0, 'font-weight: bold;'], [1, 'margin-top: 4px'], ['margin-left: 2px;', true], ['margin-right: 2px', false]]));
  this.assertSame('font-weight: bold; margin-top: 4px; margin-left: 2px;', styles);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testWhere', { case: SupportArrTest }, async function () {
  let array: any = [100, '200', 300, '400', 500];
  array = Arr.where(array, (value: unknown, _key: unknown) => is_string(value));
  this.assertEquals(new PhpArray<any, any>([[1, '200'], [3, '400']]), array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testWhereKey', { case: SupportArrTest }, async function () {
  let array: any = new PhpArray<any, any>([['10', 1], ['foo', 3], [20, 2]]);
  array = Arr.where(array, (value: unknown, key: unknown) => is_numeric(key));
  this.assertEquals(new PhpArray<any, any>([['10', 1], [20, 2]]), array);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testForget', { case: SupportArrTest }, async function () { // adapted:DIV-9.2
  let array: any = new Ref<unknown>( { products: { desk: { price: 100 } } });
  Arr.forget(array, null); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: { price: 100 } } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.forget(array, []); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: { price: 100 } } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.forget(array, 'products.desk'); // adapted:DIV-9.2
  this.assertEquals({ products: [] }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.forget(array, 'products.desk.price'); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: [] } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } } };
  Arr.forget(array, 'products.final.price'); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: { price: 100 } } }, array.value); // adapted:DIV-9.2
  array.value = { shop: { cart: new PhpArray<any, any>([[150, 0]]) } };
  Arr.forget(array, 'shop.final.cart'); // adapted:DIV-9.2
  this.assertEquals({ shop: { cart: new PhpArray<any, any>([[150, 0]]) } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: { original: 50, taxes: 60 } } } };
  Arr.forget(array, 'products.desk.price.taxes'); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: { price: { original: 50 } } } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: { original: 50, taxes: 60 } } } };
  Arr.forget(array, 'products.desk.final.taxes'); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: { price: { original: 50, taxes: 60 } } } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 50 }, '': 'something' } };
  Arr.forget(array, ['products.amount.all', 'products.desk.price']); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: [], '': 'something' } }, array.value); // adapted:DIV-9.2
  array.value = { 'joe@example.com': 'Joe', 'jane@example.com': 'Jane' };
  Arr.forget(array, 'joe@example.com'); // adapted:DIV-9.2
  this.assertEquals({ 'jane@example.com': 'Jane' }, array.value); // adapted:DIV-9.2
  array.value = { emails: { 'joe@example.com': { name: 'Joe' }, 'jane@localhost': { name: 'Jane' } } };
  Arr.forget(array, ['emails.joe@example.com', 'emails.jane@localhost']); // adapted:DIV-9.2
  this.assertEquals({ emails: { 'joe@example.com': { name: 'Joe' } } }, array.value); // adapted:DIV-9.2
  array.value = new PhpArray<any, any>([['name', 'hAz'], ['1', 'test'], [2, 'bAz']]);
  Arr.forget(array, 1); // adapted:DIV-9.2
  this.assertEquals(new PhpArray<any, any>([['name', 'hAz'], [2, 'bAz']]), array.value); // adapted:DIV-9.2
  array.value = new PhpArray<any, any>([[2, new PhpArray<any, any>([[1, 'products'], [3, 'users']])]]);
  Arr.forget(array, 2.3); // adapted:DIV-9.2
  this.assertEquals(new PhpArray<any, any>([[2, new PhpArray<any, any>([[1, 'products']])]]), array.value); // adapted:DIV-9.2
  array.value = { users: { name: 'Joe', id: 1 }, id: 99 };
  Arr.forget(array, ['users.name', 'id']); // adapted:DIV-9.2
  this.assertEquals({ users: { id: 1 } }, array.value); // adapted:DIV-9.2
  array.value = { products: { desk: { price: 100 } }, desk: 'top-level' };
  Arr.forget(array, ['products.desk.price', 'desk']); // adapted:DIV-9.2
  this.assertEquals({ products: { desk: [] } }, array.value); // adapted:DIV-9.2
  array.value = { a: { b: { c: 1, 'e.d': 'literal' } }, e: { d: 3 } };
  Arr.forget(array, ['a.b.c', 'e.d']); // adapted:DIV-9.2
  this.assertEquals({ a: { b: { 'e.d': 'literal' } }, e: [] }, array.value); // adapted:DIV-9.2
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testFrom', { case: SupportArrTest }, async function () {
  this.assertSame({ foo: 'bar' }, Arr.from({ foo: 'bar' }));
  this.assertSame({ foo: 'bar' }, Arr.from(Object.assign(new stdClass(), { foo: 'bar' })));
  this.assertSame({ foo: 'bar' }, Arr.from(new TestArrayableObject()));
  this.assertSame({ foo: 'bar' }, Arr.from(new TestJsonableObject()));
  this.assertSame({ foo: 'bar' }, Arr.from(new TestJsonSerializeObject()));
  this.assertSame(['foo'], Arr.from(new TestJsonSerializeWithScalarValueObject()));
  this.assertSame({ name: 'A' }, Arr.from(TestEnum.A));
  this.assertSame({ name: 'A', value: 1 }, Arr.from(TestBackedEnum.A));
  this.assertSame({ name: 'A', value: 'A' }, Arr.from(TestStringBackedEnum.A));
  const subject = [new stdClass(), new stdClass()];
  let items: any = new TestTraversableAndJsonSerializableObject(subject);
  this.assertSame(subject, Arr.from(items));
  items = new WeakMap();
  const temp = new class {}();
  items.offsetSet(temp, 'bar'); // adapted:DIV-12.17
  this.assertSame(['bar'], Arr.from(items)); // adapted:DIV-12.17
  this.expectExceptionObject(new InvalidArgumentException('Items cannot be represented by a scalar value.'));
  Arr.from(123);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testWrap', { case: SupportArrTest }, async function () {
  let string: any = 'a';
  let array: any = ['a'];
  let object: any = new stdClass();
  object.value = 'a';
  this.assertEquals(['a'], Arr.wrap(string));
  this.assertEquals(array, Arr.wrap(array));
  this.assertEquals([object], Arr.wrap(object));
  this.assertSame([], Arr.wrap(null));
  this.assertEquals([null], Arr.wrap([null]));
  this.assertEquals([null, null], Arr.wrap([null, null]));
  this.assertEquals([''], Arr.wrap(''));
  this.assertEquals([''], Arr.wrap(['']));
  this.assertEquals([false], Arr.wrap(false));
  this.assertEquals([false], Arr.wrap([false]));
  this.assertEquals([0], Arr.wrap(0));
  let obj: any = new stdClass();
  obj.value = 'a';
  obj = unserialize(serialize(obj));
  this.assertEquals([obj], Arr.wrap(obj));
  this.assertSame(obj, (Arr.wrap(obj) as unknown[])[0]);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSortByMany', { case: SupportArrTest }, async function () {
  let unsorted: any = [{ name: 'John', age: 8, meta: { key: 3 } }, { name: 'John', age: 10, meta: { key: 5 } }, { name: 'Dave', age: 10, meta: { key: 3 } }, { name: 'John', age: 8, meta: { key: 2 } }];
  let sorted: any = array_values(Arr.sort(unsorted, ['name', 'age', 'meta.key']));
  this.assertEquals([{ name: 'Dave', age: 10, meta: { key: 3 } }, { name: 'John', age: 8, meta: { key: 2 } }, { name: 'John', age: 8, meta: { key: 3 } }, { name: 'John', age: 10, meta: { key: 5 } }], sorted);
  let sortedWithOrder: any = array_values(Arr.sort(unsorted, ['name', ['age', false], ['meta.key', true]]));
  this.assertEquals([{ name: 'Dave', age: 10, meta: { key: 3 } }, { name: 'John', age: 10, meta: { key: 5 } }, { name: 'John', age: 8, meta: { key: 2 } }, { name: 'John', age: 8, meta: { key: 3 } }], sortedWithOrder);
  let sortedWithCallable: any = array_values(Arr.sort(unsorted, [(a: { name: string; age: number }, b: { name: string; age: number }) => spaceship(a['name'], b['name']), (a: { name: string; age: number }, b: { name: string; age: number }) => spaceship(b['age'], a['age']), ['meta.key', true]]));
  this.assertEquals([{ name: 'Dave', age: 10, meta: { key: 3 } }, { name: 'John', age: 10, meta: { key: 5 } }, { name: 'John', age: 8, meta: { key: 2 } }, { name: 'John', age: 8, meta: { key: 3 } }], sortedWithCallable);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testKeyBy', { case: SupportArrTest }, async function () {
  let array: any = [{ id: '123', data: 'abc' }, { id: '345', data: 'def' }, { id: '498', data: 'hgi' }];
  this.assertEquals(new PhpArray<any, any>([['123', { id: '123', data: 'abc' }], ['345', { id: '345', data: 'def' }], ['498', { id: '498', data: 'hgi' }]]), Arr.keyBy(array, 'id'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPrependKeysWith', { case: SupportArrTest }, async function () {
  let array: any = { id: '123', data: '456', list: [1, 2, 3], meta: { key: 1 } };
  this.assertEquals({ 'test.id': '123', 'test.data': '456', 'test.list': [1, 2, 3], 'test.meta': { key: 1 } }, Arr.prependKeysWith(array, 'test.'));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testTake', { case: SupportArrTest }, async function () {
  let array: any = [1, 2, 3, 4, 5, 6];
  this.assertEquals([1, 2, 3], Arr.take(array, 3));
  this.assertEquals([4, 5, 6], Arr.take(array, -3));
  this.assertSame([], Arr.take(array, 0));
  this.assertEquals([1, 2, 3, 4, 5, 6], Arr.take(array, 10));
  this.assertEquals([1, 2, 3, 4, 5, 6], Arr.take(array, -10));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testSelect', { case: SupportArrTest }, async function () {
  let array: any = [{ name: 'Taylor', role: 'Developer', age: 1 }, { name: 'Abigail', role: 'Infrastructure', age: 2 }];
  this.assertEquals([{ name: 'Taylor', age: 1 }, { name: 'Abigail', age: 2 }], Arr.select(array, ['name', 'age']));
  this.assertEquals([{ name: 'Taylor' }, { name: 'Abigail' }], Arr.select(array, 'name'));
  this.assertEquals([[], []], Arr.select(array, 'nonExistingKey'));
  this.assertEquals([[], []], Arr.select(array, null));
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testReject', { case: SupportArrTest }, async function () {
  let array: any = [1, 2, 3, 4, 5, 6];
  let result: any = Arr.reject(array, (value: number) => value % 2 === 0);
  this.assertEquals(new PhpArray<any, any>([[0, 1], [2, 3], [4, 5]]), result);
  let assocArray: any = { a: 1, b: 2, c: 3, d: 4 };
  result = Arr.reject(assocArray, (value: number) => value > 2);
  this.assertEquals({ a: 1, b: 2 }, result);
});

portedTest('Illuminate\\Tests\\Support\\SupportArrTest::testPartition', { case: SupportArrTest }, async function () {
  let array: any = ['John', 'Jane', 'Greg'];
  let result: any = Arr.partition(array, (value: string) => str_contains(value, 'J'));
  this.assertEquals([['John', 'Jane'], new PhpArray<any, any>([[2, 'Greg']])], result);
});
