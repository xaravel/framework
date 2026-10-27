<?php
// The PHP 8.5.11 evidence for XT-runtime-83..84 (php-set-functions.test.ts), action item
// epic-14-item-9-runtime-set-functions-callable-names. Each line is `<label>\t<json_encode(value)>`; XT-runtime-85
// computes every label with the runtime and compares it with the recorded value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-set-functions.probe.php > php-set-functions.probe.txt

namespace XaravelFixture\PhpSetFunctions {
    class Text
    {
        public function __construct(private string $text = 'text')
        {
        }

        public function __toString(): string
        {
            return $this->text;
        }
    }

    class Plain
    {
    }
}

namespace {
    use XaravelFixture\PhpSetFunctions\Plain;
    use XaravelFixture\PhpSetFunctions\Text;

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

    /** `[$fn(...$args, $callback), calls]` for a callback that logs each call and returns `$result($a, $b)`. */
    function logged(string $fn, array $args, callable $result): array
    {
        $log = [];
        $callback = function ($a, $b) use (&$log, $result) {
            $log[] = [$a, $b];
            return $result($a, $b);
        };
        $value = attempt(fn () => $fn(...[...$args, $callback]));
        return [$value, $log];
    }

    /** The comparators the logged cases use, by name. */
    function comparators(): array
    {
        return [
            'spaceship' => fn ($a, $b) => $a <=> $b,
            'greater' => fn ($a, $b) => $a > $b,
            'one' => fn ($a, $b) => 1,
            'zero' => fn ($a, $b) => 0,
            'minus' => fn ($a, $b) => -1,
            'float' => fn ($a, $b) => 0.5,
            'string' => fn ($a, $b) => (string) ($a <=> $b),
            'null' => fn ($a, $b) => null,
        ];
    }

