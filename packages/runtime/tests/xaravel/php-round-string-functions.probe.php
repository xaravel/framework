<?php
// The PHP 8.5.11 evidence for XT-runtime-80..81 (php-round-string-functions.test.ts), action item
// epic-14-item-8-runtime-round-string-array-pointer. Each line is `<label>\t<json_encode(value)>`; XT-runtime-82
// computes every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`; a
// non-finite float is the string `INF`, `-INF` or `NAN`, which json_encode cannot write.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-round-string-functions.probe.php > php-round-string-functions.probe.txt

namespace XaravelFixture\PhpRoundStringFunctions {
    class Text
    {
        public function __toString(): string
        {
            return 'text';
        }
    }
}

namespace {
    use XaravelFixture\PhpRoundStringFunctions\Text;

    // symfony/polyfill-php86's SortDirection, as the runtime declares it: an enum that is no RoundingMode.
    enum SortDirection
    {
        case Ascending;
        case Descending;
    }

    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n";
    }

    /** The result of `$f` (a non-finite float as its name), or what it throws. */
    function attempt(callable $f): mixed
    {
        try {
            $result = $f();
        } catch (Throwable $e) {
            return get_class($e) . ': ' . $e->getMessage();
        }
        if (is_float($result) && !is_finite($result)) {
            return is_nan($result) ? 'NAN' : ($result > 0 ? 'INF' : '-INF');
        }
        return $result;
    }

    /** `round(...$args)`, or what it throws. */
    function r(mixed ...$args): mixed
    {
        return attempt(fn () => round(...$args));
    }

    // XT-runtime-80: round, the PHP_ROUND_* constants and RoundingMode.
    out('round.constants', [PHP_ROUND_HALF_UP, PHP_ROUND_HALF_DOWN, PHP_ROUND_HALF_EVEN, PHP_ROUND_HALF_ODD]);
    out('round.enum', [
        array_map(fn (RoundingMode $case) => $case->name, RoundingMode::cases()),
        RoundingMode::HalfEven instanceof UnitEnum,
        RoundingMode::HalfEven instanceof BackedEnum,
        enum_exists('RoundingMode'),
        RoundingMode::HalfOdd === RoundingMode::cases()[3],
        attempt(fn () => new RoundingMode()),
    ]);
    out('round.basic', [
        r(3.4),
        r(3.5),
        r(-3.5),
        r(75),
        r(75.0, 2),
        r(5.045, 2),
        r(5.055, 2),
        r(0.285, 2),
        r(1.955, 2),
        r(1.45, 1),
        r(-1.45, 1),
        r(1241757, -3),
        r(5, -1),
        r(-15, -1),
        r(1234567, -2),
        r(5, 2),
        r(PHP_INT_MAX),
        r(PHP_INT_MIN, -2),
        r('3.7'),
        r('  12.345  ', 1),
        r('1e3', -2),
        r(true),
        r(false),
        r(null),
        r(0.1 + 0.2, 15),
        r(123.456, -1),
        r(123.456, -2),
        r(123.456, -3),
        r(0.49999999999999994),
        r(-0.4),
        r(2.5, '1'),
        r(2.55, 1.9),
        r(2.55, true),
        r(1.5, null),
    ]);
    $modeValues = [[1.5, 0], [-1.5, 0], [2.5, 0], [-2.5, 0], [-0.5, 0], [0.5, 0], [1.955, 2], [-1.55, 1], [1.4, 0], [-1.4, 0], [25, -1], [-35, -1], [3.0, 0]];
    $byInt = [];
    foreach (range(1, 8) as $mode) {
        $byInt[] = array_map(fn ($pair) => r($pair[0], $pair[1], $mode), $modeValues);
    }
    out('round.modes.int', $byInt);
    $byEnum = [];
    foreach (RoundingMode::cases() as $case) {
        $byEnum[] = array_map(fn ($pair) => r($pair[0], $pair[1], $case), $modeValues);
    }
    out('round.modes.enum', $byEnum);
    out('round.modes.coerced', [r(2.5, 0, 1.9), r(2.5, 0, '3'), r(2.5, 0, true), r(2.5, 0, ' 4 '), r(2.5, 0, 2.0)]);
    out('round.edges', [
        r(INF),
        r(-INF),
        r(NAN),
        r(-0.0),
        r(-0.0, 2),
        r(0.0, -3),
        r(1e16),
        r(1e16 + 2, -1),
        r(1.5e16, 0),
        r(9007199254740993, -1),
        r(1.5, 30),
        r(1.5, -30),
        r(1.5, 400),
        r(1.5, -400),
        r(-1.5, -400),
        r(-1.5, -30),
        r(-4e-31, 30),
        r(-1.5, -22),
        r(1.5, PHP_INT_MAX),
        r(1.5, PHP_INT_MIN),
        r(1.5, 2147483648),
        r(1.5, -2147483649),
        r(1.5e-25, 25),
        r(2.5e-25, 25),
        r(-1.5e-30, 30),
        r(1.2345e-10, 24),
        r(1.2345e-10, 24, PHP_ROUND_HALF_EVEN),
        r(1.23456789e-7, 23),
        r(5e-324, 323),
        r(1.7976931348623157e308, -308),
        r(1.7976931348623157e308, -307),
        r(4.5e300, -300),
        r(1e22, -22),
        r(1e23, -23),
        r(123456.789, -23),
        r(0.000001234, 22),
        r(1.0000000000000002, 15),
        r(-2.675, 2),
    ]);
    out('round.errors', [
        r(1.5, 0, 0),
        r(1.5, 0, 9),
        r(1.5, 0, -1),
        r(1.5, 0, PHP_INT_MAX),
        r(1.5, 0, null),
        r(1.5, 0, 'x'),
        r(1.5, 0, []),
        r(1.5, 0, SortDirection::Ascending),
        r(1.5, 0, new stdClass()),
        r(1.5, 0, 1.5e30),
        r('abc'),
        r('abc', 0, 0),
        r([]),
        r(new stdClass()),
        r('5 apples'),
        r(1.5, 'x'),
        r(1.5, 1.5e30),
        r(1.5, []),
        r(1.5, 'x', 0),
        r(INF, 0, 0),
    ]);

    // XT-runtime-81: reset, end, is_bool, strtoupper, trim, chunk_split.
    $arrays = [[], [1, 2, 3], ['a' => 1, 'b' => 2], [5 => 'x', 2 => 'y', 'k' => 'z'], [null], [[1], [2]]];
    out('pointer.reset', array_map(function ($array) {
        $first = reset($array);
        return [$first, $array];
    }, $arrays));
    out('pointer.end', array_map(function ($array) {
        $last = end($array);
        return [$last, $array];
    }, $arrays));
    out('pointer.bad', [
        attempt(function () {
            $x = 5;
            return reset($x);
        }),
        attempt(function () {
            $x = null;
            return reset($x);
        }),
        attempt(function () {
            $x = 'abc';
            return end($x);
        }),
        attempt(function () {
            $x = 1.5;
            return end($x);
        }),
        attempt(function () {
            $x = true;
            return reset($x);
        }),
    ]);
    out('is_bool', array_map('is_bool', [true, false, 0, 1, '', null, [], 'true', 0.0, '0']));
    $upper = fn (mixed $value) => attempt(fn () => strtoupper($value));
    out('strtoupper', array_map($upper, ['abc', 'Ab1-z', 'é ß', '', 5, 1.5, true, false, null, new Text(), "x\0y", 'ÿabcÀ', [], new stdClass()]));
    $trim = fn (mixed ...$args) => attempt(fn () => trim(...$args));
    out('trim.default', [
        $trim(" \t\n\r\0\x0Bx \x0B"),
        $trim('  é  '),
        $trim("\x0C x \x0C"),
        $trim(''),
        $trim('   '),
        $trim('abc'),
        $trim(5),
        $trim(1.5),
        $trim(true),
        $trim(null),
        $trim(new Text()),
        $trim([]),
        $trim(" \t\n\r\0\x0Bx \x0B", " \n\r\t\v\0"),
    ]);
    $subject = '..abcdefxyz.edcba..';
    out('trim.lists', [
        $trim($subject, 'a..e'),
        $trim($subject, 'xa..c'),
        $trim($subject, '..a'),
        $trim($subject, 'a..'),
        $trim($subject, 'z..a'),
        $trim($subject, ''),
        $trim($subject, '.'),
        $trim($subject, '.a..c..e'),
        $trim($subject, 'a..b..e'),
        $trim($subject, '..'),
        $trim($subject, '...'),
        $trim($subject, '....'),
        $trim($subject, '.a..e.'),
        $trim($subject, '...e'),
        $trim('ééaé', 'é'),
        $trim('éaé', "\xC3\xA9"),
        $trim('xaxbx', 'x'),
        $trim('abc', 'A..Z'),
        $trim('ABCabc', 'A..Z'),
        $trim(' x ', null),
        $trim('5x5', 5),
        $trim('x', []),
    ]);
    $chunk = fn (mixed ...$args) => attempt(fn () => chunk_split(...$args));
    out('chunk_split', [
        $chunk('abcdefg', 3),
        $chunk('abc', 3),
        $chunk('abc', 5),
        $chunk('', 1),
        $chunk('', 5, '|'),
        $chunk('abcd', 2, '|'),
        $chunk('é', 1, ''),
        $chunk('é', 2, '|'),
        $chunk('éé', 2, '|'),
        $chunk(str_repeat('a', 80)),
        $chunk('abcdef', 1, '<>'),
        $chunk('abc', '2'),
        $chunk('abc', 1.5),
        $chunk('abc', true, null),
        $chunk(12345, 2, 0),
        $chunk('abc', 0),
        $chunk('abc', -1),
        $chunk('', 0),
        $chunk('abc', 'x'),
        $chunk([], 1),
        $chunk('abc', 1, []),
        $chunk('abc', PHP_INT_MAX),
        $chunk('abc', null),
    ]);
}
