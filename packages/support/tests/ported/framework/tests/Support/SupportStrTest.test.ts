// pilot/porting: Story 8.7 pilot translation, never merged
import { portedTest, TestCase } from "@xaravel/assert";
import { collect } from "@xaravel/collections";
import { Str } from "@xaravel/support";
import { Exception } from "@xaravel/runtime";
import { strlen, strtoupper, toInt, toPhpString } from "@xaravel/runtime/php";

class SupportStrTest extends TestCase {
  static validUuidList(): unknown[] {
    return [
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de'],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1'],
      ['00000000-0000-0000-0000-000000000000'],
      ['e60d3f48-95d7-4d8d-aad0-856f29a27da2'],
      ['ff6f8cb0-c57d-11e1-9b21-0800200c9a66'],
      ['ff6f8cb0-c57d-21e1-9b21-0800200c9a66'],
      ['ff6f8cb0-c57d-31e1-9b21-0800200c9a66'],
      ['ff6f8cb0-c57d-41e1-9b21-0800200c9a66'],
      ['ff6f8cb0-c57d-51e1-9b21-0800200c9a66'],
      ['FF6F8CB0-C57D-11E1-9B21-0800200C9A66'],
    ];
  }

  static invalidUuidList(): unknown[] {
    return [
      ['not a valid uuid so we can test this'],
      ['zf6f8cb0-c57d-11e1-9b21-0800200c9a66'],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1' + '\n'],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1 '],
      [' 145a1e72-d11d-11e8-a8d5-f2801f1b9fd1'],
      ['145a1e72-d11d-11e8-a8d5-f2z01f1b9fd1'],
      ['3f6f8cb0-c57d-11e1-9b21-0800200c9a6'],
      ['af6f8cb-c57d-11e1-9b21-0800200c9a66'],
      ['af6f8cb0c57d11e19b210800200c9a66'],
      ['ff6f8cb0-c57da-51e1-9b21-0800200c9a66'],
    ];
  }

  static uuidVersionList(): unknown[] {
    return [
      ['00000000-0000-0000-0000-000000000000', null, true],
      ['00000000-0000-0000-0000-000000000000', 0, true],
      ['00000000-0000-0000-0000-000000000000', 1, false],
      ['00000000-0000-0000-0000-000000000000', 42, false],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1', null, true],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1', 1, true],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1', 4, false],
      ['145a1e72-d11d-11e8-a8d5-f2801f1b9fd1', 42, false],
      ['ff6f8cb0-c57d-21e1-9b21-0800200c9a66', null, true],
      ['ff6f8cb0-c57d-21e1-9b21-0800200c9a66', 1, false],
      ['ff6f8cb0-c57d-21e1-9b21-0800200c9a66', 2, true],
      ['ff6f8cb0-c57d-21e1-9b21-0800200c9a66', 42, false],
      ['76a4ba72-cc4e-3e1d-b52d-856382f408c3', null, true],
      ['76a4ba72-cc4e-3e1d-b52d-856382f408c3', 1, false],
      ['76a4ba72-cc4e-3e1d-b52d-856382f408c3', 3, true],
      ['76a4ba72-cc4e-3e1d-b52d-856382f408c3', 42, false],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', null, true],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', 1, false],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', 4, true],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', 42, false],
      ['d3b2b5a9-d433-5c58-b038-4fa13696e357', null, true],
      ['d3b2b5a9-d433-5c58-b038-4fa13696e357', 1, false],
      ['d3b2b5a9-d433-5c58-b038-4fa13696e357', 5, true],
      ['d3b2b5a9-d433-5c58-b038-4fa13696e357', 42, false],
      ['1ef97d97-b5ab-67d8-9f12-5600051f1387', null, true],
      ['1ef97d97-b5ab-67d8-9f12-5600051f1387', 1, false],
      ['1ef97d97-b5ab-67d8-9f12-5600051f1387', 6, true],
      ['1ef97d97-b5ab-67d8-9f12-5600051f1387', 42, false],
      ['0192e4b9-92eb-7aec-8707-1becfb1e3eb7', null, true],
      ['0192e4b9-92eb-7aec-8707-1becfb1e3eb7', 1, false],
      ['0192e4b9-92eb-7aec-8707-1becfb1e3eb7', 7, true],
      ['0192e4b9-92eb-7aec-8707-1becfb1e3eb7', 42, false],
      ['07e80a1f-1629-831f-811f-c595103c91b5', null, true],
      ['07e80a1f-1629-831f-811f-c595103c91b5', 1, false],
      ['07e80a1f-1629-831f-811f-c595103c91b5', 8, true],
      ['07e80a1f-1629-831f-811f-c595103c91b5', 42, false],
      ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', null, true],
      ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 1, false],
      ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 42, false],
      ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', 'max', true],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', null, true],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', 1, false],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', 4, true],
      ['a0a2a2d2-0b87-4a18-83f2-2529882be2de', 42, false],
      ['zf6f8cb0-c57d-11e1-9b21-0800200c9a66', null, false],
      ['zf6f8cb0-c57d-11e1-9b21-0800200c9a66', 1, false],
      ['zf6f8cb0-c57d-11e1-9b21-0800200c9a66', 4, false],
      ['zf6f8cb0-c57d-11e1-9b21-0800200c9a66', 42, false],
    ];
  }

  static strContainsProvider(): unknown[] {
    return [
      ['Taylor', 'ylo', true, true],
      ['Taylor', 'ylo', true, false],
      ['Taylor', 'taylor', true, true],
      ['Taylor', 'taylor', false, false],
      ['Taylor', ['ylo'], true, true],
      ['Taylor', ['ylo'], true, false],
      ['Taylor', ['xxx', 'ylo'], true, true],
      ['Taylor', collect(['xxx', 'ylo']), true, true],
      ['Taylor', ['xxx', 'ylo'], true, false],
      ['Taylor', 'xxx', false],
      ['Taylor', ['xxx'], false],
      ['Taylor', '', false],
      ['', '', false],
    ];
  }

  static specialCharacterProvider(): unknown[] {
    return [
      ['ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ', 'abcdefghijklmnopqrstuvwxyz'],
      ['⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳', '01234567891011121314151617181920'],
      ['⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾', '12345678910'],
      ['⓿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴', '011121314151617181920'],
      ['ⓣⓔⓢⓣ@ⓛⓐⓡⓐⓥⓔⓛ.ⓒⓞⓜ', 'test@laravel.com'],
      ['🎂', '?'],
      ['abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvwxyz'],
      ['0123456789', '0123456789'],
    ];
  }
}

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testStringTrimmedOnlyWhereNecessary', { case: SupportStrTest }, async function () {
  this.assertSame(' Taylor Otwell ', Str.words(' Taylor Otwell ', 3));
  this.assertSame(' Taylor...', Str.words(' Taylor Otwell ', 1));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testStrContains', { case: SupportStrTest, dataset: SupportStrTest.strContainsProvider() }, async function (haystack: unknown, needles: unknown, expected: unknown, ignoreCase: unknown = false) {
  this.assertEquals(expected, Str.contains(haystack, needles, ignoreCase));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testIsUuidWithValidUuid', { case: SupportStrTest, dataset: SupportStrTest.validUuidList() }, async function (uuid: unknown) {
  this.assertTrue(Str.isUuid(uuid));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testIsUuidWithInvalidUuid', { case: SupportStrTest, dataset: SupportStrTest.invalidUuidList() }, async function (uuid: unknown) {
  this.assertFalse(Str.isUuid(uuid));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testIsUuidWithVersion', { case: SupportStrTest, dataset: SupportStrTest.uuidVersionList() }, async function (uuid: unknown, version: unknown, passes: unknown) {
  this.assertSame(Str.isUuid(uuid, version), passes);
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testIsUlid', { case: SupportStrTest }, async function () {
  this.assertTrue(Str.isUlid(toPhpString(Str.ulid())));
  this.assertTrue(Str.isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV'));

  this.assertFalse(Str.isUlid('not-a-ulid'));
  this.assertFalse(Str.isUlid('01ARZ3NDEKTSV4RRFFQ69G5FA'));
  this.assertFalse(Str.isUlid(null));
  this.assertFalse(Str.isUlid(['not', 'a', 'ulid']));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testSnake', { case: SupportStrTest }, async function () {
  this.assertSame('laravel_p_h_p_framework', Str.snake('LaravelPHPFramework'));
  this.assertSame('laravel_php_framework', Str.snake('LaravelPhpFramework'));
  this.assertSame('laravel php framework', Str.snake('LaravelPhpFramework', ' '));
  this.assertSame('laravel_php_framework', Str.snake('Laravel Php Framework'));
  this.assertSame('laravel_php_framework', Str.snake('Laravel    Php      Framework   '));
  // ensure cache keys don't overlap
  this.assertSame('laravel__php__framework', Str.snake('LaravelPhpFramework', '__'));
  this.assertSame('laravel_php_framework_', Str.snake('LaravelPhpFramework_', '_'));
  this.assertSame('laravel_php_framework', Str.snake('laravel php Framework'));
  this.assertSame('laravel_php_frame_work', Str.snake('laravel php FrameWork'));
  // prevent breaking changes
  this.assertSame('foo-bar', Str.snake('foo-bar'));
  this.assertSame('foo-_bar', Str.snake('Foo-Bar'));
  this.assertSame('foo__bar', Str.snake('Foo_Bar'));
  this.assertSame('żółtałódka', Str.snake('ŻółtaŁódka'));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testTransliterate', { case: SupportStrTest, dataset: SupportStrTest.specialCharacterProvider() }, async function (value: string, expected: string) {
  this.assertSame(expected, Str.transliterate(value));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testItCanFreezeUuidsInAClosure', { case: SupportStrTest }, async function () {
  const uuids: unknown[] = [];

  const uuid = Str.freezeUuids((uuid: unknown) => {
    uuids.push(uuid);
    uuids.push(Str.uuid());
    uuids.push(Str.uuid());
  });

  this.assertSame(uuid, uuids[0]);
  this.assertSame(toPhpString(uuid), toPhpString(uuids[0]));
  this.assertSame(toPhpString(uuids[0]), toPhpString(uuids[1]));
  this.assertSame(uuids[0], uuids[1]);
  this.assertSame(toPhpString(uuids[0]), toPhpString(uuids[1]));
  this.assertSame(uuids[1], uuids[2]);
  this.assertSame(toPhpString(uuids[1]), toPhpString(uuids[2]));
  this.assertNotSame(Str.uuid(), Str.uuid());
  this.assertNotSame(toPhpString(Str.uuid()), toPhpString(Str.uuid()));

  Str.createUuidsNormally();
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testItCreatesUuidsNormallyAfterFailureWithinFreezeMethod', { case: SupportStrTest }, async function () {
  try {
    Str.freezeUuids(() => {
      Str.createUuidsUsing(() => Str.of('1234'));
      this.assertSame('1234', Str.uuid().toString());
      throw new Exception('Something failed.');
    });
  } catch (e) {
    if (!(e instanceof Exception)) {
      throw e;
    }
    this.assertNotSame('1234', Str.uuid().toString());
  }
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testItCanSpecifyAFallbackForASequence', { case: SupportStrTest }, async function () {
  Str.createUuidsUsingSequence([Str.uuid(), Str.uuid()], () => {
    throw new Exception('Out of Uuids.');
  });
  Str.uuid();
  Str.uuid();

  try {
    this.expectExceptionObject(new Exception('Out of Uuids.'));
    Str.uuid();
    this.fail();
  } finally {
    Str.createUuidsNormally();
  }
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testPasswordReturnsExactLengthWhenBelowPoolCount', { case: SupportStrTest }, async function () {
  this.assertSame(1, strlen(Str.password(1)));
  this.assertSame(2, strlen(Str.password(2)));
  this.assertSame(3, strlen(Str.password(3)));
});