    // Every PHP global function the runtime exports under its PHP name: the resolver registry.
    $registry = ['abs', 'array_all', 'array_any', 'array_chunk', 'array_combine', 'array_diff', 'array_diff_assoc', 'array_diff_key', 'array_diff_uassoc', 'array_diff_ukey', 'array_filter', 'array_find_key', 'array_first', 'array_flip', 'array_intersect', 'array_intersect_assoc', 'array_intersect_key', 'array_intersect_uassoc', 'array_is_list', 'array_key_exists', 'array_key_first', 'array_key_last', 'array_keys', 'array_last', 'array_map', 'array_merge', 'array_merge_recursive', 'array_pad', 'array_pop', 'array_push', 'array_replace', 'array_replace_recursive', 'array_reverse', 'array_search', 'array_shift', 'array_slice', 'array_splice', 'array_udiff', 'array_uintersect', 'array_unique', 'array_unshift', 'array_values', 'arsort', 'asort', 'call_user_func_array', 'ceil', 'chunk_split', 'count', 'end', 'explode', 'floor', 'get_debug_type', 'gettype', 'http_build_query', 'implode', 'in_array', 'intdiv', 'is_a', 'is_array', 'is_bool', 'is_callable', 'is_float', 'is_int', 'is_iterable', 'is_null', 'is_numeric', 'is_object', 'is_scalar', 'is_string', 'is_subclass_of', 'iterator_count', 'iterator_to_array', 'json_last_error', 'key', 'krsort', 'ksort', 'lcfirst', 'max', 'method_exists', 'min', 'property_exists', 'range', 'reset', 'round', 'rsort', 'setlocale', 'sort', 'sprintf', 'str_contains', 'str_starts_with', 'strcasecmp', 'strcmp', 'strcoll', 'strlen', 'strnatcasecmp', 'strnatcmp', 'strrev', 'strtolower', 'strtoupper', 'substr', 'trim', 'uasort', 'uksort'];
    // Every function the package root exports (a class excluded), by name.
    $exports = ['abs', 'allOf', 'arrayAppend', 'arrayEntries', 'arrayFromEntries', 'arrayUnion', 'array_all', 'array_any', 'array_chunk', 'array_combine', 'array_diff', 'array_diff_assoc', 'array_diff_key', 'array_diff_uassoc', 'array_diff_ukey', 'array_filter', 'array_find_key', 'array_first', 'array_flip', 'array_intersect', 'array_intersect_assoc', 'array_intersect_key', 'array_intersect_uassoc', 'array_is_list', 'array_key_exists', 'array_key_first', 'array_key_last', 'array_keys', 'array_last', 'array_map', 'array_merge', 'array_merge_recursive', 'array_pad', 'array_pop', 'array_push', 'array_replace', 'array_replace_recursive', 'array_reverse', 'array_search', 'array_shift', 'array_slice', 'array_splice', 'array_udiff', 'array_uintersect', 'array_unique', 'array_unshift', 'array_values', 'arsort', 'asort', 'attribute', 'bindPhpArguments', 'bindToFrame', 'bootTraits', 'callMethod', 'callUnpacked', 'call_user_func_array', 'ceil', 'chunk_split', 'classUsesRecursive', 'clearBootedTraits', 'count', 'currentApplication', 'currentFrame', 'divide', 'end', 'enumExists', 'explode', 'float', 'floor', 'fqcn', 'frameAsyncGenerator', 'frameDefer', 'frameKinds', 'frameOverlay', 'frameSlot', 'frameStatic', 'frameStreamSource', 'getDebugType', 'get_debug_type', 'gettype', 'hasBrand', 'http_build_query', 'identical', 'implode', 'in_array', 'initializeTraits', 'inject', 'intdiv', 'interfaceExists', 'interleave', 'isContractToken', 'isFloat', 'isNumeric', 'is_a', 'is_array', 'is_bool', 'is_callable', 'is_float', 'is_int', 'is_iterable', 'is_null', 'is_numeric', 'is_object', 'is_scalar', 'is_string', 'is_subclass_of', 'iterator_count', 'iterator_to_array', 'jsonDecode', 'jsonEncode', 'jsonLastError', 'jsonLastErrorMsg', 'json_last_error', 'key', 'keyed', 'krsort', 'ksort', 'lcfirst', 'loadAutoload', 'loadClassmap', 'looseEquals', 'max', 'method_exists', 'min', 'mixin', 'normalizeKey', 'normalizeNull', 'oneOf', 'phpFunction', 'phpReturn', 'phpSerialize', 'phpUnserialize', 'plus', 'property_exists', 'range', 'readInjectMetadata', 'readReturnMetadata', 'registerClass', 'registerContractToken', 'registerTestClass', 'reset', 'resolveCallable', 'resolveClass', 'resolveClassAsync', 'returns', 'round', 'rsort', 'runInFrame', 'runInNarrowFrame', 'runInRootFrame', 'setDefaultApplication', 'setlocale', 'sort', 'spaceship', 'sprintf', 'str_contains', 'str_starts_with', 'strcasecmp', 'strcmp', 'strcoll', 'strlen', 'strnatcasecmp', 'strnatcmp', 'strrev', 'strtolower', 'strtoupper', 'substr', 'toBool', 'toFloat', 'toInt', 'toPhpArray', 'toPhpString', 'trim', 'uasort', 'uksort', 'unhandledMatch', 'valueCopy', 'variadic', 'writeClassmap', 'yieldFrom'];

    $mixed = [1, '1', 2, 'a', null, 1.0, true];
    $other = ['1', '', 2.5];
    $keyed = ['a' => 'green', 'b' => 'brown', 'c' => 'blue', 0 => 'red', 5 => 'x'];
    $keyed2 = ['a' => 'GREEN', 'B' => 'brown', 0 => 'yellow', 1 => 'red', 'x' => 'blue'];

