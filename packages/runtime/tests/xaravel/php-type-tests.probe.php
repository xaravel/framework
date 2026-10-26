<?php
// The PHP 8.5.11 evidence for XT-runtime-62..66 (php-type-tests.test.ts), action item
// epic-14-item-3-runtime-type-tests-functions. Each line is `<label>\t<json_encode(value)>`; XT-runtime-67 computes
// every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-type-tests.probe.php > php-type-tests.probe.txt

namespace XaravelFixture\PhpTypeTests {
    class Invokable
    {
        public function __invoke()
        {
            return 'invoked';
        }
    }

    class Methods
    {
        public function m()
        {
            return 'm';
        }

        public static function s()
        {
            return 's';
        }
    }

    class OnlyCall
    {
        public function __call($name, $arguments)
        {
            return $name;
        }
    }

    class OnlyCallStatic
    {
        public static function __callStatic($name, $arguments)
        {
            return $name;
        }
    }

    class Counted implements \Countable
    {
        public function count(): int
        {
            return 3;
        }
    }

    class CountedText implements \Countable
    {
        #[\ReturnTypeWillChange]
        public function count()
        {
            return '7 apples';
        }
    }

    class Text
    {
        public function __toString(): string
        {
            return 'text';
        }
    }

    class Base
    {
        protected function hidden($a, $b = 'B')
        {
            return [static::class, $a, $b];
        }

        public static function make($x)
        {
            return [static::class, $x];
        }
    }

    class Child extends Base
    {
    }

    class Other
    {
    }

    class MyException extends \LogicException
    {
    }

    enum Pure
    {
        case A;
    }

    enum Backed: string
    {
        case A = 'a';
    }
}

