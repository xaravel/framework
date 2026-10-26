<?php
// The PHP 8.5.11 evidence for XT-runtime-68..72 (php-array-functions.test.ts), action item
// epic-14-item-5-runtime-array-functions. Each line is `<label>\t<json_encode(value)>`; XT-runtime-73 computes every
// label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`, a NAN `"NAN"`.
// PHP 8.5 has no `SortDirection`, so this declares symfony/polyfill-php86 v1.43.0's stub, as the polyfill does.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-array-functions.probe.php > php-array-functions.probe.txt

namespace XaravelFixture\PhpArrayFunctions {
    class Plain
    {
        public $own = 1;

        public static $stat = 2;

        public int $hooked {
            get => 3;
        }

        public function parentMethod()
        {
        }

        public static function parentStatic()
        {
        }
    }

    class Kid extends Plain
    {
        public function fooBar()
        {
        }

        public static function bar()
        {
        }

        public function __call($name, $arguments)
        {
        }
    }

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

    class Declared
    {
        public $declared;
    }

    enum Suit
    {
        case Hearts;
        case Spades;
    }
}

namespace {
    use Random\Randomizer;
    use XaravelFixture\PhpArrayFunctions\Declared;
    use XaravelFixture\PhpArrayFunctions\Kid;
    use XaravelFixture\PhpArrayFunctions\NoText;
    use XaravelFixture\PhpArrayFunctions\Plain;
    use XaravelFixture\PhpArrayFunctions\Suit;
    use XaravelFixture\PhpArrayFunctions\Text;

    // symfony/polyfill-php86 v1.43.0, Resources/stubs/SortDirection.php.
    if (\PHP_VERSION_ID < 80600 && \PHP_VERSION_ID >= 80100) {
        enum SortDirection
        {
            case Ascending;
            case Descending;
        }
    }

    function out(string $label, mixed $value): void
    {
        echo $label, "\t", json_encode(nan_safe($value), JSON_PRESERVE_ZERO_FRACTION), "\n";
    }