    // XT-runtime-83: array_diff, array_diff_assoc, array_diff_key and array_intersect.
    out('diff', [
        array_diff($mixed, $other),
        array_diff($keyed, $keyed2),
        array_diff([1, 2, 3, 4, 5], [2], [4, 5]),
        array_diff([], [1]),
        array_diff([1, 2]),
        array_diff([1, 2], []),
        array_diff(['x' => 1], ['1']),
        array_diff(['x' => 1], ['2']),
        array_diff([1, 1, 2, 1], [1]),
        array_diff(['é', 'e', '😀'], ['e']),
    ]);
    out('intersect', [
        array_intersect($mixed, $other),
        array_intersect($keyed, $keyed2),
        array_intersect([1, 2, 3, 4, 5, 2], [2, 4, 5], [5, 2]),
        array_intersect([], [1]),
        array_intersect([1, 2]),
        array_intersect([1, 2], []),
        array_intersect(['b' => 'x', 'a' => 'x', 'c' => 'y'], ['x']),
        array_intersect(['é', 'e', '😀', 'z'], ['😀', 'e']),
        array_intersect([3, 1, 2, 10, '10', 1.5], ['1.5', 10, 3]),
    ]);
    out('diff.strings', [
        array_diff([[], [1], 'Array', new Text(), 'text'], ['Array']),
        array_diff([[], new Text('b'), 'a'], [new Text('a')]),
        array_intersect([[], [1], 'Array', new Text(), 'text'], ['Array', 'text']),
        array_diff_assoc([[], new Text()], ['Array', 'text']),
        attempt(fn () => array_diff([new Plain()], [1])),
        attempt(fn () => array_diff([1, 2], [new Plain()])),
        attempt(fn () => array_intersect([new Plain(), 1], [1])),
        attempt(fn () => array_diff_assoc([new Plain()], [1])),
        array_diff_assoc([new Plain()], ['a' => 1]),
    ]);
    out('diff_key', [
        array_diff_key(['1' => 'a', 'b' => 2, 3 => 'c'], [1 => 'x']),
        array_diff_key(['a' => 1, 'b' => 2, 'c' => 3, 0 => 4], ['a' => 0], ['c' => 0, '0' => 0]),
        array_diff_key([10, 20, 30], [1 => null]),
        array_diff_key(['01' => 1, '1' => 2, '-0' => 3, '0' => 4], [1 => 0, 0 => 0]),
        array_diff_key([]),
        array_diff_key([1, 2]),
    ]);
    out('diff_assoc', [
        array_diff_assoc(['a' => 1, 'b' => '1'], ['a' => '1']),
        array_diff_assoc($keyed, $keyed2),
        array_diff_assoc([0, 1, 2], ['0', '1', 3]),
        array_diff_assoc(['a' => 1.0, 'b' => true, 'c' => null], ['a' => '1', 'b' => '1', 'c' => '']),
        array_diff_assoc(['a' => 1, 'b' => 2, 'c' => 3], ['a' => 1], ['b' => 2]),
        array_diff_assoc([1]),
    ]);
    out('diff.errors', [
        attempt(fn () => array_diff(5)),
        attempt(fn () => array_diff([1], 5)),
        attempt(fn () => array_diff([1, 2], [1], 'x')),
        attempt(fn () => array_diff([], [1], null)),
        attempt(fn () => array_diff([1], [], null)),
        attempt(fn () => array_diff_key(5)),
        attempt(fn () => array_diff_key([1], [1], 1.5)),
        attempt(fn () => array_diff_assoc(null)),
        attempt(fn () => array_diff_assoc([1], true)),
        attempt(fn () => array_intersect('a')),
        attempt(fn () => array_intersect([1], [1], new stdClass())),
    ]);

