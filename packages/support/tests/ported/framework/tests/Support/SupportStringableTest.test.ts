// pilot/porting: Story 8.7 pilot translation, never merged
import { portedTest, TestCase } from "@xaravel/assert";
import { Stringable, tap } from "@xaravel/support";
import { strtoupper, toPhpString } from "@xaravel/runtime/php";

class SupportStringableTest extends TestCase {
  /**
   * @param  string  $string
   * @return \Illuminate\Support\Stringable
   */
  stringable(string: string = ''): Stringable {
    return new Stringable(string);
  }
}

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testCounted', { case: SupportStringableTest }, async function () {
  this.assertSame('1 order', toPhpString(this.stringable('order').counted(1)));
  this.assertSame('2 orders', toPhpString(this.stringable('order').counted(2)));
  this.assertSame('0 orders', toPhpString(this.stringable('order').counted(0)));
  this.assertSame('1,000 orders', toPhpString(this.stringable('order').counted(1000)));
  this.assertSame('1 order', toPhpString(this.stringable('order').counted(['a'])));
  this.assertSame('2 orders', toPhpString(this.stringable('order').counted(['a', 'b'])));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testWhenIs', { case: SupportStringableTest }, async function () {
  this.assertSame('Winner: /', toPhpString(this.stringable('/').whenIs('/', (stringable: Stringable) => {
    return stringable.prepend('Winner: ');
  }, (stringable: Stringable) => {
    return 'Try again';
  })));

  this.assertSame('/', toPhpString(this.stringable('/').whenIs(' /', (stringable: Stringable) => {
    return stringable.prepend('Winner: ');
  })));

  this.assertSame('Try again', toPhpString(this.stringable('/').whenIs(' /', (stringable: Stringable) => {
    return stringable.prepend('Winner: ');
  }, (stringable: Stringable) => {
    return 'Try again';
  })));

  this.assertSame('Winner: foo/bar/baz', toPhpString(this.stringable('foo/bar/baz').whenIs('foo/*', (stringable: Stringable) => {
    return stringable.prepend('Winner: ');
  })));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testWhenTest', { case: SupportStringableTest }, async function () {
  this.assertSame('Winner: foo bar', toPhpString(this.stringable('foo bar').whenTest(/bar/, (stringable: Stringable) => { // adapted:DIV-10.1
    return stringable.prepend('Winner: ');
  }, (stringable: Stringable) => {
    return 'Try again';
  })));

  this.assertSame('Try again', toPhpString(this.stringable('foo bar').whenTest(/link/, (stringable: Stringable) => { // adapted:DIV-10.1
    return stringable.prepend('Winner: ');
  }, (stringable: Stringable) => {
    return 'Try again';
  })));

  this.assertSame('foo bar', toPhpString(this.stringable('foo bar').whenTest(/link/, (stringable: Stringable) => { // adapted:DIV-10.1
    return stringable.prepend('Winner: ');
  })));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testWhenEmpty', { case: SupportStringableTest }, async function () {
  tap(this.stringable(), (stringable: Stringable) => {
    this.assertSame(stringable, stringable.whenEmpty(() => {
      //
    }));
  });

  this.assertSame('empty', toPhpString(this.stringable().whenEmpty(() => {
    return 'empty';
  })));

  this.assertSame('not-empty', toPhpString(this.stringable('not-empty').whenEmpty(() => {
    return 'empty';
  })));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testTransliterate', { case: SupportStringableTest }, async function () {
  this.assertSame('HHH', toPhpString(this.stringable('🎂🚧🏆').transliterate('H')));
  this.assertSame('Hello', toPhpString(this.stringable('🎂').transliterate('Hello')));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testBeforeLast', { case: SupportStringableTest }, async function () {
  this.assertSame('yve', toPhpString(this.stringable('yvette').beforeLast('tte')));
  this.assertSame('yvet', toPhpString(this.stringable('yvette').beforeLast('t')));
  this.assertSame('ééé ', toPhpString(this.stringable('ééé yvette').beforeLast('yve')));
  this.assertSame('', toPhpString(this.stringable('yvette').beforeLast('yve')));
  this.assertSame('yvette', toPhpString(this.stringable('yvette').beforeLast('xxxx')));
  this.assertSame('yvette', toPhpString(this.stringable('yvette').beforeLast('')));
  this.assertSame('yv0et', toPhpString(this.stringable('yv0et0te').beforeLast('0')));
  this.assertSame('yv0et', toPhpString(this.stringable('yv0et0te').beforeLast(0)));
  this.assertSame('yv2et', toPhpString(this.stringable('yv2et2te').beforeLast(2)));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testChopEnd', { case: SupportStringableTest }, async function () {
  this.assertSame('path/to/file', toPhpString(this.stringable('path/to/file.php').chopEnd('.php')));
  this.assertSame('path/to/file.php', toPhpString(this.stringable('path/to/file.php').chopEnd('.html')));
  this.assertSame('path/to/file', toPhpString(this.stringable('path/to/file.php').chopEnd(['.html', '.php'])));
});

portedTest('Illuminate\\Tests\\Support\\SupportStringableTest::testReplaceMatches', { case: SupportStringableTest }, async function () {
  let stringable = this.stringable('Hello world!');
  let result = stringable.replaceMatches(/world/, (match: string[]) => { // adapted:DIV-10.1
    return strtoupper(match[0]);
  });

  this.assertSame('Hello WORLD!', result.value()); // adapted:DIV-12.2

  stringable = this.stringable('apple orange apple');
  result = stringable.replaceMatches(/apple/, 'fruit', 1); // adapted:DIV-10.1

  this.assertSame('fruit orange apple', result.value()); // adapted:DIV-12.2
});