portedTest('Illuminate\\Tests\\Support\\SupportStrTest::testReplaceMatches', { case: SupportStrTest }, async function () {
  // Test basic string replacement
  this.assertSame('foo bar bar', Str.replaceMatches(/baz/, 'bar', 'foo baz bar')); // adapted:DIV-10.1
  this.assertSame('foo baz baz', Str.replaceMatches(/404/, 'found', 'foo baz baz')); // adapted:DIV-10.1

  // Test with array of patterns
  this.assertSame('foo XXX YYY', Str.replaceMatches([/bar/, /baz/], ['XXX', 'YYY'], 'foo bar baz')); // adapted:DIV-10.1

  // Test with callback
  let result = Str.replaceMatches(/ba(.)/, (match: unknown[]) => { // adapted:DIV-10.1
    return 'ba' + toPhpString(strtoupper(match[1]));
  }, 'foo baz bar');

  this.assertSame('foo baZ baR', result);

  result = Str.replaceMatches(/(\d+)/, (match: unknown[]) => { // adapted:DIV-10.1
    return toInt(match[1]) * 2;
  }, 'foo 123 bar 456');

  this.assertSame('foo 246 bar 912', result);

  // Test with limit parameter
  this.assertSame('foo baz baz', Str.replaceMatches(/ba(.)/, 'ba$1', 'foo baz baz', 1)); // adapted:DIV-10.1

  result = Str.replaceMatches(/ba(.)/, (match: unknown[]) => { // adapted:DIV-10.1
    return 'ba' + toPhpString(strtoupper(match[1]));
  }, 'foo baz baz bar', 1);

  this.assertSame('foo baZ baz bar', result);
});