    // The callback forms.
    $strcasecmp = [
        array_udiff(['a' => 'Apple', 'b' => 'banana', 'c' => 'Cherry', 0 => 'date'], ['APPLE', 'DATE'], 'strcasecmp'),
        array_uintersect(['a' => 'Apple', 'b' => 'banana', 'c' => 'Cherry', 0 => 'date'], ['APPLE', 'DATE'], 'strcasecmp'),
        array_diff_ukey(['a' => 1, 'B' => 2, 'c' => 3], ['A' => 0, 'b' => 0], 'strcasecmp'),
        array_diff_uassoc(['a' => 'x', 'B' => 'y', 'c' => 'z'], ['A' => 'x', 'b' => 'Y'], 'strcasecmp'),
        array_intersect_uassoc(['a' => 'x', 'B' => 'y', 'c' => 'z'], ['A' => 'x', 'b' => 'Y'], 'strcasecmp'),
        array_udiff(['first' => 'Taylor', 'last' => 'Otwell'], ['first' => 'taylor', 'last' => 'otwell'], 'strcasecmp'),
        array_udiff(['a' => 'x'], ['A'], ['B'], 'STRCASECMP'),
        array_uintersect(['a', 'B', 'c'], ['b', 'A'], ['a', 'b'], '\strcasecmp'),
    ];
    out('callback.strcasecmp', $strcasecmp);
    out('callback.closure', [
        array_udiff([1, 5, 3, 9], [3, 4], fn ($a, $b) => $a - $b),
        array_uintersect(['x' => 1, 'y' => 5, 'z' => 3], [3, 4, 5], fn ($a, $b) => $a - $b),
        array_diff_ukey([1 => 'a', 2 => 'b', 3 => 'c'], [2 => 'z'], fn ($a, $b) => $a - $b),
        array_diff_uassoc([1 => 'a', 2 => 'b', 3 => 'c'], [2 => 'b', 3 => 'x'], fn ($a, $b) => $a - $b),
        array_intersect_uassoc([1 => 'a', 2 => 'b', 3 => 'c'], [2 => 'b', 3 => 'x'], fn ($a, $b) => $a - $b),
        array_udiff([1, 2], [], fn ($a, $b) => $a - $b),
        array_udiff([], [1], fn ($a, $b) => $a - $b),
        array_udiff([2, 1], fn ($a, $b) => $a - $b),
        array_uintersect([2, 1], fn ($a, $b) => $a - $b),
        array_diff_uassoc(['b' => 1, 'a' => 2], fn ($a, $b) => strcmp($a, $b)),
    ]);
    $logs = [];
    foreach (comparators() as $name => $result) {
        $logs[$name] = [
            logged('array_udiff', [[3, 1, 2, 5, 4], [2, 5], [4, 9]], $result),
            logged('array_uintersect', [[3, 1, 2, 5, 4], [2, 5, 3], [4, 3, 2]], $result),
            logged('array_diff_ukey', [['c' => 1, 'a' => 2, 'b' => 3, 'd' => 4], ['b' => 0, 'x' => 0], ['d' => 0]], $result),
            logged('array_diff_uassoc', [['c' => 1, 'a' => 2, 'b' => 3, 'd' => 4], ['b' => 3, 'a' => 9], ['d' => '4']], $result),
            logged('array_intersect_uassoc', [['c' => 1, 'a' => 2, 'b' => 3, 'd' => 4], ['b' => 3, 'a' => 2, 'd' => 4], ['d' => 4, 'b' => '3']], $result),
        ];
    }
    out('callback.logs', $logs);
    out('callback.logs.large', [
        logged('array_udiff', [[9, 3, 14, 1, 7, 12, 5, 18, 2, 11, 16, 6, 0, 13, 8, 17, 4, 10, 15], [3, 7, 11, 15], [0, 18]], fn ($a, $b) => $a <=> $b),
        logged('array_uintersect', [[9, 3, 14, 1, 7, 12, 5, 18, 2, 11, 16, 6, 0, 13, 8, 17, 4, 10, 15], [3, 7, 11, 15, 18, 0, 9]], fn ($a, $b) => $a <=> $b),
    ]);
    out('callback.throws', [
        logged('array_udiff', [[3, 1, 2], [2]], function ($a, $b) {
            if ($a === 2 || $b === 2) {
                throw new RuntimeException('stop');
            }
            return $a <=> $b;
        }),
        logged('array_diff_ukey', [['b' => 1, 'a' => 2], ['a' => 0]], function ($a, $b) {
            throw new RuntimeException('stop');
        }),
    ]);
    out('callback.errors', [
        attempt(fn () => array_udiff([1])),
        attempt(fn () => array_udiff([1], 5)),
        attempt(fn () => array_udiff([1], [1], null)),
        attempt(fn () => array_udiff(5, [1], 'strcasecmp')),
        attempt(fn () => array_udiff([1], 5, 'strcasecmp')),
        attempt(fn () => array_uintersect([1])),
        attempt(fn () => array_uintersect([1], [1], 1)),
        attempt(fn () => array_uintersect([1], null, 'strcasecmp')),
        attempt(fn () => array_diff_ukey(['a' => 1])),
        attempt(fn () => array_diff_ukey(['a' => 1], [], true)),
        attempt(fn () => array_diff_ukey(['a' => 1], 'x', 'strcasecmp')),
        attempt(fn () => array_diff_uassoc([1])),
        attempt(fn () => array_diff_uassoc(null, [], 'strcasecmp')),
        attempt(fn () => array_intersect_uassoc([1])),
        attempt(fn () => array_intersect_uassoc([1], [1], 2.5)),
        attempt(fn () => array_intersect_uassoc([1], [1], 2, 'strcasecmp')),
        attempt(fn () => array_udiff(['x'], [new Plain()], fn ($a, $b) => strcmp($a, $b))),
    ]);

