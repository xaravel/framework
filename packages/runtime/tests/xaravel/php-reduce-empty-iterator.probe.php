<?php
// The PHP 8.5.11 evidence for XT-runtime-143..145 (php-reduce-empty-iterator.test.ts), action item
// epic-15-item-4-runtime-directory-separator-array-reduce-empty-iterator (ESC-15.2-6): array_reduce, EmptyIterator and
// DIRECTORY_SEPARATOR, as vlucas/phpdotenv v5.7.0 and phpoption 1.10.0 use them. Each line is
// `<label>\t<json_encode(value)>`; the test computes every label with the runtime and compares it with the recorded
// value. A throw is `"<class>: <message>"`.
// Regenerate the record with the host's PHP 8.5.11, from this directory:
//   php -d error_reporting=0 php-reduce-empty-iterator.probe.php > php-reduce-empty-iterator.probe.txt

namespace XaravelFixture\PhpReduceEmptyIterator {
    class Reducer
    {
        public function __construct(private string $glue = '-')
        {
        }

        public static function add($carry, $item)
        {
            return $carry + $item;
        }

        public function join($carry, $item)
        {
            return $carry . $this->glue . $item;
        }
    }

    class SubEmpty extends \EmptyIterator
    {
    }

    class Pairs
    {
        public function __invoke($carry, $item)
        {
            return [$carry, $item];
        }
    }
}

namespace {
    use XaravelFixture\PhpReduceEmptyIterator\Pairs;
    use XaravelFixture\PhpReduceEmptyIterator\Reducer;
    use XaravelFixture\PhpReduceEmptyIterator\SubEmpty;

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

    $sum = fn ($carry, $item) => $carry + $item;

    // XT-runtime-143: the fold, with and without an initial value.
    out('reduce', [
        array_reduce([1, 2, 3], $sum, 10),
        array_reduce([1, 2, 3], $sum),
        array_reduce([], $sum),
        array_reduce([], $sum, 'x'),
        array_reduce([], $sum, null),
        array_reduce(['a' => 'x'], fn ($carry, $item) => $carry, [1, 2]),
        array_reduce([1, 2], fn ($carry, $item) => null, 5),
        array_reduce(['b' => 'q', 'a' => 'r'], fn ($carry, $item) => $carry . $item, ''),
    ]);

    // XT-runtime-143: the callback's arguments (carry and value, no key), in insertion order.
    $log = [];
    $result = array_reduce(['b' => 1, 'a' => 2, 5 => 3, 0 => 4], function (...$args) use (&$log) {
        $log[] = $args;
        return count($log);
    }, 'start');
    out('reduce.order', [$result, $log]);

    // XT-runtime-143: every callable form.
    out('reduce.callables', [
        array_reduce([3, 7, 2], 'max', 0),
        array_reduce([3, 7, 2], 'max'),
        array_reduce([3, 7, 2], '\\MAX', 0),
        array_reduce([1, 2, 3], [Reducer::class, 'add'], 10),
        array_reduce([1, 2, 3], Reducer::class . '::add', 100),
        array_reduce(['a', 'b'], [new Reducer('+'), 'join'], 's'),
        array_reduce([1, 2], new Pairs(), 0),
        array_reduce([1, 2, 3], $sum, 0),
        array_reduce(['a', 'b'], 'strcmp', 'a'),
    ]);

    // XT-runtime-143: a callback PHP refuses.
    out('reduce.bad_callback', [
        attempt(fn () => array_reduce([1], null)),
        attempt(fn () => array_reduce([1], 'nope')),
        attempt(fn () => array_reduce([1], [1])),
        attempt(fn () => array_reduce([], 'nope')),
    ]);

    // XT-runtime-143: an array argument that is no array.
    out('reduce.bad_array', [
        attempt(fn () => array_reduce('x', $sum)),
        attempt(fn () => array_reduce(null, $sum)),
        attempt(fn () => array_reduce(new stdClass(), $sum)),
        attempt(fn () => array_reduce(1, $sum)),
        attempt(fn () => array_reduce('x', 'nope')),
        attempt(fn () => array_reduce(new ArrayIterator([1]), $sum)),
        attempt(fn () => array_reduce(new EmptyIterator(), $sum)),
    ]);

    // XT-runtime-145: the registry's counts.
    $reflection = new ReflectionFunction('array_reduce');
    out('reduce.reflection', [$reflection->getNumberOfRequiredParameters(), $reflection->getNumberOfParameters(), $reflection->isVariadic()]);
    $f = 'array_reduce';
    out('reduce.counts', [
        attempt(fn () => $f(...[[1]])),
        attempt(fn () => $f(...[])),
        attempt(fn () => $f(...[[1], $sum, 0, 1])),
        function_exists('array_reduce'),
    ]);

    // XT-runtime-144: EmptyIterator.
    $e = new EmptyIterator();
    $seen = 0;
    foreach ($e as $key => $value) {
        $seen++;
    }
    out('empty', [
        $e->valid(),
        $e->next(),
        $e->rewind(),
        $e->valid(),
        iterator_to_array($e),
        iterator_to_array($e, false),
        iterator_count($e),
        json_encode($e),
        (array) $e,
        $e == new EmptyIterator(),
        serialize($e),
        get_class(unserialize(serialize($e))),
        $e instanceof Iterator,
        $e instanceof Traversable,
        $e instanceof Countable,
        $e instanceof ArrayAccess,
        $seen,
        get_class($e),
        class_exists('EmptyIterator'),
        new SubEmpty() instanceof EmptyIterator,
        (new SubEmpty())->valid(),
        attempt(fn () => (new SubEmpty())->key()),
    ]);
    out('empty.access', [
        attempt(fn () => $e->current()),
        attempt(fn () => $e->key()),
    ]);

    // XT-runtime-145: the separator.
    out('separator', DIRECTORY_SEPARATOR);
}
