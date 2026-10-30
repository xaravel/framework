<?php
// PHP 8.5.11 executable evidence for XT-collections-22 (LazyCollection::range over int, numeric-string, mixed, float,
// null and non-numeric bounds and steps, action item epic-14-retro-item-7-lazy-range-php-arithmetic). It loads Upstream at the Pin, with a small autoloader over the
// Pin's `src/Illuminate`, so every value below is Laravel 13.37.0's. Each line is `<label>\t<json>`. The test
// recomputes every label and compares it with the recorded value.
// Regenerate with: php -d error_reporting=0 lazy-range.probe.php > lazy-range.probe.txt
error_reporting(0);
$src = __DIR__ . '/../../../../conformance/upstream/framework/src/Illuminate';
spl_autoload_register(function ($class) use ($src) {
    $relative = str_replace('\\', '/', $class);
    foreach ([
        'Illuminate/Support/Traits/' => ['Collections/Traits/', 'Macroable/Traits/', 'Conditionable/Traits/'],
        'Illuminate/Contracts/' => ['Contracts/'],
        'Illuminate/Support/' => ['Collections/', 'Conditionable/'],
    ] as $prefix => $dirs) {
        if (str_starts_with($relative, $prefix)) {
            foreach ($dirs as $dir) {
                $file = $src . '/' . $dir . substr($relative, strlen($prefix)) . '.php';
                if (is_file($file)) {
                    require $file;
                    return;
                }
            }
        }
    }
});
require $src . '/Collections/helpers.php';

use Illuminate\Support\LazyCollection;

function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function attempt($fn) {
    try {
        return $fn();
    } catch (\Throwable $e) {
        return get_class($e) . ': ' . $e->getMessage();
    }
}

// The range is built, then stepped by hand: its class, the first value, then the next advance's value or exception.
function steps($make) {
    $collection = $make();
    $iterator = $collection->getIterator();
    $out = [get_class($collection), $iterator->current()];
    $out[] = attempt(function () use ($iterator) {
        $iterator->next();
        return $iterator->valid() ? $iterator->current() : null;
    });
    return $out;
}

out('int.up', attempt(fn () => LazyCollection::range(1, 3)->all()));
out('int.down', attempt(fn () => LazyCollection::range(3, 1)->all()));
out('numeric_string.up', attempt(fn () => LazyCollection::range('1', '3')->all()));
out('numeric_string.down', attempt(fn () => LazyCollection::range('3', '1')->all()));
out('mixed_bound', attempt(fn () => LazyCollection::range(1, '3')->all()));
out('float_step', attempt(fn () => LazyCollection::range(0, 1, 0.5)->all()));
out('string_step', attempt(fn () => LazyCollection::range(1, 5, '2')->all()));
out('negative_step', attempt(fn () => LazyCollection::range(5, 1, -2)->all()));
out('null_bound', attempt(fn () => LazyCollection::range(null, 2)->all()));
out('letters.up', attempt(fn () => LazyCollection::range('a', 'e')->take(5)->all()));
out('letters.down', attempt(fn () => LazyCollection::range('e', 'a')->take(5)->all()));
out('letters.up.steps', attempt(fn () => steps(fn () => LazyCollection::range('a', 'e'))));
out('letters.down.steps', attempt(fn () => steps(fn () => LazyCollection::range('e', 'a'))));
out('non_numeric_step', attempt(fn () => LazyCollection::range(1, 3, 'x')->all()));
out('non_numeric_step.steps', attempt(fn () => steps(fn () => LazyCollection::range(1, 3, 'x'))));
out('nan.to', attempt(fn () => LazyCollection::range(1, NAN)->take(3)->all()));
out('nan.from', attempt(fn () => LazyCollection::range(NAN, 1)->take(3)->all()));
out('nan.step', attempt(fn () => LazyCollection::range(5, 1, NAN)->take(3)->all()));
out('multi_digit_string.up', attempt(fn () => LazyCollection::range('9', '10')->all()));
out('multi_digit_string.down', attempt(fn () => LazyCollection::range('10', '9')->all()));
out('float_bounds.up', attempt(fn () => LazyCollection::range(0.5, 2)->all()));
out('float_bounds.down', attempt(fn () => LazyCollection::range(2.5, 0)->all()));
out('int_max', attempt(fn () => LazyCollection::range(PHP_INT_MAX - 1, PHP_INT_MAX)->take(4)->all()));
out('float_drift', attempt(fn () => LazyCollection::range(0, 1, 0.1)->all()));
out('zero_step', attempt(fn () => LazyCollection::range(1, 3, '0')));
