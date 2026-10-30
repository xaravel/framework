// Ported from Laravel v13.37.0 framework/tests/Config/RepositoryTest.php, in Upstream's order. An index read on the
// Repository is `offsetGet(k)`, the method PHP calls (DIV-12.6, ESC-15.1-4), and an index write, `isset` or `unset` is
// `offsetSet` / `offsetExists` / `offsetUnset` (DIV-12.17). In testItIsMacroable, `$repository->macro()` is the static
// `macro` on the Repository's class, written `classOf(repository).macro()` as SupportMacroableTest writes `$obj::m()`;
// the macro is a `function` expression, as Upstream rebinds it, and is called through a typed view of the Repository,
// as `macro()` installs it at run time.
// `portedTest` runs each body in a test frame, so the Repository's writes land in that frame's overlay (AD-5.5).
import { portedTest, TestCase } from "@xaravel/assert";
import { Collection } from "@xaravel/collections";
import { InvalidArgumentException, PhpArray } from "@xaravel/runtime";
import { Repository } from "../../../../../src";

/** The class of `obj`, whose static side `$obj->macro()` reaches in PHP. */
function classOf(obj: Repository): typeof Repository {
  return obj.constructor as typeof Repository;
}

/** The Repository with the macro testItIsMacroable registers. */
type WithFoo = Repository & { foo(): unknown };

class RepositoryTest extends TestCase {
  repository!: Repository;

  config!: Record<string, unknown>;

