<?php
// The PHP 8.5.11 evidence for XT-runtime-74..75 (php-sort-string-functions.test.ts), action item
// epic-14-item-6-runtime-sort-string-functions. Each line is `<label>\t<json_encode(value)>`; XT-runtime-76 computes
// every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-sort-string-functions.probe.php > php-sort-string-functions.probe.txt

namespace XaravelFixture\PhpSortStringFunctions {
    class Text
    {
        public function __toString(): string
        {
            return 'text';
        }
    }

    class NoText
    {
    }
}

namespace {
    use XaravelFixture\PhpSortStringFunctions\NoText;
    use XaravelFixture\PhpSortStringFunctions\Text;

    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n";
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

    // XT-runtime-74: is_null and the string comparisons.
    out('is_null', [is_null(null), is_null(0), is_null(''), is_null([]), is_null(false), is_null(NAN), is_null('null'), is_null(new Text())]);

    out('strcmp', [
        strcmp('a', 'c'),
        strcmp('ab', 'a'),
        strcmp('a', 'ab'),
        strcmp('a', 1),
        strcmp(null, ''),
        strcmp(1.5, '1.5'),
        strcmp('é', 'e'),
        strcmp('', ''),
        strcmp('abc', 'abd'),
        strcmp('z', 'A'),
        strcmp(true, '1'),
        strcmp(false, ''),
        strcmp(new Text(), 'text'),
        strcmp("a\0b", "a\0c"),
        strcmp("a\0", 'a'),
        strcmp('abc', 'abcdef'),
        strcmp(10, 9),
    ]);
    out('strcasecmp', [
        strcasecmp('A', 'c'),
        strcasecmp('HELLO', 'hello'),
        strcasecmp('É', 'é'),
        strcasecmp('a', 'AB'),
        strcasecmp('[', 'a'),
        strcasecmp('[', 'A'),
        strcasecmp('Z', 'a'),
        strcasecmp('ab', 'A'),
        strcasecmp(null, ''),
        strcasecmp(1.5, '1.5'),
        strcasecmp('é', 'E'),
        strcasecmp(new Text(), 'TEXT'),
    ]);
    out('strnatcmp', [
        strnatcmp('img12', 'img10'),
        strnatcmp('a2', 'a10'),
        strnatcmp('A2', 'a10'),
        strnatcmp('x01', 'x1'),
        strnatcmp('', 'a'),
        strnatcmp('a', ''),
        strnatcmp('', ''),
        strnatcmp('1.010', '1.01'),
        strnatcmp(' 5', '5'),
        strnatcmp('0001', '1'),
        strnatcmp('abc', 'ABC'),
        strnatcmp('img 2', 'img2'),
        strnatcmp(10, 9),
        strnatcmp(null, 'a'),
    ]);
    out('strnatcasecmp', [
        strnatcasecmp('A2', 'a10'),
        strnatcasecmp('IMG12', 'img10'),
        strnatcasecmp('abc', 'ABC'),
        strnatcasecmp('x01', 'x1'),
        strnatcasecmp('', 'a'),
        strnatcasecmp('[', 'a'),
        strnatcasecmp('É', 'é'),
    ]);
    out('strcoll', [
        strcoll('a', 'c'),
        strcoll('ab', 'a'),
        strcoll('a', 'ab'),
        strcoll("a\0b", "a\0c"),
        strcoll('é', 'e'),
        strcoll('', ''),
        strcoll('A', 'a'),
        strcoll("a\0", 'ab'),
        strcoll(1, '10'),
        strcoll(null, 'x'),
    ]);
    out('strings.errors', [
        attempt(fn () => strcmp([], 'a')),
        attempt(fn () => strcmp('a', [])),
        attempt(fn () => strcasecmp([], 'a')),
        attempt(fn () => strcasecmp('a', new NoText())),
        attempt(fn () => strnatcmp([1], 'a')),
        attempt(fn () => strnatcmp('a', new NoText())),
        attempt(fn () => strnatcasecmp([], 'a')),
        attempt(fn () => strnatcasecmp('a', [])),
        attempt(fn () => strcoll([], 'a')),
        attempt(fn () => strcoll('a', new NoText())),
    ]);

    // XT-runtime-75: uasort.
    /** `[uasort's result, the sorted array, the next free key]` for `$a` and `$callback`. */
    function usorted(array $a, callable $callback): array
    {
        $result = uasort($a, $callback);
        $sorted = $a;
        $a[] = 'next';
        return [$result, $sorted, array_key_last($a)];
    }

