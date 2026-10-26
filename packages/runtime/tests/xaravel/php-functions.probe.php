<?php
// The PHP 8.5.11 evidence for XT-runtime-57..60 (php-functions.test.ts), action item
// epic-14-item-2-runtime-generators-functions. Each line is `<label>\t<json_encode(value)>`; XT-runtime-61 computes
// every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-functions.probe.php > php-functions.probe.txt

namespace XaravelFixture\PhpFunctions {
    class Visibility
    {
        public $a = 1;
        protected $b = 2;
        private $c = 3;
    }

    class Aggregate implements \IteratorAggregate
    {
        public function __construct(private $inner)
        {
        }

        public function getIterator(): \Traversable
        {
            return $this->inner;
        }
    }

    class BadAggregate implements \IteratorAggregate
    {
        #[\ReturnTypeWillChange]
        public function getIterator()
        {
            return [1];
        }
    }

    class Text
    {
        public function __toString(): string
        {
            return 'text';
        }
    }

    class SelfAggregate implements \IteratorAggregate
    {
        public function getIterator(): \Traversable
        {
            return $this;
        }
    }

    class OneIterator implements \Iterator
    {
        private $i = 0;

        #[\ReturnTypeWillChange]
        public function current()
        {
            return $this->i * 10;
        }

        #[\ReturnTypeWillChange]
        public function key()
        {
            return $this->i;
        }

        #[\ReturnTypeWillChange]
        public function next()
        {
            $this->i++;
        }

        #[\ReturnTypeWillChange]
        public function rewind()
        {
            $this->i = 0;
        }

        #[\ReturnTypeWillChange]
        public function valid()
        {
            return $this->i < 3 ? 1 : 0;
        }
    }

    enum Suit
    {
        case Hearts;
        case Spades;
    }
}

namespace {
    use XaravelFixture\PhpFunctions\Aggregate;
    use XaravelFixture\PhpFunctions\BadAggregate;
    use XaravelFixture\PhpFunctions\OneIterator;
    use XaravelFixture\PhpFunctions\SelfAggregate;
    use XaravelFixture\PhpFunctions\Suit;
    use XaravelFixture\PhpFunctions\Text;
    use XaravelFixture\PhpFunctions\Visibility;

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

    /** The [key, value] pairs of a foreach. */
    function pairs(iterable $it): array
    {
        $pairs = [];
        foreach ($it as $k => $v) {
            $pairs[] = [$k, $v];
        }
        return $pairs;
    }

