<?php
// PHP 8.5.11 executable evidence for XT-collections-20 (a bare generator object as a Collection, Arr::from, merge,
// union and LazyCollection source, action item epic-14-retro-item-5-traversable-js-generator). It loads Upstream at
// the Pin, with a small autoloader over the Pin's `src/Illuminate`, so every value below is Laravel 13.37.0's. Each
// line is `<label>\t<json>`; a throw is `"<class>: <message>"`. The test recomputes every label over ported generator
// functions (DIV-12.18) and compares it with the recorded value.
// Regenerate with: php -d error_reporting=0 generator-sources.probe.php > generator-sources.probe.txt
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

function out($label, $value) { echo $label, "\t", json_encode($value, JSON_PRESERVE_ZERO_FRACTION), "\n"; }
function attempt($fn) { try { return $fn(); } catch (Throwable $e) { return get_class($e).': '.$e->getMessage(); } }
function g() { yield 1; yield 2; }
function gk() { yield 'a' => 1; yield 5 => 2; yield 3; }
function gn() { yield 'a' => ['n' => 1]; yield ['n' => 2]; }

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\LazyCollection;

out('collection', [(new Collection(g()))->all(), collect(gk())->all()]);
out('arr.from', [Arr::from(g()), Arr::from(gk())]);
out('merge', [collect([0])->merge(g())->all(), collect(['a' => 0, 'x' => 9])->merge(gk())->all()]);
out('union', collect([0 => 'z', 'a' => 0])->union(gk())->all());
out('lazy.constructor', attempt(fn () => new LazyCollection(g())));
out('lazy.make', LazyCollection::make(fn () => gk())->all());
out('lazy.merge', LazyCollection::make([0])->merge(g())->all());
out('data_get', [data_get(gn(), '*'), data_get(gn(), '*.n')]);
out('map_with_keys', [Arr::mapWithKeys([1], fn () => gk()), collect([1])->mapWithKeys(fn () => gk())->all()]);