    $spaceship = fn ($a, $b) => $a <=> $b;
    $mixed = ['x' => 3, 'y' => 1, 5 => 2];
    $ties = ['a' => 2, 'b' => 1, 'c' => 2, 'd' => 1, 'e' => 3, 'f' => 1];
    $big = [];
    for ($i = 0; $i < 40; $i++) {
        $big['k' . $i] = ($i * 7) % 13;
    }
    out('uasort', [
        usorted($mixed, $spaceship),
        usorted($mixed, fn ($a, $b) => $b <=> $a),
        usorted($ties, $spaceship),
        usorted($ties, fn ($a, $b) => 0),
        usorted([3, 1, 2], $spaceship),
        usorted([1 => 'b', 0 => 'a'], $spaceship),
        usorted(['only' => 1], $spaceship),
        usorted([], $spaceship),
        usorted(['b' => 'img12', 'a' => 'img10', 'c' => 'IMG2'], 'strnatcasecmp'),
        usorted($big, $spaceship),
    ]);
    $three = ['p' => 3, 'q' => 1, 'r' => 2, 's' => 1];
    out('uasort.results', [
        usorted($three, fn ($a, $b) => ($a <=> $b) * 0.5),
        usorted($three, fn ($a, $b) => ($a <=> $b) * 2.5),
        usorted($three, fn ($a, $b) => (string) ($a <=> $b)),
        usorted($three, fn ($a, $b) => ($a <=> $b) * -7),
        usorted($three, fn ($a, $b) => ($a <=> $b) . 'abc'),
        usorted($three, fn ($a, $b) => true),
        usorted($three, fn ($a, $b) => false),
        usorted($three, fn ($a, $b) => null),
        usorted($three, fn ($a, $b) => $a > $b),
        usorted($three, fn ($a, $b) => $a < $b),
        usorted($three, fn ($a, $b) => [$a]),
        usorted($three, fn ($a, $b) => ($a <=> $b) * INF),
        usorted($three, fn ($a, $b) => ($a <=> $b) * 1e20),
    ]);
    $calls = function (array $a, callable $result): array {
        $seen = [];
        uasort($a, function ($x, $y) use (&$seen, $result) {
            $seen[] = [$x, $y];
            return $result($x, $y);
        });
        return [$a, $seen];
    };
    out('uasort.calls', [
        $calls(['a' => 4, 'b' => 2, 'c' => 3, 'd' => 1], fn ($x, $y) => $x <=> $y),
        $calls(['a' => 4, 'b' => 2, 'c' => 3, 'd' => 1], fn ($x, $y) => $x > $y),
        $calls(['a' => 4, 'b' => 2, 'c' => 3, 'd' => 1], fn ($x, $y) => $x < $y),
        $calls(['a' => 1, 'b' => 1, 'c' => 0], fn ($x, $y) => false),
        $calls(['a' => 1], fn ($x, $y) => $x <=> $y),
        $calls([], fn ($x, $y) => $x <=> $y),
    ]);
    $throwing = function (array $a, int $at): array {
        $count = 0;
        $caught = null;
        try {
            uasort($a, function ($x, $y) use (&$count, $at) {
                if (++$count === $at) {
                    throw new RuntimeException("call $count");
                }
                return $x <=> $y;
            });
        } catch (RuntimeException $e) {
            $caught = $e->getMessage();
        }
        return [$caught, $a, $count];
    };
    out('uasort.throw', [
        $throwing(['a' => 5, 'b' => 4, 'c' => 3, 'd' => 2, 'e' => 1], 2),
        $throwing(['a' => 5, 'b' => 4, 'c' => 3, 'd' => 2, 'e' => 1, 'f' => 0, 'g' => 9, 'h' => 7], 4),
        $throwing($big, 30),
        $throwing(['a' => 2, 'b' => 1], 1),
    ]);
    $kept = [5 => 3, 1 => 1, 9 => 2];
    unset($kept[9]);
    $list = [1 => 'b', 0 => 'a', 2 => 'c'];
    unset($list[2]);
    out('uasort.next', [usorted($kept, $spaceship), usorted($list, $spaceship)]);
    out('uasort.errors', [
        attempt(function () {
            $a = 1;
            return uasort($a, fn ($x, $y) => 0);
        }),
        attempt(function () {
            $a = 'abc';
            return uasort($a, fn ($x, $y) => 0);
        }),
        attempt(function () {
            $a = null;
            return uasort($a, fn ($x, $y) => 0);
        }),
        attempt(function () {
            $a = [1, 2];
            return uasort($a, null);
        }),
        attempt(function () {
            $a = [];
            return uasort($a, null);
        }),
        attempt(function () {
            $a = [1, 2];
            return uasort($a, 1);
        }),
        attempt(function () {
            $a = 1;
            return uasort($a, null);
        }),
    ]);
}