    /** `$value` with every NAN as `"NAN"`, which JSON cannot hold. */
    function nan_safe(mixed $value): mixed
    {
        if (is_float($value) && is_nan($value)) {
            return 'NAN';
        }
        if (is_array($value)) {
            return array_map('nan_safe', $value);
        }
        return $value;
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

    // XT-runtime-68: array_any, array_all, array_find_key, array_first, array_last, array_search, array_flip.
    $seen = [];
    $record = function ($v, $k) use (&$seen) {
        $seen[] = $k;
        return $v > 1;
    };
    out('any_all', [
        array_any([1, 2, 3], fn ($v) => $v > 1),
        array_any([1, 2, 3], fn ($v) => $v > 5),
        array_all([1, 2, 3], fn ($v) => $v > 0),
        array_all([1, 2, 3], fn ($v) => $v > 1),
        array_any([], fn ($v) => true),
        array_all([], fn ($v) => false),
        array_any(['a' => 1, 'b' => 2], fn ($v, $k) => $k === 'b'),
        array_all(['a' => 1, 'b' => 2], fn ($v, $k) => is_string($k)),
        array_any([0, 1], fn ($v) => $v),
        array_all(['x', ''], fn ($v) => $v),
    ]);
    $seen = [];
    $any = array_any([1, 2, 3], $record);
    $anySeen = $seen;
    $seen = [];
    $all = array_all([2, 1, 3], $record);
    $allSeen = $seen;
    $seen = [];
    $found = array_find_key([1, 2, 3], $record);
    out('any_all.stops', [$any, $anySeen, $all, $allSeen, $found, $seen]);
    out('find_key', [
        array_find_key([1, 2, 3], fn ($v) => $v > 1),
        array_find_key([1, 2, 3], fn ($v) => $v > 5),
        array_find_key(['a' => 1, 'b' => 2], fn ($v, $k) => $k !== 'a'),
        array_find_key([5 => 'x', 'k' => 'y'], fn ($v) => $v === 'x'),
        array_find_key([], fn () => true),
    ]);
    out('callbacks.errors', [
        attempt(fn () => array_any([1], null)),
        attempt(fn () => array_all([1], null)),
        attempt(fn () => array_find_key([1], null)),
        attempt(fn () => array_any([1], 5)),
        attempt(fn () => array_any(1, fn () => true)),
        attempt(fn () => array_find_key('x', fn () => true)),
    ]);
    out('first_last', [
        array_first([]),
        array_last([]),
        array_first([1, 2]),
        array_last([1, 2]),
        array_first(['x' => 1, 'y' => 2]),
        array_last(['x' => 1, 'y' => 2]),
        array_first([5 => 'a', 'k' => 'b']),
        array_last([5 => 'a', 'k' => 'b']),
        attempt(fn () => array_first(1)),
        attempt(fn () => array_last(null)),
    ]);
    out('search', [
        array_search('1', [0, 1, '1']),
        array_search('1', [0, 1, '1'], true),
        array_search(null, [0]),
        array_search('x', [1]),
        array_search(1, ['a' => '1'], 'yes'),
        array_search(2, [5 => 2, 'k' => 2]),
        array_search('abc', [0]),
        array_search([1], [[1], [2]], true),
        array_search(Suit::Hearts, [true, Suit::Hearts]),
        array_search(Suit::Spades, [null, Suit::Hearts]),
        attempt(fn () => array_search(1, 1)),
        attempt(fn () => array_search(1, [1], [])),
    ]);
    out('flip', [
        array_flip(['a', 'b', 1, 1.5, true, '1']),
        array_flip(['x' => 'y', 'z' => 'y']),
        array_flip([]),
        array_flip([null, '-0', '07', 'a']),
        attempt(fn () => array_flip('x')),
    ]);

    // XT-runtime-69: array_slice, array_reverse, array_intersect_key, array_intersect_assoc.
    $list = [1, 2, 3, 4];
    $mixed = ['a' => 1, 5 => 2, 'b' => 3, 9 => 4];
    out('slice', [
        array_slice($list, 1),
        array_slice($list, -2),
        array_slice($list, 1, 2),
        array_slice($list, 1, -1),
        array_slice($list, 1, null, true),
        array_slice($list, 1, 2, true),
        array_slice($list, 5),
        array_slice($list, 4),
        array_slice($list, -10, 2),
        array_slice($list, 2, 0),
        array_slice($list, 1, -5),
        array_slice($mixed, 1),
        array_slice($mixed, 1, null, true),
        array_slice($mixed, -3, 2),
        array_slice(['x' => 1, 'y' => 2], 1),
    ]);
    out('slice.errors', [
        attempt(fn () => array_slice([1], 'x')),
        attempt(fn () => array_slice([1], 0, 'x')),
        attempt(fn () => array_slice([1], 0, null, [])),
        attempt(fn () => array_slice(1, 0)),
    ]);
    out('reverse', [
        array_reverse([1, 2, 3]),
        array_reverse([1, 2, 3], true),
        array_reverse($mixed),
        array_reverse($mixed, true),
        array_reverse([]),
        array_reverse(['x' => 1, 'y' => 2]),
        attempt(fn () => array_reverse(1)),
        attempt(fn () => array_reverse([1], [])),
    ]);
    out('intersect_key', [
        array_intersect_key(['a' => 1, 'b' => 2, 'c' => 3], ['a' => 0, 'c' => 0]),
        array_intersect_key(['a' => 1, 'b' => 2]),
        array_intersect_key([1, 2, 3], [0 => 'x', 2 => 'y']),
        array_intersect_key([5 => 'a', 6 => 'b'], ['5' => 'c']),
        array_intersect_key(['a' => 1, 'b' => 2, 'c' => 3], ['a' => 0, 'b' => 0], ['b' => 0, 'c' => 0]),
        array_intersect_key([1, 2], []),
        attempt(fn () => array_intersect_key(1, [])),
        attempt(fn () => array_intersect_key([], [], 'x')),
    ]);
    out('intersect_assoc', [
        array_intersect_assoc(['a' => '1', 'b' => 2], ['a' => 1, 'b' => '3']),
        array_intersect_assoc(['a' => [1]], ['a' => [2]]),
        array_intersect_assoc(['a' => 1.0, 'b' => null, 'c' => true, 'd' => false], ['a' => '1', 'b' => '', 'c' => '1', 'd' => '0']),
        array_intersect_assoc([1, 2, 3], [1, 5, 3], [1, 2, 3]),
        array_intersect_assoc(['a' => new Text()], ['a' => 'text']),
        array_intersect_assoc(['a' => 1]),
        attempt(fn () => array_intersect_assoc(['a' => new NoText()], ['a' => 'x'])),
        attempt(fn () => array_intersect_assoc(['a' => 1], 2)),
    ]);

    // XT-runtime-70: the by-reference functions, asort and arsort.
    $shifts = [];
    foreach ([[1, 2, 3], [5 => 'a', 'x' => 'b', 9 => 'c'], [], ['x' => 1]] as $a) {
        $removed = array_shift($a);
        $after = $a;
        $a[] = 'next';
        $shifts[] = [$removed, $after, $a];
    }
    out('shift', $shifts);
    $pops = [];
    $unset = [0, 1, 2];
    unset($unset[2]);
    foreach ([[1, 2, 3], [5 => 'a', 'x' => 'b', 9 => 'c'], [9 => 'c', 5 => 'a'], $unset, [], ['x' => 1, 'y' => 2], [-5 => 'a']] as $a) {
        $removed = array_pop($a);
        $after = $a;
        $a[] = 'next';
        $pops[] = [$removed, $after, $a];
    }
    out('pop', $pops);
    $unshifts = [];
    foreach ([[[3], [1, 2]], [['x' => 1, 5 => 2], ['z']], [[], []], [[9 => 'a'], [null]]] as [$a, $values]) {
        $count = array_unshift($a, ...$values);
        $after = $a;
        $a[] = 'next';
        $unshifts[] = [$count, $after, $a];
    }
    out('unshift', $unshifts);
    $splices = [];
    $five = [1, 2, 3, 4, 5];
    foreach ([[1], [1, 2], [-1], [1, 0, ['x', 'y']], [1, -1], [1, 1, 'x'], [1, 1, null], [10], [-10, 1], [0, null, ['k' => 'r', 9 => 's']], [2, -10], [1, 1, new Text()]] as $args) {
        $a = $five;
        $removed = array_splice($a, ...$args);
        $splices[] = [$removed, $a];
    }
    foreach ([[1, 2, ['k' => 'r']], [0, 1], [-1, 1, 'z'], [2]] as $args) {
        $a = $mixed;
        $removed = array_splice($a, ...$args);
        $after = $a;
        $a[] = 'next';
        $splices[] = [$removed, $after, $a];
    }
    out('splice', $splices);
    out('refs.errors', [
        attempt(function () {
            $x = 1;
            return array_shift($x);
        }),
        attempt(function () {
            $x = 'x';
            return array_pop($x);
        }),
        attempt(function () {
            $x = null;
            return array_unshift($x, 1);
        }),
        attempt(function () {
            $x = 1.5;
            return array_splice($x, 0);
        }),
        attempt(function () {
            $x = [1];
            return array_splice($x, 'x');
        }),
        attempt(function () {
            $x = [1];
            return array_splice($x, 0, 'x');
        }),
        attempt(function () {
            $x = true;
            return asort($x);
        }),
        attempt(function () {
            $x = [1];
            return asort($x, 'x');
        }),
        attempt(function () {
            $x = [1];
            return arsort($x, []);
        }),
    ]);

    /** `[asort's result, the sorted array, the next free key]` for `$a` and `$flags`; `arsort`'s when `$reverse`. */
    function sorted(array $a, int $flags = SORT_REGULAR, bool $reverse = false): array
    {
        $result = $reverse ? arsort($a, $flags) : asort($a, $flags);
        $sorted = $a;
        $a[] = 'next';
        return [$result, $sorted, array_key_last($a)];
    }

    $regular = ['x' => 10, 'y' => '9', 'z' => 2, 'w' => '10', 'v' => 1.5, 'u' => 'abc', 't' => null, 's' => true, 'r' => '1e1'];
    $numeric = ['a' => '10', 'b' => '9.5', 'c' => 'abc', 'd' => 1, 'e' => ' 2', 'f' => '1e1', 'g' => null];
    $strings = ['a' => 'b', 'b' => 'B', 'c' => 'a', 'd' => 10, 'e' => 9, 'f' => 'A', 'g' => 'é', 'h' => 'e', 'i' => '', 'j' => 1.5];
    $natural = ['img12', 'img10', 'IMG2', 'img1', 'img2', 'img 02', 'x1.10', 'x1.9', 'img012', 'img0', '', ' img3', 'a  b', 'a b'];
    $stable = ['k1' => 1, 'k2' => '1', 'k3' => 1.0, 'k4' => 0, 'k5' => '01', 'k6' => 2];
    $big = [];
    for ($i = 0; $i < 40; $i++) {
        $value = ($i * 7) % 13;
        $big['k' . $i] = $i % 2 === 0 ? $value : (string) $value;
    }
    $hash = [5 => 3, 1 => 1, 9 => 2];
    unset($hash[9]);
    $sorts = [];
    foreach ([false, true] as $reverse) {
        $sorts[] = [
            sorted($regular, SORT_REGULAR, $reverse),
            sorted($numeric, SORT_NUMERIC, $reverse),
            sorted($strings, SORT_STRING, $reverse),
            sorted($strings, SORT_STRING | SORT_FLAG_CASE, $reverse),
            sorted($natural, SORT_NATURAL, $reverse),
            sorted($natural, SORT_NATURAL | SORT_FLAG_CASE, $reverse),
            sorted($strings, SORT_LOCALE_STRING, $reverse),
            sorted($stable, SORT_REGULAR, $reverse),
            sorted($big, SORT_REGULAR, $reverse),
            sorted($big, SORT_STRING, $reverse),
            sorted([3, 1, 2], SORT_REGULAR, $reverse),
            sorted($hash, SORT_REGULAR, $reverse),
            sorted([], SORT_REGULAR, $reverse),
            sorted(['only' => 1], SORT_REGULAR, $reverse),
            sorted($regular, 99, $reverse),
            sorted(['a' => 'B', 'b' => 'a'], SORT_REGULAR | SORT_FLAG_CASE, $reverse),
        ];
    }
    out('sorts', $sorts);
    $enums = [];
    foreach ([false, true] as $reverse) {
        $a = ['a' => Suit::Hearts, 'b' => 2, 'c' => Suit::Hearts, 'd' => 1];
        $reverse ? arsort($a) : asort($a);
        $enums[] = array_keys($a);
    }
    out('sorts.enum', $enums);
    $nans = [];
    foreach ([SORT_NUMERIC, SORT_REGULAR] as $flags) {
        foreach ([false, true] as $reverse) {
            $nans[] = sorted(['a' => NAN, 'b' => 1.0, 'c' => 0.5], $flags, $reverse);
        }
    }
    out('sorts.nan', $nans);
    $nuls = [];
    foreach ([SORT_LOCALE_STRING, SORT_STRING] as $flags) {
        foreach ([false, true] as $reverse) {
            $nuls[] = sorted(['b' => "x\0b", 'a' => "x\0a"], $flags, $reverse);
        }
    }
    out('sorts.nul', $nuls);
    out('sort_flags', [SORT_REGULAR, SORT_NUMERIC, SORT_STRING, SORT_LOCALE_STRING, SORT_NATURAL, SORT_FLAG_CASE]);

    // XT-runtime-71: min, max, the string functions, property_exists, method_exists, identical and the aliases.
    out('min_max', [
        min(2, '10', 3.5),
        max([1, '5', 4]),
        min('apple', 'banana'),
        max([1, 2], [1, 3]),
        min(0, '0'),
        min(0, '0', 0),
        min([0, '0']),
        max(0, '0'),
        max(0, '0', 0),
        max([0, '0']),
        max('abc', 0),
        min('abc', 0),
        max(1, 2.0),
        min(1, 1.0),
        max(1.0, 1),
        max(1.0, NAN),
        max(NAN, 1.0),
        max(1.0, NAN, 2.0),
        max([1.0, NAN, 2.0]),
        min(1.0, NAN),
        min(NAN, 1.0),
        min([NAN, 1.0]),
        min(null, false, 0),
        max(true, 2),
        max('10', '9'),
        max('10', '9a'),
        min([5 => 3, 'k' => 1]),
        max(['a', 'b'], 'z'),
        min(-1, PHP_INT_MIN, PHP_INT_MAX),
    ]);
    out('min_max.nan', [
        max(9007199254740993, NAN),
        max(9007199254740993, NAN, 1.0),
        min(9007199254740993, NAN),
        min(9007199254740993, NAN, 1.0),
        max(NAN, 9007199254740993),
        min(NAN, 9007199254740993),
        max(1.0, 9007199254740993, NAN),
        min(1.0, 9007199254740993, NAN),
    ]);
    out('min_max.errors', [
        attempt(fn () => min()),
        attempt(fn () => max()),
        attempt(fn () => min(1)),
        attempt(fn () => max('x')),
        attempt(fn () => min([])),
        attempt(fn () => max([])),
    ]);
    out('strings', [
        str_contains('abc', ''),
        str_contains('abc', 'bc'),
        str_contains('abc', 'd'),
        str_contains('', ''),
        str_contains('héllo', 'é'),
        str_contains(12.5, '.5'),
        str_contains(new Text(), 'ex'),
        strlen('héllo'),
        strlen(12.5),
        strlen(true),
        strlen(''),
        strlen(new Text()),
        strlen('😀'),
        lcfirst('ABC'),
        lcfirst('Élan'),
        lcfirst(''),
        lcfirst('1A'),
        lcfirst(new Text()),
    ]);
    out('strings.errors', [
        attempt(fn () => strlen([])),
        attempt(fn () => str_contains([], 'a')),
        attempt(fn () => str_contains('a', new NoText())),
        attempt(fn () => lcfirst([])),
    ]);
    $plain = new Plain();
    $plain->dynamic = 1;
    out('property_exists', [
        property_exists($plain, 'own'),
        property_exists($plain, 'dynamic'),
        property_exists($plain, 'stat'),
        property_exists($plain, 'hooked'),
        property_exists($plain, 'missing'),
        property_exists($plain, 'OWN'),
        property_exists(new Kid(), 'stat'),
        property_exists(new Kid(), 'hooked'),
        property_exists(Kid::class, 'stat'),
        property_exists(Kid::class, 'hooked'),
        property_exists(Kid::class, 'nope'),
        property_exists('Nope\\Missing', 'own'),
        property_exists($plain, 'parentMethod'),
        property_exists(function () {}, 'x'),
        property_exists('Iterator', 'current'),
    ]);
    out('property_table', [
        property_exists(Declared::class, 'declared'),
        property_exists(new Declared(), 'declared'),
        property_exists(Declared::class, 'other'),
    ]);
    out('method_exists', [
        method_exists(new Kid(), 'fooBar'),
        method_exists(new Kid(), 'FOOBAR'),
        method_exists(new Kid(), 'parentMethod'),
        method_exists(new Kid(), 'parentstatic'),
        method_exists(new Kid(), 'bar'),
        method_exists(new Kid(), 'missing'),
        method_exists(Kid::class, 'fooBar'),
        method_exists(Kid::class, 'Bar'),
        method_exists('\\' . Kid::class, 'parentMethod'),
        method_exists('Nope\\Missing', 'x'),
        method_exists(new Text(), '__toString'),
        method_exists(Text::class, '__tostring'),
        method_exists(new NoText(), '__toString'),
        method_exists(new Kid(), '__call'),
        method_exists(function () {}, '__invoke'),
        method_exists(function () {}, 'bindTo'),
        method_exists(function () {}, 'call'),
        method_exists(function () {}, 'nope'),
        method_exists('Closure', '__invoke'),
        method_exists('Closure', 'fromCallable'),
        method_exists('Iterator', 'current'),
        method_exists('Iterator', 'Valid'),
        method_exists('Iterator', 'nope'),
        method_exists('IteratorAggregate', 'getIterator'),
        method_exists('Traversable', 'current'),
        method_exists(new Plain(), 'own'),
    ]);
    out('object.errors', [
        attempt(fn () => property_exists(1, 'x')),
        attempt(fn () => property_exists([], 'x')),
        attempt(fn () => property_exists(null, 'x')),
        attempt(fn () => property_exists(new Plain(), [])),
        attempt(fn () => method_exists(null, 'x')),
        attempt(fn () => method_exists(1.5, 'x')),
        attempt(fn () => method_exists(['a' => 1], 'x')),
        attempt(fn () => method_exists(new Plain(), [])),
    ]);
    $object = new stdClass();
    out('identical', [
        [1, 2] === [1, 2],
        ['a' => 1, 'b' => 2] === ['b' => 2, 'a' => 1],
        1 === 1.0,
        [1, '1'] === [1, 1],
        $object === $object,
        new stdClass() === new stdClass(),
        null === null,
        [[1]] === [[1]],
        0.0 === -0.0,
        [5 => 'a'] === [5 => 'a'],
    ]);
    out('is_numeric_float', [
        array_map('is_numeric', ['1e3', ' 1', '1 ', 'abc', 1.5, '', '0x1A', '.5', null]),
        array_map('is_float', [1.0, 1, 1.5, '1.5', -0.0]),
    ]);

    // XT-runtime-72: Random\Randomizer and SortDirection.
    $randomizer = new Randomizer();
    out('randomizer', [
        $randomizer->pickArrayKeys(['a' => 1, 'b' => 2, 'c' => 3], 3),
        $randomizer->pickArrayKeys([5 => 'x'], 1),
        $randomizer->pickArrayKeys([5 => 'x', 'k' => 'y', 7 => 'z'], 3),
        get_class($randomizer),
    ]);
    out('randomizer.errors', [
        attempt(fn () => $randomizer->pickArrayKeys([], 1)),
        attempt(fn () => $randomizer->pickArrayKeys(['a' => 1], 0)),
        attempt(fn () => $randomizer->pickArrayKeys(['a' => 1], 2)),
        attempt(fn () => $randomizer->pickArrayKeys(['a' => 1, 'b' => 2], -1)),
        attempt(fn () => $randomizer->pickArrayKeys('x', 1)),
        attempt(fn () => $randomizer->pickArrayKeys([1], 'x')),
        attempt(fn () => $randomizer->pickArrayKeys([], 0)),
    ]);
    out('sort_direction', [
        SortDirection::Ascending->name,
        SortDirection::Descending->name,
        array_map(fn ($case) => $case->name, SortDirection::cases()),
        enum_exists('SortDirection'),
        SortDirection::Ascending instanceof UnitEnum,
        SortDirection::Ascending instanceof BackedEnum,
        SortDirection::Ascending === SortDirection::Ascending,
        SortDirection::Ascending == SortDirection::Descending,
        attempt(fn () => new SortDirection()),
    ]);
}