    // XT-runtime-57: keyed generators, yield from and Generator.
    out('gen.auto_keys', pairs((function () {
        yield 'a';
        yield 5 => 'b';
        yield 'c';
        yield 'x' => 'd';
        yield 'e';
        yield -9 => 'f';
        yield 'g';
    })()));
    out('gen.negative_then_auto', pairs((function () {
        yield -5 => 'a';
        yield 'b';
    })()));
    out('gen.int_max_wrap', pairs((function () {
        yield PHP_INT_MAX => 'a';
        yield 'b';
    })()));
    out('gen.float_and_string_keys', pairs((function () {
        yield 1.5 => 'a';
        yield 'b';
        yield '7' => 'c';
        yield 'd';
        yield 2.0 => 'e';
        yield 'f';
    })()));
    out('gen.bare_yield', pairs((function () {
        yield;
    })()));
    out('yieldFrom.array', pairs((function () {
        yield 1;
        yield from [5 => 'x', 'y'];
        yield 2;
    })()));
    out('yieldFrom.return', [
        pairs((function () {
            $r = yield from (function () {
                yield 1;
                return 'R';
            })();
            yield 'r' => $r;
        })()),
        pairs((function () {
            $r = yield from [1];
            yield 'r' => $r;
        })()),
        pairs((function () {
            $r = yield from new ArrayIterator(['a' => 1]);
            yield 'r' => $r;
        })()),
        pairs((function () {
            $r = yield from new Aggregate(new Aggregate(new ArrayIterator(['n' => 2])));
            yield 'r' => $r;
        })()),
    ]);
    out('yieldFrom.started', (function () {
        $inner = (function () {
            yield 1;
            yield 2;
            yield 3;
        })();
        $inner->current();
        $inner->next();
        $outer = (function () use ($inner) {
            yield from $inner;
            yield 'end';
        })();
        return [pairs($outer), $inner->valid()];
    })());
    out('yieldFrom.fresh_returning', pairs((function () {
        $r = yield from (function () {
            return 'early';
            yield;
        })();
        yield 'r' => $r;
    })()));
    out('yieldFrom.send', (function () {
        $inner = (function () {
            $x = yield 1;
            yield 'got' => $x;
            return 'done';
        })();
        $outer = (function () use ($inner) {
            $r = yield from $inner;
            yield 'r' => $r;
        })();
        $first = [$outer->key(), $outer->current()];
        $sent = $outer->send('S');
        $second = [$outer->key(), $outer->current(), $inner->key(), $inner->current()];
        $outer->next();
        return [$first, $sent, $second, [$outer->key(), $outer->current(), $inner->valid(), $inner->getReturn()]];
    })());
    out('yieldFrom.errors', (function () {
        $closed = (function () {
            yield 1;
            return 2;
        })();
        foreach ($closed as $_) {
        }
        $threw = (function () {
            throw new LogicException('boom');
            yield;
        })();
        try {
            $threw->current();
        } catch (LogicException) {
        }
        $self = null;
        $self = (function () use (&$self) {
            yield 1;
            yield from $self;
        })();
        return [
            thrown(fn () => iterator_to_array((function () {
                yield from 5;
            })())),
            thrown(fn () => iterator_to_array((function () use ($closed) {
                yield from $closed;
            })())),
            thrown(fn () => iterator_to_array((function () use ($threw) {
                yield from $threw;
            })())),
            thrown(function () use ($self) {
                foreach ($self as $_) {
                }
            }),
            thrown(fn () => iterator_to_array((function () {
                yield from new BadAggregate();
            })())),
        ];
    })());
    out('generator.methods', (function () {
        $log = [];
        $g = (function () use (&$log) {
            $x = yield 1;
            $log[] = $x;
            $y = yield 2;
            $log[] = $y;
            return 3;
        })();
        $sent = $g->send('S');
        $before = thrown(fn () => $g->getReturn());
        $g->next();
        return [$sent, $log, $before, [$g->valid(), $g->current(), $g->key(), $g->getReturn()]];
    })());
    out('generator.fresh_next', (function () {
        $g = (function () {
            yield 1;
            yield 2;
            yield 3;
        })();
        $g->next();
        return [$g->key(), $g->current()];
    })());
    out('generator.fresh_send', (function () {
        $log = [];
        $g = (function () use (&$log) {
            $log[] = 'started';
            $x = yield 1;
            $log[] = $x;
            yield 2;
        })();
        $sent = $g->send('v');
        return [$sent, $log];
    })());
    out('generator.rewind', (function () {
        $g = (function () {
            yield 1;
            yield 2;
        })();
        $atFirst = thrown(fn () => $g->rewind());
        $g->current();
        $again = thrown(fn () => $g->rewind());
        $g->next();
        return [$atFirst, $again, thrown(fn () => $g->rewind()), thrown(fn () => pairs($g))];
    })());
    out('generator.closed', (function () {
        $g = (function () {
            yield 1;
        })();
        $first = pairs($g);
        return [$first, thrown(fn () => pairs($g)), thrown(fn () => iterator_to_array($g)), thrown(fn () => iterator_count($g)), $g->send('x')];
    })());
    out('generator.running', (function () {
        $g = null;
        $g = (function () use (&$g) {
            $first = thrown(fn () => $g->current());
            yield $first;
            yield thrown(fn () => $g->next());
            yield [$g->current(), $g->valid(), thrown(fn () => $g->send(1)), thrown(fn () => $g->getReturn())];
        })();
        return iterator_to_array($g, false);
    })());
    out('generator.serialize', (function () {
        $g = (function () {
            yield 1;
        })();
        return [thrown(fn () => serialize($g)), thrown(fn () => unserialize('O:9:"Generator":0:{}')), json_encode($g), (array) $g];
    })());
    out('generator.new', thrown(fn () => new Generator()));
    out('generator.return_first', (function () {
        $f = function () {
            return 7;
            yield;
        };
        $g = $f();
        $return = $g->getReturn();
        $rewind = thrown(fn () => $g->rewind());
        $h = $f();
        return [$return, $rewind, $g->valid(), pairs($h), thrown(fn () => pairs($h))];
    })());
    out('generator.throws', (function () {
        $g = (function () {
            yield 1;
            throw new LogicException('boom');
        })();
        $current = $g->current();
        $error = thrown(fn () => $g->next());
        return [$current, $error, $g->valid(), $g->current(), $g->key(), thrown(fn () => $g->getReturn())];
    })());