    // array_merge_recursive, array_replace and array_replace_recursive.
    $o = new stdClass();
    $o->p = 1;
    out('merge_recursive', [
        array_merge_recursive(['a' => 1, 'b' => ['c' => 1, 5 => 2]], ['a' => 2, 'b' => ['c' => [3], 5 => 4]], ['a' => null, 3 => 'x']),
        array_merge_recursive(),
        array_merge_recursive([5 => 'a', 'k' => 'v', 9 => 'b']),
        array_merge_recursive([5 => 'a'], [5 => 'b']),
        array_merge_recursive(['a' => null], ['a' => null]),
        array_merge_recursive(['a' => [1]], ['a' => 'x']),
        array_merge_recursive(['a' => 'x'], ['a' => [1, 'k' => 2]]),
        array_merge_recursive(['a' => ['k' => 1]], ['a' => ['k' => 2]], ['a' => ['k' => [3]]]),
        array_merge_recursive(['a' => $o], ['a' => 2]),
        array_merge_recursive(['a' => 1], ['a' => $o]),
        array_merge_recursive(['a' => [1]], ['a' => new ArrayObject(['q' => 2])]),
        array_merge_recursive(['1' => 'x', 'a' => 'y'], ['1' => 'z']),
        array_merge_recursive([], []),
        array_merge_recursive(['a' => []], ['a' => []]),
    ]);
    out('replace', [
        array_replace([5 => 'a', 'k' => 'v', 9 => 'b'], [9 => 'B', 0 => 'z'], ['k' => 'V', 'n' => 'new']),
        array_replace([1, 2]),
        array_replace(['a' => [1, 2]], ['a' => [9]]),
        array_replace([], [3 => 'x']),
        array_replace(['1' => 'a'], [1 => 'b']),
    ]);
    out('replace_recursive', [
        array_replace_recursive(['a' => [1, 2, 'k' => ['x' => 1]], 'b' => 1], ['a' => [9, 'k' => ['y' => 2]], 'b' => [1]]),
        array_replace_recursive([1, 2]),
        array_replace_recursive(['a' => 'x'], ['a' => ['y']]),
        array_replace_recursive(['a' => ['y']], ['a' => 'x']),
        array_replace_recursive([5 => [1, 2]], [5 => [1 => 'b']], [5 => [2 => 'c']]),
        array_replace_recursive(['a' => $o], ['a' => ['q' => 1]]),
        array_replace_recursive(['a' => ['q' => 1]], ['a' => $o]),
    ]);
    $self = ['x' => 1];
    $self['x'] = &$self;
    $nested = ['x' => []];
    $nested['x']['x'] = &$nested['x'];
    out('merge.recursion', [
        attempt(fn () => count(array_merge_recursive($self, $self))),
        attempt(fn () => count(array_merge_recursive(['x' => ['y' => 1]], $self))),
        attempt(fn () => count(array_merge_recursive($self, ['x' => ['y' => 1]]))),
        attempt(fn () => count(array_merge_recursive(['x' => ['x' => []]], $nested))),
        attempt(fn () => count(array_replace_recursive($self, $self))),
        attempt(fn () => count(array_replace_recursive(['x' => ['y' => 1]], $self))),
        attempt(fn () => count(array_replace_recursive($self, ['x' => ['y' => 1]]))),
        attempt(fn () => count(array_replace_recursive(['x' => ['x' => []]], $nested))),
    ]);
    out('merge.errors', [
        attempt(fn () => array_merge_recursive(5)),
        attempt(fn () => array_merge_recursive([1], 5)),
        attempt(fn () => array_replace()),
        attempt(fn () => array_replace(5)),
        attempt(fn () => array_replace([1], 'x')),
        attempt(fn () => array_replace_recursive()),
        attempt(fn () => array_replace_recursive(null)),
        attempt(fn () => array_replace_recursive([1], [2], 3)),
    ]);