namespace {
    use XaravelFixture\PhpTypeTests\Backed;
    use XaravelFixture\PhpTypeTests\Base;
    use XaravelFixture\PhpTypeTests\Child;
    use XaravelFixture\PhpTypeTests\Counted;
    use XaravelFixture\PhpTypeTests\CountedText;
    use XaravelFixture\PhpTypeTests\Invokable;
    use XaravelFixture\PhpTypeTests\Methods;
    use XaravelFixture\PhpTypeTests\MyException;
    use XaravelFixture\PhpTypeTests\OnlyCall;
    use XaravelFixture\PhpTypeTests\OnlyCallStatic;
    use XaravelFixture\PhpTypeTests\Other;
    use XaravelFixture\PhpTypeTests\Pure;
    use XaravelFixture\PhpTypeTests\Text;

    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n";
    }

    function thrown(callable $f): ?string
    {
        try {
            $f();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
        return null;
    }

    /** The result of `$f`, or what it throws. */
    function attempt(callable $f): mixed
    {
        try {
            return $f();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
    }

    // XT-runtime-62: type tests and instanceof.
    $values = [[], ['a' => 1], [5 => 1], new stdClass(), function () {}, 1.0, 's', null, 'Traversable', 1, true];
    out('types', array_map(fn ($v) => [is_array($v), is_object($v), is_string($v)], $values));
    out('is_iterable', array_map('is_iterable', [[1], new ArrayIterator([]), (function () { yield 1; })(), new stdClass(), 's', 'Traversable', ['a' => 1]]));
    out('instanceof.closure', [function () {} instanceof Closure, (fn () => 1) instanceof Closure, (static function () {}) instanceof Closure, new stdClass() instanceof Closure]);
    out('instanceof.enum', [Pure::A instanceof UnitEnum, Backed::A instanceof UnitEnum, Pure::A instanceof BackedEnum, Backed::A instanceof BackedEnum, new stdClass() instanceof UnitEnum]);
    out('instanceof.array_access', [new ArrayObject([]) instanceof ArrayAccess, new ArrayIterator([]) instanceof ArrayAccess, new stdClass() instanceof ArrayAccess]);
    out('instanceof.generator', [(function () { yield 1; })() instanceof Generator, new ArrayIterator([]) instanceof Generator]);
    out('new_closure', thrown(fn () => new Closure()));
    out('interface_exists', [interface_exists('ArrayAccess'), interface_exists('UnitEnum'), interface_exists('BackedEnum'), interface_exists('Closure'), class_exists('Closure')]);

    // XT-runtime-63: is_a and is_callable.
    $ao = new ArrayObject([]);
    out('is_a.object', [is_a($ao, 'ArrayObject'), is_a($ao, 'arrayobject'), is_a($ao, '\\ArrayObject'), is_a($ao, 'Traversable'), is_a($ao, 'IteratorAggregate'), is_a($ao, 'ArrayAccess'), is_a($ao, 'Nope'), is_a($ao, 'Iterator'), is_a($ao, 'ArrayIterator')]);
    out('is_a.string', [is_a('ArrayIterator', 'Traversable'), is_a('ArrayIterator', 'Traversable', true), is_a('ArrayIterator', 'ArrayIterator', true), is_a('Nope', 'Nope', true), is_a('arrayiterator', 'Iterator', true), is_a('ArrayIterator', 'ArrayObject', true)]);
    out('is_a.exception', [is_a(new MyException(), 'LogicException'), is_a(new MyException(), 'Exception'), is_a(new MyException(), 'Throwable'), is_a(new MyException(), 'RuntimeException'), is_a(new LogicException(), MyException::class), is_a(MyException::class, 'Exception', true), is_a(MyException::class, 'Throwable', true)]);
    out('is_a.enum', [is_a(Pure::A, 'UnitEnum'), is_a(Pure::A, 'BackedEnum'), is_a(Backed::A, 'BackedEnum'), is_a(Pure::class, 'UnitEnum', true), is_a(Backed::class, 'BackedEnum', true), is_a(Pure::class, 'BackedEnum', true), is_a(Pure::A, Pure::class)]);
    out('is_a.interface', [is_a('Iterator', 'Traversable', true), is_a('Iterator', 'Iterator', true), is_a('Traversable', 'Iterator', true), is_a('BackedEnum', 'UnitEnum', true), is_a('Iterator', 'Traversable')]);
    out('is_a.closure', [is_a(function () {}, 'Closure'), is_a(function () {}, 'closure'), is_a(new stdClass(), 'Closure'), is_a(1, 'stdClass'), is_a(null, 'stdClass'), is_a(new stdClass(), 'stdClass', 'yes')]);
    out('is_a.errors', [thrown(fn () => is_a(new stdClass(), [])), thrown(fn () => is_a(new stdClass(), 'stdClass', []))]);
    // A closure's callable name is `{closure:<file>:<line>}` in PHP 8.5, which the runtime cannot give.
    out('is_callable.closure', [is_callable(function () {}), is_callable(fn () => 1, true)]);
    $callables = [
        new Invokable(),
        [new Methods(), 'm'],
        [new Methods(), 's'],
        [new Methods(), 'missing'],
        [new OnlyCall(), 'missing'],
        [new OnlyCallStatic(), 'missing'],
        [Methods::class, 's'],
        [Methods::class, 'm'],
        [Methods::class, 'missing'],
        [OnlyCallStatic::class, 'missing'],
        [OnlyCall::class, 'missing'],
        Methods::class . '::s',
        Methods::class . '::m',
        'Nope::x',
        ['Nope', 'x'],
        [1, 2],
        [new Methods()],
        [1 => 'm', 0 => new Methods()],
        ['a' => new Methods(), 'b' => 'm'],
        [new Methods(), 'm', 'x'],
        new stdClass(),
        5,
        null,
        1.5,
        true,
        'Traversable',
    ];
    out('is_callable', array_map(function ($v) {
        $plain = is_callable($v, false, $name);
        $syntax = is_callable($v, true);
        return [$plain, $syntax, $name];
    }, $callables));
    $closure = function () {};
    out('is_callable.closure_array', array_map(function ($v) {
        $plain = is_callable($v, false, $name);
        return [$plain, is_callable($v, true), $name];
    }, [[$closure, '__invoke'], [$closure, 'call'], [$closure, 'nope'], [$closure, 'BIND']]));
    out('is_callable.strings', array_map(function ($v) {
        $plain = is_callable($v, false, $name);
        return [$plain, is_callable($v, true), $name];
    }, ['\\' . Methods::class . '::s', Methods::class . '::', OnlyCallStatic::class . '::']));
    out('is_callable.errors', [thrown(fn () => is_callable('x', []))]);

    // XT-runtime-64: sprintf, implode, explode.
    out('sprintf.basic', [
        sprintf('%s %d %u %f %.2f %F %e %E %g %G %x %X %o %b %c %%', 'a', 42, 7, 1.5, 3.14159, 2.5, 1234.5678, 0.000123, 0.0001234, 1e20, 255, 255, 8, 5, 65),
        sprintf('[%5s][%-5s|][%05d][%+d][%+d][%\'*8s][%-05d][%-05s]', 'ab', 'ab', 42, 5, -5, 'x', 5, 'x'),
        sprintf('%1$s %2$s %1$s', 'a', 'b'),
        sprintf('%.3e|%10.4f|%-10.2f|%010.3f|%+.1f|%+05d', 12345.6789, 3.14159265, 2.5, -3.14159, 0, -42),
        sprintf('[%*d][%-*d][%.*f][%2$*1$d]', 5, 42, 6, 7, 2, 1.23456),
        sprintf('%u|%d|%x|%b|%o', -1, 3.99, -1, -1, -1),
        sprintf('%s|%s|%s|%s|%s|%s|%d|%d', true, false, null, [1], 1.0, 0.1 + 0.2, '12abc', '1e3'),
        sprintf('%.2f|%.0f|%.0f|%.0f|%.0e|%.2f|%.1f|%f|%e', 0.125, 0.5, 1.5, 2.5, 2.5, 0.375, 0.05, -0.0, 0),
        sprintf('%g|%g|%g|%g|%g|%g|%G|%.3g|%.10g|%g', 100000, 1000000, 0.0001, 0.00001, 1.5, -0.0, 1e-10, 3.14159, 1 / 3, 0),
        sprintf('%f|%e|%g|%f|%F|%5.1f|%d', INF, -INF, NAN, -INF, NAN, INF, INF),
        sprintf('%.60f|%.1f|%f|%.15e', 0.1, 1e300, 123456789012345678901234567890.0, 1 / 3),
        sprintf('%5.2s|%.0s|%-6.3s|', 'abcdef', 'abc', 'abcdef'),
        sprintf('%5ld|%\'x-6d|%3c', 7, 3, 66),
        sprintf('%s', new Text()),
        sprintf('héllo %s %5s', 'wörld', 'é'),
        sprintf('%.2x|%5.1x|%.3b', 255, 255, 5),
        sprintf('%h|%H|%.3h', 1e20, 0.00001234, 1234.5678),
        sprintf('no conversions'),
        sprintf(''),
    ]);
    out('sprintf.errors', [
        thrown(fn () => sprintf('%s %s', 'a')),
        thrown(fn () => sprintf('%y', 1)),
        thrown(fn () => sprintf('%y')),
        thrown(fn () => sprintf('abc%', 1)),
        thrown(fn () => sprintf('abc%')),
        thrown(fn () => sprintf('%0$s', 1)),
        thrown(fn () => sprintf('%3$s', 1)),
        thrown(fn () => sprintf('%*d', 'x', 1)),
        thrown(fn () => sprintf('%*d', -1, 1)),
        thrown(fn () => sprintf('%.*f', 1.5, 1)),
        thrown(fn () => sprintf('%.*f', -2, 1)),
        thrown(fn () => sprintf('%.*f', -1, 1)),
        thrown(fn () => sprintf('%.*g', -1, 1.5)),
        thrown(fn () => sprintf("%'", 1)),
        thrown(fn () => sprintf('%s', new stdClass())),
        thrown(fn () => sprintf('%9999999999d', 1)),
        thrown(fn () => sprintf('%*d')),
        thrown(fn () => sprintf('%.9999999999f', 1)),
    ]);
    out('implode', [
        implode(',', [1, 1.5, true, false, null, 'a']),
        implode([1, 2]),
        implode(',', [new Text(), 'b']),
        implode(',', [[1], 'b']),
        implode(', ', []),
        implode('-', ['x' => 1, 'y' => 2]),
        implode(5, [1, 2]),
        implode(',', [0.1 + 0.2, 1e100, -0.0, 100.0]),
    ]);
    out('implode.errors', [
        thrown(fn () => implode(',')),
        thrown(fn () => implode([1], ',')),
        thrown(fn () => implode(',', 5)),
        thrown(fn () => implode(new stdClass(), [1])),
        thrown(fn () => implode(',', [new stdClass()])),
        thrown(fn () => implode(['a'], null)),
        thrown(fn () => implode(',', null)),
        thrown(fn () => implode(5)),
    ]);
    out('explode', [
        explode(',', 'a,b,,c'),
        explode(',', 'a,b,c', 2),
        explode(',', 'a,b,c', -1),
        explode(',', 'a,b,c', 0),
        explode(',', 'a,b,c', 1),
        explode('|', 'a,b'),
        explode('|', 'a,b', -1),
        explode(',', ''),
        explode(',', '', -1),
        explode(',', 'a,b,c', -5),
        explode('ab', 'xabyabz'),
        explode(',', ',a,'),
        explode(1, '01210'),
        explode('é', 'aébéc'),
    ]);
    out('explode.errors', [thrown(fn () => explode('', 'a')), thrown(fn () => explode([], 'a')), thrown(fn () => explode(',', 'a', 'x'))]);

    // XT-runtime-65: the array functions, count, abs.
    out('array_map.one', [
        array_map(fn ($v) => $v * 2, ['a' => 1, 3 => 2, 'b' => 3]),
        array_map(fn ($v) => $v . '!', [5 => 'x', 6 => 'y']),
        array_map(null, ['a' => 1, 2]),
        array_map(fn ($v) => $v, []),
        array_map(new Invokable(), [1]),
    ]);
    out('array_map.many', [
        array_map(fn ($a, $b) => [$a, $b], [1, 2, 3], ['x' => 'a']),
        array_map(null, [1, 2], ['a', 'b', 'c']),
        array_map(null, ['k' => 1], ['j' => 2]),
        array_map(fn ($a, $b, $c) => $a . $b . $c, ['a'], ['b'], ['c', 'd']),
    ]);
    out('array_map.errors', [
        thrown(fn () => array_map(fn ($v) => $v, 5)),
        thrown(fn () => array_map(fn ($v) => $v, [1], 5)),
        thrown(fn () => array_map(null, [1], [2], 'x')),
        thrown(fn () => array_map(5, [1])),
    ]);
    out('array_keys', [
        array_keys(['a' => 1, 'b' => '1', 'c' => 2, 5 => 1]),
        array_keys(['a' => 1, 'b' => '1', 'c' => 2, 5 => 1], 1),
        array_keys(['a' => 1, 'b' => '1', 'c' => 2, 5 => 1], 1, true),
        array_keys(['a' => null, 'b' => 0, 'c' => ''], null),
        array_keys(['a' => null, 'b' => 0, 'c' => ''], null, true),
        array_keys([]),
    ]);
    out('array_values', [array_values(['a' => 1, 5 => 2, 'c' => [3]]), array_values([])]);
    out('array_key_exists', [
        array_key_exists('a', ['a' => null]),
        array_key_exists(null, ['' => 1]),
        array_key_exists(1.5, [1 => 'x']),
        array_key_exists(true, [1 => 'x']),
        array_key_exists(false, [0 => 'x']),
        array_key_exists('1', [1 => 'x']),
        array_key_exists(1, ['1' => 'x']),
        array_key_exists('01', [1 => 'x']),
        array_key_exists('b', ['a' => 1]),
        array_key_exists(0, []),
    ]);
    out('array_key_exists.errors', [thrown(fn () => array_key_exists([], [])), thrown(fn () => array_key_exists(new stdClass(), [])), thrown(fn () => array_key_exists('a', 5))]);
    out('array_key_first_last', [array_key_first(['x' => 1, 5 => 2]), array_key_last(['x' => 1, 5 => 2]), array_key_first([]), array_key_last([]), array_key_first([7]), thrown(fn () => array_key_first('x'))]);
    out('array_merge', [
        array_merge(),
        array_merge([5 => 'a', 9 => 'b'], [3 => 'c']),
        array_merge(['a' => 1, 'b' => 2], ['a' => 3, 7 => 4]),
        array_merge(['x' => 1], [], ['y' => 2, 'x' => 9]),
        array_merge([3 => 'a']),
        thrown(fn () => array_merge([1], 5)),
        thrown(fn () => array_merge('x')),
    ]);
    out('count', [
        count([1, [2, 3]]),
        count([1, [2, 3]], COUNT_RECURSIVE),
        count([1, [2, [3, 4]], 'a' => []], 1),
        count(new ArrayObject([1, 2, 3])),
        count(new Counted()),
        count(new CountedText()),
        count([]),
        count(['a' => 1], '1'),
        COUNT_NORMAL,
        COUNT_RECURSIVE,
    ]);
    out('count.errors', [
        thrown(fn () => count(1)),
        thrown(fn () => count('abc')),
        thrown(fn () => count(null)),
        thrown(fn () => count(new stdClass())),
        thrown(fn () => count([], 5)),
        thrown(fn () => count([], 'x')),
    ]);
    out('abs', [abs(-5), abs(-1.5), abs(-0.0), abs('-3'), abs('-3.5'), abs(PHP_INT_MIN), abs(PHP_INT_MAX), abs(5), abs(true), abs(null), abs(-2.0)]);
    out('abs.errors', [thrown(fn () => abs('x')), thrown(fn () => abs([])), thrown(fn () => abs('1x'))]);
    out('aliases', [get_debug_type(1.5), get_debug_type(new ArrayObject([])), get_debug_type(function () {}), get_debug_type(null), json_last_error()]);

    // XT-runtime-66: ReflectionMethod::invoke, invokeArgs and setAccessible.
    $hidden = new ReflectionMethod(Base::class, 'hidden');
    $make = new ReflectionMethod(Child::class, 'make');
    out('reflection.invoke', [
        $hidden->invoke(new Base(), 1),
        $hidden->invoke(new Child(), 1, 2),
        $hidden->invokeArgs(new Child(), [5]),
        $hidden->invokeArgs(new Base(), [3 => 'x', 1 => 'y']),
        $make->invoke(null, 'n'),
        $make->invoke(new Other(), 'o'),
        $make->invokeArgs(null, ['a']),
        (new ReflectionMethod(Base::class, 'make'))->invoke(null, 'b'),
        (new ReflectionMethod(new Child(), 'make'))->invoke(null, 'c'),
        $hidden->setAccessible(true),
        $hidden->setAccessible(false),
    ]);
    out('reflection.errors', [
        thrown(fn () => $hidden->invoke(null, 1)),
        thrown(fn () => $hidden->invoke(new Other(), 1)),
        thrown(fn () => $hidden->invokeArgs(null, [1])),
        thrown(fn () => (new ReflectionMethod(Child::class, 'hidden'))->invoke(new Base(), 1)),
        thrown(fn () => $hidden->invoke(5)),
        thrown(fn () => $hidden->invokeArgs(new Base(), 5)),
        thrown(fn () => $hidden->invokeArgs(5, [])),
        thrown(fn () => $hidden->setAccessible([])),
    ]);
}