    // XT-runtime-58: is_scalar, in_array, array_combine, array_filter, array_unique and the constants.
    out('constants', [ARRAY_FILTER_USE_BOTH, ARRAY_FILTER_USE_KEY, SORT_REGULAR, SORT_NUMERIC, SORT_STRING]);
    out('is_scalar', array_map('is_scalar', [1, 1.5, 's', false, null, [], new stdClass()]));
    $ab = new stdClass();
    $ab->a = 1;
    $ab->b = 2;
    $ba = new stdClass();
    $ba->b = 2;
    $ba->a = 1;
    out('in_array', [
        in_array('1e1', ['10']),
        in_array('abc', [0]),
        in_array(null, ['']),
        in_array(null, [''], true),
        in_array(1, ['1'], true),
        in_array(1.0, [1], true),
        in_array([1], [[1]], true),
        in_array(['a' => 1, 'b' => 2], [['b' => 2, 'a' => 1]], true),
        in_array(['a' => 1, 'b' => 2], [['b' => 2, 'a' => 1]]),
    ]);
    out('in_array.more', [
        in_array(1, ['1']),
        in_array('a', ['b' => 'a'], true),
        in_array(['a' => 1, 'b' => 2], [['b' => 2, 'a' => 1]], true),
        in_array(['a' => 1, 'b' => 2], [['b' => 2, 'a' => 1]]),
        in_array($ab, [$ab], true),
        in_array(NAN, [NAN], true),
        in_array(0.0, [-0.0], true),
        in_array(1, [true]),
        in_array(1, [true], true),
        in_array('x', ['x'], 'yes'),
        in_array('x', ['x'], 0),
    ]);
    out('in_array.errors', [
        thrown(fn () => in_array(1, 'x')),
        thrown(fn () => in_array(1, [1], [])),
        thrown(fn () => in_array(1, null)),
        thrown(fn () => in_array(1, [1], new stdClass())),
    ]);
    out('array_combine', [
        array_combine(['a', 1, 1.5, true, null, '07', '7', 2.0], [1, 2, 3, 4, 5, 6, 7, 8]),
        array_combine(['a', 'a'], [1, 2]),
        array_combine([[]], [1]),
        array_combine([], []),
        array_combine([new Text()], [1]),
        array_combine(['x' => 'k', 'y' => 'l'], [3 => 'v', 9 => 'w']),
    ]);
    out('array_combine.errors', [
        thrown(fn () => array_combine([1, 2], [1])),
        thrown(fn () => array_combine([new stdClass()], [1])),
        thrown(fn () => array_combine('a', [1])),
        thrown(fn () => array_combine([1], 'a')),
    ]);
    out('array_filter', [
        array_filter([1, 0, 2, null, '', 'a', '0', [], [0]]),
        array_filter(['a' => 1, 'b' => 2, 'c' => 3], fn ($k) => $k !== 'b', ARRAY_FILTER_USE_KEY),
        array_filter(['a' => 1, 'b' => 2, 'c' => 3], fn ($v, $k) => $v > 1 && $k !== 'c', ARRAY_FILTER_USE_BOTH),
        array_filter([5 => 1, 6 => 2], fn ($v) => $v === 2),
        array_filter([], fn () => true),
        array_filter([1, 2], null),
        array_filter([0, 1], fn ($v) => $v, '0'),
    ]);
    out('array_filter.arguments', (function () {
        $seen = [];
        foreach ([0, ARRAY_FILTER_USE_KEY, ARRAY_FILTER_USE_BOTH, 7, -1] as $mode) {
            $calls = [];
            array_filter(['k' => 'v'], function () use (&$calls) {
                $calls[] = func_get_args();
                return true;
            }, $mode);
            $seen[] = $calls;
        }
        return $seen;
    })());
    out('array_filter.errors', [
        thrown(fn () => array_filter([1], 5)),
        thrown(fn () => array_filter([1], fn () => true, 'x')),
        thrown(fn () => array_filter('x')),
    ]);
    $unique = [3, '3', 1, 'a', 1.0, true, '1'];
    out('array_unique', [
        array_keys(array_unique($unique, SORT_STRING)),
        array_keys(array_unique($unique, SORT_REGULAR)),
        array_keys(array_unique($unique)),
        array_unique(['10', '1e1', 10.0, 'a', 'b', 'a'], SORT_NUMERIC),
        array_unique([[1], [1], 'Array']),
        array_unique([[1], [1], 'Array'], SORT_REGULAR),
        array_unique(['b' => 1, 'a' => 1, 'c' => 2]),
        array_unique([]),
        array_unique([7 => 'x']),
        array_unique(['x', new Text(), 'text']),
        array_unique([4, '4', 3, 4.0, 'x', 'x'], SORT_REGULAR),
        array_unique([2, 1, 2, 1, 3, 3], '1'),
        array_unique([1, 1], 99),
    ]);
    $long = [];
    for ($i = 0; $i < 40; $i++) {
        $long[] = [($i * 7) % 11, (string) (($i * 3) % 5), ($i % 4) * 1.5, $i % 3 === 0 ? 'a' : ($i % 3 === 1 ? '1e0' : true)][$i % 4];
    }
    out('array_unique.long', [array_keys(array_unique($long, SORT_REGULAR)), array_keys(array_unique($long, SORT_NUMERIC))]);
    out('array_unique.enum', [
        array_keys(array_unique([Suit::Hearts, Suit::Hearts, Suit::Spades], SORT_REGULAR)),
        array_keys(array_unique([1, Suit::Hearts, 1, Suit::Hearts], SORT_REGULAR)),
        array_keys(array_unique([Suit::Spades, 'x', Suit::Spades, 'x'], SORT_REGULAR)),
    ]);
    out('array_unique.errors', [
        thrown(fn () => array_unique([1, new stdClass()])),
        thrown(fn () => array_unique('x')),
        thrown(fn () => array_unique([1, 2], 'x')),
    ]);