    // The next free index: where PHP copies the first array (zend_array_dup, ZVAL_COPY), $r[] lands after its own.
    $unset = ['a', 'b', 'c'];
    unset($unset[2]);
    out('next_free', array_map(function ($r) {
        $r[] = 'z';
        return $r;
    }, [
        array_intersect(['a', 'b'], ['a']),
        array_intersect($unset, ['a', 'b']),
        array_uintersect(['a', 'b'], ['a'], 'strcmp'),
        array_udiff(['a', 'b'], ['b'], 'strcmp'),
        array_diff_ukey([5 => 'a', 9 => 'b'], [9 => 0], fn ($a, $b) => $a <=> $b),
        array_diff_uassoc([5 => 'a', 9 => 'b'], [9 => 'b'], fn ($a, $b) => $a <=> $b),
        array_intersect_uassoc([5 => 'a', 9 => 'b'], [5 => 'a'], fn ($a, $b) => $a <=> $b),
        array_diff($unset),
        array_diff($unset, []),
        array_diff([3 => 'a'], ['b']),
        array_diff(['a', 'b'], ['b']),
        array_diff_key(['a', 'b'], [1 => 0]),
        array_diff_assoc(['a', 'b'], [1 => 'b']),
        array_replace(['a', 'b'], [5 => 'c']),
        array_replace($unset, [0 => 'x']),
        array_replace_recursive($unset, [0 => 'x']),
        array_pad($unset, 2, 0),
        array_pad($unset, 3, 0),
        $unset + [0 => 'x'],
        ['a', 'b'] + [5 => 'c'],
        array_merge_recursive(['k' => $unset], ['k' => ['d']])['k'],
        array_replace_recursive(['k' => $unset], ['k' => [0 => 'x']])['k'],
    ]));

    // array_pad.
    out('array_pad', [
        array_pad([1, 2], 5, 0),
        array_pad([1, 2], -5, 0),
        array_pad([1, 2], 1, 0),
        array_pad([1, 2], 2, 0),
        array_pad([1, 2], -2, 0),
        array_pad([1, 2], 0, 0),
        array_pad(['a' => 1, 5 => 2], 4, 'x'),
        array_pad(['a' => 1, 5 => 2], -4, 'x'),
        array_pad([], 3, null),
        array_pad([3 => 'a', 7 => 'b'], 3, [1]),
        array_pad([1], '3', 0),
        array_pad([1], 2.0, 0),
        array_pad([1], true, 0),
        array_pad([1], null, 0),
    ]);
    out('array_pad.errors', [
        attempt(fn () => array_pad([1], 2 ** 30 + 1, 0)),
        attempt(fn () => array_pad([1], -(2 ** 30) - 1, 0)),
        attempt(fn () => array_pad(5, 2, 0)),
        attempt(fn () => array_pad([1], 'x', 0)),
        attempt(fn () => array_pad([1], 1.5, 0)),
        attempt(fn () => array_pad([1], [], 0)),
    ]);

    // is_int.
    out('is_int', [is_int(1), is_int(1.0), is_int(PHP_INT_MAX), is_int(-0), is_int('1'), is_int(true), is_int(null), is_int([]), is_int(1.5), is_int(new stdClass())]);