  setUp(): void {
    this.repository = new Repository(this.config = {
      foo: 'bar',
      bar: 'baz',
      baz: 'bat',
      null: null,
      boolean: true,
      integer: 1,
      float: 1.1,
      associate: {
        x: 'xxx',
        y: 'yyy',
      },
      array: [
        'aaa',
        'zzz',
      ],
      x: {
        z: 'zoo',
      },
      'a.b': 'c',
      a: {
        'b.c': 'd',
      },
    });
  }
}

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGetValueWhenKeyContainDot', { case: RepositoryTest }, async function () {
  this.assertSame(
    'c', this.repository.get('a.b'),
  );
  this.assertNull(
    this.repository.get('a.b.c'),
  );

  this.assertNull(this.repository.get('x.y.z'));
  this.assertNull(this.repository.get('.'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGetBooleanValue', { case: RepositoryTest }, async function () {
  this.assertTrue(
    this.repository.get('boolean'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGetNullValue', { case: RepositoryTest }, async function () {
  this.assertNull(
    this.repository.get('null'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testConstruct', { case: RepositoryTest }, async function () {
  this.assertInstanceOf(Repository, this.repository);
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testHasIsTrue', { case: RepositoryTest }, async function () {
  this.assertTrue(this.repository.has('foo'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testHasIsFalse', { case: RepositoryTest }, async function () {
  this.assertFalse(this.repository.has('not-exist'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGet', { case: RepositoryTest }, async function () {
  this.assertSame('bar', this.repository.get('foo'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGetWithArrayOfKeys', { case: RepositoryTest }, async function () {
  this.assertSame({
    foo: 'bar',
    bar: 'baz',
    none: null,
  }, this.repository.get([
    'foo',
    'bar',
    'none',
  ]));

  this.assertSame({
    'x.y': 'default',
    'x.z': 'zoo',
    bar: 'baz',
    baz: 'bat',
  }, this.repository.get(new PhpArray<string | number, string>([
    ['x.y', 'default'],
    ['x.z', 'default'],
    ['bar', 'default'],
    [0, 'baz'],
  ])));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGetMany', { case: RepositoryTest }, async function () {
  this.assertSame({
    foo: 'bar',
    bar: 'baz',
    none: null,
  }, this.repository.getMany([
    'foo',
    'bar',
    'none',
  ]));

  this.assertSame({
    'x.y': 'default',
    'x.z': 'zoo',
    bar: 'baz',
    baz: 'bat',
  }, this.repository.getMany(new PhpArray<string | number, string>([
    ['x.y', 'default'],
    ['x.z', 'default'],
    ['bar', 'default'],
    [0, 'baz'],
  ])));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testGetWithDefault', { case: RepositoryTest }, async function () {
  this.assertSame('default', this.repository.get('not-exist', 'default'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testSet', { case: RepositoryTest }, async function () {
  this.repository.set('key', 'value');
  this.assertSame('value', this.repository.get('key'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testSetArray', { case: RepositoryTest }, async function () {
  this.repository.set(new PhpArray<string | number, unknown>([
    ['key1', 'value1'],
    ['key2', 'value2'],
    [0, 'key3'],
    ['key4', {
      foo: 'bar',
      bar: {
        foo: 'bar',
      },
    }],
  ]));
  this.assertSame('value1', this.repository.get('key1'));
  this.assertSame('value2', this.repository.get('key2'));
  this.assertNull(this.repository.get('key3'));
  this.assertSame('bar', this.repository.get('key4.foo'));
  this.assertSame('bar', this.repository.get('key4.bar.foo'));
  this.assertNull(this.repository.get('key5'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testPrepend', { case: RepositoryTest }, async function () {
  this.assertSame('aaa', this.repository.get('array.0'));
  this.assertSame('zzz', this.repository.get('array.1'));

  this.repository.prepend('array', 'xxx');
  this.assertSame('xxx', this.repository.get('array.0'));
  this.assertSame('aaa', this.repository.get('array.1'));
  this.assertSame('zzz', this.repository.get('array.2'));
  this.assertNull(this.repository.get('array.3'));
  this.assertCount(3, this.repository.get('array'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testPush', { case: RepositoryTest }, async function () {
  this.assertSame('aaa', this.repository.get('array.0'));
  this.assertSame('zzz', this.repository.get('array.1'));
  this.repository.push('array', 'xxx');
  this.assertSame('aaa', this.repository.get('array.0'));
  this.assertSame('zzz', this.repository.get('array.1'));
  this.assertSame('xxx', this.repository.get('array.2'));

  this.assertCount(3, this.repository.get('array'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testPrependWithNewKey', { case: RepositoryTest }, async function () {
  this.repository.prepend('new_key', 'xxx');
  this.assertSame(['xxx'], this.repository.get('new_key'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testPushWithNewKey', { case: RepositoryTest }, async function () {
  this.repository.push('new_key', 'xxx');
  this.assertSame(['xxx'], this.repository.get('new_key'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testAll', { case: RepositoryTest }, async function () {
  this.assertSame(this.config, this.repository.all());
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testOffsetExists', { case: RepositoryTest }, async function () {
  const data = {
    foo: 'bar',
    null_value: null,
    empty_string: '',
    numeric_value: 123,
  };
  this.repository.set(data);

  this.assertTrue(this.repository.offsetExists('foo')); // adapted:DIV-12.17
  this.assertFalse(this.repository.offsetExists('not-exist')); // adapted:DIV-12.17
  this.assertTrue(this.repository.offsetExists('null_value')); // adapted:DIV-12.17
  this.assertTrue(this.repository.offsetExists('empty_string')); // adapted:DIV-12.17
  this.assertTrue(this.repository.offsetExists('numeric_value')); // adapted:DIV-12.17
  this.assertFalse(this.repository.offsetExists(-1)); // adapted:DIV-12.17
  this.assertFalse(this.repository.offsetExists('non_numeric')); // adapted:DIV-12.17
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testOffsetGet', { case: RepositoryTest }, async function () {
  this.assertNull(this.repository.offsetGet('not-exist')); // adapted:DIV-12.6
  this.assertSame('bar', this.repository.offsetGet('foo')); // adapted:DIV-12.6
  this.assertSame({
    x: 'xxx',
    y: 'yyy',
  }, this.repository.offsetGet('associate')); // adapted:DIV-12.6
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testOffsetSet', { case: RepositoryTest }, async function () {
  this.assertNull(this.repository.offsetGet('key')); // adapted:DIV-12.6

  this.repository.offsetSet('key', 'value'); // adapted:DIV-12.17

  this.assertSame('value', this.repository.offsetGet('key')); // adapted:DIV-12.6

  this.repository.offsetSet('key', 'new_value'); // adapted:DIV-12.17
  this.assertSame('new_value', this.repository.offsetGet('key')); // adapted:DIV-12.6

  this.repository.offsetSet('new_key', null); // adapted:DIV-12.17
  this.assertNull(this.repository.offsetGet('new_key')); // adapted:DIV-12.6

  this.repository.offsetSet('', 'value'); // adapted:DIV-12.17
  this.assertSame('value', this.repository.offsetGet('')); // adapted:DIV-12.6

  this.repository.offsetSet(123, '123'); // adapted:DIV-12.17
  this.assertSame('123', this.repository.offsetGet(123)); // adapted:DIV-12.6
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testOffsetUnset', { case: RepositoryTest }, async function () {
  this.assertArrayHasKey('associate', this.repository.all());
  this.assertSame(this.config['associate'], this.repository.get('associate'));

  this.repository.offsetUnset('associate'); // adapted:DIV-12.17

  this.assertArrayHasKey('associate', this.repository.all());
  this.assertNull(this.repository.get('associate'));
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItIsMacroable', { case: RepositoryTest }, async function () {
  classOf(this.repository).macro('foo', function () {
    return 'macroable';
  });

  this.assertSame('macroable', (this.repository as WithFoo).foo());
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItGetsAsString', { case: RepositoryTest }, async function () {
  this.assertSame(
    'c', this.repository.string('a.b'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItThrowsAnExceptionWhenTryingToGetNonStringValueAsString', { case: RepositoryTest }, async function () {
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Configuration value for key \[a\] must be a string, (.*) given./); // adapted:DIV-10.1

  this.repository.string('a');
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItGetsAsArray', { case: RepositoryTest }, async function () {
  this.assertSame(
    ['aaa', 'zzz'], this.repository.array('array'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItThrowsAnExceptionWhenTryingToGetNonArrayValueAsArray', { case: RepositoryTest }, async function () {
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/Configuration value for key \[a.b\] must be an array, (.*) given./); // adapted:DIV-10.1

  this.repository.array('a.b');
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItGetsAsCollection', { case: RepositoryTest }, async function () {
  const collection = this.repository.collection('array');

  this.assertInstanceOf(Collection, collection);
  this.assertSame(['aaa', 'zzz'], collection.toArray());
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItGetsAsBoolean', { case: RepositoryTest }, async function () {
  this.assertTrue(
    this.repository.boolean('boolean'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItThrowsAnExceptionWhenTryingToGetNonBooleanValueAsBoolean', { case: RepositoryTest }, async function () {
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/Configuration value for key \[a.b\] must be a boolean, (.*) given./); // adapted:DIV-10.1

  this.repository.boolean('a.b');
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItGetsAsInteger', { case: RepositoryTest }, async function () {
  this.assertSame(
    1, this.repository.integer('integer'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItThrowsAnExceptionWhenTryingToGetNonIntegerValueAsInteger', { case: RepositoryTest }, async function () {
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/Configuration value for key \[a.b\] must be an integer, (.*) given./); // adapted:DIV-10.1

  this.repository.integer('a.b');
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItGetsAsFloat', { case: RepositoryTest }, async function () {
  this.assertSame(
    1.1, this.repository.float('float'),
  );
});

portedTest('Illuminate\\Tests\\Config\\RepositoryTest::testItThrowsAnExceptionWhenTryingToGetNonFloatValueAsFloat', { case: RepositoryTest }, async function () {
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Configuration value for key \[a.b\] must be a float, (.*) given./); // adapted:DIV-10.1

  this.repository.float('a.b');
});