    // XT-runtime-59: range.
    out('range', [
        range(1, 5),
        range(5, 1),
        range(1, 10, 3),
        range(10, 1, -3),
        range(5, 1, 2),
        range(3, 3),
        range(-2, 2),
        range(0, 1, 0.25),
        range(1.0, 3),
        range(1, 2, 0.3),
        range(3, 1.5, 0.5),
        range(1, 3, 1.0),
        range(2.5, 2.5),
        range('1', '3'),
        range('1', 3),
        range('5', '10'),
        range('1.5', 3),
        range('a', 'e', 2),
        range('e', 'a'),
        range('Z', 'A', -5),
        range('A', 1),
        range(1, 'A'),
        range('a', 'a'),
        range('aa', 'cc'),
        range('a', 'z', 1.5),
        range('1', '2', 0.5),
        range('', 2),
        range(null, 2),
        range(false, 1),
        range(true, 3),
        range(1, 2, '1'),
        range('2', '0', 1),
        range(' 1', '3 '),
        range(new Text(), 'v'),
        range(0, 2.0),
        range('0', '9', 4),
        range('x', 'z', 2),
        range('A', 'C', 1),
        range(PHP_INT_MAX - 1, PHP_INT_MAX),
        range(PHP_INT_MIN, PHP_INT_MIN + 1),
        range(-1.5, -3),
    ]);
    out('range.errors', [
        thrown(fn () => range(1, 2, 0)),
        thrown(fn () => range(1, 2, 0.0)),
        thrown(fn () => range(1, 5, -1)),
        thrown(fn () => range(1, 2, 5)),
        thrown(fn () => range('a', 'b', 5)),
        thrown(fn () => range('b', 'a', 5)),
        thrown(fn () => range(1.0, 2.0, 5)),
        thrown(fn () => range(2.0, 1.0, 5)),
        thrown(fn () => range('a', 'c', -1)),
        thrown(fn () => range(1.0, 2.0, -1)),
        thrown(fn () => range(INF, 1)),
        thrown(fn () => range(1, -INF)),
        thrown(fn () => range(NAN, 1)),
        thrown(fn () => range(1, 2, INF)),
        thrown(fn () => range(1, 2, NAN)),
        thrown(fn () => range('1e999', 1)),
        thrown(fn () => range([], 1)),
        thrown(fn () => range(1, new stdClass())),
        thrown(fn () => range(1, 2, 'x')),
        thrown(fn () => range(1, 2, [])),
        thrown(fn () => range(1, 2, PHP_INT_MIN)),
        thrown(fn () => range(PHP_INT_MIN, PHP_INT_MAX)),
        thrown(fn () => range(PHP_INT_MAX, PHP_INT_MIN)),
        thrown(fn () => range(0, 2000000000, 1)),
        thrown(fn () => range(0, 2e9, 1.5)),
        thrown(fn () => range(2e9, 0.5, 1.5)),
        thrown(fn () => range(0, 1073741823)),
        thrown(fn () => range(0.0, 1073741823.0)),
    ]);