    // $a + $b on arrays.
    out('union', [
        [1, 2] + [3, 4, 5],
        ['a' => 1, 'b' => 2] + ['b' => 3, 'c' => 4, 0 => 5],
        ['1' => 'x'] + [1 => 'y', 2 => 'z'],
        [] + ['a' => 1],
        ['a' => 1] + [],
        [5 => 'a'] + [0 => 'b'],
    ]);
    out('union.errors', [
        attempt(fn () => [1] + 1),
        attempt(fn () => 1 + [1]),
        attempt(fn () => [1] + null),
        attempt(fn () => null + [1]),
        attempt(fn () => [1] + 'a'),
        attempt(fn () => [1] + 1.5),
        attempt(fn () => [1] + true),
        attempt(fn () => [1] + new stdClass()),
    ]);

    // XT-runtime-84: the function-name resolver, through callbacks and is_callable.
    out('resolver.calls', [
        array_map('strtoupper', ['a', 'b']),
        array_map('STRTOUPPER', ['a']),
        array_map('\strtoupper', ['a']),
        array_map('strcasecmp', ['a', 'B'], ['A', 'c']),
        array_filter(['a', '', 'b', null], 'strlen'),
        array_filter([1, 'x', 2.5, '3'], 'is_numeric'),
        array_map('reset', [[1, 2], [3]]),
        array_map('end', [[1, 2], [3]]),
        array_map('max', [1, 5], [4, 2]),
        array_map('count', [[1, 2], []]),
        array_map('array_pad', [[1]], [3], [0]),
        array_map('array_keys', [['a' => 1]]),
        array_map('is_callable', ['strlen', 'nope', '\strlen']),
        (function () {
            $sortable = ['b' => 'B', 'a' => 'a', 'c' => 'C', 'd' => 'A'];
            uasort($sortable, 'strcasecmp');
            return $sortable;
        })(),
    ]);
    out('resolver.arity', [
        attempt(fn () => array_map('strtoupper', ['a'], ['b'])),
        attempt(fn () => array_map('strcasecmp', ['a'])),
        attempt(fn () => array_map('StrCaseCmp', ['a'], ['b'], ['c'])),
        attempt(fn () => array_map('array_keys', ['a'], ['b'], ['c'], ['d'])),
        attempt(fn () => array_filter(['a'], 'strcasecmp')),
        attempt(fn () => array_filter(['a'], 'is_callable', ARRAY_FILTER_USE_BOTH)),
        attempt(fn () => array_any([1, 'a'], 'is_string')),
        attempt(fn () => array_all([1, 2], 'is_int')),
        attempt(fn () => array_find_key(['a' => 1], 'is_string')),
    ]);
    $names = ['strcasecmp', 'STRCASECMP', '\strcasecmp', '\\\\strcasecmp', 'StrToUpper', 'is_int', 'array_udiff', 'reset', 'nope', ' strlen', 'strlen ', '', '\\'];
    out('resolver.is_callable', array_map(function ($v) {
        $plain = is_callable($v, false, $name);
        return [$plain, is_callable($v, true), $name];
    }, $names));
    out('resolver.reflection', array_map(function ($name) {
        $function = new ReflectionFunction($name);
        $refs = [];
        foreach ($function->getParameters() as $index => $parameter) {
            if ($parameter->isPassedByReference()) {
                $refs[] = $index;
            }
        }
        return [$function->getName(), $function->getNumberOfRequiredParameters(), $function->getNumberOfParameters(), $function->isVariadic(), $refs];
    }, $registry));
    out('resolver.counts', array_map(function ($name) {
        $function = new ReflectionFunction($name);
        $few = $function->getNumberOfRequiredParameters() > 0 ? attempt(fn () => call_user_func_array($name, [])) : null;
        $many = $function->isVariadic() ? null : attempt(fn () => call_user_func_array($name, array_fill(0, $function->getNumberOfParameters() + 1, null)));
        return [$few, $many];
    }, $registry));
    out('resolver.exports', array_combine($exports, array_map(fn ($name) => function_exists($name), $exports)));
}