    // XT-runtime-60: iterator_to_array, iterator_count, str_starts_with, substr, (array).
    $keyed = function () {
        yield 'a' => 1;
        yield 'a' => 2;
        yield 1.7 => 3;
        yield null => 4;
        yield true => 5;
    };
    out('iterator_to_array', [
        iterator_to_array($keyed()),
        iterator_to_array($keyed(), false),
        iterator_to_array(['x' => 1, 'y' => 2]),
        iterator_to_array(['x' => 1, 'y' => 2], false),
        iterator_to_array(new ArrayObject(['k' => 1, 2])),
        iterator_to_array(new Aggregate(new Aggregate(new ArrayIterator([3 => 'n'])))),
        iterator_to_array((function () {
            yield 1;
            yield 2;
        })(), 0),
    ]);
    out('iterator_count', [
        iterator_count((function () {
            yield 'a' => 1;
            yield 'a' => 2;
        })()),
        iterator_count([1, 2, 3]),
        iterator_count(new ArrayObject([1, 2])),
        iterator_count(new Aggregate(new ArrayIterator(['a', 'b', 'c', 'd']))),
    ]);
    out('iterator_to_array.errors', [
        thrown(fn () => iterator_to_array((function () {
            yield [] => 1;
        })())),
        thrown(fn () => iterator_to_array((function () {
            yield new stdClass() => 1;
        })())),
        thrown(fn () => iterator_to_array(5)),
        thrown(fn () => iterator_to_array(new stdClass())),
        thrown(fn () => iterator_count(5)),
        thrown(fn () => iterator_count(null)),
        thrown(fn () => iterator_to_array(new BadAggregate())),
        thrown(fn () => iterator_to_array([1], [])),
        thrown(fn () => iterator_to_array(new SelfAggregate())),
    ]);
    out('str_starts_with', [
        str_starts_with('hello', 'he'),
        str_starts_with('hello', ''),
        str_starts_with('hello', 'lo'),
        str_starts_with(123, 1),
        str_starts_with('1', true),
        str_starts_with('x', null),
        str_starts_with('', ''),
        str_starts_with('1.5x', 1.5),
        str_starts_with(new Text(), 'te'),
        str_starts_with('héllo', 'hé'),
    ]);
    out('str_starts_with.errors', [
        thrown(fn () => str_starts_with([], 'a')),
        thrown(fn () => str_starts_with('a', new stdClass())),
    ]);
    out('substr', [
        substr('abcdef', 1, 3),
        substr('abcdef', -3),
        substr('abcdef', 9),
        substr('abcdef', -9, 2),
        substr('abcdef', 1, -1),
        substr('abcdef', 3, -5),
        substr('abcdef', 0, null),
        substr('abcdef', '1'),
        substr('abcdef', 1.5),
        substr('abcdef', true),
        substr('abcdef', null),
        substr(12345, 1, 2),
        substr(1.5, 1),
        substr('héllo', 1, 2),
        substr('abcdef', 6),
        substr('abcdef', 2, 100),
        substr('abcdef', ' 2'),
        substr('abcdef', 0, false),
        substr('abcdef', PHP_INT_MIN),
        substr('abcdef', 1, PHP_INT_MIN),
        substr(new Text(), 1),
        substr('abc', '1.0'),
    ]);
    out('substr.errors', [
        thrown(fn () => substr([], 1)),
        thrown(fn () => substr('abc', 'x')),
        thrown(fn () => substr('abc', '1x')),
        thrown(fn () => substr('abc', NAN)),
        thrown(fn () => substr('abc', 1e30)),
        thrown(fn () => substr('abc', 1, 'x')),
        thrown(fn () => substr('abc', 1, [])),
        thrown(fn () => substr('abc', [])),
        thrown(fn () => substr('abc', '9999999999999999999')),
    ]);
    $props = new stdClass();
    $props->{'5'} = 'five';
    $props->x = 'y';
    $castProps = (array) $props;
    $castVisibility = (array) new Visibility();
    $closure = fn () => 1;
    $castClosure = (array) $closure;
    out('toPhpArray', [
        (array) null,
        (array) 1,
        (array) 1.5,
        (array) 'a',
        (array) true,
        (array) [3 => 1],
        [array_keys($castProps), array_values($castProps)],
        [array_keys($castVisibility), array_values($castVisibility)],
        [count($castClosure), $castClosure[0] === $closure],
        (array) new ArrayObject(['k' => 1, 2]),
        (array) (function () {
            yield 1;
        })(),
        (array) [],
    ]);
    // Review additions (XT-runtime-57..60).
    out('yieldFrom.chain_send', (function () {
        $c = function () {
            $x = yield 'c1';
            yield 'cx' => $x;
            return 'C';
        };
        $b = function () use ($c) {
            $r = yield from $c();
            yield 'b' => $r;
            return 'B';
        };
        $a = (function () use ($b) {
            $r = yield from $b();
            yield 'a' => $r;
        })();
        $steps = [[$a->key(), $a->current()]];
        $steps[] = $a->send('S');
        $steps[] = [$a->key(), $a->current()];
        $a->next();
        $steps[] = [$a->key(), $a->current()];
        $a->next();
        $steps[] = [$a->key(), $a->current()];
        $a->next();
        $steps[] = [$a->valid(), $a->getReturn()];
        return $steps;
    })());
    out('in_array.enum', [
        in_array(Suit::Hearts, [true]),
        in_array(true, [Suit::Hearts]),
        in_array(Suit::Hearts, [Suit::Spades]),
        in_array(Suit::Hearts, [Suit::Hearts], true),
        in_array(Suit::Hearts, [false]),
        in_array(null, [Suit::Hearts]),
        in_array(Suit::Hearts, [1]),
    ]);
    out('in_array.strict_keys', [in_array(['a' => 1], [['b' => 1]], true), in_array(['a' => 1], [['b' => 1]])]);
    out('array_unique.enum_bool', [
        array_keys(array_unique([Suit::Hearts, true], SORT_REGULAR)),
        array_keys(array_unique([true, Suit::Hearts, false, null], SORT_REGULAR)),
    ]);
    $lcg = [];
    $x = 42;
    for ($i = 0; $i < 1100; $i++) {
        $x = ($x * 1103515245 + 12345) % 2147483648;
        $n = $x % 50;
        $lcg[] = match ($x % 7) {
            0 => $n,
            1 => (string) $n,
            2 => $n / 2,
            3 => chr(97 + $n % 5),
            4 => $n % 2 === 0,
            5 => ($n % 20) . 'e0',
            default => null,
        };
    }
    out('array_unique.lcg', [array_keys(array_unique($lcg, SORT_REGULAR)), array_keys(array_unique($lcg, SORT_NUMERIC))]);
    out('range.count', [count(range(0, 4.3, 0.1)), count(range(0, 8.1, 0.1))]);
    out('iterator.valid_int', [iterator_to_array(new OneIterator()), iterator_count(new OneIterator())]);
    out('aggregate.generator', iterator_to_array(new Aggregate((function () {
        yield 'g' => 1;
        yield 2;
    })())));
    out('toPhpArray.more', [(array) new ArrayIterator(['k' => 1, 2])]);
    $weakKey = new stdClass();
    $weak = new WeakMap();
    $weak[$weakKey] = 'w';
    out('iterator_to_array.weakmap', [thrown(fn () => iterator_to_array($weak)), iterator_to_array($weak, false), iterator_count($weak)]);
}
